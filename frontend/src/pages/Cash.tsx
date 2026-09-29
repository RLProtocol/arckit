import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatEther, zeroAddress, type Address } from "viem";
import { explorerAddress, explorerTx } from "@/contracts";
import { arc } from "@/wagmi";
import { isValidAddress, sameAddr, shortAddr } from "@/lib/format";
import { ARCCASH_CHAIN_ID, POOLS, arcCashAbi, createDeposit, encodeNote, parseNote, poolFor, toBytes32, withdrawArgs, type Deposit, type Pool } from "@/lib/arccash";
import { usePoolStats, useProver, useRelay, useRelayerConfig, type PoolStats, type WithdrawProgress } from "@/hooks/useArcCash";
import { useTx } from "@/hooks/useTx";
import { RequireWallet } from "@/components/RequireWallet";
import { TxStatus } from "@/components/TxStatus";
import { MixerArt } from "@/components/MixerArt";

type Mode = "deposit" | "withdraw";

export function Cash() {
  const [mode, setMode] = useState<Mode>("deposit");
  const { stats, isLoading } = usePoolStats();
  const totalDeposits = stats.reduce((a, s) => a + s.deposits, 0);
  const totalLocked = stats.reduce((a, s) => a + s.balance, 0n);

  return (
    <div className="cash">
      <section className="pay-hero cash-hero">
        <div className="aurora-clip" aria-hidden="true"><div className="aurora cash-aurora"><i /><i /><i /></div></div>
        <div className="wrap pay-hero-inner cash-hero-inner">
          <div>
            <div className="eyebrow">ArcCash · private transfers</div>
            <h1>Break the link <span>between sender and receiver.</span></h1>
            <p className="lede">Deposit a fixed amount of USDC and get a secret note. Later, paste the note and withdraw to a fresh address; we pay the gas. The pool cannot tell which deposit was yours.</p>
            <div className="hero-stats cash-stats">
              <div><div className="n">{isLoading ? "…" : totalDeposits}</div><div className="l">deposits so far</div></div>
              <div><div className="n">{isLoading ? "…" : fmtUsdcWhole(totalLocked)}</div><div className="l">USDC in the pools</div></div>
              <div><div className="n">0</div><div className="l">gas paid by you</div></div>
            </div>
          </div>
          <MixerArt />
        </div>
      </section>

      <div className="wrap cash-body">
        <div className="cash-grid">
          <div className="card cash-main">
            <div className="seg seg-wide cash-seg" role="tablist">
              <button role="tab" aria-selected={mode === "deposit"} className={mode === "deposit" ? "on" : ""} onClick={() => setMode("deposit")}>Deposit</button>
              <button role="tab" aria-selected={mode === "withdraw"} className={mode === "withdraw" ? "on" : ""} onClick={() => setMode("withdraw")}>Withdraw</button>
            </div>
            {mode === "deposit" ? <DepositFlow key="d" stats={stats} /> : <WithdrawFlow key="w" />}
          </div>

          <aside className="stack cash-side">
            <PoolsPanel stats={stats} loading={isLoading} />
            <div className="panel stack" style={{ gap: 10 }}>
              <div className="kicker">Read before using</div>
              <ul className="cash-caveats">
                <li><strong>Small crowd, weak privacy.</strong> Anonymity comes from other people's deposits. With a handful of notes, timing alone can link you. Wait, and withdraw when the pool has grown.</li>
                <li><strong>The note is the money.</strong> Nobody, including us, can recover a lost note or reverse a deposit.</li>
                <li><strong>Gas is paid by the withdrawing wallet.</strong> Never withdraw from the wallet that deposited; that undoes everything.</li>
                <li><strong>Your jurisdiction, your call.</strong> Privacy tools are restricted in some places.</li>
              </ul>
            </div>
          </aside>
        </div>

        <section className="section">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>Three steps, all in your browser</h2>
          </div>
          <ol className="timeline">
            <li className="tl-step">
              <div className="tl-num">1</div>
              <h3>Deposit</h3>
              <p className="muted">Your browser draws two random secrets and hashes them into a <em>commitment</em>. You send exactly 1 or 10 USDC together with that commitment. Keep the note.</p>
              <div className="tl-mock"><div className="mock-row"><span className="mock-chip">1 USDC</span><span className="mock-chip mono">0x3a9f…c21e</span></div><div className="mock-btn">Deposit</div></div>
            </li>
            <li className="tl-step">
              <div className="tl-num">2</div>
              <h3>Wait</h3>
              <p className="muted">Every deposit in a pool looks identical. The more notes that pile up between yours and your withdrawal, the less anyone can say about which one is yours.</p>
              <div className="tl-mock"><div className="mock-row"><span className="mock-pill on">yours</span><span className="mock-pill">1 USDC</span><span className="mock-pill">1 USDC</span><span className="mock-pill">1 USDC</span><span className="mock-pill">1 USDC</span></div><div className="mock-ok">5 identical deposits · indistinguishable</div></div>
            </li>
            <li className="tl-step">
              <div className="tl-num">3</div>
              <h3>Withdraw</h3>
              <p className="muted">Paste the note from any wallet. Your browser builds a zero-knowledge proof that <em>one</em> deposit is yours, without saying which, and the pool pays a fresh address.</p>
              <div className="tl-mock"><div className="mock-row"><span className="mock-chip">proof · 36,047 constraints</span></div><div className="mock-ok">✓ verified on-chain · 1 USDC → 0xNew…</div></div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ deposit

function DepositFlow({ stats }: { stats: PoolStats[] }) {
  const [step, setStep] = useState(0);
  const [pool, setPool] = useState<Pool>(POOLS[0]);
  const [attempt, setAttempt] = useState(0);
  const deposit = useMemo<Deposit>(() => createDeposit(), [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const note = useMemo(() => encodeNote(deposit, ARCCASH_CHAIN_ID, pool.denomination), [deposit, pool]);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const tx = useTx();
  const { address } = useAccount();
  const bal = useBalance({ address, chainId: arc.id });
  const short = bal.data !== undefined && bal.data.value < pool.denomination + 10n ** 15n;

  const copy = async () => {
    try { await navigator.clipboard.writeText(note); setCopied(true); } catch { /* clipboard blocked; download still works */ }
  };
  const download = () => {
    const blob = new Blob([`ArcCash note — ${pool.label} on Arc (chain ${ARCCASH_CHAIN_ID})\nKeep this file private. Anyone with the note can withdraw the deposit; without it the deposit is lost.\n\n${note}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `arccash-${pool.label.replace(" ", "")}-${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setSaved(true);
  };
  const restart = () => { setAttempt((a) => a + 1); setCopied(false); setSaved(false); setConfirmed(false); tx.reset(); setStep(0); };

  return (
    <div className="stack cash-flow">
      <Steps current={tx.isSuccess ? 3 : step} labels={["Amount", "Back up note", "Deposit"]} />

      {step === 0 && (
        <div className="stack rise">
          <div>
            <h3>Choose a pool</h3>
            <p className="muted small">Every deposit in a pool is the same size, so withdrawals cannot be matched by amount.</p>
          </div>
          <div className="cash-pools-choice">
            {stats.map((s) => (
              <button key={s.address} type="button" className={`choice cash-choice ${sameAddr(s.address, pool.address) ? "on" : ""}`} onClick={() => setPool(s)}>
                <strong>{s.label}</strong>
                <span className="small muted">{s.deposits} deposit{s.deposits === 1 ? "" : "s"} · {s.unspent} still inside</span>
                <AnonMeter n={s.unspent} />
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => setStep(1)}>Continue with {pool.label}</button>
        </div>
      )}

      {step === 1 && (
        <div className="stack rise">
          <div>
            <h3>Back up your note</h3>
            <p className="muted small">This was generated in your browser and exists nowhere else. It is the only way to withdraw the {pool.label}.</p>
          </div>
          <div className="cash-note" aria-label="Your note">
            <code>{note}</code>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-soft" onClick={copy}>{copied ? "Copied ✓" : "Copy note"}</button>
            <button className="btn btn-soft" onClick={download}>{saved ? "Downloaded ✓" : "Download .txt"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAttempt((a) => a + 1); setCopied(false); setSaved(false); setConfirmed(false); }}>New note</button>
          </div>
          <label className="cash-check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I have saved this note somewhere safe. I understand that if I lose it, the deposit is gone and nobody can recover it.</span>
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary btn-lg" disabled={!confirmed || !(copied || saved)} onClick={() => setStep(2)}>Continue</button>
          </div>
          {!(copied || saved) && <div className="tiny faint">Copy or download the note to continue.</div>}
        </div>
      )}

      {step === 2 && (
        <div className="stack rise">
          <div>
            <h3>Send the deposit</h3>
            <p className="muted small">Exactly {pool.label} goes into the pool with your commitment. The note never leaves this tab.</p>
          </div>
          <div className="ledger cash-ledger">
            <div><span className="muted">Pool</span><span>{pool.label} · <a className="mono" href={explorerAddress(pool.address)} target="_blank" rel="noreferrer">{shortAddr(pool.address, 6)}</a></span></div>
            <div><span className="muted">Commitment</span><span className="mono">{shortAddr(toBytes32(deposit.commitment), 8)}</span></div>
            <div><span className="muted">You send</span><span>{pool.label} + gas</span></div>
          </div>
          <RequireWallet what="deposit into ArcCash">
            {short && !tx.isSuccess && <div className="notice notice-warn small">This wallet holds {formatEther(bal.data?.value ?? 0n).slice(0, 8)} USDC; it needs {pool.label} plus a little gas.</div>}
            {!tx.isSuccess && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)} disabled={tx.busy}>Back</button>
                <button className="btn btn-primary btn-lg" disabled={tx.busy || short} onClick={() => tx.writeContract({ address: pool.address, abi: arcCashAbi, functionName: "deposit", args: [toBytes32(deposit.commitment)], value: pool.denomination, chainId: arc.id })}>
                  {tx.busy ? "Depositing…" : `Deposit ${pool.label}`}
                </button>
              </div>
            )}
            <TxStatus tx={tx} done={`${pool.label} deposited. Your note is now worth ${pool.label}.`} />
          </RequireWallet>
          {tx.isSuccess && (
            <div className="cash-done rise">
              <div className="kicker">What now</div>
              <ul className="cash-tips">
                <li>Close this tab if you like; nothing here needs to stay open.</li>
                <li>Wait. Come back once other deposits have joined the pool.</li>
                <li>Withdraw from a <strong>different wallet</strong> to an address that has never touched the depositing one.</li>
              </ul>
              <button className="btn btn-soft" onClick={restart}>Make another deposit</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ withdraw

function WithdrawFlow() {
  const [step, setStep] = useState(0);
  const [raw, setRaw] = useState("");
  const [recipient, setRecipient] = useState("");
  const { address } = useAccount();
  const parsed = useMemo(() => parseNote(raw), [raw]);
  const pool = parsed ? poolFor(parsed.denomination) : undefined;
  const deposit = useMemo(() => (parsed ? createDeposit(parsed.nullifier, parsed.secret) : undefined), [parsed]);
  const wrongChain = !!parsed && parsed.chainId !== ARCCASH_CHAIN_ID;

  const spent = useReadContract({ address: pool?.address, abi: arcCashAbi, functionName: "isSpent", args: deposit ? [toBytes32(deposit.nullifierHash)] : undefined, chainId: arc.id, query: { enabled: !!pool && !!deposit } });
  const exists = useReadContract({ address: pool?.address, abi: arcCashAbi, functionName: "commitments", args: deposit ? [toBytes32(deposit.commitment)] : undefined, chainId: arc.id, query: { enabled: !!pool && !!deposit } });
  const checking = !!pool && (spent.isLoading || exists.isLoading);
  const noteOk = !!parsed && !!pool && !wrongChain && spent.data === false && exists.data === true;

  const validRecipient = isValidAddress(recipient.trim());
  const recipientIsSelf = validRecipient && sameAddr(recipient.trim(), address);

  // gas is always paid by the Arc Kit relayer; the connected wallet only steps in if the relayer is offline or empty
  const relayerCfg = useRelayerConfig();
  const useRelayer = relayerCfg.ready;
  const relayerAddr = useRelayer && relayerCfg.relayer ? relayerCfg.relayer : zeroAddress;
  const fee = useRelayer ? relayerCfg.fee : 0n;

  const prover = useProver();
  const tx = useTx();
  const relay = useRelay();
  const ready = prover.progress.stage === "ready" ? prover.progress : undefined;

  // any change to the inputs invalidates a proof already built for them (the proof binds recipient + relayer + fee)
  useEffect(() => { prover.reset(); tx.reset(); relay.reset(); }, [raw, recipient, useRelayer]); // eslint-disable-line react-hooks/exhaustive-deps

  const prove = () => pool && deposit && prover.run(pool, deposit, recipient.trim() as Address, relayerAddr, fee);
  const send = () => {
    if (!ready || !pool || !deposit) return;
    if (useRelayer) return relay.send(pool, ready.proof, deposit.nullifierHash, recipient.trim() as Address, fee);
    tx.writeContract({ address: pool.address, abi: arcCashAbi, functionName: "withdraw", args: withdrawArgs(ready.proof, deposit.nullifierHash, recipient.trim() as Address, zeroAddress, 0n), chainId: arc.id });
  };
  const restart = () => { setRaw(""); setRecipient(""); prover.reset(); tx.reset(); relay.reset(); setStep(0); };
  const done = useRelayer ? relay.status === "success" : tx.isSuccess;
  const doneHash = useRelayer ? relay.hash : tx.hash;

  return (
    <div className="stack cash-flow">
      <Steps current={done ? 3 : step} labels={["Note", "Recipient", "Prove & withdraw"]} />

      {step === 0 && (
        <div className="stack rise">
          <div>
            <h3>Paste your note</h3>
            <p className="muted small">It is checked locally and against the pool. Nothing is sent anywhere.</p>
          </div>
          <textarea className={`input mono cash-note-input ${raw && !parsed ? "bad" : ""}`} rows={3} spellCheck={false} placeholder="arccash-1000000000000000000-5042-0x…" value={raw} onChange={(e) => setRaw(e.target.value)} aria-label="ArcCash note" />
          {raw.trim() && !parsed && <div className="notice notice-err small">That is not a complete ArcCash note. It starts with <span className="mono">arccash-</span> and ends with 124 hex characters.</div>}
          {parsed && wrongChain && <div className="notice notice-err small">This note is for chain {parsed.chainId}, not Arc.</div>}
          {parsed && !wrongChain && !pool && <div className="notice notice-err small">No ArcCash pool exists for this denomination.</div>}
          {pool && !wrongChain && (
            <div className="ledger cash-ledger">
              <div><span className="muted">Pool</span><span>{pool.label}</span></div>
              <div><span className="muted">Deposit</span><span>{checking ? "checking…" : exists.data ? <span style={{ color: "var(--aqua)" }}>found in the pool ✓</span> : <span style={{ color: "var(--coral)" }}>not found in the pool</span>}</span></div>
              <div><span className="muted">Status</span><span>{checking ? "checking…" : spent.data ? <span style={{ color: "var(--coral)" }}>already withdrawn</span> : spent.data === false ? <span style={{ color: "var(--aqua)" }}>unspent ✓</span> : "—"}</span></div>
            </div>
          )}
          <button className="btn btn-primary btn-lg" disabled={!noteOk} onClick={() => setStep(1)}>Continue</button>
        </div>
      )}

      {step === 1 && pool && (
        <div className="stack rise">
          <div>
            <h3>Where should the {pool.label} go?</h3>
            <p className="muted small">Use an address that has never interacted with the wallet that deposited. A brand-new one is best. It needs no gas.</p>
          </div>
          <div className="field">
            <label htmlFor="cash-recipient">Recipient address</label>
            <input id="cash-recipient" className="input mono" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} spellCheck={false} autoComplete="off" />
            {recipient.trim() && !validRecipient && <div className="error">That is not a valid address.</div>}
          </div>
          {recipientIsSelf && <div className="notice notice-warn small">That is the connected wallet. If it is also the wallet that deposited, this withdrawal links straight back to it.</div>}
          {!relayerCfg.ready && <div className="notice notice-warn small">Our relayer is unavailable right now, so the <strong>connected wallet</strong> will send the withdrawal and pay gas. It is visible on-chain: do not use the wallet that deposited.</div>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary btn-lg" disabled={!validRecipient} onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      )}

      {step === 2 && pool && deposit && (
        <div className="stack rise">
          <div>
            <h3>Prove and withdraw</h3>
            <p className="muted small">Your browser rebuilds the pool&apos;s Merkle tree, downloads the proving key once (20 MB) and produces a Groth16 proof. Takes a few seconds.</p>
          </div>
          <div className="ledger cash-ledger">
            <div><span className="muted">Withdraw</span><span>{pool.label}</span></div>
            <div><span className="muted">To</span><span className="mono">{shortAddr(recipient.trim(), 8)}</span></div>
            <div><span className="muted">Gas</span><span>{useRelayer ? "paid by Arc Kit" : "paid by the connected wallet"}</span></div>
          </div>
          <Gate active={!useRelayer}>
            {!useRelayer && sameAddr(address, recipient.trim()) && <div className="notice notice-warn small">You are withdrawing to the wallet that is sending the transaction.</div>}
            {prover.progress.stage === "idle" && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-primary btn-lg" onClick={prove}>Generate proof</button>
              </div>
            )}
            {prover.progress.stage !== "idle" && <ProveSteps p={prover.progress} />}
            {prover.progress.stage === "error" && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-soft" onClick={prove}>Try again</button>
              </div>
            )}
            {ready && !done && (
              <div className="stack rise" style={{ gap: 10 }}>
                <div className="notice notice-ok small">Proof ready in {(ready.proof.ms / 1000).toFixed(1)}s and verified locally. Your note is leaf {ready.leafIndex + 1} of {ready.leaves}; the proof does not reveal that.</div>
                <button className="btn btn-primary btn-lg" disabled={tx.busy || relay.busy} onClick={send}>{tx.busy || relay.busy ? "Withdrawing…" : `Withdraw ${pool.label} to ${shortAddr(recipient.trim(), 4)}`}</button>
              </div>
            )}
            {useRelayer ? <RelayStatus r={relay} done={`${pool.label} sent to ${shortAddr(recipient.trim(), 6)}.`} /> : <TxStatus tx={tx} done={`${pool.label} sent to ${shortAddr(recipient.trim(), 6)}.`} />}
          </Gate>
          {done && (
            <div className="cash-done rise">
              <div className="kicker">Done</div>
              <p className="small muted">The note is now spent and cannot be used again. Nothing on-chain connects this withdrawal to the deposit except the pool it came from. {doneHash && <a href={explorerTx(doneHash)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>View transaction</a>}</p>
              <button className="btn btn-soft" onClick={restart}>Withdraw another note</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Wallet gate only when the user pays gas themselves; the relayer path needs no wallet at all. */
function Gate({ active, children }: { active: boolean; children: React.ReactNode }) {
  return active ? <RequireWallet what="send the withdrawal">{children}</RequireWallet> : <>{children}</>;
}

function RelayStatus({ r, done }: { r: ReturnType<typeof useRelay>; done: string }) {
  const link = r.hash ? <a href={explorerTx(r.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", marginLeft: 6 }}>View transaction</a> : null;
  if (r.error) return <div className="notice notice-err small" role="alert">{r.error}</div>;
  if (r.status === "sending") return <div className="notice">Handing the proof to the relayer…</div>;
  if (r.status === "pending") return <div className="notice">Waiting for Arc to confirm…{link}</div>;
  if (r.status === "reverted") return <div className="notice notice-err small" role="alert">The transaction reverted.{link}</div>;
  if (r.status === "success") return <div className="notice notice-ok">{done}{link}</div>;
  return null;
}

const PROVE_STAGES: { key: WithdrawProgress["stage"]; label: string }[] = [
  { key: "leaves", label: "Reading the pool's deposits" },
  { key: "tree", label: "Rebuilding the Merkle tree" },
  { key: "download", label: "Downloading the proving key" },
  { key: "prove", label: "Generating the zero-knowledge proof" },
  { key: "verify", label: "Verifying it locally" },
];

function ProveSteps({ p }: { p: WithdrawProgress }) {
  const order = PROVE_STAGES.map((s) => s.key);
  const at = p.stage === "ready" ? order.length : p.stage === "error" ? -1 : order.indexOf(p.stage);
  return (
    <div className="cash-prove" aria-live="polite">
      {PROVE_STAGES.map((s, i) => {
        const state = at === -1 ? "err" : i < at ? "done" : i === at ? "now" : "todo";
        let detail = "";
        if (state === "now" && p.stage === "leaves" && "total" in p && p.total) detail = `${p.done ?? 0}/${p.total}`;
        if (state === "now" && p.stage === "download" && "ratio" in p && p.ratio !== undefined) detail = `${Math.round(p.ratio * 100)}%`;
        return (
          <div key={s.key} className={`cash-prove-row ${state}`}>
            <span className="cash-prove-dot" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
            <span>{s.label}</span>
            <span className="mono tiny faint">{detail}</span>
            {state === "now" && p.stage === "download" && "ratio" in p && <i className="cash-bar" style={{ width: `${Math.round((p.ratio ?? 0) * 100)}%` }} />}
          </div>
        );
      })}
      {p.stage === "error" && <div className="notice notice-err small" role="alert">{p.message}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ side panel + bits

function PoolsPanel({ stats, loading }: { stats: PoolStats[]; loading: boolean }) {
  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <div className="row between"><div className="kicker">Pools on Arc</div><span className="tiny faint">live</span></div>
      {stats.map((s) => (
        <div key={s.address} className="cash-pool-row">
          <div className="row between">
            <strong>{s.label}</strong>
            <a className="mono tiny" href={explorerAddress(s.address)} target="_blank" rel="noreferrer">{shortAddr(s.address, 5)}</a>
          </div>
          <div className="row between small muted">
            <span>{loading ? "…" : `${s.deposits} deposits`}</span>
            <span>{loading ? "…" : `${s.unspent} unspent`}</span>
          </div>
          <AnonMeter n={s.unspent} />
        </div>
      ))}
      <p className="tiny faint" style={{ margin: 0 }}>“Unspent” is the anonymity set: the number of notes a withdrawal could belong to.</p>
    </div>
  );
}

/** Rough feel for the anonymity set: 1 is nothing, ~50 starts to mean something. */
function AnonMeter({ n }: { n: number }) {
  const pct = Math.min(100, Math.round(100 * Math.log10(1 + n) / Math.log10(51)));
  const word = n <= 1 ? "no cover" : n < 10 ? "weak" : n < 50 ? "modest" : "decent";
  return (
    <div className="cash-meter" title={`${n} unspent notes`}>
      <i style={{ width: `${pct}%` }} className={n <= 1 ? "none" : n < 10 ? "weak" : ""} />
      <span className="tiny faint">{word}</span>
    </div>
  );
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="cash-steps" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} className={i < current ? "done" : i === current ? "now" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="cash-step-dot">{i < current ? "✓" : i + 1}</span>
          <span className="cash-step-label">{l}</span>
        </li>
      ))}
    </ol>
  );
}

const fmtUsdcWhole = (wei: bigint) => {
  const s = formatEther(wei);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};


import { useMemo, useRef, useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, type Address, type Hash } from "viem";
import { AIRDROP_ADDRESS, AIRDROP_MAX_PER_TX, airdropAbi, erc20Abi, explorerTx } from "@/contracts";
import { useTokenAccount, useTokenMeta } from "@/hooks/useLocks";
import { friendlyError } from "@/hooks/useTx";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { AddressLink } from "@/components/AddressLink";
import { chunk, mergeDuplicates, parseRecipients, SAMPLE_CSV, type Row } from "@/lib/airdropParse";
import { fmtAmount, fmtUsdc, isValidAddress, parseAmount, shortAddr } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

/** Recipients per transaction. The contract allows 500; 250 keeps each tx well under Arc's block limit. */
const BATCH = Math.min(250, AIRDROP_MAX_PER_TX);

type Mode = "erc20" | "native";
type AmountMode = "per" | "same";
type BatchResult = { index: number; count: number; hash: Hash; status: "pending" | "ok" | "failed" };

export function Airdrop() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Bulk airdrop</div>
          <h2>Send to many wallets at once</h2>
        </div>
      </div>
      <RequireWallet what="send an airdrop">
        <AirdropForm />
      </RequireWallet>
    </div>
  );
}

function AirdropForm() {
  const { address: account } = useAccount();
  const client = usePublicClient();
  const qc = useQueryClient();
  const native = useBalance({ address: account });
  const fee = useReadContract({ address: AIRDROP_ADDRESS, abi: airdropAbi, functionName: "fee" });
  const stats = useReadContract({ address: AIRDROP_ADDRESS, abi: airdropAbi, functionName: "totalRecipients", query: { refetchInterval: 30_000 } });

  const [mode, setMode] = useState<Mode>("erc20");
  const [amountMode, setAmountMode] = useState<AmountMode>("per");
  const [tokenInput, setTokenInput] = useState("");
  const [sameAmount, setSameAmount] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const token = mode === "erc20" && isValidAddress(tokenInput) ? (tokenInput as Address) : undefined;
  const { meta, notToken, isLoading: metaLoading } = useTokenMeta(token);
  const { balance, allowance } = useTokenAccount(token, account, AIRDROP_ADDRESS);
  const decimals = mode === "native" ? 18 : (meta?.decimals ?? 18);
  const symbol = mode === "native" ? "USDC" : (meta?.symbol ?? "tokens");

  const parsed = useMemo(() => parseRecipients(text, decimals, amountMode === "same"), [text, decimals, amountMode]);
  const sameWei = amountMode === "same" ? parseAmount(sameAmount, decimals) : null;

  const rows: Row[] = useMemo(() => {
    if (amountMode === "same") return parsed.rows.map((r) => ({ ...r, amount: sameWei ?? 0n }));
    return parsed.rows;
  }, [parsed.rows, amountMode, sameWei]);

  const total = useMemo(() => rows.reduce((s, r) => s + (r.amount ?? 0n), 0n), [rows]);
  const batches = useMemo(() => chunk(rows, BATCH), [rows]);
  const feeWei = fee.data ?? 0n;
  const totalFee = feeWei * BigInt(batches.length);

  const problems: string[] = [];
  if (mode === "erc20" && tokenInput && !token) problems.push("Enter a valid token contract address.");
  if (mode === "erc20" && token && notToken) problems.push("That address is not an ERC20 token.");
  if (amountMode === "same" && sameAmount && sameWei === null) problems.push("Enter a valid amount per recipient.");
  if (parsed.errors.length) problems.push(`${parsed.errors.length} line${parsed.errors.length === 1 ? "" : "s"} could not be read. Fix or remove them below.`);
  if (parsed.duplicates.length) problems.push(`${parsed.duplicates.length} address${parsed.duplicates.length === 1 ? " appears" : "es appear"} more than once. Merge or leave as separate sends.`);
  if (mode === "erc20" && balance !== undefined && total > balance) problems.push(`Total ${fmtAmount(total, decimals)} ${symbol} exceeds your balance of ${fmtAmount(balance, decimals)}.`);
  const nativeNeeded = totalFee + (mode === "native" ? total : 0n);
  if (native.data && nativeNeeded > native.data.value) problems.push(`You need ${fmtUsdc(nativeNeeded)} for ${mode === "native" ? "amounts plus fees" : "fees"} but hold ${fmtUsdc(native.data.value)}.`);

  const needsApproval = mode === "erc20" && allowance !== undefined && allowance < total;
  const ready =
    rows.length > 0 && total > 0n && parsed.errors.length === 0 && fee.data !== undefined && (mode === "native" || (!!token && !!meta && balance !== undefined && total <= balance)) && (!native.data || nativeNeeded <= native.data.value) && (amountMode === "per" || sameWei !== null);

  // ---------- run state ----------
  const { writeContractAsync } = useWriteContract();
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const nextBatch = results.filter((r) => r.status === "ok").length;

  async function approve() {
    if (!token) return;
    setError("");
    setApproving(true);
    try {
      const hash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [AIRDROP_ADDRESS, total] });
      await client!.waitForTransactionReceipt({ hash });
      await qc.invalidateQueries();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setApproving(false);
    }
  }

  async function run() {
    if (!ready || fee.data === undefined) return;
    setError("");
    setRunning(true);
    try {
      for (let i = nextBatch; i < batches.length; i++) {
        const b = batches[i];
        const recipients = b.map((r) => r.address);
        const amounts = b.map((r) => r.amount ?? 0n);
        let hash: Hash;
        if (mode === "native") {
          const sum = amounts.reduce((s, a) => s + a, 0n);
          hash = await writeContractAsync({ address: AIRDROP_ADDRESS, abi: airdropAbi, functionName: "airdropNative", args: [recipients, amounts], value: sum + fee.data });
        } else if (amountMode === "same" && sameWei) {
          hash = await writeContractAsync({ address: AIRDROP_ADDRESS, abi: airdropAbi, functionName: "airdropERC20Same", args: [token!, recipients, sameWei], value: fee.data });
        } else {
          hash = await writeContractAsync({ address: AIRDROP_ADDRESS, abi: airdropAbi, functionName: "airdropERC20", args: [token!, recipients, amounts], value: fee.data });
        }
        setResults((r) => [...r.filter((x) => x.index !== i), { index: i, count: b.length, hash, status: "pending" }]);
        const receipt = await client!.waitForTransactionReceipt({ hash });
        const ok = receipt.status === "success";
        setResults((r) => r.map((x) => (x.index === i ? { ...x, status: ok ? "ok" : "failed" } : x)));
        if (!ok) throw new Error(`Batch ${i + 1} reverted on chain.`);
      }
      setDone(true);
      await qc.invalidateQueries();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setResults([]);
    setDone(false);
    setError("");
    setText("");
    setFileName("");
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setFileName(f.name);
    };
    reader.readAsText(f);
  }

  function removeInvalid() {
    const bad = new Set(parsed.errors.map((e) => e.line));
    setText(
      text
        .split(/\r?\n/)
        .filter((_, i) => !bad.has(i + 1))
        .join("\n"),
    );
  }

  function merge() {
    const merged = mergeDuplicates(parsed.rows);
    setText(merged.map((r) => (amountMode === "same" || r.amount === undefined ? r.address : `${r.address},${formatUnits(r.amount, decimals)}`)).join("\n"));
  }

  if (done) {
    return (
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card stack rise" style={{ gap: 16 }}>
          <div className="eyebrow">Sent</div>
          <h2>Airdrop complete.</h2>
          <p className="muted">
            {fmtAmount(total, decimals)} {symbol} reached {rows.length} wallet{rows.length === 1 ? "" : "s"} in {results.length} transaction{results.length === 1 ? "" : "s"}.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {results.map((r) => (
              <div key={r.index} className="panel row between small">
                <span>Batch {r.index + 1} · {r.count} recipients</span>
                <a className="mono" href={explorerTx(r.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                  {shortAddr(r.hash, 6)}
                </a>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={reset}>Send another airdrop</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)" }}>
      <div className="card stack" style={{ gap: 20 }}>
        <div className="field">
          <label>What to send</label>
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={mode === "erc20"} className={mode === "erc20" ? "on" : ""} onClick={() => setMode("erc20")} disabled={running}>ERC20 token</button>
            <button role="tab" aria-selected={mode === "native"} className={mode === "native" ? "on" : ""} onClick={() => setMode("native")} disabled={running}>Native USDC</button>
          </div>
        </div>

        {mode === "erc20" && (
          <div className="field">
            <label htmlFor="atoken">Token contract</label>
            <input id="atoken" className="input mono" placeholder="0x…" value={tokenInput} onChange={(e) => setTokenInput(e.target.value.trim())} autoComplete="off" spellCheck={false} disabled={running} />
            {token && metaLoading && <div className="hint">Looking up token…</div>}
            {meta && (
              <div className="hint">
                {meta.name} ({meta.symbol}) · {meta.decimals} decimals
                {balance !== undefined && <>{" · "}you hold <span style={{ color: "var(--text)" }}>{fmtAmount(balance, meta.decimals)} {meta.symbol}</span></>}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label>Amounts</label>
          <div className="presets">
            <button type="button" className={`preset ${amountMode === "per" ? "on" : ""}`} onClick={() => setAmountMode("per")} disabled={running}>Per recipient in the list</button>
            <button type="button" className={`preset ${amountMode === "same" ? "on" : ""}`} onClick={() => setAmountMode("same")} disabled={running}>Same amount for everyone</button>
          </div>
        </div>

        {amountMode === "same" && (
          <AmountInput label="Amount per recipient" value={sameAmount} onChange={setSameAmount} symbol={symbol} decimals={decimals} disabled={running || (mode === "erc20" && !meta)} hint={`Each address in the list receives this amount${rows.length ? `, ${rows.length} × = ${fmtAmount(total, decimals)} ${symbol}` : ""}.`} />
        )}

        <div className="field">
          <div className="row between">
            <label htmlFor="list">Recipients</label>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={running}>Upload CSV / TXT / JSON</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setText(SAMPLE_CSV); setFileName(""); }} disabled={running}>Load example</button>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.json,text/csv,text/plain,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </div>
          <textarea
            id="list"
            className="input mono"
            rows={10}
            placeholder={amountMode === "same" ? "One address per line\n0xabc…\n0xdef…" : "One per line: address, amount\n0xabc…, 100\n0xdef…, 250.5\n\nCommas, spaces, tabs, semicolons and = all work. CSV headers and JSON are accepted."}
            value={text}
            onChange={(e) => { setText(e.target.value); setFileName(""); }}
            disabled={running}
            spellCheck={false}
            style={{ resize: "vertical", lineHeight: 1.5 }}
          />
          <div className="hint">
            {fileName ? `Loaded ${fileName} · ` : ""}
            {rows.length} valid recipient{rows.length === 1 ? "" : "s"}
            {parsed.errors.length ? ` · ${parsed.errors.length} unreadable` : ""}
            {parsed.duplicates.length ? ` · ${parsed.duplicates.length} duplicate${parsed.duplicates.length === 1 ? "" : "s"}` : ""}
          </div>
        </div>

        {parsed.errors.length > 0 && (
          <div className="notice notice-err stack" style={{ gap: 6 }}>
            <div className="row between"><strong>Lines that could not be read</strong><button type="button" className="btn btn-sm btn-ghost" onClick={removeInvalid}>Remove them</button></div>
            {parsed.errors.slice(0, 6).map((e) => (
              <div key={e.line} className="mono tiny">line {e.line}: {e.reason} · <span className="faint">{e.raw.slice(0, 60)}</span></div>
            ))}
            {parsed.errors.length > 6 && <div className="tiny">…and {parsed.errors.length - 6} more</div>}
          </div>
        )}
        {parsed.duplicates.length > 0 && (
          <div className="notice notice-warn row between">
            <span>Duplicate addresses will each receive their own send. Merge them into one line per address instead?</span>
            <button type="button" className="btn btn-sm btn-soft" onClick={merge}>Merge duplicates</button>
          </div>
        )}
        {problems.length > 0 && parsed.errors.length === 0 && parsed.duplicates.length === 0 && <div className="notice notice-warn">{problems[0]}</div>}
        {error && <div className="notice notice-err" role="alert">{error}</div>}

        {results.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {results.map((r) => (
              <div key={r.index} className="panel row between small">
                <span>Batch {r.index + 1} of {batches.length} · {r.count} recipients</span>
                <span className="row" style={{ gap: 8 }}>
                  <span className={`pill ${r.status === "ok" ? "pill-unlocked" : r.status === "failed" ? "pill-empty" : "pill-locked"}`}>{r.status === "ok" ? "Confirmed" : r.status === "failed" ? "Failed" : "Pending"}</span>
                  <a className="mono tiny" href={explorerTx(r.hash)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{shortAddr(r.hash, 5)}</a>
                </span>
              </div>
            ))}
          </div>
        )}

        {needsApproval ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={approve} disabled={!ready || approving || running}>
            {approving ? "Approving…" : `Step 1 of 2 · Approve ${fmtAmount(total, decimals)} ${symbol}`}
          </button>
        ) : (
          <button className="btn btn-primary btn-lg btn-block" onClick={run} disabled={!ready || running}>
            {running
              ? `Sending batch ${Math.min(nextBatch + 1, batches.length)} of ${batches.length}…`
              : nextBatch > 0 && nextBatch < batches.length
                ? `Resume from batch ${nextBatch + 1} of ${batches.length}`
                : batches.length > 1
                  ? `Send ${rows.length} recipients in ${batches.length} transactions`
                  : rows.length > 0
                    ? `Send to ${rows.length} recipient${rows.length === 1 ? "" : "s"}`
                    : "Send airdrop"}
          </button>
        )}
        <p className="tiny faint center">
          {mode === "erc20" ? "Tokens go straight from your wallet to each recipient; the contract never holds them. " : "USDC is forwarded to each recipient and any excess is refunded. "}
          Each transaction is all-or-nothing.
        </p>
      </div>

      <div className="stack" style={{ position: "sticky", top: 88 }}>
        <div className="card stack" style={{ gap: 10 }}>
          <div className="eyebrow">Summary</div>
          <dl className="ledger">
            <dt>Recipients</dt><dd>{rows.length}</dd>
            <dt>Total</dt><dd>{fmtAmount(total, decimals)} {symbol}</dd>
            <dt>Transactions</dt><dd>{batches.length || 0}{batches.length > 1 ? ` · ${BATCH} per batch` : ""}</dd>
            <dt>Fee</dt><dd>{fee.data !== undefined ? `${fmtUsdc(fee.data)} × ${batches.length || 1} = ${fmtUsdc(totalFee)}` : "…"}</dd>
            <dt>Your USDC</dt><dd>{native.data ? fmtUsdc(native.data.value) : "…"}</dd>
            {mode === "erc20" && <><dt>Approval</dt><dd>{!token || rows.length === 0 ? "—" : needsApproval ? "Needed" : "Ready"}</dd></>}
          </dl>
          <div className="divider" />
          <div className="tiny faint">Airdrop contract <AddressLink addr={AIRDROP_ADDRESS} chars={5} /> · {stats.data !== undefined ? `${stats.data.toString()} wallets served so far` : ""}</div>
        </div>
        {rows.length > 0 && (
          <div className="card card-tight">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Preview</div>
            <div className="stack" style={{ gap: 4, maxHeight: 280, overflow: "auto" }}>
              {rows.slice(0, 50).map((r, i) => (
                <div key={`${r.address}-${i}`} className="row between tiny mono">
                  <span className="muted">{shortAddr(r.address, 5)}</span>
                  <span>{fmtAmount(r.amount ?? 0n, decimals)}</span>
                </div>
              ))}
              {rows.length > 50 && <div className="tiny faint">…and {rows.length - 50} more</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

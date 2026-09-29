import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { VESTING_ADDRESS, vestingAbi, explorerAddress, type Vesting } from "@/contracts";
import { useVesting } from "@/hooks/useVestings";
import { useTokenMeta } from "@/hooks/useLocks";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { arc } from "@/wagmi";
import { VestingCertificate } from "@/components/VestingCertificate";
import { AddressLink } from "@/components/AddressLink";
import { TxStatus } from "@/components/TxStatus";
import { ConnectButton } from "@/components/ConnectButton";
import { DAY, fmtAmount, fmtDate, fmtDuration, isValidAddress, sameAddr, vestUrl, vestedAt, vestingExists, vestingStatus } from "@/lib/format";
import type { TokenMeta } from "@/contracts";

export function VestingDetail() {
  const { id: idParam } = useParams();
  const id = useMemo(() => (idParam && /^\d+$/.test(idParam) ? BigInt(idParam) : undefined), [idParam]);
  const now = useNow(10_000);
  const { data, isLoading, isError } = useVesting(id);
  const v = data as Vesting | undefined;
  const exists = vestingExists(v);
  const { meta } = useTokenMeta(exists ? v.token : undefined);
  const { address: account, chainId } = useAccount();
  const onArc = chainId === arc.id;
  const isBeneficiary = exists && onArc && sameAddr(account, v.beneficiary);
  const isCreator = exists && sameAddr(account, v.creator);
  const [copied, setCopied] = useState(false);

  if (id === undefined) return <Missing text="That schedule id is not valid." />;
  if (isLoading) return <div className="wrap page"><div className="cert" style={{ minHeight: 320 }} /></div>;
  if (isError) return <Missing text="Could not reach Arc to load this schedule. Check your connection and try again." />;
  if (!exists) return <Missing text={`Vesting schedule #${id.toString()} does not exist on Arc.`} />;

  const status = vestingStatus(v, now);
  const decimals = meta?.decimals ?? 18;
  const vested = vestedAt(v, now);
  const claimable = vested - v.released;
  const url = vestUrl(v.id);
  const termDays = Math.round(Number(v.end - v.start) / DAY);
  const cliffDays = Math.round(Number(v.cliff - v.start) / DAY);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Vesting #{v.id.toString()}</div>
          <h2>
            {fmtAmount(v.total, decimals)} {meta?.symbol ?? "tokens"}
          </h2>
        </div>
        <div className="row">
          <button className="btn btn-soft" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <a
            className="btn btn-ghost"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/post?text=${encodeURIComponent(`${fmtAmount(v.total, decimals)} ${meta?.symbol ?? "tokens"} vesting on Arc until ${fmtDate(v.end)}. Verify it on-chain:`)}&url=${encodeURIComponent(url)}`}
          >
            Share on X
          </a>
          {meta && <Link className="btn btn-ghost" to={`/token/${v.token}`}>All {meta.symbol} locks</Link>}
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack" style={{ gap: 20 }}>
          <div className="rise"><VestingCertificate v={v} meta={meta} now={now} /></div>
          <div className="card rise rise-2">
            <div className="eyebrow" style={{ marginBottom: 14 }}>Schedule</div>
            <dl className="ledger">
              <dt>Status</dt>
              <dd>
                {status === "upcoming" && `Starts in ${fmtDuration(Number(v.start) - now)}`}
                {status === "cliff" && `In cliff · first unlock in ${fmtDuration(Number(v.cliff) - now)}`}
                {status === "vesting" && `Vesting · ends in ${fmtDuration(Number(v.end) - now)}`}
                {status === "vested" && "Fully vested"}
                {status === "claimed" && "Fully claimed"}
              </dd>
              <dt>Token</dt>
              <dd>{meta ? `${meta.name} (${meta.symbol}) · ` : ""}<AddressLink addr={v.token} chars={8} /></dd>
              <dt>Total</dt>
              <dd>{fmtAmount(v.total, decimals, 8)} {meta?.symbol}</dd>
              <dt>Vested so far</dt>
              <dd>{fmtAmount(vested, decimals, 8)} {meta?.symbol}</dd>
              <dt>Claimed</dt>
              <dd>{fmtAmount(v.released, decimals, 8)} {meta?.symbol}</dd>
              <dt>Claimable now</dt>
              <dd>{fmtAmount(claimable, decimals, 8)} {meta?.symbol}</dd>
              <dt>Term</dt>
              <dd>{termDays} days{cliffDays > 0 ? ` · ${cliffDays} day cliff` : " · no cliff"}</dd>
              <dt>Start</dt>
              <dd>{fmtDate(v.start)}</dd>
              <dt>Cliff</dt>
              <dd>{v.cliff === v.start ? "None" : fmtDate(v.cliff)}</dd>
              <dt>End</dt>
              <dd>{fmtDate(v.end)}</dd>
              <dt>Created by</dt>
              <dd><AddressLink addr={v.creator} chars={8} /> {isCreator && <span className="pill pill-role">you</span>}</dd>
              <dt>Beneficiary</dt>
              <dd><AddressLink addr={v.beneficiary} chars={8} /> {isBeneficiary && <span className="pill pill-role">you</span>}</dd>
              <dt>Vesting contract</dt>
              <dd><a href={explorerAddress(VESTING_ADDRESS)} target="_blank" rel="noreferrer" style={{ borderBottom: "1px dotted var(--text-faint)" }}>{VESTING_ADDRESS}</a></dd>
            </dl>
          </div>
        </div>

        <div className="rise rise-3">
          {isBeneficiary ? (
            <Actions v={v} meta={meta} claimable={claimable} />
          ) : (
            <div className="card stack" style={{ gap: 12 }}>
              <div className="eyebrow">Claim</div>
              <p className="muted small">
                {account
                  ? onArc
                    ? isCreator
                      ? "You created this schedule. It is not revocable and its dates cannot be changed; only the beneficiary can claim."
                      : "This wallet is not the beneficiary. Switch to the beneficiary wallet to claim."
                    : "Switch your wallet to Arc to claim."
                  : "Connect the beneficiary wallet to claim vested tokens."}
              </p>
              <div><ConnectButton /></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Missing({ text }: { text: string }) {
  return (
    <div className="wrap page">
      <div className="empty">
        <h3>Schedule not found</h3>
        <p className="muted" style={{ marginTop: 6 }}>{text}</p>
        <p style={{ marginTop: 16 }}><Link className="btn btn-ghost" to="/explore">Browse</Link></p>
      </div>
    </div>
  );
}

function Actions({ v, meta, claimable }: { v: Vesting; meta?: TokenMeta; claimable: bigint }) {
  const [tab, setTab] = useState<"claim" | "beneficiary">("claim");
  const claimTx = useTx();
  const benTx = useTx();
  const [to, setTo] = useState("");
  const valid = isValidAddress(to);
  const decimals = meta?.decimals ?? 18;

  return (
    <div className="card">
      <div className="eyebrow" style={{ marginBottom: 10 }}>Manage</div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "claim"} className={`tab ${tab === "claim" ? "on" : ""}`} onClick={() => setTab("claim")}>Claim</button>
        <button role="tab" aria-selected={tab === "beneficiary"} className={`tab ${tab === "beneficiary" ? "on" : ""}`} onClick={() => setTab("beneficiary")}>Beneficiary</button>
      </div>

      {tab === "claim" && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="panel">
            <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Claimable now</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 30, letterSpacing: "-0.02em", marginTop: 4 }}>
              {fmtAmount(claimable, decimals)} <span className="muted" style={{ fontSize: 16 }}>{meta?.symbol}</span>
            </div>
          </div>
          <p className="small muted">Claims everything vested since your last claim, sent to your connected wallet. Claim as often as you like; gas is the only cost.</p>
          <TxStatus tx={claimTx} done="Claimed." />
          <button className="btn btn-primary btn-block" disabled={claimable === 0n || claimTx.busy} onClick={() => claimTx.writeContract({ address: VESTING_ADDRESS, abi: vestingAbi, functionName: "claim", args: [v.id] })}>
            {claimTx.busy ? "Claiming…" : claimable === 0n ? "Nothing to claim yet" : `Claim ${fmtAmount(claimable, decimals)} ${meta?.symbol ?? ""}`}
          </button>
        </div>
      )}

      {tab === "beneficiary" && (
        <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (!valid || benTx.busy) return; benTx.writeContract({ address: VESTING_ADDRESS, abi: vestingAbi, functionName: "setBeneficiary", args: [v.id, to as Address] }); }}>
          <p className="small muted">Hand this schedule to another wallet. Unclaimed and future tokens will go to the new beneficiary.</p>
          <div className="field">
            <label htmlFor="new-ben">New beneficiary</label>
            <input id="new-ben" className="input mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} spellCheck={false} />
            {to && !valid && <div className="error">Enter a valid address.</div>}
          </div>
          <div className="notice notice-warn">After this you lose the right to claim. Only the new beneficiary can hand it back.</div>
          <TxStatus tx={benTx} done="Beneficiary updated." />
          <button className="btn btn-primary btn-block" type="submit" disabled={!valid || benTx.busy}>{benTx.busy ? "Updating…" : "Change beneficiary"}</button>
        </form>
      )}
    </div>
  );
}

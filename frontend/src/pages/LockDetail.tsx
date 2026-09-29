import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { parseEventLogs, type Address } from "viem";
import { LOCKER_ADDRESS, lockerAbi, erc20Abi, explorerAddress, type Lock } from "@/contracts";
import { useLock, useTokenAccount, useTokenMeta } from "@/hooks/useLocks";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { arc } from "@/wagmi";
import { Certificate } from "@/components/Certificate";
import { AddressLink } from "@/components/AddressLink";
import { AmountInput } from "@/components/AmountInput";
import { TxStatus } from "@/components/TxStatus";
import { ConnectButton } from "@/components/ConnectButton";
import {
  DAY,
  dateInputToSec,
  fmtAmount,
  fmtDate,
  fmtDuration,
  isValidAddress,
  lockExists,
  lockStatus,
  lockUrl,
  parseAmount,
  sameAddr,
  secToDateInput,
  totalDays,
} from "@/lib/format";
import type { TokenMeta } from "@/contracts";

export function LockDetail() {
  const { id: idParam } = useParams();
  const id = useMemo(() => {
    try {
      return idParam && /^\d+$/.test(idParam) ? BigInt(idParam) : undefined;
    } catch {
      return undefined;
    }
  }, [idParam]);

  const now = useNow(10_000);
  const { data, isLoading, isError } = useLock(id);
  const lock = data as Lock | undefined;
  const exists = lockExists(lock);
  const { meta } = useTokenMeta(exists ? lock.token : undefined);
  const { address: account, chainId } = useAccount();
  const onArc = chainId === arc.id;
  const isOwner = exists && onArc && sameAddr(account, lock.owner);
  const isWithdrawer = exists && onArc && sameAddr(account, lock.withdrawer);

  const [copied, setCopied] = useState(false);

  if (id === undefined) return <Missing text="That lock id is not valid." />;
  if (isLoading) {
    return (
      <div className="wrap page">
        <div className="cert" style={{ minHeight: 320 }} />
      </div>
    );
  }
  if (isError) return <Missing text="Could not reach Arc to load this lock. Check your connection and try again." />;
  if (!exists) return <Missing text={`Lock #${id.toString()} does not exist on Arc.`} />;

  const status = lockStatus(lock, now);
  const url = lockUrl(lock.id);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Lock #{lock.id.toString()}</div>
          <h2>
            {fmtAmount(lock.amount, meta?.decimals ?? 18)} {meta?.symbol ?? "tokens"}
          </h2>
        </div>
        <div className="row">
          <button
            className="btn btn-soft"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <a
            className="btn btn-ghost"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/post?text=${encodeURIComponent(`${fmtAmount(lock.amount, meta?.decimals ?? 18)} ${meta?.symbol ?? "tokens"} locked on Arc until ${fmtDate(lock.unlockDate)}. Verify it on-chain:`)}&url=${encodeURIComponent(url)}`}
          >
            Share on X
          </a>
          {meta && (
            <Link className="btn btn-ghost" to={`/token/${lock.token}`}>
              All {meta.symbol} locks
            </Link>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack" style={{ gap: 20 }}>
          <div className="rise">
            <Certificate lock={lock} meta={meta} now={now} />
          </div>

          <div className="card rise rise-2">
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              Details
            </div>
            <dl className="ledger">
              <dt>Status</dt>
              <dd>
                {status === "locked" && `Locked · opens in ${fmtDuration(Number(lock.unlockDate) - now)}`}
                {status === "unlocked" && `Unlocked · open for ${fmtDuration(now - Number(lock.unlockDate))}`}
                {status === "empty" && "Fully withdrawn"}
              </dd>
              <dt>Token</dt>
              <dd>
                {meta ? `${meta.name} (${meta.symbol}) · ` : ""}
                <AddressLink addr={lock.token} chars={8} />
              </dd>
              <dt>Remaining</dt>
              <dd>
                {fmtAmount(lock.amount, meta?.decimals ?? 18, 8)} {meta?.symbol}
              </dd>
              <dt>Locked on</dt>
              <dd>{fmtDate(lock.lockDate)}</dd>
              <dt>Unlocks on</dt>
              <dd>
                {fmtDate(lock.unlockDate)} · {totalDays(lock)} day term
              </dd>
              <dt>Owner</dt>
              <dd>
                <AddressLink addr={lock.owner} chars={8} /> {isOwner && <span className="pill pill-role">you</span>}
              </dd>
              <dt>Withdrawer</dt>
              <dd>
                <AddressLink addr={lock.withdrawer} chars={8} /> {isWithdrawer && <span className="pill pill-role">you</span>}
              </dd>
              <dt>Locker contract</dt>
              <dd>
                <a href={explorerAddress(LOCKER_ADDRESS)} target="_blank" rel="noreferrer" style={{ borderBottom: "1px dotted var(--text-faint)" }}>
                  {LOCKER_ADDRESS}
                </a>
              </dd>
            </dl>
          </div>
        </div>

        <div className="rise rise-3">
          {isOwner || isWithdrawer ? (
            <Actions lock={lock} meta={meta} now={now} isOwner={isOwner} isWithdrawer={isWithdrawer} account={account!} />
          ) : (
            <div className="card stack" style={{ gap: 12 }}>
              <div className="eyebrow">Manage</div>
              <p className="muted small">
                {account
                  ? onArc
                    ? "This wallet is neither the owner nor the withdrawer of this lock. Switch to one of those wallets to manage it."
                    : "Switch your wallet to Arc to manage this lock."
                  : "Connect the owner or withdrawer wallet to top up, extend, split, transfer or withdraw."}
              </p>
              <div>
                <ConnectButton />
              </div>
              <div className="divider" />
              <p className="tiny faint">
                The owner can top up, extend, split and transfer. The withdrawer can take tokens out after the unlock date and
                reassign the withdrawer role.
              </p>
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
        <h3>Lock not found</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          {text}
        </p>
        <p style={{ marginTop: 16 }}>
          <Link className="btn btn-ghost" to="/explore">
            Browse locks
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ---------------- Actions ---------------- */

type Tab = "withdraw" | "topup" | "extend" | "split" | "transfer" | "withdrawer";

function Actions({
  lock,
  meta,
  now,
  isOwner,
  isWithdrawer,
  account,
}: {
  lock: Lock;
  meta?: TokenMeta;
  now: number;
  isOwner: boolean;
  isWithdrawer: boolean;
  account: Address;
}) {
  const allTabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "withdraw", label: "Withdraw", show: isWithdrawer },
    { key: "topup", label: "Top up", show: isOwner },
    { key: "extend", label: "Extend", show: isOwner },
    { key: "split", label: "Split", show: isOwner },
    { key: "transfer", label: "Transfer", show: isOwner },
    { key: "withdrawer", label: "Withdrawer", show: isWithdrawer },
  ];
  const tabs = allTabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "withdraw");
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key ?? "withdraw");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, isWithdrawer]);

  const decimals = meta?.decimals ?? 18;
  const symbol = meta?.symbol ?? "tokens";

  return (
    <div className="card">
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        Manage
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "withdraw" && <Withdraw lock={lock} decimals={decimals} symbol={symbol} now={now} />}
      {tab === "topup" && <TopUp lock={lock} decimals={decimals} symbol={symbol} now={now} account={account} />}
      {tab === "extend" && <Extend lock={lock} now={now} />}
      {tab === "split" && <Split lock={lock} decimals={decimals} symbol={symbol} />}
      {tab === "transfer" && <Transfer lock={lock} isWithdrawer={isWithdrawer} />}
      {tab === "withdrawer" && <ChangeWithdrawer lock={lock} />}
    </div>
  );
}

function Withdraw({ lock, decimals, symbol, now }: { lock: Lock; decimals: number; symbol: string; now: number }) {
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const wei = parseAmount(amount, decimals);
  const locked = now < Number(lock.unlockDate);
  const tooMuch = wei !== null && wei > lock.amount;
  const canSubmit = !locked && wei !== null && !tooMuch && lock.amount > 0n && !tx.busy;
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || wei === null) return;
        tx.writeContract({ address: LOCKER_ADDRESS, abi: lockerAbi, functionName: "withdraw", args: [lock.id, wei] });
      }}
    >
      {locked ? (
        <div className="notice notice-warn">Still locked. Opens in {fmtDuration(Number(lock.unlockDate) - now)}.</div>
      ) : lock.amount === 0n ? (
        <div className="notice">Everything has been withdrawn from this lock.</div>
      ) : (
        <p className="small muted">Tokens go to your connected wallet. You can withdraw in parts.</p>
      )}
      <AmountInput label="Amount" value={amount} onChange={setAmount} symbol={symbol} decimals={decimals} max={lock.amount} maxLabel="In lock" error={tooMuch ? "More than the lock holds." : undefined} disabled={locked || lock.amount === 0n} />
      <TxStatus tx={tx} done="Withdrawn." />
      <button className="btn btn-primary btn-block" type="submit" disabled={!canSubmit}>
        {tx.busy ? "Withdrawing…" : wei ? `Withdraw ${fmtAmount(wei, decimals)} ${symbol}` : "Withdraw"}
      </button>
    </form>
  );
}

function TopUp({ lock, decimals, symbol, now, account }: { lock: Lock; decimals: number; symbol: string; now: number; account: Address }) {
  const [amount, setAmount] = useState("");
  const { balance, allowance } = useTokenAccount(lock.token, account);
  const approveTx = useTx();
  const tx = useTx();
  const wei = parseAmount(amount, decimals);
  const matured = now >= Number(lock.unlockDate);
  const needsApproval = wei !== null && allowance !== undefined && allowance < wei;
  const tooMuch = wei !== null && balance !== undefined && wei > balance;
  const canSubmit = !matured && wei !== null && !tooMuch && !approveTx.busy && !tx.busy;
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || wei === null) return;
        if (needsApproval) approveTx.writeContract({ address: lock.token, abi: erc20Abi, functionName: "approve", args: [LOCKER_ADDRESS, wei] });
        else tx.writeContract({ address: LOCKER_ADDRESS, abi: lockerAbi, functionName: "incrementLock", args: [lock.id, wei] });
      }}
    >
      {matured ? (
        <div className="notice notice-warn">This lock has already opened. Extend it first, then top up.</div>
      ) : (
        <p className="small muted">Add more {symbol} under the same unlock date. No fee.</p>
      )}
      <AmountInput label="Amount to add" value={amount} onChange={setAmount} symbol={symbol} decimals={decimals} max={balance} error={tooMuch ? "More than your wallet holds." : undefined} disabled={matured} />
      <TxStatus tx={approveTx} done="Approved. Now add the tokens." />
      <TxStatus tx={tx} done="Added to the lock." />
      <button className="btn btn-primary btn-block" type="submit" disabled={!canSubmit}>
        {approveTx.busy ? "Approving…" : tx.busy ? "Adding…" : needsApproval ? `Approve ${symbol}` : "Add to lock"}
      </button>
    </form>
  );
}

function Extend({ lock, now }: { lock: Lock; now: number }) {
  const base = Math.max(Number(lock.unlockDate), now);
  const [date, setDate] = useState(() => secToDateInput(base + 90 * DAY));
  const tx = useTx();
  const sec = dateInputToSec(date);
  const valid = sec !== null && sec > Number(lock.unlockDate) && sec > now;
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || sec === null) return;
        tx.writeContract({ address: LOCKER_ADDRESS, abi: lockerAbi, functionName: "extendLock", args: [lock.id, BigInt(sec)] });
      }}
    >
      <p className="small muted">Push the unlock date later. This cannot be undone or shortened.</p>
      <div className="field">
        <label>Add from the current date</label>
        <div className="presets">
          {[30, 90, 180, 365].map((d) => (
            <button type="button" key={d} className="preset" onClick={() => setDate(secToDateInput(base + d * DAY))}>
              +{d} days
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="extend-date">New unlock date</label>
        <input id="extend-date" className="input mono" type="datetime-local" value={date} min={secToDateInput(base + 60)} onChange={(e) => setDate(e.target.value)} />
        <div className="hint">Currently {fmtDate(lock.unlockDate)}.{sec && valid ? ` New: ${fmtDate(sec)} (+${Math.round((sec - Number(lock.unlockDate)) / DAY)} days).` : ""}</div>
        {date && !valid && <div className="error">Pick a date later than the current unlock date.</div>}
      </div>
      <TxStatus tx={tx} done="Unlock date extended." />
      <button className="btn btn-primary btn-block" type="submit" disabled={!valid || tx.busy}>
        {tx.busy ? "Extending…" : "Extend lock"}
      </button>
    </form>
  );
}

function Split({ lock, decimals, symbol }: { lock: Lock; decimals: number; symbol: string }) {
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const wei = parseAmount(amount, decimals);
  const bad = wei !== null && wei >= lock.amount;
  const newId = useMemo(() => {
    if (!tx.receipt) return undefined;
    const logs = parseEventLogs({ abi: lockerAbi, logs: tx.receipt.logs, eventName: "LockSplit" });
    return logs[0]?.args.newLockId;
  }, [tx.receipt]);
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (wei === null || bad || tx.busy) return;
        tx.writeContract({ address: LOCKER_ADDRESS, abi: lockerAbi, functionName: "splitLock", args: [lock.id, wei] });
      }}
    >
      <p className="small muted">Move part of this lock into a new lock with the same date and roles. Useful for extending or transferring only a portion.</p>
      <AmountInput label="Amount to split off" value={amount} onChange={setAmount} symbol={symbol} decimals={decimals} max={lock.amount} maxLabel="In lock" error={bad ? "Must be less than the full balance." : undefined} />
      <TxStatus tx={tx} done={newId !== undefined ? `Split complete. New lock #${newId.toString()}.` : "Split complete."} />
      {newId !== undefined && (
        <Link className="btn btn-soft btn-block" to={`/lock/${newId.toString()}`}>
          Open lock #{newId.toString()}
        </Link>
      )}
      <button className="btn btn-primary btn-block" type="submit" disabled={wei === null || bad || tx.busy}>
        {tx.busy ? "Splitting…" : "Split lock"}
      </button>
    </form>
  );
}

function Transfer({ lock, isWithdrawer }: { lock: Lock; isWithdrawer: boolean }) {
  const [to, setTo] = useState("");
  const [withRights, setWithRights] = useState(isWithdrawer);
  const tx = useTx();
  const valid = isValidAddress(to);
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || tx.busy) return;
        tx.writeContract({ address: LOCKER_ADDRESS, abi: lockerAbi, functionName: "transferLockOwnership", args: [lock.id, to as Address, withRights] });
      }}
    >
      <p className="small muted">Hand control of this lock to another wallet. Management rights cover top up, extend, split and transfer.</p>
      <div className="field">
        <label htmlFor="new-owner">New owner</label>
        <input id="new-owner" className="input mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} spellCheck={false} />
        {to && !valid && <div className="error">Enter a valid address.</div>}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={withRights} disabled={!isWithdrawer} onChange={(e) => setWithRights(e.target.checked)} />
        Also move withdrawal rights to the new owner
      </label>
      {!isWithdrawer && <div className="hint">You are not the withdrawer, so withdrawal rights stay where they are.</div>}
      {withRights && <div className="notice notice-warn">After this, only the new owner can withdraw. Make sure the address is right.</div>}
      <TxStatus tx={tx} done="Ownership transferred." />
      <button className="btn btn-primary btn-block" type="submit" disabled={!valid || tx.busy}>
        {tx.busy ? "Transferring…" : "Transfer lock"}
      </button>
    </form>
  );
}

function ChangeWithdrawer({ lock }: { lock: Lock }) {
  const [to, setTo] = useState("");
  const tx = useTx();
  const valid = isValidAddress(to);
  return (
    <form
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || tx.busy) return;
        tx.writeContract({ address: LOCKER_ADDRESS, abi: lockerAbi, functionName: "setWithdrawer", args: [lock.id, to as Address] });
      }}
    >
      <p className="small muted">Choose which wallet can take the tokens out after the unlock date. Only the current withdrawer can change this.</p>
      <div className="field">
        <label htmlFor="new-withdrawer">New withdrawer</label>
        <input id="new-withdrawer" className="input mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} spellCheck={false} />
        {to && !valid && <div className="error">Enter a valid address.</div>}
      </div>
      <div className="notice notice-warn">After this you lose withdrawal rights. Only the new withdrawer can hand them back.</div>
      <TxStatus tx={tx} done="Withdrawer updated." />
      <button className="btn btn-primary btn-block" type="submit" disabled={!valid || tx.busy}>
        {tx.busy ? "Updating…" : "Change withdrawer"}
      </button>
    </form>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { parseEventLogs, type Address } from "viem";
import { LOCKER_ADDRESS, lockerAbi, erc20Abi, type Lock } from "@/contracts";
import { useLockFee, useTokenAccount, useTokenMeta } from "@/hooks/useLocks";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { Certificate } from "@/components/Certificate";
import { TxStatus } from "@/components/TxStatus";
import { DAY, dateInputToSec, fmtAmount, fmtUsdc, isValidAddress, lockUrl, parseAmount, secToDateInput } from "@/lib/format";

const PRESETS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
];

export function NewLock() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">New lock</div>
          <h2>Lock tokens or LP</h2>
        </div>
      </div>
      <RequireWallet what="create a lock">
        <LockForm />
      </RequireWallet>
    </div>
  );
}

function LockForm() {
  const { address: account } = useAccount();
  const now = useNow(10_000);
  const fee = useLockFee();
  const native = useBalance({ address: account });

  const [tokenInput, setTokenInput] = useState("");
  const [amount, setAmount] = useState("");
  const [presetDays, setPresetDays] = useState<number | null>(90);
  const [customDate, setCustomDate] = useState(() => secToDateInput(Math.floor(Date.now() / 1000) + 90 * DAY));
  const [otherWithdrawer, setOtherWithdrawer] = useState(false);
  const [withdrawerInput, setWithdrawerInput] = useState("");

  const token = isValidAddress(tokenInput) ? (tokenInput as Address) : undefined;
  const { meta, notToken, isLoading: metaLoading } = useTokenMeta(token);
  const { balance, allowance } = useTokenAccount(token, account);

  const amountWei = meta ? parseAmount(amount, meta.decimals) : null;
  const unlockSec = presetDays !== null ? now + presetDays * DAY : dateInputToSec(customDate);
  const withdrawer: Address | undefined = otherWithdrawer
    ? isValidAddress(withdrawerInput)
      ? (withdrawerInput as Address)
      : undefined
    : account;

  const needsApproval = amountWei !== null && allowance !== undefined && allowance < amountWei;
  const insufficientToken = amountWei !== null && balance !== undefined && balance < amountWei;
  const insufficientFee = fee.data !== undefined && native.data !== undefined && native.data.value < fee.data;

  const problems: string[] = [];
  if (tokenInput && !token) problems.push("Enter a valid token contract address.");
  if (token && notToken) problems.push("That address is not an ERC20 token.");
  if (amount && meta && amountWei === null) problems.push("Enter a valid amount.");
  if (insufficientToken) problems.push(`You hold ${fmtAmount(balance, meta?.decimals ?? 18)} ${meta?.symbol}. Lower the amount.`);
  if (unlockSec !== null && unlockSec <= now + 60) problems.push("Unlock date must be at least a minute from now.");
  if (otherWithdrawer && withdrawerInput && !withdrawer) problems.push("Enter a valid withdrawer address.");
  if (insufficientFee) problems.push(`The ${fmtUsdc(fee.data)} lock fee is more than your wallet's USDC balance.`);

  const ready =
    !!token && !!meta && amountWei !== null && unlockSec !== null && unlockSec > now + 60 && !!withdrawer && !insufficientToken && !insufficientFee && fee.data !== undefined;

  const approveTx = useTx();
  const lockTx = useTx();

  // Reset the lock flow's stale error when inputs change.
  useEffect(() => {
    if (lockTx.error) lockTx.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenInput, amount, presetDays, customDate, withdrawerInput, otherWithdrawer]);

  const created = useMemo(() => {
    if (!lockTx.receipt) return undefined;
    const logs = parseEventLogs({ abi: lockerAbi, logs: lockTx.receipt.logs, eventName: "LockCreated" });
    const ev = logs.find((l) => l.address.toLowerCase() === LOCKER_ADDRESS.toLowerCase());
    if (!ev) return undefined;
    const a = ev.args;
    const lock: Lock = {
      id: a.lockId,
      token: a.token,
      owner: a.owner,
      withdrawer: a.withdrawer,
      amount: a.amount,
      lockDate: BigInt(now),
      unlockDate: a.unlockDate,
    };
    return lock;
  }, [lockTx.receipt, now]);

  if (created) return <Created lock={created} meta={meta} now={now} />;

  const preview: Lock | undefined =
    token && meta
      ? {
          id: 0n,
          token,
          owner: account ?? LOCKER_ADDRESS,
          withdrawer: withdrawer ?? account ?? LOCKER_ADDRESS,
          amount: amountWei ?? 0n,
          lockDate: BigInt(now),
          unlockDate: BigInt(unlockSec && unlockSec > now ? unlockSec : now + DAY),
        }
      : undefined;

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <form
        className="card stack"
        style={{ gap: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || !token || amountWei === null || !withdrawer || unlockSec === null || fee.data === undefined) return;
          if (needsApproval) {
            approveTx.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [LOCKER_ADDRESS, amountWei] });
          } else {
            lockTx.writeContract({
              address: LOCKER_ADDRESS,
              abi: lockerAbi,
              functionName: "lock",
              args: [token, amountWei, BigInt(unlockSec), withdrawer],
              value: fee.data,
            });
          }
        }}
      >
        <div className="field">
          <label htmlFor="token">Token or LP contract</label>
          <input
            id="token"
            className="input mono"
            placeholder="0x…"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value.trim())}
            autoComplete="off"
            spellCheck={false}
          />
          {token && metaLoading && <div className="hint">Looking up token…</div>}
          {meta && (
            <div className="hint">
              {meta.name} ({meta.symbol}) · {meta.decimals} decimals
              {balance !== undefined && (
                <>
                  {" · "}you hold <span style={{ color: "var(--text)" }}>{fmtAmount(balance, meta.decimals)} {meta.symbol}</span>
                </>
              )}
            </div>
          )}
          {!tokenInput && <div className="hint">For LP, paste the pair address. A Uniswap-style LP token is a normal ERC20.</div>}
        </div>

        <AmountInput
          label="Amount to lock"
          value={amount}
          onChange={setAmount}
          symbol={meta?.symbol}
          decimals={meta?.decimals}
          max={balance}
          disabled={!meta}
          hint={meta ? "Fee-on-transfer tokens are recorded at the amount the locker actually receives." : "Enter a token first."}
        />

        <div className="field">
          <label>Unlock date</label>
          <div className="presets">
            {PRESETS.map((p) => (
              <button type="button" key={p.days} className={`preset ${presetDays === p.days ? "on" : ""}`} onClick={() => setPresetDays(p.days)}>
                {p.label}
              </button>
            ))}
            <button type="button" className={`preset ${presetDays === null ? "on" : ""}`} onClick={() => setPresetDays(null)}>
              Custom
            </button>
          </div>
          {presetDays === null && (
            <input
              className="input mono"
              type="datetime-local"
              value={customDate}
              min={secToDateInput(now + 120)}
              onChange={(e) => setCustomDate(e.target.value)}
              aria-label="Custom unlock date and time"
            />
          )}
          {unlockSec && unlockSec > now && (
            <div className="hint">
              Opens {new Date(unlockSec * 1000).toLocaleString()} · {Math.round((unlockSec - now) / DAY)} days. You can extend later but never shorten.
            </div>
          )}
        </div>

        <div className="field">
          <label className="toggle">
            <input type="checkbox" checked={otherWithdrawer} onChange={(e) => setOtherWithdrawer(e.target.checked)} />
            A different wallet should receive the tokens at unlock
          </label>
          {otherWithdrawer && (
            <>
              <input
                className="input mono"
                placeholder="Withdrawer address 0x…"
                value={withdrawerInput}
                onChange={(e) => setWithdrawerInput(e.target.value.trim())}
                autoComplete="off"
                spellCheck={false}
                aria-label="Withdrawer address"
              />
              <div className="hint" style={{ color: "var(--accent)" }}>
                Check this address twice. Only the withdrawer can change it later, so a typo cannot be fixed by you.
              </div>
            </>
          )}
        </div>

        {problems.length > 0 && (
          <div className="notice notice-warn" role="status">
            {problems[0]}
          </div>
        )}

        <div className="panel small stack" style={{ gap: 6 }}>
          <div className="row between">
            <span className="muted">Lock fee</span>
            <span className="mono">{fee.data !== undefined ? fmtUsdc(fee.data) : "…"}</span>
          </div>
          <div className="row between">
            <span className="muted">Your USDC</span>
            <span className="mono">{native.data ? fmtUsdc(native.data.value) : "…"}</span>
          </div>
          <div className="row between">
            <span className="muted">Approval</span>
            <span className="mono">
              {!meta || amountWei === null ? "—" : needsApproval ? "Needed" : "Ready"}
            </span>
          </div>
        </div>

        <TxStatus tx={approveTx} done="Approved. Now create the lock." />
        <TxStatus tx={lockTx} />

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!ready || approveTx.busy || lockTx.busy}>
          {approveTx.busy
            ? "Approving…"
            : lockTx.busy
              ? "Locking…"
              : needsApproval
                ? `Step 1 of 2 · Approve ${meta?.symbol ?? ""}`
                : meta && amountWei !== null
                  ? `${needsApproval === false && allowance !== undefined ? "Step 2 of 2 · " : ""}Lock ${fmtAmount(amountWei, meta.decimals)} ${meta.symbol}`
                  : "Lock tokens"}
        </button>
        <p className="tiny faint center">
          Tokens move into the locker contract at {LOCKER_ADDRESS.slice(0, 10)}… and cannot be released before the unlock date by anyone.
        </p>
      </form>

      <div className="stack" style={{ position: "sticky", top: 88 }}>
        <div className="eyebrow">Live preview</div>
        {preview ? (
          <Certificate lock={preview} meta={meta} now={now} animate={false} caption="Certificate preview" />
        ) : (
          <div className="empty">
            <p>Enter a token address to preview the certificate.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Created({ lock, meta, now }: { lock: Lock; meta?: { symbol: string; decimals: number; name?: string }; now: number }) {
  const [copied, setCopied] = useState(false);
  const url = lockUrl(lock.id);
  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="rise">
        <Certificate lock={lock} meta={meta} now={now} />
      </div>
      <div className="card stack rise rise-2" style={{ gap: 16 }}>
        <div className="eyebrow">Locked</div>
        <h2>Your lock is live.</h2>
        <p className="muted">
          Lock #{lock.id.toString()} is on Arc. Share the link below so anyone can verify the amount and the countdown
          without trusting a screenshot.
        </p>
        <div className="input-row">
          <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
          <button
            className="btn btn-soft"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="row">
          <Link className="btn btn-primary" to={`/lock/${lock.id.toString()}`}>
            Open lock page
          </Link>
          <Link className="btn btn-ghost" to="/lock/new" onClick={() => window.location.assign("/lock/new")}>
            Lock more
          </Link>
        </div>
      </div>
    </div>
  );
}

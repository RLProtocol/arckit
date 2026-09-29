import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { parseEventLogs, type Address } from "viem";
import { VESTING_ADDRESS, vestingAbi, erc20Abi, type Vesting } from "@/contracts";
import { useTokenAccount, useTokenMeta } from "@/hooks/useLocks";
import { useVestingFee } from "@/hooks/useVestings";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { VestingCertificate } from "@/components/VestingCertificate";
import { TxStatus } from "@/components/TxStatus";
import { DAY, dateInputToSec, fmtAmount, fmtUsdc, isValidAddress, parseAmount, secToDateInput, vestUrl } from "@/lib/format";

const CLIFFS = [
  { label: "No cliff", days: 0 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
  { label: "1 year", days: 365 },
];
const DURATIONS = [
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
  { label: "3 years", days: 1095 },
  { label: "4 years", days: 1460 },
];

export function NewVesting() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">New vesting schedule</div>
          <h2>Vest tokens over time</h2>
        </div>
      </div>
      <RequireWallet what="create a vesting schedule">
        <VestForm />
      </RequireWallet>
    </div>
  );
}

function VestForm() {
  const { address: account } = useAccount();
  const now = useNow(10_000);
  const fee = useVestingFee();
  const native = useBalance({ address: account });

  const [tokenInput, setTokenInput] = useState("");
  const [amount, setAmount] = useState("");
  const [beneficiaryInput, setBeneficiaryInput] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [startDate, setStartDate] = useState(() => secToDateInput(Math.floor(Date.now() / 1000) + DAY));
  const [cliffDays, setCliffDays] = useState<number | null>(90);
  const [cliffCustom, setCliffCustom] = useState("");
  const [durationDays, setDurationDays] = useState<number | null>(365);
  const [durationCustom, setDurationCustom] = useState("");

  const token = isValidAddress(tokenInput) ? (tokenInput as Address) : undefined;
  const { meta, notToken, isLoading: metaLoading } = useTokenMeta(token);
  const { balance, allowance } = useTokenAccount(token, account, VESTING_ADDRESS);

  const amountWei = meta ? parseAmount(amount, meta.decimals) : null;
  const beneficiary: Address | undefined = beneficiaryInput ? (isValidAddress(beneficiaryInput) ? (beneficiaryInput as Address) : undefined) : account;

  const start = startNow ? now : dateInputToSec(startDate);
  const cliffLen = cliffDays !== null ? cliffDays : Number(cliffCustom) >= 0 && cliffCustom !== "" ? Math.floor(Number(cliffCustom)) : null;
  const durLen = durationDays !== null ? durationDays : Number(durationCustom) > 0 ? Math.floor(Number(durationCustom)) : null;
  const cliff = start !== null && cliffLen !== null ? start + cliffLen * DAY : null;
  const end = start !== null && durLen !== null ? start + durLen * DAY : null;

  const needsApproval = amountWei !== null && allowance !== undefined && allowance < amountWei;
  const insufficientToken = amountWei !== null && balance !== undefined && balance < amountWei;
  const insufficientFee = fee.data !== undefined && native.data !== undefined && native.data.value < fee.data;

  const problems: string[] = [];
  if (tokenInput && !token) problems.push("Enter a valid token contract address.");
  if (token && notToken) problems.push("That address is not an ERC20 token.");
  if (amount && meta && amountWei === null) problems.push("Enter a valid amount.");
  if (insufficientToken) problems.push(`You hold ${fmtAmount(balance, meta?.decimals ?? 18)} ${meta?.symbol}. Lower the amount.`);
  if (beneficiaryInput && !beneficiary) problems.push("Enter a valid beneficiary address.");
  if (start === null) problems.push("Enter a valid start date.");
  if (cliffLen === null) problems.push("Enter the cliff length in days.");
  if (durLen === null) problems.push("Enter the total vesting length in days.");
  if (cliffLen !== null && durLen !== null && cliffLen > durLen) problems.push("The cliff cannot be longer than the whole schedule.");
  if (end !== null && end <= now + 60) problems.push("The schedule must end in the future.");
  if (insufficientFee) problems.push(`The ${fmtUsdc(fee.data)} fee is more than your wallet's USDC balance.`);

  const ready =
    !!token && !!meta && amountWei !== null && !!beneficiary && start !== null && cliff !== null && end !== null && cliff <= end && end > now + 60 && !insufficientToken && !insufficientFee && fee.data !== undefined;

  const approveTx = useTx();
  const createTx = useTx();
  useEffect(() => {
    if (createTx.error) createTx.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenInput, amount, beneficiaryInput, startNow, startDate, cliffDays, cliffCustom, durationDays, durationCustom]);

  const created = useMemo(() => {
    if (!createTx.receipt) return undefined;
    const logs = parseEventLogs({ abi: vestingAbi, logs: createTx.receipt.logs, eventName: "VestingCreated" });
    const ev = logs.find((l) => l.address.toLowerCase() === VESTING_ADDRESS.toLowerCase());
    if (!ev) return undefined;
    const a = ev.args;
    const v: Vesting = { id: a.vestingId, token: a.token, creator: a.creator, beneficiary: a.beneficiary, total: a.total, released: 0n, start: a.start, cliff: a.cliff, end: a.end };
    return v;
  }, [createTx.receipt]);

  if (created) return <Created v={created} meta={meta} now={now} />;

  const preview: Vesting | undefined =
    token && meta && start !== null
      ? {
          id: 0n,
          token,
          creator: account ?? VESTING_ADDRESS,
          beneficiary: beneficiary ?? account ?? VESTING_ADDRESS,
          total: amountWei ?? 0n,
          released: 0n,
          start: BigInt(start),
          cliff: BigInt(cliff ?? start),
          end: BigInt(end && end > start ? end : start + DAY),
        }
      : undefined;

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <form
        className="card stack"
        style={{ gap: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || !token || amountWei === null || !beneficiary || start === null || cliff === null || end === null || fee.data === undefined) return;
          if (needsApproval) {
            approveTx.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [VESTING_ADDRESS, amountWei] });
          } else {
            createTx.writeContract({
              address: VESTING_ADDRESS,
              abi: vestingAbi,
              functionName: "createVesting",
              args: [token, { beneficiary, amount: amountWei, start: BigInt(start), cliff: BigInt(cliff), end: BigInt(end) }],
              value: fee.data,
            });
          }
        }}
      >
        <div className="field">
          <label htmlFor="vtoken">Token contract</label>
          <input id="vtoken" className="input mono" placeholder="0x…" value={tokenInput} onChange={(e) => setTokenInput(e.target.value.trim())} autoComplete="off" spellCheck={false} />
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
        </div>

        <AmountInput label="Total to vest" value={amount} onChange={setAmount} symbol={meta?.symbol} decimals={meta?.decimals} max={balance} disabled={!meta} hint={meta ? "Recorded at the amount the contract actually receives." : "Enter a token first."} />

        <div className="field">
          <label htmlFor="benef">Beneficiary</label>
          <input id="benef" className="input mono" placeholder={account ? `${account} (you)` : "0x…"} value={beneficiaryInput} onChange={(e) => setBeneficiaryInput(e.target.value.trim())} autoComplete="off" spellCheck={false} />
          <div className="hint">Leave empty to vest to your own wallet. Only the beneficiary can claim or reassign this later; you cannot fix a typo.</div>
        </div>

        <div className="field">
          <label>Start</label>
          <div className="presets">
            <button type="button" className={`preset ${startNow ? "on" : ""}`} onClick={() => setStartNow(true)}>
              Now
            </button>
            <button type="button" className={`preset ${!startNow ? "on" : ""}`} onClick={() => setStartNow(false)}>
              Pick a date
            </button>
          </div>
          {!startNow && <input className="input mono" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" />}
          <div className="hint">A past start is allowed: the schedule simply begins partly vested.</div>
        </div>

        <div className="field">
          <label>Cliff</label>
          <div className="presets">
            {CLIFFS.map((c) => (
              <button type="button" key={c.days} className={`preset ${cliffDays === c.days ? "on" : ""}`} onClick={() => setCliffDays(c.days)}>
                {c.label}
              </button>
            ))}
            <button type="button" className={`preset ${cliffDays === null ? "on" : ""}`} onClick={() => setCliffDays(null)}>
              Custom
            </button>
          </div>
          {cliffDays === null && (
            <div className="input-row">
              <input className="input mono" inputMode="numeric" placeholder="Days" value={cliffCustom} onChange={(e) => setCliffCustom(e.target.value.replace(/[^\d]/g, ""))} aria-label="Cliff in days" />
              <div className="input-addon">days</div>
            </div>
          )}
          <div className="hint">Nothing can be claimed before the cliff. At the cliff, the portion already elapsed unlocks at once.</div>
        </div>

        <div className="field">
          <label>Total vesting length</label>
          <div className="presets">
            {DURATIONS.map((d) => (
              <button type="button" key={d.days} className={`preset ${durationDays === d.days ? "on" : ""}`} onClick={() => setDurationDays(d.days)}>
                {d.label}
              </button>
            ))}
            <button type="button" className={`preset ${durationDays === null ? "on" : ""}`} onClick={() => setDurationDays(null)}>
              Custom
            </button>
          </div>
          {durationDays === null && (
            <div className="input-row">
              <input className="input mono" inputMode="numeric" placeholder="Days" value={durationCustom} onChange={(e) => setDurationCustom(e.target.value.replace(/[^\d]/g, ""))} aria-label="Total length in days" />
              <div className="input-addon">days</div>
            </div>
          )}
          {end !== null && start !== null && end > start && (
            <div className="hint">
              Fully vested {new Date(end * 1000).toLocaleDateString()}
              {cliff !== null && cliff > start ? `, first unlock ${new Date(cliff * 1000).toLocaleDateString()}` : ", streaming from the start"}. Dates cannot be changed after creation.
            </div>
          )}
        </div>

        {problems.length > 0 && (
          <div className="notice notice-warn" role="status">
            {problems[0]}
          </div>
        )}

        <div className="panel small stack" style={{ gap: 6 }}>
          <div className="row between">
            <span className="muted">Schedule fee</span>
            <span className="mono">{fee.data !== undefined ? fmtUsdc(fee.data) : "…"}</span>
          </div>
          <div className="row between">
            <span className="muted">Your USDC</span>
            <span className="mono">{native.data ? fmtUsdc(native.data.value) : "…"}</span>
          </div>
          <div className="row between">
            <span className="muted">Approval</span>
            <span className="mono">{!meta || amountWei === null ? "—" : needsApproval ? "Needed" : "Ready"}</span>
          </div>
        </div>

        <TxStatus tx={approveTx} done="Approved. Now create the schedule." />
        <TxStatus tx={createTx} />

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!ready || approveTx.busy || createTx.busy}>
          {approveTx.busy ? "Approving…" : createTx.busy ? "Creating…" : needsApproval ? `Step 1 of 2 · Approve ${meta?.symbol ?? ""}` : meta && amountWei !== null ? `Vest ${fmtAmount(amountWei, meta.decimals)} ${meta.symbol}` : "Create schedule"}
        </button>
        <p className="tiny faint center">Schedules are not revocable. Tokens move into the vesting contract and can only ever go to the beneficiary.</p>
      </form>

      <div className="stack" style={{ position: "sticky", top: 88 }}>
        <div className="eyebrow">Live preview</div>
        {preview ? <VestingCertificate v={preview} meta={meta} now={now} animate={false} caption="Certificate preview" /> : <div className="empty"><p>Enter a token address to preview the certificate.</p></div>}
      </div>
    </div>
  );
}

function Created({ v, meta, now }: { v: Vesting; meta?: { symbol: string; decimals: number; name?: string }; now: number }) {
  const [copied, setCopied] = useState(false);
  const url = vestUrl(v.id);
  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="rise">
        <VestingCertificate v={v} meta={meta} now={now} />
      </div>
      <div className="card stack rise rise-2" style={{ gap: 16 }}>
        <div className="eyebrow">Created</div>
        <h2>The schedule is live.</h2>
        <p className="muted">Vest #{v.id.toString()} is on Arc. Share the link so the beneficiary and your community can follow the unlock.</p>
        <div className="input-row">
          <input className="input mono" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
          <button className="btn btn-soft" type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="row">
          <Link className="btn btn-primary" to={`/vest/${v.id.toString()}`}>Open schedule</Link>
          <Link className="btn btn-ghost" to="/vest/new" onClick={() => window.location.assign("/vest/new")}>Create another</Link>
        </div>
      </div>
    </div>
  );
}

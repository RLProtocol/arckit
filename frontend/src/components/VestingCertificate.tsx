import { Link } from "react-router-dom";
import type { Vesting } from "@/contracts";
import { Dial } from "@/components/Dial";
import { AddressLink } from "@/components/AddressLink";
import { fmtAmount, fmtDate, fmtDateShort, fmtDuration, shortAddr, vestedAt, vestingFraction, vestingStatus, type VestingStatus } from "@/lib/format";
import type { MiniMeta } from "@/hooks/useLocks";

export function VestingPill({ status }: { status: VestingStatus }) {
  const map: Record<VestingStatus, [string, string]> = {
    upcoming: ["Starts soon", "pill-locked"],
    cliff: ["In cliff", "pill-locked"],
    vesting: ["Vesting", "pill-locked"],
    vested: ["Fully vested", "pill-unlocked"],
    claimed: ["Fully claimed", "pill-empty"],
  };
  const [text, cls] = map[status];
  return <span className={`pill ${cls}`}>{text}</span>;
}

/** Stacked bar: claimed (aqua), claimable (accent), still vesting (track). */
export function VestingBar({ v, now }: { v: Vesting; now: number }) {
  const vested = vestedAt(v, now);
  const total = v.total === 0n ? 1n : v.total;
  const pct = (x: bigint) => Number((x * 10_000n) / total) / 100;
  const claimed = pct(v.released);
  const claimable = pct(vested - v.released);
  return (
    <div className="vbar" role="img" aria-label={`${claimed.toFixed(1)}% claimed, ${claimable.toFixed(1)}% claimable`}>
      <span className="vbar-claimed" style={{ width: `${claimed}%` }} />
      <span className="vbar-claimable" style={{ width: `${claimable}%` }} />
    </div>
  );
}

type Meta = MiniMeta & { name?: string };

export function VestingCertificate({ v, meta, now, animate = true, caption }: { v: Vesting; meta?: Meta; now: number; animate?: boolean; caption?: string }) {
  const status = vestingStatus(v, now);
  const frac = vestingFraction(v, now);
  const decimals = meta?.decimals ?? 18;
  const vested = vestedAt(v, now);
  const claimable = vested - v.released;
  const pctText = `${Math.floor(frac * 100)}%`;

  return (
    <div className="cert">
      <div className="cert-head">
        <div>
          <div className="cert-title">{caption ?? "Vesting certificate"}</div>
          <div className="cert-id">ArcVest #{v.id.toString()} · Arc · chain 5042</div>
        </div>
        <VestingPill status={status} />
      </div>

      <div className="cert-body">
        <Dial progress={frac} unlocked={status === "vested" || status === "claimed"} value={pctText} label="vested" animate={animate} />
        <div>
          <div className="cert-amount">
            {fmtAmount(v.total, decimals)}
            <span className="sym">{meta?.symbol ?? "tokens"}</span>
          </div>
          <div className="cert-token">
            {meta?.name ? `${meta.name} · ` : ""}
            <AddressLink addr={v.token} chars={6} />
          </div>
          <div className="cert-status">
            {status === "upcoming" && (
              <>
                Vesting starts <strong>{fmtDate(v.start)}</strong>.
              </>
            )}
            {status === "cliff" && (
              <>
                Cliff ends <strong>{fmtDate(v.cliff)}</strong>, in {fmtDuration(Number(v.cliff) - now)}. Then linear until{" "}
                <strong>{fmtDateShort(v.end)}</strong>.
              </>
            )}
            {status === "vesting" && (
              <>
                Streaming until <strong>{fmtDate(v.end)}</strong>. <strong>{fmtAmount(claimable, decimals)}</strong> {meta?.symbol} claimable now.
              </>
            )}
            {status === "vested" && (
              <>
                Fully vested since <strong>{fmtDate(v.end)}</strong>. <strong>{fmtAmount(claimable, decimals)}</strong> {meta?.symbol} left to claim.
              </>
            )}
            {status === "claimed" && <>Everything has been claimed by the beneficiary.</>}
          </div>
          <VestingBar v={v} now={now} />
          <div className="vbar-legend tiny">
            <span>
              <i className="sw sw-claimed" /> Claimed {fmtAmount(v.released, decimals)}
            </span>
            <span>
              <i className="sw sw-claimable" /> Claimable {fmtAmount(claimable, decimals)}
            </span>
            <span>
              <i className="sw sw-rest" /> Vesting {fmtAmount(v.total - vested, decimals)}
            </span>
          </div>
        </div>
      </div>

      <div className="cert-foot">
        <div>
          <div className="k">Start</div>
          <div className="v">{fmtDate(v.start)}</div>
        </div>
        <div>
          <div className="k">Cliff</div>
          <div className="v">{v.cliff === v.start ? "No cliff" : fmtDate(v.cliff)}</div>
        </div>
        <div>
          <div className="k">End</div>
          <div className="v">{fmtDate(v.end)}</div>
        </div>
        <div>
          <div className="k">Beneficiary</div>
          <div className="v">
            <AddressLink addr={v.beneficiary} chars={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function VestingCard({ v, meta, now }: { v: Vesting; meta?: MiniMeta; now: number }) {
  const status = vestingStatus(v, now);
  const frac = vestingFraction(v, now);
  return (
    <Link to={`/vest/${v.id.toString()}`} className="card card-tight lock-card">
      <Dial small animate={false} progress={frac} unlocked={status === "vested" || status === "claimed"} value={`${Math.floor(frac * 100)}%`} label="vested" />
      <div className="stack" style={{ gap: 6, minWidth: 0 }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="mono tiny faint">Vest #{v.id.toString()}</span>
          <VestingPill status={status} />
        </div>
        <div className="amt">
          {fmtAmount(v.total, meta?.decimals ?? 18)}
          <span className="sym">{meta?.symbol ?? shortAddr(v.token)}</span>
        </div>
        <div className="small muted">
          {status === "upcoming" && `Starts ${fmtDateShort(v.start)}`}
          {status === "cliff" && `Cliff ends ${fmtDateShort(v.cliff)}`}
          {status === "vesting" && `Ends ${fmtDateShort(v.end)}`}
          {status === "vested" && `Vested ${fmtDateShort(v.end)}`}
          {status === "claimed" && "Fully claimed"}
        </div>
      </div>
    </Link>
  );
}

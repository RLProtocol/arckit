import { Link } from "react-router-dom";
import type { Lock } from "@/contracts";
import { Dial } from "@/components/Dial";
import { StatusPill, dialFace } from "@/components/Certificate";
import { fmtAmount, fmtDateShort, lockStatus, progress, shortAddr } from "@/lib/format";
import type { MiniMeta } from "@/hooks/useLocks";

export function LockCard({ lock, meta, now }: { lock: Lock; meta?: MiniMeta; now: number }) {
  const status = lockStatus(lock, now);
  const face = dialFace(status, Number(lock.unlockDate) - now);
  return (
    <Link to={`/lock/${lock.id.toString()}`} className="card card-tight lock-card">
      <Dial
        small
        animate={false}
        progress={progress(lock, now)}
        unlocked={status !== "locked"}
        value={face.value}
        label={status === "locked" ? (face.label === "left" ? "left" : "days") : ""}
      />
      <div className="stack" style={{ gap: 6, minWidth: 0 }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="mono tiny faint">#{lock.id.toString()}</span>
          <StatusPill status={status} />
        </div>
        <div className="amt">
          {fmtAmount(lock.amount, meta?.decimals ?? 18)}
          <span className="sym">{meta?.symbol ?? shortAddr(lock.token)}</span>
        </div>
        <div className="small muted">
          {status === "locked" && `Opens ${fmtDateShort(lock.unlockDate)}`}
          {status === "unlocked" && `Open since ${fmtDateShort(lock.unlockDate)}`}
          {status === "empty" && "Fully withdrawn"}
        </div>
      </div>
    </Link>
  );
}

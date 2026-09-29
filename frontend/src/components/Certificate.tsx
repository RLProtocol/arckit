import type { Lock } from "@/contracts";
import { Dial } from "@/components/Dial";
import { AddressLink } from "@/components/AddressLink";
import { fmtAmount, fmtDate, fmtDateShort, fmtDuration, lockStatus, progress, type LockStatus } from "@/lib/format";
import type { MiniMeta } from "@/hooks/useLocks";

export function StatusPill({ status }: { status: LockStatus }) {
  const text = status === "locked" ? "Locked" : status === "unlocked" ? "Unlocked" : "Withdrawn";
  return <span className={`pill pill-${status}`}>{text}</span>;
}

/** Dial centre for a lock. `secondsLeft` drives days / hours / minutes so short test locks read correctly. */
export function dialFace(status: LockStatus, secondsLeft: number): { value: string; label: string } {
  if (status === "locked") {
    if (secondsLeft >= 86_400) {
      const d = Math.ceil(secondsLeft / 86_400);
      return { value: String(d), label: d === 1 ? "day left" : "days left" };
    }
    if (secondsLeft >= 3_600) return { value: `${Math.ceil(secondsLeft / 3_600)}h`, label: "left" };
    return { value: `${Math.max(1, Math.ceil(secondsLeft / 60))}m`, label: "left" };
  }
  if (status === "unlocked") return { value: "Open", label: "unlocked" };
  return { value: "—", label: "withdrawn" };
}

type Meta = MiniMeta & { name?: string };

export function Certificate({
  lock,
  meta,
  now,
  animate = true,
  caption,
}: {
  lock: Lock;
  meta?: Meta;
  now: number;
  animate?: boolean;
  caption?: string;
}) {
  const status = lockStatus(lock, now);
  const face = dialFace(status, Number(lock.unlockDate) - now);
  const decimals = meta?.decimals ?? 18;
  const term = fmtDuration(Number(lock.unlockDate - lock.lockDate));

  return (
    <div className="cert">
      <div className="cert-head">
        <div>
          <div className="cert-title">{caption ?? "Lock certificate"}</div>
          <div className="cert-id">ArcLock #{lock.id.toString()} · Arc · chain 5042</div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="cert-body">
        <Dial progress={progress(lock, now)} unlocked={status !== "locked"} value={face.value} label={face.label} animate={animate} />
        <div>
          <div className="cert-amount">
            {fmtAmount(lock.amount, decimals)}
            <span className="sym">{meta?.symbol ?? "tokens"}</span>
          </div>
          <div className="cert-token">
            {meta?.name ? `${meta.name} · ` : ""}
            <AddressLink addr={lock.token} chars={6} />
          </div>
          <div className="cert-status">
            {status === "locked" && (
              <>
                Locked for <strong>{term}</strong>. Opens <strong>{fmtDate(lock.unlockDate)}</strong>.
              </>
            )}
            {status === "unlocked" && (
              <>
                Open since <strong>{fmtDate(lock.unlockDate)}</strong>. Only the withdrawer can take the tokens out.
              </>
            )}
            {status === "empty" && (
              <>
                Fully withdrawn. Held from {fmtDateShort(lock.lockDate)} to {fmtDateShort(lock.unlockDate)}.
              </>
            )}
          </div>
        </div>
      </div>

      <div className="cert-foot">
        <div>
          <div className="k">Locked on</div>
          <div className="v">{fmtDate(lock.lockDate)}</div>
        </div>
        <div>
          <div className="k">Unlocks on</div>
          <div className="v">{fmtDate(lock.unlockDate)}</div>
        </div>
        <div>
          <div className="k">Owner</div>
          <div className="v">
            <AddressLink addr={lock.owner} chars={5} />
          </div>
        </div>
        <div>
          <div className="k">Withdrawer</div>
          <div className="v">
            <AddressLink addr={lock.withdrawer} chars={5} />
          </div>
        </div>
      </div>
    </div>
  );
}

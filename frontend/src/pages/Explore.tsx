import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNow } from "@/hooks/useNow";
import { useAllLocks, useTokenMetas } from "@/hooks/useLocks";
import { useAllVestings } from "@/hooks/useVestings";
import { LockCard } from "@/components/LockCard";
import { VestingCard } from "@/components/VestingCertificate";
import { isValidAddress, lockStatus, vestingStatus, type LockStatus, type VestingStatus } from "@/lib/format";

type Mode = "locks" | "vesting";
type LockFilter = "all" | LockStatus;
type VestFilter = "all" | "active" | "vested" | "claimed";

export function Explore() {
  const now = useNow();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("locks");
  const locks = useAllLocks(500);
  const vests = useAllVestings(500);
  const tokens = useMemo(() => [...(locks.locks ?? []).map((l) => l.token), ...(vests.vestings ?? []).map((v) => v.token)], [locks.locks, vests.vestings]);
  const metas = useTokenMetas(tokens);
  const [lockFilter, setLockFilter] = useState<LockFilter>("all");
  const [vestFilter, setVestFilter] = useState<VestFilter>("all");
  const [q, setQ] = useState("");

  const shownLocks = useMemo(() => (locks.locks ?? []).filter((l) => lockFilter === "all" || lockStatus(l, now) === lockFilter), [locks.locks, lockFilter, now]);
  const shownVests = useMemo(
    () =>
      (vests.vestings ?? []).filter((v) => {
        const s: VestingStatus = vestingStatus(v, now);
        if (vestFilter === "all") return true;
        if (vestFilter === "active") return s === "upcoming" || s === "cliff" || s === "vesting";
        return s === vestFilter;
      }),
    [vests.vestings, vestFilter, now],
  );

  const current = mode === "locks" ? locks : vests;
  const list = mode === "locks" ? shownLocks : shownVests;

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Explore</div>
          <h2>{mode === "locks" ? "All locks on Arc" : "All vesting schedules on Arc"}</h2>
          <p className="muted small" style={{ marginTop: 6 }}>
            {current.total !== undefined ? `${current.total} created so far. ` : ""}Newest first.
          </p>
        </div>
        <form
          className="input-row search"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidAddress(q)) navigate(`/token/${q}`);
          }}
        >
          <input className="input mono" placeholder="Token address 0x…" value={q} onChange={(e) => setQ(e.target.value.trim())} aria-label="Token address" />
          <button className="btn btn-soft" type="submit" disabled={!isValidAddress(q)}>View token</button>
        </form>
      </div>

      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="seg" role="tablist" aria-label="Type">
          <button role="tab" aria-selected={mode === "locks"} className={mode === "locks" ? "on" : ""} onClick={() => setMode("locks")}>
            Locks{locks.total !== undefined ? ` · ${locks.total}` : ""}
          </button>
          <button role="tab" aria-selected={mode === "vesting"} className={mode === "vesting" ? "on" : ""} onClick={() => setMode("vesting")}>
            Vesting{vests.total !== undefined ? ` · ${vests.total}` : ""}
          </button>
        </div>
      </div>

      {mode === "locks" ? (
        <div className="tabs" role="tablist">
          {(["all", "locked", "unlocked", "empty"] as LockFilter[]).map((f) => (
            <button key={f} role="tab" aria-selected={lockFilter === f} className={`tab ${lockFilter === f ? "on" : ""}`} onClick={() => setLockFilter(f)}>
              {f === "all" ? "All" : f === "locked" ? "Locked" : f === "unlocked" ? "Unlocked" : "Withdrawn"}
            </button>
          ))}
        </div>
      ) : (
        <div className="tabs" role="tablist">
          {(["all", "active", "vested", "claimed"] as VestFilter[]).map((f) => (
            <button key={f} role="tab" aria-selected={vestFilter === f} className={`tab ${vestFilter === f ? "on" : ""}`} onClick={() => setVestFilter(f)}>
              {f === "all" ? "All" : f === "active" ? "Vesting" : f === "vested" ? "Fully vested" : "Fully claimed"}
            </button>
          ))}
        </div>
      )}

      {current.isError && !(mode === "locks" ? locks.locks : vests.vestings) ? (
        <div className="empty"><p>Arc's RPC is not answering right now, so nothing can be listed. This page retries on its own.</p></div>
      ) : current.isLoading ? (
        <div className="grid-cards">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card card-tight" style={{ height: 128 }} />)}</div>
      ) : list.length > 0 ? (
        <div className="grid-cards">
          {mode === "locks"
            ? shownLocks.map((l) => <LockCard key={l.id.toString()} lock={l} meta={metas.get(l.token.toLowerCase())} now={now} />)
            : shownVests.map((v) => <VestingCard key={v.id.toString()} v={v} meta={metas.get(v.token.toLowerCase())} now={now} />)}
        </div>
      ) : (
        <div className="empty">
          <p>{(mode === "locks" ? locks.locks : vests.vestings)?.length ? "Nothing matches this filter." : mode === "locks" ? "No locks on Arc yet." : "No vesting schedules on Arc yet."}</p>
          <p style={{ marginTop: 12 }}>
            <Link to={mode === "locks" ? "/lock/new" : "/vest/new"} className="btn btn-primary">{mode === "locks" ? "Create a lock" : "Create a schedule"}</Link>
          </p>
        </div>
      )}
    </div>
  );
}

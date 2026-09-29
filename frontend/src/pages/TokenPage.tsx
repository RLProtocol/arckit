import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { Address } from "viem";
import { useNow } from "@/hooks/useNow";
import { useLocksByIds, useTokenLockIds, useTokenMeta } from "@/hooks/useLocks";
import { LockCard } from "@/components/LockCard";
import { AddressLink } from "@/components/AddressLink";
import { fmtAmount, fmtDateShort, isValidAddress, lockStatus } from "@/lib/format";

export function TokenPage() {
  const { address } = useParams();
  const token = address && isValidAddress(address) ? (address as Address) : undefined;
  const now = useNow();
  const { meta, notToken, isLoading: metaLoading } = useTokenMeta(token);
  const ids = useTokenLockIds(token);
  const { locks, isLoading } = useLocksByIds(ids.data);

  const stats = useMemo(() => {
    const list = locks ?? [];
    let locked = 0n;
    let open = 0n;
    let nextUnlock: bigint | undefined;
    for (const l of list) {
      const s = lockStatus(l, now);
      if (s === "locked") {
        locked += l.amount;
        if (nextUnlock === undefined || l.unlockDate < nextUnlock) nextUnlock = l.unlockDate;
      } else if (s === "unlocked") open += l.amount;
    }
    const supply = meta?.totalSupply;
    const pct = supply && supply > 0n ? Number((locked * 10_000n) / supply) / 100 : undefined;
    return { locked, open, nextUnlock, pct, active: list.filter((l) => lockStatus(l, now) === "locked").length };
  }, [locks, now, meta]);

  const sorted = useMemo(
    () =>
      [...(locks ?? [])].sort((a, b) => {
        const sa = lockStatus(a, now);
        const sb = lockStatus(b, now);
        const rank = (s: string) => (s === "locked" ? 0 : s === "unlocked" ? 1 : 2);
        if (rank(sa) !== rank(sb)) return rank(sa) - rank(sb);
        return Number(a.unlockDate - b.unlockDate);
      }),
    [locks, now],
  );

  if (!token) {
    return (
      <div className="wrap page">
        <div className="empty">
          <h3>Not a valid token address</h3>
          <p className="muted">Check the address and try again.</p>
        </div>
      </div>
    );
  }

  const decimals = meta?.decimals ?? 18;

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Token</div>
          <h2>{metaLoading ? "…" : notToken ? "Unknown contract" : `${meta?.name ?? ""} ${meta ? `(${meta.symbol})` : ""}`}</h2>
          <p className="small" style={{ marginTop: 6 }}>
            <AddressLink addr={token} chars={10} />
          </p>
        </div>
        <Link to="/lock/new" className="btn btn-primary">
          Lock {meta?.symbol ?? "this token"}
        </Link>
      </div>

      {notToken && <div className="notice notice-warn" style={{ marginBottom: 20 }}>This address does not respond like an ERC20 token. Locks can still be listed if any exist.</div>}

      <div className="grid-cards" style={{ marginBottom: 32 }}>
        <Stat label="Currently locked" value={`${fmtAmount(stats.locked, decimals)} ${meta?.symbol ?? ""}`} />
        <Stat label="Share of supply locked" value={stats.pct !== undefined ? `${stats.pct.toFixed(2)}%` : "—"} hint={meta?.totalSupply ? `of ${fmtAmount(meta.totalSupply, decimals, 0)} total` : "supply unavailable"} />
        <Stat label="Active locks" value={String(stats.active)} hint={`${(locks ?? []).length} total`} />
        <Stat label="Next unlock" value={stats.nextUnlock ? fmtDateShort(stats.nextUnlock) : "—"} hint={stats.open > 0n ? `${fmtAmount(stats.open, decimals)} already open` : undefined} />
      </div>

      {isLoading || ids.isLoading ? (
        <div className="grid-cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card card-tight" style={{ height: 128 }} />
          ))}
        </div>
      ) : sorted.length > 0 ? (
        <div className="grid-cards">
          {sorted.map((l) => (
            <LockCard key={l.id.toString()} lock={l} meta={meta} now={now} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p>No locks for this token yet.</p>
          <p style={{ marginTop: 12 }}>
            <Link to="/lock/new" className="btn btn-primary">
              Create the first one
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel">
      <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", marginTop: 6, wordBreak: "break-all" }}>{value}</div>
      {hint && <div className="tiny faint" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

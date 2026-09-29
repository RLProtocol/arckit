import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { POSITIONS_ADDRESS, explorerAddress } from "@/contracts";
import { useLockedPositionIds, usePositions } from "@/hooks/useArcFlowV2";
import { usePoolState } from "@/hooks/useArcFlow";
import { PositionCard } from "@/components/flow/ShapePanel";
import { shortAddr } from "@/lib/format";

/** Public, shareable view of one ArcFlow position. For a locked position this is the proof of lock. */
export function FlowPosition() {
  const { id: idParam } = useParams();
  const id = idParam && /^\d+$/.test(idParam) ? BigInt(idParam) : undefined;
  const { rows, isLoading } = usePositions(id !== undefined ? [id] : undefined);
  const row = rows[0];
  const state = usePoolState(row?.p.poolId);
  const slot0 = state.data?.[0] as { status: string; result?: readonly [bigint, number, number, number] } | undefined;
  const tick = slot0?.status === "success" ? slot0.result![1] : undefined;
  const [copied, setCopied] = useState(false);
  const exists = row && row.p.owner !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcFlow position</div>
          <h2>{exists ? (Number(row.p.lockedUntil) * 1000 > Date.now() ? "Liquidity locked on Uniswap v4" : "Liquidity position on Uniswap v4") : "Position"}</h2>
          <p className="muted small" style={{ marginTop: 6 }}>
            Read live from Arc. While a lock is active the contract refuses every attempt to remove this liquidity, including by its owner.
          </p>
        </div>
        <button className="btn btn-soft" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } }}>{copied ? "Link copied" : "Copy link"}</button>
      </div>

      {id === undefined ? (
        <div className="empty"><p>That is not a valid position number.</p></div>
      ) : isLoading ? (
        <div className="card skel" style={{ minHeight: 260 }} />
      ) : !exists ? (
        <div className="empty"><h3>Position #{String(id)} does not exist</h3><p className="muted">Check the link.</p></div>
      ) : (
        <PositionCard row={row} tick={tick} showPool />
      )}

      <p className="tiny faint" style={{ marginTop: 18 }}>
        Contract <a href={explorerAddress(POSITIONS_ADDRESS ?? "")} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{shortAddr(POSITIONS_ADDRESS ?? "", 6)}</a> · <Link to="/flow" style={{ textDecoration: "underline" }}>Open ArcFlow</Link> · <Link to="/flow/locks" style={{ textDecoration: "underline" }}>All locked liquidity</Link>
      </p>
    </div>
  );
}

/** Every position that has ever been locked, newest first. */
export function FlowLocks() {
  const { ids, total, isLoading } = useLockedPositionIds(100);
  const ordered = ids ? [...ids].reverse() : undefined;
  const { rows } = usePositions(ordered);
  return (
    <div className="wrap page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcFlow · locked liquidity</div>
          <h2>Uniswap v4 liquidity locked on Arc</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 620 }}>
            Projects open their pool liquidity through ArcFlow and lock it here. Each entry is read from the chain and links to a public proof page.
          </p>
        </div>
        <Link className="btn btn-primary" to="/flow">Open a position</Link>
      </div>
      {isLoading ? (
        <div className="card skel" style={{ minHeight: 200 }} />
      ) : !total || total === 0n ? (
        <div className="empty"><h3>No liquidity locked yet</h3><p className="muted">Open a position on any USDC pool, then press Lock liquidity.</p></div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>{rows.map((r) => <PositionCard key={String(r.id)} row={r} showPool />)}</div>
      )}
    </div>
  );
}

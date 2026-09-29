import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import type { Hex } from "viem";
import { ARC_USDC, POSITIONS_ADDRESS, erc20Abi, positionsAbi, type PoolKey } from "@/contracts";
import { RANGE_PRESETS, SHAPES, bandPrices, fmtPrice, useMyPositionIds, usePositionLockFee, usePositions, usePreviewLegs, type LegSpec, type PositionRow } from "@/hooks/useArcFlowV2";
import { useTokenAccount, useTokenMeta } from "@/hooks/useLocks";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { TxStatus } from "@/components/TxStatus";
import { AddressLink } from "@/components/AddressLink";
import { dateInputToSec, fmtAmount, fmtDate, fmtDuration, fmtUsdc, nowSec, parseAmount, sameAddr, secToDateInput } from "@/lib/format";

/** Liquidity profile of a set of legs: one bar per distinct tick segment, height = summed weight. */
export function ShapeChart({ legs, tick, height = 84 }: { legs: readonly { tickLower: number; tickUpper: number; weight?: number; liquidity?: bigint }[]; tick?: number; height?: number }) {
  const bars = useMemo(() => {
    if (legs.length === 0) return { segs: [] as { a: number; b: number; h: number }[], lo: 0, hi: 1 };
    const pts = Array.from(new Set(legs.flatMap((l) => [l.tickLower, l.tickUpper]))).sort((a, b) => a - b);
    const maxLiq = legs.reduce((m, l) => (l.liquidity !== undefined && l.liquidity > m ? l.liquidity : m), 0n);
    const wOf = (l: (typeof legs)[number]) => (l.weight !== undefined ? l.weight / ((l.tickUpper - l.tickLower) || 1) : maxLiq > 0n ? Number(((l.liquidity ?? 0n) * 1000n) / maxLiq) : 0);
    const segs = pts.slice(0, -1).map((a, i) => {
      const b = pts[i + 1];
      const h = legs.filter((l) => l.tickLower <= a && l.tickUpper >= b).reduce((s, l) => s + (l.weight !== undefined ? l.weight : wOf(l)), 0);
      return { a, b, h };
    });
    return { segs, lo: pts[0], hi: pts[pts.length - 1] };
  }, [legs]);
  const max = Math.max(1, ...bars.segs.map((s) => s.h));
  const span = bars.hi - bars.lo || 1;
  const x = (t: number) => ((t - bars.lo) / span) * 100;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="shape-chart" role="img" aria-label="Where this position's liquidity sits across the price range">
      {bars.segs.map((s, i) => (
        <rect key={i} x={x(s.a) + 0.3} width={Math.max(0.5, x(s.b) - x(s.a) - 0.6)} y={height - (s.h / max) * (height - 10)} height={(s.h / max) * (height - 10)} rx="0.8" fill="var(--accent)" opacity={0.35 + 0.55 * (s.h / max)} />
      ))}
      {tick !== undefined && tick >= bars.lo && tick <= bars.hi && <line x1={x(tick)} x2={x(tick)} y1="0" y2={height} stroke="var(--aqua)" strokeWidth="0.6" strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Mint a shaped position on this pool, and manage the ones you already hold here. */
export function ShapePanel({ poolKey, poolId, tick, tokenSym, tokenDec }: { poolKey: PoolKey; poolId: Hex; tick?: number; tokenSym: string; tokenDec: number }) {
  const { address: account } = useAccount();
  const usdcIs0 = sameAddr(poolKey.currency0, ARC_USDC);
  const hasUsdc = usdcIs0 || sameAddr(poolKey.currency1, ARC_USDC);
  const [shape, setShape] = useState(1);
  const [ticks, setTicks] = useState(2200);
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const legs = usePreviewLegs(poolKey, shape, ticks);
  const { balance: usdcBal, allowance } = useTokenAccount(ARC_USDC, account, POSITIONS_ADDRESS);
  const wei = parseAmount(amount, 6);
  const needsApproval = wei !== null && allowance !== undefined && allowance < wei;
  const tooMuch = wei !== null && usdcBal !== undefined && wei > usdcBal;
  const approveTx = useTx();
  const mintTx = useTx();

  const myIds = useMyPositionIds(account);
  const { rows } = usePositions(myIds.data as readonly bigint[] | undefined);
  const mine = rows.filter((r) => r.p.poolId.toLowerCase() === poolId.toLowerCase() && !r.p.closed);

  const edge = legs && legs.length ? bandPrices(Math.min(...legs.map((l) => l.tickLower)), Math.max(...legs.map((l) => l.tickUpper)), usdcIs0, tokenDec) : undefined;

  if (!POSITIONS_ADDRESS) return <div className="notice notice-warn">Shaped positions are not deployed for this build.</div>;
  if (!hasUsdc) return <div className="notice">This pool has no USDC side. Shaped positions with USDC-only entry need a USDC pool.</div>;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="field">
        <label>Shape</label>
        <div className="width-grid">
          {SHAPES.map((s) => (
            <button key={s.id} type="button" className={`choice ${shape === s.id ? "on" : ""}`} onClick={() => setShape(s.id)} aria-pressed={shape === s.id}>
              <strong>{s.name}</strong>
              <span className="tiny muted">{s.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Range around the current price</label>
        <div className="presets">
          {RANGE_PRESETS.map((r) => <button type="button" key={r.ticks} className={`preset ${ticks === r.ticks ? "on" : ""}`} onClick={() => setTicks(r.ticks)}>{r.label}</button>)}
        </div>
      </div>

      <div className="panel stack" style={{ gap: 8 }}>
        <div className="row between small">
          <span className="muted">Where your liquidity will sit</span>
          <span className="mono">{edge ? `${fmtPrice(edge[0])} – ${fmtPrice(edge[1])}` : "…"}</span>
        </div>
        <ShapeChart legs={(legs ?? []) as readonly LegSpec[]} tick={tick} />
        <div className="row between tiny faint"><span>lower price</span><span style={{ color: "var(--aqua)" }}>┆ price now</span><span>higher price</span></div>
        <div className="tiny faint">{legs ? `${legs.length} range${legs.length === 1 ? "" : "s"}, minted together in one transaction and managed as one position.` : ""} Taller bars earn more of each trade's fee while the price is inside them. Outside the whole range the position earns nothing until the price returns.</div>
      </div>

      <RequireWallet what="open a position">
        <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (wei === null || tooMuch || !POSITIONS_ADDRESS) return; if (needsApproval) approveTx.writeContract({ address: ARC_USDC, abi: erc20Abi, functionName: "approve", args: [POSITIONS_ADDRESS, wei] }); else mintTx.writeContract({ address: POSITIONS_ADDRESS, abi: positionsAbi, functionName: "mintUsdc", args: [poolKey, shape, ticks, [], wei, BigInt(slip), 1n] }); }}>
          <AmountInput label="USDC to deposit" value={amount} onChange={setAmount} symbol="USDC" decimals={6} max={usdcBal} error={tooMuch ? "More than your USDC balance." : undefined} hint={`The right share is swapped into ${tokenSym} in this pool, then every range is filled. Anything that does not fit is refunded in the same transaction.`} />
          <div className="field">
            <label>Max price move for the internal swap</label>
            <div className="presets">
              {[50, 100, 300].map((s) => <button type="button" key={s} className={`preset ${slip === s ? "on" : ""}`} onClick={() => setSlip(s)}>{s / 100}%</button>)}
            </div>
          </div>
          <TxStatus tx={approveTx} done="Approved. Now open the position." />
          <TxStatus tx={mintTx} done="Position opened. It is listed below." />
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={wei === null || tooMuch || approveTx.busy || mintTx.busy}>
            {approveTx.busy ? "Approving…" : mintTx.busy ? "Opening…" : needsApproval ? "Step 1 of 2 · Approve USDC" : wei ? `Open a ${SHAPES[shape].name} position with ${fmtAmount(wei, 6)} USDC` : "Open position"}
          </button>
        </form>

        {mine.length > 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="divider" />
            <div className="eyebrow">Your positions in this pool</div>
            {mine.map((r) => <PositionCard key={String(r.id)} row={r} tick={tick} />)}
          </div>
        )}
      </RequireWallet>
    </div>
  );
}

/** One position: value, fees, collect / close / lock for its owner; read-only for everyone else. */
export function PositionCard({ row, tick, showPool }: { row: PositionRow; tick?: number; showPool?: boolean }) {
  const { address: account } = useAccount();
  const now = useNow(15_000);
  const usdcIs0 = sameAddr(row.key.currency0, ARC_USDC);
  const tokenAddr = usdcIs0 ? row.key.currency1 : row.key.currency0;
  const { meta } = useTokenMeta(tokenAddr);
  const sym = meta?.symbol ?? "TOKEN";
  const dec = meta?.decimals ?? 18;
  const isOwner = !!account && sameAddr(account, row.p.owner);
  const locked = Number(row.p.lockedUntil) > now;
  const everLocked = row.p.lockedUntil > 0n;
  const usdcSide = usdcIs0 ? row.amount0 : row.amount1;
  const tokenSide = usdcIs0 ? row.amount1 : row.amount0;
  const feeUsdc = usdcIs0 ? row.fees0 : row.fees1;
  const feeToken = usdcIs0 ? row.fees1 : row.fees0;
  const edge = bandPrices(Math.min(...row.legs.map((l) => l.tickLower)), Math.max(...row.legs.map((l) => l.tickUpper)), usdcIs0, dec);

  const lockFee = usePositionLockFee();
  const [lockOpen, setLockOpen] = useState(false);
  const [until, setUntil] = useState(secToDateInput(nowSec() + 30 * 86_400));
  const untilSec = dateInputToSec(until);
  const lockOk = untilSec !== null && untilSec > nowSec() && BigInt(untilSec) > row.p.lockedUntil;
  const collectTx = useTx();
  const closeTx = useTx();
  const lockTx = useTx();
  const w = (tx: ReturnType<typeof useTx>, functionName: string, args: readonly unknown[], value?: bigint) =>
    POSITIONS_ADDRESS && tx.writeContract({ address: POSITIONS_ADDRESS, abi: positionsAbi, functionName: functionName as never, args: args as never, value } as never);

  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <strong>#{String(row.id)} · {SHAPES[row.p.shape]?.name ?? "Custom"}{showPool ? ` · ${sym} / USDC` : ""}</strong>
          {row.p.closed ? <span className="pill pill-empty">Closed</span> : <span className={`pill ${row.inRange ? "pill-live" : "pill-soon"}`}>{row.inRange ? "In range" : "Out of range"}</span>}
          {locked ? <span className="pill pill-locked">Locked until {fmtDate(row.p.lockedUntil)}</span> : everLocked ? <span className="pill pill-unlocked">Lock ended</span> : null}
        </div>
        <Link className="tiny faint" to={`/flow/position/${row.id}`} style={{ textDecoration: "underline" }}>Public page</Link>
      </div>
      <ShapeChart legs={row.legs} tick={tick} height={48} />
      <dl className="ledger">
        <dt>Holds</dt><dd>{fmtAmount(usdcSide, 6, 2)} USDC + {fmtAmount(tokenSide, dec, 2)} {sym}</dd>
        <dt>Range</dt><dd>{fmtPrice(edge[0])} – {fmtPrice(edge[1])}</dd>
        <dt>Uncollected fees</dt><dd style={{ color: feeUsdc + feeToken > 0n ? "var(--aqua)" : undefined }}>{fmtAmount(feeUsdc, 6, 4)} USDC + {fmtAmount(feeToken, dec, 4)} {sym}</dd>
        {!isOwner && <><dt>Owner</dt><dd><AddressLink addr={row.p.owner} chars={6} /></dd></>}
        {locked && <><dt>Unlocks in</dt><dd>{fmtDuration(Number(row.p.lockedUntil) - now)}</dd></>}
      </dl>

      {isOwner && !row.p.closed && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" disabled={collectTx.busy || feeUsdc + feeToken === 0n} onClick={() => w(collectTx, "collect", [row.id])}>{collectTx.busy ? "Collecting…" : "Collect fees"}</button>
            <button className="btn btn-danger btn-sm" disabled={closeTx.busy || locked} onClick={() => w(closeTx, "decrease", [row.id, 10_000n, true, 1000n, 0n, 0n])} title={locked ? "Locked: liquidity cannot be removed until the lock ends" : "Remove all liquidity and receive USDC"}>{closeTx.busy ? "Closing…" : "Close to USDC"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setLockOpen((v) => !v)} aria-expanded={lockOpen}>{everLocked ? "Extend lock" : "Lock liquidity"}</button>
          </div>
          {lockOpen && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="field">
                <label>Lock until</label>
                <input className="input mono" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
                <div className="hint">Until then nobody, including you, can remove this liquidity. Fees stay collectable. {everLocked ? "Extending is free." : `Costs ${lockFee.data !== undefined ? fmtUsdc(lockFee.data as bigint) : "…"} once.`} The public page is your proof to share.</div>
              </div>
              <button className="btn btn-soft btn-sm" disabled={!lockOk || lockTx.busy || (!everLocked && lockFee.data === undefined)} onClick={() => (everLocked ? w(lockTx, "extendLock", [row.id, BigInt(untilSec!)]) : w(lockTx, "lock", [row.id, BigInt(untilSec!)], lockFee.data as bigint))}>{lockTx.busy ? "Locking…" : everLocked ? "Extend the lock" : "Lock this position"}</button>
            </div>
          )}
          <TxStatus tx={collectTx} done="Fees collected." />
          <TxStatus tx={closeTx} done="Position closed." />
          <TxStatus tx={lockTx} done="Locked. Share the public page as proof." />
        </>
      )}
    </div>
  );
}

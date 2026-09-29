import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Hex } from "viem";
import { ARCFLOW_ADDRESS, ARC_USDC, POSITIONS_ADDRESS, VAULT_V2_ADDRESS, arcflowAbi, erc20Abi, explorerAddress, type PoolKey } from "@/contracts";
import { useDexPools, useTrendingPools, usePoolKey, usePoolState, useVaultPool, useVaultUser, usePreviewStake, useVaultPools, hookFlags, dexChartUrl, type DexPool } from "@/hooks/useArcFlow";
import { useTokenAccount, useTokenMeta } from "@/hooks/useLocks";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { TxStatus } from "@/components/TxStatus";
import { AddressLink } from "@/components/AddressLink";
import { StakeV2Panel } from "@/components/flow/StakeV2Panel";
import { ShapePanel } from "@/components/flow/ShapePanel";
import { Link } from "react-router-dom";
import { fmtAmount, fmtDate, fmtDuration, isValidAddress, parseAmount, shortAddr } from "@/lib/format";

const fmtUsd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(n >= 1 ? 2 : 4)}`);
const feePct = (fee: number) => (fee === 0x800000 ? "dynamic" : `${(fee / 10_000).toString()}%`);

export function Flow() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<DexPool | undefined>();
  const search = useDexPools(q.trim());
  const trending = useTrendingPools();
  const list = q.trim().length >= 2 ? search : trending;

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcFlow · liquidity on Uniswap v4</div>
          <h2>Put USDC to work in any pool on Arc.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 680 }}>
            <strong>Stakes</strong>: deposit USDC into a band around the price and earn the pool's swap fees, streamed to you every second.
            {" "}<strong>Pools</strong>: open your own shaped position (spot, curve or bid-ask), collect its fees, and lock it as public proof of liquidity.
          </p>
        </div>
        <Link className="btn btn-ghost" to="/flow/locks">Locked liquidity</Link>
      </div>

      {!ARCFLOW_ADDRESS ? (
        <div className="notice notice-warn">ArcFlow is not deployed for this build.</div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <span className="pill pill-locked">Beta version</span>
        </div>
      )}

      <div className="flow-grid">
        <div className="stack" style={{ gap: 14 }}>
          <form className="input-row" onSubmit={(e) => e.preventDefault()}>
            <input className="input mono" placeholder="Search a token name or paste its address 0x…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pools" />
          </form>
          <div className="row between">
            <span className="eyebrow">{q.trim().length >= 2 ? "Matching pools" : "Active USDC pools"}</span>
            <span className="tiny faint">Uniswap v4 · Arc · via DexScreener</span>
          </div>
          {list.isLoading ? (
            <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="card card-tight" style={{ height: 78 }} />)}</div>
          ) : list.isError ? (
            <div className="empty"><p>Could not load pools from DexScreener. Paste a token address to continue.</p></div>
          ) : (list.data ?? []).length === 0 ? (
            <div className="empty"><p>No Uniswap v4 USDC pool found for that token on Arc.</p></div>
          ) : (
            <div className="stack pool-list" style={{ gap: 8 }}>
              {(list.data ?? []).slice(0, 25).map((p) => (
                <PoolRow key={p.poolId} p={p} selected={selected?.poolId === p.poolId} onSelect={() => setSelected(p)} />
              ))}
            </div>
          )}
          <MyStakes onSelect={(id, key) => setSelected({ poolId: id, base: { symbol: key.currency0.toLowerCase() === ARC_USDC.toLowerCase() ? "token" : "token", name: "", address: key.currency0.toLowerCase() === ARC_USDC.toLowerCase() ? key.currency1 : key.currency0 }, quote: { symbol: "USDC", address: ARC_USDC }, liquidityUsd: 0, volume24h: 0, priceUsd: 0, priceChange24h: 0, txns24h: 0, fdv: 0, url: "" })} />
        </div>

        <div>
          {selected ? (
            <PoolPanel pool={selected} />
          ) : (
            <div className="card stack" style={{ gap: 12 }}>
              <div className="eyebrow">How it works</div>
              <ol className="stack small muted" style={{ paddingLeft: 18, gap: 8 }}>
                <li>Choose a pool on the left. Pools with extra logic attached (hooks) are flagged and explained.</li>
                <li><strong>Stake</strong>: pick a band width and deposit USDC. The vault swaps the right share inside the pool and adds both tokens to a band around the price. A tighter band earns more fees per dollar; when the price leaves it, anyone can recentre it.</li>
                <li>Fees are collected on every stake, unstake and harvest, converted to USDC (1% to the protocol) and streamed to stakers over 7 days. Claim, compound or unstake to USDC at any time.</li>
                <li><strong>Open a position</strong>: choose a shape and range, deposit USDC, and hold the position yourself. Collect fees whenever you like, close to USDC, or lock the liquidity until a date and share the public proof page.</li>
              </ol>
              <div className="divider" />
              <div className="tiny faint">Vault <AddressLink addr={ARCFLOW_ADDRESS ?? ARC_USDC} chars={5} /> · full-range positions on Uniswap v4 PoolManager</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtPrice = (n: number) => (n === 0 ? "—" : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(4)}` : `$${n.toPrecision(3)}`);

function TokenAvatar({ p, size = 36 }: { p: DexPool; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (p.imageUrl && !broken) return <img src={p.imageUrl} width={size} height={size} alt="" onError={() => setBroken(true)} style={{ borderRadius: "50%", flex: "none", background: "var(--navy-700)" }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flex: "none", background: "var(--navy-600)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 500, fontSize: size * 0.38, color: "var(--text-dim)" }}>
      {p.base.symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Change({ v }: { v: number }) {
  const c = v > 0 ? "var(--aqua)" : v < 0 ? "var(--coral)" : "var(--text-dim)";
  return <span style={{ color: c }}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>;
}

function PoolRow({ p, selected, onSelect }: { p: DexPool; selected: boolean; onSelect: () => void }) {
  const { key } = usePoolKey(p.poolId);
  const hooked = key && key.hooks !== "0x0000000000000000000000000000000000000000";
  return (
    <button type="button" onClick={onSelect} className={`card card-tight pool-row ${selected ? "on" : ""}`}>
      <TokenAvatar p={p} />
      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong>{p.base.symbol} / USDC</strong>
          {key && <span className="pill pill-role">{feePct(key.fee)} fee</span>}
          {hooked ? <span className="pill pill-locked">hooked</span> : key ? <span className="pill pill-unlocked">no hook</span> : null}
        </div>
        <div className="tiny muted mono row" style={{ gap: 10 }}>
          <span>{fmtPrice(p.priceUsd)} <Change v={p.priceChange24h} /></span>
          <span>liq {fmtUsd(p.liquidityUsd)}</span>
          <span>vol {fmtUsd(p.volume24h)}</span>
        </div>
      </div>
      <span className="btn btn-sm btn-soft">{selected ? "Selected" : "Select"}</span>
    </button>
  );
}

/** Plain-language explanation of a hook's permission bits. */
function hookExplainer(flags: string[]): { title: string; points: string[] } {
  const has = (f: string) => flags.includes(f);
  const points: string[] = [];
  if (has("afterSwapReturnDelta") || has("beforeSwapReturnDelta")) points.push("It can take an extra cut on every trade in this pool, on top of the pool fee. That lowers the fees left over for stakers.");
  else if (has("afterSwap") || has("beforeSwap")) points.push("It watches every trade. It cannot change trade amounts, but it may record or react to them.");
  if (has("afterAddLiquidityReturnDelta") || has("afterRemoveLiquidityReturnDelta")) points.push("It can adjust the token amounts when liquidity is added or removed, so what you get back on unstake can differ slightly from the pool math.");
  if (has("beforeAddLiquidity")) points.push("It can decide who is allowed to add liquidity. If it refuses the vault, staking will fail with a clear error rather than losing funds.");
  if (has("beforeRemoveLiquidity")) points.push("It can decide when liquidity may be removed. In the worst case a hook could delay or block unstaking from this pool.");
  if (points.length === 0) points.push("Its permissions are limited to observing pool events; it cannot change amounts or block actions.");
  return { title: "This pool has extra logic attached (a Uniswap v4 hook), usually from the launchpad that created the token.", points };
}

function MyStakes({ onSelect }: { onSelect: (id: Hex, key: PoolKey) => void }) {
  const { address } = useAccount();
  const { rows } = useVaultPools(address);
  const mine = rows.filter((r) => r.userShares > 0n && r.info);
  if (!address || mine.length === 0) return null;
  return (
    <div className="card card-tight stack" style={{ gap: 8 }}>
      <div className="eyebrow">Your stakes</div>
      {mine.map((r) => (
        <button key={r.id} type="button" className="row between small" style={{ background: "none", border: "none", padding: "6px 0", textAlign: "left", cursor: "pointer" }} onClick={() => onSelect(r.id, r.info!.key)}>
          <span className="mono">{shortAddr(r.info!.usdcIs0 ? r.info!.key.currency1 : r.info!.key.currency0, 5)} / USDC</span>
          <span className="muted">{r.userShares.toString().slice(0, 8)}… units</span>
        </button>
      ))}
    </div>
  );
}

function PoolPanel({ pool }: { pool: DexPool }) {
  const { key, isLoading } = usePoolKey(pool.poolId);
  if (isLoading) return <div className="card" style={{ minHeight: 320 }} />;
  if (!key) return <div className="card"><div className="notice notice-err">Could not resolve this pool's key on Uniswap v4.</div></div>;
  return <PoolPanelInner pool={pool} poolKey={key} />;
}

function PoolPanelInner({ pool, poolKey }: { pool: DexPool; poolKey: PoolKey }) {
  const { address: account } = useAccount();
  const now = useNow(5_000);
  const id = pool.poolId;
  const usdcIs0 = poolKey.currency0.toLowerCase() === ARC_USDC.toLowerCase();
  const tokenAddr = usdcIs0 ? poolKey.currency1 : poolKey.currency0;
  const { meta } = useTokenMeta(tokenAddr);
  const tokenSym = meta?.symbol ?? pool.base.symbol;
  const tokenDec = meta?.decimals ?? 18;
  const flags = hookFlags(poolKey.hooks);
  const hooked = poolKey.hooks !== "0x0000000000000000000000000000000000000000";

  const state = usePoolState(id);
  const vp = useVaultPool(id);
  const me = useVaultUser(id, account);
  const { balance: usdcBal, allowance } = useTokenAccount(ARC_USDC, account, ARCFLOW_ADDRESS);

  const [tab, setTab] = useState<"stake" | "manage">("stake");
  const [mode, setMode] = useState<"band" | "full" | "shape">("band");
  const [showChart, setShowChart] = useState(false);
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const wei = parseAmount(amount, 6);
  const preview = usePreviewStake(poolKey, wei ?? undefined);
  const minLiq = preview.data ? (preview.data * BigInt(10_000 - slip * 2)) / 10_000n : 0n;
  const needsApproval = wei !== null && allowance !== undefined && allowance < wei;
  const tooMuch = wei !== null && usdcBal !== undefined && wei > usdcBal;

  const approveTx = useTx();
  const stakeTx = useTx();
  const harvestTx = useTx();
  const claimTx = useTx();
  const compoundTx = useTx();
  const unstakeTx = useTx();

  const [unPct, setUnPct] = useState(100);
  const [toUsdc, setToUsdc] = useState(true);
  const unShares = me.shares ? (me.shares * BigInt(unPct)) / 100n : 0n;

  useEffect(() => {
    if (me.shares && me.shares > 0n && tab === "stake" && !amount) setTab("manage");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.shares !== undefined && me.shares > 0n]);

  const streaming = me.periodFinish !== undefined && Number(me.periodFinish) > now;
  const perDay = me.rewardRate ? (me.rewardRate * 86_400n) / 10n ** 18n : 0n;
  const info = vp.data as { totalShares: bigint; totalFeesUsdc: bigint; totalProtocolUsdc: bigint } | undefined;
  const slot0 = (state.data?.[0] as { status: string; result?: readonly [bigint, number, number, number] } | undefined);
  const lpFee = slot0?.status === "success" ? slot0.result![3] : poolKey.fee;

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div className="row between">
        <div className="row" style={{ gap: 12 }}>
          <TokenAvatar p={pool} size={44} />
          <div>
            <div className="eyebrow">Pool</div>
            <h3 style={{ marginTop: 2 }}>{tokenSym} / USDC <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>· {feePct(lpFee)} fee</span></h3>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {hooked ? <span className="pill pill-locked">hooked</span> : <span className="pill pill-unlocked">no hook</span>}
        </div>
      </div>

      {hooked && (() => {
        const ex = hookExplainer(flags);
        return (
          <div className="notice notice-warn small stack" style={{ gap: 6 }}>
            <div><strong>{ex.title}</strong> <span className="faint">Hook <AddressLink addr={poolKey.hooks} chars={4} /></span></div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {ex.points.map((pt, i) => <li key={i}>{pt}</li>)}
            </ul>
            <div className="faint">Your money in this pool is kept separate from every other pool in the vault, so nothing here can touch other stakers.</div>
          </div>
        );
      })()}

      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowChart((v) => !v)} aria-expanded={showChart}>
        {showChart ? "Hide chart" : "Show price chart"}
      </button>
      {showChart && (
        <div className="chart-wrap">
          <iframe
            title={`${tokenSym}/USDC chart`}
            src={dexChartUrl(id)}
            loading="lazy"
            allow="clipboard-write"
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>
      )}
      <div className="row between small pool-stats" style={{ marginTop: -6 }}>
        <span className="row" style={{ gap: 12, rowGap: 4 }}>
          <span><span className="muted">Price</span> <strong>{fmtPrice(pool.priceUsd)}</strong></span>
          <span><span className="muted">24h</span> <Change v={pool.priceChange24h} /></span>
          <span><span className="muted">FDV</span> <strong>{pool.fdv ? fmtUsd(pool.fdv) : "—"}</strong></span>
          <span><span className="muted">24h trades</span> <strong>{pool.txns24h || "—"}</strong></span>
        </span>
        {pool.url && <a className="tiny faint" href={pool.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Open on DexScreener</a>}
      </div>

      <dl className="ledger">
        <dt>Token</dt><dd>{meta?.name ? `${meta.name} · ` : ""}<AddressLink addr={tokenAddr} chars={6} /></dd>
        <dt>Pool liquidity</dt><dd>{pool.liquidityUsd ? fmtUsd(pool.liquidityUsd) : "—"} · 24h volume {pool.volume24h ? fmtUsd(pool.volume24h) : "—"}</dd>
        {mode === "full" && <><dt>Vault in this pool</dt><dd>{info ? `${info.totalShares.toString().slice(0, 10)}… liquidity units · ${fmtAmount(info.totalFeesUsdc, 6)} USDC fees harvested lifetime` : "—"}</dd>
        <dt>Streaming now</dt><dd>{streaming ? `${fmtAmount(perDay, 6)} USDC / day to all stakers · ends ${fmtDate(me.periodFinish!)}` : "no active stream · press Harvest after trades happen"}</dd></>}
      </dl>

      <div className="seg seg-wide" role="tablist" aria-label="What to do in this pool">
        <button type="button" role="tab" aria-selected={mode === "band"} className={mode === "band" ? "on" : ""} onClick={() => setMode("band")}>Stake · band</button>
        <button type="button" role="tab" aria-selected={mode === "full"} className={mode === "full" ? "on" : ""} onClick={() => setMode("full")}>Stake · full range</button>
        <button type="button" role="tab" aria-selected={mode === "shape"} className={mode === "shape" ? "on" : ""} onClick={() => setMode("shape")}>Open a position</button>
      </div>
      {mode === "band" && <StakeV2Panel poolKey={poolKey} tokenSym={tokenSym} tokenDec={tokenDec} />}
      {mode === "shape" && <ShapePanel poolKey={poolKey} poolId={id} tick={slot0?.status === "success" ? slot0.result![1] : undefined} tokenSym={tokenSym} tokenDec={tokenDec} />}
      {mode === "full" && (
      <RequireWallet what="stake into this pool">
      <div className="notice small" style={{ marginBottom: 12 }}>Full range never leaves the market and never needs a rebalance, but earns several times less per dollar than a band. This is the original ArcFlow vault.</div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "stake"} className={`tab ${tab === "stake" ? "on" : ""}`} onClick={() => setTab("stake")}>Stake USDC</button>
        <button role="tab" aria-selected={tab === "manage"} className={`tab ${tab === "manage" ? "on" : ""}`} onClick={() => setTab("manage")}>Your position {me.shares && me.shares > 0n ? "·" : ""}</button>
      </div>

      {tab === "stake" && (
        <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (wei === null || tooMuch || !ARCFLOW_ADDRESS) return; if (needsApproval) approveTx.writeContract({ address: ARC_USDC, abi: erc20Abi, functionName: "approve", args: [ARCFLOW_ADDRESS, wei] }); else stakeTx.writeContract({ address: ARCFLOW_ADDRESS, abi: arcflowAbi, functionName: "stakeUsdc", args: [poolKey, wei, BigInt(slip), minLiq] }); }}>
          <AmountInput label="USDC to stake" value={amount} onChange={setAmount} symbol="USDC" decimals={6} max={usdcBal} error={tooMuch ? "More than your USDC balance." : undefined} hint="Half is swapped to the token in this pool; both sides become one full-range position." />
          <div className="field">
            <label>Max slippage for the internal swap</label>
            <div className="presets">
              {[50, 100, 300, 500].map((s) => <button type="button" key={s} className={`preset ${slip === s ? "on" : ""}`} onClick={() => setSlip(s)}>{s / 100}%</button>)}
            </div>
          </div>
          <div className="panel small stack" style={{ gap: 6 }}>
            <div className="row between"><span className="muted">Expected liquidity units</span><span className="mono">{preview.data ? preview.data.toString().slice(0, 12) + "…" : "—"}</span></div>
            <div className="row between"><span className="muted">Minimum accepted</span><span className="mono">{minLiq ? minLiq.toString().slice(0, 12) + "…" : "—"}</span></div>
            <div className="row between"><span className="muted">Pool swap fee on the converted half</span><span className="mono">{wei ? `≈ ${fmtAmount((wei / 2n) * BigInt(lpFee === 0x800000 ? 0 : lpFee) / 1_000_000n, 6)} USDC` : "—"}</span></div>
            <div className="row between"><span className="muted">Approval</span><span className="mono">{wei === null ? "—" : needsApproval ? "Needed" : "Ready"}</span></div>
          </div>
          <TxStatus tx={approveTx} done="Approved. Now stake." />
          <TxStatus tx={stakeTx} done="Staked. Your position appears under Your position." />
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={wei === null || tooMuch || approveTx.busy || stakeTx.busy}>
            {approveTx.busy ? "Approving…" : stakeTx.busy ? "Staking…" : needsApproval ? "Step 1 of 2 · Approve USDC" : wei ? `Stake ${fmtAmount(wei, 6)} USDC` : "Stake"}
          </button>
        </form>
      )}

      {tab === "manage" && (
        <div className="stack" style={{ gap: 14 }}>
          {!me.shares || me.shares === 0n ? (
            <div className="empty"><p>You have no position in this pool yet.</p></div>
          ) : (
            <>
              <div className="grid-cards position-grid">
                <div className="panel">
                  <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Your position</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 6 }}>{fmtAmount(usdcIs0 ? me.amount0 ?? 0n : me.amount1 ?? 0n, 6)} USDC</div>
                  <div className="small muted">+ {fmtAmount(usdcIs0 ? me.amount1 ?? 0n : me.amount0 ?? 0n, tokenDec)} {tokenSym}</div>
                  <div className="tiny faint mono" style={{ marginTop: 6 }}>{me.shares.toString().slice(0, 14)}… units</div>
                </div>
                <div className="panel">
                  <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Claimable now</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 6, color: "var(--aqua)" }}>{fmtAmount(me.pending ?? 0n, 6, 6)} USDC</div>
                  <div className="small muted">{streaming ? `streaming · ${fmtDuration(Number(me.periodFinish) - now)} left` : "stream ended"}</div>
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary" disabled={!me.pending || me.pending === 0n || claimTx.busy || !ARCFLOW_ADDRESS} onClick={() => claimTx.writeContract({ address: ARCFLOW_ADDRESS!, abi: arcflowAbi, functionName: "claim", args: [id] })}>{claimTx.busy ? "Claiming…" : "Claim USDC"}</button>
                <button className="btn btn-soft" disabled={!me.pending || me.pending === 0n || compoundTx.busy || !ARCFLOW_ADDRESS} onClick={() => compoundTx.writeContract({ address: ARCFLOW_ADDRESS!, abi: arcflowAbi, functionName: "compound", args: [id, BigInt(slip), 0n] })}>{compoundTx.busy ? "Compounding…" : "Compound"}</button>
                <button className="btn btn-ghost" disabled={harvestTx.busy || !ARCFLOW_ADDRESS} onClick={() => harvestTx.writeContract({ address: ARCFLOW_ADDRESS!, abi: arcflowAbi, functionName: "harvest", args: [id] })} title="Realise the pool's accrued fees and start/extend the stream. Anyone can call this.">{harvestTx.busy ? "Harvesting…" : "Harvest fees"}</button>
              </div>
              <TxStatus tx={claimTx} done="Claimed." />
              <TxStatus tx={compoundTx} done="Compounded into your position." />
              <TxStatus tx={harvestTx} done="Harvested. Fees are now streaming." />

              <div className="divider" />
              <div className="field">
                <label>Unstake</label>
                <div className="presets">
                  {[25, 50, 75, 100].map((p) => <button type="button" key={p} className={`preset ${unPct === p ? "on" : ""}`} onClick={() => setUnPct(p)}>{p === 100 ? "All" : `${p}%`}</button>)}
                </div>
                <label className="toggle" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={toUsdc} onChange={(e) => setToUsdc(e.target.checked)} />
                  Receive USDC only (swaps the {tokenSym} side in-pool, {slip / 100}% max slippage)
                </label>
              </div>
              <TxStatus tx={unstakeTx} done="Unstaked." />
              <button className="btn btn-danger btn-block" disabled={unShares === 0n || unstakeTx.busy || !ARCFLOW_ADDRESS} onClick={() => unstakeTx.writeContract({ address: ARCFLOW_ADDRESS!, abi: arcflowAbi, functionName: "unstake", args: [id, unShares, toUsdc, BigInt(slip), 0n, 0n] })}>
                {unstakeTx.busy ? "Unstaking…" : `Unstake ${unPct === 100 ? "everything" : `${unPct}%`}${toUsdc ? " as USDC" : " as both tokens"}`}
              </button>
              <p className="tiny faint">Unstaking also claims nothing automatically: claim your streamed USDC separately. Rewards already streaming keep flowing to your remaining shares.</p>
            </>
          )}
        </div>
      )}
      </RequireWallet>
      )}

      {(() => {
        const c = mode === "band" ? { name: "Stakes vault", addr: VAULT_V2_ADDRESS, note: "1% of harvested fees to the protocol · 0.5% bounty to whoever harvests" } : mode === "shape" ? { name: "Positions contract", addr: POSITIONS_ADDRESS, note: "1% of collected fees to the protocol · positions are yours alone" } : { name: "Full-range vault", addr: ARCFLOW_ADDRESS, note: "1% of harvested fees to the protocol" };
        return (
          <div className="tiny faint">
            {c.name} <a href={explorerAddress(c.addr ?? "")} target="_blank" rel="noreferrer" style={{ borderBottom: "1px dotted var(--text-faint)" }}>{shortAddr(c.addr ?? "", 5)}</a> · pool id <span className="mono">{shortAddr(id, 6)}</span> · {c.note}
          </div>
        );
      })()}
    </div>
  );
}

// keep isValidAddress import used for future manual pool entry
void isValidAddress;

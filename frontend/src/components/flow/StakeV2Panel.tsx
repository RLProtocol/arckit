import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Hex } from "viem";
import { ARC_USDC, VAULT_V2_ADDRESS, erc20Abi, vaultV2Abi, type PoolKey } from "@/contracts";
import { WIDTHS, bandPrices, fmtPrice, tickToUsdcPrice, useStrategy, useStrategyIds, useVaultV2Params } from "@/hooks/useArcFlowV2";
import { useTokenAccount } from "@/hooks/useLocks";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { TxStatus } from "@/components/TxStatus";
import { fmtAmount, fmtDuration, parseAmount } from "@/lib/format";
import { fmtApr } from "@/hooks/useStaking";

const REBALANCE_DELAY = 600;
const POKE_TTL = 7200;

/** Concentrated "deposit USDC and earn" for one pool: pick a band width, stake, claim, rebalance. */
export function StakeV2Panel({ poolKey, tokenSym, tokenDec }: { poolKey: PoolKey; tokenSym: string; tokenDec: number }) {
  const { address: account } = useAccount();
  const now = useNow(5_000);
  const usdcIs0 = poolKey.currency0.toLowerCase() === ARC_USDC.toLowerCase();
  const [width, setWidth] = useState(1);
  const sids = useStrategyIds(poolKey);
  const sid = sids?.[width] as Hex | undefined;
  const st = useStrategy(poolKey, width, sid, account);
  const params = useVaultV2Params();
  const { balance: usdcBal, allowance } = useTokenAccount(ARC_USDC, account, VAULT_V2_ADDRESS);

  const [tab, setTab] = useState<"stake" | "manage">("stake");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const [unPct, setUnPct] = useState(100);
  const [toUsdc, setToUsdc] = useState(true);
  const wei = parseAmount(amount, 6);
  const needsApproval = wei !== null && allowance !== undefined && allowance < wei;
  const tooMuch = wei !== null && usdcBal !== undefined && wei > usdcBal;
  const overCap = wei !== null && !!params.capUsdc && st.info !== undefined && st.info.netDepositedUsdc + wei > params.capUsdc;

  const approveTx = useTx();
  const stakeTx = useTx();
  const claimTx = useTx();
  const compoundTx = useTx();
  const harvestTx = useTx();
  const unstakeTx = useTx();
  const pokeTx = useTx();
  const rebalanceTx = useTx();
  const idleTx = useTx();

  const hasShares = !!st.shares && st.shares > 0n;
  useEffect(() => {
    if (hasShares && !amount) setTab("manage");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShares, width]);

  const band = st.tickLower !== undefined && st.tickUpper !== undefined ? bandPrices(st.tickLower, st.tickUpper, usdcIs0, tokenDec) : undefined;
  const price = st.tick !== undefined && st.exists ? tickToUsdcPrice(st.tick, usdcIs0, tokenDec) : undefined;
  const outOfRange = st.exists && st.inRange === false;
  const pokedAt = Number(st.info?.pokedAt ?? 0n);
  const pokeLive = pokedAt > 0 && now <= pokedAt + POKE_TTL;
  const rebalanceReadyIn = pokeLive ? Math.max(0, pokedAt + REBALANCE_DELAY - now) : 0;
  const idle = st.info ? st.info.idle0 > 0n || st.info.idle1 > 0n : false;
  const unShares = st.shares ? (st.shares * BigInt(unPct)) / 100n : 0n;
  const w = (tx: ReturnType<typeof useTx>, functionName: string, args: readonly unknown[]) =>
    VAULT_V2_ADDRESS && tx.writeContract({ address: VAULT_V2_ADDRESS, abi: vaultV2Abi, functionName: functionName as never, args: args as never });

  if (!VAULT_V2_ADDRESS) return <div className="notice notice-warn">Concentrated stakes are not deployed for this build.</div>;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="field">
        <label>Band width</label>
        <div className="width-grid">
          {WIDTHS.map((x) => (
            <button key={x.id} type="button" className={`choice ${width === x.id ? "on" : ""}`} onClick={() => setWidth(x.id)} aria-pressed={width === x.id}>
              <strong>{x.name} <span className="muted" style={{ fontWeight: 400 }}>{x.approx}</span></strong>
              <span className="tiny muted">{x.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-cards position-grid">
        <div className="panel">
          <div className="kicker">APR from the running stream</div>
          <div className="big" style={{ color: "var(--aqua)" }}>{st.exists ? (st.aprBps && st.aprBps > 0n ? fmtApr(st.aprBps) : "—") : "new band"}</div>
          <div className="small muted">
            {st.exists
              ? st.streamRemaining && st.streamRemaining > 0n
                ? `${fmtAmount(st.streamRemaining, 6, 4)} USDC still streaming to stakers`
                : "no stream yet: it starts with the first harvest after trades"
              : "be the first staker in this band"}
          </div>
        </div>
        <div className="panel">
          <div className="kicker">Band</div>
          <div className="big">{band ? `${fmtPrice(band[0])} – ${fmtPrice(band[1])}` : "—"}</div>
          <div className="small muted row" style={{ gap: 8 }}>
            {st.exists ? <span className={`pill ${st.inRange ? "pill-live" : "pill-locked"}`}>{st.inRange ? "In range" : "Out of range"}</span> : null}
            <span>{price ? `price ${fmtPrice(price)}` : "centred on the current price"}{st.tvlUsdc !== undefined && st.exists ? ` · TVL ${fmtAmount(st.tvlUsdc, 6, 2)} USDC` : ""}</span>
          </div>
        </div>
      </div>

      {outOfRange && (
        <div className="notice notice-warn small stack" style={{ gap: 8 }}>
          <div><strong>The price has left this band, so it is not earning fees right now.</strong> Anyone can recentre it. To stop a one-block price spike from triggering that, it takes two steps: flag it, then rebalance 10 minutes later if the price is still out of range.</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {!pokeLive ? (
              <button className="btn btn-soft btn-sm" disabled={pokeTx.busy} onClick={() => w(pokeTx, "poke", [sid])}>{pokeTx.busy ? "Flagging…" : "1 · Flag as out of range"}</button>
            ) : rebalanceReadyIn > 0 ? (
              <span className="mono">Flagged. Rebalance opens in {fmtDuration(rebalanceReadyIn)}.</span>
            ) : (
              <button className="btn btn-primary btn-sm" disabled={rebalanceTx.busy} onClick={() => w(rebalanceTx, "rebalance", [sid, 100n])}>{rebalanceTx.busy ? "Rebalancing…" : "2 · Rebalance now"}</button>
            )}
          </div>
          <TxStatus tx={pokeTx} done="Flagged. Come back in 10 minutes to rebalance." />
          <TxStatus tx={rebalanceTx} done="Band recentred on the current price." />
        </div>
      )}
      {!outOfRange && idle && (
        <div className="notice small row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span>Part of this band is waiting idle after a rebalance in a thin pool. It belongs to stakers pro-rata and can be put to work 1% at a time.</span>
          <button className="btn btn-soft btn-sm" disabled={idleTx.busy} onClick={() => w(idleTx, "deployIdle", [sid, 100n])}>{idleTx.busy ? "Working…" : "Put idle balance to work"}</button>
          <TxStatus tx={idleTx} done="Idle balance added to the band." />
        </div>
      )}

      <RequireWallet what="stake into this band">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "stake"} className={`tab ${tab === "stake" ? "on" : ""}`} onClick={() => setTab("stake")}>Stake USDC</button>
          <button role="tab" aria-selected={tab === "manage"} className={`tab ${tab === "manage" ? "on" : ""}`} onClick={() => setTab("manage")}>Your position{hasShares ? " ·" : ""}</button>
        </div>

        {tab === "stake" && (
          params.paused ? <div className="notice notice-warn">New deposits are paused. Withdrawals and claims still work.</div> : (
            <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (wei === null || tooMuch || overCap || !VAULT_V2_ADDRESS) return; if (needsApproval) approveTx.writeContract({ address: ARC_USDC, abi: erc20Abi, functionName: "approve", args: [VAULT_V2_ADDRESS, wei] }); else w(stakeTx, "stake", [poolKey, width, wei, BigInt(slip), 1n]); }}>
              <AmountInput label="USDC to stake" value={amount} onChange={setAmount} symbol="USDC" decimals={6} max={usdcBal} error={tooMuch ? "More than your USDC balance." : overCap ? `This band's beta cap is ${fmtAmount(params.capUsdc!, 6, 0)} USDC.` : undefined} hint={`The vault swaps the right share into ${tokenSym} inside this pool and adds both to the band. Anything that does not fit comes straight back.`} />
              <div className="field">
                <label>Max price move for the internal swap</label>
                <div className="presets">
                  {[50, 100, 300].map((s) => <button type="button" key={s} className={`preset ${slip === s ? "on" : ""}`} onClick={() => setSlip(s)}>{s / 100}%</button>)}
                </div>
                <div className="hint">In a thin pool a large deposit can hit this limit. The swap then stops, the part that fits is staked, and the rest is refunded.</div>
              </div>
              <TxStatus tx={approveTx} done="Approved. Now stake." />
              <TxStatus tx={stakeTx} done="Staked. Your position is under Your position." />
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={wei === null || tooMuch || overCap || approveTx.busy || stakeTx.busy}>
                {approveTx.busy ? "Approving…" : stakeTx.busy ? "Staking…" : needsApproval ? "Step 1 of 2 · Approve USDC" : wei ? `Stake ${fmtAmount(wei, 6)} USDC · ${WIDTHS[width].name}` : "Stake"}
              </button>
            </form>
          )
        )}

        {tab === "manage" && (
          !hasShares ? <div className="empty"><p>You have no stake in the {WIDTHS[width].name.toLowerCase()} band of this pool.</p></div> : (
            <div className="stack" style={{ gap: 14 }}>
              <div className="grid-cards position-grid">
                <div className="panel">
                  <div className="kicker">Your stake</div>
                  <div className="big">{fmtAmount(st.valueUsdc ?? 0n, 6, 2)} USDC</div>
                  <div className="small muted">{fmtAmount((usdcIs0 ? st.amount0 : st.amount1) ?? 0n, 6, 2)} USDC + {fmtAmount((usdcIs0 ? st.amount1 : st.amount0) ?? 0n, tokenDec, 2)} {tokenSym}</div>
                </div>
                <div className="panel">
                  <div className="kicker">Claimable now</div>
                  <div className="big" style={{ color: "var(--aqua)" }}>{fmtAmount(st.pending ?? 0n, 6, 6)} USDC</div>
                  <div className="small muted">streams every second for 7 days after each harvest</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" disabled={!st.pending || st.pending === 0n || claimTx.busy} onClick={() => w(claimTx, "claim", [sid])}>{claimTx.busy ? "Claiming…" : "Claim USDC"}</button>
                <button className="btn btn-soft" disabled={!st.pending || st.pending === 0n || compoundTx.busy || !!params.paused} onClick={() => w(compoundTx, "compound", [sid, BigInt(slip), 1n])}>{compoundTx.busy ? "Compounding…" : "Compound"}</button>
                <button className="btn btn-ghost" disabled={harvestTx.busy} onClick={() => w(harvestTx, "harvest", [sid])} title="Staking, unstaking and compounding already harvest. Calling it directly pays you a small bounty.">{harvestTx.busy ? "Harvesting…" : `Harvest${params.bountyBps ? ` (+${Number(params.bountyBps) / 100}% bounty)` : ""}`}</button>
              </div>
              <TxStatus tx={claimTx} done="Claimed." />
              <TxStatus tx={compoundTx} done="Compounded into your stake." />
              <TxStatus tx={harvestTx} done="Harvested. Fees are streaming." />

              <div className="divider" />
              <div className="field">
                <label>Unstake</label>
                <div className="presets">
                  {[25, 50, 75, 100].map((p) => <button type="button" key={p} className={`preset ${unPct === p ? "on" : ""}`} onClick={() => setUnPct(p)}>{p === 100 ? "All" : `${p}%`}</button>)}
                </div>
                <label className="toggle" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={toUsdc} onChange={(e) => setToUsdc(e.target.checked)} />
                  Receive USDC only (swaps the {tokenSym} side in this pool, up to a 10% price move; any unfilled part arrives as {tokenSym})
                </label>
              </div>
              <TxStatus tx={unstakeTx} done="Unstaked." />
              <button className="btn btn-danger btn-block" disabled={unShares === 0n || unstakeTx.busy} onClick={() => w(unstakeTx, "unstake", [sid, unShares, toUsdc, 1000n, 0n, 0n])}>
                {unstakeTx.busy ? "Unstaking…" : `Unstake ${unPct === 100 ? "everything" : `${unPct}%`}${toUsdc ? " as USDC" : " as both tokens"}`}
              </button>
              <p className="tiny faint">Unstaking is never paused. Claim your streamed USDC separately; it keeps accruing until you do.</p>
            </div>
          )
        )}
      </RequireWallet>
    </div>
  );
}

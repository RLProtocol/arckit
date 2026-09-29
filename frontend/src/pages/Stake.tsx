import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useNavigate, useParams } from "react-router-dom";
import { parseEventLogs, type Address } from "viem";
import { STAKING_ADDRESS, stakingAbi, erc20Abi, explorerAddress, type StakingPool } from "@/contracts";
import { useAllStakingPools, useCreateFee, useCreatorPoolIds, useStakingLive, useUserPoolIds, fmtApr, projectedAprPct, YEAR } from "@/hooks/useStaking";
import { useTokenAccount, useTokenMeta, useTokenMetas } from "@/hooks/useLocks";
import { useTokenImages } from "@/hooks/useTokenImages";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { RequireWallet } from "@/components/RequireWallet";
import { AmountInput } from "@/components/AmountInput";
import { TxStatus } from "@/components/TxStatus";
import { AddressLink } from "@/components/AddressLink";
import { DAY, fmtAmount, fmtDate, fmtDuration, fmtUsdc, isValidAddress, parseAmount, sameAddr, shortAddr, dateInputToSec, secToDateInput, nowSec } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const DURATIONS = [3, 7, 14, 30, 60, 90];
const PENALTIES = [5, 10, 20];

type Status = "upcoming" | "live" | "ended" | "paused";
function statusOf(p: StakingPool, now: number): Status {
  if (now >= Number(p.periodFinish)) return "ended";
  if (now < Number(p.cfg.startTime)) return "upcoming";
  if (p.paused) return "paused";
  return "live";
}
/** Same math as the contract's currentAprBps, done locally so the list does not need one RPC call per row. */
function aprBpsOf(p: StakingPool, now: number): bigint {
  if (p.totalStaked === 0n || now >= Number(p.periodFinish)) return 0n;
  const perYear = (p.rewardRate * YEAR) / 10n ** 18n;
  return (perYear * 10_000n) / p.totalStaked;
}
function remainingOf(p: StakingPool, now: number): bigint {
  if (now >= Number(p.periodFinish)) return 0n;
  const from = Math.max(now, Number(p.cfg.startTime));
  return (BigInt(Number(p.periodFinish) - from) * p.rewardRate) / 10n ** 18n;
}
const pct = (bps: number) => `${(bps / 100).toString()}%`;

/** Token logo from DexScreener when one exists, otherwise the first letters of the symbol. */
export function TokenAvatar({ src, symbol, size = 40 }: { src?: string; symbol?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} width={size} height={size} alt="" loading="lazy" onError={() => setBroken(true)} className="stake-avatar stake-avatar-img" style={{ width: size, height: size }} />;
  }
  return <div className="stake-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}>{(symbol ?? "?").slice(0, 3).toUpperCase()}</div>;
}

function StatusPill({ s }: { s: Status }) {
  const cls = s === "live" ? "pill-live" : s === "ended" ? "pill-empty" : s === "paused" ? "pill-locked" : "pill-soon";
  const text = s === "live" ? "Live" : s === "ended" ? "Ended" : s === "paused" ? "Paused" : "Starts soon";
  return <span className={`pill ${cls}`}>{text}</span>;
}

export function Stake() {
  const { address } = useAccount();
  const now = useNow(10_000);
  const navigate = useNavigate();
  const params = useParams<{ id?: string; token?: string }>();
  const tokenParam = params.token && isValidAddress(params.token) ? (params.token as Address) : undefined;
  const selected = params.id && /^\d+$/.test(params.id) ? BigInt(params.id) : undefined;
  const [q, setQ] = useState(tokenParam ?? "");
  const [filter, setFilter] = useState<"all" | "live" | "mine" | "created">("all");
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (tokenParam) setQ(tokenParam); }, [tokenParam]);

  const all = useAllStakingPools();
  const mine = useUserPoolIds(address);
  const created = useCreatorPoolIds(address);
  const tokens = useMemo(() => (all.pools ?? []).flatMap((p) => [p.cfg.stakeToken, p.cfg.rewardToken]), [all.pools]);
  const metas = useTokenMetas(tokens);
  const images = useTokenImages(tokens);

  const rows = useMemo(() => {
    const ids = all.ids ?? [];
    const list = (all.pools ?? []).map((p, i) => ({ id: ids[i], p }));
    const mineSet = new Set((mine.data ?? []).map(String));
    const createdSet = new Set((created.data ?? []).map(String));
    const needle = q.trim().toLowerCase();
    return list.filter(({ id, p }) => {
      if (filter === "live" && statusOf(p, now) !== "live") return false;
      if (filter === "mine" && !mineSet.has(String(id))) return false;
      if (filter === "created" && !createdSet.has(String(id))) return false;
      if (!needle) return true;
      const sm = metas.get(p.cfg.stakeToken.toLowerCase());
      const rm = metas.get(p.cfg.rewardToken.toLowerCase());
      return (
        p.cfg.name.toLowerCase().includes(needle) ||
        p.cfg.stakeToken.toLowerCase().includes(needle) ||
        p.cfg.rewardToken.toLowerCase().includes(needle) ||
        (sm?.symbol.toLowerCase().includes(needle) ?? false) ||
        (rm?.symbol.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [all.pools, all.ids, mine.data, created.data, q, filter, now, metas]);

  const pick = (id: bigint) => { setCreating(false); navigate(`/stake/${id}`); };
  const { meta: tokenMeta } = useTokenMeta(tokenParam);
  // /stake/token/:address with no pool chosen: open the first live pool for that token
  useEffect(() => {
    if (!tokenParam || selected !== undefined || creating || !all.pools || !all.ids) return;
    const list = all.pools.map((p, i) => ({ id: all.ids![i], p })).filter(({ p }) => sameAddr(p.cfg.stakeToken, tokenParam));
    const first = list.find(({ p }) => statusOf(p, now) === "live") ?? list[0];
    if (first) navigate(`/stake/${first.id}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam, selected, all.pools, all.ids]);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Arc Staking</div>
          <h2>Stake tokens. Earn more of them.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 640 }}>
            Projects open a pool by choosing how long it runs and depositing the rewards. Stakers share those rewards
            second by second, in proportion to what they stake. The APR is calculated for you from those two numbers.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreating(true); navigate("/stake"); }}>Create a pool</button>
      </div>

      {!STAKING_ADDRESS && <div className="notice notice-warn">Staking is not deployed for this build.</div>}
      {tokenParam && (
        <div className="notice small row" style={{ marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
          <TokenAvatar src={images[tokenParam.toLowerCase()]} symbol={tokenMeta?.symbol} size={28} />
          <span>
            Showing staking pools for <strong>{tokenMeta?.symbol ?? shortAddr(tokenParam, 6)}</strong>
            {tokenMeta?.name ? ` (${tokenMeta.name})` : ""} · <AddressLink addr={tokenParam} chars={6} />
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(""); navigate("/stake"); }}>Show all pools</button>
        </div>
      )}

      <div className="flow-grid">
        <div className="stack" style={{ gap: 14 }}>
          <form className="input-row" onSubmit={(e) => e.preventDefault()}>
            <input className="input mono" placeholder="Search a pool name, token symbol or address 0x…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pools" />
          </form>
          <div className="row between">
            <div className="seg" role="tablist" aria-label="Filter pools">
              {(["all", "live", "mine", "created"] as const).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "live" ? "Live" : f === "mine" ? "My stakes" : "Created by me"}
                </button>
              ))}
            </div>
            <span className="tiny faint">{all.total !== undefined ? `${all.total} pool${all.total === 1 ? "" : "s"}` : ""}</span>
          </div>

          {all.isLoading ? (
            <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="card card-tight skel" style={{ height: 84 }} />)}</div>
          ) : all.isError ? (
            <div className="empty"><p>Could not read pools from Arc right now. Try again in a moment.</p></div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <p>{filter === "mine" ? "You have not staked in any pool yet." : filter === "created" ? "You have not created a pool yet." : all.total === 0 ? "No staking pools yet. Be the first to open one." : "No pool matches that search."}</p>
            </div>
          ) : (
            <div className="stack pool-list" style={{ gap: 8 }}>
              {rows.map(({ id, p }) => (
                <PoolRow key={String(id)} id={id} p={p} now={now} metas={metas} image={images[p.cfg.stakeToken.toLowerCase()]} selected={selected === id} onSelect={() => pick(id)} />
              ))}
            </div>
          )}
        </div>

        <div>
          {creating ? (
            <RequireWallet what="create a staking pool">
              <CreatePool onCreated={(id) => pick(id)} onCancel={() => setCreating(false)} />
            </RequireWallet>
          ) : selected !== undefined ? (
            <PoolPanel id={selected} metas={metas} images={images} />
          ) : (
            <div className="card stack" style={{ gap: 12 }}>
              <div className="eyebrow">How it works</div>
              <ol className="stack small muted" style={{ paddingLeft: 18, gap: 8 }}>
                <li><strong>Creators</strong> pick a duration (3, 7, 30 days or anything from an hour to four years), deposit the reward tokens up front and choose whether early withdrawals pay a penalty. One fee in USDC, nothing else to configure.</li>
                <li><strong>Rewards stream every second</strong> from start to finish. Each staker earns their share of that stream for as long as they stay. Fewer stakers means a higher APR for each of them.</li>
                <li><strong>Stakers</strong> claim any time, compound when the reward is the staked token, or unstake. If the creator enabled a penalty, leaving before the end costs that percentage of the withdrawn amount and the rest of the pool receives it. After the end date, withdrawals are always free.</li>
                <li><strong>Nothing is locked away from stakers.</strong> Creators can add rewards or extend the period, but can only take back rewards that nobody earned, and only after the pool ends.</li>
              </ol>
              <div className="divider" />
              <div className="tiny faint">Contract <AddressLink addr={STAKING_ADDRESS ?? ZERO} chars={5} /> · immutable · pays out only what was deposited</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Metas = ReturnType<typeof useTokenMetas>;

/**
 * Claimable rewards, ticking every second. Between chain reads (every 10 s) the value is
 * extrapolated from the staker's share of the pool's per-second rate, then snaps to the exact
 * on-chain figure when the next read lands. Never extrapolates past the pool's end.
 */
function LiveEarned({ earned, updatedAt, staked, p, decimals, symbol }: { earned?: bigint; updatedAt?: number; staked: bigint; p: StakingPool; decimals: number; symbol: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;
  if (earned === undefined) return <>— {symbol}</>;
  let shown = earned;
  if (updatedAt && p.totalStaked > 0n && staked > 0n && !p.paused) {
    const from = Math.max(Math.floor(updatedAt / 1000), Number(p.cfg.startTime));
    const to = Math.min(Math.floor(Date.now() / 1000), Number(p.periodFinish));
    if (to > from) shown += (p.rewardRate * BigInt(to - from) * staked) / p.totalStaked / 10n ** 18n;
  }
  return <>{fmtAmount(shown, decimals, decimals >= 6 ? 6 : decimals)} {symbol}</>;
}

function PoolRow({ id, p, now, metas, image, selected, onSelect }: { id: bigint; p: StakingPool; now: number; metas: Metas; image?: string; selected: boolean; onSelect: () => void }) {
  const sm = metas.get(p.cfg.stakeToken.toLowerCase());
  const rm = metas.get(p.cfg.rewardToken.toLowerCase());
  const same = sameAddr(p.cfg.stakeToken, p.cfg.rewardToken);
  const s = statusOf(p, now);
  const apr = aprBpsOf(p, now);
  return (
    <button type="button" onClick={onSelect} className={`card card-tight pool-row stake-row ${selected ? "on" : ""}`}>
      <TokenAvatar src={image} symbol={sm?.symbol} />
      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.cfg.name || `Pool #${id}`}</strong>
          <StatusPill s={s} />
          {p.cfg.penaltyBps > 0 && <span className="pill pill-role">{pct(p.cfg.penaltyBps)} early exit</span>}
        </div>
        <div className="tiny muted mono row" style={{ gap: 10, rowGap: 2 }}>
          <span>stake {sm?.symbol ?? shortAddr(p.cfg.stakeToken, 4)} → earn {same ? "more" : rm?.symbol ?? shortAddr(p.cfg.rewardToken, 4)}</span>
          <span>TVL {fmtAmount(p.totalStaked, sm?.decimals ?? 18, 2)}</span>
          <span>{s === "ended" ? `ended ${fmtDate(p.periodFinish)}` : s === "upcoming" ? `starts in ${fmtDuration(Number(p.cfg.startTime) - now)}` : `${fmtDuration(Number(p.periodFinish) - now)} left`}</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
        <span className="tiny faint">{same ? "APR" : "rewards left"}</span>
        <strong style={{ color: s === "live" ? "var(--aqua)" : "var(--text-dim)", fontFamily: "var(--font-display)", fontSize: 18 }}>
          {s === "ended" ? "Ended" : same ? (p.totalStaked === 0n ? "∞" : fmtApr(apr)) : fmtAmount(remainingOf(p, now), rm?.decimals ?? 18, 0)}
        </strong>
      </div>
    </button>
  );
}

// ------------------------------------------------------------------
//                         POOL PANEL
// ------------------------------------------------------------------

function PoolPanel({ id, metas, images }: { id: bigint; metas: Metas; images: Record<string, string> }) {
  const { address: account } = useAccount();
  const now = useNow(5_000);
  const pool = useAllStakingPoolsOne(id);
  const exists = useStakingPoolExists(id);
  if (exists === false || (pool && pool.creator === ZERO)) {
    return (
      <div className="card">
        <div className="empty">
          <h3>Pool #{String(id)} does not exist</h3>
          <p className="muted">Check the link, or pick a pool from the list.</p>
        </div>
      </div>
    );
  }
  if (!pool) return <div className="card skel" style={{ minHeight: 320 }} />;
  return <PoolPanelInner id={id} p={pool} metas={metas} account={account} now={now} image={images[pool.cfg.stakeToken.toLowerCase()]} />;
}

import { useStakingPool, useStakingPoolExists } from "@/hooks/useStaking";
function useAllStakingPoolsOne(id: bigint) {
  const q = useStakingPool(id);
  return q.data as StakingPool | undefined;
}

function ShareButtons({ id, p, sSym, rSym, same, aprBps }: { id: bigint; p: StakingPool; sSym: string; rSym: string; same: boolean; aprBps: bigint }) {
  const [copied, setCopied] = useState<"pool" | "token" | null>(null);
  const url = `${window.location.origin}/stake/${id}`;
  const tokenUrl = `${window.location.origin}/stake/token/${p.cfg.stakeToken}`;
  const text = same
    ? `Stake ${sSym} on Arc and earn more ${sSym}${aprBps > 0n ? ` · ${fmtApr(aprBps)} APR right now` : ""}. Pool ends ${fmtDate(p.periodFinish)}.`
    : `Stake ${sSym} on Arc and earn ${rSym}. Pool ends ${fmtDate(p.periodFinish)}.`;
  const copy = async (u: string, which: "pool" | "token") => {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Copy this link", u);
    }
  };
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn btn-soft btn-sm" onClick={() => copy(url, "pool")}>{copied === "pool" ? "Link copied" : "Copy pool link"}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(tokenUrl, "token")} title="Always opens the live pool for this token, even after this one ends">{copied === "token" ? "Link copied" : "Copy token link"}</button>
      <a className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>Share on X</a>
    </div>
  );
}

function PoolPanelInner({ id, p, metas, account, now, image }: { id: bigint; p: StakingPool; metas: Metas; account?: Address; now: number; image?: string }) {
  const same = sameAddr(p.cfg.stakeToken, p.cfg.rewardToken);
  const { meta: stakeMeta } = useTokenMeta(p.cfg.stakeToken);
  const { meta: rewardMeta } = useTokenMeta(same ? undefined : p.cfg.rewardToken);
  const sSym = stakeMeta?.symbol ?? metas.get(p.cfg.stakeToken.toLowerCase())?.symbol ?? "TOKEN";
  const sDec = stakeMeta?.decimals ?? metas.get(p.cfg.stakeToken.toLowerCase())?.decimals ?? 18;
  const rSym = same ? sSym : rewardMeta?.symbol ?? metas.get(p.cfg.rewardToken.toLowerCase())?.symbol ?? "REWARD";
  const rDec = same ? sDec : rewardMeta?.decimals ?? metas.get(p.cfg.rewardToken.toLowerCase())?.decimals ?? 18;
  const s = statusOf(p, now);
  const live = useStakingLive(id, account);
  const { balance, allowance } = useTokenAccount(p.cfg.stakeToken, account, STAKING_ADDRESS);
  const isCreator = !!account && sameAddr(account, p.creator);

  const [tab, setTab] = useState<"stake" | "position" | "manage">("stake");
  useEffect(() => {
    if (live.staked && live.staked > 0n && tab === "stake") setTab("position");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.staked !== undefined && live.staked > 0n]);

  // ---- stake form
  const [amount, setAmount] = useState("");
  const wei = parseAmount(amount, sDec);
  const needsApproval = wei !== null && allowance !== undefined && allowance < wei;
  const tooMuch = wei !== null && balance !== undefined && wei > balance;
  const belowMin = wei !== null && p.cfg.minStake > 0n && wei + (live.staked ?? 0n) < p.cfg.minStake;
  const aboveMax = wei !== null && p.cfg.maxStakePerWallet > 0n && wei + (live.staked ?? 0n) > p.cfg.maxStakePerWallet;
  const full = wei !== null && p.cfg.maxTotalStaked > 0n && p.totalStaked + wei > p.cfg.maxTotalStaked;
  const formErr = tooMuch ? `More than your ${sSym} balance.` : belowMin ? `Minimum stake is ${fmtAmount(p.cfg.minStake, sDec)} ${sSym}.` : aboveMax ? `Per-wallet maximum is ${fmtAmount(p.cfg.maxStakePerWallet, sDec)} ${sSym}.` : full ? "That would exceed the pool's total cap." : undefined;
  const aprAfter = wei ? aprBpsOf({ ...p, totalStaked: p.totalStaked + wei }, now) : undefined;
  const apr = aprBpsOf(p, now);

  const approveTx = useTx();
  const stakeTx = useTx();
  const claimTx = useTx();
  const compoundTx = useTx();
  const unstakeTx = useTx();
  const exitTx = useTx();

  // ---- position
  const [unPct, setUnPct] = useState(100);
  const staked = live.staked ?? 0n;
  const unAmount = (staked * BigInt(unPct)) / 100n;
  const penaltyOn = p.cfg.penaltyBps > 0 && now < Number(p.periodFinish);
  const unPenalty = penaltyOn ? (unAmount * BigInt(p.cfg.penaltyBps)) / 10_000n : 0n;
  const exitPenalty = penaltyOn ? (staked * BigInt(p.cfg.penaltyBps)) / 10_000n : 0n;
  const perDay = p.totalStaked > 0n && s === "live" ? (p.rewardRate * 86_400n * staked) / p.totalStaked / 10n ** 18n : 0n;

  const write = (tx: ReturnType<typeof useTx>, fn: "stake" | "unstake" | "claim" | "exit" | "compound", args: readonly bigint[]) =>
    STAKING_ADDRESS && tx.writeContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: fn, args: args as never });

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <TokenAvatar src={image} symbol={sSym} size={52} />
          <div>
            <div className="eyebrow">Pool #{String(id)}</div>
            <h3 style={{ marginTop: 2 }}>{p.cfg.name || `${sSym} staking`}</h3>
            <div className="small muted" style={{ marginTop: 4 }}>Stake {sSym} · earn {same ? `more ${sSym}` : rSym}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <StatusPill s={s} />
          {p.cfg.penaltyBps > 0 && <span className="pill pill-role">{pct(p.cfg.penaltyBps)} early exit</span>}
        </div>
      </div>

      <ShareButtons id={id} p={p} sSym={sSym} rSym={rSym} same={same} aprBps={apr} />

      <div className="grid-cards position-grid">
        <div className="panel">
          <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>{same ? "APR now" : "Rewards per day"}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginTop: 6, color: "var(--aqua)" }}>
            {s === "ended" ? "Ended" : same ? (p.totalStaked === 0n ? "∞" : fmtApr(apr)) : `${fmtAmount((p.rewardRate * 86_400n) / 10n ** 18n, rDec, 2)} ${rSym}`}
          </div>
          <div className="small muted">{s === "ended" ? `${fmtAmount(p.claimedTotal, rDec, 2)} ${rSym} paid out to stakers` : p.totalStaked === 0n ? "nobody staked yet: the first staker takes the whole stream" : `shared by ${String(p.stakers)} staker${p.stakers === 1n ? "" : "s"}`}</div>
        </div>
        <div className="panel">
          <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Total staked</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginTop: 6 }}>{fmtAmount(p.totalStaked, sDec, 2)} <span className="muted" style={{ fontSize: 14 }}>{sSym}</span></div>
          <div className="small muted">{fmtAmount(live.rewardsRemaining ?? remainingOf(p, now), rDec, 2)} {rSym} still to be paid out</div>
        </div>
      </div>

      <dl className="ledger">
        <dt>Runs</dt><dd>{fmtDate(p.cfg.startTime)} → {fmtDate(p.periodFinish)} · {fmtDuration(Number(p.periodFinish) - Number(p.cfg.startTime))}{s === "live" ? ` · ${fmtDuration(Number(p.periodFinish) - now)} left` : ""}</dd>
        <dt>Early exit</dt><dd>{p.cfg.penaltyBps > 0 ? `${pct(p.cfg.penaltyBps)} of the withdrawn amount before ${fmtDate(p.periodFinish)}; ${same ? "it goes to the stakers who stay" : "it goes to the pool creator"}. Free after the end.` : "no penalty, withdraw any time"}</dd>
        <dt>Stake token</dt><dd>{stakeMeta?.name ? `${stakeMeta.name} · ` : ""}<AddressLink addr={p.cfg.stakeToken} chars={6} /></dd>
        {!same && <><dt>Reward token</dt><dd>{rewardMeta?.name ? `${rewardMeta.name} · ` : ""}<AddressLink addr={p.cfg.rewardToken} chars={6} /></dd></>}
        <dt>Rewards deposited</dt><dd>{fmtAmount(p.totalRewardsAdded, rDec, 2)} {rSym} · {fmtAmount(p.claimedTotal, rDec, 2)} claimed so far</dd>
        {(p.cfg.minStake > 0n || p.cfg.maxStakePerWallet > 0n || p.cfg.maxTotalStaked > 0n) && (
          <><dt>Limits</dt><dd>{[p.cfg.minStake > 0n && `min ${fmtAmount(p.cfg.minStake, sDec)}`, p.cfg.maxStakePerWallet > 0n && `max ${fmtAmount(p.cfg.maxStakePerWallet, sDec)} per wallet`, p.cfg.maxTotalStaked > 0n && `cap ${fmtAmount(p.cfg.maxTotalStaked, sDec)} total`].filter(Boolean).join(" · ")} {sSym}</dd></>
        )}
        <dt>Creator</dt><dd><AddressLink addr={p.creator} chars={6} />{isCreator ? " (you)" : ""}</dd>
      </dl>

      <RequireWallet what="stake in this pool">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "stake"} className={`tab ${tab === "stake" ? "on" : ""}`} onClick={() => setTab("stake")}>Stake</button>
          <button role="tab" aria-selected={tab === "position"} className={`tab ${tab === "position" ? "on" : ""}`} onClick={() => setTab("position")}>Your position{staked > 0n ? " ·" : ""}</button>
          {isCreator && <button role="tab" aria-selected={tab === "manage"} className={`tab ${tab === "manage" ? "on" : ""}`} onClick={() => setTab("manage")}>Manage</button>}
        </div>

        {tab === "stake" && (
          s === "ended" ? <div className="notice">This pool has ended. Existing stakers can still claim and unstake for free.</div>
          : s === "paused" ? <div className="notice notice-warn">The creator paused new stakes. Claims and withdrawals still work.</div>
          : s === "upcoming" ? <div className="notice">Staking opens {fmtDate(p.cfg.startTime)}.</div>
          : (
            <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (wei === null || formErr || !STAKING_ADDRESS) return; if (needsApproval) approveTx.writeContract({ address: p.cfg.stakeToken, abi: erc20Abi, functionName: "approve", args: [STAKING_ADDRESS, wei] }); else write(stakeTx, "stake", [id, wei]); }}>
              <AmountInput label={`${sSym} to stake`} value={amount} onChange={setAmount} symbol={sSym} decimals={sDec} max={balance} error={formErr} hint={p.cfg.penaltyBps > 0 ? `Withdrawing before ${fmtDate(p.periodFinish)} costs ${pct(p.cfg.penaltyBps)} of the amount withdrawn.` : "Withdraw any time, no penalty."} />
              <div className="panel small stack" style={{ gap: 6 }}>
                {same ? (
                  <div className="row between"><span className="muted">Your APR after staking</span><span className="mono" style={{ color: "var(--aqua)" }}>{wei ? fmtApr(aprAfter) : "—"}</span></div>
                ) : (
                  <div className="row between"><span className="muted">Your share of the daily {rSym}</span><span className="mono">{wei ? `${fmtAmount((p.rewardRate * 86_400n * wei) / (p.totalStaked + wei) / 10n ** 18n, rDec, 4)} / day` : "—"}</span></div>
                )}
                <div className="row between"><span className="muted">Earned by the end if nothing changes</span><span className="mono">{wei ? `≈ ${fmtAmount((BigInt(Math.max(0, Number(p.periodFinish) - Math.max(now, Number(p.cfg.startTime)))) * p.rewardRate * wei) / (p.totalStaked + wei) / 10n ** 18n, rDec, 4)} ${rSym}` : "—"}</span></div>
                <div className="row between"><span className="muted">Approval</span><span className="mono">{wei === null ? "—" : needsApproval ? "Needed" : "Ready"}</span></div>
              </div>
              <TxStatus tx={approveTx} done="Approved. Now stake." />
              <TxStatus tx={stakeTx} done="Staked. Rewards start accruing right away." />
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={wei === null || !!formErr || approveTx.busy || stakeTx.busy}>
                {approveTx.busy ? "Approving…" : stakeTx.busy ? "Staking…" : needsApproval ? `Step 1 of 2 · Approve ${sSym}` : wei ? `Stake ${fmtAmount(wei, sDec)} ${sSym}` : "Stake"}
              </button>
            </form>
          )
        )}

        {tab === "position" && (
          staked === 0n ? <div className="empty"><p>You have nothing staked in this pool.</p></div> : (
            <div className="stack" style={{ gap: 14 }}>
              <div className="grid-cards position-grid">
                <div className="panel">
                  <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Staked</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 6 }}>{fmtAmount(staked, sDec)} {sSym}</div>
                  <div className="small muted">{p.totalStaked > 0n ? `${(Number((staked * 10_000n) / p.totalStaked) / 100).toFixed(2)}% of the pool` : ""}{live.firstStakeAt ? ` · since ${fmtDate(live.firstStakeAt)}` : ""}</div>
                </div>
                <div className="panel">
                  <div className="tiny mono faint" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>Claimable now</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 6, color: "var(--aqua)", fontVariantNumeric: "tabular-nums" }}><LiveEarned earned={live.earned} updatedAt={live.dataUpdatedAt} staked={staked} p={p} decimals={rDec} symbol={rSym} /></div>
                  <div className="small muted">{s === "live" ? `+ ${fmtAmount(perDay, rDec, 4)} ${rSym} / day at the current pool size` : s === "ended" ? "pool ended · no more accrual" : "not accruing right now"}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary" disabled={!live.earned || live.earned === 0n || claimTx.busy} onClick={() => write(claimTx, "claim", [id])}>{claimTx.busy ? "Claiming…" : `Claim ${rSym}`}</button>
                {same && <button className="btn btn-soft" disabled={!live.earned || live.earned === 0n || compoundTx.busy || s === "paused" || s === "ended"} onClick={() => write(compoundTx, "compound", [id])} title="Stake your earned rewards on top of your position in one transaction.">{compoundTx.busy ? "Compounding…" : "Compound"}</button>}
              </div>
              <TxStatus tx={claimTx} done="Claimed." />
              <TxStatus tx={compoundTx} done="Compounded into your stake." />

              <div className="divider" />
              <div className="field">
                <label>Unstake</label>
                <div className="presets">
                  {[25, 50, 75, 100].map((x) => <button type="button" key={x} className={`preset ${unPct === x ? "on" : ""}`} onClick={() => setUnPct(x)}>{x === 100 ? "All" : `${x}%`}</button>)}
                </div>
              </div>
              <div className="panel small stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">Withdrawing</span><span className="mono">{fmtAmount(unAmount, sDec)} {sSym}</span></div>
                <div className="row between"><span className="muted">Early exit penalty</span><span className="mono" style={{ color: unPenalty > 0n ? "var(--coral)" : undefined }}>{unPenalty > 0n ? `− ${fmtAmount(unPenalty, sDec)} ${sSym} (${pct(p.cfg.penaltyBps)})` : "none"}</span></div>
                <div className="row between"><strong>You receive</strong><strong className="mono">{fmtAmount(unAmount - unPenalty, sDec)} {sSym}</strong></div>
                {penaltyOn && <div className="tiny faint">The penalty disappears after {fmtDate(p.periodFinish)} ({fmtDuration(Number(p.periodFinish) - now)} from now).</div>}
              </div>
              <TxStatus tx={unstakeTx} done="Unstaked. Your earned rewards stay claimable." />
              <TxStatus tx={exitTx} done="Exited: stake withdrawn and rewards claimed." />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-danger" disabled={unAmount === 0n || unstakeTx.busy} onClick={() => write(unstakeTx, "unstake", [id, unAmount])}>{unstakeTx.busy ? "Unstaking…" : `Unstake ${unPct === 100 ? "all" : `${unPct}%`}`}</button>
                <button className="btn btn-ghost" disabled={exitTx.busy} onClick={() => write(exitTx, "exit", [id])} title="Withdraw everything and claim rewards in one transaction.">{exitTx.busy ? "Exiting…" : `Exit (claim + unstake all${exitPenalty > 0n ? `, −${fmtAmount(exitPenalty, sDec, 2)} penalty` : ""})`}</button>
              </div>
            </div>
          )
        )}

        {tab === "manage" && isCreator && <ManagePanel id={id} p={p} s={s} rSym={rSym} rDec={rDec} account={account!} />}
      </RequireWallet>

      <div className="tiny faint">Contract <a href={explorerAddress(STAKING_ADDRESS ?? "")} target="_blank" rel="noreferrer" style={{ borderBottom: "1px dotted var(--text-faint)" }}>{shortAddr(STAKING_ADDRESS ?? "", 5)}</a> · rewards can only be paid from what the creator deposited · stakes are never touched by anyone but you</div>
    </div>
  );
}

// ------------------------------------------------------------------
//                         CREATOR TOOLS
// ------------------------------------------------------------------

function ManagePanel({ id, p, s, rSym, rDec, account }: { id: bigint; p: StakingPool; s: Status; rSym: string; rDec: number; account: Address }) {
  const { balance, allowance } = useTokenAccount(p.cfg.rewardToken, account, STAKING_ADDRESS);
  const [add, setAdd] = useState("");
  const [extDays, setExtDays] = useState("7");
  const [extRewards, setExtRewards] = useState("");
  const addWei = parseAmount(add, rDec);
  const extWei = extRewards.trim() ? parseAmount(extRewards, rDec) : 0n;
  const extSec = Math.round(Number(extDays) * DAY);
  const approveTx = useTx();
  const addTx = useTx();
  const extTx = useTx();
  const pauseTx = useTx();
  const reclaimTx = useTx();
  const w = (tx: ReturnType<typeof useTx>, fn: "addRewards" | "extendPool" | "setPaused" | "reclaimUndistributed", args: unknown[]) =>
    STAKING_ADDRESS && tx.writeContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: fn, args: args as never });
  const approve = (amt: bigint) => STAKING_ADDRESS && approveTx.writeContract({ address: p.cfg.rewardToken, abi: erc20Abi, functionName: "approve", args: [STAKING_ADDRESS, amt] });
  const unearned = p.rewardReserve - (p.accruedTotal - p.claimedTotal);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="notice small">You created this pool. You can top up rewards, extend it, pause new stakes, and after it ends take back any rewards nobody earned. You can never touch stakers' deposits or what they already earned.</div>

      {s !== "ended" && (
        <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (!addWei) return; if (allowance !== undefined && allowance < addWei) approve(addWei); else w(addTx, "addRewards", [id, addWei]); }}>
          <div className="eyebrow">Add rewards</div>
          <AmountInput label={`${rSym} to add`} value={add} onChange={setAdd} symbol={rSym} decimals={rDec} max={balance} maxLabel="Wallet" hint="Spread over the time that is left. The end date does not move, so the APR rises." />
          <TxStatus tx={approveTx} done="Approved. Submit again to add." />
          <TxStatus tx={addTx} done="Rewards added." />
          <button className="btn btn-primary" type="submit" disabled={!addWei || addTx.busy || approveTx.busy}>{approveTx.busy ? "Approving…" : addTx.busy ? "Adding…" : allowance !== undefined && addWei && allowance < addWei ? `Approve ${rSym}` : "Add rewards"}</button>
        </form>
      )}

      <div className="divider" />
      <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); if (!extSec || extWei === null) return; if (extWei > 0n && allowance !== undefined && allowance < extWei) approve(extWei); else w(extTx, "extendPool", [id, BigInt(extSec), extWei]); }}>
        <div className="eyebrow">Extend the pool</div>
        <div className="grid-2">
          <div className="field">
            <label>Extra days</label>
            <input className="input mono" inputMode="decimal" value={extDays} onChange={(e) => setExtDays(e.target.value)} />
            <div className="hint">{s === "ended" ? "Restarts the pool from now for this long." : `New end: ${fmtDate(Number(p.periodFinish) + extSec)}`}</div>
          </div>
          <AmountInput label={`Extra ${rSym} (optional)`} value={extRewards} onChange={setExtRewards} symbol={rSym} decimals={rDec} max={balance} maxLabel="Wallet" />
        </div>
        <div className="tiny faint">Rewards not yet earned are re-spread over the new, longer period together with anything you add.</div>
        <TxStatus tx={extTx} done="Pool extended." />
        <button className="btn btn-soft" type="submit" disabled={!extSec || extWei === null || extTx.busy || approveTx.busy}>{extWei && extWei > 0n && allowance !== undefined && allowance < extWei ? `Approve ${rSym}` : "Extend"}</button>
      </form>

      <div className="divider" />
      <div className="row between" style={{ gap: 10 }}>
        <div>
          <div className="eyebrow">New stakes</div>
          <div className="small muted">{p.paused ? "Paused: nobody can stake more. Claims and withdrawals still work." : "Open."}</div>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={pauseTx.busy} onClick={() => w(pauseTx, "setPaused", [id, !p.paused])}>{pauseTx.busy ? "…" : p.paused ? "Resume stakes" : "Pause stakes"}</button>
      </div>
      <TxStatus tx={pauseTx} done={p.paused ? "Stakes resumed." : "Stakes paused."} />

      <div className="divider" />
      <div className="row between" style={{ gap: 10 }}>
        <div>
          <div className="eyebrow">Reclaim undistributed rewards</div>
          <div className="small muted">{s === "ended" ? `About ${fmtAmount(unearned > 0n ? unearned : 0n, rDec, 4)} ${rSym} was never earned (time with nobody staked).` : `Available after ${fmtDate(p.periodFinish)}.`}</div>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={s !== "ended" || reclaimTx.busy} onClick={() => w(reclaimTx, "reclaimUndistributed", [id])}>{reclaimTx.busy ? "…" : "Reclaim"}</button>
      </div>
      <TxStatus tx={reclaimTx} done="Reclaimed." />
    </div>
  );
}

// ------------------------------------------------------------------
//                         CREATE WIZARD
// ------------------------------------------------------------------

function CreatePool({ onCreated, onCancel }: { onCreated: (id: bigint) => void; onCancel: () => void }) {
  const { address: account } = useAccount();
  const fee = useCreateFee();
  const [name, setName] = useState("");
  const [stakeIn, setStakeIn] = useState("");
  const [sameToken, setSameToken] = useState(true);
  const [rewardIn, setRewardIn] = useState("");
  const [days, setDays] = useState<number>(30);
  const [customDays, setCustomDays] = useState("");
  const [rewards, setRewards] = useState("");
  const [penaltyOn, setPenaltyOn] = useState(true);
  const [penalty, setPenalty] = useState(10);
  const [customPenalty, setCustomPenalty] = useState("");
  const [startLater, setStartLater] = useState(false);
  const [startAt, setStartAt] = useState(secToDateInput(nowSec() + 3600));
  const [advanced, setAdvanced] = useState(false);
  const [minStake, setMinStake] = useState("");
  const [maxWallet, setMaxWallet] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [expectTvl, setExpectTvl] = useState("");

  const stakeToken = isValidAddress(stakeIn.trim()) ? (stakeIn.trim() as Address) : undefined;
  const rewardToken = sameToken ? stakeToken : isValidAddress(rewardIn.trim()) ? (rewardIn.trim() as Address) : undefined;
  const { meta: sMeta, notToken: sBad } = useTokenMeta(stakeToken);
  const { meta: rMetaRaw, notToken: rBad } = useTokenMeta(sameToken ? undefined : rewardToken);
  const rMeta = sameToken ? sMeta : rMetaRaw;
  const { balance, allowance } = useTokenAccount(rewardToken, account, STAKING_ADDRESS);

  const durDays = days === -1 ? Number(customDays) : days;
  const durSec = Math.round((Number.isFinite(durDays) ? durDays : 0) * DAY);
  const penBps = penaltyOn ? Math.round((penalty === -1 ? Number(customPenalty) : penalty) * 100) : 0;
  const rewardWei = rMeta ? parseAmount(rewards, rMeta.decimals) : null;
  const startSec = startLater ? dateInputToSec(startAt) : 0;
  const minWei = sMeta && minStake.trim() ? parseAmount(minStake, sMeta.decimals) : 0n;
  const maxWWei = sMeta && maxWallet.trim() ? parseAmount(maxWallet, sMeta.decimals) : 0n;
  const maxTWei = sMeta && maxTotal.trim() ? parseAmount(maxTotal, sMeta.decimals) : 0n;

  const problems: string[] = [];
  if (!stakeToken) problems.push("Enter the token people will stake.");
  else if (sBad) problems.push("That stake address is not an ERC-20 token.");
  if (!sameToken && !rewardToken) problems.push("Enter the reward token.");
  else if (!sameToken && rBad) problems.push("That reward address is not an ERC-20 token.");
  if (durSec < 3600) problems.push("Duration must be at least 1 hour.");
  if (durSec > 4 * 365 * DAY) problems.push("Duration can be at most 4 years.");
  if (rewardWei === null || rewardWei === 0n) problems.push("Enter the reward amount to deposit.");
  else if (balance !== undefined && rewardWei > balance) problems.push(`You hold less ${rMeta?.symbol ?? "reward token"} than that.`);
  if (penaltyOn && (!Number.isFinite(penBps) || penBps <= 0 || penBps > 5000)) problems.push("Penalty must be between 0.01% and 50%.");
  if (startLater && (startSec === null || startSec < nowSec() - 60)) problems.push("Start time must be in the future.");
  if (minWei === null || maxWWei === null || maxTWei === null) problems.push("Check the limit amounts.");
  else if (minWei && maxWWei && minWei > maxWWei) problems.push("Minimum stake is above the per-wallet maximum.");
  if (name.length > 48) problems.push("Name is at most 48 characters.");
  const ok = problems.length === 0 && !!STAKING_ADDRESS && fee.data !== undefined;
  const needsApproval = rewardWei !== null && allowance !== undefined && allowance < rewardWei;

  // projected APR (same token) for an expected total staked
  const tvlWei = sMeta && expectTvl.trim() ? parseAmount(expectTvl, sMeta.decimals) : null;
  const defaultTvl = rewardWei ? rewardWei * 10n : null;
  const tvlUsed = tvlWei ?? defaultTvl;
  const projected = rewardWei && tvlUsed && durSec > 0 ? projectedAprPct(rewardWei, BigInt(durSec), tvlUsed) : null;

  const approveTx = useTx();
  const createTx = useTx();
  useEffect(() => {
    if (!createTx.receipt) return;
    try {
      const logs = parseEventLogs({ abi: stakingAbi, logs: createTx.receipt.logs, eventName: "PoolCreated" });
      const id = logs[0]?.args.poolId;
      if (id !== undefined) onCreated(id);
    } catch { /* leave the success notice in place */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTx.receipt]);

  const submit = () => {
    if (!ok || !stakeToken || !rewardToken || rewardWei === null || !STAKING_ADDRESS) return;
    if (needsApproval) { approveTx.writeContract({ address: rewardToken, abi: erc20Abi, functionName: "approve", args: [STAKING_ADDRESS, rewardWei] }); return; }
    createTx.writeContract({
      address: STAKING_ADDRESS, abi: stakingAbi, functionName: "createPool", value: fee.data!,
      args: [{
        stakeToken, rewardToken,
        startTime: BigInt(startLater ? startSec ?? 0 : 0), duration: BigInt(durSec), penaltyBps: penBps,
        minStake: minWei ?? 0n, maxStakePerWallet: maxWWei ?? 0n, maxTotalStaked: maxTWei ?? 0n,
        name: name.trim() || `${sMeta?.symbol ?? "Token"} ${durDays} day${durDays === 1 ? "" : "s"}`,
      }, rewardWei],
    });
  };

  return (
    <form className="card stack" style={{ gap: 18 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="row between">
        <div>
          <div className="eyebrow">New staking pool</div>
          <h3 style={{ marginTop: 2 }}>Set the rules, deposit the rewards</h3>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <div className="field">
        <label htmlFor="st-token">Token people will stake</label>
        <input id="st-token" className="input mono" placeholder="0x…" value={stakeIn} onChange={(e) => setStakeIn(e.target.value)} autoComplete="off" />
        {sMeta ? <div className="hint">{sMeta.name} · {sMeta.symbol} · {sMeta.decimals} decimals</div> : stakeToken && sBad ? <div className="error">Not an ERC-20 token.</div> : <div className="hint">Paste the token's contract address on Arc.</div>}
      </div>

      <div className="field">
        <label>Reward token</label>
        <div className="seg">
          <button type="button" className={sameToken ? "on" : ""} onClick={() => setSameToken(true)}>Same token</button>
          <button type="button" className={!sameToken ? "on" : ""} onClick={() => setSameToken(false)}>A different token</button>
        </div>
        {!sameToken && (
          <>
            <input className="input mono" placeholder="Reward token 0x…" value={rewardIn} onChange={(e) => setRewardIn(e.target.value)} autoComplete="off" style={{ marginTop: 6 }} />
            {rMetaRaw ? <div className="hint">{rMetaRaw.name} · {rMetaRaw.symbol}</div> : rewardToken && rBad ? <div className="error">Not an ERC-20 token.</div> : null}
          </>
        )}
      </div>

      <div className="field">
        <label>How long the pool runs</label>
        <div className="presets">
          {DURATIONS.map((d) => <button type="button" key={d} className={`preset ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>{d} days</button>)}
          <button type="button" className={`preset ${days === -1 ? "on" : ""}`} onClick={() => setDays(-1)}>Custom</button>
        </div>
        {days === -1 && <input className="input mono" inputMode="decimal" placeholder="Days (0.05 = about an hour)" value={customDays} onChange={(e) => setCustomDays(e.target.value)} style={{ marginTop: 6 }} />}
        <div className="hint">Rewards stream evenly from start to finish. Ends {startLater && startSec ? fmtDate(startSec + durSec) : durSec ? fmtDate(nowSec() + durSec) : "—"}.</div>
      </div>

      <AmountInput label={`Rewards to deposit${rMeta ? ` (${rMeta.symbol})` : ""}`} value={rewards} onChange={setRewards} symbol={rMeta?.symbol} decimals={rMeta?.decimals ?? 18} max={rMeta ? balance : undefined} maxLabel="Wallet" hint="Deposited now and paid out to stakers over the duration. You can add more later." disabled={!rMeta} />

      {rewardWei && durSec >= 3600 && (
        <div className="panel small stack" style={{ gap: 8 }}>
          <div className="row between"><span className="muted">Paid out per day</span><span className="mono">{fmtAmount((rewardWei * 86_400n) / BigInt(durSec), rMeta?.decimals ?? 18, 4)} {rMeta?.symbol}</span></div>
          {sameToken ? (
            <>
              <div className="row between" style={{ gap: 10 }}>
                <span className="muted">APR if total staked is</span>
                <span className="input-row" style={{ maxWidth: 220 }}>
                  <input className="input mono" inputMode="decimal" placeholder={defaultTvl && sMeta ? fmtAmount(defaultTvl, sMeta.decimals, 0) : "0"} value={expectTvl} onChange={(e) => setExpectTvl(e.target.value)} aria-label="Expected total staked" style={{ padding: "6px 10px" }} />
                  <span className="input-addon">{sMeta?.symbol}</span>
                </span>
              </div>
              <div className="row between"><strong>Projected APR</strong><strong className="mono" style={{ color: "var(--aqua)" }}>{projected !== null ? `${projected >= 1000 ? projected.toFixed(0) : projected.toFixed(2)}%` : "—"}</strong></div>
              <div className="tiny faint">The APR moves with the pool size: half the stake, double the APR. Stakers see the live figure before they join.</div>
            </>
          ) : (
            <div className="tiny faint">With two different tokens the APR depends on both prices, so the app shows stakers their share of the daily {rMeta?.symbol} instead.</div>
          )}
        </div>
      )}

      <div className="field">
        <label className="toggle">
          <input type="checkbox" checked={penaltyOn} onChange={(e) => setPenaltyOn(e.target.checked)} />
          Charge a penalty for withdrawing before the end
        </label>
        {penaltyOn && (
          <>
            <div className="presets" style={{ marginTop: 4 }}>
              {PENALTIES.map((x) => <button type="button" key={x} className={`preset ${penalty === x ? "on" : ""}`} onClick={() => setPenalty(x)}>{x}%</button>)}
              <button type="button" className={`preset ${penalty === -1 ? "on" : ""}`} onClick={() => setPenalty(-1)}>Custom</button>
            </div>
            {penalty === -1 && <input className="input mono" inputMode="decimal" placeholder="Percent, up to 50" value={customPenalty} onChange={(e) => setCustomPenalty(e.target.value)} style={{ marginTop: 6 }} />}
            <div className="hint">{sameToken ? "The penalty is added to the reward pool for the stakers who stay." : "The penalty is sent to you, the creator, in the staked token."} Withdrawals after the end date are always free.</div>
          </>
        )}
      </div>

      <div className="field">
        <label className="toggle">
          <input type="checkbox" checked={startLater} onChange={(e) => setStartLater(e.target.checked)} />
          Start at a set time instead of right away
        </label>
        {startLater && <input className="input mono" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={{ marginTop: 6 }} />}
      </div>

      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>{advanced ? "Hide limits" : "Optional limits"}</button>
      {advanced && (
        <div className="grid-2">
          <div className="field"><label>Minimum stake</label><input className="input mono" inputMode="decimal" placeholder="none" value={minStake} onChange={(e) => setMinStake(e.target.value)} /></div>
          <div className="field"><label>Max per wallet</label><input className="input mono" inputMode="decimal" placeholder="none" value={maxWallet} onChange={(e) => setMaxWallet(e.target.value)} /></div>
          <div className="field"><label>Total cap</label><input className="input mono" inputMode="decimal" placeholder="none" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} /></div>
          <div className="field"><label>Pool name</label><input className="input" maxLength={48} placeholder={sMeta ? `${sMeta.symbol} ${durDays} days` : "Shown in the list"} value={name} onChange={(e) => setName(e.target.value)} /></div>
        </div>
      )}

      <div className="panel small stack" style={{ gap: 6 }}>
        <div className="row between"><span className="muted">Creation fee</span><span className="mono">{fee.data !== undefined ? fmtUsdc(fee.data) : "…"}</span></div>
        <div className="row between"><span className="muted">Deposit now</span><span className="mono">{rewardWei && rMeta ? `${fmtAmount(rewardWei, rMeta.decimals)} ${rMeta.symbol}` : "—"}</span></div>
        <div className="row between"><span className="muted">Approval</span><span className="mono">{rewardWei === null ? "—" : needsApproval ? "Needed" : "Ready"}</span></div>
      </div>

      {problems.length > 0 && (stakeIn || rewards) && <div className="notice notice-warn small">{problems[0]}</div>}
      <TxStatus tx={approveTx} done="Approved. Now create the pool." />
      <TxStatus tx={createTx} done="Pool created. Opening it…" />
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!ok || approveTx.busy || createTx.busy}>
        {approveTx.busy ? "Approving…" : createTx.busy ? "Creating…" : needsApproval ? `Step 1 of 2 · Approve ${rMeta?.symbol ?? "rewards"}` : "Create pool"}
      </button>
    </form>
  );
}

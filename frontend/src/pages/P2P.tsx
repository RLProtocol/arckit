import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { formatEther, formatUnits, isAddress, parseEther, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { arc } from "@/wagmi";
import { explorerAddress } from "@/contracts";
import { shortAddr } from "@/lib/format";
import { useTx } from "@/hooks/useTx";
import { useTokenImages } from "@/hooks/useTokenImages";
import { erc20Abi, useLendMarkets } from "@/hooks/useArcLend";
import { ARCP2P_ADDRESS, arcP2PAbi, amountForUsdc, costOf, fmtSpread, useListings, useMyListings, usePoolsFor, useTokenInfo, vsMarket, type Listing, type PoolCandidate } from "@/hooks/useArcP2P";
import { RequireWallet } from "@/components/RequireWallet";
import { TxStatus } from "@/components/TxStatus";
import { TokenAvatar } from "@/pages/Stake";

const fmtUsd = (wei: bigint, digits = 2) => { const n = Number(formatEther(wei)); return n.toLocaleString("en-US", { maximumFractionDigits: n !== 0 && n < 0.01 ? 6 : digits }); };
const fmtTok = (units: bigint, dec: number, digits = 4) => Number(formatUnits(units, dec)).toLocaleString("en-US", { maximumFractionDigits: digits });
const fmtPrice = (wei: bigint) => { const n = Number(formatEther(wei)); return n === 0 ? "—" : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toPrecision(3); };
const fmtPct = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(Math.abs(p) < 1 ? 2 : 1)}%`;
const ZERO_ID = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const EMPTY_POOL = { poolId: ZERO_ID, usdcIs0: false, poolUsdcDecimals: 6 } as const;

function safeParse(v: string, dec: number): bigint | undefined {
  try { const n = parseUnits(v.trim() as `${number}`, dec); return n > 0n ? n : undefined; } catch { return undefined; }
}

type Tab = "buy" | "sell" | "mine";

/** Flip to true to open the live order book. While false, /p2p shows the coming-soon explainer below. */
const P2P_LIVE = false as boolean;

export function P2P() {
  return P2P_LIVE ? <P2PLive /> : <P2PSoon />;
}

function P2PSoon() {
  return (
    <div className="wrap page lend p2p">
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcP2P · <span className="pill pill-soon" style={{ marginLeft: 6 }}>Coming soon</span></div>
          <h2>Sell any token for USDC. Buy any listing, whole or in part.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 680 }}>The ArcP2P contract is deployed and verified on Arc. The order book opens to everyone shortly. Here is exactly how it works.</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div className="card stack" style={{ gap: 8 }}><div className="kicker">For sellers</div><h3>List any token, name your price</h3><p className="muted small">Escrow any ERC-20 on Arc and set a price in USDC. No listing approval, no minimum size. Cancel any time and the unsold tokens come straight back.</p></div>
        <div className="card stack" style={{ gap: 8 }}><div className="kicker">Dynamic pricing</div><h3>Market price, plus or minus a spread</h3><p className="muted small">Peg a listing to the token&apos;s Uniswap v4 USDC pool and sell at market, 5% below it, 10% above it, whatever you choose. The price re-reads the pool on every fill, with an optional floor you never sell under. Or set a fixed USDC price that never moves.</p></div>
        <div className="card stack" style={{ gap: 8 }}><div className="kicker">For buyers</div><h3>Take all of it or just a slice</h3><p className="muted small">Pay native USDC and receive the tokens in the same transaction. Buy the whole listing or any part above the seller&apos;s minimum. Any USDC sent beyond the price is refunded in the same call.</p></div>
        <div className="card stack" style={{ gap: 8 }}><div className="kicker">Manipulation resistant</div><h3>Higher of 30-minute average and spot</h3><p className="muted small">Market-priced listings use the higher of the pool&apos;s 30-minute time-weighted average and its spot price, so a flash dump in the pool cannot drain a discounted listing.</p></div>
        <div className="card stack" style={{ gap: 8 }}><div className="kicker">OTC mode</div><h3>Private deals, on-chain settlement</h3><p className="muted small">Restrict a listing to one buyer address, add an expiry, set a minimum fill. The counterparty pays, the contract settles, nobody has to go first.</p></div>
        <div className="card stack" style={{ gap: 8 }}><div className="kicker">Fees</div><h3>0.5% of each fill, paid by the seller</h3><p className="muted small">Buyers pay exactly the quoted price. The fee is capped at 1% in the contract and goes to AKIT revenue. The owner can never move escrowed tokens or change a listing.</p></div>
      </div>
      <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
        <Link to="/docs/arcp2p" className="btn btn-primary">Read the docs</Link>
        <a className="btn btn-ghost" href="https://x.com/usearckit" target="_blank" rel="noreferrer">Follow @usearckit for the opening</a>
        {ARCP2P_ADDRESS && <a className="btn btn-ghost" href={explorerAddress(ARCP2P_ADDRESS)} target="_blank" rel="noreferrer">Verified contract</a>}
      </div>
    </div>
  );
}

function P2PLive() {
  const { listings, isLoading, deployed, refetch } = useListings();
  const { markets } = useLendMarkets();
  const [tab, setTab] = useState<Tab>("buy");
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [q, setQ] = useState("");

  const marketPrice = useMemo(() => Object.fromEntries(markets.map((m) => [m.token.toLowerCase(), m.price])) as Record<string, bigint>, [markets]);
  const active = useMemo(() => listings.filter((l) => l.active && (l.buyer === zeroAddress)).sort((a, b) => b.createdAt - a.createdAt), [listings]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? active.filter((l) => l.symbol.toLowerCase().includes(s) || l.name.toLowerCase().includes(s) || l.token.toLowerCase() === s || l.seller.toLowerCase() === s) : active; }, [active, q]);
  const selected = listings.find((l) => l.id === selectedId) ?? shown[0];
  const images = useTokenImages(active.map((l) => l.token));
  const volume = listings.reduce((a, l) => a + l.proceeds, 0n);

  return (
    <div className="wrap page lend p2p">
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcP2P</div>
          <h2>Sell any token for USDC. Buy any listing, whole or in part.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 680 }}>
            A permissionless order book on Arc. Sellers escrow tokens and name a price: a fixed USDC amount, or the live Uniswap price with a discount or premium. Buyers pay native USDC and receive tokens in the same transaction, no account and no approval.
          </p>
        </div>
        <div className="hero-stats" style={{ marginTop: 0, gap: 22 }}>
          <div><div className="n" style={{ fontSize: 26 }}>{isLoading ? "…" : active.length}</div><div className="l">open listings</div></div>
          <div><div className="n" style={{ fontSize: 26 }}>{isLoading ? "…" : fmtUsd(volume, 0)}</div><div className="l">USDC traded</div></div>
        </div>
      </div>

      {!deployed && <div className="notice notice-warn">ArcP2P is not deployed for this build.</div>}

      <div className="seg" style={{ maxWidth: 420, marginBottom: 18 }}>
        <button type="button" className={tab === "buy" ? "on" : ""} onClick={() => setTab("buy")}>Buy</button>
        <button type="button" className={tab === "sell" ? "on" : ""} onClick={() => setTab("sell")}>Sell</button>
        <button type="button" className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>My listings</button>
      </div>

      {tab === "buy" && (
        <div className="flow-grid">
          <div className="stack">
            <input className="input" placeholder="Search by token, symbol, address or seller" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="lend-table card card-tight">
              <div className="lend-row p2p-row lend-head"><span>Token</span><span>Price</span><span>vs market</span><span>Available</span><span>Seller</span></div>
              {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="lend-row p2p-row"><span className="skel">Loading…</span><span className="skel">0.00</span><span className="skel">—</span><span className="skel">0</span><span className="skel">0x…</span></div>)}
              {!isLoading && shown.length === 0 && <div className="lend-row p2p-row" style={{ cursor: "default" }}><span className="muted">{active.length === 0 ? "No open listings yet. Be the first to sell." : "Nothing matches that search."}</span></div>}
              {shown.map((l) => {
                const vs = vsMarket(l, marketPrice[l.token.toLowerCase()]);
                return (
                  <button key={l.id} type="button" className={`lend-row p2p-row ${selected?.id === l.id ? "on" : ""}`} onClick={() => setSelectedId(l.id)}>
                    <span className="row" style={{ gap: 10 }}>
                      <TokenAvatar src={images[l.token.toLowerCase()]} symbol={l.symbol} size={30} />
                      <span><strong>{l.symbol}</strong><span className="tiny faint" style={{ display: "block" }}>{l.mode === 1 ? fmtSpread(l.spreadBps) : "fixed price"}</span></span>
                    </span>
                    <span className="mono">${fmtPrice(l.price)}</span>
                    <span className={vs === undefined ? "faint" : vs < 0 ? "lend-apy" : ""}>{vs === undefined ? "—" : fmtPct(vs)}</span>
                    <span>{fmtTok(l.remaining, l.decimals)} <span className="faint">≈ {fmtUsd(costOf(l.remaining, l.price, l.decimals), 0)} USDC</span></span>
                    <span className="mono tiny">{shortAddr(l.seller)}</span>
                  </button>
                );
              })}
            </div>
            <p className="tiny faint">Market-priced listings follow the token&apos;s Uniswap v4 pool and use the higher of the 30-minute average and spot, so a flash dump cannot drain a discounted listing. The seller pays a 0.5% fee on each fill; buyers pay exactly the quoted price.</p>
          </div>
          <div className="stack">
            {selected ? <BuyPanel l={selected} market={marketPrice[selected.token.toLowerCase()]} onDone={refetch} /> : <div className="card"><p className="muted small">Pick a listing to buy.</p></div>}
          </div>
        </div>
      )}

      {tab === "sell" && (
        <div className="flow-grid">
          <div className="card"><SellForm onDone={() => { refetch(); setTab("mine"); }} /></div>
          <div className="stack">
            <div className="card stack" style={{ gap: 8 }}>
              <div className="kicker">How selling works</div>
              <p className="muted small">Your tokens move into the ArcP2P contract and stay yours until someone buys: cancel any time and they come straight back. Each fill pays you USDC in the same transaction, minus a 0.5% fee.</p>
              <p className="muted small"><strong>Fixed price</strong> is a USDC amount per token that never moves. <strong>Market price</strong> reads the token&apos;s deepest Uniswap v4 USDC pool every time someone buys and applies your discount or premium, so a 5% discount stays 5% as the market moves. Add a floor to never sell below a price you choose.</p>
              <p className="muted small">Buyers can take any amount above your minimum fill. Set a buyer address to make a private OTC deal only that wallet can accept.</p>
            </div>
            <div className="card stack" style={{ gap: 8 }}>
              <div className="kicker">Contract</div>
              <p className="muted small">Immutable and verified. The owner can only adjust the fee within a 1% cap and can never move escrowed tokens or change a listing. {ARCP2P_ADDRESS && <a href={explorerAddress(ARCP2P_ADDRESS)} target="_blank" rel="noreferrer">{shortAddr(ARCP2P_ADDRESS)}</a>}</p>
            </div>
          </div>
        </div>
      )}

      {tab === "mine" && <RequireWallet what="see your listings"><MyListings all={listings} onDone={refetch} /></RequireWallet>}

      <p className="tiny faint" style={{ marginTop: 24 }}>ArcP2P lists any token anyone brings; a listing is not an endorsement. Check the token address before you buy. <Link to="/docs/arcp2p">Read the docs</Link>.</p>
    </div>
  );
}

// ------------------------------------------------------------------ buy

function BuyPanel({ l, market, onDone }: { l: Listing; market: bigint | undefined; onDone: () => void }) {
  const { address } = useAccount();
  const bal = useBalance({ address, chainId: arc.id });
  const usdcBalance = bal.data?.value ?? 0n;
  const [by, setBy] = useState<"token" | "usdc">("token");
  const [amt, setAmt] = useState("");
  const tx = useTx();
  useEffect(() => { if (tx.isSuccess) { onDone(); setAmt(""); } }, [tx.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const units = useMemo(() => {
    if (by === "token") return safeParse(amt, l.decimals);
    const usdc = safeParse(amt, 18);
    if (!usdc) return undefined;
    const a = amountForUsdc(usdc, l.price, l.decimals);
    return a > l.remaining ? l.remaining : a > 0n ? a : undefined;
  }, [amt, by, l]);
  const cost = units ? costOf(units, l.price, l.decimals) : 0n;
  // market listings can move between the quote and the block; send a little extra, the contract refunds it
  const value = l.mode === 1 ? cost + cost / 100n : cost;
  const vs = vsMarket(l, market);
  const belowMin = !!units && units !== l.remaining && units < l.minFill;
  const err = !units ? "" : units > l.remaining ? `Only ${fmtTok(l.remaining, l.decimals)} ${l.symbol} left.` : belowMin ? `Minimum fill is ${fmtTok(l.minFill, l.decimals)} ${l.symbol} (or everything that is left).` : value > usdcBalance ? "Not enough USDC in your wallet." : "";

  const submit = () => {
    if (!units || err) return;
    tx.writeContract({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "fill", args: [BigInt(l.id), units], value, chainId: arc.id });
  };

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Buy {l.symbol}</h3>
        <a className="tiny" href={explorerAddress(l.token)} target="_blank" rel="noreferrer">{shortAddr(l.token)}</a>
      </div>
      <div className="ledger cash-ledger">
        <div><span className="muted">Price</span><span><strong>${fmtPrice(l.price)}</strong> per {l.symbol} {vs !== undefined && <span className={vs < 0 ? "lend-apy" : "faint"}>· {fmtPct(vs)} vs market</span>}</span></div>
        <div><span className="muted">Pricing</span><span>{l.mode === 1 ? <>{fmtSpread(l.spreadBps)}{l.floorPrice > 0n && <span className="faint"> · floor ${fmtPrice(l.floorPrice)}</span>}</> : "fixed by the seller"}</span></div>
        <div><span className="muted">Available</span><span>{fmtTok(l.remaining, l.decimals)} {l.symbol} <span className="faint">≈ {fmtUsd(costOf(l.remaining, l.price, l.decimals))} USDC</span></span></div>
        {l.minFill > 0n && <div><span className="muted">Minimum</span><span>{fmtTok(l.minFill, l.decimals)} {l.symbol}</span></div>}
        {l.expiry > 0 && <div><span className="muted">Open until</span><span>{new Date(l.expiry * 1000).toLocaleString()}</span></div>}
        <div><span className="muted">Seller</span><span><a className="mono tiny" href={explorerAddress(l.seller)} target="_blank" rel="noreferrer">{shortAddr(l.seller)}</a></span></div>
      </div>
      <RequireWallet what="buy">
        <div className="seg"><button type="button" className={by === "token" ? "on" : ""} onClick={() => { setBy("token"); setAmt(""); }}>Amount of {l.symbol}</button><button type="button" className={by === "usdc" ? "on" : ""} onClick={() => { setBy("usdc"); setAmt(""); }}>Spend USDC</button></div>
        <div className="field">
          <label>{by === "token" ? `${l.symbol} to buy` : "USDC to spend"}</label>
          <div className="input-row">
            <input className="input mono" inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} />
            <button type="button" className="btn btn-soft" onClick={() => setAmt(by === "token" ? formatUnits(l.remaining, l.decimals) : formatEther(costOf(l.remaining, l.price, l.decimals) < usdcBalance ? costOf(l.remaining, l.price, l.decimals) : usdcBalance > parseEther("0.05") ? usdcBalance - parseEther("0.05") : 0n))}>Max</button>
          </div>
          <div className="hint">Wallet: {fmtUsd(usdcBalance)} USDC</div>
          {err && <div className="error">{err}</div>}
        </div>
        {units && !err ? (
          <div className="notice small">You receive <strong>{fmtTok(units, l.decimals)} {l.symbol}</strong> for <strong>{fmtUsd(cost, 4)} USDC</strong>.{l.mode === 1 && <> Up to 1% extra is sent to cover price movement and refunded in the same transaction.</>}</div>
        ) : null}
        <button className="btn btn-primary btn-lg" disabled={!units || !!err || tx.busy} onClick={submit}>{tx.busy ? "Confirming…" : `Buy ${l.symbol}`}</button>
        <TxStatus tx={tx} done={`Bought. ${l.symbol} is in your wallet.`} />
      </RequireWallet>
    </div>
  );
}

// ------------------------------------------------------------------ sell

function depthLabel(p: PoolCandidate, best: PoolCandidate | undefined): string {
  if (!best || best.liquidity === 0n) return "liquidity unknown";
  if (p.poolId === best.poolId) return "deepest";
  const pct = Number((p.liquidity * 100n) / best.liquidity);
  return pct >= 50 ? "deep" : pct >= 5 ? `${pct}% of deepest` : "thin";
}

const SPREADS: [number, string][] = [[-1000, "−10%"], [-500, "−5%"], [-200, "−2%"], [0, "Market"], [200, "+2%"], [500, "+5%"]];
const EXPIRIES: [number, string][] = [[0, "No expiry"], [86400, "1 day"], [7 * 86400, "7 days"], [30 * 86400, "30 days"]];

function SellForm({ onDone }: { onDone: () => void }) {
  const { address: me } = useAccount();
  const [token, setToken] = useState("");
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState<0 | 1>(1);
  const [fixedPrice, setFixedPrice] = useState("");
  const [spread, setSpread] = useState(0);
  const [customSpread, setCustomSpread] = useState("");
  const [floor, setFloor] = useState("");
  const [poolId, setPoolId] = useState<Hex | undefined>();
  const [minFill, setMinFill] = useState("");
  const [expiry, setExpiry] = useState(0);
  const [buyer, setBuyer] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const tx = useTx();
  const addr = isAddress(token) ? (token as Address) : undefined;
  const info = useTokenInfo(addr);
  const pools = usePoolsFor(info.found ? addr : undefined, info.decimals);
  const poolChoices = useMemo(() => { const sane = pools.candidates.filter((p) => p.fee <= 100_000); return sane.length ? sane : pools.candidates; }, [pools.candidates]);
  const pool: PoolCandidate | undefined = pools.candidates.find((p) => p.poolId === poolId) ?? pools.best;
  useEffect(() => { if (tx.isSuccess && stage === "list") onDone(); }, [tx.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const units = safeParse(amt, info.decimals);
  const spreadBps = customSpread.trim() ? Math.round(Number(customSpread) * 100) : spread;
  const fixedWei = safeParse(fixedPrice, 18);
  const floorWei = floor.trim() ? safeParse(floor, 18) : 0n;
  const needsApproval = !!units && info.allowance < units;
  const stage = needsApproval ? "approve" : "list";
  const marketNow = pool?.price ?? 0n;
  const effective = mode === 0 ? (fixedWei ?? 0n) : (() => { let p = (marketNow * BigInt(10_000 + spreadBps)) / 10_000n; if (floorWei && p < floorWei) p = floorWei; return p; })();

  const err = !addr ? (token ? "That is not a valid address." : "") :
    info.isLoading ? "" : !info.found ? "No ERC-20 token at that address." :
    !units ? "" : me && units > info.balance ? `You hold ${fmtTok(info.balance, info.decimals)} ${info.symbol}.` :
    mode === 0 && !fixedWei ? "Set a price in USDC." :
    mode === 1 && !pool ? (pools.isLoading ? "" : "No Uniswap v4 USDC pool found for this token. Use a fixed price instead.") :
    mode === 1 && (!Number.isFinite(spreadBps) || spreadBps < -9000 || spreadBps > 10_000) ? "Spread must be between −90% and +100%." :
    floor.trim() && floorWei === undefined ? "Floor must be a positive USDC price." :
    buyer.trim() && !isAddress(buyer) ? "Buyer must be a valid address." : "";

  const submit = () => {
    if (!addr || !units || err) return;
    if (needsApproval) return tx.writeContract({ address: addr, abi: erc20Abi, functionName: "approve", args: [ARCP2P_ADDRESS!, units], chainId: arc.id });
    const pricing = { mode, fixedPrice: mode === 0 ? fixedWei! : 0n, spreadBps: mode === 1 ? spreadBps : 0, floorPrice: mode === 1 ? (floorWei ?? 0n) : 0n };
    const poolArg = mode === 1 && pool ? { poolId: pool.poolId, usdcIs0: pool.usdcIs0, poolUsdcDecimals: pool.poolUsdcDecimals } : EMPTY_POOL;
    const terms = { minFill: safeParse(minFill, info.decimals) ?? 0n, expiry: expiry ? Math.floor(Date.now() / 1000) + expiry : 0, buyer: buyer.trim() ? (buyer as Address) : zeroAddress };
    tx.writeContract({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "list", args: [addr, units, pricing, poolArg, terms], chainId: arc.id });
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <h3 style={{ margin: 0 }}>Create a listing</h3>
      <div className="field">
        <label>Token address</label>
        <input className="input mono" placeholder="0x…" value={token} onChange={(e) => { setToken(e.target.value.trim()); setPoolId(undefined); }} />
        <div className="hint">{info.found ? <>{info.name} ({info.symbol}){me && <> · you hold {fmtTok(info.balance, info.decimals)}</>}</> : info.isLoading ? "Looking up the token…" : "Any ERC-20 on Arc."}</div>
      </div>
      <div className="field">
        <label>Amount to sell</label>
        <div className="input-row">
          <input className="input mono" inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <button type="button" className="btn btn-soft" disabled={!info.found} onClick={() => setAmt(formatUnits(info.balance, info.decimals))}>Max</button>
        </div>
      </div>

      <div className="field">
        <label>Pricing</label>
        <div className="seg"><button type="button" className={mode === 1 ? "on" : ""} onClick={() => setMode(1)}>Market price ± %</button><button type="button" className={mode === 0 ? "on" : ""} onClick={() => setMode(0)}>Fixed price</button></div>
      </div>
      {mode === 0 ? (
        <div className="field">
          <label>Price per {info.symbol || "token"} in USDC</label>
          <input className="input mono" inputMode="decimal" placeholder="0.00" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} />
          {marketNow > 0n && fixedWei ? <div className="hint">Market is ${fmtPrice(marketNow)}: your price is {fmtPct((Number(fixedWei) / Number(marketNow) - 1) * 100)} vs market.</div> : null}
        </div>
      ) : (
        <>
          <div className="field">
            <label>Discount or premium to market</label>
            <div className="presets">{SPREADS.map(([bps, label]) => <button key={bps} type="button" className={`preset ${!customSpread && spread === bps ? "on" : ""}`} onClick={() => { setSpread(bps); setCustomSpread(""); }}>{label}</button>)}
              <input className="input mono" style={{ width: 110 }} placeholder="custom %" value={customSpread} onChange={(e) => setCustomSpread(e.target.value)} /></div>
            <div className="hint">{pool ? <>Market now ${fmtPrice(marketNow)} → you sell at <strong>${fmtPrice(effective)}</strong>. The price re-reads the pool on every fill.</> : pools.isLoading ? "Finding the token's USDC pool…" : pools.error || "Enter a token to see its market price."}</div>
          </div>
          <div className="field">
            <label>Floor price in USDC <span className="faint">(optional)</span></label>
            <input className="input mono" inputMode="decimal" placeholder="never sell below…" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
          {poolChoices.length > 1 && (
            <div className="field">
              <label>Reference pool</label>
              <select className="input" value={pool?.poolId} onChange={(e) => setPoolId(e.target.value as Hex)}>
                {poolChoices.map((p) => <option key={p.poolId} value={p.poolId}>{p.poolUsdcDecimals === 18 ? "native USDC" : "USDC"} pool · LP fee {(p.fee / 10_000).toFixed(2)}% · ${fmtPrice(p.price)} · {depthLabel(p, pools.best)}</option>)}
              </select>
              <div className="hint">The deepest pool with a normal fee is chosen for you. Pools charging more than 10% are hidden.</div>
            </div>
          )}
        </>
      )}

      <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide options" : "More options: minimum fill, expiry, private buyer"}</button>
      {advanced && (
        <>
          <div className="field"><label>Minimum fill in {info.symbol || "tokens"} <span className="faint">(optional)</span></label><input className="input mono" inputMode="decimal" placeholder="0" value={minFill} onChange={(e) => setMinFill(e.target.value)} /><div className="hint">Buyers can always take everything that is left, even below the minimum.</div></div>
          <div className="field"><label>Expiry</label><div className="presets">{EXPIRIES.map(([s, label]) => <button key={s} type="button" className={`preset ${expiry === s ? "on" : ""}`} onClick={() => setExpiry(s)}>{label}</button>)}</div></div>
          <div className="field"><label>Only this buyer <span className="faint">(optional, for OTC deals)</span></label><input className="input mono" placeholder="0x…" value={buyer} onChange={(e) => setBuyer(e.target.value.trim())} /></div>
        </>
      )}

      {err && <div className="error">{err}</div>}
      {units && !err && info.found ? <div className="notice small">Listing <strong>{fmtTok(units, info.decimals)} {info.symbol}</strong>{effective > 0n && <> at ${fmtPrice(effective)} ≈ <strong>{fmtUsd(costOf(units, effective, info.decimals))} USDC</strong> if it all sells</>}. You keep 99.5% of every fill.</div> : null}
      <RequireWallet what="list tokens for sale">
        <button className="btn btn-primary btn-lg" disabled={!units || !!err || !info.found || tx.busy} onClick={submit}>{tx.busy ? "Confirming…" : needsApproval ? `Approve ${info.symbol}` : "List for sale"}</button>
        <TxStatus tx={tx} done={needsApproval ? "Approved. Now list." : "Listed. Buyers can see it now."} />
      </RequireWallet>
    </div>
  );
}

// ------------------------------------------------------------------ manage

function MyListings({ all, onDone }: { all: Listing[]; onDone: () => void }) {
  const { mine, pending } = useMyListings(all);
  const claim = useTx();
  useEffect(() => { if (claim.isSuccess) onDone(); }, [claim.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack" style={{ gap: 14 }}>
      {pending > 0n && (
        <div className="notice notice-warn row" style={{ justifyContent: "space-between" }}>
          <span>{fmtUsd(pending)} USDC from your sales could not be delivered to your address and is waiting for you.</span>
          <button className="btn btn-primary" disabled={claim.busy} onClick={() => claim.writeContract({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "claimPayout", chainId: arc.id })}>Claim</button>
        </div>
      )}
      {mine.length === 0 && <div className="card"><p className="muted small">You have no listings yet.</p></div>}
      {[...mine].reverse().map((l) => <ManageCard key={l.id} l={l} onDone={onDone} />)}
    </div>
  );
}

function ManageCard({ l, onDone }: { l: Listing; onDone: () => void }) {
  const [edit, setEdit] = useState(false);
  const [fixedPrice, setFixedPrice] = useState(l.mode === 0 ? formatEther(l.fixedPrice) : "");
  const [spread, setSpread] = useState(String(l.spreadBps / 100));
  const [floor, setFloor] = useState(l.floorPrice > 0n ? formatEther(l.floorPrice) : "");
  const [topUp, setTopUp] = useState("");
  const tx = useTx();
  useEffect(() => { if (tx.isSuccess) { onDone(); setEdit(false); setTopUp(""); } }, [tx.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = l.remaining + l.sold;
  const soldPct = total === 0n ? 0 : Number((l.sold * 1000n) / total) / 10;
  const status = l.remaining === 0n ? (l.sold > 0n ? "sold out" : "cancelled") : l.expiry > 0 && l.expiry * 1000 < Date.now() ? "expired" : "open";

  const save = () => {
    const spreadBps = Math.round(Number(spread) * 100);
    const pricing = { mode: l.mode, fixedPrice: l.mode === 0 ? (safeParse(fixedPrice, 18) ?? l.fixedPrice) : 0n, spreadBps: l.mode === 1 ? spreadBps : 0, floorPrice: l.mode === 1 && floor.trim() ? (safeParse(floor, 18) ?? 0n) : 0n };
    tx.writeContract({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "update", args: [BigInt(l.id), pricing, { minFill: l.minFill, expiry: l.expiry, buyer: l.buyer }], chainId: arc.id });
  };

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 10 }}><strong>{l.symbol}</strong><span className={`pill ${status === "open" ? "pill-live" : "pill-empty"}`}>{status}</span><span className="tiny faint">#{l.id} · {l.mode === 1 ? fmtSpread(l.spreadBps) : "fixed"}{l.buyer !== zeroAddress && ` · private for ${shortAddr(l.buyer)}`}</span></div>
        <span className="mono">${fmtPrice(l.price)} <span className="faint tiny">per {l.symbol}</span></span>
      </div>
      <div className="ledger cash-ledger">
        <div><span className="muted">Remaining</span><span>{fmtTok(l.remaining, l.decimals)} {l.symbol}</span></div>
        <div><span className="muted">Sold</span><span>{fmtTok(l.sold, l.decimals)} {l.symbol} ({soldPct}%) · received {fmtUsd(l.proceeds)} USDC</span></div>
      </div>
      {l.remaining > 0n && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-soft" onClick={() => setEdit(!edit)}>{edit ? "Close" : "Change price"}</button>
          <button className="btn btn-ghost" disabled={tx.busy} onClick={() => tx.writeContract({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "cancel", args: [BigInt(l.id)], chainId: arc.id })}>Cancel and withdraw tokens</button>
        </div>
      )}
      {edit && (
        <div className="stack" style={{ gap: 10 }}>
          {l.mode === 0 ? (
            <div className="field"><label>New price in USDC</label><input className="input mono" value={fixedPrice} onChange={(e) => setFixedPrice(e.target.value)} /></div>
          ) : (
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1 }}><label>Spread vs market in %</label><input className="input mono" value={spread} onChange={(e) => setSpread(e.target.value)} /><div className="hint">Negative for a discount, e.g. −5.</div></div>
              <div className="field" style={{ flex: 1 }}><label>Floor in USDC</label><input className="input mono" placeholder="none" value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
            </div>
          )}
          <div className="field"><label>Add more {l.symbol}</label><div className="input-row"><input className="input mono" placeholder="0.00" value={topUp} onChange={(e) => setTopUp(e.target.value)} /><TopUpButton l={l} amount={topUp} tx={tx} /></div></div>
          <button className="btn btn-primary" disabled={tx.busy} onClick={save}>{tx.busy ? "Confirming…" : "Save price"}</button>
        </div>
      )}
      <TxStatus tx={tx} done="Done." />
    </div>
  );
}

function TopUpButton({ l, amount, tx }: { l: Listing; amount: string; tx: ReturnType<typeof useTx> }) {
  const { address } = useAccount();
  const info = useTokenInfo(l.token);
  const units = safeParse(amount, l.decimals);
  const needsApproval = !!units && info.allowance < units;
  if (!address) return null;
  return (
    <button type="button" className="btn btn-soft" disabled={!units || tx.busy} onClick={() => {
      if (!units) return;
      if (needsApproval) return tx.writeContract({ address: l.token, abi: erc20Abi, functionName: "approve", args: [ARCP2P_ADDRESS!, units], chainId: arc.id });
      tx.writeContract({ address: ARCP2P_ADDRESS!, abi: arcP2PAbi, functionName: "topUp", args: [BigInt(l.id), units], chainId: arc.id });
    }}>{needsApproval ? "Approve" : "Top up"}</button>
  );
}

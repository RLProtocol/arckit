import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { arc } from "@/wagmi";
import { explorerAddress } from "@/contracts";
import { shortAddr } from "@/lib/format";
import { useTx } from "@/hooks/useTx";
import { useTokenImages } from "@/hooks/useTokenImages";
import { ARCLEND_ADDRESS, arcLendAbi, erc20Abi, borrowCapacity, collateralValue, fmtBps, fmtHealth, liquidationPrice, useLendMarkets, useLendPosition, type LendMarket } from "@/hooks/useArcLend";
import { RequireWallet } from "@/components/RequireWallet";
import { TxStatus } from "@/components/TxStatus";
import { TokenAvatar } from "@/pages/Stake";

const fmtUsd = (wei: bigint, digits = 2) => Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: digits });
const fmtTok = (units: bigint, dec: number, digits = 4) => Number(formatUnits(units, dec)).toLocaleString("en-US", { maximumFractionDigits: digits });
/** Token price in USDC with enough precision for small-cap tokens. */
const fmtPrice = (wei: bigint) => { const n = Number(formatEther(wei)); return n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toPrecision(3); };

/** Flip to true to open the live lending UI. While false, /lend shows the coming-soon explainer below. */
const LEND_LIVE = true as boolean;

export function Lend() {
  return LEND_LIVE ? <LendLive /> : <LendSoon />;
}

function LendSoon() {
  const { markets } = useLendMarkets();
  return (
    <div className="wrap page lend">
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcLend · <span className="pill pill-soon" style={{ marginLeft: 6 }}>Coming soon</span></div>
          <h2>Lend USDC. Borrow against your tokens.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 680 }}>
            ArcLend is deployed on Arc and its contracts are verified. Markets open to the public shortly, once the price oracle has built up its history. Here is exactly how it will work.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div className="card stack" style={{ gap: 8 }}>
          <div className="kicker">For lenders</div>
          <h3>Supply USDC, earn every second</h3>
          <p className="muted small">Pick a market and supply USDC as the native coin, no approval needed. Your balance grows with the market&apos;s supply APY, which is the borrow rate times utilisation. Withdraw whenever idle USDC is available; when a market is fully lent out, the high utilisation rate pulls repayments and new supply in.</p>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <div className="kicker">For borrowers</div>
          <h3>Post tokens, borrow USDC</h3>
          <p className="muted small">Deposit a listed token as collateral and borrow USDC up to 50% of its value. Repay any time, in part or in full. The page shows your health factor and the exact token price at which you would be liquidated.</p>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <div className="kicker">Isolated markets</div>
          <h3>One token, one pool of USDC</h3>
          <p className="muted small">Each market pairs a single token with USDC and shares nothing with the others. A token that collapses can hurt its own market and nothing else.</p>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <div className="kicker">Pricing</div>
          <h3>30-minute on-chain average</h3>
          <p className="muted small">Arc has no price feeds, so collateral is priced from the token&apos;s Uniswap v4 USDC pool using a 30-minute time-weighted average. Borrowing pauses when the spot price is more than 5% away from that average, so a single manipulated block cannot open bad loans.</p>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <div className="kicker">Liquidations</div>
          <h3>Open to anyone, fully on-chain</h3>
          <p className="muted small">When debt passes 65% of collateral value, anyone can repay up to half of it and receive collateral at an 8% discount. An Arc Kit guardian watches live prices every 10 seconds and closes underwater positions at spot, so a token crashing in minutes is handled before it becomes bad debt.</p>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <div className="kicker">Launch markets</div>
          <h3>{markets.length ? markets.map((m) => m.symbol).join(" · ") : "AKIT · ARCMAN · ARCOON · AF · ASTOCK"}</h3>
          <p className="muted small">The deepest USDC pools on Arc&apos;s Uniswap v4 plus AKIT. First-week caps: 10 USDC supplied and 10 USDC borrowed per market, raised gradually as the oracle proves itself. 10% of interest goes to the protocol as AKIT revenue.</p>
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
        <Link to="/docs/arclend" className="btn btn-primary">Read the full docs</Link>
        <a className="btn btn-ghost" href="https://x.com/usearckit" target="_blank" rel="noreferrer">Follow @usearckit for the opening</a>
      </div>
    </div>
  );
}

function LendLive() {
  const { markets, isLoading, deployed } = useLendMarkets();
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [tab, setTab] = useState<"borrow" | "lend">("lend");
  const selected = markets.find((m) => m.id === selectedId) ?? markets[0];
  const images = useTokenImages(markets.map((m) => m.token));
  const totalSupplied = markets.reduce((a, m) => a + m.cash + m.totalBorrows - m.reserves, 0n);
  const totalBorrowed = markets.reduce((a, m) => a + m.totalBorrows, 0n);

  return (
    <div className="wrap page lend">
      <div className="page-head">
        <div>
          <div className="eyebrow">ArcLend</div>
          <h2>Lend USDC. Borrow against your tokens.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 640 }}>
            Isolated markets, one per token. Lenders supply USDC and earn every second from borrowers, who post the token as collateral and borrow up to the market&apos;s loan-to-value. Prices come from a 30-minute on-chain average of the token&apos;s Uniswap v4 pool.
          </p>
        </div>
        <div className="hero-stats" style={{ marginTop: 0, gap: 22 }}>
          <div><div className="n" style={{ fontSize: 26 }}>{isLoading ? "…" : fmtUsd(totalSupplied, 0)}</div><div className="l">USDC supplied</div></div>
          <div><div className="n" style={{ fontSize: 26 }}>{isLoading ? "…" : fmtUsd(totalBorrowed, 0)}</div><div className="l">USDC borrowed</div></div>
        </div>
      </div>

      {!deployed && <div className="notice notice-warn">ArcLend is not deployed for this build.</div>}

      <div className="flow-grid">
        <div className="stack">
          <div className="lend-table card card-tight">
            <div className="lend-row lend-head">
              <span>Market</span><span>Supply APY</span><span>Borrow APR</span><span>Available</span><span>LTV</span>
            </div>
            {isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="lend-row"><span className="skel">Loading market…</span><span className="skel">0.00%</span><span className="skel">0.00%</span><span className="skel">0</span><span className="skel">50%</span></div>)}
            {markets.map((m) => (
              <button key={m.id} type="button" className={`lend-row ${selected?.id === m.id ? "on" : ""}`} onClick={() => setSelectedId(m.id)}>
                <span className="row" style={{ gap: 10 }}>
                  <TokenAvatar src={images[m.token.toLowerCase()]} symbol={m.symbol} size={30} />
                  <span><strong>{m.symbol}</strong><span className="tiny faint" style={{ display: "block" }}>${fmtPrice(m.price)}</span></span>
                </span>
                <span className="lend-apy">{fmtBps(m.supplyAprBps)}</span>
                <span>{fmtBps(m.borrowAprBps)}</span>
                <span>{fmtUsd(m.available, 0)} <span className="faint">USDC</span></span>
                <span>{m.ltvBps / 100}%</span>
              </button>
            ))}
            {!isLoading && markets.length === 0 && deployed && <div className="empty" style={{ padding: 28 }}><p className="muted">No markets yet.</p></div>}
          </div>
          <div className="panel small muted stack" style={{ gap: 8 }}>
            <div className="kicker">How ArcLend keeps lenders safe</div>
            <div>Each market is isolated: a token can only ever hurt its own pool of USDC. Borrows stop when the token&apos;s spot price drifts more than 5% from its 30-minute average, and positions above the liquidation threshold can be closed by anyone at an {selected ? `${selected.liqBonusBps / 100}%` : "8%"} discount.</div>
          </div>
        </div>

        <div className="stack">
          {selected && (
            <MarketPanel key={selected.id} m={selected} tab={tab} setTab={setTab} image={images[selected.token.toLowerCase()]} />
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ market panel

function MarketPanel({ m, tab, setTab, image }: { m: LendMarket; tab: "borrow" | "lend"; setTab: (t: "borrow" | "lend") => void; image?: string }) {
  const { address } = useAccount();
  const { position: pos, refetch } = useLendPosition(m);
  const bal = useBalance({ address, chainId: arc.id });
  const supplied = m.cash + m.totalBorrows - m.reserves;

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div className="row between">
        <div className="row" style={{ gap: 12 }}>
          <TokenAvatar src={image} symbol={m.symbol} size={44} />
          <div>
            <div className="eyebrow">Market #{m.id}</div>
            <div className="h3" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 500 }}>{m.symbol} <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>/ USDC</span></div>
          </div>
        </div>
        <a className="tiny mono" href={explorerAddress(m.token)} target="_blank" rel="noreferrer">{shortAddr(m.token, 5)}</a>
      </div>

      <div className="stat" style={{ gridTemplateColumns: "repeat(3, 1fr)", display: "grid", gap: 10 }}>
        <div className="panel"><div className="kicker">Price (30m avg)</div><div className="big" style={{ fontSize: 18 }}>${fmtPrice(m.price)}</div><div className="small muted">spot ${fmtPrice(m.spot)}</div></div>
        <div className="panel"><div className="kicker">Utilisation</div><div className="big" style={{ fontSize: 18 }}>{fmtBps(m.utilBps, 1)}</div><div className="small muted">{fmtUsd(m.totalBorrows, 0)} of {fmtUsd(supplied, 0)}</div></div>
        <div className="panel"><div className="kicker">Liquidation</div><div className="big" style={{ fontSize: 18 }}>{m.liqThresholdBps / 100}%</div><div className="small muted">LTV {m.ltvBps / 100}% · bonus {m.liqBonusBps / 100}%</div></div>
      </div>

      {m.covered < 20 * 60 && <div className="notice notice-warn small">This market&apos;s price average is still filling ({Math.round(m.covered / 60)} of 20 minutes). Borrowing opens once it is covered.</div>}
      {m.borrowsPaused && <div className="notice notice-warn small">New borrows are paused in this market. Repayments, withdrawals and liquidations still work.</div>}

      <div className="seg seg-wide" role="tablist">
        <button role="tab" aria-selected={tab === "lend"} className={tab === "lend" ? "on" : ""} onClick={() => setTab("lend")}>Lend USDC</button>
        <button role="tab" aria-selected={tab === "borrow"} className={tab === "borrow" ? "on" : ""} onClick={() => setTab("borrow")}>Borrow USDC</button>
      </div>

      <RequireWallet what={tab === "lend" ? "supply USDC" : "borrow USDC"}>
        {tab === "lend" ? <LendForm m={m} supplied={pos?.supplied ?? 0n} shares={pos?.supplyShares ?? 0n} usdcBalance={bal.data?.value ?? 0n} onDone={refetch} /> : <BorrowForm m={m} collateral={pos?.collateral ?? 0n} debt={pos?.debt ?? 0n} health={pos?.health ?? 0n} tokenBalance={pos?.tokenBalance ?? 0n} allowance={pos?.allowance ?? 0n} usdcBalance={bal.data?.value ?? 0n} onDone={refetch} />}
      </RequireWallet>
    </div>
  );
}

// ------------------------------------------------------------------ lend

function LendForm({ m, supplied, shares, usdcBalance, onDone }: { m: LendMarket; supplied: bigint; shares: bigint; usdcBalance: bigint; onDone: () => void }) {
  const [mode, setMode] = useState<"supply" | "withdraw">("supply");
  const [amt, setAmt] = useState("");
  const tx = useTx();
  useEffect(() => { if (tx.isSuccess) { onDone(); setAmt(""); } }, [tx.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  const wei = safeParse(amt);
  const capRoom = m.supplyCap === 0n ? undefined : m.supplyCap - (m.cash + m.totalBorrows - m.reserves);
  const err = !wei ? "" : mode === "supply"
    ? (wei > usdcBalance ? "More than your USDC balance." : capRoom !== undefined && wei > capRoom ? `This market's supply cap leaves room for ${fmtUsd(capRoom)} USDC.` : "")
    : (wei > supplied ? "More than you have supplied." : wei > m.available ? `Only ${fmtUsd(m.available)} USDC is idle right now; the rest is lent out. Try a smaller amount or come back later.` : "");
  const projected = wei && mode === "supply" ? (wei * BigInt(m.supplyAprBps)) / 10_000n : 0n;

  const submit = () => {
    if (!wei || err) return;
    if (mode === "supply") tx.writeContract({ address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "supply", args: [BigInt(m.id)], value: wei, chainId: arc.id });
    else {
      // shares for a USDC amount, rounding up so "withdraw all" clears the position
      const sharesFor = supplied === 0n ? 0n : wei >= supplied ? shares : (wei * shares + supplied - 1n) / supplied;
      tx.writeContract({ address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "withdraw", args: [BigInt(m.id), sharesFor], chainId: arc.id });
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="ledger cash-ledger">
        <div><span className="muted">Your supply</span><span>{fmtUsd(supplied)} USDC</span></div>
        <div><span className="muted">Earning</span><span>{fmtBps(m.supplyAprBps)} APY · paid by borrowers, every second</span></div>
      </div>
      <div className="seg"><button type="button" className={mode === "supply" ? "on" : ""} onClick={() => { setMode("supply"); setAmt(""); }}>Supply</button><button type="button" className={mode === "withdraw" ? "on" : ""} onClick={() => { setMode("withdraw"); setAmt(""); }}>Withdraw</button></div>
      <div className="field">
        <label>{mode === "supply" ? "USDC to supply" : "USDC to withdraw"}</label>
        <div className="input-row">
          <input className="input mono" inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <button type="button" className="btn btn-soft" onClick={() => setAmt(formatEther(mode === "supply" ? (usdcBalance > parseEther("0.01") ? usdcBalance - parseEther("0.01") : 0n) : supplied < m.available ? supplied : m.available))}>Max</button>
        </div>
        <div className="hint">{mode === "supply" ? `Wallet: ${fmtUsd(usdcBalance)} USDC` : `Idle in market: ${fmtUsd(m.available)} USDC`}</div>
        {err && <div className="error">{err}</div>}
      </div>
      {mode === "supply" && wei && !err ? <div className="notice small">About <strong>{fmtUsd(projected)} USDC</strong> a year at today&apos;s rate. The rate moves with utilisation.</div> : null}
      <button className="btn btn-primary btn-lg" disabled={!wei || !!err || tx.busy} onClick={submit}>{tx.busy ? "Confirming…" : mode === "supply" ? "Supply USDC" : "Withdraw USDC"}</button>
      <TxStatus tx={tx} done={mode === "supply" ? "Supplied. You are earning from this second." : "Withdrawn to your wallet."} />
    </div>
  );
}

// ------------------------------------------------------------------ borrow

function BorrowForm({ m, collateral, debt, health, tokenBalance, allowance, usdcBalance, onDone }: { m: LendMarket; collateral: bigint; debt: bigint; health: bigint; tokenBalance: bigint; allowance: bigint; usdcBalance: bigint; onDone: () => void }) {
  const { address } = useAccount();
  const [mode, setMode] = useState<"deposit" | "borrow" | "repay" | "withdraw">(collateral === 0n ? "deposit" : "borrow");
  const [amt, setAmt] = useState("");
  const tx = useTx();
  useEffect(() => { if (tx.isSuccess) { onDone(); if (mode !== "deposit") setAmt(""); } }, [tx.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = collateralValue(collateral, m.price, m.decimals);
  const capacity = borrowCapacity(m, collateral, debt);
  const liqPrice = liquidationPrice(m, collateral, debt);
  const isToken = mode === "deposit" || mode === "withdraw";
  const units = isToken ? safeParseUnits(amt, m.decimals) : safeParse(amt);
  const needsApproval = mode === "deposit" && !!units && allowance < units;

  // what the position looks like after this action
  const after = useMemo(() => {
    if (!units) return { collateral, debt };
    if (mode === "deposit") return { collateral: collateral + units, debt };
    if (mode === "withdraw") return { collateral: collateral > units ? collateral - units : 0n, debt };
    if (mode === "borrow") return { collateral, debt: debt + units };
    return { collateral, debt: debt > units ? debt - units : 0n };
  }, [units, mode, collateral, debt]);
  const afterLimit = (collateralValue(after.collateral, m.price, m.decimals) * BigInt(m.ltvBps)) / 10_000n;
  const afterHealth = after.debt === 0n ? undefined : (collateralValue(after.collateral, m.price, m.decimals) * BigInt(m.liqThresholdBps) * 10n ** 18n) / (10_000n * after.debt);

  const err = !units ? "" :
    mode === "deposit" ? (units > tokenBalance ? `More than your ${m.symbol} balance.` : "") :
    mode === "withdraw" ? (units > collateral ? "More than your collateral." : after.debt > afterLimit ? "That would put your loan over the limit. Repay first." : "") :
    mode === "borrow" ? (m.borrowsPaused ? "Borrows are paused." : units > capacity ? (units > m.available ? `Only ${fmtUsd(m.available)} USDC is available to borrow right now.` : `Your collateral allows up to ${fmtUsd(capacity)} USDC more.`) : "") :
    (units > usdcBalance ? "More than your USDC balance." : "");

  const submit = () => {
    if (!units || err) return;
    const id = BigInt(m.id);
    if (mode === "deposit") {
      if (needsApproval) return tx.writeContract({ address: m.token, abi: erc20Abi, functionName: "approve", args: [ARCLEND_ADDRESS!, units], chainId: arc.id });
      return tx.writeContract({ address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "depositCollateral", args: [id, units], chainId: arc.id });
    }
    if (mode === "withdraw") return tx.writeContract({ address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "withdrawCollateral", args: [id, units], chainId: arc.id });
    if (mode === "borrow") return tx.writeContract({ address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "borrow", args: [id, units], chainId: arc.id });
    // repay: send a hair more than the debt when repaying everything; the contract returns the excess
    const val = units >= debt ? debt + debt / 10_000n + 1n : units;
    if (!address) return;
    return tx.writeContract({ address: ARCLEND_ADDRESS!, abi: arcLendAbi, functionName: "repay", args: [id, address], value: val, chainId: arc.id });
  };

  const modes: [typeof mode, string][] = [["deposit", "Deposit collateral"], ["borrow", "Borrow"], ["repay", "Repay"], ["withdraw", "Withdraw collateral"]];

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="ledger cash-ledger">
        <div><span className="muted">Collateral</span><span>{fmtTok(collateral, m.decimals)} {m.symbol} <span className="faint">≈ {fmtUsd(value)} USDC</span></span></div>
        <div><span className="muted">Debt</span><span>{fmtUsd(debt)} USDC <span className="faint">at {fmtBps(m.borrowAprBps)} APR</span></span></div>
        <div><span className="muted">Can borrow</span><span>{fmtUsd(capacity)} USDC more</span></div>
        <div><span className="muted">Health</span><span><HealthBadge h={health} /> {debt > 0n && <span className="faint">· liquidation if {m.symbol} falls to ${fmtPrice(liqPrice)}</span>}</span></div>
      </div>
      <div className="presets">{modes.map(([k, label]) => <button key={k} type="button" className={`preset ${mode === k ? "on" : ""}`} onClick={() => { setMode(k); setAmt(""); }}>{label}</button>)}</div>
      <div className="field">
        <label>{mode === "deposit" ? `${m.symbol} to deposit` : mode === "withdraw" ? `${m.symbol} to withdraw` : mode === "borrow" ? "USDC to borrow" : "USDC to repay"}</label>
        <div className="input-row">
          <input className="input mono" inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <button type="button" className="btn btn-soft" onClick={() => setAmt(mode === "deposit" ? formatUnits(tokenBalance, m.decimals) : mode === "withdraw" ? formatUnits(maxWithdrawable(m, collateral, debt), m.decimals) : mode === "borrow" ? formatEther(capacity) : formatEther(debt < usdcBalance ? debt : usdcBalance))}>Max</button>
        </div>
        <div className="hint">{mode === "deposit" ? `Wallet: ${fmtTok(tokenBalance, m.decimals)} ${m.symbol}` : mode === "repay" ? `Wallet: ${fmtUsd(usdcBalance)} USDC` : mode === "borrow" ? `Available in market: ${fmtUsd(m.available)} USDC` : `Free to withdraw: ${fmtTok(maxWithdrawable(m, collateral, debt), m.decimals)} ${m.symbol}`}</div>
        {err && <div className="error">{err}</div>}
      </div>
      {units && !err && (mode === "borrow" || mode === "withdraw" || mode === "deposit") && after.debt > 0n ? (
        <div className="notice small">After this: health <strong>{afterHealth ? fmtHealth(afterHealth) : "∞"}</strong>, liquidation if {m.symbol} falls to <strong>${fmtPrice(liquidationPrice(m, after.collateral, after.debt))}</strong>.</div>
      ) : null}
      <button className="btn btn-primary btn-lg" disabled={!units || !!err || tx.busy} onClick={submit}>
        {tx.busy ? "Confirming…" : needsApproval ? `Approve ${m.symbol}` : mode === "deposit" ? "Deposit collateral" : mode === "withdraw" ? "Withdraw collateral" : mode === "borrow" ? "Borrow USDC" : "Repay USDC"}
      </button>
      <TxStatus tx={tx} done={needsApproval ? "Approved. Now deposit." : mode === "deposit" ? "Collateral deposited." : mode === "withdraw" ? "Collateral withdrawn." : mode === "borrow" ? "Borrowed. USDC is in your wallet." : "Repaid."} />
    </div>
  );
}

function HealthBadge({ h }: { h: bigint }) {
  if (h === 0n) return <span className="faint">—</span>;
  const v = h >= 10n ** 30n ? Infinity : Number(h) / 1e18;
  const cls = v === Infinity || v >= 1.5 ? "pill-live" : v >= 1.1 ? "pill-locked" : "pill-empty";
  return <span className={`pill ${cls}`} style={v < 1.1 && v !== Infinity ? { background: "var(--coral-soft)", color: "var(--coral)" } : undefined}>{v === Infinity ? "no debt" : v.toFixed(2)}</span>;
}

/** Collateral that can leave while keeping debt within the LTV limit. */
function maxWithdrawable(m: LendMarket, collateral: bigint, debt: bigint): bigint {
  if (debt === 0n || m.price === 0n) return collateral;
  const needed = (debt * 10_000n * 10n ** BigInt(m.decimals) + BigInt(m.ltvBps) * m.price - 1n) / (BigInt(m.ltvBps) * m.price);
  return collateral > needed ? collateral - needed : 0n;
}

function safeParse(v: string): bigint | undefined {
  try { const n = parseEther(v.trim() as `${number}`); return n > 0n ? n : undefined; } catch { return undefined; }
}
function safeParseUnits(v: string, dec: number): bigint | undefined {
  try { const n = parseUnits(v.trim() as `${number}`, dec); return n > 0n ? n : undefined; } catch { return undefined; }
}

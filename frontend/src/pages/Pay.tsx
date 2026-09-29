import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { explorerTx } from "@/contracts";
import { arc } from "@/wagmi";
import {
  COUNTRIES, arcPayRouterAbi, categoryLabel, countryName, createPayOrder, flagOf, fmtMoney, fmtUsdcUnits, isLiveState, tileGradient,
  useInvalidatePayHistory, usePayConfig, usePayCountry, usePayHistory, usePayOrder, usePayProducts, usePaySearch, usePaySession,
  type PayOrder, type PayProduct,
} from "@/hooks/useArcPay";
import { useTx } from "@/hooks/useTx";
import { useNow } from "@/hooks/useNow";
import { ConnectButton } from "@/components/ConnectButton";
import { TxStatus } from "@/components/TxStatus";

export function Pay() {
  const cfg = usePayConfig();
  const { country, detected, setCountry } = usePayCountry();
  const [tab, setTab] = useState<"shop" | "history">("shop");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [picking, setPicking] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicking(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [picking]);
  const countryOptions = useMemo(() => {
    const f = countryFilter.trim().toLowerCase();
    return COUNTRIES.filter((c) => !f || countryName(c).toLowerCase().includes(f) || c.toLowerCase() === f);
  }, [countryFilter]);
  const [active, setActive] = useState<PayProduct | undefined>();
  const [resume, setResume] = useState<PayOrder | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 320);
    return () => clearTimeout(t);
  }, [q]);

  const list = usePayProducts(country);
  const search = usePaySearch(term, country);
  const searching = term.trim().length >= 2;
  const items = useMemo(() => (searching ? search.data?.items : list.data?.items) ?? [], [searching, search.data, list.data]);
  const categories = useMemo(() => ["all", ...Array.from(new Set((list.data?.items ?? []).map((p) => p.category))).slice(0, 8)], [list.data]);
  const shown = useMemo(() => (category === "all" || searching ? items : items.filter((p) => p.category === category)), [items, category, searching]);
  const loading = searching ? search.isLoading : list.isLoading || !country;

  return (
    <div className="pay">
      <section className="pay-hero">
        <div className="aurora-clip" aria-hidden="true"><div className="aurora"><i /><i /><i /></div></div>
        <div className="wrap pay-hero-inner">
          <div className="eyebrow">ArcPay</div>
          <h1>Spend your USDC <span>in the real world.</span></h1>
          <p className="lede">Gift cards, mobile top-ups and more from thousands of brands. Pay from your Arc wallet in one tap, get your code in under a minute.</p>

          <div className="pay-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            <input value={q} onChange={(e) => { setQ(e.target.value); setTab("shop"); }} placeholder="Search Steam, Netflix, Uber, PlayStation, your mobile carrier…" aria-label="Search products" />
            {q && <button type="button" className="pay-clear" onClick={() => setQ("")} aria-label="Clear search">×</button>}
          </div>

          <div className="pay-meta">
            <div className="pay-country" ref={pickerRef}>
              <button type="button" className="chip chip-glass" onClick={() => { setPicking((v) => !v); setCountryFilter(""); }} aria-expanded={picking} aria-haspopup="listbox">
                <Flag code={country} /> {country ? countryName(country) : "Locating…"} <span className="faint">{detected ? "· detected" : ""} ▾</span>
              </button>
              {picking && (
                <div className="pay-country-menu">
                  <input className="input" autoFocus placeholder="Type a country…" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} aria-label="Filter countries" onKeyDown={(e) => { if (e.key === "Enter" && countryOptions[0]) { setCountry(countryOptions[0]); setPicking(false); setCategory("all"); } }} />
                  <div className="pay-country-list" role="listbox" aria-label="Country">
                  {countryOptions.length === 0 && <div className="tiny faint" style={{ padding: 10 }}>No country matches that.</div>}
                  {countryOptions.map((c) => (
                    <button key={c} type="button" role="option" aria-selected={c === country} className={c === country ? "on" : ""} onClick={() => { setCountry(c); setPicking(false); setCategory("all"); }}>
                      <Flag code={c} /> {countryName(c)}
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </div>
            <div className="seg pay-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "shop"} className={tab === "shop" ? "on" : ""} onClick={() => setTab("shop")}>Shop</button>
              <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>My purchases</button>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap pay-body">
        {cfg.data?.demo && <div className="notice notice-warn small" style={{ marginBottom: 18 }}>Demo catalogue. Nothing is really purchased and any payment is sent straight back.</div>}
        {cfg.data && !cfg.data.ready && !cfg.data.demo && <div className="notice small" style={{ marginBottom: 18 }}>ArcPay is being switched on. You can browse now; checkout opens shortly.</div>}

        {tab === "shop" ? (
          <>
            {!searching && categories.length > 2 && (
              <div className="pay-cats" role="tablist" aria-label="Categories">
                {categories.map((c) => (
                  <button key={c} role="tab" aria-selected={category === c} className={`chip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>{c === "all" ? "All" : categoryLabel(c)}</button>
                ))}
              </div>
            )}
            <div className="row between pay-head">
              <h2>{searching ? `Results for “${term.trim()}”` : <>Trending in {countryName(country)} <Flag code={country} /></>}</h2>
              <span className="tiny faint">{loading ? "" : `${shown.length} item${shown.length === 1 ? "" : "s"}`}</span>
            </div>

            {loading ? (
              <div className="pay-grid">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="pcard pcard-skel" />)}</div>
            ) : cfg.data && !cfg.data.ready && !cfg.data.demo && (searching ? search.isError : list.isError) ? (
              <div className="empty"><h3>ArcPay opens soon</h3><p className="muted">The catalogue is being connected. Follow <a href="https://x.com/usearckit" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>@usearckit</a> for the launch.</p></div>
            ) : (searching ? search.isError : list.isError) ? (
              <div className="empty"><h3>Could not load products</h3><p className="muted">Check your connection and try again in a moment.</p></div>
            ) : shown.length === 0 ? (
              <div className="empty"><h3>Nothing found</h3><p className="muted">{searching ? "Try a different spelling, or switch country." : `Nothing is on sale in ${countryName(country)} yet. Pick another country above; codes for most brands work in the country they are sold for.`}</p></div>
            ) : (
              <div className="pay-grid">{shown.map((p, i) => <ProductCard key={p.id} p={p} index={i} onOpen={() => setActive(p)} />)}</div>
            )}
          </>
        ) : (
          <History onOpen={(o) => setResume(o)} />
        )}
      </div>

      {(active || resume) && <Checkout product={active} resume={resume} ready={!!cfg.data?.ready} onClose={() => { setActive(undefined); setResume(undefined); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ cards

/** Country flag. An image, because Windows ships no flag emoji; falls back to the emoji elsewhere. */
function Flag({ code }: { code?: string }) {
  const [broken, setBroken] = useState(false);
  if (!code || broken) return <span className="flag">{flagOf(code)}</span>;
  const c = code.toLowerCase();
  return <img className="flag-img" src={`https://flagcdn.com/24x18/${c}.png`} srcSet={`https://flagcdn.com/48x36/${c}.png 2x`} width={20} height={15} alt="" onError={() => setBroken(true)} />;
}

function Artwork({ name, image, tint, size }: { name: string; image: string | null; tint?: string | null; size?: "lg" }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`art ${size === "lg" ? "art-lg" : ""}`} style={{ background: image && !broken ? tint ?? "#f3f6fc" : tileGradient(name) }}>
      {image && !broken ? <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} /> : <span>{name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}</span>}
    </div>
  );
}

function priceHint(p: PayProduct): string {
  if (p.packages.length) {
    const vals = p.packages.map((k) => Number(k.value)).filter(Number.isFinite).sort((a, b) => a - b);
    return vals.length ? `${fmtMoney(vals[0], p.currency)} – ${fmtMoney(vals[vals.length - 1], p.currency)}` : "";
  }
  return p.range ? `${fmtMoney(p.range.min, p.currency)} – ${fmtMoney(p.range.max, p.currency)}` : "";
}

function ProductCard({ p, index, onOpen }: { p: PayProduct; index: number; onOpen: () => void }) {
  return (
    <button type="button" className="pcard" style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }} onClick={onOpen}>
      <Artwork name={p.name} image={p.image} tint={p.tint} />
      <div className="pcard-body">
        <div className="pcard-name">{p.name}</div>
        <div className="pcard-meta"><span>{categoryLabel(p.category)}</span><span className="mono">{priceHint(p)}</span></div>
      </div>
      <span className="pcard-shine" aria-hidden="true" />
    </button>
  );
}

// ------------------------------------------------------------------ checkout

const STEPS = [
  { key: "paid", label: "Payment received" },
  { key: "bridging", label: "Converting your USDC" },
  { key: "bridged", label: "Buying your item" },
  { key: "delivered", label: "Delivered" },
] as const;
const stepIndex = (s: PayOrder["state"]) => (s === "paid" ? 0 : s === "bridging" ? 1 : s === "bridged" ? 2 : s === "delivered" ? 4 : -1);

function Checkout({ product, resume, ready, onClose }: { product?: PayProduct; resume?: PayOrder; ready: boolean; onClose: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const onArc = chainId === arc.id;
  const session = usePaySession();
  const now = useNow(1000);
  const refreshHistory = useInvalidatePayHistory();
  const native = useBalance({ address, query: { refetchInterval: 15_000 } });

  const [value, setValue] = useState<string>(() => product?.packages[Math.min(1, (product?.packages.length ?? 1) - 1)]?.value ?? (product?.range ? String(product.range.min) : ""));
  const [contact, setContact] = useState("");
  const [created, setCreated] = useState<PayOrder | undefined>(resume);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const payTx = useTx();
  const live = usePayOrder(session.token, created?.id, created);
  const order = live.data ?? created;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  useEffect(() => { if (order && (order.state === "delivered" || order.state === "refunded")) void refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [order?.state]);

  const name = product?.name ?? order?.product.name ?? "";
  const image = product?.image ?? order?.product.image ?? null;
  const currency = product?.currency ?? order?.currency ?? "USD";
  const isPhone = product?.recipient === "phone";
  const needsContact = product?.recipient === "phone" || product?.recipient === "email";
  const contactOk = !needsContact || (isPhone ? /^\+?[0-9 ()-]{6,20}$/.test(contact) : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact));
  const valueOk = !!product && (product.packages.some((k) => k.value === value) || (!!product.range && Number(value) >= product.range.min && Number(value) <= product.range.max));

  const secondsLeft = order ? Math.max(0, Math.floor(order.expiresAt / 1000) - now) : 0;
  const charge = order ? BigInt(order.chargeWei) : 0n;
  const short = order && native.data ? native.data.value < charge + 10n ** 15n : false;
  const paying = payTx.busy || (payTx.isSuccess && order?.state === "awaiting_payment");

  async function start() {
    if (!product) return;
    setError("");
    const token = session.token ?? (await session.signIn());
    if (!token) return;
    setCreating(true);
    try {
      const { order: o } = await createPayOrder(token, { productId: product.id, value, ...(needsContact ? (isPhone ? { phone: contact.trim() } : { email: contact.trim() }) : {}) });
      setCreated(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the order.");
    } finally {
      setCreating(false);
    }
  }

  const pay = () => order && payTx.writeContract({ address: order.router, abi: arcPayRouterAbi, functionName: "pay", args: [order.id], value: charge });

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={`Buy ${name}`}>
        <button ref={closeRef} type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <div className="sheet-head">
          <Artwork name={name} image={image} tint={product?.tint ?? order?.product.tint} size="lg" />
          <div>
            <div className="eyebrow">{product ? categoryLabel(product.category) : "Your order"}</div>
            <h3>{name}</h3>
            {order && <div className="small muted">{fmtMoney(order.value, order.currency)}</div>}
          </div>
        </div>

        {!order && product && (
          <div className="stack" style={{ gap: 18 }}>
            {product.description && <p className="small muted">{product.description}</p>}
            <div className="field">
              <label>Amount</label>
              {product.packages.length > 0 && (
                <div className="amounts">{product.packages.slice(0, 12).map((k) => <button key={k.value} type="button" className={`amount ${value === k.value ? "on" : ""}`} onClick={() => setValue(k.value)}>{fmtMoney(k.value, currency)}</button>)}</div>
              )}
              {product.range && (
                <>
                  <div className="input-row" style={{ marginTop: product.packages.length ? 10 : 0 }}><input className="input mono" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Custom amount" /><div className="input-addon">{currency}</div></div>
                  <div className="hint">Any amount from {fmtMoney(product.range.min, currency)} to {fmtMoney(product.range.max, currency)}.</div>
                </>
              )}
            </div>
            {needsContact && (
              <div className="field">
                <label htmlFor="pay-contact">{isPhone ? "Phone number to top up" : "Email to send it to"}</label>
                <input id="pay-contact" className="input" type={isPhone ? "tel" : "email"} autoComplete={isPhone ? "tel" : "email"} placeholder={isPhone ? "+1 415 555 0123" : "you@example.com"} value={contact} onChange={(e) => setContact(e.target.value)} />
                <div className="hint">{isPhone ? "Include the country code. The top-up is applied to this number." : "Needed by this product for delivery."}</div>
              </div>
            )}
            {(error || session.error) && <div className="notice notice-err small" role="alert">{error || session.error}</div>}
            {!isConnected || !onArc ? (
              <div className="stack" style={{ gap: 10, alignItems: "stretch" }}><div className="small muted center">{isConnected ? "Switch to Arc to continue." : "Connect your wallet to see the price in USDC."}</div><div className="row" style={{ justifyContent: "center" }}><ConnectButton /></div></div>
            ) : (
              <button className="btn btn-primary btn-lg btn-block" disabled={!valueOk || !contactOk || creating || session.busy || !ready} onClick={start}>
                {session.busy ? "Confirm the sign-in in your wallet…" : creating ? "Getting your price…" : !ready ? "Checkout opens soon" : session.token ? "Get price in USDC" : "Sign in and get price"}
              </button>
            )}
            <p className="tiny faint center">Signing in is free and proves the code belongs to you. No transaction is sent.</p>
          </div>
        )}

        {order && order.state === "awaiting_payment" && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="quote">
              <div className="row between"><span className="muted">{order.product.name}</span><span className="mono">{fmtMoney(order.value, order.currency)}</span></div>
              <div className="row between"><span className="muted">Conversion and network costs</span><span className="mono">included</span></div>
              <div className="divider" />
              <div className="row between quote-total"><span>You pay</span><span><strong>{fmtUsdcUnits(order.chargeUnits)}</strong> USDC</span></div>
            </div>
            <div className={`timer ${secondsLeft < 90 ? "timer-low" : ""}`}><span>Price held for</span><span className="mono">{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</span></div>
            {short && <div className="notice notice-warn small">Your wallet holds {native.data ? (Number(native.data.value) / 1e18).toFixed(2) : "0"} USDC, which is not enough for this order plus gas.</div>}
            <TxStatus tx={payTx} done="Payment sent. Confirming…" />
            <button className="btn btn-primary btn-lg btn-block" disabled={paying || secondsLeft === 0 || short} onClick={pay}>
              {payTx.isSigning ? "Confirm in your wallet…" : paying ? "Confirming on Arc…" : secondsLeft === 0 ? "Price expired" : `Pay ${fmtUsdcUnits(order.chargeUnits)} USDC`}
            </button>
            <p className="tiny faint center">One transaction, no token approval. If anything goes wrong after you pay, your USDC is sent back automatically.</p>
          </div>
        )}

        {order && order.state === "expired" && (
          <div className="stack" style={{ gap: 14 }}><div className="notice small">This price expired before it was paid. Nothing was charged.</div><button className="btn btn-soft btn-block" onClick={onClose}>Start again</button></div>
        )}

        {order && ["paid", "bridging", "bridged"].includes(order.state) && (
          <div className="stack" style={{ gap: 18 }}>
            <ol className="steps">
              {STEPS.map((s, i) => {
                const at = stepIndex(order.state);
                const st = i < at ? "done" : i === at ? "now" : "todo";
                return <li key={s.key} className={`step-${st}`}><span className="dot" />{s.label}</li>;
              })}
            </ol>
            <p className="small muted center">{order.note ?? "This usually takes under a minute. You can close this and find it under My purchases."}</p>
          </div>
        )}

        {order && order.state === "delivered" && <Ticket order={order} />}

        {order && (order.state === "refunding" || order.state === "refunded") && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="notice notice-warn small">{order.note ?? "This order could not be completed."}</div>
            <div className="panel small">{order.state === "refunded" ? <>Your {fmtUsdcUnits(order.chargeUnits)} USDC was sent back to your wallet. {order.refundTx && <a href={explorerTx(order.refundTx)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>View refund</a>}</> : "Sending your USDC back now…"}</div>
          </div>
        )}

        {order && order.state === "needs_support" && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="notice notice-warn small">{order.note ?? "We are checking this order by hand."}</div>
            <div className="panel small">Message us on <a href="https://t.me/usearckit" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Telegram</a> with this reference and we will sort it out:<div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>{order.id}</div></div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Ticket({ order }: { order: PayOrder }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState("");
  const d = order.delivery;
  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1600); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="ticket">
        <div className="ticket-top"><span className="pill pill-live">Delivered</span><span className="mono tiny">{fmtMoney(order.value, order.currency)}</span></div>
        <div className="ticket-cut" aria-hidden="true" />
        <div className="ticket-body">
          {d?.code && (
            <div className="secret">
              <div className="kicker">Your code</div>
              <div className={`secret-value ${shown ? "" : "blurred"}`} aria-hidden={!shown}>{d.code}</div>
            </div>
          )}
          {d?.pin && (
            <div className="secret">
              <div className="kicker">PIN</div>
              <div className={`secret-value small-secret ${shown ? "" : "blurred"}`} aria-hidden={!shown}>{d.pin}</div>
            </div>
          )}
          {!d?.code && !d?.pin && !d?.link && <p className="small muted">Your top-up has been applied. It can take a few minutes to show on the device.</p>}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {(d?.code || d?.pin) && <button className="btn btn-primary" onClick={() => setShown((v) => !v)}>{shown ? "Hide" : "Reveal"}</button>}
            {d?.code && <button className="btn btn-soft" onClick={() => copy("code", d.code!)}>{copied === "code" ? "Copied" : "Copy code"}</button>}
            {d?.pin && <button className="btn btn-ghost" onClick={() => copy("pin", d.pin!)}>{copied === "pin" ? "Copied" : "Copy PIN"}</button>}
            {d?.link && <a className="btn btn-soft" href={d.link} target="_blank" rel="noreferrer">Open redemption page</a>}
          </div>
        </div>
      </div>
      <div className="panel small stack" style={{ gap: 8 }}>
        <div className="kicker">How to redeem</div>
        {d?.instructions ? (
          <div style={{ whiteSpace: "pre-line" }}>{d.instructions}</div>
        ) : order.recipient.phone ? (
          <div>Nothing to enter. The top-up was sent to {order.recipient.phone} and usually shows within a few minutes.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Press Reveal, then copy your code{d?.pin ? " and PIN" : ""}.</li>
            <li>Open {order.product.name}{order.product.redeemOn?.includes("online") ? "'s website or app" : ""} and find “Redeem a gift card” or “Add funds”.</li>
            <li>Paste the code. The {fmtMoney(order.value, order.currency)} balance is added to your account.</li>
          </ol>
        )}
        {d?.link && <div className="faint">Some brands give a link instead of a code. Use the button above to open it.</div>}
        {order.product.terms && <details><summary className="faint" style={{ cursor: "pointer" }}>Brand terms</summary><div className="faint" style={{ marginTop: 6 }}>{order.product.terms}</div></details>}
      </div>
      <p className="tiny faint center">Only your wallet can open this. It stays under My purchases{order.demo ? ". Demo code: nothing was bought and your payment was returned" : ""}.</p>
    </div>
  );
}

// ------------------------------------------------------------------ history

const STATE_PILL: Record<PayOrder["state"], [string, string]> = {
  awaiting_payment: ["Awaiting payment", "pill-soon"], expired: ["Expired", "pill-empty"], paid: ["Processing", "pill-locked"], bridging: ["Processing", "pill-locked"],
  bridged: ["Processing", "pill-locked"], delivered: ["Delivered", "pill-live"], refunding: ["Refunding", "pill-locked"], refunded: ["Refunded", "pill-empty"], needs_support: ["Needs a check", "pill-locked"],
};

function History({ onOpen }: { onOpen: (o: PayOrder) => void }) {
  const { isConnected } = useAccount();
  const session = usePaySession();
  const hist = usePayHistory(session.token);
  if (!isConnected) return <div className="empty"><h3>Connect your wallet</h3><p className="muted" style={{ marginTop: 6 }}>Your purchases are tied to the wallet that paid for them.</p><div className="row" style={{ justifyContent: "center", marginTop: 18 }}><ConnectButton /></div></div>;
  if (!session.token) return <div className="empty"><h3>Sign in to see your purchases</h3><p className="muted" style={{ marginTop: 6 }}>A free signature proves these codes are yours. No transaction is sent.</p>{session.error && <div className="notice notice-err small" style={{ marginTop: 12 }}>{session.error}</div>}<div className="row" style={{ justifyContent: "center", marginTop: 18 }}><button className="btn btn-primary" disabled={session.busy} onClick={() => void session.signIn()}>{session.busy ? "Confirm in your wallet…" : "Sign in"}</button></div></div>;
  if (hist.isLoading) return <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="card card-tight skel" style={{ height: 76 }} />)}</div>;
  const orders = hist.data ?? [];
  if (orders.length === 0) return <div className="empty"><h3>No purchases yet</h3><p className="muted">Anything you buy with this wallet shows up here, with its code.</p></div>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row between pay-head"><h2>My purchases</h2><button className="btn btn-ghost btn-sm" onClick={session.signOut}>Sign out</button></div>
      {orders.map((o) => {
        const [label, cls] = STATE_PILL[o.state];
        return (
          <button key={o.id} type="button" className="card card-tight hrow" onClick={() => onOpen(o)}>
            <Artwork name={o.product.name} image={o.product.image} tint={o.product.tint} />
            <div className="stack" style={{ gap: 4, minWidth: 0, textAlign: "left" }}>
              <strong>{o.product.name} · {fmtMoney(o.value, o.currency)}</strong>
              <span className="tiny muted mono">{new Date(o.paidAt ?? o.createdAt).toLocaleString()} · {fmtUsdcUnits(o.chargeUnits)} USDC</span>
            </div>
            <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
              <span className={`pill ${cls}`}>{label}</span>
              <span className="tiny faint">{o.state === "delivered" ? "View code" : isLiveState(o.state) ? "Track" : "Details"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

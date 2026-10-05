import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBlockNumber } from "wagmi";
import { useNow } from "@/hooks/useNow";
import { useAllLocks, useLockFee, useTokenMetas } from "@/hooks/useLocks";
import { Certificate } from "@/components/Certificate";
import { LockCard } from "@/components/LockCard";
import { Dial } from "@/components/Dial";
import { LOCKER_ADDRESS, explorerAddress } from "@/contracts";
import { fmtUsdc, isValidAddress, lockStatus, shortAddr } from "@/lib/format";

/** Thin sweeping arcs and horizontal streaks, echoing Arc's brand visuals. */
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path className="arc" d="M 880 -120 C 900 240, 1100 520, 1560 620" />
      <path className="arc-soft" d="M 760 -80 C 800 300, 1040 600, 1500 720" />
      <path className="arc" d="M 1010 -160 C 980 200, 1240 460, 1620 500" />
      <path className="arc-soft" d="M 1130 -60 C 1160 160, 1330 330, 1620 380" />
      <rect className="streak" x="1040" y="92" width="260" height="6" rx="3" />
      <rect className="streak" x="1180" y="180" width="300" height="6" rx="3" />
      <rect className="streak" x="960" y="420" width="220" height="6" rx="3" />
      <rect className="streak" x="1240" y="520" width="260" height="6" rx="3" />
      <rect className="streak" x="1090" y="640" width="200" height="6" rx="3" />
    </svg>
  );
}

/** Android build of the Arc Kit Wallet, published as a GitHub release; "latest" always points at the newest one. */
const APK_URL = "https://github.com/RLProtocol/arckit/releases/latest/download/arckit-wallet.apk";
const AndroidIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 2 }}>
    <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
  </svg>
);

/** Shown in the hero until the first real lock exists: live chain facts, nothing invented. */
function NetworkCard({ total, fee }: { total?: number; fee?: bigint }) {
  const block = useBlockNumber({ watch: true });
  return (
    <div className="cert net-card">
      <div className="cert-head">
        <div>
          <div className="cert-title">ArcLock on Arc</div>
          <div className="cert-id">chain 5042 · live</div>
        </div>
        <span className="pill pill-live">Live</span>
      </div>
      <div className="cert-body">
        <Dial progress={0} value={total !== undefined ? String(total) : "—"} label={total === 1 ? "lock" : "locks"} animate={false} />
        <div>
          <div className="net-big">Ready for the first lock.</div>
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
            The locker contract is deployed and reading live from Arc. Lock a token or LP and your certificate takes this
            spot.
          </p>
          <Link to="/lock/new" className="btn btn-primary" style={{ marginTop: 16 }}>
            Create the first lock
          </Link>
        </div>
      </div>
      <div className="cert-foot">
        <div>
          <div className="k">Locker contract</div>
          <div className="v">
            <a href={explorerAddress(LOCKER_ADDRESS)} target="_blank" rel="noreferrer" style={{ borderBottom: "1px dotted var(--text-faint)" }}>
              {shortAddr(LOCKER_ADDRESS, 6)}
            </a>
          </div>
        </div>
        <div>
          <div className="k">Lock fee</div>
          <div className="v">{fee !== undefined ? fmtUsdc(fee) : "…"}</div>
        </div>
        <div>
          <div className="k">Latest block</div>
          <div className="v">{block.data !== undefined ? block.data.toLocaleString("en-US") : "…"}</div>
        </div>
      </div>
    </div>
  );
}

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
const AirdropIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10a8 8 0 0 1 16 0" />
    <path d="M4 10l8 11 8-11" />
    <path d="M9 10l3 11 3-11" />
  </svg>
);
const StakeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </svg>
);
const PayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10.5h18M7 15h4" />
  </svg>
);
const MigrateIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="7" height="14" rx="1.5" />
    <path d="M14 8h7M18 5l3 3-3 3M21 16h-7M17 13l-3 3 3 3" />
  </svg>
);

const CashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 9.5v5M10.5 11h2.2a.9.9 0 0 1 0 1.8h-1.4a.9.9 0 0 0 0 1.8H13.5" />
  </svg>
);
const P2PIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h12l-3-3" /><path d="M20 16H8l3 3" /><circle cx="19" cy="8" r="1.4" /><circle cx="5" cy="16" r="1.4" /></svg>
);
const LendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 17h16M6 17V9l6-4 6 4v8" />
    <path d="M10 17v-4h4v4M9 9.5h6" />
  </svg>
);
const AgentIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="7" width="16" height="12" rx="3" />
    <path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" />
  </svg>
);

const TOOLS: { key: string; name: string; icon: ReactNode; text: string; tags: string[]; live?: boolean; to?: string; href?: string; cta?: string }[] = [
  {
    key: "pay",
    name: "ArcPay",
    live: true,
    to: "/pay",
    cta: "Spend USDC",
    icon: <PayIcon />,
    text: "Spend the USDC in your Arc wallet on gift cards and mobile top-ups from thousands of brands. One tap to pay, your code in under a minute, and an automatic refund if anything fails.",
    tags: ["Gift cards and top-ups", "One transaction, no approval", "Codes only you can open"],
  },
  {
    key: "airdrop",
    name: "Arc Bulk Airdrop",
    live: true,
    to: "/airdrop",
    cta: "Send an airdrop",
    icon: <AirdropIcon />,
    text: "Send any token or native USDC to hundreds of wallets per transaction. Paste a list or upload CSV, TXT or JSON; the app validates, batches and signs.",
    tags: ["CSV / JSON upload", "Same or per-wallet amounts", "All-or-nothing batches"],
  },
  {
    key: "staking",
    name: "Arc Staking",
    live: true,
    to: "/stake",
    cta: "Open a pool",
    icon: <StakeIcon />,
    text: "Open a staking pool for your token in one transaction: pick 3, 7 or 30 days, deposit the rewards, choose an early-exit penalty or none. Stakers see the live APR and earn every second.",
    tags: ["Any ERC-20", "APR calculated for you", "Optional 10% early exit fee"],
  },
  {
    key: "flow",
    name: "ArcFlow",
    live: true,
    to: "/flow",
    cta: "Put USDC to work",
    icon: <StakeIcon />,
    text: "Liquidity on Arc's Uniswap v4. Stake USDC into a band around the price and earn swap fees streamed every second, or open your own spot, curve or bid-ask position and lock it as public proof of liquidity. Beta.",
    tags: ["Concentrated stakes", "Shaped positions", "v4 liquidity lock"],
  },
  {
    key: "cash",
    name: "ArcCash",
    live: true,
    to: "/cash",
    cta: "Send privately",
    icon: <CashIcon />,
    text: "Private transfers on Arc. Deposit a fixed amount of USDC and receive a secret note; later, paste the note and withdraw to a fresh address. A zero-knowledge proof built in your browser shows you own a deposit, never which one. We pay the gas.",
    tags: ["Zero-knowledge proofs", "No account, no server", "Gas paid by Arc Kit"],
  },
  {
    key: "lend",
    name: "ArcLend",
    live: true,
    to: "/lend",
    cta: "Lend or borrow",
    icon: <LendIcon />,
    text: "Lend USDC and earn every second, or post your tokens as collateral and borrow USDC against them. One isolated market per token, priced by a 30-minute on-chain average, liquidations open to anyone.",
    tags: ["Isolated markets", "USDC in, USDC out", "On-chain TWAP pricing"],
  },
  {
    key: "p2p",
    name: "ArcP2P",
    live: true,
    to: "/p2p",
    cta: "Trade peer to peer",
    icon: <P2PIcon />,
    text: "Sell any token for USDC at a fixed price or at the live market price with a discount or premium. Buyers take all or part of a listing and pay native USDC in one transaction. Tokens stay in escrow until sold or withdrawn.",
    tags: ["Any token, no listing approval", "Market ± % or fixed price", "Partial fills, OTC mode"],
  },
  {
    key: "mcp",
    name: "Arc Kit MCP",
    live: true,
    href: "https://www.npmjs.com/package/arckit-pay-mcp",
    cta: "Install from npm",
    icon: <AgentIcon />,
    text: "Give Claude, Cursor or any AI agent its own USDC wallet on Arc. Say \"buy me a $10 Starbucks card\": it quotes the price, waits for your yes, and the code lands in the chat. One line to install.",
    tags: ["npx -y arckit-pay-mcp", "Works with any MCP client", "You approve every purchase"],
  },
  {
    key: "redeploy",
    name: "Arc Redeployment",
    icon: <MigrateIcon />,
    text: "Move an existing project from another chain to Arc automatically: contracts, holders and balances, verified on arrival.",
    tags: ["Snapshot holders", "Redeploy contracts", "Verify source"],
  },
];

export function Home() {
  const now = useNow();
  const navigate = useNavigate();
  const { locks, isLoading, isError, total } = useAllLocks(60);
  const fee = useLockFee();
  const tokens = useMemo(() => (locks ?? []).map((l) => l.token), [locks]);
  const metas = useTokenMetas(tokens);
  const [q, setQ] = useState("");

  const active = useMemo(() => (locks ?? []).filter((l) => lockStatus(l, now) === "locked"), [locks, now]);
  const distinctTokens = useMemo(() => new Set((locks ?? []).map((l) => l.token.toLowerCase())).size, [locks]);
  const featured = active[0] ?? locks?.[0];

  return (
    <>
      <section className="hero-band">
        <HeroArt />
        <div className="wrap hero">
          <div className="rise">
            <div className="eyebrow">Arc Kit · built for Arc</div>
            <h1 style={{ marginTop: 16 }}>
              Lock, prove
              <br />
              and launch <span className="accent">on Arc</span>
            </h1>
            <p className="lede" style={{ marginTop: 22 }}>
              A growing set of tools for teams building on Arc. Start with ArcLock: lock tokens or LP on-chain until a
              public date, then share a certificate your community can verify in one tap. No one, including us, can open
              it early.
            </p>
            <div className="hero-actions">
              <Link to="/lock/new" className="btn btn-primary btn-lg">
                Create a lock
              </Link>
              <Link to="/explore" className="btn btn-ghost btn-lg">
                Browse locks
              </Link>
              <a href={APK_URL} className="btn btn-ghost btn-lg" download title="Arc Kit Wallet for Android, version 1.0.0">
                <AndroidIcon />
                Download app
              </a>
            </div>
            <div className="hero-stats">
              <div>
                <div className="n">{total ?? "—"}</div>
                <div className="l">locks created</div>
              </div>
              <div>
                <div className="n">{locks ? active.length : "—"}</div>
                <div className="l">active now</div>
              </div>
              <div>
                <div className="n">{locks ? distinctTokens : "—"}</div>
                <div className="l">tokens locked</div>
              </div>
            </div>
          </div>
          <div className="rise rise-2">
            {featured ? (
              <div
                role="link"
                tabIndex={0}
                style={{ cursor: "pointer" }}
                aria-label={`Open lock ${featured.id.toString()}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) return; // let explorer links inside work normally
                  navigate(`/lock/${featured.id.toString()}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate(`/lock/${featured.id.toString()}`);
                }}
              >
                <Certificate lock={featured} meta={metas.get(featured.token.toLowerCase())} now={now} />
                <p className="tiny faint center" style={{ marginTop: 10 }}>
                  Latest lock on Arc. Click to open its page.
                </p>
              </div>
            ) : (
              <NetworkCard total={total} fee={fee.data} />
            )}
          </div>
        </div>
      </section>

      {/* ---------- Suite ---------- */}
      <section className="wrap section">
        <div className="section-head">
          <div className="eyebrow">The suite</div>
          <h2>Ten tools, one chain</h2>
        </div>

        <div className="feature-hero rise">
          <div className="feature-hero-text">
            <div className="row" style={{ gap: 10 }}>
              <div className="icon">
                <LockIcon />
              </div>
              <span className="pill pill-live">Live now</span>
            </div>
            <h3>ArcLock</h3>
            <p>
              Cliff locks and linear vesting for any token or LP position. Lock everything until one date, or vest it
              over months with an optional cliff. Every lock and schedule gets a public certificate with a live countdown
              that anyone can verify.
            </p>
            <div className="feature-facts">
              <div>
                <div className="v">{fee.data !== undefined ? fmtUsdc(fee.data) : "…"}</div>
                <div className="k">flat fee per lock</div>
              </div>
              <div>
                <div className="v">Lock or vest</div>
                <div className="k">one date, or linear with cliff</div>
              </div>
              <div>
                <div className="v">Public</div>
                <div className="k">shareable certificate</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link to="/lock/new" className="btn btn-primary">
                Create a lock
              </Link>
              <Link to="/vest/new" className="btn btn-ghost">
                Create vesting
              </Link>
            </div>
          </div>
          <div className="feature-hero-art" aria-hidden="true">
            <Dial progress={0.62} value="137" label="days left" animate={false} />
          </div>
        </div>

        <div className="features">
          {TOOLS.map((f) =>
            f.live && f.href ? (
              <a key={f.key} href={f.href} target="_blank" rel="noreferrer" className="card feature live">
                <div className="row between">
                  <div className="icon">{f.icon}</div>
                  <span className="pill pill-live">Live</span>
                </div>
                <h3>{f.name}</h3>
                <p>{f.text}</p>
                <div className="tags">
                  {f.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
                <span className="cta">{f.cta} ↗</span>
              </a>
            ) : f.live ? (
              <Link key={f.key} to={f.to!} className="card feature live">
                <div className="row between">
                  <div className="icon">{f.icon}</div>
                  <span className="pill pill-live">Live</span>
                </div>
                <h3>{f.name}</h3>
                <p>{f.text}</p>
                <div className="tags">
                  {f.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
                <span className="cta">{f.cta} →</span>
              </Link>
            ) : (
              <div key={f.key} className="card feature soon">
                <div className="row between">
                  <div className="icon">{f.icon}</div>
                  <span className="pill pill-soon">Coming soon</span>
                </div>
                <h3>{f.name}</h3>
                <p>{f.text}</p>
                <div className="tags">
                  {f.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="wrap section">
        <div className="section-head">
          <div className="eyebrow">ArcLock · how it works</div>
          <h2>Three steps to a verifiable lock</h2>
        </div>
        <ol className="timeline">
          <li className="tl-step">
            <div className="tl-num">1</div>
            <div className="tl-mock" aria-hidden="true">
              <div className="mock-row">
                <span className="mock-chip mono">0x7a3f…c21e</span>
                <span className="mock-ok">ERC20 ✓</span>
              </div>
              <div className="mock-btn">Approve 2,500,000 TOKEN</div>
            </div>
            <h3>Approve the token</h3>
            <p className="muted">Paste the token or LP address. The locker asks for permission to move exactly the amount you are locking, nothing more.</p>
          </li>
          <li className="tl-step">
            <div className="tl-num">2</div>
            <div className="tl-mock" aria-hidden="true">
              <div className="mock-row">
                <span className="mock-pill">30d</span>
                <span className="mock-pill on">90d</span>
                <span className="mock-pill">1y</span>
                <span className="mock-pill">Custom</span>
              </div>
              <div className="mock-btn">Lock · fee {fee.data !== undefined ? fmtUsdc(fee.data) : "10 USDC"}</div>
            </div>
            <h3>Pick the date</h3>
            <p className="muted">Choose a preset or a custom date. One flat fee. The tokens leave your wallet and sit in the contract until the date arrives.</p>
          </li>
          <li className="tl-step">
            <div className="tl-num">3</div>
            <div className="tl-mock" aria-hidden="true">
              <div className="mock-row">
                <span className="mock-chip mono" style={{ flex: 1 }}>arckit.xyz/lock/42</span>
                <span className="mock-copy">Copy</span>
              </div>
              <div className="mock-row" style={{ marginTop: 8 }}>
                <span className="pill pill-locked">Locked</span>
                <span className="tiny muted">opens in 137 days</span>
              </div>
            </div>
            <h3>Share the certificate</h3>
            <p className="muted">Every lock has a public link with a live countdown. Pin it in your community so anyone can verify without trusting you.</p>
          </li>
        </ol>
      </section>

      {/* ---------- Recent ---------- */}
      <section className="wrap section">
        <div className="page-head">
          <div>
            <div className="eyebrow">Recent</div>
            <h2>Latest locks</h2>
          </div>
          <form
            className="input-row search"
            onSubmit={(e) => {
              e.preventDefault();
              if (isValidAddress(q)) navigate(`/token/${q}`);
            }}
          >
            <input
              className="input mono"
              placeholder="Look up a token address 0x…"
              value={q}
              onChange={(e) => setQ(e.target.value.trim())}
              aria-label="Token address"
            />
            <button className="btn btn-soft" type="submit" disabled={!isValidAddress(q)}>
              View
            </button>
          </form>
        </div>

        {isError && !locks ? (
          <div className="empty">
            <p>Arc's RPC is not answering right now, so locks cannot be listed. This page retries on its own.</p>
          </div>
        ) : isLoading ? (
          <div className="grid-cards">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card card-tight" style={{ height: 128 }} />
            ))}
          </div>
        ) : locks && locks.length > 0 ? (
          <div className="grid-cards">
            {locks.slice(0, 6).map((l) => (
              <LockCard key={l.id.toString()} lock={l} meta={metas.get(l.token.toLowerCase())} now={now} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>No locks on Arc yet.</p>
            <p style={{ marginTop: 12 }}>
              <Link to="/lock/new" className="btn btn-primary">
                Create the first one
              </Link>
            </p>
          </div>
        )}
      </section>
    </>
  );
}

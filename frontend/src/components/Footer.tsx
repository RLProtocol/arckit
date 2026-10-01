import { Link } from "react-router-dom";
import { AIRDROP_ADDRESS, ARCFLOW_ADDRESS, LOCKER_ADDRESS, POSITIONS_ADDRESS, STAKING_ADDRESS, VAULT_V2_ADDRESS, VESTING_ADDRESS, explorerAddress } from "@/contracts";
import { ArcMark } from "@/components/Nav";
import { shortAddr } from "@/lib/format";
import { ARCLEND_ADDRESS } from "@/hooks/useArcLend";
import { ARCP2P_ADDRESS } from "@/hooks/useArcP2P";

export const SOCIALS = {
  x: "https://x.com/usearckit",
  telegram: "https://t.me/usearckit",
};

const XIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.9l-5.4-7.06L3.9 22H.64l8.02-9.17L.5 2h7.08l4.88 6.45L18.244 2Zm-1.21 18h1.8L7.05 3.9H5.12L17.03 20Z" />
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M21.9 4.6 18.8 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.8 13.3 2.2 11.9c-1-.3-1-1 .2-1.5L20.6 3.5c.8-.3 1.6.2 1.3 1.1Z" />
  </svg>
);

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand" aria-label="Arc Kit home">
            <ArcMark size={28} />
            <span>
              Arc<span className="thin"> Kit</span>
            </span>
          </Link>
          <p className="muted small" style={{ maxWidth: 320 }}>
            On-chain tools for teams building on Arc. Lock, vest, stake and distribute tokens with public, verifiable proofs.
          </p>
          <div className="socials">
            <a href={SOCIALS.x} target="_blank" rel="noreferrer" className="social" aria-label="Arc Kit on X">
              <XIcon /> <span>@usearckit</span>
            </a>
            <a href={SOCIALS.telegram} target="_blank" rel="noreferrer" className="social" aria-label="Arc Kit on Telegram">
              <TelegramIcon /> <span>t.me/usearckit</span>
            </a>
          </div>
        </div>

        <div className="footer-col">
          <div className="footer-head">Tools</div>
          <Link to="/lock/new">Lock tokens or LP</Link>
          <Link to="/vest/new">Vest tokens</Link>
          <Link to="/airdrop">Bulk airdrop</Link>
          <Link to="/pay">ArcPay: spend USDC</Link>
          <Link to="/cash">ArcCash: private transfers</Link>
          <Link to="/lend">ArcLend: borrow USDC</Link>
          <Link to="/p2p">ArcP2P: trade peer to peer</Link>
          <Link to="/docs">Documentation</Link>
          <Link to="/stake">Staking pools</Link>
          <Link to="/flow">ArcFlow stakes and pools</Link>
          <Link to="/flow/locks">Locked v4 liquidity</Link>
          <Link to="/explore">Explore locks</Link>
          <Link to="/my">My locks</Link>
        </div>

        <div className="footer-col">
          <div className="footer-head">Coming soon</div>
          <span className="faint">Arc Redeployment</span>
        </div>

        <div className="footer-col">
          <div className="footer-head">Contracts on Arc</div>
          <a href={explorerAddress(LOCKER_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
            Locker · {shortAddr(LOCKER_ADDRESS, 6)}
          </a>
          <a href={explorerAddress(VESTING_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
            Vesting · {shortAddr(VESTING_ADDRESS, 6)}
          </a>
          <a href={explorerAddress(AIRDROP_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
            Airdrop · {shortAddr(AIRDROP_ADDRESS, 6)}
          </a>
          {STAKING_ADDRESS && (
            <a href={explorerAddress(STAKING_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
              Staking · {shortAddr(STAKING_ADDRESS, 6)}
            </a>
          )}
          {ARCFLOW_ADDRESS && (
            <a href={explorerAddress(ARCFLOW_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
              ArcFlow · {shortAddr(ARCFLOW_ADDRESS, 6)}
            </a>
          )}
          {VAULT_V2_ADDRESS && (
            <a href={explorerAddress(VAULT_V2_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
              Flow stakes · {shortAddr(VAULT_V2_ADDRESS, 6)}
            </a>
          )}
          {POSITIONS_ADDRESS && (
            <a href={explorerAddress(POSITIONS_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
              Flow pools · {shortAddr(POSITIONS_ADDRESS, 6)}
            </a>
          )}
          {ARCLEND_ADDRESS && (
            <a href={explorerAddress(ARCLEND_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
              ArcLend · {shortAddr(ARCLEND_ADDRESS, 6)}
            </a>
          )}
          {ARCP2P_ADDRESS && (
            <a href={explorerAddress(ARCP2P_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
              ArcP2P · {shortAddr(ARCP2P_ADDRESS, 6)}
            </a>
          )}
          <span className="faint tiny">Chain 5042 · fees in USDC</span>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>© {year} Arc Kit. Contracts are immutable and source-verified on Etherscan.</span>
        <span className="row" style={{ gap: 14 }}>
          <a href={SOCIALS.x} target="_blank" rel="noreferrer" aria-label="X">
            <XIcon />
          </a>
          <a href={SOCIALS.telegram} target="_blank" rel="noreferrer" aria-label="Telegram">
            <TelegramIcon />
          </a>
        </span>
      </div>
    </footer>
  );
}

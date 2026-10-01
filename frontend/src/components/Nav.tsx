import { Link, NavLink } from "react-router-dom";
import { ConnectButton } from "@/components/ConnectButton";
import { LangSwitch } from "@/i18n";

/** Brand mark: the Arc Kit wrench-and-screwdriver logo (public/logo.png, navy background baked in). */
export function ArcMark({ size = 32 }: { size?: number }) {
  return <img src="/icon-64.png" srcSet="/icon-64.png 1x, /icon-180.png 2x" width={size} height={size} alt="" className="brand-mark" />;
}

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link to="/" className="brand" aria-label="Arc Kit home">
          <ArcMark />
          <span>
            Arc<span className="thin"> Kit</span>
          </span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/lock/new">Lock</NavLink>
          <NavLink to="/vest/new">Vest</NavLink>
          <NavLink to="/airdrop">Airdrop</NavLink>
          <NavLink to="/pay">Pay</NavLink>
          <NavLink to="/cash">Cash</NavLink>
          <NavLink to="/lend">Lend</NavLink>
          <NavLink to="/p2p">P2P</NavLink>
          <NavLink to="/stake">Stake</NavLink>
          <NavLink to="/flow">Flow</NavLink>
          <NavLink to="/explore">Explore</NavLink>
          <NavLink to="/my">My locks</NavLink>
          <NavLink to="/docs">Docs</NavLink>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <LangSwitch />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

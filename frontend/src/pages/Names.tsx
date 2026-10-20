import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { isValidName, normalizeName, useMyNames, useNameInfo, usePrimaryName, type NameInfo } from "@/hooks/useArcNames";
import { fmtNameDate } from "@/components/NameForms";

const fmtUsdc = (wei: bigint) => Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 2 });

const Search = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const Chevron = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>;

/** The NFT-style card for a name, matching the on-chain token image. */
export function NameNft({ label, expires, primary, to }: { label: string; expires?: bigint; primary?: boolean; to?: string }) {
  const body = (
    <>
      <div className="mark">ARC NAME</div>
      <div>
        <div className="label">{label}<span>.arc</span></div>
        {expires !== undefined ? <div className="foot"><span>until {fmtNameDate(expires)}</span>{primary ? <span className="an-chip ok">primary</span> : null}</div> : null}
      </div>
    </>
  );
  return to ? <Link to={to} className="an-nft">{body}</Link> : <div className="an-nft">{body}</div>;
}

/** /names: search first, like a name service should be. */
export function Names() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const label = normalizeName(q);
  useEffect(() => { const t = setTimeout(() => setParams(label ? { q: label } : {}, { replace: true }), 400); return () => clearTimeout(t); }, [label, setParams]);

  return (
    <div className="wrap page names">
      <section className="an-hero">
        <span className="an-badge"><i />.arc names · live on Arc</span>
        <h1 className="an-title">Your name<br /><em>on Arc.</em></h1>
        <p className="an-sub">One readable name for getting paid, your profile across Arc Kit, and your own website.</p>
        <label className="an-search">
          <Search />
          <input value={q} placeholder="Search for a name" autoFocus autoCapitalize="none" spellCheck={false} aria-label="Search for a name" onChange={(e) => setQ(e.target.value.replace(/\s/g, ""))} />
          <span className="an-tld">.arc</span>
        </label>
        {label ? <Result label={label} /> : <div className="an-hint">Lowercase letters, numbers and hyphens · 3 to 32 characters</div>}
      </section>

      <MyNames />

      <section className="an-section">
        <h3>Simple yearly pricing</h3>
        <p className="muted">Paid in USDC, 1 to 10 years at a time. Anyone can renew a name, and you get a 30-day grace period after it expires.</p>
        <div className="an-tiers">
          <div className="an-tier"><div className="k">5+ characters</div><div className="v">5<small>USDC / year</small></div><div className="e">satoshi.arc</div></div>
          <div className="an-tier"><div className="k">4 characters</div><div className="v">20<small>USDC / year</small></div><div className="e">mint.arc</div></div>
          <div className="an-tier"><div className="k">3 characters</div><div className="v">50<small>USDC / year</small></div><div className="e">arc.arc</div></div>
        </div>
      </section>

      <section className="an-section" style={{ marginBottom: 24 }}>
        <h3>One name, everywhere on Arc</h3>
        <p className="muted">Your name is an NFT you own. Point it at any wallet, change it any time.</p>
        <div className="an-features">
          <div className="an-feature"><div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><h4>Get paid at a name</h4><p>Send to satoshi.arc instead of a 42-character address. Works in the Arc Kit app today.</p></div>
          <div className="an-feature"><div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg></div><h4>One profile</h4><p>Avatar, bio and links that show wherever your name appears, with a shareable profile page.</p></div>
          <div className="an-feature"><div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg></div><h4>A website on IPFS</h4><p>Upload a folder and it goes live at yourname.usearckit.online. No server, no hosting bill.</p></div>
        </div>
      </section>
    </div>
  );
}

function Result({ label }: { label: string }) {
  const q = useNameInfo(label);
  const i = q.data as NameInfo | undefined;
  if (!isValidName(label)) {
    return <div className="an-result"><div className="an-avatar" style={{ width: 44, height: 44 }}>?</div><div><div className="an-name">{label}.arc</div><div className="an-meta">Use a-z, 0-9 and hyphens, 3 to 32 characters, not starting or ending with a hyphen.</div></div><div className="an-go"><span className="an-chip bad">Invalid</span></div></div>;
  }
  const chip = !i ? <span className="an-chip">Checking…</span>
    : i.available ? <span className="an-chip ok">Available</span>
    : i.isReserved && i.owner === "0x0000000000000000000000000000000000000000" ? <span className="an-chip warn">Reserved</span>
    : Number(i.expires) * 1000 < Date.now() ? <span className="an-chip warn">In grace period</span>
    : <span className="an-chip taken">Registered</span>;
  const meta = !i ? "" : i.available ? `${fmtUsdc(i.yearlyPrice)} USDC per year` : i.isReserved && i.owner === "0x0000000000000000000000000000000000000000" ? "Held back for the Arc Kit team" : `Registered until ${fmtNameDate(i.expires)}`;
  return (
    <Link to={`/names/${label}`} className="an-result">
      <div className="an-avatar" style={{ width: 44, height: 44 }}>{label[0].toUpperCase()}</div>
      <div style={{ minWidth: 0 }}><div className="an-name">{label}.arc</div><div className="an-meta">{meta}</div></div>
      <div className="an-go">{chip}<Chevron /></div>
    </Link>
  );
}

function MyNames() {
  const { address } = useAccount();
  const q = useMyNames(address);
  const primary = usePrimaryName(address);
  const [labels, expires] = (q.data as readonly [readonly string[], readonly bigint[]] | undefined) ?? [[], []];
  if (!address || !labels.length) return null;
  return (
    <section className="an-section">
      <div className="row between" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 26 }}>Your names</h3>
        <Link to="/profile" className="btn btn-ghost btn-sm">Open profile</Link>
      </div>
      <div className="an-grid">{labels.map((l, i) => <NameNft key={l} label={l} expires={expires[i]} primary={primary.data === l} to={`/names/${l}`} />)}</div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { arc } from "@/wagmi";
import { useTx } from "@/hooks/useTx";
import { RequireWallet } from "@/components/RequireWallet";
import { TxStatus } from "@/components/TxStatus";
import { NameCard } from "@/components/NameCard";
import { AddressPanel, Profile as ProfileForm, Renew, Website } from "@/pages/Names";
import { arcNamesAbi, isValidName, NAMES_ADDRESS, normalizeName, useMyNames, useNameInfo, usePrimaryName, type NameInfo } from "@/hooks/useArcNames";

const fmtDate = (sec: bigint | number) => new Date(Number(sec) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** /profile: the connected wallet's .arc identity, with everything editable in one place. */
export function Profile() {
  return (
    <div className="wrap page profile">
      <div className="page-head"><div><div className="eyebrow">Profile</div><h2>Your Arc identity.</h2></div></div>
      <RequireWallet what="see your profile"><MyProfile /></RequireWallet>
    </div>
  );
}

type Panel = "profile" | "website" | "address" | "renew";

function MyProfile() {
  const { address } = useAccount();
  const names = useMyNames(address);
  const primary = usePrimaryName(address);
  const [labels, expires] = (names.data as readonly [readonly string[], readonly bigint[]] | undefined) ?? [[], []];
  const [sel, setSel] = useState("");
  const [panel, setPanel] = useState<Panel>("profile");
  useEffect(() => { if (!sel && labels.length) setSel(primary.data && labels.includes(primary.data) ? primary.data : labels[0]); }, [labels, primary.data, sel]);
  const info = useNameInfo(sel).data as NameInfo | undefined;
  const primaryTx = useTx();

  if (names.isLoading) return <p className="muted">Loading your names…</p>;
  if (!labels.length) {
    return (
      <div className="empty">
        <h3>No .arc name yet</h3>
        <p className="muted" style={{ marginTop: 6 }}>Get a name to have a profile, a payment address people can remember, and a website.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}><Link className="btn btn-primary" to="/names">Find a name</Link></div>
      </div>
    );
  }
  const isPrimary = primary.data === sel;
  const pointsHere = !!info && !!address && info.addr.toLowerCase() === address.toLowerCase();
  const idx = labels.indexOf(sel);

  return (
    <div className="stack" style={{ gap: 18 }}>
      {labels.length > 1 ? (
        <div className="presets">{labels.map((l) => <button key={l} type="button" className={`preset ${sel === l ? "on" : ""}`} onClick={() => setSel(l)}>{l}.arc{primary.data === l ? " ★" : ""}</button>)}</div>
      ) : null}
      {sel ? <NameCard label={sel} addr={info?.addr} website={info?.contenthash} /> : null}
      <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {isPrimary ? <span className="pill pill-live">primary name</span> : null}
          {idx >= 0 ? <span className="pill pill-role">until {fmtDate(expires[idx])}</span> : null}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost btn-sm" to={`/n/${sel}`}>Public profile</Link>
          {!isPrimary ? <button className="btn btn-ghost btn-sm" disabled={!pointsHere || primaryTx.busy} title={pointsHere ? "" : "Point the name at this wallet first (Address tab)"} onClick={() => primaryTx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setPrimaryName", args: [sel], chainId: arc.id })}>{primaryTx.busy ? "Saving…" : "Make primary"}</button> : null}
        </div>
      </div>
      <TxStatus tx={primaryTx} done={`${sel}.arc is your primary name. It now shows across Arc Kit.`} />
      <div className="card stack" style={{ gap: 14 }}>
        <div className="presets">
          {(["profile", "website", "address", "renew"] as Panel[]).map((p) => <button key={p} type="button" className={`preset ${panel === p ? "on" : ""}`} onClick={() => setPanel(p)}>{p === "profile" ? "Edit profile" : p === "website" ? "Website" : p === "address" ? "Payment address" : "Renew"}</button>)}
        </div>
        {panel === "profile" ? <ProfileForm key={sel} label={sel} /> : null}
        {panel === "website" ? <Website key={sel} label={sel} current={info?.contenthash ?? ""} /> : null}
        {panel === "address" ? <AddressPanel key={sel} label={sel} current={info?.addr} /> : null}
        {panel === "renew" ? <Renew key={sel} label={sel} info={info} /> : null}
      </div>
    </div>
  );
}

/** /n/:label, a shareable public profile for any name. */
export function NameProfile() {
  const { label: raw = "" } = useParams();
  const label = normalizeName(raw);
  const q = useNameInfo(label);
  const i = q.data as NameInfo | undefined;
  const { address } = useAccount();
  const active = !!i && i.owner !== "0x0000000000000000000000000000000000000000" && Number(i.expires) * 1000 > Date.now();
  return (
    <div className="wrap page" style={{ maxWidth: 720 }}>
      {!isValidName(label) ? <div className="notice notice-warn">That is not a valid .arc name.</div>
        : !i ? <p className="muted">Loading…</p>
        : !active ? (
          <div className="empty">
            <h3>{label}.arc is {i.available ? "available" : "not active"}</h3>
            <p className="muted" style={{ marginTop: 6 }}>{i.available ? "Nobody owns this name yet." : "This name has expired or is reserved."}</p>
            {i.available ? <div className="row" style={{ justifyContent: "center", marginTop: 18 }}><Link className="btn btn-primary" to={`/names?q=${label}`}>Get {label}.arc</Link></div> : null}
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            <NameCard label={label} addr={i.addr} website={i.contenthash} />
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard.writeText(`https://www.usearckit.online/n/${label}`)}>Copy profile link</button>
              {address && i.owner.toLowerCase() === address.toLowerCase() ? <Link className="btn btn-ghost btn-sm" to="/profile">Edit</Link> : null}
            </div>
            <p className="small muted">Send USDC or tokens to <span className="mono">{label}.arc</span> from the Arc Kit app; it pays {(i.addr as Address).slice(0, 8)}…</p>
          </div>
        )}
    </div>
  );
}

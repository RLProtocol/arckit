import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { RequireWallet } from "@/components/RequireWallet";
import { NamePage } from "@/pages/NamePage";
import { normalizeName, useMyNames, usePrimaryName } from "@/hooks/useArcNames";

/** /profile: the connected wallet's names; the primary one opens first. */
export function Profile() {
  return (
    <div className="wrap page profile">
      <RequireWallet what="see your profile"><MyProfile /></RequireWallet>
    </div>
  );
}

function MyProfile() {
  const { address } = useAccount();
  const names = useMyNames(address);
  const primary = usePrimaryName(address);
  const [labels] = (names.data as readonly [readonly string[], readonly bigint[]] | undefined) ?? [[], []];
  const [sel, setSel] = useState("");
  useEffect(() => { if (!sel && labels.length) setSel(primary.data && labels.includes(primary.data) ? primary.data : labels[0]); }, [labels, primary.data, sel]);

  if (names.isLoading) return <p className="muted">Loading your names…</p>;
  if (!labels.length) {
    return (
      <div className="an-hero" style={{ paddingTop: 48 }}>
        <span className="an-badge"><i />Profile</span>
        <h1 className="an-title" style={{ fontSize: "clamp(36px, 6vw, 56px)" }}>No .arc name <em>yet.</em></h1>
        <p className="an-sub">Get a name to have a profile, a payment address people can remember, and a website.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 24 }}><Link className="btn btn-primary btn-lg" to="/names">Find your name</Link></div>
      </div>
    );
  }
  return (
    <>
      {labels.length > 1 ? (
        <div className="an-page"><div className="an-tabs" style={{ marginTop: 8 }}>{labels.map((l) => <button key={l} className={sel === l ? "on" : ""} onClick={() => setSel(l)}>{l}.arc{primary.data === l ? " ★" : ""}</button>)}</div></div>
      ) : null}
      {sel ? <NamePage labelOverride={sel} embedded /> : null}
    </>
  );
}

/** /n/:label keeps old links working. */
export function NameProfile() {
  const { label = "" } = useParams();
  return <Navigate to={`/names/${normalizeName(label)}`} replace />;
}

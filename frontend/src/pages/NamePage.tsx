import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { formatEther, type Address } from "viem";
import { arc } from "@/wagmi";
import { explorerAddress } from "@/contracts";
import { shortAddr } from "@/lib/format";
import { useTx } from "@/hooks/useTx";
import { TxStatus } from "@/components/TxStatus";
import { ConnectButton } from "@/components/ConnectButton";
import { useNameTexts } from "@/components/NameCard";
import { EditAddress, EditProfile, EditWebsite, fmtNameDate, RenewForm, YearsPicker } from "@/components/NameForms";
import { NameNft } from "@/pages/Names";
import { arcNamesAbi, ipfsHttp, isValidName, NAMES_ADDRESS, normalizeName, siteUrl, TEXT_KEYS, useNameInfo, usePrimaryName, type NameInfo } from "@/hooks/useArcNames";

const ZERO = "0x0000000000000000000000000000000000000000";
const fmtUsdc = (wei: bigint) => Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const handle = (v: string) => v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "").replace(/^https?:\/\/t\.me\//, "").replace(/\/$/, "");

/** /names/:label (also /n/:label): one name, the way a name service shows it. */
export function NamePage({ labelOverride, embedded }: { labelOverride?: string; embedded?: boolean }) {
  const params = useParams();
  const label = normalizeName(labelOverride ?? params.label ?? "");
  const q = useNameInfo(label);
  const i = q.data as NameInfo | undefined;
  const { address } = useAccount();
  const primary = usePrimaryName(address);
  const { texts } = useNameTexts(i && !i.available ? label : "");
  const [copied, setCopied] = useState(false);

  if (!isValidName(label)) return <div className="wrap page"><div className="notice notice-warn">That is not a valid .arc name.</div></div>;
  const registered = !!i && i.owner !== ZERO;
  const expired = registered && Number(i!.expires) * 1000 < Date.now();
  const reserved = !!i && i.isReserved && !registered;
  const isOwner = registered && !!address && i!.owner.toLowerCase() === address.toLowerCase();
  const avatar = texts.avatar ? ipfsHttp(texts.avatar) : "";

  const chips = !i ? <span className="an-chip">Loading…</span> : (
    <>
      {i.available ? <span className="an-chip ok">Available</span> : reserved ? <span className="an-chip warn">Reserved</span> : expired ? <span className="an-chip warn">Expired · in grace</span> : <span className="an-chip taken">Registered</span>}
      {registered ? <span className="an-chip">until {fmtNameDate(i.expires)}</span> : null}
      {registered && primary.data === label && isOwner ? <span className="an-chip ok">Your primary name</span> : null}
      {isOwner ? <span className="an-chip">You own this</span> : null}
    </>
  );

  return (
    <div className={embedded ? "" : "wrap page"}>
      <div className="an-page">
        {!embedded ? <Link to="/names" className="an-back">← All names</Link> : null}
        <header className="an-head">
          <div className="an-banner" />
          <div className="an-id">
            <div className="an-avatar">{avatar ? <img src={avatar} alt="" /> : label[0].toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1>{label}<span>.arc</span></h1>
              <div className="an-chips">{chips}</div>
            </div>
            <div className="an-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard.writeText(`https://www.usearckit.online/names/${label}`); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? "Copied" : "Copy link"}</button>
              {registered && i!.contenthash ? <a className="btn btn-primary btn-sm" href={siteUrl(label)} target="_blank" rel="noreferrer">Visit website ↗</a> : null}
            </div>
          </div>
        </header>

        <div className="an-body">
          <div>
            {!i ? <div className="an-panel"><p className="muted">Reading the name…</p></div>
              : i.available ? <Register label={label} info={i} />
              : reserved ? <div className="an-panel"><h3>Reserved</h3><p className="muted small" style={{ margin: 0 }}>{label}.arc is held back for the Arc Kit team to stop impersonation. It is not for sale.</p></div>
              : <Registered label={label} info={i} isOwner={isOwner} isPrimary={primary.data === label} me={address} texts={texts} />}
          </div>
          <aside>
            <NameNft label={label} expires={registered ? i!.expires : undefined} />
            <div className="an-panel" style={{ marginTop: 14 }}>
              <div className="an-facts" style={{ marginTop: 0 }}>
                <div><span>Status</span><span>{!i ? "…" : i.available ? "Available" : reserved ? "Reserved" : expired ? "In grace period" : "Active"}</span></div>
                {registered ? <div><span>Owner</span><span><a href={explorerAddress(i!.owner)} target="_blank" rel="noreferrer">{shortAddr(i!.owner, 5)}</a></span></div> : null}
                {registered ? <div><span>Expires</span><span>{fmtNameDate(i!.expires)}</span></div> : null}
                <div><span>Price</span><span>{i ? `${fmtUsdc(i.yearlyPrice)} USDC / yr` : "…"}</span></div>
                <div><span>Standard</span><span>ERC-721</span></div>
                {NAMES_ADDRESS ? <div><span>Contract</span><span><a href={`${explorerAddress(NAMES_ADDRESS)}#code`} target="_blank" rel="noreferrer">{shortAddr(NAMES_ADDRESS, 4)}</a></span></div> : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Register({ label, info }: { label: string; info: NameInfo }) {
  const { address, isConnected } = useAccount();
  const [years, setYears] = useState(1);
  const tx = useTx();
  const cost = info.yearlyPrice * BigInt(years);
  const step = tx.isSuccess ? 2 : tx.busy ? 1 : 0;
  if (tx.isSuccess) {
    return (
      <div className="an-panel an-done">
        <div className="an-steps"><div className="done"><i /><span>Choose duration</span></div><div className="done"><i /><span>Confirm</span></div><div className="done"><i /><span>Done</span></div></div>
        <div className="big">✓</div>
        <h3>{label}.arc is yours</h3>
        <p className="muted small">Registered for {years} {years === 1 ? "year" : "years"}. Set up your profile, add a website, and make it your primary name.</p>
        <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 12 }}><Link className="btn btn-primary" to="/profile">Set up your profile</Link></div>
      </div>
    );
  }
  return (
    <div className="an-panel">
      <div className="an-steps">
        <div className={step === 0 ? "now" : "done"}><i /><span>Choose duration</span></div>
        <div className={step === 1 ? "now" : ""}><i /><span>Confirm in wallet</span></div>
        <div><i /><span>Done</span></div>
      </div>
      <h3>Register {label}.arc</h3>
      <p className="muted small" style={{ margin: "0 0 16px" }}>Pick how long to hold it. You can renew any time before it expires.</p>
      <YearsPicker years={years} setYears={setYears} yearly={info.yearlyPrice} />
      <div className="an-sum">
        <div><span>{years} {years === 1 ? "year" : "years"} registration</span><span className="mono">{fmtUsdc(cost)} USDC</span></div>
        <div><span>Network fee</span><span>under 0.01 USDC</span></div>
        <div className="total"><span>Total</span><span className="mono">{fmtUsdc(cost)} USDC</span></div>
      </div>
      <div style={{ marginTop: 18 }}>
        {isConnected ? (
          <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "register", args: [label, BigInt(years), address!], value: cost, chainId: arc.id })}>
            {tx.isSigning ? "Confirm in your wallet…" : tx.isConfirming ? "Registering…" : `Register for ${fmtUsdc(cost)} USDC`}
          </button>
        ) : <div className="row" style={{ justifyContent: "center" }}><ConnectButton /></div>}
        <TxStatus tx={tx} />
      </div>
    </div>
  );
}

type Tab = "profile" | "records" | "ownership";

function Registered({ label, info, isOwner, isPrimary, me, texts }: { label: string; info: NameInfo; isOwner: boolean; isPrimary: boolean; me?: Address; texts: Record<string, string> }) {
  const [tab, setTab] = useState<Tab>("profile");
  const [editing, setEditing] = useState<"" | "profile" | "website" | "address" | "renew">("");
  useEffect(() => { setEditing(""); }, [tab, label]);
  const primaryTx = useTx();
  const pointsHere = !!me && info.addr.toLowerCase() === me.toLowerCase();
  const links: [string, string, string][] = [];
  if (texts.url) links.push(["Website", texts.url.replace(/^https?:\/\//, ""), /^https?:\/\//.test(texts.url) ? texts.url : `https://${texts.url}`]);
  if (texts["com.twitter"]) links.push(["X", `@${handle(texts["com.twitter"])}`, `https://x.com/${handle(texts["com.twitter"])}`]);
  if (texts["org.telegram"]) links.push(["Telegram", handle(texts["org.telegram"]), `https://t.me/${handle(texts["org.telegram"])}`]);
  if (texts["com.github"]) links.push(["GitHub", handle(texts["com.github"]), `https://github.com/${handle(texts["com.github"])}`]);
  const editBtn = (what: typeof editing) => isOwner ? <button className="btn btn-ghost btn-sm" onClick={() => setEditing(editing === what ? "" : what)}>{editing === what ? "Close" : "Edit"}</button> : null;

  return (
    <>
      <div className="an-tabs">
        {(["profile", "records", "ownership"] as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "profile" ? "Profile" : t === "records" ? "Records" : "Ownership"}</button>)}
      </div>

      {tab === "profile" ? (
        <div className="an-panel">
          <div className="row between"><h3>Profile</h3>{editBtn("profile")}</div>
          {editing === "profile" ? <div className="an-edit"><EditProfile label={label} onDone={() => setEditing("")} /></div> : (
            <>
              {texts.description ? <p style={{ margin: "8px 0 0", fontSize: 16 }}>{texts.description}</p> : <p className="muted small" style={{ margin: "8px 0 0" }}>{isOwner ? "No bio yet. Add an avatar, a bio and your links." : "No bio yet."}</p>}
              {links.length ? <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 16 }}>{links.map(([k, t, href]) => <a key={k} className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noreferrer">{t}</a>)}</div> : null}
              <div className="an-rows" style={{ marginTop: 16 }}>
                <div className="an-row"><span className="k">Pays to</span><span className="v">{info.addr !== ZERO ? info.addr : "—"}</span><button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard.writeText(info.addr)}>Copy</button></div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "records" ? (
        <div className="an-panel">
          <h3>Records</h3>
          <p className="muted small" style={{ margin: "0 0 8px" }}>What the name resolves to. Apps read these straight from the contract.</p>
          <div className="an-rows">
            <div className="an-row"><span className="k">Address · Arc</span><span className="v">{info.addr !== ZERO ? info.addr : "—"}</span>{editBtn("address")}</div>
            {editing === "address" ? <div className="an-edit"><EditAddress label={label} current={info.addr} /></div> : null}
            <div className="an-row"><span className="k">Website</span><span className={`v ${info.contenthash ? "" : "empty"}`}>{info.contenthash || "Not set"}</span>{editBtn("website")}</div>
            {editing === "website" ? <div className="an-edit"><EditWebsite label={label} current={info.contenthash} /></div> : null}
            {TEXT_KEYS.map(([k, l]) => <div key={k} className="an-row"><span className="k">{l}</span><span className={`v ${texts[k] ? "" : "empty"}`}>{texts[k] || "Not set"}</span>{k === "avatar" ? editBtn("profile") : <span />}</div>)}
            {editing === "profile" ? <div className="an-edit"><EditProfile label={label} onDone={() => setEditing("")} /></div> : null}
          </div>
        </div>
      ) : null}

      {tab === "ownership" ? (
        <div className="an-panel">
          <h3>Ownership</h3>
          <div className="an-rows" style={{ marginTop: 8 }}>
            <div className="an-row"><span className="k">Owner</span><span className="v">{info.owner}</span><a className="btn btn-ghost btn-sm" href={explorerAddress(info.owner)} target="_blank" rel="noreferrer">View</a></div>
            <div className="an-row"><span className="k">Expires</span><span className="v">{fmtNameDate(info.expires)}</span>{editBtn("renew") ?? <span />}</div>
            {editing === "renew" ? <div className="an-edit"><RenewForm label={label} info={info} /></div> : null}
            {isOwner ? (
              <div className="an-row">
                <span className="k">Primary name</span>
                <span className="v" style={{ fontFamily: "var(--font-body)" }}>{isPrimary ? "This is your primary name." : pointsHere ? "Show this name instead of your address." : "Point the name at this wallet first (Records → Address)."}</span>
                {!isPrimary ? <button className="btn btn-primary btn-sm" disabled={!pointsHere || primaryTx.busy} onClick={() => primaryTx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setPrimaryName", args: [label], chainId: arc.id })}>{primaryTx.busy ? "Saving…" : "Make primary"}</button> : <span className="an-chip ok">Primary</span>}
              </div>
            ) : null}
          </div>
          <TxStatus tx={primaryTx} done={`${label}.arc is now your primary name.`} />
          {!isOwner ? <p className="muted small" style={{ margin: "12px 0 0" }}>Anyone can extend a name for its owner. Open the name from the owner&apos;s wallet to change records.</p> : null}
        </div>
      ) : null}
    </>
  );
}

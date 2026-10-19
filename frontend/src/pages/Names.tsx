import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useReadContracts } from "wagmi";
import { formatEther, isAddress, type Address } from "viem";
import { arc } from "@/wagmi";
import { explorerAddress } from "@/contracts";
import { shortAddr } from "@/lib/format";
import { useTx } from "@/hooks/useTx";
import { RequireWallet } from "@/components/RequireWallet";
import { TxStatus } from "@/components/TxStatus";
import { arcNamesAbi, ipfsHttp, isValidName, NAMES_ADDRESS, normalizeName, siteUrl, TEXT_KEYS, useMyNames, useNameInfo, usePrimaryName, type NameInfo } from "@/hooks/useArcNames";

const YEARS = [1, 2, 3, 5, 10];
const fmtUsdc = (wei: bigint) => Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtDate = (sec: bigint | number) => new Date(Number(sec) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const daysLeft = (sec: bigint) => Math.floor((Number(sec) - Date.now() / 1000) / 86_400);
const GRACE_DAYS = 30;

export function Names() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const label = normalizeName(q);
  useEffect(() => { const t = setTimeout(() => setParams(label ? { q: label } : {}, { replace: true }), 400); return () => clearTimeout(t); }, [label, setParams]);

  return (
    <div className="wrap page names">
      <div className="page-head">
        <div>
          <div className="eyebrow">.arc names</div>
          <h2>Your name on Arc.</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 640 }}>
            Get paid at <span className="mono">yourname.arc</span> instead of a 42-character address, show it across Arc Kit, and host a website at <span className="mono">yourname.usearckit.online</span>.
          </p>
        </div>
      </div>

      <div className="card stack" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="name-q">Find a name</label>
          <div className="row" style={{ gap: 0 }}>
            <input id="name-q" className="input mono" style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, fontSize: 18 }} placeholder="yourname" value={q} autoFocus autoCapitalize="none" spellCheck={false}
              onChange={(e) => setQ(e.target.value.replace(/\s/g, ""))} />
            <span className="input mono" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 0, fontSize: 18, color: "var(--aqua)" }}>.arc</span>
          </div>
          <div className="hint">Lowercase letters, numbers and hyphens · 3 to 32 characters · 5+ chars 5 USDC/yr, 4 chars 20, 3 chars 50</div>
        </div>
        {label && !isValidName(label) ? <div className="notice notice-warn">Names use a-z, 0-9 and hyphens, 3 to 32 characters, and cannot start or end with a hyphen.</div> : null}
        {isValidName(label) ? <Lookup label={label} /> : null}
      </div>

      <MyNames />
    </div>
  );
}

function Lookup({ label }: { label: string }) {
  const q = useNameInfo(label);
  const i = q.data as NameInfo | undefined;
  if (!i) return <p className="muted small">{q.isLoading ? "Checking…" : "Could not read the name. Try again."}</p>;
  if (i.available) return <Register label={label} info={i} />;
  if (i.isReserved && i.owner === "0x0000000000000000000000000000000000000000") return <div className="notice">{label}.arc is reserved.</div>;
  return <Taken label={label} info={i} />;
}

function Register({ label, info }: { label: string; info: NameInfo }) {
  const { address } = useAccount();
  const [years, setYears] = useState(1);
  const tx = useTx();
  const cost = info.yearlyPrice * BigInt(years);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div><span className="pill pill-unlocked">available</span> <strong className="mono" style={{ fontSize: 20, marginLeft: 8 }}>{label}.arc</strong></div>
        <div className="muted small">{fmtUsdc(info.yearlyPrice)} USDC per year</div>
      </div>
      <div className="presets">{YEARS.map((y) => <button key={y} type="button" className={`preset ${years === y ? "on" : ""}`} onClick={() => setYears(y)}>{y} {y === 1 ? "year" : "years"}</button>)}</div>
      <div className="row between"><span className="muted">Total</span><strong className="mono">{fmtUsdc(cost)} USDC</strong></div>
      <RequireWallet what={`register ${label}.arc`}>
        <button className="btn btn-primary btn-lg" disabled={tx.busy || !address} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "register", args: [label, BigInt(years), address!], value: cost, chainId: arc.id })}>
          {tx.busy ? "Registering…" : `Register ${label}.arc`}
        </button>
        <TxStatus tx={tx} done={`${label}.arc is yours. Set it up below.`} />
      </RequireWallet>
    </div>
  );
}

function Taken({ label, info }: { label: string; info: NameInfo }) {
  const texts = useReadContracts({ contracts: TEXT_KEYS.map(([k]) => ({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "text", args: [label, k], chainId: arc.id }) as const) });
  const vals = TEXT_KEYS.map(([k, l], i) => [k, l, (texts.data?.[i]?.result as string | undefined) ?? ""] as const).filter(([, , v]) => v);
  const expired = Number(info.expires) * 1000 < Date.now();
  const avatar = vals.find(([k]) => k === "avatar")?.[2];
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        {avatar ? <img src={ipfsHttp(avatar)} alt="" width={48} height={48} style={{ borderRadius: 24, objectFit: "cover" }} /> : null}
        <div>
          <strong className="mono" style={{ fontSize: 20 }}>{label}.arc</strong>
          <div className="small muted">{expired ? `Expired ${fmtDate(info.expires)} · in its ${GRACE_DAYS}-day grace period` : `Registered until ${fmtDate(info.expires)}`}</div>
        </div>
      </div>
      <div className="stack" style={{ gap: 8, fontSize: 14, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}>
        <div className="row between"><span className="muted">Points to</span>{info.addr !== "0x0000000000000000000000000000000000000000" ? <a className="mono" href={explorerAddress(info.addr)} target="_blank" rel="noreferrer">{shortAddr(info.addr, 6)}</a> : <span className="muted">nothing</span>}</div>
        <div className="row between"><span className="muted">Owner</span><a className="mono" href={explorerAddress(info.owner)} target="_blank" rel="noreferrer">{shortAddr(info.owner, 6)}</a></div>
        {info.contenthash ? <div className="row between"><span className="muted">Website</span><a href={siteUrl(label)} target="_blank" rel="noreferrer">{label}.usearckit.online ↗</a></div> : null}
        {vals.filter(([k]) => k !== "avatar").map(([k, l, v]) => <div key={k} className="row between"><span className="muted">{l}</span><span>{v}</span></div>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- my names

function MyNames() {
  const { address } = useAccount();
  const q = useMyNames(address);
  const primary = usePrimaryName(address);
  const [labels, expires] = (q.data as readonly [readonly string[], readonly bigint[]] | undefined) ?? [[], []];
  const [open, setOpen] = useState<string | null>(null);
  if (!address) return null;
  return (
    <div className="stack" style={{ gap: 12, marginTop: 28 }}>
      <h3>Your names</h3>
      {!labels.length ? <p className="muted small">{q.isLoading ? "Loading…" : "You have no .arc names yet. Search above to get one."}</p> : null}
      {labels.map((l, i) => {
        const d = daysLeft(expires[i]);
        return (
          <div key={l} className="card stack" style={{ gap: 10 }}>
            <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="row" style={{ gap: 10 }}>
                <strong className="mono" style={{ fontSize: 18 }}>{l}.arc</strong>
                {primary.data === l ? <span className="pill pill-live">primary</span> : null}
                {d < 0 ? <span className="pill pill-empty">expired</span> : d < 30 ? <span className="pill pill-locked">{d} days left</span> : null}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="small muted">until {fmtDate(expires[i])}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === l ? null : l)}>{open === l ? "Close" : "Manage"}</button>
              </div>
            </div>
            {open === l ? <Manage label={l} me={address} isPrimary={primary.data === l} /> : null}
          </div>
        );
      })}
    </div>
  );
}

type Panel = "profile" | "website" | "renew" | "address";

function Manage({ label, me, isPrimary }: { label: string; me: Address; isPrimary: boolean }) {
  const [panel, setPanel] = useState<Panel>("profile");
  const info = useNameInfo(label).data as NameInfo | undefined;
  const primaryTx = useTx();
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="presets">
        {(["profile", "website", "address", "renew"] as Panel[]).map((p) => <button key={p} type="button" className={`preset ${panel === p ? "on" : ""}`} onClick={() => setPanel(p)}>{p === "profile" ? "Profile" : p === "website" ? "Website" : p === "address" ? "Address" : "Renew"}</button>)}
      </div>
      {panel === "profile" ? <Profile label={label} /> : null}
      {panel === "website" ? <Website label={label} current={info?.contenthash ?? ""} /> : null}
      {panel === "address" ? <AddressPanel label={label} current={info?.addr} /> : null}
      {panel === "renew" ? <Renew label={label} info={info} /> : null}
      {!isPrimary ? (
        <div className="row between" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, flexWrap: "wrap", gap: 8 }}>
          <span className="small muted">{info?.addr?.toLowerCase() === me.toLowerCase() ? `Show ${label}.arc as your name across Arc Kit.` : `Point ${label}.arc at this wallet to use it as your name.`}</span>
          <button className="btn btn-ghost btn-sm" disabled={primaryTx.busy || info?.addr?.toLowerCase() !== me.toLowerCase()} onClick={() => primaryTx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setPrimaryName", args: [label], chainId: arc.id })}>Make primary</button>
        </div>
      ) : null}
      <TxStatus tx={primaryTx} done={`${label}.arc is now your primary name.`} />
    </div>
  );
}

function Profile({ label }: { label: string }) {
  const texts = useReadContracts({ contracts: TEXT_KEYS.map(([k]) => ({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "text", args: [label, k], chainId: arc.id }) as const) });
  const current = useMemo(() => TEXT_KEYS.map((_, i) => (texts.data?.[i]?.result as string | undefined) ?? ""), [texts.data]);
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => { if (texts.data) setVals(current); }, [texts.data, current]);
  const tx = useTx();
  const changed = TEXT_KEYS.map(([k], i) => [k, vals[i] ?? ""] as const).filter(([, v], i) => v !== current[i]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {TEXT_KEYS.map(([k, l, ph], i) => (
        <div key={k} className="field">
          <label htmlFor={`t-${k}`}>{l}</label>
          <input id={`t-${k}`} className="input" placeholder={ph} value={vals[i] ?? ""} maxLength={k === "description" ? 280 : 200} onChange={(e) => setVals((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
        </div>
      ))}
      <button className="btn btn-primary" disabled={!changed.length || tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setTexts", args: [label, changed.map(([k]) => k), changed.map(([, v]) => v.trim())], chainId: arc.id })}>
        {tx.busy ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}` : "No changes"}
      </button>
      <TxStatus tx={tx} done="Profile saved." />
    </div>
  );
}

type UploadFile = { path: string; data: string; size: number };

async function readFiles(list: FileList): Promise<UploadFile[]> {
  const out: UploadFile[] = [];
  for (const f of Array.from(list)) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (/(^|\/)\.(?!well-known)/.test(path) || /(^|\/)node_modules\//.test(path)) continue; // skip dotfiles and deps
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ path, data: btoa(bin), size: f.size });
  }
  return out;
}

function Website({ label, current }: { label: string; current: string }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [paste, setPaste] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [uri, setUri] = useState("");
  const tx = useTx();
  const total = files.reduce((a, f) => a + f.size, 0);
  const hasIndex = files.some((f) => /(^|\/)index\.html$/i.test(f.path));
  const pick = async (e: ChangeEvent<HTMLInputElement>) => { setErr(""); setUri(""); if (e.target.files?.length) setFiles(await readFiles(e.target.files)); };

  const upload = async () => {
    setUploading(true); setErr("");
    try {
      const r = await fetch("/api/names?op=upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: files.map(({ path, data }) => ({ path, data })) }) });
      const j = (await r.json()) as { uri?: string; error?: string };
      if (!r.ok || !j.uri) throw new Error(j.error || "Upload failed.");
      setUri(j.uri);
      tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setContenthash", args: [label, j.uri], chainId: arc.id });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setUploading(false); }
  };
  const pasted = paste.trim();
  const pasteOk = /^ipfs:\/\/[a-zA-Z0-9]+(\/[A-Za-z0-9._~-]+)*\/?$/.test(pasted);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted">Upload a folder with an <span className="mono">index.html</span> (4 MB max). It goes to IPFS and opens at <a href={siteUrl(label)} target="_blank" rel="noreferrer">{label}.usearckit.online</a>.</p>
      {current ? <div className="small">Live now: <a href={siteUrl(label)} target="_blank" rel="noreferrer">{label}.usearckit.online ↗</a> <span className="muted mono">· {current.slice(0, 32)}…</span></div> : null}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="btn btn-ghost btn-sm">Choose folder<input type="file" multiple hidden onChange={pick} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} /></label>
        <label className="btn btn-ghost btn-sm">Choose files<input type="file" multiple hidden onChange={pick} /></label>
      </div>
      {files.length ? <div className="small muted">{files.length} files · {(total / 1e6).toFixed(2)} MB{hasIndex ? "" : " · no index.html found"}</div> : null}
      {files.length ? <button className="btn btn-primary" disabled={!hasIndex || total > 4_000_000 || uploading || tx.busy} onClick={() => void upload()}>{uploading ? "Uploading to IPFS…" : tx.busy ? "Confirm in your wallet…" : "Publish website"}</button> : null}
      {total > 4_000_000 ? <div className="notice notice-warn">That is over 4 MB. Pin it yourself and paste the ipfs:// link below.</div> : null}
      {err ? <div className="notice notice-err">{err}</div> : null}
      <div className="field">
        <label htmlFor={`cid-${label}`}>Or paste an IPFS link</label>
        <div className="row" style={{ gap: 8 }}>
          <input id={`cid-${label}`} className="input mono" style={{ flex: 1 }} placeholder="ipfs://bafy…" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn btn-ghost" disabled={!pasteOk || tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setContenthash", args: [label, pasted], chainId: arc.id })}>Set</button>
        </div>
      </div>
      {current ? <button className="btn btn-ghost btn-sm" disabled={tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setContenthash", args: [label, ""], chainId: arc.id })}>Take the website down</button> : null}
      <TxStatus tx={tx} done={uri || pasteOk ? `Published. Live at ${label}.usearckit.online within a minute.` : "Website updated."} />
    </div>
  );
}

function AddressPanel({ label, current }: { label: string; current?: Address }) {
  const [to, setTo] = useState("");
  const tx = useTx();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted">Payments to {label}.arc go to {current ? <span className="mono">{shortAddr(current, 6)}</span> : "nobody yet"}. Point it at another wallet, such as a cold wallet or a multisig.</p>
      <div className="field">
        <label htmlFor={`addr-${label}`}>New address</label>
        <input id={`addr-${label}`} className="input mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
        {to && !isAddress(to) ? <div className="error">Not a valid address.</div> : null}
      </div>
      <button className="btn btn-primary" disabled={!isAddress(to) || tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setAddr", args: [label, to as Address], chainId: arc.id })}>Update address</button>
      <TxStatus tx={tx} done="Address updated." />
    </div>
  );
}

function Renew({ label, info }: { label: string; info?: NameInfo }) {
  const [years, setYears] = useState(1);
  const tx = useTx();
  const cost = (info?.yearlyPrice ?? 0n) * BigInt(years);
  const next = info ? Number(info.expires) + years * 365 * 86_400 : 0;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="presets">{YEARS.map((y) => <button key={y} type="button" className={`preset ${years === y ? "on" : ""}`} onClick={() => setYears(y)}>+{y} {y === 1 ? "year" : "years"}</button>)}</div>
      <div className="row between"><span className="muted">New expiry</span><span>{next ? fmtDate(next) : "…"}</span></div>
      <div className="row between"><span className="muted">Cost</span><strong className="mono">{fmtUsdc(cost)} USDC</strong></div>
      <button className="btn btn-primary" disabled={!info || tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "renew", args: [label, BigInt(years)], value: cost, chainId: arc.id })}>{tx.busy ? "Renewing…" : `Renew ${label}.arc`}</button>
      <TxStatus tx={tx} done="Renewed." />
    </div>
  );
}

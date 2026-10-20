import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { isAddress, type Address } from "viem";
import { arc } from "@/wagmi";
import { shortAddr } from "@/lib/format";
import { useTx } from "@/hooks/useTx";
import { TxStatus } from "@/components/TxStatus";
import { useNameTexts } from "@/components/NameCard";
import { arcNamesAbi, NAMES_ADDRESS, siteUrl, TEXT_KEYS, type NameInfo } from "@/hooks/useArcNames";
import { formatEther } from "viem";

const fmtUsdc = (wei: bigint) => Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const fmtNameDate = (sec: bigint | number) => new Date(Number(sec) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Years picker with − / + buttons, shared by registration and renewal. */
export function YearsPicker({ years, setYears, yearly }: { years: number; setYears: (n: number) => void; yearly: bigint }) {
  return (
    <div className="an-years">
      <button type="button" aria-label="One year less" disabled={years <= 1} onClick={() => setYears(years - 1)}>−</button>
      <div className="n">{years} {years === 1 ? "year" : "years"}<small>{fmtUsdc(yearly)} USDC per year</small></div>
      <button type="button" aria-label="One year more" disabled={years >= 10} onClick={() => setYears(years + 1)}>+</button>
    </div>
  );
}

export function EditProfile({ label, onDone }: { label: string; onDone?: () => void }) {
  const q = useNameTexts(label);
  const current = useMemo(() => TEXT_KEYS.map(([k]) => q.texts[k] ?? ""), [q.texts]);
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => { if (q.data) setVals(current); }, [q.data, current]);
  const tx = useTx();
  useEffect(() => { if (tx.isSuccess) onDone?.(); }, [tx.isSuccess, onDone]);
  const changed = TEXT_KEYS.map(([k], i) => [k, (vals[i] ?? "").trim()] as const).filter(([, v], i) => v !== current[i]);
  return (
    <div className="stack" style={{ gap: 12 }}>
      {TEXT_KEYS.map(([k, l, ph], i) => (
        <div key={k} className="field">
          <label htmlFor={`t-${label}-${k}`}>{l}</label>
          {k === "description"
            ? <textarea id={`t-${label}-${k}`} className="input" rows={3} placeholder={ph} value={vals[i] ?? ""} maxLength={280} onChange={(e) => setVals((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
            : <input id={`t-${label}-${k}`} className="input" placeholder={ph} value={vals[i] ?? ""} maxLength={200} onChange={(e) => setVals((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />}
        </div>
      ))}
      <button className="btn btn-primary" disabled={!changed.length || tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setTexts", args: [label, changed.map(([k]) => k), changed.map(([, v]) => v)], chainId: arc.id })}>
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
    if (/(^|\/)\.(?!well-known)/.test(path) || /(^|\/)node_modules\//.test(path)) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ path, data: btoa(bin), size: f.size });
  }
  return out;
}

export function EditWebsite({ label, current }: { label: string; current: string }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [paste, setPaste] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const tx = useTx();
  const total = files.reduce((a, f) => a + f.size, 0);
  const hasIndex = files.some((f) => /(^|\/)index\.html$/i.test(f.path));
  const pick = async (e: ChangeEvent<HTMLInputElement>) => { setErr(""); if (e.target.files?.length) setFiles(await readFiles(e.target.files)); };
  const set = (uri: string) => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "setContenthash", args: [label, uri], chainId: arc.id });
  const upload = async () => {
    setUploading(true); setErr("");
    try {
      const r = await fetch("/api/names?op=upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: files.map(({ path, data }) => ({ path, data })) }) });
      const j = (await r.json()) as { uri?: string; error?: string };
      if (!r.ok || !j.uri) throw new Error(j.error || "Upload failed.");
      set(j.uri);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setUploading(false); }
  };
  const pasted = paste.trim();
  const pasteOk = /^ipfs:\/\/[a-zA-Z0-9]+(\/[A-Za-z0-9._~-]+)*\/?$/.test(pasted);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted" style={{ margin: 0 }}>Upload a folder with an <span className="mono">index.html</span> (4 MB max). It is stored on IPFS and served at <span className="mono">{label}.usearckit.online</span>.</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="btn btn-ghost btn-sm">Choose folder<input type="file" multiple hidden onChange={pick} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} /></label>
        <label className="btn btn-ghost btn-sm">Choose files<input type="file" multiple hidden onChange={pick} /></label>
        {files.length ? <span className="small muted">{files.length} files · {(total / 1e6).toFixed(2)} MB{hasIndex ? "" : " · no index.html"}</span> : null}
      </div>
      {files.length ? <button className="btn btn-primary" disabled={!hasIndex || total > 4_000_000 || uploading || tx.busy} onClick={() => void upload()}>{uploading ? "Uploading to IPFS…" : tx.busy ? "Confirm in your wallet…" : "Publish website"}</button> : null}
      {total > 4_000_000 ? <div className="notice notice-warn">Over 4 MB. Pin it yourself and paste the ipfs:// link below.</div> : null}
      {err ? <div className="notice notice-err">{err}</div> : null}
      <div className="field">
        <label htmlFor={`cid-${label}`}>Or paste an IPFS link</label>
        <div className="row" style={{ gap: 8 }}>
          <input id={`cid-${label}`} className="input mono" style={{ flex: 1 }} placeholder="ipfs://bafy…" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn btn-ghost" disabled={!pasteOk || tx.busy} onClick={() => set(pasted)}>Set</button>
        </div>
      </div>
      {current ? <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} disabled={tx.busy} onClick={() => set("")}>Take the website down</button> : null}
      <TxStatus tx={tx} done={`Updated. ${label}.usearckit.online refreshes within a minute.`} />
    </div>
  );
}

export function EditAddress({ label, current }: { label: string; current?: Address }) {
  const [to, setTo] = useState("");
  const tx = useTx();
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted" style={{ margin: 0 }}>Payments to {label}.arc go to {current ? <span className="mono">{shortAddr(current, 6)}</span> : "nobody yet"}. Point it at another wallet, such as a cold wallet or a multisig.</p>
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

export function RenewForm({ label, info }: { label: string; info?: NameInfo }) {
  const [years, setYears] = useState(1);
  const tx = useTx();
  const cost = (info?.yearlyPrice ?? 0n) * BigInt(years);
  const next = info ? Number(info.expires) + years * 365 * 86_400 : 0;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <YearsPicker years={years} setYears={setYears} yearly={info?.yearlyPrice ?? 0n} />
      <div className="an-sum">
        <div><span>New expiry</span><span>{next ? fmtNameDate(next) : "…"}</span></div>
        <div className="total"><span>Total</span><span className="mono">{fmtUsdc(cost)} USDC</span></div>
      </div>
      <button className="btn btn-primary" disabled={!info || tx.busy} onClick={() => tx.writeContract({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "renew", args: [label, BigInt(years)], value: cost, chainId: arc.id })}>{tx.busy ? "Renewing…" : `Renew ${label}.arc`}</button>
      <TxStatus tx={tx} done="Renewed." />
    </div>
  );
}

export { siteUrl };

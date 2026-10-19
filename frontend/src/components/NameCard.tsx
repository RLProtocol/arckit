import { useState } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { arc } from "@/wagmi";
import { explorerAddress } from "@/contracts";
import { shortAddr } from "@/lib/format";
import { arcNamesAbi, ipfsHttp, NAMES_ADDRESS, siteUrl, TEXT_KEYS } from "@/hooks/useArcNames";

/** Text records of one name, keyed (avatar, description, url, com.twitter, ...). */
export function useNameTexts(label: string) {
  const q = useReadContracts({ contracts: TEXT_KEYS.map(([k]) => ({ address: NAMES_ADDRESS!, abi: arcNamesAbi, functionName: "text", args: [label, k], chainId: arc.id }) as const), query: { enabled: !!label } });
  const map: Record<string, string> = {};
  TEXT_KEYS.forEach(([k], i) => { map[k] = (q.data?.[i]?.result as string | undefined) ?? ""; });
  return { ...q, texts: map };
}

const handle = (v: string) => v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "").replace(/^https?:\/\/t\.me\//, "").replace(/\/$/, "");

/** The public face of a name: avatar, name, bio, links and the address it pays. */
export function NameCard({ label, addr, website, size = "lg" }: { label: string; addr?: Address; website?: string; size?: "lg" | "md" }) {
  const { texts } = useNameTexts(label);
  const [copied, setCopied] = useState(false);
  const av = texts.avatar ? ipfsHttp(texts.avatar) : "";
  const links: [string, string][] = [];
  if (texts.url) links.push([texts.url.replace(/^https?:\/\//, ""), /^https?:\/\//.test(texts.url) ? texts.url : `https://${texts.url}`]);
  if (texts["com.twitter"]) links.push([`@${handle(texts["com.twitter"])}`, `https://x.com/${handle(texts["com.twitter"])}`]);
  if (texts["org.telegram"]) links.push([`t.me/${handle(texts["org.telegram"])}`, `https://t.me/${handle(texts["org.telegram"])}`]);
  if (texts["com.github"]) links.push([`github/${handle(texts["com.github"])}`, `https://github.com/${handle(texts["com.github"])}`]);
  const big = size === "lg";
  return (
    <div className="card" style={{ padding: big ? 28 : 20, position: "relative", overflow: "hidden", background: "linear-gradient(135deg, var(--navy-700), #0d3a4a)" }}>
      <div style={{ position: "absolute", right: -80, top: -80, width: 260, height: 260, borderRadius: "50%", border: "1.5px solid rgba(95,227,201,0.25)" }} />
      <div className="row" style={{ gap: 18, alignItems: "center", position: "relative" }}>
        {av ? <img src={av} alt="" width={big ? 84 : 60} height={big ? 84 : 60} style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(95,227,201,0.5)" }} />
          : <div style={{ width: big ? 84 : 60, height: big ? 84 : 60, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)", fontSize: big ? 34 : 24, fontWeight: 600 }}>{label[0]?.toUpperCase()}</div>}
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: big ? 30 : 22, fontWeight: 600, overflowWrap: "anywhere" }}>{label}<span style={{ color: "var(--aqua)" }}>.arc</span></div>
          {addr ? (
            <button className="mono small muted" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--text-dim)" }} onClick={() => { void navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1400); }} title="Copy address">
              {shortAddr(addr, 6)} {copied ? "· copied" : "· copy"}
            </button>
          ) : null}
        </div>
      </div>
      {texts.description ? <p style={{ marginTop: 16, position: "relative", maxWidth: 560 }}>{texts.description}</p> : null}
      {links.length || website ? (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14, position: "relative" }}>
          {website ? <a className="btn btn-primary btn-sm" href={siteUrl(label)} target="_blank" rel="noreferrer">{label}.usearckit.online ↗</a> : null}
          {links.map(([t, href]) => <a key={href} className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noreferrer">{t}</a>)}
          {addr ? <a className="btn btn-ghost btn-sm" href={explorerAddress(addr)} target="_blank" rel="noreferrer">Etherscan</a> : null}
        </div>
      ) : null}
    </div>
  );
}

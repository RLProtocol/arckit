import { formatEther, formatUnits, parseUnits } from "viem";

export const shortAddr = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "");

export const fmtUsd = (wei: bigint, digits = 2) => {
  const n = Number(formatEther(wei));
  return n.toLocaleString("en-US", { maximumFractionDigits: n !== 0 && n < 0.01 ? 6 : digits });
};
export const fmtTok = (units: bigint, dec: number, digits = 4) => Number(formatUnits(units, dec)).toLocaleString("en-US", { maximumFractionDigits: digits });
export const fmtPrice = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return n === 0 ? "—" : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toPrecision(3);
};
export const fmtPct = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(Math.abs(p) < 1 ? 2 : 1)}%`;
export const fmtBps = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export function safeParse(v: string, dec: number): bigint | undefined {
  try {
    const n = parseUnits(v.trim().replace(",", ".") as `${number}`, dec);
    return n > 0n ? n : undefined;
  } catch {
    return undefined;
  }
}

export const costOf = (amount: bigint, price: bigint, decimals: number) => { const d = 10n ** BigInt(decimals); return (amount * price + d - 1n) / d; };
export const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

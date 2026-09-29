import { formatUnits, parseUnits, isAddress, zeroAddress, type Address } from "viem";
import type { Lock, Vesting } from "@/contracts";

export const DAY = 86_400;

export function shortAddr(addr?: string, chars = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function isValidAddress(v: string): v is Address {
  return isAddress(v) && v.toLowerCase() !== zeroAddress;
}

export function sameAddr(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Format a token amount for display with thousands separators and a capped fraction. */
export function fmtAmount(value: bigint | undefined, decimals = 18, maxFrac = 4): string {
  if (value === undefined) return "—";
  const raw = formatUnits(value, decimals);
  const [int, frac = ""] = raw.split(".");
  const intFmt = BigInt(int).toLocaleString("en-US");
  const fracTrim = frac.slice(0, maxFrac).replace(/0+$/, "");
  return fracTrim ? `${intFmt}.${fracTrim}` : intFmt;
}

export function fmtUsdc(wei: bigint | undefined): string {
  if (wei === undefined) return "—";
  return `${fmtAmount(wei, 18, 2)} USDC`;
}

export function parseAmount(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!s || !/^\d*\.?\d*$/.test(s) || s === ".") return null;
  try {
    const v = parseUnits(s, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Dates follow the site language (the EN / 中文 switch sets <html lang>), not the browser locale. */
const dateLocale = () => { const l = typeof document !== "undefined" ? document.documentElement.lang : "en"; return l === "zh-CN" ? "zh-CN" : l === "id" ? "id-ID" : "en-US"; };

export function fmtDate(ts: bigint | number | undefined): string {
  if (ts === undefined) return "—";
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString(dateLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateShort(ts: bigint | number | undefined): string {
  if (ts === undefined) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString(dateLocale(), { year: "numeric", month: "short", day: "numeric" });
}

/** "87 days", "3 hours", "12 minutes", "under a minute". */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / DAY);
  if (d >= 1) return `${d} ${d === 1 ? "day" : "days"}`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h} ${h === 1 ? "hour" : "hours"}`;
  const m = Math.floor(seconds / 60);
  if (m >= 1) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  return "under a minute";
}

/** Whole days remaining, rounded up so "1 day" never reads as "0 days" while still locked. */
export function daysLeft(unlockDate: bigint, now: number): number {
  const s = Number(unlockDate) - now;
  return s <= 0 ? 0 : Math.max(1, Math.ceil(s / DAY));
}

export function totalDays(lock: Lock): number {
  return Math.max(1, Math.round(Number(lock.unlockDate - lock.lockDate) / DAY));
}

/** 0..1 fraction of the lock period that has elapsed. */
export function progress(lock: Lock, now: number): number {
  const start = Number(lock.lockDate);
  const end = Number(lock.unlockDate);
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export type LockStatus = "locked" | "unlocked" | "empty";

export function lockStatus(lock: Lock, now: number): LockStatus {
  if (lock.amount === 0n) return "empty";
  return now >= Number(lock.unlockDate) ? "unlocked" : "locked";
}

export function lockExists(lock: Lock | undefined): lock is Lock {
  return !!lock && lock.owner !== zeroAddress;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Convert a datetime-local input value to unix seconds, or null if invalid. */
export function dateInputToSec(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

export function secToDateInput(sec: number): string {
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function lockUrl(id: bigint | number | string): string {
  return `${window.location.origin}/lock/${id.toString()}`;
}

export function vestUrl(id: bigint | number | string): string {
  return `${window.location.origin}/vest/${id.toString()}`;
}

// ---------- Vesting math (mirrors TokenVesting._vested) ----------

export function vestedAt(v: Vesting, t: number): bigint {
  const start = Number(v.start);
  const cliff = Number(v.cliff);
  const end = Number(v.end);
  if (t < cliff) return 0n;
  if (t >= end) return v.total;
  return (v.total * BigInt(t - start)) / BigInt(end - start);
}

export function vestingFraction(v: Vesting, now: number): number {
  if (v.total === 0n) return 0;
  return Number((vestedAt(v, now) * 10_000n) / v.total) / 10_000;
}

export type VestingStatus = "upcoming" | "cliff" | "vesting" | "vested" | "claimed";

export function vestingStatus(v: Vesting, now: number): VestingStatus {
  if (v.total > 0n && v.released >= v.total) return "claimed";
  if (now >= Number(v.end)) return "vested";
  if (now < Number(v.start)) return "upcoming";
  if (now < Number(v.cliff)) return "cliff";
  return "vesting";
}

export function vestingExists(v: Vesting | undefined): v is Vesting {
  return !!v && v.creator !== zeroAddress;
}

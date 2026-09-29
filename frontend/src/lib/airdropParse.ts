import { isAddress, parseUnits, type Address } from "viem";

export type Row = { line: number; address: Address; amount?: bigint; raw: string };
export type RowError = { line: number; raw: string; reason: string };

export type ParseResult = {
  rows: Row[];
  errors: RowError[];
  duplicates: Address[];
};

/**
 * Parse a recipient list in the formats other multisenders accept:
 *   address,amount        address amount        address;amount       address=amount
 *   address\tamount       address                 (amount omitted when "same amount" mode)
 * Also accepts CSV/TSV with a header row, quoted values, and JSON arrays of
 * ["0x..", "1.5"] pairs or {address, amount} objects.
 */
export function parseRecipients(text: string, decimals: number, sameAmount: boolean): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], errors: [], duplicates: [] };

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return fromJson(JSON.parse(trimmed), decimals, sameAmount);
    } catch {
      /* fall through to line parsing */
    }
  }

  const rows: Row[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const lines = trimmed.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("//")) return;
    const cells = raw
      .replace(/^﻿/, "")
      .split(/[,;\t=]|\s+/)
      .map((c) => c.replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
    if (cells.length === 0) return;
    // header row?
    if (idx === 0 && !/^0x[0-9a-fA-F]{40}$/.test(cells[0]) && /address|wallet|recipient/i.test(raw)) return;

    const addr = cells[0];
    if (!isAddress(addr)) {
      errors.push({ line, raw, reason: "not a valid address" });
      return;
    }
    let amount: bigint | undefined;
    if (!sameAmount) {
      const amtStr = cells[1];
      if (amtStr === undefined) {
        errors.push({ line, raw, reason: "missing amount" });
        return;
      }
      const parsed = safeParse(amtStr, decimals);
      if (parsed === null) {
        errors.push({ line, raw, reason: `bad amount "${amtStr}"` });
        return;
      }
      amount = parsed;
    }
    const key = addr.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    rows.push({ line, address: addr as Address, amount, raw });
  });

  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k as Address);
  return { rows, errors, duplicates };
}

function fromJson(data: unknown, decimals: number, sameAmount: boolean): ParseResult {
  const rows: Row[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  const list = Array.isArray(data) ? data : typeof data === "object" && data ? Object.entries(data as Record<string, unknown>) : [];
  list.forEach((item, idx) => {
    const line = idx + 1;
    let addr: unknown;
    let amt: unknown;
    if (Array.isArray(item)) [addr, amt] = item;
    else if (typeof item === "object" && item) {
      const o = item as Record<string, unknown>;
      addr = o.address ?? o.wallet ?? o.recipient ?? o.to;
      amt = o.amount ?? o.value ?? o.balance;
    } else if (typeof item === "string") addr = item;
    const raw = JSON.stringify(item);
    if (typeof addr !== "string" || !isAddress(addr)) {
      errors.push({ line, raw, reason: "not a valid address" });
      return;
    }
    let amount: bigint | undefined;
    if (!sameAmount) {
      const parsed = amt === undefined ? null : safeParse(String(amt), decimals);
      if (parsed === null) {
        errors.push({ line, raw, reason: "missing or bad amount" });
        return;
      }
      amount = parsed;
    }
    seen.set(addr.toLowerCase(), (seen.get(addr.toLowerCase()) ?? 0) + 1);
    rows.push({ line, address: addr as Address, amount, raw });
  });
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k as Address);
  return { rows, errors, duplicates };
}

function safeParse(s: string, decimals: number): bigint | null {
  const clean = s.replace(/[,_\s]/g, "");
  if (!/^\d*\.?\d+$|^\d+\.?\d*$/.test(clean)) return null;
  try {
    const v = parseUnits(clean, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Merge duplicate addresses by summing their amounts (per-amount mode) or de-duplicating (same-amount mode). */
export function mergeDuplicates(rows: Row[]): Row[] {
  const map = new Map<string, Row>();
  for (const r of rows) {
    const k = r.address.toLowerCase();
    const prev = map.get(k);
    if (!prev) map.set(k, { ...r });
    else if (prev.amount !== undefined && r.amount !== undefined) prev.amount += r.amount;
  }
  return [...map.values()];
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const SAMPLE_CSV = `address,amount
0x23d128F066820DCa6E8809f947766b45d3C6aE35,100
0x349B262EBe98a67CaE26b2192377751A6C0Eb64E,250.5`;

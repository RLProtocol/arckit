import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { ADDR, publicClient, withTimeout } from "../chain";
import { erc20Abi } from "../contracts";
import { tokenLockerAbi, vestingAbi } from "./abis";

export type Meta = { symbol: string; decimals: number; name: string };

/** symbol / decimals / name for many tokens in one multicall, keyed by lowercase address. */
export async function metasFor(tokens: Address[]): Promise<Record<string, Meta>> {
  const uniq = Array.from(new Set(tokens.map((t) => t.toLowerCase()))) as Address[];
  if (!uniq.length) return {};
  const r = await publicClient.multicall({ allowFailure: true, contracts: uniq.flatMap((t) => [{ address: t, abi: erc20Abi, functionName: "symbol" }, { address: t, abi: erc20Abi, functionName: "decimals" }, { address: t, abi: erc20Abi, functionName: "name" }] as const) });
  const out: Record<string, Meta> = {};
  uniq.forEach((t, i) => { out[t] = { symbol: (r[i * 3].result as string | undefined) ?? "TOKEN", decimals: Number((r[i * 3 + 1].result as number | undefined) ?? 18), name: (r[i * 3 + 2].result as string | undefined) ?? "Unknown token" }; });
  return out;
}

// ---------------------------------------------------------------- ArcLock

export type Lock = { id: bigint; token: Address; owner: Address; withdrawer: Address; amount: bigint; lockDate: bigint; unlockDate: bigint };
export type LockRow = Lock & { meta: Meta };

export function useLockFee() {
  return useQuery({ queryKey: ["lock-fee"], staleTime: 5 * 60_000, queryFn: () => publicClient.readContract({ address: ADDR.locker, abi: tokenLockerAbi, functionName: "lockFee" }) });
}

/** Every lock this wallet owns, newest first. */
export function useMyLocks(address?: Address) {
  return useQuery({
    queryKey: ["my-locks", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<LockRow[]> => {
      const ids = await withTimeout(publicClient.readContract({ address: ADDR.locker, abi: tokenLockerAbi, functionName: "getLocksForUser", args: [address!] }));
      if (!ids.length) return [];
      const locks = (await publicClient.multicall({ allowFailure: false, contracts: ids.map((id) => ({ address: ADDR.locker, abi: tokenLockerAbi, functionName: "getLock", args: [id] }) as const) })) as Lock[];
      const metas = await metasFor(locks.map((l) => l.token));
      return locks.map((l) => ({ ...l, meta: metas[l.token.toLowerCase()] })).sort((a, b) => Number(b.id - a.id));
    },
  });
}

export function useLock(id?: bigint) {
  return useQuery({
    queryKey: ["lock", id?.toString()],
    enabled: id !== undefined,
    refetchInterval: 20_000,
    queryFn: async () => {
      const l = (await withTimeout(publicClient.readContract({ address: ADDR.locker, abi: tokenLockerAbi, functionName: "getLock", args: [id!] }))) as Lock;
      if (l.token === "0x0000000000000000000000000000000000000000") return null;
      return { ...l, meta: (await metasFor([l.token]))[l.token.toLowerCase()] } as LockRow;
    },
  });
}

// ---------------------------------------------------------------- Vesting

export type Vesting = { id: bigint; token: Address; creator: Address; beneficiary: Address; total: bigint; released: bigint; start: bigint; cliff: bigint; end: bigint };
export type VestingRow = Vesting & { meta: Meta; claimable: bigint };

export function useVestingFee() {
  return useQuery({ queryKey: ["vest-fee"], staleTime: 5 * 60_000, queryFn: () => publicClient.readContract({ address: ADDR.vesting, abi: vestingAbi, functionName: "fee" }) });
}

async function vestingsByIds(ids: readonly bigint[]): Promise<VestingRow[]> {
  if (!ids.length) return [];
  const r = await publicClient.multicall({ allowFailure: false, contracts: ids.flatMap((id) => [{ address: ADDR.vesting, abi: vestingAbi, functionName: "getVesting", args: [id] }, { address: ADDR.vesting, abi: vestingAbi, functionName: "claimable", args: [id] }] as const) });
  const vs = ids.map((_, i) => ({ ...(r[i * 2] as Vesting), claimable: r[i * 2 + 1] as bigint }));
  const metas = await metasFor(vs.map((v) => v.token));
  return vs.map((v) => ({ ...v, meta: metas[v.token.toLowerCase()] }));
}

/** Schedules paying this wallet and schedules it created. */
export function useMyVestings(address?: Address) {
  return useQuery({
    queryKey: ["my-vestings", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [mine, created] = await withTimeout(Promise.all([
        publicClient.readContract({ address: ADDR.vesting, abi: vestingAbi, functionName: "getVestingsForBeneficiary", args: [address!] }),
        publicClient.readContract({ address: ADDR.vesting, abi: vestingAbi, functionName: "getVestingsForCreator", args: [address!] }),
      ]));
      const all = await vestingsByIds(Array.from(new Set([...mine, ...created].map(String))).map(BigInt));
      const byId = (a: VestingRow, b: VestingRow) => Number(b.id - a.id);
      return {
        receiving: all.filter((v) => v.beneficiary.toLowerCase() === address!.toLowerCase()).sort(byId),
        created: all.filter((v) => v.creator.toLowerCase() === address!.toLowerCase()).sort(byId),
      };
    },
  });
}

export function useVesting(id?: bigint) {
  return useQuery({
    queryKey: ["vesting", id?.toString()],
    enabled: id !== undefined,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [v] = await withTimeout(vestingsByIds([id!]));
      return v && v.token !== "0x0000000000000000000000000000000000000000" ? v : null;
    },
  });
}

/** Linear vesting after the cliff, as the contract computes it. */
export function vestedAt(v: Vesting, t: number): bigint {
  const T = BigInt(t);
  if (T < v.cliff) return 0n;
  if (T >= v.end) return v.total;
  if (v.end <= v.start) return v.total;
  return (v.total * (T - v.start)) / (v.end - v.start);
}

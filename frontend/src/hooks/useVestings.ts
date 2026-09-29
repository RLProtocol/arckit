import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { VESTING_ADDRESS, vestingAbi, type Vesting } from "@/contracts";

const vestingC = { address: VESTING_ADDRESS, abi: vestingAbi } as const;

export function useVestingFee() {
  return useReadContract({ ...vestingC, functionName: "fee" });
}

export function useVesting(id?: bigint) {
  return useReadContract({
    ...vestingC,
    functionName: "getVesting",
    args: [id ?? 0n],
    query: { enabled: id !== undefined, refetchInterval: 20_000 },
  });
}

export function useCreatorVestingIds(who?: Address) {
  return useReadContract({
    ...vestingC,
    functionName: "getVestingsForCreator",
    args: [who ?? VESTING_ADDRESS],
    query: { enabled: !!who },
  });
}

export function useBeneficiaryVestingIds(who?: Address) {
  return useReadContract({
    ...vestingC,
    functionName: "getVestingsForBeneficiary",
    args: [who ?? VESTING_ADDRESS],
    query: { enabled: !!who },
  });
}

export function useTokenVestingIds(token?: Address) {
  return useReadContract({
    ...vestingC,
    functionName: "getVestingsForToken",
    args: [token ?? VESTING_ADDRESS],
    query: { enabled: !!token },
  });
}

export function useVestingsByIds(ids?: readonly bigint[]) {
  const key = ids?.map(String).join(",") ?? "";
  const contracts = useMemo(
    () => (ids ?? []).map((id) => ({ ...vestingC, functionName: "getVesting" as const, args: [id] as const })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const q = useReadContracts({
    contracts,
    allowFailure: false,
    query: { enabled: contracts.length > 0, refetchInterval: 30_000 },
  });
  const vestings = useMemo<Vesting[] | undefined>(() => {
    if (ids && ids.length === 0) return [];
    return q.data as Vesting[] | undefined;
  }, [q.data, ids]);
  return { ...q, vestings, isLoading: contracts.length > 0 && q.isLoading };
}

/** Newest `limit` schedules by id. */
export function useAllVestings(limit = 200) {
  const next = useReadContract({ ...vestingC, functionName: "nextVestingId", query: { refetchInterval: 20_000 } });
  const ids = useMemo(() => {
    if (next.data === undefined) return undefined;
    const count = Number(next.data) - 1;
    const start = Math.max(1, count - limit + 1);
    const out: bigint[] = [];
    for (let i = count; i >= start; i--) out.push(BigInt(i));
    return out;
  }, [next.data, limit]);
  const res = useVestingsByIds(ids);
  return {
    ...res,
    isLoading: next.isLoading || res.isLoading,
    isError: next.isError || res.isError,
    total: next.data !== undefined ? Number(next.data) - 1 : undefined,
  };
}

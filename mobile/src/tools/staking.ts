import { useQuery } from "@tanstack/react-query";
import { parseAbi, type Address } from "viem";
import { ADDR, publicClient, withTimeout } from "../chain";
import { metasFor, type Meta } from "./hooks";

export const arcStakingAbi = parseAbi([
  "struct PoolConfig { address stakeToken; address rewardToken; uint64 startTime; uint64 duration; uint16 penaltyBps; uint256 minStake; uint256 maxStakePerWallet; uint256 maxTotalStaked; string name; }",
  "struct Pool { PoolConfig cfg; address creator; bool paused; uint64 periodFinish; uint64 lastUpdate; uint256 rewardRate; uint256 rewardPerTokenStored; uint256 totalStaked; uint256 rewardReserve; uint256 accruedTotal; uint256 claimedTotal; uint256 totalRewardsAdded; uint256 stakers; }",
  "function createFee() view returns (uint256)",
  "function nextPoolId() view returns (uint256)",
  "function poolInfo(uint256 poolId) view returns (Pool)",
  "function currentAprBps(uint256 poolId) view returns (uint256)",
  "function rewardsRemaining(uint256 poolId) view returns (uint256)",
  "function earned(uint256 poolId, address who) view returns (uint256)",
  "function penaltyFor(uint256 poolId, uint256 amount) view returns (uint256)",
  "function users(uint256 poolId, address who) view returns (uint256 staked, uint256 rewardPerTokenPaid, uint256 rewards, uint64 firstStakeAt)",
  "function getPoolsForUser(address who) view returns (uint256[])",
  "function getPoolsByCreator(address who) view returns (uint256[])",
  "function createPool(PoolConfig cfg, uint256 rewardAmount) payable returns (uint256 id)",
  "function stake(uint256 poolId, uint256 amount)",
  "function unstake(uint256 poolId, uint256 amount)",
  "function claim(uint256 poolId)",
  "function compound(uint256 poolId) returns (uint256 added)",
  "function exit(uint256 poolId)",
  "function addRewards(uint256 poolId, uint256 amount)",
  "function extendPool(uint256 poolId, uint64 extraDuration, uint256 extraRewards)",
  "function reclaimUndistributed(uint256 poolId) returns (uint256 amount)",
  "event PoolCreated(uint256 indexed poolId, address indexed creator, address indexed stakeToken, address rewardToken, uint64 startTime, uint64 duration, uint256 rewards, uint16 penaltyBps, string name)",
  "error AboveMaxStake()",
  "error BadConfig()",
  "error BelowMinStake()",
  "error Ended()",
  "error InsufficientStake()",
  "error NotCreator()",
  "error NotEnded()",
  "error NotStarted()",
  "error NothingToReclaim()",
  "error PoolFull()",
  "error PoolNotFound()",
  "error PoolPaused()",
  "error RewardTokenMismatch()",
]);

export type PoolCfg = { stakeToken: Address; rewardToken: Address; startTime: bigint; duration: bigint; penaltyBps: number; minStake: bigint; maxStakePerWallet: bigint; maxTotalStaked: bigint; name: string };
export type PoolRaw = { cfg: PoolCfg; creator: Address; paused: boolean; periodFinish: bigint; lastUpdate: bigint; rewardRate: bigint; rewardPerTokenStored: bigint; totalStaked: bigint; rewardReserve: bigint; accruedTotal: bigint; claimedTotal: bigint; totalRewardsAdded: bigint; stakers: bigint };
export type StakePool = PoolRaw & { id: bigint; aprBps: bigint; remaining: bigint; stake: Meta; reward: Meta; same: boolean; start: number; finish: number };

const PRECISION = 10n ** 18n; // rewardRate is scaled by 1e18 in the contract

async function poolsByIds(ids: bigint[]): Promise<StakePool[]> {
  if (!ids.length) return [];
  const r = await publicClient.multicall({ allowFailure: true, contracts: ids.flatMap((id) => [
    { address: ADDR.staking, abi: arcStakingAbi, functionName: "poolInfo", args: [id] },
    { address: ADDR.staking, abi: arcStakingAbi, functionName: "currentAprBps", args: [id] },
    { address: ADDR.staking, abi: arcStakingAbi, functionName: "rewardsRemaining", args: [id] },
  ] as const) });
  const raw = ids.map((id, i) => ({ id, p: r[i * 3].result as PoolRaw | undefined, apr: (r[i * 3 + 1].result as bigint | undefined) ?? 0n, rem: (r[i * 3 + 2].result as bigint | undefined) ?? 0n })).filter((x) => x.p && x.p.creator !== "0x0000000000000000000000000000000000000000");
  const metas = await metasFor(raw.flatMap((x) => [x.p!.cfg.stakeToken, x.p!.cfg.rewardToken]));
  return raw.map(({ id, p, apr, rem }) => ({
    ...p!, id, aprBps: apr, remaining: rem,
    stake: metas[p!.cfg.stakeToken.toLowerCase()], reward: metas[p!.cfg.rewardToken.toLowerCase()],
    same: p!.cfg.stakeToken.toLowerCase() === p!.cfg.rewardToken.toLowerCase(),
    start: Number(p!.cfg.startTime), finish: Number(p!.periodFinish),
  }));
}

/** Reward tokens paid per day at the current rate. */
export const perDay = (p: StakePool) => (p.rewardRate * 86_400n) / PRECISION;

export function useAllPools(limit = 120) {
  return useQuery({
    queryKey: ["stake-pools", limit],
    refetchInterval: 30_000,
    queryFn: async () => {
      const next = Number(await withTimeout(publicClient.readContract({ address: ADDR.staking, abi: arcStakingAbi, functionName: "nextPoolId" })));
      const ids: bigint[] = [];
      for (let i = next - 1; i >= Math.max(1, next - limit); i--) ids.push(BigInt(i));
      return poolsByIds(ids);
    },
  });
}

export function useMyPools(address?: Address) {
  return useQuery({
    queryKey: ["stake-mine", address],
    enabled: !!address,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [joined, created] = await withTimeout(Promise.all([
        publicClient.readContract({ address: ADDR.staking, abi: arcStakingAbi, functionName: "getPoolsForUser", args: [address!] }),
        publicClient.readContract({ address: ADDR.staking, abi: arcStakingAbi, functionName: "getPoolsByCreator", args: [address!] }),
      ]));
      const all = await poolsByIds(Array.from(new Set([...joined, ...created].map(String))).map(BigInt).sort((a, b) => Number(b - a)));
      const pos = await publicClient.multicall({ allowFailure: true, contracts: all.flatMap((p) => [{ address: ADDR.staking, abi: arcStakingAbi, functionName: "users", args: [p.id, address!] }, { address: ADDR.staking, abi: arcStakingAbi, functionName: "earned", args: [p.id, address!] }] as const) });
      return all.map((p, i) => ({ ...p, staked: (pos[i * 2].result as readonly bigint[] | undefined)?.[0] ?? 0n, earned: (pos[i * 2 + 1].result as bigint | undefined) ?? 0n, isCreator: p.creator.toLowerCase() === address!.toLowerCase() }));
    },
  });
}

export function usePool(id: bigint | undefined, address?: Address) {
  return useQuery({
    queryKey: ["stake-pool", id?.toString(), address],
    enabled: id !== undefined,
    refetchInterval: 10_000,
    queryFn: async () => {
      const [p] = await withTimeout(poolsByIds([id!]));
      if (!p) return null;
      if (!address) return { ...p, staked: 0n, earned: 0n };
      const [u, earned] = await publicClient.multicall({ allowFailure: false, contracts: [{ address: ADDR.staking, abi: arcStakingAbi, functionName: "users", args: [id!, address] }, { address: ADDR.staking, abi: arcStakingAbi, functionName: "earned", args: [id!, address] }] });
      return { ...p, staked: (u as readonly bigint[])[0], earned: earned as bigint };
    },
  });
}

export function useCreateFee() {
  return useQuery({ queryKey: ["stake-fee"], staleTime: 5 * 60_000, queryFn: () => publicClient.readContract({ address: ADDR.staking, abi: arcStakingAbi, functionName: "createFee" }) });
}

export function fmtApr(bps: bigint): string {
  const pct = Number(bps) / 100;
  if (pct === 0) return "—";
  if (pct >= 10_000) return `${(pct / 1000).toFixed(1)}k%`;
  if (pct >= 100) return `${pct.toFixed(0)}%`;
  return `${pct.toFixed(2)}%`;
}

export type PoolStatus = "upcoming" | "live" | "paused" | "ended";
export function statusOf(p: StakePool, now: number): PoolStatus {
  if (now >= p.finish) return "ended";
  if (p.paused) return "paused";
  if (now < p.start) return "upcoming";
  return "live";
}

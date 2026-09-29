// Chain reads for the share cards. Runs in Vercel's edge runtime: plain fetch +
// viem encode/decode, no wallet, no browser. Tries the private RPC first.
import { encodeFunctionData, decodeFunctionResult, parseAbi, formatUnits, zeroAddress } from "viem";
import deployments from "../../../deployments/arc-5042.json";

export const LOCKER = deployments.contracts.TokenLocker.address;
export const VESTING = deployments.contracts.TokenVesting.address;
export const STAKING = deployments.contracts.ArcStaking?.address;
/** Fallback public origin. Handlers pass the request origin so links and images work on whatever host served the page. */
export const SITE = "https://arc-tools.vercel.app";
export const hostOf = (site) => site.replace(/^https?:\/\//, "");

const lockerAbi = parseAbi([
  "struct Lock { uint256 id; address token; address owner; address withdrawer; uint256 amount; uint256 lockDate; uint256 unlockDate; }",
  "function getLock(uint256 lockId) view returns (Lock)",
]);
const vestingAbi = parseAbi([
  "struct Vesting { uint256 id; address token; address creator; address beneficiary; uint256 total; uint256 released; uint64 start; uint64 cliff; uint64 end; }",
  "function getVesting(uint256 vestingId) view returns (Vesting)",
]);
const stakingAbi = parseAbi([
  "struct PoolConfig { address stakeToken; address rewardToken; uint64 startTime; uint64 duration; uint16 penaltyBps; uint256 minStake; uint256 maxStakePerWallet; uint256 maxTotalStaked; string name; }",
  "struct Pool { PoolConfig cfg; address creator; bool paused; uint64 periodFinish; uint64 lastUpdate; uint256 rewardRate; uint256 rewardPerTokenStored; uint256 totalStaked; uint256 rewardReserve; uint256 accruedTotal; uint256 claimedTotal; uint256 totalRewardsAdded; uint256 stakers; }",
  "function poolInfo(uint256 poolId) view returns (Pool)",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

function rpcs() {
  return [process.env.ARC_RPC_URL, "https://5042.rpc.thirdweb.com", deployments.rpcUrl].filter(Boolean);
}

async function rpc(method, params) {
  let lastErr;
  for (const url of rpcs()) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(6000),
      });
      const j = await r.json();
      if (j && j.result !== undefined && j.result !== null) return j.result;
      lastErr = new Error(j?.error?.message || `bad response from ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("rpc unavailable");
}

async function call(to, abi, functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const out = await rpc("eth_call", [{ to, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: out });
}

export async function getLock(id) {
  const l = await call(LOCKER, lockerAbi, "getLock", [BigInt(id)]);
  if (!l || l.owner === zeroAddress) return null;
  return l;
}

export async function getVesting(id) {
  const v = await call(VESTING, vestingAbi, "getVesting", [BigInt(id)]);
  if (!v || v.creator === zeroAddress) return null;
  return v;
}

export async function getPool(id) {
  if (!STAKING) return null;
  const p = await call(STAKING, stakingAbi, "poolInfo", [BigInt(id)]);
  if (!p || p.creator === zeroAddress) return null;
  return p;
}

/** APR in basis points for same-token pools; 0 when empty or ended (mirrors the contract's currentAprBps). */
export function poolAprBps(p, now) {
  if (p.totalStaked === 0n || now >= Number(p.periodFinish)) return 0n;
  return (((p.rewardRate * 31_536_000n) / 10n ** 18n) * 10_000n) / p.totalStaked;
}
export function fmtApr(bps) {
  const pct = Number(bps) / 100;
  if (pct >= 10_000) return (pct / 1000).toFixed(1) + "k%";
  if (pct >= 100) return pct.toFixed(0) + "%";
  return pct.toFixed(2) + "%";
}
export function poolRemaining(p, now) {
  if (now >= Number(p.periodFinish)) return 0n;
  const from = Math.max(now, Number(p.cfg.startTime));
  return (BigInt(Number(p.periodFinish) - from) * p.rewardRate) / 10n ** 18n;
}

export async function getToken(address) {
  const [symbol, name, decimals] = await Promise.all([
    call(address, erc20Abi, "symbol").catch(() => "TOKEN"),
    call(address, erc20Abi, "name").catch(() => ""),
    call(address, erc20Abi, "decimals").catch(() => 18),
  ]);
  return { symbol: String(symbol), name: String(name), decimals: Number(decimals) };
}

// ---------- formatting ----------

export function fmtAmount(value, decimals = 18, maxFrac = 2) {
  const raw = formatUnits(value, decimals);
  const [int, frac = ""] = raw.split(".");
  const intFmt = BigInt(int).toLocaleString("en-US");
  const f = frac.slice(0, maxFrac).replace(/0+$/, "");
  return f ? `${intFmt}.${f}` : intFmt;
}

export function fmtDateUTC(ts) {
  const d = new Date(Number(ts) * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`,
  };
}

export function shortAddr(a, n = 4) {
  return a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "";
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function durationText(seconds) {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"}`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h} hour${h === 1 ? "" : "s"}`;
  const m = Math.floor(seconds / 60);
  return `${Math.max(1, m)} min`;
}

export function vestedAt(v, t) {
  const start = Number(v.start), cliff = Number(v.cliff), end = Number(v.end);
  if (t < cliff) return 0n;
  if (t >= end) return v.total;
  return (v.total * BigInt(t - start)) / BigInt(end - start);
}

import { parseAbi, type Address } from "viem";
import deployments from "@deployments/arc-5042.json";

/**
 * Production addresses come from deployments/arc-5042.json. For local testing
 * against the 0.1 USDC test pair, set VITE_LOCKER_ADDRESS / VITE_VESTING_ADDRESS
 * in frontend/.env.local (never committed). The override is ignored in production
 * builds unless those variables are present at build time.
 */
const envLocker = import.meta.env.VITE_LOCKER_ADDRESS as string | undefined;
const envVesting = import.meta.env.VITE_VESTING_ADDRESS as string | undefined;

export const LOCKER_ADDRESS = (envLocker && /^0x[0-9a-fA-F]{40}$/.test(envLocker) ? envLocker : deployments.contracts.TokenLocker.address) as Address;
export const LOCKER_DEPLOY_BLOCK = BigInt(deployments.contracts.TokenLocker.deployBlock);
export const VESTING_ADDRESS = (envVesting && /^0x[0-9a-fA-F]{40}$/.test(envVesting) ? envVesting : deployments.contracts.TokenVesting.address) as Address;
export const VESTING_DEPLOY_BLOCK = BigInt(deployments.contracts.TokenVesting.deployBlock);
const envAirdrop = import.meta.env.VITE_AIRDROP_ADDRESS as string | undefined;
export const AIRDROP_ADDRESS = (envAirdrop && /^0x[0-9a-fA-F]{40}$/.test(envAirdrop) ? envAirdrop : deployments.contracts.BulkAirdrop.address) as Address;
export const AIRDROP_MAX_PER_TX = deployments.contracts.BulkAirdrop.maxRecipientsPerTx;
export const USING_TEST_CONTRACTS =
  AIRDROP_ADDRESS.toLowerCase() !== deployments.contracts.BulkAirdrop.address.toLowerCase() || LOCKER_ADDRESS.toLowerCase() !== deployments.contracts.TokenLocker.address.toLowerCase() ||
  VESTING_ADDRESS.toLowerCase() !== deployments.contracts.TokenVesting.address.toLowerCase();
export const EXPLORER = deployments.explorer;

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;

/**
 * Human-readable ABI so viem/wagmi infer full argument and return types.
 * Mirrors src/TokenLocker.sol exactly; deployments/TokenLocker.abi.json is the
 * machine copy for other consumers.
 */
export const lockerAbi = parseAbi([
  "struct Lock { uint256 id; address token; address owner; address withdrawer; uint256 amount; uint256 lockDate; uint256 unlockDate; }",

  // core
  "function lock(address token, uint256 amount, uint256 unlockDate, address withdrawer) payable returns (uint256 lockId)",
  "function incrementLock(uint256 lockId, uint256 amount)",
  "function extendLock(uint256 lockId, uint256 newUnlockDate)",
  "function withdraw(uint256 lockId, uint256 amount)",
  "function setWithdrawer(uint256 lockId, address newWithdrawer)",
  "function transferLockOwnership(uint256 lockId, address newOwner, bool transferWithdrawRights)",
  "function splitLock(uint256 lockId, uint256 amount) returns (uint256 newLockId)",

  // views
  "function getLock(uint256 lockId) view returns (Lock)",
  "function getLocksForToken(address token) view returns (uint256[])",
  "function getLocksForTokenCount(address token) view returns (uint256)",
  "function getLocksForTokenPaginated(address token, uint256 start, uint256 count) view returns (uint256[])",
  "function getLocksForUser(address user) view returns (uint256[])",
  "function getLocksForUserCount(address user) view returns (uint256)",
  "function getLocksForUserPaginated(address user, uint256 start, uint256 count) view returns (uint256[])",
  "function nextLockId() view returns (uint256)",
  "function lockFee() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function pendingFees() view returns (uint256)",
  "function owner() view returns (address)",

  // admin
  "function claimFees()",
  "function setLockFee(uint256 newFee)",
  "function setFeeReceiver(address newReceiver)",

  // events
  "event LockCreated(uint256 indexed lockId, address indexed token, address indexed owner, address withdrawer, uint256 amount, uint256 unlockDate)",
  "event LockWithdrawn(uint256 indexed lockId, address indexed withdrawer, uint256 amount)",
  "event LockExtended(uint256 indexed lockId, uint256 newUnlockDate)",
  "event LockOwnershipTransferred(uint256 indexed lockId, address indexed oldOwner, address indexed newOwner)",
  "event WithdrawerUpdated(uint256 indexed lockId, address indexed oldWithdrawer, address indexed newWithdrawer)",
  "event LockSplit(uint256 indexed originalLockId, uint256 indexed newLockId, uint256 amount)",
  "event LockIncremented(uint256 indexed lockId, uint256 amountAdded)",

  // errors
  "error ZeroAmount()",
  "error ZeroAddress()",
  "error UnlockInPast()",
  "error WrongFee(uint256 sent, uint256 required)",
  "error NotLockOwner()",
  "error NotWithdrawer()",
  "error StillLocked()",
  "error LockMatured()",
  "error MustExtendForward()",
  "error InsufficientLockBalance()",
  "error InvalidSplitAmount()",
  "error NothingReceived()",
  "error NoFeesToClaim()",
  "error FeeTransferFailed()",
  "error NotFeeReceiver()",
  "error OwnableUnauthorizedAccount(address account)",
]);

/** Mirrors src/TokenVesting.sol exactly. */
export const vestingAbi = parseAbi([
  "struct Vesting { uint256 id; address token; address creator; address beneficiary; uint256 total; uint256 released; uint64 start; uint64 cliff; uint64 end; }",
  "struct CreateParams { address beneficiary; uint256 amount; uint64 start; uint64 cliff; uint64 end; }",

  "function createVesting(address token, CreateParams p) payable returns (uint256 id)",
  "function createVestingBatch(address token, CreateParams[] params) payable returns (uint256 firstId)",
  "function claim(uint256 vestingId) returns (uint256 amount)",
  "function setBeneficiary(uint256 vestingId, address newBeneficiary)",

  "function getVesting(uint256 vestingId) view returns (Vesting)",
  "function vestedAmount(uint256 vestingId, uint256 timestamp) view returns (uint256)",
  "function claimable(uint256 vestingId) view returns (uint256)",
  "function getVestingsForToken(address token) view returns (uint256[])",
  "function getVestingsForCreator(address creator) view returns (uint256[])",
  "function getVestingsForBeneficiary(address who) view returns (uint256[])",
  "function getVestingsForTokenPaginated(address token, uint256 start, uint256 count) view returns (uint256[])",
  "function nextVestingId() view returns (uint256)",
  "function fee() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function pendingFees() view returns (uint256)",
  "function owner() view returns (address)",

  "function claimFees()",
  "function setFee(uint256 newFee)",
  "function setFeeReceiver(address newReceiver)",

  "event VestingCreated(uint256 indexed vestingId, address indexed token, address indexed creator, address beneficiary, uint256 total, uint64 start, uint64 cliff, uint64 end)",
  "event TokensClaimed(uint256 indexed vestingId, address indexed beneficiary, uint256 amount)",
  "event BeneficiaryUpdated(uint256 indexed vestingId, address indexed oldBeneficiary, address indexed newBeneficiary)",

  "error ZeroAmount()",
  "error ZeroAddress()",
  "error BadSchedule()",
  "error WrongFee(uint256 sent, uint256 required)",
  "error NotBeneficiary()",
  "error NothingToClaim()",
  "error NothingReceived()",
  "error EmptyBatch()",
  "error NoFeesToClaim()",
  "error FeeTransferFailed()",
  "error NotFeeReceiver()",
  "error OwnableUnauthorizedAccount(address account)",
]);

export type Vesting = {
  id: bigint;
  token: Address;
  creator: Address;
  beneficiary: Address;
  total: bigint;
  released: bigint;
  start: bigint;
  cliff: bigint;
  end: bigint;
};

/** Mirrors src/BulkAirdrop.sol exactly. */
export const airdropAbi = parseAbi([
  "function airdropERC20(address token, address[] recipients, uint256[] amounts) payable returns (uint256 total)",
  "function airdropERC20Same(address token, address[] recipients, uint256 amount) payable returns (uint256 total)",
  "function airdropNative(address[] recipients, uint256[] amounts) payable returns (uint256 total)",
  "function fee() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function pendingFees() view returns (uint256)",
  "function totalAirdrops() view returns (uint256)",
  "function totalRecipients() view returns (uint256)",
  "function MAX_RECIPIENTS() view returns (uint256)",
  "function owner() view returns (address)",
  "function claimFees()",
  "function setFee(uint256 newFee)",
  "function setFeeReceiver(address newReceiver)",
  "event AirdropERC20(address indexed sender, address indexed token, uint256 recipients, uint256 totalAmount)",
  "event AirdropNative(address indexed sender, uint256 recipients, uint256 totalAmount)",
  "error EmptyList()",
  "error TooMany(uint256 count, uint256 max)",
  "error LengthMismatch()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error WrongFee(uint256 sent, uint256 required)",
  "error InsufficientValue(uint256 sent, uint256 required)",
  "error NativeSendFailed(address to)",
  "error RefundFailed()",
  "error NoFeesToClaim()",
  "error FeeTransferFailed()",
  "error NotFeeReceiver()",
  "error OwnableUnauthorizedAccount(address account)",
]);

// ---------- ArcFlow (Uniswap v4 stakes) ----------

export const ARCFLOW_ADDRESS = (deployments.contracts as Record<string, { address: string }>).ArcFlowVault?.address as Address | undefined;
export const V4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;
export const V4_POSITION_MANAGER = "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b" as Address;
export const V4_STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as Address;
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as Address;

/** Mirrors src/arcflow/ArcFlowVault.sol. */
export const arcflowAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct Pool { PoolKey key; bool exists; bool usdcIs0; int24 tickLower; int24 tickUpper; uint128 totalShares; uint256 rewardRate; uint256 periodFinish; uint256 lastUpdate; uint256 rewardPerShareStored; uint256 undistributed; uint256 totalFeesUsdc; uint256 totalProtocolUsdc; }",
  "function stakeUsdc(PoolKey key, uint256 usdcAmount, uint256 slippageBps, uint128 minLiquidity) returns (uint128 liquidity)",
  "function stakePair(PoolKey key, uint256 amount0, uint256 amount1, uint128 minLiquidity) returns (uint128 liquidity)",
  "function unstake(bytes32 id, uint128 shareAmount, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1) returns (uint256 out0, uint256 out1)",
  "function harvest(bytes32 id)",
  "function claim(bytes32 id) returns (uint256 amount)",
  "function compound(bytes32 id, uint256 slippageBps, uint128 minLiquidity) returns (uint128 liquidity)",
  "function poolCount() view returns (uint256)",
  "function poolList(uint256 i) view returns (bytes32)",
  "function poolInfo(bytes32 id) view returns (Pool)",
  "function poolIdFor(PoolKey key) pure returns (bytes32)",
  "function shares(bytes32 id, address user) view returns (uint128)",
  "function pendingRewards(bytes32 id, address user) view returns (uint256)",
  "function positionOf(bytes32 id, address user) view returns (uint128 userShares, uint256 amount0, uint256 amount1)",
  "function previewStakeUsdc(PoolKey key, uint256 usdcAmount) view returns (uint128 liquidity)",
  "function streamInfo(bytes32 id) view returns (uint256 rewardRatePerSecond, uint256 periodFinish, uint256 remainingUsdc)",
  "function protocolFeeBps() view returns (uint256)",
  "function treasury() view returns (address)",
  "function owner() view returns (address)",
  "function STREAM_DURATION() view returns (uint256)",
  "event PoolAdded(bytes32 indexed poolId, address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
  "event Staked(bytes32 indexed poolId, address indexed user, uint128 liquidity, uint256 amount0Used, uint256 amount1Used)",
  "event Unstaked(bytes32 indexed poolId, address indexed user, uint128 liquidity, uint256 amount0Out, uint256 amount1Out)",
  "event Harvested(bytes32 indexed poolId, address indexed caller, uint256 fees0, uint256 fees1, uint256 usdcStreamed, uint256 protocolCut)",
  "event Claimed(bytes32 indexed poolId, address indexed user, uint256 usdc)",
  "error NotPoolManager()",
  "error NotUnlocking()",
  "error PoolMustContainUsdc()",
  "error NativeNotSupported()",
  "error ZeroAmount()",
  "error InsufficientLiquidityOut(uint128 got, uint128 min)",
  "error InsufficientShares()",
  "error InsufficientOutput()",
  "error NothingToClaim()",
  "error FeeTooHigh()",
  "error ZeroAddress()",
  "error UnknownAction()",
  "error PoolNotInitialized()",
]);

/** Uniswap v4 PositionManager: resolves a pool id (first 25 bytes) to its key. */
export const v4PositionManagerAbi = parseAbi([
  "function poolKeys(bytes25 poolId) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
]);

/** Uniswap v4 StateView: pool price and liquidity. */
export const v4StateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

// ---------- ArcFlow v2: shaped positions, concentrated stakes, fee hook ----------

const dc = deployments.contracts as Record<string, { address: string }>;
export const POSITIONS_ADDRESS = dc.ArcFlowPositions?.address as Address | undefined;
export const VAULT_V2_ADDRESS = dc.ArcFlowVaultV2?.address as Address | undefined;
export const FEE_HOOK_ADDRESS = dc.ArcFlowFeeHook?.address as Address | undefined;

const POOL_KEY = "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }";

/** Mirrors src/arcflow/v2/ArcFlowPositions.sol. */
export const positionsAbi = parseAbi([
  POOL_KEY,
  "struct LegSpec { int24 tickLower; int24 tickUpper; uint32 weight; }",
  "struct Leg { int24 tickLower; int24 tickUpper; uint128 liquidity; }",
  "struct Position { address owner; bytes32 poolId; uint8 shape; uint64 createdAt; uint64 lockedUntil; bool closed; }",
  "function mintUsdc(PoolKey key, uint8 shape, uint24 halfWidthTicks, LegSpec[] custom, uint256 usdcAmount, uint256 slippageBps, uint256 minLiquidity) returns (uint256 positionId)",
  "function mintPair(PoolKey key, uint8 shape, uint24 halfWidthTicks, LegSpec[] custom, uint256 amount0, uint256 amount1, uint256 minLiquidity) returns (uint256 positionId)",
  "function collect(uint256 positionId) returns (uint256 fees0, uint256 fees1)",
  "function decrease(uint256 positionId, uint256 bps, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1) returns (uint256 out0, uint256 out1)",
  "function lock(uint256 positionId, uint64 until) payable",
  "function extendLock(uint256 positionId, uint64 until)",
  "function transferPosition(uint256 positionId, address to)",
  "function previewLegs(PoolKey key, uint8 shape, uint24 halfWidthTicks) view returns (LegSpec[])",
  "function previewRatio(PoolKey key, uint8 shape, uint24 halfWidthTicks) view returns (uint256 need0, uint256 need1, uint256 share0Wad)",
  "function positionInfo(uint256 positionId) view returns (Position p, PoolKey key, Leg[] legs)",
  "function positionAmounts(uint256 positionId) view returns (uint256 amount0, uint256 amount1, bool inRange)",
  "function pendingFees(uint256 positionId) view returns (uint256 fees0, uint256 fees1)",
  "function positionsOf(address who) view returns (uint256[])",
  "function positionsInPool(bytes32 id) view returns (uint256[])",
  "function lockedPositionIds(uint256 offset, uint256 limit) view returns (uint256[] out, uint256 total)",
  "function nextPositionId() view returns (uint256)",
  "function lockFee() view returns (uint256)",
  "function protocolFeeBps() view returns (uint256)",
  "event PositionMinted(uint256 indexed positionId, address indexed owner, bytes32 indexed poolId, uint8 shape, uint256 legs, uint256 amount0, uint256 amount1)",
  "error BadShape()",
  "error BadLegs()",
  "error NotPositionOwner()",
  "error PositionClosed()",
  "error PositionLocked(uint64 until)",
  "error BadLockTime()",
  "error WrongFee(uint256 sent, uint256 required)",
  "error PoolHasNoUsdc()",
  "error InsufficientLiquidityOut(uint256 got, uint256 min)",
  "error InsufficientOutput()",
  "error InsufficientInput()",
  "error BadBps()",
  "error ZeroAmount()",
  "error ZeroAddress()",
  "error NativeNotSupported()",
  "error PoolNotInitialized()",
]);

/** Mirrors src/arcflow/v2/ArcFlowVaultV2.sol. */
export const vaultV2Abi = parseAbi([
  POOL_KEY,
  "struct Strategy { PoolKey key; bool exists; bool usdcIs0; uint8 width; int24 halfWidth; int24 tickLower; int24 tickUpper; uint128 liquidity; uint256 totalShares; uint256 idle0; uint256 idle1; uint256 rewardRate; uint256 periodFinish; uint256 lastUpdate; uint256 lastNotify; uint256 rewardPerShareStored; uint256 undistributed; uint256 totalFeesUsdc; uint256 totalProtocolUsdc; uint256 netDepositedUsdc; uint64 lastRebalance; uint64 lastIdleDeploy; uint64 pokedAt; int24 pokedTick; uint32 rebalances; }",
  "function stake(PoolKey key, uint8 width, uint256 usdcAmount, uint256 slippageBps, uint256 minShares) returns (uint256 sharesOut)",
  "function unstake(bytes32 sid, uint256 shareAmount, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1) returns (uint256 out0, uint256 out1)",
  "function harvest(bytes32 sid) returns (uint256 feesUsdc)",
  "function claim(bytes32 sid) returns (uint256 amount)",
  "function compound(bytes32 sid, uint256 slippageBps, uint256 minShares) returns (uint256 sharesOut)",
  "function poke(bytes32 sid)",
  "function rebalance(bytes32 sid, uint256 slippageBps)",
  "function deployIdle(bytes32 sid, uint256 slippageBps)",
  "function strategyIdFor(PoolKey key, uint8 width) pure returns (bytes32)",
  "function strategyInfo(bytes32 sid) view returns (Strategy)",
  "function strategyState(bytes32 sid) view returns (bool inRange, int24 tick, uint256 tvlUsdc, uint256 aprBps, uint256 streamRemainingUsdc)",
  "function userState(bytes32 sid, address user) view returns (uint256 userShares, uint256 amount0, uint256 amount1, uint256 valueUsdc, uint256 pending)",
  "function bandFor(PoolKey key, uint8 width) view returns (int24 tickLower, int24 tickUpper, bool exists)",
  "function strategiesOf(address user) view returns (bytes32[])",
  "function strategyCount() view returns (uint256)",
  "function strategyList(uint256) view returns (bytes32)",
  "function shares(bytes32 sid, address user) view returns (uint256)",
  "function capUsdc() view returns (uint256)",
  "function bountyBps() view returns (uint256)",
  "function protocolFeeBps() view returns (uint256)",
  "function depositsPaused() view returns (bool)",
  "error PoolMustContainUsdc()",
  "error BadWidth()",
  "error StrategyNotFound()",
  "error DepositsPaused()",
  "error CapExceeded(uint256 cap)",
  "error InsufficientSharesOut(uint256 got, uint256 min)",
  "error InsufficientShares()",
  "error InsufficientOutput()",
  "error InsufficientInput()",
  "error NothingToClaim()",
  "error StillInRange()",
  "error NotPoked()",
  "error PokeTooFresh(uint256 readyAt)",
  "error PokeExpired()",
  "error PokeStillValid()",
  "error PriceDrifted(int24 pokedTick, int24 tickNow)",
  "error CooldownActive(uint256 readyAt)",
  "error SlippageTooHigh()",
  "error RebalanceIncomplete()",
  "error NothingIdle()",
  "error ZeroAmount()",
  "error NativeNotSupported()",
  "error PoolNotInitialized()",
]);

export const feeHookAbi = parseAbi([
  POOL_KEY,
  "function currentFee(PoolKey key) view returns (uint24)",
  "function BASE_FEE() view returns (uint24)",
  "function MAX_FEE() view returns (uint24)",
]);

export type FlowStrategy = {
  key: PoolKey;
  exists: boolean;
  usdcIs0: boolean;
  width: number;
  halfWidth: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  totalShares: bigint;
  idle0: bigint;
  idle1: bigint;
  rewardRate: bigint;
  periodFinish: bigint;
  lastUpdate: bigint;
  lastNotify: bigint;
  rewardPerShareStored: bigint;
  undistributed: bigint;
  totalFeesUsdc: bigint;
  totalProtocolUsdc: bigint;
  netDepositedUsdc: bigint;
  lastRebalance: bigint;
  lastIdleDeploy: bigint;
  pokedAt: bigint;
  pokedTick: number;
  rebalances: number;
};

// ---------- ArcStaking (time-boxed reward pools) ----------

const prodStaking = (deployments.contracts as Record<string, { address: string }>).ArcStaking?.address as Address | undefined;
const envStaking = import.meta.env.VITE_STAKING_ADDRESS as string | undefined;
export const STAKING_ADDRESS = (envStaking && /^0x[0-9a-fA-F]{40}$/.test(envStaking) ? envStaking : prodStaking) as Address | undefined;
export const USING_TEST_STAKING = !!STAKING_ADDRESS && !!prodStaking && STAKING_ADDRESS.toLowerCase() !== prodStaking.toLowerCase();

/** Mirrors src/ArcStaking.sol (time-boxed reward pools). */
export const stakingAbi = parseAbi([
  "struct PoolConfig { address stakeToken; address rewardToken; uint64 startTime; uint64 duration; uint16 penaltyBps; uint256 minStake; uint256 maxStakePerWallet; uint256 maxTotalStaked; string name; }",
  "struct Pool { PoolConfig cfg; address creator; bool paused; uint64 periodFinish; uint64 lastUpdate; uint256 rewardRate; uint256 rewardPerTokenStored; uint256 totalStaked; uint256 rewardReserve; uint256 accruedTotal; uint256 claimedTotal; uint256 totalRewardsAdded; uint256 stakers; }",
  "function createPool(PoolConfig cfg, uint256 rewardAmount) payable returns (uint256 id)",
  "function addRewards(uint256 poolId, uint256 amount)",
  "function extendPool(uint256 poolId, uint64 extraDuration, uint256 extraRewards)",
  "function setPaused(uint256 poolId, bool paused)",
  "function reclaimUndistributed(uint256 poolId) returns (uint256 amount)",
  "function stake(uint256 poolId, uint256 amount)",
  "function unstake(uint256 poolId, uint256 amount)",
  "function claim(uint256 poolId) returns (uint256 paid)",
  "function exit(uint256 poolId)",
  "function compound(uint256 poolId) returns (uint256 added)",
  "function poolInfo(uint256 poolId) view returns (Pool)",
  "function poolExists(uint256 poolId) view returns (bool)",
  "function users(uint256 poolId, address who) view returns (uint256 staked, uint256 rewardPerTokenPaid, uint256 rewards, uint64 firstStakeAt)",
  "function earned(uint256 poolId, address who) view returns (uint256)",
  "function rewardsRemaining(uint256 poolId) view returns (uint256)",
  "function currentAprBps(uint256 poolId) view returns (uint256)",
  "function aprBpsFor(uint256 poolId, uint256 hypotheticalStaked) view returns (uint256)",
  "function penaltyFor(uint256 poolId, uint256 amount) view returns (uint256)",
  "function getPoolsByCreator(address who) view returns (uint256[])",
  "function getPoolsByStakeToken(address token) view returns (uint256[])",
  "function getPoolsForUser(address who) view returns (uint256[])",
  "function nextPoolId() view returns (uint256)",
  "function createFee() view returns (uint256)",
  "function MAX_PENALTY_BPS() view returns (uint256)",
  "event PoolCreated(uint256 indexed poolId, address indexed creator, address indexed stakeToken, address rewardToken, uint64 startTime, uint64 duration, uint256 rewards, uint16 penaltyBps, string name)",
  "event RewardsAdded(uint256 indexed poolId, address indexed from, uint256 amount, uint64 periodFinish, uint256 rewardRate)",
  "event PoolExtended(uint256 indexed poolId, uint64 newFinish, uint256 addedRewards, uint256 rewardRate)",
  "event Staked(uint256 indexed poolId, address indexed user, uint256 amount)",
  "event Unstaked(uint256 indexed poolId, address indexed user, uint256 amount, uint256 penalty)",
  "event Claimed(uint256 indexed poolId, address indexed user, uint256 amount)",
  "error NotEnded()",
  "error NothingToReclaim()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error WrongFee(uint256 sent, uint256 required)",
  "error BadConfig()",
  "error NotCreator()",
  "error PoolNotFound()",
  "error PoolPaused()",
  "error NotStarted()",
  "error Ended()",
  "error BelowMinStake()",
  "error AboveMaxStake()",
  "error PoolFull()",
  "error InsufficientStake()",
  "error NothingToClaim()",
  "error NothingReceived()",
  "error RewardTokenMismatch()",
  "error NoFeesToClaim()",
  "error FeeTransferFailed()",
  "error NotFeeReceiver()",
  "error OwnableUnauthorizedAccount(address account)",
]);

export type StakingPoolConfig = {
  stakeToken: Address;
  rewardToken: Address;
  startTime: bigint;
  duration: bigint;
  penaltyBps: number;
  minStake: bigint;
  maxStakePerWallet: bigint;
  maxTotalStaked: bigint;
  name: string;
};
export type StakingPool = {
  cfg: StakingPoolConfig;
  creator: Address;
  paused: boolean;
  periodFinish: bigint;
  lastUpdate: bigint;
  rewardRate: bigint;
  rewardPerTokenStored: bigint;
  totalStaked: bigint;
  rewardReserve: bigint;
  accruedTotal: bigint;
  claimedTotal: bigint;
  totalRewardsAdded: bigint;
  stakers: bigint;
};

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export type Lock = {
  id: bigint;
  token: Address;
  owner: Address;
  withdrawer: Address;
  amount: bigint;
  lockDate: bigint;
  unlockDate: bigint;
};

export type TokenMeta = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: bigint;
};

/** Plain-language messages for every custom error the contract can throw. */
export const ERROR_TEXT: Record<string, string> = {
  // ArcP2P
  ListingNotFound: "That listing does not exist.",
  NotSeller: "Only the seller can change this listing.",
  NotActive: "This listing has nothing left to sell.",
  Expired: "This listing has expired.",
  NotAllowedBuyer: "This listing is reserved for another buyer.",
  ExceedsRemaining: "That is more than the listing has left.",
  BelowMinFill: "That is below the seller's minimum fill.",
  InsufficientPayment: "The price moved; not enough USDC was sent. Try again.",
  BadPrice: "The price could not be read. Check the pool or use a fixed price.",
  BadSpread: "Spread must be between -90% and +100%.",
  PoolRequired: "Market pricing needs a Uniswap v4 USDC pool for this token.",
  BadExpiry: "Expiry must be in the future.",
  // ArcCash
  CommitmentAlreadySubmitted: "This note was already deposited. Generate a new note.",
  WrongDenomination: "The amount sent does not match this pool's denomination.",
  UnknownRoot: "The pool changed while proving (a new deposit arrived). Generate the proof again.",
  NoteAlreadySpent: "This note has already been withdrawn.",
  InvalidProof: "The pool rejected the proof. Check the note and try again.",
  FeeExceedsDenomination: "The fee is larger than the deposit.",
  ZeroAmount: "Enter an amount above zero.",
  ZeroAddress: "That address is empty. Enter a real wallet address.",
  UnlockInPast: "The unlock date has to be in the future.",
  WrongFee: "The lock fee sent does not match the current fee. Refresh and try again.",
  NotLockOwner: "Only the lock owner can do this.",
  NotWithdrawer: "Only the withdrawer of this lock can do this.",
  StillLocked: "This lock has not reached its unlock date yet.",
  LockMatured: "This lock has already unlocked. Extend it before adding more.",
  MustExtendForward: "Pick a date later than the current unlock date.",
  InsufficientLockBalance: "That is more than the lock holds.",
  InvalidSplitAmount: "The split amount must be above zero and below the lock's balance.",
  NothingReceived: "The token sent nothing to the locker. It may be paused or blocking transfers.",
  NoFeesToClaim: "No fees are waiting to be claimed.",
  FeeTransferFailed: "The fee receiver refused the payment.",
  NotFeeReceiver: "Only the fee receiver or the contract owner can claim fees.",
  BadSchedule: "Check the dates: cliff must be at or after start, end must be after start and cliff, and end must be in the future.",
  NotBeneficiary: "Only the beneficiary of this schedule can do this.",
  NothingToClaim: "Nothing has vested since the last claim.",
  EmptyBatch: "Add at least one schedule.",
  EmptyList: "Add at least one recipient.",
  TooMany: "Too many recipients in one transaction. The app splits lists into batches automatically; refresh and retry.",
  LengthMismatch: "Recipients and amounts do not line up.",
  InsufficientValue: "Not enough USDC sent to cover the amounts plus the fee.",
  NativeSendFailed: "One recipient is a contract that refuses USDC, so the whole batch was rolled back. Remove it and retry.",
  RefundFailed: "Refund of excess USDC failed.",
  PoolMustContainUsdc: "ArcFlow only supports pools paired with USDC.",
  NativeNotSupported: "Pools that use the native coin directly are not supported; use the USDC token pools.",
  InsufficientLiquidityOut: "The price moved more than your slippage allows. Raise the tolerance or try a smaller amount.",
  InsufficientShares: "You do not have that many shares in this pool.",
  InsufficientOutput: "Output fell below your minimum. Raise the tolerance or retry.",
  PoolNotInitialized: "That pool does not exist on Uniswap v4 on Arc.",
  BadShape: "Unknown position shape.",
  BadLegs: "Those price ranges are not valid for this pool.",
  NotPositionOwner: "Only the position's owner can do this.",
  PositionClosed: "This position is already closed.",
  PositionLocked: "This position's liquidity is locked. Fees can still be collected.",
  BadLockTime: "Pick a lock end that is in the future and later than the current lock.",
  PoolHasNoUsdc: "This pool has no USDC side, so USDC-only entry and exit are not available.",
  InsufficientInput: "The pool asked for slightly more than was supplied. Try a slightly larger amount.",
  BadBps: "Choose a share between 1% and 100%.",
  BadWidth: "Unknown band width.",
  StrategyNotFound: "Nobody has staked into this band yet.",
  DepositsPaused: "New deposits are paused. Withdrawals and claims still work.",
  CapExceeded: "This band has reached its beta deposit cap.",
  InsufficientSharesOut: "The price moved and fewer shares would be minted than expected. Try again.",
  StillInRange: "The price is still inside the band, so there is nothing to rebalance.",
  NotPoked: "The band has to be flagged as out of range first, then rebalanced after the waiting period.",
  PokeTooFresh: "Flagged. The rebalance opens 10 minutes after the flag.",
  PokeExpired: "That flag expired. Flag the band again.",
  PokeStillValid: "This band is already flagged.",
  PriceDrifted: "The price moved too far since the flag. Wait for it to settle and flag again.",
  CooldownActive: "That action was done recently. Try again a little later.",
  SlippageTooHigh: "The vault never moves a pool's price by more than 1% per call.",
  RebalanceIncomplete: "The pool is too thin to move any liquidity right now. Try again later.",
  NothingIdle: "There is no idle balance to put to work.",
  BadConfig: "Check the pool settings: duration between 1 hour and 4 years, penalty at most 50%, start not in the past, minimum not above maximum, name up to 48 characters.",
  NotEnded: "The pool has not ended yet.",
  NothingToReclaim: "Every reward in this pool was earned by stakers; nothing to reclaim.",
  NotCreator: "Only the pool's creator can do this.",
  PoolNotFound: "That staking pool does not exist.",
  PoolPaused: "This pool is paused for new stakes. Withdrawals still work.",
  NotStarted: "This pool has not started yet.",
  Ended: "This pool has ended. You can still unstake and claim.",
  BelowMinStake: "That is below the pool's minimum stake.",
  AboveMaxStake: "That would exceed the pool's per-wallet maximum.",
  PoolFull: "The pool has reached its total stake cap.",
  InsufficientStake: "You do not have that much staked.",
  RewardTokenMismatch: "Compound only works when the reward token is the staked token.",
  OwnableUnauthorizedAccount: "Only the contract owner can do this.",
};

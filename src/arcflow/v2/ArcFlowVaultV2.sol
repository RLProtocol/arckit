// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ArcFlowBase} from "./ArcFlowBase.sol";

/// @title ArcFlowVaultV2 ("Stakes v2")
/// @notice Deposit USDC, earn a pool's swap fees, streamed. Unlike v1 (full range), each strategy keeps its
///         liquidity in a band around the price, so every dollar earns several times more fees.
///
///  - A strategy is (pool, width). Three widths: Tight (~±10 %), Medium (~±25 %), Wide (~±49 %).
///  - Every stake, unstake, claim-and-compound or harvest realises the position's fees: the non-USDC half is
///    swapped to USDC in the pool, a protocol cut goes to the treasury, the rest streams to stakers over
///    seven days. Calling `harvest` directly earns the caller a small bounty, so quiet pools keep flowing.
///  - When the price leaves the band the position stops earning. Anyone may `poke` to record that, and after
///    a delay anyone may `rebalance`, which recentres the band. The delay plus a drift limit means a price
///    pushed out of range for one block cannot trigger a rebalance at a manipulated price. A rebalance never
///    moves the pool price by more than 1 %. In a thin pool that means it may only partly fill: the rest waits
///    as an idle balance (still owned pro-rata by holders) and `deployIdle` works it in, 1 % at a time.
///  - Shares are a pro-rata claim on the strategy's liquidity and any idle balance left by a rebalance.
///    New shares are minted by value, so a newcomer pays for that idle balance like everything else.
///  - Fees realised by a stake are streamed from that moment to all holders including the newcomer. Because
///    every stake, unstake and harvest realises fees, the amount exposed to that dilution is only what accrued
///    since the last interaction.
///
/// Beta safety: a per-strategy USDC cap and a withdraw-only switch. Unstake and claim can never be paused.
contract ArcFlowVaultV2 is ArcFlowBase, ReentrancyGuard, Ownable2Step {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;

    // ---------- Errors ----------

    error PoolMustContainUsdc();
    error BadWidth();
    error StrategyNotFound();
    error DepositsPaused();
    error CapExceeded(uint256 cap);
    error InsufficientSharesOut(uint256 got, uint256 min);
    error InsufficientShares();
    error InsufficientOutput();
    error NothingToClaim();
    error StillInRange();
    error NotPoked();
    error PokeTooFresh(uint256 readyAt);
    error PokeExpired();
    error PokeStillValid();
    error PriceDrifted(int24 pokedTick, int24 tickNow);
    error CooldownActive(uint256 readyAt);
    error SlippageTooHigh();
    error RebalanceIncomplete();
    error NothingIdle();
    error FeeTooHigh();
    error ZeroAddress();

    // ---------- Constants ----------

    uint256 public constant STREAM_DURATION = 7 days;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 2_000;
    uint256 public constant MAX_BOUNTY_BPS = 500;
    uint256 public constant REBALANCE_DELAY = 10 minutes;
    uint256 public constant POKE_TTL = 2 hours;
    uint256 public constant REBALANCE_COOLDOWN = 1 hours;
    uint256 public constant MAX_REBALANCE_SLIPPAGE_BPS = 100; // the vault never moves a pool's price by more than 1 % per call
    uint256 public constant IDLE_DEPLOY_INTERVAL = 10 minutes;
    int24 public constant MAX_DRIFT_TICKS = 300; // ~3 % between poke and rebalance
    uint256 public constant MIN_NOTIFY_INTERVAL = 1 hours;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant YEAR = 365 days;

    // ---------- Admin state ----------

    address public treasury;
    uint256 public protocolFeeBps = 100; // 1 % of harvested fees
    uint256 public bountyBps = 50; // 0.5 % of harvested fees to whoever calls harvest()
    uint256 public capUsdc = 25_000e6; // per strategy, 0 = no cap
    bool public depositsPaused;

    // ---------- Strategy state ----------

    struct Strategy {
        PoolKey key;
        bool exists;
        bool usdcIs0;
        uint8 width; // 0 tight, 1 medium, 2 wide
        int24 halfWidth; // ticks, a multiple of the pool's spacing
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 totalShares;
        uint256 idle0;
        uint256 idle1;
        // streaming rewards (scaled by PRECISION)
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdate;
        uint256 lastNotify;
        uint256 rewardPerShareStored;
        uint256 undistributed;
        // stats
        uint256 totalFeesUsdc;
        uint256 totalProtocolUsdc;
        uint256 netDepositedUsdc;
        uint64 lastRebalance;
        uint64 lastIdleDeploy;
        uint64 pokedAt;
        int24 pokedTick;
        uint32 rebalances;
    }

    mapping(bytes32 => Strategy) internal strategies;
    bytes32[] public strategyList;
    mapping(bytes32 => mapping(address => uint256)) public shares;
    mapping(bytes32 => mapping(address => uint256)) public userRewardPerSharePaid;
    mapping(bytes32 => mapping(address => uint256)) public rewards;
    mapping(address => bytes32[]) internal userStrategies;
    mapping(bytes32 => mapping(address => bool)) internal userSeen;

    // ---------- Events ----------

    event StrategyAdded(bytes32 indexed strategyId, PoolId indexed poolId, uint8 width, int24 tickLower, int24 tickUpper);
    event Staked(bytes32 indexed strategyId, address indexed user, uint256 usdcIn, uint256 sharesOut, uint128 liquidity);
    event Unstaked(bytes32 indexed strategyId, address indexed user, uint256 sharesIn, uint256 amount0, uint256 amount1);
    event Harvested(bytes32 indexed strategyId, address indexed caller, uint256 feesUsdc, uint256 streamed, uint256 protocolCut, uint256 bounty);
    event Claimed(bytes32 indexed strategyId, address indexed user, uint256 usdc);
    event Poked(bytes32 indexed strategyId, int24 tick);
    event Rebalanced(bytes32 indexed strategyId, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 idle0, uint256 idle1);
    event IdleDeployed(bytes32 indexed strategyId, uint128 liquidity, uint256 idle0, uint256 idle1);
    event ParamsUpdated(uint256 protocolFeeBps, uint256 bountyBps, uint256 capUsdc, bool depositsPaused);
    event TreasuryUpdated(address treasury);

    constructor(IPoolManager _poolManager, IERC20 _usdc, address _treasury) ArcFlowBase(_poolManager, _usdc) Ownable(msg.sender) {
        treasury = _treasury == address(0) ? msg.sender : _treasury;
    }

    // ============================================================
    //                        USER ACTIONS
    // ============================================================

    /// @notice Stake USDC into (pool, width). Creates the strategy on first use.
    function stake(PoolKey calldata key, uint8 width, uint256 usdcAmount, uint256 slippageBps, uint256 minShares)
        external
        nonReentrant
        returns (uint256 sharesOut)
    {
        if (usdcAmount == 0) revert ZeroAmount();
        bytes32 sid = _ensureStrategy(key, width);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        sharesOut = _stake(sid, msg.sender, usdcAmount, slippageBps, minShares);
    }

    /// @notice Burn shares for the underlying tokens (or USDC only). Never pausable.
    function unstake(bytes32 sid, uint256 shareAmount, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1)
        external
        nonReentrant
        returns (uint256 out0, uint256 out1)
    {
        Strategy storage s = _get(sid);
        if (shareAmount == 0) revert ZeroAmount();
        if (shares[sid][msg.sender] < shareAmount) revert InsufficientShares();
        _updateReward(sid, msg.sender);
        (out0, out1) = abi.decode(
            _unlock(abi.encode(Action.Unstake, sid, msg.sender, abi.encode(shareAmount, toUsdc, slippageBps))), (uint256, uint256)
        );
        s.netDepositedUsdc -= FullMath.mulDiv(s.netDepositedUsdc, shareAmount, s.totalShares);
        shares[sid][msg.sender] -= shareAmount;
        s.totalShares -= shareAmount;
        if (out0 < minOut0 || out1 < minOut1) revert InsufficientOutput();
        _payout(s.key.currency0, msg.sender, out0);
        _payout(s.key.currency1, msg.sender, out1);
        emit Unstaked(sid, msg.sender, shareAmount, out0, out1);
    }

    /// @notice Realise the strategy's fees and stream them. The caller earns `bountyBps` of what was harvested.
    function harvest(bytes32 sid) external nonReentrant returns (uint256 feesUsdc) {
        _get(sid);
        _updateReward(sid, address(0));
        feesUsdc = abi.decode(_unlock(abi.encode(Action.Harvest, sid, msg.sender, bytes(""))), (uint256));
    }

    function claim(bytes32 sid) external nonReentrant returns (uint256 amount) {
        _updateReward(sid, msg.sender);
        amount = rewards[sid][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[sid][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(sid, msg.sender, amount);
    }

    /// @notice Claim streamed USDC and stake it straight back.
    function compound(bytes32 sid, uint256 slippageBps, uint256 minShares) external nonReentrant returns (uint256 sharesOut) {
        _get(sid);
        _updateReward(sid, msg.sender);
        uint256 amount = rewards[sid][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[sid][msg.sender] = 0;
        emit Claimed(sid, msg.sender, amount);
        sharesOut = _stake(sid, msg.sender, amount, slippageBps, minShares);
    }

    // ============================================================
    //                     POKE / REBALANCE
    // ============================================================

    /// @notice Record that the price is outside the band. Starts the rebalance delay.
    function poke(bytes32 sid) external {
        Strategy storage s = _get(sid);
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        if (_inRange(s, tick)) revert StillInRange();
        if (s.pokedAt != 0 && block.timestamp <= s.pokedAt + POKE_TTL) revert PokeStillValid();
        s.pokedAt = uint64(block.timestamp);
        s.pokedTick = tick;
        emit Poked(sid, tick);
    }

    /// @notice Recentre the band around the current price. Anyone may call once a poke has aged
    ///         `REBALANCE_DELAY`, the price is still out of range and has not drifted far from the poke.
    function rebalance(bytes32 sid, uint256 slippageBps) external nonReentrant {
        Strategy storage s = _get(sid);
        if (depositsPaused) revert DepositsPaused();
        if (slippageBps > MAX_REBALANCE_SLIPPAGE_BPS) revert SlippageTooHigh();
        if (s.pokedAt == 0) revert NotPoked();
        if (block.timestamp < s.pokedAt + REBALANCE_DELAY) revert PokeTooFresh(s.pokedAt + REBALANCE_DELAY);
        if (block.timestamp > s.pokedAt + POKE_TTL) revert PokeExpired();
        if (block.timestamp < uint256(s.lastRebalance) + REBALANCE_COOLDOWN) revert CooldownActive(uint256(s.lastRebalance) + REBALANCE_COOLDOWN);
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        if (_inRange(s, tick)) revert StillInRange();
        int24 drift = tick > s.pokedTick ? tick - s.pokedTick : s.pokedTick - tick;
        if (drift > MAX_DRIFT_TICKS) revert PriceDrifted(s.pokedTick, tick);

        _updateReward(sid, address(0));
        _unlock(abi.encode(Action.Rebalance, sid, msg.sender, abi.encode(slippageBps)));
        s.pokedAt = 0;
        s.lastRebalance = uint64(block.timestamp);
        s.lastIdleDeploy = uint64(block.timestamp);
        s.rebalances += 1;
        emit Rebalanced(sid, s.tickLower, s.tickUpper, s.liquidity, s.idle0, s.idle1);
    }

    /// @notice Work a strategy's idle balance (left by a partly filled rebalance) back into the band.
    ///         Anyone may call, at most once per IDLE_DEPLOY_INTERVAL, while the price is inside the band.
    function deployIdle(bytes32 sid, uint256 slippageBps) external nonReentrant {
        Strategy storage s = _get(sid);
        if (depositsPaused) revert DepositsPaused();
        if (slippageBps > MAX_REBALANCE_SLIPPAGE_BPS) revert SlippageTooHigh();
        if (s.idle0 == 0 && s.idle1 == 0) revert NothingIdle();
        if (block.timestamp < uint256(s.lastIdleDeploy) + IDLE_DEPLOY_INTERVAL) revert CooldownActive(uint256(s.lastIdleDeploy) + IDLE_DEPLOY_INTERVAL);
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        if (!_inRange(s, tick)) revert NotPoked(); // out of range: poke and rebalance instead
        _updateReward(sid, address(0));
        _unlock(abi.encode(Action.DeployIdle, sid, msg.sender, abi.encode(slippageBps)));
        s.lastIdleDeploy = uint64(block.timestamp);
        emit IdleDeployed(sid, s.liquidity, s.idle0, s.idle1);
    }

    // ============================================================
    //                            VIEWS
    // ============================================================

    function strategyIdFor(PoolKey calldata key, uint8 width) external pure returns (bytes32) {
        return _sid(key.toId(), width);
    }

    function strategyInfo(bytes32 sid) external view returns (Strategy memory) {
        return strategies[sid];
    }

    function strategyCount() external view returns (uint256) {
        return strategyList.length;
    }

    function strategiesOf(address user) external view returns (bytes32[] memory) {
        return userStrategies[user];
    }

    /// @notice Live state for the UI: in range?, current tick, TVL in USDC at spot, APR in bps from the running stream.
    function strategyState(bytes32 sid) external view returns (bool inRange, int24 tick, uint256 tvlUsdc, uint256 aprBps, uint256 streamRemainingUsdc) {
        Strategy storage s = strategies[sid];
        if (!s.exists) return (false, 0, 0, 0, 0);
        uint160 sqrtP;
        (sqrtP, tick,,) = poolManager.getSlot0(s.key.toId());
        inRange = _inRange(s, tick);
        (uint256 a0, uint256 a1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, s.liquidity, false);
        tvlUsdc = _usdcValue(s, a0 + s.idle0, a1 + s.idle1, sqrtP);
        if (block.timestamp < s.periodFinish) {
            streamRemainingUsdc = ((s.periodFinish - block.timestamp) * s.rewardRate) / PRECISION;
            if (tvlUsdc > 0) aprBps = FullMath.mulDiv((s.rewardRate * YEAR) / PRECISION, 10_000, tvlUsdc);
        }
    }

    /// @notice A user's shares, their value in both tokens and in USDC at spot, and USDC claimable now.
    function userState(bytes32 sid, address user)
        external
        view
        returns (uint256 userShares, uint256 amount0, uint256 amount1, uint256 valueUsdc, uint256 pending)
    {
        Strategy storage s = strategies[sid];
        userShares = shares[sid][user];
        pending = rewards[sid][user] + (userShares * (_rewardPerShare(sid) - userRewardPerSharePaid[sid][user])) / PRECISION;
        if (userShares == 0 || s.totalShares == 0) return (userShares, 0, 0, 0, pending);
        (uint160 sqrtP,,,) = poolManager.getSlot0(s.key.toId());
        uint128 liq = uint128(FullMath.mulDiv(s.liquidity, userShares, s.totalShares));
        (amount0, amount1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, liq, false);
        amount0 += FullMath.mulDiv(s.idle0, userShares, s.totalShares);
        amount1 += FullMath.mulDiv(s.idle1, userShares, s.totalShares);
        valueUsdc = _usdcValue(s, amount0, amount1, sqrtP);
    }

    /// @notice The band a width would get right now (before the strategy exists) or the live band.
    function bandFor(PoolKey calldata key, uint8 width) external view returns (int24 tickLower, int24 tickUpper, bool exists) {
        bytes32 sid = _sid(key.toId(), width);
        Strategy storage s = strategies[sid];
        if (s.exists) return (s.tickLower, s.tickUpper, true);
        (,, int24 tick) = _checkKey(key);
        (tickLower, tickUpper) = _band(tick, key.tickSpacing, _halfWidth(width, key.tickSpacing));
    }

    // ============================================================
    //                            ADMIN
    // ============================================================

    function setParams(uint256 _protocolFeeBps, uint256 _bountyBps, uint256 _capUsdc, bool _depositsPaused) external onlyOwner {
        if (_protocolFeeBps > MAX_PROTOCOL_FEE_BPS || _bountyBps > MAX_BOUNTY_BPS) revert FeeTooHigh();
        protocolFeeBps = _protocolFeeBps;
        bountyBps = _bountyBps;
        capUsdc = _capUsdc;
        depositsPaused = _depositsPaused;
        emit ParamsUpdated(_protocolFeeBps, _bountyBps, _capUsdc, _depositsPaused);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }

    // ============================================================
    //                    POOL MANAGER CALLBACK
    // ============================================================

    enum Action {
        Stake,
        Unstake,
        Harvest,
        Rebalance,
        DeployIdle
    }

    function _onUnlock(bytes calldata data) internal override returns (bytes memory) {
        (Action action, bytes32 sid, address user, bytes memory args) = abi.decode(data, (Action, bytes32, address, bytes));
        Strategy storage s = strategies[sid];
        if (action == Action.Stake) return _cbStake(s, sid, user, args);
        if (action == Action.Unstake) return _cbUnstake(s, sid, user, args);
        if (action == Action.Harvest) {
            if (s.liquidity == 0) return abi.encode(uint256(0));
            (,, uint256 feesUsdc) = _modify(s, sid, user, 0, true);
            return abi.encode(feesUsdc);
        }
        if (action == Action.DeployIdle) {
            (uint256 i0, uint256 i1) = _swapTowardShape(s.key, _legs(s), s.idle0, s.idle1, abi.decode(args, (uint256)));
            uint128 add = _liqFor(s, i0, i1);
            if (add == 0) revert RebalanceIncomplete();
            (s.idle0, s.idle1) = _addLiquidity(s, sid, user, add, i0, i1);
            return bytes("");
        }
        return _cbRebalance(s, sid, user, args);
    }

    function _cbStake(Strategy storage s, bytes32 sid, address user, bytes memory args) internal returns (bytes memory) {
        (uint256 usdcAmount, uint256 slippageBps) = abi.decode(args, (uint256, uint256));
        _deployIdle(s, sid, user);
        (uint256 bal0, uint256 bal1) = _zapUsdc(s.key, s.usdcIs0, _legs(s), usdcAmount, slippageBps);
        uint128 liq = _liqFor(s, bal0, bal1);
        if (liq == 0) revert ZeroAmount();
        // everything existing holders own, and what the newcomer adds, priced at the same spot
        (uint256 valueBefore, uint256 valueAdded) = _stakeValues(s, liq);
        // refunded USDC does not count toward the cap
        return abi.encode(liq, valueBefore, valueAdded, usdcAmount - _addAndRefund(s, sid, user, liq, bal0, bal1));
    }

    /// @dev Add the liquidity, send whatever did not fit back to the user, and report the USDC part of that refund.
    function _addAndRefund(Strategy storage s, bytes32 sid, address user, uint128 liq, uint256 bal0, uint256 bal1)
        internal
        returns (uint256 usdcRefund)
    {
        (uint256 left0, uint256 left1) = _addLiquidity(s, sid, user, liq, bal0, bal1);
        _payout(s.key.currency0, user, left0);
        _payout(s.key.currency1, user, left1);
        return s.usdcIs0 ? left0 : left1;
    }

    /// @dev (value of the strategy before this stake, value of `liq` being added), both in currency1 at spot.
    function _stakeValues(Strategy storage s, uint128 liq) internal view returns (uint256 valueBefore, uint256 valueAdded) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(s.key.toId());
        (uint256 b0, uint256 b1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, s.liquidity, false);
        valueBefore = _value0In1(b0 + s.idle0, sqrtP) + b1 + s.idle1;
        (uint256 a0, uint256 a1) = _amountsFor(sqrtP, s.tickLower, s.tickUpper, liq, false);
        valueAdded = _value0In1(a0, sqrtP) + a1;
    }

    function _cbUnstake(Strategy storage s, bytes32 sid, address user, bytes memory args) internal returns (bytes memory) {
        (uint256 shareAmount, bool toUsdc, uint256 slippageBps) = abi.decode(args, (uint256, bool, uint256));
        (uint256 out0, uint256 out1) = _withdrawShare(s, sid, user, shareAmount);
        if (toUsdc) (out0, out1) = _toUsdc(s, out0, out1, slippageBps);
        return abi.encode(out0, out1);
    }

    /// @dev A holder's pro-rata slice of the band's liquidity plus the idle balances.
    function _withdrawShare(Strategy storage s, bytes32 sid, address user, uint256 shareAmount) internal returns (uint256 out0, uint256 out1) {
        uint256 total = s.totalShares;
        uint256 i0 = FullMath.mulDiv(s.idle0, shareAmount, total);
        uint256 i1 = FullMath.mulDiv(s.idle1, shareAmount, total);
        s.idle0 -= i0;
        s.idle1 -= i1;
        (out0, out1) = _removeLiquidity(s, sid, user, uint128(FullMath.mulDiv(s.liquidity, shareAmount, total)));
        out0 += i0;
        out1 += i1;
    }

    function _cbRebalance(Strategy storage s, bytes32 sid, address user, bytes memory args) internal returns (bytes memory) {
        uint256 slippageBps = abi.decode(args, (uint256));
        // 1. pull everything out (fees are streamed on the way)
        (uint256 h0, uint256 h1) = _removeLiquidity(s, sid, user, s.liquidity);
        h0 += s.idle0;
        h1 += s.idle1;
        // 2. new band around the current price
        (, int24 tick,,) = poolManager.getSlot0(s.key.toId());
        (s.tickLower, s.tickUpper) = _band(tick, s.key.tickSpacing, s.halfWidth);
        // 3. swap toward the band's token ratio (two passes, one 1 % price bound), 4. mint what fits.
        //    Anything left waits in idle0/idle1, owned pro-rata by holders, for deployIdle().
        (h0, h1) = _swapTowardShape(s.key, _legs(s), h0, h1, slippageBps);
        uint128 liq = _liqFor(s, h0, h1);
        if (liq == 0) revert RebalanceIncomplete();
        (s.idle0, s.idle1) = _addLiquidity(s, sid, user, liq, h0, h1);
        return bytes("");
    }

    /// @dev Put idle dust back to work. No shares are minted: it already belongs to every holder.
    function _deployIdle(Strategy storage s, bytes32 sid, address user) internal {
        if ((s.idle0 == 0 && s.idle1 == 0) || s.totalShares == 0) return;
        uint128 liq = _liqFor(s, s.idle0, s.idle1);
        if (liq == 0) return;
        (s.idle0, s.idle1) = _addLiquidity(s, sid, user, liq, s.idle0, s.idle1);
    }

    // ---------- small helpers shared by the callbacks ----------

    function _legs(Strategy storage s) internal view returns (LegSpec[] memory legs) {
        legs = new LegSpec[](1);
        legs[0] = LegSpec(s.tickLower, s.tickUpper, 1);
    }

    /// @dev Liquidity the band can take from (bal0, bal1) at the current price.
    function _liqFor(Strategy storage s, uint256 bal0, uint256 bal1) internal view returns (uint128) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(s.key.toId());
        (uint256 need0, uint256 need1) = _unitNeeds(sqrtP, _legs(s));
        return _legLiquidity(1, _scaleFor(need0, need1, bal0, bal1));
    }

    /// @dev Add `liq` to the band, paying from (avail0, avail1) held by this contract. Returns what is left.
    function _addLiquidity(Strategy storage s, bytes32 sid, address user, uint128 liq, uint256 avail0, uint256 avail1)
        internal
        returns (uint256 left0, uint256 left1)
    {
        (int256 d0, int256 d1,) = _modify(s, sid, user, int256(uint256(liq)), false);
        uint256 used0 = d0 < 0 ? uint256(-d0) : 0;
        uint256 used1 = d1 < 0 ? uint256(-d1) : 0;
        if (used0 > avail0 || used1 > avail1) revert InsufficientInput();
        _pay(s.key.currency0, used0);
        _pay(s.key.currency1, used1);
        return (avail0 - used0, avail1 - used1);
    }

    /// @dev Remove `liq` from the band and take the principal into this contract.
    function _removeLiquidity(Strategy storage s, bytes32 sid, address user, uint128 liq) internal returns (uint256 p0, uint256 p1) {
        if (liq == 0) return (0, 0);
        (int256 d0, int256 d1,) = _modify(s, sid, user, -int256(uint256(liq)), false);
        p0 = d0 > 0 ? uint256(d0) : 0;
        p1 = d1 > 0 ? uint256(d1) : 0;
        _take(s.key.currency0, p0);
        _take(s.key.currency1, p1);
    }

    function _toUsdc(Strategy storage s, uint256 out0, uint256 out1, uint256 slippageBps) internal returns (uint256, uint256) {
        if (s.usdcIs0 && out1 > 0) {
            (uint256 paid, uint256 got) = _swapExactIn(s.key, false, out1, slippageBps);
            return (out0 + got, out1 - paid);
        }
        if (!s.usdcIs0 && out0 > 0) {
            (uint256 paid, uint256 got) = _swapExactIn(s.key, true, out0, slippageBps);
            return (out0 - paid, out1 + got);
        }
        return (out0, out1);
    }

    /// @dev modifyLiquidity on the strategy's band. Streams realised fees and returns principal deltas only
    ///      (negative = we owe the pool). Keeps `s.liquidity` in step.
    function _modify(Strategy storage s, bytes32 sid, address caller, int256 liquidityDelta, bool payBounty)
        internal
        returns (int256 d0, int256 d1, uint256 feesUsdc)
    {
        (BalanceDelta callerDelta, BalanceDelta feesAccrued) = poolManager.modifyLiquidity(
            s.key, IPoolManager.ModifyLiquidityParams(s.tickLower, s.tickUpper, liquidityDelta, sid), ""
        );
        if (liquidityDelta > 0) s.liquidity += uint128(uint256(liquidityDelta));
        else if (liquidityDelta < 0) s.liquidity -= uint128(uint256(-liquidityDelta));
        feesUsdc = _streamFees(s, sid, caller, feesAccrued, payBounty);
        d0 = int256(callerDelta.amount0()) - int256(feesAccrued.amount0());
        d1 = int256(callerDelta.amount1()) - int256(feesAccrued.amount1());
    }

    function _streamFees(Strategy storage s, bytes32 sid, address caller, BalanceDelta feesAccrued, bool payBounty)
        internal
        returns (uint256 usdcTotal)
    {
        uint256 f0 = feesAccrued.amount0() > 0 ? uint256(uint128(feesAccrued.amount0())) : 0;
        uint256 f1 = feesAccrued.amount1() > 0 ? uint256(uint128(feesAccrued.amount1())) : 0;
        if (f0 == 0 && f1 == 0) return 0;
        _take(s.key.currency0, f0);
        _take(s.key.currency1, f1);
        // fee amounts are small next to pool depth: swap without a price limit so nothing is left unfilled
        if (s.usdcIs0) {
            uint256 got;
            if (f1 > 0) (, got) = _swapExactIn(s.key, false, f1, 10_000);
            usdcTotal = f0 + got;
        } else {
            uint256 got;
            if (f0 > 0) (, got) = _swapExactIn(s.key, true, f0, 10_000);
            usdcTotal = f1 + got;
        }
        if (usdcTotal == 0) return 0;

        uint256 cut = (usdcTotal * protocolFeeBps) / 10_000;
        uint256 bounty = payBounty ? (usdcTotal * bountyBps) / 10_000 : 0;
        if (cut > 0) usdc.safeTransfer(treasury, cut);
        if (bounty > 0) usdc.safeTransfer(caller, bounty);
        uint256 net = usdcTotal - cut - bounty;
        s.totalFeesUsdc += usdcTotal;
        s.totalProtocolUsdc += cut;
        _notifyReward(s, net);
        emit Harvested(sid, caller, usdcTotal, net, cut, bounty);
    }

    // ============================================================
    //                          INTERNALS
    // ============================================================

    function _stake(bytes32 sid, address user, uint256 usdcAmount, uint256 slippageBps, uint256 minShares) internal returns (uint256 sharesOut) {
        Strategy storage s = strategies[sid];
        if (depositsPaused) revert DepositsPaused();
        _updateReward(sid, user);
        (uint128 liq, uint256 valueBefore, uint256 valueAdded, uint256 usdcUsed) = abi.decode(
            _unlock(abi.encode(Action.Stake, sid, user, abi.encode(usdcAmount, slippageBps))), (uint128, uint256, uint256, uint256)
        );
        // first staker: shares == liquidity. After that: pro-rata to value, so idle balances are paid for too.
        sharesOut = s.totalShares == 0 || valueBefore == 0 ? uint256(liq) : FullMath.mulDiv(valueAdded, s.totalShares, valueBefore);
        if (sharesOut == 0) revert ZeroAmount();
        if (sharesOut < minShares) revert InsufficientSharesOut(sharesOut, minShares);
        s.netDepositedUsdc += usdcUsed;
        if (capUsdc != 0 && s.netDepositedUsdc > capUsdc) revert CapExceeded(capUsdc);
        shares[sid][user] += sharesOut;
        s.totalShares += sharesOut;
        if (!userSeen[sid][user]) {
            userSeen[sid][user] = true;
            userStrategies[user].push(sid);
        }
        emit Staked(sid, user, usdcUsed, sharesOut, liq);
    }

    function _ensureStrategy(PoolKey calldata key, uint8 width) internal returns (bytes32 sid) {
        PoolId id = key.toId();
        sid = _sid(id, width);
        Strategy storage s = strategies[sid];
        if (s.exists) return sid;
        bool is0 = Currency.unwrap(key.currency0) == address(usdc);
        if (!is0 && Currency.unwrap(key.currency1) != address(usdc)) revert PoolMustContainUsdc();
        (,, int24 tick) = _checkKey(key);
        s.key = key;
        s.exists = true;
        s.usdcIs0 = is0;
        s.width = width;
        s.halfWidth = _halfWidth(width, key.tickSpacing);
        (s.tickLower, s.tickUpper) = _band(tick, key.tickSpacing, s.halfWidth);
        s.lastUpdate = block.timestamp;
        strategyList.push(sid);
        emit StrategyAdded(sid, id, width, s.tickLower, s.tickUpper);
    }

    function _get(bytes32 sid) internal view returns (Strategy storage s) {
        s = strategies[sid];
        if (!s.exists) revert StrategyNotFound();
    }

    function _sid(PoolId id, uint8 width) internal pure returns (bytes32) {
        return keccak256(abi.encode(id, width));
    }

    function _halfWidth(uint8 width, int24 spacing) internal pure returns (int24 h) {
        if (width > 2) revert BadWidth();
        int24 raw = width == 0 ? int24(1000) : width == 1 ? int24(2200) : int24(4000);
        h = (raw / spacing) * spacing;
        if (raw % spacing != 0) h += spacing;
    }

    function _band(int24 tick, int24 spacing, int24 halfWidth) internal pure returns (int24 lower, int24 upper) {
        int24 c = _floorTick(tick, spacing);
        lower = _clampTick(c - halfWidth, spacing);
        upper = _clampTick(c + spacing + halfWidth, spacing);
    }

    function _inRange(Strategy storage s, int24 tick) internal view returns (bool) {
        return tick >= s.tickLower && tick < s.tickUpper;
    }

    function _usdcValue(Strategy storage s, uint256 a0, uint256 a1, uint160 sqrtP) internal view returns (uint256) {
        return s.usdcIs0 ? a0 + _value1In0(a1, sqrtP) : a1 + _value0In1(a0, sqrtP);
    }

    // ---------- reward accounting (Synthetix StakingRewards, per strategy) ----------

    function _lastTimeApplicable(Strategy storage s) internal view returns (uint256) {
        return block.timestamp < s.periodFinish ? block.timestamp : s.periodFinish;
    }

    function _rewardPerShare(bytes32 sid) internal view returns (uint256) {
        Strategy storage s = strategies[sid];
        if (s.totalShares == 0) return s.rewardPerShareStored;
        return s.rewardPerShareStored + ((_lastTimeApplicable(s) - s.lastUpdate) * s.rewardRate) / s.totalShares;
    }

    function _updateReward(bytes32 sid, address user) internal {
        Strategy storage s = strategies[sid];
        if (!s.exists) return;
        uint256 applicable = _lastTimeApplicable(s);
        if (s.totalShares == 0) {
            if (applicable > s.lastUpdate) s.undistributed += ((applicable - s.lastUpdate) * s.rewardRate) / PRECISION;
        } else {
            s.rewardPerShareStored = _rewardPerShare(sid);
        }
        s.lastUpdate = applicable;
        if (user != address(0)) {
            rewards[sid][user] += (shares[sid][user] * (s.rewardPerShareStored - userRewardPerSharePaid[sid][user])) / PRECISION;
            userRewardPerSharePaid[sid][user] = s.rewardPerShareStored;
        }
    }

    /// @dev Start or extend the 7-day stream. Re-notifying resets the clock, so tiny, frequent harvests would
    ///      keep stretching the stream; amounts arriving within MIN_NOTIFY_INTERVAL of the last notify are
    ///      parked and ride along with the next one instead.
    function _notifyReward(Strategy storage s, uint256 usdcAmount) internal {
        if (s.lastNotify != 0 && block.timestamp < s.lastNotify + MIN_NOTIFY_INTERVAL && block.timestamp < s.periodFinish) {
            s.undistributed += usdcAmount;
            return;
        }
        uint256 amount = usdcAmount + s.undistributed;
        s.undistributed = 0;
        if (block.timestamp >= s.periodFinish) {
            s.rewardRate = (amount * PRECISION) / STREAM_DURATION;
        } else {
            uint256 remaining = ((s.periodFinish - block.timestamp) * s.rewardRate) / PRECISION;
            s.rewardRate = ((amount + remaining) * PRECISION) / STREAM_DURATION;
        }
        s.lastUpdate = block.timestamp;
        s.lastNotify = block.timestamp;
        s.periodFinish = block.timestamp + STREAM_DURATION;
    }
}

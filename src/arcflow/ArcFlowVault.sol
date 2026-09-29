// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ArcFlowVault
/// @notice Deposit-and-earn liquidity on Uniswap v4 (Arc). The vault holds one
///         full-range position per USDC pool on the official PoolManager. Stakers
///         own liquidity units ("shares") in that position. Every stake, unstake
///         or `harvest` realises the position's accrued swap fees; the non-USDC
///         half is swapped to USDC in the same pool, a protocol cut goes to the
///         treasury, and the rest is streamed to stakers linearly over 7 days
///         (Synthetix-style reward rate, so a staker earns every second and can
///         claim whenever they like).
///
/// Scope (v1):
///  - Any v4 pool where one currency is USDC (0x3600…0000, 6 decimals) and the
///    other is an ERC20. Native-coin pools are not supported.
///  - Permissionless: any pool can be staked into. Accounting is isolated per
///    pool, so a hostile hook can only affect the stakers of its own pool.
///  - Full-range positions only. No rebalancing, so no manager can be wrong.
///  - Shares are the position's liquidity units, one-to-one. Nothing to price.
///
/// Trust: the owner can change the protocol fee (capped) and the treasury.
///        Nothing else. There is no pause, upgrade or rescue path.
contract ArcFlowVault is IUnlockCallback, ReentrancyGuard, Ownable2Step {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    // ---------- Errors ----------

    error NotPoolManager();
    error NotUnlocking();
    error PoolMustContainUsdc();
    error NativeNotSupported();
    error ZeroAmount();
    error InsufficientLiquidityOut(uint128 got, uint128 min);
    error InsufficientShares();
    error InsufficientOutput();
    error NothingToClaim();
    error FeeTooHigh();
    error ZeroAddress();
    error UnknownAction();
    error PoolNotInitialized();

    // ---------- Constants ----------

    uint256 public constant STREAM_DURATION = 7 days;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 2_000; // 20 %
    uint256 private constant PRECISION = 1e18;

    // ---------- Immutables ----------

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;
    Currency private immutable usdcCurrency;

    // ---------- Admin state ----------

    address public treasury;
    uint256 public protocolFeeBps = 100; // 1 % of harvested fees

    // ---------- Per-pool state ----------

    struct Pool {
        PoolKey key;
        bool exists;
        bool usdcIs0;
        int24 tickLower;
        int24 tickUpper;
        uint128 totalShares; // == vault's liquidity in the pool
        // streaming rewards (all scaled by PRECISION)
        uint256 rewardRate; // USDC wei * PRECISION per second
        uint256 periodFinish;
        uint256 lastUpdate;
        uint256 rewardPerShareStored;
        uint256 undistributed; // rewards that accrued while totalShares was 0; rolled into the next stream
        // lifetime stats
        uint256 totalFeesUsdc;
        uint256 totalProtocolUsdc;
    }

    mapping(PoolId => Pool) internal pools;
    PoolId[] public poolList;

    /// @notice Full per-pool state (key, range, shares, stream, lifetime stats).
    function poolInfo(PoolId id) external view returns (Pool memory) {
        return pools[id];
    }
    mapping(PoolId => mapping(address => uint128)) public shares;
    mapping(PoolId => mapping(address => uint256)) public userRewardPerSharePaid;
    mapping(PoolId => mapping(address => uint256)) public rewards;

    // ---------- Events ----------

    event PoolAdded(PoolId indexed poolId, address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks);
    event Staked(PoolId indexed poolId, address indexed user, uint128 liquidity, uint256 amount0Used, uint256 amount1Used);
    event Unstaked(PoolId indexed poolId, address indexed user, uint128 liquidity, uint256 amount0Out, uint256 amount1Out);
    event Harvested(PoolId indexed poolId, address indexed caller, uint256 fees0, uint256 fees1, uint256 usdcStreamed, uint256 protocolCut);
    event Claimed(PoolId indexed poolId, address indexed user, uint256 usdc);
    event ProtocolFeeUpdated(uint256 bps);
    event TreasuryUpdated(address treasury);

    constructor(IPoolManager _poolManager, IERC20 _usdc, address _treasury) Ownable(msg.sender) {
        poolManager = _poolManager;
        usdc = _usdc;
        usdcCurrency = Currency.wrap(address(_usdc));
        treasury = _treasury == address(0) ? msg.sender : _treasury;
    }

    // ============================================================
    //                        USER ACTIONS
    // ============================================================

    /// @notice Stake USDC only. Half is swapped to the pool's other token in the pool itself,
    ///         then both are added as full-range liquidity. Leftover dust is refunded.
    /// @param slippageBps Max price move allowed for the internal swap (e.g. 100 = 1 %).
    /// @param minLiquidity Revert if fewer liquidity units than this would be minted.
    function stakeUsdc(PoolKey calldata key, uint256 usdcAmount, uint256 slippageBps, uint128 minLiquidity)
        external
        nonReentrant
        returns (uint128 liquidity)
    {
        if (usdcAmount == 0) revert ZeroAmount();
        PoolId id = _ensurePool(key);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        liquidity = _stakeInternal(id, msg.sender, usdcAmount, slippageBps, minLiquidity);
    }

    /// @notice Stake both tokens of the pair. Leftover of either token is refunded.
    function stakePair(PoolKey calldata key, uint256 amount0, uint256 amount1, uint128 minLiquidity)
        external
        nonReentrant
        returns (uint128 liquidity)
    {
        if (amount0 == 0 && amount1 == 0) revert ZeroAmount();
        PoolId id = _ensurePool(key);
        Pool storage p = pools[id];
        if (amount0 > 0) IERC20(Currency.unwrap(p.key.currency0)).safeTransferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(Currency.unwrap(p.key.currency1)).safeTransferFrom(msg.sender, address(this), amount1);

        _updateReward(id, msg.sender);
        Result memory r =
            abi.decode(_unlock(abi.encode(Action.Mint, id, msg.sender, amount0, amount1, uint256(0))), (Result));
        liquidity = r.liquidity;
        if (liquidity < minLiquidity) revert InsufficientLiquidityOut(liquidity, minLiquidity);
        _afterMint(id, msg.sender, r);
    }

    /// @notice Remove `shareAmount` liquidity units and receive both tokens (or USDC only if `toUsdc`).
    function unstake(PoolId id, uint128 shareAmount, bool toUsdc, uint256 slippageBps, uint256 minOut0, uint256 minOut1)
        external
        nonReentrant
        returns (uint256 out0, uint256 out1)
    {
        if (shareAmount == 0) revert ZeroAmount();
        if (shares[id][msg.sender] < shareAmount) revert InsufficientShares();
        _updateReward(id, msg.sender);

        Result memory r = abi.decode(
            _unlock(abi.encode(Action.Burn, id, msg.sender, uint256(shareAmount), toUsdc ? 1 : 0, slippageBps)), (Result)
        );
        // r.amount0/1 = principal returned to user (fees were streamed inside the callback)
        shares[id][msg.sender] -= shareAmount;
        pools[id].totalShares -= shareAmount;
        out0 = r.amount0;
        out1 = r.amount1;
        if (out0 < minOut0 || out1 < minOut1) revert InsufficientOutput();
        _payout(pools[id].key.currency0, msg.sender, out0);
        _payout(pools[id].key.currency1, msg.sender, out1);
        emit Unstaked(id, msg.sender, shareAmount, out0, out1);
    }

    /// @notice Realise the pool position's fees and stream them. Anyone may call.
    function harvest(PoolId id) external nonReentrant {
        if (!pools[id].exists) revert PoolNotInitialized();
        _updateReward(id, address(0));
        _unlock(abi.encode(Action.Harvest, id, msg.sender, uint256(0), uint256(0), uint256(0)));
    }

    /// @notice Claim streamed USDC rewards for one pool.
    function claim(PoolId id) external nonReentrant returns (uint256 amount) {
        _updateReward(id, msg.sender);
        amount = rewards[id][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[id][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }

    /// @notice Claim rewards and stake them straight back into the same pool.
    function compound(PoolId id, uint256 slippageBps, uint128 minLiquidity) external nonReentrant returns (uint128 liquidity) {
        _updateReward(id, msg.sender);
        uint256 amount = rewards[id][msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[id][msg.sender] = 0;
        emit Claimed(id, msg.sender, amount);
        liquidity = _stakeInternal(id, msg.sender, amount, slippageBps, minLiquidity);
    }

    // ============================================================
    //                           VIEWS
    // ============================================================

    function poolCount() external view returns (uint256) {
        return poolList.length;
    }

    function poolIdFor(PoolKey calldata key) external pure returns (PoolId) {
        return key.toId();
    }

    /// @notice Rewards claimable right now, including the part still streaming up to this second.
    function pendingRewards(PoolId id, address user) external view returns (uint256) {
        return rewards[id][user] + (uint256(shares[id][user]) * (_rewardPerShare(id) - userRewardPerSharePaid[id][user])) / PRECISION;
    }

    /// @notice Current value of a user's shares in both tokens, at the pool's spot price (excludes unrealised fees).
    function positionOf(PoolId id, address user) external view returns (uint128 userShares, uint256 amount0, uint256 amount1) {
        Pool storage p = pools[id];
        userShares = shares[id][user];
        if (userShares == 0 || !p.exists) return (userShares, 0, 0);
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        uint160 lo = TickMath.getSqrtPriceAtTick(p.tickLower);
        uint160 hi = TickMath.getSqrtPriceAtTick(p.tickUpper);
        if (sqrtP <= lo) {
            amount0 = SqrtPriceMath.getAmount0Delta(lo, hi, userShares, false);
        } else if (sqrtP < hi) {
            amount0 = SqrtPriceMath.getAmount0Delta(sqrtP, hi, userShares, false);
            amount1 = SqrtPriceMath.getAmount1Delta(lo, sqrtP, userShares, false);
        } else {
            amount1 = SqrtPriceMath.getAmount1Delta(lo, hi, userShares, false);
        }
    }

    /// @notice Rough liquidity a USDC-only stake would mint at the current price (ignores the swap's own impact).
    ///         Frontends set minLiquidity from this minus a tolerance.
    function previewStakeUsdc(PoolKey calldata key, uint256 usdcAmount) external view returns (uint128 liquidity) {
        PoolId id = key.toId();
        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        (int24 lo, int24 hi) = _fullRange(key.tickSpacing);
        uint256 half = usdcAmount / 2;
        // price = token1/token0 = (sqrtP/2^96)^2, computed in two mulDiv steps to stay within 256 bits
        uint256 otherOut = usdcIs0
            ? FullMath.mulDiv(FullMath.mulDiv(half, sqrtP, FixedPoint96.Q96), sqrtP, FixedPoint96.Q96)
            : FullMath.mulDiv(FullMath.mulDiv(half, FixedPoint96.Q96, sqrtP), FixedPoint96.Q96, sqrtP);
        (uint256 a0, uint256 a1) = usdcIs0 ? (usdcAmount - half, otherOut) : (otherOut, usdcAmount - half);
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), a0, a1
        );
    }

    /// @notice Stream state for a pool: USDC per second currently streaming (scaled 1e18) and when it ends.
    function streamInfo(PoolId id) external view returns (uint256 rewardRatePerSecond, uint256 periodFinish, uint256 remainingUsdc) {
        Pool storage p = pools[id];
        rewardRatePerSecond = p.rewardRate;
        periodFinish = p.periodFinish;
        if (block.timestamp < p.periodFinish) remainingUsdc = ((p.periodFinish - block.timestamp) * p.rewardRate) / PRECISION;
    }

    // ============================================================
    //                           ADMIN
    // ============================================================

    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = bps;
        emit ProtocolFeeUpdated(bps);
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
        Mint, // add liquidity from tokens already held by the vault
        Burn, // remove liquidity for a user, optionally swap the non-USDC side to USDC
        Harvest, // modifyLiquidity(0) to realise fees, then stream them
        SwapHalfAndMint // single-asset USDC stake
    }

    struct Result {
        uint128 liquidity;
        uint256 amount0; // Mint/SwapHalfAndMint: amounts used; Burn: principal amounts out
        uint256 amount1;
    }

    /// Set only for the duration of our own unlock() calls so the callback cannot be driven by anyone else.
    bool private unlocking;

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (!unlocking) revert NotUnlocking();
        (Action action, PoolId id, address user, uint256 a, uint256 b, uint256 c) =
            abi.decode(data, (Action, PoolId, address, uint256, uint256, uint256));
        Pool storage p = pools[id];

        if (action == Action.SwapHalfAndMint) {
            // a = usdc amount, b = slippageBps
            return abi.encode(_cbSwapHalfAndMint(p, id, user, a, b));
        }
        if (action == Action.Mint) {
            // a = amount0 available, b = amount1 available
            return abi.encode(_cbMint(p, id, user, a, b));
        }
        if (action == Action.Burn) {
            // a = shares, b = toUsdc flag, c = slippageBps
            return abi.encode(_cbBurn(p, id, user, uint128(a), b == 1, c));
        }
        if (action == Action.Harvest) {
            _cbHarvest(p, id, user);
            return abi.encode(Result(0, 0, 0));
        }
        revert UnknownAction();
    }

    // ---------- callback bodies ----------

    function _cbSwapHalfAndMint(Pool storage p, PoolId id, address user, uint256 usdcAmount, uint256 slippageBps)
        internal
        returns (Result memory r)
    {
        uint256 half = usdcAmount / 2;
        // swap USDC -> other; with a price limit the fill can be partial, so only what was actually
        // consumed leaves the USDC side.
        (uint256 usdcPaid, uint256 otherOut) = _swapExactIn(p, p.usdcIs0, half, slippageBps);
        uint256 usdcLeft = usdcAmount - usdcPaid;
        (uint256 a0, uint256 a1) = p.usdcIs0 ? (usdcLeft, otherOut) : (otherOut, usdcLeft);
        r = _cbMint(p, id, user, a0, a1);
    }

    function _cbMint(Pool storage p, PoolId id, address user, uint256 avail0, uint256 avail1) internal returns (Result memory r) {
        uint128 liq = _liquidityFor(p, id, avail0, avail1);
        if (liq == 0) revert ZeroAmount();

        // Fees realised by this touch belong to existing stakers: stream them. Principal owed is negative.
        (int256 owe0, int256 owe1) = _modify(p, id, user, int256(uint256(liq)));
        uint256 used0 = owe0 < 0 ? uint256(-owe0) : 0;
        uint256 used1 = owe1 < 0 ? uint256(-owe1) : 0;
        _pay(p.key.currency0, used0);
        _pay(p.key.currency1, used1);

        // refund dust to the user
        if (avail0 > used0) _payout(p.key.currency0, user, avail0 - used0);
        if (avail1 > used1) _payout(p.key.currency1, user, avail1 - used1);

        r = Result(liq, used0, used1);
    }

    /// @dev Liquidity mintable in the pool's full range from the given token amounts at the current price.
    function _liquidityFor(Pool storage p, PoolId id, uint256 a0, uint256 a1) internal view returns (uint128) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        return LiquidityAmounts.getLiquidityForAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(p.tickLower), TickMath.getSqrtPriceAtTick(p.tickUpper), a0, a1
        );
    }

    /// @dev modifyLiquidity on the vault's position, stream any realised fees, and return the principal
    ///      deltas only (negative = we owe the pool, positive = the pool owes us).
    function _modify(Pool storage p, PoolId id, address user, int256 liquidityDelta) internal returns (int256 d0, int256 d1) {
        (BalanceDelta callerDelta, BalanceDelta feesAccrued) = poolManager.modifyLiquidity(
            p.key, IPoolManager.ModifyLiquidityParams(p.tickLower, p.tickUpper, liquidityDelta, bytes32(0)), ""
        );
        _streamFees(p, id, user, feesAccrued);
        d0 = int256(callerDelta.amount0()) - int256(feesAccrued.amount0());
        d1 = int256(callerDelta.amount1()) - int256(feesAccrued.amount1());
    }

    function _cbBurn(Pool storage p, PoolId id, address user, uint128 shareAmount, bool toUsdc, uint256 slippageBps)
        internal
        returns (Result memory r)
    {
        (int256 get0, int256 get1) = _modify(p, id, user, -int256(uint256(shareAmount)));
        uint256 out0 = get0 > 0 ? uint256(get0) : 0;
        uint256 out1 = get1 > 0 ? uint256(get1) : 0;
        // take principal into the vault; unstake() forwards it to the user after checks
        if (out0 > 0) poolManager.take(p.key.currency0, address(this), out0);
        if (out1 > 0) poolManager.take(p.key.currency1, address(this), out1);

        if (toUsdc) {
            if (p.usdcIs0 && out1 > 0) {
                (uint256 paid, uint256 got) = _swapExactIn(p, false, out1, slippageBps);
                out0 += got;
                out1 -= paid; // any unfilled remainder still goes back to the user as the token
            } else if (!p.usdcIs0 && out0 > 0) {
                (uint256 paid, uint256 got) = _swapExactIn(p, true, out0, slippageBps);
                out1 += got;
                out0 -= paid;
            }
        }
        r = Result(shareAmount, out0, out1);
    }

    function _cbHarvest(Pool storage p, PoolId id, address caller) internal {
        if (p.totalShares == 0) return;
        _modify(p, id, caller, 0);
    }

    /// @dev Take accrued fees out of the PoolManager, convert the non-USDC side to USDC, apply the
    ///      protocol cut and start/extend the 7-day stream. Runs inside the unlock callback.
    function _streamFees(Pool storage p, PoolId id, address caller, BalanceDelta feesAccrued) internal {
        uint256 f0 = feesAccrued.amount0() > 0 ? uint256(uint128(feesAccrued.amount0())) : 0;
        uint256 f1 = feesAccrued.amount1() > 0 ? uint256(uint128(feesAccrued.amount1())) : 0;
        if (f0 == 0 && f1 == 0) return;
        if (f0 > 0) poolManager.take(p.key.currency0, address(this), f0);
        if (f1 > 0) poolManager.take(p.key.currency1, address(this), f1);

        // Fee amounts are small relative to pool depth; swap without a price limit so nothing is left unfilled.
        uint256 usdcTotal;
        if (p.usdcIs0) {
            uint256 got;
            if (f1 > 0) (, got) = _swapExactIn(p, false, f1, 10_000);
            usdcTotal = f0 + got;
        } else {
            uint256 got;
            if (f0 > 0) (, got) = _swapExactIn(p, true, f0, 10_000);
            usdcTotal = f1 + got;
        }
        if (usdcTotal == 0) return;

        uint256 cut = (usdcTotal * protocolFeeBps) / 10_000;
        if (cut > 0) usdc.safeTransfer(treasury, cut);
        uint256 net = usdcTotal - cut;
        p.totalFeesUsdc += usdcTotal;
        p.totalProtocolUsdc += cut;
        _notifyReward(p, net);
        emit Harvested(id, caller, f0, f1, net, cut);
    }

    // ---------- swap / settlement helpers (inside unlock) ----------

    /// @dev Exact-input swap inside the pool. Pays the consumed input from vault balance, takes the output
    ///      to the vault. Returns (inputConsumed, outputReceived); with a price limit the fill can be partial.
    function _swapExactIn(Pool storage p, bool zeroForOne, uint256 amountIn, uint256 slippageBps)
        internal
        returns (uint256 paid, uint256 amountOut)
    {
        if (amountIn == 0) return (0, 0);
        (uint160 sqrtP,,,) = poolManager.getSlot0(p.key.toId());
        uint160 limit = _priceLimit(sqrtP, zeroForOne, slippageBps);
        BalanceDelta d = poolManager.swap(p.key, IPoolManager.SwapParams(zeroForOne, -int256(amountIn), limit), "");
        int128 dIn = zeroForOne ? d.amount0() : d.amount1();
        int128 dOut = zeroForOne ? d.amount1() : d.amount0();
        paid = dIn < 0 ? uint256(uint128(-dIn)) : 0;
        amountOut = dOut > 0 ? uint256(uint128(dOut)) : 0;
        _pay(zeroForOne ? p.key.currency0 : p.key.currency1, paid);
        if (amountOut > 0) poolManager.take(zeroForOne ? p.key.currency1 : p.key.currency0, address(this), amountOut);
    }

    function _priceLimit(uint160 sqrtP, bool zeroForOne, uint256 slippageBps) internal pure returns (uint160) {
        if (slippageBps >= 10_000) return zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        // sqrt(1 ± s) ~= 1 ± s/2 for the small tolerances used here
        uint256 delta = (uint256(sqrtP) * slippageBps) / 20_000;
        if (zeroForOne) {
            uint256 lim = uint256(sqrtP) - delta;
            return lim <= TickMath.MIN_SQRT_PRICE ? TickMath.MIN_SQRT_PRICE + 1 : uint160(lim);
        }
        uint256 lim2 = uint256(sqrtP) + delta;
        return lim2 >= TickMath.MAX_SQRT_PRICE ? TickMath.MAX_SQRT_PRICE - 1 : uint160(lim2);
    }

    /// @dev Pay `amount` of an ERC20 currency into the PoolManager (sync -> transfer -> settle).
    function _pay(Currency c, uint256 amount) internal {
        if (amount == 0) return;
        poolManager.sync(c);
        IERC20(Currency.unwrap(c)).safeTransfer(address(poolManager), amount);
        poolManager.settle();
    }

    function _payout(Currency c, address to, uint256 amount) internal {
        if (amount == 0) return;
        IERC20(Currency.unwrap(c)).safeTransfer(to, amount);
    }

    // ---------- staking internals ----------

    function _stakeInternal(PoolId id, address user, uint256 usdcAmount, uint256 slippageBps, uint128 minLiquidity)
        internal
        returns (uint128 liquidity)
    {
        _updateReward(id, user);
        Result memory r = abi.decode(
            _unlock(abi.encode(Action.SwapHalfAndMint, id, user, usdcAmount, slippageBps, uint256(0))), (Result)
        );
        liquidity = r.liquidity;
        if (liquidity < minLiquidity) revert InsufficientLiquidityOut(liquidity, minLiquidity);
        _afterMint(id, user, r);
    }

    function _afterMint(PoolId id, address user, Result memory r) internal {
        shares[id][user] += r.liquidity;
        pools[id].totalShares += r.liquidity;
        emit Staked(id, user, r.liquidity, r.amount0, r.amount1);
    }

    /// @dev Wrap poolManager.unlock so the transient guard is set only for our own calls.
    function _unlock(bytes memory data) internal returns (bytes memory out) {
        unlocking = true;
        out = poolManager.unlock(data);
        unlocking = false;
    }

    function _ensurePool(PoolKey calldata key) internal returns (PoolId id) {
        id = key.toId();
        Pool storage p = pools[id];
        if (p.exists) return id;
        bool is0 = Currency.unwrap(key.currency0) == address(usdc);
        bool is1 = Currency.unwrap(key.currency1) == address(usdc);
        if (!is0 && !is1) revert PoolMustContainUsdc();
        if (key.currency0.isAddressZero()) revert NativeNotSupported();
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        if (sqrtP == 0) revert PoolNotInitialized();

        p.key = key;
        p.exists = true;
        p.usdcIs0 = is0;
        (p.tickLower, p.tickUpper) = _fullRange(key.tickSpacing);
        p.lastUpdate = block.timestamp;
        poolList.push(id);
        emit PoolAdded(id, Currency.unwrap(key.currency0), Currency.unwrap(key.currency1), key.fee, key.tickSpacing, address(key.hooks));
    }

    function _fullRange(int24 spacing) internal pure returns (int24 lo, int24 hi) {
        lo = (TickMath.MIN_TICK / spacing) * spacing;
        hi = (TickMath.MAX_TICK / spacing) * spacing;
    }

    // ---------- reward accounting (Synthetix StakingRewards, per pool) ----------

    function _lastTimeApplicable(Pool storage p) internal view returns (uint256) {
        return block.timestamp < p.periodFinish ? block.timestamp : p.periodFinish;
    }

    function _rewardPerShare(PoolId id) internal view returns (uint256) {
        Pool storage p = pools[id];
        if (p.totalShares == 0) return p.rewardPerShareStored;
        uint256 dt = _lastTimeApplicable(p) - p.lastUpdate;
        return p.rewardPerShareStored + (dt * p.rewardRate) / p.totalShares;
    }

    function _updateReward(PoolId id, address user) internal {
        Pool storage p = pools[id];
        if (!p.exists) return;
        uint256 applicable = _lastTimeApplicable(p);
        if (p.totalShares == 0) {
            // stream keeps ticking with nobody to receive: park it for the next stream
            if (applicable > p.lastUpdate) p.undistributed += ((applicable - p.lastUpdate) * p.rewardRate) / PRECISION;
        } else {
            p.rewardPerShareStored = _rewardPerShare(id);
        }
        p.lastUpdate = applicable;
        if (user != address(0)) {
            rewards[id][user] += (uint256(shares[id][user]) * (p.rewardPerShareStored - userRewardPerSharePaid[id][user])) / PRECISION;
            userRewardPerSharePaid[id][user] = p.rewardPerShareStored;
        }
    }

    function _notifyReward(Pool storage p, uint256 usdcAmount) internal {
        uint256 amount = usdcAmount + p.undistributed;
        p.undistributed = 0;
        if (block.timestamp >= p.periodFinish) {
            p.rewardRate = (amount * PRECISION) / STREAM_DURATION;
        } else {
            uint256 remaining = ((p.periodFinish - block.timestamp) * p.rewardRate) / PRECISION;
            p.rewardRate = ((amount + remaining) * PRECISION) / STREAM_DURATION;
        }
        p.lastUpdate = block.timestamp;
        p.periodFinish = block.timestamp + STREAM_DURATION;
    }
}

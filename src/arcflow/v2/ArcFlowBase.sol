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
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ArcFlowBase
/// @notice Shared plumbing for the ArcFlow v2 contracts: the guarded PoolManager unlock, ERC20
///         settlement, in-pool swaps with a price limit, and the maths that turns a set of weighted
///         tick ranges ("legs") plus a token budget into concrete liquidity per leg.
abstract contract ArcFlowBase is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    error NotPoolManager();
    error NotUnlocking();
    error NativeNotSupported();
    error PoolNotInitialized();
    error ZeroAmount();
    error InsufficientInput();

    /// @dev One weighted tick range. A shape is a list of these; liquidity per leg is proportional to `weight`.
    struct LegSpec {
        int24 tickLower;
        int24 tickUpper;
        uint32 weight;
    }

    /// @dev Liquidity used when pricing "one unit" of a shape. Large enough that rounding is negligible.
    uint256 internal constant UNIT = 1e12;
    uint256 internal constant WAD = 1e18;

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;

    /// Set only for the duration of our own unlock() calls so nobody else can drive the callback.
    bool private unlocking;

    constructor(IPoolManager _poolManager, IERC20 _usdc) {
        poolManager = _poolManager;
        usdc = _usdc;
    }

    // ---------- unlock plumbing ----------

    function _unlock(bytes memory data) internal returns (bytes memory out) {
        unlocking = true;
        out = poolManager.unlock(data);
        unlocking = false;
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (!unlocking) revert NotUnlocking();
        return _onUnlock(data);
    }

    function _onUnlock(bytes calldata data) internal virtual returns (bytes memory);

    // ---------- settlement ----------

    function _pay(Currency c, uint256 amount) internal {
        if (amount == 0) return;
        poolManager.sync(c);
        IERC20(Currency.unwrap(c)).safeTransfer(address(poolManager), amount);
        poolManager.settle();
    }

    function _take(Currency c, uint256 amount) internal {
        if (amount > 0) poolManager.take(c, address(this), amount);
    }

    function _payout(Currency c, address to, uint256 amount) internal {
        if (amount > 0) IERC20(Currency.unwrap(c)).safeTransfer(to, amount);
    }

    // ---------- swaps ----------

    /// @dev Exact-input swap in the pool with a price limit `slippageBps` away from the current price. Pays the
    ///      consumed input from this contract's balance and takes the output here. The fill can be partial.
    function _swapExactIn(PoolKey memory key, bool zeroForOne, uint256 amountIn, uint256 slippageBps)
        internal
        returns (uint256 paid, uint256 amountOut)
    {
        if (amountIn == 0) return (0, 0);
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        return _swapToLimit(key, zeroForOne, amountIn, _priceLimit(sqrtP, zeroForOne, slippageBps));
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

    // ---------- range maths ----------

    /// @dev Token amounts held by `liquidity` in [lower, upper) at price `sqrtP`.
    function _amountsFor(uint160 sqrtP, int24 lower, int24 upper, uint128 liquidity, bool roundUp)
        internal
        pure
        returns (uint256 a0, uint256 a1)
    {
        if (liquidity == 0) return (0, 0);
        uint160 lo = TickMath.getSqrtPriceAtTick(lower);
        uint160 hi = TickMath.getSqrtPriceAtTick(upper);
        if (sqrtP <= lo) {
            a0 = SqrtPriceMath.getAmount0Delta(lo, hi, liquidity, roundUp);
        } else if (sqrtP < hi) {
            a0 = SqrtPriceMath.getAmount0Delta(sqrtP, hi, liquidity, roundUp);
            a1 = SqrtPriceMath.getAmount1Delta(lo, sqrtP, liquidity, roundUp);
        } else {
            a1 = SqrtPriceMath.getAmount1Delta(lo, hi, liquidity, roundUp);
        }
    }

    /// @dev Amounts needed to mint one UNIT of the shape (each leg gets weight * UNIT liquidity).
    function _unitNeeds(uint160 sqrtP, LegSpec[] memory legs) internal pure returns (uint256 need0, uint256 need1) {
        for (uint256 i = 0; i < legs.length; i++) {
            (uint256 a0, uint256 a1) =
                _amountsFor(sqrtP, legs[i].tickLower, legs[i].tickUpper, uint128(uint256(legs[i].weight) * UNIT), true);
            need0 += a0;
            need1 += a1;
        }
    }

    /// @dev Largest scale factor (WAD) such that scale * unit shape fits inside (bal0, bal1), with a hair of
    ///      margin for the PoolManager rounding each leg up.
    function _scaleFor(uint256 need0, uint256 need1, uint256 bal0, uint256 bal1) internal pure returns (uint256 f) {
        if (need0 == 0 && need1 == 0) return 0;
        uint256 f0 = need0 == 0 ? type(uint256).max : FullMath.mulDiv(bal0, WAD, need0);
        uint256 f1 = need1 == 0 ? type(uint256).max : FullMath.mulDiv(bal1, WAD, need1);
        f = f0 < f1 ? f0 : f1;
        f = (f * 999_999) / 1_000_000;
    }

    function _legLiquidity(uint32 weight, uint256 scaleWad) internal pure returns (uint128) {
        uint256 l = FullMath.mulDiv(uint256(weight) * UNIT, scaleWad, WAD);
        if (l > type(uint128).max) revert InsufficientInput();
        return uint128(l);
    }

    /// @dev value of `amount0` expressed in currency1 at price sqrtP (two mulDiv steps keep it inside 256 bits).
    function _value0In1(uint256 amount0, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount0, sqrtP, FixedPoint96.Q96), sqrtP, FixedPoint96.Q96);
    }

    function _value1In0(uint256 amount1, uint160 sqrtP) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount1, FixedPoint96.Q96, sqrtP), FixedPoint96.Q96, sqrtP);
    }

    /// @dev Single-asset entry: turn `usdcAmount` held by this contract into the token mix the shape needs.
    function _zapUsdc(PoolKey memory key, bool usdcIs0, LegSpec[] memory legs, uint256 usdcAmount, uint256 slippageBps)
        internal
        returns (uint256 bal0, uint256 bal1)
    {
        (bal0, bal1) = usdcIs0 ? (usdcAmount, uint256(0)) : (uint256(0), usdcAmount);
        return _swapTowardShape(key, legs, bal0, bal1, slippageBps);
    }

    /// @dev Swap whichever side is in excess so (h0, h1) matches the shape's value split at the pool price.
    ///      A swap moves the price, and with it the split the ranges want, so one pass overshoots in a thin
    ///      pool. A second, much smaller pass corrects it. Both passes share one absolute price limit taken
    ///      from the price before the first swap, so the caller's slippage bound holds for the whole operation.
    function _swapTowardShape(PoolKey memory key, LegSpec[] memory legs, uint256 h0, uint256 h1, uint256 slippageBps)
        internal
        returns (uint256, uint256)
    {
        (uint160 refSqrtP,,,) = poolManager.getSlot0(key.toId());
        (h0, h1) = _swapPass(key, legs, h0, h1, refSqrtP, slippageBps);
        return _swapPass(key, legs, h0, h1, refSqrtP, slippageBps);
    }

    function _swapPass(PoolKey memory key, LegSpec[] memory legs, uint256 h0, uint256 h1, uint160 refSqrtP, uint256 slippageBps)
        internal
        returns (uint256, uint256)
    {
        (bool sell0, uint256 amountIn, uint160 sqrtP) = _excess(key.toId(), legs, h0, h1);
        if (amountIn == 0) return (h0, h1);
        uint160 limit = _priceLimit(refSqrtP, sell0, slippageBps);
        // already at or past the bound in this direction: nothing more can be done safely
        if (sell0 ? sqrtP <= limit : sqrtP >= limit) return (h0, h1);
        (uint256 paid, uint256 got) = _swapToLimit(key, sell0, amountIn, limit);
        return sell0 ? (h0 - paid, h1 + got) : (h0 + got, h1 - paid);
    }

    /// @dev Which side is over-represented against the shape's split, and by how much (in that side's units).
    ///      Differences under 0.2 % of the total are left alone.
    function _excess(PoolId id, LegSpec[] memory legs, uint256 h0, uint256 h1)
        internal
        view
        returns (bool sell0, uint256 amountIn, uint160 sqrtP)
    {
        (sqrtP,,,) = poolManager.getSlot0(id);
        uint256 have0 = _value0In1(h0, sqrtP);
        uint256 total = have0 + h1;
        if (total == 0) return (false, 0, sqrtP);
        (uint256 need0, uint256 need1) = _unitNeeds(sqrtP, legs);
        uint256 v0 = _value0In1(need0, sqrtP);
        if (v0 + need1 == 0) revert ZeroAmount();
        uint256 target0 = FullMath.mulDiv(total, v0, v0 + need1);
        if (have0 > target0) {
            if ((have0 - target0) * 500 < total) return (true, 0, sqrtP);
            return (true, FullMath.mulDiv(h0, have0 - target0, have0), sqrtP);
        }
        uint256 short1 = target0 - have0; // currency1 to spend buying currency0
        if (short1 * 500 < total) return (false, 0, sqrtP);
        return (false, short1 > h1 ? h1 : short1, sqrtP);
    }

    function _swapToLimit(PoolKey memory key, bool zeroForOne, uint256 amountIn, uint160 sqrtLimit)
        internal
        returns (uint256 paid, uint256 amountOut)
    {
        BalanceDelta d = poolManager.swap(key, IPoolManager.SwapParams(zeroForOne, -int256(amountIn), sqrtLimit), "");
        int128 dIn = zeroForOne ? d.amount0() : d.amount1();
        int128 dOut = zeroForOne ? d.amount1() : d.amount0();
        paid = dIn < 0 ? uint256(uint128(-dIn)) : 0;
        amountOut = dOut > 0 ? uint256(uint128(dOut)) : 0;
        _pay(zeroForOne ? key.currency0 : key.currency1, paid);
        _take(zeroForOne ? key.currency1 : key.currency0, amountOut);
    }

    function _checkKey(PoolKey memory key) internal view returns (PoolId id, uint160 sqrtP, int24 tick) {
        if (key.currency0.isAddressZero()) revert NativeNotSupported();
        id = key.toId();
        (sqrtP, tick,,) = poolManager.getSlot0(id);
        if (sqrtP == 0) revert PoolNotInitialized();
    }

    /// @dev floor division of a tick to its spacing (ticks can be negative).
    function _floorTick(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 c = (tick / spacing) * spacing;
        if (tick < 0 && tick % spacing != 0) c -= spacing;
        return c;
    }

    function _clampTick(int24 t, int24 spacing) internal pure returns (int24) {
        int24 minT = (TickMath.MIN_TICK / spacing) * spacing;
        int24 maxT = (TickMath.MAX_TICK / spacing) * spacing;
        return t < minT ? minT : t > maxT ? maxT : t;
    }
}

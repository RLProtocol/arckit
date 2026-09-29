// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

interface IStateViewSlot0 {
    function getSlot0(PoolId poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
}

/// @title ArcTwapOracle
/// @notice Time-weighted average price for Uniswap v4 pools on Arc, which has no on-chain oracle. Anyone can
///         `poke` a pool to record its current tick; consumers read a TWAP over a window from the recorded
///         observations plus the current spot. Manipulating the TWAP means holding a distorted price for the
///         whole window against arbitrage, which is what makes it usable as lending collateral pricing on
///         thin pools. Observations are kept in a ring buffer of 256 per pool. No owner.
contract ArcTwapOracle {
    struct Obs {
        uint32 ts;
        int24 tick;
    }

    uint16 public constant RING = 256;
    IStateViewSlot0 public immutable stateView;

    mapping(PoolId => Obs[256]) private _obs;
    mapping(PoolId => uint16) public count; // observations written, capped at RING
    mapping(PoolId => uint16) public head; // index of the newest observation

    event Poked(PoolId indexed poolId, int24 tick, uint32 timestamp);

    error PoolNotInitialized();
    error NoObservations();

    constructor(IStateViewSlot0 _stateView) {
        stateView = _stateView;
    }

    /// @notice Record the pool's current tick. Same-second pokes overwrite the last observation.
    function poke(PoolId poolId) external returns (int24 tick) {
        (uint160 sqrtP, int24 t,,) = stateView.getSlot0(poolId);
        if (sqrtP == 0) revert PoolNotInitialized();
        tick = t;
        uint16 n = count[poolId];
        uint16 h = head[poolId];
        uint32 now32 = uint32(block.timestamp);
        if (n > 0 && _obs[poolId][h].ts == now32) {
            _obs[poolId][h].tick = tick;
        } else {
            uint16 next = n == 0 ? 0 : uint16((uint256(h) + 1) % RING);
            _obs[poolId][next] = Obs({ts: now32, tick: tick});
            head[poolId] = next;
            if (n < RING) count[poolId] = n + 1;
        }
        emit Poked(poolId, tick, now32);
    }

    /// @notice Current spot tick and sqrt price straight from the pool.
    function spot(PoolId poolId) public view returns (int24 tick, uint160 sqrtPriceX96) {
        (sqrtPriceX96, tick,,) = stateView.getSlot0(poolId);
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();
    }

    /// @notice Time-weighted average tick over the last `window` seconds. Each observation's tick is weighted by
    ///         the time until the next observation; the newest observation extends to now. `covered` is how much
    ///         of the window observations actually span (consumers require a minimum coverage).
    function twapTick(PoolId poolId, uint32 window) public view returns (int24 tick, uint32 covered) {
        uint16 n = count[poolId];
        if (n == 0) revert NoObservations();
        uint16 h = head[poolId];
        uint256 nowTs = block.timestamp;
        uint256 start = nowTs > window ? nowTs - window : 0;
        int256 weighted = 0;
        uint256 total = 0;
        uint256 upper = nowTs; // end of the current observation's interval
        for (uint16 i = 0; i < n; i++) {
            Obs memory o = _obs[poolId][uint16((uint256(h) + RING - i) % RING)];
            uint256 lower = o.ts > start ? o.ts : start;
            if (upper > lower) {
                uint256 w = upper - lower;
                weighted += int256(o.tick) * int256(w);
                total += w;
            }
            upper = o.ts;
            if (o.ts <= start) break;
        }
        if (total == 0) return (_obs[poolId][h].tick, 0); // only same-second observations: no time weight yet
        int256 avg = weighted / int256(total);
        if (weighted < 0 && weighted % int256(total) != 0) avg -= 1; // floor toward -inf, matching tick math conventions
        tick = int24(avg);
        covered = uint32(total);
    }

    /// @notice USDC wei (18 decimals, Arc's native unit) per one whole token, derived from a tick.
    /// @param usdcIs0 whether USDC is currency0 of the pool (i.e. the token is currency1)
    /// @param tokenDecimals ERC-20 decimals of the token
    /// @param poolUsdcDecimals decimals of the USDC currency used in the pool (6 for the ERC-20 view, 18 for native)
    function priceFromTick(int24 tick, bool usdcIs0, uint8 tokenDecimals, uint8 poolUsdcDecimals) public pure returns (uint256 price) {
        uint160 sqrtP = TickMath.getSqrtPriceAtTick(tick);
        return priceFromSqrt(sqrtP, usdcIs0, tokenDecimals, poolUsdcDecimals);
    }

    function priceFromSqrt(uint160 sqrtP, bool usdcIs0, uint8 tokenDecimals, uint8 poolUsdcDecimals) public pure returns (uint256 price) {
        // scale: token base units -> whole token, and pool USDC units -> 18-decimal USDC wei
        uint256 scale = 10 ** uint256(tokenDecimals) * 10 ** uint256(18 - poolUsdcDecimals);
        if (usdcIs0) {
            // token is currency1: usdc per token unit = 2^192 / sqrtP^2
            uint256 a = FullMath.mulDiv(FixedPoint96.Q96, FixedPoint96.Q96, sqrtP); // 2^192 / sqrtP
            price = FullMath.mulDiv(a, scale, sqrtP);
        } else {
            // token is currency0: usdc per token unit = sqrtP^2 / 2^192
            uint256 a = FullMath.mulDiv(sqrtP, sqrtP, FixedPoint96.Q96); // sqrtP^2 / 2^96
            price = FullMath.mulDiv(a, scale, FixedPoint96.Q96);
        }
    }

    /// @notice TWAP and spot prices in USDC wei per whole token, plus TWAP coverage in seconds.
    function prices(PoolId poolId, uint32 window, bool usdcIs0, uint8 tokenDecimals, uint8 poolUsdcDecimals)
        external
        view
        returns (uint256 twapPrice, uint256 spotPrice, uint32 covered)
    {
        (int24 t, uint32 c) = twapTick(poolId, window);
        (, uint160 sqrtP) = spot(poolId);
        twapPrice = priceFromTick(t, usdcIs0, tokenDecimals, poolUsdcDecimals);
        spotPrice = priceFromSqrt(sqrtP, usdcIs0, tokenDecimals, poolUsdcDecimals);
        covered = c;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {BaseTestHooks} from "@uniswap/v4-core/src/test/BaseTestHooks.sol";

/// @title ArcFlowFeeHook
/// @notice Volatility-aware swap fee for NEW Uniswap v4 pools on Arc. A hook is fixed when a pool is
///         created, so this cannot be added to pools that already exist.
///
///         The fee starts at BASE_FEE and rises with how far the price has moved from a reference tick
///         that re-anchors every WINDOW. Calm market: cheap swaps. Fast market: liquidity providers
///         (including ArcFlow stakers) are paid more for the risk they carry.
///
///         The hook holds no funds, takes no cut, has no owner and cannot block swaps or liquidity.
///         It only returns a fee number. Permissions: afterInitialize, beforeSwap.
contract ArcFlowFeeHook is BaseTestHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    error NotPoolManager();
    error PoolMustUseDynamicFee();

    uint24 public constant BASE_FEE = 3_000; // 0.30 %
    uint24 public constant FEE_PER_TICK = 10; // +0.001 % per tick (~0.01 % price) away from the reference
    uint24 public constant MAX_FEE = 30_000; // 3 %
    uint256 public constant WINDOW = 10 minutes;

    IPoolManager public immutable poolManager;

    struct Ref {
        int24 tick;
        uint64 at;
        bool set;
    }

    mapping(PoolId => Ref) public refs;

    event ReferenceMoved(PoolId indexed poolId, int24 tick);

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    function afterInitialize(address, PoolKey calldata key, uint160, int24 tick) external override onlyPoolManager returns (bytes4) {
        if (!LPFeeLibrary.isDynamicFee(key.fee)) revert PoolMustUseDynamicFee();
        refs[key.toId()] = Ref(tick, uint64(block.timestamp), true);
        return IHooks.afterInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        (, int24 tick,,) = poolManager.getSlot0(id);
        Ref storage r = refs[id];
        if (block.timestamp >= uint256(r.at) + WINDOW) {
            r.tick = tick;
            r.at = uint64(block.timestamp);
            emit ReferenceMoved(id, tick);
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, _fee(tick, r.tick) | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    /// @notice The fee the next swap would pay, in hundredths of a bip (3000 = 0.30 %).
    function currentFee(PoolKey calldata key) external view returns (uint24) {
        PoolId id = key.toId();
        (, int24 tick,,) = poolManager.getSlot0(id);
        Ref storage r = refs[id];
        if (!r.set) return 0;
        int24 ref = block.timestamp >= uint256(r.at) + WINDOW ? tick : r.tick;
        return _fee(tick, ref);
    }

    function _fee(int24 tick, int24 ref) internal pure returns (uint24) {
        uint256 dist = uint256(uint24(tick > ref ? tick - ref : ref - tick));
        uint256 fee = uint256(BASE_FEE) + dist * FEE_PER_TICK;
        return fee > MAX_FEE ? MAX_FEE : uint24(fee);
    }
}

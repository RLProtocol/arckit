// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Oracle sanity against the live Arc pools the launch markets use:
//   forge test --match-path test/arclend/ArcLend.fork.t.sol --fork-url $ARC_RPC_URL -vv
// Skipped when no fork is active.
import {Test, console} from "forge-std/Test.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ArcTwapOracle, IStateViewSlot0} from "../../src/arclend/ArcTwapOracle.sol";

contract ArcLendForkTest is Test {
    IStateViewSlot0 constant STATE_VIEW = IStateViewSlot0(0xF3334192D15450CdD385c8B70e03f9A6bD9E673b);
    bool forked;
    ArcTwapOracle oracle;

    struct P {
        string symbol;
        bytes32 poolId;
        uint8 poolUsdcDecimals;
        uint256 minUsd; // sanity bounds in USDC wei per whole token (from DexScreener on 2026-09-28, wide margins)
        uint256 maxUsd;
    }

    function setUp() public {
        forked = block.chainid == 5042;
        if (!forked) return;
        oracle = new ArcTwapOracle(STATE_VIEW);
    }

    function test_livePoolPrices() public {
        if (!forked) return;
        P[5] memory ps = [
            P("AKIT", 0x67b53af67c3f1886d0618b16f86684dfd75d486064782a3eddca83541400fdce, 6, 0.00001 ether, 0.01 ether),
            P("ARCMAN", 0xa3abdb2721cd343da530ff6fd0ad73f3caa77163ea2fb8206847249f9bba57d5, 6, 0.001 ether, 0.1 ether),
            P("ARCOON", 0xa2ed014384e061ec2aaccea186d41798dcf4da29264c44a676d3006fdc252ae0, 6, 0.001 ether, 0.1 ether),
            P("AF", 0x1c0523377296238f6a2fd25cb3b15f75e280eb330ad29f843b974eec264dfe31, 18, 0.0001 ether, 0.01 ether),
            P("ASTOCK", 0x1bb5c22ae4560dc887164d96ebeaa756130948314ce132fee3c8d14e5b95758b, 6, 0.0001 ether, 0.01 ether)
        ];
        for (uint256 i = 0; i < ps.length; i++) {
            PoolId id = PoolId.wrap(ps[i].poolId);
            int24 tick = oracle.poke(id);
            (int24 twap, uint32 covered) = oracle.twapTick(id, 30 minutes);
            assertEq(twap, tick, "single observation twap equals spot");
            assertEq(covered, 0);
            (uint256 twapPrice, uint256 spotPrice,) = oracle.prices(id, 30 minutes, true, 18, ps[i].poolUsdcDecimals);
            console.log(ps[i].symbol);
            console.logInt(int256(tick));
            console.log("  price (USDC wei per token)", spotPrice);
            assertApproxEqRel(twapPrice, spotPrice, 1e15); // tick is the floor of the exact price: within 0.01%
            assertGt(spotPrice, ps[i].minUsd, "price below sane range: wrong usdc decimals or ordering?");
            assertLt(spotPrice, ps[i].maxUsd, "price above sane range: wrong usdc decimals or ordering?");
        }
        // observations accumulate and the TWAP covers the window after time passes
        PoolId akit = PoolId.wrap(ps[0].poolId);
        vm.warp(block.timestamp + 10 minutes);
        oracle.poke(akit);
        vm.warp(block.timestamp + 25 minutes);
        (, uint32 cov) = oracle.twapTick(akit, 30 minutes);
        assertEq(cov, 30 minutes);
    }
}

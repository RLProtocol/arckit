// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Fork tests for ArcFlow v2 against live Arc state. Run with:
//   forge test --match-path test/arcflow/ArcFlowV2.fork.t.sol --fork-url $ARC_RPC_URL -vv
// They are skipped when no fork is active.

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ArcFlowBase} from "../../src/arcflow/v2/ArcFlowBase.sol";
import {ArcFlowPositions} from "../../src/arcflow/v2/ArcFlowPositions.sol";
import {ArcFlowVaultV2} from "../../src/arcflow/v2/ArcFlowVaultV2.sol";
import {ArcFlowFeeHook} from "../../src/arcflow/v2/ArcFlowFeeHook.sol";
import {MockUSDC6, TestSwapper} from "./ArcFlowVault.fork.t.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract ArcFlowV2ForkTest is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address constant ARCAT = 0x07704B06981eA962b87296362a1281484d160000; // hook-free, fee 2 %, spacing 200, currency0
    address constant AKIT = 0xBc3764348131Fe1962f267f442a8Fe30459ededD; // launchpad hook, fee 1 %, spacing 200, currency1
    address constant AKIT_HOOK = 0xA0F72dE996d901c2C9D701a2A8ff0544fD5F2044;

    ArcFlowPositions pos;
    ArcFlowVaultV2 vault;
    TestSwapper swapper;
    PoolKey arcatKey;
    PoolKey akitKey;
    PoolId arcatId;

    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address trader = makeAddr("trader");
    address keeper = makeAddr("keeper");

    bool forked;
    ArcFlowBase.LegSpec[] none;

    function setUp() public {
        forked = block.chainid == 5042;
        if (!forked) return;
        uint256 pmUsdc = USDC.balanceOf(address(PM));
        vm.etch(address(USDC), address(new MockUSDC6()).code);
        _setBal(address(PM), pmUsdc);

        pos = new ArcFlowPositions(PM, USDC, treasury);
        vault = new ArcFlowVaultV2(PM, USDC, treasury);
        swapper = new TestSwapper(PM);
        arcatKey = PoolKey(Currency.wrap(ARCAT), Currency.wrap(address(USDC)), 20000, 200, IHooks(address(0)));
        akitKey = PoolKey(Currency.wrap(address(USDC)), Currency.wrap(AKIT), 10000, 200, IHooks(AKIT_HOOK));
        arcatId = arcatKey.toId();

        _setBal(alice, 10_000e6);
        _setBal(bob, 10_000e6);
        _setBal(trader, 50_000_000e6);
        vm.deal(alice, 100 ether);
        address[4] memory users = [alice, bob, trader, keeper];
        for (uint256 i = 0; i < users.length; i++) {
            vm.startPrank(users[i]);
            USDC.approve(address(pos), type(uint256).max);
            USDC.approve(address(vault), type(uint256).max);
            USDC.approve(address(swapper), type(uint256).max);
            IERC20(ARCAT).approve(address(swapper), type(uint256).max);
            IERC20(ARCAT).approve(address(pos), type(uint256).max);
            IERC20(AKIT).approve(address(swapper), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _setBal(address who, uint256 amount) internal {
        vm.store(address(USDC), keccak256(abi.encode(who, uint256(1))), bytes32(amount));
    }

    modifier onlyFork() {
        if (!forked) {
            emit log("skipped: not forked (pass --fork-url)");
            return;
        }
        _;
    }

    /// trade back and forth so the pool earns fees without drifting far
    function _churn(uint256 rounds, uint256 usdcPerRound) internal {
        for (uint256 i = 0; i < rounds; i++) {
            uint256 before = IERC20(ARCAT).balanceOf(trader);
            vm.prank(trader);
            swapper.swap(arcatKey, false, usdcPerRound); // USDC -> ARCAT
            uint256 got = IERC20(ARCAT).balanceOf(trader) - before;
            vm.prank(trader);
            swapper.swap(arcatKey, true, got); // ARCAT -> USDC
        }
    }

    function _tick() internal view returns (int24 t) {
        (, t,,) = PM.getSlot0(arcatId);
    }

    // ============================================================
    //                          POOLS (shapes)
    // ============================================================

    function test_fork_shapes_legLayout() public onlyFork {
        int24 t = _tick();
        ArcFlowBase.LegSpec[] memory spot = pos.previewLegs(arcatKey, ArcFlowPositions.Shape.Spot, 2000);
        assertEq(spot.length, 1);
        assertTrue(spot[0].tickLower <= t && t < spot[0].tickUpper, "spot holds the price");
        assertEq(spot[0].tickLower % 200, 0);

        ArcFlowBase.LegSpec[] memory curve = pos.previewLegs(arcatKey, ArcFlowPositions.Shape.Curve, 2000);
        assertEq(curve.length, 4, "four nested legs");
        for (uint256 i = 0; i < curve.length; i++) {
            assertTrue(curve[i].tickLower <= t && t < curve[i].tickUpper, "every curve leg holds the price");
            if (i > 0) assertTrue(curve[i].tickLower < curve[i - 1].tickLower && curve[i].tickUpper > curve[i - 1].tickUpper, "nested");
        }

        ArcFlowBase.LegSpec[] memory ba = pos.previewLegs(arcatKey, ArcFlowPositions.Shape.BidAsk, 1800);
        assertEq(ba.length, 7, "centre + 3 bands per side");
        assertEq(ba[0].weight, 1);
        assertEq(ba[5].weight, 4, "outer bands are heaviest");
        assertEq(ba[1].tickUpper, ba[0].tickLower, "lower bands touch the centre band");
        assertEq(ba[2].tickLower, ba[0].tickUpper, "upper bands touch the centre band");

        // a very narrow width still yields valid legs
        assertEq(pos.previewLegs(arcatKey, ArcFlowPositions.Shape.Curve, 100).length, 1);
        assertEq(pos.previewLegs(arcatKey, ArcFlowPositions.Shape.BidAsk, 100).length, 3);
    }

    function test_fork_mintUsdc_allShapes_noFundsLeftBehind() public onlyFork {
        for (uint8 sh = 0; sh < 3; sh++) {
            uint256 before = USDC.balanceOf(alice);
            vm.prank(alice);
            uint256 id = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape(sh), 2000, none, 100e6, 300, 1);
            (ArcFlowPositions.Position memory p,, ArcFlowPositions.Leg[] memory legs) = pos.positionInfo(id);
            assertEq(p.owner, alice);
            uint256 live;
            for (uint256 i = 0; i < legs.length; i++) {
                (uint128 onchain,,) = PM.getPositionInfo(arcatId, address(pos), legs[i].tickLower, legs[i].tickUpper, bytes32(id));
                assertEq(onchain, legs[i].liquidity, "recorded liquidity matches the PoolManager");
                live += onchain;
            }
            assertGt(live, 0);
            assertLe(before - USDC.balanceOf(alice), 100e6, "never spends more than the deposit");
            assertGt(before - USDC.balanceOf(alice), 90e6, "and deploys nearly all of it when the pool is deep enough");
            assertEq(USDC.balanceOf(address(pos)), 0, "contract keeps no USDC");
            assertEq(IERC20(ARCAT).balanceOf(address(pos)), 0, "contract keeps no token");

            (uint256 a0, uint256 a1, bool inRange) = pos.positionAmounts(id);
            assertTrue(inRange);
            assertGt(a0 + a1, 0);
            emit log_named_uint("shape", sh);
            emit log_named_uint("  usdc spent", before - USDC.balanceOf(alice));
            emit log_named_uint("  usdc side in position", a1);
            emit log_named_uint("  ARCAT refunded as unused (wei)", IERC20(ARCAT).balanceOf(alice));
        }
        assertEq(pos.positionsOf(alice).length, 3);
    }

    function test_fork_mintUsdc_thinPool_partialFillIsRefunded() public onlyFork {
        uint256 before = USDC.balanceOf(alice);
        vm.prank(alice);
        uint256 id = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Spot, 2000, none, 5_000e6, 100, 1);
        uint256 spent = before - USDC.balanceOf(alice);
        emit log_named_uint("usdc deployed out of 5000 at a 1 % price limit", spent);
        assertLt(spent, 5_000e6, "the price limit stops the swap; the rest comes straight back");
        vm.prank(alice);
        pos.decrease(id, 10_000, true, 300, 0, 0);
        assertGt(USDC.balanceOf(alice), before - (spent * 5) / 100, "only the deployed part carried any cost");
        assertEq(USDC.balanceOf(address(pos)), 0);
    }

    function _liq0(uint256 id) internal view returns (uint256) {
        (,, ArcFlowPositions.Leg[] memory l) = pos.positionInfo(id);
        return l[0].liquidity;
    }

    function _fees1(uint256 id) internal view returns (uint256 f1) {
        (, f1) = pos.pendingFees(id);
    }

    function test_fork_fees_collect_isolatedPerPosition() public onlyFork {
        vm.prank(alice);
        uint256 a = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Spot, 2000, none, 100e6, 300, 1);
        vm.prank(bob);
        uint256 b = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Spot, 2000, none, 50e6, 300, 1);
        assertApproxEqRel(_liq0(a), 2 * _liq0(b), 0.05e18, "twice the deposit, about twice the liquidity");

        _churn(3, 300e6);
        uint256 af1 = _fees1(a);
        uint256 bf1 = _fees1(b);
        assertGt(af1, 0, "alice earned fees");
        assertGt(bf1, 0, "bob earned fees");
        // the two ranges are centred a band apart (the first mint nudged the price), so allow a few percent
        assertApproxEqRel(af1 * _liq0(b), bf1 * _liq0(a), 0.06e18, "fees are proportional to liquidity");

        uint256 tBefore = USDC.balanceOf(treasury);
        uint256 aBefore = USDC.balanceOf(alice);
        vm.prank(alice);
        (uint256 got0, uint256 got1) = pos.collect(a);
        assertGt(got0, 0);
        assertApproxEqAbs(got1, (af1 * 99) / 100, 2, "owner receives fees minus 1 %");
        assertEq(USDC.balanceOf(alice) - aBefore, got1);
        assertApproxEqAbs(USDC.balanceOf(treasury) - tBefore, af1 / 100, 2, "treasury receives 1 %");

        assertEq(_fees1(a), 0, "nothing left to collect");
        assertEq(_fees1(b), bf1, "bob fees untouched by alice collecting");

        vm.prank(bob);
        vm.expectRevert(ArcFlowPositions.NotPositionOwner.selector);
        pos.collect(a);
    }

    function test_fork_decrease_roundTripToUsdc() public onlyFork {
        uint256 before = USDC.balanceOf(alice);
        vm.prank(alice);
        uint256 id = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Curve, 2000, none, 100e6, 300, 1);

        vm.prank(alice);
        pos.decrease(id, 5_000, true, 1_000, 0, 0);
        (,, ArcFlowPositions.Leg[] memory legs) = pos.positionInfo(id);
        assertGt(legs[0].liquidity, 0, "half remains");

        vm.prank(alice);
        pos.decrease(id, 10_000, true, 1_000, 0, 0);
        (ArcFlowPositions.Position memory p,, ArcFlowPositions.Leg[] memory legs2) = pos.positionInfo(id);
        assertTrue(p.closed);
        for (uint256 i = 0; i < legs2.length; i++) assertEq(legs2[i].liquidity, 0);

        uint256 back = USDC.balanceOf(alice) + 100e6 - before; // what the round trip returned out of 100
        emit log_named_uint("usdc back from 100 (two 2 % swaps on roughly half)", back);
        emit log_named_uint("ARCAT left with the user (entry refund + unfilled exit)", IERC20(ARCAT).balanceOf(alice));
        assertGt(back, 93e6, "round trip costs the 2 % pool fee plus price impact on the swapped half, twice");
        assertEq(USDC.balanceOf(address(pos)), 0);
        assertEq(IERC20(ARCAT).balanceOf(address(pos)), 0);

        vm.prank(alice);
        vm.expectRevert(ArcFlowPositions.PositionClosed.selector);
        pos.collect(id);
    }

    function test_fork_lock_blocksWithdrawal_notFees() public onlyFork {
        vm.prank(alice);
        uint256 id = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Spot, 2000, none, 100e6, 300, 1);
        uint64 until = uint64(block.timestamp + 30 days);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowPositions.WrongFee.selector, 1 ether, 10 ether));
        pos.lock{value: 1 ether}(id, until);

        vm.prank(alice);
        pos.lock{value: 10 ether}(id, until);
        assertEq(pos.pendingLockFees(), 10 ether);
        (uint256[] memory locked, uint256 total) = pos.lockedPositionIds(0, 10);
        assertEq(total, 1);
        assertEq(locked[0], id);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowPositions.PositionLocked.selector, until));
        pos.decrease(id, 10_000, true, 300, 0, 0);

        _churn(2, 300e6);
        vm.prank(alice);
        (, uint256 f1) = pos.collect(id);
        assertGt(f1, 0, "fees stay collectable while locked");

        // cannot shorten, can extend; the lock follows a transfer
        vm.prank(alice);
        vm.expectRevert(ArcFlowPositions.BadLockTime.selector);
        pos.extendLock(id, until - 1);
        vm.prank(alice);
        pos.extendLock(id, until + 1 days);
        vm.prank(alice);
        pos.transferPosition(id, bob);
        assertEq(pos.positionsOf(alice).length, 0);
        assertEq(pos.positionsOf(bob)[0], id);

        vm.warp(until + 1 days - 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowPositions.PositionLocked.selector, until + 1 days));
        pos.decrease(id, 10_000, true, 300, 0, 0);
        vm.warp(until + 1 days);
        uint256 bBefore = USDC.balanceOf(bob);
        vm.prank(bob);
        pos.decrease(id, 10_000, true, 300, 0, 0);
        assertGt(USDC.balanceOf(bob) - bBefore, 90e6);

        vm.prank(treasury);
        pos.claimLockFees();
        assertEq(treasury.balance, 10 ether);
    }

    function test_fork_mintUsdc_hookedPool_roundTrip() public onlyFork {
        uint256 before = USDC.balanceOf(alice);
        vm.prank(alice);
        uint256 id = pos.mintUsdc(akitKey, ArcFlowPositions.Shape.Spot, 2000, none, 500e6, 500, 1);
        (,, bool inRange) = pos.positionAmounts(id);
        assertTrue(inRange);
        vm.prank(alice);
        pos.decrease(id, 10_000, true, 500, 0, 0);
        uint256 back = USDC.balanceOf(alice) + 500e6 - before;
        emit log_named_uint("usdc back from 500 in the hooked AKIT pool", back);
        assertGt(back, 450e6);
        assertEq(USDC.balanceOf(address(pos)), 0);
        assertEq(IERC20(AKIT).balanceOf(address(pos)), 0);
    }

    function test_fork_customLegs_validation() public onlyFork {
        ArcFlowBase.LegSpec[] memory legs = new ArcFlowBase.LegSpec[](1);
        legs[0] = ArcFlowBase.LegSpec(_tick() - 1001, _tick() + 1000, 1); // not aligned to the spacing
        vm.prank(alice);
        vm.expectRevert(ArcFlowPositions.BadLegs.selector);
        pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Custom, 0, legs, 100e6, 300, 1);

        int24 c = (_tick() / 200) * 200;
        legs[0] = ArcFlowBase.LegSpec(c - 600, c + 800, 3);
        vm.prank(alice);
        uint256 id = pos.mintUsdc(arcatKey, ArcFlowPositions.Shape.Custom, 0, legs, 100e6, 300, 1);
        (,, ArcFlowPositions.Leg[] memory stored) = pos.positionInfo(id);
        assertEq(stored[0].tickLower, c - 600);
    }

    // ============================================================
    //                       STAKES v2 (vault)
    // ============================================================

    function test_fork_vault_stake_sharesAndBand() public onlyFork {
        vm.prank(alice);
        uint256 sh = vault.stake(arcatKey, 0, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 0);
        ArcFlowVaultV2.Strategy memory s = vault.strategyInfo(sid);
        assertEq(sh, s.liquidity, "first staker: shares == liquidity");
        assertEq(s.totalShares, sh);
        assertTrue(s.tickLower <= _tick() && _tick() < s.tickUpper);
        assertEq(s.tickUpper - s.tickLower, 2 * 1000 + 200, "tight band is +-1000 ticks around the active band");
        (uint128 onchain,,) = PM.getPositionInfo(arcatId, address(vault), s.tickLower, s.tickUpper, sid);
        assertEq(onchain, s.liquidity);
        assertEq(USDC.balanceOf(address(vault)), 0);
        assertEq(IERC20(ARCAT).balanceOf(address(vault)), 0);

        vm.prank(bob);
        uint256 sh2 = vault.stake(arcatKey, 0, 50e6, 300, 1);
        // shares are minted by value; the first stake nudged this thin pool, so allow some room
        assertApproxEqRel(sh2 * 2, sh, 0.10e18, "half the deposit, about half the shares");

        (bool inRange,, uint256 tvl,,) = vault.strategyState(sid);
        assertTrue(inRange);
        assertApproxEqRel(tvl, 150e6, 0.04e18, "TVL is about what was deposited");
        (,,, uint256 value,) = vault.userState(sid, alice);
        assertApproxEqRel(value, 100e6, 0.04e18);
        assertEq(vault.strategiesOf(alice)[0], sid);
    }

    function test_fork_vault_concentratedEarnsMoreThanWide() public onlyFork {
        vm.prank(alice);
        vault.stake(arcatKey, 0, 100e6, 300, 1); // tight
        vm.prank(bob);
        vault.stake(arcatKey, 2, 100e6, 300, 1); // wide
        _churn(3, 200e6); // small trades: the price stays inside the tight band
        uint256 tight = vault.harvest(vault.strategyIdFor(arcatKey, 0));
        uint256 wide = vault.harvest(vault.strategyIdFor(arcatKey, 2));
        emit log_named_uint("fees harvested, tight", tight);
        emit log_named_uint("fees harvested, wide", wide);
        assertGt(tight, wide * 2, "same dollars, tighter band, several times the fees");
    }

    function test_fork_vault_harvest_bounty_stream_claim_apr() public onlyFork {
        vm.prank(alice);
        vault.stake(arcatKey, 1, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 1);
        _churn(3, 2_000e6);

        uint256 tBefore = USDC.balanceOf(treasury);
        vm.prank(keeper);
        uint256 fees = vault.harvest(sid);
        assertGt(fees, 0);
        assertApproxEqAbs(USDC.balanceOf(keeper), (fees * 50) / 10_000, 1, "caller bounty 0.5 %");
        assertApproxEqAbs(USDC.balanceOf(treasury) - tBefore, fees / 100, 1, "protocol cut 1 %");

        (,,, uint256 apr, uint256 remaining) = vault.strategyState(sid);
        assertGt(apr, 0, "APR derives from the running stream");
        assertApproxEqAbs(remaining, fees - fees / 100 - (fees * 50) / 10_000, 10);

        // a second harvest inside the hour is parked instead of stretching the stream
        _churn(1, 2_000e6);
        uint256 finishBefore = vault.strategyInfo(sid).periodFinish;
        vault.harvest(sid);
        assertEq(vault.strategyInfo(sid).periodFinish, finishBefore, "stream end unchanged");
        assertGt(vault.strategyInfo(sid).undistributed, 0, "parked for the next stream");

        vm.warp(block.timestamp + 7 days);
        uint256 aBefore = USDC.balanceOf(alice);
        vm.prank(alice);
        uint256 claimed = vault.claim(sid);
        assertApproxEqRel(claimed, remaining, 0.001e18, "sole staker receives the whole stream");
        assertEq(USDC.balanceOf(alice) - aBefore, claimed);
    }

    function test_fork_vault_autoHarvestOnStake() public onlyFork {
        vm.prank(alice);
        vault.stake(arcatKey, 1, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 1);
        _churn(3, 2_000e6);
        assertEq(vault.strategyInfo(sid).totalFeesUsdc, 0, "nothing harvested yet");

        vm.prank(bob);
        vault.stake(arcatKey, 1, 100e6, 300, 1); // realises the accrued fees on the way in
        uint256 harvested = vault.strategyInfo(sid).totalFeesUsdc;
        assertGt(harvested, 0, "staking harvested the fees without a separate call");

        vm.warp(block.timestamp + 7 days);
        (,,,, uint256 pa) = vault.userState(sid, alice);
        (,,,, uint256 pb) = vault.userState(sid, bob);
        // the stream started when bob joined, so both holders share it pro-rata from that moment
        uint256 sa = vault.shares(sid, alice);
        uint256 sb = vault.shares(sid, bob);
        assertApproxEqRel(pa * sb, pb * sa, 0.001e18, "stream splits pro-rata to shares");
        assertApproxEqRel(pa + pb, harvested - harvested / 100, 0.001e18, "everything harvested (minus 1 %) reaches stakers");
    }

    function test_fork_vault_unstake_roundTrip_andCompound() public onlyFork {
        uint256 before = USDC.balanceOf(alice);
        vm.prank(alice);
        uint256 sh = vault.stake(arcatKey, 0, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 0);
        _churn(2, 300e6);
        vault.harvest(sid);
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        uint256 more = vault.compound(sid, 300, 1);
        assertGt(more, 0);

        uint256 all = vault.shares(sid, alice);
        assertEq(all, sh + more);
        vm.prank(alice);
        vault.unstake(sid, all, true, 1_000, 0, 0);
        assertEq(vault.strategyInfo(sid).totalShares, 0);
        assertEq(vault.strategyInfo(sid).liquidity, 0);
        uint256 back = USDC.balanceOf(alice) + 100e6 - before;
        emit log_named_uint("usdc back from 100 after earning fees and compounding", back);
        assertGt(back, 93e6);
    }

    function test_fork_vault_rebalance_guards_andRecentre() public onlyFork {
        vm.prank(alice);
        vault.stake(arcatKey, 0, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 0);
        (,,, uint256 valueBefore,) = vault.userState(sid, alice);

        vm.expectRevert(ArcFlowVaultV2.StillInRange.selector);
        vault.poke(sid);
        vm.expectRevert(ArcFlowVaultV2.NotPoked.selector);
        vault.rebalance(sid, 100);

        // push the price up and out of the tight band
        ArcFlowVaultV2.Strategy memory s0 = vault.strategyInfo(sid);
        for (uint256 i = 0; i < 40 && _tick() < s0.tickUpper; i++) {
            vm.prank(trader);
            swapper.swap(arcatKey, false, 25_000e6);
        }
        assertGe(_tick(), s0.tickUpper, "price left the band");
        (bool inRange,,,,) = vault.strategyState(sid);
        assertFalse(inRange);

        vault.poke(sid);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowVaultV2.PokeTooFresh.selector, block.timestamp + 10 minutes));
        vault.rebalance(sid, 100);
        vm.expectRevert(ArcFlowVaultV2.PokeStillValid.selector);
        vault.poke(sid);

        vm.warp(block.timestamp + 11 minutes);
        vm.expectRevert(ArcFlowVaultV2.SlippageTooHigh.selector);
        vault.rebalance(sid, 101);

        vm.prank(keeper);
        vault.rebalance(sid, 100);
        // a 1 % price bound may only partly fill in a thin pool: the rest is idle and gets worked in over time
        for (uint256 i = 0; i < 12; i++) {
            ArcFlowVaultV2.Strategy memory si = vault.strategyInfo(sid);
            if (si.idle0 == 0 && si.idle1 == 0) break;
            vm.warp(block.timestamp + 10 minutes);
            try vault.deployIdle(sid, 100) {} catch { break; }
        }
        ArcFlowVaultV2.Strategy memory s1 = vault.strategyInfo(sid);
        emit log_named_uint("idle USDC after rebalance + deployIdle", s1.idle1);
        assertTrue(s1.tickLower <= _tick() && _tick() < s1.tickUpper, "band recentred on the price");
        assertGt(s1.liquidity, 0);
        assertEq(s1.rebalances, 1);
        assertEq(s1.pokedAt, 0);
        (uint128 oldLiq,,) = PM.getPositionInfo(arcatId, address(vault), s0.tickLower, s0.tickUpper, sid);
        assertEq(oldLiq, 0, "old band emptied");

        (bool inRangeAfter,,,,) = vault.strategyState(sid);
        assertTrue(inRangeAfter);
        (uint256 shAfter,,, uint256 valueAfter,) = vault.userState(sid, alice);
        assertEq(shAfter, vault.shares(sid, alice), "shares are untouched by a rebalance");
        emit log_named_uint("value before the move (USDC)", valueBefore);
        emit log_named_uint("value after move + rebalance (USDC)", valueAfter);
        // leaving the band upward means the stake was sold into USDC on the way up (impermanent loss), then
        // half was swapped back at a 2 % fee: the rebalance itself must cost only about that swap fee
        assertGt(valueAfter, (valueBefore * 95) / 100);

        // cooldown: a second rebalance right away is refused even if poked again
        vm.expectRevert(ArcFlowVaultV2.StillInRange.selector);
        vault.poke(sid);

        // and the holder can still leave
        vm.prank(alice);
        vault.unstake(sid, shAfter, true, 300, 0, 0);
        assertEq(vault.strategyInfo(sid).totalShares, 0);
    }

    function test_fork_vault_rebalance_refusedWhenPriceDriftsAfterPoke() public onlyFork {
        vm.prank(alice);
        vault.stake(arcatKey, 0, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 0);
        ArcFlowVaultV2.Strategy memory s0 = vault.strategyInfo(sid);
        for (uint256 i = 0; i < 40 && _tick() < s0.tickUpper; i++) {
            vm.prank(trader);
            swapper.swap(arcatKey, false, 25_000e6);
        }
        vault.poke(sid);
        int24 poked = _tick();
        // the price keeps running: more than MAX_DRIFT_TICKS away from the poke
        for (uint256 i = 0; i < 40 && _tick() < poked + 400; i++) {
            vm.prank(trader);
            swapper.swap(arcatKey, false, 50_000e6);
        }
        vm.warp(block.timestamp + 11 minutes);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowVaultV2.PriceDrifted.selector, poked, _tick()));
        vault.rebalance(sid, 100);

        // once the poke expires a fresh one is accepted
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(ArcFlowVaultV2.PokeExpired.selector);
        vault.rebalance(sid, 100);
        vault.poke(sid);
    }

    function test_fork_vault_cap_pause_neverBlockExit() public onlyFork {
        vault.setParams(100, 50, 150e6, false);
        vm.prank(alice);
        uint256 sh = vault.stake(arcatKey, 1, 100e6, 300, 1);
        bytes32 sid = vault.strategyIdFor(arcatKey, 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcFlowVaultV2.CapExceeded.selector, 150e6));
        vault.stake(arcatKey, 1, 100e6, 300, 1);

        vault.setParams(100, 50, 0, true);
        vm.prank(bob);
        vm.expectRevert(ArcFlowVaultV2.DepositsPaused.selector);
        vault.stake(arcatKey, 1, 100e6, 300, 1);

        vm.prank(alice);
        vault.unstake(sid, sh, true, 300, 0, 0); // withdraw-only mode still lets people out
        assertEq(vault.shares(sid, alice), 0);

        vm.prank(alice);
        vm.expectRevert();
        vault.setParams(0, 0, 0, false);
        vm.expectRevert(ArcFlowVaultV2.FeeTooHigh.selector);
        vault.setParams(2_001, 0, 0, false);
        vm.prank(bob);
        vm.expectRevert(ArcFlowVaultV2.BadWidth.selector);
        vault.stake(arcatKey, 3, 100e6, 300, 1);
    }

    // ============================================================
    //                         FEE HOOK
    // ============================================================

    function test_fork_feeHook_dynamicFee() public onlyFork {
        // a hook's permissions live in the low 14 bits of its address: afterInitialize | beforeSwap
        address hookAddr = address(uint160(0xA4c0000000000000000000000000000000000000) | uint160((1 << 12) | (1 << 7)));
        deployCodeTo("ArcFlowFeeHook.sol:ArcFlowFeeHook", abi.encode(PM), hookAddr);
        ArcFlowFeeHook hook = ArcFlowFeeHook(hookAddr);

        MockERC20 tkn = new MockERC20("New", "NEW");
        tkn.mint(alice, 1_000_000 ether);
        tkn.mint(trader, 1_000_000 ether);
        bool tknIs0 = address(tkn) < address(USDC);
        PoolKey memory key = PoolKey(
            Currency.wrap(tknIs0 ? address(tkn) : address(USDC)),
            Currency.wrap(tknIs0 ? address(USDC) : address(tkn)),
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            60,
            IHooks(hookAddr)
        );
        // a static-fee pool cannot use this hook
        PoolKey memory bad = PoolKey(key.currency0, key.currency1, 3000, 60, IHooks(hookAddr));
        vm.expectRevert();
        PM.initialize(bad, TickMath.getSqrtPriceAtTick(0));

        // 1 NEW (18 dec) = 1 USDC (6 dec): raw price 1e-12 or 1e12 depending on order
        int24 startTick = tknIs0 ? int24(-276_324) : int24(276_324);
        startTick = (startTick / 60) * 60;
        PM.initialize(key, TickMath.getSqrtPriceAtTick(startTick));
        assertEq(hook.currentFee(key), 3_000, "calm market: base fee");

        vm.startPrank(alice);
        tkn.approve(address(pos), type(uint256).max);
        uint256 id = pos.mintPair(key, ArcFlowPositions.Shape.Curve, 6_000, none, tknIs0 ? 5_000 ether : 5_000e6, tknIs0 ? 5_000e6 : 5_000 ether, 1);
        vm.stopPrank();
        assertGt(id, 0);

        vm.startPrank(trader);
        tkn.approve(address(swapper), type(uint256).max);
        swapper.swap(key, !tknIs0, 1_500e6); // buy NEW with USDC: moves the price
        vm.stopPrank();
        uint24 hot = hook.currentFee(key);
        emit log_named_uint("fee after a sharp move (hundredths of a bip)", hot);
        assertGt(hot, 3_000, "fee rises with the move");
        assertLe(hot, 30_000, "and is capped");

        vm.warp(block.timestamp + 11 minutes);
        assertEq(hook.currentFee(key), 3_000, "reference re-anchors after the window");

        // fees collected by the LP reflect the higher fee on the second swap
        vm.prank(trader);
        swapper.swap(key, !tknIs0, 100e6);
        (uint256 f0, uint256 f1) = pos.pendingFees(id);
        assertGt(f0 + f1, 0);
    }
}

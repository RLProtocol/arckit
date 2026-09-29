// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ArcStaking} from "../src/ArcStaking.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";

contract ArcStakingTest is Test {
    ArcStaking internal s;
    MockERC20 internal tok;
    MockERC20 internal rwd;

    address internal deployer = makeAddr("deployer");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant FEE = 10 ether;
    uint64 internal T0;

    function setUp() public {
        vm.warp(1_800_000_000);
        T0 = uint64(block.timestamp);
        vm.prank(deployer);
        s = new ArcStaking(treasury);
        tok = new MockERC20("Token", "TOK");
        rwd = new MockERC20("Reward", "RWD");
        tok.mint(creator, 10_000_000 ether);
        rwd.mint(creator, 10_000_000 ether);
        tok.mint(alice, 100_000 ether);
        tok.mint(bob, 100_000 ether);
        vm.deal(creator, 1_000 ether);
        for (uint256 i = 0; i < 3; i++) {
            address u = i == 0 ? creator : i == 1 ? alice : bob;
            vm.startPrank(u);
            tok.approve(address(s), type(uint256).max);
            rwd.approve(address(s), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _cfg(address stakeT, address rewardT, uint64 duration, uint16 penalty) internal pure returns (ArcStaking.PoolConfig memory c) {
        c = ArcStaking.PoolConfig({
            stakeToken: stakeT,
            rewardToken: rewardT,
            startTime: 0,
            duration: duration,
            penaltyBps: penalty,
            minStake: 0,
            maxStakePerWallet: 0,
            maxTotalStaked: 0,
            name: "TOK 30-day"
        });
    }

    /// 30-day pool, 3000 TOK rewards, 10 % early penalty, same token.
    function _pool() internal returns (uint256 id) {
        vm.prank(creator);
        id = s.createPool{value: FEE}(_cfg(address(tok), address(tok), 30 days, 1_000), 3_000 ether);
    }

    // ---------- create ----------

    function test_create() public {
        uint256 id = _pool();
        ArcStaking.Pool memory p = s.poolInfo(id);
        assertEq(p.creator, creator);
        assertEq(uint256(p.cfg.startTime), uint256(T0));
        assertEq(uint256(p.periodFinish), uint256(T0) + 30 days);
        assertEq(p.rewardReserve, 3_000 ether);
        assertEq(p.rewardRate, (3_000 ether * 1e18) / uint256(30 days));
        assertEq(s.rewardsRemaining(id), 3_000 ether - 1); // floor rounding of the rate
        assertEq(s.pendingFees(), FEE);
        assertEq(s.getPoolsByCreator(creator)[0], id);
        // APR if 10 000 TOK were staked: 3000 over 30 days => 36 500 / year on 10 000 => 365 %
        assertEq(s.aprBpsFor(id, 10_000 ether), 36_500 - 1);
    }

    function test_create_validation() public {
        ArcStaking.PoolConfig memory c = _cfg(address(tok), address(tok), 30 days, 1_000);
        vm.startPrank(creator);
        vm.expectRevert(abi.encodeWithSelector(ArcStaking.WrongFee.selector, FEE - 1, FEE));
        s.createPool{value: FEE - 1}(c, 1 ether);
        vm.expectRevert(ArcStaking.ZeroAmount.selector);
        s.createPool{value: FEE}(c, 0);
        c.duration = 30 minutes;
        vm.expectRevert(ArcStaking.BadConfig.selector);
        s.createPool{value: FEE}(c, 1 ether);
        c.duration = 30 days;
        c.penaltyBps = 5_001;
        vm.expectRevert(ArcStaking.BadConfig.selector);
        s.createPool{value: FEE}(c, 1 ether);
        c.penaltyBps = 0;
        c.startTime = T0 - 1;
        vm.expectRevert(ArcStaking.BadConfig.selector);
        s.createPool{value: FEE}(c, 1 ether);
        vm.stopPrank();
    }

    // ---------- streaming ----------

    function test_stream_proRata_andApr() public {
        uint256 id = _pool();
        vm.prank(alice);
        s.stake(id, 2_000 ether);
        vm.prank(bob);
        s.stake(id, 1_000 ether);

        // APR at 3000 staked: 3000 rewards / 30 days => 36 500/yr => 1216.67 %
        assertApproxEqAbs(s.currentAprBps(id), 121_667, 2);

        vm.warp(T0 + 15 days);
        uint256 ea = s.earned(id, alice);
        uint256 eb = s.earned(id, bob);
        assertApproxEqRel(ea + eb, 1_500 ether, 1e12, "half the rewards at half time");
        assertApproxEqRel(ea, 2 * eb, 1e12, "2:1 split");

        vm.warp(T0 + 40 days); // past the end: no more accrual
        assertApproxEqRel(s.earned(id, alice) + s.earned(id, bob), 3_000 ether, 1e12);
        assertEq(s.rewardsRemaining(id), 0);
        assertEq(s.currentAprBps(id), 0, "ended");

        vm.prank(alice);
        uint256 ca = s.claim(id);
        vm.prank(bob);
        uint256 cb = s.claim(id);
        assertApproxEqAbs(ca + cb, 3_000 ether, 1e6);
        assertLe(s.poolInfo(id).rewardReserve, 1e6, "reserve fully paid out, dust only");
    }

    function test_lateJoinerOnlyEarnsFromJoin() public {
        uint256 id = _pool();
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 20 days);
        vm.prank(bob);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 30 days);
        // alice: 20 days alone (2000) + 10 days half (500) = 2500 ; bob 500
        assertApproxEqRel(s.earned(id, alice), 2_500 ether, 1e12);
        assertApproxEqRel(s.earned(id, bob), 500 ether, 1e12);
    }

    // ---------- early withdrawal penalty ----------

    function test_penalty_redistributedToStayers_sameToken() public {
        uint256 id = _pool();
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.prank(bob);
        s.stake(id, 1_000 ether);

        vm.warp(T0 + 10 days);
        assertEq(s.penaltyFor(id, 1_000 ether), 100 ether);
        uint256 before = tok.balanceOf(alice);
        vm.prank(alice);
        s.unstake(id, 1_000 ether);
        assertEq(tok.balanceOf(alice) - before, 900 ether, "10 % penalty deducted");
        // penalty joined the reward pool: bob alone now streams (2000 remaining + 100 penalty) over 20 days
        vm.warp(T0 + 30 days);
        uint256 bobEarned = s.earned(id, bob);
        // bob: 500 (first 10 days, half of 1000) + 2100 (last 20 days alone)
        assertApproxEqRel(bobEarned, 2_600 ether, 1e12);
        vm.prank(bob);
        s.exit(id);
        assertApproxEqRel(tok.balanceOf(bob), 100_000 ether + 2_600 ether, 1e12);
        assertLe(tok.balanceOf(address(s)), 1e6 + s.earned(id, alice), "only alice's unclaimed + dust left");
    }

    function test_penalty_goesToCreator_differentToken() public {
        vm.prank(creator);
        uint256 id = s.createPool{value: FEE}(_cfg(address(tok), address(rwd), 30 days, 2_000), 3_000 ether);
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 1 days);
        uint256 cBefore = tok.balanceOf(creator);
        vm.prank(alice);
        s.unstake(id, 1_000 ether);
        assertEq(tok.balanceOf(creator) - cBefore, 200 ether, "20 % penalty to creator in stake token");
        assertEq(tok.balanceOf(alice), 100_000 ether - 200 ether);
    }

    function test_noPenalty_afterEnd_orWhenDisabled() public {
        uint256 id = _pool();
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 30 days);
        assertEq(s.penaltyFor(id, 1_000 ether), 0);
        vm.prank(alice);
        s.unstake(id, 1_000 ether);
        assertEq(tok.balanceOf(alice), 100_000 ether, "free after end");

        vm.prank(creator);
        uint256 id2 = s.createPool{value: FEE}(_cfg(address(tok), address(tok), 7 days, 0), 100 ether);
        vm.prank(alice);
        s.stake(id2, 500 ether);
        vm.prank(alice);
        s.unstake(id2, 500 ether);
        assertEq(tok.balanceOf(alice), 100_000 ether, "no penalty configured");
    }

    // ---------- add rewards / extend / reclaim ----------

    function test_addRewards_raisesRateKeepsEnd() public {
        uint256 id = _pool();
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 15 days);
        vm.prank(creator);
        s.addRewards(id, 1_500 ether); // remaining 1500 + 1500 over the last 15 days
        assertEq(uint256(s.poolInfo(id).periodFinish), uint256(T0) + 30 days);
        vm.warp(T0 + 30 days);
        assertApproxEqRel(s.earned(id, alice), 4_500 ether, 1e12);
        vm.prank(creator);
        vm.expectRevert(ArcStaking.Ended.selector);
        s.addRewards(id, 1 ether);
    }

    function test_extend_reStreamsLeftover() public {
        uint256 id = _pool();
        // nobody stakes for the whole period -> 3000 undistributed
        vm.warp(T0 + 30 days);
        vm.prank(alice);
        vm.expectRevert(ArcStaking.Ended.selector);
        s.stake(id, 1 ether);
        vm.prank(creator);
        s.extendPool(id, 10 days, 0);
        assertEq(uint256(s.poolInfo(id).periodFinish), uint256(T0) + 40 days);
        assertApproxEqAbs(s.rewardsRemaining(id), 3_000 ether, 1e6);
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 40 days);
        assertApproxEqRel(s.earned(id, alice), 3_000 ether, 1e12);

        vm.prank(alice);
        vm.expectRevert(ArcStaking.NotCreator.selector);
        s.extendPool(id, 1 days, 0);
    }

    function test_reclaimUndistributed_onlyAfterEnd_onlyUnearned() public {
        uint256 id = _pool();
        vm.warp(T0 + 10 days); // empty for 10 days => 1000 never earned
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.prank(creator);
        vm.expectRevert(ArcStaking.NotEnded.selector);
        s.reclaimUndistributed(id);
        vm.warp(T0 + 30 days);
        uint256 before = tok.balanceOf(creator);
        vm.prank(creator);
        uint256 got = s.reclaimUndistributed(id);
        assertApproxEqAbs(got, 1_000 ether, 1e6, "the empty period's rewards");
        assertEq(tok.balanceOf(creator) - before, got);
        vm.prank(alice);
        uint256 paid = s.claim(id);
        assertApproxEqAbs(paid, 2_000 ether, 1e6, "staker still gets everything earned");
        vm.prank(creator);
        vm.expectRevert(ArcStaking.NothingToReclaim.selector);
        s.reclaimUndistributed(id);
    }

    // ---------- start later / pause / caps ----------

    function test_startLater_pause_caps() public {
        ArcStaking.PoolConfig memory c = _cfg(address(tok), address(tok), 7 days, 0);
        c.startTime = T0 + 1 days;
        c.minStake = 10 ether;
        c.maxStakePerWallet = 100 ether;
        c.maxTotalStaked = 150 ether;
        vm.prank(creator);
        uint256 id = s.createPool{value: FEE}(c, 700 ether);
        assertEq(uint256(s.poolInfo(id).periodFinish), uint256(T0) + 8 days);

        vm.prank(alice);
        vm.expectRevert(ArcStaking.NotStarted.selector);
        s.stake(id, 50 ether);
        vm.warp(T0 + 1 days);
        vm.startPrank(alice);
        vm.expectRevert(ArcStaking.BelowMinStake.selector);
        s.stake(id, 5 ether);
        vm.expectRevert(ArcStaking.AboveMaxStake.selector);
        s.stake(id, 101 ether);
        s.stake(id, 100 ether);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(ArcStaking.PoolFull.selector);
        s.stake(id, 60 ether);

        vm.prank(creator);
        s.setPaused(id, true);
        vm.prank(bob);
        vm.expectRevert(ArcStaking.PoolPaused.selector);
        s.stake(id, 50 ether);
        vm.warp(T0 + 3 days);
        vm.prank(alice);
        s.claim(id); // claims still work while paused
        vm.prank(alice);
        s.unstake(id, 10 ether); // withdrawals too
    }

    // ---------- compound / exit ----------

    function test_compound_and_exit() public {
        uint256 id = _pool();
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        vm.warp(T0 + 10 days);
        vm.prank(alice);
        uint256 added = s.compound(id);
        assertApproxEqRel(added, 1_000 ether, 1e12);
        (uint256 staked,,,) = s.users(id, alice);
        assertApproxEqRel(staked, 2_000 ether, 1e12);
        vm.warp(T0 + 30 days);
        vm.prank(alice);
        s.exit(id);
        assertApproxEqAbs(tok.balanceOf(alice), 100_000 ether + 3_000 ether, 1e6);
        assertEq(s.poolInfo(id).totalStaked, 0);

        vm.prank(creator);
        uint256 id2 = s.createPool{value: FEE}(_cfg(address(tok), address(rwd), 7 days, 0), 70 ether);
        vm.prank(alice);
        s.stake(id2, 10 ether);
        vm.warp(T0 + 31 days);
        vm.prank(alice);
        vm.expectRevert(ArcStaking.RewardTokenMismatch.selector);
        s.compound(id2);
    }

    // ---------- fee-on-transfer ----------

    function test_feeOnTransferStakeToken() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20(1_000);
        tax.mint(alice, 1_000 ether);
        vm.prank(alice);
        tax.approve(address(s), type(uint256).max);
        vm.prank(creator);
        uint256 id = s.createPool{value: FEE}(_cfg(address(tax), address(rwd), 7 days, 0), 70 ether);
        vm.prank(alice);
        s.stake(id, 1_000 ether);
        (uint256 staked,,,) = s.users(id, alice);
        assertEq(staked, 900 ether);
        vm.warp(T0 + 7 days);
        vm.prank(alice);
        s.exit(id);
        assertEq(tax.balanceOf(address(s)), 0);
        assertApproxEqAbs(rwd.balanceOf(alice), 70 ether, 1e6);
    }

    // ---------- fees ----------

    function test_fees_and_admin() public {
        _pool();
        vm.prank(alice);
        vm.expectRevert(ArcStaking.NotFeeReceiver.selector);
        s.claimFees();
        vm.prank(treasury);
        s.claimFees();
        assertEq(treasury.balance, FEE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        s.setCreateFee(1);
        vm.prank(deployer);
        s.setCreateFee(0);
        vm.prank(creator);
        s.createPool{value: 0}(_cfg(address(tok), address(tok), 7 days, 0), 1 ether);
    }

    // ---------- fuzz ----------

    /// Total paid to stakers never exceeds what was funded; principal always comes back (minus declared penalty).
    function testFuzz_conservation(uint256 a, uint256 b, uint32 leaveA, uint16 penalty) public {
        a = bound(a, 1 ether, 50_000 ether);
        b = bound(b, 1 ether, 50_000 ether);
        leaveA = uint32(bound(leaveA, 1, 30 days));
        penalty = uint16(bound(penalty, 0, 5_000));
        vm.prank(creator);
        uint256 id = s.createPool{value: FEE}(_cfg(address(tok), address(tok), 30 days, penalty), 3_000 ether);
        vm.prank(alice);
        s.stake(id, a);
        vm.prank(bob);
        s.stake(id, b);

        vm.warp(T0 + leaveA);
        vm.prank(alice);
        s.exit(id);
        vm.warp(T0 + 30 days);
        vm.prank(bob);
        s.exit(id);

        uint256 pen = leaveA < 30 days ? (a * penalty) / 10_000 : 0;
        uint256 outA = tok.balanceOf(alice) - (100_000 ether - a);
        uint256 outB = tok.balanceOf(bob) - (100_000 ether - b);
        // alice got principal minus penalty plus some rewards; bob got principal plus rewards
        assertGe(outA, a - pen);
        assertGe(outB, b);
        // everything paid out <= funded rewards + both principals (penalty recycled into rewards)
        assertLe(outA + outB, a + b + 3_000 ether);
        assertEq(s.poolInfo(id).totalStaked, 0);
        // contract keeps at most rounding dust
        assertLe(tok.balanceOf(address(s)), 1e9);
    }
}

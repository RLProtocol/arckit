// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TokenVesting} from "../src/TokenVesting.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";
import {RejectingReceiver} from "./mocks/RejectingReceiver.sol";

contract TokenVestingTest is Test {
    TokenVesting internal vest;
    MockERC20 internal token;

    address internal deployer = makeAddr("deployer");
    address internal treasury = makeAddr("treasury");
    address internal team = makeAddr("team");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant FEE = 10 ether;
    uint64 internal constant DAY = 1 days;
    uint64 internal T0;

    function setUp() public {
        vm.warp(1_800_000_000); // far enough forward that "100 days ago" is representable
        T0 = uint64(block.timestamp);

        vm.prank(deployer);
        vest = new TokenVesting(treasury);

        token = new MockERC20("Mock", "MCK");
        token.mint(team, 10_000_000 ether);
        vm.deal(team, 1_000 ether);
        vm.deal(alice, 10 ether);
        vm.prank(team);
        token.approve(address(vest), type(uint256).max);
    }

    function _params(address b, uint256 amt, uint64 start, uint64 cliff, uint64 end) internal pure returns (TokenVesting.CreateParams memory) {
        return TokenVesting.CreateParams({beneficiary: b, amount: amt, start: start, cliff: cliff, end: end});
    }

    /// 1000 tokens, starts now, 90 day cliff, 360 day total.
    function _standard() internal returns (uint256 id) {
        vm.prank(team);
        id = vest.createVesting{value: FEE}(address(token), _params(alice, 1000 ether, T0, T0 + 90 * DAY, T0 + 360 * DAY));
    }

    // ---------- create ----------

    function test_create_happyPath() public {
        vm.expectEmit(true, true, true, true);
        emit TokenVesting.VestingCreated(1, address(token), team, alice, 1000 ether, T0, T0 + 90 * DAY, T0 + 360 * DAY);
        uint256 id = _standard();

        assertEq(id, 1);
        TokenVesting.Vesting memory v = vest.getVesting(id);
        assertEq(v.token, address(token));
        assertEq(v.creator, team);
        assertEq(v.beneficiary, alice);
        assertEq(v.total, 1000 ether);
        assertEq(v.released, 0);
        assertEq(v.start, T0);
        assertEq(v.cliff, T0 + 90 * DAY);
        assertEq(v.end, T0 + 360 * DAY);
        assertEq(token.balanceOf(address(vest)), 1000 ether);
        assertEq(vest.pendingFees(), FEE);

        assertEq(vest.getVestingsForToken(address(token))[0], 1);
        assertEq(vest.getVestingsForCreator(team)[0], 1);
        assertEq(vest.getVestingsForBeneficiary(alice)[0], 1);
        assertEq(vest.getVestingsForBeneficiary(team).length, 0);
    }

    function test_create_rejectsBadSchedules() public {
        vm.startPrank(team);
        // cliff before start
        vm.expectRevert(TokenVesting.BadSchedule.selector);
        vest.createVesting{value: FEE}(address(token), _params(alice, 1, T0 + 10, T0, T0 + 100));
        // end == start
        vm.expectRevert(TokenVesting.BadSchedule.selector);
        vest.createVesting{value: FEE}(address(token), _params(alice, 1, T0, T0, T0));
        // cliff after end
        vm.expectRevert(TokenVesting.BadSchedule.selector);
        vest.createVesting{value: FEE}(address(token), _params(alice, 1, T0, T0 + 200, T0 + 100));
        // end in the past
        vm.expectRevert(TokenVesting.BadSchedule.selector);
        vest.createVesting{value: FEE}(address(token), _params(alice, 1, T0 - 100, T0 - 50, T0));
        // zero amount / zero beneficiary
        vm.expectRevert(TokenVesting.ZeroAmount.selector);
        vest.createVesting{value: FEE}(address(token), _params(alice, 0, T0, T0, T0 + 100));
        vm.expectRevert(TokenVesting.ZeroAddress.selector);
        vest.createVesting{value: FEE}(address(token), _params(address(0), 1, T0, T0, T0 + 100));
        // wrong fee
        vm.expectRevert(abi.encodeWithSelector(TokenVesting.WrongFee.selector, FEE - 1, FEE));
        vest.createVesting{value: FEE - 1}(address(token), _params(alice, 1, T0, T0, T0 + 100));
        vm.stopPrank();
    }

    function test_create_allowsStartInPast() public {
        // A schedule that began 100 days ago and ends in 100 days: 50% vested immediately (no cliff).
        vm.prank(team);
        uint256 id = vest.createVesting{value: FEE}(address(token), _params(alice, 1000 ether, T0 - 100 * DAY, T0 - 100 * DAY, T0 + 100 * DAY));
        assertEq(vest.claimable(id), 500 ether);
    }

    function test_createBatch() public {
        TokenVesting.CreateParams[] memory ps = new TokenVesting.CreateParams[](3);
        ps[0] = _params(alice, 100 ether, T0, T0, T0 + 100 * DAY);
        ps[1] = _params(bob, 200 ether, T0, T0 + 30 * DAY, T0 + 100 * DAY);
        ps[2] = _params(alice, 300 ether, T0, T0, T0 + 200 * DAY);

        vm.prank(team);
        vm.expectRevert(abi.encodeWithSelector(TokenVesting.WrongFee.selector, FEE, 3 * FEE));
        vest.createVestingBatch{value: FEE}(address(token), ps);

        vm.prank(team);
        uint256 first = vest.createVestingBatch{value: 3 * FEE}(address(token), ps);
        assertEq(first, 1);
        assertEq(vest.nextVestingId(), 4);
        assertEq(vest.pendingFees(), 3 * FEE);
        assertEq(token.balanceOf(address(vest)), 600 ether);
        assertEq(vest.getVestingsForBeneficiary(alice).length, 2);
        assertEq(vest.getVestingsForBeneficiary(bob).length, 1);

        TokenVesting.CreateParams[] memory none = new TokenVesting.CreateParams[](0);
        vm.prank(team);
        vm.expectRevert(TokenVesting.EmptyBatch.selector);
        vest.createVestingBatch{value: 0}(address(token), none);
    }

    // ---------- vesting math ----------

    function test_vesting_cliffThenLinear() public {
        uint256 id = _standard();

        // Before cliff: nothing.
        assertEq(vest.claimable(id), 0);
        vm.warp(T0 + 89 * DAY);
        assertEq(vest.claimable(id), 0);

        // At cliff: 90/360 = 25% unlocks at once.
        vm.warp(T0 + 90 * DAY);
        assertEq(vest.claimable(id), 250 ether);

        // Halfway: 50%.
        vm.warp(T0 + 180 * DAY);
        assertEq(vest.vestedAmount(id, block.timestamp), 500 ether);

        // End and beyond: 100%.
        vm.warp(T0 + 360 * DAY);
        assertEq(vest.claimable(id), 1000 ether);
        vm.warp(T0 + 1000 * DAY);
        assertEq(vest.claimable(id), 1000 ether);
    }

    function test_vestedAmount_nonexistentIsZero() public view {
        assertEq(vest.vestedAmount(999, block.timestamp), 0);
        assertEq(vest.claimable(999), 0);
    }

    // ---------- claim ----------

    function test_claim_flow() public {
        uint256 id = _standard();

        vm.prank(alice);
        vm.expectRevert(TokenVesting.NothingToClaim.selector);
        vest.claim(id);

        vm.prank(team);
        vm.expectRevert(TokenVesting.NotBeneficiary.selector);
        vest.claim(id);

        vm.warp(T0 + 180 * DAY);
        vm.expectEmit(true, true, false, true);
        emit TokenVesting.TokensClaimed(id, alice, 500 ether);
        vm.prank(alice);
        uint256 got = vest.claim(id);
        assertEq(got, 500 ether);
        assertEq(token.balanceOf(alice), 500 ether);
        assertEq(vest.getVesting(id).released, 500 ether);
        assertEq(vest.claimable(id), 0);

        // Claiming twice at the same time yields nothing.
        vm.prank(alice);
        vm.expectRevert(TokenVesting.NothingToClaim.selector);
        vest.claim(id);

        // Later: only the delta.
        vm.warp(T0 + 270 * DAY);
        vm.prank(alice);
        assertEq(vest.claim(id), 250 ether);

        vm.warp(T0 + 400 * DAY);
        vm.prank(alice);
        assertEq(vest.claim(id), 250 ether);
        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.balanceOf(address(vest)), 0);
    }

    // ---------- beneficiary ----------

    function test_setBeneficiary() public {
        uint256 id = _standard();

        vm.prank(team);
        vm.expectRevert(TokenVesting.NotBeneficiary.selector);
        vest.setBeneficiary(id, bob);

        vm.prank(alice);
        vm.expectRevert(TokenVesting.ZeroAddress.selector);
        vest.setBeneficiary(id, address(0));

        vm.expectEmit(true, true, true, true);
        emit TokenVesting.BeneficiaryUpdated(id, alice, bob);
        vm.prank(alice);
        vest.setBeneficiary(id, bob);

        assertEq(vest.getVesting(id).beneficiary, bob);
        assertEq(vest.getVestingsForBeneficiary(alice).length, 0);
        assertEq(vest.getVestingsForBeneficiary(bob).length, 1);

        vm.warp(T0 + 360 * DAY);
        vm.prank(alice);
        vm.expectRevert(TokenVesting.NotBeneficiary.selector);
        vest.claim(id);
        vm.prank(bob);
        assertEq(vest.claim(id), 1000 ether);
    }

    function test_beneficiaryIndex_swapAndPop() public {
        TokenVesting.CreateParams[] memory ps = new TokenVesting.CreateParams[](3);
        ps[0] = _params(alice, 1 ether, T0, T0, T0 + 10 * DAY);
        ps[1] = _params(alice, 2 ether, T0, T0, T0 + 10 * DAY);
        ps[2] = _params(alice, 3 ether, T0, T0, T0 + 10 * DAY);
        vm.prank(team);
        vest.createVestingBatch{value: 3 * FEE}(address(token), ps);

        vm.prank(alice);
        vest.setBeneficiary(2, bob); // middle removal
        uint256[] memory a = vest.getVestingsForBeneficiary(alice);
        assertEq(a.length, 2);
        assertTrue((a[0] == 1 && a[1] == 3) || (a[0] == 3 && a[1] == 1));

        vm.prank(bob);
        vest.setBeneficiary(2, alice); // ping back: no duplicates
        assertEq(vest.getVestingsForBeneficiary(alice).length, 3);
        assertEq(vest.getVestingsForBeneficiary(bob).length, 0);
    }

    // ---------- fee-on-transfer ----------

    function test_feeOnTransfer_recordsReceived() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20(1_000); // 10 %
        tax.mint(team, 1000 ether);
        vm.startPrank(team);
        tax.approve(address(vest), type(uint256).max);
        uint256 id = vest.createVesting{value: FEE}(address(tax), _params(alice, 1000 ether, T0, T0, T0 + 100 * DAY));
        vm.stopPrank();

        assertEq(vest.getVesting(id).total, 900 ether);
        vm.warp(T0 + 100 * DAY);
        vm.prank(alice);
        assertEq(vest.claim(id), 900 ether);
        assertEq(tax.balanceOf(address(vest)), 0);
    }

    // ---------- fees / admin ----------

    function test_fees_pullPaymentAndBrokenReceiver() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(deployer);
        vest.setFeeReceiver(address(bad));

        _standard(); // still works
        assertEq(vest.pendingFees(), FEE);

        vm.prank(deployer);
        vm.expectRevert(TokenVesting.FeeTransferFailed.selector);
        vest.claimFees();

        vm.prank(deployer);
        vest.setFeeReceiver(treasury);
        vm.prank(alice);
        vm.expectRevert(TokenVesting.NotFeeReceiver.selector);
        vest.claimFees();
        vm.prank(treasury);
        vest.claimFees();
        assertEq(treasury.balance, FEE);
        assertEq(vest.pendingFees(), 0);

        vm.prank(treasury);
        vm.expectRevert(TokenVesting.NoFeesToClaim.selector);
        vest.claimFees();
    }

    function test_admin() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vest.setFee(1);

        vm.startPrank(deployer);
        vest.setFee(0);
        assertEq(vest.fee(), 0);
        vm.expectRevert(TokenVesting.ZeroAddress.selector);
        vest.setFeeReceiver(address(0));
        vest.transferOwnership(bob);
        vm.stopPrank();
        assertEq(vest.owner(), deployer);
        vm.prank(bob);
        vest.acceptOwnership();
        assertEq(vest.owner(), bob);

        // Zero fee: create with no value
        vm.prank(team);
        vest.createVesting{value: 0}(address(token), _params(alice, 1 ether, T0, T0, T0 + DAY));
    }

    function test_ownerCannotTouchTokens() public {
        _standard();
        vm.startPrank(deployer);
        vest.setFee(0);
        vest.setFeeReceiver(deployer);
        vest.claimFees();
        vm.stopPrank();
        assertEq(token.balanceOf(address(vest)), 1000 ether);
    }

    // ---------- fuzz ----------

    function testFuzz_vestedIsMonotonicAndBounded(uint256 amount, uint64 cliffDays, uint64 totalDays, uint64 t1, uint64 t2) public {
        amount = bound(amount, 1, 1_000_000 ether);
        totalDays = uint64(bound(totalDays, 1, 3650));
        cliffDays = uint64(bound(cliffDays, 0, totalDays));
        vm.prank(team);
        uint256 id = vest.createVesting{value: FEE}(address(token), _params(alice, amount, T0, T0 + cliffDays * DAY, T0 + totalDays * DAY));

        t1 = uint64(bound(t1, 0, 5000 * DAY));
        t2 = uint64(bound(t2, t1, 5000 * DAY));
        uint256 v1 = vest.vestedAmount(id, T0 + t1);
        uint256 v2 = vest.vestedAmount(id, T0 + t2);
        assertLe(v1, v2, "vested must never decrease");
        assertLe(v2, amount, "vested never exceeds total");
        if (t1 < cliffDays * DAY) assertEq(v1, 0, "nothing before cliff");
        if (t2 >= totalDays * DAY) assertEq(v2, amount, "all at end");
    }

    function testFuzz_claimsSumToTotal(uint256 amount, uint8 steps) public {
        amount = bound(amount, 1e6, 1_000_000 ether);
        steps = uint8(bound(steps, 1, 12));
        vm.prank(team);
        uint256 id = vest.createVesting{value: FEE}(address(token), _params(alice, amount, T0, T0, T0 + 360 * DAY));

        uint256 claimed;
        for (uint256 i = 1; i <= steps; i++) {
            vm.warp(T0 + (360 * DAY * i) / steps);
            uint256 c = vest.claimable(id);
            if (c > 0) {
                vm.prank(alice);
                claimed += vest.claim(id);
            }
        }
        assertEq(claimed, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(address(vest)), 0);
    }
}

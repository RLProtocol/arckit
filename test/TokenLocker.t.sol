// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TokenLocker} from "../src/TokenLocker.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";
import {RejectingReceiver} from "./mocks/RejectingReceiver.sol";

contract TokenLockerTest is Test {
    TokenLocker internal locker;
    MockERC20 internal token;

    address internal deployer = makeAddr("deployer");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant FEE = 10 ether; // 10 USDC on Arc (18-decimal native coin)
    uint256 internal constant ONE_DAY = 1 days;

    function setUp() public {
        vm.warp(1_000_000); // avoid block.timestamp == 0 edge cases

        vm.prank(deployer);
        locker = new TokenLocker(treasury);

        token = new MockERC20("Mock", "MCK");
        token.mint(alice, 1_000_000 ether);
        token.mint(bob, 1_000_000 ether);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);

        vm.prank(alice);
        token.approve(address(locker), type(uint256).max);
        vm.prank(bob);
        token.approve(address(locker), type(uint256).max);
    }

    // ---------- helpers ----------

    function _lockAs(address who, uint256 amount, uint256 duration, address withdrawer) internal returns (uint256) {
        vm.prank(who);
        return locker.lock{value: FEE}(address(token), amount, block.timestamp + duration, withdrawer);
    }

    function _lockAs(address who, uint256 amount) internal returns (uint256) {
        return _lockAs(who, amount, ONE_DAY, who);
    }

    // ---------- constructor ----------

    function test_constructor_setsRolesAndFallbacks() public {
        assertEq(locker.owner(), deployer);
        assertEq(locker.feeReceiver(), treasury);
        assertEq(locker.lockFee(), FEE);
        assertEq(locker.nextLockId(), 1);

        vm.prank(deployer);
        TokenLocker fallbackLocker = new TokenLocker(address(0));
        assertEq(fallbackLocker.feeReceiver(), deployer, "zero receiver falls back to deployer");
    }

    // ---------- lock ----------

    function test_lock_happyPath() public {
        uint256 unlockAt = block.timestamp + ONE_DAY;

        vm.expectEmit(true, true, true, true);
        emit TokenLocker.LockCreated(1, address(token), alice, bob, 500 ether, unlockAt);

        vm.prank(alice);
        uint256 id = locker.lock{value: FEE}(address(token), 500 ether, unlockAt, bob);

        assertEq(id, 1);
        assertEq(locker.nextLockId(), 2);
        assertEq(token.balanceOf(address(locker)), 500 ether);
        assertEq(locker.pendingFees(), FEE);
        assertEq(address(locker).balance, FEE);

        TokenLocker.Lock memory l = locker.getLock(id);
        assertEq(l.id, 1);
        assertEq(l.token, address(token));
        assertEq(l.owner, alice);
        assertEq(l.withdrawer, bob);
        assertEq(l.amount, 500 ether);
        assertEq(l.lockDate, block.timestamp);
        assertEq(l.unlockDate, unlockAt);

        uint256[] memory forToken = locker.getLocksForToken(address(token));
        uint256[] memory forUser = locker.getLocksForUser(alice);
        assertEq(forToken.length, 1);
        assertEq(forToken[0], 1);
        assertEq(forUser.length, 1);
        assertEq(forUser[0], 1);
        assertEq(locker.getLocksForUser(bob).length, 0, "withdrawer is not indexed as owner");
    }

    function test_lock_revertsOnBadInputs() public {
        uint256 future = block.timestamp + ONE_DAY;

        vm.startPrank(alice);
        vm.expectRevert(TokenLocker.ZeroAmount.selector);
        locker.lock{value: FEE}(address(token), 0, future, alice);

        vm.expectRevert(TokenLocker.UnlockInPast.selector);
        locker.lock{value: FEE}(address(token), 1 ether, block.timestamp, alice);

        vm.expectRevert(TokenLocker.ZeroAddress.selector);
        locker.lock{value: FEE}(address(token), 1 ether, future, address(0));
        vm.stopPrank();
    }

    function test_lock_requiresExactFee() public {
        uint256 future = block.timestamp + ONE_DAY;

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(TokenLocker.WrongFee.selector, FEE - 1, FEE));
        locker.lock{value: FEE - 1}(address(token), 1 ether, future, alice);

        // Overpaying is rejected instead of silently kept.
        vm.expectRevert(abi.encodeWithSelector(TokenLocker.WrongFee.selector, FEE + 1, FEE));
        locker.lock{value: FEE + 1}(address(token), 1 ether, future, alice);
        vm.stopPrank();
    }

    function test_lock_zeroFeeWhenDisabled() public {
        vm.prank(deployer);
        locker.setLockFee(0);

        vm.prank(alice);
        uint256 id = locker.lock{value: 0}(address(token), 1 ether, block.timestamp + ONE_DAY, alice);
        assertEq(id, 1);
        assertEq(locker.pendingFees(), 0);
    }

    function test_lock_revertsOnNonContractToken() public {
        vm.prank(alice);
        vm.expectRevert();
        locker.lock{value: FEE}(makeAddr("not-a-token"), 1 ether, block.timestamp + ONE_DAY, alice);
    }

    // ---------- fee-on-transfer accounting ----------

    function test_feeOnTransfer_recordsReceivedAmountAndNeverShortsOtherLocks() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20(1_000); // 10 %
        tax.mint(alice, 1_000 ether);
        tax.mint(bob, 1_000 ether);
        vm.prank(alice);
        tax.approve(address(locker), type(uint256).max);
        vm.prank(bob);
        tax.approve(address(locker), type(uint256).max);

        uint256 unlockAt = block.timestamp + ONE_DAY;
        vm.prank(alice);
        uint256 a = locker.lock{value: FEE}(address(tax), 1_000 ether, unlockAt, alice);
        vm.prank(bob);
        uint256 b = locker.lock{value: FEE}(address(tax), 1_000 ether, unlockAt, bob);

        // 10 % burned on the way in: each lock records 900, contract holds exactly 1800.
        assertEq(locker.getLock(a).amount, 900 ether);
        assertEq(locker.getLock(b).amount, 900 ether);
        assertEq(tax.balanceOf(address(locker)), 1_800 ether);

        vm.warp(unlockAt);

        // Alice takes everything she is owed; Bob's full withdrawal must still succeed.
        vm.prank(alice);
        locker.withdraw(a, 900 ether);
        vm.prank(bob);
        locker.withdraw(b, 900 ether);

        assertEq(tax.balanceOf(address(locker)), 0, "no shortfall and no stranded balance");
        // Outbound transfer is taxed too; that is the token's behaviour, not the locker's.
        assertEq(tax.balanceOf(alice), 810 ether);
        assertEq(tax.balanceOf(bob), 810 ether);
    }

    function test_incrementLock_usesReceivedAmountForTaxToken() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20(2_500); // 25 %
        tax.mint(alice, 400 ether);
        vm.startPrank(alice);
        tax.approve(address(locker), type(uint256).max);
        uint256 id = locker.lock{value: FEE}(address(tax), 200 ether, block.timestamp + ONE_DAY, alice);
        locker.incrementLock(id, 200 ether);
        vm.stopPrank();

        assertEq(locker.getLock(id).amount, 300 ether);
        assertEq(tax.balanceOf(address(locker)), 300 ether);
    }

    // ---------- incrementLock ----------

    function test_incrementLock_happyPathAndGuards() public {
        uint256 id = _lockAs(alice, 100 ether);

        vm.prank(bob);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.incrementLock(id, 1 ether);

        vm.startPrank(alice);
        vm.expectRevert(TokenLocker.ZeroAmount.selector);
        locker.incrementLock(id, 0);

        vm.expectEmit(true, false, false, true);
        emit TokenLocker.LockIncremented(id, 50 ether);
        locker.incrementLock(id, 50 ether);
        assertEq(locker.getLock(id).amount, 150 ether);

        // Cannot top up a matured lock (must extend first).
        vm.warp(block.timestamp + ONE_DAY);
        vm.expectRevert(TokenLocker.LockMatured.selector);
        locker.incrementLock(id, 1 ether);

        locker.extendLock(id, block.timestamp + ONE_DAY);
        locker.incrementLock(id, 1 ether);
        assertEq(locker.getLock(id).amount, 151 ether);
        vm.stopPrank();
    }

    // ---------- extendLock ----------

    function test_extendLock_forwardOnly() public {
        uint256 id = _lockAs(alice, 100 ether);
        uint256 original = locker.getLock(id).unlockDate;

        vm.prank(bob);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.extendLock(id, original + 1);

        vm.startPrank(alice);
        vm.expectRevert(TokenLocker.MustExtendForward.selector);
        locker.extendLock(id, original);
        vm.expectRevert(TokenLocker.MustExtendForward.selector);
        locker.extendLock(id, original - 1);

        vm.expectEmit(true, false, false, true);
        emit TokenLocker.LockExtended(id, original + 7 days);
        locker.extendLock(id, original + 7 days);
        assertEq(locker.getLock(id).unlockDate, original + 7 days);
        vm.stopPrank();
    }

    function test_extendLock_onMaturedLockMustLandInFuture() public {
        uint256 id = _lockAs(alice, 100 ether);
        uint256 original = locker.getLock(id).unlockDate;

        vm.warp(original + 10 days);

        // Later than the old unlock date but still in the past: rejected.
        vm.prank(alice);
        vm.expectRevert(TokenLocker.MustExtendForward.selector);
        locker.extendLock(id, original + 1 days);

        vm.prank(alice);
        locker.extendLock(id, block.timestamp + 1);
        assertEq(locker.getLock(id).unlockDate, block.timestamp + 1);
    }

    // ---------- withdraw ----------

    function test_withdraw_partialThenFull() public {
        uint256 id = _lockAs(alice, 100 ether, ONE_DAY, bob);

        vm.prank(bob);
        vm.expectRevert(TokenLocker.StillLocked.selector);
        locker.withdraw(id, 1 ether);

        vm.warp(block.timestamp + ONE_DAY);

        vm.prank(alice);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.withdraw(id, 1 ether);

        vm.startPrank(bob);
        vm.expectRevert(TokenLocker.ZeroAmount.selector);
        locker.withdraw(id, 0);
        vm.expectRevert(TokenLocker.InsufficientLockBalance.selector);
        locker.withdraw(id, 100 ether + 1);

        uint256 before = token.balanceOf(bob);
        vm.expectEmit(true, true, false, true);
        emit TokenLocker.LockWithdrawn(id, bob, 40 ether);
        locker.withdraw(id, 40 ether);
        assertEq(locker.getLock(id).amount, 60 ether);

        locker.withdraw(id, 60 ether);
        assertEq(locker.getLock(id).amount, 0);
        assertEq(token.balanceOf(bob) - before, 100 ether);
        assertEq(token.balanceOf(address(locker)), 0);

        vm.expectRevert(TokenLocker.InsufficientLockBalance.selector);
        locker.withdraw(id, 1);
        vm.stopPrank();
    }

    // ---------- setWithdrawer ----------

    function test_setWithdrawer_onlyCurrentWithdrawer() public {
        uint256 id = _lockAs(alice, 100 ether, ONE_DAY, bob);

        // The lock owner cannot reassign the withdrawer.
        vm.prank(alice);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.setWithdrawer(id, alice);

        vm.prank(bob);
        vm.expectRevert(TokenLocker.ZeroAddress.selector);
        locker.setWithdrawer(id, address(0));

        vm.expectEmit(true, true, true, true);
        emit TokenLocker.WithdrawerUpdated(id, bob, carol);
        vm.prank(bob);
        locker.setWithdrawer(id, carol);
        assertEq(locker.getLock(id).withdrawer, carol);

        vm.warp(block.timestamp + ONE_DAY);
        vm.prank(bob);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.withdraw(id, 1 ether);

        vm.prank(carol);
        locker.withdraw(id, 100 ether);
        assertEq(token.balanceOf(carol), 100 ether);
    }

    // ---------- transferLockOwnership ----------

    function test_transferOwnership_withoutWithdrawRights() public {
        uint256 id = _lockAs(alice, 100 ether, ONE_DAY, alice);

        vm.prank(bob);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.transferLockOwnership(id, bob, false);

        vm.prank(alice);
        vm.expectRevert(TokenLocker.ZeroAddress.selector);
        locker.transferLockOwnership(id, address(0), false);

        vm.expectEmit(true, true, true, true);
        emit TokenLocker.LockOwnershipTransferred(id, alice, bob);
        vm.prank(alice);
        locker.transferLockOwnership(id, bob, false);

        TokenLocker.Lock memory l = locker.getLock(id);
        assertEq(l.owner, bob);
        assertEq(l.withdrawer, alice, "withdrawer unchanged when rights not transferred");

        // Index is exact: old owner has nothing, new owner has the lock.
        assertEq(locker.getLocksForUser(alice).length, 0);
        assertEq(locker.getLocksForUser(bob).length, 1);
        assertEq(locker.getLocksForUser(bob)[0], id);

        // New owner controls extension; old owner does not.
        vm.prank(alice);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.extendLock(id, block.timestamp + 2 days);
        vm.prank(bob);
        locker.extendLock(id, block.timestamp + 2 days);
    }

    function test_transferOwnership_withWithdrawRights() public {
        uint256 id = _lockAs(alice, 100 ether, ONE_DAY, alice);

        vm.expectEmit(true, true, true, true);
        emit TokenLocker.WithdrawerUpdated(id, alice, bob);
        vm.expectEmit(true, true, true, true);
        emit TokenLocker.LockOwnershipTransferred(id, alice, bob);
        vm.prank(alice);
        locker.transferLockOwnership(id, bob, true);

        TokenLocker.Lock memory l = locker.getLock(id);
        assertEq(l.owner, bob);
        assertEq(l.withdrawer, bob);

        vm.warp(block.timestamp + ONE_DAY);
        vm.prank(alice);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.withdraw(id, 1 ether);
        vm.prank(bob);
        locker.withdraw(id, 100 ether);
    }

    function test_transferOwnership_withRightsRequiresHoldingBoth() public {
        uint256 id = _lockAs(alice, 100 ether, ONE_DAY, carol);

        vm.prank(alice);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.transferLockOwnership(id, bob, true);

        // Without the flag it still works and leaves carol as withdrawer.
        vm.prank(alice);
        locker.transferLockOwnership(id, bob, false);
        assertEq(locker.getLock(id).withdrawer, carol);
    }

    function test_userIndex_staysExactAcrossManyTransfers() public {
        uint256 a = _lockAs(alice, 10 ether);
        uint256 b = _lockAs(alice, 20 ether);
        uint256 c = _lockAs(alice, 30 ether);
        assertEq(locker.getLocksForUserCount(alice), 3);

        // Remove from the middle: swap-and-pop must keep the other two.
        vm.prank(alice);
        locker.transferLockOwnership(b, bob, true);
        uint256[] memory aliceIds = locker.getLocksForUser(alice);
        assertEq(aliceIds.length, 2);
        assertTrue(_contains(aliceIds, a) && _contains(aliceIds, c) && !_contains(aliceIds, b));

        // Ping-pong: no duplicates accumulate.
        vm.prank(bob);
        locker.transferLockOwnership(b, alice, true);
        vm.prank(alice);
        locker.transferLockOwnership(b, bob, true);
        vm.prank(bob);
        locker.transferLockOwnership(b, alice, true);
        assertEq(locker.getLocksForUserCount(alice), 3);
        assertEq(locker.getLocksForUserCount(bob), 0);

        // Remove the last element path.
        vm.prank(alice);
        locker.transferLockOwnership(b, bob, true); // b is now last in alice's list
        assertEq(locker.getLocksForUserCount(alice), 2);
        assertEq(locker.getLocksForUser(bob)[0], b);

        // Every id in every list is actually owned by that user.
        _assertIndexConsistent(alice);
        _assertIndexConsistent(bob);
    }

    // ---------- splitLock ----------

    function test_splitLock_happyPathAndGuards() public {
        uint256 id = _lockAs(alice, 100 ether, ONE_DAY, bob);
        TokenLocker.Lock memory original = locker.getLock(id);

        vm.prank(bob);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.splitLock(id, 10 ether);

        vm.startPrank(alice);
        vm.expectRevert(TokenLocker.InvalidSplitAmount.selector);
        locker.splitLock(id, 0);
        vm.expectRevert(TokenLocker.InvalidSplitAmount.selector);
        locker.splitLock(id, 100 ether); // cannot split the whole lock
        vm.expectRevert(TokenLocker.InvalidSplitAmount.selector);
        locker.splitLock(id, 101 ether);

        vm.expectEmit(true, true, false, true);
        emit TokenLocker.LockSplit(id, 2, 30 ether);
        uint256 newId = locker.splitLock(id, 30 ether);
        vm.stopPrank();

        assertEq(newId, 2);
        assertEq(locker.getLock(id).amount, 70 ether);

        TokenLocker.Lock memory n = locker.getLock(newId);
        assertEq(n.id, newId);
        assertEq(n.token, original.token);
        assertEq(n.owner, original.owner);
        assertEq(n.withdrawer, original.withdrawer);
        assertEq(n.amount, 30 ether);
        assertEq(n.lockDate, original.lockDate);
        assertEq(n.unlockDate, original.unlockDate);

        assertEq(locker.getLocksForToken(address(token)).length, 2);
        assertEq(locker.getLocksForUser(alice).length, 2);
        assertEq(token.balanceOf(address(locker)), 100 ether, "split moves no tokens");

        // Both halves withdrawable independently by the withdrawer.
        vm.warp(original.unlockDate);
        uint256 bobBefore = token.balanceOf(bob);
        vm.startPrank(bob);
        locker.withdraw(id, 70 ether);
        locker.withdraw(newId, 30 ether);
        vm.stopPrank();
        assertEq(token.balanceOf(bob) - bobBefore, 100 ether);
        assertEq(token.balanceOf(address(locker)), 0);
    }

    // ---------- non-existent locks ----------

    function test_nonExistentLock_allMutatorsRevert() public {
        uint256 ghost = 999;
        vm.startPrank(alice);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.incrementLock(ghost, 1);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.extendLock(ghost, block.timestamp + 1);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.withdraw(ghost, 1);
        vm.expectRevert(TokenLocker.NotWithdrawer.selector);
        locker.setWithdrawer(ghost, bob);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.transferLockOwnership(ghost, bob, false);
        vm.expectRevert(TokenLocker.NotLockOwner.selector);
        locker.splitLock(ghost, 1);
        vm.stopPrank();
    }

    // ---------- fees: pull payment ----------

    function test_fees_brokenReceiverCannotBlockLocking() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(deployer);
        locker.setFeeReceiver(address(bad));

        // Locking still works even though the receiver rejects ETH.
        uint256 id = _lockAs(alice, 1 ether);
        assertEq(id, 1);
        assertEq(locker.pendingFees(), FEE);

        // Claiming fails loudly but nothing is lost.
        vm.prank(deployer);
        vm.expectRevert(TokenLocker.FeeTransferFailed.selector);
        locker.claimFees();
        assertEq(locker.pendingFees(), FEE);

        // Owner repoints the receiver and claims.
        vm.prank(deployer);
        locker.setFeeReceiver(treasury);
        vm.expectEmit(true, false, false, true);
        emit TokenLocker.FeesClaimed(treasury, FEE);
        vm.prank(treasury);
        locker.claimFees();
        assertEq(treasury.balance, FEE);
        assertEq(locker.pendingFees(), 0);
        assertEq(address(locker).balance, 0);
    }

    function test_fees_accumulateAndClaimAccessControl() public {
        _lockAs(alice, 1 ether);
        _lockAs(bob, 1 ether);
        _lockAs(alice, 1 ether);
        assertEq(locker.pendingFees(), 3 * FEE);

        vm.prank(alice);
        vm.expectRevert(TokenLocker.NotFeeReceiver.selector);
        locker.claimFees();

        // Contract owner may also trigger the claim; funds still go to the receiver.
        vm.prank(deployer);
        locker.claimFees();
        assertEq(treasury.balance, 3 * FEE);
        assertEq(deployer.balance, 0);

        vm.prank(treasury);
        vm.expectRevert(TokenLocker.NoFeesToClaim.selector);
        locker.claimFees();
    }

    // ---------- admin ----------

    function test_admin_setters() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        locker.setLockFee(1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        locker.setFeeReceiver(alice);

        vm.startPrank(deployer);
        vm.expectEmit(false, false, false, true);
        emit TokenLocker.FeeUpdated(1 ether);
        locker.setLockFee(1 ether);
        assertEq(locker.lockFee(), 1 ether);

        vm.expectRevert(TokenLocker.ZeroAddress.selector);
        locker.setFeeReceiver(address(0));

        vm.expectEmit(true, false, false, true);
        emit TokenLocker.FeeReceiverUpdated(carol);
        locker.setFeeReceiver(carol);
        assertEq(locker.feeReceiver(), carol);
        vm.stopPrank();
    }

    function test_admin_ownershipIsTwoStep() public {
        vm.prank(deployer);
        locker.transferOwnership(carol);
        assertEq(locker.owner(), deployer, "not yet transferred");
        assertEq(locker.pendingOwner(), carol);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        locker.acceptOwnership();

        vm.prank(carol);
        locker.acceptOwnership();
        assertEq(locker.owner(), carol);
    }

    function test_ownerCannotTouchLockedTokens() public {
        _lockAs(alice, 100 ether);
        // There is simply no function for it; prove the balance is untouched by every admin action.
        vm.startPrank(deployer);
        locker.setLockFee(0);
        locker.setFeeReceiver(deployer);
        locker.claimFees();
        vm.stopPrank();
        assertEq(token.balanceOf(address(locker)), 100 ether);
    }

    // ---------- pagination ----------

    function test_pagination() public {
        for (uint256 i = 0; i < 5; i++) {
            _lockAs(alice, 1 ether);
        }
        assertEq(locker.getLocksForTokenCount(address(token)), 5);
        assertEq(locker.getLocksForUserCount(alice), 5);

        uint256[] memory p0 = locker.getLocksForTokenPaginated(address(token), 0, 2);
        uint256[] memory p1 = locker.getLocksForTokenPaginated(address(token), 2, 2);
        uint256[] memory p2 = locker.getLocksForTokenPaginated(address(token), 4, 2);
        uint256[] memory p3 = locker.getLocksForTokenPaginated(address(token), 5, 2);

        assertEq(p0.length, 2);
        assertEq(p0[0], 1);
        assertEq(p0[1], 2);
        assertEq(p1[0], 3);
        assertEq(p1[1], 4);
        assertEq(p2.length, 1, "final partial page");
        assertEq(p2[0], 5);
        assertEq(p3.length, 0, "past the end is empty");

        uint256[] memory u = locker.getLocksForUserPaginated(alice, 3, 100);
        assertEq(u.length, 2);
        assertEq(u[0], 4);
        assertEq(u[1], 5);
    }

    // ---------- fuzz ----------

    function testFuzz_lockThenWithdrawFull(uint256 amount, uint256 duration) public {
        amount = bound(amount, 1, 1_000_000 ether);
        duration = bound(duration, 1, 3650 days);

        uint256 id = _lockAs(alice, amount, duration, alice);
        assertEq(locker.getLock(id).amount, amount);

        vm.warp(block.timestamp + duration - 1);
        vm.prank(alice);
        vm.expectRevert(TokenLocker.StillLocked.selector);
        locker.withdraw(id, amount);

        vm.warp(block.timestamp + 1);
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        locker.withdraw(id, amount);
        assertEq(token.balanceOf(alice) - before, amount);
        assertEq(locker.getLock(id).amount, 0);
    }

    function testFuzz_splitConservesTotal(uint256 amount, uint256 splitAmount) public {
        amount = bound(amount, 2, 1_000_000 ether);
        splitAmount = bound(splitAmount, 1, amount - 1);

        uint256 id = _lockAs(alice, amount);
        vm.prank(alice);
        uint256 newId = locker.splitLock(id, splitAmount);

        assertEq(locker.getLock(id).amount + locker.getLock(newId).amount, amount);
        assertEq(token.balanceOf(address(locker)), amount);
    }

    function testFuzz_feeOnTransferAccountingMatchesBalance(uint256 feeBps, uint256 a1, uint256 a2) public {
        feeBps = bound(feeBps, 0, 9_000);
        a1 = bound(a1, 1e6, 1_000 ether);
        a2 = bound(a2, 1e6, 1_000 ether);

        FeeOnTransferERC20 tax = new FeeOnTransferERC20(feeBps);
        tax.mint(alice, a1);
        tax.mint(bob, a2);
        vm.prank(alice);
        tax.approve(address(locker), type(uint256).max);
        vm.prank(bob);
        tax.approve(address(locker), type(uint256).max);

        uint256 unlockAt = block.timestamp + ONE_DAY;
        vm.prank(alice);
        uint256 idA = locker.lock{value: FEE}(address(tax), a1, unlockAt, alice);
        vm.prank(bob);
        uint256 idB = locker.lock{value: FEE}(address(tax), a2, unlockAt, bob);

        // Invariant: recorded total equals what the contract actually holds.
        uint256 recorded = locker.getLock(idA).amount + locker.getLock(idB).amount;
        assertEq(recorded, tax.balanceOf(address(locker)));

        // And both can fully withdraw in either order.
        // Read amounts first: a view call inside the argument list would consume the prank.
        uint256 owedA = locker.getLock(idA).amount;
        uint256 owedB = locker.getLock(idB).amount;
        vm.warp(unlockAt);
        vm.prank(bob);
        locker.withdraw(idB, owedB);
        vm.prank(alice);
        locker.withdraw(idA, owedA);
        assertEq(tax.balanceOf(address(locker)), 0);
    }

    // ---------- internal helpers ----------

    function _contains(uint256[] memory arr, uint256 v) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == v) return true;
        }
        return false;
    }

    function _assertIndexConsistent(address user) internal view {
        uint256[] memory ids = locker.getLocksForUser(user);
        for (uint256 i = 0; i < ids.length; i++) {
            assertEq(locker.getLock(ids[i]).owner, user, "indexed lock not owned by user");
            for (uint256 j = i + 1; j < ids.length; j++) {
                assertTrue(ids[i] != ids[j], "duplicate id in user index");
            }
        }
    }
}

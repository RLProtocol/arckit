// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ArcPayRouter} from "../src/ArcPayRouter.sol";
import {RejectingReceiver} from "./mocks/RejectingReceiver.sol";

contract ArcPayRouterTest is Test {
    ArcPayRouter router;
    address payable treasury = payable(makeAddr("treasury"));
    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount, address treasury);

    function setUp() public {
        vm.prank(deployer);
        router = new ArcPayRouter(treasury);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_pay_forwardsEverything_andRecords() public {
        bytes32 id = keccak256("order-1");
        vm.expectEmit(true, true, false, true);
        emit Paid(id, alice, 25.5 ether, treasury);
        vm.prank(alice);
        router.pay{value: 25.5 ether}(id);

        assertEq(treasury.balance, 25.5 ether, "treasury received the full amount");
        assertEq(address(router).balance, 0, "router never holds money");
        (address payer, uint96 at, uint256 amount) = router.payments(id);
        assertEq(payer, alice);
        assertEq(amount, 25.5 ether);
        assertEq(at, block.timestamp);
        assertTrue(router.isPaid(id));
        assertEq(router.totalPaid(), 25.5 ether);
        assertEq(router.paymentCount(), 1);
    }

    function test_pay_onlyOncePerOrder() public {
        bytes32 id = keccak256("order-2");
        vm.prank(alice);
        router.pay{value: 1 ether}(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcPayRouter.AlreadyPaid.selector, id));
        router.pay{value: 1 ether}(id);
        assertEq(bob.balance, 100 ether, "second payer keeps their money");
    }

    function test_pay_validation() public {
        vm.startPrank(alice);
        vm.expectRevert(ArcPayRouter.ZeroAmount.selector);
        router.pay{value: 0}(keccak256("x"));
        vm.expectRevert(ArcPayRouter.EmptyOrderId.selector);
        router.pay{value: 1 ether}(bytes32(0));
        vm.stopPrank();
    }

    function test_pay_revertsIfTreasuryRejects_nothingStuck() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(deployer);
        router.setTreasury(payable(address(bad)));
        bytes32 id = keccak256("order-3");
        vm.prank(alice);
        vm.expectRevert(ArcPayRouter.ForwardFailed.selector);
        router.pay{value: 2 ether}(id);
        assertEq(alice.balance, 100 ether);
        assertFalse(router.isPaid(id), "a failed payment leaves the order payable");
    }

    function test_admin() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        router.setTreasury(payable(alice));
        vm.prank(deployer);
        vm.expectRevert(ArcPayRouter.ZeroAddress.selector);
        router.setTreasury(payable(address(0)));
        vm.prank(deployer);
        router.setTreasury(payable(bob));
        vm.prank(alice);
        router.pay{value: 3 ether}(keccak256("order-4"));
        assertEq(bob.balance, 103 ether);
        vm.expectRevert(ArcPayRouter.ZeroAddress.selector);
        new ArcPayRouter(payable(address(0)));
    }

    function testFuzz_pay(bytes32 id, uint96 amount) public {
        vm.assume(id != bytes32(0) && amount > 0);
        vm.deal(alice, amount);
        vm.prank(alice);
        router.pay{value: amount}(id);
        assertEq(treasury.balance, amount);
        assertEq(address(router).balance, 0);
    }
}

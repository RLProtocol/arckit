// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BulkAirdrop} from "../src/BulkAirdrop.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";
import {RejectingReceiver} from "./mocks/RejectingReceiver.sol";

contract BulkAirdropTest is Test {
    BulkAirdrop internal drop;
    MockERC20 internal token;

    address internal deployer = makeAddr("deployer");
    address internal treasury = makeAddr("treasury");
    address internal sender = makeAddr("sender");
    uint256 internal constant FEE = 10 ether;

    function setUp() public {
        vm.prank(deployer);
        drop = new BulkAirdrop(treasury);
        token = new MockERC20("Mock", "MCK");
        token.mint(sender, 1_000_000 ether);
        vm.deal(sender, 10_000 ether);
        vm.prank(sender);
        token.approve(address(drop), type(uint256).max);
    }

    function _recipients(uint256 n) internal returns (address[] memory r, uint256[] memory a) {
        r = new address[](n);
        a = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            r[i] = makeAddr(string(abi.encodePacked("r", vm.toString(i))));
            a[i] = (i + 1) * 1 ether;
        }
    }

    // ---------- ERC20, per-recipient amounts ----------

    function test_airdropERC20_happyPath() public {
        (address[] memory r, uint256[] memory a) = _recipients(5);
        vm.expectEmit(true, true, false, true);
        emit BulkAirdrop.AirdropERC20(sender, address(token), 5, 15 ether);
        vm.prank(sender);
        uint256 total = drop.airdropERC20{value: FEE}(address(token), r, a);

        assertEq(total, 15 ether);
        for (uint256 i = 0; i < 5; i++) assertEq(token.balanceOf(r[i]), (i + 1) * 1 ether);
        assertEq(token.balanceOf(sender), 1_000_000 ether - 15 ether);
        assertEq(token.balanceOf(address(drop)), 0, "contract never holds tokens");
        assertEq(drop.pendingFees(), FEE);
        assertEq(drop.totalAirdrops(), 1);
        assertEq(drop.totalRecipients(), 5);
    }

    function test_airdropERC20_guards() public {
        (address[] memory r, uint256[] memory a) = _recipients(3);
        address[] memory none = new address[](0);
        uint256[] memory noneA = new uint256[](0);
        uint256[] memory shortA = new uint256[](2);

        vm.startPrank(sender);
        vm.expectRevert(BulkAirdrop.EmptyList.selector);
        drop.airdropERC20{value: FEE}(address(token), none, noneA);
        vm.expectRevert(BulkAirdrop.LengthMismatch.selector);
        drop.airdropERC20{value: FEE}(address(token), r, shortA);
        vm.expectRevert(abi.encodeWithSelector(BulkAirdrop.WrongFee.selector, FEE - 1, FEE));
        drop.airdropERC20{value: FEE - 1}(address(token), r, a);

        r[1] = address(0);
        vm.expectRevert(BulkAirdrop.ZeroAddress.selector);
        drop.airdropERC20{value: FEE}(address(token), r, a);
        r[1] = makeAddr("fixed");
        a[2] = 0;
        vm.expectRevert(BulkAirdrop.ZeroAmount.selector);
        drop.airdropERC20{value: FEE}(address(token), r, a);
        vm.stopPrank();
    }

    function test_airdropERC20_tooMany() public {
        (address[] memory r, uint256[] memory a) = _recipients(501);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(BulkAirdrop.TooMany.selector, 501, 500));
        drop.airdropERC20{value: FEE}(address(token), r, a);
    }

    function test_airdropERC20_maxBatchFits() public {
        (address[] memory r,) = _recipients(500);
        vm.prank(sender);
        uint256 total = drop.airdropERC20Same{value: FEE}(address(token), r, 1 ether);
        assertEq(total, 500 ether);
        assertEq(token.balanceOf(r[499]), 1 ether);
    }

    function test_airdropERC20_insufficientAllowanceReverts() public {
        (address[] memory r, uint256[] memory a) = _recipients(2);
        vm.startPrank(sender);
        token.approve(address(drop), 1 ether); // need 3
        vm.expectRevert();
        drop.airdropERC20{value: FEE}(address(token), r, a);
        vm.stopPrank();
        assertEq(token.balanceOf(r[0]), 0, "atomic: nobody paid");
    }

    function test_airdropERC20_feeOnTransferBehavesLikeDirectTransfer() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20(1_000);
        tax.mint(sender, 100 ether);
        (address[] memory r, uint256[] memory a) = _recipients(2);
        vm.startPrank(sender);
        tax.approve(address(drop), type(uint256).max);
        drop.airdropERC20{value: FEE}(address(tax), r, a);
        vm.stopPrank();
        assertEq(tax.balanceOf(r[0]), 0.9 ether);
        assertEq(tax.balanceOf(r[1]), 1.8 ether);
    }

    // ---------- ERC20, same amount ----------

    function test_airdropERC20Same() public {
        (address[] memory r,) = _recipients(4);
        vm.prank(sender);
        uint256 total = drop.airdropERC20Same{value: FEE}(address(token), r, 2.5 ether);
        assertEq(total, 10 ether);
        for (uint256 i = 0; i < 4; i++) assertEq(token.balanceOf(r[i]), 2.5 ether);

        vm.prank(sender);
        vm.expectRevert(BulkAirdrop.ZeroAmount.selector);
        drop.airdropERC20Same{value: FEE}(address(token), r, 0);
    }

    // ---------- Native ----------

    function test_airdropNative_exactAndRefund() public {
        (address[] memory r, uint256[] memory a) = _recipients(3); // 1+2+3 = 6
        uint256 before = sender.balance;

        vm.prank(sender);
        uint256 total = drop.airdropNative{value: 6 ether + FEE}(r, a);
        assertEq(total, 6 ether);
        assertEq(r[0].balance, 1 ether);
        assertEq(r[2].balance, 3 ether);
        assertEq(sender.balance, before - 6 ether - FEE);
        assertEq(address(drop).balance, FEE, "only the fee stays");

        // Overpay by 1: refunded.
        before = sender.balance;
        vm.prank(sender);
        drop.airdropNative{value: 6 ether + FEE + 1 ether}(r, a);
        assertEq(sender.balance, before - 6 ether - FEE);
        assertEq(address(drop).balance, 2 * FEE);
    }

    function test_airdropNative_guards() public {
        (address[] memory r, uint256[] memory a) = _recipients(2); // 3 ether
        vm.startPrank(sender);
        vm.expectRevert(abi.encodeWithSelector(BulkAirdrop.InsufficientValue.selector, 3 ether, 3 ether + FEE));
        drop.airdropNative{value: 3 ether}(r, a);

        RejectingReceiver bad = new RejectingReceiver();
        r[1] = address(bad);
        vm.expectRevert(abi.encodeWithSelector(BulkAirdrop.NativeSendFailed.selector, address(bad)));
        drop.airdropNative{value: 3 ether + FEE}(r, a);
        vm.stopPrank();
        assertEq(r[0].balance, 0, "atomic: first recipient rolled back");
    }

    // ---------- Fees / admin ----------

    function test_fees_and_admin() public {
        (address[] memory r,) = _recipients(1);
        vm.prank(sender);
        drop.airdropERC20Same{value: FEE}(address(token), r, 1 ether);

        vm.prank(sender);
        vm.expectRevert(BulkAirdrop.NotFeeReceiver.selector);
        drop.claimFees();
        vm.prank(treasury);
        drop.claimFees();
        assertEq(treasury.balance, FEE);
        assertEq(drop.pendingFees(), 0);
        vm.prank(treasury);
        vm.expectRevert(BulkAirdrop.NoFeesToClaim.selector);
        drop.claimFees();

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, sender));
        drop.setFee(1);
        vm.startPrank(deployer);
        drop.setFee(0);
        vm.expectRevert(BulkAirdrop.ZeroAddress.selector);
        drop.setFeeReceiver(address(0));
        vm.stopPrank();

        // Zero fee: no value needed and pendingFees stays 0.
        vm.prank(sender);
        drop.airdropERC20Same{value: 0}(address(token), r, 1 ether);
        assertEq(drop.pendingFees(), 0);
        assertEq(drop.totalAirdrops(), 2);
    }

    // ---------- Fuzz ----------

    function testFuzz_erc20SumMatches(uint8 n, uint256 seed) public {
        n = uint8(bound(n, 1, 60));
        address[] memory r = new address[](n);
        uint256[] memory a = new uint256[](n);
        uint256 expected;
        for (uint256 i = 0; i < n; i++) {
            r[i] = address(uint160(uint256(keccak256(abi.encode(seed, i))) | 1));
            a[i] = bound(uint256(keccak256(abi.encode(seed, i, "amt"))), 1, 1000 ether);
            expected += a[i];
        }
        uint256 before = token.balanceOf(sender);
        vm.prank(sender);
        uint256 total = drop.airdropERC20{value: FEE}(address(token), r, a);
        assertEq(total, expected);
        assertEq(before - token.balanceOf(sender), expected);
    }
}

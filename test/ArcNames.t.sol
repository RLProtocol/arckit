// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ArcNames} from "../src/ArcNames.sol";

contract ArcNamesTest is Test {
    ArcNames internal names;
    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant P3 = 50 ether;
    uint256 internal constant P4 = 20 ether;
    uint256 internal constant P5 = 5 ether;

    function setUp() public {
        vm.warp(1_000_000);
        names = new ArcNames(owner, treasury, [P3, P4, P5]);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    function _reg(address who, string memory label, uint256 numYears) internal returns (uint256 id) {
        vm.prank(who);
        id = names.register{value: names.priceOf(label, numYears)}(label, numYears, who);
    }

    // ---------------------------------------------------------------- rules and pricing

    function test_validity() public view {
        assertTrue(names.isValid("abc"));
        assertTrue(names.isValid("arc-kit-2026"));
        assertFalse(names.isValid("ab"));
        assertFalse(names.isValid("ABC"));
        assertFalse(names.isValid("-abc"));
        assertFalse(names.isValid("abc-"));
        assertFalse(names.isValid("a.bc"));
        assertFalse(names.isValid(unicode"аbc")); // Cyrillic a
        assertFalse(names.isValid("abcdefghijklmnopqrstuvwxyz1234567")); // 33
        assertTrue(names.isValid("abcdefghijklmnopqrstuvwxyz123456")); // 32
    }

    function test_priceTiers() public view {
        assertEq(names.priceOf("abc", 1), P3);
        assertEq(names.priceOf("abcd", 2), 2 * P4);
        assertEq(names.priceOf("abcdefgh", 3), 3 * P5);
    }

    function test_registerResolvesAndRefundsExcess() public {
        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 id = names.register{value: 30 ether}("alice", 2, alice); // costs 10
        assertEq(names.ownerOf(id), alice);
        assertEq(names.resolve("alice"), alice);
        assertEq(alice.balance, before - 10 ether);
        assertEq(names.pendingFees(), 10 ether);
        (string[] memory labels,) = names.namesOf(alice);
        assertEq(labels.length, 1);
        assertEq(labels[0], "alice");
    }

    function test_underpaymentReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArcNames.InsufficientPayment.selector, 4 ether, 5 ether));
        names.register{value: 4 ether}("alice", 1, alice);
    }

    function test_cannotTakeRegisteredName() public {
        _reg(alice, "alice", 1);
        vm.prank(bob);
        vm.expectRevert(ArcNames.NotAvailable.selector);
        names.register{value: P5}("alice", 1, bob);
    }

    function test_yearsBounds() public {
        vm.prank(alice);
        vm.expectRevert(ArcNames.InvalidYears.selector);
        names.register{value: 0}("alice", 0, alice);
        vm.prank(alice);
        vm.expectRevert(ArcNames.InvalidYears.selector);
        names.register{value: 55 ether}("alice", 11, alice);
    }

    // ---------------------------------------------------------------- reserved names

    function test_reservedOnlyOwnerAssigns() public {
        string[] memory l = new string[](1);
        l[0] = "arckit";
        vm.prank(owner);
        names.setReserved(l, true);
        assertFalse(names.available("arckit"));
        vm.prank(alice);
        vm.expectRevert(ArcNames.IsReserved.selector);
        names.register{value: P5}("arckit", 1, alice);
        vm.prank(owner);
        names.registerReserved("arckit", 5, bob);
        assertEq(names.resolve("arckit"), bob);
        vm.prank(alice);
        vm.expectRevert();
        names.registerReserved("free-name", 1, alice);
    }

    // ---------------------------------------------------------------- expiry, grace, renewal

    function test_expiryGraceAndRenew() public {
        _reg(alice, "alice", 1);
        vm.warp(block.timestamp + 365 days + 1);
        assertEq(names.resolve("alice"), address(0)); // expired: stops resolving
        assertFalse(names.available("alice")); // but held during grace
        vm.prank(bob); // anyone can renew for the holder
        names.renew{value: P5}("alice", 1);
        assertEq(names.resolve("alice"), alice);
    }

    function test_reRegisterAfterGraceWipesRecords() public {
        uint256 id = _reg(alice, "alice", 1);
        vm.startPrank(alice);
        names.setText("alice", "x", "@alice");
        names.setContenthash("alice", "ipfs://old");
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days + 30 days + 1);
        assertTrue(names.available("alice"));
        vm.prank(bob);
        vm.expectRevert(ArcNames.NotAvailable.selector);
        names.renew{value: P5}("alice", 1);
        _reg(bob, "alice", 1);
        assertEq(names.ownerOf(id), bob);
        assertEq(names.resolve("alice"), bob);
        assertEq(names.text("alice", "x"), "");
        assertEq(names.contenthash("alice"), "");
        assertEq(names.balanceOf(alice), 0);
    }

    // ---------------------------------------------------------------- records and primary name

    function test_recordsOnlyByHolder() public {
        _reg(alice, "alice", 1);
        vm.prank(bob);
        vm.expectRevert(ArcNames.NotAuthorized.selector);
        names.setAddr("alice", bob);
        vm.startPrank(alice);
        names.setAddr("alice", bob);
        names.setContenthash("alice", "ipfs://bafy");
        string[] memory k = new string[](2);
        string[] memory v = new string[](2);
        (k[0], v[0], k[1], v[1]) = ("avatar", "ipfs://img", "url", "https://x");
        names.setTexts("alice", k, v);
        vm.stopPrank();
        assertEq(names.resolve("alice"), bob);
        assertEq(names.contenthash("alice"), "ipfs://bafy");
        assertEq(names.text("alice", "url"), "https://x");
    }

    function test_primaryNameMustPointBack() public {
        _reg(alice, "alice", 1);
        vm.prank(bob);
        vm.expectRevert(ArcNames.NotResolved.selector);
        names.setPrimaryName("alice");
        vm.prank(alice);
        names.setPrimaryName("alice");
        assertEq(names.primaryName(alice), "alice");
        vm.prank(alice);
        names.setAddr("alice", bob); // no longer points back
        assertEq(names.primaryName(alice), "");
    }

    function test_transferRepointsAndBlocksWhenExpired() public {
        uint256 id = _reg(alice, "alice", 1);
        vm.prank(alice);
        names.transferFrom(alice, bob, id);
        assertEq(names.resolve("alice"), bob);
        vm.warp(block.timestamp + 366 days);
        vm.prank(bob);
        vm.expectRevert(ArcNames.Expired.selector);
        names.transferFrom(bob, alice, id);
    }

    // ---------------------------------------------------------------- fees and metadata

    function test_feesClaimOnlyByReceiver() public {
        _reg(alice, "abc", 2); // 100
        _reg(bob, "abcd", 1); // 20
        assertEq(names.pendingFees(), 120 ether);
        vm.prank(alice);
        vm.expectRevert(ArcNames.NotFeeReceiver.selector);
        names.claimFees();
        vm.prank(treasury);
        names.claimFees();
        assertEq(treasury.balance, 120 ether);
        assertEq(address(names).balance, 0);
    }

    function test_tokenURIIsOnChainJson() public {
        uint256 id = _reg(alice, "alice", 1);
        string memory uri = names.tokenURI(id);
        assertEq(bytes(uri).length > 100, true);
        assertEq(_startsWith(uri, "data:application/json;base64,"), true);
    }

    function testFuzz_registerAnyValidName(uint8 len, uint256 seed) public {
        len = uint8(bound(len, 3, 32));
        bytes memory b = new bytes(len);
        for (uint256 i; i < len; ++i) b[i] = bytes1(uint8(97 + uint8(uint256(keccak256(abi.encode(seed, i))) % 26)));
        string memory label = string(b);
        _reg(alice, label, 1);
        assertEq(names.resolve(label), alice);
    }

    function _startsWith(string memory s, string memory p) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory b = bytes(p);
        if (a.length < b.length) return false;
        for (uint256 i; i < b.length; ++i) if (a[i] != b[i]) return false;
        return true;
    }
}

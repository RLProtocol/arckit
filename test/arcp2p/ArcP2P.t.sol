// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ArcP2P} from "../../src/arcp2p/ArcP2P.sol";
import {ArcTwapOracle, IStateViewSlot0} from "../../src/arclend/ArcTwapOracle.sol";
import {FeeOnTransferERC20} from "../mocks/FeeOnTransferERC20.sol";

contract MockStateView is IStateViewSlot0 {
    mapping(PoolId => int24) public ticks;
    mapping(PoolId => bool) public live;

    function set(PoolId id, int24 tick) external {
        ticks[id] = tick;
        live[id] = true;
    }

    function getSlot0(PoolId id) external view returns (uint160 sqrtPriceX96, int24 tick, uint24, uint24) {
        if (!live[id]) return (0, 0, 0, 0);
        tick = ticks[id];
        sqrtPriceX96 = TickMath.getSqrtPriceAtTick(tick);
    }
}

contract Token is ERC20 {
    constructor() ERC20("Arc Token", "TOK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// A seller that refuses USDC, to exercise the queued-payout path.
contract GrumpySeller {
    receive() external payable {
        revert("no");
    }

    function approveAll(IERC20 t, address to) external {
        t.approve(to, type(uint256).max);
    }

    function list(ArcP2P p2p, IERC20 t, uint256 amount, ArcP2P.Pricing calldata pr, ArcP2P.Pool calldata pool, ArcP2P.Terms calldata terms)
        external
        returns (uint256)
    {
        return p2p.list(t, amount, pr, pool, terms);
    }

    function claim(ArcP2P p2p) external {
        p2p.claimPayout();
    }
}

contract ArcP2PTest is Test {
    MockStateView sv;
    ArcTwapOracle oracle;
    ArcP2P p2p;
    Token tok;
    PoolId pid = PoolId.wrap(keccak256("TOK/USDC"));
    address alice = makeAddr("alice"); // seller
    address bob = makeAddr("bob"); // buyer
    address carol = makeAddr("carol");
    address feeTo = makeAddr("feeTo");

    // USDC is currency0 with 6 decimals in the pool, token has 18: this tick is "1 token = 2 USDC" (see ArcLend tests)
    int24 constant TICK_2USDC = 269392;
    // ~10% cheaper token: higher tick = more token per USDC unit when USDC is currency0
    int24 constant TICK_1_8USDC = 269392 + 1054;
    // ~10% dearer token
    int24 constant TICK_2_2USDC = 269392 - 953;

    ArcP2P.Pool noPool;
    ArcP2P.Pool pool;
    ArcP2P.Terms open;

    function setUp() public {
        sv = new MockStateView();
        oracle = new ArcTwapOracle(sv);
        p2p = new ArcP2P(oracle, feeTo);
        tok = new Token();
        sv.set(pid, TICK_2USDC);
        pool = ArcP2P.Pool({poolId: pid, usdcIs0: true, poolUsdcDecimals: 6});
        tok.mint(alice, 1_000_000 ether);
        vm.prank(alice);
        tok.approve(address(p2p), type(uint256).max);
        vm.deal(bob, 100_000 ether);
        vm.deal(carol, 100_000 ether);
    }

    function _fixed(uint256 priceUsdc) internal pure returns (ArcP2P.Pricing memory) {
        return ArcP2P.Pricing({mode: ArcP2P.Mode.Fixed, fixedPrice: priceUsdc, spreadBps: 0, floorPrice: 0});
    }

    function _market(int32 spread, uint256 floorP) internal pure returns (ArcP2P.Pricing memory) {
        return ArcP2P.Pricing({mode: ArcP2P.Mode.Market, fixedPrice: 0, spreadBps: spread, floorPrice: floorP});
    }

    function _listFixed(uint256 amount, uint256 priceUsdc) internal returns (uint256 id) {
        vm.prank(alice);
        id = p2p.list(tok, amount, _fixed(priceUsdc), noPool, open);
    }

    /// Advance time, poking the oracle every 5 minutes at `tick`.
    function _ticks(int24 tick, uint256 duration) internal {
        sv.set(pid, tick);
        uint256 end = block.timestamp + duration;
        while (block.timestamp < end) {
            vm.warp(block.timestamp + 5 minutes);
            oracle.poke(pid);
        }
    }

    // ---------- fixed price ----------

    function test_list_escrowsTokens() public {
        uint256 id = _listFixed(1000 ether, 2 ether);
        assertEq(id, 0);
        assertEq(tok.balanceOf(address(p2p)), 1000 ether);
        ArcP2P.Listing memory l = p2p.getListing(id);
        assertEq(l.seller, alice);
        assertEq(l.remaining, 1000 ether);
        assertEq(l.tokenDecimals, 18);
        (uint256 cur, uint256 ref) = p2p.price(id);
        assertEq(cur, 2 ether);
        assertEq(ref, 0);
        assertEq(p2p.listingsOf(alice).length, 1);
        assertTrue(p2p.isActive(id));
    }

    function test_fill_full_paysSellerMinusFee() public {
        uint256 id = _listFixed(100 ether, 2 ether); // 200 USDC total
        uint256 aliceBefore = alice.balance;
        vm.prank(bob);
        uint256 cost = p2p.fill{value: 200 ether}(id, 100 ether);
        assertEq(cost, 200 ether);
        assertEq(tok.balanceOf(bob), 100 ether);
        uint256 fee = 200 ether * 50 / 10_000; // 0.5%
        assertEq(alice.balance - aliceBefore, 200 ether - fee);
        assertEq(p2p.accruedFees(), fee);
        assertFalse(p2p.isActive(id));
        ArcP2P.Listing memory l = p2p.getListing(id);
        assertEq(l.sold, 100 ether);
        assertEq(l.proceeds, 200 ether - fee);
    }

    function test_fill_partial_refundsExcess() public {
        uint256 id = _listFixed(100 ether, 2 ether);
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        p2p.fill{value: 50 ether}(id, 10 ether); // costs 20, sent 50
        assertEq(bobBefore - bob.balance, 20 ether);
        assertEq(tok.balanceOf(bob), 10 ether);
        assertEq(p2p.getListing(id).remaining, 90 ether);
        // someone else takes the rest
        vm.prank(carol);
        p2p.fill{value: 180 ether}(id, 90 ether);
        assertEq(tok.balanceOf(carol), 90 ether);
        assertEq(p2p.getListing(id).remaining, 0);
    }

    function test_fill_insufficientPayment_reverts() public {
        uint256 id = _listFixed(100 ether, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcP2P.InsufficientPayment.selector, 20 ether, 19 ether));
        p2p.fill{value: 19 ether}(id, 10 ether);
    }

    function test_fill_exceedsRemaining_reverts() public {
        uint256 id = _listFixed(100 ether, 2 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcP2P.ExceedsRemaining.selector, 100 ether));
        p2p.fill{value: 1000 ether}(id, 101 ether);
    }

    function test_minFill_enforced_exceptForRemainder() public {
        ArcP2P.Terms memory t = ArcP2P.Terms({minFill: 10 ether, expiry: 0, buyer: address(0)});
        vm.prank(alice);
        uint256 id = p2p.list(tok, 25 ether, _fixed(1 ether), noPool, t);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ArcP2P.BelowMinFill.selector, 10 ether));
        p2p.fill{value: 5 ether}(id, 5 ether);
        vm.prank(bob);
        p2p.fill{value: 20 ether}(id, 20 ether);
        // 5 left, below minFill, but the remainder is always allowed
        vm.prank(bob);
        p2p.fill{value: 5 ether}(id, 5 ether);
        assertEq(tok.balanceOf(bob), 25 ether);
    }

    function test_privateBuyer_andExpiry() public {
        ArcP2P.Terms memory t = ArcP2P.Terms({minFill: 0, expiry: uint40(block.timestamp + 1 days), buyer: bob});
        vm.prank(alice);
        uint256 id = p2p.list(tok, 10 ether, _fixed(1 ether), noPool, t);
        vm.prank(carol);
        vm.expectRevert(ArcP2P.NotAllowedBuyer.selector);
        p2p.fill{value: 1 ether}(id, 1 ether);
        vm.prank(bob);
        p2p.fill{value: 1 ether}(id, 1 ether);
        vm.warp(block.timestamp + 1 days + 1);
        assertFalse(p2p.isActive(id));
        vm.prank(bob);
        vm.expectRevert(ArcP2P.Expired.selector);
        p2p.fill{value: 1 ether}(id, 1 ether);
        // seller can still take the rest back
        vm.prank(alice);
        p2p.cancel(id);
        assertEq(tok.balanceOf(alice), 1_000_000 ether - 1 ether);
    }

    function test_cancel_update_topUp_onlySeller() public {
        uint256 id = _listFixed(10 ether, 1 ether);
        vm.prank(bob);
        vm.expectRevert(ArcP2P.NotSeller.selector);
        p2p.cancel(id);
        vm.prank(bob);
        vm.expectRevert(ArcP2P.NotSeller.selector);
        p2p.update(id, _fixed(2 ether), open);
        vm.prank(bob);
        vm.expectRevert(ArcP2P.NotSeller.selector);
        p2p.topUp(id, 1 ether);

        vm.startPrank(alice);
        p2p.update(id, _fixed(3 ether), open);
        (uint256 cur,) = p2p.price(id);
        assertEq(cur, 3 ether);
        p2p.topUp(id, 5 ether);
        assertEq(p2p.getListing(id).remaining, 15 ether);
        p2p.cancel(id);
        vm.stopPrank();
        assertEq(tok.balanceOf(alice), 1_000_000 ether);
        assertEq(p2p.getListing(id).remaining, 0);
        vm.prank(alice);
        vm.expectRevert(ArcP2P.NotActive.selector);
        p2p.cancel(id);
    }

    function test_fixed_sixDecimalToken_rounding() public {
        // a 6-decimal token priced at 0.3333 USDC: cost rounds up so the seller is never short-changed
        Token6 t6 = new Token6();
        t6.mint(alice, 1_000_000e6);
        vm.prank(alice);
        t6.approve(address(p2p), type(uint256).max);
        vm.prank(alice);
        uint256 id = p2p.list(t6, 1_000e6, _fixed(0.3333 ether), noPool, open);
        (uint256 cost,,) = p2p.quote(id, 1); // one base unit
        assertEq(cost, 333_300_000_000); // 0.3333e18 / 1e6, exact
        assertEq(p2p.amountFor(id, 333.3 ether), 1_000e6);
        vm.prank(bob);
        p2p.fill{value: 333.3 ether}(id, 1_000e6);
        assertEq(t6.balanceOf(bob), 1_000e6);
    }

    // ---------- market price ----------

    function test_market_requiresPoolAndValidSpread() public {
        vm.startPrank(alice);
        vm.expectRevert(ArcP2P.PoolRequired.selector);
        p2p.list(tok, 1 ether, _market(0, 0), noPool, open);
        ArcP2P.Pool memory bad = pool;
        bad.poolUsdcDecimals = 8;
        vm.expectRevert(ArcP2P.BadPoolDecimals.selector);
        p2p.list(tok, 1 ether, _market(0, 0), bad, open);
        vm.expectRevert(ArcP2P.BadSpread.selector);
        p2p.list(tok, 1 ether, _market(-9001, 0), pool, open);
        vm.expectRevert(ArcP2P.BadSpread.selector);
        p2p.list(tok, 1 ether, _market(10_001, 0), pool, open);
        // a pool the oracle cannot read
        ArcP2P.Pool memory ghost = ArcP2P.Pool({poolId: PoolId.wrap(keccak256("ghost")), usdcIs0: true, poolUsdcDecimals: 6});
        vm.expectRevert(ArcTwapOracle.PoolNotInitialized.selector);
        p2p.list(tok, 1 ether, _market(0, 0), ghost, open);
        vm.stopPrank();
    }

    function test_market_discountFollowsSpot_beforeTwapCoverage() public {
        vm.prank(alice);
        uint256 id = p2p.list(tok, 100 ether, _market(-500, 0), pool, open); // 5% below market
        uint256 spot = oracle.priceFromTick(TICK_2USDC, true, 18, 6);
        (uint256 cur, uint256 ref) = p2p.price(id);
        assertEq(ref, spot);
        assertEq(cur, spot * 9500 / 10_000);
        assertApproxEqRel(cur, 1.9 ether, 1e15);
        // market moves up 10%, the listing follows
        sv.set(pid, TICK_2_2USDC);
        (cur,) = p2p.price(id);
        assertApproxEqRel(cur, 2.2 ether * 9500 / 10_000, 2e15);
        (uint256 cost,, uint256 unit) = p2p.quote(id, 10 ether);
        assertEq(cost, unit * 10);
        vm.prank(bob);
        uint256 paid = p2p.fill{value: 25 ether}(id, 10 ether);
        assertEq(paid, cost);
        assertEq(tok.balanceOf(bob), 10 ether);
    }

    function test_market_premium() public {
        vm.prank(alice);
        uint256 id = p2p.list(tok, 100 ether, _market(1000, 0), pool, open); // 10% above
        (uint256 cur,) = p2p.price(id);
        assertApproxEqRel(cur, 2.2 ether, 1e15);
    }

    function test_market_floorPrice() public {
        vm.prank(alice);
        uint256 id = p2p.list(tok, 100 ether, _market(-2000, 1.9 ether), pool, open); // 20% off but never below 1.90
        (uint256 cur,) = p2p.price(id);
        assertEq(cur, 1.9 ether); // 1.6 would be below the floor
    }

    function test_market_flashDump_doesNotDiscountBelowTwap() public {
        vm.prank(alice);
        uint256 id = p2p.list(tok, 100 ether, _market(-500, 0), pool, open);
        _ticks(TICK_2USDC, 30 minutes); // TWAP established at 2 USDC
        // spot is pushed down 10% in one block: reference stays at the TWAP
        sv.set(pid, TICK_1_8USDC);
        (uint256 cur, uint256 ref) = p2p.price(id);
        assertApproxEqRel(ref, 2 ether, 2e15);
        assertApproxEqRel(cur, 1.9 ether, 2e15);
        // but a real move up is reflected immediately (max of the two)
        sv.set(pid, TICK_2_2USDC);
        (, ref) = p2p.price(id);
        assertApproxEqRel(ref, 2.2 ether, 2e15);
        // and a sustained move down is followed once the TWAP catches up
        _ticks(TICK_1_8USDC, 60 minutes);
        (, ref) = p2p.price(id);
        assertApproxEqRel(ref, 1.8 ether, 2e15);
    }

    function test_update_switchFixedToMarket_needsPool() public {
        uint256 id = _listFixed(10 ether, 1 ether);
        vm.prank(alice);
        vm.expectRevert(ArcP2P.PoolRequired.selector);
        p2p.update(id, _market(0, 0), open);
        // a market listing can switch to fixed and back
        vm.prank(alice);
        uint256 m = p2p.list(tok, 10 ether, _market(0, 0), pool, open);
        vm.startPrank(alice);
        p2p.update(m, _fixed(5 ether), open);
        (uint256 cur,) = p2p.price(m);
        assertEq(cur, 5 ether);
        p2p.update(m, _market(-100, 0), open);
        (cur,) = p2p.price(m);
        assertApproxEqRel(cur, 1.98 ether, 2e15);
        vm.stopPrank();
    }

    // ---------- edge cases ----------

    function test_feeOnTransferToken_listsReceivedAmount() public {
        FeeOnTransferERC20 tax = new FeeOnTransferERC20(100); // 1% burn
        tax.mint(alice, 1000 ether);
        vm.startPrank(alice);
        tax.approve(address(p2p), type(uint256).max);
        uint256 id = p2p.list(tax, 100 ether, _fixed(1 ether), noPool, open);
        vm.stopPrank();
        assertEq(p2p.getListing(id).remaining, 99 ether);
        vm.prank(bob);
        p2p.fill{value: 99 ether}(id, 99 ether);
        assertEq(tax.balanceOf(bob), 99 ether * 99 / 100);
    }

    function test_sellerThatRejectsUsdc_getsQueuedPayout() public {
        GrumpySeller g = new GrumpySeller();
        tok.mint(address(g), 10 ether);
        g.approveAll(tok, address(p2p));
        uint256 id = g.list(p2p, tok, 10 ether, _fixed(1 ether), noPool, open);
        vm.prank(bob);
        p2p.fill{value: 10 ether}(id, 10 ether); // does not revert
        uint256 owed = 10 ether - 10 ether * 50 / 10_000;
        assertEq(p2p.pendingPayouts(address(g)), owed);
        assertEq(tok.balanceOf(bob), 10 ether);
        // still cannot receive, so the claim reverts; funds stay owed (a seller would use a payable address)
        vm.expectRevert(ArcP2P.TransferFailed.selector);
        g.claim(p2p);
        assertEq(p2p.pendingPayouts(address(g)), owed);
    }

    function test_fees_capAndWithdraw() public {
        vm.expectRevert(ArcP2P.FeeTooHigh.selector);
        p2p.setFee(101, address(0));
        p2p.setFee(100, address(0));
        assertEq(p2p.feeBps(), 100);
        assertEq(p2p.feeReceiver(), feeTo);
        uint256 id = _listFixed(100 ether, 1 ether);
        vm.prank(bob);
        p2p.fill{value: 100 ether}(id, 100 ether);
        assertEq(p2p.accruedFees(), 1 ether);
        vm.prank(carol);
        vm.expectRevert();
        p2p.withdrawFees();
        vm.prank(feeTo);
        p2p.withdrawFees();
        assertEq(feeTo.balance, 1 ether);
        assertEq(p2p.accruedFees(), 0);
    }

    function test_paging() public {
        for (uint256 i = 0; i < 5; i++) _listFixed(1 ether, (i + 1) * 1 ether);
        assertEq(p2p.listingCount(), 5);
        ArcP2P.Listing[] memory page = p2p.getListings(3, 10);
        assertEq(page.length, 2);
        assertEq(page[0].pricing.fixedPrice, 4 ether);
        assertEq(p2p.getListings(5, 7).length, 0);
        vm.expectRevert(ArcP2P.ListingNotFound.selector);
        p2p.getListing(5);
    }

    function test_badInputs() public {
        vm.startPrank(alice);
        vm.expectRevert(ArcP2P.ZeroAmount.selector);
        p2p.list(tok, 0, _fixed(1 ether), noPool, open);
        vm.expectRevert(ArcP2P.BadPrice.selector);
        p2p.list(tok, 1 ether, _fixed(0), noPool, open);
        ArcP2P.Terms memory past = ArcP2P.Terms({minFill: 0, expiry: uint40(block.timestamp), buyer: address(0)});
        vm.expectRevert(ArcP2P.BadExpiry.selector);
        p2p.list(tok, 1 ether, _fixed(1 ether), noPool, past);
        vm.stopPrank();
    }

    function testFuzz_partialFills_conserveTokensAndUsdc(uint96 a, uint96 b, uint96 c) public {
        uint256 total = 1000 ether;
        uint256 id = _listFixed(total, 1.5 ether);
        uint256[3] memory parts = [uint256(a) % 400 ether + 1, uint256(b) % 400 ether + 1, uint256(c) % 400 ether + 1];
        uint256 bought;
        uint256 paid;
        for (uint256 i = 0; i < 3; i++) {
            uint256 amt = parts[i];
            uint256 rem = p2p.getListing(id).remaining;
            if (amt > rem) amt = rem;
            if (amt == 0) break;
            (uint256 cost,,) = p2p.quote(id, amt);
            uint256 before = bob.balance;
            vm.prank(bob);
            p2p.fill{value: cost + 1 ether}(id, amt);
            assertEq(before - bob.balance, cost);
            bought += amt;
            paid += cost;
        }
        assertEq(tok.balanceOf(bob), bought);
        assertEq(tok.balanceOf(address(p2p)), total - bought);
        ArcP2P.Listing memory l = p2p.getListing(id);
        assertEq(l.proceeds + p2p.accruedFees(), paid);
        assertEq(address(p2p).balance, p2p.accruedFees());
    }
}

contract Token6 is ERC20 {
    constructor() ERC20("Six", "SIX") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

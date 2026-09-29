// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ArcLend} from "../../src/arclend/ArcLend.sol";
import {ArcTwapOracle, IStateViewSlot0} from "../../src/arclend/ArcTwapOracle.sol";

/// A v4 StateView stand-in whose tick the test sets directly.
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

contract ArcLendTest is Test {
    MockStateView sv;
    ArcTwapOracle oracle;
    ArcLend lend;
    Token tok;
    PoolId pid = PoolId.wrap(keccak256("TOK/USDC"));
    address lender = makeAddr("lender");
    address bob = makeAddr("bob");
    address liq = makeAddr("liq");
    uint256 constant MARKET = 0;

    // USDC is currency0 (address 0x3600… < token) with 6 decimals in the pool; token is 18 decimals.
    // tick for "1 token = 2 USDC": price1per0 = token per usdc-unit; we solve for a tick and read the price back.
    // tick where 1 token = 2 USDC: token wei per 6-dec USDC unit = 1e18 / 2e6 = 5e11 -> ln(5e11)/ln(1.0001) ~ 269392
    int24 constant TICK_2USDC = 269392;

    ArcLend.RiskParams risk = ArcLend.RiskParams({
        ltvBps: 5000, liqThresholdBps: 6500, liqBonusBps: 800, reserveFactorBps: 1000,
        baseRateBps: 200, slope1Bps: 1000, slope2Bps: 5000, kinkBps: 8000, supplyCap: 10_000 ether, borrowCap: 0
    });

    uint256 price; // USDC wei per whole token at TICK_2USDC

    function setUp() public {
        sv = new MockStateView();
        oracle = new ArcTwapOracle(sv);
        lend = new ArcLend(oracle, address(this));
        tok = new Token();
        sv.set(pid, TICK_2USDC);
        lend.addMarket(tok, pid, true, 6, risk);
        price = oracle.priceFromTick(TICK_2USDC, true, 18, 6);
        assertGt(price, 0);
        // let the TWAP window fill with a stable price
        _ticks(TICK_2USDC, 40 minutes);
        vm.deal(lender, 100_000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(liq, 100_000 ether);
        tok.mint(bob, 1_000_000 ether);
        vm.prank(bob);
        tok.approve(address(lend), type(uint256).max);
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

    function _valueUsdc(uint256 tokens) internal view returns (uint256) {
        return tokens * price / 1e18;
    }

    // ---------- lenders ----------

    function test_supply_withdraw_roundTrip() public {
        vm.prank(lender);
        uint256 shares = lend.supply{value: 1000 ether}(MARKET);
        assertEq(shares, 1000 ether);
        assertEq(lend.supplyBalanceOf(MARKET, lender), 1000 ether);
        vm.prank(lender);
        uint256 got = lend.withdraw(MARKET, shares);
        assertEq(got, 1000 ether);
        assertEq(lender.balance, 100_000 ether);
    }

    function test_supplyCap() public {
        vm.prank(lender);
        vm.expectRevert(ArcLend.SupplyCapReached.selector);
        lend.supply{value: 10_001 ether}(MARKET);
    }

    // ---------- borrowers ----------

    function _fundAndCollateral() internal {
        vm.prank(lender);
        lend.supply{value: 5000 ether}(MARKET);
        vm.prank(bob);
        lend.depositCollateral(MARKET, 1000 ether); // worth ~2000 USDC
    }

    function test_borrow_withinLtv_andRepay() public {
        _fundAndCollateral();
        uint256 limit = _valueUsdc(1000 ether) * 5000 / 10_000;
        vm.prank(bob);
        lend.borrow(MARKET, limit - 1);
        assertApproxEqAbs(lend.debtOf(MARKET, bob), limit - 1, 1);
        assertEq(bob.balance, 1000 ether + limit - 1);
        // over the limit fails
        vm.prank(bob);
        vm.expectRevert(ArcLend.ExceedsBorrowLimit.selector);
        lend.borrow(MARKET, 10 ether);
        // interest accrues
        vm.warp(block.timestamp + 365 days);
        oracle.poke(pid);
        uint256 debt = lend.debtOf(MARKET, bob);
        assertGt(debt, limit);
        (uint256 apr,, uint256 util) = lend.rates(MARKET);
        assertGt(apr, 200);
        assertGt(util, 0);
        // repay everything with excess; excess comes back
        uint256 before = bob.balance;
        vm.prank(bob);
        uint256 repaid = lend.repay{value: debt + 5 ether}(MARKET, bob);
        assertEq(repaid, debt);
        assertEq(bob.balance, before - debt);
        assertEq(lend.debtOf(MARKET, bob), 0);
        // lenders earned the interest minus reserves
        uint256 supplyBal = lend.supplyBalanceOf(MARKET, lender);
        assertGt(supplyBal, 5000 ether);
        ArcLend.Market memory m = lend.getMarket(MARKET);
        assertGt(m.reserves, 0);
        assertApproxEqAbs(supplyBal + m.reserves, 5000 ether + (debt - (limit - 1)), 2);
        // collateral is free again
        vm.prank(bob);
        lend.withdrawCollateral(MARKET, 1000 ether);
        assertEq(tok.balanceOf(bob), 1_000_000 ether);
    }

    function test_withdrawCollateral_blockedWhileBorrowed() public {
        _fundAndCollateral();
        vm.prank(bob);
        lend.borrow(MARKET, _valueUsdc(1000 ether) * 4900 / 10_000);
        vm.prank(bob);
        vm.expectRevert(ArcLend.ExceedsBorrowLimit.selector);
        lend.withdrawCollateral(MARKET, 100 ether);
    }

    function test_borrow_needsLiquidity_andPauses() public {
        vm.prank(bob);
        lend.depositCollateral(MARKET, 1000 ether);
        vm.prank(bob);
        vm.expectRevert(ArcLend.InsufficientLiquidity.selector);
        lend.borrow(MARKET, 1 ether);
        vm.prank(lender);
        lend.supply{value: 100 ether}(MARKET);
        lend.setBorrowsPaused(MARKET, true);
        vm.prank(bob);
        vm.expectRevert(ArcLend.BorrowsArePaused.selector);
        lend.borrow(MARKET, 1 ether);
    }

    // ---------- oracle guards ----------

    function test_borrow_blockedOnSpotDeviation() public {
        _fundAndCollateral();
        // spot jumps 20% above the TWAP without time passing
        sv.set(pid, TICK_2USDC - 1823); // ~ +20% (lower tick = dearer token)
        vm.prank(bob);
        vm.expectRevert(ArcLend.PriceDeviation.selector);
        lend.borrow(MARKET, 1 ether);
    }

    function test_borrow_usesLowerOfTwapAndSpot() public {
        _fundAndCollateral();
        // spot 3% below TWAP: allowed, but the limit is computed at spot
        sv.set(pid, TICK_2USDC + 300);
        uint256 spotPrice = oracle.priceFromTick(TICK_2USDC + 300, true, 18, 6);
        uint256 limitAtSpot = 1000 ether * spotPrice / 1e18 * 5000 / 10_000;
        uint256 limitAtTwap = _valueUsdc(1000 ether) * 5000 / 10_000;
        vm.prank(bob);
        vm.expectRevert(ArcLend.ExceedsBorrowLimit.selector);
        lend.borrow(MARKET, limitAtTwap);
        vm.prank(bob);
        lend.borrow(MARKET, limitAtSpot - 1e12);
    }

    function test_oracleNotReady_onFreshMarket() public {
        Token t2 = new Token();
        PoolId p2 = PoolId.wrap(keccak256("T2/USDC"));
        sv.set(p2, TICK_2USDC);
        uint256 id = lend.addMarket(t2, p2, true, 6, risk);
        vm.prank(lender);
        lend.supply{value: 100 ether}(id);
        t2.mint(bob, 10 ether);
        vm.startPrank(bob);
        t2.approve(address(lend), type(uint256).max);
        lend.depositCollateral(id, 10 ether);
        vm.expectRevert(ArcLend.OracleNotReady.selector);
        lend.borrow(id, 1 ether);
        vm.stopPrank();
    }

    // ---------- liquidation ----------

    function test_liquidation_afterPriceDrop() public {
        _fundAndCollateral();
        uint256 borrowed = _valueUsdc(1000 ether) * 5000 / 10_000; // 50% LTV
        vm.prank(bob);
        lend.borrow(MARKET, borrowed);
        assertGt(lend.healthFactor(MARKET, bob), 1e18);
        // not liquidatable while healthy
        vm.prank(liq);
        vm.expectRevert(ArcLend.NotLiquidatable.selector);
        lend.liquidate{value: 100 ether}(MARKET, bob);
        // price falls 30% and stays there for the whole window: 50/(0.7) = 71% > 65% threshold
        _ticks(TICK_2USDC + 3567, 40 minutes); // ~ -30% (higher tick = cheaper token)
        assertLt(lend.healthFactor(MARKET, bob), 1e18);
        (uint256 twap,,) = lend.priceOf(MARKET);
        uint256 debt = lend.debtOf(MARKET, bob);
        uint256 liqBefore = liq.balance;
        vm.prank(liq);
        (uint256 repaid, uint256 seized) = lend.liquidate{value: 10_000 ether}(MARKET, bob);
        // capped at the close factor, excess returned
        assertApproxEqRel(repaid, debt / 2, 1e15);
        assertEq(liq.balance, liqBefore - repaid);
        // seized collateral is worth repaid * 1.08 at the TWAP
        assertApproxEqRel(seized * twap / 1e18, repaid * 10_800 / 10_000, 1e15);
        assertEq(tok.balanceOf(liq), seized);
        assertApproxEqAbs(lend.debtOf(MARKET, bob), debt - repaid, 1);
        assertGt(lend.healthFactor(MARKET, bob), 1e18); // healthy again after a half liquidation
    }

    function test_liquidation_capsAtCollateral() public {
        _fundAndCollateral();
        vm.prank(bob);
        lend.borrow(MARKET, _valueUsdc(1000 ether) * 5000 / 10_000);
        _ticks(TICK_2USDC + 9163, 40 minutes); // ~ -60%: collateral no longer covers the debt
        vm.prank(liq);
        (uint256 repaid, uint256 seized) = lend.liquidate{value: 10_000 ether}(MARKET, bob);
        assertEq(seized, 1000 ether);
        assertGt(repaid, 0);
        assertEq(lend.getAccount(MARKET, bob).collateral, 0);
    }

    // ---------- guardian: fast liquidation at spot ----------

    function test_guardian_liquidatesAtSpot_beforeTwapCatchesUp() public {
        _fundAndCollateral();
        vm.prank(bob);
        lend.borrow(MARKET, _valueUsdc(1000 ether) * 5000 / 10_000);
        lend.setGuardian(liq);
        // flash crash: spot -40% this second, TWAP still at the old price
        sv.set(pid, TICK_2USDC + 5108);
        (,,,, uint256 liqPrice, bool byPublic, bool byGuardian) = lend.liquidationState(MARKET, bob);
        assertGt(liqPrice, 0);
        assertFalse(byPublic, "TWAP has not moved yet");
        assertTrue(byGuardian, "spot says underwater");
        // the public cannot liquidate yet...
        vm.prank(liq);
        vm.expectRevert(ArcLend.NotLiquidatable.selector);
        lend.liquidate{value: 100 ether}(MARKET, bob);
        // ...a stranger cannot use the guardian path...
        vm.prank(lender);
        vm.expectRevert(ArcLend.NotGuardian.selector);
        lend.guardianLiquidate{value: 100 ether}(MARKET, bob);
        // ...but the guardian closes it at the spot price
        uint256 spotPrice = oracle.priceFromTick(TICK_2USDC + 5108, true, 18, 6);
        vm.prank(liq);
        (uint256 repaid, uint256 seized) = lend.guardianLiquidate{value: 10_000 ether}(MARKET, bob);
        assertGt(repaid, 0);
        assertApproxEqRel(seized * spotPrice / 1e18, repaid * 10_800 / 10_000, 1e15);
        assertEq(tok.balanceOf(liq), seized);
    }

    function test_guardian_cannotTouchHealthyPosition() public {
        _fundAndCollateral();
        vm.prank(bob);
        lend.borrow(MARKET, 100 ether);
        lend.setGuardian(liq);
        vm.prank(liq);
        vm.expectRevert(ArcLend.NotLiquidatable.selector);
        lend.guardianLiquidate{value: 50 ether}(MARKET, bob);
    }

    // ---------- admin ----------

    function test_riskCaps() public {
        ArcLend.RiskParams memory bad = risk;
        bad.ltvBps = 8500;
        vm.expectRevert(ArcLend.BadRiskParams.selector);
        lend.setRisk(MARKET, bad);
        bad = risk;
        bad.liqThresholdBps = 5200; // gap under 500
        vm.expectRevert(ArcLend.BadRiskParams.selector);
        lend.setRisk(MARKET, bad);
        vm.prank(bob);
        vm.expectRevert();
        lend.setRisk(MARKET, risk);
    }

    function test_reserves_withdrawOnlyEarnedInterest() public {
        _fundAndCollateral();
        vm.prank(bob);
        lend.borrow(MARKET, 500 ether);
        vm.warp(block.timestamp + 180 days);
        lend.poke(MARKET);
        ArcLend.Market memory m = lend.getMarket(MARKET);
        assertGt(m.reserves, 0);
        uint256 before = address(this).balance;
        lend.withdrawReserves(MARKET, type(uint256).max);
        assertEq(address(this).balance - before, m.reserves);
        vm.prank(bob);
        vm.expectRevert();
        lend.withdrawReserves(MARKET, 1);
    }

    receive() external payable {}
}

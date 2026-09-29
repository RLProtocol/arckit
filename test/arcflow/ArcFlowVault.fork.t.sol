// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Fork tests against live Arc state. Run with:
//   forge test --match-path test/arcflow/ArcFlowVault.fork.t.sol --fork-url $ARC_RPC_URL -vv
// They are skipped when no fork is active.

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ArcFlowVault} from "../../src/arcflow/ArcFlowVault.sol";

/// Arc's USDC (0x3600…0000) is a proxy that moves balances through a chain-specific precompile at
/// 0x1800…0000, which Foundry's EVM does not have. In the fork we etch a plain 6-decimal ERC20 over
/// it and mirror the PoolManager's real balance, so every Uniswap and vault code path stays genuine.
contract MockUSDC6 {
    string public constant name = "USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        return _move(msg.sender, to, a);
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) {
            require(al >= a, "allowance");
            allowance[f][msg.sender] = al - a;
        }
        return _move(f, to, a);
    }

    function _move(address f, address to, uint256 a) internal returns (bool) {
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// Minimal swapper so tests can generate trading fees in a pool.
contract TestSwapper is IUnlockCallback {
    IPoolManager immutable pm;

    constructor(IPoolManager _pm) {
        pm = _pm;
    }

    function swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) external returns (BalanceDelta d) {
        d = abi.decode(pm.unlock(abi.encode(msg.sender, key, zeroForOne, amountIn)), (BalanceDelta));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (address payer, PoolKey memory key, bool zeroForOne, uint256 amountIn) =
            abi.decode(data, (address, PoolKey, bool, uint256));
        BalanceDelta d = pm.swap(
            key,
            IPoolManager.SwapParams(
                zeroForOne, -int256(amountIn), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            ),
            ""
        );
        Currency cin = zeroForOne ? key.currency0 : key.currency1;
        Currency cout = zeroForOne ? key.currency1 : key.currency0;
        int128 din = zeroForOne ? d.amount0() : d.amount1();
        int128 dout = zeroForOne ? d.amount1() : d.amount0();
        pm.sync(cin);
        IERC20(Currency.unwrap(cin)).transferFrom(payer, address(pm), uint256(uint128(-din)));
        pm.settle();
        pm.take(cout, payer, uint256(uint128(dout)));
        return abi.encode(d);
    }
}

contract ArcFlowVaultForkTest is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    // ARCAT/USDC: hook-free, fee 2 %, tickSpacing 200, currency0 = ARCAT, currency1 = USDC
    address constant ARCAT = 0x07704B06981eA962b87296362a1281484d160000;
    // AKIT/USDC: launchpad hook (afterSwapReturnDelta, afterRemoveLiquidity), fee 1 %, tickSpacing 200
    address constant AKIT = 0xBc3764348131Fe1962f267f442a8Fe30459ededD;
    address constant AKIT_HOOK = 0xA0F72dE996d901c2C9D701a2A8ff0544fD5F2044;

    ArcFlowVault vault;
    TestSwapper swapper;
    PoolKey arcatKey;
    PoolKey akitKey;
    PoolId arcatId;
    PoolId akitId;

    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address trader = makeAddr("trader");

    bool forked;

    function setUp() public {
        forked = block.chainid == 5042;
        if (!forked) return;

        // Replace the precompile-backed USDC with a standard ERC20 and mirror the PoolManager's reserves.
        uint256 pmUsdc = USDC.balanceOf(address(PM));
        vm.etch(address(USDC), address(new MockUSDC6()).code);
        _setBal(address(PM), pmUsdc);

        vault = new ArcFlowVault(PM, USDC, treasury);
        swapper = new TestSwapper(PM);

        arcatKey = PoolKey(Currency.wrap(ARCAT), Currency.wrap(address(USDC)), 20000, 200, IHooks(address(0)));
        akitKey = PoolKey(Currency.wrap(address(USDC)), Currency.wrap(AKIT), 10000, 200, IHooks(AKIT_HOOK));
        arcatId = arcatKey.toId();
        akitId = akitKey.toId();

        // Fund test users with USDC. The PoolManager holds every pool's reserves, so borrow from it.
        _fund(alice, 5_000e6);
        _fund(bob, 5_000e6);
        _fund(trader, 20_000e6);
        for (uint256 i = 0; i < 3; i++) {
            address u = i == 0 ? alice : i == 1 ? bob : trader;
            vm.startPrank(u);
            USDC.approve(address(vault), type(uint256).max);
            USDC.approve(address(swapper), type(uint256).max);
            IERC20(ARCAT).approve(address(swapper), type(uint256).max);
            IERC20(AKIT).approve(address(swapper), type(uint256).max);
            IERC20(ARCAT).approve(address(vault), type(uint256).max);
            vm.stopPrank();
        }
    }

    /// balanceOf mapping is storage slot 1 in MockUSDC6 (after totalSupply at slot 0).
    function _setBal(address who, uint256 amount) internal {
        vm.store(address(USDC), keccak256(abi.encode(who, uint256(1))), bytes32(amount));
    }

    function _fund(address to, uint256 amount) internal {
        _setBal(to, amount);
    }

    modifier onlyFork() {
        if (!forked) {
            emit log("skipped: not forked (pass --fork-url)");
            return;
        }
        _;
    }

    // ---------- basic sanity ----------

    function test_fork_poolsExistOnChain() public onlyFork {
        (uint160 sp,,,) = PM.getSlot0(arcatId);
        assertGt(sp, 0, "ARCAT pool initialised");
        (uint160 sp2,,,) = PM.getSlot0(akitId);
        assertGt(sp2, 0, "AKIT pool initialised");
        assertGt(PM.getLiquidity(arcatId), 0);
    }

    // ---------- single-asset stake into a hook-free pool ----------

    function test_fork_stakeUsdc_hookFreePool() public onlyFork {
        uint128 preview = vault.previewStakeUsdc(arcatKey, 100e6);
        assertGt(preview, 0);

        uint256 usdcBefore = USDC.balanceOf(alice);
        vm.prank(alice);
        uint128 liq = vault.stakeUsdc(arcatKey, 100e6, 300, (preview * 90) / 100);

        assertGt(liq, 0);
        assertEq(vault.shares(arcatId, alice), liq, "shares == liquidity");
        uint128 totalShares = vault.poolInfo(arcatId).totalShares;
        assertEq(totalShares, liq);
        ArcFlowVault.Pool memory pi = vault.poolInfo(arcatId);
        (uint128 posLiq,,) = PM.getPositionInfo(arcatId, address(vault), pi.tickLower, pi.tickUpper, bytes32(0));
        assertEq(posLiq, liq, "vault's position liquidity equals minted shares");
        emit log_named_uint("preview liquidity", preview);
        emit log_named_uint("actual liquidity", liq);
        assertLe(usdcBefore - USDC.balanceOf(alice), 100e6, "spent at most the deposit (dust refunded)");
        assertEq(USDC.balanceOf(address(vault)), 0, "vault holds no idle USDC after stake");

        (uint128 s, uint256 a0, uint256 a1) = vault.positionOf(arcatId, alice);
        assertEq(s, liq);
        assertGt(a0, 0);
        assertGt(a1, 0);
        emit log_named_uint("liquidity minted", liq);
        emit log_named_uint("position ARCAT", a0);
        emit log_named_uint("position USDC", a1);
    }

    function test_fork_stakeUsdc_slippageGuard() public onlyFork {
        uint128 preview = vault.previewStakeUsdc(arcatKey, 1_000e6);
        vm.prank(alice);
        vm.expectRevert(); // minLiquidity above anything achievable
        vault.stakeUsdc(arcatKey, 1_000e6, 300, preview * 2);
    }

    // ---------- fees: swap volume -> harvest -> stream -> claim ----------

    function test_fork_feesStreamOverSevenDays() public onlyFork {
        vm.prank(alice);
        uint128 liqA = vault.stakeUsdc(arcatKey, 2_000e6, 300, 0);
        vm.prank(bob);
        uint128 liqB = vault.stakeUsdc(arcatKey, 1_000e6, 300, 0);

        // Generate fees: trader round-trips USDC -> ARCAT -> USDC several times.
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(trader);
            swapper.swap(arcatKey, false, 1_000e6); // USDC (currency1) -> ARCAT
            uint256 got = IERC20(ARCAT).balanceOf(trader);
            vm.prank(trader);
            swapper.swap(arcatKey, true, got); // ARCAT -> USDC
        }

        uint256 treasuryBefore = USDC.balanceOf(treasury);
        vault.harvest(arcatId);
        (uint256 rate, uint256 finish, uint256 remaining) = vault.streamInfo(arcatId);
        assertGt(rate, 0, "stream started");
        assertEq(finish, block.timestamp + 7 days);
        assertGt(USDC.balanceOf(treasury) - treasuryBefore, 0, "protocol cut paid");
        emit log_named_uint("USDC streaming to stakers over 7d", remaining);
        emit log_named_uint("protocol cut", USDC.balanceOf(treasury) - treasuryBefore);

        // Nothing claimable at t=0 of the stream.
        assertEq(vault.pendingRewards(arcatId, alice), 0);

        // Halfway: roughly half, split 2:1 by shares.
        vm.warp(block.timestamp + 3.5 days);
        uint256 pa = vault.pendingRewards(arcatId, alice);
        uint256 pb = vault.pendingRewards(arcatId, bob);
        assertApproxEqRel(pa + pb, remaining / 2, 0.001e18, "half streamed at half time");
        assertApproxEqRel(pa * uint256(liqB), pb * uint256(liqA), 0.001e18, "split pro-rata to shares");

        vm.prank(alice);
        uint256 claimed = vault.claim(arcatId);
        assertEq(claimed, pa);
        assertEq(vault.pendingRewards(arcatId, alice), 0);

        // End of stream: everything paid out, vault keeps nothing.
        vm.warp(block.timestamp + 4 days);
        vm.prank(alice);
        uint256 c2 = vault.claim(arcatId);
        vm.prank(bob);
        uint256 c3 = vault.claim(arcatId);
        assertApproxEqAbs(claimed + c2 + c3, remaining, 3, "all streamed rewards claimed (rounding dust only)");
        assertLe(USDC.balanceOf(address(vault)), 3, "vault holds only rounding dust");
    }

    // ---------- unstake ----------

    function test_fork_unstake_bothTokensAndToUsdc() public onlyFork {
        (uint160 sp0,,,) = PM.getSlot0(arcatId);
        emit log_named_uint("sqrtP before stake", sp0);
        emit log_named_uint("in-range liquidity before", PM.getLiquidity(arcatId));
        vm.prank(alice);
        uint128 liq = vault.stakeUsdc(arcatKey, 1_000e6, 300, 0);
        (uint160 sp1,,,) = PM.getSlot0(arcatId);
        emit log_named_uint("sqrtP after stake swap", sp1);
        emit log_named_uint("USDC spent on stake", 5_000e6 - USDC.balanceOf(alice));
        emit log_named_uint("ARCAT dust refunded to alice", IERC20(ARCAT).balanceOf(alice));
        {
            (, uint256 pa0, uint256 pa1) = vault.positionOf(arcatId, alice);
            emit log_named_uint("position ARCAT", pa0);
            emit log_named_uint("position USDC", pa1);
        }

        // Half out as both tokens
        uint256 u0 = USDC.balanceOf(alice);
        uint256 t0 = IERC20(ARCAT).balanceOf(alice);
        vm.prank(alice);
        (uint256 out0, uint256 out1) = vault.unstake(arcatId, liq / 2, false, 0, 0, 0);
        assertGt(out0, 0, "ARCAT out");
        assertGt(out1, 0, "USDC out");
        assertEq(IERC20(ARCAT).balanceOf(alice) - t0, out0);
        assertEq(USDC.balanceOf(alice) - u0, out1);
        assertEq(vault.shares(arcatId, alice), liq - liq / 2);

        // Rest out as USDC only
        uint128 rest = vault.shares(arcatId, alice);
        u0 = USDC.balanceOf(alice);
        t0 = IERC20(ARCAT).balanceOf(alice);
        vm.prank(alice);
        (uint256 o0, uint256 o1) = vault.unstake(arcatId, rest, true, 300, 0, 0);
        assertEq(o0, 0, "no ARCAT when toUsdc");
        assertGt(o1, 0);
        assertEq(IERC20(ARCAT).balanceOf(alice), t0, "no ARCAT received");
        assertEq(USDC.balanceOf(alice) - u0, o1);
        assertEq(vault.shares(arcatId, alice), 0);
        uint128 totalShares = vault.poolInfo(arcatId).totalShares;
        assertEq(totalShares, 0);

        // Round trip cost. The first half-unstake paid Alice in ARCAT; convert that to USDC too so the
        // comparison is apples to apples. Expected loss: 2 % pool fee on each of the swaps plus impact.
        uint256 leftoverArcat = IERC20(ARCAT).balanceOf(alice);
        if (leftoverArcat > 0) {
            vm.prank(alice);
            swapper.swap(arcatKey, true, leftoverArcat);
        }
        uint256 recovered = USDC.balanceOf(alice) - (5_000e6 - 1_000e6);
        emit log_named_uint("USDC recovered of 1000e6 (all tokens converted)", recovered);
        assertGt(recovered, 900e6, "lost less than 10 % to fees/slippage on a full round trip");

        vm.prank(alice);
        vm.expectRevert(ArcFlowVault.InsufficientShares.selector);
        vault.unstake(arcatId, 1, false, 0, 0, 0);
    }

    // ---------- pair stake ----------

    function test_fork_stakePair() public onlyFork {
        // get some ARCAT first
        vm.prank(alice);
        swapper.swap(arcatKey, false, 500e6);
        uint256 arcat = IERC20(ARCAT).balanceOf(alice);
        assertGt(arcat, 0);

        vm.prank(alice);
        uint128 liq = vault.stakePair(arcatKey, arcat, 500e6, 0);
        assertGt(liq, 0);
        assertEq(vault.shares(arcatId, alice), liq);
        assertEq(IERC20(ARCAT).balanceOf(address(vault)), 0, "no idle ARCAT in vault");
        assertEq(USDC.balanceOf(address(vault)), 0, "no idle USDC in vault");
    }

    // ---------- hooked pool (your AKIT launchpad pool) ----------

    function test_fork_stakeIntoHookedAkitPool() public onlyFork {
        uint128 preview = vault.previewStakeUsdc(akitKey, 200e6);
        vm.prank(alice);
        uint128 liq = vault.stakeUsdc(akitKey, 200e6, 500, (preview * 80) / 100);
        assertGt(liq, 0, "hooked pool accepted our liquidity");
        uint128 ts = vault.poolInfo(akitId).totalShares;
        assertEq(ts, liq);

        // trade to create fees, harvest, ensure the afterRemoveLiquidity hook does not break burns
        vm.prank(trader);
        swapper.swap(akitKey, true, 300e6); // USDC (currency0) -> AKIT
        vault.harvest(akitId);
        (uint256 rate,,) = vault.streamInfo(akitId);
        assertGt(rate, 0, "fees streamed from hooked pool");

        vm.prank(alice);
        (uint256 o0, uint256 o1) = vault.unstake(akitId, liq, false, 0, 0, 0);
        assertGt(o0 + o1, 0);
        assertEq(vault.shares(akitId, alice), 0);
    }

    // ---------- compound & guards ----------

    function test_fork_compoundAndGuards() public onlyFork {
        vm.prank(alice);
        uint128 liq = vault.stakeUsdc(arcatKey, 1_000e6, 300, 0);
        vm.prank(trader);
        swapper.swap(arcatKey, false, 2_000e6);
        vault.harvest(arcatId);
        vm.warp(block.timestamp + 7 days);
        uint256 pending = vault.pendingRewards(arcatId, alice);
        assertGt(pending, 0);

        vm.prank(alice);
        uint128 more = vault.compound(arcatId, 300, 0);
        assertGt(more, 0);
        assertEq(vault.shares(arcatId, alice), liq + more);
        assertEq(vault.pendingRewards(arcatId, alice), 0);

        vm.prank(alice);
        vm.expectRevert(ArcFlowVault.NothingToClaim.selector);
        vault.claim(arcatId);

        // Pool without USDC is rejected
        PoolKey memory bad = PoolKey(Currency.wrap(ARCAT), Currency.wrap(AKIT), 3000, 60, IHooks(address(0)));
        vm.prank(alice);
        vm.expectRevert(ArcFlowVault.PoolMustContainUsdc.selector);
        vault.stakeUsdc(bad, 1e6, 100, 0);

        // Admin
        vm.prank(alice);
        vm.expectRevert();
        vault.setProtocolFeeBps(500);
        vm.expectRevert(ArcFlowVault.FeeTooHigh.selector);
        vault.setProtocolFeeBps(2_001);
        vault.setProtocolFeeBps(500);
        assertEq(vault.protocolFeeBps(), 500);
    }

    // ---------- fuzz: any stake amount round-trips without leaving funds in the vault ----------

    function testFuzz_fork_stakeUnstakeLeavesNoIdleFunds(uint256 amount) public onlyFork {
        amount = bound(amount, 5e6, 3_000e6);
        vm.prank(alice);
        uint128 liq = vault.stakeUsdc(arcatKey, amount, 500, 0);
        vm.prank(alice);
        vault.unstake(arcatId, liq, false, 0, 0, 0);
        assertEq(vault.shares(arcatId, alice), 0);
        assertEq(USDC.balanceOf(address(vault)), 0);
        assertEq(IERC20(ARCAT).balanceOf(address(vault)), 0);
    }
}

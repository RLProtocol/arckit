# ArcFlow — Build Spec (original, restored)

> Restored copy of the original build spec. The user-facing documentation now
> lives in `ARCFLOW.md` (which on Windows is the same file as `arcflow.md`).

A self-custodial concentrated-liquidity + fee-staking protocol for Arc chain (Circle's EVM chain). Two products: **Pools** (self-directed shaped LP positions) and **Stakes** (deposit-and-earn, auto-managed LP with streamed fee rewards).

Stack: Solidity ^0.8.24, Foundry, OpenZeppelin, Next.js + wagmi/viem frontend. Same toolchain as ArcKit.

---

## 1. Architecture Overview

```
arcflow/
├── contracts/
│   ├── core/                  # forked/adapted AMM core
│   │   ├── ArcFlowFactory.sol
│   │   ├── ArcFlowPool.sol
│   │   └── libraries/         # tick math, bin math, fee math
│   ├── periphery/
│   │   ├── PositionManager.sol   # mints LP positions as NFTs to user wallets
│   │   └── SwapRouter.sol
│   ├── stakes/
│   │   ├── StakeVault.sol        # deposit, auto-pair, track shares
│   │   └── FeeStreamer.sol       # 7-day linear fee streaming per staker
│   ├── governance/
│   │   └── FeeSwitch.sol         # protocol's 1% cut, configurable
│   └── interfaces/
├── script/                    # Foundry deploy scripts
├── test/                      # Foundry tests (unit + fuzz + invariant)
└── frontend/
    ├── app/pools/
    ├── app/stakes/
    └── lib/                   # wagmi hooks, contract ABIs
```

Two layers:
- **AMM core** — concentrated liquidity engine (tick/bin-based), where LP positions live and swap fees accrue.
- **Stakes layer** — sits on top of the AMM core, takes user deposits, auto-manages a position on their behalf, and streams their share of accrued fees over time instead of paying instantly.

---

## 2. AMM Core (Pools)

Don't write concentrated liquidity math from scratch — build on Uniswap v4 core and adapt for Arc deployment.

**Recommended approach:**
- Base: Uniswap v4-core (singleton `PoolManager` + hooks architecture, BSL-1.1 licensed — check current license status before mainnet use).
- v4 uses one singleton `PoolManager` contract holding all pools (gas-efficient vs v3's per-pool contracts), plus a hooks system that lets you plug custom logic into pool lifecycle events (`beforeSwap`, `afterSwap`, `beforeAddLiquidity`, `afterAddLiquidity`, etc.) — this is what makes the Stakes auto-fee-streaming logic much cleaner to build than bolting it on top of v3.
- Deploy Arc's `PoolManager` instance, then `ArcFlowHook.sol` (custom hook contract) and `PositionManager`-equivalent (`ArcFlowPositionManager.sol`, ERC-6909 or NFT-based position tracking) on Arc.
- Use an **`afterSwap` hook** to capture fee accrual events and forward them directly into `FeeStreamer.sol` in the same transaction, instead of requiring a separate harvest/collect call — this is the key advantage of v4 for this use case.
- Support three position "shapes" at the UI/periphery level (the core contract itself just handles ticks — shape is a frontend/periphery convenience that maps a shape choice to a specific set of tick ranges and liquidity distribution):
  - **Spot** — single tight tick range around current price.
  - **Curve** — liquidity spread across a wider range, bell-curve weighted toward current price.
  - **Bid-ask** — liquidity concentrated at the range edges, thin in the middle (for range-bound/volatility plays).

**Key contract: `ArcFlowHook.sol`** (v4 hook, attached to pools at initialization)
```solidity
contract ArcFlowHook is BaseHook {
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,   // enforce shape params on mint
            afterAddLiquidity: true,    // register position with StakeVault if staked
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true, // settle any pending streamed fees
            beforeSwap: false,
            afterSwap: true,            // capture fee accrual, forward to FeeStreamer
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            beforeAddLiquidityReturnDelta: false,
            afterAddLiquidityReturnDelta: false
        });
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        // compute fee accrued this swap for in-range positions, forward to FeeStreamer
        feeStreamer.registerAccrual(key.toId(), delta);
        return (BaseHook.afterSwap.selector, 0);
    }
}
```

**Key contract: `ArcFlowPositionManager.sol`**
- Calls `PoolManager.modifyLiquidity()` under the hood; mints each LP position as an ERC-721 (or ERC-6909 for gas-efficient multi-position holding) directly to the depositor's wallet (matches Delta's "minted in a single transaction directly to the user's own wallet" model).
- `mintPosition(shape, poolKey, amount, priceRangeParams) → tokenId`
- Shape (spot/curve/bid-ask) is resolved client-side/periphery-side into the actual `tickLower`/`tickUpper` (and, for curve/bid-ask, multiple range legs minted as a batch) before calling `modifyLiquidity`.

---

## 3. Stakes Layer

**Key contract: `StakeVault.sol`**

```solidity
interface IStakeVault {
    function stake(address pool, uint256 amount0, uint256 amount1) external returns (uint256 stakeId);
    function unstake(uint256 stakeId) external;
    function claim(uint256 stakeId) external returns (uint256 rewardAmount);
    function compound(uint256 stakeId) external;
    function pendingRewards(uint256 stakeId) external view returns (uint256);
}
```

Responsibilities:
1. Accept single-asset OR dual-asset deposits.
2. If single-asset: auto-swap/pair the correct ratio and open an LP position via `PositionManager` on the user's behalf (vault holds the NFT position, user holds a claim/share token or internal accounting entry).
3. Track each staker's proportional share of the pool's accrued fees.
4. Route claimed fees through `FeeStreamer.sol`.

**Key contract: `FeeStreamer.sol`**
- When fees are harvested from a position, don't pay out instantly — start a linear stream.
- Simplest implementation: Sablier-style linear vesting stream, or a custom minimal streaming contract:

```solidity
struct Stream {
    uint256 totalAmount;
    uint256 startTime;
    uint256 duration; // 7 days
    uint256 claimed;
}

function _startStream(address staker, uint256 amount) internal {
    streams[staker].push(Stream({
        totalAmount: amount,
        startTime: block.timestamp,
        duration: 7 days,
        claimed: 0
    }));
}

function claimable(Stream memory s) internal view returns (uint256) {
    if (block.timestamp >= s.startTime + s.duration) return s.totalAmount - s.claimed;
    uint256 elapsed = block.timestamp - s.startTime;
    return (s.totalAmount * elapsed / s.duration) - s.claimed;
}
```

Payout asset: WETH-equivalent on Arc (wrapped native or USDC, decide based on what pairs dominate Arc volume).

---

## 4. Protocol Fee Switch

`FeeSwitch.sol` — simple, configurable cut (target: 1% of collected stake fees, matching Delta's model) routed to a treasury or ArcFlow-holder distribution contract (you could reuse the ArcKit pattern: 80% of fees to holders weekly).

```solidity
uint256 public protocolFeeBps = 100; // 1%
function _applyProtocolFee(uint256 grossFee) internal returns (uint256 netFee) {
    uint256 cut = grossFee * protocolFeeBps / 10_000;
    treasury.receiveFee(cut);
    return grossFee - cut;
}
```

---

## 5. Security Priorities

- **Reentrancy** on `claim`, `unstake`, `swap` — use `nonReentrant` (OpenZeppelin) everywhere value moves.
- **Tick math / rounding** — the single most exploited area in concentrated-liquidity forks. Use battle-tested libraries (Uniswap's `TickMath.sol`, `FullMath.sol`) verbatim, don't rewrite.
- **Hook trust boundary** — since v4 hooks run inside the `PoolManager`'s call flow, a bug in `ArcFlowHook` can be exploited on every swap/liquidity action across every pool using it. Treat the hook contract as the highest-scrutiny piece of the whole system.
- **Reentrancy via hook callbacks** — v4's unlock/callback pattern means external calls can re-enter mid-operation; follow checks-effects-interactions strictly inside `_afterSwap`/`_afterAddLiquidity` and don't trust `delta` values without validating against `PoolManager` state.
- **Oracle manipulation** — if any price reads are used for auto-pairing ratios in `StakeVault`, use TWAP from the pool itself, never spot price, to resist flash-loan manipulation.
- **This is mainnet from day one — no testnet buffer.** Get a full audit before deployment, non-negotiable (Delta itself got a Sherlock audit, and v4 hooks are a newer, less battle-tested pattern than v3, which raises the bar further). Consider a bug bounty live in parallel with a capped TVL ramp-up (deposit caps for the first weeks) rather than opening flood gates immediately.
- Fuzz + invariant test the AMM core, the hook, and the streaming math exhaustively in Foundry before any mainnet deploy.

---

## 6. Deployment — Arc Mainnet (Foundry, matches your ArcKit setup)

```
script/
├── DeployPoolManager.s.sol      # or point at an existing canonical PoolManager on Arc if one exists
├── DeployArcFlowHook.s.sol
├── DeployPositionManager.s.sol
├── DeployStakeVault.s.sol
├── DeployFeeStreamer.s.sol
└── DeployFeeSwitch.s.sol
```

```bash
forge script script/DeployPoolManager.s.sol --rpc-url $ARC_MAINNET_RPC_URL --broadcast --verify
```

**v4-specific deployment notes:**
- Check first whether Arc already has a canonical `PoolManager` singleton deployed (common on chains with existing v4 activity) — if so, deploy against that instead of your own, since pools/liquidity fragment across separate `PoolManager` instances otherwise.
- Hook contract addresses in v4 are mined/salted so their address bits encode which permissions they have (`CREATE2` with a specific salt) — use Uniswap's `HookMiner` utility in your deploy script to find a valid salt before deploying `ArcFlowHook`.
- Deploy sequence: (canonical or own) PoolManager → mine + deploy ArcFlowHook → PositionManager → StakeVault → FeeStreamer → FeeSwitch → wire addresses together → verify on Arc's block explorer.
- Since this goes straight to mainnet, run the full deploy script against an Arc mainnet fork locally first (`forge script ... --fork-url $ARC_MAINNET_RPC_URL`) and rehearse the entire flow (init pool → mint position → swap → accrue fee → stream → claim) before broadcasting for real.

---

## 7. Frontend

- Next.js + wagmi/viem (same as your other Arc tools).
- **Pools page**: shape selector (spot/curve/bid-ask), price range slider, token pair picker, mint button.
- **Stakes page**: pool list with APR/fee-rate display, deposit modal (single or dual asset), claim/compound/withdraw buttons, streaming-reward progress bar.
- **Position dashboard**: PnL cards, per-position performance chart, claim history.



## Open Questions to Resolve Before Building

- Which asset streams as the reward token (wrapped native ARC vs USDC)?
- Will ArcFlow reuse the ArcKit holder-fee-distribution contract, or run its own treasury?
- Uniswap v3 core vs v4 (hooks) — v4 is more flexible but newer/less battle-tested; v3 is the safer bet for a first version.

---

## What was actually built (2026-09-16)

Arc already had Uniswap's official v4 deployment, so the AMM-core and Pools
phases were skipped in favour of the Stakes layer on top of the existing
PoolManager: `src/arcflow/ArcFlowVault.sol` (vault + streamer + fee switch in
one contract, full-range positions, USDC rewards). See `ARCFLOW.md`.

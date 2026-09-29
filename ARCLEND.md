# ArcLend

Isolated USDC money markets on Arc. One market per collateral token; lenders supply native USDC and earn
interest, borrowers post the token and borrow USDC up to the market's loan-to-value. Prices come from a
self-hosted Uniswap v4 TWAP oracle because Arc has no price feeds.

| Contract | Address (Arc, chain 5042) |
|---|---|
| ArcLend | [`0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793`](https://arc.etherscan.io/address/0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793#code) |
| ArcTwapOracle | [`0xedf33dA5bED98b5BAbDa4D71F55962CF74462491`](https://arc.etherscan.io/address/0xedf33dA5bED98b5BAbDa4D71F55962CF74462491#code) |
| v4 StateView (read-only, Uniswap) | `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b` |

Source: [`src/arclend/`](src/arclend/) · tests: [`test/arclend/`](test/arclend/) · frontend: [`frontend/src/pages/Lend.tsx`](frontend/src/pages/Lend.tsx), [`frontend/src/hooks/useArcLend.ts`](frontend/src/hooks/useArcLend.ts) · keeper: [`api/_lib/lend/guard.js`](api/_lib/lend/guard.js), [`keeper/liquidator.mjs`](keeper/liquidator.mjs).

## Design

### Markets
Each market is a struct holding its own `cash` (USDC), `totalBorrows`, `reserves`, `totalCollateral`, borrow index
and risk parameters. Nothing is shared between markets, so a collateral token going to zero can only hurt the
lenders of that one market.

### Lenders
`supply(id)` is payable in native USDC and mints shares: `shares = amount × totalShares ÷ underlying`, where
`underlying = cash + totalBorrows − reserves`. `withdraw(id, shares)` redeems against idle cash. Interest accrues
into `underlying`, so each share is worth more over time. A reserve factor (10 %) of every interest accrual is set
aside for the protocol and can be withdrawn by the fee receiver; it never touches lender or borrower balances.

### Borrowers
`depositCollateral` (records what actually arrived, so fee-on-transfer tokens cannot inflate collateral),
`borrow`, `repay` (payable, excess returned), `withdrawCollateral`. Debt is stored as principal scaled by a
per-market borrow index (Compound-style), so it grows without per-account writes.

Interest: kinked utilisation curve, accrued per second, compounding at every interaction.
`rate = base + slope1 × u/kink` below the kink, `base + slope1 + slope2 × (u−kink)/(1−kink)` above.

### Pricing
`ArcTwapOracle` keeps a 256-slot ring buffer of `(timestamp, tick)` observations per pool. Anyone can `poke`.
`twapTick(pool, window)` is the time-weighted average over the window; `prices()` returns TWAP and spot in USDC
wei per whole token, taking the pool's currency ordering and the USDC decimals *as the pool sees them* into account
(some Arc pools quote the 6-decimal USDC ERC-20 view, others the 18-decimal native coin — this must be set per
market and checked against a reference price before listing).

- **Borrowing / withdrawing collateral** requires ≥ 20 minutes of TWAP coverage, spot within 5 % of the TWAP, and
  values collateral at the *lower* of TWAP and spot.
- **Public liquidation** values collateral at the TWAP, so a single manipulated block cannot liquidate a healthy
  position.
- **Guardian liquidation** (`guardianLiquidate`, one owner-set address) values collateral at the lower of TWAP and
  spot, so a token that collapses in minutes is closed out before the average catches up. Same threshold, same
  bonus, cannot touch a healthy position.

### Liquidation
When `debt > collateralValue × liqThreshold`, a liquidator repays up to the close factor (50 %) of the debt and
receives collateral worth `repaid × (1 + bonus)`. Once collateral is worth less than the debt the whole position
may be closed. Any shortfall is bad debt borne by that market's lenders only. `liquidationState(id, user)` gives
bots everything they need in one call.

### Guardian bot
`api/_lib/lend/guard.js` discovers borrowers from `Borrowed` events, reads `liquidationState` for each every
10 seconds and calls `guardianLiquidate` when `byGuardian` is true, spending the guardian wallet's USDC (the
contract refunds any excess). It runs as a Vercel cron (`api/lend-guard.js`, one-minute schedule looping inside the
invocation) and as a standalone process (`keeper/liquidator.mjs`). `api/lend-poke.js` refreshes oracle observations
every 10 minutes so the TWAP is always covered.

### Owner powers and hard caps
Add markets; set risk within `LTV ≤ 80 %`, `liqThreshold ≤ 90 %` and `≥ LTV + 5 %`, `bonus ≤ 20 %`,
`reserve ≤ 30 %`; set supply/borrow caps; pause *new* borrows; set the guardian; withdraw reserves. The owner cannot
touch supplied USDC, collateral or anyone's debt, and there is no upgrade path.

## Launch configuration (2026-09-29)

| Parameter | Value |
|---|---|
| Markets | AKIT, ARCMAN, ARCOON, AF, ASTOCK (deepest Uniswap v4 USDC pools on Arc + AKIT) |
| LTV / liquidation threshold / bonus | 50 % / 65 % / 8 % |
| Interest | 2 % base, +10 % to the 80 % kink, +50 % beyond |
| Reserve factor | 10 % |
| Caps (week one) | 100 USDC supply, 10 USDC borrow, per market |
| Oracle | 30-minute TWAP, 20-minute minimum coverage, 5 % spot-deviation guard |

## Running the tests

```sh
forge test --match-path "test/arclend/ArcLend.t.sol"                       # unit tests with a mock StateView
forge test --match-path test/arclend/ArcLend.fork.t.sol --fork-url $ARC_RPC_URL -vv   # live-pool oracle sanity
```

## Deploying

`script/DeployArcLend.s.sol` documents the launch set, but `forge script` cannot re-derive ArcLend's constructor
arguments when broadcasting (a Foundry limitation with contract-typed constructor parameters). Deploy with
`forge create` and list markets with `cast send addMarket(...)`; see `deployments/arc-5042.json` for the exact
values used.

## Known limitations

- A single-block rug (price −90 % in one transaction) cannot be liquidated in time by anyone; the buffer between LTV
  and liquidation threshold and the small caps bound that loss.
- The guardian can only close what its wallet's USDC can repay, and holds seized tokens until they are sold.
- Public Arc RPCs prune logs and cap `eth_getLogs` at 100k blocks; the bot scans from the deployment block in
  chunks.

# ArcFlow

> **ArcFlow v2 is live (2026-09-19).** Concentrated stakes, shaped positions, a Uniswap v4 liquidity lock and a
> volatility fee hook were added alongside the original full-range vault. See [ArcFlow v2](#arcflow-v2) at the end
> of this document. Everything below still describes the v1 full-range vault, which keeps running unchanged.


ArcFlow is the deposit-and-earn product inside Arc Kit. A user deposits USDC
into any Uniswap v4 pool on Arc, the ArcFlow vault turns it into a liquidity
position, and the swap fees that position earns are paid back to stakers as a
continuous seven-day stream of USDC. Withdraw any time, in USDC.

It is live on Arc mainnet in **beta**: https://arc-tools.vercel.app/flow

| | |
|---|---|
| Vault contract | `0x439608bFAC5D2B9EcD803649a1b15A9d56900990` |
| Chain | Arc, chain id 5042 |
| Built on | Uniswap v4 PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951` (Uniswap's official Arc deployment) |
| Reward asset | USDC (`0x3600000000000000000000000000000000000000`, 6 decimals) |
| Protocol fee | 1% of harvested swap fees. No deposit, withdrawal or performance fee on principal |
| Stream length | 7 days |
| Owner powers | change protocol fee (capped at 20%) and treasury address. Nothing else |
| Status | Beta. Unaudited. Full-range positions only |

---

## 1. The idea in one paragraph

Providing liquidity on a DEX earns trading fees but is fiddly: you need both
tokens in the right ratio, you have to collect fees yourself, and fee income
arrives in two tokens in uneven lumps. ArcFlow does all of that for you. You
deposit only USDC. The vault swaps half into the pool's other token, opens one
liquidity position on Uniswap v4 that covers the whole price range, and holds it
on your behalf. Whenever anyone triggers a harvest, the fees the position has
earned are collected, converted to USDC, and released to every staker in that
pool gradually over the following seven days, in proportion to their share.

---

## 2. Why it is built on Uniswap v4 instead of its own AMM

Arc already runs Uniswap's first-party v4 deployment, and nearly every token on
Arc trades there, including AKIT. Deploying another AMM would split liquidity
and give traders a worse price everywhere. So ArcFlow is a layer on top of the
existing PoolManager: it never holds pools, prices or swap logic of its own. It
calls the same functions Uniswap's own position manager calls.

Uniswap's own interface already covers creating pools and managing individual
LP positions, so ArcFlow does not duplicate that. Its job is the part that did
not exist on Arc: pooled, auto-managed positions with fees converted to USDC
and streamed.

---

## 3. How a stake works, step by step

1. **You pick a pool.** The Flow page lists active USDC pools on Arc from
   DexScreener with price, 24-hour change, liquidity, volume, and the pool's
   fee tier read from the chain. Search by token name or paste a token address.
2. **You approve and deposit USDC.** The vault pulls the USDC from your wallet.
3. **Half is swapped in the same pool.** The vault sells half of your USDC for
   the pool's other token inside that very pool. You set a maximum slippage
   (0.5%, 1%, 3% or 5%). If the price would move more than that, the swap
   fills only partially and the unused USDC is refunded, never lost.
4. **One full-range position is minted.** Using the USDC that is left and the
   tokens just bought, the vault adds liquidity to its single position for
   that pool, spanning the entire price range. Whatever tiny amount does not
   fit the exact ratio is refunded to you as dust.
5. **You receive shares.** Your shares are exactly the liquidity units you
   added. There is no share price to compute, no oracle, and nothing to
   manipulate: one share is one unit of Uniswap liquidity.
6. **A minimum protects you.** Before sending, the page previews how many
   liquidity units you should get and sets a floor slightly below it. If the
   transaction would mint less, it reverts.

Depositing both tokens directly is also supported by the contract
(`stakePair`); the interface offers the USDC-only path because it is the one
most people want.

---

## 4. How fees become streamed rewards

- **Fees accrue inside Uniswap.** Every trade in the pool pays the pool's fee
  tier (for example 1% or 2%) to liquidity providers in proportion to their
  liquidity. The vault's position earns its share automatically, but Uniswap
  only pays it out when the position is touched.
- **Harvest.** Any stake, unstake or a public `harvest` call touches the
  position and realises the fees, which arrive as some USDC and some of the
  other token. The other token is immediately swapped to USDC in the same pool.
- **Protocol cut.** 1% of the harvested USDC goes to the treasury. The remaining
  99% is the reward.
- **The stream.** The reward is not paid out at once. It sets a per-second
  reward rate that runs for seven days from the harvest. If another harvest
  happens before the seven days are up, the unfinished remainder is folded into
  a fresh seven-day stream together with the new fees. This is the
  Synthetix "StakingRewards" model, in production across DeFi since 2019.
- **Your share.** At every second the stream is divided among all shares in
  the pool. Your claimable balance grows continuously. Claim whenever you like;
  the stream keeps running. If someone stakes after a harvest, they share only
  in the seconds after they joined. If you unstake, you stop earning from that
  moment but keep whatever you had already earned.
- **Nobody home.** If a stream is running while the pool has zero stakers, the
  unclaimed portion is parked and rolled into the next stream instead of being
  lost.

**Claim, compound, harvest** are all buttons on the page. Compound claims your
USDC and stakes it straight back into the same pool in one transaction.

---

## 5. How unstaking works

Choose 25%, 50%, 75% or all of your shares. The vault removes that much
liquidity from the position and gives you back the two underlying tokens. Tick
"Receive USDC only" and the vault swaps the token side back to USDC in the
same pool, at your slippage limit, so you leave the way you came in.

Unstaking does not automatically claim streamed rewards; claim those
separately, before or after.

**What a round trip costs.** Because half of your deposit is swapped in and
later swapped out, you pay the pool's swap fee on that half twice, plus any
price impact. In a 2% pool a 1,000 USDC round trip with no fees earned came
back as 980 USDC in testing. Pools with a 1% tier cost half that. Fee income
has to exceed this for a stake to be profitable, which is why ArcFlow suits
pools with real volume and why the page shows 24-hour volume next to
liquidity.

---

## 6. Hooks, and what the warning means

Uniswap v4 lets a pool attach a "hook": extra code that runs before or after
swaps and liquidity changes. On Arc most pools created by launchpads have one.
The page reads each hook's permission bits from its address and explains them
in plain language, for example:

- *It can take an extra cut on every trade on top of the pool fee.* That lowers
  the fees left for stakers.
- *It can adjust token amounts when liquidity is added or removed.* What you
  get back may differ slightly from the raw pool math.
- *It can decide who may add liquidity, or when it may be removed.* A hostile
  hook could refuse the vault or delay unstaking for that pool.

Two protections are built in. The vault never trusts a hook's numbers: it
settles only the amounts the PoolManager actually reports. And **every pool's
accounting is isolated**: shares, rewards and the position are all per pool,
so the worst a bad hook can do is affect the stakers who chose that pool.
Hook-free pools carry a "no hook" badge.

Your AKIT/USDC pool has a launchpad hook that takes a cut on swaps and
observes liquidity removals; it allows adding liquidity, and the vault has been
tested against it.

---

## 7. What the vault deliberately cannot do

- **No custody games.** Tokens sit inside Uniswap's PoolManager as a position,
  not in the vault. The vault only holds USDC rewards waiting to be claimed and
  passing balances during a transaction.
- **No owner access to funds.** The owner can change the protocol fee (never
  above 20%) and the treasury address. There is no pause, no upgrade, no
  withdrawal of user positions, no rescue function.
- **No rebalancing, no managers.** Positions are full range, so there is
  nothing for anyone to adjust and no strategy that can be wrong. The trade-off
  is lower fee capture than a tightly concentrated position would earn.
- **No native-coin pools.** Arc's gas coin is USDC, and a few pools quote in it
  directly. ArcFlow supports only pools that use the USDC token contract, which
  is where the volume is.
- **No support for rebasing or fee-on-transfer tokens** in the paired asset.

---

## 8. The page, screen by screen

**Pool list.** Searchable list of active v4 USDC pools with token logo, price,
24-hour change, liquidity, volume, fee tier, and a hook badge. A "Your stakes"
box appears above it once you hold shares anywhere.

**Pool panel.** Header with the token logo and fee tier. The plain-language hook
note if applicable. A "Show price chart" button that opens DexScreener's live
chart for that exact pool in place. A stats line: price, 24h change, FDV,
24h trades, and a link to DexScreener. Facts read from chain: the token
address, how much the vault holds in this pool, lifetime fees harvested, and
whether a stream is running right now with its USDC-per-day rate and end time.

**Stake tab.** USDC amount with 25/50/75/Max quick picks, slippage presets, the
expected and minimum liquidity, the estimated swap fee on the converted half,
and a two-step approve-then-stake button.

**Your position tab.** Your position valued in USDC plus tokens, claimable USDC
ticking up, stream time remaining, Claim, Compound and Harvest buttons, and the
unstake controls with the USDC-only toggle.

Everything except the stake and manage controls is visible without a wallet,
so anyone can research a pool first. Actions require a wallet on Arc; the site
offers to add and switch to Arc automatically.

---

## 9. Contract reference

`src/arcflow/ArcFlowVault.sol`, Solidity 0.8.26, OpenZeppelin v5 for
Ownable2Step, ReentrancyGuard and SafeERC20, Uniswap v4-core and v4-periphery
libraries for pool types and math.

User functions

| Function | What it does |
|---|---|
| `stakeUsdc(key, usdcAmount, slippageBps, minLiquidity)` | USDC-only deposit, returns liquidity units minted |
| `stakePair(key, amount0, amount1, minLiquidity)` | deposit both tokens, dust refunded |
| `unstake(id, shares, toUsdc, slippageBps, minOut0, minOut1)` | remove liquidity, optionally convert to USDC |
| `claim(id)` | withdraw streamed USDC |
| `compound(id, slippageBps, minLiquidity)` | claim and restake in one call |
| `harvest(id)` | realise and stream the position's fees; anyone may call |

Views

| Function | Returns |
|---|---|
| `poolInfo(id)` | key, range, total shares, stream rate and end, lifetime fees |
| `shares(id, user)` / `positionOf(id, user)` | your units and their current value in both tokens |
| `pendingRewards(id, user)` | USDC claimable this second |
| `streamInfo(id)` | rate per second, end time, USDC still to be streamed |
| `previewStakeUsdc(key, usdc)` | expected liquidity for a USDC-only stake at the current price |
| `poolIdFor(key)`, `poolCount()`, `poolList(i)` | pool discovery |

Admin: `setProtocolFeeBps` (max 2000), `setTreasury`. Two-step ownership.

Internals worth knowing: all pool interaction happens inside the PoolManager's
`unlock` callback, and the callback is guarded so only the vault's own calls
can drive it and only the PoolManager can invoke it. Every external entry point
is non-reentrant. Swaps use exact-input with a price limit derived from the
caller's slippage, so a partial fill can never strand input tokens.

---

## 10. How it was verified

**Fork tests on live Arc state** (`test/arcflow/ArcFlowVault.fork.t.sol`,
run with `--fork-url`): nine tests, all passing, covering a hook-free pool and
the hooked AKIT pool, single and pair deposits, the full seven-day stream with
two stakers splitting pro-rata, claim and compound, unstake as tokens and as
USDC, a slippage guard, admin gating, and a 512-run fuzz proving stake then
unstake never leaves funds idle in the vault.

One Arc quirk had to be handled: Arc's USDC token is a proxy that moves
balances through a chain-specific precompile, which Foundry's EVM lacks, so the
fork tests substitute a plain ERC20 at the same address and mirror the
PoolManager's real balance. Every Uniswap and vault code path stays genuine.

**Live smoke test on the production contract:** 2 USDC staked into ARCAT/USDC
from the deployer, position confirmed, harvested, unstaked to USDC, 1.92 USDC
returned, shares zero, vault empty.

**Not yet exercised:** clicking through approve, stake, claim and unstake with a
real browser wallet on the page. The buttons are type-checked against the
contract ABI; the contracts they call are proven.

---

## 11. Known limitations and roadmap

- Full-range positions capture fewer fees than concentrated ones. Shaped
  positions (spot, curve, bid-ask) are the natural next step and are listed as
  coming soon.
- Pool discovery relies on DexScreener's public API. Pasting a token address
  works even if search does not.
- Harvest is manual (anyone can press it). A keeper that harvests busy pools on
  a schedule would make streams smoother.
- APR is not displayed yet because it needs a history of harvests to be honest;
  lifetime fees and the current stream rate are shown instead.
- An external audit is recommended before large deposits. The contract is
  small and built from battle-tested pieces, but it holds live liquidity.

---

## 12. Files

```
src/arcflow/ArcFlowVault.sol            the contract
test/arcflow/ArcFlowVault.fork.t.sol    fork tests against live Arc
script/DeployArcFlow.s.sol              deploy script
deployments/arc-5042.json               address, tx, block; also Uniswap v4 addresses on Arc
deployments/ArcFlowVault.abi.json       ABI
verification/ArcFlowVault.*             flattened source and Standard JSON for explorer verification
frontend/src/pages/Flow.tsx             the page
frontend/src/hooks/useArcFlow.ts        DexScreener discovery, pool key resolution, vault reads
frontend/src/components/CountdownBanner.tsx   temporary launch countdown on /flow
arcflow-spec.md                         the original build spec (ARCFLOW.md and arcflow.md are the same file on Windows)
```


---

# ArcFlow v2

Three new contracts on Arc's official Uniswap v4 deployment. v1 is untouched and still selectable in the app as
"Stake · full range".

| Contract | Address | What it is |
|---|---|---|
| ArcFlowVaultV2 | `0xC30D55758d12ac9FD80459b002085E8528f38748` | Stakes: deposit USDC into a band around the price, earn streamed fees |
| ArcFlowPositions | `0x16c40157fF4b49b3328Db3AE352E9eA699b8f759` | Pools: your own shaped position (spot, curve, bid-ask) plus a liquidity lock |
| ArcFlowFeeHook | `0x4FC207E35226df90c57DBc3CAcD60E6974c05080` | Volatility-aware swap fee for new pools |

Deployed 2026-09-19, blocks 21710957 to 21710966, solc 0.8.26, evm cancun, optimizer 200 runs. Owner and treasury of
the vault and positions contract: `0x23d128F066820DCa6E8809f947766b45d3C6aE35`. The hook has no owner. Status: beta,
unaudited.

## A note on "built on hooks"

A Uniswap v4 hook is fixed when a pool is created. It cannot be added to a pool that already exists, and most tokens
on Arc already trade in a pool with their launchpad's hook. So v2 is split the honest way:

- Stakes and Pools work on **any existing pool**, with or without someone else's hook, because they are contracts
  that talk to the PoolManager directly. This is where the volume is.
- The ArcFlow hook is for **new pools** that choose it at creation.

## Stakes v2: a band instead of the whole curve

v1 spreads liquidity over every possible price, so most of it never trades. v2 keeps it in a band around the price.

| Width | Band | Trade-off |
|---|---|---|
| Tight | about ±10% (1000 ticks each side) | most fees per dollar, leaves the band soonest |
| Medium | about ±25% (2200 ticks) | balance |
| Wide | about ±49% (4000 ticks) | fewest fees per dollar, rarely needs a rebalance |

A strategy is (pool, width), created by its first staker. In the fork tests the tight band earned **3.3 times** the
fees of the wide band on the same dollars and the same trades.

**Staking.** Deposit USDC. The vault works out what share of the band's value sits in the other token at the current
price, swaps that share inside the same pool, then runs a second, much smaller corrective swap, because the first
swap itself moves the price and with it the ratio the band needs. Both swaps share one absolute price limit taken
before the first, so your slippage setting bounds the whole operation. In testing on a thin live pool this took the
unused-token refund from about 10% of a deposit down to dust, and a 100 USDC round trip returned 97.9 (the pool's own
2% fee on the swapped half, twice, is nearly all of the cost).

If the pool is too thin for your deposit at your price limit, the swap stops at the limit, the part that fits is
staked, and the rest comes back in the same transaction. Nothing is left in the contract.

**Shares.** The first staker's shares equal the liquidity they add. After that, shares are minted by value at spot,
counting both the band's liquidity and any idle balance, so a newcomer pays for everything they get a claim on.

**Fees, with no separate harvest needed.** In Uniswap v4 any change to a position hands over its accrued fees. So every
stake, unstake and compound harvests as a side effect: the non-USDC side is swapped to USDC, 1% goes to the treasury
and the rest streams to stakers over seven days, exactly as in v1. `harvest()` still exists and pays its caller
0.5% of what it collects, so quiet pools keep flowing without anyone running a bot. Harvests arriving within an hour
of the last one are parked and ride along with the next, which stops tiny, frequent harvests from stretching the
stream. One consequence worth knowing: fees realised by a newcomer's stake start streaming at that moment to everyone
including the newcomer, so the only fees exposed to that dilution are the ones accrued since the last interaction.

**APR** is real, not projected: the running stream's rate, annualised, over the strategy's USDC value at spot.

**When the price leaves the band** the position earns nothing until it is recentred. Anyone can do that, in two steps:

1. `poke`: only accepted while the price is outside the band. Records the tick and the time.
2. `rebalance`: accepted from 10 minutes after the poke until 2 hours after, only if the price is still outside the
   band and within 300 ticks (about 3%) of where it was poked, and at most once an hour.

Someone who pushes the price out of range for a block cannot trigger a rebalance at that price: they would have to
hold it there for ten minutes against arbitrage. A rebalance removes the liquidity, recentres the band on the current
price, swaps toward the new ratio and mints again. It never moves the pool price by more than **1%**. In a thin pool
that can mean a partial fill: the remainder waits as an idle balance, owned pro-rata by holders and included in
withdrawals, and `deployIdle` works it back in, 1% at a time, at most every ten minutes. Shares never change in a
rebalance.

**Beta safety.** A per-strategy cap (25,000 USDC of net deposits) and a withdraw-only switch. The owner can change
the protocol fee (max 20%), the bounty (max 5%), the cap and that switch. Unstake and claim can never be paused, and
there is no upgrade or rescue path.

## Pools: shaped positions you hold yourself

A position is a set of weighted price ranges minted together and managed as one.

| Shape | Layout | Good for |
|---|---|---|
| Spot | one even range around the price | simple, efficient |
| Curve | up to four nested ranges, so liquidity is densest at the price | a price that stays put |
| Bid-ask | a thin band at the price, then bands that get heavier toward the edges | swings between two levels |
| Custom | any ranges and weights the caller supplies (max 12) | integrators |

Choose a shape and a range (±5%, ±10%, ±25% or ±50%), deposit USDC, and the contract does the same two-pass swap and
fills every range in one transaction, refunding whatever does not fit. The app draws where the liquidity will sit
before you sign. Each position uses its own salt in the PoolManager, so Uniswap itself tracks its fees separately from
everyone else's: the fork tests confirm one owner collecting leaves another's fees untouched.

- `collect`: swap fees from every range, paid in both tokens, less 1% to the treasury.
- `decrease(bps)`: remove part or all, as both tokens or as USDC only. 100% closes the position.
- `transferPosition`: hand it, and any lock on it, to another address.

Positions are never pooled with anyone else's. The contract holds nothing between transactions.

## Locking Uniswap v4 liquidity

ArcLock locks ERC-20 tokens, but liquidity on Arc is Uniswap v4 positions, which are not tokens. A position opened
through ArcFlow can be locked: `lock(positionId, until)` costs 10 USDC once and makes `decrease` revert until the
date, for everyone including the owner. Fees stay collectable, the lock can be extended for free but never
shortened, and it follows the position if it is transferred. Maximum ten years.

Every position has a public page at `/flow/position/<id>` that reads live from the chain, which is the proof to
share, and `/flow/locks` lists every locked position.

## The fee hook, for new pools

A pool created with `ArcFlowFeeHook` and the dynamic-fee flag charges a swap fee that follows volatility: 0.30% when
calm, plus 0.001% for every tick (0.01% of price) the price has moved from a reference that re-anchors every ten
minutes, capped at 3%. In the fork test a sharp buy lifted the next swap's fee from 0.30% to 1.30%, and it returned
to 0.30% once the window passed. Liquidity providers, including ArcFlow stakers and position holders in that pool,
are paid more exactly when they carry more risk.

The hook holds no funds, takes no cut, has no owner, and has only two permissions (after initialise, before swap), so
it cannot block trades or liquidity. Its address ends in `…5080`, whose low 14 bits encode exactly those
permissions; the CREATE2 salt was mined for it (7218).

Swap-time streaming to stakers, which was in the original plan for the hook, was dropped. Since every vault action
already harvests, it would have added a second fee on traders for no real gain.

## Testing

- **17 fork tests** against live Arc state (`test/arcflow/ArcFlowV2.fork.t.sol`), all passing: shape layouts,
  USDC-only entry for every shape with nothing left in the contract, partial fill and refund in a thin pool, fee
  isolation per position, collect with the protocol cut, round trips, custom-range validation, a hooked pool (AKIT),
  lock rules (wrong fee, blocked withdrawal, fees still collectable, extend, transfer, expiry, fee claim), vault
  shares and band, tight versus wide, bounty / cut / stream / APR / parked harvest, auto-harvest on stake, compound
  and exit, the full poke and rebalance sequence with every guard, drift and expiry refusal, cap and pause never
  blocking exits, and the hook's fee rising and resetting.
- The v1 suite (9 fork tests) and the other 69 unit tests still pass: **95 tests** in total.
- **Live on Arc with real USDC**: a Curve position opened with 1 USDC, fees collected, closed to USDC; 1 USDC staked
  into the tight band, harvested, an in-range poke correctly refused, fully unstaked. Both contracts held zero tokens
  afterwards.
- Not yet exercised with a browser wallet, and no pool has been created with the hook on mainnet yet.
- No audit. These contracts hold live liquidity: keep deposits modest until one is done.

## Files

```
src/arcflow/v2/ArcFlowBase.sol        shared: guarded unlock, settlement, two-pass swap, range maths
src/arcflow/v2/ArcFlowVaultV2.sol     Stakes v2
src/arcflow/v2/ArcFlowPositions.sol   Pools + liquidity lock
src/arcflow/v2/ArcFlowFeeHook.sol     volatility fee hook
script/DeployArcFlowV2.s.sol          deploys all three and mines the hook salt
test/arcflow/ArcFlowV2.fork.t.sol     fork tests
frontend/src/components/flow/         StakeV2Panel, ShapePanel (with the liquidity chart and position card)
frontend/src/pages/FlowPosition.tsx   public position page and the locked-liquidity list
frontend/src/hooks/useArcFlowV2.ts    reads, widths, shapes, tick-to-price helpers
```

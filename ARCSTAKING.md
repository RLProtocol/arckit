# Arc Staking

Time-boxed staking pools for any ERC-20 on Arc (chain id 5042). A project
opens a pool by choosing how long it runs and depositing the rewards. The
contract streams those rewards to stakers every second, in proportion to what
each one has staked. Nobody has to compute an APR: it follows from the two
numbers the creator chose and the amount currently staked.

| | |
|---|---|
| Contract | `ArcStaking` at `0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46` |
| Deploy tx | `0xdc66b439e3bf85b8b35f10205d13f91ab726e7e1b4a5a62720797b3e2e799a06`, block 21278823, 2026-09-17 |
| Owner / fee receiver | `0x23d128F066820DCa6E8809f947766b45d3C6aE35` |
| Create fee | 10 USDC (paid as `msg.value`, Arc's gas coin is USDC) |
| Compiler | solc 0.8.26, evm cancun, optimizer 200 runs |
| Source | `src/ArcStaking.sol`; ABI in `deployments/ArcStaking.abi.json` |
| Frontend | `/stake` on the Arc Kit site |
| Test copy (0.1 USDC fee) | `0xe961a279cbc5f46a5a8f051392eb6e1c5bf016b8` |

---

## 1. The model in one paragraph

A pool has a **stake token**, a **reward token** (the same token or a
different one), a **start**, a **duration** and a **reward reserve** deposited
by the creator. The reward rate is `reserve / duration`, paid out per second
from start to finish. At any moment the stream is split among current stakers
pro-rata to their stake, so each staker's APR is
`rate × 365 days / totalStaked`. Fewer stakers means a higher APR for each of
them; time with nobody staked pays nobody and can be reclaimed by the creator
after the pool ends. Optionally the creator sets an **early-exit penalty**: a
percentage of any amount withdrawn before the end date.

---

## 2. For projects: opening a pool

### What you choose

| Setting | Options | Notes |
|---|---|---|
| Stake token | any ERC-20 on Arc | fee-on-transfer tokens work; the amount actually received is what gets credited |
| Reward token | same as the stake token, or another ERC-20 | same-token pools show an APR and allow compounding; two-token pools show each staker's share of the daily payout instead |
| Duration | presets 3, 7, 14, 30, 60, 90 days; custom | contract limits: 1 hour to 4 years |
| Rewards to deposit | any amount above zero | pulled from your wallet when the pool is created and streamed over the duration |
| Early-exit penalty | off, or 0.01% to 50%; the app defaults to 10% | applies to withdrawals before the end date only |
| Start | now, or a set time in the future | rewards do not accrue before the start |
| Limits (optional) | minimum stake, maximum per wallet, total cap | all default to none |
| Name | up to 48 characters | shown in the pool list |

### Projected APR

Before you create the pool, the app shows the APR that would result for any
"expected total staked" you type in:

```
APR = rewards / duration × 365 days / expectedTotalStaked
```

Example: 3 000 TOKEN over 30 days with 10 000 TOKEN staked is 30% per 30
days, which annualises to 365%. The live figure on the pool page updates as
stakes come and go.

### Where the penalty goes

- **Same-token pool**: the penalty is added to the reward reserve and streamed
  over the remaining time to the stakers who stay. Leaving early rewards
  everyone else.
- **Two-token pool**: the penalty is transferred to the creator in the staked
  token at the moment of withdrawal.
- After `periodFinish` no penalty is ever charged, whatever the setting.

### After creation

| Action | Who | Effect |
|---|---|---|
| `addRewards(poolId, amount)` | anyone | adds to the reserve; the rate rises for the time that is left; the end date does not move. Not possible after the end (use extend). |
| `extendPool(poolId, extraDuration, extraRewards)` | creator | pushes the end later by `extraDuration` (from the current end, or from now if already ended) and optionally adds rewards. Every reward not yet owed to stakers is re-spread evenly over the new window. |
| `setPaused(poolId, bool)` | creator | blocks new stakes and compounding. Claims and withdrawals are never blocked. |
| `reclaimUndistributed(poolId)` | creator | after the end only: returns `reserve − (accrued − claimed)`, which is exactly the rewards that streamed while nobody was staked. Stakers' earned rewards stay in the contract until they claim. |

What a creator can **never** do: withdraw stakers' deposits, take back rewards
that have already been earned, change the penalty, or shorten the pool.

---

## 3. For stakers

| Action | Effect |
|---|---|
| `stake(poolId, amount)` | approve the stake token first. Rewards start accruing in the same block. Respects the pool's start, pause state, minimum, per-wallet maximum and total cap. |
| `claim(poolId)` | transfers everything earned so far in the reward token. |
| `compound(poolId)` | same-token pools only: claims and stakes the rewards in one transaction. |
| `unstake(poolId, amount)` | withdraws part or all of the stake. Earned rewards remain claimable. If a penalty applies, `amount × penaltyBps / 10 000` is deducted and the rest is sent to you. |
| `exit(poolId)` | unstake everything and claim, in one transaction. The same penalty rule applies. |

The app shows, before you sign: your APR after staking, the estimated
earnings by the end if nothing changes, the exact penalty on a withdrawal and
the time at which it stops applying.

Rewards are yours from the second you stake to the second you leave. Joining
late never earns for time before you joined; leaving early never forfeits what
you already earned (only the penalty on the principal applies, if configured).

---

## 4. How the accounting works

The contract uses the Synthetix `StakingRewards` pattern, extended for many
pools in one contract:

- `rewardRate` is scaled by `1e18` and equals `reserve × 1e18 / duration`.
- `rewardPerTokenStored` accumulates `rate × elapsed / totalStaked` on every
  interaction, but only for time within `[startTime, periodFinish]` and only
  while `totalStaked > 0`.
- A user's `earned` is `staked × (rewardPerToken − rewardPerTokenPaid) / 1e18`
  plus anything already accrued but unclaimed.
- `accruedTotal` and `claimedTotal` track, per pool, everything ever earned
  and everything ever paid. `reserve − (accrued − claimed)` is therefore the
  part of the reserve that no staker has a claim on, which is what `extendPool`
  re-streams and `reclaimUndistributed` returns.
- Penalties in same-token pools go through `_notify`, the same routine
  `addRewards` uses: the remaining stream plus the new amount is spread evenly
  over the time left.
- All token movements use balance deltas (`balanceAfter − balanceBefore`), so
  tokens that take a fee on transfer are credited at the amount that actually
  arrived.

Rounding: the rate is floored, so a pool pays out at most what was deposited;
the dust left behind (a few wei) stays in the contract's reserve and is
reclaimable by the creator after the end.

---

## 5. Views for integrators

| Function | Returns |
|---|---|
| `poolInfo(id)` | full `Pool` struct: config, creator, paused, `periodFinish`, `rewardRate`, `totalStaked`, `rewardReserve`, `accruedTotal`, `claimedTotal`, `totalRewardsAdded`, `stakers` |
| `users(id, who)` | `staked`, `rewardPerTokenPaid`, `rewards`, `firstStakeAt` |
| `earned(id, who)` | claimable reward right now |
| `rewardsRemaining(id)` | rewards still to be streamed between now and the end |
| `currentAprBps(id)` | APR in basis points for same-token pools at the current `totalStaked`; 0 when empty or ended |
| `aprBpsFor(id, hypotheticalStaked)` | APR if the pool held that amount |
| `penaltyFor(id, amount)` | penalty that would be charged on withdrawing `amount` now |
| `getPoolsByCreator(who)`, `getPoolsByStakeToken(token)`, `getPoolsForUser(who)` | pool id lists |
| `nextPoolId()` | one more than the highest pool id; ids start at 1 |
| `createFee()`, `pendingFees()`, `feeReceiver()`, `MAX_PENALTY_BPS()`, `YEAR()` | admin and constants |

Events: `PoolCreated`, `RewardsAdded`, `PoolExtended`, `PoolPausedSet`,
`UndistributedReclaimed`, `Staked`, `Unstaked(poolId, user, amountReceived, penalty)`,
`Claimed`, `FeeUpdated`, `FeeReceiverUpdated`, `FeesClaimed`.

Custom errors, with the text the app shows: `WrongFee`, `ZeroAddress`,
`ZeroAmount`, `BadConfig` (duration, penalty, start, limits or name out of
range), `NotCreator`, `PoolNotFound`, `PoolPaused`, `NotStarted`, `Ended`,
`NotEnded`, `BelowMinStake`, `AboveMaxStake`, `PoolFull`, `InsufficientStake`,
`NothingToClaim`, `NothingReceived`, `RewardTokenMismatch`,
`NothingToReclaim`, `NoFeesToClaim`, `FeeTransferFailed`, `NotFeeReceiver`.

---

## 6. Fees and administration

- Creating a pool costs `createFee`, currently 10 USDC, sent as `msg.value`
  and required to match exactly. Staking, claiming, unstaking, adding rewards
  and extending are free apart from gas.
- Fees accumulate as `pendingFees` and are withdrawn with `claimFees()` by the
  fee receiver or the owner.
- The owner (two-step `Ownable2Step`) can only change `createFee` and
  `feeReceiver`. There is no pause switch for the contract, no upgrade path
  and no way for the owner to move any pool's tokens.

---

## 7. Frontend (`/stake`)

- **Pool list** with search by name, symbol or address and filters All, Live,
  My stakes, Created by me. Each row shows status (Live, Starts soon, Paused,
  Ended), the penalty badge, TVL, time left and the live APR (or rewards left
  for two-token pools). APR is computed client-side from `poolInfo`, so the
  list costs one multicall regardless of size.
- **Pool page** with APR, total staked, remaining rewards, schedule, penalty
  rule, token links, limits and creator. Tabs: Stake (with approval step, APR
  after staking, estimated earnings), Your position (claim, compound,
  unstake with penalty preview, exit) and Manage (creator only: add rewards,
  extend, pause, reclaim).
- **Create wizard** with duration presets, projected APR for an expected pool
  size, penalty toggle (default 10%, presets 5 / 10 / 20, custom up to 50),
  optional delayed start and optional limits. After the transaction confirms
  the new pool opens automatically.
- **Share links.** Every pool has its own URL, `/stake/<id>`, and every
  token has one too, `/stake/token/<address>`, which always opens that
  token's live pool (or its latest one). The pool page has Copy pool link,
  Copy token link and Share on X buttons. When a link is posted on X, Telegram
  or Discord, the preview is a live card with status, APR (or rewards left),
  total staked, end date and penalty, rendered on the server from chain data.
- Wallet gate for anything that signs; wrong-network prompt to switch to Arc;
  friendly error text for every custom error.
- Local testing: set `VITE_STAKING_ADDRESS` in `frontend/.env.local` to the
  test copy; the app shows the TEST MODE banner and never bakes that address
  into production builds.

---

## 8. Verification status

- **Unit and fuzz tests** (`test/ArcStaking.t.sol`, 15 tests): pool creation
  and validation, pro-rata split at 2:1, late joiner earns only from joining,
  penalty recycled to stayers (same token) and paid to creator (two tokens),
  free withdrawal after the end and with penalty off, `addRewards` raises the
  rate without moving the end, `extendPool` re-streams leftovers, reclaim only
  after the end and only the unearned part, delayed start, pause, min / max /
  cap, compound and exit, fee-on-transfer stake token, fee and admin
  permissions, and a 512-run conservation fuzz (random stakes, random exit
  time, random penalty: principals return minus the declared penalty, total
  paid never exceeds deposits, only dust remains).
- **Live run on Arc** against the 0.1-fee test copy with the MMCRN token:
  approve, create a 1-hour pool with 360 rewards and a 10% penalty, stake 100,
  observe accrual, unstake 50 early (45 returned, 5 recycled), claim, compound,
  reclaim correctly rejected before the end, exit. Every transfer was matched
  against the contract balance and the pool's reserve to the wei.
- **Explorer source verification**: not done yet. Flattened source and
  Standard JSON with exact settings are in `verification/`.
- **Audit**: none. The contract is a compact variant of a widely used pattern
  built on OpenZeppelin v5, but an independent review is recommended before
  large reward pools are opened.

---

## 9. Design decisions and limits

- **Duration + reward pool instead of a fixed rate.** Creators reason in
  "how much, for how long"; the rate and APR are consequences. It also makes
  the reserve always sufficient by construction: a pool can never promise more
  than it holds.
- **Penalty instead of a hard lock.** Stakers can always leave; the cost of
  leaving early is explicit and previewed. Locks that cannot be exited were
  rejected as too hostile to stakers.
- **Same-token penalties go to stakers, not the creator.** This keeps the
  incentive aligned with the pool rather than with churn.
- **No USD APR for two-token pools.** That needs prices; a DexScreener-based
  estimate is on the roadmap.
- **Native USDC cannot be staked directly**; use the ERC-20 USDC at
  `0x3600…0000`, which is the same money on Arc.
- **Unused earlier deployment**: a fixed-rate design was deployed at
  `0x38eFC2c32799dFeE4Dd0493b7eC931BFD7D13E40` before the model was changed.
  It holds no funds and the app never pointed at it.

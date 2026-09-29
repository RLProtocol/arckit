# Arc Kit

Arc Kit is a suite of on-chain tools for teams launching and running tokens on
**Arc**, Circle's EVM-compatible chain (chain id 5042, native gas coin USDC
with 18 decimals). Everything below is live at **https://www.arctools.space**
(also https://arc-tools.vercel.app) and reads directly from contracts on Arc.
There is no database. The site is a static app plus one tiny serverless
function that proxies read-only RPC calls to a private endpoint, keeping the
RPC key server-side; wallets sign and broadcast transactions themselves.

| Tool | Status | Contract |
|---|---|---|
| ArcLock, cliff locks | Live | `0xdF2640625231b662A949e0B3C868F9d9109CFEaf` |
| ArcLock, linear vesting | Live | `0x5d2828b7bDDe377B51713dFa31afbA83C6011788` |
| Arc Bulk Airdrop | Live | `0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3` |
| ArcFlow, Uniswap v4 fee stakes | Live (beta) | `0x439608bFAC5D2B9EcD803649a1b15A9d56900990` |
| Arc Redeployment | Coming soon | |

Every contract charges a flat **10 USDC** fee per transaction, paid in the native
coin alongside the call. Fees accumulate in the contract and are pulled by the
fee receiver; they never block a user action. The contract owner can change
the fee and the fee receiver and nothing else. No contract has any path to a
user's tokens.

---

## 1. ArcLock: token and LP locks

Lock any ERC20, including Uniswap-style LP pair tokens, until a date you
choose. The lock is public and provable: anyone with the link can see the
amount, the dates and the live countdown, straight from the chain.

### Roles

Each lock has two roles, which are usually the same wallet:

- **Owner**: can top up, extend, split and transfer the lock.
- **Withdrawer**: can take tokens out once the unlock date passes, and can
  reassign the withdrawer role.

### Features

- **Create a lock** with any amount, a preset term (30 days to 2 years) or a
  custom date and time, and an optional separate withdrawer wallet. The fee is
  charged exactly; over- or under-paying reverts.
- **Live certificate preview** while filling in the form.
- **Top up** an existing lock with more of the same token, no fee.
- **Extend** the unlock date. It can only move later, never earlier, and must
  land in the future.
- **Split** part of a lock into a new lock with the same dates and roles, for
  example to transfer or extend only a portion.
- **Transfer ownership** to another wallet, optionally moving withdraw rights
  along with it. Moving withdraw rights requires the caller to hold both roles.
- **Change withdrawer**, by the current withdrawer only.
- **Withdraw** part or all of a matured lock.
- **Share link**: every lock has a public page at `/lock/<id>` with a
  certificate card, an arc-shaped countdown dial, a copy-link button and a
  "Share on X" button.
- **Rich link previews**: when a lock or vesting link is posted on X, Telegram,
  Discord, Slack, WhatsApp or similar, the preview shows a generated 1200×630
  card with the live amount, token, status and unlock date, rendered on the
  server from chain data at share time (`/api/og`, `/api/share`).
- **Amount quick picks**: 25%, 50%, 75% and Max of your balance or of the lock.

### Safety properties

- Amounts are recorded as the amount the contract actually received, so
  fee-on-transfer (tax) tokens cannot drain other users' locks.
- Exact fee enforcement; pull-payment fees so a broken fee receiver cannot
  stop locking.
- Per-user index stays exact across transfers, no stale or duplicate ids.
- Rebasing (elastic-supply) tokens are not supported.

---

## 2. ArcLock: linear vesting with cliff

Vest tokens to a beneficiary over time instead of releasing them all at once.
Typical uses: team, advisor and investor allocations.

### How the schedule works

A schedule has a **start**, an optional **cliff** and an **end**.

- Before the cliff nothing can be claimed.
- At the cliff, the share of the term that has already elapsed unlocks at once.
- From then on tokens stream linearly until the end, when everything is
  claimable.
- The start may be in the past, in which case the schedule begins partly
  vested.

### Features

- **Create a schedule** with amount, beneficiary (defaults to you), start now
  or on a date, cliff presets (none to one year) or custom days, and total
  length presets (six months to four years) or custom days, with a live
  certificate preview.
- **Batch creation** on-chain: several schedules for the same token in one
  transaction, one fee each. Used for team tables.
- **Claim** everything vested since the last claim, any time, as often as you
  like.
- **Change beneficiary**, by the current beneficiary only.
- **Public schedule page** at `/vest/<id>`: certificate with a dial showing
  percent vested, a stacked bar for claimed, claimable and still vesting, all
  dates and both parties, plus a share link.

### What cannot be done, by design

Schedules are **not revocable** and their dates **cannot be changed** by
anyone, including the creator and the contract owner. A published vesting
schedule is a commitment. The only mutable field is the beneficiary.

---

## 3. Arc Bulk Airdrop

Send an ERC20 or native USDC to hundreds of wallets per transaction.

### Features

- **Two asset modes**: any ERC20 token, or native USDC.
- **Two amount modes**: a different amount per recipient, or the same amount
  for everyone.
- **Paste or upload** the recipient list. Accepted inputs, matching what other
  multisender tools take:
  - one line per recipient, `address,amount`, also with spaces, tabs,
    semicolons or `=` as separators
  - CSV or TSV with a header row, quoted values allowed
  - JSON arrays of `[address, amount]` pairs or `{address, amount}` objects
  - address-only lines when using the same-amount mode
- **Validation before sending**: unreadable lines are listed with the reason
  and removable in one click; duplicate addresses are flagged and can be
  merged in one click; token balance, allowance and USDC for fees are checked.
- **Automatic batching**: lists are split into transactions of 250 recipients
  (the contract allows 500) and sent one after another with a status row and
  explorer link per batch. If a batch fails, the run stops and offers to
  resume from that batch.
- **Live summary**: recipients, total, number of transactions, total fee, your
  balance, approval state, and a scrollable preview of the parsed list.

### How it works on chain

- ERC20 sends use `transferFrom(sender, recipient, amount)` for each
  recipient, so the contract **never holds your tokens**. You approve the
  total once and sign once per batch.
- Native sends forward the exact amounts and **refund any excess** USDC.
- Each transaction is **all-or-nothing**: a zero address, zero amount, failed
  transfer or a recipient contract that rejects USDC reverts the entire batch,
  so nobody is half-paid.
- Lifetime counters (`totalAirdrops`, `totalRecipients`) are shown in the UI.

---

## 3b. ArcFlow: deposit USDC, earn streamed pool fees (beta)

Arc runs Uniswap's official v4 deployment. ArcFlow sits on top of it rather
than forking an AMM, so liquidity is never fragmented.

- **Pick any USDC pool** on Arc; the page lists active v4 pools with liquidity,
  volume, fee tier and whether a hook is attached. Hooked pools are flagged
  because launchpad hooks usually take an extra cut on swaps.
- **Stake USDC only.** The vault swaps half into the pool's token inside the
  pool at your slippage limit, mints one full-range position, refunds dust, and
  credits you liquidity units as shares. Or stake both tokens directly.
- **Fees stream, not dump.** Anyone can press Harvest. Accrued swap fees are
  converted to USDC, 1% goes to the protocol treasury, and the rest streams to
  all stakers over seven days, pro-rata, every second. Claim any time or
  compound back into the position.
- **Unstake any time**, as both tokens or as USDC only, in one transaction.
- **Isolated per pool.** A hostile hook can only affect the stakers of its own
  pool. Native-coin pools are not supported; use the USDC token pools.
- **Status: beta, unaudited.** Full-range positions only. Verified with fork
  tests on live Arc state and a live 2 USDC round trip on the production
  contract.

### ArcFlow v2 (2026-09-19)

- **Stakes in a band.** Pick Tight (±10%), Medium (±25%) or Wide (±49%). The same dollars earn several times more
  fees than full range. Fees are harvested on every stake, unstake and compound, anyone who calls harvest earns a
  0.5% bounty, and the APR shown is the real running stream.
- **Rebalancing nobody has to trust.** When the price leaves a band, anyone flags it and, ten minutes later, anyone
  recentres it, provided the price is still out of range and has not drifted. A rebalance never moves a pool's price
  by more than 1%.
- **Pools.** Open your own Spot, Curve or Bid-ask position with USDC only, see where the liquidity will sit before
  signing, collect fees any time, close to USDC.
- **Lock Uniswap v4 liquidity.** A position can be locked until a date for 10 USDC. Fees stay collectable, the public
  page `/flow/position/<id>` is the proof, and `/flow/locks` lists them all.
- **Fee hook for new pools.** 0.30% when calm, rising with volatility to a 3% cap. No owner, no funds, cannot block
  trades.
- Details, test results and design trade-offs are in `arcflow.md` under "ArcFlow v2".

## 3c. Arc Staking: time-boxed reward pools

Any project can open a staking pool for its token without writing code or
computing an APR.

- **Creator picks two numbers.** How long the pool runs (presets 3, 7, 14, 30,
  60, 90 days; anything from one hour to four years) and how many reward
  tokens to deposit. The reward rate is simply rewards ÷ duration, streamed
  every second from start to finish. The app shows the projected APR for any
  expected pool size before creation, and stakers see the live APR.
- **Same token or a different one.** Rewards can be the staked token (APR is
  shown, compounding is available) or any other ERC-20 (the app shows each
  staker's share of the daily payout instead).
- **Optional early-exit penalty**, default 10%, adjustable up to 50% or off.
  Withdrawing before the end date costs that share of the amount withdrawn.
  For same-token pools the penalty is added to the reward stream for the
  stakers who stay; for different-token pools it is sent to the creator.
  After the end date every withdrawal is free.
- **Pro-rata, second by second.** Synthetix-style accounting: each staker
  earns their share of the stream for exactly the time they are staked. Time
  with nobody staked is not paid to anyone; the creator can reclaim it after
  the pool ends. Late joiners never earn for time before they joined.
- **Stakers** stake, claim, compound (same-token pools), unstake a portion or
  exit (unstake all + claim) in one transaction, with the penalty previewed.
- **Creators** can add rewards (rate rises, end date fixed), extend the pool
  (unearned rewards are re-spread over the longer period plus anything added),
  pause new stakes (claims and withdrawals always work), and reclaim rewards
  nobody earned once the pool has ended. Optional minimum stake, per-wallet
  maximum and total cap. Creators can never touch stakes or earned rewards.
- **Share links**: `/stake/<id>` per pool and `/stake/token/<address>` per
  token, with copy and Share-on-X buttons and server-rendered preview cards
  for X, Telegram and Discord, like lock and vesting links.
- **Fee**: 10 USDC to create a pool. Nothing on stake, claim or unstake.
- **Status**: 15 unit and fuzz tests (pro-rata split, late joiner, penalty
  redistribution vs. creator payout, add/extend/reclaim, caps, pause,
  fee-on-transfer stake tokens, conservation fuzz) plus a live run on Arc
  through every user action against a 0.1-fee test copy, reconciled to the
  contract's token balance.

## 3d. ArcPay and the ArcPay MCP server

**ArcPay** (`/pay`, live 2026-09-21): spend the USDC in an Arc wallet on gift cards and mobile top-ups in 100+
countries. The visitor's country is detected, products are priced in local currency, the exact USDC total is
shown before paying, payment is one transaction with no approval, and the code appears on the page with redeem
steps. Orders that cannot be completed after payment are refunded automatically. Codes are tied to the paying
wallet.

**arckit-pay-mcp** (`mcp/`, 2026-09-23): an MCP server so any AI assistant (Claude, Cursor, Windsurf, Gemini
CLI, remote clients over HTTP) gets its own wallet on Arc and can browse, quote and buy through ArcPay on the
user's behalf. Tools: wallet, browse_products, search_products, get_product, quote, buy, order_status,
purchases, set_default_country. It asks for the country when unknown, shows the USDC price before buying,
enforces per-purchase and daily limits, and never exposes the key. Verified end to end: a real ₹100 KFC card
bought through the tools and delivered in 12 seconds. Publish with `cd mcp && npm publish`; until then install
from the local path (see `mcp/README.md`).

## 4. Explore and portfolio

- **Explore** (`/explore`): every lock and every vesting schedule on Arc,
  newest first, with a Locks / Vesting toggle and status filters, plus a token
  address search.
- **Token page** (`/token/<address>`): all locks for a token, total currently
  locked, share of total supply locked, active count and next unlock date.
- **My locks** (`/my`): four tabs for the connected wallet: locks I manage,
  locks I can withdraw, vesting to me, vesting I created. Banners call out
  locks that are open to withdraw and schedules with tokens ready to claim.
- **Home**: live stats read from the contracts, the newest certificate, the
  tool suite, and a three-step explainer.

---

## 5. Wallet and network handling

- Connects to MetaMask, Rabby and any wallet that announces itself to the
  browser. No WalletConnect project id is needed.
- Every action checks that the wallet is on Arc (chain id 5042). If not, a
  "Switch to Arc" button asks the wallet to switch, and adds the network first
  if the wallet has never seen it (RPC, chain id, USDC currency and explorer
  are supplied automatically).
- All write screens are gated behind a connected wallet on the right chain.
- If the public RPC stops answering, a red banner appears and lists show an
  explicit notice instead of looking empty. Both clear on the next successful
  poll.

---

## 6. Design

- Visual language follows Arc's own: deep navy fading to teal, thin sweeping
  arc lines, a light uppercase geometric display face (Outfit), DM Sans body
  text, IBM Plex Mono for addresses, amounts and dates, and a periwinkle-blue
  accent.
- The signature element is the **certificate card** with a 270-degree arc dial
  that fills as time passes: blue while locked or vesting, aqua once open.
  Locks shorter than a day show hours or minutes instead of days.
- Fully responsive down to phone width, with keyboard focus styles and reduced-
  motion support.
- Logo: the wrench-and-screwdriver mark, used in the header, as favicon, home
  screen icon and link-preview image.

---

## 7. Fees and administration

| | Fee | Charged on |
|---|---|---|
| Lock | 10 USDC | creating a lock (not on top up, extend, split, transfer, withdraw) |
| Vesting | 10 USDC | creating a schedule (per schedule in a batch) |
| Airdrop | 10 USDC | each airdrop transaction, regardless of recipient count |
| Staking | 10 USDC | creating a pool (not on stake, claim, unstake, add rewards or extend) |

- Fees are paid in native USDC with the call and must match exactly (airdrop
  native sends must cover amounts plus fee, excess refunded).
- Fees accumulate in each contract as `pendingFees` and are withdrawn with
  `claimFees()` by the fee receiver or the contract owner.
- Admin functions are limited to `setFee` / `setLockFee` and
  `setFeeReceiver`, behind two-step ownership (Ownable2Step). There is no
  pause, no upgrade, no rescue and no way for the owner to touch user tokens.

Current owner and fee receiver of all contracts:
`0x23d128F066820DCa6E8809f947766b45d3C6aE35`.

---

## 8. Verification status

- **Unit and fuzz tests**: 78 Foundry tests, all passing (28 locker, 15
  vesting, 11 airdrop, 15 staking, 9 ArcFlow fork tests), including
  fee-on-transfer tokens, index consistency across transfers, monotonic
  bounded vesting, claims summing to the total, a full 500-recipient airdrop
  batch, and reward conservation under random stake/exit timing.
- **Live end-to-end**: every function of all three contracts was exercised on
  Arc against identical test-fee copies, including every negative case, with
  balances reconciled to the wei.
- **Source verification on arc-scan.org**: not yet done. Flattened sources,
  Standard JSON inputs and exact settings are prepared in `verification/`.
- **Audit**: none. The contracts are small, use OpenZeppelin v5 primitives,
  and follow well-trodden patterns, but a third-party review is still
  recommended before large value is locked.

---

## 9. Chain facts

| | |
|---|---|
| Chain | Arc, chain id 5042 |
| Native coin | USDC, 18 decimals on chain (1 ether = 1 USDC) |
| RPC | Primary: a private keyed endpoint behind the site's own `/api/rpc` proxy (key server-side). Fallbacks: https://rpc.arc-scan.org (drops ~25% of requests) and https://5042.rpc.thirdweb.com. The app ranks endpoints by health automatically. |
| Explorer | https://arc-scan.org |
| Multicall3 | deployed at the canonical address, used for batched reads |
| Block gas limit | 30M; a 500-recipient airdrop uses about 15M |

---

## 10. Repository map

```
src/                 TokenLocker.sol, TokenVesting.sol, BulkAirdrop.sol, ArcStaking.sol, arcflow/ArcFlowVault.sol
test/                Foundry tests and mocks (plain, fee-on-transfer, rejecting receiver)
script/              deploy scripts, test-pair deploy, e2e-arc.sh live exerciser
deployments/         arc-5042.json (addresses, txs, blocks) and all ABIs
verification/        flattened sources + Standard JSON for explorer verification
frontend/            Vite + React + wagmi app (see README for routes)
vercel.json          builds frontend/ and serves it with SPA rewrites
```

## 11. Roadmap

- **Arc Redeployment**: move an existing project from another chain to Arc
  automatically: snapshot holders, redeploy contracts, mirror balances, verify
  source on arrival.
- Explorer source verification for the eight live contracts.
- Staking: USD-denominated APR for two-token pools via DexScreener prices.
- An indexer once volume outgrows scanning ids through multicall.

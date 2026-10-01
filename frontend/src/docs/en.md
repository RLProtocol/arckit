=== slug: introduction
title: Introduction
group: start
summary: Arc Kit is a suite of on-chain tools for teams and users on Arc, Circle's USDC-native blockchain. Lock, vest, stake, distribute, spend and move value privately — with public, verifiable proofs and no hidden logic.
===
## What Arc Kit is

Arc Kit is a growing set of products that live entirely on **Arc** (chain id 5042), where the native gas coin is USDC. Every product is a set of immutable smart contracts plus a web app; the app is a convenience, the contracts are the product. Anything you can do in the app can be verified on [arc.etherscan.io](https://arc.etherscan.io), where every contract's source code is published.

![The Arc Kit home page](/docs/home.jpg)

## The nine tools

| Tool | What it does | Status |
|---|---|---|
| [ArcLock](/docs/arclock) | Lock tokens or LP until a date, or vest them linearly with a cliff. Public certificate for every lock. | Live |
| [Arc Bulk Airdrop](/docs/airdrop) | Send any token or USDC to hundreds of wallets per transaction. | Live |
| [Arc Staking](/docs/staking) | Open a time-boxed reward pool for your token in one transaction. | Live |
| [ArcFlow](/docs/arcflow) | Uniswap v4 liquidity on Arc: concentrated stakes, shaped positions, dynamic fee hook, liquidity locks. | Live (beta) |
| [ArcPay](/docs/arcpay) | Spend USDC on gift cards and mobile top-ups from thousands of brands. | Live |
| [Arc Kit MCP](/docs/mcp) | Give any AI agent its own USDC wallet on Arc and let it buy for you. | Live |
| [ArcLend](/docs/arclend) | Lend USDC and earn, or borrow USDC against your tokens. Isolated markets, on-chain TWAP pricing. | Live |
| [ArcCash](/docs/arccash) | Private transfers with zero-knowledge proofs. Gas paid by Arc Kit. | Live |
| Arc Redeployment | Move a project from another chain to Arc automatically. | Coming soon |

## Principles

- **Immutable.** No contract has an upgrade path or a pause switch that can touch user funds. Owners can change fees and the fee receiver, nothing else.
- **Verifiable.** Every contract is source-verified on Etherscan. Every lock, schedule, pool and position has a public page anyone can open without a wallet.
- **Fees in USDC.** Because USDC is Arc's gas coin, every fee is a flat, predictable amount in dollars.

> [!TIP] New here? Start with [Getting started](/docs/getting-started), then pick the tool you need from the sidebar.

=== slug: getting-started
title: Getting started
group: start
summary: Everything you need before your first transaction: a wallet, the Arc network, and a little USDC for gas.
===
## 1. A wallet

Arc Kit works with any EVM wallet that supports custom networks: MetaMask, Rabby, Coinbase Wallet, Trust, and hardware wallets through them. Press **Connect wallet** in the top right; if Arc is not in your wallet yet, the app offers to add it.

## 2. The Arc network

| Setting | Value |
|---|---|
| Network name | Arc |
| Chain id | 5042 |
| Currency | USDC (18 decimals on-chain) |
| RPC | `https://5042.rpc.thirdweb.com` (recommended), `https://rpc.arc-scan.org` |
| Explorer | `https://arc.etherscan.io` |

> [!NOTE] Some wallets ship Arc with an RPC that drops requests. If a transaction fails before it is sent, the app shows a **Fix wallet RPC** button that switches your wallet to the healthier endpoint.

## 3. USDC for gas and fees

Gas on Arc is paid in USDC and costs a fraction of a cent per transaction. Arc Kit's own fees are flat amounts in USDC (10 USDC for a lock, a vesting schedule, an airdrop transaction, a staking pool or a liquidity lock) and are shown before you confirm.

## 4. Your first action

- **Lock a token or LP:** [Lock](/lock/new)
- **Vest tokens to a team member:** [Vest](/vest/new)
- **Send an airdrop:** [Airdrop](/airdrop)
- **Open a staking pool:** [Stake](/stake)
- **Spend USDC on a gift card:** [Pay](/pay)

## 5. Language

The site is available in English, 中文 and Bahasa Indonesia. Use the **EN / 中文 / ID** switch in the top bar; the choice is remembered on your device.

=== slug: arclock
title: ArcLock
group: products
summary: Cliff locks and linear vesting for any token or LP position, with a public certificate anyone can verify.
===
## Locks

A lock moves tokens from your wallet into the locker contract until a date you choose. Nobody, including us, can release them earlier. Each lock has an **owner** (can top up, extend, split, transfer) and a **withdrawer** (can take the tokens out after the date). They can be the same wallet or different ones.

![Creating a lock](/docs/lock.jpg)

### Creating a lock

1. Paste the token or LP contract address. For LP, paste the pair address: a Uniswap-style LP token is a normal ERC-20.
2. Enter the amount and pick a date (presets from 30 days to 4 years, or a custom date and time).
3. Optionally name a different withdrawer wallet.
4. Approve exactly the amount, then confirm the lock. Flat fee: 10 USDC.

### Managing a lock

- **Top up** with more of the same token, no fee.
- **Extend** the unlock date. It can only move later, never earlier.
- **Split** part of the lock into a new lock with the same date and roles.
- **Transfer** ownership, optionally with the withdrawal rights.
- **Change the withdrawer** (only the current withdrawer can).
- **Withdraw** in parts or in full after the unlock date.

### The certificate

Every lock has a public page at `/lock/<id>` with a live countdown, the amount, the token and the roles, read straight from the chain. Share it in your community; nobody has to trust a screenshot.

![A public lock certificate](/docs/lock-detail.jpg)

## Vesting

Vesting releases tokens linearly between a start and an end date, with an optional **cliff**: nothing can be claimed before the cliff, and at the cliff the portion already elapsed unlocks at once.

![Creating a vesting schedule](/docs/vest.jpg)

- Schedules are **not revocable** and dates cannot be changed after creation. Tokens sit in the vesting contract and can only ever go to the beneficiary.
- The beneficiary can claim as often as they like (gas is the only cost) and can hand the schedule to another wallet.
- A past start date is allowed: the schedule simply begins partly vested.
- Team tables: create many schedules for one token in a single transaction, one fee each.

## Safety properties

- Exact fee enforcement; fees are pulled by the fee receiver, never pushed, so a broken receiver can never block a user.
- Fee-on-transfer tokens are recorded at the amount the contract actually receives, so they cannot drain other users' locks.
- Reentrancy guards on every state-changing call.

> [!WARNING] The contracts are immutable. A typo in a withdrawer or beneficiary address cannot be fixed by anyone but the wallet that holds that role.

=== slug: airdrop
title: Arc Bulk Airdrop
group: products
summary: Send any ERC-20 or native USDC to hundreds of wallets per transaction, from a pasted list or an uploaded file.
===
## How it works

Paste a list or upload a CSV, TXT or JSON file. The app validates every line, merges duplicates if you want, splits the list into batches of up to 500 recipients, and signs one transaction per batch. Tokens go **straight from your wallet to each recipient**; the contract never holds them.

![The airdrop tool](/docs/airdrop.jpg)

## Input formats

- One recipient per line: `address, amount`. Commas, spaces, tabs, semicolons and `=` all work.
- CSV with headers, JSON arrays of `{ address, amount }`, or a plain list of addresses with one amount for everyone.
- Amounts are in whole tokens; the app applies the token's decimals.

## Guarantees

- Each batch is **all-or-nothing**: if one transfer fails (for example a recipient contract that refuses USDC), the whole batch reverts and nothing is sent.
- Native USDC airdrops forward the exact amounts and refund any excess in the same transaction.
- Flat fee: 10 USDC per transaction, regardless of the number of recipients in it.

## Resuming

If a later batch fails or you close the tab, come back and use **Resume from batch** to continue where you left off without re-sending earlier batches.

=== slug: staking
title: Arc Staking
group: products
summary: Time-boxed reward pools for any token: the creator picks the duration and deposits the rewards; stakers earn every second.
===
## For projects

Open a pool in one transaction: choose how long it runs (3, 7, 30 days or anything from an hour to four years), deposit the reward tokens up front, and decide whether early withdrawals pay a penalty. The rewards stream evenly from start to finish to whoever is staked, in proportion to their stake.

![Staking pools](/docs/stake.jpg)

- Reward token can be the staked token or a different one.
- Optional limits: minimum stake, per-wallet maximum, total cap, delayed start.
- Optional early-exit penalty (up to 50%), paid either to the stakers who stay or to the creator.
- The creator can **add rewards**, **extend** the period and **pause new stakes**. After the pool ends they can reclaim rewards that nobody earned (time when nobody was staked). They can **never** touch stakers' deposits or what stakers already earned.
- Flat fee: 10 USDC per pool.

## For stakers

The APR you see is calculated live from two numbers: the rewards left to distribute and the total currently staked. Half the stake, double the APR. Stake, claim, compound (when the reward is the staked token) or unstake at any time; after the end date every withdrawal is free.

## Shareable pools

Every pool has a page at `/stake/<id>`, and every token has a page at `/stake/token/<address>` that always opens the live pool for that token, so one link keeps working from launch to launch.

=== slug: arcflow
title: ArcFlow
group: products
summary: Liquidity on Arc's Uniswap v4, made simple: concentrated USDC stakes, shaped positions, a dynamic-fee hook and public liquidity locks.
===
## What ArcFlow is

Arc's Uniswap v4 is where tokens on Arc trade. ArcFlow lets you put USDC to work in any USDC pool without understanding ticks and ranges, and lets projects prove their liquidity is locked.

![ArcFlow](/docs/flow.jpg)

## Stakes (concentrated)

Deposit USDC into a **band** around the current price: Tight, Medium or Wide. The vault swaps the right share inside the pool and adds both tokens to the band. A tighter band earns more fees per dollar but leaves the range sooner; when the price leaves it, anyone can **recentre** it (flag, then rebalance ten minutes later) and earns a 0.5% bounty for doing so.

- Swap fees are harvested, converted to USDC (1% to the protocol) and **streamed to stakers over 7 days**. Claim, compound or unstake to USDC at any time.
- Your money in a band is kept separate from every other band in the vault.
- Beta cap: 25,000 USDC per strategy.

## Positions (shaped)

Open your own position with a **shape**: Spot (one even range), Curve (densest at the price) or Bid-ask (heaviest at the edges), plus a custom range if you prefer. Collect fees whenever you like, close to USDC, or lock it.

## Liquidity lock

Press **Lock liquidity** on a position and choose a date. While the lock is active the contract refuses every attempt to remove that liquidity, including by its owner; fees stay collectable. The lock has a public proof page and appears in the [locked liquidity list](/flow/locks). Fee: 10 USDC.

![Locked liquidity](/docs/flow-locks.jpg)

## Dynamic fee hook

New pools can attach the ArcFlow fee hook: the swap fee starts at 0.30% and rises with volatility (0.001% per tick of movement from a 10-minute reference, capped at 3%), then cools back down. Hooks are fixed at pool creation, so this is only for pools created with it.

> [!NOTE] ArcFlow is in beta. Pools with third-party hooks (for example from launchpads) are flagged in the app with an explanation of what the hook can do.

=== slug: arcpay
title: ArcPay
group: products
summary: Spend the USDC in your Arc wallet on gift cards and mobile top-ups from thousands of brands in 100+ countries.
===
## How it works

1. Open [Pay](/pay). It detects your country and shows what is popular there, in your local currency. Search for any brand or switch country.
2. Pick a product and an amount. You see the **exact price in USDC** before you pay, with conversion costs included.
3. Pay in one tap: a single transaction, no token approval.
4. Your code appears on the page, usually in under a minute, with the steps to redeem it.

![ArcPay](/docs/pay.jpg)

## What makes it different

- **No card, no bank, no KYC form.** Just your wallet.
- **The price you see is the price you pay.** Conversion and network costs are included up front.
- **Automatic refunds.** If an order cannot be completed after you pay, your USDC is sent back to your wallet.
- **Codes only you can open.** A free wallet signature proves a code is yours. They stay under **My purchases**.

## Under the hood

Your payment goes to the ArcPay router contract, which forwards it to the ArcPay treasury in the same call and holds nothing. The order state machine is idempotent: every step is recorded before it is executed, so a crash can never double-charge or lose a paid order.

=== slug: mcp
title: Arc Kit MCP
group: products
summary: Give Claude, Cursor or any AI agent its own USDC wallet on Arc and let it buy gift cards and top-ups for you.
===
## What it is

`arckit-pay-mcp` is an open-source [MCP](https://modelcontextprotocol.io) server. Once installed, your AI assistant gets a wallet on Arc and nine tools: check the wallet, set a default country, browse and search products, get a quote, buy, check an order and list purchases.

Say *"buy me a $10 Starbucks card"*. The agent asks for your country if it does not know it, quotes the exact USDC price, waits for your yes, pays from its wallet, and the code appears in the chat.

## Install

```
npx -y arckit-pay-mcp
```

For Claude Desktop, add it to `claude_desktop_config.json`:

```
{
  "mcpServers": {
    "arckit-pay": { "command": "npx", "args": ["-y", "arckit-pay-mcp"] }
  }
}
```

Then fund the wallet the agent shows you with a little USDC on Arc.

## Safety

- The agent's key lives only on your machine (`~/.arckit/wallet.json`). Fund it with what you are willing to let it spend.
- Built-in limits: 50 USDC per purchase and 100 USDC per day by default, adjustable with environment variables.
- The agent must show you the quote and get a clear yes before it buys.

Package: [npmjs.com/package/arckit-pay-mcp](https://www.npmjs.com/package/arckit-pay-mcp)

=== slug: arccash
title: ArcCash
group: products
summary: Private transfers on Arc. Deposit a fixed amount of USDC, receive a secret note, and later withdraw to a fresh address with a zero-knowledge proof. Gas is paid by Arc Kit.
===
## The idea

Normally the chain records that address A paid address B, forever. ArcCash breaks that link. You deposit a fixed amount into a shared pool with a cryptographic commitment; later, anyone holding the matching secret can withdraw the same amount to **any** address, and the chain sees only that "one of the depositors withdrew", never which one.

![ArcCash](/docs/cash.jpg)

## Deposit

1. Choose a pool (1 USDC or 10 USDC). Every deposit in a pool is the same size, so amounts cannot be matched.
2. Your browser draws two random secrets and hashes them into a commitment. The **note** contains the secrets; copy or download it.
3. Confirm the deposit. The note never leaves your browser.

> [!DANGER] The note is the money. If you lose it, the deposit is gone and nobody, including us, can recover it.

## Withdraw

1. Paste the note (from any device, any wallet — or no wallet at all). It is checked locally and against the pool.
2. Enter a recipient address that has never interacted with the depositing wallet. A brand-new one is best; it needs no gas.
3. Your browser rebuilds the pool's Merkle tree, downloads the proving key once (20 MB) and generates a Groth16 proof in about two seconds.
4. The proof is handed to Arc Kit's **relayer**, which pays the gas and submits the transaction. The recipient receives the full amount.

![Withdrawing with a note](/docs/cash-withdraw.jpg)

## What the cryptography does and does not hide

The proof hides **which** deposit is being spent: perfectly. It cannot hide the things around it, and those are on you:

- **Anonymity set.** With one unspent deposit, a withdrawal is obviously yours. Wait until many deposits have joined between yours and your withdrawal.
- **Timing.** Deposit and withdraw minutes apart and the link is obvious even in a big pool.
- **Wallets.** Never withdraw to, or from, a wallet linked to the depositor.

## Technical summary

- Tornado Cash Classic design ported to Arc: Pedersen commitments, a 20-level MiMC Merkle tree with 30 remembered roots, Groth16 over BN254 (36,047 constraints).
- The proof binds recipient, relayer and fee, so nobody can intercept a transaction and redirect the payout.
- The relayer only ever receives a finished proof; it learns the recipient address and nothing about the deposit. If it is unavailable, the app falls back to sending from your connected wallet.
- Trusted setup: public Perpetual Powers of Tau (phase 1) with a single phase-2 contribution. Contracts have no owner, no pause, no upgrade.

=== slug: arclend
title: ArcLend
group: products
summary: Lend USDC and earn every second, or post your tokens as collateral and borrow USDC against them. One isolated market per token, priced by a 30-minute on-chain average.
===
## How it works

Each ArcLend market pairs one token with USDC. **Lenders** supply USDC into the market and receive interest-bearing shares. **Borrowers** deposit the token as collateral and borrow USDC up to the market's loan-to-value (LTV). Interest accrues every second from borrowers to lenders; 10% of it goes to the protocol as an AKIT revenue stream.

Markets are **isolated**: USDC supplied to the ARCMAN market can only ever be borrowed against ARCMAN. A token that collapses can hurt its own market and nothing else.

## Lending

1. Pick a market and press **Supply**. USDC is sent as the native coin; no approval is needed.
2. Your supply grows with the market's supply APY, which is the borrow APR times utilisation (minus the 10% reserve factor). More borrowing, higher yield.
3. Withdraw any time there is idle USDC in the market. If everything is lent out, the high utilisation rate pulls repayments and new supply in until it frees up.

## Borrowing

1. **Deposit collateral**: approve the token once, then deposit.
2. **Borrow** up to LTV × collateral value. At launch the LTV is 50%: 100 USDC of tokens lets you borrow 50 USDC.
3. **Repay** whenever you like, partially or in full. Send a hair more than your debt and the excess comes back in the same transaction.
4. **Withdraw collateral** once your debt is back within the limit.

The page shows your **health factor** and the exact token price at which you would be liquidated. Keep it well above 1.

## Liquidation

Two liquidation paths run side by side:

- **Public liquidators** use the 30-minute TWAP, so nobody can manipulate a single block of price to liquidate a healthy borrower.
- **The guardian**, an Arc Kit wallet that watches every market's live pool price **every 10 seconds**, may liquidate at the *lower* of TWAP and spot. When a token collapses in minutes, the guardian closes underwater positions immediately instead of waiting for the average to catch up. It follows exactly the same rules as anyone else: same threshold, same bonus, and it cannot touch a healthy position.

When a position's debt exceeds the **liquidation threshold** (65% of collateral value at launch), anyone can repay up to half of the debt and receive collateral worth 8% more than they paid, priced at the TWAP. Once collateral no longer covers the debt, the whole position can be closed. Liquidations are permissionless and fully on-chain.

## Pricing: the TWAP oracle

Arc has no price feeds, so ArcLend reads prices from each token's Uniswap v4 USDC pool through **ArcTwapOracle**. Anyone can `poke` a pool to record its current tick; a keeper does so every 10 minutes and every borrow does too. The market values collateral at a **30-minute time-weighted average**, and borrowing pauses whenever the spot price is more than 5% away from that average. Moving a 30-minute average means holding a distorted price against arbitrage for the whole window, which is what makes thin pools usable as collateral.

## Launch parameters

| Parameter | Value |
|---|---|
| Markets | AKIT, ARCMAN, ARCOON, AF, ASTOCK |
| Loan-to-value | 50% |
| Liquidation threshold | 65% |
| Liquidation bonus | 8% |
| Close factor | 50% (100% once collateral < debt) |
| Interest | 2% base, +10% up to 80% utilisation, +50% beyond |
| Reserve factor | 10% of interest |
| Supply cap / borrow cap | 100 USDC supply / 10 USDC borrow per market for the first week, then raised gradually |
| Price | 30-minute TWAP, 5% spot-deviation guard |

The owner can add markets, tune these within hard caps (LTV ≤ 80%, threshold ≤ 90%, bonus ≤ 20%, reserve ≤ 30%), change caps and pause new borrows. It cannot touch supplied USDC, collateral or anyone's debt.

> [!WARNING] Collateral tokens on Arc are small and volatile. Borrow well below the limit, watch your health factor, and remember a liquidation costs you the 8% bonus.

=== slug: arcp2p
title: ArcP2P
group: products
summary: Sell any token for USDC at a fixed price or at the live market price with a discount or premium. Buyers take all or part of a listing and pay native USDC in one transaction.
===
## How it works

ArcP2P is a permissionless order book for selling tokens against USDC. A **seller** escrows any ERC-20 on Arc in the ArcP2P contract and names a price. A **buyer** sends native USDC and receives the tokens in the same transaction. Tokens stay in escrow until they are sold or the seller cancels; nothing is ever held by Arc Kit.

There is no listing approval, no minimum size and no counterparty risk: the contract only releases tokens when the USDC has arrived, and only releases USDC when the tokens have left.

## Pricing modes

**Fixed price.** A USDC amount per token that never moves. Simple, predictable, good for OTC deals agreed in advance.

**Market price ± spread.** The listing follows the token's deepest Uniswap v4 USDC pool. Pick a spread: 0% sells at market, −5% sells 5% below it, +10% sells 10% above it, anything from −90% to +100%. The price is re-read from the pool on every fill, so your discount stays the same as the market moves. Add an optional **floor**: the listing never sells below it, whatever the pool says.

The market reference is the **higher** of the pool's 30-minute time-weighted average and its spot price once the average has 10 minutes of observations. A single block that dumps the pool's spot price therefore cannot drain a discounted listing; a genuine move up is reflected immediately; a sustained move down is followed as the average catches up.

## Buying

1. Open **Buy**, pick a listing. The panel shows the live price, how it compares with market and what is left.
2. Enter how many tokens you want, or how much USDC you want to spend. You can buy everything or any amount above the seller's minimum fill; the last remainder is always allowed.
3. Confirm. USDC is sent as the native coin, so no approval is needed. For market-priced listings the app sends up to 1% extra to cover price movement and the contract refunds every wei it does not need.

## Selling

1. Open **Sell**, paste the token address and the amount. The app looks up the token's USDC pools and picks the deepest one with a normal fee as the market reference; you can choose another.
2. Choose fixed or market pricing, set the spread and floor if you like.
3. Optional terms: a **minimum fill**, an **expiry**, and a **private buyer** address for OTC deals only that wallet can accept.
4. Approve the token once, then list. From **My listings** you can change the price, add tokens or cancel and withdraw what is left at any time.

## Fees

The seller pays **0.5%** of each fill, taken from the proceeds; the buyer pays exactly the quoted price. The contract caps the fee at 1%. Fees accrue in the contract and are pulled by the fee receiver, so they can never block a trade. They are part of the AKIT revenue share.

## Safety

- The contract is immutable and verified. The owner can set the fee within the cap and nothing else: it cannot move escrowed tokens, change a listing or pause trading.
- Fee-on-transfer tokens list the amount actually received. Rebasing tokens are not supported.
- If a seller's address rejects USDC, the proceeds wait in the contract for them to claim; the buyer's trade still goes through.
- A listing is not an endorsement. Anyone can list anything: check the token address before you buy.

Contract: [0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C](https://arc.etherscan.io/address/0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C#code)

=== slug: contracts
title: Contracts
group: protocol
summary: Every Arc Kit contract, its address on Arc (chain 5042) and a link to its verified source code on Etherscan.
===
## Deployed contracts

All contracts below are source-verified on Etherscan. Compiler settings: Solidity 0.8.24 / 0.8.26, optimizer 200 runs, EVM `cancun`.

| Contract | Address | Notes |
|---|---|---|
| TokenLocker (ArcLock) | [0xdF2640625231b662A949e0B3C868F9d9109CFEaf](https://arc.etherscan.io/address/0xdF2640625231b662A949e0B3C868F9d9109CFEaf#code) | Locks; 10 USDC fee |
| TokenVesting | [0x5d2828b7bDDe377B51713dFa31afbA83C6011788](https://arc.etherscan.io/address/0x5d2828b7bDDe377B51713dFa31afbA83C6011788#code) | Linear vesting with cliff; 10 USDC fee |
| BulkAirdrop | [0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3](https://arc.etherscan.io/address/0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3#code) | Up to 500 recipients per tx; 10 USDC fee |
| ArcStaking | [0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46](https://arc.etherscan.io/address/0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46#code) | Time-boxed reward pools; 10 USDC fee |
| ArcFlowVaultV2 | [0xC30D55758d12ac9FD80459b002085E8528f38748](https://arc.etherscan.io/address/0xC30D55758d12ac9FD80459b002085E8528f38748#code) | Concentrated USDC stakes |
| ArcFlowPositions | [0x16c40157fF4b49b3328Db3AE352E9eA699b8f759](https://arc.etherscan.io/address/0x16c40157fF4b49b3328Db3AE352E9eA699b8f759#code) | Shaped positions and liquidity locks |
| ArcFlowFeeHook | [0x4FC207E35226df90c57DBc3CAcD60E6974c05080](https://arc.etherscan.io/address/0x4FC207E35226df90c57DBc3CAcD60E6974c05080#code) | Dynamic fee hook; no owner |
| ArcFlowVault (v1) | [0x439608bFAC5D2B9EcD803649a1b15A9d56900990](https://arc.etherscan.io/address/0x439608bFAC5D2B9EcD803649a1b15A9d56900990#code) | Full-range vault, superseded by v2 |
| ArcLend | [0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793](https://arc.etherscan.io/address/0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793#code) | Isolated USDC money markets |
| ArcTwapOracle | [0xedf33dA5bED98b5BAbDa4D71F55962CF74462491](https://arc.etherscan.io/address/0xedf33dA5bED98b5BAbDa4D71F55962CF74462491#code) | v4 pool TWAP observations; no owner |
| ArcP2P | [0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C](https://arc.etherscan.io/address/0xe9dCcE4B08f6B2b589eF68fDd811F0b3Cf708A4C#code) | Peer-to-peer token sales in USDC |
| ArcPayRouter | [0x958Db3732Bfb021c2F2879b9124dECBa0b30cd2c](https://arc.etherscan.io/address/0x958Db3732Bfb021c2F2879b9124dECBa0b30cd2c#code) | Forwards payments; holds nothing |
| ArcCash pool, 1 USDC | [0xdbf688e09c296df6ef4a02995427ee637d1e3ebe](https://arc.etherscan.io/address/0xdbf688e09c296df6ef4a02995427ee637d1e3ebe#code) | No owner |
| ArcCash pool, 10 USDC | [0x0303ae09b4f9f599823634aa9c88b6a517b24e1b](https://arc.etherscan.io/address/0x0303ae09b4f9f599823634aa9c88b6a517b24e1b#code) | No owner |
| ArcCash Groth16 verifier | [0x6d25c8ebe5549adf216a48a12660664b8b23e4fd](https://arc.etherscan.io/address/0x6d25c8ebe5549adf216a48a12660664b8b23e4fd#code) | snarkjs export |
| ArcCash MiMC hasher | [0x24e6e03c346727423d2ba02aa0a481280378c325](https://arc.etherscan.io/address/0x24e6e03c346727423d2ba02aa0a481280378c325) | Generated bytecode, no Solidity source |

## External contracts used

| Contract | Address |
|---|---|
| Uniswap v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| USDC (ERC-20 view of the native coin) | `0x3600000000000000000000000000000000000000` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

=== slug: fees-security
title: Fees & security
group: protocol
summary: What Arc Kit charges, what its owner keys can and cannot do, and how to check for yourself.
===
## Fees

| Action | Fee |
|---|---|
| Create a lock | 10 USDC |
| Create a vesting schedule | 10 USDC (per schedule) |
| Airdrop transaction | 10 USDC (per batch, any number of recipients) |
| Open a staking pool | 10 USDC |
| Lock a liquidity position | 10 USDC |
| ArcFlow stakes and positions | 1% of harvested / collected swap fees; 0.5% harvest bounty to whoever harvests |
| ArcPay | Included in the quoted USDC price |
| ArcCash | None; Arc Kit pays the withdrawal gas |
| ArcP2P fill | 0.5% of the fill, paid by the seller; capped at 1% |
| Top up, extend, split, transfer, claim, withdraw | Free (gas only) |

Fees are paid in USDC alongside the call, accumulate in the contract, and are **pulled** by the fee receiver, so a broken receiver can never block a user action.

## What the owner can do

The contract owner can change the fee amount and the fee receiver. That is the complete list. No owner key can pause withdrawals, move user tokens, change a date or upgrade a contract. ArcFlowFeeHook and the ArcCash contracts have no owner at all.

## What we recommend

- Read the contract on Etherscan before locking large value; every contract's source is verified.
- Check the public page of a lock or pool rather than trusting a screenshot.

=== slug: token
title: Token utility
group: protocol
summary: The Arc Kit token, AKIT, is a revenue-share token: protocol fees earned across the suite are shared with holders who stake it.
===
## Revenue share

Every Arc Kit product earns fees in USDC (see [Fees & security](/docs/fees-security)): lock, vesting and airdrop fees, staking pool creation fees, the protocol's share of ArcFlow swap fees, liquidity lock fees and ArcPay margins. **AKIT** is the token that shares in that revenue.

- **Stake AKIT, earn USDC.** Protocol revenue is distributed to AKIT stakers in proportion to their stake, through Arc Staking itself — the same audited-by-use pool mechanics every other project on Arc Kit uses.
- **More products, more revenue.** Each new product in the [roadmap](/docs/roadmap) adds a fee stream to the same pool.
- **On-chain and checkable.** Distributions are deposits into a public staking pool; anyone can verify amounts and timing on Etherscan.

## Where AKIT trades

AKIT trades on Arc's Uniswap v4 against USDC. You can stake it, and liquidity for it, directly through [Arc Staking](/stake) and [ArcFlow](/flow).

## Utility beyond revenue

- **Fee discounts** on Arc Kit products for holders, as products launch their discount tiers.
- **Early access** to new products in the roadmap.
- **Governance signal** on which product ships next.

> [!NOTE] Distribution schedules and the current revenue share are announced on [@usearckit](https://x.com/usearckit) and reflected in the AKIT staking pool. Nothing here is investment advice.

=== slug: roadmap
title: Future products
group: roadmap
summary: What comes next on Arc Kit. Each product below adds a new fee stream to the AKIT revenue share.
===
## ArcMultisig

A multisig wallet that brings Web2 security to fund transfers. Beyond the usual M-of-N signatures, every transfer requires a one-time code from **email** and from **Google Authenticator**. Even if your private keys are leaked, the wallet cannot be drained unless the OTPs are entered.

## ArcLaunch

A launchpad built on top of Argus, with a twist: the creator decides where trading fees go. Redirect them to **auto buybacks**, to **LP**, or to a public profile on X, GitHub, Telegram, Instagram and more, so a community can fund the people behind a token directly.

## ArcDomains

Buy `.arc` domains and use them to link your website via IPFS. A readable name for your wallet, your project page and your locks, resolved on-chain.

## Arc Redeployment

Move an existing project from another chain to Arc automatically: snapshot the holders, redeploy the contracts, mirror balances, verify the source on arrival.

---

Follow [@usearckit](https://x.com/usearckit) or join [t.me/usearckit](https://t.me/usearckit) for launch dates.

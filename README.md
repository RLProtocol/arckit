# Arc Kit

On-chain tools for teams and users on **Arc**, Circle's USDC-native Layer 1 (chain id 5042, USDC is the gas coin).
Nine products, all live on Arc mainnet, all source-verified on [arc.etherscan.io](https://arc.etherscan.io):
token locks and vesting, bulk airdrops, staking pools, Uniswap v4 liquidity tools, a gift-card shop paid in USDC,
an MCP server that gives AI agents a wallet, a zero-knowledge privacy pool, and isolated USDC lending markets.

Live app: **[usearckit.locker](https://usearckit.locker)** · Docs: **[usearckit.locker/docs](https://usearckit.locker/docs)** (English · 中文 · Bahasa Indonesia)

## Products

| Product | What it does | Contract(s) on Arc | Code |
|---|---|---|---|
| **ArcLock** | Lock tokens or LP until a date, or vest them linearly with a cliff. Every lock has a public certificate page. | TokenLocker [`0xdF26…CFEaf`](https://arc.etherscan.io/address/0xdF2640625231b662A949e0B3C868F9d9109CFEaf#code) · TokenVesting [`0x5d28…11788`](https://arc.etherscan.io/address/0x5d2828b7bDDe377B51713dFa31afbA83C6011788#code) | [`src/TokenLocker.sol`](src/TokenLocker.sol), [`src/TokenVesting.sol`](src/TokenVesting.sol) |
| **Arc Bulk Airdrop** | Send any ERC-20 or native USDC to up to 500 wallets per transaction; batches are all-or-nothing. | [`0x89aD…36EC3`](https://arc.etherscan.io/address/0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3#code) | [`src/BulkAirdrop.sol`](src/BulkAirdrop.sol) |
| **Arc Staking** | Time-boxed reward pools: creator picks duration and deposits rewards; stakers earn per second, APR is derived. | [`0x9b22…6eA46`](https://arc.etherscan.io/address/0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46#code) | [`src/ArcStaking.sol`](src/ArcStaking.sol) · [ARCSTAKING.md](ARCSTAKING.md) |
| **ArcFlow** | Uniswap v4 on Arc made simple: concentrated USDC stakes with streamed fees, shaped LP positions, liquidity locks, a volatility fee hook. | VaultV2 [`0xC30D…38748`](https://arc.etherscan.io/address/0xC30D55758d12ac9FD80459b002085E8528f38748#code) · Positions [`0x16c4…8f759`](https://arc.etherscan.io/address/0x16c40157fF4b49b3328Db3AE352E9eA699b8f759#code) · FeeHook [`0x4FC2…05080`](https://arc.etherscan.io/address/0x4FC207E35226df90c57DBc3CAcD60E6974c05080#code) | [`src/arcflow/`](src/arcflow/) · [arcflow.md](arcflow.md) |
| **ArcPay** | Spend USDC on gift cards and mobile top-ups from thousands of brands in 100+ countries. | Router [`0x958D…0cd2c`](https://arc.etherscan.io/address/0x958Db3732Bfb021c2F2879b9124dECBa0b30cd2c#code) | [`src/ArcPayRouter.sol`](src/ArcPayRouter.sol), [`frontend/src/pages/Pay.tsx`](frontend/src/pages/Pay.tsx) · [backend note](api/PAY_BACKEND.md) |
| **Arc Kit MCP** | An MCP server that gives Claude, Cursor or any agent its own USDC wallet on Arc to buy for you. Published as [`arckit-pay-mcp`](https://www.npmjs.com/package/arckit-pay-mcp). | — | [`mcp/`](mcp/) |
| **ArcCash** | Tornado-style privacy pool: fixed-denomination deposits, Groth16 withdrawal proofs built in the browser, gas paid by a relayer. | Pools [`0xdbf6…e3ebe`](https://arc.etherscan.io/address/0xdbf688e09c296df6ef4a02995427ee637d1e3ebe#code) (1 USDC) · [`0x0303…24e1b`](https://arc.etherscan.io/address/0x0303ae09b4f9f599823634aa9c88b6a517b24e1b#code) (10 USDC) · Verifier [`0x6d25…3e4fd`](https://arc.etherscan.io/address/0x6d25c8ebe5549adf216a48a12660664b8b23e4fd#code) | [`arccash/`](arccash/) · [arccash/README.md](arccash/README.md) |
| **ArcLend** | Isolated USDC money markets with a self-hosted Uniswap v4 TWAP oracle and a fast guardian liquidator. | ArcLend [`0xBF0a…83793`](https://arc.etherscan.io/address/0xBF0aD5CAE94A9e4aBeAeFC7cA5816B7f28983793#code) · Oracle [`0xedf3…62491`](https://arc.etherscan.io/address/0xedf33dA5bED98b5BAbDa4D71F55962CF74462491#code) | [`src/arclend/`](src/arclend/) · [ARCLEND.md](ARCLEND.md) |

Every address, deploy tx, block and parameter is in [`deployments/arc-5042.json`](deployments/arc-5042.json), the
single source of truth the frontend reads.

## Principles

- **Immutable.** No contract has an upgrade path or a pause switch over user funds. Owners can change fees, the
  fee receiver and (for ArcLend) risk parameters within hard caps — nothing else. ArcFlowFeeHook, the ArcCash
  contracts and the TWAP oracle have no owner at all.
- **Verifiable.** All Solidity is verified on Etherscan (`verification/`). Every lock, schedule, pool and position
  has a public page readable without a wallet.
- **Fees in USDC.** Flat 10 USDC to create a lock, vesting schedule, airdrop batch, staking pool or liquidity lock;
  1 % of ArcFlow swap fees; 10 % of ArcLend interest. Fees are pulled by the receiver, never pushed, so a broken
  receiver can never block a user.
- **Isolated where money is at risk.** ArcFlow bands, ArcCash pools and ArcLend markets share nothing with each
  other.

## Repository map

```
src/                 Solidity (0.8.24 / 0.8.26, OpenZeppelin v5, Uniswap v4 core + periphery)
  TokenLocker.sol TokenVesting.sol BulkAirdrop.sol ArcStaking.sol ArcPayRouter.sol
  arcflow/           v1 vault, v2 base/vault/positions/fee hook
  arclend/           ArcLend.sol, ArcTwapOracle.sol
test/                Foundry unit tests; test/arcflow and test/arclend also have --fork-url tests against Arc
script/              Deploy scripts (see notes in each about forge create where forge script cannot broadcast)
deployments/         arc-5042.json (addresses, params, ABIs), the frontend's source of truth
verification/        Exact standard-JSON builds + verify-etherscan.mjs used to verify every contract
frontend/            Vite + React 19 + wagmi/viem app (usearckit.locker)
  src/pages/         one page per product; Docs.tsx renders src/docs/{en,zh,id}.md
  src/i18n/          DOM-level translator + hand-written dictionaries (中文, Bahasa Indonesia)
  src/lib/arccash/   browser port of the ArcCash hashing (MiMC, Pedersen) + snarkjs proving
  public/cash/       ArcCash proving key (20 MB) and witness wasm
api/                 Vercel serverless functions
  rpc.js             same-origin proxy to a private Arc RPC
  cash.js            ArcCash relayer (pays withdrawal gas)
  lend-poke.js       ArcLend oracle keeper (cron, 10 min)
  lend-guard.js      ArcLend guardian liquidator (cron, 1 min, 10 s ticks)
  og.js share.js     Open Graph cards for lock / vest / stake links
  _lib/lend/         guardian logic shared with keeper/liquidator.mjs
  _lib/pay/          NOT in this repo, see api/PAY_BACKEND.md
arccash/             circom circuits, Tornado-style contracts, CLI, e2e tests, README
mcp/                 arckit-pay-mcp server (npm)
keeper/              standalone ArcLend liquidator
marketing/           launch copy; explainer videos are built from marketing/*/video-source
ARCKIT.md ARCSTAKING.md arcflow.md ARCLEND.md   per-product design docs
```

## Running locally

Requirements: Node 20+, [Foundry](https://getfoundry.sh), and for ArcCash circuit work circom 2.2 + snarkjs
(see `arccash/README.md`).

```sh
git clone --recurse-submodules <this repo> && cd arckit
forge build && forge test                       # contracts

cd frontend && npm ci && npm run dev            # app on http://localhost:5173
```

Environment (never committed): a root `.env` with `ARC_RPC_URL` (private RPC used by the dev proxy and scripts)
and `PRIVATE_KEY` for deploys; Vercel env vars for the serverless functions (`ARC_RPC_URL`, `ARCCASH_RELAYER_KEY`,
`ARCLEND_ADDRESS`, `ARCLEND_DEPLOY_BLOCK`, `CRON_SECRET`, Upstash `KV_*`, and the ArcPay variables described in
`api/PAY_BACKEND.md`). Without them the frontend still runs read-only against the public RPCs.

### Fork tests against Arc

```sh
forge test --match-path "test/arcflow/*"  --fork-url $ARC_RPC_URL   # ArcFlow v1 + v2 against live v4 pools
forge test --match-path test/arclend/ArcLend.fork.t.sol --fork-url $ARC_RPC_URL -vv
```

### Arc facts that bite

- USDC is the native coin with **18 decimals** on-chain; the ERC-20 view at `0x3600…0000` has **6**. Uniswap v4
  pools on Arc may quote either — check per pool.
- Public RPCs prune history: `eth_getLogs` from block 0 fails and ranges are capped at 100k blocks. Always scan
  from a contract's deployment block in chunks.
- `rpc.arc-scan.org` drops ~25 % of requests; `5042.rpc.thirdweb.com` is steadier but refuses `eth_getLogs`. The
  frontend uses a ranked `fallback` transport plus the `/api/rpc` proxy.

## Security

The contracts follow well-known designs (Unicrypt-style locks, Compound-style interest indices, Tornado Cash
Classic for ArcCash) and have unit, fork and end-to-end tests, but **they have not been independently audited**.
Use amounts you are comfortable with. Please report vulnerabilities privately to the maintainers on
[X @usearckit](https://x.com/usearckit) or [Telegram](https://t.me/usearckit) before disclosure.

## License

[MIT](LICENSE). Third-party code under `lib/` keeps its own licenses.

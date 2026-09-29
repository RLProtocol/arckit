# ArcCash

A Tornado Cash Classic–style privacy pool for Arc (chain id 5042), where the native gas coin is USDC (18 decimals).
You deposit a fixed denomination together with a commitment, keep a secret **note**, and later withdraw the same
denomination to any address by proving in zero knowledge that you own one of the deposits, without revealing which.

**This is a hobby experiment, not a product.** Read [Caveats](#caveats) before putting anything in it.

## How it works

| Piece | What it does |
| --- | --- |
| `circuits/withdraw.circom` | Groth16 circuit (36,047 constraints). Private: nullifier, secret, Merkle path. Public: root, nullifierHash, recipient, relayer, fee, refund. Commitment = Pedersen(nullifier ‖ secret); tree hash = MiMC sponge (220 rounds). |
| `contracts/MerkleTreeWithHistory.sol` | Incremental 20-level MiMC Merkle tree remembering the last 30 roots. Zero leaf = keccak256("arccash") mod p. |
| `contracts/ArcCash.sol` | `deposit(bytes32 commitment)` payable with exactly the denomination; `withdraw(proof, root, nullifierHash, recipient, relayer, fee, refund)` pays `denomination - fee` to the recipient and `fee` to the relayer. No owner, no pause, no upgrade. `refund` must be 0 (the pool holds the native coin, there is no separate gas token to refund). |
| `contracts/Verifier.sol` | Groth16 verifier exported by snarkjs. |
| `lib/core.mjs` | Note format, hashing (matches circomlibjs and the on-chain hasher bit for bit), Merkle proof rebuild from `Deposit` events, proof generation. |
| `cli.mjs` | `deploy`, `deposit`, `withdraw`, `status`. |

Note format: `arccash-<denomination wei>-<chainId>-0x<31-byte nullifier><31-byte secret>` (124 hex chars).

## Deployed on Arc mainnet

| | Address | Deployed at block |
| --- | --- | --- |
| MiMC hasher | `0x24e6e03c346727423d2ba02aa0a481280378c325` | |
| Groth16 verifier | `0x6d25c8ebe5549adf216a48a12660664b8b23e4fd` | |
| Pool, 1 USDC | `0xdbf688e09c296df6ef4a02995427ee637d1e3ebe` | 22512783 |
| Pool, 10 USDC | `0x0303ae09b4f9f599823634aa9c88b6a517b24e1b` | 22512911 |

Verified live: a 1 USDC deposit (`0xcf9758…3902e`) was withdrawn to a never-funded address through a relayer with a 0.02 USDC fee (`0x48a03d…8479`); the recipient received 0.98 USDC and the note is marked spent.

## Using the CLI

```sh
npm install
export ARCCASH_RPC=https://<your arc rpc>      # see the RPC note below
export ARCCASH_KEY=0x<private key that pays gas>

# deposit 1 USDC. The note is printed AND saved to notes/<chain>-<denom>-<time>.note before the tx is sent.
node cli.mjs deposit --pool 0xdbf688e09c296df6ef4a02995427ee637d1e3ebe

# check a pool, and whether a note is spent
node cli.mjs status --pool 0xdbf688e09c296df6ef4a02995427ee637d1e3ebe --note "$(cat notes/xxx.note)"

# withdraw to a fresh address. Whoever runs this pays gas, so use a *different* key than the depositor,
# and pass --relayer/--fee to compensate it (fee is in USDC, deducted from the withdrawal).
node cli.mjs withdraw --pool 0xdbf688e09c296df6ef4a02995427ee637d1e3ebe --note "$(cat notes/xxx.note)" \
  --to 0xFreshAddress --relayer 0xGasPayer --fee 0.02
```

The note is the money. Lose it and the deposit is gone; nobody, including the deployer, can recover it.

**RPC note.** Withdrawing rebuilds the Merkle tree from `Deposit` events. Public Arc RPCs prune old logs and cap
`eth_getLogs` at 100k blocks, so the CLI scans forward from the pool's deployment block (recorded in
`deployments.json`, or pass `--from-block`) in chunks with retries. If your RPC refuses `eth_getLogs` entirely,
use another one.

## Caveats

- **Anonymity set is tiny.** Privacy comes from other people's deposits. With a handful of deposits, timing alone links you. This is an experiment; do not rely on it for privacy.
- **Trusted setup was done by one party.** Phase 1 uses the public Perpetual Powers of Tau (`pot16.ptau`). Phase 2 (`withdraw_final.zkey`) had a single contribution, by the author. If that contributor kept the toxic waste, they could forge proofs and drain the pools. You have to trust they didn't.
- **No relayer service.** Tornado's privacy in practice relies on relayers so the withdrawing address never needs gas of its own. Here the withdraw tx is sent by whatever key you give the CLI. Withdrawing from the depositing key defeats the purpose.
- **No frontend.** CLI only.
- **Unaudited.** The contracts are a close port of Tornado Cash Classic (which was audited) with the refund path removed, but this code has not been reviewed by anyone else. Foundry unit tests (`forge test`) and a full Anvil end-to-end test (`node test/e2e.mjs`) pass.
- **Immutable.** There is no owner, no pause, no upgrade path. Bugs cannot be fixed in place.
- **Legal.** Privacy pools are regulated or prohibited in some jurisdictions. That is on you.

## Building from source

Requires Node 20+, Foundry, and `circom` 2.2.x (a Windows binary is in `tools/`).

```sh
# 1. circuit
tools/circom circuits/withdraw.circom --r1cs --wasm --sym -o build -l node_modules

# 2. keys (phase 1: Perpetual Powers of Tau, 2^16; phase 2: your own contribution)
npx snarkjs groth16 setup build/withdraw.r1cs keys/pot16.ptau keys/withdraw_0000.zkey
npx snarkjs zkey contribute keys/withdraw_0000.zkey keys/withdraw_final.zkey -e "some entropy"
npx snarkjs zkey export verificationkey keys/withdraw_final.zkey keys/verification_key.json
npx snarkjs zkey export solidityverifier keys/withdraw_final.zkey contracts/Verifier.sol

# 3. MiMC hasher bytecode + zero-subtree table (circomlibjs), then contracts
node scripts/zeros.mjs
forge build && forge test

# 4. local end-to-end against Anvil
anvil &
node test/e2e.mjs
```

A pool deployed from a re-generated zkey will only accept proofs made with that same zkey; the mainnet pools above are bound to the verifier at `0x6d25…e4fd`.

## Relationship to Arc Kit

ArcCash lives in this repository for convenience but is not part of the Arc Kit product, has no UI in the Arc Kit
app, and shares no contracts with it.

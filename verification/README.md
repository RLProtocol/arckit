# Verifying the Arc Kit contracts on arc-scan.org

Do **not** paste `src/TokenLocker.sol` alone: it imports OpenZeppelin, so the
explorer's compiler cannot resolve the imports. Use one of the two prepared
inputs in this folder. Both were generated from the exact build that was
deployed.

## Settings (identical for all three contracts)

| Setting | Value |
|---|---|
| Compiler | `v0.8.24+commit.e11b9ed9` |
| Optimization | **Yes**, `200` runs |
| EVM version | `cancun` |
| viaIR | No |
| License | MIT |
| Constructor arguments (ABI-encoded) | `0000000000000000000000000000000000000000000000000000000000000000` |

The constructor takes one `address` (fee receiver). Every production contract
was deployed with `address(0)`, which makes the constructor fall back to the
deployer, so the encoded argument is 32 zero bytes. Some explorers want it
without the `0x` prefix; others accept either.

## Contracts

| Contract | Address | Flattened source | Standard JSON |
|---|---|---|---|
| TokenLocker | `0xdF2640625231b662A949e0B3C868F9d9109CFEaf` | `TokenLocker.flat.sol` | `TokenLocker.standard-input.json` |
| TokenVesting | `0x5d2828b7bDDe377B51713dFa31afbA83C6011788` | `TokenVesting.flat.sol` | `TokenVesting.standard-input.json` |
| BulkAirdrop | `0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3` | `BulkAirdrop.flat.sol` | `BulkAirdrop.standard-input.json` |

Contract name to enter: exactly `TokenLocker`, `TokenVesting`, `BulkAirdrop`.

## Option A: single flattened file (most explorers)

1. Open the contract's address page on arc-scan.org and choose "Verify &
   publish" (or "Code" then "Verify").
2. Method: **Solidity (single file)**.
3. Compiler `v0.8.24+commit.e11b9ed9`, optimization **Yes** with `200`, EVM
   `cancun`, license MIT.
4. Paste the whole content of the `.flat.sol` file.
5. Constructor arguments: the 64 zeros above.
6. Submit. The explorer recompiles and compares bytecode.

## Option B: Standard JSON input (Blockscout / Etherscan-style explorers)

1. Same page, method **Solidity (standard JSON input)**.
2. Upload the `.standard-input.json` file. It already carries the optimizer,
   EVM version and remappings, so those fields are usually taken from the file.
3. Contract name as above, constructor arguments as above.

Standard JSON is the more faithful option because it keeps the original
multi-file layout and metadata; use it if the explorer offers it.

## If verification fails

- "Bytecode does not match": double-check optimizer **on** with **200** runs
  and EVM **cancun**. Those three are the usual culprits.
- "Constructor arguments mismatch": use the 64-zero string, try with and
  without `0x`.
- Some explorers compare only the code without the trailing metadata hash and
  accept flattened files; others require an exact metadata match and need the
  Standard JSON. If A fails, try B.

## Regenerating these files

```bash
forge flatten src/TokenLocker.sol -o verification/TokenLocker.flat.sol
forge verify-contract 0xdF2640625231b662A949e0B3C868F9d9109CFEaf \
  src/TokenLocker.sol:TokenLocker --show-standard-json-input \
  > verification/TokenLocker.standard-input.json
```

Repeat for the other two. Constructor argument encoding:
`cast abi-encode "constructor(address)" 0x0000000000000000000000000000000000000000`.

## ArcFlowVault (added 2026-09-16)

| Setting | Value |
|---|---|
| Address | `0x439608bFAC5D2B9EcD803649a1b15A9d56900990` |
| Compiler | `v0.8.26+commit.8a97fa7a` |
| Optimization | Yes, 200 runs |
| EVM version | cancun |
| viaIR | No |
| Constructor args | `000000000000000000000000` `8366a39cc670b4001a1121b8f6a443a643e40951` + `000000000000000000000000` `3600000000000000000000000000000000000000` + 32 zero bytes (poolManager, usdc, treasury=0) |

Files: `ArcFlowVault.flat.sol` (single file; the flattened file contains several `pragma` lines from Uniswap and OpenZeppelin, which explorers accept as long as 0.8.26 satisfies them all) and `ArcFlowVault.standard-input.json` (preferred).

## ArcStaking (added 2026-09-17)

| Setting | Value |
|---|---|
| Address | `0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46` |
| Contract name | `ArcStaking` |
| Compiler | `v0.8.26+commit.8a97fa7a` |
| Optimization | Yes, 200 runs |
| EVM version | cancun |
| viaIR | No |
| Constructor args | `0000000000000000000000000000000000000000000000000000000000000000` (feeReceiver = 0 → deployer) |
| Flattened source | `ArcStaking.flat.sol` |
| Standard JSON | `ArcStaking.standard-input.json` |

The test copy at `0xe961a279cbc5f46a5a8f051392eb6e1c5bf016b8` has identical
bytecode and constructor args; verify it the same way if desired.

## ArcFlow v2 (added 2026-09-19)

All three: compiler `v0.8.26+commit.8a97fa7a`, optimization yes with 200 runs, EVM `cancun`, viaIR no, license MIT.

| Contract | Address | Files |
|---|---|---|
| ArcFlowPositions | `0x16c40157fF4b49b3328Db3AE352E9eA699b8f759` | `ArcFlowPositions.flat.sol`, `ArcFlowPositions.standard-input.json` |
| ArcFlowVaultV2 | `0xC30D55758d12ac9FD80459b002085E8528f38748` | `ArcFlowVaultV2.flat.sol`, `ArcFlowVaultV2.standard-input.json` |
| ArcFlowFeeHook | `0x4FC207E35226df90c57DBc3CAcD60E6974c05080` | `ArcFlowFeeHook.flat.sol`, `ArcFlowFeeHook.standard-input.json` |

Constructor arguments (ABI-encoded):

- Positions and VaultV2, `(poolManager, usdc, treasury = 0)`:
  `0000000000000000000000008366a39cc670b4001a1121b8f6a443a643e4095100000000000000000000000036000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`
- FeeHook, `(poolManager)`:
  `0000000000000000000000008366a39cc670b4001a1121b8f6a443a643e40951`

The hook was deployed with CREATE2 through Foundry's deterministic deployer
`0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt `7218`. Some explorers need that noted for CREATE2 contracts.

## Etherscan (arc.etherscan.io) — verified 2026-09-26

All contracts below are verified on Etherscan's Arc explorer. Reproduce with
`ETHERSCAN_KEY=<key> node verification/verify-etherscan.mjs` (stored standard-JSON builds, this folder) and, for
ArcCash, `forge verify-contract … --verifier etherscan --verifier-url "https://api.etherscan.io/v2/api?chainid=5042"`
from `arccash/`. The API key is never stored in the repo; pass it via the environment.

| Contract | Address | Compiler | Constructor args |
|---|---|---|---|
| TokenLocker | 0xdF2640625231b662A949e0B3C868F9d9109CFEaf | 0.8.24 | address(0) |
| TokenVesting | 0x5d2828b7bDDe377B51713dFa31afbA83C6011788 | 0.8.24 | address(0) |
| BulkAirdrop | 0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3 | 0.8.24 | address(0) |
| ArcStaking | 0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46 | 0.8.26 | address(0) |
| ArcFlowVault | 0x439608bFAC5D2B9EcD803649a1b15A9d56900990 | 0.8.26 | (PoolManager, USDC, address(0)) |
| ArcFlowPositions | 0x16c40157fF4b49b3328Db3AE352E9eA699b8f759 | 0.8.26 | (PoolManager, USDC, address(0)) |
| ArcFlowVaultV2 | 0xC30D55758d12ac9FD80459b002085E8528f38748 | 0.8.26 | (PoolManager, USDC, address(0)) |
| ArcFlowFeeHook | 0x4FC207E35226df90c57DBc3CAcD60E6974c05080 | 0.8.26 | (PoolManager) — CREATE2 |
| ArcPayRouter | 0x958Db3732Bfb021c2F2879b9124dECBa0b30cd2c | 0.8.26 | (0xfA0dEA543883A263b862Eb41e630AF685a2AD847) |
| ArcCash Groth16Verifier | 0x6d25c8ebe5549adf216a48a12660664b8b23e4fd | 0.8.26 | none |
| ArcCash pool 1 USDC | 0xdbf688e09c296df6ef4a02995427ee637d1e3ebe | 0.8.26 | (verifier, hasher, 1e18, 20) |
| ArcCash pool 10 USDC | 0x0303ae09b4f9f599823634aa9c88b6a517b24e1b | 0.8.26 | (verifier, hasher, 1e19, 20) |

Not verifiable: the ArcCash MiMC hasher `0x24e6e03c346727423d2ba02aa0a481280378c325` is raw EVM bytecode generated by
circomlibjs (no Solidity source exists). Its correctness is checked instead by `test/ArcCash.t.sol`
(`test_zerosMatchGeneratedTable`) and the e2e test against circomlibjs.

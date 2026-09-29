// Submit the stored exact-build standard-JSON inputs to Etherscan (Arc, chain 5042) and poll the result.
import fs from "node:fs";
const KEY = process.env.ETHERSCAN_KEY, API = "https://api.etherscan.io/v2/api?chainid=5042";
const PM = "0000000000000000000000008366a39cc670b4001a1121b8f6a443a643e40951", USDC = "0000000000000000000000003600000000000000000000000000000000000000", ZERO = "0".repeat(64);
const V24 = "v0.8.24+commit.e11b9ed9", V26 = "v0.8.26+commit.8a97fa7a";
const jobs = [
  ["TokenLocker", "0xdF2640625231b662A949e0B3C868F9d9109CFEaf", "src/TokenLocker.sol", V24, ZERO],
  ["TokenVesting", "0x5d2828b7bDDe377B51713dFa31afbA83C6011788", "src/TokenVesting.sol", V24, ZERO],
  ["BulkAirdrop", "0x89aD5678D3EDB28EE067d430aB384ed4A3136EC3", "src/BulkAirdrop.sol", V24, ZERO],
  ["ArcStaking", "0x9b226f3e6fdF0798da926c9B3686Ef6fE826eA46", "src/ArcStaking.sol", V26, ZERO],
  ["ArcFlowVault", "0x439608bFAC5D2B9EcD803649a1b15A9d56900990", "src/arcflow/ArcFlowVault.sol", V26, PM + USDC + ZERO],
  ["ArcFlowPositions", "0x16c40157fF4b49b3328Db3AE352E9eA699b8f759", "src/arcflow/v2/ArcFlowPositions.sol", V26, PM + USDC + ZERO],
  ["ArcFlowVaultV2", "0xC30D55758d12ac9FD80459b002085E8528f38748", "src/arcflow/v2/ArcFlowVaultV2.sol", V26, PM + USDC + ZERO],
  ["ArcFlowFeeHook", "0x4FC207E35226df90c57DBc3CAcD60E6974c05080", "src/arcflow/v2/ArcFlowFeeHook.sol", V26, PM],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (body) => (await fetch(API, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ apikey: KEY, module: "contract", ...body }) })).json();
const results = [];
for (const [name, address, path, ver, args] of jobs) {
  const already = await post({ action: "getsourcecode", address }).catch(() => null);
  if (already?.result?.[0]?.ContractName) { results.push([name, "already verified as " + already.result[0].ContractName]); continue; }
  const sourceCode = fs.readFileSync(`${name}.standard-input.json`, "utf8");
  const sub = await post({ action: "verifysourcecode", codeformat: "solidity-standard-json-input", sourceCode, contractaddress: address, contractname: `${path}:${name}`, compilerversion: ver, constructorArguements: args });
  if (sub.status !== "1") { results.push([name, "submit failed: " + sub.result]); await sleep(1500); continue; }
  let verdict = "timeout";
  for (let i = 0; i < 20; i++) {
    await sleep(6000);
    const st = await post({ action: "checkverifystatus", guid: sub.result });
    if (!/pending/i.test(st.result)) { verdict = st.result; break; }
  }
  results.push([name, verdict]);
  console.log(name.padEnd(18), verdict);
}
console.log("\nSUMMARY"); for (const [n, v] of results) console.log(" ", n.padEnd(18), v);

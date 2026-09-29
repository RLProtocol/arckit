#!/usr/bin/env node
// ArcLend guardian as a long-running process: polls every market's live price every 10 seconds and liquidates
// underwater positions at spot. Run on any always-on machine (pm2, systemd, Docker):
//
//   ARCLEND_ADDRESS=0x… ARCLEND_DEPLOY_BLOCK=… ARCCASH_RELAYER_KEY=0x… ARC_RPC_URL=https://… node keeper/liquidator.mjs
//
// The wallet must be ArcLend's guardian and hold USDC to repay debt with; it receives the seized collateral.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createGuard } = require("../api/_lib/lend/guard.js");

const LEND = (process.env.ARCLEND_ADDRESS || "").trim();
const DEPLOY_BLOCK = Number(process.env.ARCLEND_DEPLOY_BLOCK || 0);
const KEY = (process.env.ARCCASH_RELAYER_KEY || process.env.GUARDIAN_KEY || "").trim();
const TICK_MS = Number(process.env.TICK_MS || 10_000);
const RESCAN_MS = 60_000;

if (!/^0x[0-9a-fA-F]{40}$/.test(LEND) || !DEPLOY_BLOCK || !/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
  console.error("set ARCLEND_ADDRESS, ARCLEND_DEPLOY_BLOCK and ARCCASH_RELAYER_KEY (or GUARDIAN_KEY)");
  process.exit(2);
}

const guard = createGuard({ lend: LEND, deployBlock: DEPLOY_BLOCK, key: KEY });
console.log(`[guard] watching ArcLend ${LEND} as ${guard.account.address}, every ${TICK_MS / 1000}s`);
let lastScan = 0;
for (;;) {
  try {
    if (Date.now() - lastScan > RESCAN_MS) {
      const n = await guard.refreshBorrowers();
      lastScan = Date.now();
      console.log(`[guard] ${new Date().toISOString()} tracking ${n} borrower position(s)`);
    }
    const actions = await guard.tick();
    for (const a of actions) if (a.error) console.warn(`[guard] market ${a.id} ${a.user}: ${a.error}`);
  } catch (e) {
    console.error("[guard] tick failed:", e.shortMessage || e.message);
  }
  await new Promise((r) => setTimeout(r, TICK_MS));
}

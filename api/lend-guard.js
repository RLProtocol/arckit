// ArcLend guardian on Vercel. The cron hits this every minute; each invocation watches prices for ~50 seconds,
// checking every borrower every 10 seconds and liquidating at spot when a position is underwater. Together with
// the keeper script (keeper/liquidator.mjs) this gives 10-second liquidation latency without a dedicated server.
const { createGuard } = require("./_lib/lend/guard");

const LEND = (process.env.ARCLEND_ADDRESS || "").trim();
const DEPLOY_BLOCK = Number(process.env.ARCLEND_DEPLOY_BLOCK || 0);
const RUN_MS = 50_000;
const TICK_MS = 10_000;

module.exports = async (req, res) => {
  const send = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return send(401, { error: "unauthorized" });
  const key = (process.env.ARCCASH_RELAYER_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key) || !/^0x[0-9a-fA-F]{40}$/.test(LEND) || !DEPLOY_BLOCK) return send(503, { error: "guardian not configured" });
  const guard = createGuard({ lend: LEND, deployBlock: DEPLOY_BLOCK, key });
  const started = Date.now();
  const actions = [];
  let ticks = 0;
  try {
    const known = await guard.refreshBorrowers();
    while (Date.now() - started < RUN_MS) {
      actions.push(...(await guard.tick()));
      ticks++;
      const left = RUN_MS - (Date.now() - started);
      if (left <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(TICK_MS, left)));
    }
    return send(200, { guardian: guard.account.address, borrowers: known, ticks, actions });
  } catch (e) {
    console.error("[lend-guard]", e);
    return send(500, { error: (e && e.shortMessage) || String(e).slice(0, 200), ticks, actions });
  }
};

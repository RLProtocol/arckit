#!/usr/bin/env node
// arckit-pay-mcp: an MCP server that gives an AI assistant a wallet on Arc and lets it buy gift cards and
// mobile top-ups with USDC through ArcPay. Run with no arguments for stdio (Claude Desktop, Claude Code,
// Cursor, Windsurf, Gemini CLI...). `--http <port>` serves the Streamable HTTP transport for remote clients.
//
//   npx arckit-pay-mcp            start the server (stdio)
//   npx arckit-pay-mcp address    print the wallet address to fund
//   npx arckit-pay-mcp setup      print config snippets for popular clients
//   npx arckit-pay-mcp export-key print the private key (asks for --yes)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, formatEther, http, parseAbi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------- config

const API = (process.env.ARCKIT_API || "https://arc-tools.vercel.app").replace(/\/$/, "");
const DIR = process.env.ARCKIT_HOME || path.join(os.homedir(), ".arckit");
const WALLET_FILE = path.join(DIR, "wallet.json");
const CONFIG_FILE = path.join(DIR, "config.json");
const MAX_PER_PURCHASE = Number(process.env.ARCKIT_MAX_PER_PURCHASE || 50); // USDC
const DAILY_LIMIT = Number(process.env.ARCKIT_DAILY_LIMIT || 100); // USDC
const DELIVERY_WAIT_MS = 120_000;

const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARCKIT_RPC || "https://5042.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Arc Scan", url: "https://arc-scan.org" } },
});
const routerAbi = parseAbi(["function pay(bytes32 orderId) payable", "error AlreadyPaid(bytes32 orderId)"]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, obj, mode = 0o600) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), { mode });
}

/** The AI's wallet. Created on first use; or bring your own with ARCKIT_WALLET_KEY. */
function loadAccount() {
  const env = (process.env.ARCKIT_WALLET_KEY || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(env)) return privateKeyToAccount(env);
  let w = readJson(WALLET_FILE, null);
  if (!w || !/^0x[0-9a-fA-F]{64}$/.test(w.privateKey || "")) {
    w = { privateKey: generatePrivateKey(), createdAt: new Date().toISOString() };
    writeJson(WALLET_FILE, w);
  }
  return privateKeyToAccount(w.privateKey);
}
const config = () => readJson(CONFIG_FILE, { country: process.env.ARCKIT_COUNTRY || null, session: null, spend: [] });
const saveConfig = (c) => writeJson(CONFIG_FILE, c);

const account = loadAccount();
const publicClient = createPublicClient({ chain: arc, transport: http() });
const walletClient = createWalletClient({ account, chain: arc, transport: http() });

// ---------------------------------------------------------------- ArcPay API

class ApiError extends Error {}
async function api(op, { query, body } = {}) {
  const qs = new URLSearchParams({ op, ...Object.fromEntries(Object.entries(query || {}).filter(([, v]) => v)) });
  const r = await fetch(`${API}/api/pay?${qs}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || `ArcPay returned HTTP ${r.status}`);
  return j;
}

/** Sign in to ArcPay with the wallet (free, off-chain). Cached for the session lifetime. */
async function session() {
  const c = config();
  if (c.session && c.session.expiresAt > Date.now() + 5 * 60_000 && c.session.address === account.address) return c.session.token;
  const prep = await api("session", { body: { prepare: true, address: account.address } });
  const signature = await account.signMessage({ message: prep.message });
  const s = await api("session", { body: { address: account.address, time: prep.time, signature } });
  saveConfig({ ...c, session: { token: s.token, expiresAt: s.expiresAt, address: account.address } });
  return s.token;
}

// ---------------------------------------------------------------- helpers

const usdc = (units) => (Number(units) / 1e6).toFixed(2);
const money = (v, cur) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: Number(v) % 1 ? 2 : 0 }).format(Number(v));
  } catch {
    return `${v} ${cur}`;
  }
};
const countryName = (c) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c) || c;
  } catch {
    return c;
  }
};
const ok = (text, data) => ({ content: [{ type: "text", text }], structuredContent: data });
const fail = (text, data) => ({ content: [{ type: "text", text }], structuredContent: data, isError: true });

/** Resolve the country to shop in, or explain exactly what the assistant must do. */
function resolveCountry(given) {
  const c = (given || config().country || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return { country: c };
  return {
    error: fail("No country is set. Ask the user which country they are in (or want the gift card for), then call this tool again with `country` as a two-letter code such as US, IN or GB. Offer to remember it with set_default_country.", { needs: "country" }),
  };
}

function productLine(p) {
  const amounts = p.packages.length ? p.packages.map((k) => money(k.value, p.currency)).join(", ") : p.range ? `any amount from ${money(p.range.min, p.currency)} to ${money(p.range.max, p.currency)}` : "";
  return `• ${p.name} (id: ${p.id}) — ${p.category}${amounts ? ` — ${amounts}` : ""}${p.recipient === "phone" ? " — needs the phone number to top up" : ""}`;
}

function spentToday() {
  const cutoff = Date.now() - 24 * 3600_000;
  return config().spend.filter((s) => s.at > cutoff).reduce((a, s) => a + s.usdc, 0);
}
function recordSpend(usdcAmount, orderId) {
  const c = config();
  c.spend = [...c.spend.filter((s) => s.at > Date.now() - 48 * 3600_000), { at: Date.now(), usdc: usdcAmount, orderId }];
  saveConfig(c);
}

function redeemSteps(order) {
  const d = order.delivery || {};
  if (d.instructions) return d.instructions;
  if (order.recipient && order.recipient.phone) return `Nothing to enter: the top-up was sent to ${order.recipient.phone} and usually shows within a few minutes.`;
  const where = (order.product.redeemOn || []).includes("online") ? `${order.product.name}'s website or app` : order.product.name;
  return `1. Open ${where} and find "Redeem a gift card" or "Add funds".\n2. Enter the code${d.pin ? " and PIN" : ""} above.\n3. The ${money(order.value, order.currency)} balance is added to the account.`;
}

function describeOrder(o) {
  const lines = [`Order ${o.id}`, `${o.product.name} · ${money(o.value, o.currency)} · ${usdc(o.chargeUnits)} USDC`, `Status: ${o.state.replace(/_/g, " ")}`];
  if (o.note) lines.push(o.note);
  if (o.state === "delivered" && o.delivery) {
    if (o.delivery.code) lines.push(`Code: ${o.delivery.code}`);
    if (o.delivery.pin) lines.push(`PIN: ${o.delivery.pin}`);
    if (o.delivery.link) lines.push(`Redemption link: ${o.delivery.link}`);
    lines.push("", "How to redeem:", redeemSteps(o));
  }
  if (o.refundTx) lines.push(`Refund transaction: https://arc-scan.org/tx/${o.refundTx}`);
  if (o.state === "needs_support") lines.push(`Reference for support (t.me/usearckit): ${o.id}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- MCP server

function buildServer() {
  const server = new McpServer({ name: "arckit-pay", version: "0.1.0" }, { instructions: "You can buy real gift cards and mobile top-ups for the user with USDC from a wallet you control on the Arc network. Always: (1) know the user's country before browsing or quoting, and ask if you do not; (2) show the user the exact USDC price from `quote` and get a clear yes before calling `buy`; (3) after delivery, show the code and the redeem steps verbatim. Never guess a product id: use browse_products or search_products first." });

  server.registerTool("wallet", { title: "Wallet", description: "The wallet this assistant pays from: address, USDC balance on Arc, spending limits, spent today, and the default country. Call this first when the user asks to buy something, and whenever a purchase fails for lack of funds. To add money the user sends USDC on the Arc network to the address.", inputSchema: {} }, async () => {
    const bal = await publicClient.getBalance({ address: account.address });
    const c = config();
    const data = { address: account.address, network: "Arc (chain id 5042)", balanceUsdc: Number(formatEther(bal)).toFixed(4), maxPerPurchaseUsdc: MAX_PER_PURCHASE, dailyLimitUsdc: DAILY_LIMIT, spentTodayUsdc: spentToday().toFixed(2), defaultCountry: c.country };
    return ok(`Wallet ${data.address} on Arc\nBalance: ${data.balanceUsdc} USDC\nLimits: ${MAX_PER_PURCHASE} USDC per purchase, ${DAILY_LIMIT} USDC per day (spent today: ${data.spentTodayUsdc})\nDefault country: ${c.country ? `${countryName(c.country)} (${c.country})` : "not set"}\n\nTo add funds, send USDC on the Arc network to ${data.address}. Gas on Arc is paid in USDC too, so no other token is needed.`, data);
  });

  server.registerTool("set_default_country", { title: "Set default country", description: "Remember the country to shop in so the user is not asked again. Two-letter code, e.g. US, GB, IN, DE.", inputSchema: { country: z.string().length(2).describe("ISO two-letter country code") } }, async ({ country }) => {
    const c = country.toUpperCase();
    saveConfig({ ...config(), country: c });
    return ok(`Default country set to ${countryName(c)} (${c}).`, { country: c });
  });

  server.registerTool("browse_products", { title: "Browse products", description: "Trending gift cards and top-ups for a country, in that country's currency. Needs a country: pass it, or set_default_country first. Optional category filter: games, entertainment, food, travel, shopping, refill.", inputSchema: { country: z.string().length(2).optional().describe("Two-letter country code; omit to use the default"), category: z.string().optional(), limit: z.number().int().min(1).max(60).optional() } }, async ({ country, category, limit }) => {
    const r = resolveCountry(country);
    if (r.error) return r.error;
    const { items } = await api("products", { query: { country: r.country, category } });
    const list = items.slice(0, limit || 20);
    if (!list.length) return ok(`Nothing is on sale in ${countryName(r.country)} yet. Suggest another country.`, { country: r.country, items: [] });
    return ok(`Trending in ${countryName(r.country)} (${list.length} of ${items.length}):\n${list.map(productLine).join("\n")}\n\nUse get_product for full details, then quote to get the USDC price.`, { country: r.country, items: list });
  });

  server.registerTool("search_products", { title: "Search products", description: "Find a brand or product by name in a country's catalogue, e.g. 'starbucks', 'steam', 'airtel'. Needs a country: pass it, or set_default_country first.", inputSchema: { query: z.string().min(2).max(60), country: z.string().length(2).optional() } }, async ({ query, country }) => {
    const r = resolveCountry(country);
    if (r.error) return r.error;
    const { items } = await api("search", { query: { q: query, country: r.country } });
    if (!items.length) return ok(`No product matching "${query}" in ${countryName(r.country)}. Try another spelling, a similar brand, or another country.`, { country: r.country, items: [] });
    return ok(`Matches for "${query}" in ${countryName(r.country)}:\n${items.slice(0, 15).map(productLine).join("\n")}`, { country: r.country, items: items.slice(0, 15) });
  });

  server.registerTool("get_product", { title: "Product details", description: "Amounts on offer, currency, what the buyer must provide (email or phone), description and brand terms for one product id.", inputSchema: { product_id: z.string() } }, async ({ product_id }) => {
    const { item } = await api("product", { query: { id: product_id } });
    const amounts = item.packages.length ? item.packages.map((k) => money(k.value, item.currency)).join(", ") : "";
    const range = item.range ? `Any amount from ${money(item.range.min, item.currency)} to ${money(item.range.max, item.currency)}.` : "";
    return ok([`${item.name} (${item.id}) · ${item.category} · ${countryName(item.country)}`, amounts ? `Amounts: ${amounts}` : "", range, item.recipient === "phone" ? "Requires: the phone number to top up, with country code." : item.recipient === "email" ? "Requires: an email address for delivery." : "Requires: nothing else. The code is returned to you.", item.description, item.terms ? `Terms: ${item.terms}` : ""].filter(Boolean).join("\n"), { item });
  });

  server.registerTool("quote", { title: "Get a USDC price", description: "Lock a price for one product and amount. Returns the exact USDC the wallet will pay, held for about 10 minutes, plus an order_id. Show the user the price and get an explicit yes before calling buy. Pass `phone` for mobile top-ups and `email` when get_product says one is required.", inputSchema: { product_id: z.string(), value: z.string().describe("Amount in the product's own currency, e.g. '10'"), country: z.string().length(2).optional(), phone: z.string().optional(), email: z.string().optional() } }, async ({ product_id, value, country, phone, email }) => {
    const r = resolveCountry(country);
    if (r.error) return r.error;
    const token = await session();
    const { order } = await api("order", { body: { session: token, productId: product_id, value: String(value), phone, email } });
    const price = Number(order.chargeUnits) / 1e6;
    const bal = Number(formatEther(await publicClient.getBalance({ address: account.address })));
    const limitNote = price > MAX_PER_PURCHASE ? `\nThis is above the ${MAX_PER_PURCHASE} USDC per-purchase limit, so buy will refuse it.` : spentToday() + price > DAILY_LIMIT ? `\nThis would exceed today's ${DAILY_LIMIT} USDC limit, so buy will refuse it.` : "";
    const fundNote = bal < price + 0.01 ? `\nThe wallet holds ${bal.toFixed(2)} USDC, which is not enough. Ask the user to send at least ${(price + 0.02 - bal).toFixed(2)} USDC on Arc to ${account.address}, then call buy.` : "";
    return ok(`${order.product.name} · ${money(order.value, order.currency)}\nPrice: ${price.toFixed(2)} USDC (conversion included)\nPrice held until ${new Date(order.expiresAt).toLocaleTimeString()} (about ${Math.max(1, Math.round((order.expiresAt - Date.now()) / 60000))} minutes)\norder_id: ${order.id}${limitNote}${fundNote}\n\nAsk the user to confirm, then call buy with this order_id.`, { orderId: order.id, priceUsdc: price, expiresAt: order.expiresAt, walletBalanceUsdc: bal, product: order.product, value: order.value, currency: order.currency });
  });

  server.registerTool("buy", { title: "Buy", description: "Pay for a quoted order with the wallet and wait for the code. Only call after the user has seen the USDC price from quote and said yes. Returns the code (or PIN / link) and how to redeem it. If delivery takes longer than two minutes it returns the order_id to check with order_status.", inputSchema: { order_id: z.string().regex(/^0x[0-9a-f]{64}$/), confirm: z.literal("yes").describe("Must be 'yes': confirms the user approved the quoted price") } }, async ({ order_id }) => {
    const token = await session();
    let { order } = await api("status", { body: { session: token, id: order_id } });
    if (order.state !== "awaiting_payment") return ok(describeOrder(order), { order });
    if (Date.now() > order.expiresAt) return fail("That price has expired. Call quote again for a fresh price.", { expired: true });
    const price = Number(order.chargeUnits) / 1e6;
    if (price > MAX_PER_PURCHASE) return fail(`Refused: ${price.toFixed(2)} USDC is above the ${MAX_PER_PURCHASE} USDC per-purchase limit set for this wallet.`, { limit: "per_purchase" });
    if (spentToday() + price > DAILY_LIMIT) return fail(`Refused: this would take today's spending past the ${DAILY_LIMIT} USDC daily limit.`, { limit: "daily" });
    const value = BigInt(order.chargeWei);
    const bal = await publicClient.getBalance({ address: account.address });
    if (bal < value + 10n ** 15n) return fail(`Not enough USDC. The wallet holds ${Number(formatEther(bal)).toFixed(2)} and the order needs ${price.toFixed(2)} plus a little gas. Ask the user to send USDC on Arc to ${account.address}.`, { needs: "funds", address: account.address });

    const hash = await walletClient.sendTransaction({ to: order.router, value, data: encodeFunctionData({ abi: routerAbi, functionName: "pay", args: [order_id] }) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") return fail(`The payment transaction reverted (${hash}). Nothing was charged. Call quote again.`, { hash });
    recordSpend(price, order_id);

    const t0 = Date.now();
    while (Date.now() - t0 < DELIVERY_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 2500));
      ({ order } = await api("status", { body: { session: token, id: order_id } }));
      if (!["awaiting_payment", "paid", "bridging", "bridged", "refunding"].includes(order.state)) break;
    }
    const head = order.state === "delivered" ? "Delivered. Show the user the code and the redeem steps exactly as below." : order.state === "refunded" ? "The order could not be completed and the USDC was refunded to the wallet." : order.state === "needs_support" ? "Paid, but the order needs a manual check. Give the user the reference below." : `Paid (tx ${hash}). Still processing; call order_status with this order_id in a minute.`;
    return ok(`${head}\n\n${describeOrder(order)}\nPayment: https://arc-scan.org/tx/${hash}`, { order, paymentTx: hash });
  });

  server.registerTool("order_status", { title: "Order status", description: "Current state of an order, and the code once delivered.", inputSchema: { order_id: z.string().regex(/^0x[0-9a-f]{64}$/) } }, async ({ order_id }) => {
    const { order } = await api("status", { body: { session: await session(), id: order_id } });
    return ok(describeOrder(order), { order });
  });

  server.registerTool("purchases", { title: "Purchase history", description: "Everything this wallet has bought, newest first, with codes for delivered orders.", inputSchema: { limit: z.number().int().min(1).max(40).optional() } }, async ({ limit }) => {
    const { orders } = await api("history", { body: { session: await session() } });
    const list = orders.slice(0, limit || 10);
    if (!list.length) return ok("No purchases yet from this wallet.", { orders: [] });
    return ok(list.map((o) => `${new Date(o.paidAt || o.createdAt).toLocaleString()} · ${o.product.name} · ${money(o.value, o.currency)} · ${usdc(o.chargeUnits)} USDC · ${o.state.replace(/_/g, " ")}${o.delivery && o.delivery.code ? ` · code ${o.delivery.code}` : ""} · ${o.id}`).join("\n"), { orders: list });
  });

  return server;
}

// ---------------------------------------------------------------- CLI

const CLIENTS = (cmd) => `Claude Desktop / Claude Code / Cursor / Windsurf (add to the MCP config):
{
  "mcpServers": {
    "arckit-pay": { "command": "npx", "args": ["-y", "${cmd}"] }
  }
}

Claude Code, one line:
  claude mcp add arckit-pay -- npx -y ${cmd}

Optional environment variables:
  ARCKIT_COUNTRY=US            default country
  ARCKIT_MAX_PER_PURCHASE=50   USDC limit per purchase (default 50)
  ARCKIT_DAILY_LIMIT=100       USDC limit per 24 hours (default 100)
  ARCKIT_WALLET_KEY=0x...      use your own key instead of the generated one

Remote clients (ChatGPT connectors, hosted agents): run \`${cmd} --http 3333\` behind HTTPS and point the client at /mcp.`;

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "address") return console.log(account.address);
  if (cmd === "setup") return console.log(`Wallet: ${account.address}\nFund it with USDC on Arc (chain id 5042).\n\n${CLIENTS("arckit-pay-mcp")}`);
  if (cmd === "export-key") {
    if (arg !== "--yes") return console.error("This prints the wallet's private key. Anyone with it can spend the wallet. Re-run with --yes to confirm.");
    return console.log(readJson(WALLET_FILE, {}).privateKey || "(using ARCKIT_WALLET_KEY from the environment)");
  }
  if (cmd === "--http") {
    const port = Number(arg || 3333);
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    createServer((req, res) => {
      if (!req.url.startsWith("/mcp")) {
        res.statusCode = 404;
        return res.end("arckit-pay-mcp: POST /mcp");
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => transport.handleRequest(req, res, body ? JSON.parse(body) : undefined));
    }).listen(port, () => console.error(`arckit-pay-mcp listening on http://localhost:${port}/mcp (wallet ${account.address})`));
    return;
  }
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  console.error(`arckit-pay-mcp ready · wallet ${account.address} · API ${API}`);
}

main().catch((e) => {
  console.error("arckit-pay-mcp failed:", e.message);
  process.exit(1);
});

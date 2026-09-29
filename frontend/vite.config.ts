import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // ARC_RPC_URL (no VITE_ prefix) stays server-side: it only feeds the dev proxy below.
  const env = loadEnv(mode, root, "");
  const upstream = env.ARC_RPC_URL;
  let proxy: Record<string, ProxyOptions> | undefined;
  if (upstream) {
    const u = new URL(upstream);
    proxy = {
      "/api/rpc": {
        target: `${u.protocol}//${u.host}`,
        changeOrigin: true,
        secure: true,
        rewrite: () => `${u.pathname}${u.search}`,
      },
    };
  }

  // ArcPay API in development: run the real serverless handler in-process. Without a supplier key it serves
  // the demo catalogue (ARCPAY_MOCK), which is never active on Vercel.
  const repo = path.resolve(root, "..");
  const arcPayDev = {
    name: "arcpay-dev-api",
    configureServer(server: { middlewares: { use: (p: string, h: (req: any, res: any) => void) => void } }) {
      const rootEnv = loadEnv(mode, repo, "");
      for (const [k, val] of Object.entries({ ...rootEnv, ...env })) if (/^(ARCPAY_|ARC_RPC_URL|KV_|UPSTASH_)/.test(k) && !process.env[k]) process.env[k] = val;
      if (!process.env.ARCPAY_PROVIDER_KEY) process.env.ARCPAY_MOCK = process.env.ARCPAY_MOCK ?? "1";
      const keyFile = path.join(repo, ".arcpay-hot.key");
      if (!process.env.ARCPAY_HOT_KEY && fs.existsSync(keyFile)) process.env.ARCPAY_HOT_KEY = fs.readFileSync(keyFile, "utf8").trim();
      const handler = createRequire(import.meta.url)(path.join(repo, "api/pay.js"));
      // ArcCash relayer in development: same handler as production, key from the git-ignored .arccash-relayer.key
      const relayerKeyFile = path.join(repo, ".arccash-relayer.key");
      if (!process.env.ARCCASH_RELAYER_KEY && fs.existsSync(relayerKeyFile)) process.env.ARCCASH_RELAYER_KEY = fs.readFileSync(relayerKeyFile, "utf8").trim();
      const cashHandler = createRequire(import.meta.url)(path.join(repo, "api/cash.js"));
      server.middlewares.use("/api/cash", (req, res) => {
        req.url = "/api/cash" + (req.url === "/" ? "" : req.url);
        void cashHandler(req, res);
      });
      server.middlewares.use("/api/pay", (req, res) => {
        req.url = "/api/pay" + (req.url === "/" ? "" : req.url);
        if (!req.headers["x-vercel-ip-country"] && process.env.ARCPAY_DEV_COUNTRY) req.headers["x-vercel-ip-country"] = process.env.ARCPAY_DEV_COUNTRY;
        void handler(req, res);
      });
    },
  };

  return {
    plugins: [react(), arcPayDev],
    resolve: {
      alias: {
        "@": path.resolve(root, "src"),
        // Single source of truth: the ABI and address exported by the Foundry project.
        "@deployments": path.resolve(root, "../deployments"),
        // ArcCash pool addresses + deployment blocks, written by arccash/cli.mjs deploy.
        "@arccash": path.resolve(root, "../arccash"),
      },
    },
    server: {
      port: 5173,
      fs: { allow: [path.resolve(root, "..")] },
      proxy,
    },
  };
});

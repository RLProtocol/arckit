// Builds the PWA: exports the Expo app for web under /pwa, adds the install metadata to index.html, and copies the
// result into the website (frontend/public/pwa) so Vercel serves it at usearckit.online/pwa.
// Usage: node scripts/build-pwa.cjs   (then commit frontend/public/pwa and deploy)
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist-pwa");
const dest = path.join(root, "..", "frontend", "public", "pwa");

fs.rmSync(out, { recursive: true, force: true });
execSync(`npx expo export -p web --output-dir dist-pwa --clear`, { cwd: root, stdio: "inherit" });

const indexPath = path.join(out, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const head = [
  `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />`,
  `<meta name="theme-color" content="#071426" />`,
  `<meta name="description" content="The Arc wallet with every Arc Kit tool built in." />`,
  `<meta name="apple-mobile-web-app-capable" content="yes" />`,
  `<meta name="mobile-web-app-capable" content="yes" />`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
  `<meta name="apple-mobile-web-app-title" content="Arc Kit" />`,
  `<link rel="manifest" href="/pwa/manifest.webmanifest" />`,
  `<link rel="apple-touch-icon" href="/pwa/icon-180.png" />`,
  `<style>html,body{background:#050d1a;overscroll-behavior:none}</style>`,
  `<script>if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("/pwa/sw.js",{scope:"/pwa/"})})</script>`,
].join("\n    ");
html = html.replace(/<meta name="viewport"[^>]*>/, "").replace(/<title>[^<]*<\/title>/, "<title>Arc Kit</title>").replace("</head>", `    ${head}\n  </head>`);
fs.writeFileSync(indexPath, html);

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(out, dest, { recursive: true });
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`PWA copied to ${path.relative(path.join(root, ".."), dest)} (${(size(dest) / 1e6).toFixed(1)} MB)`);

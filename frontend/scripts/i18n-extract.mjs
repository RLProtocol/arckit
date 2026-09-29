// Collects every user-visible English string from src/**/*.tsx|ts (via the TypeScript AST) so the zh dictionary
// can be kept complete.
//   node scripts/i18n-extract.mjs            prints strings missing from src/i18n/zh.json
//   node scripts/i18n-extract.mjs --all      prints every candidate
//   node scripts/i18n-extract.mjs --json     same, as a {"en": ""} object ready to fill in
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC = path.resolve(import.meta.dirname, "../src");
const DICT = path.resolve(SRC, "i18n/zh.json");
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(tsx|ts)$/.test(f) && !p.includes(`${path.sep}i18n${path.sep}`) && !/\.d\.ts$/.test(f)) files.push(p); } })(SRC);

// attributes / object keys whose string values are code, not copy
const CODE_ATTRS = new Set(["className", "style", "href", "src", "srcSet", "key", "to", "id", "htmlFor", "type", "rel", "target", "role", "name", "autoComplete", "inputMode", "pattern", "viewBox", "d", "fill", "stroke", "cx", "cy", "r", "x", "y", "width", "height", "rx", "transform", "download", "accept", "method", "action", "lang", "dir", "content", "charSet", "aria-hidden", "aria-selected", "aria-expanded", "aria-haspopup", "aria-current", "aria-live", "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "preserveAspectRatio", "textAnchor", "stopColor", "offset", "gradientUnits"]);
const CODE_KEYS = new Set(["key", "queryKey", "functionName", "eventName", "address", "abi", "className", "id", "to", "href", "src", "type", "stateMutability", "internalType", "symbol", "code", "op", "method", "mode", "chainId", "category", "country", "icon", "image", "url", "explorer", "rpc", "rpcUrl", "kind", "status", "state", "stage", "color", "background", "font", "fontFamily", "transform", "transition", "animation", "boxShadow", "gridTemplateColumns", "textDecoration", "border", "padding", "margin", "textDecorationColor", "borderColor", "filter", "cursor", "justifyContent", "alignItems", "flexDirection", "display", "position", "overflow", "flexWrap", "whiteSpace", "wordBreak", "overflowWrap", "objectFit", "borderRadius", "backgroundImage", "backgroundClip", "WebkitBackgroundClip", "value", "protocol", "curve"]);
const CODE_CALLEES = new Set(["parseAbi", "parseAbiItem", "defineChain", "http", "fallback", "keccak256", "stringToBytes", "getAddress", "isAddress", "encodeFunctionData", "encodeAbiParameters", "parseAbiParameters", "toFunctionSelector", "localStorage.getItem", "localStorage.setItem", "sessionStorage.getItem", "sessionStorage.setItem", "console.log", "console.error", "console.warn", "new URL", "fetch", "import", "require", "Intl.DisplayNames", "new Intl.DisplayNames", "matchAll", "test", "replace", "split", "startsWith", "endsWith", "includes", "indexOf", "padStart", "padEnd", "setAttribute", "getAttribute", "querySelector", "querySelectorAll", "createElement", "addEventListener", "removeEventListener", "getItem", "setItem", "removeItem", "match", "join"]);

const found = new Map();
const add = (s, f) => { const t = s.replace(/\s+/g, " ").trim(); if (looksHuman(t) && !found.has(t)) found.set(t, path.relative(SRC, f)); };
function looksHuman(t) {
  if (t.length < 2) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^(0x[0-9a-fA-F]*|https?:\/\/|\/|[a-z]+:\/\/|[a-z]+:[a-z]|#|@)/.test(t)) return false;
  if (/^[a-z][A-Za-z0-9_]*$/.test(t)) return false; // identifiers / keys
  if (/^[A-Z][A-Z0-9_]+$/.test(t)) return false; // CONSTANTS
  if (/^[a-z0-9-]+(\s[a-z0-9-]+)*$/.test(t) && /-/.test(t)) return false; // class lists
  if (/^(function|event|error|struct|constructor)\s/.test(t)) return false; // ABI
  if (/^[\d\s.,:%+-]+$/.test(t)) return false;
  if (/^(application\/|text\/|image\/|multipart\/)/.test(t)) return false;
  if (/^[A-Za-z]+\/[A-Za-z]+$/.test(t)) return false;
  return true;
}
const calleeName = (n) => { try { return n.expression.getText(); } catch { return ""; } };

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isJsxText(n)) { if (n.text.trim()) add(n.text, f); }
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      let skip = false;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isModuleDeclaration(p)) skip = true;
      else if (ts.isJsxAttribute(p)) skip = CODE_ATTRS.has(p.name.getText());
      else if (ts.isPropertyAssignment(p)) skip = p.name === n || CODE_KEYS.has(p.name.getText());
      else if (ts.isElementAccessExpression(p) || ts.isLiteralTypeNode(p) || ts.isEnumMember(p) || ts.isTypeReferenceNode(p)) skip = true;
      else if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) skip = true; // comparisons against enum-like strings
      else if (ts.isCaseClause(p)) skip = true;
      let a = p; let inCodeCall = false;
      for (let i = 0; i < 4 && a; i++, a = a.parent) if (ts.isCallExpression(a) || ts.isNewExpression(a)) { const c = calleeName(a); if ([...CODE_CALLEES].some((k) => c === k || c.endsWith("." + k))) inCodeCall = true; break; }
      if (!skip && !inCodeCall) add(n.text, f);
    } else if (ts.isTemplateExpression(n)) {
      add(n.head.text, f);
      for (const span of n.templateSpans) add(span.literal.text, f);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const dict = fs.existsSync(DICT) ? JSON.parse(fs.readFileSync(DICT, "utf8")) : {};
const all = process.argv.includes("--all");
const out = [...found.keys()].filter((k) => all || !(k in dict)).sort((a, b) => a.localeCompare(b));
if (process.argv.includes("--json")) console.log(JSON.stringify(Object.fromEntries(out.map((k) => [k, ""])), null, 2));
else { for (const k of out) console.log(k); console.error(`\n${out.length} strings${all ? "" : " missing"} (${found.size} total, dictionary ${Object.keys(dict).length})`); }

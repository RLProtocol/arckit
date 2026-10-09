// Lists user-visible English strings in the app that neither the website dictionaries nor the app dictionaries
// translate yet. Usage: node scripts/i18n-extract.cjs [zh|id]   (default zh). Prints a JSON object ready to fill.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const lang = process.argv[2] || "zh";
const root = path.resolve(__dirname, "..");
const dict = {
  ...JSON.parse(fs.readFileSync(path.join(root, "..", "frontend", "src", "i18n", `${lang}.json`), "utf8")),
  ...(fs.existsSync(path.join(root, "src", "i18n", `${lang}-app.json`)) ? JSON.parse(fs.readFileSync(path.join(root, "src", "i18n", `${lang}-app.json`), "utf8")) : {}),
};

const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk(path.join(root, "app"));
walk(path.join(root, "src", "components"));
for (const f of ["src/hooks/useTrade.ts", "src/wallet/useTx.ts", "src/contracts.ts", "src/chain.ts", "src/hooks/useArcKit.ts", "src/argus.ts", "src/hooks/useArgus.ts", "src/tools/abis.ts", "src/tools/airdropParse.ts", "src/tools/cash/index.ts"]) files.push(path.join(root, f));

const UI_PROPS = new Set(["label", "title", "hint", "placeholder", "error", "done", "sub", "subtitle", "text", "name"]);
const looksLikeCopy = (s) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^(https?:|\/|\.\/|@|#|rgba?\(|0x)/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !/^(open|fixed|none|deep|thin|deepest|per|at|for|buy|sell|approve)$/.test(t)) return false; // identifiers
  if (/^[A-Z][A-Za-z]+_\d+[A-Za-z]+$/.test(t)) return false; // font names
  if (/^(arckit|eth_|wallet_|personal_|text|button|center|row|cover|contain|flex|absolute|none|auto|scroll|handled)/.test(t) && !/\s/.test(t)) return false;
  return true;
};

const found = new Map();
const add = (raw, where) => { const t = raw.replace(/\s+/g, " ").trim(); if (looksLikeCopy(t) && !found.has(t)) found.set(t, where); };

for (const f of files) {
  const src = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(root, f);
  const visit = (n) => {
    if (ts.isJsxText(n)) add(n.text, rel);
    else if (ts.isJsxAttribute(n) && n.initializer && UI_PROPS.has(n.name.getText())) {
      if (ts.isStringLiteral(n.initializer)) add(n.initializer.text, rel);
    } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      // string literals rendered as JSX children or returned as messages
      const p = n.parent;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isPropertyAssignment(p) && p.name === n) { /* skip keys/imports */ }
      else if (/ /.test(n.text) || /^[A-Z][a-z]+$/.test(n.text)) add(n.text, rel);
    } else if (ts.isTemplateExpression(n)) {
      // static parts of templates, e.g. "Bought " / ". It is now in your wallet."
      add(n.head.text, rel);
      for (const s of n.templateSpans) add(s.literal.text, rel);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}

const missing = {};
for (const [t] of found) if (dict[t] === undefined) missing[t] = "";
process.stdout.write(JSON.stringify(missing, null, 2) + "\n");
console.error(`${Object.keys(missing).length} untranslated of ${found.size} strings (${lang})`);

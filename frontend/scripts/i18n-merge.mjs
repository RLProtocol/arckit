// Merges src/i18n/parts/<lang>-*.json into src/i18n/<lang>.json for every language present (sorted,
// deduplicated, empty values dropped).
import fs from "node:fs";
import path from "node:path";
const dir = path.resolve(import.meta.dirname, "../src/i18n/parts");
const langs = [...new Set(fs.readdirSync(dir).map((f) => /^([a-z]{2})-.*\.json$/.exec(f)?.[1]).filter(Boolean))];
for (const lang of langs) {
  const out = {};
  let dupes = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(`${lang}-`) && f.endsWith(".json")).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const [k, v] of Object.entries(j)) {
      if (!v) continue;
      if (k in out && out[k] !== v) dupes++;
      out[k] = v;
    }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.resolve(dir, `../${lang}.json`), JSON.stringify(sorted, null, 2) + "\n");
  console.log(`${lang}.json: ${Object.keys(sorted).length} entries${dupes ? `, ${dupes} conflicting duplicates (last wins)` : ""}`);
}

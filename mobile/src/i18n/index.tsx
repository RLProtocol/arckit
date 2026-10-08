// App language: English, 中文 or Bahasa Indonesia. Strings are written in English in the code; every text node and the
// few string props (labels, placeholders, button titles) are looked up in the active dictionary at render time, the
// same way the website translates its DOM. The dictionaries are the website's (shared wording, one source of truth)
// plus app-only entries in ./zh-app.json and ./id-app.json. Anything missing stays English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import zhSite from "../../../frontend/src/i18n/zh.json";
import idSite from "../../../frontend/src/i18n/id.json";
import zhApp from "./zh-app.json";
import idApp from "./id-app.json";
import { PATTERNS_ID, PATTERNS_ZH } from "./patterns";

export type Lang = "en" | "zh" | "id";
export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia" },
];
const KEY = "arckit.lang";

const DICTS: Record<Exclude<Lang, "en">, Record<string, string>> = {
  zh: { ...(zhSite as Record<string, string>), ...(zhApp as Record<string, string>) },
  id: { ...(idSite as Record<string, string>), ...(idApp as Record<string, string>) },
};

/** Phrases with numbers or symbols in them, which an exact lookup cannot catch (see ./patterns.ts). */
const PATTERNS: Record<Exclude<Lang, "en">, [RegExp, string][]> = { zh: PATTERNS_ZH, id: PATTERNS_ID };

let current: Lang = "en";

function lookup(en: string): string | undefined {
  if (current === "en") return undefined;
  const hit = DICTS[current][en];
  if (hit !== undefined) return hit;
  // captured parts are values (amounts, symbols, addresses) and pass through unchanged; "$$" in a pattern is a literal "$"
  for (const [re, out] of PATTERNS[current]) {
    if (!re.test(en)) continue;
    const s = en.replace(re, out);
    return s.endsWith(" · valid phrase, deriving address…") ? s.replace(" · valid phrase, deriving address…", " " + DICTS[current]["· valid phrase, deriving address…"]) : s;
  }
  return undefined;
}

/** Translate one English string into the active language, keeping its surrounding whitespace. */
export function tr(text: string): string {
  if (current === "en" || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!m || !m[2]) return text;
  const out = lookup(m[2].replace(/\s+/g, " "));
  return out === undefined ? text : m[1] + out + m[3];
}

/** Translate the strings in a children list. Nested <Text> elements translate themselves. */
export function trNode(node: ReactNode): ReactNode {
  if (current === "en") return node;
  if (typeof node === "string") return tr(node);
  if (Array.isArray(node)) return node.map((c) => (typeof c === "string" ? tr(c) : c));
  return node;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => { void AsyncStorage.getItem(KEY).then((v) => { if (v === "zh" || v === "id" || v === "en") { current = v; setLangState(v); } }); }, []);
  const setLang = useCallback((l: Lang) => { current = l; setLangState(l); void AsyncStorage.setItem(KEY, l); }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  // every <Text>, Button and Field reads this context, so they all re-render through the new dictionary
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

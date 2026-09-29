/**
 * Site-wide language switch (English, 中文, Bahasa Indonesia) without touching every page: when a non-English
 * language is active, a DOM translator walks the rendered document, swaps each English text node / placeholder /
 * label for its entry in that language's dictionary, and keeps watching for React re-renders. Switching back to
 * English restores the originals. Untranslated strings stay English.
 * Keep the dictionaries complete with `node scripts/i18n-extract.mjs` (parts live in ./parts, merged by
 * `node scripts/i18n-merge.mjs`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import zh from "./zh.json";
import id from "./id.json";

export type Lang = "en" | "zh" | "id";
const KEY = "arckit:lang";
const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;

export const LANGS: { code: Lang; label: string; html: string; locale: string }[] = [
  { code: "en", label: "EN", html: "en", locale: "en-US" },
  { code: "zh", label: "中文", html: "zh-CN", locale: "zh-CN" },
  { code: "id", label: "ID", html: "id", locale: "id-ID" },
];

const DICTS: Record<Exclude<Lang, "en">, Record<string, string>> = { zh, id };

/** Numeric phrases React renders as one text node (template literals), which an exact lookup cannot catch. */
const PATTERNS: Record<Exclude<Lang, "en">, [RegExp, string][]> = {
  zh: [
    [/^s$/, ""], // the plural "s" React renders as its own text node after a translated noun
    [/^Opens (.+)$/, "开启于 $1"],
    [/^ended (.+)$/, "已于 $1 结束"],
    [/^Ends (.+)$/, "结束于 $1"],
    [/^Starts (.+)$/, "开始于 $1"],
    [/^Unlocks on (.+)$/, "解锁于 $1"],
    [/^Locked until (.+)$/, "锁定至 $1"],
    [/^Since (.+)$/, "自 $1"],
    [/^(\d[\d,.]*) deposits?$/, "$1 笔存款"],
    [/^(\d[\d,.]*) unspent$/, "$1 笔未提取"],
    [/^(\d[\d,.]*) still inside$/, "$1 笔仍在池中"],
    [/^(\d[\d,.]*) items?$/, "$1 件商品"],
    [/^(\d[\d,.]*) locks?$/, "$1 个锁仓"],
    [/^(\d[\d,.]*) pools?$/, "$1 个矿池"],
    [/^(\d[\d,.]*) days?$/, "$1 天"],
    [/^(\d[\d,.]*) hours?$/, "$1 小时"],
    [/^(\d[\d,.]*) minutes?$/, "$1 分钟"],
    [/^(\d[\d,.]*) seconds?$/, "$1 秒"],
    [/^(\d[\d,.]*) months?$/, "$1 个月"],
    [/^(\d[\d,.]*) years?$/, "$1 年"],
    [/^(\d[\d,.]*) recipients?$/, "$1 位接收者"],
    [/^(\d[\d,.]*) wallets?$/, "$1 个钱包"],
    [/^(\d[\d,.]*) tokens?$/, "$1 个代币"],
    [/^(\d[\d,.]*) rows?$/, "$1 行"],
    [/^(\d[\d,.]*) decimals$/, "$1 位小数"],
    [/^(\d[\d,.]*) days? left$/, "剩余 $1 天"],
    [/^Proof ready in ([\d.]+)s and verified locally\. Your note is leaf (\d+) of (\d+); the proof does not reveal that\.$/, "证明已在 $1 秒内生成并在本地验证通过。你的票据是第 $2 / $3 个叶节点；证明不会泄露这一点。"],
    [/^(1|10) USDC deposited\. Your note is now worth (1|10) USDC\.$/, "已存入 $1 USDC。你的票据现在价值 $2 USDC。"],
    [/^(1|10) USDC sent to (.+)\.$/, "$1 USDC 已发送至 $2。"],
    [/^Withdraw (1|10) USDC to (.+)$/, "提取 $1 USDC 至 $2"],
    [/^Continue with (1|10) USDC$/, "继续，存入 $1 USDC"],
    [/^Deposit (1|10) USDC$/, "存入 $1 USDC"],
    [/^Trending in (.+)$/, "$1 的热门商品"],
    [/^Results for “(.+)”$/, "“$1” 的搜索结果"],
  ],
  id: [
    [/^s$/, ""], // Indonesian has no plural -s
    [/^Opens (.+)$/, "Dibuka $1"],
    [/^ended (.+)$/, "berakhir $1"],
    [/^Ends (.+)$/, "Berakhir $1"],
    [/^Starts (.+)$/, "Mulai $1"],
    [/^Unlocks on (.+)$/, "Terbuka pada $1"],
    [/^Locked until (.+)$/, "Terkunci hingga $1"],
    [/^Since (.+)$/, "Sejak $1"],
    [/^(\d[\d,.]*) deposits?$/, "$1 setoran"],
    [/^(\d[\d,.]*) unspent$/, "$1 belum ditarik"],
    [/^(\d[\d,.]*) still inside$/, "$1 masih di dalam"],
    [/^(\d[\d,.]*) items?$/, "$1 item"],
    [/^(\d[\d,.]*) locks?$/, "$1 kunci"],
    [/^(\d[\d,.]*) pools?$/, "$1 pool"],
    [/^(\d[\d,.]*) days?$/, "$1 hari"],
    [/^(\d[\d,.]*) hours?$/, "$1 jam"],
    [/^(\d[\d,.]*) minutes?$/, "$1 menit"],
    [/^(\d[\d,.]*) seconds?$/, "$1 detik"],
    [/^(\d[\d,.]*) months?$/, "$1 bulan"],
    [/^(\d[\d,.]*) years?$/, "$1 tahun"],
    [/^(\d[\d,.]*) recipients?$/, "$1 penerima"],
    [/^(\d[\d,.]*) wallets?$/, "$1 dompet"],
    [/^(\d[\d,.]*) tokens?$/, "$1 token"],
    [/^(\d[\d,.]*) rows?$/, "$1 baris"],
    [/^(\d[\d,.]*) decimals$/, "$1 desimal"],
    [/^(\d[\d,.]*) days? left$/, "$1 hari tersisa"],
    [/^Proof ready in ([\d.]+)s and verified locally\. Your note is leaf (\d+) of (\d+); the proof does not reveal that\.$/, "Bukti siap dalam $1 d dan terverifikasi secara lokal. Catatan Anda adalah daun $2 dari $3; bukti tidak mengungkapkan hal itu."],
    [/^(1|10) USDC deposited\. Your note is now worth (1|10) USDC\.$/, "$1 USDC disetor. Catatan Anda kini bernilai $2 USDC."],
    [/^(1|10) USDC sent to (.+)\.$/, "$1 USDC dikirim ke $2."],
    [/^Withdraw (1|10) USDC to (.+)$/, "Tarik $1 USDC ke $2"],
    [/^Continue with (1|10) USDC$/, "Lanjutkan dengan $1 USDC"],
    [/^Deposit (1|10) USDC$/, "Setor $1 USDC"],
    [/^Trending in (.+)$/, "Tren di $1"],
    [/^Results for “(.+)”$/, "Hasil untuk “$1”"],
  ],
};

// the dictionary the DOM walker currently translates into (set when a language is activated)
let dict: Record<string, string> = {};
let patterns: [RegExp, string][] = [];

function lookup(en: string): string | undefined {
  const hit = dict[en];
  if (hit !== undefined) return hit;
  for (const [re, out] of patterns) if (re.test(en)) return en.replace(re, out);
  return undefined;
}

/** Translate `text`, preserving its leading/trailing whitespace. */
function translateText(text: string): string | undefined {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!m || !m[2]) return undefined;
  const out = lookup(m[2].replace(/\s+/g, " "));
  return out === undefined ? undefined : m[1] + out + m[3];
}

const originals = new WeakMap<Node, string>(); // node -> English text as React last set it
const attrOriginals = new WeakMap<Element, Record<string, string>>();
let applying = false; // our own writes must not re-trigger the observer

function applyToText(node: Text) {
  const current = node.data;
  const known = originals.get(node);
  // React re-rendered (or first sight): remember the English, then translate
  if (known === undefined || (current !== known && translateText(known) !== current)) originals.set(node, current);
  const en = originals.get(node)!;
  const out = translateText(en);
  if (out !== undefined && node.data !== out) node.data = out;
}
function applyToElement(el: Element) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const current = el.getAttribute(a)!;
    const store = attrOriginals.get(el) ?? {};
    const known = store[a];
    if (known === undefined || (current !== known && lookup(known) !== current)) store[a] = current;
    attrOriginals.set(el, store);
    const out = lookup(store[a]);
    if (out !== undefined && current !== out) el.setAttribute(a, out);
  }
}
function walk(root: Node) {
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.ELEMENT_NODE) return /^(SCRIPT|STYLE|CODE|TEXTAREA|INPUT)$/.test((n as Element).tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n: Node | null = root; n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) applyToText(n as Text);
    else if (n.nodeType === Node.ELEMENT_NODE) applyToElement(n as Element);
  }
  // inputs/textareas were rejected for their text but still carry placeholders
  if (root instanceof Element) root.querySelectorAll("input, textarea").forEach(applyToElement);
}
/**
 * Put the English back, but only where the node still holds the translation we wrote. React commits the next
 * render before this cleanup runs, so a node it already changed (e.g. docs pages, which render each language
 * natively) must be left alone or we would overwrite fresh content with a stale original.
 */
function restore(root: Node) {
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = root; n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const en = originals.get(n);
      if (en === undefined) continue;
      const t = translateText(en);
      if (t !== undefined && (n as Text).data === t) (n as Text).data = en;
      originals.delete(n);
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element; const store = attrOriginals.get(el);
      if (!store) continue;
      for (const [a, v] of Object.entries(store)) { const t = lookup(v); if (t !== undefined && el.getAttribute(a) === t) el.setAttribute(a, v); }
      attrOriginals.delete(el);
    }
  }
}

function startTranslating(root: HTMLElement, lang: Exclude<Lang, "en">): () => void {
  dict = DICTS[lang];
  patterns = PATTERNS[lang];
  applying = true; walk(root); applying = false;
  const obs = new MutationObserver((muts) => {
    if (applying) return;
    applying = true;
    for (const m of muts) {
      if (m.type === "characterData") applyToText(m.target as Text);
      else if (m.type === "attributes") applyToElement(m.target as Element);
      else m.addedNodes.forEach((n) => walk(n));
    }
    applying = false;
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  return () => { obs.disconnect(); applying = true; restore(root); applying = false; dict = {}; patterns = []; };
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { const v = localStorage.getItem(KEY); if (isLang(v)) return v; } catch { /* private mode */ }
    return "en";
  });
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } }, []);
  useEffect(() => {
    document.documentElement.lang = LANGS.find((l) => l.code === lang)!.html;
    if (lang === "en") return;
    return startTranslating(document.body, lang);
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** The EN / 中文 / ID toggle in the nav. */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} type="button" className={lang === l.code ? "on" : ""} onClick={() => setLang(l.code)} aria-pressed={lang === l.code} lang={l.html}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

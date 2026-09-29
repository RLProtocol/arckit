import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useParams, Navigate } from "react-router-dom";
import { useLang, type Lang } from "@/i18n";
import enSrc from "@/docs/en.md?raw";
import zhSrc from "@/docs/zh.md?raw";
import idSrc from "@/docs/id.md?raw";

/**
 * GitBook-style documentation at /docs and /docs/:slug. Content is Markdown, one file per language
 * (src/docs/<lang>.md), split into pages by "=== slug: <slug>" blocks with a few metadata lines each.
 * Rendered by the small Markdown renderer below (headings, lists, tables, images, callouts, inline code/links).
 */

type Page = { slug: string; title: string; group: string; summary: string; body: string };
const GROUP_ORDER = ["start", "products", "protocol", "roadmap"] as const;
type Group = (typeof GROUP_ORDER)[number];

const UI: Record<Lang, { docs: string; groups: Record<Group, string>; onThisPage: string; prev: string; next: string; search: string; noResults: string; edited: string; menu: string }> = {
  en: { docs: "Docs", groups: { start: "Getting started", products: "Products", protocol: "Protocol", roadmap: "Roadmap" }, onThisPage: "On this page", prev: "Previous", next: "Next", search: "Search the docs…", noResults: "Nothing matches.", edited: "Arc Kit documentation", menu: "Menu" },
  zh: { docs: "文档", groups: { start: "快速开始", products: "产品", protocol: "协议", roadmap: "路线图" }, onThisPage: "本页内容", prev: "上一页", next: "下一页", search: "搜索文档…", noResults: "没有匹配的内容。", edited: "Arc Kit 文档", menu: "菜单" },
  id: { docs: "Dokumentasi", groups: { start: "Memulai", products: "Produk", protocol: "Protokol", roadmap: "Roadmap" }, onThisPage: "Di halaman ini", prev: "Sebelumnya", next: "Berikutnya", search: "Cari dokumentasi…", noResults: "Tidak ada yang cocok.", edited: "Dokumentasi Arc Kit", menu: "Menu" },
};

function parsePages(src: string): Page[] {
  const pages: Page[] = [];
  const parts = src.split(/^=== slug: (.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const slug = parts[i].trim();
    const rest = parts[i + 1] ?? "";
    const end = rest.indexOf("\n===");
    const meta = rest.slice(0, end).trim().split("\n");
    const body = rest.slice(end + 4).trim();
    const m: Record<string, string> = {};
    for (const line of meta) { const k = line.indexOf(":"); if (k > 0) m[line.slice(0, k).trim()] = line.slice(k + 1).trim(); }
    pages.push({ slug, title: m.title ?? slug, group: m.group ?? "start", summary: m.summary ?? "", body });
  }
  return pages;
}
const CONTENT: Record<Lang, Page[]> = { en: parsePages(enSrc), zh: parsePages(zhSrc), id: parsePages(idSrc) };

// ------------------------------------------------------------------ markdown

const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

function inline(text: string): ReactNode[] {
  // images, links, bold, code — in that priority, left to right
  const out: ReactNode[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<img key={k++} src={m[2]} alt={m[1]} loading="lazy" />);
    else if (m[4] !== undefined) out.push(/^https?:/.test(m[4]) ? <a key={k++} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a> : <Link key={k++} to={m[4]}>{m[3]}</Link>);
    else if (m[5] !== undefined) out.push(<strong key={k++}>{m[5]}</strong>);
    else if (m[6] !== undefined) out.push(<code key={k++}>{m[6]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Heading = { id: string; text: string; level: 2 | 3 };

function renderMarkdown(md: string): { nodes: ReactNode[]; headings: Heading[] } {
  const lines = md.split("\n");
  const nodes: ReactNode[] = [];
  const headings: Heading[] = [];
  let i = 0, k = 0;
  const para: string[] = [];
  const flush = () => { if (para.length) { nodes.push(<p key={k++}>{inline(para.join(" "))}</p>); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h) { flush(); const level = h[1].length as 2 | 3; const text = h[2]; const id = slugify(text); headings.push({ id, text, level }); nodes.push(level === 2 ? <h2 key={k++} id={id}>{inline(text)}</h2> : <h3 key={k++} id={id}>{inline(text)}</h3>); i++; continue; }
    if (/^---+$/.test(line)) { flush(); nodes.push(<hr key={k++} />); i++; continue; }
    if (/^!\[/.test(line)) { flush(); const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim()); if (m) nodes.push(<figure key={k++} className="doc-fig"><img src={m[2]} alt={m[1]} loading="lazy" />{m[1] && <figcaption>{m[1]}</figcaption>}</figure>); i++; continue; }
    if (/^> /.test(line)) {
      flush(); const buf: string[] = []; let kind = "note";
      while (i < lines.length && /^> ?/.test(lines[i])) { buf.push(lines[i].replace(/^> ?/, "")); i++; }
      const first = buf[0] ?? ""; const km = /^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/.exec(first);
      if (km) { kind = km[1].toLowerCase(); buf[0] = km[2]; }
      nodes.push(<div key={k++} className={`doc-callout ${kind}`}>{buf.filter(Boolean).map((t, j) => <p key={j}>{inline(t)}</p>)}</div>); continue;
    }
    if (/^\|/.test(line)) {
      flush(); const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) { const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()); if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells); i++; }
      const [head, ...body] = rows;
      nodes.push(<div key={k++} className="doc-table"><table><thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead><tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^[-*] /.test(line)) { flush(); const items: string[] = []; while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].slice(2)); i++; } nodes.push(<ul key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>); continue; }
    if (/^\d+\. /.test(line)) { flush(); const items: string[] = []; while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; } nodes.push(<ol key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>); continue; }
    if (/^```/.test(line)) { flush(); const buf: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; } i++; nodes.push(<pre key={k++}><code>{buf.join("\n")}</code></pre>); continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return { nodes, headings };
}

// ------------------------------------------------------------------ page

export function Docs() {
  const { slug } = useParams();
  const { lang } = useLang();
  const ui = UI[lang];
  const pages = CONTENT[lang];
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);

  const page = pages.find((p) => p.slug === slug);
  const index = pages.findIndex((p) => p.slug === slug);
  const rendered = useMemo(() => (page ? renderMarkdown(page.body) : null), [page]);

  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [slug]);
  useEffect(() => { if (page) document.title = `${page.title} · ${ui.edited}`; return () => { document.title = "Arc Kit"; }; }, [page, ui.edited]);

  if (!slug) return <Navigate to={`/docs/${pages[0].slug}`} replace />;
  if (!page || !rendered) return <Navigate to={`/docs/${pages[0].slug}`} replace />;

  const filter = q.trim().toLowerCase();
  const visible = filter ? pages.filter((p) => p.title.toLowerCase().includes(filter) || p.summary.toLowerCase().includes(filter) || p.body.toLowerCase().includes(filter)) : pages;
  const prev = index > 0 ? pages[index - 1] : undefined;
  const next = index < pages.length - 1 ? pages[index + 1] : undefined;
  const toc = rendered.headings.filter((h) => h.level === 2);

  return (
    <div className="docs">
      <button type="button" className="docs-menu-btn btn btn-soft btn-sm" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>☰ {ui.menu}</button>
      <aside className={`docs-side ${menu ? "open" : ""}`}>
        <div className="docs-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui.search} aria-label={ui.search} />
        </div>
        <nav aria-label={ui.docs}>
          {GROUP_ORDER.map((g) => {
            const items = visible.filter((p) => p.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="docs-group">
                <div className="docs-group-title">{ui.groups[g]}</div>
                {items.map((p) => <NavLink key={p.slug} to={`/docs/${p.slug}`} className={({ isActive }) => (isActive ? "on" : "")}>{p.title}</NavLink>)}
              </div>
            );
          })}
          {filter && visible.length === 0 && <div className="tiny faint" style={{ padding: "8px 12px" }}>{ui.noResults}</div>}
        </nav>
      </aside>

      <article className="docs-main">
        <div className="docs-crumbs"><Link to="/docs">{ui.docs}</Link><span>/</span><span>{ui.groups[page.group as Group]}</span></div>
        <h1>{page.title}</h1>
        {page.summary && <p className="docs-summary">{page.summary}</p>}
        <div className="docs-body">{rendered.nodes}</div>
        <div className="docs-pager">
          {prev ? <Link to={`/docs/${prev.slug}`} className="docs-pager-link"><span className="tiny faint">← {ui.prev}</span><strong>{prev.title}</strong></Link> : <span />}
          {next ? <Link to={`/docs/${next.slug}`} className="docs-pager-link right"><span className="tiny faint">{ui.next} →</span><strong>{next.title}</strong></Link> : <span />}
        </div>
      </article>

      <aside className="docs-toc">
        {toc.length > 1 && (
          <>
            <div className="kicker">{ui.onThisPage}</div>
            {toc.map((h) => <a key={h.id} href={`#${h.id}`}>{h.text}</a>)}
          </>
        )}
      </aside>
    </div>
  );
}

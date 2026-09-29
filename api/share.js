// Crawler-facing HTML for /lock/:id and /vest/:id with per-item Open Graph tags.
// vercel.json routes only known link-preview bots here; humans get the SPA.
import { getLock, getVesting, getPool, getToken, fmtAmount, fmtDateUTC, nowSec, vestedAt, poolAprBps, fmtApr } from "./_lib/og/chain.js";

export const config = { runtime: "edge" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function describe(type, id, SITE) {
  const base = { title: "Arc Kit — lock, vest, stake and airdrop on Arc", desc: "Public, verifiable token locks, vesting, staking pools and airdrops on Arc.", image: `${SITE}/api/og?type=brand`, path: "/" };
  if (!id || !/^\d+$/.test(id)) return base;
  try {
    if (type === "lock") {
      const l = await getLock(id);
      if (!l) return { ...base, title: `Lock #${id} not found — Arc Kit`, path: `/lock/${id}` };
      const t = await getToken(l.token);
      const now = nowSec();
      const un = fmtDateUTC(l.unlockDate);
      const status = l.amount === 0n ? "Withdrawn" : now >= Number(l.unlockDate) ? "Unlocked" : "Locked";
      return {
        title: `${fmtAmount(l.amount, t.decimals)} ${t.symbol} locked until ${un.date} — Arc Kit`,
        desc: `${status}. ${fmtAmount(l.amount, t.decimals)} ${t.symbol} in ArcLock lock #${id} on Arc, unlocks ${un.date} ${un.time}. Verify it on-chain.`,
        image: `${SITE}/api/og?type=lock&id=${id}`,
        path: `/lock/${id}`,
      };
    }
    if (type === "vest") {
      const v = await getVesting(id);
      if (!v) return { ...base, title: `Vesting #${id} not found — Arc Kit`, path: `/vest/${id}` };
      const t = await getToken(v.token);
      const now = nowSec();
      const end = fmtDateUTC(v.end);
      const pct = v.total === 0n ? 0 : Number((vestedAt(v, now) * 1000n) / v.total) / 10;
      return {
        title: `${fmtAmount(v.total, t.decimals)} ${t.symbol} vesting until ${end.date} — Arc Kit`,
        desc: `${pct}% vested. ${fmtAmount(v.total, t.decimals)} ${t.symbol} in ArcLock vesting schedule #${id} on Arc, fully vested ${end.date}. Verify it on-chain.`,
        image: `${SITE}/api/og?type=vest&id=${id}`,
        path: `/vest/${id}`,
      };
    }
    if (type === "stake") {
      const p = await getPool(id);
      if (!p) return { ...base, title: `Staking pool #${id} not found — Arc Kit`, path: `/stake/${id}` };
      const same = p.cfg.stakeToken.toLowerCase() === p.cfg.rewardToken.toLowerCase();
      const st = await getToken(p.cfg.stakeToken);
      const rt = same ? st : await getToken(p.cfg.rewardToken);
      const now = nowSec();
      const end = fmtDateUTC(p.periodFinish);
      const ended = now >= Number(p.periodFinish);
      const aprText = same ? (p.totalStaked === 0n && !ended ? "Nobody staked yet." : fmtApr(poolAprBps(p, now)) + " APR right now.") : "Rewards paid in " + rt.symbol + ".";
      const pen = p.cfg.penaltyBps > 0 ? " " + Number(p.cfg.penaltyBps) / 100 + "% early-exit penalty." : " No lock, no penalty.";
      return {
        title: `Stake ${st.symbol}, earn ${same ? "more " + st.symbol : rt.symbol} — Arc Kit`,
        desc: `${ended ? "Ended." : aprText} ${fmtAmount(p.totalStaked, st.decimals)} ${st.symbol} staked, ${fmtAmount(p.totalRewardsAdded, rt.decimals)} ${rt.symbol} in rewards, ends ${end.date}.${pen} Pool #${id} on Arc.`,
        image: `${SITE}/api/og?type=stake&id=${id}`,
        path: `/stake/${id}`,
      };
    }
  } catch {
    /* fall through to brand */
  }
  return { ...base, path: `/${type}/${id}` };
}

export default async function handler(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "lock";
  const id = url.searchParams.get("id") || "";
  const SITE = url.origin;
  const d = await describe(type, id, SITE);
  const canonical = `${SITE}${d.path}`;

  const tags = `
    <title>${esc(d.title)}</title>
    <meta name="description" content="${esc(d.desc)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Arc Kit" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${esc(d.title)}" />
    <meta property="og:description" content="${esc(d.desc)}" />
    <meta property="og:image" content="${d.image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@usearckit" />
    <meta name="twitter:title" content="${esc(d.title)}" />
    <meta name="twitter:description" content="${esc(d.desc)}" />
    <meta name="twitter:image" content="${d.image}" />`;

  // Reuse the real app shell so a bot that does render JS still gets the page.
  let html = "";
  try {
    const r = await fetch(`${url.origin}/index.html`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) html = await r.text();
  } catch {
    /* fall back to a minimal shell */
  }
  if (html.includes("<head>")) {
    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, "")
      .replace(/<meta (?:property|name)="(?:og:|twitter:|description)[^"]*"[^>]*>\s*/gi, "")
      .replace("<head>", `<head>${tags}`);
  } else {
    html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />${tags}<meta http-equiv="refresh" content="0;url=${canonical}" /></head><body><a href="${canonical}">${esc(d.title)}</a></body></html>`;
  }

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=600",
    },
  });
}

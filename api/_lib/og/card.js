// Element trees for the share cards, rendered by @vercel/og (satori).
// Satori needs explicit display:flex on any container with several children.
import { SITE, hostOf, fmtAmount, fmtDateUTC, shortAddr, durationText, nowSec, vestedAt, poolAprBps, fmtApr, poolRemaining } from "./chain.js";

const h = (type, props, ...children) => ({ type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } });

const C = {
  bg: "#071426",
  bg2: "#0b1d36",
  teal: "#0f5c6b",
  text: "#eef4ff",
  dim: "#a9b9d6",
  faint: "#6f83a6",
  accent: "#8fb3ff",
  accentSoft: "rgba(143,179,255,0.16)",
  accentLine: "rgba(143,179,255,0.45)",
  aqua: "#5fe3c9",
  aquaSoft: "rgba(95,227,201,0.16)",
  line: "rgba(214,230,255,0.12)",
};

function frame(children) {
  return h(
    "div",
    {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: `linear-gradient(160deg, ${C.bg} 0%, ${C.bg2} 55%, ${C.teal} 100%)`,
        color: C.text,
        fontFamily: "sans-serif",
        padding: "56px 64px",
        overflow: "hidden",
      },
    },
    // arc sweeps
    h("div", { style: { position: "absolute", width: "1100px", height: "1100px", right: "-420px", top: "-640px", border: `2px solid ${C.line}`, borderRadius: "9999px", display: "flex" } }),
    h("div", { style: { position: "absolute", width: "1400px", height: "1400px", right: "-620px", top: "-820px", border: `1px solid ${C.line}`, borderRadius: "9999px", display: "flex" } }),
    h("div", { style: { position: "absolute", width: "360px", height: "6px", right: "120px", top: "110px", background: "rgba(214,230,255,0.06)", borderRadius: "3px", display: "flex" } }),
    h("div", { style: { position: "absolute", width: "260px", height: "6px", right: "60px", top: "430px", background: "rgba(214,230,255,0.06)", borderRadius: "3px", display: "flex" } }),
    ...children,
  );
}

function header(subtitle, site = SITE) {
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "16px" } },
      h("img", { src: `${site}/icon-180.png`, width: 56, height: 56, style: { borderRadius: "14px" } }),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { fontSize: "34px", fontWeight: 700, letterSpacing: "-0.5px", display: "flex" } }, "Arc Kit"),
        h("div", { style: { fontSize: "18px", color: C.dim, display: "flex" } }, subtitle),
      ),
    ),
    h("div", { style: { fontSize: "18px", color: C.faint, display: "flex" } }, hostOf(site)),
  );
}

function pill(text, kind) {
  const bg = kind === "open" ? C.aquaSoft : C.accentSoft;
  const fg = kind === "open" ? C.aqua : C.accent;
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 20px", borderRadius: "9999px", background: bg, border: `1px solid ${fg}`, color: fg, fontSize: "20px", fontWeight: 700, letterSpacing: "3px" } },
    h("div", { style: { width: "10px", height: "10px", borderRadius: "9999px", background: fg, display: "flex" } }),
    text,
  );
}

function stat(label, value, sub, align = "flex-start") {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", alignItems: align } },
    h("div", { style: { fontSize: "64px", fontWeight: 700, letterSpacing: "-1.5px", lineHeight: 1.05, display: "flex" } }, value),
    h("div", { style: { fontSize: "18px", color: C.faint, letterSpacing: "3px", marginTop: "10px", display: "flex" } }, label),
    sub ? h("div", { style: { fontSize: "18px", color: C.dim, marginTop: "6px", display: "flex" } }, sub) : h("div", { style: { display: "flex" } }),
  );
}

function footer(left, right) {
  return h(
    "div",
    { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%", borderTop: `1px dashed ${C.line}`, paddingTop: "22px", marginTop: "auto" } },
    h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", color: C.faint, fontSize: "17px" } }, ...left.map((t) => h("div", { style: { display: "flex" } }, t))),
    h("div", { style: { display: "flex", alignItems: "center", gap: "10px", color: C.dim, fontSize: "20px", fontWeight: 700 } }, right),
  );
}

/** Lock certificate card. */
export function lockCard(lock, token, site = SITE) {
  const now = nowSec();
  const status = lock.amount === 0n ? "withdrawn" : now >= Number(lock.unlockDate) ? "unlocked" : "locked";
  const amount = fmtAmount(lock.amount, token.decimals);
  const un = fmtDateUTC(lock.unlockDate);
  const lk = fmtDateUTC(lock.lockDate);
  const upd = fmtDateUTC(now);
  const left = Number(lock.unlockDate) - now;
  return frame([
    header("ArcLock · verifiable token lock on Arc", site),
    h("div", { style: { display: "flex", marginTop: "34px" } }, pill(status === "locked" ? "LOCKED" : status === "unlocked" ? "UNLOCKED" : "WITHDRAWN", status === "locked" ? "locked" : "open")),
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", marginTop: "34px" } },
      stat(status === "withdrawn" ? "WITHDRAWN" : "LOCKED", `${amount} ${token.symbol}`, token.name ? `${token.name} · ${shortAddr(lock.token, 6)}` : shortAddr(lock.token, 6)),
      stat(status === "locked" ? `UNLOCKS · in ${durationText(left)}` : "UNLOCKED ON", un.date, un.time, "flex-end"),
    ),
    footer(
      [`Lock #${lock.id.toString()} · locked ${lk.date} ${lk.time}`, `Withdrawer ${shortAddr(lock.withdrawer, 6)} · updated ${upd.date} ${upd.time}`],
      `${hostOf(site)}/lock/${lock.id.toString()}`,
    ),
  ]);
}

/** Vesting schedule card. */
export function vestingCard(v, token, site = SITE) {
  const now = nowSec();
  const vested = vestedAt(v, now);
  const pct = v.total === 0n ? 0 : Number((vested * 1000n) / v.total) / 10;
  const done = now >= Number(v.end);
  const end = fmtDateUTC(v.end);
  const cliff = fmtDateUTC(v.cliff);
  const upd = fmtDateUTC(now);
  const status = v.released >= v.total && v.total > 0n ? "CLAIMED" : done ? "FULLY VESTED" : now < Number(v.cliff) ? "IN CLIFF" : "VESTING";
  return frame([
    header("ArcLock · linear vesting on Arc", site),
    h("div", { style: { display: "flex", marginTop: "34px" } }, pill(status, done ? "open" : "locked")),
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", marginTop: "34px" } },
      stat("TOTAL VESTING", `${fmtAmount(v.total, token.decimals)} ${token.symbol}`, `${pct}% vested · ${fmtAmount(v.released, token.decimals)} claimed`),
      stat(done ? "VESTED ON" : `FULLY VESTED · in ${durationText(Number(v.end) - now)}`, end.date, end.time, "flex-end"),
    ),
    // progress bar
    h(
      "div",
      { style: { display: "flex", width: "100%", height: "14px", borderRadius: "9999px", background: "rgba(214,230,255,0.1)", marginTop: "30px", overflow: "hidden" } },
      h("div", { style: { display: "flex", width: `${Math.max(0, Math.min(100, pct))}%`, background: C.accent } }),
    ),
    footer(
      [`Vest #${v.id.toString()} · cliff ${v.cliff === v.start ? "none" : `${cliff.date} ${cliff.time}`}`, `Beneficiary ${shortAddr(v.beneficiary, 6)} · updated ${upd.date} ${upd.time}`],
      `${hostOf(site)}/vest/${v.id.toString()}`,
    ),
  ]);
}

/** Generic brand card, used when the id is unknown or the chain is unreachable. */
export function brandCard(subtitle = "Lock, vest, stake and airdrop tokens on Arc", site = SITE) {
  return frame([
    header("Tools for teams building on Arc", site),
    h("div", { style: { display: "flex", flexDirection: "column", marginTop: "90px" } },
      h("div", { style: { fontSize: "78px", fontWeight: 700, letterSpacing: "-2px", lineHeight: 1, display: "flex" } }, "Lock, prove and launch on Arc"),
      h("div", { style: { fontSize: "28px", color: C.dim, marginTop: "22px", display: "flex" } }, subtitle),
    ),
    footer(["ArcLock · Vesting · Staking · Bulk Airdrop", "Public, verifiable, on-chain"], hostOf(site)),
  ]);
}

/** Staking pool card. */
export function stakingCard(id, p, stakeToken, rewardToken, site = SITE) {
  const now = nowSec();
  const same = p.cfg.stakeToken.toLowerCase() === p.cfg.rewardToken.toLowerCase();
  const ended = now >= Number(p.periodFinish);
  const upcoming = now < Number(p.cfg.startTime);
  const status = ended ? "ENDED" : upcoming ? "STARTS SOON" : p.paused ? "PAUSED" : "LIVE";
  const apr = poolAprBps(p, now);
  const end = fmtDateUTC(p.periodFinish);
  const upd = fmtDateUTC(now);
  const empty = p.totalStaked === 0n && !ended;
  const headline = ended
    ? fmtAmount(p.claimedTotal, rewardToken.decimals) + " " + rewardToken.symbol
    : same ? (empty ? "First staker takes it all" : fmtApr(apr) + " APR") : fmtAmount(poolRemaining(p, now), rewardToken.decimals) + " " + rewardToken.symbol;
  const headLabel = ended ? "REWARDS PAID OUT" : same ? (empty ? "NOBODY STAKED YET" : "APR · LIVE") : "REWARDS LEFT";
  const stakers = p.stakers.toString() + " staker" + (p.stakers === 1n ? "" : "s");
  return frame([
    header("Arc Staking · stake " + stakeToken.symbol + ", earn " + (same ? "more " + stakeToken.symbol : rewardToken.symbol), site),
    h(
      "div",
      { style: { display: "flex", marginTop: "34px", gap: "12px" } },
      pill(status, status === "LIVE" ? "open" : "locked"),
      p.cfg.penaltyBps > 0 && !ended ? pill((Number(p.cfg.penaltyBps) / 100).toString() + "% EARLY EXIT", "locked") : h("div", { style: { display: "flex" } }),
    ),
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", marginTop: "34px" } },
      stat(headLabel, headline, fmtAmount(p.totalStaked, stakeToken.decimals) + " " + stakeToken.symbol + " staked · " + stakers),
      stat(ended ? "ENDED ON" : "ENDS · in " + durationText(Number(p.periodFinish) - now), end.date, end.time, "flex-end"),
    ),
    footer(
      [
        "Pool #" + id + " · " + (p.cfg.name || stakeToken.symbol + " staking") + " · " + fmtAmount(p.totalRewardsAdded, rewardToken.decimals) + " " + rewardToken.symbol + " rewards deposited",
        "Stake token " + shortAddr(p.cfg.stakeToken, 6) + " · updated " + upd.date + " " + upd.time,
      ],
      hostOf(site) + "/stake/" + id,
    ),
  ]);
}

// Dynamic Open Graph image: /api/og?type=lock|vest&id=N  -> 1200x630 PNG
import { ImageResponse } from "@vercel/og";
import { getLock, getVesting, getPool, getToken } from "./_lib/og/chain.js";
import { lockCard, vestingCard, stakingCard, brandCard } from "./_lib/og/card.js";

export const config = { runtime: "edge" };

const CACHE = "public, s-maxage=120, stale-while-revalidate=900";

export default async function handler(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "brand";
  const id = url.searchParams.get("id");
  const site = url.origin;
  try {
    let tree;
    if (type === "lock" && id && /^\d+$/.test(id)) {
      const lock = await getLock(id);
      tree = lock ? lockCard(lock, await getToken(lock.token), site) : brandCard(`Lock #${id} does not exist on Arc`, site);
    } else if (type === "vest" && id && /^\d+$/.test(id)) {
      const v = await getVesting(id);
      tree = v ? vestingCard(v, await getToken(v.token), site) : brandCard(`Vesting schedule #${id} does not exist on Arc`, site);
    } else if (type === "stake" && id && /^\d+$/.test(id)) {
      const p = await getPool(id);
      if (!p) tree = brandCard(`Staking pool #${id} does not exist on Arc`, site);
      else {
        const st = await getToken(p.cfg.stakeToken);
        const rt = p.cfg.stakeToken.toLowerCase() === p.cfg.rewardToken.toLowerCase() ? st : await getToken(p.cfg.rewardToken);
        tree = stakingCard(id, p, st, rt, site);
      }
    } else {
      tree = brandCard(undefined, site);
    }
    return new ImageResponse(tree, { width: 1200, height: 630, headers: { "Cache-Control": CACHE } });
  } catch (e) {
    // Never fail the preview: fall back to the brand card with a short cache so it retries soon.
    return new ImageResponse(brandCard(undefined, url.origin), { width: 1200, height: 630, headers: { "Cache-Control": "public, s-maxage=30" } });
  }
}

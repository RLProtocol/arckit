import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const dir = process.env.VDIR, FPS = 30;
const b = await chromium.launch({ channel: "chrome" });
const pg = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })).newPage();
await pg.goto(pathToFileURL(dir + "/scene.html").href, { waitUntil: "networkidle" });
await pg.evaluate(() => document.fonts.ready);
const total = await pg.evaluate(() => window.TOTAL);
const frames = Math.round((total / 1000) * FPS);
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  await pg.evaluate((x) => window.render(x), (f * 1000) / FPS);
  await pg.screenshot({ path: `${dir}/frames/f${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 96 });
  if (f % 300 === 0) console.log("frame", f, "/", frames, Math.round((Date.now() - t0) / 1000) + "s");
}
console.log("frames done", frames, Math.round((Date.now() - t0) / 1000) + "s");
await b.close();

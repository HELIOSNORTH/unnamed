import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [, , scenesArg = '0,1,2,3,4', w = '1280', h = '720', t = '12', out = 'shots'] = process.argv;
mkdirSync(out, { recursive: true });
const pageUrl = new URL('../build/index.html', import.meta.url).href;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(pageUrl);
await page.waitForFunction(() => window.__quietSignals, null, { timeout: 30000 });
for (const s of scenesArg.split(',')) {
  const t0 = Date.now();
  await page.evaluate(([i, tt]) => window.__quietSignals.jump(i, tt), [+s, +t]);
  if (process.env.TOGGLE) await page.evaluate((f) => window.__quietSignals.toggle(f), JSON.parse(process.env.TOGGLE));
  if (process.env.RES) await page.evaluate((h) => window.__quietSignals.resolution(h), +process.env.RES);
  await page.waitForTimeout(+(process.env.WAIT || 2500));
  await page.screenshot({ path: `${out}/scene${s}.png`, timeout: 180000 });
  const st = await page.evaluate(() => window.__quietSignals.stats());
  console.log('scene', s, 'ms', Date.now() - t0, 'build', st && st.buildMs.toFixed(0), 'tris', st && st.triangles, 'draws', st && st.drawCalls);
}
console.log(logs.filter(l => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await browser.close();

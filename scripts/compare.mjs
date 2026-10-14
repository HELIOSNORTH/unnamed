import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [, , refDir, scenesArg = '0,1,2,3,4', t = '21', out = 'shots', width = '640'] = process.argv;
const sizes = { 0: [736, 480], 1: [612, 408], 2: [452, 679], 3: [429, 715], 4: [1220, 813] };
mkdirSync(out, { recursive: true });
const pageUrl = new URL('../build/index.html', import.meta.url).href;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const s of scenesArg.split(',')) {
	const [rw, rh] = sizes[s];
	const w = +width;
	const h = Math.round((w * rh) / rw);
	const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
	const logs = [];
	page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
	page.on('console', (m) => m.type() === 'error' && logs.push('error: ' + m.text()));
	await page.goto(pageUrl);
	await page.addStyleTag({ content: 'main > :not(canvas){display:none!important}' });
	await page.waitForFunction(() => window.__quietSignals, null, { timeout: 30000 });
	await page.evaluate(([i, tt]) => window.__quietSignals.jump(i, tt), [+s, +t]);
	await page.waitForTimeout(+(process.env.WAIT || 3000));
	await page.screenshot({ path: `${out}/render${s}.png`, timeout: 300000 });
	const st = await page.evaluate(() => window.__quietSignals.stats());
	console.log('scene', s, 'build', st?.buildMs.toFixed(0), 'tris', st?.triangles, logs.join(' | '));
	await page.close();
}
await browser.close();

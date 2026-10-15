import { chromium } from 'playwright';

const [, , scenesArg = '0,1,2,3,4', w = '480', h = '270', settle = '8000'] = process.argv;
const pageUrl = new URL('../build/index.html', import.meta.url).href;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await page.goto(pageUrl);
await page.waitForFunction(() => window.__quietSignals, null, { timeout: 30000 });
const allConfigs = {
	full: {},
	noVolume: { volume: false },
	noAo: { ao: false },
	noShadows: { shadows: false },
	bare: { volume: false, ao: false, shadows: false }
};
const configs = process.env.ONLY_FULL ? { full: {} } : allConfigs;
const frameMs = () =>
	page.evaluate(
		() =>
			new Promise((resolve) => {
				const times = [];
				let last = performance.now();
				const tick = (now) => {
					times.push(now - last);
					last = now;
					if (times.length < 6) requestAnimationFrame(tick);
					else resolve(times.slice(2).sort((a, b) => a - b)[1]);
				};
				requestAnimationFrame(tick);
			})
	);
const rows = [];
for (const s of scenesArg.split(',')) {
	await page.evaluate((i) => window.__quietSignals.jump(i, 20), +s);
	await page.waitForTimeout(+settle);
	const row = { scene: s };
	for (const [name, flags] of Object.entries(configs)) {
		await page.evaluate((f) => window.__quietSignals.toggle(f), flags);
		await frameMs();
		row[name] = (await frameMs()).toFixed(0);
	}
	await page.evaluate(() => window.__quietSignals.toggle({ volume: false, ao: false, shadows: false }));
	for (const kind of process.env.HIDE ? ['sky', 'surface', 'ribbon', 'points', 'custom'] : []) {
		await page.evaluate((k) => window.__quietSignals.hide([k]), kind);
		await frameMs();
		row['bare-' + kind] = (await frameMs()).toFixed(0);
	}
	await page.evaluate(() => {
		window.__quietSignals.hide([]);
		window.__quietSignals.toggle({});
	});
	rows.push(row);
	console.log(JSON.stringify(row));
}
console.table(rows);
await browser.close();

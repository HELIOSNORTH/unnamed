import { BoxGeometry, Mesh, Scene, Vector2, Vector3 } from 'three';
import { createAtmosphereUniforms } from '../engine/atmosphere.ts';
import { branchingPlant, latticeTower, polarTerrain, type Segment } from '../engine/geometry.ts';
import { addLightSprites, addRibbons, addSky, kelvin, rgb, type BuiltScene } from '../engine/kit.ts';
import { breathe, steady, type SceneLight } from '../engine/lights.ts';
import { createSurfaceMaterial } from '../engine/materials.ts';
import { fbm, mulberry32, ridged, smoothstep } from '../engine/noise.ts';

const PAD = new Vector3(0, 0, -470);

function height(x: number, z: number): number {
	const d = -z;
	const floor = 3 * fbm(x / 200, z / 200, 3, 2);
	const rise = smoothstep(900, 2600, d + 160 * fbm(x / 900, 1, 3, 3));
	const main = 950 * Math.pow(ridged(x / 2600 + 3.1, z / 2600, 6, 7), 1.2) + 150;
	const back = 2100 * Math.pow(ridged(x / 6000 + 9, z / 6000, 6, 11), 1.4) * smoothstep(3500, 9000, d);
	const sides = 500 * smoothstep(900, 2400, Math.abs(x)) * smoothstep(-200, 400, d);
	return floor + rise * main + back + sides * (0.6 + 0.4 * fbm(x / 700, z / 700, 4, 5));
}

export function buildLaunch(): BuiltScene {
	const scene = new Scene();
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.075, 0.13, 0.19),
		fogHigh: rgb(0.06, 0.1, 0.16),
		glowColor: rgb(0.02, 0.035, 0.05),
		glowDir: new Vector3(0.2, 0.1, -1),
		glowExp: 2,
		fogDensity: 0.00026,
		fogFalloff: 0.0016,
		slab: { bottom: 420, top: 950, density: 0.0022, scale: 0.0011, color: rgb(0.085, 0.14, 0.2), drift: [0.003, 0.0008] },
		sunDir: new Vector3(-0.3, 0.6, -0.4),
		sunColor: rgb(0.012, 0.02, 0.03),
		ambientSky: rgb(0.075, 0.12, 0.18),
		ambientGround: rgb(0.018, 0.025, 0.03),
		lightScatter: 1,
		phaseG: 0.5,
		isotropic: 0.03
	});

	addSky(scene, atmos, {
		zenith: rgb(0.045, 0.08, 0.14),
		horizon: rgb(0.08, 0.135, 0.2),
		curve: 0.6,
		clouds: { amount: 0.8, height: 2600, scale: 0.0003, color: rgb(0.06, 0.1, 0.16), underlight: rgb(0.02, 0.03, 0.04), speed: [1.4, 0.3] }
	});

	const forest = createSurfaceMaterial(atmos, {
		albedo: rgb(0.02, 0.04, 0.03),
		canopy: { cell: 8, color: rgb(0.016, 0.034, 0.024), color2: rgb(0.03, 0.05, 0.03), bump: 1 },
		wrap: 0.4
	});
	scene.add(new Mesh(polarTerrain({ center: [0, 0], span: 1.5, rMin: 600, rMax: 40000, rings: 340, segments: 300, height }), forest));
	const grass = createSurfaceMaterial(atmos, { albedo: rgb(0.035, 0.055, 0.03), albedo2: rgb(0.055, 0.062, 0.035), variation: 0.3, variationScale: 0.05 });
	scene.add(new Mesh(polarTerrain({ center: [0, 0], span: 1.6, rMin: 0.8, rMax: 620, rings: 160, segments: 200, height }), grass));

	const facade = (albedo: [number, number, number], grid: [number, number], strength: number) =>
		createSurfaceMaterial(atmos, { albedo: rgb(...albedo), grid: { size: new Vector2(...grid), strength }, wrap: 0.3 });
	const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: ReturnType<typeof createSurfaceMaterial>) => {
		const mesh = new Mesh(new BoxGeometry(w, h, d), m);
		mesh.position.set(PAD.x + x, PAD.y + y, PAD.z + z);
		scene.add(mesh);
		return mesh;
	};
	const steel = facade([0.34, 0.38, 0.42], [5, 6.5], 0.32);
	const pale = facade([0.42, 0.48, 0.53], [3.6, 6.5], 0.26);
	box(24, 52, 20, 0, 26, 0, steel);
	box(22, 30, 18, 0, 67, 0, pale);
	box(16, 6, 14, 0, 85, 0, steel);
	const red = createSurfaceMaterial(atmos, { albedo: rgb(0.5, 0.08, 0.06), emissive: rgb(0.7, 0.03, 0.018), grid: { size: new Vector2(2.4, 3.2), strength: 0.25 } });
	box(12, 46, 0.8, 6.2, 34, 10.3, red);
	box(0.8, 46, 10, 12.3, 34, 5, red);
	box(70, 16, 34, 0, 8, 6, facade([0.5, 0.56, 0.6], [4, 4], 0.4));
	box(56, 4, 26, 0, 18, 6, facade([0.36, 0.4, 0.44], [3, 4], 0.3));

	const white = facade([0.3, 0.34, 0.36], [3.5, 3.2], 0.2);
	const buildings: [number, number, number, number, number, number][] = [
		[-95, -300, 30, 10, 18, 0.1],
		[-130, -360, 18, 7, 14, -0.1],
		[-60, -250, 14, 6, 10, 0],
		[90, -330, 36, 9, 14, 0.05],
		[125, -400, 20, 12, 16, 0],
		[55, -265, 16, 5, 8, 0]
	];
	for (const [x, z, w, h, d, ry] of buildings) {
		const m = new Mesh(new BoxGeometry(w, h, d), white);
		m.position.set(x, height(x, z) + h / 2 - 0.3, z);
		m.rotation.y = ry;
		scene.add(m);
	}

	const lt1 = new Vector3(-170, height(-170, -560), -560);
	const lt2 = new Vector3(160, height(160, -520), -520);
	const lt3 = new Vector3(-60, height(-60, -720), -720);
	const towers = [
		latticeTower({ base: lt1, height: 112, baseWidth: 6, topWidth: 1.6, sections: 24, legRadius: 0.2, braceRadius: 0.09 }),
		latticeTower({ base: lt2, height: 104, baseWidth: 6, topWidth: 1.6, sections: 22, legRadius: 0.2, braceRadius: 0.09 }),
		latticeTower({ base: lt3, height: 96, baseWidth: 5, topWidth: 1.4, sections: 20, legRadius: 0.18, braceRadius: 0.08 })
	];
	const lattice: Segment[] = towers.flatMap((t) => t.segments);
	for (const [base, h] of [
		[lt1, 112],
		[lt2, 104],
		[lt3, 96]
	] as const) {
		for (const lv of [0.45, 0.72, 0.95]) {
			const y = base.y + h * lv;
			const w = 5 + (1 - lv) * 4;
			lattice.push({ a: new Vector3(base.x - w, y, base.z), b: new Vector3(base.x + w, y, base.z), r: 0.12 });
			lattice.push({ a: new Vector3(base.x - w, y, base.z), b: new Vector3(base.x - w, y - 4, base.z), r: 0.08 });
			lattice.push({ a: new Vector3(base.x + w, y, base.z), b: new Vector3(base.x + w, y - 4, base.z), r: 0.08 });
		}
		lattice.push({ a: new Vector3(base.x, base.y + h, base.z), b: new Vector3(base.x, base.y + h + 14, base.z), r: 0.12 });
	}
	const top = new Vector3(PAD.x, PAD.y + 88, PAD.z);
	const crane = latticeTower({ base: top.clone().add(new Vector3(-4, 0, 2)), height: 18, baseWidth: 2.2, topWidth: 1.4, sections: 6, legRadius: 0.12, braceRadius: 0.06 });
	lattice.push(...crane.segments);
	const jibRoot = top.clone().add(new Vector3(-4, 18, 2));
	const jibTip = jibRoot.clone().add(new Vector3(-26, 9, 0));
	const counter = jibRoot.clone().add(new Vector3(10, 1, 0));
	for (const off of [-0.7, 0.7]) {
		lattice.push({ a: jibRoot.clone().add(new Vector3(0, 0, off)), b: jibTip.clone().add(new Vector3(0, 0, off * 0.3)), r: 0.3 });
		lattice.push({ a: jibRoot.clone().add(new Vector3(0, 1.4, off)), b: jibTip.clone().add(new Vector3(0, 0.4, off * 0.3)), r: 0.25 });
		lattice.push({ a: jibRoot.clone().add(new Vector3(0, 0, off)), b: counter.clone().add(new Vector3(0, 0, off)), r: 0.3 });
	}
	for (let i = 0; i <= 10; i++) {
		const p = jibRoot.clone().lerp(jibTip, i / 10);
		lattice.push({ a: p, b: p.clone().add(new Vector3(0, 1.4 * (1 - i / 10) + 0.3, 0)), r: 0.07 });
	}
	lattice.push({ a: jibRoot.clone().add(new Vector3(0, 6, 0)), b: jibTip, r: 0.04 });
	lattice.push({ a: jibRoot.clone().add(new Vector3(0, 6, 0)), b: counter, r: 0.04 });
	lattice.push({ a: jibTip, b: jibTip.clone().add(new Vector3(0, -22, 0)), r: 0.03 });
	addRibbons(scene, atmos, lattice, { color: rgb(0.22, 0.26, 0.3), minWidthPx: 0.6, lightResponse: 0.3 });
	box(4, 3, 3, 8, 106, 2, steel);

	const rand = mulberry32(12);
	const trees: Segment[] = [];
	for (let i = 0; i < 70; i++) {
		const z = -200 - rand() * 220;
		const x = -8 + (rand() * 2 - 1) * ((-z - 150) * 0.32 + 25);
		if (Math.abs(x) < 40 && z < -200) continue;
		const h = 5 + rand() * 9;
		trees.push(...branchingPlant({ root: new Vector3(x, height(x, z) - 0.2, z), height: h, spread: 1.1, depth: 6, seed: 300 + i, radius: 0.16, children: 2, upBias: 0.9 }));
	}
	addRibbons(scene, atmos, trees, { color: rgb(0.03, 0.035, 0.035), minWidthPx: 0.55, lightResponse: 0.1 });

	const redLight = rgb(1, 0.06, 0.04);
	const lights: SceneLight[] = [
		{ position: PAD.clone().add(new Vector3(6, 24, 16)), color: redLight, intensity: 420, pattern: steady, surface: 0.08 },
		{ position: PAD.clone().add(new Vector3(6, 46, 16)), color: redLight, intensity: 420, pattern: steady, surface: 0.08 },
		{ position: PAD.clone().add(new Vector3(18, 34, 4)), color: redLight, intensity: 260, pattern: steady, surface: 0.08 },
		{ position: PAD.clone().add(new Vector3(-11, 90, 12)), color: kelvin(5600), intensity: 60, pattern: steady, sprite: { size: 4, brightness: 400 } },
		{ position: PAD.clone().add(new Vector3(30, 4, 40)), color: kelvin(3800), intensity: 60, pattern: steady, sprite: { size: 3.5, brightness: 360 } },
		{ position: PAD.clone().add(new Vector3(-30, 4, 40)), color: kelvin(3800), intensity: 60, pattern: steady, sprite: { size: 3.5, brightness: 360 } },
		{ position: lt1.clone().add(new Vector3(0, 126.5, 0)), color: redLight, intensity: 120, pattern: breathe(4, 0.6), sprite: { size: 4.5, brightness: 600 } },
		{ position: lt2.clone().add(new Vector3(0, 118.5, 0)), color: redLight, intensity: 120, pattern: breathe(4, 0.6, 1.3), sprite: { size: 4.5, brightness: 600 } },
		{ position: lt3.clone().add(new Vector3(0, 110.5, 0)), color: redLight, intensity: 90, pattern: breathe(4, 0.6, 2.1), sprite: { size: 4, brightness: 500 } }
	];
	const updateSprites = addLightSprites(scene, atmos, lights, 0.5);

	const camPos = new Vector3(-8, height(-8, -150) + 7, -150);
	const target = PAD.clone().add(new Vector3(-6, 52, 0));

	return {
		scene,
		atmos,
		lights,
		windiness: 0.4,
		shot: { position: camPos, target, fov: 32, refAspect: 1.5 },
		grade: {
			exposure: 0.95,
			lift: rgb(0.004, 0.012, 0.02),
			gamma: rgb(0.98, 1.0, 1.02),
			gain: rgb(0.92, 1.02, 1.08),
			saturation: 1.18,
			contrast: 1.04,
			bloom: 0.05,
			halation: 0.35,
			grain: 0.03,
			vignette: 0.5,
			aberration: 0.006
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

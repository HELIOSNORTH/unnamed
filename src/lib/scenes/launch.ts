import { BoxGeometry, Mesh, Scene, Vector2, Vector3 } from 'three';
import { createAtmosphereUniforms } from '../engine/atmosphere.ts';
import { branchingPlant, latticeTower, polarTerrain, type Segment } from '../engine/geometry.ts';
import { addLightSprites, addRibbons, addSky, kelvin, rgb, type BuiltScene } from '../engine/kit.ts';
import { breathe, flash, flicker, steady, type SceneLight } from '../engine/lights.ts';
import { createSurfaceMaterial } from '../engine/materials.ts';
import { addTrees, type TreeSpec } from '../engine/trees.ts';
import { fbm, mulberry32, ridged, smoothstep } from '../engine/noise.ts';

const PAD = new Vector3(0, 0, -470);

function height(x: number, z: number): number {
	const d = -(z + 215);
	const wobble = 160 * fbm(x / 800, 1.3, 3, 3);
	const floor = 2 * fbm(x / 200, z / 200, 3, 2);
	const foothills = (60 + 200 * Math.pow(ridged(x / 900 + 3.1, z / 900, 5, 7), 1.2)) * smoothstep(480, 1050, d + wobble);
	const peaks = (300 + 520 * Math.pow(ridged(x / 2200 + 7.3, z / 2200, 6, 9), 1.15)) * smoothstep(1300, 2700, d + wobble * 2);
	const ranges = 1500 * Math.pow(ridged(x / 6000 + 9, z / 6000, 6, 11), 1.3) * smoothstep(4500, 9000, d);
	return floor + Math.max(foothills, peaks) + ranges;
}

export function buildLaunch(): BuiltScene {
	const scene = new Scene();
	const sunDir = new Vector3(-0.55, 0.62, 0.35).normalize();
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.12, 0.38, 0.62),
		fogHigh: rgb(0.08, 0.34, 0.66),
		glowColor: rgb(0.08, 0.12, 0.14),
		glowDir: new Vector3(-0.4, 0.3, -1),
		glowExp: 3,
		fogDensity: 0.00006,
		fogFalloff: 0.0011,
		slab: { bottom: 450, top: 720, density: 0.0004, scale: 0.0013, color: rgb(0.24, 0.48, 0.66), drift: [0.004, 0.001] },
		sunDir,
		sunColor: rgb(0.5, 0.62, 0.56),
		ambientSky: rgb(0.2, 0.38, 0.52),
		ambientGround: rgb(0.05, 0.08, 0.08),
		lightScatter: 1,
		phaseG: 0.5,
		isotropic: 0.03
	});

	addSky(scene, atmos, {
		zenith: rgb(0.05, 0.36, 0.86),
		horizon: rgb(0.14, 0.46, 0.76),
		curve: 0.6,
		clouds: { amount: 0.55, height: 2600, scale: 0.0003, color: rgb(0.16, 0.42, 0.74), underlight: rgb(0.02, 0.04, 0.05), speed: [1.4, 0.3] }
	});

	const forest = createSurfaceMaterial(atmos, {
		albedo: rgb(0.03, 0.07, 0.05),
		canopy: { cell: 8, color: rgb(0.012, 0.05, 0.028), color2: rgb(0.03, 0.075, 0.03), bump: 1.4 },
		wrap: 0.3
	});
	scene.add(new Mesh(polarTerrain({ center: [0, -100], span: 1.4, rMin: 500, rMax: 40000, rings: 380, segments: 420, height }), forest));
	const grass = createSurfaceMaterial(atmos, { albedo: rgb(0.025, 0.07, 0.05), albedo2: rgb(0.04, 0.085, 0.05), variation: 0.4, variationScale: 0.04, wrap: 0.3 });
	scene.add(new Mesh(polarTerrain({ center: [0, -100], span: 1.8, rMin: 0.8, rMax: 520, rings: 160, segments: 220, height }), grass));

	const facade = (albedo: [number, number, number], grid: [number, number], strength: number) =>
		createSurfaceMaterial(atmos, { albedo: rgb(...albedo), grid: { size: new Vector2(...grid), strength }, wrap: 0.2 });
	const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: ReturnType<typeof createSurfaceMaterial>, base = PAD) => {
		const mesh = new Mesh(new BoxGeometry(w, h, d), m);
		mesh.position.set(base.x + x, base.y + y, base.z + z);
		scene.add(mesh);
		return mesh;
	};
	const steel = createSurfaceMaterial(atmos, { albedo: rgb(0.34, 0.42, 0.5), grid: { size: new Vector2(2.7, 3.3), strength: 0.18, window: [0.55, 0.42, 0.7] }, wrap: 0.2 });
	const steelLight = facade([0.5, 0.6, 0.68], [2.6, 3.4], 0.25);
	const panels = facade([0.5, 0.68, 0.86], [3.75, 1.5], 0.22);
	box(16, 66, 24, -8, 33, 0, steel);
	box(15, 18, 24, 7.5, 57, 0, panels);
	box(15, 6, 24, 7.5, 3, 0, steel);
	box(16, 4, 24, -8, 67.5, 0, steelLight);
	box(15, 4, 24, 7.5, 67.5, 0, panels);
	const red = createSurfaceMaterial(atmos, {
		albedo: rgb(0.62, 0.035, 0.03),
		emissive: rgb(0.55, 0.02, 0.015),
		grid: { size: new Vector2(2.5, 3.0), strength: 0.12 },
		wrap: 0.4
	});
	box(15.2, 42, 24.2, 7.5, 27, 0, red);

	const units = facade([0.24, 0.42, 0.38], [1.1, 1.1], 0.45);
	for (const x of [-20, -6, 8, 22]) box(13, 9, 10, x, 4.5, 20, units);
	box(70, 2, 18, 0, 1, 20, facade([0.4, 0.5, 0.52], [5, 5], 0.2));
	const pale = facade([0.6, 0.72, 0.78], [4.2, 3.2], 0.25);
	const roof = facade([0.42, 0.55, 0.6], [6, 6], 0.1);
	const yellow = createSurfaceMaterial(atmos, { albedo: rgb(0.62, 0.55, 0.25), wrap: 0.3 });
	const white = facade([0.66, 0.76, 0.8], [3.4, 3.2], 0.28);
	const ground = (x: number, z: number) => new Vector3(x, height(x, z), 0);
	const place = (w: number, h: number, d: number, x: number, z: number, m: ReturnType<typeof createSurfaceMaterial>, ry = 0) => {
		const mesh = new Mesh(new BoxGeometry(w, h, d), m);
		mesh.position.set(x, ground(x, z).y + h / 2 - 0.3, z);
		mesh.rotation.y = ry;
		scene.add(mesh);
		return mesh;
	};
	place(42, 7.5, 14, 14, -330, pale);
	place(44, 0.8, 15, 14, -330 + 0, roof).position.y += 3.9;
	for (const x of [-2, 8, 24, 31]) place(4.6, 4, 0.3, x, -322.8, yellow).position.y += 0.4;
	place(13, 17, 12, -42, -372, white);
	place(30, 6, 16, -16, -395, white, 0.04);
	place(22, 5, 12, -58, -420, pale);
	place(18, 7, 12, 44, -405, white, -0.05);
	place(26, 4, 10, 70, -380, pale);
	place(12, 9, 10, 92, -430, white);
	place(64, 0.6, 1.2, 6, -350, roof).position.y += 1.2;

	const lt1 = new Vector3(-67, height(-67, -520), -520);
	const lt2 = new Vector3(161, height(161, -560), -560);
	const lt3 = new Vector3(142, height(142, -700), -700);
	const specs: [Vector3, number][] = [
		[lt1, 165],
		[lt2, 158],
		[lt3, 130]
	];
	const lattice: Segment[] = [];
	for (const [base, h] of specs) {
		lattice.push(...latticeTower({ base, height: h, baseWidth: 5, topWidth: 1.6, sections: 34, legRadius: 0.32, braceRadius: 0.13 }).segments);
		for (const lv of [0.42, 0.62, 0.86]) {
			const y = base.y + h * lv;
			const w = 4 + (1 - lv) * 3;
			for (const [dx, dz] of [
				[1, 0],
				[0, 1]
			]) {
				lattice.push({ a: new Vector3(base.x - w * dx, y, base.z - w * dz), b: new Vector3(base.x + w * dx, y, base.z + w * dz), r: 0.16 });
				lattice.push({ a: new Vector3(base.x - w * dx, y, base.z - w * dz), b: new Vector3(base.x - w * dx, y - 3.5, base.z - w * dz), r: 0.1 });
				lattice.push({ a: new Vector3(base.x + w * dx, y, base.z + w * dz), b: new Vector3(base.x + w * dx, y - 3.5, base.z + w * dz), r: 0.1 });
			}
		}
		lattice.push({ a: new Vector3(base.x, base.y + h, base.z), b: new Vector3(base.x, base.y + h + 16, base.z), r: 0.14 });
	}
	const top = new Vector3(PAD.x - 6, PAD.y + 69.5, PAD.z);
	const mast = latticeTower({ base: top, height: 16, baseWidth: 2.2, topWidth: 1.6, sections: 6, legRadius: 0.16, braceRadius: 0.07 });
	lattice.push(...mast.segments);
	const jibRoot = top.clone().add(new Vector3(0, 16, 0));
	const jibTip = jibRoot.clone().add(new Vector3(24, 4, 3));
	const counter = jibRoot.clone().add(new Vector3(-11, -0.5, -1));
	const craneSegs: Segment[] = [];
	for (const off of [-0.7, 0.7]) {
		craneSegs.push({ a: jibRoot.clone().add(new Vector3(0, 0, off)), b: jibTip.clone().add(new Vector3(0, 0, off * 0.4)), r: 0.32 });
		craneSegs.push({ a: jibRoot.clone().add(new Vector3(0, 1.5, off)), b: jibTip.clone().add(new Vector3(0, 0.4, off * 0.4)), r: 0.26 });
		craneSegs.push({ a: jibRoot.clone().add(new Vector3(0, 0, off)), b: counter.clone().add(new Vector3(0, 0, off)), r: 0.32 });
	}
	for (let i = 0; i <= 12; i++) {
		const p = jibRoot.clone().lerp(jibTip, i / 12);
		craneSegs.push({ a: p, b: p.clone().add(new Vector3(0, 1.5 * (1 - i / 12) + 0.35, 0)), r: 0.1 });
	}
	craneSegs.push({ a: jibRoot.clone().add(new Vector3(0, 7, 0)), b: jibTip, r: 0.06 });
	craneSegs.push({ a: jibRoot.clone().add(new Vector3(0, 7, 0)), b: counter, r: 0.06 });
	craneSegs.push({ a: jibRoot, b: jibRoot.clone().add(new Vector3(0, 7, 0)), r: 0.25 });
	craneSegs.push({ a: jibTip.clone().add(new Vector3(-6, 0, 0)), b: jibTip.clone().add(new Vector3(-6, -24, 0)), r: 0.04 });
	addRibbons(scene, atmos, lattice, { color: rgb(0.05, 0.07, 0.08), minWidthPx: 0.75, lightResponse: 0.3 });
	addRibbons(scene, atmos, craneSegs, { color: rgb(0.62, 0.2, 0.12), minWidthPx: 0.65, lightResponse: 0.3 });
	box(4.5, 3.5, 3.2, -6 - 11, 69.5 + 16 - 1, -1, createSurfaceMaterial(atmos, { albedo: rgb(0.5, 0.52, 0.5) }));

	const rand = mulberry32(12);
	const trees: Segment[] = [];
	for (let i = 0; i < 70; i++) {
		const z = -290 - rand() * 90;
		const x = -10 + (rand() * 2 - 1) * ((-z - 215) * 0.42 + 10);
		if (Math.abs(x - 14) < 18 && z < -322) continue;
		const h = 5 + rand() * 7;
		trees.push(...branchingPlant({ root: new Vector3(x, height(x, z) - 0.2, z), height: h, spread: 1.1, depth: 6, seed: 300 + i, radius: 0.18, children: 2, upBias: 0.9 }));
	}
	addRibbons(scene, atmos, trees, { color: rgb(0.05, 0.07, 0.07), minWidthPx: 0.55, lightResponse: 0.1 });

	const eye = new Vector3(-12, height(-12, -215) + 19, -215);
	const leafTrees: TreeSpec[] = [];
	for (let i = 0; i < 46; i++) {
		const z = -285 - rand() * 160;
		const x = rand() < 0.65 ? 40 + rand() * 90 : -70 - rand() * 50;
		const r = 2.5 + rand() * 4;
		leafTrees.push({ position: new Vector3(x, height(x, z) - 0.2, z), height: r * 2.7, crown: r * 1.05, seed: 900 + i });
	}
	const branches = addTrees(scene, atmos, leafTrees, {
		leaf: rgb(0.03, 0.075, 0.05),
		leaf2: rgb(0.055, 0.1, 0.05),
		cards: 220,
		translucency: 0.25,
		lod: { eye, near: 90, min: 0.35 }
	});
	addRibbons(scene, atmos, branches, { color: rgb(0.05, 0.06, 0.055), minWidthPx: 0.5, lightResponse: 0.1 });

	const redLight = rgb(1, 0.06, 0.04);
	const sodium = kelvin(2000);
	const mercury = rgb(0.75, 0.95, 1);
	const lights: SceneLight[] = [
		{ position: PAD.clone().add(new Vector3(7.5, 18, 22)), color: redLight, intensity: 260, pattern: steady, surface: 0.05 },
		{ position: PAD.clone().add(new Vector3(7.5, 30, 22)), color: redLight, intensity: 260, pattern: steady, surface: 0.05 },
		{ position: lt1.clone().add(new Vector3(0, 181.5, 0)), color: redLight, intensity: 60, pattern: breathe(4, 0.6), sprite: { size: 4, brightness: 300 } },
		{ position: lt2.clone().add(new Vector3(0, 174.5, 0)), color: redLight, intensity: 60, pattern: breathe(4, 0.6, 1.3), sprite: { size: 4, brightness: 300 } },
		{ position: lt3.clone().add(new Vector3(0, 146.5, 0)), color: redLight, intensity: 40, pattern: breathe(4, 0.6, 2.4), sprite: { size: 3.5, brightness: 260 } },
		{ position: jibTip.clone().add(new Vector3(0, 0.6, 0)), color: redLight, intensity: 30, pattern: flash(2.2, 1.0), sprite: { size: 5, brightness: 420 } },
		{ position: jibRoot.clone().add(new Vector3(0, 7.6, 0)), color: rgb(0.9, 0.95, 1), intensity: 80, pattern: flash(1.6, 0.06, 0.4, 0.02, 0.08), sprite: { size: 7, brightness: 900 } },
		{ position: PAD.clone().add(new Vector3(-26, 6, 34)), color: mercury, intensity: 1900, pattern: steady, spot: { target: PAD.clone().add(new Vector3(-6, 40, 0)), angle: 0.42 }, sprite: { size: 8, brightness: 520 }, range: 120 },
		{ position: PAD.clone().add(new Vector3(30, 6, 36)), color: mercury, intensity: 1700, pattern: steady, spot: { target: PAD.clone().add(new Vector3(7, 44, 0)), angle: 0.4 }, sprite: { size: 8, brightness: 480 }, range: 120 },
		{ position: new Vector3(-30, height(-30, -312) + 11, -312), color: sodium, intensity: 700, pattern: flicker(0.04, 2), sprite: { size: 6, brightness: 380 }, range: 45 },
		{ position: new Vector3(62, height(62, -318) + 10, -318), color: sodium, intensity: 650, pattern: steady, sprite: { size: 6, brightness: 360 }, range: 45 },
		{ position: new Vector3(4, height(4, -360) + 9, -360), color: mercury, intensity: 500, pattern: steady, sprite: { size: 5, brightness: 300 }, range: 40 }
	];
	const updateSprites = addLightSprites(scene, atmos, lights, 0.5, 0.035);

	const camPos = eye;
	const target = new Vector3(PAD.x + 34, camPos.y + 2, PAD.z);

	return {
		scene,
		atmos,
		lights,
		windiness: 0.4,
		ao: { radius: 3, intensity: 1.3 },
		shadow: { center: new Vector3(PAD.x, 0, PAD.z + 140), radius: 420, depth: 3000, lightAngle: 0.05 },
		shot: { position: camPos, target, fov: 31, refAspect: 1.5, sway: 0.7 },
		volume: {
			range: 3500,
			density: 0.0002,
			base: 350,
			falloff: 0.004,
			noiseScale: 0.0018,
			noiseStrength: 0.9,
			coverage: 0.42,
			detail: 3.2,
			wind: [3, 0.2, 1],
			ambient: rgb(0.34, 0.6, 0.78),
			ground: rgb(0.08, 0.14, 0.14),
			lights: 1,
			sun: 0.2,
			steps: 28,
			resolution: 3
		},
		grade: {
			exposure: 0.34,
			lift: rgb(0.0, 0.01, 0.018),
			gamma: rgb(0.92, 1.0, 1.02),
			gain: rgb(0.55, 1.0, 1.12),
			saturation: 1.6,
			contrast: 1.24,
			bloom: 0.085,
			halation: 0.75,
			grain: 0.055,
			grainSize: 2.1,
			vignette: 0.45,
			aberration: 0.012,
			softness: 0.7,
			weave: 0.8,
			flare: 0.03,
			streak: 0.045,
			streakTint: rgb(0.8, 0.95, 1),
			dirt: 0.75,
			distortion: 0.04,
			dof: { focus: 255, strength: 3 }
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

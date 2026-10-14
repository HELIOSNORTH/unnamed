import { BoxGeometry, Mesh, Scene, Vector3 } from 'three';
import { createAtmosphereUniforms } from '../engine/atmosphere.ts';
import { gridTerrain, latticeTower, polarTerrain, type Segment } from '../engine/geometry.ts';
import { addLightSprites, addPoints, addRibbons, addSky, kelvin, rgb, type BuiltScene } from '../engine/kit.ts';
import { breathe, flash, flicker, steady, type SceneLight } from '../engine/lights.ts';
import { createSurfaceMaterial } from '../engine/materials.ts';
import { fbm, mulberry32, smoothstep, worley } from '../engine/noise.ts';

const SUMMIT = { x: 10, z: -960 };
const HILL = 215;

function landform(x: number, z: number): number {
	const dx = x - SUMMIT.x;
	const dz = z - SUMMIT.z;
	const hill = HILL * Math.exp(-(dx * dx) / (430 * 430) - (dz * dz) / (300 * 300));
	const spur = 90 * Math.exp(-((x + 260) ** 2) / (300 * 300) - ((z + 700) ** 2) / (260 * 260));
	const near = 320 * Math.exp(-(x * x) / (500 * 500) - ((z + 40) ** 2) / (240 * 240));
	const plateau = 1 - smoothstep(30, 80, Math.hypot(dx, dz));
	const roll = 26 * fbm(x / 260, z / 260, 4, 3) + 9 * fbm(x / 70, z / 70, 3, 8);
	const base = 70 + hill + spur + near + roll * (1 - plateau);
	return base + plateau * (HILL + 70 - base) * 0.65;
}

function canopy(x: number, z: number): number {
	const clear = smoothstep(55, 95, Math.hypot(x - SUMMIT.x, z - SUMMIT.z)) * (0.25 + 0.75 * smoothstep(180, 520, Math.hypot(x, z)));
	const w = worley(x / 9, z / 9, 21);
	const crown = Math.max(1 - w.f1 * w.f1 * 1.25, 0);
	return (8 + crown * crown * (3 - 2 * crown) * 6 + w.id * 3) * clear;
}

const ground = (x: number, z: number) => landform(x, z) + canopy(x, z);

export function buildHillStation(): BuiltScene {
	const scene = new Scene();
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.05, 0.044, 0.062),
		fogHigh: rgb(0.03, 0.027, 0.04),
		glowColor: rgb(0.035, 0.018, 0.008),
		glowDir: new Vector3(-0.6, 0.05, -1),
		glowExp: 2,
		fogDensity: 0.0006,
		fogFalloff: 0.0032,
		ambientSky: rgb(0.05, 0.045, 0.06),
		ambientGround: rgb(0.008, 0.008, 0.008),
		lightScatter: 1,
		phaseG: 0.55,
		isotropic: 0.02
	});

	addSky(scene, atmos, {
		zenith: rgb(0.022, 0.02, 0.03),
		horizon: rgb(0.04, 0.036, 0.048),
		curve: 0.7,
		clouds: { amount: 0.45, height: 2600, scale: 0.0002, color: rgb(0.03, 0.027, 0.038), underlight: rgb(0.03, 0.018, 0.01), speed: [2, 0.6] }
	});

	const forestMat = createSurfaceMaterial(atmos, {
		albedo: rgb(0.03, 0.045, 0.02),
		canopy: { cell: 9, color: rgb(0.022, 0.04, 0.016), color2: rgb(0.045, 0.06, 0.022), bump: 0.8 },
		wrap: 0.5
	});
	scene.add(new Mesh(gridTerrain({ x: [-760, 760], z: [-1300, -110], step: 2.6, height: ground }), forestMat));

	const lowland = (x: number, z: number) => {
		const d = Math.hypot(x, z);
		const fade = smoothstep(1200, 2600, d);
		return ground(x, z) * (1 - fade) + fade * (3 + 18 * Math.max(fbm(x / 3000, z / 3000, 4, 5), 0) - 2);
	};
	scene.add(
		new Mesh(
			polarTerrain({ center: [0, 0], span: 1.4, rMin: 1250, rMax: 40000, rings: 200, segments: 220, height: lowland }),
			createSurfaceMaterial(atmos, { albedo: rgb(0.012, 0.014, 0.012) })
		)
	);

	const top = landform(SUMMIT.x, SUMMIT.z);
	const aBase = new Vector3(SUMMIT.x - 40, top - 1, SUMMIT.z + 4);
	const bBase = new Vector3(SUMMIT.x + 78, landform(SUMMIT.x + 78, SUMMIT.z - 18) - 1, SUMMIT.z - 18);
	const cBase = new Vector3(SUMMIT.x - 82, landform(SUMMIT.x - 82, SUMMIT.z + 20) - 1, SUMMIT.z + 20);
	const a = latticeTower({ base: aBase, height: 70, baseWidth: 9, topWidth: 1.6, sections: 16, legRadius: 0.22, braceRadius: 0.1, rotation: 0.2 });
	const b = latticeTower({ base: bBase, height: 86, baseWidth: 10, topWidth: 2, sections: 18, legRadius: 0.24, braceRadius: 0.1, rotation: 0.5 });
	const c = latticeTower({ base: cBase, height: 34, baseWidth: 3, topWidth: 1, sections: 9, legs: 3, legRadius: 0.12, braceRadius: 0.06 });

	const band = (segs: Segment[], base: number, h: number, odd: boolean) =>
		segs.filter((s) => (Math.floor((((s.a.y + s.b.y) / 2 - base) / h) * 7) % 2 === 1) === odd);
	addRibbons(scene, atmos, band(a.segments, aBase.y, 70, true), { color: rgb(0.5, 0.08, 0.04), lightResponse: 0.5, minWidthPx: 0.6 });
	addRibbons(scene, atmos, band(a.segments, aBase.y, 70, false), { color: rgb(0.6, 0.58, 0.55), lightResponse: 0.5, minWidthPx: 0.6 });
	addRibbons(scene, atmos, [...b.segments, ...c.segments], { color: rgb(0.35, 0.36, 0.37), lightResponse: 0.45, minWidthPx: 0.6 });

	const hutMat = createSurfaceMaterial(atmos, { albedo: rgb(0.45, 0.42, 0.38), emissive: rgb(0.08, 0.05, 0.02) });
	const huts: [number, number, number, number, number][] = [
		[SUMMIT.x - 10, SUMMIT.z + 22, 14, 5, 8],
		[SUMMIT.x + 30, SUMMIT.z + 10, 9, 4, 7],
		[SUMMIT.x - 58, SUMMIT.z + 30, 7, 3.5, 6],
		[SUMMIT.x + 50, SUMMIT.z - 30, 12, 6, 9]
	];
	for (const [x, z, w, h, d] of huts) {
		const m = new Mesh(new BoxGeometry(w, h, d), hutMat);
		m.position.set(x, landform(x, z) + h / 2 - 0.5, z);
		m.rotation.y = 0.25;
		scene.add(m);
	}

	const sodium = kelvin(1900);
	const lights: SceneLight[] = [
		{ position: new Vector3(SUMMIT.x - 22, top + 5, SUMMIT.z + 34), color: sodium, intensity: 9000, pattern: flicker(0.03, 1), sprite: { size: 4, brightness: 420 }, spot: { target: aBase.clone().add(new Vector3(0, 30, 0)), angle: 0.75 } },
		{ position: new Vector3(SUMMIT.x + 18, top + 6, SUMMIT.z + 26), color: sodium, intensity: 7000, pattern: steady, sprite: { size: 4, brightness: 380 }, spot: { target: new Vector3(SUMMIT.x, top + 12, SUMMIT.z), angle: 0.9 } },
		{ position: new Vector3(SUMMIT.x + 60, top + 4, SUMMIT.z - 6), color: kelvin(2300), intensity: 4200, pattern: steady, sprite: { size: 3.5, brightness: 300 }, spot: { target: bBase.clone().add(new Vector3(0, 35, 0)), angle: 0.95 } },
		{ position: new Vector3(SUMMIT.x - 66, top + 4, SUMMIT.z + 42), color: sodium, intensity: 2600, pattern: steady, sprite: { size: 3.5, brightness: 300 } },
		{ position: new Vector3(SUMMIT.x - 5, top + 3, SUMMIT.z + 50), color: kelvin(4200), intensity: 900, pattern: steady, sprite: { size: 3, brightness: 200 } },
		{ position: new Vector3(SUMMIT.x + 30, top + 7, SUMMIT.z + 18), color: sodium, intensity: 2200, pattern: steady },
		{ position: aBase.clone().add(new Vector3(0, 71, 0)), color: rgb(1, 0.05, 0.02), intensity: 380, pattern: breathe(3.2, 0.25), sprite: { size: 6, brightness: 900 } },
		{ position: aBase.clone().add(new Vector3(0, 36, 0)), color: rgb(1, 0.05, 0.02), intensity: 120, pattern: steady, sprite: { size: 4, brightness: 300 } },
		{ position: bBase.clone().add(new Vector3(0, 87, 0)), color: rgb(1, 0.05, 0.02), intensity: 420, pattern: flash(2.6, 1.2, 0.7), sprite: { size: 6, brightness: 900 } },
		{ position: cBase.clone().add(new Vector3(0, 35, 0)), color: rgb(1, 0.05, 0.02), intensity: 90, pattern: steady, sprite: { size: 4, brightness: 260 } }
	];

	const rand = mulberry32(77);
	const city: Parameters<typeof addPoints>[2] = [];
	const palette = [kelvin(1900), kelvin(2200), kelvin(3500), kelvin(5000), rgb(0.35, 1, 0.55), kelvin(2700)];
	for (let i = 0; i < 1400; i++) {
		const cluster = rand() < 0.5 ? -1 : 1;
		const ang = cluster * (0.15 + rand() * 0.55) + (rand() - 0.5) * 0.2;
		const r = 3200 + Math.pow(rand(), 0.7) * 18000;
		const x = Math.sin(ang) * r;
		const z = -Math.cos(ang) * r;
		const c = palette[Math.floor(Math.pow(rand(), 1.6) * palette.length)];
		const b = (10 + rand() * 40) * (rand() < 0.05 ? 4 : 1);
		city.push({ p: new Vector3(x, lowland(x, z) + 3 + rand() * 20, z), color: [c.r * b, c.g * b, c.b * b], size: 2 + rand() * 1.5, twinkle: 0.4 });
	}
	for (let i = 0; i < 26; i++) {
		const x = -9000 + rand() * 16000;
		const z = -9000 - rand() * 14000;
		const green = rand() < 0.3;
		const c = green ? rgb(0.3, 1, 0.5) : kelvin(5200);
		const b = 25 + rand() * 30;
		city.push({ p: new Vector3(x, 8, z), color: [c.r * b, c.g * b, c.b * b], size: 3.2, twinkle: 0.2 });
	}
	addPoints(scene, atmos, city, 0.9);

	const updateSprites = addLightSprites(scene, atmos, lights, 0.6);
	const camPos = new Vector3(0, landform(0, 0) + 34, 0);
	const target = new Vector3(SUMMIT.x - 14, camPos.y - Math.hypot(SUMMIT.x, SUMMIT.z) * Math.tan((3.6 * Math.PI) / 180), SUMMIT.z);

	return {
		scene,
		atmos,
		lights,
		windiness: 0.3,
		shot: { position: camPos, target, fov: 16, refAspect: 1.5 },
		grade: {
			exposure: 1.25,
			lift: rgb(0.008, 0.006, 0.012),
			gamma: rgb(1.0, 1.0, 1.03),
			gain: rgb(1.02, 1.0, 1.0),
			saturation: 1.08,
			contrast: 1.04,
			bloom: 0.06,
			halation: 0.5,
			grain: 0.03,
			vignette: 0.5,
			aberration: 0.006
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

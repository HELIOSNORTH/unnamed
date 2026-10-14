import { CylinderGeometry, BoxGeometry, Mesh, Scene, Vector3, Group } from 'three';
import { createAtmosphereUniforms } from '../engine/atmosphere.ts';
import { polarTerrain } from '../engine/geometry.ts';
import { addLightSprites, addSky, addStars, rgb, type BuiltScene } from '../engine/kit.ts';
import { flash, type SceneLight } from '../engine/lights.ts';
import { createSurfaceMaterial } from '../engine/materials.ts';
import { fbm, mulberry32, ridged, smoothstep } from '../engine/noise.ts';

const TOWER = new Vector3(0, 0, -72);
const PEAK = 2500;

const CAM = { x: -30, z: 96 };
const AXIS = (() => {
	const dx = TOWER.x - CAM.x;
	const dz = TOWER.z - CAM.z;
	const l = Math.hypot(dx, dz);
	return { x: dx / l, z: dz / l, len: l };
})();

function height(x: number, z: number): number {
	const rx = x - CAM.x;
	const rz = z - CAM.z;
	const along = rx * AXIS.x + rz * AXIS.z;
	const side = Math.abs(rx * AXIS.z - rz * AXIS.x) + 18 * fbm(along / 300, 1.7, 3, 6);
	const crest = PEAK + 1.2 * fbm(x / 30, z / 30, 3, 2) - 0.015 * Math.abs(along - AXIS.len);
	const width = 26 + 14 * smoothstep(AXIS.len - 60, AXIS.len + 20, along);
	const flank = Math.pow(Math.max(side - width, 0), 1.32) * 0.85;
	const ends = Math.pow(Math.max(along - AXIS.len - 90, 0), 1.2) + Math.pow(Math.max(-along - 120, 0), 1.2);
	const rock = 45 * fbm(x / 160, z / 160, 4, 9) * smoothstep(width, width + 120, side);
	const summit = crest - flank - ends + rock;
	const r = Math.hypot(rx, rz);
	const ranges = 900 + 3400 * Math.pow(ridged(x / 8500, z / 8500, 7, 4), 1.4) * smoothstep(2500, 9000, r) + 220 * fbm(x / 2500, z / 2500, 5, 13);
	return Math.max(summit, ranges);
}

export function buildSummit(): BuiltScene {
	const scene = new Scene();
	const moonDir = new Vector3(0.5, 0.4, -0.76).normalize();
	const moonLight = rgb(0.2, 0.235, 0.3);
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.03, 0.044, 0.075),
		fogHigh: rgb(0.008, 0.014, 0.032),
		glowColor: rgb(0.05, 0.058, 0.07),
		glowDir: moonDir,
		glowExp: 7,
		fogDensity: 0.00007,
		fogFalloff: 0.0004,
		slab: { bottom: 1250, top: 1900, density: 0.005, scale: 0.00045, color: rgb(0.055, 0.068, 0.095), drift: [0.003, 0.001] },
		sunDir: moonDir,
		sunColor: moonLight,
		ambientSky: rgb(0.016, 0.024, 0.045),
		ambientGround: rgb(0.01, 0.012, 0.02),
		lightScatter: 1,
		phaseG: 0.7,
		isotropic: 0.01,
		skyDist: 60000
	});

	addSky(scene, atmos, {
		zenith: rgb(0.0025, 0.0045, 0.014),
		horizon: rgb(0.016, 0.026, 0.05),
		curve: 0.5,
		moon: { dir: moonDir, radius: 0.019, intensity: 34, halo: 0.22 }
	});
	addStars(scene, atmos, 2200, 0.35, 23);

	const camPos = new Vector3(CAM.x, 0, CAM.z);
	camPos.y = height(camPos.x, camPos.z) + 1.65;
	const terrain = polarTerrain({
		center: [camPos.x, camPos.z],
		yaw: Math.atan2(TOWER.x - camPos.x, camPos.z - TOWER.z),
		span: 2.5,
		rMin: 2,
		rMax: 70000,
		rings: 420,
		segments: 380,
		height,
		shadow: { dir: moonDir, maxDist: 25000, steps: 60 }
	});
	scene.add(
		new Mesh(
			terrain,
			createSurfaceMaterial(atmos, {
				albedo: rgb(0.06, 0.06, 0.065),
				albedo2: rgb(0.04, 0.04, 0.045),
				snow: { color: rgb(0.82, 0.86, 0.95), slope: 0.74, minHeight: 1500 },
				sparkle: 4,
				wrap: 0.1,
				bakedShadow: true
			})
		)
	);

	const concrete = createSurfaceMaterial(atmos, { albedo: rgb(0.32, 0.32, 0.33), albedo2: rgb(0.24, 0.24, 0.25), variation: 0.3, variationScale: 0.3, wrap: 0.2 });
	const dark = createSurfaceMaterial(atmos, { albedo: rgb(0.14, 0.14, 0.15), wrap: 0.3 });
	const dishMat = createSurfaceMaterial(atmos, { albedo: rgb(0.55, 0.56, 0.58), wrap: 0.4, spec: 0.3 });
	const tower = new Group();
	tower.position.set(TOWER.x, PEAK - 0.5, TOWER.z);
	const add = (m: Mesh, x: number, y: number, z: number) => {
		m.position.set(x, y, z);
		tower.add(m);
		return m;
	};
	add(new Mesh(new BoxGeometry(30, 16, 18), concrete), 0, 8, 6);
	add(new Mesh(new BoxGeometry(14, 6, 12), concrete), -18, 3, 2);
	add(new Mesh(new CylinderGeometry(4.2, 5.2, 96, 40, 1), concrete), 0, 48, 0);
	for (const [y, r, h] of [
		[40, 8.5, 2.2],
		[58, 9.5, 2.6],
		[75, 8, 2.2],
		[88, 6, 4]
	] as const) {
		add(new Mesh(new CylinderGeometry(r, r, h, 48, 1), dark), 0, y, 0);
	}
	add(new Mesh(new CylinderGeometry(1.4, 2.4, 30, 20, 1), concrete), 0, 110, 0);
	add(new Mesh(new CylinderGeometry(0.4, 0.8, 18, 10, 1), dark), 0, 133, 0);

	const rand = mulberry32(31);
	const dishGeo = new CylinderGeometry(1, 1, 0.9, 32, 1);
	for (const [y, count, ring] of [
		[30, 5, 5.8],
		[44, 8, 9.2],
		[52, 6, 6],
		[62, 9, 10],
		[70, 7, 6.2],
		[80, 6, 8.5],
		[96, 5, 6]
	] as const) {
		for (let i = 0; i < count; i++) {
			const ang = (i / count) * Math.PI * 2 + rand() * 0.4 + y;
			const r = 0.9 + rand() * 1.3;
			const d = new Mesh(dishGeo, dishMat);
			d.scale.set(r, 0.5 + rand() * 0.3, r);
			d.position.set(Math.cos(ang) * (ring + r * 0.3), y + (rand() - 0.5) * 3, Math.sin(ang) * (ring + r * 0.3));
			d.rotation.set(0, -ang, Math.PI / 2);
			tower.add(d);
		}
	}
	scene.add(tower);

	const lights: SceneLight[] = [
		{
			position: new Vector3(TOWER.x, PEAK + 142, TOWER.z),
			color: rgb(1, 0.05, 0.02),
			intensity: 160,
			pattern: flash(3.0, 1.4, 0, 0.3, 0.6),
			sprite: { size: 5, brightness: 700 }
		},
		{ position: new Vector3(TOWER.x + 5, PEAK + 90.5, TOWER.z), color: rgb(1, 0.05, 0.02), intensity: 50, pattern: flash(3.0, 1.4, 0, 0.3, 0.6), sprite: { size: 3.5, brightness: 260 } }
	];
	const updateSprites = addLightSprites(scene, atmos, lights, 0.4);

	const target = new Vector3(TOWER.x + 22, PEAK + 50, TOWER.z);

	return {
		scene,
		atmos,
		lights,
		windiness: 1.0,
		shot: { position: camPos, target, fov: 50, refAspect: 0.68, sway: 0.8 },
		grade: {
			exposure: 1.5,
			lift: rgb(0.004, 0.006, 0.014),
			gamma: rgb(0.98, 1.0, 1.04),
			gain: rgb(0.96, 1.0, 1.06),
			saturation: 1.05,
			contrast: 1.08,
			bloom: 0.05,
			halation: 0.35,
			grain: 0.03,
			vignette: 0.6,
			aberration: 0.008
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

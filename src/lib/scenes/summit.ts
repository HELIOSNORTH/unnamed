import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, Object3D, Scene, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
	const knoll = 30 * Math.exp(-(rx * rx + rz * rz) / (75 * 75));
	const summit = crest - flank - ends + rock + knoll;
	const r = Math.hypot(rx, rz);
	const ranges = 900 + 2700 * Math.pow(ridged(x / 8500, z / 8500, 7, 4), 1.35) * smoothstep(11000, 26000, r) + 220 * fbm(x / 2500, z / 2500, 5, 13);
	return Math.max(summit, ranges);
}

export function buildSummit(): BuiltScene {
	const scene = new Scene();
	const fwd = new Vector3(AXIS.x, 0, AXIS.z);
	const right = new Vector3(-AXIS.z, 0, AXIS.x);
	const heading = (yawDeg: number, elevDeg: number) => {
		const y = (yawDeg * Math.PI) / 180;
		const e = (elevDeg * Math.PI) / 180;
		const h = fwd.clone().multiplyScalar(Math.cos(y)).addScaledVector(right, Math.sin(y));
		return h.multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize();
	};
	const moonDir = heading(11.7, 17);
	const keyDir = moonDir;
	const moonLight = rgb(0.2, 0.225, 0.29);
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.007, 0.01, 0.018),
		fogHigh: rgb(0.001, 0.0012, 0.0018),
		glowColor: rgb(0.012, 0.014, 0.018),
		glowDir: moonDir,
		glowExp: 7,
		fogDensity: 0.00007,
		fogFalloff: 0.0004,
		sunDir: keyDir,
		sunColor: moonLight,
		ambientSky: rgb(0.005, 0.007, 0.013),
		ambientGround: rgb(0.006, 0.007, 0.011),
		lightScatter: 1,
		phaseG: 0.7,
		isotropic: 0.01,
		skyDist: 60000
	});

	addSky(scene, atmos, {
		zenith: rgb(0.0008, 0.0009, 0.0014),
		horizon: rgb(0.004, 0.006, 0.012),
		curve: 0.5,
		moon: { dir: moonDir, radius: 0.02, intensity: 1.5, halo: 0.035 }
	});
	addStars(scene, atmos, 1600, 0.25, 23);

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
		shadow: { dir: keyDir, maxDist: 25000, steps: 60 }
	});
	scene.add(
		new Mesh(
			terrain,
			createSurfaceMaterial(atmos, {
				albedo: rgb(0.06, 0.06, 0.065),
				albedo2: rgb(0.04, 0.04, 0.045),
				snow: { color: rgb(0.4, 0.43, 0.5), slope: 0.74, minHeight: 1500 },
				sparkle: 24,
				wrap: 0.1,
				bakedShadow: true
			})
		)
	);

	const concrete = createSurfaceMaterial(atmos, { albedo: rgb(0.14, 0.15, 0.17), albedo2: rgb(0.1, 0.11, 0.12), variation: 0.3, variationScale: 0.3, wrap: 0.2 });
	const dark = createSurfaceMaterial(atmos, { albedo: rgb(0.07, 0.075, 0.085), wrap: 0.3 });
	const dishMat = createSurfaceMaterial(atmos, { albedo: rgb(0.66, 0.68, 0.7), wrap: 0.5, spec: 0.4 });
	const roofMat = createSurfaceMaterial(atmos, { albedo: rgb(0.7, 0.74, 0.8), wrap: 0.3 });
	const tower = new Group();
	tower.position.set(TOWER.x, PEAK - 0.5, TOWER.z);
	const add = (m: Mesh, x: number, y: number, z: number) => {
		m.position.set(x, y, z);
		tower.add(m);
		return m;
	};
	add(new Mesh(new BoxGeometry(16, 9, 12), concrete), 2, 4.5, 6);
	add(new Mesh(new BoxGeometry(16.6, 0.8, 12.6), roofMat), 2, 9.2, 6);
	add(new Mesh(new BoxGeometry(10, 5, 8), concrete), -14, 2.5, 14);
	add(new Mesh(new BoxGeometry(10.6, 0.7, 8.6), roofMat), -14, 5.3, 14);
	add(new Mesh(new BoxGeometry(7, 4, 6), concrete), 15, 2, 20);
	add(new Mesh(new BoxGeometry(7.6, 0.6, 6.6), roofMat), 15, 4.3, 20);
	add(new Mesh(new CylinderGeometry(2.0, 2.9, 112, 32, 1), concrete), 0, 56, 0);
	for (const y of [22, 34, 46, 58, 70, 82, 94, 106]) add(new Mesh(new CylinderGeometry(4.3, 4.3, 1.1, 40, 1), dark), 0, y, 0);
	add(new Mesh(new CylinderGeometry(0.9, 1.5, 10, 16, 1), concrete), 0, 117, 0);
	add(new Mesh(new CylinderGeometry(0.25, 0.5, 12, 8, 1), dark), 0, 128, 0);

	const rand = mulberry32(31);
	const dishGeo = new CylinderGeometry(1, 1, 0.5, 28, 1);
	const dishes: BufferGeometry[] = [];
	const placer = new Object3D();
	for (let y = 16; y <= 114; y += 4.0) {
		const count = 3 + Math.floor(rand() * 4);
		for (let i = 0; i < count; i++) {
			const ang = (i / count) * Math.PI * 2 + rand() * 0.9 + y * 0.37;
			const r = 0.6 + rand() * 1.0;
			const ring = (y > 108 ? 1.8 : 2.9) + r * 0.6;
			placer.scale.set(r, 0.7 + rand() * 0.6, r);
			placer.position.set(Math.cos(ang) * ring, y + (rand() - 0.5) * 2, Math.sin(ang) * ring);
			placer.rotation.set(0, -ang, Math.PI / 2);
			placer.updateMatrix();
			dishes.push(dishGeo.clone().applyMatrix4(placer.matrix));
		}
	}
	tower.add(new Mesh(mergeGeometries(dishes), dishMat));
	dishGeo.dispose();
	scene.add(tower);

	const lights: SceneLight[] = [
		{
			position: new Vector3(TOWER.x, PEAK + 142, TOWER.z),
			color: rgb(1, 0.05, 0.02),
			intensity: 160,
			pattern: flash(3.0, 1.4, 0, 0.3, 0.6),
			sprite: { size: 5, brightness: 700 },
			surface: 0.1
		},
		{ position: new Vector3(TOWER.x + 3, PEAK + 93, TOWER.z), color: rgb(1, 0.05, 0.02), intensity: 50, pattern: flash(3.0, 1.4, 0, 0.3, 0.6), sprite: { size: 3.5, brightness: 260 }, surface: 0.1 }
	];
	const updateSprites = addLightSprites(scene, atmos, lights, 0.5, 0.03);

	const target = camPos.clone().addScaledVector(heading(6.4, 12), 100);

	return {
		scene,
		atmos,
		lights,
		windiness: 1.0,
		ao: { radius: 2, intensity: 1.2 },
		shadow: { center: new Vector3(TOWER.x - 15, PEAK, TOWER.z + 150), radius: 300, depth: 2600, lightAngle: 0.0045 },
		volume: {
			range: 420,
			density: 0.007,
			base: PEAK + 4,
			falloff: 0.2,
			noiseScale: 0.022,
			noiseStrength: 1,
			coverage: 0.48,
			detail: 3.1,
			wind: [9, 0.4, 3],
			ambient: rgb(0.007, 0.009, 0.015),
			ground: rgb(0.004, 0.005, 0.008),
			lights: 1,
			sun: 1.0,
			steps: 28,
			resolution: 3
		},
		shot: { position: camPos, target, fov: 54, refAspect: 0.67, sway: 0.8 },
		grade: {
			exposure: 1.1,
			lift: rgb(0.002, 0.0025, 0.004),
			gamma: rgb(0.98, 1.0, 1.04),
			gain: rgb(0.98, 1.0, 1.02),
			saturation: 1.05,
			contrast: 1.08,
			bloom: 0.065,
			halation: 0.45,
			grain: 0.03,
			vignette: 0.6,
			aberration: 0.009,
			streak: 0.045,
			flare: 0.045,
			dirt: 1.05,
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

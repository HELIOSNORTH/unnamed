import { CylinderGeometry, Mesh, Scene, Vector3 } from 'three';
import { createAtmosphereUniforms } from '../engine/atmosphere.ts';
import { branchingPlant, latticeTower, polarTerrain, catenary, type Segment } from '../engine/geometry.ts';
import { addLightSprites, addRibbons, addSky, addStars, addPoints, kelvin, rgb, type BuiltScene } from '../engine/kit.ts';
import { flash, steady, type SceneLight } from '../engine/lights.ts';
import { createSurfaceMaterial } from '../engine/materials.ts';
import { fbm, mulberry32 } from '../engine/noise.ts';

function height(x: number, z: number): number {
	const d = -z;
	const shift = 28 * fbm(x / 420, 3.1, 3, 41);
	const dd = d - 300 - shift;
	const ridge = dd < 0 ? Math.exp(-((dd / 125) ** 2)) : Math.exp(-((dd / 420) ** 2));
	const lift = 1 + 0.25 * fbm(x / 260, 9.7, 3, 5);
	return 31 * ridge * lift + 5 * fbm(x / 170, z / 170, 4, 11) + 0.9 * fbm(x / 22, z / 22, 3, 17) - 0.04 * Math.max(d - 700, 0);
}

export function buildBeacon(): BuiltScene {
	const scene = new Scene();
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.02, 0.0135, 0.04),
		fogHigh: rgb(0.003, 0.0055, 0.022),
		glowColor: rgb(0.032, 0.01, 0.03),
		glowDir: new Vector3(-0.3, 0.02, -1),
		glowExp: 9,
		fogDensity: 0.00026,
		fogFalloff: 0.0035,
		ambientSky: rgb(0.012, 0.013, 0.034),
		ambientGround: rgb(0.004, 0.003, 0.006),
		lightScatter: 1.0,
		phaseG: 0.86,
		isotropic: 0.004
	});

	addSky(scene, atmos, {
		zenith: rgb(0.0016, 0.003, 0.0135),
		horizon: rgb(0.01, 0.008, 0.026),
		curve: 0.45
	});
	addStars(scene, atmos, 15000, 2.2, 11);

	const ground = new Mesh(
		polarTerrain({ center: [0, 0], span: 1.6, rMin: 2, rMax: 14000, rings: 340, segments: 260, height }),
		createSurfaceMaterial(atmos, { albedo: rgb(0.05, 0.04, 0.032), albedo2: rgb(0.03, 0.028, 0.025), variation: 0.3, variationScale: 0.02 })
	);
	scene.add(ground);

	const towerBase = new Vector3(4, height(4, -312) - 0.5, -312);
	const tower = latticeTower({ base: towerBase, height: 46, baseWidth: 7, topWidth: 1.6, sections: 14, legRadius: 0.14, braceRadius: 0.06, rotation: 0.3 });
	const mastBase = new Vector3(66, height(66, -430) - 0.5, -430);
	const mast = latticeTower({ base: mastBase, height: 330, baseWidth: 1.1, topWidth: 1.1, sections: 160, legs: 3, legRadius: 0.07, braceRadius: 0.03, rotation: 0.4, taperPower: 1 });

	const guys: Segment[] = [];
	for (const h of [60, 120, 180, 240, 300]) {
		for (let k = 0; k < 3; k++) {
			const ang = 0.4 + (k / 3) * Math.PI * 2;
			const dist = 70 + h * 0.62;
			const ax = mastBase.x + Math.cos(ang) * dist;
			const az = mastBase.z + Math.sin(ang) * dist;
			guys.push(...catenary(new Vector3(mastBase.x, mastBase.y + h, mastBase.z), new Vector3(ax, height(ax, az), az), h * 0.012, 0.018, 12));
		}
	}

	const poleX = -74;
	const poleZ = -300;
	const py = height(poleX, poleZ);
	const pole: Segment[] = [
		{ a: new Vector3(poleX - 1.4, py - 1, poleZ), b: new Vector3(poleX - 1.4, py + 9.5, poleZ), r: 0.16 },
		{ a: new Vector3(poleX + 1.4, py - 1, poleZ), b: new Vector3(poleX + 1.4, py + 9.5, poleZ), r: 0.16 },
		{ a: new Vector3(poleX - 2.6, py + 8.8, poleZ), b: new Vector3(poleX + 2.6, py + 8.8, poleZ), r: 0.11 },
		{ a: new Vector3(poleX - 2.2, py + 7.4, poleZ), b: new Vector3(poleX + 2.2, py + 7.4, poleZ), r: 0.08 },
		{ a: new Vector3(poleX - 1.4, py + 3.5, poleZ), b: new Vector3(poleX + 1.4, py + 6.8, poleZ), r: 0.05 },
		{ a: new Vector3(poleX + 1.4, py + 3.5, poleZ), b: new Vector3(poleX - 1.4, py + 6.8, poleZ), r: 0.05 }
	];
	for (const x of [-2.4, 0, 2.4]) {
		pole.push(...catenary(new Vector3(poleX + x, py + 9.2, poleZ), new Vector3(poleX + x - 260, height(poleX - 260, poleZ + 40) + 9, poleZ + 40), 3.5, 0.012, 16));
		pole.push(...catenary(new Vector3(poleX + x, py + 9.2, poleZ), new Vector3(poleX + x + 200, height(poleX + 200, poleZ - 60) + 9, poleZ - 60), 3, 0.012, 16));
	}

	const rand = mulberry32(5);
	const plants: Segment[] = [];
	for (let i = 0; i < 70; i++) {
		const x = -190 + rand() * 300;
		let bestZ = -300;
		let best = -1e9;
		for (let z = -220; z > -420; z -= 6) {
			const h = height(x, z);
			if (h > best) {
				best = h;
				bestZ = z;
			}
		}
		const z = bestZ + 20 + rand() * 50;
		const hgt = 1.4 + rand() * rand() * 4.5;
		plants.push(
			...branchingPlant({ root: new Vector3(x, height(x, z) - 0.2, z), height: hgt, spread: 1.7, depth: 6, seed: i * 13 + 1, radius: 0.11, children: 3, upBias: 0.4 })
		);
	}
	for (let i = 0; i < 26; i++) {
		const x = -60 + rand() * 120;
		const z = -18 - rand() * 120;
		const hgt = 0.5 + rand() * 1.4;
		plants.push(
			...branchingPlant({ root: new Vector3(x, height(x, z) - 0.1, z), height: hgt, spread: 1.7, depth: 4, seed: 900 + i, radius: 0.025, children: 3, upBias: 0.3 })
		);
	}

	addRibbons(scene, atmos, [...tower.segments, ...mast.segments, ...pole], { color: rgb(0.09, 0.09, 0.1), minWidthPx: 0.55, lightResponse: 0.06 });
	addRibbons(scene, atmos, guys, { color: rgb(0.2, 0.2, 0.2), minWidthPx: 0.45, lightResponse: 0.3 });
	addRibbons(scene, atmos, plants, { color: rgb(0.012, 0.011, 0.01), minWidthPx: 0.7, lightResponse: 0.05 });

	const dishMat = createSurfaceMaterial(atmos, { albedo: rgb(0.32, 0.32, 0.33), wrap: 0.4 });
	const dishSpecs: [number, number, number, number][] = [
		[44.5, 0.9, 0.2, 0.0],
		[43.0, 1.1, 2.4, 1.0],
		[41.0, 1.2, 4.1, 0.6],
		[39.0, 0.9, 1.3, 0.2],
		[36.5, 1.4, 3.3, 0.8],
		[33.0, 1.0, 5.2, 0.4],
		[30.5, 0.8, 0.7, 1.2],
		[28.0, 0.9, 2.9, 0.3]
	];
	for (const [h, r, ang, tilt] of dishSpecs) {
		const w = tower.widthAt(h) * 0.7 + r * 0.6;
		const dish = new Mesh(new CylinderGeometry(r, r * 0.92, 0.35, 28, 1), dishMat);
		dish.position.set(towerBase.x + Math.cos(ang) * w, towerBase.y + h, towerBase.z + Math.sin(ang) * w);
		dish.rotation.set(Math.PI / 2 + tilt * 0.1, 0, 0);
		dish.rotateOnWorldAxis(new Vector3(0, 1, 0), -ang + Math.PI / 2);
		scene.add(dish);
	}

	const red = rgb(1, 0.035, 0.012);
	const lights: SceneLight[] = [];
	const beat = flash(2.05, 1.0, 0, 0.2, 0.42);
	for (const h of [64, 96, 128, 160, 194]) {
		lights.push({ position: new Vector3(mastBase.x, mastBase.y + h, mastBase.z + 0.8), color: red, intensity: 250, pattern: beat, sprite: { size: 7, brightness: 900 }, surface: 0.5 });
	}
	lights.push({
		position: new Vector3(towerBase.x, towerBase.y + 47.2, towerBase.z),
		color: kelvin(5200),
		intensity: 90,
		pattern: steady,
		sprite: { size: 4, brightness: 260 }
	});
	lights.push({
		position: new Vector3(mastBase.x - 3, mastBase.y + 2.5, mastBase.z + 6),
		color: kelvin(2000),
		intensity: 260,
		pattern: steady,
		sprite: { size: 5, brightness: 500 }
	});

	const distant: Parameters<typeof addPoints>[2] = [];
	const far = [
		[-2400, -5200, 210],
		[-900, -7600, 260],
		[3100, -6400, 180]
	];
	far.forEach(([x, z, hh], i) => {
		const steps = Math.floor(hh / 45);
		for (let k = 1; k <= steps; k++) {
			lights.push({
				position: new Vector3(x, height(x, z) + k * 45, z),
				color: red,
				intensity: 0,
				scatter: false,
				pattern: flash(2.3 + i * 0.37, 1.0, i * 0.81),
				sprite: { size: 3.2, brightness: 160 }
			});
		}
	});
	for (let i = 0; i < 60; i++) {
		const x = -6000 + rand() * 12000;
		const z = -1800 - rand() * 9000;
		const c = rand() < 0.6 ? kelvin(2100) : kelvin(4200);
		const b = 2 + rand() * 8;
		distant.push({ p: new Vector3(x, height(x, z) + 2, z), color: [c.r * b, c.g * b, c.b * b], size: 2.2, twinkle: 0.3 });
	}
	addPoints(scene, atmos, distant, 0.5);

	const updateSprites = addLightSprites(scene, atmos, lights, 0.45);

	const camPos = new Vector3(0, height(0, 0) + 1.6, 0);
	const target = camPos.clone().add(new Vector3(Math.sin(0.018), Math.tan((10.4 * Math.PI) / 180), -1).multiplyScalar(300));

	return {
		scene,
		atmos,
		lights,
		windiness: 0.55,
		shot: { position: camPos, target, fov: 14, refAspect: 1.55 },
		grade: {
			exposure: 1.0,
			lift: rgb(0.004, 0.003, 0.012),
			gamma: rgb(1.0, 0.98, 1.04),
			gain: rgb(1.0, 0.97, 1.02),
			saturation: 1.12,
			contrast: 1.06,
			bloom: 0.05,
			halation: 0.6,
			grain: 0.035,
			vignette: 0.55,
			aberration: 0.006
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

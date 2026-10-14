import { BoxGeometry, CylinderGeometry, Group, Mesh, Scene, Vector3 } from 'three';
import { createAtmosphereUniforms } from '../engine/atmosphere.ts';
import { catenary, latticeTower, polarTerrain, type Segment } from '../engine/geometry.ts';
import { addLightSprites, addRibbons, addSky, addStars, addPoints, kelvin, rgb, type BuiltScene } from '../engine/kit.ts';
import { steady, type SceneLight } from '../engine/lights.ts';
import { createSurfaceMaterial } from '../engine/materials.ts';
import { fbm, mulberry32, smoothstep } from '../engine/noise.ts';

function height(x: number, z: number): number {
	const berm = 2.1 * smoothstep(-1.2, -3.2, z) * smoothstep(-9.5, -6.5, z) * (1 - smoothstep(14, 30, Math.abs(x)));
	return berm + 0.4 * fbm(x / 30, z / 30, 3, 4) + 6 * fbm(x / 600, z / 600, 3, 9) * smoothstep(80, 400, -z);
}

function pylon(base: Vector3, h: number, rot: number): { segs: Segment[]; arms: Vector3[] } {
	const t = latticeTower({ base, height: h, baseWidth: 7, topWidth: 1.4, sections: 12, legRadius: 0.13, braceRadius: 0.05, rotation: rot, taperPower: 1.4 });
	const segs = [...t.segments];
	const arms: Vector3[] = [];
	const ax = new Vector3(Math.cos(rot), 0, Math.sin(rot));
	for (const [hh, span] of [
		[h * 0.62, 9],
		[h * 0.78, 7],
		[h * 0.92, 5.5]
	] as const) {
		const c = base.clone().add(new Vector3(0, hh, 0));
		const w = t.widthAt(hh) * 0.5;
		for (const s of [-1, 1]) {
			const tip = c.clone().addScaledVector(ax, s * span);
			const root = c.clone().addScaledVector(ax, s * w);
			segs.push({ a: root.clone().add(new Vector3(0, 0.6, 0)), b: tip, r: 0.08 });
			segs.push({ a: root.clone().add(new Vector3(0, -0.6, 0)), b: tip, r: 0.08 });
			segs.push({ a: root.clone().add(new Vector3(0, 0.6, 0)), b: root.clone().add(new Vector3(0, -0.6, 0)), r: 0.05 });
			const ins = tip.clone().add(new Vector3(0, -2.2, 0));
			segs.push({ a: tip, b: ins, r: 0.09 });
			arms.push(ins);
		}
	}
	segs.push({ a: base.clone().add(new Vector3(0, h, 0)), b: base.clone().add(new Vector3(0, h + 4, 0)), r: 0.07 });
	return { segs, arms };
}

export function buildPylons(): BuiltScene {
	const scene = new Scene();
	const atmos = createAtmosphereUniforms({
		fogLow: rgb(0.022, 0.026, 0.04),
		fogHigh: rgb(0.002, 0.003, 0.01),
		glowColor: rgb(0.024, 0.02, 0.02),
		glowDir: new Vector3(-0.3, 0.0, -1),
		glowExp: 3,
		fogDensity: 0.00022,
		fogFalloff: 0.002,
		ambientSky: rgb(0.008, 0.01, 0.022),
		ambientGround: rgb(0.003, 0.003, 0.004),
		lightScatter: 0.6,
		phaseG: 0.7,
		isotropic: 0.01
	});

	addSky(scene, atmos, {
		zenith: rgb(0.0012, 0.0022, 0.009),
		horizon: rgb(0.008, 0.011, 0.024),
		curve: 0.4,
		milkyWay: { normal: new Vector3(0.62, 0.35, 0.7), intensity: 0.02 }
	});
	addStars(scene, atmos, 16000, 1.45, 41);

	scene.add(
		new Mesh(
			polarTerrain({ center: [0, 0], span: 2.6, rMin: 0.5, rMax: 12000, rings: 260, segments: 240, height }),
			createSurfaceMaterial(atmos, { albedo: rgb(0.007, 0.0065, 0.006), albedo2: rgb(0.005, 0.005, 0.005) })
		)
	);

	const poleBase = new Vector3(7.5, height(7.5, -15), -15);
	const paint = createSurfaceMaterial(atmos, { albedo: rgb(0.62, 0.62, 0.6), albedo2: rgb(0.5, 0.5, 0.49), variation: 0.3, variationScale: 0.4, wrap: 0.25, spec: 0.2 });
	const darkMat = createSurfaceMaterial(atmos, { albedo: rgb(0.32, 0.32, 0.33), wrap: 0.3 });
	const pole = new Group();
	pole.position.copy(poleBase);
	const add = (m: Mesh, x: number, y: number, z: number, ry = 0) => {
		m.position.set(x, y, z);
		m.rotation.y = ry;
		pole.add(m);
		return m;
	};
	add(new Mesh(new CylinderGeometry(0.36, 0.52, 27, 24, 1), paint), 0, 13.5, 0);
	add(new Mesh(new CylinderGeometry(0.55, 0.55, 0.5, 24, 1), paint), 0, 12, 0);
	add(new Mesh(new CylinderGeometry(0.42, 0.42, 0.4, 24, 1), paint), 0, 20, 0);
	add(new Mesh(new CylinderGeometry(1.7, 1.7, 0.18, 3, 1), darkMat), 0, 26.4, 0);
	add(new Mesh(new CylinderGeometry(1.5, 1.5, 0.12, 3, 1), darkMat), 0, 28.8, 0);
	const panel = new BoxGeometry(0.34, 1.9, 0.14);
	for (let s = 0; s < 3; s++) {
		const ang = (s / 3) * Math.PI * 2 + 0.3;
		for (let k = -1; k <= 1; k++) {
			const r = 1.55;
			const ox = Math.cos(ang) * r - Math.sin(ang) * k * 0.55;
			const oz = Math.sin(ang) * r + Math.cos(ang) * k * 0.55;
			add(new Mesh(panel, paint), ox, 27.7, oz, -ang + Math.PI / 2);
		}
		add(new Mesh(new BoxGeometry(0.4, 0.55, 0.22), darkMat), Math.cos(ang) * 0.9, 25.4, Math.sin(ang) * 0.9, -ang);
	}
	add(new Mesh(new CylinderGeometry(0.06, 0.08, 4, 8, 1), darkMat), 0, 30.3, 0);
	scene.add(pole);

	const a = pylon(new Vector3(-13, height(-13, -48), -48), 31, 0.35);
	const b = pylon(new Vector3(-58, height(-58, -128), -128), 31, 0.4);
	const c = pylon(new Vector3(36, height(36, -150), -150), 34, -0.15);
	const d = pylon(new Vector3(70, height(70, -90), -90), 34, -0.2);
	const wires: Segment[] = [];
	for (let i = 0; i < a.arms.length; i++) {
		wires.push(...catenary(a.arms[i], b.arms[i], 4, 0.016, 30));
		wires.push(...catenary(a.arms[i], a.arms[i].clone().add(new Vector3(52, 6, 115)), 4.5, 0.016, 30));
		wires.push(...catenary(c.arms[i], d.arms[i], 3.2, 0.016, 30));
		wires.push(...catenary(c.arms[i], c.arms[i].clone().add(new Vector3(-92, 0, -95)), 4, 0.016, 30));
	}
	const pylonColor = { color: rgb(0.2, 0.2, 0.21), minWidthPx: 0.6, lightResponse: 0.55 };
	addRibbons(scene, atmos, [...a.segs, ...b.segs, ...c.segs, ...d.segs], pylonColor);
	addRibbons(scene, atmos, wires, { color: rgb(0.1, 0.1, 0.11), minWidthPx: 0.45, lightResponse: 0.12 });

	const lamp = kelvin(4300);
	const lights: SceneLight[] = [
		{ position: new Vector3(-10, 9, 10), color: lamp, intensity: 1700, pattern: steady, spot: { target: new Vector3(7.5, 14, -15), angle: 0.5 } },
		{ position: new Vector3(-30, 7, -62), color: kelvin(4000), intensity: 420, pattern: steady }
	];

	const rand = mulberry32(4);
	const town: Parameters<typeof addPoints>[2] = [];
	for (let i = 0; i < 220; i++) {
		const ang = -1.1 + rand() * 2.2;
		const r = 1500 + rand() * 9000;
		const x = Math.sin(ang) * r;
		const z = -Math.cos(ang) * r;
		const col = rand() < 0.6 ? kelvin(2100) : kelvin(4500);
		const k = 3 + rand() * 10;
		town.push({ p: new Vector3(x, height(x, z) + 2 + rand() * 8, z), color: [col.r * k, col.g * k, col.b * k], size: 2, twinkle: 0.4 });
	}
	addPoints(scene, atmos, town, 0.6);
	const updateSprites = addLightSprites(scene, atmos, lights);

	const camPos = new Vector3(-1.5, height(-1.5, 0) + 0.9, 0.5);
	const target = new Vector3(3.5, 23, -22);

	return {
		scene,
		atmos,
		lights,
		windiness: 0.5,
		shot: { position: camPos, target, fov: 74, refAspect: 0.6, sway: 0.6 },
		grade: {
			exposure: 1.35,
			lift: rgb(0.003, 0.004, 0.012),
			gamma: rgb(1.0, 1.0, 1.03),
			gain: rgb(0.98, 1.0, 1.04),
			saturation: 1.0,
			contrast: 1.05,
			bloom: 0.04,
			halation: 0.3,
			grain: 0.032,
			vignette: 0.65,
			aberration: 0.012
		},
		update: (_t, levels) => updateSprites(levels)
	};
}

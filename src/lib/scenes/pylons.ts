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
	const t = latticeTower({ base, height: h, baseWidth: 5, topWidth: 1.2, sections: 12, legRadius: 0.13, braceRadius: 0.05, rotation: rot, taperPower: 1.4 });
	const segs = [...t.segments];
	const arms: Vector3[] = [];
	const ax = new Vector3(Math.cos(rot), 0, Math.sin(rot));
	for (const [hh, span] of [
		[h * 0.6, 5],
		[h * 0.75, 4.4],
		[h * 0.9, 3.6]
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
		fogLow: rgb(0.04, 0.046, 0.054),
		fogHigh: rgb(0.001, 0.0026, 0.0042),
		glowColor: rgb(0.012, 0.012, 0.014),
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
		zenith: rgb(0.0009, 0.0025, 0.0042),
		horizon: rgb(0.014, 0.019, 0.03),
		curve: 0.55
	});
	addStars(scene, atmos, 9000, 0.9, 41);

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
	add(new Mesh(new CylinderGeometry(0.2, 0.3, 27, 20, 1), paint), 0, 13.5, 0);
	add(new Mesh(new CylinderGeometry(0.34, 0.34, 0.5, 20, 1), paint), 0, 12, 0);
	add(new Mesh(new CylinderGeometry(0.27, 0.27, 0.4, 20, 1), paint), 0, 20, 0);
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

	const a = pylon(new Vector3(13, height(13, -60), -60), 37, 0.15);
	const b = pylon(new Vector3(-170, height(-170, -110), -110), 31, 0.2);
	const c = pylon(new Vector3(49, height(49, -84), -84), 34, 0.1);
	const d = pylon(new Vector3(200, height(200, -120), -120), 34, 0.1);
	const wires: Segment[] = [];
	for (let i = 0; i < a.arms.length; i++) {
		wires.push(...catenary(a.arms[i], b.arms[i], 6, 0.018, 40));
		wires.push(...catenary(c.arms[i], d.arms[i], 5, 0.018, 40));
		wires.push(...catenary(a.arms[i], c.arms[i], 2.5, 0.018, 30));
	}
	const pylonColor = { color: rgb(0.5, 0.5, 0.5), minWidthPx: 0.6, lightResponse: 0.6 };
	addRibbons(scene, atmos, [...a.segs, ...b.segs, ...c.segs, ...d.segs], pylonColor);
	addRibbons(scene, atmos, wires, { color: rgb(0.1, 0.1, 0.11), minWidthPx: 0.45, lightResponse: 0.12 });

	const lamp = kelvin(4300);
	const lights: SceneLight[] = [
		{ position: new Vector3(-10, 9, 10), color: lamp, intensity: 1700, pattern: steady, spot: { target: new Vector3(7.5, 14, -15), angle: 0.5 } },
		{ position: new Vector3(20, 5, -40), color: kelvin(3600), intensity: 900, pattern: steady, range: 80 }
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

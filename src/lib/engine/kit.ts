import { BufferAttribute, Color, Mesh, Points, Scene, SphereGeometry, type BufferGeometry, type Material, type Object3D } from 'three';
import type { AtmosphereUniforms } from './atmosphere.ts';
import { pointsGeometry, ribbonGeometry, starField, type Segment } from './geometry.ts';
import type { SceneLight } from './lights.ts';
import { createPointsMaterial, createRibbonMaterial, createSkyMaterial, type RibbonSettings, type SkySettings } from './materials.ts';
import type { Grade } from './post.ts';
import type { VolumeSettings } from './volumetrics.ts';
import type { Shot } from './rig.ts';
import type { ShadowSettings } from './shadows.ts';

export interface BuiltScene {
	scene: Scene;
	atmos: AtmosphereUniforms;
	shot: Shot;
	grade: Grade;
	lights: SceneLight[];
	windiness: number;
	volume?: VolumeSettings;
	shadow?: ShadowSettings;
	ao?: { radius: number; intensity: number };
	update?: (t: number, levels: number[]) => void;
}

export function addSky(scene: Scene, atmos: AtmosphereUniforms, s: SkySettings): Mesh {
	const sky = new Mesh(new SphereGeometry(20000, 64, 32), createSkyMaterial(atmos, s));
	sky.renderOrder = 1;
	sky.frustumCulled = false;
	sky.onBeforeRender = (_r, _s, cam) => sky.position.copy(cam.position);
	scene.add(sky);
	return sky;
}

export function addStars(scene: Scene, atmos: AtmosphereUniforms, count: number, brightness: number, seed = 7): Points {
	const pts = new Points(starField(count, seed, 18000, brightness), createPointsMaterial(atmos, { stars: true, halo: 0.15 }));
	pts.renderOrder = -9;
	pts.frustumCulled = false;
	pts.onBeforeRender = (_r, _s, cam) => pts.position.copy(cam.position);
	scene.add(pts);
	return pts;
}

export function addRibbons(scene: Scene, atmos: AtmosphereUniforms, segs: Segment[], s: RibbonSettings): Mesh {
	const m = new Mesh(ribbonGeometry(segs), createRibbonMaterial(atmos, s));
	m.frustumCulled = false;
	m.renderOrder = 5;
	scene.add(m);
	return m;
}

export function addLightSprites(scene: Scene, atmos: AtmosphereUniforms, lights: SceneLight[], halo = 0.5, spikes = 0): (levels: number[]) => void {
	const withSprites = lights.filter((l) => l.sprite);
	if (!withSprites.length) return () => {};
	const geo = pointsGeometry(
		withSprites.map((l) => ({ p: l.position, color: [l.color.r, l.color.g, l.color.b] as [number, number, number], size: l.sprite!.size }))
	);
	const pts = new Points(geo, createPointsMaterial(atmos, { halo, spikes }));
	pts.frustumCulled = false;
	pts.renderOrder = 10;
	scene.add(pts);
	const attr = geo.getAttribute('aColor') as BufferAttribute;
	return (levels) => {
		let k = 0;
		lights.forEach((l, i) => {
			if (!l.sprite) return;
			const b = l.sprite.brightness * levels[i];
			attr.setXYZ(k++, l.color.r * b, l.color.g * b, l.color.b * b);
		});
		attr.needsUpdate = true;
	};
}

export function addPoints(
	scene: Scene,
	atmos: AtmosphereUniforms,
	pts: Parameters<typeof pointsGeometry>[0],
	halo = 0.6
): Points {
	const p = new Points(pointsGeometry(pts), createPointsMaterial(atmos, { halo }));
	p.frustumCulled = false;
	p.renderOrder = 8;
	scene.add(p);
	return p;
}

export function disposeScene(scene: Scene): void {
	scene.traverse((o: Object3D) => {
		const m = o as Mesh;
		if (m.geometry) (m.geometry as BufferGeometry).dispose();
		const mat = m.material as Material | Material[] | undefined;
		if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
		else mat?.dispose();
	});
}

export const rgb = (r: number, g: number, b: number) => new Color(r, g, b);

export function kelvin(k: number): Color {
	const t = k / 100;
	let r: number;
	let g: number;
	let b: number;
	if (t <= 66) {
		r = 255;
		g = 99.4708025861 * Math.log(t) - 161.1195681661;
		b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
	} else {
		r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
		g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
		b = 255;
	}
	const c = (x: number) => Math.pow(Math.min(Math.max(x, 0), 255) / 255, 2.2);
	return new Color(c(r), c(g), c(b));
}

import { BufferAttribute, BufferGeometry, CanvasTexture, Color, LinearMipmapLinearFilter, Mesh, ShaderMaterial, Vector3, type Scene } from 'three';
import { glslCommon, type AtmosphereUniforms } from './atmosphere.ts';
import { mulberry32 } from './noise.ts';

export interface GrassField {
	eye: Vector3;
	yaw: number;
	halfAngle: number;
	near: number;
	far: number;
	density: number;
	width: number;
	height: number;
	maxGrow: number;
	ground: (x: number, z: number) => number;
	keep?: (x: number, z: number) => boolean;
	base: Color;
	tip: Color;
	dry: Color;
}

const TILES = 4;

function tuftAtlas(): CanvasTexture {
	const w = 1024;
	const h = 256;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	const rand = mulberry32(911);
	const tile = w / TILES;
	for (let t = 0; t < TILES; t++) {
		const cx = t * tile + tile / 2;
		const blades = 60 + Math.floor(rand() * 40);
		for (let i = 0; i < blades; i++) {
			const x0 = cx + (rand() - 0.5) * tile * 0.55;
			const lean = (rand() - 0.5) * tile * 0.5;
			const len = h * (0.45 + rand() * 0.5);
			const x1 = Math.min(Math.max(x0 + lean, t * tile + 6), (t + 1) * tile - 6);
			const y1 = h - len;
			const shade = 0.55 + rand() * 0.45;
			const g = ctx.createLinearGradient(0, h, 0, y1);
			g.addColorStop(0, `rgb(${Math.floor(60 * shade)},${Math.floor(90 * shade)},${Math.floor(40 * shade)})`);
			g.addColorStop(1, `rgb(${Math.floor(230 * shade)},${Math.floor(255 * shade)},${Math.floor(160 * shade)})`);
			ctx.strokeStyle = g;
			ctx.lineWidth = 2 + rand() * 3.5;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(x0, h);
			ctx.quadraticCurveTo(x0 + lean * 0.2, h - len * 0.6, x1, y1);
			ctx.stroke();
		}
	}
	const tex = new CanvasTexture(canvas);
	tex.minFilter = LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 4;
	return tex;
}

export function addGrassField(scene: Scene, atmos: AtmosphereUniforms, f: GrassField): void {
	const rand = mulberry32(5150);
	const bases: number[] = [];
	const cards: number[] = [];
	const seeds: number[] = [];
	const index: number[] = [];
	const corners = [
		[-1, 0],
		[1, 0],
		[1, 1],
		[-1, 1]
	];
	const ratio = f.far / f.near;
	const count = Math.round(f.density * f.near * f.near * 2 * f.halfAngle * Math.log(ratio));
	let v = 0;
	for (let i = 0; i < count; i++) {
		const d = f.near * Math.pow(ratio, rand());
		const a = f.yaw + (rand() * 2 - 1) * f.halfAngle;
		const x = f.eye.x + Math.sin(a) * d;
		const z = f.eye.z - Math.cos(a) * d;
		const seed = rand();
		const tile = Math.floor(rand() * TILES);
		if (f.keep && !f.keep(x, z)) continue;
		const grow = Math.min(d / f.near, f.maxGrow) * (0.7 + rand() * 0.6);
		const y = f.ground(x, z) - 0.05;
		for (const [cx, cy] of corners) {
			bases.push(x, y, z);
			cards.push(cx, cy, f.width * grow, f.height * (0.75 + rand() * 0.5));
			seeds.push(seed, tile);
		}
		index.push(v, v + 1, v + 2, v, v + 2, v + 3);
		v += 4;
	}
	const geo = new BufferGeometry();
	geo.setAttribute('position', new BufferAttribute(new Float32Array(bases), 3));
	geo.setAttribute('aCard', new BufferAttribute(new Float32Array(cards), 4));
	geo.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 2));
	geo.setIndex(index);
	const material = new ShaderMaterial({
		uniforms: { ...atmos, tTuft: { value: tuftAtlas() }, uBase: { value: f.base }, uTip: { value: f.tip }, uDry: { value: f.dry } },
		vertexShader: /* glsl */ `
			${glslCommon}
			attribute vec4 aCard;
			attribute vec2 aSeed;
			uniform vec3 uBase;
			uniform vec3 uTip;
			uniform vec3 uDry;
			varying vec2 vUv;
			varying vec3 vColor;
			varying vec3 vFogT;
			varying vec3 vFogS;
			void main() {
				vec3 toEye = cameraPosition - position;
				vec3 right = normalize(vec3(toEye.z, 0.0, -toEye.x));
				float up = aCard.y;
				float sway = sin(uTime * 1.6 + aSeed.x * 40.0 + position.x * 0.2) * uWind * 0.18 * up * up * aCard.w;
				vec3 world = position + right * (aCard.x * aCard.z * 0.5 + sway) + vec3(0.0, up * aCard.w, 0.0);
				float flip = fract(aSeed.x * 7.13) < 0.5 ? 1.0 : -1.0;
				vUv = vec2((aSeed.y + (aCard.x * flip * 0.5 + 0.5)) / ${TILES}.0, up);
				float dry = smoothstep(0.42, 0.78, fbm2(position.xz * 0.03 + 7.0)) * 0.85;
				vec3 tip = mix(uTip, uDry, max(dry, step(0.9, aSeed.x) * 0.6));
				vec3 albedo = mix(uBase, tip, up) * (0.85 + 0.3 * fract(aSeed.x * 31.7));
				vec3 V = normalize(cameraPosition - world);
				vec3 n = normalize(vec3(0.0, 1.0, 0.0) + V * 0.35);
				float ao = mix(0.6, 1.0, up);
				float sunVis = shadowFactor(world, vec3(0.0, 1.0, 0.0));
				vec3 light = (ambientLight(n) + sunLight(n, 0.5) * sunVis + min(pointLighting(world, n, 0.6), vec3(0.6))) * ao;
				light += uSunColor * pow(max(dot(-V, uSunDir), 0.0), 3.0) * 0.3 * sunVis * up;
				vColor = albedo * light;
				vFogS = applyAtmosphere(vec3(0.0), world);
				vFogT = applyAtmosphere(vec3(1.0), world) - vFogS;
				gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D tTuft;
			varying vec2 vUv;
			varying vec3 vColor;
			varying vec3 vFogT;
			varying vec3 vFogS;
			void main() {
				vec4 tex = texture2D(tTuft, vUv);
				if (tex.a < 0.1) discard;
				gl_FragColor = vec4(vColor * (0.6 + 0.6 * tex.g) * vFogT + vFogS, tex.a);
			}
		`,
		alphaToCoverage: true
	});
	const mesh = new Mesh(geo, material);
	mesh.frustumCulled = false;
	mesh.renderOrder = 3;
	scene.add(mesh);
}

import { BufferAttribute, BufferGeometry, CanvasTexture, Color, LinearMipmapLinearFilter, Mesh, ShaderMaterial, Vector3, type Scene } from 'three';
import { glslCommon, type AtmosphereUniforms } from './atmosphere.ts';
import { branchingPlant, type Segment } from './geometry.ts';
import { mulberry32 } from './noise.ts';

export interface TreeSpec {
	position: Vector3;
	height: number;
	crown: number;
	seed: number;
}

export interface TreeStyle {
	leaf: Color;
	leaf2: Color;
	cards?: number;
	translucency?: number;
	lod?: { eye: Vector3; near: number; min: number };
}

function leafAtlas(): CanvasTexture {
	const size = 512;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	ctx.clearRect(0, 0, size, size);
	const rand = mulberry32(404);
	const tile = size / 2;
	for (let t = 0; t < 4; t++) {
		const ox = (t % 2) * tile;
		const oy = Math.floor(t / 2) * tile;
		ctx.save();
		ctx.beginPath();
		ctx.rect(ox, oy, tile, tile);
		ctx.clip();
		ctx.strokeStyle = 'rgba(70,60,45,1)';
		ctx.lineWidth = 2;
		for (let b = 0; b < 5; b++) {
			ctx.beginPath();
			ctx.moveTo(ox + tile / 2, oy + tile / 2);
			ctx.lineTo(ox + tile / 2 + (rand() - 0.5) * tile * 0.8, oy + tile / 2 + (rand() - 0.5) * tile * 0.8);
			ctx.stroke();
		}
		const leaves = 90 + Math.floor(rand() * 40);
		for (let i = 0; i < leaves; i++) {
			const r = Math.pow(rand(), 0.75) * tile * 0.46;
			const a = rand() * Math.PI * 2;
			const x = ox + tile / 2 + Math.cos(a) * r;
			const y = oy + tile / 2 + Math.sin(a) * r;
			const len = 9 + rand() * 13;
			const g = 150 + Math.floor(rand() * 90);
			const shade = 0.75 + rand() * 0.35;
			ctx.fillStyle = `rgb(${Math.floor(g * 0.55 * shade)},${Math.floor(g * shade)},${Math.floor(g * 0.4 * shade)})`;
			ctx.beginPath();
			ctx.ellipse(x, y, len, len * (0.38 + rand() * 0.2), rand() * Math.PI, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}
	const tex = new CanvasTexture(canvas);
	tex.minFilter = LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 4;
	return tex;
}

const leafVertex = /* glsl */ `
	attribute vec3 aCenter;
	attribute vec3 aCrown;
	attribute vec4 aCard;
	varying vec2 vUv;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying float vInner;
	varying float vTint;
	uniform float uTime;
	uniform float uWind;
	void main() {
		vec2 corner = aCard.xy;
		float size = aCard.z;
		float seed = aCard.w;
		float rot = seed * 6.2831;
		vec2 rc = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * corner;
		vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
		vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
		vec3 sway = vec3(sin(uTime * 1.7 + seed * 40.0), 0.0, cos(uTime * 1.3 + seed * 31.0)) * 0.12 * uWind * size;
		vec3 world = aCenter + sway + (right * rc.x + up * rc.y) * size * 0.5;
		vWorld = world;
		vec3 radial = aCenter - aCrown;
		vInner = clamp(length(radial) / max(size * 2.2, 1e-3), 0.0, 1.0);
		vNormal = normalize(radial + vec3(0.0, 0.35, 0.0) * length(radial));
		float tileIndex = floor(fract(seed * 13.7) * 4.0);
		vUv = (corner * 0.5 + 0.5) * 0.5 + vec2(mod(tileIndex, 2.0), floor(tileIndex / 2.0)) * 0.5;
		vTint = fract(seed * 91.3);
		gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
	}
`;

function leafMaterial(atmos: AtmosphereUniforms, atlas: CanvasTexture, style: TreeStyle): ShaderMaterial {
	const material = new ShaderMaterial({
		uniforms: {
			...atmos,
			tLeaf: { value: atlas },
			uLeaf: { value: style.leaf },
			uLeaf2: { value: style.leaf2 },
			uTranslucency: { value: style.translucency ?? 0.35 }
		},
		vertexShader: leafVertex,
		fragmentShader: /* glsl */ `
			${glslCommon}
			uniform sampler2D tLeaf;
			uniform vec3 uLeaf;
			uniform vec3 uLeaf2;
			uniform float uTranslucency;
			varying vec2 vUv;
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vInner;
			varying float vTint;
			void main() {
				vec4 tex = texture(tLeaf, vUv);
				if (tex.a < 0.08) discard;
				vec3 V = normalize(cameraPosition - vWorld);
				vec3 n = normalize(vNormal + (tex.rgb - vec3(0.35, 0.6, 0.25)) * 0.9);
				vec3 albedo = mix(uLeaf, uLeaf2, vTint) * (tex.g * 1.6) * vec3(1.0 + (tex.r - 0.35) * 0.5, 1.0, 1.0);
				float ao = mix(0.35, 1.0, vInner);
				float sunVis = shadowFactor(vWorld, n);
				vec3 light = ambientLight(n) * ao + sunLight(n, 0.3) * sunVis * ao + pointLighting(vWorld, n, 0.4) * ao;
				float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
				light += uSunColor * back * uTranslucency * sunVis;
				vec3 col = applyAtmosphere(albedo * light, vWorld);
				gl_FragColor = vec4(col, tex.a);
			}
		`,
		alphaToCoverage: true
	});
	material.userData.shadow = 'custom';
	material.userData.depthMaterial = new ShaderMaterial({
		uniforms: { tLeaf: { value: atlas }, uTime: atmos.uTime, uWind: atmos.uWind },
		vertexShader: leafVertex,
		fragmentShader: /* glsl */ `
			uniform sampler2D tLeaf;
			varying vec2 vUv;
			void main() {
				if (texture(tLeaf, vUv).a < 0.5) discard;
				gl_FragColor = vec4(1.0);
			}
		`
	});
	return material;
}

export function addTrees(scene: Scene, atmos: AtmosphereUniforms, trees: TreeSpec[], style: TreeStyle): Segment[] {
	const atlas = leafAtlas();
	const branches: Segment[] = [];
	const centers: number[] = [];
	const crowns: number[] = [];
	const cards: number[] = [];
	const index: number[] = [];
	let v = 0;
	const corners = [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	];
	for (const t of trees) {
		const rand = mulberry32(t.seed);
		branches.push(
			...branchingPlant({ root: t.position.clone(), height: t.height * 0.85, spread: 0.9, depth: 4, seed: t.seed, radius: 0.08 * t.height * 0.12 + 0.08, children: 3, upBias: 1.0 })
		);
		const crownCenter = t.position.clone().add(new Vector3(0, t.height * 0.62, 0));
		const full = style.cards ?? 160;
		const keep = style.lod ? Math.min(Math.max(style.lod.near / style.lod.eye.distanceTo(t.position), style.lod.min), 1) : 1;
		const n = Math.max(Math.round(full * keep), 12);
		const grow = Math.sqrt(full / n);
		const clumps: Vector3[] = [];
		const clumpCount = 5 + Math.floor(rand() * 4);
		for (let k = 0; k < clumpCount; k++) {
			const a = rand() * Math.PI * 2;
			const u = rand() * 1.5 - 0.6;
			const r = t.crown * (0.35 + 0.4 * rand());
			clumps.push(crownCenter.clone().add(new Vector3(Math.cos(a) * r, u * t.crown * 0.6, Math.sin(a) * r)));
		}
		for (let i = 0; i < n; i++) {
			const clump = clumps[i % clumpCount];
			const u = rand() * 2 - 1;
			const a = rand() * Math.PI * 2;
			const s = Math.sqrt(1 - u * u);
			const r = t.crown * 0.55 * Math.pow(rand(), 0.5);
			const c = clump.clone().add(new Vector3(s * Math.cos(a) * r, u * r * 0.7, s * Math.sin(a) * r));
			const size = t.crown * (0.36 + rand() * 0.26) * grow;
			const seed = rand();
			for (const [cx, cy] of corners) {
				centers.push(c.x, c.y, c.z);
				crowns.push(crownCenter.x, crownCenter.y, crownCenter.z);
				cards.push(cx, cy, size, seed);
			}
			index.push(v, v + 1, v + 2, v, v + 2, v + 3);
			v += 4;
		}
	}
	const geo = new BufferGeometry();
	const pos = new Float32Array(centers);
	geo.setAttribute('position', new BufferAttribute(pos, 3));
	geo.setAttribute('aCenter', new BufferAttribute(new Float32Array(centers), 3));
	geo.setAttribute('aCrown', new BufferAttribute(new Float32Array(crowns), 3));
	geo.setAttribute('aCard', new BufferAttribute(new Float32Array(cards), 4));
	geo.setIndex(index);
	const mesh = new Mesh(geo, leafMaterial(atmos, atlas, style));
	mesh.frustumCulled = false;
	mesh.renderOrder = 2;
	scene.add(mesh);
	return branches;
}

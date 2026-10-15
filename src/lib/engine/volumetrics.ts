import {
	Color,
	HalfFloatType,
	LinearFilter,
	Matrix4,
	ShaderMaterial,
	Vector2,
	Vector3,
	Vector4,
	WebGLRenderTarget,
	type Data3DTexture,
	type DepthTexture,
	type PerspectiveCamera,
	type Texture
} from 'three';
import { glslCommon, type AtmosphereUniforms } from './atmosphere.ts';

export interface VolumeSettings {
	range: number;
	density: number;
	base: number;
	falloff: number;
	noiseScale: number;
	noiseStrength: number;
	coverage: number;
	detail: number;
	wind: [number, number, number];
	ambient: Color;
	ground: Color;
	lights: number;
	sun: number;
	steps?: number;
}

const MAX_STEPS = 64;

const NO_VOLUME: VolumeSettings = {
	range: 1,
	density: 0,
	base: 0,
	falloff: 0,
	noiseScale: 1,
	noiseStrength: 0,
	coverage: 0,
	detail: 1,
	wind: [0, 0, 0],
	ambient: new Color(0, 0, 0),
	ground: new Color(0, 0, 0),
	lights: 0,
	sun: 0,
	steps: 0
};

const vert = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`;

const marchFrag = /* glsl */ `
	${glslCommon}
	uniform sampler2D tDepth;
	uniform sampler3D tNoise;
	uniform mat4 uProjInv;
	uniform mat4 uViewInv;
	uniform vec3 uCamPos;
	uniform vec4 uVol;
	uniform vec4 uVolNoise;
	uniform vec3 uVolWind;
	uniform vec3 uVolAmbient;
	uniform vec3 uVolGround;
	uniform vec2 uVolLight;
	uniform int uSteps;
	uniform float uFrame;
	varying vec2 vUv;

	float ign(vec2 p) {
		return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
	}

	float volDensity(vec3 p) {
		float h = min(exp(-uVol.w * (p.y - uVol.z)), 6.0);
		if (uVol.y * h < 1e-7) return 0.0;
		vec3 q = (p - uVolWind * uTime) * uVolNoise.x;
		vec2 warp = texture(tNoise, q * 0.31 + vec3(0.5, 0.2, 0.7)).ba - 0.5;
		q += vec3(warp.x, warp.x - warp.y, warp.y) * 0.45;
		vec4 n4 = texture(tNoise, q);
		float n = mix(n4.r, n4.g, 0.36 * min(uVolNoise.w / 3.0, 1.0));
		float m = smoothstep(uVolNoise.z, uVolNoise.z + 0.32, n);
		return uVol.y * h * mix(1.0, m * 2.3, uVolNoise.y);
	}

	float hg(float c, float g) {
		return (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * c, 1.5));
	}

	void main() {
		float depth = texture(tDepth, vUv).r;
		vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
		vp /= vp.w;
		vec3 wp = (uViewInv * vec4(vp.xyz, 1.0)).xyz;
		vec3 rd = normalize(wp - uCamPos);
		float tEnd = depth >= 0.9999999 ? uVol.x : min(length(wp - uCamPos), uVol.x);
		float jitter = fract(ign(gl_FragCoord.xy) + uFrame * 0.61803398);
		float sunPhase = hg(dot(rd, uSunDir), 0.55) * 12.566;
		vec3 ambient = mix(uVolGround, uVolAmbient, 0.65);
		vec3 L = vec3(0.0);
		float T = 1.0;
		float od = 0.0;
		float n = float(uSteps);
		for (int i = 0; i < ${MAX_STEPS}; i++) {
			if (i >= uSteps || T < 0.01) break;
			float a = min((float(i) + jitter) / n, 1.0);
			float b = min((float(i) + 1.0 + jitter) / n, 1.0);
			float t0 = tEnd * a * a;
			float t1 = tEnd * b * b;
			float dt = t1 - t0;
			if (dt <= 0.0) continue;
			vec3 p = uCamPos + rd * (0.5 * (t0 + t1));
			float d = volDensity(p);
			if (d < 1e-7) continue;
			vec3 lin = ambient;
			if (uVolLight.y > 0.0) lin += uSunColor * (sunPhase * uVolLight.y * shadowHard(p));
			float ext = exp(-d * dt);
			L += T * lin * (1.0 - ext);
			T *= ext;
			od += d * dt;
		}
		float tLight = depth >= 0.9999999 ? uSkyDist : length(wp - uCamPos);
		float g = uPhase.x;
		for (int k = 0; k < MAX_LIGHTS; k++) {
			if (k >= uLightCount) break;
			vec3 col = uLightCol[k];
			if (col.r + col.g + col.b <= 0.0) continue;
			vec3 lv = uLightPos[k] - uCamPos;
			float bb = dot(lv, rd);
			float l2 = dot(lv, lv);
			float h = sqrt(max(l2 - bb * bb, 0.36));
			float range = uLightRange[k];
			if (range > 0.0 && h > range * 2.0) continue;
			float tc = clamp(bb, 0.0, tLight);
			vec3 pc = uCamPos + rd * tc;
			float densBound = fogDensityAt(pc.y) * uLightScatter + (tc < uVol.x ? uVol.y * 6.0 * uVolLight.x : 0.0) + uSlab.z;
			if ((col.r + col.g + col.b) * densBound * 3.1416 / h < 2e-4) continue;
			float cosT = bb * inversesqrt(l2);
			float atmos = (fogDensityAt(pc.y) + slabDensityAt(pc)) * uLightScatter * (uPhase.y + hg(cosT, g));
			float vol = 0.0;
			if (uVolLight.x > 0.0 && tc < uVol.x) {
				float smoothD = uVol.y * min(exp(-uVol.w * (pc.y - uVol.z)), 6.0);
				vol = mix(smoothD, volDensity(pc), 0.3) * uVolLight.x * (0.02 + hg(cosT, 0.6));
			}
			float dens = atmos + vol;
			if (dens < 1e-9) continue;
			float I = (atan((tLight - bb) / h) + atan(bb / h)) / h;
			float trans = exp(-heightFogOD(uCamPos, rd, tc) - od * min(tc / max(tEnd, 1.0), 1.0));
			L += col * (I * dens * spotFactor(k, pc - uLightPos[k]) * (range > 0.0 ? exp(-h * h / (range * range) * 2.2) : 1.0) * trans);
		}
		gl_FragColor = vec4(L, T);
	}
`;

const resolveFrag = /* glsl */ `
	uniform sampler2D tCurrent;
	uniform sampler2D tHistory;
	uniform sampler2D tDepth;
	uniform mat4 uProjInv;
	uniform mat4 uViewInv;
	uniform mat4 uPrevViewProj;
	uniform vec2 uTexel;
	uniform float uRange;
	uniform float uHistoryWeight;
	varying vec2 vUv;
	void main() {
		vec4 cur = texture2D(tCurrent, vUv);
		vec4 mn = cur;
		vec4 mx = cur;
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				vec4 s = texture2D(tCurrent, vUv + vec2(float(x), float(y)) * uTexel);
				mn = min(mn, s);
				mx = max(mx, s);
			}
		}
		float depth = texture2D(tDepth, vUv).r;
		vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
		vp /= vp.w;
		if (depth >= 0.9999999) vp.xyz = normalize(vp.xyz) * uRange;
		vec4 wp = uViewInv * vec4(vp.xyz, 1.0);
		vec4 pc = uPrevViewProj * wp;
		vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
		float inside = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0) * step(0.0, pc.w);
		vec4 hist = clamp(texture2D(tHistory, puv), mn, mx);
		gl_FragColor = mix(cur, hist, uHistoryWeight * inside);
	}
`;

export class Volume {
	readonly march: ShaderMaterial;
	readonly resolve: ShaderMaterial;
	private raw: WebGLRenderTarget;
	private history: [WebGLRenderTarget, WebGLRenderTarget];
	private frame = 0;
	private prevViewProj = new Matrix4();
	private hasHistory = false;
	settings: VolumeSettings | null = null;

	constructor(noise: Data3DTexture) {
		const opts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false };
		this.raw = new WebGLRenderTarget(4, 4, opts);
		this.history = [new WebGLRenderTarget(4, 4, opts), new WebGLRenderTarget(4, 4, opts)];
		this.march = new ShaderMaterial({
			uniforms: {
				tDepth: { value: null },
				tNoise: { value: noise },
				uProjInv: { value: new Matrix4() },
				uViewInv: { value: new Matrix4() },
				uCamPos: { value: new Vector3() },
				uVol: { value: new Vector4() },
				uVolNoise: { value: new Vector4() },
				uVolWind: { value: new Vector3() },
				uVolAmbient: { value: new Color() },
				uVolGround: { value: new Color() },
				uVolLight: { value: new Vector2() },
				uSteps: { value: 48 },
				uFrame: { value: 0 }
			},
			vertexShader: vert,
			fragmentShader: marchFrag,
			depthTest: false,
			depthWrite: false
		});
		this.resolve = new ShaderMaterial({
			uniforms: {
				tCurrent: { value: this.raw.texture },
				tHistory: { value: null },
				tDepth: { value: null },
				uProjInv: { value: new Matrix4() },
				uViewInv: { value: new Matrix4() },
				uPrevViewProj: { value: new Matrix4() },
				uTexel: { value: new Vector2() },
				uRange: { value: 1000 },
				uHistoryWeight: { value: 0.9 }
			},
			vertexShader: vert,
			fragmentShader: resolveFrag,
			depthTest: false,
			depthWrite: false
		});
	}

	setSize(fullW: number, fullH: number): void {
		const w = Math.max(1, Math.ceil(fullW / 2));
		const h = Math.max(1, Math.ceil(fullH / 2));
		this.raw.setSize(w, h);
		this.history.forEach((r) => r.setSize(w, h));
		this.resolve.uniforms.uTexel.value.set(1 / w, 1 / h);
		this.hasHistory = false;
	}

	use(atmos: AtmosphereUniforms, volume: VolumeSettings | undefined): void {
		this.settings = volume ?? null;
		this.hasHistory = false;
		const s = volume ?? NO_VOLUME;
		Object.assign(this.march.uniforms, atmos);
		const u = this.march.uniforms;
		u.uVol.value.set(s.range, s.density, s.base, s.falloff);
		u.uVolNoise.value.set(s.noiseScale, s.noiseStrength, s.coverage, s.detail);
		u.uVolWind.value.set(...s.wind);
		u.uVolAmbient.value.copy(s.ambient);
		u.uVolGround.value.copy(s.ground);
		u.uVolLight.value.set(s.lights, s.sun);
		u.uSteps.value = volume ? Math.min(s.steps ?? 40, MAX_STEPS) : 0;
		this.resolve.uniforms.uRange.value = s.range;
	}

	render(pass: (m: ShaderMaterial, t: WebGLRenderTarget) => void, depth: DepthTexture, camera: PerspectiveCamera): Texture {
		const m = this.march.uniforms;
		m.tDepth.value = depth;
		m.uProjInv.value.copy(camera.projectionMatrixInverse);
		m.uViewInv.value.copy(camera.matrixWorld);
		m.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
		m.uFrame.value = this.frame++ % 64;
		pass(this.march, this.raw);

		const [read, write] = this.frame % 2 ? this.history : [this.history[1], this.history[0]];
		const r = this.resolve.uniforms;
		r.tHistory.value = read.texture;
		r.tDepth.value = depth;
		r.uProjInv.value.copy(camera.projectionMatrixInverse);
		r.uViewInv.value.copy(camera.matrixWorld);
		r.uPrevViewProj.value.copy(this.prevViewProj);
		r.uHistoryWeight.value = this.hasHistory ? 0.9 : 0;
		pass(this.resolve, write);
		this.prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		this.hasHistory = true;
		return write.texture;
	}

	dispose(): void {
		this.raw.dispose();
		this.history.forEach((r) => r.dispose());
		this.march.dispose();
		this.resolve.dispose();
	}
}

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

const MAX_STEPS = 96;

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
		vec3 q = (p - uVolWind * uTime) * uVolNoise.x;
		vec3 warp = texture(tNoise, q * 0.31 + vec3(0.5, 0.2, 0.7)).rrr;
		q += (vec3(warp.x, texture(tNoise, q * 0.29 + 0.41).r, texture(tNoise, q * 0.27 + 0.83).r) - 0.5) * 0.45;
		const mat3 ROT3 = mat3(0.36, 0.48, -0.8, -0.8, 0.6, 0.0, 0.48, 0.64, 0.6);
		float n = texture(tNoise, q).r * 0.64 + texture(tNoise, ROT3 * q * uVolNoise.w + uVolWind * uTime * 0.03 * uVolNoise.x).r * 0.36;
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
		vec3 L = vec3(0.0);
		float T = 1.0;
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
			if (d < 1e-6) continue;
			vec3 lin = mix(uVolGround, uVolAmbient, 0.65) + uSunColor * (sunPhase * uVolLight.y * shadowHard(p));
			for (int k = 0; k < MAX_LIGHTS; k++) {
				if (k >= uLightCount) break;
				vec3 lv = p - uLightPos[k];
				float d2 = dot(lv, lv);
				vec3 ld = lv * inversesqrt(d2);
				float c = dot(ld, -rd);
				lin += uLightCol[k] * (spotFactor(k, lv) * rangeFactor(k, d2) * (0.02 + hg(c, 0.6)) / (d2 + 1.0)) * uVolLight.x;
			}
			float ext = exp(-d * dt);
			L += T * lin * (1.0 - ext);
			T *= ext;
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

	setSize(w: number, h: number): void {
		this.raw.setSize(w, h);
		this.history.forEach((r) => r.setSize(w, h));
		this.resolve.uniforms.uTexel.value.set(1 / w, 1 / h);
		this.hasHistory = false;
	}

	use(atmos: AtmosphereUniforms, s: VolumeSettings | undefined): void {
		this.settings = s ?? null;
		this.hasHistory = false;
		if (!s) return;
		Object.assign(this.march.uniforms, atmos);
		const u = this.march.uniforms;
		u.uVol.value.set(s.range, s.density, s.base, s.falloff);
		u.uVolNoise.value.set(s.noiseScale, s.noiseStrength, s.coverage, s.detail);
		u.uVolWind.value.set(...s.wind);
		u.uVolAmbient.value.copy(s.ambient);
		u.uVolGround.value.copy(s.ground);
		u.uVolLight.value.set(s.lights, s.sun);
		u.uSteps.value = Math.min(s.steps ?? 56, MAX_STEPS);
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
		r.uHistoryWeight.value = this.hasHistory ? 0.88 : 0;
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

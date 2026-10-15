import {
	AddEquation,
	BufferGeometry,
	CanvasTexture,
	Color,
	CustomBlending,
	DepthTexture,
	Float32BufferAttribute,
	HalfFloatType,
	LinearFilter,
	Matrix4,
	Mesh,
	OneFactor,
	OrthographicCamera,
	Scene,
	ShaderMaterial,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	type Data3DTexture,
	type PerspectiveCamera,
	type Texture,
	type WebGLRenderer
} from 'three';
import { mulberry32 } from './noise.ts';
import { createCloudNoise } from './noise3d.ts';
import { Volume, type VolumeSettings } from './volumetrics.ts';
import type { AtmosphereUniforms } from './atmosphere.ts';

export interface Grade {
	exposure: number;
	lift: Color;
	gamma: Color;
	gain: Color;
	saturation: number;
	contrast: number;
	bloom: number;
	halation: number;
	grain: number;
	vignette: number;
	aberration: number;
	flare?: number;
	dirt?: number;
	distortion?: number;
	softness?: number;
	grainSize?: number;
	weave?: number;
	streak?: number;
	streakTint?: Color;
}

const fullscreenVert = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`;

const downsampleFrag = /* glsl */ `
	uniform sampler2D tSrc;
	uniform vec2 uTexel;
	uniform float uKaris;
	varying vec2 vUv;
	vec3 s(vec2 o) { return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(4000.0)); }
	float w(vec3 c) { return uKaris > 0.5 ? 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))) : 1.0; }
	vec3 avg(vec3 a, vec3 b, vec3 c, vec3 d) {
		float wa = w(a), wb = w(b), wc = w(c), wd = w(d);
		return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
	}
	void main() {
		vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
		vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
		vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
		vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
		vec3 col = avg(j, k, l, m) * 0.5 + avg(a, b, d, e) * 0.125 + avg(b, c, e, f) * 0.125 + avg(d, e, g, h) * 0.125 + avg(e, f, h, i) * 0.125;
		gl_FragColor = vec4(col, 1.0);
	}
`;

const upsampleFrag = /* glsl */ `
	uniform sampler2D tSrc;
	uniform vec2 uTexel;
	uniform float uRadius;
	uniform float uWeight;
	varying vec2 vUv;
	void main() {
		vec2 o = uTexel * uRadius;
		vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
		c += (texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb) * 2.0;
		c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
		gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
	}
`;

const combineFrag = /* glsl */ `
	uniform sampler2D tScene;
	uniform sampler2D tVolume;
	uniform sampler2D tAo;
	uniform sampler2D tDepth;
	uniform mat4 uProjInv;
	uniform vec2 uVolTexel;
	uniform float uUseVolume;
	uniform float uUseAo;
	varying vec2 vUv;
	float viewZ(vec2 uv) {
		float d = texture2D(tDepth, uv).r;
		vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
		return -p.z / p.w;
	}
	vec4 volumeAt(vec2 uv) {
		vec2 hp = uv / uVolTexel - 0.5;
		vec2 base = floor(hp);
		vec2 f = hp - base;
		float z0 = viewZ(uv);
		vec4 acc = vec4(0.0);
		float wsum = 0.0;
		for (int k = 0; k < 4; k++) {
			vec2 o = vec2(float(k & 1), float(k >> 1));
			vec2 tuv = (base + o + 0.5) * uVolTexel;
			float bw = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
			float dz = abs(viewZ(tuv) - z0) / max(z0, 1.0);
			float w = (bw + 1e-3) / (1e-3 + dz * 40.0);
			acc += texture2D(tVolume, tuv) * w;
			wsum += w;
		}
		return acc / wsum;
	}
	void main() {
		vec4 v = uUseVolume > 0.5 ? volumeAt(vUv) : vec4(0.0, 0.0, 0.0, 1.0);
		float ao = uUseAo > 0.5 ? texture2D(tAo, vUv).r : 1.0;
		gl_FragColor = vec4(texture2D(tScene, vUv).rgb * ao * v.a + v.rgb, 1.0);
	}
`;

const aoFrag = /* glsl */ `
	uniform sampler2D tDepth;
	uniform mat4 uProj;
	uniform mat4 uProjInv;
	uniform vec2 uTexel;
	uniform float uRadius;
	uniform float uIntensity;
	uniform vec3 uKernel[16];
	varying vec2 vUv;
	vec3 viewPos(vec2 uv) {
		float d = texture2D(tDepth, uv).r;
		vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
		return p.xyz / p.w;
	}
	float h12(vec2 p) {
		vec3 p3 = fract(vec3(p.xyx) * 0.1031);
		p3 += dot(p3, p3.yzx + 33.33);
		return fract((p3.x + p3.y) * p3.z);
	}
	void main() {
		float d = texture2D(tDepth, vUv).r;
		if (d >= 0.9999999) { gl_FragColor = vec4(1.0); return; }
		vec3 P = viewPos(vUv);
		vec3 r = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
		vec3 l = P - viewPos(vUv - vec2(uTexel.x, 0.0));
		vec3 u = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
		vec3 b = P - viewPos(vUv - vec2(0.0, uTexel.y));
		vec3 dx = abs(r.z) < abs(l.z) ? r : l;
		vec3 dy = abs(u.z) < abs(b.z) ? u : b;
		vec3 N = normalize(cross(dx, dy));
		if (dot(N, -P) < 0.0) N = -N;
		float a = h12(gl_FragCoord.xy) * 6.2831853;
		vec3 rv = vec3(cos(a), sin(a), 0.0);
		vec3 T = normalize(rv - N * dot(rv, N));
		vec3 B = cross(N, T);
		mat3 tbn = mat3(T, B, N);
		float R = uRadius * (1.0 + 0.004 * -P.z);
		float occ = 0.0;
		for (int i = 0; i < 16; i++) {
			vec3 S = P + tbn * uKernel[i] * R;
			vec4 c = uProj * vec4(S, 1.0);
			vec2 suv = c.xy / c.w * 0.5 + 0.5;
			if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
			float sz = viewPos(suv).z;
			float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-3));
			occ += step(S.z + 0.02 * R, sz) * range;
		}
		float ao = 1.0 - occ / 16.0;
		gl_FragColor = vec4(vec3(pow(max(ao, 0.0), uIntensity)), 1.0);
	}
`;

const aoBlurFrag = /* glsl */ `
	uniform sampler2D tAo;
	uniform sampler2D tDepth;
	uniform vec2 uTexel;
	uniform mat4 uProjInv;
	varying vec2 vUv;
	float viewZ(vec2 uv) {
		float d = texture2D(tDepth, uv).r;
		vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
		return p.z / p.w;
	}
	void main() {
		float z0 = viewZ(vUv);
		float sum = 0.0;
		float wsum = 0.0;
		for (int y = -1; y <= 1; y++) {
			for (int x = -1; x <= 1; x++) {
				vec2 o = vec2(float(x), float(y)) * uTexel * 1.25;
				float w = exp(-abs(viewZ(vUv + o) - z0) / (0.02 * abs(z0) + 0.05));
				sum += texture2D(tAo, vUv + o).r * w;
				wsum += w;
			}
		}
		gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
	}
`;

const streakFrag = /* glsl */ `
	uniform sampler2D tSrc;
	uniform vec2 uTexel;
	uniform float uStep;
	uniform float uThreshold;
	varying vec2 vUv;
	vec3 bright(vec2 uv) {
		vec3 c = texture2D(tSrc, uv).rgb;
		float l = max(c.r, max(c.g, c.b));
		return uThreshold > 0.0 ? c * max(l - uThreshold, 0.0) / max(l, 1e-4) : c;
	}
	void main() {
		vec3 acc = vec3(0.0);
		float wsum = 0.0;
		for (int i = -8; i <= 8; i++) {
			float w = exp(-abs(float(i)) * 0.32);
			acc += bright(vUv + vec2(float(i) * uStep * uTexel.x, 0.0)) * w;
			wsum += w;
		}
		gl_FragColor = vec4(acc / wsum, 1.0);
	}
`;

const flareFrag = /* glsl */ `
	uniform sampler2D tSrc;
	uniform float uThreshold;
	uniform float uAspect;
	varying vec2 vUv;
	vec3 bright(vec2 uv) {
		vec3 c = texture2D(tSrc, uv).rgb;
		float l = max(c.r, max(c.g, c.b));
		return c * max(l - uThreshold, 0.0) / max(l, 1e-4);
	}
	vec3 dispersed(vec2 uv, vec2 dir, float k) {
		return vec3(bright(uv + dir * k).r, bright(uv).g, bright(uv - dir * k).b);
	}
	void main() {
		vec2 uv = 1.0 - vUv;
		vec2 gv = (0.5 - uv) * 0.42;
		vec2 dir = normalize(gv + 1e-5);
		vec3 acc = vec3(0.0);
		for (int i = 1; i < 6; i++) {
			vec2 o = uv + gv * float(i);
			float r = length((0.5 - o) * vec2(uAspect, 1.0)) / 0.9;
			float w = pow(max(1.0 - r, 0.0), 5.0);
			vec3 tint = mix(vec3(1.0, 0.72, 0.45), vec3(0.45, 0.75, 1.0), fract(float(i) * 0.37));
			acc += dispersed(o, dir, 0.004 * float(i)) * w * tint;
		}
		vec2 hv = dir * vec2(1.0 / uAspect, 1.0) * 0.36;
		vec2 ho = uv + hv;
		float hr = length((0.5 - ho) * vec2(uAspect, 1.0)) / 0.9;
		acc += dispersed(ho, dir, 0.012) * pow(max(1.0 - hr, 0.0), 4.0) * 0.5;
		gl_FragColor = vec4(acc, 1.0);
	}
`;

const compositeFrag = /* glsl */ `
	uniform sampler2D tScene;
	uniform sampler2D tBloom;
	uniform sampler2D tFlare;
	uniform sampler2D tStreak;
	uniform sampler2D tDirt;
	uniform float uStreak;
	uniform vec3 uStreakTint;
	uniform vec2 uResolution;
	uniform vec2 uTexel;
	uniform float uTime;
	uniform float uFade;
	uniform float uExposure;
	uniform vec3 uLift;
	uniform vec3 uGamma;
	uniform vec3 uGain;
	uniform float uSaturation;
	uniform float uContrast;
	uniform float uBloom;
	uniform float uHalation;
	uniform float uGrain;
	uniform float uGrainSize;
	uniform float uVignette;
	uniform float uAberration;
	uniform float uFlare;
	uniform float uDirt;
	uniform float uDistortion;
	uniform float uSoftness;
	uniform float uWeave;
	varying vec2 vUv;

	const mat3 SRGB_TO_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
	const mat3 REC2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
	const mat3 AGX_INSET = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
	const mat3 AGX_OUTSET = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));

	vec3 agxContrast(vec3 x) {
		vec3 x2 = x * x;
		vec3 x4 = x2 * x2;
		return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
	}

	vec3 agx(vec3 c) {
		c = SRGB_TO_REC2020 * c;
		c = AGX_INSET * c;
		c = max(c, 1e-10);
		c = log2(c);
		c = (c + 12.47393) / 16.5;
		c = clamp(c, 0.0, 1.0);
		c = agxContrast(c);
		c = AGX_OUTSET * c;
		c = pow(max(c, 0.0), vec3(2.2));
		c = REC2020_TO_SRGB * c;
		return clamp(c, 0.0, 1.0);
	}

	float h12(vec2 p) {
		vec3 p3 = fract(vec3(p.xyx) * 0.1031);
		p3 += dot(p3, p3.yzx + 33.33);
		return fract((p3.x + p3.y) * p3.z);
	}

	float grainNoise(vec2 p, float seed) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		vec2 o = vec2(seed * 17.13, seed * 7.31);
		float a = h12(i + o), b = h12(i + vec2(1.0, 0.0) + o), c = h12(i + vec2(0.0, 1.0) + o), d = h12(i + vec2(1.0, 1.0) + o);
		return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
	}

	vec3 toSrgb(vec3 c) {
		return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
	}

	vec3 sceneAt(vec2 uv, vec2 ca) {
		vec3 c;
		c.r = texture2D(tScene, uv - ca).r;
		c.g = texture2D(tScene, uv).g;
		c.b = texture2D(tScene, uv + ca).b;
		return c;
	}

	void main() {
		float frame = floor(uTime * 24.0);
		vec2 weave = (vec2(h12(vec2(frame, 1.7)), h12(vec2(frame, 9.1))) - 0.5) * uWeave * uTexel * 2.0;
		vec2 dc = vUv - 0.5;
		float r2 = dot(dc, dc);
		vec2 uv = 0.5 + dc * (1.0 - uDistortion * r2) / (1.0 - uDistortion * 0.25) * (1.0 - uDistortion * 0.05) + weave;
		vec2 ca = dc * r2 * uAberration;

		vec3 hdr = sceneAt(uv, ca);
		if (uSoftness != 0.0) {
			vec2 o = uTexel * (0.75 + max(uSoftness, 0.0));
			vec3 blur = (texture2D(tScene, uv + o * vec2(0.5, 0.5)).rgb + texture2D(tScene, uv + o * vec2(-0.5, 0.5)).rgb + texture2D(tScene, uv + o * vec2(0.5, -0.5)).rgb + texture2D(tScene, uv - o * 0.5).rgb) * 0.25;
			hdr = uSoftness > 0.0 ? mix(hdr, blur, clamp(uSoftness, 0.0, 1.0) * 0.8) : max(hdr + (hdr - blur) * -uSoftness, 0.0);
		}
		vec3 bloom = texture2D(tBloom, uv).rgb / 7.0;
		vec3 dirt = texture2D(tDirt, uv).rgb;
		vec3 halo = bloom * mix(vec3(1.0), vec3(1.35, 0.62, 0.42), uHalation);
		hdr = mix(hdr, halo * (1.0 + dirt * uDirt), uBloom);
		hdr += texture2D(tFlare, uv).rgb * uFlare * (0.35 + dirt * 2.5);
		hdr += texture2D(tStreak, uv).rgb * uStreakTint * uStreak * (1.0 + dirt);

		float aspect = uResolution.x / uResolution.y;
		vec2 vq = dc * vec2(aspect, 1.0) / sqrt(aspect * aspect + 1.0) * 2.0;
		float vig = pow(max(1.0 - dot(vq, vq) * 0.5, 0.0), 2.0);
		hdr *= mix(1.0, vig, uVignette);
		hdr *= uExposure;

		vec3 c = agx(hdr);

		float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
		c = mix(vec3(luma), c, uSaturation);
		c = clamp(0.3 * pow(c / 0.3, vec3(uContrast)), 0.0, 1.0);
		c = pow(max(c * uGain + uLift * (1.0 - c), 0.0), 1.0 / uGamma);

		vec2 gp = gl_FragCoord.xy / uGrainSize;
		float n0 = grainNoise(gp, frame) + grainNoise(gp * 1.9 + 3.7, frame + 0.5) - 1.0;
		vec3 nc = vec3(grainNoise(gp + 11.0, frame), grainNoise(gp + 23.0, frame), grainNoise(gp + 37.0, frame)) - 0.5;
		vec3 n = vec3(n0) + nc * 0.18;
		luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
		float amt = uGrain * (0.12 + 0.9 * sqrt(luma)) * (1.0 - luma * 0.5);
		c += n * amt;

		float flicker = 1.0 + (h12(vec2(frame, 3.1)) - 0.5) * 0.012;
		c *= flicker * uFade;

		c = toSrgb(clamp(c, 0.0, 1.0));
		c += (h12(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;
		gl_FragColor = vec4(c, 1.0);
	}
`;

function fullscreenTriangle(): BufferGeometry {
	const g = new BufferGeometry();
	g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
	g.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
	return g;
}

function lensDirt(): Texture {
	const size = 1024;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, size, size);
	const rand = mulberry32(2026);
	ctx.globalCompositeOperation = 'lighter';
	const spot = (x: number, y: number, r: number, a: number, ring: boolean) => {
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		if (ring) {
			g.addColorStop(0, `rgba(255,250,240,${a * 0.35})`);
			g.addColorStop(0.82, `rgba(255,250,240,${a * 0.5})`);
			g.addColorStop(1, 'rgba(255,250,240,0)');
		} else {
			g.addColorStop(0, `rgba(255,252,245,${a})`);
			g.addColorStop(1, 'rgba(255,252,245,0)');
		}
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	};
	for (let i = 0; i < 70; i++) spot(rand() * size, rand() * size, 20 + rand() * 90, 0.04 + rand() * 0.07, rand() < 0.4);
	for (let i = 0; i < 500; i++) spot(rand() * size, rand() * size, 1.5 + rand() * 6, 0.05 + rand() * 0.25, false);
	ctx.globalAlpha = 0.05;
	ctx.strokeStyle = '#fff';
	for (let i = 0; i < 14; i++) {
		ctx.lineWidth = 6 + rand() * 20;
		ctx.beginPath();
		const x = rand() * size;
		const y = rand() * size;
		ctx.moveTo(x, y);
		ctx.bezierCurveTo(x + rand() * 300 - 150, y + rand() * 300 - 150, x + rand() * 300 - 150, y + rand() * 300 - 150, x + rand() * 400 - 200, y + rand() * 400 - 200);
		ctx.stroke();
	}
	const tex = new CanvasTexture(canvas);
	tex.minFilter = LinearFilter;
	tex.magFilter = LinearFilter;
	return tex;
}

export class Pipeline {
	private sceneRT: WebGLRenderTarget;
	private combineRT: WebGLRenderTarget;
	private flareRT: WebGLRenderTarget;
	private streakA: WebGLRenderTarget;
	private streakB: WebGLRenderTarget;
	private aoRT: WebGLRenderTarget;
	private aoBlurRT: WebGLRenderTarget;
	private aoMat: ShaderMaterial;
	private aoBlur: ShaderMaterial;
	private streak: ShaderMaterial;
	private aoSettings: { radius: number; intensity: number } | null = null;
	profiling = false;
	readonly disabled = { volume: false, ao: false };
	readonly timings: Record<string, number> = {};
	private markTime = 0;

	private probe = new WebGLRenderTarget(1, 1, { depthBuffer: false });
	private probePixel = new Uint8Array(4);

	private mark(name: string | null): void {
		if (!this.profiling) return;
		this.renderer.readRenderTargetPixels(this.probe, 0, 0, 1, 1, this.probePixel);
		const now = performance.now();
		if (name) this.timings[name] = (this.timings[name] ?? 0) * 0.8 + (now - this.markTime) * 0.2;
		this.markTime = now;
	}
	private mips: WebGLRenderTarget[] = [];
	private quad: Mesh;
	private quadScene = new Scene();
	private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private down: ShaderMaterial;
	private up: ShaderMaterial;
	private combine: ShaderMaterial;
	private flare: ShaderMaterial;
	readonly composite: ShaderMaterial;
	private volume: Volume;
	private noise: { texture: Data3DTexture; dispose: () => void };
	private dirt: Texture;
	private size = new Vector2();
	private readonly levels = 7;

	constructor(private renderer: WebGLRenderer) {
		const rtOpts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false };
		this.sceneRT = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4, depthBuffer: true, depthTexture: new DepthTexture(4, 4) });
		this.combineRT = new WebGLRenderTarget(4, 4, rtOpts);
		this.flareRT = new WebGLRenderTarget(4, 4, rtOpts);
		this.streakA = new WebGLRenderTarget(4, 4, rtOpts);
		this.streakB = new WebGLRenderTarget(4, 4, rtOpts);
		this.aoRT = new WebGLRenderTarget(4, 4, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
		this.aoBlurRT = new WebGLRenderTarget(4, 4, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
		for (let i = 0; i < this.levels; i++) this.mips.push(new WebGLRenderTarget(4, 4, rtOpts));
		this.noise = createCloudNoise(renderer, 128);
		this.volume = new Volume(this.noise.texture);
		this.dirt = lensDirt();
		const material = (fragmentShader: string, uniforms: Record<string, { value: unknown }>, additive = false) =>
			new ShaderMaterial({
				uniforms,
				vertexShader: fullscreenVert,
				fragmentShader,
				depthTest: false,
				depthWrite: false,
				...(additive ? { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor } : {})
			});
		this.down = material(downsampleFrag, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uKaris: { value: 0 } });
		this.up = material(upsampleFrag, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } }, true);
		this.combine = material(combineFrag, {
			tScene: { value: null },
			tVolume: { value: null },
			tAo: { value: this.aoBlurRT.texture },
			tDepth: { value: null },
			uProjInv: { value: new Matrix4() },
			uVolTexel: { value: new Vector2() },
			uUseVolume: { value: 0 },
			uUseAo: { value: 0 }
		});
		const kernel = Array.from({ length: 16 }, (_, i) => {
			const rand = mulberry32(i * 7 + 3);
			const v = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 0.9 + 0.1).normalize();
			const k = (i + 1) / 16;
			return v.multiplyScalar(0.12 + 0.88 * k * k);
		});
		this.aoMat = material(aoFrag, {
			tDepth: { value: null },
			uProj: { value: new Matrix4() },
			uProjInv: { value: new Matrix4() },
			uTexel: { value: new Vector2() },
			uRadius: { value: 1 },
			uIntensity: { value: 1 },
			uKernel: { value: kernel }
		});
		this.aoBlur = material(aoBlurFrag, { tAo: { value: this.aoRT.texture }, tDepth: { value: null }, uTexel: { value: new Vector2() }, uProjInv: { value: new Matrix4() } });
		this.streak = material(streakFrag, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uStep: { value: 1 }, uThreshold: { value: 0 } });
		this.flare = material(flareFrag, { tSrc: { value: null }, uThreshold: { value: 3 }, uAspect: { value: 1 } });
		this.composite = material(compositeFrag, {
			tScene: { value: null },
			tBloom: { value: null },
			tFlare: { value: this.flareRT.texture },
			tStreak: { value: this.streakB.texture },
			uStreak: { value: 0 },
			uStreakTint: { value: new Color(1, 1, 1) },
			tDirt: { value: this.dirt },
			uResolution: { value: new Vector2() },
			uTexel: { value: new Vector2() },
			uTime: { value: 0 },
			uFade: { value: 0 },
			uExposure: { value: 1 },
			uLift: { value: new Vector3() },
			uGamma: { value: new Vector3(1, 1, 1) },
			uGain: { value: new Vector3(1, 1, 1) },
			uSaturation: { value: 1 },
			uContrast: { value: 1 },
			uBloom: { value: 0.04 },
			uHalation: { value: 0.3 },
			uGrain: { value: 0.04 },
			uGrainSize: { value: 1.35 },
			uVignette: { value: 0.5 },
			uAberration: { value: 0.004 },
			uFlare: { value: 0 },
			uDirt: { value: 0 },
			uDistortion: { value: 0 },
			uSoftness: { value: 0 },
			uWeave: { value: 0 }
		});
		this.quad = new Mesh(fullscreenTriangle(), this.down);
		this.quad.frustumCulled = false;
		this.quadScene.add(this.quad);
	}

	setSize(width: number, height: number): void {
		this.size.set(width, height);
		this.sceneRT.setSize(width, height);
		this.combineRT.setSize(width, height);
		this.volume.setSize(width, height);
		let w = width;
		let h = height;
		for (const m of this.mips) {
			w = Math.max(1, Math.floor(w / 2));
			h = Math.max(1, Math.floor(h / 2));
			m.setSize(w, h);
		}
		this.flareRT.setSize(this.mips[1].width, this.mips[1].height);
		this.streakA.setSize(this.mips[1].width, this.mips[1].height);
		this.streakB.setSize(this.mips[1].width, this.mips[1].height);
		const hw = Math.max(1, Math.ceil(width / 2));
		const hh = Math.max(1, Math.ceil(height / 2));
		this.aoRT.setSize(hw, hh);
		this.aoBlurRT.setSize(hw, hh);
		this.aoMat.uniforms.uTexel.value.set(1 / width, 1 / height);
		this.aoBlur.uniforms.uTexel.value.set(1 / hw, 1 / hh);
		this.flare.uniforms.uAspect.value = width / height;
	}

	setScene(grade: Grade, atmos: AtmosphereUniforms, volume: VolumeSettings | undefined, ao?: { radius: number; intensity: number }): void {
		this.aoSettings = ao ?? null;
		const u = this.composite.uniforms;
		u.uExposure.value = grade.exposure;
		u.uLift.value.set(grade.lift.r, grade.lift.g, grade.lift.b);
		u.uGamma.value.set(grade.gamma.r, grade.gamma.g, grade.gamma.b);
		u.uGain.value.set(grade.gain.r, grade.gain.g, grade.gain.b);
		u.uSaturation.value = grade.saturation;
		u.uContrast.value = grade.contrast;
		u.uBloom.value = grade.bloom;
		u.uHalation.value = grade.halation;
		u.uGrain.value = grade.grain;
		u.uGrainSize.value = grade.grainSize ?? 1.35;
		u.uVignette.value = grade.vignette;
		u.uAberration.value = grade.aberration;
		u.uFlare.value = grade.flare ?? 0.02;
		u.uDirt.value = grade.dirt ?? 0.9;
		u.uDistortion.value = grade.distortion ?? 0.035;
		u.uSoftness.value = grade.softness ?? 0;
		u.uWeave.value = grade.weave ?? 0.35;
		u.uStreak.value = grade.streak ?? 0;
		u.uStreakTint.value.copy(grade.streakTint ?? new Color(0.75, 0.85, 1));
		this.volume.use(atmos, volume);
	}

	private pass = (material: ShaderMaterial, target: WebGLRenderTarget | null): void => {
		this.quad.material = material;
		this.renderer.setRenderTarget(target);
		this.renderer.render(this.quadScene, this.quadCam);
	};

	render(scene: Scene, camera: PerspectiveCamera, time: number, fade: number, canvasSize: Vector2): void {
		const r = this.renderer;
		this.mark(null);
		r.setRenderTarget(this.sceneRT);
		r.setClearColor(0x000000, 1);
		r.clear();
		r.render(scene, camera);
		this.mark('scene');

		let hdr: Texture = this.sceneRT.texture;
		const depth = this.sceneRT.depthTexture!;
		const cu = this.combine.uniforms;
		const useVolume = !this.disabled.volume;
		const useAo = !!this.aoSettings && !this.disabled.ao;
		cu.uUseVolume.value = useVolume ? 1 : 0;
		cu.uUseAo.value = useAo ? 1 : 0;
		if (useAo) {
			const a = this.aoMat.uniforms;
			a.tDepth.value = depth;
			a.uProj.value.copy(camera.projectionMatrix);
			a.uProjInv.value.copy(camera.projectionMatrixInverse);
			a.uRadius.value = this.aoSettings!.radius;
			a.uIntensity.value = this.aoSettings!.intensity;
			this.pass(this.aoMat, this.aoRT);
			this.aoBlur.uniforms.tDepth.value = depth;
			this.aoBlur.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
			this.pass(this.aoBlur, this.aoBlurRT);
			this.mark('ao');
		}
		if (useVolume) {
			cu.tVolume.value = this.volume.render(this.pass, depth, camera);
			this.mark('volume');
		}
		if (useVolume || useAo) {
			cu.tScene.value = this.sceneRT.texture;
			cu.tDepth.value = depth;
			cu.uProjInv.value.copy(camera.projectionMatrixInverse);
			cu.uVolTexel.value.copy(this.volume.texel);
			this.pass(this.combine, this.combineRT);
			hdr = this.combineRT.texture;
			this.mark('combine');
		}

		let src = hdr;
		let sw = this.size.x;
		let sh = this.size.y;
		for (let i = 0; i < this.levels; i++) {
			this.down.uniforms.tSrc.value = src;
			this.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
			this.down.uniforms.uKaris.value = i === 0 ? 1 : 0;
			this.pass(this.down, this.mips[i]);
			src = this.mips[i].texture;
			sw = this.mips[i].width;
			sh = this.mips[i].height;
		}
		this.flare.uniforms.tSrc.value = this.mips[2].texture;
		this.pass(this.flare, this.flareRT);
		if (this.composite.uniforms.uStreak.value > 0) {
			const st = this.streak.uniforms;
			st.uTexel.value.set(1 / this.mips[1].width, 1 / this.mips[1].height);
			st.tSrc.value = this.mips[1].texture;
			st.uStep.value = 1.5;
			st.uThreshold.value = 2.0;
			this.pass(this.streak, this.streakA);
			st.tSrc.value = this.streakA.texture;
			st.uStep.value = 9;
			st.uThreshold.value = 0;
			this.pass(this.streak, this.streakB);
		}
		r.autoClear = false;
		for (let i = this.levels - 1; i > 0; i--) {
			const lower = this.mips[i];
			this.up.uniforms.tSrc.value = lower.texture;
			this.up.uniforms.uTexel.value.set(1 / lower.width, 1 / lower.height);
			this.pass(this.up, this.mips[i - 1]);
		}
		r.autoClear = true;
		this.mark('bloom+lens');

		const u = this.composite.uniforms;
		u.tScene.value = hdr;
		u.tBloom.value = this.mips[0].texture;
		u.uResolution.value.copy(canvasSize);
		u.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
		u.uTime.value = time;
		u.uFade.value = fade;
		this.pass(this.composite, null);
		this.mark('composite');
	}

	dispose(): void {
		this.sceneRT.dispose();
		this.combineRT.dispose();
		this.flareRT.dispose();
		for (const t of [this.streakA, this.streakB, this.aoRT, this.aoBlurRT]) t.dispose();
		for (const m of [this.aoMat, this.aoBlur, this.streak]) m.dispose();
		this.mips.forEach((m) => m.dispose());
		this.volume.dispose();
		this.noise.dispose();
		this.dirt.dispose();
		for (const m of [this.down, this.up, this.combine, this.flare, this.composite]) m.dispose();
		this.quad.geometry.dispose();
	}
}

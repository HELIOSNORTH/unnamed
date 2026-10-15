import { Color, Matrix4, Vector3, Vector4, type IUniform } from 'three';

export const MAX_LIGHTS = 12;

export interface AtmosphereSettings {
	fogLow: Color;
	fogHigh: Color;
	glowColor?: Color;
	glowDir?: Vector3;
	glowExp?: number;
	fogDensity: number;
	fogFalloff: number;
	fogBase?: number;
	slab?: { bottom: number; top: number; density: number; scale: number; color: Color; drift?: [number, number] };
	sunDir?: Vector3;
	sunColor?: Color;
	ambientSky: Color;
	ambientGround: Color;
	lightScatter?: number;
	phaseG?: number;
	isotropic?: number;
	skyDist?: number;
}

export type AtmosphereUniforms = Record<string, IUniform>;

export function createAtmosphereUniforms(s: AtmosphereSettings): AtmosphereUniforms {
	const slab = s.slab;
	return {
		uTime: { value: 0 },
		uWind: { value: 0 },
		uFogLow: { value: s.fogLow },
		uFogHigh: { value: s.fogHigh },
		uGlowColor: { value: s.glowColor ?? new Color(0, 0, 0) },
		uGlowDir: { value: (s.glowDir ?? new Vector3(0, 0, -1)).clone().normalize() },
		uGlowExp: { value: s.glowExp ?? 8 },
		uFogDensity: { value: s.fogDensity },
		uFogFalloff: { value: s.fogFalloff },
		uFogBase: { value: s.fogBase ?? 0 },
		uSlab: { value: slab ? new Vector4(slab.bottom, slab.top, slab.density, slab.scale) : new Vector4(0, 0, 0, 1) },
		uSlabColor: { value: slab?.color ?? new Color(0, 0, 0) },
		uSlabDrift: { value: slab?.drift ?? [0, 0] },
		uSunDir: { value: (s.sunDir ?? new Vector3(0, 1, 0)).clone().normalize() },
		uSunColor: { value: s.sunColor ?? new Color(0, 0, 0) },
		uAmbientSky: { value: s.ambientSky },
		uAmbientGround: { value: s.ambientGround },
		uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector3()) },
		uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector3()) },
		uLightSurf: { value: new Array(MAX_LIGHTS).fill(1) },
		uLightRange: { value: new Array(MAX_LIGHTS).fill(0) },
		uLightSpot: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4(0, -1, 0, -2)) },
		uLightCount: { value: 0 },
		uLightScatter: { value: s.lightScatter ?? 1 },
		uPhase: { value: [s.phaseG ?? 0.75, s.isotropic ?? 0.02] },
		uSkyDist: { value: s.skyDist ?? 30000 },
		uShadowMap: { value: null },
		uShadowMatrix: { value: new Matrix4() },
		uShadowParams: { value: new Vector4(0, 0, 0, 0) }
	};
}

export const glslCommon = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
#define PI 3.14159265
uniform float uTime;
uniform float uWind;
uniform vec3 uFogLow;
uniform vec3 uFogHigh;
uniform vec3 uGlowColor;
uniform vec3 uGlowDir;
uniform float uGlowExp;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform vec4 uSlab;
uniform vec3 uSlabColor;
uniform vec2 uSlabDrift;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform float uLightSurf[MAX_LIGHTS];
uniform float uLightRange[MAX_LIGHTS];
uniform vec4 uLightSpot[MAX_LIGHTS];
uniform int uLightCount;
uniform float uLightScatter;
uniform vec2 uPhase;
uniform float uSkyDist;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec4 uShadowParams;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
		mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
	float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
	return mix(a, b, u.z);
}
const mat2 ROT2 = mat2(0.8, -0.6, 0.6, 0.8);
float fbm2(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		s += a * vnoise(p);
		p = ROT2 * p * 2.03;
		a *= 0.5;
	}
	return s / 0.96875;
}
float fbm3(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise3(p);
		p = p * 2.07 + vec3(1.7, 9.2, 3.1);
		a *= 0.5;
	}
	return s / 0.9375;
}

float fogDensityAt(float y) {
	return uFogDensity * exp(-uFogFalloff * (y - uFogBase));
}

float heightFogOD(vec3 ro, vec3 rd, float t) {
	float a = uFogDensity * exp(-uFogFalloff * (ro.y - uFogBase));
	float k = uFogFalloff * rd.y * t;
	float f = abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0 - 0.5 * k;
	return a * t * f;
}

float slabNoise(vec2 xz) {
	vec2 p = xz * uSlab.w + uSlabDrift * uTime;
	float n = fbm2(p);
	return smoothstep(0.32, 0.78, n);
}

float slabDensityAt(vec3 p) {
	if (uSlab.z <= 0.0) return 0.0;
	float h = (p.y - uSlab.x) / max(uSlab.y - uSlab.x, 1.0);
	if (h < 0.0 || h > 1.0) return 0.0;
	return uSlab.z * slabNoise(p.xz) * smoothstep(0.0, 0.3, h) * smoothstep(1.0, 0.6, h);
}

float slabOD(vec3 ro, vec3 rd, float t, out float shade) {
	shade = 0.0;
	if (uSlab.z <= 0.0) return 0.0;
	float t0;
	float t1;
	if (abs(rd.y) < 1e-5) {
		if (ro.y < uSlab.x || ro.y > uSlab.y) return 0.0;
		t0 = 0.0;
		t1 = t;
	} else {
		float ta = (uSlab.x - ro.y) / rd.y;
		float tb = (uSlab.y - ro.y) / rd.y;
		t0 = max(min(ta, tb), 0.0);
		t1 = min(max(ta, tb), t);
	}
	float len = t1 - t0;
	if (len <= 0.0) return 0.0;
	vec3 pa = ro + rd * mix(t0, t1, 0.25);
	vec3 pb = ro + rd * mix(t0, t1, 0.75);
	float n = 0.5 * (slabNoise(pa.xz) + slabNoise(pb.xz));
	float hEntry = clamp(((ro + rd * t0).y - uSlab.x) / max(uSlab.y - uSlab.x, 1.0), 0.0, 1.0);
	shade = n * (0.55 + 0.45 * hEntry);
	return uSlab.z * n * len * 0.55;
}

vec3 fogInscatter(vec3 rd) {
	vec3 c = mix(uFogLow, uFogHigh, smoothstep(-0.05, 0.55, rd.y));
	c += uGlowColor * pow(max(dot(rd, uGlowDir), 0.0), uGlowExp);
	return c;
}

float spotFactor(int i, vec3 fromLight) {
	vec4 sp = uLightSpot[i];
	if (sp.w < -1.5) return 1.0;
	float c = dot(normalize(fromLight), sp.xyz);
	return smoothstep(sp.w, sp.w + (1.0 - sp.w) * 0.45, c);
}

float rangeFactor(int i, float d2) {
	float r = uLightRange[i];
	if (r <= 0.0) return 1.0;
	float q = clamp(1.0 - (d2 * d2) / (r * r * r * r), 0.0, 1.0);
	return q * q;
}

vec3 pointScatter(vec3 ro, vec3 rd, float t) {
	vec3 acc = vec3(0.0);
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= uLightCount) break;
		vec3 L = uLightPos[i] - ro;
		float b = dot(L, rd);
		float l2 = dot(L, L);
		float h = sqrt(max(l2 - b * b, 0.36));
		float I = (atan((t - b) / h) + atan(b / h)) / h;
		float tc = clamp(b, 0.0, t);
		vec3 pc = ro + rd * tc;
		float dens = fogDensityAt(pc.y) + slabDensityAt(pc);
		float cosT = b * inversesqrt(l2);
		float g = uPhase.x;
		float hg = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * cosT, 1.5));
		float phase = uPhase.y + hg;
		float spot = spotFactor(i, pc - uLightPos[i]);
		acc += uLightCol[i] * (I * dens * phase * spot * exp(-heightFogOD(ro, rd, tc)));
	}
	return acc * uLightScatter;
}

vec3 applyAtmosphere(vec3 col, vec3 p) {
	vec3 ro = cameraPosition;
	vec3 v = p - ro;
	float t = length(v);
	vec3 rd = v / max(t, 1e-4);
	float od = heightFogOD(ro, rd, t);
	float shade;
	float sod = slabOD(ro, rd, t, shade);
	float T = exp(-(od + sod));
	vec3 slabC = uSlabColor * (0.35 + 1.1 * shade) + uGlowColor * 0.25 * pow(max(dot(rd, uGlowDir), 0.0), 2.0);
	vec3 inC = (od * fogInscatter(rd) + sod * slabC) / max(od + sod, 1e-6);
	col = col * T + inC * (1.0 - T);
	col += pointScatter(ro, rd, t);
	return col;
}

float transmittanceTo(vec3 p) {
	vec3 ro = cameraPosition;
	vec3 v = p - ro;
	float t = length(v);
	vec3 rd = v / max(t, 1e-4);
	float shade;
	return exp(-(heightFogOD(ro, rd, t) + slabOD(ro, rd, t, shade)));
}

vec3 ambientLight(vec3 n) {
	return mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);
}

vec3 pointLighting(vec3 p, vec3 n, float wrap) {
	vec3 acc = vec3(0.0);
	for (int i = 0; i < MAX_LIGHTS; i++) {
		if (i >= uLightCount) break;
		vec3 L = uLightPos[i] - p;
		float d2 = dot(L, L);
		float ndl = (dot(n, L * inversesqrt(d2)) + wrap) / (1.0 + wrap);
		acc += uLightCol[i] * (uLightSurf[i] * spotFactor(i, -L) * rangeFactor(i, d2) * max(ndl, 0.0) / (d2 + 1.0));
	}
	return acc;
}

const vec2 POISSON16[16] = vec2[](
	vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.09418410, -0.92938870), vec2(0.34495938, 0.29387760),
	vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
	vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
	vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790)
);

vec3 shadowCoord(vec3 p) {
	vec4 sc = uShadowMatrix * vec4(p, 1.0);
	return sc.xyz / sc.w * 0.5 + 0.5;
}

float shadowHard(vec3 p) {
	if (uShadowParams.x < 0.5) return 1.0;
	vec3 s = shadowCoord(p);
	if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
	return step(s.z - uShadowParams.z, texture(uShadowMap, s.xy).r);
}

float shadowFactor(vec3 p, vec3 n) {
	if (uShadowParams.x < 0.5) return 1.0;
	vec3 s = shadowCoord(p + n * 0.12);
	if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
	float z = s.z - uShadowParams.z;
	float a = hash13(p * 53.17 + fract(uTime * 7.0) * 97.0) * 6.2831853;
	mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
	float search = uShadowParams.w * 24.0;
	float blockers = 0.0;
	float sum = 0.0;
	for (int i = 0; i < 16; i++) {
		float d = texture(uShadowMap, s.xy + R * POISSON16[i] * search).r;
		if (d < z) {
			sum += d;
			blockers += 1.0;
		}
	}
	if (blockers < 0.5) return 1.0;
	float avg = sum / blockers;
	float radius = clamp((z - avg) * uShadowParams.y, uShadowParams.w * 1.5, uShadowParams.w * 24.0);
	float lit = 0.0;
	for (int i = 0; i < 16; i++) lit += step(z, texture(uShadowMap, s.xy + R * POISSON16[i] * radius).r);
	return lit / 16.0;
}

vec3 sunLight(vec3 n, float wrap) {
	float ndl = (dot(n, uSunDir) + wrap) / (1.0 + wrap);
	return uSunColor * max(ndl, 0.0);
}

vec3 directLight(vec3 p, vec3 n, float wrap) {
	float ndl = (dot(n, uSunDir) + wrap) / (1.0 + wrap);
	return uSunColor * max(ndl, 0.0) + pointLighting(p, n, wrap);
}
`;

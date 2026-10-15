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
		uShadowVol: { value: null },
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
uniform sampler2D uShadowVol;
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

float fbm3o(vec2 p) {
	return (vnoise(p) * 0.5 + vnoise(ROT2 * p * 2.03) * 0.25 + vnoise(ROT2 * ROT2 * p * 4.1) * 0.125) / 0.875;
}

float slabNoise(vec2 xz) {
	vec2 p = xz * uSlab.w + uSlabDrift * uTime;
	float n = fbm3o(p);
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
	vec3 pa = ro + rd * mix(t0, t1, 0.5);
	float n = slabNoise(pa.xz);
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
		vec3 lc = uLightCol[i];
		if (d2 * 0.0002 > lc.r + lc.g + lc.b) continue;
		float ndl = (dot(n, L * inversesqrt(d2)) + wrap) / (1.0 + wrap);
		acc += uLightCol[i] * (uLightSurf[i] * spotFactor(i, -L) * rangeFactor(i, d2) * max(ndl, 0.0) / (d2 + 1.0));
	}
	return acc;
}

vec3 shadowCoord(vec3 p) {
	vec4 sc = uShadowMatrix * vec4(p, 1.0);
	return sc.xyz / sc.w * 0.5 + 0.5;
}

float shadowAt(sampler2D map, vec3 s) {
	if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
	float f = texture(map, s.xy).r;
	return clamp(exp(uShadowParams.y * (f - (s.z - uShadowParams.z))), 0.0, 1.0);
}

float shadowVolume(vec3 p) {
	if (uShadowParams.x < 0.5) return 1.0;
	return shadowAt(uShadowVol, shadowCoord(p));
}

float shadowFactor(vec3 p, vec3 n) {
	if (uShadowParams.x < 0.5) return 1.0;
	if (dot(n, uSunDir) < -0.35) return 0.0;
	return shadowAt(uShadowMap, shadowCoord(p + n * 0.12));
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

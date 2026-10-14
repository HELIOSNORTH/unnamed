import {
	AdditiveBlending,
	BackSide,
	Color,
	NormalBlending,
	ShaderMaterial,
	Vector2,
	Vector3,
	type IUniform
} from 'three';
import { glslCommon, type AtmosphereUniforms } from './atmosphere.ts';

const shared = (atmos: AtmosphereUniforms, own: Record<string, IUniform>) => ({ ...atmos, ...own });

export const viewport = {
	resolution: { value: new Vector2(1920, 1080) },
	pxScale: { value: 1 }
};

export interface SkySettings {
	zenith: Color;
	horizon: Color;
	curve?: number;
	moon?: { dir: Vector3; radius: number; intensity: number; halo: number; color?: Color };
	milkyWay?: { normal: Vector3; intensity: number };
	clouds?: { amount: number; height: number; scale: number; color: Color; underlight: Color; speed?: [number, number] };
}

export function createSkyMaterial(atmos: AtmosphereUniforms, s: SkySettings): ShaderMaterial {
	const moon = s.moon;
	const clouds = s.clouds;
	return new ShaderMaterial({
		uniforms: shared(atmos, {
			uZenith: { value: s.zenith },
			uHorizon: { value: s.horizon },
			uCurve: { value: s.curve ?? 0.5 },
			uMoonDir: { value: (moon?.dir ?? new Vector3(0, 1, 0)).clone().normalize() },
			uMoon: { value: new Vector3(moon?.radius ?? 0, moon?.intensity ?? 0, moon?.halo ?? 0) },
			uMoonColor: { value: moon?.color ?? new Color(1, 0.96, 0.9) },
			uMilkyNormal: { value: (s.milkyWay?.normal ?? new Vector3(0, 1, 0)).clone().normalize() },
			uMilky: { value: s.milkyWay?.intensity ?? 0 },
			uCloud: { value: new Vector3(clouds?.amount ?? 0, clouds?.height ?? 3000, clouds?.scale ?? 0.0003) },
			uCloudColor: { value: clouds?.color ?? new Color(0, 0, 0) },
			uCloudUnder: { value: clouds?.underlight ?? new Color(0, 0, 0) },
			uCloudSpeed: { value: new Vector2(...(clouds?.speed ?? [1.5, 0.4])) }
		}),
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			void main() {
				vec4 w = modelMatrix * vec4(position, 1.0);
				vWorld = w.xyz;
				gl_Position = projectionMatrix * viewMatrix * w;
				gl_Position.z = gl_Position.w * 0.99999;
			}
		`,
		fragmentShader: /* glsl */ `
			${glslCommon}
			uniform vec3 uZenith;
			uniform vec3 uHorizon;
			uniform float uCurve;
			uniform vec3 uMoonDir;
			uniform vec3 uMoon;
			uniform vec3 uMoonColor;
			uniform vec3 uMilkyNormal;
			uniform float uMilky;
			uniform vec3 uCloud;
			uniform vec3 uCloudColor;
			uniform vec3 uCloudUnder;
			uniform vec2 uCloudSpeed;
			varying vec3 vWorld;

			vec3 moonDisk(vec3 rd) {
				float r = uMoon.x;
				if (r <= 0.0) return vec3(0.0);
				float c = dot(rd, uMoonDir);
				float ang = acos(clamp(c, -1.0, 1.0));
				vec3 col = vec3(0.0);
				float halo = uMoon.z * (0.6 * exp(-ang / (r * 2.5)) + 0.25 * exp(-ang / (r * 9.0)) + 0.08 * exp(-ang / (r * 30.0)));
				col += uMoonColor * halo;
				float edge = fwidth(ang) * 1.5 + 1e-5;
				float disk = 1.0 - smoothstep(r - edge, r + edge, ang);
				if (disk > 0.0) {
					vec3 up = abs(uMoonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
					vec3 tx = normalize(cross(up, uMoonDir));
					vec3 ty = cross(uMoonDir, tx);
					vec2 q = vec2(dot(rd, tx), dot(rd, ty)) / r;
					float z = sqrt(max(1.0 - dot(q, q), 0.0));
					vec3 sp = vec3(q, z);
					float maria = fbm3(sp * 2.2 + vec3(3.1, 7.7, 1.3));
					float m = smoothstep(0.42, 0.62, maria);
					float crater = fbm3(sp * 9.0);
					float albedo = mix(1.0, 0.62, m) * (0.9 + 0.2 * crater);
					float limb = 0.55 + 0.45 * pow(z, 0.45);
					col += uMoonColor * uMoon.y * albedo * limb * disk;
				}
				return col;
			}

			vec3 milkyWay(vec3 rd) {
				if (uMilky <= 0.0) return vec3(0.0);
				float d = dot(rd, uMilkyNormal);
				float band = exp(-d * d / 0.018);
				float wide = exp(-d * d / 0.09);
				float n = fbm3(rd * 6.0);
				float fine = fbm3(rd * 24.0 + 4.0);
				float dust = smoothstep(0.45, 0.75, fbm3(rd * 10.0 + 11.0)) * exp(-d * d / 0.006);
				float lum = (band * (0.55 + 0.9 * n) + wide * 0.25) * (0.75 + 0.5 * fine);
				lum *= 1.0 - 0.85 * dust;
				vec3 tint = mix(vec3(0.75, 0.8, 1.0), vec3(1.0, 0.86, 0.7), n);
				return tint * lum * uMilky * smoothstep(0.0, 0.25, rd.y);
			}

			void main() {
				vec3 rd = normalize(vWorld - cameraPosition);
				float h = max(rd.y, 0.0);
				vec3 col = mix(uHorizon, uZenith, pow(h, uCurve));
				col += milkyWay(rd);
				if (uCloud.x > 0.0 && rd.y > 0.002) {
					float t = (uCloud.y - cameraPosition.y) / rd.y;
					vec2 p = (cameraPosition.xz + rd.xz * t) * uCloud.z + uCloudSpeed * uTime * 0.01;
					float n = fbm2(p) * 0.65 + fbm2(p * 3.1 + 7.0) * 0.35;
					float cov = smoothstep(1.0 - uCloud.x, 1.05 - uCloud.x * 0.4, n);
					vec3 cc = uCloudColor * (0.65 + 0.7 * n) + uCloudUnder * smoothstep(0.35, 0.0, rd.y) * (0.6 + 0.6 * n);
					col = mix(col, cc, cov * smoothstep(0.02, 0.25, rd.y));
				}
				col += moonDisk(rd);
				col = applyAtmosphere(col, cameraPosition + rd * uSkyDist);
				gl_FragColor = vec4(col, 1.0);
			}
		`,
		side: BackSide,
		depthWrite: false
	});
}

export interface SurfaceSettings {
	albedo: Color;
	albedo2?: Color;
	variation?: number;
	variationScale?: number;
	wrap?: number;
	emissive?: Color;
	snow?: { color: Color; slope: number; minHeight: number };
	canopy?: { cell: number; color: Color; color2: Color; bump: number };
	grid?: { size: Vector2; strength: number; window?: [number, number, number] };
	sparkle?: number;
	spec?: number;
	bakedShadow?: boolean;
}

export function createSurfaceMaterial(atmos: AtmosphereUniforms, s: SurfaceSettings): ShaderMaterial {
	const defines: Record<string, string> = {};
	if (s.snow) defines.SNOW = '';
	if (s.canopy) defines.CANOPY = '';
	if (s.grid) defines.GRID = '';
	if (s.bakedShadow) defines.BAKED_SHADOW = '';
	return new ShaderMaterial({
		defines,
		uniforms: shared(atmos, {
			uAlbedo: { value: s.albedo },
			uAlbedo2: { value: s.albedo2 ?? s.albedo },
			uVariation: { value: new Vector2(s.variation ?? 0.3, s.variationScale ?? 0.02) },
			uWrap: { value: s.wrap ?? 0.15 },
			uEmissive: { value: s.emissive ?? new Color(0, 0, 0) },
			uSnowColor: { value: s.snow?.color ?? new Color(1, 1, 1) },
			uSnow: { value: new Vector2(s.snow?.slope ?? 0.7, s.snow?.minHeight ?? 0) },
			uCanopy: { value: new Vector2(s.canopy?.cell ?? 8, s.canopy?.bump ?? 1) },
			uCanopyColor: { value: s.canopy?.color ?? new Color() },
			uCanopyColor2: { value: s.canopy?.color2 ?? new Color() },
			uGrid: { value: new Vector3(s.grid?.size.x ?? 1, s.grid?.size.y ?? 1, s.grid?.strength ?? 0) },
			uWindow: { value: new Vector3(...(s.grid?.window ?? [0, 0, 0])) },
			uSparkle: { value: s.sparkle ?? 0 },
			uSpec: { value: s.spec ?? 0 }
		}),
		vertexShader: /* glsl */ `
			#ifdef BAKED_SHADOW
			attribute float aShade;
			#endif
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vShade;
			void main() {
				vec4 w = modelMatrix * vec4(position, 1.0);
				vWorld = w.xyz;
				vNormal = normalize(mat3(modelMatrix) * normal);
				#ifdef BAKED_SHADOW
				vShade = aShade;
				#else
				vShade = 1.0;
				#endif
				gl_Position = projectionMatrix * viewMatrix * w;
			}
		`,
		fragmentShader: /* glsl */ `
			${glslCommon}
			uniform vec3 uAlbedo;
			uniform vec3 uAlbedo2;
			uniform vec2 uVariation;
			uniform float uWrap;
			uniform vec3 uEmissive;
			uniform vec3 uSnowColor;
			uniform vec2 uSnow;
			uniform vec2 uCanopy;
			uniform vec3 uCanopyColor;
			uniform vec3 uCanopyColor2;
			uniform vec3 uGrid;
			uniform vec3 uWindow;
			uniform float uSparkle;
			uniform float uSpec;
			varying vec3 vWorld;
			varying vec3 vNormal;
			varying float vShade;

			vec3 worley(vec2 p) {
				vec2 i = floor(p);
				vec2 f = fract(p);
				float f1 = 9.0;
				float id = 0.0;
				for (int y = -1; y <= 1; y++) {
					for (int x = -1; x <= 1; x++) {
						vec2 g = vec2(float(x), float(y));
						vec2 o = hash22(i + g) * 0.8 + 0.1;
						float d = length(g + o - f);
						if (d < f1) { f1 = d; id = hash12(i + g + 17.0); }
					}
				}
				return vec3(f1, id, 0.0);
			}

			float crown(vec2 p) {
				vec3 w = worley(p);
				float c = max(1.0 - w.x * w.x * 1.25, 0.0);
				vec3 w2 = worley(p * 2.3 + 5.1);
				float c2 = max(1.0 - w2.x * w2.x * 1.25, 0.0);
				return mix(c * c * (3.0 - 2.0 * c), c2, 0.35) * (0.8 + 0.4 * w.y);
			}

			void main() {
				vec3 n = normalize(vNormal);
				vec3 p = vWorld;
				vec3 V = normalize(cameraPosition - p);
				float var = fbm2(p.xz * uVariation.y);
				vec3 albedo = mix(uAlbedo, uAlbedo2, smoothstep(0.3, 0.7, var) * uVariation.x / 0.3);
				float ao = 1.0;

				#ifdef CANOPY
				vec2 cp = p.xz / uCanopy.x;
				float foot = length(fwidth(cp));
				float detail = 1.0 - smoothstep(0.25, 0.9, foot);
				float h0 = crown(cp);
				float e = 0.08;
				float hx = crown(cp + vec2(e, 0.0));
				float hz = crown(cp + vec2(0.0, e));
				vec2 grad = vec2(hx - h0, hz - h0) / e;
				vec3 bumped = normalize(n - vec3(grad.x, 0.0, grad.y) * 0.55 * uCanopy.y);
				n = normalize(mix(n, bumped, detail));
				vec3 w = worley(cp);
				float leaf = vnoise(p.xz * 1.7) * 0.5 + vnoise(p.xz * 4.3) * 0.5;
				albedo = mix(uCanopyColor, uCanopyColor2, w.y) * (0.75 + 0.5 * leaf);
				ao = mix(1.0, mix(0.25, 1.0, h0), detail * 0.9);
				#endif

				#ifdef SNOW
				float camDist = length(cameraPosition - p);
				vec2 sq = vec2(p.x * 0.8 + p.z * 0.6, p.z * 0.8 - p.x * 0.6) * vec2(0.35, 1.6);
				float se = 0.05;
				float s0 = fbm2(sq);
				vec2 sg = vec2(fbm2(sq + vec2(se, 0.0)) - s0, fbm2(sq + vec2(0.0, se)) - s0) / se;
				n = normalize(n - vec3(sg.x * 0.35, 0.0, sg.y * 0.12) * smoothstep(160.0, 10.0, camDist));
				float snowN = fbm2(p.xz * 0.05) * 0.25 + fbm2(p.xz * 0.6) * 0.1;
				float snowAmt = smoothstep(uSnow.x - 0.12, uSnow.x + 0.04, n.y + snowN - 0.12) * smoothstep(uSnow.y - 150.0, uSnow.y + 150.0, p.y + snowN * 400.0);
				albedo = mix(albedo, uSnowColor, snowAmt);
				#endif

				#ifdef GRID
				vec3 an = abs(n);
				vec2 gp = an.x > 0.5 ? p.zy : (an.z > 0.5 ? p.xy : p.xz);
				vec2 gf = abs(fract(gp / uGrid.xy) - 0.5) * 2.0;
				vec2 gw = fwidth(gp / uGrid.xy) * 2.0;
				float line = max(smoothstep(1.0 - gw.x * 1.5, 1.0, gf.x), smoothstep(1.0 - gw.y * 1.5, 1.0, gf.y));
				albedo *= 1.0 - line * uGrid.z;
				albedo *= 0.94 + 0.12 * hash12(floor(gp / uGrid.xy));
				float win = 0.0;
				if (uWindow.z > 0.0 && an.y < 0.5) {
					vec2 wq = smoothstep(uWindow.xy + gw, uWindow.xy - gw, gf);
					win = wq.x * wq.y * step(0.25, hash12(floor(gp / uGrid.xy) + 3.7));
					albedo *= 1.0 - win * uWindow.z;
				}
				#endif

				vec3 light = ambientLight(n) * ao + directLight(p, n, uWrap) * vShade * mix(1.0, ao, 0.6);
				vec3 col = albedo * light + uEmissive;
				#ifdef GRID
				col += win * uWindow.z * 0.12 * uAmbientSky * (0.4 + 0.6 * pow(1.0 - max(dot(n, V), 0.0), 3.0));
				#endif

				if (uSpec > 0.0) {
					vec3 H = normalize(uSunDir + V);
					col += uSunColor * uSpec * pow(max(dot(n, H), 0.0), 40.0) * vShade;
				}
				#ifdef SNOW
				if (uSparkle > 0.0) {
					vec3 cell = floor(p * 9.0);
					float r = hash13(cell);
					vec3 fn = normalize(vec3(hash13(cell + 1.3), hash13(cell + 5.1), hash13(cell + 9.7)) - 0.5 + n * 0.9);
					vec3 H = normalize(uSunDir + V);
					float g = pow(max(dot(fn, H), 0.0), 600.0) * step(0.6, r);
					col += uSunColor * g * uSparkle * snowAmt * vShade * smoothstep(80.0, 5.0, camDist);
				}
				#endif

				col = applyAtmosphere(col, p);
				gl_FragColor = vec4(col, 1.0);
			}
		`
	});
}

export interface RibbonSettings {
	color: Color;
	wrap?: number;
	minWidthPx?: number;
	emissive?: Color;
	lightResponse?: number;
}

export function createRibbonMaterial(atmos: AtmosphereUniforms, s: RibbonSettings): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: shared(atmos, {
			uColor: { value: s.color },
			uEmissive: { value: s.emissive ?? new Color(0, 0, 0) },
			uMinPx: { value: s.minWidthPx ?? 0.6 },
			uLightResponse: { value: s.lightResponse ?? 0.15 },
			uResolution: viewport.resolution,
			uPxScale: viewport.pxScale
		}),
		vertexShader: /* glsl */ `
			uniform float uTime;
			uniform float uWind;
			uniform float uMinPx;
			uniform vec2 uResolution;
			attribute vec3 aStart;
			attribute vec3 aEnd;
			attribute vec2 aSide;
			attribute float aRadius;
			attribute vec2 aFlex;
			varying vec3 vWorld;
			varying float vEdge;
			varying float vHalf;
			varying float vCoverage;

			vec3 sway(vec3 p, float flex) {
				if (flex <= 0.0) return p;
				float ph = dot(p.xz, vec2(0.13, 0.07));
				float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25 + sin(uTime * 0.55 + ph) * 0.4;
				vec2 off = vec2(0.8, 0.35) * (uWind * (0.4 + 0.6 * s)) + vec2(-0.3, 0.6) * sin(uTime * 4.1 + ph * 3.0) * 0.15 * uWind;
				return p + vec3(off.x, -abs(off.x) * 0.15, off.y) * flex;
			}

			void main() {
				vec3 a = sway(aStart, aFlex.x);
				vec3 b = sway(aEnd, aFlex.y);
				vec3 v0 = (viewMatrix * vec4(a, 1.0)).xyz;
				vec3 v1 = (viewMatrix * vec4(b, 1.0)).xyz;
				float nearZ = -0.6;
				if (v0.z > nearZ && v1.z > nearZ) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
				if (v0.z > nearZ) v0 = mix(v0, v1, (v0.z - nearZ) / (v0.z - v1.z));
				if (v1.z > nearZ) v1 = mix(v1, v0, (v1.z - nearZ) / (v1.z - v0.z));
				vec3 vp = mix(v0, v1, aSide.x);
				vec4 c0 = projectionMatrix * vec4(v0, 1.0);
				vec4 c1 = projectionMatrix * vec4(v1, 1.0);
				vec2 s0 = c0.xy / c0.w * uResolution * 0.5;
				vec2 s1 = c1.xy / c1.w * uResolution * 0.5;
				vec2 d = s1 - s0;
				float dl = length(d);
				vec2 dir = dl > 1e-4 ? d / dl : vec2(1.0, 0.0);
				vec2 nrm = vec2(-dir.y, dir.x);
				vec4 cp = projectionMatrix * vec4(vp, 1.0);
				float radPx = aRadius * projectionMatrix[1][1] * uResolution.y * 0.5 / max(-vp.z, 1e-3);
				float wPx = max(radPx, uMinPx);
				vCoverage = min(radPx / wPx, 1.0);
				float off = aSide.y * (wPx + 1.0);
				vec2 along = dir * (aSide.x * 2.0 - 1.0) * min(wPx, 2.0);
				cp.xy += (nrm * off + along) * cp.w / (uResolution * 0.5);
				gl_Position = cp;
				vEdge = off;
				vHalf = wPx;
				vWorld = mix(a, b, aSide.x);
			}
		`,
		fragmentShader: /* glsl */ `
			${glslCommon}
			uniform vec3 uColor;
			uniform vec3 uEmissive;
			uniform float uLightResponse;
			varying vec3 vWorld;
			varying float vEdge;
			varying float vHalf;
			varying float vCoverage;
			void main() {
				float a = clamp(vHalf + 0.5 - abs(vEdge), 0.0, 1.0) * vCoverage;
				if (a < 0.003) discard;
				vec3 V = normalize(cameraPosition - vWorld);
				vec3 nApprox = normalize(V + vec3(0.0, 0.35, 0.0));
				vec3 light = ambientLight(vec3(0.0, 0.3, 0.0)) + uSunColor * 0.45 + pointLighting(vWorld, nApprox, 1.2) * uLightResponse;
				vec3 col = uColor * light + uEmissive;
				col = applyAtmosphere(col, vWorld);
				gl_FragColor = vec4(col, a);
			}
		`,
		transparent: true,
		depthWrite: true,
		blending: NormalBlending
	});
}

export function createPointsMaterial(atmos: AtmosphereUniforms, opts: { stars?: boolean; halo?: number; spikes?: number }): ShaderMaterial {
	return new ShaderMaterial({
		defines: opts.stars ? { STARS: '' } : {},
		uniforms: shared(atmos, {
			uPxScale: viewport.pxScale,
			uHalo: { value: opts.halo ?? 0.4 },
			uSpikes: { value: opts.spikes ?? 0 }
		}),
		vertexShader: /* glsl */ `
			${glslCommon}
			uniform float uPxScale;
			attribute vec3 aColor;
			attribute float aSize;
			attribute float aTwinkle;
			varying vec3 vColor;
			varying float vCore;
			varying float vSizePx;
			void main() {
				vec4 w = modelMatrix * vec4(position, 1.0);
				vec3 col = aColor;
				float ph = hash12(position.xz * 0.013);
				#ifdef STARS
				vec3 rd = normalize(w.xyz - cameraPosition);
				float air = 1.0 / max(rd.y + 0.04, 0.04);
				float ext = exp(-0.12 * air);
				float tw = 1.0 + aTwinkle * (0.5 + 0.5 * min(air, 6.0) / 6.0) * (sin(uTime * (5.0 + ph * 9.0) + ph * 40.0) * 0.6 + sin(uTime * (11.0 + ph * 5.0)) * 0.4);
				col *= ext * max(tw, 0.0) * smoothstep(-0.02, 0.06, rd.y);
				col *= exp(-heightFogOD(cameraPosition, rd, uSkyDist) * 1.2);
				#else
				float tw = 1.0 + aTwinkle * (sin(uTime * (3.0 + ph * 7.0) + ph * 30.0) * 0.5 + sin(uTime * (7.3 + ph * 3.0)) * 0.5);
				col *= tw * transmittanceTo(w.xyz);
				#endif
				vColor = col;
				vec4 mv = viewMatrix * w;
				gl_Position = projectionMatrix * mv;
				gl_PointSize = aSize * uPxScale;
				vCore = 1.4 / max(aSize * uPxScale, 1.0);
				vSizePx = aSize * uPxScale;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uHalo;
			uniform float uSpikes;
			varying vec3 vColor;
			varying float vCore;
			varying float vSizePx;
			void main() {
				vec2 q = gl_PointCoord * 2.0 - 1.0;
				float r2 = dot(q, q);
				if (r2 > 1.0) discard;
				float core = exp(-r2 / (vCore * vCore * 0.5));
				float halo = exp(-r2 * 6.0) * uHalo;
				float edge = 1.0 - r2;
				vec2 a = abs(q) * vSizePx * 0.5;
				vec2 fall = 1.0 - abs(q);
				float spikes = (exp(-a.y * 1.6) * fall.x * fall.x + exp(-a.x * 1.6) * fall.y * fall.y) * uSpikes;
				gl_FragColor = vec4(vColor * (core + halo + spikes) * edge, 1.0);
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending
	});
}

export function createDriftMaterial(atmos: AtmosphereUniforms, opts: { box: Vector3; windDir: Vector2; speed: number; brightness: number }): ShaderMaterial {
	return new ShaderMaterial({
		uniforms: shared(atmos, {
			uPxScale: viewport.pxScale,
			uBox: { value: opts.box },
			uWindDir: { value: opts.windDir.clone().normalize() },
			uSpeed: { value: opts.speed },
			uBrightness: { value: opts.brightness }
		}),
		vertexShader: /* glsl */ `
			${glslCommon}
			uniform float uPxScale;
			uniform vec3 uBox;
			uniform vec2 uWindDir;
			uniform float uSpeed;
			uniform float uBrightness;
			attribute vec4 aSeed;
			varying float vAlpha;
			void main() {
				float gust = 0.35 + uWind;
				vec3 drift = vec3(uWindDir.x, 0.0, uWindDir.y) * uSpeed * uTime * (0.7 + 0.6 * aSeed.w);
				drift.y = -0.4 * uTime * (0.5 + aSeed.w);
				vec3 swirl = vec3(sin(uTime * 1.7 + aSeed.x * 40.0), sin(uTime * 2.3 + aSeed.y * 30.0) * 0.6, cos(uTime * 1.3 + aSeed.z * 50.0)) * 0.6;
				vec3 local = mod(aSeed.xyz * uBox + drift + swirl - cameraPosition, uBox) - uBox * 0.5;
				vec3 world = cameraPosition + local;
				world.y = cameraPosition.y - 1.6 + mod(aSeed.y * uBox.y + drift.y, uBox.y) * aSeed.y;
				vec3 rd = normalize(world - cameraPosition);
				float forward = pow(max(dot(rd, uSunDir), 0.0), 6.0);
				float dist = length(world - cameraPosition);
				vAlpha = uBrightness * gust * (0.35 + 2.5 * forward) * smoothstep(0.5, 2.5, dist) * smoothstep(uBox.x * 0.5, uBox.x * 0.3, dist);
				vec4 mv = viewMatrix * vec4(world, 1.0);
				gl_Position = projectionMatrix * mv;
				gl_PointSize = clamp(18.0 / -mv.z, 1.2, 4.0) * uPxScale;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uSunColor;
			varying float vAlpha;
			void main() {
				vec2 q = gl_PointCoord * 2.0 - 1.0;
				float r2 = dot(q, q);
				if (r2 > 1.0) discard;
				gl_FragColor = vec4(uSunColor * vAlpha * (1.0 - r2), 1.0);
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending
	});
}

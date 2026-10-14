import {
	BufferGeometry,
	Camera,
	Color,
	Float32BufferAttribute,
	HalfFloatType,
	LinearFilter,
	Mesh,
	OneFactor,
	OrthographicCamera,
	CustomBlending,
	AddEquation,
	Scene,
	ShaderMaterial,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	type WebGLRenderer
} from 'three';

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

const compositeFrag = /* glsl */ `
	uniform sampler2D tScene;
	uniform sampler2D tBloom;
	uniform vec2 uResolution;
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
	uniform float uVignette;
	uniform float uAberration;
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

	void main() {
		vec2 uv = vUv;
		vec2 dc = uv - 0.5;
		float r2 = dot(dc, dc);
		vec2 ca = dc * r2 * uAberration;
		vec3 hdr;
		hdr.r = texture2D(tScene, uv - ca).r;
		hdr.g = texture2D(tScene, uv).g;
		hdr.b = texture2D(tScene, uv + ca).b;
		vec3 bloom = texture2D(tBloom, uv).rgb / 7.0;
		vec3 halo = bloom * mix(vec3(1.0), vec3(1.35, 0.62, 0.42), uHalation);
		hdr = mix(hdr, halo, uBloom);

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

		float frame = floor(uTime * 24.0);
		vec2 gp = gl_FragCoord.xy / 1.35;
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

export class Pipeline {
	private sceneRT: WebGLRenderTarget;
	private mips: WebGLRenderTarget[] = [];
	private quad: Mesh;
	private quadScene = new Scene();
	private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private down: ShaderMaterial;
	private up: ShaderMaterial;
	readonly composite: ShaderMaterial;
	private size = new Vector2();
	private readonly levels = 7;

	constructor(private renderer: WebGLRenderer) {
		const rtOpts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false };
		this.sceneRT = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4, depthBuffer: true });
		for (let i = 0; i < this.levels; i++) this.mips.push(new WebGLRenderTarget(4, 4, rtOpts));
		this.down = new ShaderMaterial({
			uniforms: { tSrc: { value: null }, uTexel: { value: new Vector2() }, uKaris: { value: 0 } },
			vertexShader: fullscreenVert,
			fragmentShader: downsampleFrag,
			depthTest: false,
			depthWrite: false
		});
		this.up = new ShaderMaterial({
			uniforms: { tSrc: { value: null }, uTexel: { value: new Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } },
			vertexShader: fullscreenVert,
			fragmentShader: upsampleFrag,
			depthTest: false,
			depthWrite: false,
			blending: CustomBlending,
			blendEquation: AddEquation,
			blendSrc: OneFactor,
			blendDst: OneFactor
		});
		this.composite = new ShaderMaterial({
			uniforms: {
				tScene: { value: null },
				tBloom: { value: null },
				uResolution: { value: new Vector2() },
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
				uVignette: { value: 0.5 },
				uAberration: { value: 0.004 }
			},
			vertexShader: fullscreenVert,
			fragmentShader: compositeFrag,
			depthTest: false,
			depthWrite: false
		});
		this.quad = new Mesh(fullscreenTriangle(), this.down);
		this.quad.frustumCulled = false;
		this.quadScene.add(this.quad);
	}

	setSize(width: number, height: number): void {
		this.size.set(width, height);
		this.sceneRT.setSize(width, height);
		let w = width;
		let h = height;
		for (const m of this.mips) {
			w = Math.max(1, Math.floor(w / 2));
			h = Math.max(1, Math.floor(h / 2));
			m.setSize(w, h);
		}
	}

	setGrade(g: Grade): void {
		const u = this.composite.uniforms;
		u.uExposure.value = g.exposure;
		u.uLift.value.set(g.lift.r, g.lift.g, g.lift.b);
		u.uGamma.value.set(g.gamma.r, g.gamma.g, g.gamma.b);
		u.uGain.value.set(g.gain.r, g.gain.g, g.gain.b);
		u.uSaturation.value = g.saturation;
		u.uContrast.value = g.contrast;
		u.uBloom.value = g.bloom;
		u.uHalation.value = g.halation;
		u.uGrain.value = g.grain;
		u.uVignette.value = g.vignette;
		u.uAberration.value = g.aberration;
	}

	private pass(material: ShaderMaterial, target: WebGLRenderTarget | null): void {
		this.quad.material = material;
		this.renderer.setRenderTarget(target);
		this.renderer.render(this.quadScene, this.quadCam);
	}

	render(scene: Scene, camera: Camera, time: number, fade: number, canvasSize: Vector2): void {
		const r = this.renderer;
		r.setRenderTarget(this.sceneRT);
		r.setClearColor(0x000000, 1);
		r.clear();
		r.render(scene, camera);

		let src = this.sceneRT.texture;
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
		r.autoClear = false;
		for (let i = this.levels - 1; i > 0; i--) {
			const lower = this.mips[i];
			this.up.uniforms.tSrc.value = lower.texture;
			this.up.uniforms.uTexel.value.set(1 / lower.width, 1 / lower.height);
			this.up.uniforms.uRadius.value = 1;
			this.up.uniforms.uWeight.value = 1;
			this.pass(this.up, this.mips[i - 1]);
		}
		r.autoClear = true;

		const u = this.composite.uniforms;
		u.tScene.value = this.sceneRT.texture;
		u.tBloom.value = this.mips[0].texture;
		u.uResolution.value.copy(canvasSize);
		u.uTime.value = time;
		u.uFade.value = fade;
		this.pass(this.composite, null);
	}

	dispose(): void {
		this.sceneRT.dispose();
		this.mips.forEach((m) => m.dispose());
		this.down.dispose();
		this.up.dispose();
		this.composite.dispose();
		this.quad.geometry.dispose();
	}
}

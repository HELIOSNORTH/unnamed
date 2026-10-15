import {
	BufferGeometry,
	DepthTexture,
	Float32BufferAttribute,
	FloatType,
	LinearFilter,
	Mesh,
	NearestFilter,
	RedFormat,
	Scene as ThreeScene,
	OrthographicCamera,
	ShaderMaterial,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	type Material,
	type Object3D,
	type Scene,
	type WebGLRenderer
} from 'three';
import type { AtmosphereUniforms } from './atmosphere.ts';
import { ribbonVertex } from './materials.ts';

export interface ShadowSettings {
	center: Vector3;
	radius: number;
	depth: number;
	lightAngle: number;
}

const SIZE = 4096;
const ESM_K = 700;
const VOLUME_SIZE = 512;

const blurFrag = /* glsl */ `
	uniform sampler2D tSrc;
	uniform vec2 uStep;
	uniform float uK;
	varying vec2 vUv;
	void main() {
		float d0 = texture2D(tSrc, vUv).r;
		float sum = 0.0;
		float wsum = 0.0;
		for (int i = -6; i <= 6; i++) {
			float w = exp(-float(i * i) / 18.0);
			float d = texture2D(tSrc, vUv + uStep * float(i)).r;
			sum += w * exp(uK * (d - d0));
			wsum += w;
		}
		gl_FragColor = vec4(d0 + log(sum / wsum) / uK, 0.0, 0.0, 1.0);
	}
`;

export class ShadowMap {
	private target = new WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true, depthTexture: new DepthTexture(SIZE, SIZE) });
	private camera = new OrthographicCamera(-1, 1, 1, -1, 0.5, 1000);
	private surface = new ShaderMaterial({
		vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
		fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }'
	});
	private ribbon = new ShaderMaterial({
		uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uMinPx: { value: 1.0 }, uResolution: { value: new Vector2(SIZE, SIZE) } },
		vertexShader: ribbonVertex,
		fragmentShader: /* glsl */ `
			varying float vEdge;
			varying float vHalf;
			void main() {
				if (vHalf + 0.5 - abs(vEdge) < 0.5) discard;
				gl_FragColor = vec4(1.0);
			}
		`
	});

	private esmA: WebGLRenderTarget;
	private esmB: WebGLRenderTarget;
	private volA: WebGLRenderTarget;
	private volB: WebGLRenderTarget;
	private blur = new ShaderMaterial({
		uniforms: { tSrc: { value: null }, uStep: { value: new Vector2() }, uK: { value: ESM_K } },
		vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
		fragmentShader: blurFrag,
		depthTest: false,
		depthWrite: false
	});
	private quadScene = new ThreeScene();
	private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

	constructor(linearFloat: boolean) {
		const d = this.target.depthTexture!;
		d.minFilter = NearestFilter;
		d.magFilter = NearestFilter;
		const filter = linearFloat ? LinearFilter : NearestFilter;
		const opts = { type: FloatType, format: RedFormat, minFilter: filter, magFilter: filter, depthBuffer: false };
		this.esmA = new WebGLRenderTarget(SIZE, SIZE, opts);
		this.esmB = new WebGLRenderTarget(SIZE, SIZE, opts);
		this.volA = new WebGLRenderTarget(VOLUME_SIZE, VOLUME_SIZE, opts);
		this.volB = new WebGLRenderTarget(VOLUME_SIZE, VOLUME_SIZE, opts);
		const geo = new BufferGeometry();
		geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
		geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
		const quad = new Mesh(geo, this.blur);
		quad.frustumCulled = false;
		this.quadScene.add(quad);
	}

	render(renderer: WebGLRenderer, scene: Scene, atmos: AtmosphereUniforms, s: ShadowSettings): void {
		const dir = (atmos.uSunDir.value as Vector3).clone().normalize();
		const cam = this.camera;
		cam.left = -s.radius;
		cam.right = s.radius;
		cam.top = s.radius;
		cam.bottom = -s.radius;
		cam.near = 1;
		cam.far = s.depth;
		cam.position.copy(s.center).addScaledVector(dir, s.depth * 0.5);
		cam.up.set(0, 1, 0);
		if (Math.abs(dir.y) > 0.99) cam.up.set(1, 0, 0);
		cam.lookAt(s.center);
		cam.updateProjectionMatrix();
		cam.updateMatrixWorld();

		const swapped: [Mesh, Material | Material[], boolean][] = [];
		scene.traverse((o: Object3D) => {
			const m = o as Mesh;
			if (!m.isMesh && !(o as unknown as { isPoints?: boolean }).isPoints) return;
			const data = (m.material as Material | undefined)?.userData;
			const kind = data?.shadow as string | undefined;
			swapped.push([m, m.material, m.visible]);
			if (kind === 'surface') m.material = this.surface;
			else if (kind === 'ribbon') m.material = this.ribbon;
			else if (kind === 'custom' && data?.depthMaterial) m.material = data.depthMaterial as Material;
			else m.visible = false;
		});
		this.ribbon.uniforms.uTime.value = atmos.uTime.value;
		renderer.setRenderTarget(this.target);
		renderer.clear();
		renderer.render(scene, cam);
		renderer.setRenderTarget(null);
		for (const [m, mat, vis] of swapped) {
			m.material = mat;
			m.visible = vis;
		}

		const texelWorld = (2 * s.radius) / SIZE;
		const penumbraTexels = Math.min(Math.max((s.lightAngle * 120) / texelWorld, 1), 60);
		const step = penumbraTexels / 6 / SIZE;
		this.blur.uniforms.tSrc.value = this.target.depthTexture;
		this.blur.uniforms.uStep.value.set(step, 0);
		renderer.setRenderTarget(this.esmA);
		renderer.render(this.quadScene, this.quadCam);
		this.blur.uniforms.tSrc.value = this.esmA.texture;
		this.blur.uniforms.uStep.value.set(0, step);
		renderer.setRenderTarget(this.esmB);
		renderer.render(this.quadScene, this.quadCam);
		const volStep = 0.5 / VOLUME_SIZE;
		this.blur.uniforms.tSrc.value = this.esmB.texture;
		this.blur.uniforms.uStep.value.set(volStep, 0);
		renderer.setRenderTarget(this.volA);
		renderer.render(this.quadScene, this.quadCam);
		this.blur.uniforms.tSrc.value = this.volA.texture;
		this.blur.uniforms.uStep.value.set(0, volStep);
		renderer.setRenderTarget(this.volB);
		renderer.render(this.quadScene, this.quadCam);
		renderer.setRenderTarget(null);

		atmos.uShadowMap.value = this.esmB.texture;
		atmos.uShadowVol.value = this.volB.texture;
		atmos.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
		atmos.uShadowParams.value.set(1, ESM_K, 0.0002 + 1 / s.depth, 1 / SIZE);
	}

	dispose(): void {
		this.target.dispose();
		this.esmA.dispose();
		this.esmB.dispose();
		this.volA.dispose();
		this.volB.dispose();
		this.blur.dispose();
		this.surface.dispose();
		this.ribbon.dispose();
	}
}

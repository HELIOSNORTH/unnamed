import {
	DepthTexture,
	Mesh,
	NearestFilter,
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

	constructor() {
		const d = this.target.depthTexture!;
		d.minFilter = NearestFilter;
		d.magFilter = NearestFilter;
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
			const kind = (m.material as Material | undefined)?.userData?.shadow as string | undefined;
			swapped.push([m, m.material, m.visible]);
			if (kind === 'surface') m.material = this.surface;
			else if (kind === 'ribbon') m.material = this.ribbon;
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

		atmos.uShadowMap.value = this.target.depthTexture;
		atmos.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
		const texel = 1 / SIZE;
		const uvPerDepth = (s.depth * Math.tan(s.lightAngle)) / (2 * s.radius);
		atmos.uShadowParams.value.set(1, uvPerDepth, 0.0004 + 2 / s.depth, texel);
	}

	dispose(): void {
		this.target.dispose();
		this.surface.dispose();
		this.ribbon.dispose();
	}
}

import {
	BufferGeometry,
	Float32BufferAttribute,
	LinearFilter,
	Mesh,
	OrthographicCamera,
	RepeatWrapping,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	UnsignedByteType,
	WebGL3DRenderTarget,
	type Data3DTexture,
	type WebGLRenderer
} from 'three';

const frag = /* glsl */ `
	uniform float uLayer;
	uniform float uSize;
	varying vec2 vUv;

	vec3 hash33(vec3 p) {
		p = fract(p * vec3(0.1031, 0.1030, 0.0973));
		p += dot(p, p.yxz + 33.33);
		return fract((p.xxy + p.yxx) * p.zyx);
	}

	float perlin(vec3 p, float period) {
		vec3 i = floor(p);
		vec3 f = fract(p);
		vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
		float acc[8];
		for (int k = 0; k < 8; k++) {
			vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
			vec3 g = normalize(hash33(mod(i + o, period) + 7.0) * 2.0 - 1.0);
			acc[k] = dot(g, f - o);
		}
		float x0 = mix(acc[0], acc[1], u.x);
		float x1 = mix(acc[2], acc[3], u.x);
		float x2 = mix(acc[4], acc[5], u.x);
		float x3 = mix(acc[6], acc[7], u.x);
		return mix(mix(x0, x1, u.y), mix(x2, x3, u.y), u.z) * 0.9 + 0.5;
	}

	float worley(vec3 p, float period) {
		vec3 i = floor(p);
		vec3 f = fract(p);
		float best = 9.0;
		for (int z = -1; z <= 1; z++)
			for (int y = -1; y <= 1; y++)
				for (int x = -1; x <= 1; x++) {
					vec3 o = vec3(float(x), float(y), float(z));
					vec3 c = hash33(mod(i + o, period) + 19.0);
					vec3 d = o + c - f;
					best = min(best, dot(d, d));
				}
		return sqrt(best);
	}

	float cloud(vec3 uvw, float base) {
		float f = perlin(uvw * base, base) * 0.5 + perlin(uvw * base * 2.0, base * 2.0) * 0.27 + perlin(uvw * base * 4.0, base * 4.0) * 0.15 + perlin(uvw * base * 8.0, base * 8.0) * 0.08;
		float w = worley(uvw * base, base) * 0.65 + worley(uvw * base * 2.0, base * 2.0) * 0.35;
		return clamp(f * 0.55 + (1.0 - min(w * 0.85, 1.0)) * 0.45, 0.0, 1.0);
	}

	void main() {
		vec3 uvw = vec3(vUv, (uLayer + 0.5) / uSize);
		float a = cloud(uvw, 4.0);
		float b = cloud(uvw + 0.37, 12.0);
		float c = perlin(uvw * 4.0 + 1.3, 4.0) * 0.65 + perlin(uvw * 8.0 + 1.3, 8.0) * 0.35;
		float d = perlin(uvw * 4.0 + 5.9, 4.0) * 0.65 + perlin(uvw * 8.0 + 5.9, 8.0) * 0.35;
		gl_FragColor = vec4(a, b, c, d);
	}
`;

export function createCloudNoise(renderer: WebGLRenderer, size = 128): { texture: Data3DTexture; dispose: () => void } {
	const target = new WebGL3DRenderTarget(size, size, size, { depthBuffer: false, format: RGBAFormat, type: UnsignedByteType });
	const tex = target.texture;
	tex.minFilter = LinearFilter;
	tex.magFilter = LinearFilter;
	tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
	const material = new ShaderMaterial({
		uniforms: { uLayer: { value: 0 }, uSize: { value: size } },
		vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
		fragmentShader: frag,
		depthTest: false,
		depthWrite: false
	});
	const geo = new BufferGeometry();
	geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
	geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
	const quad = new Mesh(geo, material);
	quad.frustumCulled = false;
	const scene = new Scene();
	scene.add(quad);
	const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const previous = renderer.getRenderTarget();
	for (let layer = 0; layer < size; layer++) {
		material.uniforms.uLayer.value = layer;
		renderer.setRenderTarget(target, layer);
		renderer.render(scene, cam);
	}
	renderer.setRenderTarget(previous);
	material.dispose();
	geo.dispose();
	return { texture: tex as unknown as Data3DTexture, dispose: () => target.dispose() };
}

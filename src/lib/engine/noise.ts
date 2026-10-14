export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hash2(ix: number, iy: number, seed: number): number {
	let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function gradDot(ix: number, iy: number, fx: number, fy: number, seed: number): number {
	const a = hash2(ix, iy, seed) * Math.PI * 2;
	return Math.cos(a) * fx + Math.sin(a) * fy;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function noise2(x: number, y: number, seed = 0): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const u = fade(fx);
	const v = fade(fy);
	const a = gradDot(ix, iy, fx, fy, seed);
	const b = gradDot(ix + 1, iy, fx - 1, fy, seed);
	const c = gradDot(ix, iy + 1, fx, fy - 1, seed);
	const d = gradDot(ix + 1, iy + 1, fx - 1, fy - 1, seed);
	return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.4;
}

export function noise1(x: number, seed = 0): number {
	return noise2(x, 0.5, seed);
}

export function fbm(x: number, y: number, octaves = 5, seed = 0, lacunarity = 2.03, gain = 0.5): number {
	let sum = 0;
	let amp = 0.5;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += amp * noise2(x, y, seed + i * 17);
		norm += amp;
		const rx = x * 0.8 - y * 0.6;
		const ry = x * 0.6 + y * 0.8;
		x = rx * lacunarity;
		y = ry * lacunarity;
		amp *= gain;
	}
	return sum / norm;
}

export function ridged(x: number, y: number, octaves = 6, seed = 0): number {
	let sum = 0;
	let amp = 0.5;
	let weight = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		let n = 1 - Math.abs(noise2(x, y, seed + i * 31));
		n *= n;
		n *= weight;
		weight = Math.min(1, Math.max(0, n * 1.6));
		sum += n * amp;
		norm += amp;
		const rx = x * 0.8 - y * 0.6;
		const ry = x * 0.6 + y * 0.8;
		x = rx * 2.07;
		y = ry * 2.07;
		amp *= 0.5;
	}
	return sum / norm;
}

export function worley(x: number, y: number, seed = 0): { f1: number; id: number } {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	let f1 = 9;
	let id = 0;
	for (let j = -1; j <= 1; j++) {
		for (let i = -1; i <= 1; i++) {
			const cx = ix + i;
			const cy = iy + j;
			const px = cx + hash2(cx, cy, seed) * 0.8 + 0.1;
			const py = cy + hash2(cx, cy, seed + 7) * 0.8 + 0.1;
			const d = Math.hypot(px - x, py - y);
			if (d < f1) {
				f1 = d;
				id = hash2(cx, cy, seed + 3);
			}
		}
	}
	return { f1, id };
}

export const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { mulberry32 } from './noise.ts';

function lattice(n: number, seed: number): Float32Array {
	const rand = mulberry32(seed);
	const out = new Float32Array(n * n * n);
	for (let i = 0; i < out.length; i++) out[i] = rand();
	return out;
}

function valueOctave(size: number, period: number, seed: number): Float32Array {
	const lat = lattice(period, seed);
	const out = new Float32Array(size ** 3);
	const s = period / size;
	const at = (x: number, y: number, z: number) => lat[(((z % period) * period + (y % period)) * period) + (x % period)];
	const fade = (t: number) => t * t * (3 - 2 * t);
	let k = 0;
	for (let z = 0; z < size; z++) {
		const fz = z * s;
		const iz = Math.floor(fz);
		const wz = fade(fz - iz);
		for (let y = 0; y < size; y++) {
			const fy = y * s;
			const iy = Math.floor(fy);
			const wy = fade(fy - iy);
			for (let x = 0; x < size; x++) {
				const fx = x * s;
				const ix = Math.floor(fx);
				const wx = fade(fx - ix);
				const c00 = at(ix, iy, iz) + (at(ix + 1, iy, iz) - at(ix, iy, iz)) * wx;
				const c10 = at(ix, iy + 1, iz) + (at(ix + 1, iy + 1, iz) - at(ix, iy + 1, iz)) * wx;
				const c01 = at(ix, iy, iz + 1) + (at(ix + 1, iy, iz + 1) - at(ix, iy, iz + 1)) * wx;
				const c11 = at(ix, iy + 1, iz + 1) + (at(ix + 1, iy + 1, iz + 1) - at(ix, iy + 1, iz + 1)) * wx;
				const c0 = c00 + (c10 - c00) * wy;
				const c1 = c01 + (c11 - c01) * wy;
				out[k++] = c0 + (c1 - c0) * wz;
			}
		}
	}
	return out;
}

function worleyOctave(size: number, cells: number, seed: number): Float32Array {
	const rand = mulberry32(seed);
	const pts = new Float32Array(cells ** 3 * 3);
	for (let i = 0; i < pts.length; i++) pts[i] = rand();
	const out = new Float32Array(size ** 3);
	const s = cells / size;
	let k = 0;
	for (let z = 0; z < size; z++) {
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const px = x * s;
				const py = y * s;
				const pz = z * s;
				const cx = Math.floor(px);
				const cy = Math.floor(py);
				const cz = Math.floor(pz);
				let best = 9;
				for (let dz = -1; dz <= 1; dz++) {
					for (let dy = -1; dy <= 1; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							const gx = cx + dx;
							const gy = cy + dy;
							const gz = cz + dz;
							const wx = ((gx % cells) + cells) % cells;
							const wy = ((gy % cells) + cells) % cells;
							const wz = ((gz % cells) + cells) % cells;
							const o = ((wz * cells + wy) * cells + wx) * 3;
							const ddx = gx + pts[o] - px;
							const ddy = gy + pts[o + 1] - py;
							const ddz = gz + pts[o + 2] - pz;
							best = Math.min(best, ddx * ddx + ddy * ddy + ddz * ddz);
						}
					}
				}
				out[k++] = Math.sqrt(best);
			}
		}
	}
	return out;
}

export function createCloudNoise(size = 64): Data3DTexture {
	const a = valueOctave(size, 4, 11);
	const b = valueOctave(size, 8, 12);
	const c = valueOctave(size, 16, 13);
	const d = valueOctave(size, 32, 14);
	const w = worleyOctave(size, 6, 15);
	const data = new Uint8Array(size ** 3);
	for (let i = 0; i < data.length; i++) {
		const fbm = a[i] * 0.45 + b[i] * 0.28 + c[i] * 0.17 + d[i] * 0.1;
		const billow = 1 - Math.min(w[i] * 1.1, 1);
		const v = fbm * 0.6 + billow * 0.4;
		data[i] = Math.round(Math.min(Math.max(v, 0), 1) * 255);
	}
	const tex = new Data3DTexture(data, size, size, size);
	tex.format = RedFormat;
	tex.type = UnsignedByteType;
	tex.minFilter = LinearFilter;
	tex.magFilter = LinearFilter;
	tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
	tex.unpackAlignment = 1;
	tex.needsUpdate = true;
	return tex;
}

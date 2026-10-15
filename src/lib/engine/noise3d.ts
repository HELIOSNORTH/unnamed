import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { mulberry32 } from './noise.ts';

function gradientOctave(size: number, period: number, seed: number): Float32Array {
	const rand = mulberry32(seed);
	const n = period ** 3;
	const gx = new Float32Array(n);
	const gy = new Float32Array(n);
	const gz = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const u = rand() * 2 - 1;
		const t = rand() * Math.PI * 2;
		const r = Math.sqrt(1 - u * u);
		gx[i] = r * Math.cos(t);
		gy[i] = r * Math.sin(t);
		gz[i] = u;
	}
	const out = new Float32Array(size ** 3);
	const s = period / size;
	const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
	const dot = (ix: number, iy: number, iz: number, fx: number, fy: number, fz: number) => {
		const k = ((iz % period) * period + (iy % period)) * period + (ix % period);
		return gx[k] * fx + gy[k] * fy + gz[k] * fz;
	};
	let k = 0;
	for (let z = 0; z < size; z++) {
		const pz = z * s;
		const iz = Math.floor(pz);
		const fz = pz - iz;
		const wz = fade(fz);
		for (let y = 0; y < size; y++) {
			const py = y * s;
			const iy = Math.floor(py);
			const fy = py - iy;
			const wy = fade(fy);
			for (let x = 0; x < size; x++) {
				const px = x * s;
				const ix = Math.floor(px);
				const fx = px - ix;
				const wx = fade(fx);
				const c000 = dot(ix, iy, iz, fx, fy, fz);
				const c100 = dot(ix + 1, iy, iz, fx - 1, fy, fz);
				const c010 = dot(ix, iy + 1, iz, fx, fy - 1, fz);
				const c110 = dot(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz);
				const c001 = dot(ix, iy, iz + 1, fx, fy, fz - 1);
				const c101 = dot(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1);
				const c011 = dot(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1);
				const c111 = dot(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1);
				const x00 = c000 + (c100 - c000) * wx;
				const x10 = c010 + (c110 - c010) * wx;
				const x01 = c001 + (c101 - c001) * wx;
				const x11 = c011 + (c111 - c011) * wx;
				const y0 = x00 + (x10 - x00) * wy;
				const y1 = x01 + (x11 - x01) * wy;
				out[k++] = (y0 + (y1 - y0) * wz) * 0.9 + 0.5;
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

export function createCloudNoise(size = 96): Data3DTexture {
	const a = gradientOctave(size, 4, 11);
	const b = gradientOctave(size, 8, 12);
	const c = gradientOctave(size, 12, 13);
	const d = gradientOctave(size, 24, 14);
	const w1 = worleyOctave(size, 4, 15);
	const w2 = worleyOctave(size, 8, 16);
	const data = new Uint8Array(size ** 3);
	for (let i = 0; i < data.length; i++) {
		const fbm = a[i] * 0.5 + b[i] * 0.27 + c[i] * 0.15 + d[i] * 0.08;
		const billow = 1 - Math.min(w1[i] * 0.85 * 0.65 + w2[i] * 0.85 * 0.35, 1);
		const v = fbm * 0.55 + billow * 0.45;
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

import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { mulberry32 } from './noise.ts';

export type HeightFn = (x: number, z: number) => number;

function finishTerrain(positions: Float32Array, indices: Uint32Array, shade?: Float32Array): BufferGeometry {
	const g = new BufferGeometry();
	g.setAttribute('position', new BufferAttribute(positions, 3));
	g.setIndex(new BufferAttribute(indices, 1));
	g.computeVertexNormals();
	if (shade) g.setAttribute('aShade', new BufferAttribute(shade, 1));
	g.computeBoundingSphere();
	return g;
}

function gridIndices(cols: number, rows: number, flip = false): Uint32Array {
	const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
	let k = 0;
	for (let j = 0; j < rows - 1; j++) {
		for (let i = 0; i < cols - 1; i++) {
			const a = j * cols + i;
			const b = a + 1;
			const c = a + cols;
			const d = c + 1;
			if (flip) {
				idx[k++] = a;
				idx[k++] = b;
				idx[k++] = c;
				idx[k++] = b;
				idx[k++] = d;
				idx[k++] = c;
			} else {
				idx[k++] = a;
				idx[k++] = c;
				idx[k++] = b;
				idx[k++] = b;
				idx[k++] = c;
				idx[k++] = d;
			}
		}
	}
	return idx;
}

export interface PolarTerrainOptions {
	center: [number, number];
	yaw?: number;
	span: number;
	rMin: number;
	rMax: number;
	rings: number;
	segments: number;
	height: HeightFn;
	shadow?: { dir: Vector3; maxDist: number; steps: number };
}

export function polarTerrain(o: PolarTerrainOptions): BufferGeometry {
	const cols = o.segments + 1;
	const rows = o.rings;
	const pos = new Float32Array(cols * rows * 3);
	const yaw = o.yaw ?? 0;
	const ratio = o.rMax / o.rMin;
	let k = 0;
	for (let j = 0; j < rows; j++) {
		const r = o.rMin * Math.pow(ratio, j / (rows - 1));
		for (let i = 0; i < cols; i++) {
			const th = yaw + (i / (cols - 1) - 0.5) * o.span;
			const x = o.center[0] + Math.sin(th) * r;
			const z = o.center[1] - Math.cos(th) * r;
			pos[k++] = x;
			pos[k++] = o.height(x, z);
			pos[k++] = z;
		}
	}
	return finishTerrain(pos, gridIndices(cols, rows, true), o.shadow ? bakeShadow(pos, o.height, o.shadow) : undefined);
}

export interface GridTerrainOptions {
	x: [number, number];
	z: [number, number];
	step: number;
	height: HeightFn;
}

export function gridTerrain(o: GridTerrainOptions): BufferGeometry {
	const cols = Math.round((o.x[1] - o.x[0]) / o.step) + 1;
	const rows = Math.round((o.z[1] - o.z[0]) / o.step) + 1;
	const pos = new Float32Array(cols * rows * 3);
	let k = 0;
	for (let j = 0; j < rows; j++) {
		const z = o.z[0] + j * o.step;
		for (let i = 0; i < cols; i++) {
			const x = o.x[0] + i * o.step;
			pos[k++] = x;
			pos[k++] = o.height(x, z);
			pos[k++] = z;
		}
	}
	return finishTerrain(pos, gridIndices(cols, rows));
}

function bakeShadow(pos: Float32Array, height: HeightFn, s: { dir: Vector3; maxDist: number; steps: number }): Float32Array {
	const count = pos.length / 3;
	const d = s.dir.clone().normalize();
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	let maxY = -Infinity;
	for (let v = 0; v < count; v++) {
		minX = Math.min(minX, pos[v * 3]);
		maxX = Math.max(maxX, pos[v * 3]);
		maxY = Math.max(maxY, pos[v * 3 + 1]);
		minZ = Math.min(minZ, pos[v * 3 + 2]);
		maxZ = Math.max(maxZ, pos[v * 3 + 2]);
	}
	const N = 512;
	const cellX = (maxX - minX) / (N - 1);
	const cellZ = (maxZ - minZ) / (N - 1);
	const grid = new Float32Array(N * N);
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[j * N + i] = height(minX + i * cellX, minZ + j * cellZ);
	const sample = (x: number, z: number) => {
		const fx = Math.min(Math.max((x - minX) / cellX, 0), N - 1.001);
		const fz = Math.min(Math.max((z - minZ) / cellZ, 0), N - 1.001);
		const i = Math.floor(fx);
		const j = Math.floor(fz);
		const u = fx - i;
		const w = fz - j;
		const a = grid[j * N + i];
		const b = grid[j * N + i + 1];
		const c = grid[(j + 1) * N + i];
		const e = grid[(j + 1) * N + i + 1];
		return (a + (b - a) * u) * (1 - w) + (c + (e - c) * u) * w;
	};
	const out = new Float32Array(count);
	const step0 = Math.max(cellX, cellZ) * 0.5;
	for (let v = 0; v < count; v++) {
		const x = pos[v * 3];
		const y = pos[v * 3 + 1] + 2;
		const z = pos[v * 3 + 2];
		let lit = 1;
		let t = step0;
		for (let k = 0; k < s.steps && t < s.maxDist; k++) {
			const py = y + d.y * t;
			if (py > maxY) break;
			const margin = py - sample(x + d.x * t, z + d.z * t);
			if (margin < 0) {
				lit = 0;
				break;
			}
			lit = Math.min(lit, (margin / t) * 12);
			t = t * 1.1 + step0;
		}
		out[v] = Math.max(0, Math.min(1, lit));
	}
	return out;
}

export interface Segment {
	a: Vector3;
	b: Vector3;
	r: number;
	flexA?: number;
	flexB?: number;
}

export function ribbonGeometry(segs: Segment[]): BufferGeometry {
	const n = segs.length;
	const start = new Float32Array(n * 12);
	const end = new Float32Array(n * 12);
	const side = new Float32Array(n * 8);
	const radius = new Float32Array(n * 4);
	const flex = new Float32Array(n * 8);
	const idx = new Uint32Array(n * 6);
	const corners = [
		[0, -1],
		[0, 1],
		[1, -1],
		[1, 1]
	];
	segs.forEach((s, i) => {
		for (let c = 0; c < 4; c++) {
			const v = i * 4 + c;
			start.set([s.a.x, s.a.y, s.a.z], v * 3);
			end.set([s.b.x, s.b.y, s.b.z], v * 3);
			side.set(corners[c], v * 2);
			radius[v] = s.r;
			flex.set([s.flexA ?? 0, s.flexB ?? 0], v * 2);
		}
		const v = i * 4;
		idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
	});
	const g = new BufferGeometry();
	g.setAttribute('position', new Float32BufferAttribute(start, 3));
	g.setAttribute('aStart', new Float32BufferAttribute(start, 3));
	g.setAttribute('aEnd', new Float32BufferAttribute(end, 3));
	g.setAttribute('aSide', new Float32BufferAttribute(side, 2));
	g.setAttribute('aRadius', new Float32BufferAttribute(radius, 1));
	g.setAttribute('aFlex', new Float32BufferAttribute(flex, 2));
	g.setIndex(new BufferAttribute(idx, 1));
	return g;
}

export function catenary(a: Vector3, b: Vector3, sag: number, r: number, pieces = 24): Segment[] {
	const out: Segment[] = [];
	let prev = a.clone();
	for (let i = 1; i <= pieces; i++) {
		const t = i / pieces;
		const p = a.clone().lerp(b, t);
		p.y -= sag * 4 * t * (1 - t);
		out.push({ a: prev, b: p, r });
		prev = p;
	}
	return out;
}

export interface LatticeOptions {
	base: Vector3;
	height: number;
	baseWidth: number;
	topWidth: number;
	sections: number;
	legs?: 3 | 4;
	legRadius: number;
	braceRadius: number;
	rotation?: number;
	taperPower?: number;
}

export interface Lattice {
	segments: Segment[];
	widthAt: (h: number) => number;
	cornerAt: (h: number, leg: number) => Vector3;
}

export function latticeTower(o: LatticeOptions): Lattice {
	const legs = o.legs ?? 4;
	const rot = o.rotation ?? 0;
	const tp = o.taperPower ?? 1;
	const widthAt = (h: number) => o.topWidth + (o.baseWidth - o.topWidth) * Math.pow(1 - h / o.height, tp);
	const cornerAt = (h: number, leg: number) => {
		const w = widthAt(h);
		const ang = rot + (leg / legs) * Math.PI * 2 + (legs === 4 ? Math.PI / 4 : 0);
		const rad = legs === 4 ? w / Math.SQRT2 : w / Math.sqrt(3);
		return new Vector3(o.base.x + Math.cos(ang) * rad, o.base.y + h, o.base.z + Math.sin(ang) * rad);
	};
	const segments: Segment[] = [];
	const levels: number[] = [];
	for (let i = 0; i <= o.sections; i++) {
		const t = i / o.sections;
		levels.push(o.height * (1 - Math.pow(1 - t, 1.25)));
	}
	for (let s = 0; s < o.sections; s++) {
		const h0 = levels[s];
		const h1 = levels[s + 1];
		for (let l = 0; l < legs; l++) {
			const a0 = cornerAt(h0, l);
			const a1 = cornerAt(h1, l);
			const b0 = cornerAt(h0, (l + 1) % legs);
			const b1 = cornerAt(h1, (l + 1) % legs);
			segments.push({ a: a0, b: a1, r: o.legRadius });
			segments.push({ a: a0, b: b1, r: o.braceRadius });
			segments.push({ a: b0, b: a1, r: o.braceRadius });
			segments.push({ a: a1, b: b1, r: o.braceRadius });
		}
	}
	return { segments, widthAt, cornerAt };
}

export interface BranchOptions {
	root: Vector3;
	height: number;
	spread: number;
	depth: number;
	seed: number;
	radius: number;
	children?: number;
	upBias?: number;
}

export function branchingPlant(o: BranchOptions): Segment[] {
	const rand = mulberry32(o.seed);
	const out: Segment[] = [];
	const kids = o.children ?? 3;
	const up = o.upBias ?? 0.6;
	const grow = (p: Vector3, dir: Vector3, len: number, r: number, level: number) => {
		const end = p.clone().addScaledVector(dir, len);
		const fa = Math.pow(Math.max(p.y - o.root.y, 0) / o.height, 1.4);
		const fb = Math.pow(Math.max(end.y - o.root.y, 0) / o.height, 1.4);
		out.push({ a: p, b: end, r, flexA: fa, flexB: fb });
		if (level >= o.depth) return;
		const n = kids - (rand() < 0.3 ? 1 : 0) + (rand() < 0.2 ? 1 : 0);
		for (let i = 0; i < n; i++) {
			const nd = dir
				.clone()
				.add(new Vector3((rand() - 0.5) * o.spread, (rand() - 0.2) * o.spread * 0.6, (rand() - 0.5) * o.spread))
				.add(new Vector3(0, up * 0.4, 0))
				.normalize();
			grow(end, nd, len * (0.62 + rand() * 0.2), r * 0.62, level + 1);
		}
	};
	const stems = 1 + Math.floor(rand() * 3);
	for (let s = 0; s < stems; s++) {
		const d = new Vector3((rand() - 0.5) * 0.6, 1, (rand() - 0.5) * 0.6).normalize();
		grow(o.root.clone(), d, o.height * 0.38, o.radius, 1);
	}
	return out;
}

export function pointsGeometry(pts: { p: Vector3; color: [number, number, number]; size: number; twinkle?: number }[]): BufferGeometry {
	const n = pts.length;
	const pos = new Float32Array(n * 3);
	const col = new Float32Array(n * 3);
	const size = new Float32Array(n);
	const tw = new Float32Array(n);
	pts.forEach((q, i) => {
		pos.set([q.p.x, q.p.y, q.p.z], i * 3);
		col.set(q.color, i * 3);
		size[i] = q.size;
		tw[i] = q.twinkle ?? 0;
	});
	const g = new BufferGeometry();
	g.setAttribute('position', new BufferAttribute(pos, 3));
	g.setAttribute('aColor', new BufferAttribute(col, 3));
	g.setAttribute('aSize', new BufferAttribute(size, 1));
	g.setAttribute('aTwinkle', new BufferAttribute(tw, 1));
	return g;
}

export function starField(count: number, seed: number, radius: number, brightness: number): BufferGeometry {
	const rand = mulberry32(seed);
	const pts: { p: Vector3; color: [number, number, number]; size: number; twinkle: number }[] = [];
	for (let i = 0; i < count; i++) {
		const u = rand() * 2 - 1;
		const th = rand() * Math.PI * 2;
		const s = Math.sqrt(1 - u * u);
		const dir = new Vector3(s * Math.cos(th), u, s * Math.sin(th));
		if (dir.y < -0.05) continue;
		const mag = Math.pow(rand(), 9);
		const temp = rand();
		const tint: [number, number, number] =
			temp < 0.15 ? [1.0, 0.72, 0.5] : temp < 0.35 ? [1.0, 0.9, 0.78] : temp < 0.8 ? [0.92, 0.95, 1.0] : [0.72, 0.82, 1.0];
		const b = brightness * (0.04 + mag * 3.2);
		pts.push({ p: dir.multiplyScalar(radius), color: [tint[0] * b, tint[1] * b, tint[2] * b], size: 2.2 + mag * 3.2, twinkle: 0.25 + rand() * 0.35 });
	}
	return pointsGeometry(pts);
}

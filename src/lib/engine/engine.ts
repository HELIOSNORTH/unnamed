import { PerspectiveCamera, Vector2, WebGLRenderer } from 'three';
import { applyLights } from './lights.ts';
import { disposeScene, type BuiltScene } from './kit.ts';
import { viewport } from './materials.ts';
import { noise1 } from './noise.ts';
import { Pipeline } from './post.ts';
import { HandheldRig } from './rig.ts';

export interface SceneEntry {
	build: () => BuiltScene;
}

export interface EngineStats {
	fps: number;
	frameMs: number;
	renderScale: number;
	drawCalls: number;
	triangles: number;
	geometries: number;
	textures: number;
	heapMb: number | null;
	buildMs: number;
}

const FADE_OUT_S = 1.1;
const FADE_IN_S = 2.6;

export class Engine {
	readonly renderer: WebGLRenderer;
	private camera = new PerspectiveCamera(30, 1, 0.5, 60000);
	private rig = new HandheldRig();
	private pipeline: Pipeline;
	private built = new Map<number, BuiltScene>();
	private current = -1;
	private pending = -1;
	private fade = 0;
	private phase: 'out' | 'in' | 'idle' = 'idle';
	private raf = 0;
	private last = 0;
	private time = 0;
	private canvasSize = new Vector2();
	private scale = 1;
	private maxScale = 1;
	private frameTimes: number[] = [];
	private lastStats: EngineStats | null = null;
	private adaptive = true;
	private lastBuildMs = 0;
	wind = 0;
	onSwap?: (index: number) => void;

	constructor(
		private canvas: HTMLCanvasElement,
		private entries: SceneEntry[]
	) {
		this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
		this.renderer.autoClear = true;
		this.renderer.info.autoReset = false;
		this.pipeline = new Pipeline(this.renderer);
		this.maxScale = Math.min(window.devicePixelRatio || 1, 2);
		this.scale = this.maxScale;
		canvas.addEventListener('webglcontextlost', (e) => {
			e.preventDefault();
			this.stop();
		});
		canvas.addEventListener('webglcontextrestored', () => location.reload());
		this.resize();
	}

	get index(): number {
		return this.pending >= 0 ? this.pending : this.current;
	}

	go(index: number): void {
		const n = this.entries.length;
		const i = ((index % n) + n) % n;
		if (i === this.index && this.phase !== 'out') return;
		if (this.current < 0) {
			this.swapTo(i);
			this.phase = 'in';
			return;
		}
		this.pending = i;
		this.phase = 'out';
	}

	private ensure(i: number): BuiltScene {
		let b = this.built.get(i);
		if (!b) {
			const t0 = performance.now();
			b = this.entries[i].build();
			this.lastBuildMs = performance.now() - t0;
			this.built.set(i, b);
		}
		return b;
	}

	jump(i: number, time: number): void {
		this.swapTo(i);
		this.phase = 'idle';
		this.fade = 1;
		this.time = time;
		this.adaptive = false;
	}

	prebuild(i: number): void {
		this.ensure(((i % this.entries.length) + this.entries.length) % this.entries.length);
	}

	private swapTo(i: number): void {
		this.current = i;
		this.pending = -1;
		const b = this.ensure(i);
		this.pipeline.setGrade(b.grade);
		this.rig.fit(this.camera, b.shot, this.canvasSize.x / this.canvasSize.y);
		this.onSwap?.(i);
	}

	resize(): void {
		const w = Math.max(1, this.canvas.clientWidth);
		const h = Math.max(1, this.canvas.clientHeight);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.maxScale = dpr;
		this.scale = Math.min(this.scale, dpr);
		this.canvasSize.set(Math.round(w * dpr), Math.round(h * dpr));
		this.renderer.setPixelRatio(1);
		this.renderer.setSize(this.canvasSize.x, this.canvasSize.y, false);
		this.applyScale();
		const b = this.current >= 0 ? this.built.get(this.current) : undefined;
		if (b) this.rig.fit(this.camera, b.shot, w / h);
	}

	private applyScale(): void {
		const k = this.scale / this.maxScale;
		const rw = Math.max(1, Math.round(this.canvasSize.x * k));
		const rh = Math.max(1, Math.round(this.canvasSize.y * k));
		this.pipeline.setSize(rw, rh);
		viewport.resolution.value.set(rw, rh);
		viewport.pxScale.value = rw / this.canvas.clientWidth;
	}

	start(): void {
		if (this.raf) return;
		this.last = performance.now();
		const loop = (now: number) => {
			this.raf = requestAnimationFrame(loop);
			this.frame(now);
		};
		this.raf = requestAnimationFrame(loop);
	}

	stop(): void {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	private adapt(dtMs: number): void {
		if (!this.adaptive) return;
		this.frameTimes.push(dtMs);
		if (this.frameTimes.length < 90) return;
		const sorted = [...this.frameTimes].sort((a, b) => a - b);
		const median = sorted[sorted.length >> 1];
		this.frameTimes.length = 0;
		if (median > 24 && this.scale > 0.5) {
			this.scale = Math.max(0.5, this.scale * 0.85);
			this.applyScale();
		} else if (median < 17.5 && this.scale < this.maxScale) {
			this.scale = Math.min(this.maxScale, this.scale * 1.05);
			this.applyScale();
		}
	}

	private frame(now: number): void {
		const dtMs = now - this.last;
		this.last = now;
		const dt = Math.min(dtMs / 1000, 0.1);
		this.time += dt;
		this.adapt(dtMs);
		this.recordStats(dtMs);
		this.renderer.info.reset();

		if (this.phase === 'out') {
			this.fade = Math.max(0, this.fade - dt / FADE_OUT_S);
			if (this.fade <= 0 && this.pending >= 0) {
				this.swapTo(this.pending);
				this.phase = 'in';
				return;
			}
		} else if (this.phase === 'in') {
			this.fade = Math.min(1, this.fade + dt / FADE_IN_S);
			if (this.fade >= 1) this.phase = 'idle';
		}
		if (this.current < 0) return;
		const b = this.built.get(this.current)!;
		const t = this.time;
		const w = b.windiness * (0.5 + 0.38 * noise1(t * 0.055, 1) + 0.22 * noise1(t * 0.16, 2) + 0.12 * noise1(t * 0.47, 3));
		this.wind = Math.min(Math.max(w, 0), 1.6);
		b.atmos.uTime.value = t;
		b.atmos.uWind.value = this.wind;
		const levels = applyLights(b.lights, b.atmos, t);
		b.update?.(t, levels);
		this.rig.update(this.camera, b.shot, t, this.wind);
		const eased = this.fade * this.fade * (3 - 2 * this.fade);
		this.pipeline.render(b.scene, this.camera, t, eased, this.canvasSize);
	}

	private recordStats(dtMs: number): void {
		const info = this.renderer.info;
		const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
		this.lastStats = {
			fps: 1000 / Math.max(dtMs, 1),
			frameMs: dtMs,
			renderScale: this.scale / this.maxScale,
			drawCalls: info.render.calls,
			triangles: info.render.triangles,
			geometries: info.memory.geometries,
			textures: info.memory.textures,
			heapMb: mem ? mem.usedJSHeapSize / 1048576 : null,
			buildMs: this.lastBuildMs
		};
	}

	stats(): EngineStats | null {
		return this.lastStats;
	}

	dispose(): void {
		this.stop();
		this.built.forEach((b) => disposeScene(b.scene));
		this.built.clear();
		this.pipeline.dispose();
		this.renderer.dispose();
	}
}

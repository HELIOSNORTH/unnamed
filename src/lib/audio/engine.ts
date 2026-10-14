import { makeNoiseBank, type Bus, type NoiseColor } from './voices.ts';
import { scapes, type Scape } from './scapes.ts';

const LOOKAHEAD_S = 0.6;
const FADE_OUT_S = 1.4;
const FADE_IN_S = 3;
const MASTER_GAIN = 4.6;

interface Active {
	id: string;
	bus: Bus;
	gain: GainNode;
	scape: Scape;
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
	const len = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(2, len, ctx.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch);
		let lp = 0;
		for (let i = 0; i < len; i++) {
			const t = i / ctx.sampleRate;
			const k = 0.9 - 0.75 * (t / seconds);
			lp = lp * (1 - k) + (Math.random() * 2 - 1) * k;
			const pre = Math.min(t / 0.02, 1);
			d[i] = lp * Math.exp(-t * decay) * pre;
		}
	}
	return buf;
}

export class SoundEngine {
	private ctx!: AudioContext;
	private master!: GainNode;
	private reverb!: ConvolverNode;
	private noise!: Record<NoiseColor, AudioBuffer>;
	private active: Active | null = null;
	private timer = 0;
	private muted = false;
	private analyser!: AnalyserNode;
	private probe = new Float32Array(2048);

	async start(sceneId: string): Promise<void> {
		this.ctx = new AudioContext({ latencyHint: 'playback' });
		const ctx = this.ctx;
		const limiter = ctx.createDynamicsCompressor();
		limiter.threshold.value = -12;
		limiter.knee.value = 10;
		limiter.ratio.value = 6;
		limiter.attack.value = 0.01;
		limiter.release.value = 0.4;
		this.master = ctx.createGain();
		this.master.gain.value = 0;
		this.master.connect(limiter).connect(ctx.destination);
		this.analyser = ctx.createAnalyser();
		this.analyser.fftSize = 2048;
		limiter.connect(this.analyser);
		this.reverb = ctx.createConvolver();
		this.reverb.buffer = impulse(ctx, 5.5, 0.85);
		const wet = ctx.createGain();
		wet.gain.value = 0.55;
		this.reverb.connect(wet).connect(this.master);
		this.noise = makeNoiseBank(ctx);
		await ctx.resume();
		this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_GAIN, ctx.currentTime, 1.2);
		this.setScene(sceneId);
		this.timer = window.setInterval(() => this.tick(), 120);
	}

	setScene(id: string): void {
		if (!this.ctx || this.active?.id === id) return;
		const ctx = this.ctx;
		const now = ctx.currentTime;
		const old = this.active;
		if (old) {
			old.gain.gain.cancelScheduledValues(now);
			old.gain.gain.setValueAtTime(old.gain.gain.value, now);
			old.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
			setTimeout(() => this.release(old), (FADE_OUT_S + 0.3) * 1000);
		}
		const build = scapes[id];
		if (!build) {
			this.active = null;
			return;
		}
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(this.master);
		const send = ctx.createGain();
		send.connect(this.reverb);
		const bus: Bus = { ctx, out: gain, send, noise: this.noise, sources: [], rand: Math.random };
		const scape = build(bus);
		const startAt = now + (old ? FADE_OUT_S * 0.8 : 0);
		gain.gain.setValueAtTime(0, startAt);
		gain.gain.linearRampToValueAtTime(scape.level, startAt + FADE_IN_S);
		this.active = { id, bus, gain, scape };
	}

	private release(a: Active): void {
		for (const s of a.bus.sources) {
			try {
				s.stop();
			} catch {
				continue;
			}
			s.disconnect();
		}
		a.bus.sources.length = 0;
		a.gain.disconnect();
		(a.bus.send as GainNode).disconnect();
	}

	private tick(): void {
		const a = this.active;
		if (!a || this.ctx.state !== 'running') return;
		const until = this.ctx.currentTime + LOOKAHEAD_S;
		for (const s of a.scape.scheduled) s.schedule(until);
	}

	setWind(w: number): void {
		const a = this.active;
		if (!a || !this.ctx) return;
		for (const v of a.scape.wind) v.setWind(w, this.ctx.currentTime);
	}

	setMuted(m: boolean): void {
		this.muted = m;
		if (!this.ctx) return;
		this.master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, this.ctx.currentTime, 0.25);
	}

	levelDb(): { rms: number; peak: number } | null {
		if (!this.analyser) return null;
		this.analyser.getFloatTimeDomainData(this.probe);
		let sum = 0;
		let peak = 0;
		for (const v of this.probe) {
			sum += v * v;
			peak = Math.max(peak, Math.abs(v));
		}
		const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-6));
		return { rms: db(Math.sqrt(sum / this.probe.length)), peak: db(peak) };
	}

	suspend(): void {
		this.ctx?.suspend();
	}

	resume(): void {
		this.ctx?.resume();
	}

	dispose(): void {
		clearInterval(this.timer);
		if (this.active) this.release(this.active);
		this.ctx?.close();
	}
}

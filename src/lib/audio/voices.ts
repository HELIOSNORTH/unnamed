export type NoiseColor = 'white' | 'pink' | 'brown';

export interface Bus {
	ctx: BaseAudioContext;
	out: AudioNode;
	send: AudioNode;
	noise: Record<NoiseColor, AudioBuffer>;
	sources: AudioScheduledSourceNode[];
	rand: () => number;
}

export interface Scheduled {
	schedule: (until: number) => void;
}

export interface WindDriven {
	setWind: (w: number, at: number) => void;
}

export function makeNoiseBank(ctx: BaseAudioContext, seconds = 6): Record<NoiseColor, AudioBuffer> {
	const len = Math.floor(ctx.sampleRate * seconds);
	const make = (fill: (d: Float32Array) => void) => {
		const b = ctx.createBuffer(1, len, ctx.sampleRate);
		fill(b.getChannelData(0));
		return b;
	};
	const white = make((d) => {
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	});
	const pink = make((d) => {
		let b0 = 0,
			b1 = 0,
			b2 = 0,
			b3 = 0,
			b4 = 0,
			b5 = 0,
			b6 = 0;
		for (let i = 0; i < d.length; i++) {
			const w = Math.random() * 2 - 1;
			b0 = 0.99886 * b0 + w * 0.0555179;
			b1 = 0.99332 * b1 + w * 0.0750759;
			b2 = 0.969 * b2 + w * 0.153852;
			b3 = 0.8665 * b3 + w * 0.3104856;
			b4 = 0.55 * b4 + w * 0.5329522;
			b5 = -0.7616 * b5 - w * 0.016898;
			d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
			b6 = w * 0.115926;
		}
	});
	const brown = make((d) => {
		let last = 0;
		for (let i = 0; i < d.length; i++) {
			last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
			d[i] = last * 3.5;
		}
	});
	for (const b of [white, pink, brown]) {
		const d = b.getChannelData(0);
		const fadeLen = Math.floor(ctx.sampleRate * 0.05);
		for (let i = 0; i < fadeLen; i++) {
			const k = i / fadeLen;
			d[d.length - fadeLen + i] = d[d.length - fadeLen + i] * (1 - k) + d[i] * k;
		}
	}
	return { white, pink, brown };
}

export function noiseLoop(b: Bus, color: NoiseColor, rate = 1): AudioBufferSourceNode {
	const s = b.ctx.createBufferSource();
	s.buffer = b.noise[color];
	s.loop = true;
	s.playbackRate.value = rate;
	s.start(b.ctx.currentTime, b.rand() * (s.buffer.duration - 0.1));
	b.sources.push(s);
	return s;
}

export function filter(b: Bus, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
	const f = b.ctx.createBiquadFilter();
	f.type = type;
	f.frequency.value = freq;
	f.Q.value = q;
	return f;
}

export function gainNode(b: Bus, value: number): GainNode {
	const g = b.ctx.createGain();
	g.gain.value = value;
	return g;
}

export function osc(b: Bus, type: OscillatorType, freq: number): OscillatorNode {
	const o = b.ctx.createOscillator();
	o.type = type;
	o.frequency.value = freq;
	o.start();
	b.sources.push(o);
	return o;
}

export function lfo(b: Bus, freq: number, depth: number, target: AudioParam): OscillatorNode {
	const o = osc(b, 'sine', freq);
	const g = gainNode(b, depth);
	o.connect(g).connect(target);
	return o;
}

export function output(b: Bus, node: AudioNode, pan: number, send: number): StereoPannerNode {
	const p = b.ctx.createStereoPanner();
	p.pan.value = pan;
	node.connect(p);
	p.connect(b.out);
	if (send > 0) {
		const s = gainNode(b, send);
		p.connect(s).connect(b.send);
	}
	return p;
}

function chain(...nodes: AudioNode[]): AudioNode {
	for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
	return nodes[nodes.length - 1];
}

export function wind(
	b: Bus,
	o: { gain: number; low: number; band: number; q: number; bandGain: number; pan?: number; whistles?: number[]; whistleGain?: number; hiss?: number }
): WindDriven {
	const low = gainNode(b, 0);
	chain(noiseLoop(b, 'brown', 0.9 + b.rand() * 0.2), filter(b, 'lowpass', o.low), low);
	output(b, low, (o.pan ?? 0) - 0.25, 0.15);
	const low2 = gainNode(b, 0);
	chain(noiseLoop(b, 'brown', 1.05), filter(b, 'lowpass', o.low * 1.2), low2);
	output(b, low2, (o.pan ?? 0) + 0.3, 0.15);

	const bandF = filter(b, 'bandpass', o.band, o.q);
	const band = gainNode(b, 0);
	chain(noiseLoop(b, 'pink'), bandF, band);
	const bandPan = output(b, band, o.pan ?? 0, 0.3);
	lfo(b, 0.05 + b.rand() * 0.04, 0.5, bandPan.pan);

	const whistles = (o.whistles ?? []).map((f, i) => {
		const bp = filter(b, 'bandpass', f, 28);
		const g = gainNode(b, 0);
		chain(noiseLoop(b, 'white'), bp, g);
		const p = output(b, g, (i % 2 ? 1 : -1) * 0.4, 0.6);
		lfo(b, 0.03 + i * 0.017, 0.4, p.pan);
		lfo(b, 0.11 + i * 0.05, f * 0.03, bp.frequency);
		return { bp, g, f };
	});

	let hiss: GainNode | undefined;
	if (o.hiss) {
		hiss = gainNode(b, 0);
		chain(noiseLoop(b, 'white'), filter(b, 'highpass', 4500), filter(b, 'lowpass', 11000), hiss);
		output(b, hiss, 0.1, 0.2);
	}

	return {
		setWind(w, at) {
			const s = Math.pow(Math.max(w, 0), 1.5);
			low.gain.setTargetAtTime(o.gain * (0.25 + 0.9 * s), at, 0.5);
			low2.gain.setTargetAtTime(o.gain * (0.2 + 0.8 * s), at, 0.7);
			band.gain.setTargetAtTime(o.bandGain * (0.15 + 1.0 * s), at, 0.45);
			bandF.frequency.setTargetAtTime(o.band * (0.7 + 0.55 * w), at, 0.8);
			for (const wh of whistles) {
				wh.g.gain.setTargetAtTime((o.whistleGain ?? 0) * Math.pow(Math.max(w - 0.35, 0), 2) * 3, at, 0.6);
				wh.bp.frequency.setTargetAtTime(wh.f * (0.9 + 0.2 * w), at, 1.2);
			}
			hiss?.gain.setTargetAtTime((o.hiss ?? 0) * s, at, 0.4);
		}
	};
}

export function hum(b: Bus, partials: [number, number][], gain: number, pan = 0, send = 0.2): void {
	const g = gainNode(b, gain);
	for (const [f, a] of partials) {
		const o = osc(b, 'sine', f);
		const pg = gainNode(b, a);
		o.connect(pg).connect(g);
	}
	lfo(b, 0.13, gain * 0.25, g.gain);
	output(b, g, pan, send);
}

export function cricket(b: Bus, o: { freq: number; period: number; pulses: number; pulseLen: number; gap: number; pan: number; gain: number; cutoff: number }): Scheduled {
	const tone = osc(b, 'sine', o.freq);
	const tone2 = osc(b, 'sine', o.freq * 2.01);
	const env = gainNode(b, 0);
	const h = gainNode(b, 0.12);
	tone.connect(env);
	tone2.connect(h).connect(env);
	const lp = filter(b, 'lowpass', o.cutoff);
	env.connect(lp);
	output(b, lp, o.pan, 0.35);
	let next = b.ctx.currentTime + b.rand() * o.period * 2;
	return {
		schedule(until) {
			while (next < until) {
				if (b.rand() < 0.012) {
					next += 3 + b.rand() * 8;
					continue;
				}
				for (let p = 0; p < o.pulses; p++) {
					const t0 = next + p * (o.pulseLen + o.gap);
					const amp = o.gain * (p === 0 ? 0.7 : 1);
					env.gain.setValueAtTime(0, t0);
					env.gain.linearRampToValueAtTime(amp, t0 + 0.004);
					env.gain.setValueAtTime(amp, t0 + o.pulseLen - 0.005);
					env.gain.linearRampToValueAtTime(0, t0 + o.pulseLen);
				}
				next += o.period * (0.96 + b.rand() * 0.08);
			}
		}
	};
}

export function cicadaBed(b: Bus, o: { freq: number; q: number; am: number; gain: number; pan: number; swell: [number, number] }): Scheduled {
	const bp = filter(b, 'bandpass', o.freq, o.q);
	const amGain = gainNode(b, 0.5);
	chain(noiseLoop(b, 'white'), bp, amGain);
	lfo(b, o.am, 0.5, amGain.gain);
	const env = gainNode(b, o.gain * 0.3);
	amGain.connect(env);
	output(b, env, o.pan, 0.4);
	let next = b.ctx.currentTime + b.rand() * 4;
	return {
		schedule(until) {
			while (next < until) {
				const up = 1.5 + b.rand() * 2.5;
				const hold = o.swell[0] + b.rand() * (o.swell[1] - o.swell[0]);
				const peak = o.gain * (0.6 + b.rand() * 0.4);
				env.gain.setTargetAtTime(peak, next, up / 3);
				env.gain.setTargetAtTime(o.gain * (0.15 + b.rand() * 0.2), next + up + hold, 1.2);
				next += up + hold + 3 + b.rand() * 6;
			}
		}
	};
}

function oneShot(b: Bus, at: number, dur: number, build: (o: OscillatorNode, g: GainNode) => void, pan: number, send: number, cutoff = 12000): void {
	const o = b.ctx.createOscillator();
	const g = b.ctx.createGain();
	g.gain.value = 0;
	build(o, g);
	const lp = filter(b, 'lowpass', cutoff);
	o.connect(g).connect(lp);
	const p = output(b, lp, pan, send);
	o.start(at);
	o.stop(at + dur);
	o.onended = () => {
		o.disconnect();
		g.disconnect();
		lp.disconnect();
		p.disconnect();
	};
}

export function treeFrogs(b: Bus, o: { rate: number; gain: number; freq: [number, number] }): Scheduled {
	let next = b.ctx.currentTime + 1;
	return {
		schedule(until) {
			while (next < until) {
				const f = o.freq[0] + b.rand() * (o.freq[1] - o.freq[0]);
				const pan = b.rand() * 1.6 - 0.8;
				const count = 1 + Math.floor(b.rand() * 4);
				const amp = o.gain * (0.3 + b.rand() * 0.7);
				for (let i = 0; i < count; i++) {
					const t = next + i * (0.13 + b.rand() * 0.04);
					oneShot(
						b,
						t,
						0.12,
						(os, g) => {
							os.type = 'sine';
							os.frequency.setValueAtTime(f * 1.04, t);
							os.frequency.exponentialRampToValueAtTime(f, t + 0.03);
							g.gain.setValueAtTime(0, t);
							g.gain.linearRampToValueAtTime(amp, t + 0.003);
							g.gain.setTargetAtTime(0, t + 0.006, 0.022);
						},
						pan,
						0.5,
						6000
					);
				}
				next += (0.3 + b.rand() * 2) / o.rate;
			}
		}
	};
}

export function croaks(b: Bus, o: { rate: number; gain: number; freq: [number, number] }): Scheduled {
	let next = b.ctx.currentTime + 2;
	return {
		schedule(until) {
			while (next < until) {
				const f = o.freq[0] + b.rand() * (o.freq[1] - o.freq[0]);
				const pan = b.rand() * 1.4 - 0.7;
				const pulses = 5 + Math.floor(b.rand() * 7);
				const t = next;
				const dur = pulses / 17 + 0.1;
				oneShot(
					b,
					t,
					dur,
					(os, g) => {
						os.type = 'sawtooth';
						os.frequency.setValueAtTime(f, t);
						os.frequency.linearRampToValueAtTime(f * 0.92, t + dur);
						for (let i = 0; i < pulses; i++) {
							const p = t + i / 17;
							g.gain.setValueAtTime(0, p);
							g.gain.linearRampToValueAtTime(o.gain, p + 0.008);
							g.gain.linearRampToValueAtTime(0, p + 0.045);
						}
					},
					pan,
					0.6,
					900
				);
				next += (2 + b.rand() * 6) / o.rate;
			}
		}
	};
}

export function birds(b: Bus, o: { rate: number; gain: number; low: number; high: number; cutoff?: number }): Scheduled {
	let next = b.ctx.currentTime + 2 + b.rand() * 4;
	return {
		schedule(until) {
			while (next < until) {
				const notes = 2 + Math.floor(b.rand() * 5);
				const pan = b.rand() * 1.6 - 0.8;
				const base = o.low + b.rand() * (o.high - o.low);
				let t = next;
				for (let i = 0; i < notes; i++) {
					const len = 0.06 + b.rand() * 0.14;
					const f0 = base * (0.8 + b.rand() * 0.5);
					const f1 = f0 * (b.rand() < 0.5 ? 0.7 + b.rand() * 0.2 : 1.15 + b.rand() * 0.35);
					const amp = o.gain * (0.5 + b.rand() * 0.5);
					const at = t;
					oneShot(
						b,
						at,
						len + 0.05,
						(os, g) => {
							os.type = 'sine';
							os.frequency.setValueAtTime(f0, at);
							os.frequency.exponentialRampToValueAtTime(f1, at + len);
							g.gain.setValueAtTime(0, at);
							g.gain.linearRampToValueAtTime(amp, at + 0.012);
							g.gain.setTargetAtTime(0, at + len * 0.6, len * 0.25);
						},
						pan,
						0.7,
						o.cutoff ?? 9000
					);
					t += len + 0.03 + b.rand() * 0.12;
				}
				next += (3 + b.rand() * 9) / o.rate;
			}
		}
	};
}

export function nightjar(b: Bus, o: { gain: number; pan: number }): Scheduled {
	let next = b.ctx.currentTime + 6 + b.rand() * 10;
	return {
		schedule(until) {
			while (next < until) {
				const calls = 3 + Math.floor(b.rand() * 6);
				for (let c = 0; c < calls; c++) {
					const t = next + c * (1.6 + b.rand() * 0.2);
					oneShot(
						b,
						t,
						0.22,
						(os, g) => {
							os.type = 'sine';
							os.frequency.setValueAtTime(1650, t);
							os.frequency.linearRampToValueAtTime(1900, t + 0.14);
							g.gain.setValueAtTime(0, t);
							g.gain.linearRampToValueAtTime(o.gain, t + 0.03);
							g.gain.linearRampToValueAtTime(0, t + 0.16);
						},
						o.pan,
						0.9,
						5000
					);
					const t2 = t + 0.32;
					oneShot(
						b,
						t2,
						0.36,
						(os, g) => {
							os.type = 'sine';
							os.frequency.setValueAtTime(1350, t2);
							os.frequency.exponentialRampToValueAtTime(2150, t2 + 0.26);
							g.gain.setValueAtTime(0, t2);
							g.gain.linearRampToValueAtTime(o.gain * 1.1, t2 + 0.05);
							g.gain.linearRampToValueAtTime(0, t2 + 0.3);
						},
						o.pan,
						0.9,
						5000
					);
				}
				next += calls * 1.8 + 25 + b.rand() * 40;
			}
		}
	};
}

export function crackle(b: Bus, o: { rate: number; gain: number; pan: number }): Scheduled {
	const env = gainNode(b, 0);
	chain(noiseLoop(b, 'white'), filter(b, 'highpass', 1800), env);
	output(b, env, o.pan, 0.3);
	let next = b.ctx.currentTime + 0.5;
	let burst = 0;
	return {
		schedule(until) {
			while (next < until) {
				const amp = o.gain * (0.2 + Math.pow(b.rand(), 3) * 1.4);
				env.gain.setValueAtTime(amp, next);
				env.gain.setTargetAtTime(0, next + 0.0015, 0.004);
				if (burst > 0) {
					burst--;
					next += 0.008 + b.rand() * 0.05;
				} else {
					if (b.rand() < 0.15) burst = 3 + Math.floor(b.rand() * 10);
					next += -Math.log(1 - b.rand()) / o.rate;
				}
			}
		}
	};
}

export function coronaBuzz(b: Bus, o: { freq: number; gain: number; pan: number }): void {
	const s = osc(b, 'sawtooth', o.freq);
	const bp = filter(b, 'bandpass', 1300, 0.9);
	const g = gainNode(b, o.gain);
	chain(s, bp, filter(b, 'highpass', 300), g);
	const s2 = osc(b, 'sawtooth', o.freq * 1.003);
	s2.connect(bp);
	lfo(b, 0.07, o.gain * 0.45, g.gain);
	lfo(b, 0.31, o.gain * 0.15, g.gain);
	output(b, g, o.pan, 0.3);
}

export function stream(b: Bus, o: { gain: number; pan: number }): void {
	const g = gainNode(b, o.gain);
	const lp = filter(b, 'lowpass', 3800);
	lp.connect(g);
	for (const [f, q, r] of [
		[520, 2.2, 3.1],
		[1100, 3, 5.3],
		[2300, 3.5, 7.9],
		[3400, 4, 11.3]
	] as const) {
		const bp = filter(b, 'bandpass', f, q);
		const amp = gainNode(b, 0.6);
		chain(noiseLoop(b, 'pink', 0.9 + b.rand() * 0.2), bp, amp, lp);
		lfo(b, r, 0.45, amp.gain);
		lfo(b, r * 0.37, f * 0.2, bp.frequency);
	}
	output(b, g, o.pan, 0.25);
}

export function traffic(b: Bus, o: { gain: number; pan: number; cutoff: number }): Scheduled {
	const env = gainNode(b, o.gain * 0.5);
	chain(noiseLoop(b, 'brown'), filter(b, 'lowpass', o.cutoff), env);
	const p = output(b, env, o.pan, 0.2);
	let next = b.ctx.currentTime + 3;
	return {
		schedule(until) {
			while (next < until) {
				const up = 3 + b.rand() * 4;
				env.gain.setTargetAtTime(o.gain * (0.8 + b.rand() * 0.6), next, up / 3);
				env.gain.setTargetAtTime(o.gain * 0.45, next + up, 2.5);
				p.pan.setTargetAtTime(o.pan + (b.rand() - 0.5) * 0.8, next, up);
				next += up + 6 + b.rand() * 14;
			}
		}
	};
}

export function ventHum(b: Bus, o: { gain: number; pan: number }): void {
	const g = gainNode(b, o.gain);
	chain(noiseLoop(b, 'pink'), filter(b, 'bandpass', 240, 1.4), filter(b, 'lowpass', 900), g);
	const t = osc(b, 'sine', 100);
	const tg = gainNode(b, 0.08);
	t.connect(tg).connect(g);
	lfo(b, 0.21, o.gain * 0.12, g.gain);
	output(b, g, o.pan, 0.35);
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function pad(b: Bus, o: { notes: number[]; root: number; gain: number; bright: number; spacing: [number, number] }): Scheduled {
	const bus = gainNode(b, o.gain);
	const lp = filter(b, 'lowpass', o.bright, 0.4);
	bus.connect(lp);
	const dry = gainNode(b, 0.35);
	lp.connect(dry).connect(b.out);
	const wet = gainNode(b, 1.4);
	lp.connect(wet).connect(b.send);
	lfo(b, 0.023, o.bright * 0.35, lp.frequency);

	const drone = osc(b, 'sine', midi(o.root));
	const drone2 = osc(b, 'triangle', midi(o.root) * 1.0015);
	const dg = gainNode(b, 0.22);
	drone.connect(dg);
	const d2 = gainNode(b, 0.07);
	drone2.connect(d2).connect(dg);
	dg.connect(bus);
	lfo(b, 0.041, 0.08, dg.gain);

	let next = b.ctx.currentTime + 1.5;
	let last = -1;
	return {
		schedule(until) {
			while (next < until) {
				let k = Math.floor(b.rand() * o.notes.length);
				if (k === last) k = (k + 1) % o.notes.length;
				last = k;
				const f = midi(o.notes[k]);
				const t = next;
				const attack = 4 + b.rand() * 4;
				const hold = 3 + b.rand() * 5;
				const release = 8 + b.rand() * 6;
				const amp = 0.16 + b.rand() * 0.1;
				const pan = b.rand() * 1.2 - 0.6;
				const end = t + attack + hold + release;
				const g = b.ctx.createGain();
				g.gain.value = 0;
				g.gain.setValueAtTime(0, t);
				g.gain.linearRampToValueAtTime(amp, t + attack);
				g.gain.setValueAtTime(amp, t + attack + hold);
				g.gain.linearRampToValueAtTime(0, end);
				const p = b.ctx.createStereoPanner();
				p.pan.value = pan;
				g.connect(p).connect(bus);
				const oscs = [
					['sine', 1, 1],
					['triangle', 1.0021, 0.35],
					['sine', 0.9983, 0.6],
					['sine', 2.0007, 0.08]
				] as const;
				const nodes: AudioNode[] = [g, p];
				for (const [type, ratio, a] of oscs) {
					const os = b.ctx.createOscillator();
					os.type = type;
					os.frequency.value = f * ratio;
					const og = b.ctx.createGain();
					og.gain.value = a;
					os.connect(og).connect(g);
					os.start(t);
					os.stop(end + 0.1);
					nodes.push(os, og);
					os.onended = () => nodes.forEach((n) => n.disconnect());
				}
				next += o.spacing[0] + b.rand() * (o.spacing[1] - o.spacing[0]);
			}
		}
	};
}

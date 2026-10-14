import {
	birds,
	cicadaBed,
	coronaBuzz,
	crackle,
	cricket,
	croaks,
	hum,
	nightjar,
	pad,
	stream,
	traffic,
	treeFrogs,
	ventHum,
	wind,
	type Bus,
	type Scheduled,
	type WindDriven
} from './voices.ts';

export interface Scape {
	scheduled: Scheduled[];
	wind: WindDriven[];
	level: number;
}

type ScapeBuilder = (b: Bus) => Scape;

const crickets = (b: Bus, n: number, gain: number, freq: number, cutoff: number): Scheduled[] =>
	Array.from({ length: n }, (_, i) =>
		cricket(b, {
			freq: freq * (0.92 + b.rand() * 0.16),
			period: 0.55 + b.rand() * 0.6,
			pulses: 3 + Math.floor(b.rand() * 3),
			pulseLen: 0.016 + b.rand() * 0.008,
			gap: 0.018 + b.rand() * 0.01,
			pan: ((i / Math.max(n - 1, 1)) * 2 - 1) * 0.85,
			gain: gain * (i === 0 ? 1 : 0.25 + b.rand() * 0.5),
			cutoff: cutoff * (i === 0 ? 1 : 0.45 + b.rand() * 0.4)
		})
	);

export const scapes: Record<string, ScapeBuilder> = {
	beacon: (b) => {
		hum(b, [[60, 0.5], [120, 1], [180, 0.35], [240, 0.2], [360, 0.08]], 0.006, 0.35, 0.3);
		return {
			level: 1,
			wind: [wind(b, { gain: 0.06, low: 260, band: 700, q: 0.8, bandGain: 0.018 })],
			scheduled: [
				...crickets(b, 6, 0.012, 4600, 7000),
				nightjar(b, { gain: 0.006, pan: -0.55 }),
				traffic(b, { gain: 0.02, pan: -0.5, cutoff: 140 }),
				pad(b, { notes: [50, 57, 60, 64, 65, 69, 72], root: 38, gain: 0.05, bright: 1600, spacing: [4, 8] })
			]
		};
	},
	'hill-station': (b) => {
		return {
			level: 1.2,
			wind: [wind(b, { gain: 0.03, low: 220, band: 500, q: 0.7, bandGain: 0.01 })],
			scheduled: [
				cicadaBed(b, { freq: 5200, q: 3, am: 92, gain: 0.012, pan: -0.5, swell: [3, 8] }),
				cicadaBed(b, { freq: 6400, q: 4, am: 71, gain: 0.009, pan: 0.6, swell: [4, 10] }),
				cicadaBed(b, { freq: 4300, q: 5, am: 118, gain: 0.006, pan: 0.1, swell: [2, 6] }),
				treeFrogs(b, { rate: 1.6, gain: 0.012, freq: [2100, 3100] }),
				croaks(b, { rate: 0.5, gain: 0.01, freq: [95, 140] }),
				traffic(b, { gain: 0.035, pan: 0.2, cutoff: 180 }),
				...crickets(b, 3, 0.006, 5400, 6000),
				pad(b, { notes: [51, 58, 62, 65, 67, 70, 74], root: 39, gain: 0.05, bright: 1900, spacing: [3.5, 7] })
			]
		};
	},
	summit: (b) => {
		return {
			level: 1,
			wind: [
				wind(b, { gain: 0.16, low: 320, band: 900, q: 0.6, bandGain: 0.05, whistles: [410, 615, 930, 1240], whistleGain: 0.012, hiss: 0.02 }),
				wind(b, { gain: 0.05, low: 120, band: 380, q: 1.2, bandGain: 0.02, pan: 0.3 })
			],
			scheduled: [pad(b, { notes: [59, 66, 71, 73, 74, 78, 81, 83], root: 47, gain: 0.045, bright: 2600, spacing: [5, 10] })]
		};
	},
	pylons: (b) => {
		coronaBuzz(b, { freq: 100, gain: 0.006, pan: -0.3 });
		hum(b, [[50, 0.3], [100, 1], [200, 0.4], [300, 0.15]], 0.005, -0.2, 0.25);
		return {
			level: 1.25,
			wind: [wind(b, { gain: 0.045, low: 240, band: 650, q: 0.8, bandGain: 0.014 })],
			scheduled: [
				crackle(b, { rate: 2.5, gain: 0.012, pan: -0.35 }),
				...crickets(b, 4, 0.007, 4200, 6500),
				traffic(b, { gain: 0.03, pan: 0.4, cutoff: 170 }),
				pad(b, { notes: [45, 52, 57, 59, 61, 64, 66, 69], root: 33, gain: 0.05, bright: 1800, spacing: [4, 8] })
			]
		};
	},
	launch: (b) => {
		ventHum(b, { gain: 0.02, pan: 0.1 });
		stream(b, { gain: 0.012, pan: -0.55 });
		return {
			level: 1.6,
			wind: [wind(b, { gain: 0.05, low: 200, band: 520, q: 0.7, bandGain: 0.016 })],
			scheduled: [
				birds(b, { rate: 0.8, gain: 0.008, low: 2400, high: 4200, cutoff: 7000 }),
				...crickets(b, 2, 0.004, 4400, 5000),
				pad(b, { notes: [53, 60, 65, 67, 69, 71, 72, 76], root: 41, gain: 0.05, bright: 1700, spacing: [4, 8] })
			]
		};
	}
};

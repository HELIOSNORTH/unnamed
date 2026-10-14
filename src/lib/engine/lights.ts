import { Color, Vector3 } from 'three';
import type { AtmosphereUniforms } from './atmosphere.ts';
import { MAX_LIGHTS } from './atmosphere.ts';

export type Pattern = (t: number) => number;

const aim = new Vector3();

export const steady: Pattern = () => 1;

export function flash(period: number, on: number, phase = 0, attack = 0.18, release = 0.45): Pattern {
	return (t) => {
		const x = (((t + phase) % period) + period) % period;
		if (x < on) return 1 - Math.exp(-x / attack);
		const peak = 1 - Math.exp(-on / attack);
		return peak * Math.exp(-(x - on) / release);
	};
}

export function breathe(period: number, floor: number, phase = 0): Pattern {
	return (t) => floor + (1 - floor) * (0.5 - 0.5 * Math.cos(((t + phase) / period) * Math.PI * 2));
}

export function flicker(amount: number, seed: number): Pattern {
	return (t) => 1 - amount * (0.5 + 0.5 * Math.sin(t * 13.1 + seed) * Math.sin(t * 7.7 + seed * 3.1));
}

export interface SceneLight {
	position: Vector3;
	color: Color;
	intensity: number;
	pattern: Pattern;
	sprite?: { size: number; brightness: number };
	scatter?: boolean;
	surface?: number;
	spot?: { target: Vector3; angle: number };
}

export function applyLights(lights: SceneLight[], atmos: AtmosphereUniforms, t: number): number[] {
	const levels: number[] = [];
	let n = 0;
	for (const l of lights) {
		const level = l.pattern(t);
		levels.push(level);
		if (l.scatter === false || n >= MAX_LIGHTS) continue;
		const k = l.intensity * level;
		atmos.uLightPos.value[n].copy(l.position);
		atmos.uLightCol.value[n].set(l.color.r * k, l.color.g * k, l.color.b * k);
		atmos.uLightSurf.value[n] = l.surface ?? 1;
		const spot = atmos.uLightSpot.value[n];
		if (l.spot) {
			aim.copy(l.spot.target).sub(l.position).normalize();
			spot.set(aim.x, aim.y, aim.z, Math.cos(l.spot.angle));
		} else spot.set(0, -1, 0, -2);
		n++;
	}
	atmos.uLightCount.value = n;
	return levels;
}

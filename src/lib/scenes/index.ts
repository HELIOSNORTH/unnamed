import type { BuiltScene } from '../engine/kit.ts';
import { buildBeacon } from './beacon.ts';
import { buildHillStation } from './hill-station.ts';
import { buildLaunch } from './launch.ts';
import { buildPylons } from './pylons.ts';
import { buildSummit } from './summit.ts';

export interface SceneInfo {
	id: string;
	title: string;
	place: string;
	build: () => BuiltScene;
}

export const scenes: SceneInfo[] = [
	{ id: 'beacon', title: 'Beacon', place: 'High desert, after dusk', build: buildBeacon },
	{ id: 'hill-station', title: 'Hill Station', place: 'Tropical night, sea haze', build: buildHillStation },
	{ id: 'summit', title: 'Summit', place: 'Alpine relay, full moon', build: buildSummit },
	{ id: 'pylons', title: 'Pylons', place: 'Edge of town, clear sky', build: buildPylons },
	{ id: 'launch', title: 'Launch Complex', place: 'Mountain valley, overcast', build: buildLaunch }
];

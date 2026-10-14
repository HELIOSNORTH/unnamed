import { PerspectiveCamera, Vector3 } from 'three';
import { noise1 } from './noise.ts';

export interface Shot {
	position: Vector3;
	target: Vector3;
	fov: number;
	refAspect: number;
	sway?: number;
	breath?: number;
}

const DEG = Math.PI / 180;

export class HandheldRig {
	private breathPhase = 0;
	private lastT = 0;

	fit(camera: PerspectiveCamera, shot: Shot, aspect: number): void {
		let fov = shot.fov;
		if (aspect < shot.refAspect) {
			const hRef = 2 * Math.atan(Math.tan((shot.fov * DEG) / 2) * shot.refAspect);
			fov = (2 * Math.atan(Math.tan(hRef / 2) / aspect)) / DEG;
		}
		camera.fov = Math.min(fov, 100);
		camera.aspect = aspect;
		camera.updateProjectionMatrix();
	}

	update(camera: PerspectiveCamera, shot: Shot, t: number, wind: number): void {
		const dt = Math.min(Math.max(t - this.lastT, 0), 0.1);
		this.lastT = t;
		const rate = 0.235 + 0.035 * noise1(t * 0.05, 3);
		this.breathPhase += dt * Math.PI * 2 * rate;
		const depth = 0.75 + 0.25 * noise1(t * 0.031, 9);
		const breath = Math.sin(this.breathPhase) * depth * (shot.breath ?? 1);
		const breath2 = Math.sin(this.breathPhase * 2 + 0.7) * 0.25 * depth * (shot.breath ?? 1);

		const f = camera.fov * DEG * (shot.sway ?? 1);
		let pitch = (breath + breath2) * 0.0032 * f;
		let yaw = 0;
		let roll = Math.sin(this.breathPhase + 0.9) * 0.0011 * depth;

		pitch += noise1(t * 0.037, 5) * 0.009 * f;
		yaw += noise1(t * 0.043, 7) * 0.012 * f;
		roll += noise1(t * 0.029, 11) * 0.0025;

		const gust = wind * wind;
		yaw += gust * (noise1(t * 0.85, 13) * 0.0045 + noise1(t * 2.3, 15) * 0.0012) * f;
		pitch += gust * (noise1(t * 1.05, 17) * 0.0035 + noise1(t * 2.7, 19) * 0.001) * f;
		roll += gust * noise1(t * 0.7, 21) * 0.0035;

		yaw += noise1(t * 7.1, 23) * 0.00035 * f;
		pitch += noise1(t * 8.3, 25) * 0.00035 * f;

		camera.position.copy(shot.position);
		camera.position.y += breath * 0.004;
		camera.position.x += noise1(t * 0.05, 27) * 0.03;
		camera.lookAt(shot.target);
		camera.rotateY(yaw);
		camera.rotateX(pitch);
		camera.rotateZ(roll);
	}
}

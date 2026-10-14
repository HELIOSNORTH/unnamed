<script lang="ts">
	import { onMount } from 'svelte';
	import { Engine, type EngineStats } from '#lib/engine/engine.ts';
	import { SoundEngine } from '#lib/audio/engine.ts';
	import { scenes } from '#lib/scenes/index.ts';

	let canvas: HTMLCanvasElement;
	let engine: Engine | undefined;
	let sound: SoundEngine | undefined;

	let started = $state(false);
	let index = $state(0);
	let muted = $state(false);
	let chromeVisible = $state(true);
	let titleVisible = $state(false);
	let debug = $state(false);
	let stats = $state<EngineStats | null>(null);
	let audioLevel = $state<{ rms: number; peak: number } | null>(null);
	let failed = $state(false);

	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let titleTimer: ReturnType<typeof setTimeout> | undefined;

	const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

	function wake(): void {
		chromeVisible = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => (chromeVisible = false), 3200);
	}

	function showTitle(): void {
		titleVisible = true;
		clearTimeout(titleTimer);
		titleTimer = setTimeout(() => (titleVisible = false), 6500);
	}

	function go(delta: number): void {
		if (!engine || !started) return;
		const next = (index + delta + scenes.length) % scenes.length;
		select(next);
	}

	function select(i: number): void {
		if (!engine || i === engine.index) return;
		titleVisible = false;
		engine.go(i);
		sound?.setScene(scenes[i].id);
		wake();
	}

	async function begin(): Promise<void> {
		if (started || !engine) return;
		started = true;
		sound = new SoundEngine();
		await sound.start(scenes[index].id);
		sound.setMuted(muted);
		showTitle();
		wake();
	}

	function toggleMute(): void {
		muted = !muted;
		sound?.setMuted(muted);
	}

	async function toggleFullscreen(): Promise<void> {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch {
			return;
		}
	}

	function onKey(e: KeyboardEvent): void {
		if (e.key === 'ArrowRight') go(1);
		else if (e.key === 'ArrowLeft') go(-1);
		else if (e.key === 'Enter' && !started) begin();
		else if (e.key === 'm' || e.key === 'M') toggleMute();
		else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
		else if (e.key === 'd' || e.key === 'D') debug = !debug;
		else if (/^[1-9]$/.test(e.key) && started) {
			const i = Number(e.key) - 1;
			if (i < scenes.length) select(i);
		}
	}

	let touchX = 0;
	let touchY = 0;
	function onTouchStart(e: TouchEvent): void {
		touchX = e.touches[0].clientX;
		touchY = e.touches[0].clientY;
	}
	function onTouchEnd(e: TouchEvent): void {
		const dx = e.changedTouches[0].clientX - touchX;
		const dy = e.changedTouches[0].clientY - touchY;
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
		else wake();
	}

	onMount(() => {
		try {
			engine = new Engine(
				canvas,
				scenes.map((s) => ({ build: s.build }))
			);
		} catch {
			failed = true;
			return;
		}
		const e = engine;
		e.onSwap = (i) => {
			index = i;
			if (started) showTitle();
		};
		e.go(0);
		e.start();
		const ro = new ResizeObserver(() => e.resize());
		ro.observe(canvas);

		const windTick = setInterval(() => {
			sound?.setWind(e.wind);
			if (debug) {
				stats = e.stats();
				audioLevel = sound?.levelDb() ?? null;
			}
		}, 100);

		const onVisibility = () => {
			if (document.hidden) {
				e.stop();
				sound?.suspend();
			} else {
				e.start();
				sound?.resume();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		(window as unknown as { __quietSignals?: unknown }).__quietSignals = {
			jump: (i: number, t: number) => {
				started = true;
				chromeVisible = false;
				e.jump(i, t);
			},
			stats: () => e.stats(),
			begin: () => begin(),
			select: (i: number) => select(i),
			audio: () => sound?.levelDb() ?? null
		};

		return () => {
			ro.disconnect();
			clearInterval(windTick);
			document.removeEventListener('visibilitychange', onVisibility);
			sound?.dispose();
			e.dispose();
		};
	});
</script>

<svelte:window onkeydown={onKey} onpointermove={() => started && wake()} />

<main class="fixed inset-0 select-none bg-black" ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
	<canvas bind:this={canvas} class="block h-full w-full" class:cursor-none={started && !chromeVisible}></canvas>

	{#if failed}
		<div class="absolute inset-0 grid place-items-center p-6 text-center">
			<p class="max-w-sm text-[15px] leading-relaxed text-[var(--ink-soft)]">
				This piece needs WebGL 2. Open it in a current version of Safari, Chrome, Edge or Firefox with hardware acceleration turned on.
			</p>
		</div>
	{/if}

	{#if !started && !failed}
		<div class="intro absolute inset-0 flex flex-col items-center justify-center gap-10 bg-black/70 px-6 text-center">
			<div class="flex flex-col items-center gap-3">
				<h1 class="m-0 text-[clamp(2.4rem,7vw,4.6rem)] font-semibold tracking-[-0.035em] text-balance">Quiet Signals</h1>
				<p class="m-0 text-[clamp(0.95rem,2.2vw,1.15rem)] tracking-[0.01em] text-[var(--ink-soft)]">Five towers. Five nights.</p>
			</div>
			<button class="glass glass-button rounded-full px-9 py-3.5 text-[17px] font-medium tracking-[-0.01em] text-[var(--ink)]" onclick={begin}>
				Begin
			</button>
			<p class="absolute bottom-[max(28px,env(safe-area-inset-bottom))] m-0 text-[13px] tracking-[0.02em] text-[var(--ink-faint)]">
				Best with headphones · ← → to move between scenes
			</p>
		</div>
	{/if}

	{#if started}
		<div
			class="pointer-events-none absolute bottom-[max(110px,calc(env(safe-area-inset-bottom)+110px))] left-[max(28px,env(safe-area-inset-left))] transition-all duration-[1800ms] ease-[var(--ease-apple)]"
			style:opacity={titleVisible ? 1 : 0}
			style:transform={titleVisible ? 'translateY(0)' : 'translateY(10px)'}
		>
			<p class="m-0 text-[13px] font-medium tracking-[0.18em] text-[var(--ink-soft)] uppercase">{roman[index]}</p>
			<h2 class="m-0 mt-1 text-[clamp(1.9rem,4.5vw,3rem)] font-semibold tracking-[-0.03em]">{scenes[index].title}</h2>
			<p class="m-0 mt-1 text-[15px] text-[var(--ink-soft)]">{scenes[index].place}</p>
		</div>

		<nav
			class="absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1 transition-opacity duration-700 ease-[var(--ease-apple)]"
			style:opacity={chromeVisible ? 1 : 0}
			aria-label="Scenes"
		>
			<div class="glass flex items-center gap-1 rounded-full p-1.5">
				<button class="glass-button grid h-10 w-10 place-items-center rounded-full" onclick={() => go(-1)} aria-label="Previous scene">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
				</button>
				<div class="flex items-center gap-2 px-2">
					{#each scenes as s, i (s.id)}
						<button
							class="h-[7px] rounded-full transition-all duration-500 ease-[var(--ease-apple)]"
							style:width={i === index ? '22px' : '7px'}
							style:background={i === index ? 'var(--ink)' : 'var(--ink-faint)'}
							onclick={() => select(i)}
							aria-label={s.title}
							aria-current={i === index}
						></button>
					{/each}
				</div>
				<button class="glass-button grid h-10 w-10 place-items-center rounded-full" onclick={() => go(1)} aria-label="Next scene">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
				</button>
			</div>
		</nav>

		<div
			class="absolute top-[max(20px,env(safe-area-inset-top))] right-[max(20px,env(safe-area-inset-right))] flex gap-2 transition-opacity duration-700 ease-[var(--ease-apple)]"
			style:opacity={chromeVisible ? 1 : 0}
		>
			<button class="glass glass-button grid h-11 w-11 place-items-center rounded-full" onclick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
				{#if muted}
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
				{:else}
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" /></svg>
				{/if}
			</button>
			<button class="glass glass-button grid h-11 w-11 place-items-center rounded-full" onclick={toggleFullscreen} aria-label="Toggle full screen">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" /></svg>
			</button>
		</div>
	{/if}

	{#if debug && stats}
		<pre class="glass absolute top-[max(20px,env(safe-area-inset-top))] left-[max(20px,env(safe-area-inset-left))] m-0 rounded-2xl px-4 py-3 font-mono text-[11px] leading-5 text-[var(--ink-soft)] tabular-nums">fps      {stats.fps.toFixed(0)}
frame    {stats.frameMs.toFixed(1)} ms
scale    {(stats.renderScale * 100).toFixed(0)} %
draws    {stats.drawCalls}
tris     {stats.triangles}
geoms    {stats.geometries}
textures {stats.textures}
heap     {stats.heapMb === null ? 'n/a' : stats.heapMb.toFixed(1) + ' MB'}
build    {stats.buildMs.toFixed(0)} ms
audio    {audioLevel ? `${audioLevel.rms.toFixed(1)} dB rms · ${audioLevel.peak.toFixed(1)} dB peak` : 'off'}</pre>
	{/if}
</main>

<style>
	.intro {
		animation: intro-in 2.4s var(--ease-apple) both;
	}
	@keyframes intro-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

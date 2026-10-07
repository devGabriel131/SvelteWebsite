<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { formatMessage } from '#lib/i18n/translations.ts';
	import type { SectionKey } from './types';

	let { section, text, disabled = false, onchange }: {
		section: SectionKey;
		text: string;
		disabled?: boolean;
		onchange: (signature: string, read: boolean) => void;
	} = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp.waiver);
	const id = $props.id();
	let reader: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let reachedEnd = $state(false);
	let read = $state(false);
	let signature = $state('');
	let pointerId: number | null = null;
	let point = { x: 30, y: 90 };
	let ink = false;
	let keyboardDrawing = $state(false);
	let cursor = $state({ x: 30, y: 90 });
	const locked = $derived(!read || disabled);

	function measure() {
		if (reader.clientHeight > 0 && reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 2) reachedEnd = true;
	}

	function clear() {
		const context = canvas.getContext('2d');
		if (context) {
			context.fillStyle = '#ffffff';
			context.fillRect(0, 0, 600, 180);
		}
		if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
		pointerId = null;
		ink = false;
		keyboardDrawing = false;
		point = { x: 30, y: 90 };
		cursor = point;
		signature = '';
		onchange('', read);
	}

	onMount(() => {
		clear();
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(reader);
		return () => observer.disconnect();
	});

	function position(event: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(600, (event.clientX - rect.left) * 600 / rect.width)),
			y: Math.max(0, Math.min(180, (event.clientY - rect.top) * 180 / rect.height))
		};
	}

	function draw(next: { x: number; y: number }) {
		const context = canvas.getContext('2d');
		if (!context || Math.hypot(next.x - point.x, next.y - point.y) < 0.5) return;
		context.strokeStyle = '#111111';
		context.lineWidth = 2.5;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.beginPath();
		context.moveTo(point.x, point.y);
		context.lineTo(next.x, next.y);
		context.stroke();
		point = next;
		ink = true;
	}

	function capture() {
		const pixels = ink ? canvas.getContext('2d')?.getImageData(0, 0, 600, 180).data : undefined;
		let dark = 0;
		let light = 0;
		if (pixels) {
			for (let index = 0; index < pixels.length && (dark < 16 || light < 16); index += 4) {
				if (pixels[index] <= 160 && pixels[index + 1] <= 160 && pixels[index + 2] <= 160) dark++;
				if (pixels[index] >= 240 && pixels[index + 1] >= 240 && pixels[index + 2] >= 240) light++;
			}
		}
		// Match the PNG validator's visible-ink floor, including accidental near-empty strokes.
		signature = dark >= 16 && light >= 16 ? canvas.toDataURL('image/png') : '';
		onchange(signature, read);
	}

	function endPointer(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		if (!locked && event.type === 'pointerup') draw(position(event));
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		pointerId = null;
		capture();
	}

	function keyboard(event: KeyboardEvent) {
		if (locked) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			keyboardDrawing = !keyboardDrawing;
			if (keyboardDrawing) { point = { ...cursor }; signature = ''; onchange('', read); }
			else capture();
			return;
		}
		if (!keyboardDrawing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		const step = event.shiftKey ? 10 : 3;
		cursor = {
			x: Math.max(2, Math.min(598, cursor.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))),
			y: Math.max(2, Math.min(178, cursor.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)))
		};
		draw(cursor);
	}
</script>

<section class="bc-legal-section" aria-labelledby={`${id}-heading`}>
	<h3 id={`${id}-heading`}>{messages.sections[section]}</h3>
	<p id={`${id}-scroll`} class="bc-hint">{messages.scrollHint}</p>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region must be keyboard-focusable to read the complete legal text.) -->
	<div class="bc-legal-text" bind:this={reader} tabindex="0" role="region"
		aria-label={formatMessage(messages.readRegion, { section: messages.sections[section] })}
		aria-describedby={`${id}-scroll`} onscroll={measure}><div lang="es">{text}</div></div>
	<p class="bc-hint" aria-live="polite">{reachedEnd ? messages.readReady : messages.locked}</p>
	<label class="bc-check">
		<input type="checkbox" checked={read} disabled={!reachedEnd || disabled}
			onchange={(event) => { read = event.currentTarget.checked; clear(); }} />
		{messages.readConfirm}
	</label>
	<p id={`${id}-drawing`} class="bc-hint">{messages.signatureHint}</p>
	<div class="bc-signature" class:bc-signature-locked={locked}>
		<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role (This drawing widget implements keyboard controls; application mode lets assistive technology pass arrow keys to it.) -->
		<canvas width="600" height="180" bind:this={canvas} role="application" tabindex={locked ? -1 : 0}
			aria-label={formatMessage(messages.signature, { section: messages.sections[section] })}
			aria-describedby={`${id}-drawing`} aria-disabled={locked}
			onpointerdown={(event) => {
				if (locked || !event.isPrimary || event.button !== 0 || pointerId !== null) return;
				event.preventDefault();
				canvas.focus();
				keyboardDrawing = false;
				pointerId = event.pointerId;
				point = position(event);
				canvas.setPointerCapture(event.pointerId);
				signature = '';
				onchange('', read);
			}}
			onpointermove={(event) => { if (!locked && event.pointerId === pointerId) draw(position(event)); }}
			onpointerup={endPointer} onpointercancel={endPointer} onlostpointercapture={endPointer}
			onkeydown={keyboard} onblur={() => { if (keyboardDrawing) { keyboardDrawing = false; capture(); } }}>
			{messages.signatureHint}
		</canvas>
		{#if keyboardDrawing}<span class="bc-signature-cursor" aria-hidden="true" style:left={`${cursor.x / 6}%`} style:top={`${cursor.y / 1.8}%`}></span>{/if}
	</div>
	<div class="bc-actions">
		<Button type="button" variant="outline" disabled={locked} onclick={clear}>{messages.clear}</Button>
		<p class="bc-hint" role="status">{keyboardDrawing ? messages.keyboardDrawing : signature ? messages.signed : messages.unsigned}</p>
	</div>
</section>

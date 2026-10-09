<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy, untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import ActionForm from './ActionForm.svelte';
	import FormFeedback from './FormFeedback.svelte';
	import LegalSignature from './LegalSignature.svelte';
	import { sectionKeys, type BootcampEvent, type SectionKey, type StudentBootcampPage } from './types';

	let { event, student }: { event: BootcampEvent; student: NonNullable<StudentBootcampPage['student']> } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.bootcamp);
	let dateOfBirth = $state(untrack(() => student.dateOfBirth ?? ''));
	let phone = $state('');
	let municipality = $state('');
	let signingCity = $state('');
	let formElement = $state<HTMLFormElement>();
	let drafts = $state<Partial<Record<SectionKey, { key: string; signature: string; read: boolean }>>>({});
	const identityVersion = $derived(student.identityVersion);
	const identityKey = $derived(JSON.stringify([
		event.id, event.revision, event.legal.es, student.id, identityVersion, student.name, student.email,
		student.dateOfBirth ?? dateOfBirth, phone, municipality, signingCity
	]));
	const signatures = $derived(Object.fromEntries(sectionKeys.map((section) => [section,
		drafts[section]?.key === identityKey ? drafts[section]?.signature ?? '' : ''
	])) as Record<SectionKey, string>);
	const reads = $derived(Object.fromEntries(sectionKeys.map((section) => [section,
		drafts[section]?.key === identityKey && drafts[section]?.read === true
	])) as Record<SectionKey, boolean>);
	const ready = $derived(Boolean(identityVersion && (student.dateOfBirth ?? dateOfBirth) && phone.trim() && municipality.trim() && signingCity.trim())
		&& sectionKeys.every((section) => reads[section] && signatures[section]));
	const submissionKey = $derived(JSON.stringify([identityKey, signatures, reads]));
	let preview = $state<{ url: string; key: string; token: string } | null>(null);
	let previewing = $state(false);
	let previewError = $state<string>();
	let controller: AbortController | undefined;
	const currentPreview = $derived(preview?.key === submissionKey ? preview : null);

	$effect(() => {
		if (preview && preview.key !== submissionKey) {
			URL.revokeObjectURL(preview.url);
			preview = null;
		}
	});

	onDestroy(() => {
		controller?.abort();
		if (preview) URL.revokeObjectURL(preview.url);
	});

	async function generatePreview() {
		if (!formElement?.reportValidity() || !ready || previewing) return;
		const fields = new FormData(formElement);
		fields.set('previewToken', '');
		const key = submissionKey;
		controller?.abort();
		controller = new AbortController();
		const request = controller;
		previewing = true;
		previewError = undefined;
		if (preview) URL.revokeObjectURL(preview.url);
		preview = null;
		try {
			const response = await fetch(resolve('/bootcamps/preview'), {
				method: 'POST', body: fields, credentials: 'same-origin', signal: request.signal,
				headers: { Accept: 'application/pdf' }
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				if (key === submissionKey) previewError = typeof body?.error === 'string' ? body.error : 'unavailable';
				return;
			}
			if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')) {
				if (key === submissionKey) previewError = 'unavailable';
				return;
			}
			const token = response.headers.get('X-Bootcamp-Preview-Token')?.trim();
			const blob = await response.blob();
			if (request.signal.aborted || key !== submissionKey) return;
			if (!blob.size || !token) { previewError = 'unavailable'; return; }
			preview = { url: URL.createObjectURL(blob), key, token };
		} catch {
			if (!request.signal.aborted && key === submissionKey) previewError = 'unavailable';
		} finally {
			if (controller === request) previewing = false;
		}
	}
</script>

<ActionForm action="?/waiver" bind:formElement beforeSubmit={() => ready && !previewing}>
	{#snippet children(pending)}
		<fieldset disabled={pending || previewing} class="bc-stack">
			<legend>{messages.identity.title}</legend>
			<input type="hidden" name="eventId" value={event.id} />
			<input type="hidden" name="revision" value={event.revision} />
			<input type="hidden" name="language" value="es" />
			<input type="hidden" name="identityVersion" value={identityVersion} />
			<input type="hidden" name="previewToken" value={currentPreview?.token ?? ''} />
			<p class="bc-hint">{messages.identity.known}</p>
			<dl class="bc-details">
				<div><dt>{messages.identity.name}</dt><dd>{student.name}</dd></div>
				<div><dt>{messages.identity.email}</dt><dd>{student.email}</dd></div>
			</dl>
			<div class="bc-fields">
				<label class="bc-field"><span>{messages.identity.dateOfBirth}</span>
					{#if student.dateOfBirth}<input name="dateOfBirth" type="date" value={student.dateOfBirth} readonly required />
					{:else}<input name="dateOfBirth" type="date" bind:value={dateOfBirth} autocomplete="bday" required />{/if}
				</label>
				<label class="bc-field"><span>{messages.identity.phone}</span><input name="phone" type="tel" bind:value={phone} autocomplete="tel" maxlength="40" required /></label>
				<label class="bc-field"><span>{messages.identity.municipality}</span><input name="municipality" bind:value={municipality} autocomplete="address-level2" maxlength="100" required /></label>
				<label class="bc-field"><span>{messages.identity.signingCity}</span><input name="signingCity" bind:value={signingCity} maxlength="100" required /><span class="bc-hint">{messages.identity.signingCityHint}</span></label>
			</div>
			<p class="bc-hint">{messages.identity.resetHint}</p>
			<div class="bc-section">
				<h2>{messages.waiver.title}</h2>
				<p>{messages.waiver.introduction}</p>
				<p class="bc-hint">{messages.waiver.spanishOnly}</p>
				<noscript><p class="bc-notice">{messages.waiver.javascript}</p></noscript>
				{#key identityKey}
					{#each sectionKeys as section (section)}
						<LegalSignature {section} text={event.legal.es[section]} disabled={pending || previewing}
							onchange={(signature, read) => { drafts[section] = { key: identityKey, signature, read }; }} />
					{/each}
				{/key}
			</div>
			{#each sectionKeys as section (section)}
				<input type="hidden" name={section} value={signatures[section]} />
			{/each}
			<input type="hidden" name="readAgreement" value={reads.agreement ? 'true' : 'false'} />
			<input type="hidden" name="readLiability" value={reads.liability ? 'true' : 'false'} />
			<input type="hidden" name="readMedia" value={reads.media ? 'true' : 'false'} />
			<p class="bc-hint">{messages.waiver.previewOptional}</p>
			<div class="bc-actions">
				<Button type="button" variant="outline" disabled={!ready || pending || previewing} onclick={generatePreview}>
					{previewing ? messages.waiver.previewing : messages.waiver.preview}
				</Button>
			</div>
			{#if !ready}<p class="bc-hint">{messages.waiver.completeFirst}</p>{/if}
			<FormFeedback result={previewError ? { error: previewError } : null} />
			{#if currentPreview}
				<section class="bc-preview" aria-label={messages.waiver.previewTitle}>
					<h3>{messages.waiver.previewTitle}</h3>
					<p class="bc-hint">{messages.waiver.previewHint}</p>
					<iframe src={currentPreview.url} title={messages.waiver.previewTitle}></iframe>
					<div class="bc-actions">
						<Button href={currentPreview.url} target="_blank" rel="noopener noreferrer" variant="outline">{messages.waiver.openPreview}</Button>
						<Button href={currentPreview.url} download={messages.waiver.previewFilename} variant="outline">{messages.waiver.downloadPreview}</Button>
					</div>
				</section>
			{/if}
			<Button type="submit" disabled={!ready || pending || previewing}>
				{pending ? messages.common.saving : messages.waiver.submit}
			</Button>
		</fieldset>
	{/snippet}
</ActionForm>

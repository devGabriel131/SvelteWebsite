<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { useLanguage } from '#lib/i18n/language.svelte.ts';
	import { subjects, type AdminStudent } from './roster';
	import { studentClassTypes, studentGenders, studentStatuses, type StudentGender } from '#lib/student.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	let { student }: { student: AdminStudent } = $props();
	const language = useLanguage();
	const messages = $derived(language.messages.admin.roster);
	const edit = $derived(messages.edit);
	const id = $props.id();
	let saving = $state(false);
	const result = $derived(page.form?.studentEdit?.id === student.id ? page.form.studentEdit : null);
</script>
<details>
	<summary>{edit.title}</summary>
	<form method="POST" action="?/editStudent" use:enhance={() => {
		saving = true;
		return async ({ update }) => { try { await update({ reset: false }); } finally { saving = false; } };
	}}>
		<input type="hidden" name="id" value={student.id} />
		<fieldset disabled={saving}>
			<legend>{edit.title} — {student.name}</legend>
			<div class="fields">
				{#each ['firstName', 'lastName', 'email', 'dateOfBirth'] as field}
					<label for={`${id}-${field}`}>{edit[field as 'firstName' | 'lastName' | 'email' | 'dateOfBirth']}
						<input id={`${id}-${field}`} name={field} type={field === 'email' ? 'email' : field === 'dateOfBirth' ? 'date' : 'text'} value={student[field as 'firstName' | 'lastName' | 'email' | 'dateOfBirth'] ?? ''} required={field !== 'dateOfBirth'}
							readonly={field === 'email' && student.hasAccount} aria-describedby={field === 'email' && student.hasAccount ? `${id}-linked-email` : undefined} />
						{#if field === 'email' && student.hasAccount}<span class="linked-email-note" id={`${id}-linked-email`}>{edit.linkedEmailNote}</span>{/if}
					</label>
				{/each}
			</div>
			<fieldset><legend>{edit.gender}</legend><div class="options">
				{#each ['', ...studentGenders] as gender}<label><input type="radio" name="gender" value={gender} checked={(student.gender ?? '') === gender} />{edit.genders[gender === '' ? 'none' : gender as StudentGender]}</label>{/each}
			</div></fieldset>
			<fieldset><legend>{messages.classType}</legend><div class="options">
				{#each studentClassTypes as classType}<label><input type="radio" name="classType" value={classType} checked={student.classType === classType} required />{messages.classes[classType]}</label>{/each}
			</div></fieldset>
			<fieldset aria-describedby={`${id}-invited`}><legend>{messages.status}</legend><div class="options">
				{#each studentStatuses as status}<label><input type="radio" name="status" value={status} checked={student.status === status} required />{messages.statuses[status]}</label>{/each}
			</div></fieldset>
			<p id={`${id}-invited`}>{edit.invitedNote}</p>
			<fieldset aria-describedby={`${id}-scores`}><legend>{edit.scores}</legend><div class="fields">
				{#each subjects as subject}<label for={`${id}-${subject}`}>{messages.abbreviations[subject]} — {messages.subjects[subject]}<input id={`${id}-${subject}`} name={subject} type="number" min="0" max="100" step="1" value={student.subjectScores?.[subject] ?? ''} /></label>{/each}
			</div></fieldset>
			<p id={`${id}-scores`}>{edit.scoreHelp}</p>
			<fieldset><legend>{edit.readonly}</legend><dl>
				<dt>{edit.id}</dt><dd>{student.id}</dd>
				<dt>{edit.createdAt}</dt><dd>{student.createdAt}</dd>
				<dt>{edit.updatedAt}</dt><dd>{student.updatedAt}</dd>
				<dt>{edit.fixture}</dt><dd>{student.subjectScores ? messages.fixtureNote : messages.noScore}</dd>
			</dl></fieldset>
			<Button type="submit">{saving ? edit.saving : edit.save}</Button>
		</fieldset>
		{#if result}<p role={result.success ? 'status' : 'alert'}>{result.success ? edit.success : edit.errors[result.error as keyof typeof edit.errors]}</p>{/if}
	</form>
</details>
<style>
	summary { cursor: pointer; }
	form { padding: 1rem 0; max-width: 50rem; white-space: normal; }
	fieldset { border: 0; padding: 0; margin: 0 0 1rem; min-width: 0; }
	legend { font-weight: 600; margin-bottom: 0.5rem; }
	.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem; }
	.fields label { display: grid; gap: 0.4rem; }
	.fields input { border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.6rem; width: 100%; background: var(--background); }
	.linked-email-note { color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.6; }
	.options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.options label { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.4rem; }
	p, dl { color: var(--muted-foreground); font-size: 0.8rem; margin: 0.5rem 0 1rem; }
	dd { overflow-wrap: anywhere; margin: 0 0 0.5rem; }
</style>

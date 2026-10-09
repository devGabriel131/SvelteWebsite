export function readFormFields<F extends string>(data: FormData, fields: readonly F[]): Record<F, unknown> {
	const raw = {} as Record<F, unknown>;
	for (const field of fields) {
		const entries = data.getAll(field);
		// Duplicates and Files stay untrusted; never silently select or coerce them.
		raw[field] = entries.length > 1 ? entries : entries[0];
	}
	return raw;
}

export function formValues<F extends string>(
	raw: Readonly<Partial<Record<F, unknown>>>, fields: readonly F[]
): Record<F, string> {
	const values = {} as Record<F, string>;
	for (const field of fields) values[field] = typeof raw[field] === 'string' ? raw[field] : '';
	return values;
}

export function refreshVisibleErrors<F extends string, C extends string>(
	validation: { valid: true } | { valid: false; errors: Partial<Record<F, C>> },
	visible: Readonly<Partial<Record<F, C>>>
): Partial<Record<F, C>> {
	const errors: Partial<Record<F, C>> = {};
	if (!validation.valid) {
		for (const field of Object.keys(visible) as F[]) {
			if (visible[field] && validation.errors[field]) errors[field] = validation.errors[field];
		}
	}
	return errors;
}

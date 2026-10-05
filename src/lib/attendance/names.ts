export function titleAttendanceName(name: string): string {
	let capitalizeNext = true;
	return Array.from(name.trim(), (character) => {
		// Go uses per-rune case mappings, not contextual casing or multi-letter expansions.
		const lower = character === '\u0130' ? 'i' : character.toLowerCase();
		if (/\s/u.test(lower) || lower === '-' || lower === "'") {
			capitalizeNext = true;
			return lower;
		}
		if (!capitalizeNext) return lower;
		capitalizeNext = false;
		const upper = lower.toUpperCase();
		return Array.from(upper).length === 1 ? upper : lower;
	}).join('');
}

export function shortAttendanceName(fullName: string): string {
	const parts = fullName.trim().split(/\s+/u);
	return parts.length < 2 ? fullName : `${parts[0]} ${parts[1]}`;
}

export function attendanceNameSlug(name: string): string {
	// Match the legacy Go mapping; do not transliterate other alphabets or strip every Unicode accent.
	return name.trim().toLowerCase()
		.replace(/[áàäâã]/g, 'a')
		.replace(/[éèëê]/g, 'e')
		.replace(/[íìïî]/g, 'i')
		.replace(/[óòöôõ]/g, 'o')
		.replace(/[úùüû]/g, 'u')
		.replace(/ñ/g, 'n')
		.replace(/ç/g, 'c')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'student';
}

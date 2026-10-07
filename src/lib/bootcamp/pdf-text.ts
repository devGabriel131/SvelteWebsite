// PDFKit's built-in fonts use WinAnsi. Line endings become layout, but no other
// unsupported characters may be normalized away from approved legal wording.
const unsupportedCharacters = /[^\r\n\u0020-\u007e\u00a0-\u00ff€ŒœŠšŸŽžƒˆ˜‘’‚“”„–—…†‡•‰‹›™]/u;

/** Character support only; required-field, length and single-line checks belong to callers. */
export function isSupportedPdfText(text: unknown): text is string {
	return typeof text === 'string' && !unsupportedCharacters.test(text);
}

export function assertBootcampPdfText(text: unknown): asserts text is string {
	if (!isSupportedPdfText(text)) {
		throw new TypeError('Bootcamp PDF text contains unsupported characters. Use precomposed Latin/WinAnsi text.');
	}
}

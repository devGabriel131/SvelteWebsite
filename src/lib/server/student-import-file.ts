import { Buffer } from 'node:buffer';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { parseMailbox } from './gmail/message';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from '../student-invitations';

export { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS };

export type ImportedStudent = {
	row: number;
	firstName: string;
	lastName: string;
	email: string;
	pin: string;
};

export type ImportIssue = {
	row: number;
	code: 'name' | 'email' | 'pin' | 'duplicate' | 'cell';
};

export class StudentImportFileError extends Error {
	constructor(public code: 'file' | 'headers' | 'empty' | 'limit') {
		super(code);
		this.name = 'StudentImportFileError';
	}
}

type StudentField = keyof Omit<ImportedStudent, 'row'>;
const fields: StudentField[] = ['firstName', 'lastName', 'email', 'pin'];
const MAX_WORKSHEET_ROWS = 1000;
const MAX_WORKSHEET_COLUMNS = 50;
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 128;
const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const aliases: Record<StudentField, string[]> = {
	firstName: ['firstname', 'firstnames', 'givenname', 'givennames', 'name', 'names', 'nombre', 'nombres', 'primernombre', 'nombredepila'],
	lastName: ['lastname', 'lastnames', 'surname', 'surnames', 'familyname', 'apellido', 'apellidos', 'primerapellido'],
	email: ['email', 'mail', 'emailaddress', 'correo', 'correoelectronico', 'direcciondecorreo', 'direcciondecorreoelectronico'],
	pin: ['pin', 'pincode', 'securitypin', 'codigopin', 'clave', 'clavepin', 'codigodeacceso', 'pin4digitos', 'pin4digits']
};
const headerFields = new Map(Object.entries(aliases).flatMap(([field, names]) =>
	names.map((name) => [name, field as StudentField] as const)
));
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
	return value >>> 0;
});

function crc32(bytes: Buffer): number {
	let value = 0xffffffff;
	for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
	return (value ^ 0xffffffff) >>> 0;
}

function checkExtraFields(bytes: Buffer, start: number, length: number, name: Buffer): void {
	const end = start + length;
	while (start < end) {
		if (start + 4 > end) throw new StudentImportFileError('file');
		const kind = bytes.readUInt16LE(start);
		const size = bytes.readUInt16LE(start + 2);
		start += 4;
		if (start + size > end || kind === 0x0001) throw new StudentImportFileError('file');
		// JSZip can replace the filename with this extra field. Do not allow a
		// different path to bypass the worksheet preflight.
		if (kind === 0x7075 && (size < 5 || !bytes.subarray(start + 5, start + size).equals(name))) {
			throw new StudentImportFileError('file');
		}
		start += size;
	}
}

function boundedIndex(value: string | undefined, maximum: number): number {
	if (!value || !/^[0-9]+$/.test(value)) throw new StudentImportFileError('file');
	const number = Number(value);
	if (number > maximum) throw new StudentImportFileError('limit');
	if (!Number.isInteger(number) || number < 1) throw new StudentImportFileError('file');
	return number;
}

function boundedColumn(value: string): void {
	let column = 0;
	for (const letter of value) {
		column = column * 26 + letter.charCodeAt(0) - 64;
		if (column > MAX_WORKSHEET_COLUMNS) throw new StudentImportFileError('limit');
	}
}

function boundedReference(value: string | undefined, wholeRowsOrColumns = false): void {
	if (!value) throw new StudentImportFileError('file');
	if (value.length > 4096) throw new StudentImportFileError('limit');
	for (const reference of value.trim().split(/\s+/u)) {
		const endpoints = reference.split(':');
		if (endpoints.length > 2) throw new StudentImportFileError('file');
		for (const endpoint of endpoints) {
			const match = /^(?:\$?([A-Z]+))?(?:\$?([0-9]+))?$/.exec(endpoint);
			if (!match || (!match[1] && !match[2]) || (!wholeRowsOrColumns && (!match[1] || !match[2]))) {
				throw new StudentImportFileError('file');
			}
			if (match[1]) boundedColumn(match[1]);
			if (match[2]) boundedIndex(match[2], MAX_WORKSHEET_ROWS);
		}
	}
}

function cleanXml(xml: string): string {
	const cleaned = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, '');
	if (/<!DOCTYPE|<!ENTITY/i.test(cleaned) || cleaned.includes('\0')) throw new StudentImportFileError('file');
	return cleaned;
}

function* xmlTags(xml: string) {
	for (const match of xml.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g)) {
		const attributes: Record<string, string> = Object.create(null);
		for (const attribute of match[3].matchAll(/([^\s=\/]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
			attributes[attribute[1]] = attribute[2].slice(1, -1);
		}
		yield { name: match[2], closing: match[1] === '/', attributes, end: match.index + match[0].length };
	}
}

function checkWorkbookXml(content: string): void {
	// Named ranges are materialized into cells by ExcelJS, independently of its
	// worksheet limits. Only bounded literal ranges are supported here.
	if (content.includes('<![CDATA[')) throw new StudentImportFileError('file');
	const xml = cleanXml(content);
	let sheets = 0;
	for (const tag of xmlTags(xml)) {
		if (tag.closing) continue;
		if (tag.name === 'sheet') {
			if (++sheets > 1) throw new StudentImportFileError('file');
			boundedIndex(tag.attributes.sheetId, MAX_WORKSHEET_ROWS);
		}
		if (tag.name !== 'definedName') continue;
		const end = xml.indexOf('</definedName', tag.end);
		if (end < 0) throw new StudentImportFileError('file');
		const text = xml.slice(tag.end, end);
		if (text.length > 4096) throw new StudentImportFileError('limit');
		if (text.includes('<') || /&#/.test(text)) throw new StudentImportFileError('file');
		const decoded = text.replace(/&(amp|apos|quot|lt|gt);/g, (_, entity: string) =>
			({ amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' })[entity]!
		);
		let quoted = false, start = 0;
		for (let index = 0; index <= decoded.length; index++) {
			if (decoded[index] === "'") {
				if (quoted && decoded[index + 1] === "'") { index++; continue; }
				quoted = !quoted;
			}
			if (index === decoded.length || (decoded[index] === ',' && !quoted)) {
				const range = decoded.slice(start, index).trim();
				boundedReference(range.slice(range.lastIndexOf('!') + 1), true);
				start = index + 1;
			}
		}
		if (quoted) throw new StudentImportFileError('file');
	}
	if (sheets !== 1) throw new StudentImportFileError('file');
}

function checkWorksheetXml(content: string, formulaCells: Set<string>): void {
	let row = 0, rowCount = 0, cellCount = 0, columnCount = 0, cellAddress = '';
	const rows = new Set<number>(), cells = new Set<string>();
	for (const tag of xmlTags(cleanXml(content))) {
		if (tag.closing) {
			if (tag.name === 'c') cellAddress = '';
			if (tag.name === 'row') row = 0;
			continue;
		}
		const attributes = tag.attributes;
		if (tag.name === 'row') {
			row = boundedIndex(attributes.r, MAX_WORKSHEET_ROWS);
			if (++rowCount > MAX_WORKSHEET_ROWS) throw new StudentImportFileError('limit');
			if (rows.has(row)) throw new StudentImportFileError('file');
			rows.add(row);
			cellCount = 0;
			if (attributes.spans) {
				if (!/^[0-9]+:[0-9]+$/.test(attributes.spans)) throw new StudentImportFileError('file');
				for (const index of attributes.spans.split(':')) boundedIndex(index, MAX_WORKSHEET_COLUMNS);
			}
		}
		if (tag.name === 'c') {
			boundedReference(attributes.r);
			const address = /^\$?([A-Z]+)\$?([0-9]+)$/.exec(attributes.r);
			if (!address || Number(address[2]) !== row) throw new StudentImportFileError('file');
			cellAddress = `${address[1]}${Number(address[2])}`;
			if (++cellCount > MAX_WORKSHEET_COLUMNS) throw new StudentImportFileError('limit');
			if (cells.has(cellAddress)) throw new StudentImportFileError('file');
			cells.add(cellAddress);
		}
		if (tag.name === 'col') {
			if (++columnCount > MAX_WORKSHEET_COLUMNS) throw new StudentImportFileError('limit');
			boundedIndex(attributes.min, MAX_WORKSHEET_COLUMNS);
			boundedIndex(attributes.max, MAX_WORKSHEET_COLUMNS);
		}
		if (attributes.ref) boundedReference(attributes.ref);
		if (attributes.sqref) boundedReference(attributes.sqref);
		if (tag.name === 'f' && cellAddress) formulaCells.add(cellAddress);
	}
}

function preflightWorkbook(bytes: Buffer): Set<string> {
	let end = -1;
	for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 65535); offset--) {
		if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
			end = offset;
			break;
		}
	}
	if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) {
		throw new StudentImportFileError('file');
	}
	const count = bytes.readUInt16LE(end + 10);
	const directorySize = bytes.readUInt32LE(end + 12), directoryStart = bytes.readUInt32LE(end + 16);
	if (!count || count === 0xffff || count !== bytes.readUInt16LE(end + 8) || directoryStart + directorySize !== end) {
		throw new StudentImportFileError('file');
	}
	if (count > MAX_ARCHIVE_ENTRIES) throw new StudentImportFileError('limit');
	let cursor = directoryStart, expandedBytes = 0, worksheets = 0, workbookFound = false;
	const names = new Set<string>(), formulaCells = new Set<string>();
	const intervals: { start: number; end: number }[] = [];
	for (let index = 0; index < count; index++) {
		if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new StudentImportFileError('file');
		const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
		const compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
		const nameSize = bytes.readUInt16LE(cursor + 28), extraSize = bytes.readUInt16LE(cursor + 30), commentSize = bytes.readUInt16LE(cursor + 32);
		const local = bytes.readUInt32LE(cursor + 42), next = cursor + 46 + nameSize + extraSize + commentSize;
		if (next > end || !nameSize || nameSize > 512 || bytes.readUInt16LE(cursor + 6) > 20 ||
			(flags & ~0x080e) !== 0 || (method !== 0 && method !== 8) || bytes.readUInt16LE(cursor + 34) !== 0 ||
			compressed === 0xffffffff || expanded === 0xffffffff || local + 30 > directoryStart) {
			throw new StudentImportFileError('file');
		}
		const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameSize);
		const name = nameBytes.toString('utf8');
		if (!/^[\x20-\x7e]+$/.test(name) || name.includes('\\') || name.startsWith('/') ||
			name.split('/').some((part) => part === '.' || part === '..') || names.has(name)) {
			throw new StudentImportFileError('file');
		}
		names.add(name);
		checkExtraFields(bytes, cursor + 46 + nameSize, extraSize, nameBytes);
		if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 4) > 20 ||
			bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) {
			throw new StudentImportFileError('file');
		}
		const localNameSize = bytes.readUInt16LE(local + 26), localExtraSize = bytes.readUInt16LE(local + 28);
		const dataStart = local + 30 + localNameSize + localExtraSize, dataEnd = dataStart + compressed;
		if (dataEnd > directoryStart || !bytes.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes)) {
			throw new StudentImportFileError('file');
		}
		checkExtraFields(bytes, local + 30 + localNameSize, localExtraSize, nameBytes);
		if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== bytes.readUInt32LE(cursor + 16) ||
			bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== expanded)) {
			throw new StudentImportFileError('file');
		}
		intervals.push({ start: local, end: dataEnd });
		const remaining = MAX_ARCHIVE_BYTES - expandedBytes;
		if (expanded > remaining) throw new StudentImportFileError('limit');
		let content: Buffer;
		try {
			const packed = bytes.subarray(dataStart, dataEnd);
			content = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: remaining + 1 });
		} catch (error) {
			if (error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
				throw new StudentImportFileError('limit');
			}
			throw new StudentImportFileError('file');
		}
		if (content.length > remaining) throw new StudentImportFileError('limit');
		if (content.length !== expanded || crc32(content) !== bytes.readUInt32LE(cursor + 16)) throw new StudentImportFileError('file');
		expandedBytes += content.length;
		if (name === 'xl/workbook.xml') {
			checkWorkbookXml(content.toString('utf8'));
			workbookFound = true;
		}
		if (/xl\/worksheets\/sheet[0-9]+\.xml/.test(name) && !name.endsWith('/')) {
			if (++worksheets > 1) throw new StudentImportFileError('file');
			checkWorksheetXml(content.toString('utf8'), formulaCells);
		}
		cursor = next;
	}
	intervals.sort((a, b) => a.start - b.start);
	if (cursor !== end || !workbookFound || worksheets !== 1 || intervals.some((entry, index) => index > 0 && entry.start < intervals[index - 1].end)) {
		throw new StudentImportFileError('file');
	}
	return formulaCells;
}

function isBlank(value: ExcelJS.CellValue): boolean {
	return value == null || (typeof value === 'string' && !value.trim() && !controls.test(value));
}

function readName(value: ExcelJS.CellValue): string | null {
	if (typeof value !== 'string' || controls.test(value)) return null;
	const name = value.trim();
	return name && name.length <= 100 ? name : null;
}

function readEmail(value: ExcelJS.CellValue): string | null {
	if (typeof value !== 'string') return null;
	try {
		const mailbox = parseMailbox(value);
		return !mailbox.name && mailbox.address === value.trim() ? mailbox.address.toLowerCase() : null;
	} catch {
		return null;
	}
}

function readPin(value: ExcelJS.CellValue): string | null {
	if (typeof value === 'string') return /^[0-9]{4}$/.test(value) ? value : null;
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999
		? String(value).padStart(4, '0') : null;
}

export async function parseStudentWorkbook(file: File): Promise<{ students: ImportedStudent[]; issues: ImportIssue[] }> {
	try {
		if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) throw new StudentImportFileError('file');
		if (file.size > MAX_IMPORT_BYTES) throw new StudentImportFileError('limit');
		if (!file.size) throw new StudentImportFileError('empty');
		const data = await file.arrayBuffer();
		if (data.byteLength > MAX_IMPORT_BYTES) throw new StudentImportFileError('limit');
		const formulaCells = preflightWorkbook(Buffer.from(data));
		const workbook = new ExcelJS.Workbook();
		// These count guards supplement the sparse-index checks above. Ignore
		// layout/validation features: only stored cell values belong in an import.
		const options = { maxRows: MAX_WORKSHEET_ROWS, maxCols: MAX_WORKSHEET_COLUMNS,
			ignoreNodes: ['mergeCells', 'dataValidations', 'conditionalFormatting', 'extLst', 'drawing', 'picture', 'tableParts'] };
		await workbook.xlsx.load(data, options);
		if (workbook.worksheets.length !== 1) throw new StudentImportFileError('file');
		const worksheet = workbook.worksheets[0];
		const rowCount = worksheet.rowCount, columnCount = worksheet.columnCount;
		if (rowCount > MAX_WORKSHEET_ROWS || columnCount > MAX_WORKSHEET_COLUMNS) throw new StudentImportFileError('limit');
		if (!rowCount) throw new StudentImportFileError('empty');
		const columns = new Map<StudentField, number>();
		const header = worksheet.getRow(1);
		for (let column = 1; column <= columnCount; column++) {
			const cell = header.getCell(column);
			if (typeof cell.value !== 'string' || formulaCells.has(cell.address)) continue;
			const heading = cell.value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_()\-]+/gu, '');
			const field = headerFields.get(heading);
			if (!field) continue;
			if (columns.has(field)) throw new StudentImportFileError('headers');
			columns.set(field, column);
		}
		if (columns.size !== fields.length) throw new StudentImportFileError('headers');
		const students: ImportedStudent[] = [], issues: ImportIssue[] = [];
		const emailRows = new Map<string, number[]>(), invalidRows = new Set<number>();
		let dataRows = 0;
		for (let row = 2; row <= rowCount; row++) {
			const values = worksheet.findRow(row);
			if (!values) continue;
			let blank = true;
			for (let column = 1; column <= columnCount; column++) {
				const cell = values.getCell(column);
				if (!isBlank(cell.value) || formulaCells.has(cell.address)) { blank = false; break; }
			}
			if (blank) continue;
			if (++dataRows > MAX_IMPORT_ROWS) throw new StudentImportFileError('limit');
			const codes = new Set<ImportIssue['code']>();
			const validate = (field: StudentField, reader: (value: ExcelJS.CellValue) => string | null, code: ImportIssue['code']) => {
				const cell = values.getCell(columns.get(field)!);
				if (formulaCells.has(cell.address) || (cell.value != null && typeof cell.value !== 'string' && typeof cell.value !== 'number')) {
					codes.add('cell');
					return null;
				}
				const value = reader(cell.value);
				if (value === null) codes.add(code);
				return value;
			};
			const firstName = validate('firstName', readName, 'name'), lastName = validate('lastName', readName, 'name');
			const email = validate('email', readEmail, 'email'), pin = validate('pin', readPin, 'pin');
			if (email !== null) {
				const rows = emailRows.get(email) ?? [];
				rows.push(row);
				emailRows.set(email, rows);
			}
			for (const code of codes) issues.push({ row, code });
			if (codes.size) invalidRows.add(row);
			if (firstName !== null && lastName !== null && email !== null && pin !== null) students.push({ row, firstName, lastName, email, pin });
		}
		if (!dataRows) throw new StudentImportFileError('empty');
		for (const rows of emailRows.values()) {
			if (rows.length < 2) continue;
			for (const row of rows) { issues.push({ row, code: 'duplicate' }); invalidRows.add(row); }
		}
		issues.sort((a, b) => a.row - b.row);
		return { students: students.filter((student) => !invalidRows.has(student.row)), issues };
	} catch (error) {
		if (error instanceof StudentImportFileError) throw error;
		throw new StudentImportFileError('file');
	}
}

export type Language = 'en' | 'es';

export const defaultLanguage: Language = 'en';
export const languageCookie = 'language';

export const languages = [
	{ code: 'en', name: 'English', short: 'EN', flag: '🇺🇸' },
	{ code: 'es', name: 'Español', short: 'ES', flag: '🇵🇷' }
] as const;

export function resolveLanguage(value: string | undefined): Language {
	return value === 'en' || value === 'es' ? value : defaultLanguage;
}

export function formatMessage(message: string, values: Record<string, string | number>): string {
	return message.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
		values[key] === undefined ? placeholder : String(values[key])
	);
}

const englishCoursesPreview = {
	pageTitle: 'Topic library preview | Masterminds ASVAB', description: 'Browse grouped course topics and lesson placeholders in the topic library preview.',
	label: 'Courses',

	part: 'Part 1 of 15', course: 'Fractions and Mixed Numbers', intro: 'Build the foundations, work through mixed numbers, then practice.',
	foundations: 'Fraction foundations', mixed: 'Mixed numbers', review: 'Practice & review',
	lesson: 'Lesson preview', placeholder: 'Your explanation will live here.', body: 'This is a layout placeholder, not course content. A Markdown document could fill this reading area, with optional interactive Svelte examples alongside it.',
	interactive: 'Interactive example area', interactiveNote: 'Optional space for a visual demonstration or a small exercise. Nothing is connected yet.',
	back: 'All topics', previous: 'Previous topic', next: 'Next topic', open: 'Open topic',
	topics: ['Simplifying Fractions', 'Adding and Subtracting Fractions', 'Multiplying and Dividing Fractions', 'Adding Mixed Numbers', 'Subtracting Mixed Numbers', 'Multiplying Mixed Numbers', 'Dividing Mixed Numbers', 'Practices', 'Answers']
};
const spanishCoursesPreview: typeof englishCoursesPreview = {
	pageTitle: 'Vista previa de la biblioteca de temas | Masterminds ASVAB', description: 'Explora temas de cursos agrupados y espacios de muestra para lecciones en la biblioteca de temas.',
	label: 'Cursos',

	part: 'Parte 1 de 15', course: 'Fracciones y números mixtos', intro: 'Aprende los fundamentos, trabaja con números mixtos y luego practica.',
	foundations: 'Fundamentos de fracciones', mixed: 'Números mixtos', review: 'Práctica y repaso',
	lesson: 'Vista previa de la lección', placeholder: 'Tu explicación irá aquí.', body: 'Este es un espacio de muestra, no contenido del curso. Un documento Markdown podría llenar esta área de lectura, con ejemplos interactivos opcionales de Svelte.',
	interactive: 'Área de ejemplo interactivo', interactiveNote: 'Espacio opcional para una demostración visual o un ejercicio breve. Todavía no está conectado.',
	back: 'Todos los temas', previous: 'Tema anterior', next: 'Tema siguiente', open: 'Abrir tema',
	topics: ['Simplificar fracciones', 'Sumar y restar fracciones', 'Multiplicar y dividir fracciones', 'Sumar números mixtos', 'Restar números mixtos', 'Multiplicar números mixtos', 'Dividir números mixtos', 'Prácticas', 'Respuestas']
};

const englishAdmin = {
	pageTitle: 'Admin command center | Masterminds ASVAB',
	description: 'Masterminds administration workspace with a database-backed student roster and fictional subject scores.',
		roster: {
			edit: { title: 'Edit student', save: 'Save changes', saving: 'Saving…', success: 'Changes saved.', firstName: 'First name', lastName: 'Last name', email: 'Email', dateOfBirth: 'Date of birth', gender: 'Gender', genders: { none: 'Not recorded', male: 'Male', female: 'Female' }, readonly: 'Read-only system fields', id: 'Student ID', createdAt: 'Created', updatedAt: 'Updated', fixture: 'Fixture marker', scores: 'Demo subject scores', scoreHelp: 'Enter four integers from 0 to 100, or leave all four blank to remove the demo scores.', invitedNote: 'Setting the status to Invited alone does not send an invitation or an email.', linkedEmailNote: 'This login email cannot be changed in the roster.', errors: { invalid: 'Check required names, email, birth date (not in the future), options, and all four integer scores (0–100).', duplicate: 'Another student already uses this email.', linkedEmail: 'Login emails cannot be changed in the roster.', missing: 'This student no longer exists. Refresh the roster.', storage: 'Changes could not be saved. Please try again.' } },
			title: 'Student roster', total: 'Total students', student: 'Student', classType: 'Class type', status: 'Status', connected: 'Connected',
			readOnly: 'Loaded from PostgreSQL. Profile and demo-score edits are saved to the database.',
			workspaceNote: 'The roster and invitations are connected to PostgreSQL. Subject scores are fictional fixtures. Payment and report tools remain previews.',
			fixtureNote: 'AR, PC, WK, and MK values are made-up local fixtures on a 0–100 display range. They are not validated ASVAB scores or official percentiles.',
			searchLabel: 'Search students', search: 'Search name, email, ID, or class type', filterLabel: 'Filter by student status',
			count: '{count} students', empty: 'No students match your search.', noScore: 'No subject score recorded',
			statuses: { all: 'All statuses', active: 'Active', inactive: 'Inactive', invited: 'Invited' }, classes: { basic: 'Basic', regular: 'Regular' },
			abbreviations: { ar: 'AR', pc: 'PC', wk: 'WK', mk: 'MK' },
			subjects: { ar: 'Arithmetic Reasoning', pc: 'Paragraph Comprehension', wk: 'Word Knowledge', mk: 'Mathematics Knowledge' }
		},
	console: 'Command console', workspace: 'Program operations',
	navigation: 'Admin navigation', backToStudents: 'Student workspace', topLabel: 'Administration',
	prototype: 'Design preview',
	footer: 'Masterminds / Operations', version: 'Prototype v0.1',
	sections: { overview: 'Overview', students: 'Students', payments: 'Payments', invitations: 'Invitations', reports: 'Grade reports' },
	intro: {
		overview: { eyebrow: 'Your program. In full view.', title: 'Command center', description: 'A clear picture of your students. Every next move within reach.' },
		students: { eyebrow: 'Personnel / 01', title: 'Student roster', description: 'View your database-backed students and their subject scores.' },
		payments: { eyebrow: 'Finance / 02', title: 'Payment operations', description: 'Preview payment links and refund workflows. No real transactions.' },
		invitations: { eyebrow: 'Recruitment / 03', title: 'Program invitations', description: 'Give your next students a clear route into the program.' },
		reports: { eyebrow: 'Intelligence / 04', title: 'Grade reports', description: 'A staging area for student results. Preview a CSV before the real import is connected.' }
	},
	common: {
		sampleData: 'Sample data', localOnly: 'Local preview only',
		cancel: 'Cancel', close: 'Close', copy: 'Copy link',
		copied: 'Preview link copied. It is not a working program link.', copyFailed: 'Clipboard unavailable. Select and copy the preview link below.',
		created: 'Preview created. Nothing was sent or saved to a server.', actions: 'Actions',
		selectStudent: 'Select a student', required: 'Complete the required fields.',
		notAvailable: '—', usd: 'USD', demoLink: 'Nonfunctional preview link',
	},
	overview: {
		quickActions: 'Quick actions', createPayment: 'Payment link', inviteStudent: 'Invite student', uploadGrades: 'Upload grades',
		systems: 'System connections', database: 'Student database', billing: 'Payment provider', scheduling: 'Event scheduling', awaiting: 'Awaiting integration'
	},
	payments: {
		createTitle: 'Create a payment link', createDescription: 'Set up a preview of a program payment. Real checkout will be connected later.',
		label: 'Payment name', labelPlaceholder: 'e.g. ASVAB preparation program', amount: 'Amount (USD)', amountPlaceholder: '250.00',
		generate: 'Generate preview link', linksTitle: 'Payment links', linksDescription: 'Preview links are intentionally nonfunctional.',
		sampleName: 'ASVAB preparation program', draft: 'Preview only',
		refundsTitle: 'Refund queue', refundsDescription: 'A sample request to explore the review flow.', refundReason: 'Student requested cancellation',
		refundRequested: 'Requested', refundReviewed: 'Reviewed in preview', reviewRefund: 'Review request',
		refundTitle: 'Review a refund', refundNote: 'This marks a fictional request as reviewed. It does not issue a refund or contact a payment provider.',
		confirmRefund: 'Mark reviewed in preview', refundSuccess: 'Demo request reviewed. No money was refunded.',
		invalidAmount: 'Enter a payment name and an amount between $1 and $10,000.', recipient: 'Recipient',
	},
	studentImport: {
		pageTitle: 'Student invitations | Masterminds ASVAB',
		description: 'Review an Excel student list, confirm enrollment invitations, and track saved invitations and email send status.',
		title: 'Import students & send invitations', uploadDescription: 'Preview your Excel file first. Students are created and invitations sent only after you confirm.',
		file: 'Student Excel file', fileHint: '.xlsx · Up to 2 MB · Up to 100 students · One worksheet',
		template: 'Download Excel template',
		formatHint: 'Use a header row with first_name, last_name, email, pin. Spanish column aliases are also supported.',
		pinHint: 'Numeric PINs are padded to four digits. PINs are never displayed here or included in invitation emails.',
		conflictNote: 'Existing email addresses are conflicts, not updates. Existing accounts will not be overwritten.',
		emailLanguage: 'Invitation email language', languages: { en: 'English', es: 'Spanish' },
		preview: 'Preview students', previewing: 'Checking file…', confirm: 'Confirm import & send invitations', importing: 'Importing & sending…',
		previewTitle: 'Review students', rowsCount: '{count} valid rows', row: 'Excel row', issueRow: 'Row {row}',
		previewOnly: 'No students have been created and no emails have been sent. Review the names and email addresses below.',
		reviewReady: 'All rows passed validation. Ready for confirmation.',
		reviewChanged: 'Preview the file and selected options before confirming. Any change requires a new preview.',
		confirmNote: 'Confirming creates these students and sends an invitation email to each address. Links expire after seven days.',
		noScript: 'Without JavaScript, select the same file again after previewing, then confirm. The server checks that the file and selected options match the review.',
		issuesTitle: 'Correct these rows before importing',
		issues: {
			name: 'First and last names are required, with up to 100 characters each.',
			email: 'Enter a valid email address.', pin: 'Use a four-digit PIN.',
			duplicate: 'This email appears more than once in the file.',
			cell: 'A cell contains an unsupported value. Use plain text or numbers.',
			exists: 'This email already belongs to an account. It will not be overwritten.'
		},
		errors: {
			file: 'Choose a nonempty .xlsx file no larger than 2 MB with one worksheet.',
			headers: 'Check the header row: first_name, last_name, email, pin. Spanish aliases are also supported.',
			empty: 'The file contains no student rows.', limit: 'Use one worksheet with no more than 100 students.',
			invalid: 'Correct the file and preview it again before importing.',
			conflict: 'An email already belongs to an account. No existing account is overwritten. Correct the file and preview again.',
			review: 'The review is missing, expired, or does not match this file and its options. Preview again before confirming.',
			unavailable: 'Invitations are unavailable right now. Check the saved list before trying again.',
			storage: 'The operation could not be saved. Check the saved invitations before trying again.'
		},
		importTitle: 'Import results', importSummary: '{created} students created · {sent} sends accepted by Gmail · {failed} sends not confirmed',
		testMode: 'Test mode', testModeNote: 'Test mode sends real emails through Gmail, redirected only to the configured sender. Each message has [TEST] in the subject and a summary of the original recipient. Email content is still sent to Google.',
		listTitle: 'Saved invitations', listDescription: 'Saved invitations by page, including unconfirmed and unfinished sends.',
		pagination: 'Invitation pages', previousPage: 'Previous', nextPage: 'Next', pageLabel: 'Page {page}',
		listCount: '{count} invitations', listEmpty: 'No saved invitations on this page.', timeZone: 'Times shown in UTC.',
		acceptance: 'Enrollment acceptance', accepted: 'Accepted', awaitingAcceptance: 'Not accepted',
		delivery: 'Email send status', deliveryStates: { pending: 'Pending send', sending: 'Send in progress', sent: 'Accepted by Gmail', failed: 'Send not confirmed' },
		deliveryHint: 'Accepted by Gmail means Gmail acknowledged the email for sending, not proof of delivery or enrollment acceptance. Send not confirmed means no acknowledgment was confirmed; the email may still have been sent.',
		expiresAt: 'Link expires', sentAt: 'Send accepted at',
		resend: 'Resend invitation', resending: 'Resending…', resendLabel: 'Resend invitation to {name}; invalidate the previous link',
		resendNote: 'Resending invalidates the previous link and creates a new link valid for seven days. Wait at least one minute between send attempts. Unconfirmed or unfinished sends are not retried automatically.',
		resendSuccess: 'The resend was accepted. Check the saved email send status below.',
		resendErrors: { invalid: 'This invitation cannot be resent right now. If you recently attempted to send it, wait at least one minute, then refresh the saved list before trying again.', unavailable: 'The send could not be confirmed. The email may already have been sent. Check the saved send status before trying again.', storage: 'The resend record could not be saved. Check the saved invitation before trying again; an email may already have been sent.' },
		email: {
			subject: 'Complete your Masterminds enrollment',
			body: 'Hello {name},\n\nComplete your Masterminds enrollment here:\n{url}\n\nThis link expires in seven days. Sign in with your provided email address and your existing four-digit PIN. Your PIN is not included in this email.\n\nMasterminds ASVAB'
		}
	},
	reports: {
		uploadTitle: 'Grade import staging', uploadDescription: 'Choose a CSV to inspect its name and size. This prototype does not parse grades or update students.',
		dropTitle: 'Your next report starts here', dropDescription: 'CSV files up to 5 MB · local file selection only', choose: 'Choose a CSV', inputLabel: 'Select a student grade CSV for preview',
		formatTitle: 'Suggested file format', formatDescription: 'An illustrative format, not a database contract. Final columns will follow the new schema.',
		template: 'Download sample CSV', fileName: 'masterminds-grades-sample.csv',
		selected: 'File staged locally', remove: 'Remove file', size: 'File size',
		notImported: 'Not imported. CSV validation, student matching, and persistence will be wired up later.', invalidFile: 'Choose a .csv file no larger than 5 MB.',
		historyTitle: 'Report history', historyDescription: 'Sample uploads to show the future review experience.',
		rows: 'Student rows', reviewed: 'Sample reviewed', pending: 'Sample awaiting review',
		columns: { student: 'Student ID', score: 'Practice score', date: 'Assessment date' },
		steps: { one: 'Select a report', two: 'Validate & match students', three: 'Review & import' }, future: 'Future integration',
	},
};

const spanishAdmin: typeof englishAdmin = {
	pageTitle: 'Centro de mando administrativo | Masterminds ASVAB',
	description: 'Espacio administrativo de Masterminds con registro estudiantil conectado a la base de datos y puntuaciones ficticias por materia.',
		roster: {
			edit: { title: 'Editar estudiante', save: 'Guardar cambios', saving: 'Guardando…', success: 'Cambios guardados.', firstName: 'Nombre', lastName: 'Apellido', email: 'Correo electrónico', dateOfBirth: 'Fecha de nacimiento', gender: 'Género', genders: { none: 'Sin registrar', male: 'Masculino', female: 'Femenino' }, readonly: 'Campos del sistema de solo lectura', id: 'ID del estudiante', createdAt: 'Creado', updatedAt: 'Actualizado', fixture: 'Indicador de datos ficticios', scores: 'Puntuaciones ficticias por materia', scoreHelp: 'Introduce cuatro enteros de 0 a 100, o deja los cuatro vacíos para eliminar las puntuaciones ficticias.', invitedNote: 'Cambiar el estado a Invitado por sí solo no envía una invitación ni un correo.', linkedEmailNote: 'Este correo de inicio de sesión no se puede cambiar en el registro.', errors: { invalid: 'Revisa los nombres obligatorios, correo, fecha de nacimiento (no futura), opciones y las cuatro puntuaciones enteras (0–100).', duplicate: 'Otro estudiante ya usa este correo.', linkedEmail: 'El correo de inicio de sesión no se puede cambiar en el registro.', missing: 'Este estudiante ya no existe. Actualiza el registro.', storage: 'No se pudieron guardar los cambios. Inténtalo de nuevo.' } },
			title: 'Registro estudiantil', total: 'Total de estudiantes', student: 'Estudiante', classType: 'Tipo de clase', status: 'Estado', connected: 'Conectado',
			readOnly: 'Datos de PostgreSQL. Los cambios del perfil y las puntuaciones ficticias se guardan en la base de datos.',
			workspaceNote: 'El registro y las invitaciones están conectados a PostgreSQL. Las puntuaciones por materia son ficticias. Las herramientas de pagos e informes siguen siendo vistas previas.',
			fixtureNote: 'Los valores de AR, PC, WK y MK son datos ficticios locales en un rango visual de 0–100. No son puntuaciones ASVAB validadas ni percentiles oficiales.',
			searchLabel: 'Buscar estudiantes', search: 'Busca nombre, correo, ID o tipo de clase', filterLabel: 'Filtrar por estado del estudiante',
			count: '{count} estudiantes', empty: 'Ningún estudiante coincide con tu búsqueda.', noScore: 'Sin puntuación registrada para la materia',
			statuses: { all: 'Todos los estados', active: 'Activo', inactive: 'Inactivo', invited: 'Invitado' }, classes: { basic: 'Básico', regular: 'Regular' },
			abbreviations: { ar: 'AR', pc: 'PC', wk: 'WK', mk: 'MK' },
			subjects: { ar: 'Razonamiento aritmético', pc: 'Comprensión de párrafos', wk: 'Conocimiento de palabras', mk: 'Conocimiento matemático' }
		},
	console: 'Consola de mando', workspace: 'Operaciones del programa',
	navigation: 'Navegación administrativa', backToStudents: 'Espacio del estudiante', topLabel: 'Administración',
	prototype: 'Vista previa del diseño',
	footer: 'Masterminds / Operaciones', version: 'Prototipo v0.1',
	sections: { overview: 'Resumen', students: 'Estudiantes', payments: 'Pagos', invitations: 'Invitaciones', reports: 'Informes de notas' },
	intro: {
		overview: { eyebrow: 'Tu programa. A plena vista.', title: 'Centro de mando', description: 'Una vista clara de tus estudiantes. Cada próximo paso a tu alcance.' },
		students: { eyebrow: 'Personal / 01', title: 'Registro estudiantil', description: 'Consulta tus estudiantes de la base de datos y sus puntuaciones por materia.' },
		payments: { eyebrow: 'Finanzas / 02', title: 'Operaciones de pago', description: 'Explora enlaces de pago y reembolsos. Sin transacciones reales.' },
		invitations: { eyebrow: 'Reclutamiento / 03', title: 'Invitaciones al programa', description: 'Dale a tus próximos estudiantes una ruta clara para entrar al programa.' },
		reports: { eyebrow: 'Inteligencia / 04', title: 'Informes de notas', description: 'Un espacio para preparar resultados. Selecciona un CSV antes de conectar la importación real.' }
	},
	common: {
		sampleData: 'Datos de ejemplo', localOnly: 'Solo vista previa local',
		cancel: 'Cancelar', close: 'Cerrar', copy: 'Copiar enlace',
		copied: 'Enlace de ejemplo copiado. No es un enlace funcional del programa.', copyFailed: 'Portapapeles no disponible. Selecciona y copia el enlace de ejemplo.',
		created: 'Vista previa creada. No se envió ni se guardó nada en un servidor.', actions: 'Acciones',
		selectStudent: 'Selecciona un estudiante', required: 'Completa los campos requeridos.',
		notAvailable: '—', usd: 'USD', demoLink: 'Enlace de ejemplo no funcional',
	},
	overview: {
		quickActions: 'Acciones rápidas', createPayment: 'Enlace de pago', inviteStudent: 'Invitar estudiante', uploadGrades: 'Subir notas',
		systems: 'Conexiones del sistema', database: 'Base de datos estudiantil', billing: 'Proveedor de pagos', scheduling: 'Calendario de eventos', awaiting: 'Pendiente de integración'
	},
	payments: {
		createTitle: 'Crear un enlace de pago', createDescription: 'Prepara un ejemplo de pago del programa. El cobro real se conectará más adelante.',
		label: 'Nombre del pago', labelPlaceholder: 'p. ej., Programa de preparación ASVAB', amount: 'Importe (USD)', amountPlaceholder: '250.00',
		generate: 'Generar enlace de ejemplo', linksTitle: 'Enlaces de pago', linksDescription: 'Los enlaces de ejemplo no son funcionales.',
		sampleName: 'Programa de preparación ASVAB', draft: 'Solo vista previa',
		refundsTitle: 'Solicitudes de reembolso', refundsDescription: 'Una solicitud ficticia para explorar el proceso de revisión.', refundReason: 'El estudiante solicitó cancelar',
		refundRequested: 'Solicitado', refundReviewed: 'Revisado en vista previa', reviewRefund: 'Revisar solicitud',
		refundTitle: 'Revisar un reembolso', refundNote: 'Esto marca una solicitud ficticia como revisada. No emite un reembolso ni contacta un proveedor de pagos.',
		confirmRefund: 'Marcar revisado en vista previa', refundSuccess: 'Solicitud de ejemplo revisada. No se reembolsó dinero.',
		invalidAmount: 'Ingresa un nombre de pago y un importe entre $1 y $10,000.', recipient: 'Destinatario',
	},
	studentImport: {
		pageTitle: 'Invitaciones estudiantiles | Masterminds ASVAB',
		description: 'Revisa una lista de estudiantes en Excel, confirma las invitaciones de matrícula y consulta las invitaciones guardadas y el estado del envío de correos.',
		title: 'Importar estudiantes y enviar invitaciones', uploadDescription: 'Revisa primero tu archivo de Excel. Los estudiantes se crean y las invitaciones se envían solo cuando confirmas.',
		file: 'Archivo Excel de estudiantes', fileHint: '.xlsx · Hasta 2 MB · Hasta 100 estudiantes · Una hoja',
		template: 'Descargar plantilla de Excel',
		formatHint: 'Usa una fila de encabezados con first_name, last_name, email, pin. También se admiten los alias de columnas en español.',
		pinHint: 'Los PIN numéricos se completan con ceros hasta cuatro dígitos. Los PIN nunca se muestran aquí ni se incluyen en los correos de invitación.',
		conflictNote: 'Los correos existentes son conflictos, no actualizaciones. No se sobrescriben las cuentas existentes.',
		emailLanguage: 'Idioma del correo de invitación', languages: { en: 'Inglés', es: 'Español' },
		preview: 'Revisar estudiantes', previewing: 'Revisando archivo…', confirm: 'Confirmar importación y enviar invitaciones', importing: 'Importando y enviando…',
		previewTitle: 'Revisar estudiantes', rowsCount: '{count} filas válidas', row: 'Fila de Excel', issueRow: 'Fila {row}',
		previewOnly: 'No se han creado estudiantes ni enviado correos. Revisa los nombres y las direcciones de correo a continuación.',
		reviewReady: 'Todas las filas pasaron la validación. Puedes confirmar.',
		reviewChanged: 'Revisa el archivo y las opciones seleccionadas antes de confirmar. Cualquier cambio requiere una nueva revisión.',
		confirmNote: 'Al confirmar, se crean estos estudiantes y se envía un correo de invitación a cada dirección. Los enlaces vencen en siete días.',
		noScript: 'Sin JavaScript, vuelve a seleccionar el mismo archivo después de revisarlo y luego confirma. El servidor verifica que el archivo y las opciones seleccionadas coincidan con la revisión.',
		issuesTitle: 'Corrige estas filas antes de importar',
		issues: {
			name: 'El nombre y el apellido son obligatorios, con hasta 100 caracteres cada uno.',
			email: 'Ingresa una dirección de correo válida.', pin: 'Usa un PIN de cuatro dígitos.',
			duplicate: 'Este correo aparece más de una vez en el archivo.',
			cell: 'Una celda contiene un valor no admitido. Usa texto simple o números.',
			exists: 'Este correo ya pertenece a una cuenta. No se sobrescribirá.'
		},
		errors: {
			file: 'Selecciona un archivo .xlsx no vacío de hasta 2 MB con una sola hoja.',
			headers: 'Revisa los encabezados: first_name, last_name, email, pin. También se admiten alias en español.',
			empty: 'El archivo no contiene filas de estudiantes.', limit: 'Usa una sola hoja con un máximo de 100 estudiantes.',
			invalid: 'Corrige el archivo y vuelve a revisarlo antes de importar.',
			conflict: 'Un correo ya pertenece a una cuenta. No se sobrescribe ninguna cuenta existente. Corrige el archivo y vuelve a revisarlo.',
			review: 'La revisión falta, venció o no coincide con este archivo y sus opciones. Vuelve a revisarlos antes de confirmar.',
			unavailable: 'Las invitaciones no están disponibles ahora. Consulta la lista guardada antes de intentarlo de nuevo.',
			storage: 'No se pudo guardar la operación. Consulta las invitaciones guardadas antes de intentarlo de nuevo.'
		},
		importTitle: 'Resultados de importación', importSummary: '{created} estudiantes creados · {sent} envíos aceptados por Gmail · {failed} envíos no confirmados',
		testMode: 'Modo de prueba', testModeNote: 'El modo de prueba envía correos reales a través de Gmail, redirigidos únicamente al remitente configurado. Cada mensaje lleva [TEST] en el asunto y un resumen del destinatario original. El contenido del correo se sigue enviando a Google.',
		listTitle: 'Invitaciones guardadas', listDescription: 'Invitaciones guardadas por página, incluidos los envíos no confirmados y sin finalizar.',
		pagination: 'Páginas de invitaciones', previousPage: 'Anterior', nextPage: 'Siguiente', pageLabel: 'Página {page}',
		listCount: '{count} invitaciones', listEmpty: 'No hay invitaciones guardadas en esta página.', timeZone: 'Horas mostradas en UTC.',
		acceptance: 'Aceptación de matrícula', accepted: 'Aceptada', awaitingAcceptance: 'Sin aceptar',
		delivery: 'Estado del envío de correo', deliveryStates: { pending: 'Envío pendiente', sending: 'Envío en curso', sent: 'Aceptado por Gmail', failed: 'Envío no confirmado' },
		deliveryHint: 'Aceptado por Gmail significa que Gmail confirmó que aceptó el correo para enviarlo, no que se entregó o se aceptó la matrícula. Envío no confirmado significa que no hay un acuse confirmado; el correo puede haberse enviado de todos modos.',
		expiresAt: 'El enlace vence', sentAt: 'Envío aceptado el',
		resend: 'Reenviar invitación', resending: 'Reenviando…', resendLabel: 'Reenviar invitación a {name}; invalidar el enlace anterior',
		resendNote: 'Al reenviar, se invalida el enlace anterior y se crea uno nuevo válido por siete días. Espera al menos un minuto entre intentos de envío. Los envíos no confirmados o sin finalizar no se reintentan automáticamente.',
		resendSuccess: 'Se aceptó el reenvío. Consulta el estado guardado del envío de correo a continuación.',
		resendErrors: { invalid: 'Esta invitación no se puede reenviar ahora. Si intentaste enviarla recientemente, espera al menos un minuto y luego actualiza la lista guardada antes de volver a intentarlo.', unavailable: 'No se pudo confirmar el envío. El correo puede haberse enviado ya. Consulta el estado guardado del envío antes de intentarlo de nuevo.', storage: 'No se pudo guardar el registro del reenvío. Consulta la invitación guardada antes de intentarlo de nuevo; el correo puede haberse enviado ya.' },
		email: {
			subject: 'Completa tu matrícula en Masterminds',
			body: 'Hola {name},\n\nCompleta tu matrícula en Masterminds aquí:\n{url}\n\nEste enlace vence en siete días. Inicia sesión con el correo que se te proporcionó y tu PIN existente de cuatro dígitos. Tu PIN no se incluye en este correo.\n\nMasterminds ASVAB'
		}
	},
	reports: {
		uploadTitle: 'Preparación de importación', uploadDescription: 'Selecciona un CSV para ver su nombre y tamaño. Este prototipo no lee notas ni actualiza estudiantes.',
		dropTitle: 'Tu próximo informe comienza aquí', dropDescription: 'Archivos CSV de hasta 5 MB · solo selección local', choose: 'Seleccionar un CSV', inputLabel: 'Seleccionar un CSV de notas para vista previa',
		formatTitle: 'Formato sugerido', formatDescription: 'Un formato ilustrativo, no un contrato de base de datos. Las columnas definitivas seguirán el nuevo esquema.',
		template: 'Descargar CSV de ejemplo', fileName: 'masterminds-notas-ejemplo.csv',
		selected: 'Archivo preparado localmente', remove: 'Quitar archivo', size: 'Tamaño del archivo',
		notImported: 'No importado. La validación del CSV, la identificación de estudiantes y el guardado se conectarán más adelante.', invalidFile: 'Selecciona un archivo .csv de hasta 5 MB.',
		historyTitle: 'Historial de informes', historyDescription: 'Cargas ficticias para mostrar la futura experiencia de revisión.',
		rows: 'Filas de estudiantes', reviewed: 'Ejemplo revisado', pending: 'Ejemplo pendiente de revisión',
		columns: { student: 'ID del estudiante', score: 'Puntuación de práctica', date: 'Fecha de evaluación' },
		steps: { one: 'Seleccionar informe', two: 'Validar y vincular estudiantes', three: 'Revisar e importar' }, future: 'Integración futura',
	},
};

const englishEnrollment = {
	pageTitle: 'Complete enrollment | Masterminds ASVAB',
	description: 'Sign in with your existing student PIN and complete your Masterminds enrollment.',
	title: 'Complete your enrollment', navigation: 'Enrollment', formTitle: 'Student enrollment details',
	introduction: 'Confirm your details to accept your invitation.',
	signInTitle: 'Sign in to continue', signInInstruction: 'Use your provided email address and existing four-digit PIN to complete enrollment.',
	invalidTitle: 'Invitation unavailable', invalidDescription: 'This invitation cannot be used with your current session. Sign in with the account it was sent to, or ask an administrator for a new invitation.',
	completeTitle: 'Thank you. Your enrollment is complete.', workspace: 'Open student workspace',
	fields: { firstName: 'First name', lastName: 'Last name', email: 'Email address', classType: 'Class type', dateOfBirth: 'Date of birth', gender: 'Gender' },
	classes: { basic: 'Basic', regular: 'Regular' }, genders: { male: 'Male', female: 'Female' },
	assignedHint: 'Your email address and class type are assigned by an administrator and cannot be changed here.',
	birthDateHint: 'Enter a valid birth date, not in the future.',
	submit: 'Complete enrollment', saving: 'Saving enrollment…',
	errors: {
		invalid: 'Check your required names (up to 100 characters each), birth date (not in the future), and gender.',
		invitation: 'This invitation is no longer available for this session. Sign in with the invited account or request a new invitation.',
		storage: 'Your enrollment could not be saved. Please try again.'
	}
};
const spanishEnrollment: typeof englishEnrollment = {
	pageTitle: 'Completar matrícula | Masterminds ASVAB',
	description: 'Inicia sesión con tu PIN estudiantil existente y completa tu matrícula en Masterminds.',
	title: 'Completa tu matrícula', navigation: 'Matrícula', formTitle: 'Datos de matrícula del estudiante',
	introduction: 'Confirma tus datos para aceptar tu invitación.',
	signInTitle: 'Inicia sesión para continuar', signInInstruction: 'Usa el correo que se te proporcionó y tu PIN existente de cuatro dígitos para completar la matrícula.',
	invalidTitle: 'Invitación no disponible', invalidDescription: 'Esta invitación no se puede usar con tu sesión actual. Inicia sesión con la cuenta a la que se envió o solicita una nueva invitación a un administrador.',
	completeTitle: 'Gracias. Tu matrícula está completa.', workspace: 'Abrir espacio del estudiante',
	fields: { firstName: 'Nombre', lastName: 'Apellido', email: 'Correo electrónico', classType: 'Tipo de clase', dateOfBirth: 'Fecha de nacimiento', gender: 'Género' },
	classes: { basic: 'Básico', regular: 'Regular' }, genders: { male: 'Masculino', female: 'Femenino' },
	assignedHint: 'Un administrador asigna tu correo y tipo de clase; no se pueden cambiar aquí.',
	birthDateHint: 'Ingresa una fecha de nacimiento válida que no sea futura.',
	submit: 'Completar matrícula', saving: 'Guardando matrícula…',
	errors: {
		invalid: 'Revisa los nombres obligatorios (hasta 100 caracteres cada uno), la fecha de nacimiento (no futura) y el género.',
		invitation: 'Esta invitación ya no está disponible para esta sesión. Inicia sesión con la cuenta invitada o solicita una nueva invitación.',
		storage: 'No se pudo guardar tu matrícula. Inténtalo de nuevo.'
	}
};

const englishAttendance = {
	pageTitle: 'Attendance certificate | Masterminds ASVAB',
	description: 'Generate a bilingual employer letter with your Masterminds ASVAB program start date and weekly class schedule.',
	eyebrow: 'Employer documents',
	title: 'Attendance certificate',
	introduction: 'Create a letter for your employer explaining your participation in the ASVAB preparation program and requesting flexibility for your weekly classes.',

	studentDetails: 'Student details',
	studentDetailsHint: 'Enter your full name as it should appear in the letter.',
	programDetails: 'Program and schedule',
	programDetailsHint: 'Choose your cohort and class time. The letter uses that time for all your weekly class days.',
	employerDetails: 'Employer details',
	employerDetailsHint: 'Address the letter to the person who manages your work schedule.',
	fields: {
		studentName: 'Student name', studentSex: 'Sex', programStartDate: 'Program start date',
		cohort: 'Cohort', classTime: 'Class time', employerName: 'Employer contact name', employerPosition: 'Employer contact position',
		employerWorkplace: 'Workplace'
	},
	sexOptions: { male: 'Male', female: 'Female' },
	cohortOptions: { basic: 'Basic', regular: 'Regular' },
	classTimeOptions: { am: 'AM · {startTime}–{endTime}', pm: 'PM · {startTime}–{endTime}' },
	hints: {
		studentSex: 'Determines the grammatical wording in the Spanish letter (aceptado/aceptada).',
		programStartDate: 'The date you started the preparation program.',
		employerPosition: 'For example, supervisor, manager, owner, or human resources.'
	},
	scheduleLabel: 'Weekly class schedule',
	schedules: {
		basic: 'on Mondays, Wednesdays, and Fridays from {startTime} to {endTime}',
		regular: 'on Mondays, Tuesdays, Thursdays, and Fridays from {startTime} to {endTime}'
	},
	submit: 'Generate certificate', submitting: 'Generating PDFs…',
	errorSummary: 'Please correct the highlighted fields before generating your certificate.',
	errors: {
		required: 'This field is required.', text: 'Enter text on a single line with no hidden control characters.',
		length: 'This entry is too long. Please shorten it.',
		characters: 'This entry contains characters not supported by the English/Spanish PDF fonts. Please contact the program if your name needs these characters.',
		sex: 'Choose male or female for the Spanish wording.',
		date: 'Enter a valid calendar date.', cohort: 'Choose the Basic or Regular cohort.',
		classTime: 'Choose the AM or PM class time.'
	},
	serverError: 'We could not generate your certificate. Your entries have been kept; please try again.',
	resultsTitle: 'Your certificate is ready',
	ready: 'Download either language and share the PDF with your employer.',
	previewTitle: 'Letter preview',
	snapshotNote: 'This letter reflects the submitted details. Generate it again after changing any entries. Changing the website language does not change its issue date.',
	downloadEnglish: 'Download English PDF', downloadSpanish: 'Download Spanish PDF',
	document: {
		title: 'Attendance Certificate',
		openingMale: 'We hereby certify that Ms. Claudine Menéndez, on behalf of Masterminds Programa ASVAB, confirms that {studentName} has been accepted into our comprehensive preparation program with the goal of joining the United States Armed Forces.',
		openingFemale: 'We hereby certify that Ms. Claudine Menéndez, on behalf of Masterminds Programa ASVAB, confirms that {studentName} has been accepted into our comprehensive preparation program with the goal of joining the United States Armed Forces.',
		participation: 'Since {startDate}, {shortName} has been part of our program. The student will attend classes {schedule} as part of their preparation.',
		accommodation: 'We kindly ask you to consider the commitment made by {shortName} and, whenever possible, adjust their work availability. This will allow the student to fulfill both their current workplace responsibilities and the personal and professional goals they have set in this important process.',
		gratitude: 'We thank you in advance for your understanding and support in this shared effort to foster the personal and professional development of {shortName}.',
		issuance: 'For the relevant purposes, this certificate is issued in {city}, Puerto Rico, today, {issueDate}. For any questions, please contact us at {phone}.',
		signatory: 'Claudine Menéndez, Representative', role: 'Masterminds Repaso ASVAB',
		phone: '(939) 408-0440', email: 'mastermindsprogramaasvab@gmail.com', city: 'San Juan'
	}
};

const spanishAttendance: typeof englishAttendance = {
	pageTitle: 'Certificado de asistencia | Masterminds ASVAB',
	description: 'Genera una carta bilingüe para tu patrono con tu fecha de inicio en Masterminds Programa ASVAB y tu horario de clases semanales.',
	eyebrow: 'Documentos para tu patrono',
	title: 'Certificado de asistencia',
	introduction: 'Prepara una carta para tu patrono que explique tu participación en el programa de preparación ASVAB y solicite flexibilidad para asistir a tus clases semanales.',

	studentDetails: 'Datos del estudiante',
	studentDetailsHint: 'Escribe tu nombre completo como debe aparecer en la carta.',
	programDetails: 'Programa y horario',
	programDetailsHint: 'Selecciona tu cohorte y horario. La carta usa ese horario para todos tus días de clases semanales.',
	employerDetails: 'Datos del patrono',
	employerDetailsHint: 'Dirige la carta a la persona que coordina tu horario de trabajo.',
	fields: {
		studentName: 'Nombre del estudiante', studentSex: 'Sexo', programStartDate: 'Fecha de inicio en el programa',
		cohort: 'Cohorte', classTime: 'Horario de clases', employerName: 'Nombre del patrono', employerPosition: 'Puesto del patrono',
		employerWorkplace: 'Lugar de empleo'
	},
	sexOptions: { male: 'Masculino', female: 'Femenino' },
	cohortOptions: { basic: 'Básico', regular: 'Regular' },
	classTimeOptions: { am: 'AM · {startTime}–{endTime}', pm: 'PM · {startTime}–{endTime}' },
	hints: {
		studentSex: 'Se usa únicamente para la concordancia de aceptado/aceptada en la carta en español.',
		programStartDate: 'La fecha en que comenzaste el programa de preparación.',
		employerPosition: 'Por ejemplo, supervisor, gerente, dueño o recursos humanos.'
	},
	scheduleLabel: 'Horario de clases semanales',
	schedules: {
		basic: 'los lunes, miércoles y viernes en horario de {startTime} a {endTime}',
		regular: 'los lunes, martes, jueves y viernes en horario de {startTime} a {endTime}'
	},
	submit: 'Generar certificado', submitting: 'Generando los PDF…',
	errorSummary: 'Corrige los campos resaltados antes de generar tu certificado.',
	errors: {
		required: 'Este campo es obligatorio.', text: 'Escribe el texto en una sola línea y sin caracteres de control ocultos.',
		length: 'Este texto es demasiado largo. Por favor, acórtalo.',
		characters: 'Este texto contiene caracteres que las fuentes del PDF en inglés y español no admiten. Comunícate con el programa si tu nombre necesita estos caracteres.',
		sex: 'Selecciona masculino o femenino para la concordancia de la carta.',
		date: 'Escribe una fecha válida del calendario.', cohort: 'Selecciona la cohorte Básico o Regular.',
		classTime: 'Selecciona el horario AM o PM.'
	},
	serverError: 'No pudimos generar tu certificado. Conservamos tus datos; vuelve a intentarlo.',
	resultsTitle: 'Tu certificado está listo',
	ready: 'Descarga cualquiera de los dos idiomas y comparte el PDF con tu patrono.',
	previewTitle: 'Vista previa de la carta',
	snapshotNote: 'Esta carta refleja los datos enviados. Genérala de nuevo si cambias algún dato. Cambiar el idioma del sitio no cambia la fecha de emisión.',
	downloadEnglish: 'Descargar PDF en inglés', downloadSpanish: 'Descargar PDF en español',
	document: {
		title: 'Certificado de Asistencia',
		openingMale: 'Por medio de la presente, certificamos que la Sra. Claudine Menéndez, en representación de Masterminds Programa ASVAB, confirma que {studentName} ha sido aceptado en nuestro programa integral de preparación con el objetivo de ingresar a las Fuerzas Armadas de los Estados Unidos.',
		openingFemale: 'Por medio de la presente, certificamos que la Sra. Claudine Menéndez, en representación de Masterminds Programa ASVAB, confirma que {studentName} ha sido aceptada en nuestro programa integral de preparación con el objetivo de ingresar a las Fuerzas Armadas de los Estados Unidos.',
		participation: 'Desde el {startDate}, {shortName} ha sido parte de nuestro programa. Estará asistiendo a los cursos de {schedule} como parte de su proceso de preparación.',
		accommodation: 'Le solicitamos amablemente tomar en cuenta el compromiso adquirido por {shortName} para ajustar, en la medida de lo posible, su disponibilidad laboral. Esto permitirá que cumpla tanto con sus responsabilidades actuales en su lugar de trabajo como con las metas personales y profesionales que se ha trazado en este importante proceso.',
		gratitude: 'Agradecemos de antemano su comprensión y apoyo en este esfuerzo conjunto por fomentar el desarrollo integral y profesional de {shortName}.',
		issuance: 'Para los fines pertinentes, esta certificación se expide en {city}, Puerto Rico, hoy, {issueDate}. Para cualquier consulta, puede comunicarse al {phone}.',
		signatory: 'Claudine Menéndez, Representante', role: 'Masterminds Repaso ASVAB',
		phone: '(939) 408-0440', email: 'mastermindsprogramaasvab@gmail.com', city: 'San Juan'
	}
};



const englishBootcamp = {
	registration: { begin: 'Begin registration', draft: 'Registration started. Complete and save your waiver to continue.' },
	pageTitle: 'Bootcamps | Masterminds ASVAB',
	description: 'Review bootcamp details, complete your documents, and manage your registration.',
	title: 'Bootcamps', eyebrow: 'Prepare together', introduction: 'Your event, documents, and payment progress in one place.',
	empty: 'No bootcamps are available right now.', notLinked: 'Your account is not linked to a student record. Contact an administrator to continue.',
	common: { saving: 'Saving…', success: 'Saved successfully.', yes: 'Yes', no: 'No', cancel: 'Cancel', required: 'All fields are required unless marked optional.', languages: { en: 'English', es: 'Spanish' } },
	errors: {
		invalid: 'Check all required fields and try again.',
		unavailable: 'This service is temporarily unavailable. Activating or opening registration requires configured payments and document backup, and a registration deadline that has not passed.',
		activeEvent: 'Another bootcamp already has registration open. Close its registration before activating or opening another event.',
		closed: 'Registration is closed for this event. No new registration changes can be saved.',
		ineligible: 'You are not currently eligible to register. Contact an administrator for help.',
		stale: 'The student record or event details have changed. Reload the page and review the latest information before continuing.',
		notLinked: 'Your account is not linked to a student record. Contact an administrator.',
		payment: 'The payment could not be confirmed. Check your payment status before trying again.',
		storage: 'The document could not be saved. Please try again; do not assume it is complete.',
				unsupportedText: 'PDFs support English and Spanish Latin characters. Replace tabs and unsupported special characters from pasted text, then try saving again.'
	},
	event: {
		venue: 'Venue', startsAt: 'Start / latest arrival', endsAt: 'Ends', arrivalAt: 'Check-in opens', registrationClosesAt: 'Registration deadline',
		timeZone: 'All event times are in Puerto Rico time.', open: 'Registration open', closed: 'Registration closed',
		closedNote: 'New registrations are unavailable. Saved documents remain available until the event ends.', ended: 'This event has ended. The document download period has closed.',
		revision: 'Revision {revision}', documents: 'Saved documents', downloadsUntil: 'Downloads available through {date}.',
		document: '{kind} · {language}', documentKinds: { waiver: 'Signed waiver', letter: 'Employer letter' }
	},
	identity: {
		title: 'Your information', name: 'Full name', email: 'Email address', dateOfBirth: 'Date of birth', phone: 'Phone number',
		municipality: 'Municipality of residence', signingCity: 'City where you are signing now',
		known: 'Your name, email, and any recorded date of birth come from your student record. Contact an administrator if they are incorrect.',
		signingCityHint: 'Enter the city where you are physically signing, not your residence or the event venue unless you are there now.',
		resetHint: 'Changing your information or the event revision clears all draft signatures. Review and sign again.'
	},
	waiver: {
		title: 'Read and sign', introduction: 'Read each complete section, confirm you have read it, then sign in its signature box. All three signatures are required.',
		spanishOnly: 'The legal agreements and signed waiver PDF are in Spanish, regardless of your interface language.',
		sections: { agreement: 'Participation agreement', liability: 'Liability waiver', media: 'Media authorization' },
		readRegion: '{section} — complete legal text', scrollHint: 'Scroll to the bottom to unlock the read confirmation. You can focus the text and use the arrow keys, Page Down, or End.',
		readConfirm: 'I have read this entire section', readReady: 'You have reached the end. Confirm that you have read this section to unlock signing.',
		signature: 'Signature for {section}', signatureHint: 'Draw your signature with a mouse, finger, or stylus. To sign with a keyboard, press Enter to start, use the arrow keys to draw, then press Enter to finish.',
		locked: 'Read and confirm this section before signing.', clear: 'Clear signature', signed: 'Signature captured', unsigned: 'Signature required',
		keyboardDrawing: 'Keyboard drawing is active. Use arrow keys to draw; press Enter to finish.',
		preview: 'Preview PDF (optional)', previewing: 'Preparing preview…', previewTitle: 'Your waiver PDF preview', openPreview: 'Open PDF preview',
		previewOptional: 'You may save after completing all three signatures. Previewing the PDF or downloading a copy is optional.',
		previewHint: 'This preview is not a saved registration. If you save without changes, this is the exact PDF that will be saved. Changes discard this preview; you can save directly or generate another optional preview.',
		downloadPreview: 'Download preview copy', previewFilename: 'bootcamp-waiver-preview.pdf',
		submit: 'Save signed waiver', saved: 'Your signed waiver is saved.',
		completeFirst: 'Complete your information, read all three sections, and sign each one before saving or generating an optional preview.',
		javascript: 'JavaScript is required to read and sign the waiver. PDF preview is optional.'
	},
	letter: {
		title: 'Employer letter', question: 'Do you need a letter for your employer?', description: 'Your saved student information is reused. A new letter uses the current event details shown above; your signed waiver and earlier documents remain unchanged. Only add your employment details.',
		employer: 'Employer or company', contact: 'Employer contact', position: 'Your position', workplace: 'Workplace location',
		submit: 'Save letter choice', declined: 'You chose not to request an employer letter.', saved: 'Your employer letter is saved.'
	},
	payment: {
		title: 'Event payment', description: 'One-time event payment. This is not a subscription.', total: 'Event price', paid: 'Paid through website', remaining: 'Remaining in website records',
		full: 'Pay in full · {amount}', deposit: 'Pay deposit · {amount}',
		phone: 'Payer’s ATH Móvil phone number', phoneHint: 'Required. Enter the Puerto Rico or US phone registered with the ATH Móvil account that will pay. It may belong to someone other than the student. Use 10 digits, optionally with +1.',
		invalidPhone: 'Enter a valid 10-digit Puerto Rico or US phone number, optionally with +1.',
		unavailable: 'Payments are currently unavailable. Your saved documents are not affected.', complete: 'Paid in full', confirmed: 'Registration confirmed',
		remainingNotice: 'Remaining in website records: {amount}. Offline collections are not reflected. This checkout does not accept balance payments.',
				remainingFlag: 'Balance remains in website records',
				recordsNotice: 'These paid and remaining amounts reflect website payment records only. Money collected offline is not reflected here.',
				verificationAttention: 'The latest verification needs attention. Previously verified payment remains recorded.',
		initialOnly: 'Choose one initial payment: a $15 deposit or the full $30. This checkout does not accept later balance payments.',
		pending: 'Payment submitted. Your balance changes only after the provider confirms payment.', prerequisites: 'Save your waiver and employer letter choice before paying.',
		check: 'Check payment status', checking: 'Checking payment…', checked: 'Payment status checked.',
		polling: 'Checking every 10 seconds while this page is visible, for up to 10 minutes.', pollingStopped: 'Automatic checks have stopped. You can still check the payment status manually.',
		statuses: { creating: 'Creating payment', pending: 'Awaiting payment', uncertain: 'Payment needs verification', completed: 'Payment completed', cancelled: 'Payment cancelled', refunded: 'Payment refunded', not_started: 'No payment attempt', unknown: 'Payment status unavailable' },
		stateHints: {
			creating: 'Your payment request is being created. Do not start another payment.',
			pending: 'Complete the request in the payer’s ATH Móvil app, then check its status. Do not start another payment.',
			uncertain: 'The payment outcome is not yet verified. Check its status before taking any further action.',
			completed: 'The provider reports a completed payment. The paid amount below must be confirmed by the server before registration is confirmed.',
			cancelled: 'The previous attempt was cancelled. If no payment was received and registration is open, you may start a new initial payment.',
			refunded: 'This payment was refunded. New checkout attempts are blocked; contact an administrator.',
			unknown: 'Payment status could not be verified. New checkout attempts are blocked; check the status or contact an administrator.'
		}
	},
	admin: {
		pageTitle: 'Manage bootcamps | Masterminds ASVAB', description: 'Activate a bootcamp to open registration immediately. Manage one open event at a time, registration reports, and document backups.',
		activatePageTitle: 'Activate bootcamp | Masterminds ASVAB', activateDescription: 'Set the title, venue, date, and schedule. Activation opens registration immediately with standard Spanish agreements, when services are ready and the deadline has not passed. Only one event can have registration open.',
		editPageTitle: 'Edit: {title} | Masterminds ASVAB', editDescription: 'Update bootcamp details without closing open registration unless the old or new registration deadline has passed. Closed events stay closed; saved documents remain unchanged.',
		reportPageTitle: 'Registration report: {title} | Masterminds ASVAB', reportDescription: 'Review registrations, website payment balances, and saved documents for this bootcamp.',
				classType: 'Class', classTypes: { basic: 'Basic', regular: 'Regular' },
				coverage: 'Registration coverage', coverageFor: '{classType} registration coverage', started: 'Started', confirmed: 'Confirmed',
				collected: 'Website payments', outstanding: 'Confirmed balances',
				search: 'Search students', searchPlaceholder: 'Name or email', classFilters: 'Filter by class', allClasses: 'All classes',
				registrationFilters: 'Filter registrations', allStudents: 'All students', notStarted: 'Not started', noMatches: 'No students match these filters.',
				actions: 'Actions', tools: 'Report tools',
		title: 'Bootcamp operations',
		connections: 'Service readiness', paymentReady: 'Payments configured', paymentMissing: 'Payments not configured', driveReady: 'Document backup configured', driveMissing: 'Document backup not configured',
		events: 'Events', create: 'Activate bootcamp', edit: 'Edit event', editing: 'Edit: {title}', titleField: 'Event title', venue: 'Venue',
		timeZone: 'Enter all dates and times in Puerto Rico local time (America/Puerto_Rico).',
		eventDate: 'Event date', startTime: 'Start time (24-hour)', endTime: 'End time (24-hour)', timePlaceholder: 'HH:mm',
		scheduleHint: 'Use HH:mm (00:00–23:59). The end time must be later than the start time on the same date.',
		scheduleAutomatic: 'Check-in opens 1 hour before the event starts. Registration closes 12 hours before the event starts.',
		editWarning: 'Saving changes keeps registration open unless the old or new deadline has passed. Closed registration stays closed, even if you move the date forward. New documents use the updated details and standard agreements; existing documents, including signed waivers, remain unchanged.',
		legal: 'Standard agreements · Spanish', legalHint: 'Read-only preview. The server includes the standard participation agreement, liability waiver, and media authorization automatically using this event’s venue, date, and schedule. No custom wording or approval is required.',
		legalLabel: '{section} — Spanish',
		legalPreviewPending: 'Enter a valid venue, event date, and start/end times to preview the completed agreements.',
		activate: 'Activate', activating: 'Activating…', saveEvent: 'Save changes',
		activationHint: 'Activation creates the event and opens registration immediately with the standard agreements. Payments and document backup must be configured, the deadline must be in the future, and no other event can have registration open.',
		cutoffPassed: 'The registration deadline has passed. Choose a schedule with a future deadline to activate or open registration.',
		open: 'Open registration', close: 'Close registration', activationGuard: 'Activation opens registration immediately. Activating or opening an event requires configured payments and document backup, a future registration deadline, and no other open event.',
		report: 'Registration report', reportEmpty: 'There are no student rows for this event.',
		viewReport: 'View report', viewReportFor: 'View report for {title}',
		csvAll: 'Download full CSV', retryBackups: 'Retry document backups', reconcile: 'Reconcile payments',
		name: 'Student', email: 'Email', eligibility: 'Eligibility', status: 'Registration status', paymentStatus: 'Payment status', paid: 'Website paid', remaining: 'Website remaining', documents: 'Documents and backup status', noDocuments: 'No saved documents',
		eligibilities: { eligible: 'Eligible', underage: 'Underage', unknown: 'Not verified', inactive: 'Inactive' },
		statuses: { not_started: 'Not started', waiver: 'Waiver step', letter: 'Employer letter step', payment: 'Payment step', confirmed: 'Confirmed' },
		backup: 'Backup: {status}', backups: { pending: 'Pending', uploading: 'Uploading', saved: 'Saved', failed: 'Failed', unavailable: 'Unavailable', unknown: 'Not verified' }
	}
};

const spanishBootcamp: typeof englishBootcamp = {
	registration: { begin: 'Comenzar inscripción', draft: 'Inscripción iniciada. Completa y guarda tu relevo para continuar.' },
	pageTitle: 'Bootcamps | Masterminds ASVAB',
	description: 'Consulta los detalles de los bootcamps, completa tus documentos y administra tu inscripción.',
	title: 'Bootcamps', eyebrow: 'Prepárate en equipo', introduction: 'Tu evento, documentos y progreso de pago en un solo lugar.',
	empty: 'No hay bootcamps disponibles en este momento.', notLinked: 'Tu cuenta no está vinculada a un expediente estudiantil. Comunícate con un administrador para continuar.',
	common: { saving: 'Guardando…', success: 'Se guardó correctamente.', yes: 'Sí', no: 'No', cancel: 'Cancelar', required: 'Todos los campos son obligatorios salvo que se indiquen como opcionales.', languages: { en: 'Inglés', es: 'Español' } },
	errors: {
		invalid: 'Revisa todos los campos obligatorios e inténtalo de nuevo.',
		unavailable: 'Este servicio no está disponible temporalmente. Para activar o abrir la inscripción se requieren pagos y respaldo de documentos configurados, y una fecha límite de inscripción que no haya pasado.',
		activeEvent: 'Otro bootcamp ya tiene la inscripción abierta. Cierra su inscripción antes de activar o abrir otro evento.',
		closed: 'La inscripción para este evento está cerrada. No se pueden guardar cambios nuevos en la inscripción.',
		ineligible: 'Actualmente no cumples los requisitos para inscribirte. Comunícate con un administrador.',
		stale: 'El expediente estudiantil o los detalles del evento cambiaron. Recarga la página y revisa la información actualizada antes de continuar.',
		notLinked: 'Tu cuenta no está vinculada a un expediente estudiantil. Comunícate con un administrador.',
		payment: 'No se pudo confirmar el pago. Verifica su estado antes de intentarlo de nuevo.',
		storage: 'No se pudo guardar el documento. Inténtalo de nuevo; no lo des por completado.',
				unsupportedText: 'Los PDF admiten caracteres latinos del español y del inglés. Reemplaza las tabulaciones y los caracteres especiales no admitidos del texto pegado e intenta guardar de nuevo.'
	},
	event: {
		venue: 'Lugar', startsAt: 'Inicio / hora límite de llegada', endsAt: 'Termina', arrivalAt: 'Apertura del registro presencial', registrationClosesAt: 'Cierre de inscripción',
		timeZone: 'Todos los horarios del evento corresponden a la hora de Puerto Rico.', open: 'Inscripción abierta', closed: 'Inscripción cerrada',
		closedNote: 'No se aceptan inscripciones nuevas. Los documentos guardados están disponibles hasta que termine el evento.', ended: 'Este evento terminó. El período de descarga de documentos ha cerrado.',
		revision: 'Revisión {revision}', documents: 'Documentos guardados', downloadsUntil: 'Descargas disponibles hasta {date}.',
		document: '{kind} · {language}', documentKinds: { waiver: 'Relevo firmado', letter: 'Carta patronal' }
	},
	identity: {
		title: 'Tu información', name: 'Nombre completo', email: 'Correo electrónico', dateOfBirth: 'Fecha de nacimiento', phone: 'Número de teléfono',
		municipality: 'Municipio de residencia', signingCity: 'Ciudad donde estás firmando ahora',
		known: 'Tu nombre, correo y fecha de nacimiento registrada provienen de tu expediente estudiantil. Comunícate con un administrador si son incorrectos.',
		signingCityHint: 'Indica la ciudad donde estás físicamente al firmar, no tu residencia ni el lugar del evento a menos que estés allí ahora.',
		resetHint: 'Cambiar tu información o la revisión del evento borra todas las firmas en borrador. Revisa y firma de nuevo.'
	},
	waiver: {
		title: 'Lee y firma', introduction: 'Lee cada sección completa, confirma que la leíste y firma en su recuadro. Las tres firmas son obligatorias.',
		spanishOnly: 'Los acuerdos legales y el PDF del relevo firmado están en español, sin importar el idioma de la interfaz.',
		sections: { agreement: 'Acuerdo de participación', liability: 'Relevo de responsabilidad', media: 'Autorización de uso de imagen' },
		readRegion: '{section} — texto legal completo', scrollHint: 'Desplázate hasta el final para habilitar la confirmación de lectura. Puedes enfocar el texto y usar las flechas, Av Pág o Fin.',
		readConfirm: 'He leído esta sección completa', readReady: 'Llegaste al final. Confirma que leíste esta sección para habilitar la firma.',
		signature: 'Firma de {section}', signatureHint: 'Dibuja tu firma con el ratón, el dedo o un lápiz digital. Con el teclado, presiona Enter para comenzar, usa las flechas para dibujar y presiona Enter para terminar.',
		locked: 'Lee y confirma esta sección antes de firmar.', clear: 'Borrar firma', signed: 'Firma capturada', unsigned: 'Se requiere una firma',
		keyboardDrawing: 'El dibujo con teclado está activo. Usa las flechas para dibujar; presiona Enter para terminar.',
		preview: 'Vista previa del PDF (opcional)', previewing: 'Preparando vista previa…', previewTitle: 'Vista previa del PDF de tu relevo', openPreview: 'Abrir vista previa del PDF',
		previewOptional: 'Puedes guardar después de completar las tres firmas. Ver el PDF o descargar una copia es opcional.',
		previewHint: 'Esta vista previa no es una inscripción guardada. Si guardas sin cambios, se guardará este mismo PDF. Cualquier cambio descarta esta vista previa; puedes guardar directamente o generar otra vista previa opcional.',
		downloadPreview: 'Descargar copia de la vista previa', previewFilename: 'vista-previa-relevo-bootcamp.pdf',
		submit: 'Guardar relevo firmado', saved: 'Tu relevo firmado está guardado.',
		completeFirst: 'Completa tu información, lee las tres secciones y firma cada una antes de guardar o generar una vista previa opcional.',
		javascript: 'Se requiere JavaScript para leer y firmar el relevo. La vista previa del PDF es opcional.'
	},
	letter: {
		title: 'Carta patronal', question: '¿Necesitas una carta para tu patrono?', description: 'Se reutilizan tus datos estudiantiles guardados. Una carta nueva usa los detalles actuales del evento que aparecen arriba; tu relevo firmado y los documentos anteriores permanecen sin cambios. Solo añade tus datos de empleo.',
		employer: 'Patrono o empresa', contact: 'Contacto del patrono', position: 'Tu puesto', workplace: 'Lugar de trabajo',
		submit: 'Guardar selección de carta', declined: 'Elegiste no solicitar una carta patronal.', saved: 'Tu carta patronal está guardada.'
	},
	payment: {
		title: 'Pago del evento', description: 'Pago único por el evento. No es una suscripción.', total: 'Precio del evento', paid: 'Pagado en el sitio web', remaining: 'Pendiente según el sitio web',
		full: 'Pagar completo · {amount}', deposit: 'Pagar depósito · {amount}',
		phone: 'Teléfono de ATH Móvil de quien paga', phoneHint: 'Obligatorio. Ingresa el teléfono de Puerto Rico o Estados Unidos registrado en la cuenta de ATH Móvil que pagará. Puede pertenecer a alguien que no sea el estudiante. Usa 10 dígitos, con +1 opcional.',
		invalidPhone: 'Ingresa un teléfono válido de Puerto Rico o Estados Unidos de 10 dígitos, con +1 opcional.',
		unavailable: 'Los pagos no están disponibles actualmente. Tus documentos guardados no se afectan.', complete: 'Pagado en su totalidad', confirmed: 'Inscripción confirmada',
		remainingNotice: 'Pendiente según el sitio web: {amount}. Los cobros fuera del sitio web no se reflejan. Este proceso no acepta pagos del saldo.',
				remainingFlag: 'Saldo pendiente según el sitio web',
				recordsNotice: 'Los montos pagados y pendientes reflejan solo los registros de pago del sitio web. El dinero cobrado fuera del sitio web no se refleja aquí.',
				verificationAttention: 'La verificación más reciente requiere atención. El pago verificado anteriormente permanece registrado.',
		initialOnly: 'Elige un solo pago inicial: un depósito de $15 o el total de $30. Este proceso no acepta pagos posteriores del saldo.',
		pending: 'Pago enviado. Tu saldo cambia solo cuando el proveedor confirma el pago.', prerequisites: 'Guarda tu relevo y tu selección de carta patronal antes de pagar.',
		check: 'Verificar estado del pago', checking: 'Verificando pago…', checked: 'Estado del pago verificado.',
		polling: 'Se verifica cada 10 segundos mientras esta página esté visible, durante un máximo de 10 minutos.', pollingStopped: 'Las verificaciones automáticas se detuvieron. Aún puedes verificar el estado del pago manualmente.',
		statuses: { creating: 'Creando pago', pending: 'Esperando pago', uncertain: 'El pago requiere verificación', completed: 'Pago completado', cancelled: 'Pago cancelado', refunded: 'Pago reembolsado', not_started: 'Sin intento de pago', unknown: 'Estado del pago no disponible' },
		stateHints: {
			creating: 'Se está creando tu solicitud de pago. No inicies otro pago.',
			pending: 'Completa la solicitud en la aplicación ATH Móvil de quien paga y verifica su estado. No inicies otro pago.',
			uncertain: 'El resultado del pago aún no está verificado. Verifica su estado antes de realizar cualquier otra acción.',
			completed: 'El proveedor informa que el pago se completó. El servidor debe confirmar el monto pagado antes de confirmar la inscripción.',
			cancelled: 'El intento anterior fue cancelado. Si no se recibió ningún pago y la inscripción está abierta, puedes iniciar un pago inicial nuevo.',
			refunded: 'Este pago fue reembolsado. No se permiten nuevos intentos de pago; comunícate con un administrador.',
			unknown: 'No se pudo verificar el estado del pago. No se permiten nuevos intentos; verifica el estado o comunícate con un administrador.'
		}
	},
	admin: {
		pageTitle: 'Administrar bootcamps | Masterminds ASVAB', description: 'Activa un bootcamp para abrir la inscripción de inmediato. Administra un solo evento abierto a la vez, informes de inscripción y respaldos de documentos.',
		activatePageTitle: 'Activar bootcamp | Masterminds ASVAB', activateDescription: 'Configura el título, lugar, fecha y horario. La activación abre la inscripción de inmediato con los acuerdos estándar en español, si los servicios están configurados y la fecha límite no ha pasado. Solo un evento puede tener la inscripción abierta.',
		editPageTitle: 'Editar: {title} | Masterminds ASVAB', editDescription: 'Actualiza los detalles sin cerrar la inscripción abierta, salvo que la fecha límite anterior o nueva haya pasado. Los eventos cerrados siguen cerrados y los documentos guardados permanecen sin cambios.',
		reportPageTitle: 'Informe de inscripción: {title} | Masterminds ASVAB', reportDescription: 'Consulta las inscripciones, los saldos según los pagos en la web y los documentos guardados de este bootcamp.',
				classType: 'Clase', classTypes: { basic: 'Básico', regular: 'Regular' },
				coverage: 'Cobertura de inscripciones', coverageFor: 'Cobertura de inscripciones de {classType}', started: 'Iniciadas', confirmed: 'Confirmadas',
				collected: 'Pagos en la web', outstanding: 'Saldos de inscripciones confirmadas',
				search: 'Buscar estudiantes', searchPlaceholder: 'Nombre o correo', classFilters: 'Filtrar por clase', allClasses: 'Todas las clases',
				registrationFilters: 'Filtrar inscripciones', allStudents: 'Todos los estudiantes', notStarted: 'Sin iniciar', noMatches: 'Ningún estudiante coincide con estos filtros.',
				actions: 'Acciones', tools: 'Herramientas del informe',
		title: 'Administración de bootcamps',
		connections: 'Disponibilidad de servicios', paymentReady: 'Pagos configurados', paymentMissing: 'Pagos sin configurar', driveReady: 'Respaldo de documentos configurado', driveMissing: 'Respaldo de documentos sin configurar',
		events: 'Eventos', create: 'Activar bootcamp', edit: 'Editar evento', editing: 'Editar: {title}', titleField: 'Título del evento', venue: 'Lugar',
		timeZone: 'Ingresa todas las fechas y horas en la hora local de Puerto Rico (America/Puerto_Rico).',
		eventDate: 'Fecha del evento', startTime: 'Hora de inicio (24 horas)', endTime: 'Hora de fin (24 horas)', timePlaceholder: 'HH:mm',
		scheduleHint: 'Usa HH:mm (00:00–23:59). La hora de fin debe ser posterior a la de inicio en la misma fecha.',
		scheduleAutomatic: 'El registro presencial abre 1 hora antes del inicio del evento. La inscripción cierra 12 horas antes del inicio del evento.',
		editWarning: 'Guardar cambios mantiene la inscripción abierta, salvo que la fecha límite anterior o nueva haya pasado. La inscripción cerrada sigue cerrada, aunque se mueva la fecha hacia el futuro. Los documentos nuevos usan los detalles actualizados y los acuerdos estándar; los documentos existentes, incluidos los relevos firmados, permanecen sin cambios.',
		legal: 'Acuerdos estándar · Español', legalHint: 'Vista previa de solo lectura. El servidor incluye automáticamente el acuerdo de participación, el relevo de responsabilidad y la autorización de imagen estándar con el lugar, la fecha y el horario del evento. No se requiere texto personalizado ni aprobación.',
		legalLabel: '{section} — Español',
		legalPreviewPending: 'Ingresa un lugar, una fecha del evento y horas de inicio y fin válidos para ver los acuerdos completos.',
		activate: 'Activar', activating: 'Activando…', saveEvent: 'Guardar cambios',
		activationHint: 'La activación crea el evento y abre la inscripción de inmediato con los acuerdos estándar. Los pagos y el respaldo de documentos deben estar configurados, la fecha límite debe estar en el futuro y ningún otro evento puede tener la inscripción abierta.',
		cutoffPassed: 'La fecha límite de inscripción ya pasó. Elige un horario con una fecha límite futura para activar o abrir la inscripción.',
		open: 'Abrir inscripción', close: 'Cerrar inscripción', activationGuard: 'La activación abre la inscripción de inmediato. Para activar o abrir un evento se requieren pagos y respaldo de documentos configurados, una fecha límite de inscripción futura y ningún otro evento abierto.',
		report: 'Informe de inscripción', reportEmpty: 'No hay filas de estudiantes para este evento.',
		viewReport: 'Ver informe', viewReportFor: 'Ver informe de {title}',
		csvAll: 'Descargar CSV completo', retryBackups: 'Reintentar respaldo de documentos', reconcile: 'Conciliar pagos',
		name: 'Estudiante', email: 'Correo', eligibility: 'Elegibilidad', status: 'Estado de inscripción', paymentStatus: 'Estado del pago', paid: 'Pagado en la web', remaining: 'Pendiente en la web', documents: 'Documentos y estado del respaldo', noDocuments: 'Sin documentos guardados',
		eligibilities: { eligible: 'Elegible', underage: 'Menor de edad', unknown: 'Sin verificar', inactive: 'Inactivo' },
		statuses: { not_started: 'Sin comenzar', waiver: 'Paso del relevo', letter: 'Paso de carta patronal', payment: 'Paso de pago', confirmed: 'Confirmado' },
		backup: 'Respaldo: {status}', backups: { pending: 'Pendiente', uploading: 'Subiendo', saved: 'Guardado', failed: 'Falló', unavailable: 'No disponible', unknown: 'Sin verificar' }
	}
};


const english = {
	bootcamp: englishBootcamp,
		coursesPreview: englishCoursesPreview,
	admin: englishAdmin,
	enrollment: englishEnrollment,
	attendance: englishAttendance,
	reportArchive: {
		notice: 'When you generate a report, both the English and Spanish PDFs, including the personal details entered here, are saved in Masterminds’ Google Drive. Sign-in is required.',
		saved: 'Both language versions were saved to Masterminds’ Google Drive.',
		localOnly: 'PDFs are ready to download. Google Drive archiving is not configured.',
		signIn: 'Sign in before generating a report and saving it to Google Drive. Your entries have been kept on this page.',
		unavailable: 'We could not confirm that both PDFs were saved to Google Drive. The report is not complete. Your entries have been kept; please try again later or contact an administrator.'
	},
	auth: {
		email: 'Email address',
		usernameOrEmail: 'Username or email',
		localAdminHint: 'Local development only: use username admin and password admin.',
		signIn: 'Sign in',
		signingIn: 'Signing in…',
		signOut: 'Sign out',
		signingOut: 'Signing out…',
		accountLabel: 'Signed-in account',
		studentWorkspace: 'Masterminds · Student workspace',
		backToAdmin: 'Back to admin',
		openDashboard: 'Go to dashboard',
		signedInTitle: 'You’re already signed in',
		signedInDescription: 'Continue to your dashboard using your current account.',
		javascriptRequired: 'Enable JavaScript to sign in securely.',
		student: {
			pageTitle: 'Student sign-in | Masterminds ASVAB',
			description: 'Sign in to your Masterminds student workspace with your email and four-digit PIN.',
			eyebrow: 'Student workspace',
			title: 'Student sign-in',
			introduction: 'Your next step starts here. Use your email and student PIN to sign in.',
			credential: 'Four-digit PIN',
			credentialHint: 'Enter exactly four digits (0–9), including any leading zeros.',
			invalidCredential: 'Enter a PIN with exactly four digits (0–9).',
			invalidCredentials: 'The email or PIN is incorrect. Try again.'
		},
		admin: {
			pageTitle: 'Admin sign-in | Masterminds ASVAB',
			description: 'Sign in to the Masterminds administration workspace with your admin account.',
			eyebrow: 'Administration',
			title: 'Admin sign-in',
			introduction: 'Sign in with your admin account to manage your program.',
			credential: 'Password',
			credentialHint: 'Use your admin password (8–128 characters).',
			invalidCredential: 'Enter a password between 8 and 128 characters.',
			invalidCredentials: 'The account or password is incorrect. Try again.'
		},
		errors: {
			rateLimited: 'Too many attempts. Please wait a moment before trying again.',
			unavailable: 'Sign-in is temporarily unavailable. Please try again shortly.',
			signOutFailed: 'We couldn’t sign you out. Please try again.'
		}
	},
	accessibility: {
		skipToContent: 'Skip to content'
	},
	language: {
		label: 'Website language'
	},
	speedMath: {
		pageTitle: 'Speed Math | Masterminds ASVAB',
		briefingTitle: 'Small sessions. Steady progress.',
		sessionTitle: 'Your session',
		ready: 'Ready when you are',
		live: 'Session in progress',
		timerHint: 'The clock starts when you do.',
		minuteUnit: 'min',
		accuracyFirst: 'Accuracy first. Speed follows.',
		keyboardHint: 'Keyboard ready',
		resultsHint: 'One session closer. Keep building your rhythm.',
		description: 'Build mental math speed with timed addition, subtraction, multiplication, and division practice.',
		eyebrow: 'Mental math practice',
		title: 'Speed Math',
		introduction: 'Race the clock, not your accuracy. Answer as many questions correctly as you can.',
		setupTitle: 'Set your challenge',
		setupHint: 'One operation. One timer. A new question after every answer.',
		duration: 'Choose your time',
		minutes: '{minutes} minutes',
		operation: 'Choose your operation',
		operations: {
			addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', division: 'Division'
		},
		spokenOperations: {
			addition: 'plus', subtraction: 'minus', multiplication: 'times', division: 'divided by'
		},
		operationHints: {
			addition: 'Add numbers from 0 to 50.',
			subtraction: 'Subtract numbers from 0 to 50. Answers are never negative.',
			multiplication: 'Multiplication facts with factors from 1 to 12.',
			division: 'Division facts from the 1–12 multiplication tables. No remainders.'
		},
		rulesTitle: 'Keep your momentum',
		rules: 'Type your answer and press Enter. Each answer moves to the next question, even if it is incorrect. Only correct answers count toward your score.',
		timerNote: 'The timer keeps running if you switch tabs. Sessions and scores are not saved after you leave or reload this page.',
		start: 'Start challenge',
		challengeLabel: '{operation} · {minutes} minutes',
		timeRemaining: 'Time left',
		correct: 'Correct',
		incorrect: 'Incorrect',
		accuracy: 'Accuracy',
		questionNumber: 'Question {number}',
		question: 'What is {left} {operation} {right}?',
		answer: 'Your answer',
		answerPlaceholder: 'Type a number',
		answerHint: 'Press Enter to answer and keep going.',
		submit: 'Answer',
		invalidAnswer: 'Enter a whole number that is zero or greater.',
		feedbackCorrect: 'Correct! {left} {operation} {right} equals {answer}.',
		feedbackIncorrect: 'Not quite. {left} {operation} {right} equals {answer}.',
		lowTime: '30 seconds or less remaining. Keep going!',
		end: 'End session',
		timeUp: 'Time’s up!',
		ended: 'Session complete',
		resultsTitle: 'Your results',
		resultsMessage: 'You answered {correct} of {total} questions correctly.',
		noAnswers: 'No answers this time. Start another challenge and give it a try.',
		correctAnswers: 'Correct answers',
		totalAnswered: 'Questions answered',
		correctPerMinute: 'Correct per minute',
		elapsed: 'Time practiced',
		playAgain: 'Try again',
		changeSettings: 'Change settings',
		javascriptRequired: 'Turn on JavaScript to use Speed Math and its session timer.'
	},
	header: {
		brand: 'Masterminds',
		brandDescription: 'Programa ASVAB',
		brandLabel: 'Masterminds Programa ASVAB',
		student: 'Student',
		tagline: 'Small steps. Strong foundations.'
	},
	navigation: {
		label: 'Dashboard navigation',
		home: 'Home', practice: 'Practice', resources: 'Student resources', workspace: 'Student workspace',
		tools: {
			math: { title: 'Speed Math', description: 'Build speed and accuracy with timed arithmetic practice.', action: 'Practice math', category: 'Arithmetic' },
			vocabulary: { title: 'English vocabulary', description: 'Practice frequent English words with Spanish translations.', action: 'Practice vocabulary', category: 'English' },
			ist: { title: 'Physical readiness', description: 'Enter your IST results, check readiness, and download a report.', action: 'Open IST assessment', category: 'Readiness' },
			attendance: { title: 'Attendance certificate', description: 'Create a letter for your employer with your class schedule.', action: 'Create certificate', category: 'Documents' }
		}
	},
	home: {
		pageTitle: 'Student dashboard | Masterminds ASVAB',
		description: 'Your Masterminds Programa ASVAB student dashboard.',
		grades: {
			eyebrow: 'ASVAB practice',
			title: 'Your grades',
			intro: 'Four core areas. One clear view.',
			sectionHint: 'Choose a skill to work on.',
			sampleData: 'Sample grades',
			sampleNote: 'Preview only: sample practice percentages, not student records or official ASVAB scores.',
			score: '{score}%',
			scoreText: 'Sample practice grade: {score} percent',
			subjects: {
				wk: { code: 'WK', title: 'Word Knowledge' },
				pc: { code: 'PC', title: 'Paragraph Comprehension' },
				mk: { code: 'MK', title: 'Math Knowledge' },
				ar: { code: 'AR', title: 'Arithmetic Reasoning' }
			}
		}
	},
frequency: {
	pageTitle: 'English frequency deck | Masterminds ASVAB',
	description: 'Practice 1,001 frequent English words with Spanish translations in adaptive 25-attempt rounds that give missed words more practice.',
	eyebrow: 'Word by word',
	title: 'English frequency deck',
	introduction: 'See the English word. Recall it in Spanish. Build your vocabulary, one card at a time.',

	sessionOnly: 'Progress is only kept while you’re on this page. Leaving or reloading resets it.',
	methodTitle: 'The rhythm',
	methodSteps: {
		recall: {
			title: 'Recall',
			description: 'Read the English word. Think of its Spanish meaning.'
		},
		search: {
			title: 'Choose',
			description: 'Type in Spanish, then choose a suggestion.'
		},
		repeat: {
			title: 'Build',
			description: 'Review the translation. Missed words get more practice when eligible.'
		}
	},
	untimed: 'At your pace',
	sessionLabel: 'Vocabulary practice',
	setupTitle: 'A stronger vocabulary starts here.',
	setupDescription: 'Practice frequent English words in short, adaptive rounds. No timer. Just one word at a time.',
	keyboardTip: 'Use ↑ ↓ to choose a suggestion and Enter to answer.',
	direction: 'English → Spanish',
	englishShort: 'EN',
	spanishShort: 'ES',
	wordCount: '{count} English words',
	roundSize: '{count} attempts per round',
	roundLabel: 'Round {round}',

	progressTitle: 'Your progress across the full list',
	practiceCoverage: 'Words practiced',
	firstPassCoverage: 'Answered correctly at least once',

	currentPass: 'Pass {pass}',
	passProgressLabel: 'Current-pass progress',
	poolProgress: '{count} of {total} words · {percent}%',


	readyTitle: 'Ready to practice?',
	startHint: 'Start a round of {count} attempts whenever you’re ready.',
	startRound: 'Start round',
	cardProgress: 'Attempt {current} of {total}',
	progressLabel: 'Round progress',
	answeredProgress: '{answered} of {total} attempts recorded',
	correctCount: 'Correct',
	incorrectCount: 'Incorrect',
	skippedCount: 'Skipped',
	frequencyRank: 'Frequency rank #{rank}',
	englishWord: 'English word',
	prompt: 'How would you say this in Spanish?',
	spanishTranslation: 'Spanish translation',
		alsoAccepted: 'Also accepted',

	answerLabel: 'Your Spanish answer',
	answerPlaceholder: 'Start typing in Spanish…',
	answerHint: 'Search the full list. Select a suggestion or use ↑ ↓ and Enter. Accents and small typos are okay when searching.',
	suggestionsLabel: 'Spanish translation suggestions',
	suggestionCount: '{count} suggestions available.',
	noMatches: 'No matches yet. Try a different spelling, or reveal the answer.',
	searchPrompt: 'Your Spanish suggestions will appear here.',
	checkAnswer: 'Check answer',
	dontKnow: 'I don’t know · Reveal',
	correct: 'Nice recall!',
	incorrect: 'A word to practice',
	skipped: 'Now you know',
	incorrectHint: 'Compare the translations. This word keeps its correct count and gets more chances while it is eligible.',
	skippedHint: 'Read the translation out loud. Skipping gives this word the same extra practice as an incorrect answer.',
	otherWaysToSayIt: 'You could also say',
	yourAnswer: 'You chose',
	nextCard: 'Next card',
	finishRound: 'See results',
	completeTitle: 'Round complete',
	completeMessage: 'You answered correctly on {correct} of {total} attempts.',
	perfectMessage: 'Every attempt correct. Your progress carries into the next round.',
	reviewMessage: 'Missed words get more chances when eligible. Your next round still follows the full-list pass order.',
	reviewList: 'Words missed or skipped this round',
	nextRound: 'Start next round',

	javascriptRequired: 'Turn on JavaScript to use the interactive cards and answer search.'
},
			ist: {
				pageTitle: 'IST physical readiness | Masterminds ASVAB',
				description: 'Assess your self-reported physical readiness against the program’s Army-based baseline and download an IST report.',
				eyebrow: 'Initial Strength Test',
				title: 'Check your readiness',
				introduction: 'A clear starting point for your training. Enter your results to see where you meet the program baseline and where to focus next.',

				studentDetails: 'Student details',
				studentDetailsHint: 'Your age and sex baseline determine the applicable thresholds.',
				measurements: 'Body measurements',
				measurementsHint: 'Use pounds and inches. Decimal measurements are accepted; no height measurement is needed.',
				exerciseResults: 'Exercise results',
				exerciseHint: 'For each exercise, choose “Record a result” to unlock the result fields, or “Unable to complete”. Zero repetitions are a valid recorded result. Do not use a zero time for inability.',
				nativeExerciseHint: 'Without JavaScript, choosing an exercise option reloads the form and keeps your other entries. Choosing “Unable to complete” clears that exercise’s previous result.',
				fields: {
					studentName: 'Student name', sex: 'Sex baseline', age: 'Age (years)',
					weightLb: 'Weight (lb)', waistIn: 'Waist circumference (in)'
				},
				sexOptions: { male: 'Male', female: 'Female' },
				categories: { pushUps: 'Push-ups', sitUps: 'Sit-ups', plank: 'Plank', run: 'One-mile run', bodyFat: 'Estimated body fat' },
				completion: 'Completion status', choose: 'Choose an option', recorded: 'Record a result', unable: 'Unable to complete',
				repetitions: 'Repetitions', minutes: 'Minutes', seconds: 'Seconds',
				hints: {
					age: '17–51 whole years', weightLb: '70–400 lb', waistIn: '18–60 in',
					repetitions: '0–300 whole repetitions', duration: 'Total duration: 1–3600 seconds (up to 60:00).',
					minutes: 'Nonnegative whole minutes', seconds: '0–59 whole seconds'
				},
				units: { pounds: 'lb', inches: 'in', years: 'years', repetitions: 'reps', seconds: 's', minutesSeconds: 'min:sec' },
				submit: 'Assess readiness', submitting: 'Assessing…',
				errorSummary: 'Please correct the highlighted fields before generating an assessment.',
				errors: {
					required: 'This field is required.', number: 'Enter a valid, finite number with no extra characters.',
					whole: 'Enter a whole number.', range: 'Enter a value within the stated range.',
					sex: 'Choose a male or female baseline.', status: 'Choose a completion status.',
					inconsistent: 'Use a recorded result with valid values, or unable to complete without numeric values.',
					bodyFat: 'These measurements give an estimate outside 0–100%. Recheck your weight and waist circumference.'
				},
				serverError: 'We could not generate your report. Your entries have been kept; please try again.',
				resultsTitle: 'Your readiness assessment',
				overallLabel: 'Overall readiness', pass: 'Pass', fail: 'Fail',
				ready: 'Meets the program baseline', notReady: 'Below the program baseline',
				belowBaseline: 'Categories below the baseline', allPassed: 'All five categories meet the baseline.',
				snapshotNote: 'This report reflects the submitted results. Reassess after changing any entries.',
				download: 'Download PDF report', reportFilename: 'IST-report',
				grades: { green: 'Excellent', yellow: 'Passed', red: 'Not passed' },
				report: {
					title: 'IST readiness report', subtitle: 'Army-based program baseline',
					date: 'Assessment date', ageBand: 'Age band',
					category: 'Category', result: 'Result', thresholds: 'Applicable thresholds', grade: 'Grade', outcome: 'Outcome',
					minimum: 'Minimum', midpoint: 'Midpoint', referenceMaximum: 'Reference maximum',
					greenLimit: 'Excellent: at or below', passingLimit: 'Passing limit: at or below', ceiling: 'Body-fat ceiling',
					disclaimer: 'Results are self-reported and assessed against the program’s Army-based baseline. This assessment is not official military clearance or a medical evaluation.'
				}
			}
		};

export type Messages = typeof english;

const spanish: Messages = {
	bootcamp: spanishBootcamp,
		coursesPreview: spanishCoursesPreview,
	admin: spanishAdmin,
	enrollment: spanishEnrollment,
	attendance: spanishAttendance,
	reportArchive: {
		notice: 'Al generar un informe, los PDF en inglés y español, incluidos los datos personales ingresados aquí, se guardan en el Google Drive de Masterminds. Debes iniciar sesión.',
		saved: 'Ambas versiones se guardaron en el Google Drive de Masterminds.',
		localOnly: 'Los PDF están listos para descargar. El guardado en Google Drive no está configurado.',
		signIn: 'Inicia sesión antes de generar un informe y guardarlo en Google Drive. Tus datos se han conservado en esta página.',
		unavailable: 'No pudimos confirmar que ambos PDF se guardaran en Google Drive. El informe no está completo. Tus datos se han conservado; inténtalo más tarde o comunícate con un administrador.'
	},
	auth: {
		email: 'Correo electrónico',
		usernameOrEmail: 'Usuario o correo electrónico',
		localAdminHint: 'Solo para desarrollo local: usa el usuario admin y la contraseña admin.',
		signIn: 'Iniciar sesión',
		signingIn: 'Iniciando sesión…',
		signOut: 'Cerrar sesión',
		signingOut: 'Cerrando sesión…',
		accountLabel: 'Cuenta con sesión iniciada',
		studentWorkspace: 'Masterminds · Panel de estudiantes',
		backToAdmin: 'Volver a administración',
		openDashboard: 'Ir al panel',
		signedInTitle: 'Ya tienes una sesión iniciada',
		signedInDescription: 'Continúa a tu panel con tu cuenta actual.',
		javascriptRequired: 'Activa JavaScript para iniciar sesión de forma segura.',
		student: {
			pageTitle: 'Acceso de estudiantes | Masterminds ASVAB',
			description: 'Accede a tu panel de estudiantes de Masterminds con tu correo y PIN de cuatro dígitos.',
			eyebrow: 'Panel de estudiantes',
			title: 'Acceso de estudiantes',
			introduction: 'Tu próximo paso empieza aquí. Inicia sesión con tu correo y PIN de estudiante.',
			credential: 'PIN de cuatro dígitos',
			credentialHint: 'Introduce exactamente cuatro dígitos (0–9), incluidos los ceros iniciales.',
			invalidCredential: 'Introduce un PIN de exactamente cuatro dígitos (0–9).',
			invalidCredentials: 'El correo o el PIN es incorrecto. Inténtalo de nuevo.'
		},
		admin: {
			pageTitle: 'Acceso de administración | Masterminds ASVAB',
			description: 'Accede al panel de administración de Masterminds con tu cuenta de administrador.',
			eyebrow: 'Administración',
			title: 'Acceso de administración',
			introduction: 'Inicia sesión con tu cuenta de administrador para gestionar tu programa.',
			credential: 'Contraseña',
			credentialHint: 'Usa tu contraseña de administrador (8–128 caracteres).',
			invalidCredential: 'Introduce una contraseña de entre 8 y 128 caracteres.',
			invalidCredentials: 'La cuenta o la contraseña es incorrecta. Inténtalo de nuevo.'
		},
		errors: {
			rateLimited: 'Demasiados intentos. Espera un momento antes de volver a intentarlo.',
			unavailable: 'El inicio de sesión no está disponible temporalmente. Inténtalo de nuevo en unos momentos.',
			signOutFailed: 'No pudimos cerrar tu sesión. Inténtalo de nuevo.'
		}
	},
	accessibility: {
		skipToContent: 'Saltar al contenido'
	},
	language: {
		label: 'Idioma del sitio web'
	},
	speedMath: {
		pageTitle: 'Matemáticas rápidas | Masterminds ASVAB',
		briefingTitle: 'Sesiones cortas. Progreso constante.',
		sessionTitle: 'Tu sesión',
		ready: 'Todo listo para comenzar',
		live: 'Sesión en curso',
		timerHint: 'El tiempo comienza cuando tú decidas.',
		minuteUnit: 'min',
		accuracyFirst: 'Primero la precisión. Luego la velocidad.',
		keyboardHint: 'Listo para el teclado',
		resultsHint: 'Una sesión más de progreso. Sigue encontrando tu ritmo.',
		description: 'Mejora tu velocidad de cálculo mental con práctica cronometrada de suma, resta, multiplicación y división.',
		eyebrow: 'Práctica de cálculo mental',
		title: 'Matemáticas rápidas',
		introduction: 'Compite contra el reloj sin sacrificar la precisión. Responde correctamente tantas preguntas como puedas.',
		setupTitle: 'Prepara tu reto',
		setupHint: 'Una operación. Un cronómetro. Una pregunta nueva después de cada respuesta.',
		duration: 'Elige tu tiempo',
		minutes: '{minutes} minutos',
		operation: 'Elige tu operación',
		operations: {
			addition: 'Suma', subtraction: 'Resta', multiplication: 'Multiplicación', division: 'División'
		},
		spokenOperations: {
			addition: 'más', subtraction: 'menos', multiplication: 'por', division: 'dividido entre'
		},
		operationHints: {
			addition: 'Suma números del 0 al 50.',
			subtraction: 'Resta números del 0 al 50. Las respuestas nunca son negativas.',
			multiplication: 'Multiplicaciones con factores del 1 al 12.',
			division: 'Divisiones de las tablas de multiplicar del 1 al 12. Sin residuos.'
		},
		rulesTitle: 'Mantén el ritmo',
		rules: 'Escribe tu respuesta y presiona Enter. Cada respuesta pasa a la siguiente pregunta, aunque sea incorrecta. Solo las respuestas correctas cuentan para tu puntuación.',
		timerNote: 'El cronómetro sigue corriendo si cambias de pestaña. Las sesiones y puntuaciones no se guardan al salir o recargar esta página.',
		start: 'Comenzar reto',
		challengeLabel: '{operation} · {minutes} minutos',
		timeRemaining: 'Tiempo restante',
		correct: 'Correctas',
		incorrect: 'Incorrectas',
		accuracy: 'Precisión',
		questionNumber: 'Pregunta {number}',
		question: '¿Cuánto es {left} {operation} {right}?',
		answer: 'Tu respuesta',
		answerPlaceholder: 'Escribe un número',
		answerHint: 'Presiona Enter para responder y continuar.',
		submit: 'Responder',
		invalidAnswer: 'Ingresa un número entero igual o mayor que cero.',
		feedbackCorrect: '¡Correcto! {left} {operation} {right} es igual a {answer}.',
		feedbackIncorrect: 'No es correcto. {left} {operation} {right} es igual a {answer}.',
		lowTime: 'Quedan 30 segundos o menos. ¡Sigue así!',
		end: 'Terminar sesión',
		timeUp: '¡Se acabó el tiempo!',
		ended: 'Sesión completada',
		resultsTitle: 'Tus resultados',
		resultsMessage: 'Respondiste correctamente {correct} de {total} preguntas.',
		noAnswers: 'No hubo respuestas esta vez. Comienza otro reto e inténtalo.',
		correctAnswers: 'Respuestas correctas',
		totalAnswered: 'Preguntas respondidas',
		correctPerMinute: 'Correctas por minuto',
		elapsed: 'Tiempo de práctica',
		playAgain: 'Intentar de nuevo',
		changeSettings: 'Cambiar opciones',
		javascriptRequired: 'Activa JavaScript para usar matemáticas rápidas y el cronómetro de la sesión.'
	},
	header: {
		brand: 'Masterminds',
		brandDescription: 'Programa ASVAB',
		brandLabel: 'Masterminds Programa ASVAB',
		student: 'Estudiante',
		tagline: 'Pasos pequeños. Bases sólidas.'
	},
	navigation: {
		label: 'Navegación del panel',
		home: 'Inicio', practice: 'Práctica', resources: 'Recursos del estudiante', workspace: 'Espacio del estudiante',
		tools: {
			math: { title: 'Matemáticas rápidas', description: 'Desarrolla rapidez y precisión con práctica de aritmética cronometrada.', action: 'Practicar matemáticas', category: 'Aritmética' },
			vocabulary: { title: 'Vocabulario en inglés', description: 'Practica palabras frecuentes en inglés con traducciones al español.', action: 'Practicar vocabulario', category: 'Inglés' },
			ist: { title: 'Preparación física', description: 'Ingresa tus resultados del IST, verifica tu preparación y descarga un informe.', action: 'Abrir evaluación IST', category: 'Preparación física' },
			attendance: { title: 'Certificado de asistencia', description: 'Prepara una carta para tu patrono con tu horario de clases.', action: 'Crear certificado', category: 'Documentos' }
		}
	},
	home: {
		pageTitle: 'Panel del estudiante | Masterminds ASVAB',
		description: 'Tu panel de estudiante de Masterminds Programa ASVAB.',
		grades: {
			eyebrow: 'Práctica del ASVAB',
			title: 'Tus notas',
			intro: 'Cuatro áreas clave. Una vista clara.',
			sectionHint: 'Elige una destreza para practicar.',
			sampleData: 'Notas de ejemplo',
			sampleNote: 'Solo una vista previa: porcentajes de práctica ficticios, no notas de estudiantes ni puntuaciones oficiales del ASVAB.',
			score: '{score} %',
			scoreText: 'Nota de práctica de ejemplo: {score} por ciento',
			subjects: {
				wk: { code: 'WK', title: 'Conocimiento de palabras' },
				pc: { code: 'PC', title: 'Comprensión de párrafos' },
				mk: { code: 'MK', title: 'Conocimiento matemático' },
				ar: { code: 'AR', title: 'Razonamiento aritmético' }
			}
		}
	},
frequency: {
	pageTitle: 'Tarjetas de inglés frecuente | Masterminds ASVAB',
	description: 'Practica 1,001 palabras frecuentes en inglés con traducciones al español en rondas adaptativas de 25 intentos que refuerzan las palabras que te cuestan.',
	eyebrow: 'Palabra por palabra',
	title: 'Tarjetas de inglés frecuente',
	introduction: 'Mira la palabra en inglés. Recuérdala en español. Amplía tu vocabulario, una tarjeta a la vez.',

	sessionOnly: 'Tu progreso solo se conserva mientras estás en esta página. Al salir o recargar, se reinicia.',
	methodTitle: 'El ritmo',
	methodSteps: {
		recall: {
			title: 'Recuerda',
			description: 'Lee la palabra en inglés. Piensa en su significado en español.'
		},
		search: {
			title: 'Elige',
			description: 'Escribe en español y elige una sugerencia.'
		},
		repeat: {
			title: 'Refuerza',
			description: 'Repasa la traducción. Las palabras que falles se practican más mientras sean elegibles.'
		}
	},
	untimed: 'A tu ritmo',
	sessionLabel: 'Práctica de vocabulario',
	setupTitle: 'Un vocabulario más sólido empieza aquí.',
	setupDescription: 'Practica palabras frecuentes en inglés en rondas cortas y adaptativas. Sin cronómetro. Una palabra a la vez.',
	keyboardTip: 'Usa ↑ ↓ para elegir una sugerencia y Enter para responder.',
	direction: 'Inglés → español',
	englishShort: 'EN',
	spanishShort: 'ES',
	wordCount: '{count} palabras en inglés',
	roundSize: '{count} intentos por ronda',
	roundLabel: 'Ronda {round}',

	progressTitle: 'Tu progreso en toda la lista',
	practiceCoverage: 'Palabras practicadas',
	firstPassCoverage: 'Con al menos una respuesta correcta',

	currentPass: 'Repaso {pass}',
	passProgressLabel: 'Progreso del repaso actual',
	poolProgress: '{count} de {total} palabras · {percent}%',


	readyTitle: '¿Empezamos a practicar?',
	startHint: 'Empieza una ronda de {count} intentos cuando quieras.',
	startRound: 'Empezar ronda',
	cardProgress: 'Intento {current} de {total}',
	progressLabel: 'Progreso de la ronda',
	answeredProgress: '{answered} de {total} intentos registrados',
	correctCount: 'Correctas',
	incorrectCount: 'Incorrectas',
	skippedCount: 'Omitidas',
	frequencyRank: 'Puesto de frecuencia #{rank}',
	englishWord: 'Palabra en inglés',
	prompt: '¿Cómo dirías esto en español?',
	spanishTranslation: 'Traducción al español',
		alsoAccepted: 'También se acepta',

	answerLabel: 'Tu respuesta en español',
	answerPlaceholder: 'Empieza a escribir en español…',
	answerHint: 'Busca en toda la lista. Elige una sugerencia o usa ↑ ↓ y Enter. La búsqueda admite palabras sin acentos y pequeños errores.',
	suggestionsLabel: 'Sugerencias de traducciones al español',
	suggestionCount: '{count} sugerencias disponibles.',
	noMatches: 'Todavía no hay coincidencias. Prueba otra forma de escribirlo o revela la respuesta.',
	searchPrompt: 'Tus sugerencias en español aparecerán aquí.',
	checkAnswer: 'Comprobar respuesta',
	dontKnow: 'No sé · Revelar',
	correct: '¡Bien recordado!',
	incorrect: 'Una palabra para practicar',
	skipped: 'Ahora lo sabes',
	incorrectHint: 'Compara las traducciones. Esta palabra conserva su conteo de aciertos y recibe más oportunidades mientras sea elegible.',
	skippedHint: 'Lee la traducción en voz alta. Omitirla le da la misma práctica adicional que una respuesta incorrecta.',
	otherWaysToSayIt: 'También podrías decir',
	yourAnswer: 'Elegiste',
	nextCard: 'Siguiente tarjeta',
	finishRound: 'Ver resultados',
	completeTitle: 'Ronda completada',
	completeMessage: 'Respondiste correctamente en {correct} de {total} intentos.',
	perfectMessage: 'Todos los intentos correctos. Tu progreso continúa en la próxima ronda.',
	reviewMessage: 'Las palabras que te cuestan reciben más oportunidades cuando son elegibles. La próxima ronda sigue el orden de repaso de toda la lista.',
	reviewList: 'Palabras falladas u omitidas en esta ronda',
	nextRound: 'Empezar la próxima ronda',

	javascriptRequired: 'Activa JavaScript para usar las tarjetas interactivas y la búsqueda de respuestas.'
},
			ist: {
				pageTitle: 'Preparación física IST | Masterminds ASVAB',
				description: 'Evalúa tu preparación física autodeclarada según los criterios del programa basados en el Ejército y descarga un informe IST.',
				eyebrow: 'Prueba de fuerza inicial',
				title: 'Verifica tu preparación',
				introduction: 'Un punto de partida claro para tu entrenamiento. Ingresa tus resultados para ver dónde cumples los criterios del programa y en qué enfocarte.',

				studentDetails: 'Datos del estudiante',
				studentDetailsHint: 'Tu edad y sexo de referencia determinan los umbrales aplicables.',
				measurements: 'Medidas corporales',
				measurementsHint: 'Usa libras y pulgadas. Se aceptan medidas decimales; no se necesita la estatura.',
				exerciseResults: 'Resultados de ejercicio',
				exerciseHint: 'Para cada ejercicio, elige «Registrar un resultado» para habilitar los campos o «No pude completar» si no lograste completarlo. Un resultado de cero repeticiones es válido. No ingreses un tiempo de cero para indicar que no pudiste completar el ejercicio.',
				nativeExerciseHint: 'Sin JavaScript, al elegir una opción de ejercicio se recarga el formulario y se conservan los demás datos. Si eliges «No pude completar», se borra el resultado anterior de ese ejercicio.',
				fields: {
					studentName: 'Nombre del estudiante', sex: 'Sexo de referencia', age: 'Edad (años)',
					weightLb: 'Peso (lb)', waistIn: 'Circunferencia de cintura (pulgadas)'
				},
				sexOptions: { male: 'Masculino', female: 'Femenino' },
				categories: { pushUps: 'Push-ups', sitUps: 'Sit-ups', plank: 'Plank', run: 'One-mile run', bodyFat: 'Grasa corporal estimada' },
				completion: 'Estado de realización', choose: 'Elige una opción', recorded: 'Registrar un resultado', unable: 'No pude completar',
				repetitions: 'Repeticiones', minutes: 'Minutos', seconds: 'Segundos',
				hints: {
					age: '17–51 años cumplidos', weightLb: '70–400 lb', waistIn: '18–60 pulgadas',
					repetitions: '0–300 repeticiones enteras', duration: 'Duración total: 1–3600 segundos (hasta 60:00).',
					minutes: 'Minutos enteros no negativos', seconds: '0–59 segundos enteros'
				},
				units: { pounds: 'lb', inches: 'pulgadas', years: 'años', repetitions: 'reps', seconds: 's', minutesSeconds: 'min:seg' },
				submit: 'Evaluar preparación', submitting: 'Evaluando…',
				errorSummary: 'Corrige los campos indicados antes de generar una evaluación.',
				errors: {
					required: 'Este campo es obligatorio.', number: 'Ingresa un número finito válido sin caracteres adicionales.',
					whole: 'Ingresa un número entero.', range: 'Ingresa un valor dentro del rango indicado.',
					sex: 'Elige la referencia masculina o femenina.', status: 'Elige un estado de realización.',
					inconsistent: 'Registra un resultado con valores válidos o selecciona «No pude completar» sin ingresar valores numéricos.',
					bodyFat: 'Estas medidas dan una estimación fuera de 0–100%. Revisa tu peso y la circunferencia de cintura.'
				},
				serverError: 'No pudimos generar tu informe. Tus datos se han conservado; inténtalo de nuevo.',
				resultsTitle: 'Tu evaluación de preparación',
				overallLabel: 'Preparación general', pass: 'Aprobado', fail: 'No Aprobado',
				ready: 'Cumple los criterios del programa', notReady: 'Por debajo de los criterios del programa',
				belowBaseline: 'Categorías por debajo de los criterios', allPassed: 'Las cinco categorías cumplen los criterios.',
				snapshotNote: 'Este informe refleja los resultados enviados. Evalúa de nuevo después de cambiar los datos.',
				download: 'Descargar informe PDF', reportFilename: 'informe-IST',
				grades: { green: 'Excelente', yellow: 'Aprobado', red: 'No Aprobado' },
				report: {
					title: 'Informe de preparación IST', subtitle: 'Criterios del programa basados en el Ejército',
					date: 'Fecha de evaluación', ageBand: 'Grupo de edad',
					category: 'Categoría', result: 'Resultado', thresholds: 'Umbrales aplicables', grade: 'Calificación', outcome: 'Resultado final',
					minimum: 'Mínimo', midpoint: 'Punto medio', referenceMaximum: 'Máximo de referencia',
					greenLimit: 'Excelente: igual o menor que', passingLimit: 'Límite para aprobar: igual o menor que', ceiling: 'Límite de grasa corporal',
					disclaimer: 'Los resultados son autodeclarados y se evalúan según los criterios del programa basados en el Ejército. Esta evaluación no es una autorización militar oficial ni una evaluación médica.'
				}
			}
		};

export const translations: Record<Language, Messages> = {
	en: english,
	es: spanish
};

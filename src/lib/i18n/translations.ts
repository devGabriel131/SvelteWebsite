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

const englishAdmin = {
	pageTitle: 'Admin command center | Masterminds ASVAB',
	description: 'Design preview of the Masterminds administration workspace. All student activity and operations use fictional demo data.',
	console: 'Command console', workspace: 'Program operations', operator: 'Admin', role: 'Mission control',
	navigation: 'Admin navigation', backToStudents: 'Student workspace', topLabel: 'Administration',
	prototype: 'Design preview', prototypeNote: 'Simulation mode. Fictional data. Changes stay in this session; no messages, charges, or refunds are sent.',
	footer: 'Masterminds / Operations', version: 'Prototype v0.1',
	sections: { overview: 'Overview', students: 'Students', payments: 'Payments', invitations: 'Invitations', reports: 'Grade reports', events: 'Events' },
	intro: {
		overview: { eyebrow: 'Your program. In full view.', title: 'Command center', description: 'A clear picture of your students. Every next move within reach.' },
		students: { eyebrow: 'Personnel / 01', title: 'Student roster', description: 'Keep your students, their progress, and their next steps in formation.' },
		payments: { eyebrow: 'Finance / 02', title: 'Payment operations', description: 'Preview payment links and refund workflows. No real transactions.' },
		invitations: { eyebrow: 'Recruitment / 03', title: 'Program invitations', description: 'Give your next students a clear route into the program.' },
		reports: { eyebrow: 'Intelligence / 04', title: 'Grade reports', description: 'A staging area for student results. Preview a CSV before the real import is connected.' },
		events: { eyebrow: 'Scheduling / 05', title: 'Upcoming operations', description: 'A preview of how sessions and student assignments will come together.' }
	},
	common: {
		preview: 'Preview', sampleData: 'Sample data', notConnected: 'Not connected', localOnly: 'Local preview only',
		cancel: 'Cancel', close: 'Close', save: 'Save preview', create: 'Create preview', copy: 'Copy link',
		copied: 'Preview link copied. It is not a working program link.', copyFailed: 'Clipboard unavailable. Select and copy the preview link below.',
		created: 'Preview created. Nothing was sent or saved to a server.', updated: 'Preview updated. Changes reset when you reload this page.',
		viewAll: 'View all', student: 'Student', cohort: 'Cohort', status: 'Status', actions: 'Actions',
		justNow: 'Just now', minutesAgo: '{count} min ago', hoursAgo: '{count} hr ago', daysAgo: '{count} days ago', never: 'Not yet',
		statusLabels: { active: 'Active', invited: 'Invited', paused: 'Paused' },
		allStudents: 'All students', selectStudent: 'Select a student', required: 'Complete the required fields.',
		notAvailable: '—', usd: 'USD', demoLink: 'Nonfunctional preview link',
	},
	overview: {
		addStudent: 'Add student', quickActions: 'Quick actions', createPayment: 'Payment link', inviteStudent: 'Invite student', uploadGrades: 'Upload grades',
		metrics: { total: 'Total students', active: 'Active students', average: 'Average score', attention: 'Need attention' },
		metricHints: { total: 'Students in the demo roster', active: 'Currently in training', average: 'Across graded students', attention: 'Low score or paused training' },
		activityTitle: 'Training activity', activitySubtitle: 'Student sessions over time', chartLabel: 'Sample student sessions',
		week: '7 days', month: '30 days', periodLabel: 'Activity period', sessions: 'Sessions', activityChange: '+18% vs. previous period',
		chartDescription: 'Fictional student-session trend for the selected period. Session values are listed below the chart.',
		days: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
		monthStart: 'Day 1', monthMiddle: 'Day 15', monthEnd: 'Day 30',
		readinessTitle: 'Readiness radar', readinessSubtitle: 'Average demo score', target: 'Target score', focus: 'Keep the momentum.', readinessNote: 'A visual training indicator, not an official readiness assessment.',
		feedTitle: 'Activity log', feedSubtitle: 'Latest sample signals',
		feed: { assessment: 'Completed a practice assessment', lesson: 'Finished a word knowledge lesson', invitation: 'Program invitation staged', report: 'Grade report ready for review' },
		feedTime: { assessment: '4 min ago', lesson: '12 min ago', invitation: '28 min ago', report: '1 hr ago' },
		eventTitle: 'Next on the radar', eventName: 'ASVAB strategy session', eventType: 'Group briefing', eventTime: 'Oct 08 · 18:00', eventCohort: 'Alpha 01 + Bravo 02', eventNote: 'Sample schedule · events are not connected',
		viewSchedule: 'Preview schedule', attentionTitle: 'A little course correction', attentionDescription: '{count} students could use a check-in. Review low scores and paused training.', reviewStudents: 'Review students',
		systems: 'System connections', database: 'Student database', billing: 'Payment provider', scheduling: 'Event scheduling', awaiting: 'Awaiting integration'
	},
	students: {
		title: 'Student roster', subtitle: 'People behind the progress', search: 'Search name, email, or cohort', searchLabel: 'Search students',
		filterLabel: 'Filter by student status', all: 'All statuses', score: 'Score', progress: 'Progress', lastActive: 'Last active',
		add: 'Add student', edit: 'Edit student', editLabel: 'Edit {name}', empty: 'No students match these filters.', count: '{count} students',
		name: 'Full name', email: 'Email address', cohort: 'Cohort', status: 'Student status',
		addTitle: 'Add a student', editTitle: 'Student details', formNote: 'This edits the fictional roster only. No invitation is sent.',
		namePlaceholder: 'Student full name', emailPlaceholder: 'student@example.com', cohortPlaceholder: 'e.g. Alpha 01',
		scoreLabel: 'Practice score (0–100)', progressLabel: 'Program progress (0–100%)', noScore: 'No score yet',
		saved: 'Student saved in the demo roster. No database record was created.',
		validation: 'Enter a name, valid email, cohort, and values between 0 and 100.',
	},
	payments: {
		createTitle: 'Create a payment link', createDescription: 'Set up a preview of a program payment. Real checkout will be connected later.',
		label: 'Payment name', labelPlaceholder: 'e.g. ASVAB preparation program', amount: 'Amount (USD)', amountPlaceholder: '250.00',
		generate: 'Generate preview link', linksTitle: 'Payment links', linksDescription: 'Preview links are intentionally nonfunctional.',
		empty: 'Your preview payment links will appear here.', sampleName: 'ASVAB preparation program', draft: 'Preview only',
		refundsTitle: 'Refund queue', refundsDescription: 'A sample request to explore the review flow.', refundReason: 'Student requested cancellation',
		refundRequested: 'Requested', refundReviewed: 'Reviewed in preview', reviewRefund: 'Review request',
		refundTitle: 'Review a refund', refundNote: 'This marks a fictional request as reviewed. It does not issue a refund or contact a payment provider.',
		confirmRefund: 'Mark reviewed in preview', refundSuccess: 'Demo request reviewed. No money was refunded.',
		invalidAmount: 'Enter a payment name and an amount between $1 and $10,000.', recipient: 'Recipient', amountLabel: 'Amount',
	},
	invitations: {
		createTitle: 'Invite to the program', createDescription: 'Prepare an invitation preview. Nothing is emailed and no enrollment is created.',
		name: 'Student name', email: 'Student email', cohort: 'Assigned cohort', expires: 'Link expires after', sevenDays: '7 days', thirtyDays: '30 days',
		generate: 'Generate invitation preview', linksTitle: 'Invitation links', linksDescription: 'Preview invitations for your next intake.',
		empty: 'Create your first invitation preview.', queued: 'Not sent', sampleName: 'Emma Wilson', expiresIn: '{count}-day expiry preview',
	},
	reports: {
		uploadTitle: 'Grade import staging', uploadDescription: 'Choose a CSV to inspect its name and size. This prototype does not parse grades or update students.',
		dropTitle: 'Your next report starts here', dropDescription: 'CSV files up to 5 MB · local file selection only', choose: 'Choose a CSV', inputLabel: 'Select a student grade CSV for preview',
		formatTitle: 'Suggested file format', formatDescription: 'An illustrative format, not a database contract. Final columns will follow the new schema.',
		template: 'Download sample CSV', fileName: 'masterminds-grades-sample.csv',
		selected: 'File staged locally', noFile: 'No file selected', remove: 'Remove file', size: 'File size',
		notImported: 'Not imported. CSV validation, student matching, and persistence will be wired up later.', invalidFile: 'Choose a .csv file no larger than 5 MB.',
		historyTitle: 'Report history', historyDescription: 'Sample uploads to show the future review experience.',
		file: 'Report', rows: 'Student rows', state: 'Import status', reviewed: 'Sample reviewed', pending: 'Sample awaiting review',
		columns: { student: 'Student ID', score: 'Practice score', date: 'Assessment date' },
		steps: { one: 'Select a report', two: 'Validate & match students', three: 'Review & import' }, future: 'Future integration',
	},
	events: {
		placeholder: 'Scheduling module / coming next', placeholderDescription: 'Events are not built yet. This is a visual placeholder for sessions, assignments, and attendance.',
		scheduleTitle: 'Sample flight plan', session: 'ASVAB strategy session', practice: 'Timed practice assessment', checkIn: 'Student progress check-in',
		briefing: 'Group briefing', assessment: 'Practice assessment', coaching: 'Coaching session',
		dates: { session: 'Oct 08', practice: 'Oct 10', checkIn: 'Oct 12' },
		assignmentTitle: 'Preview an assignment', assignmentDescription: 'Explore the assignment control without creating a real event.',
		event: 'Sample event', student: 'Student', assign: 'Preview assignment', assigned: 'Assignment previewed. No event was created and no student was notified.',
		attendance: 'Attendance tracking', attendanceNote: 'Will appear here when events are connected.',
	}
};

const spanishAdmin: typeof englishAdmin = {
	pageTitle: 'Centro de mando administrativo | Masterminds ASVAB',
	description: 'Vista previa del espacio administrativo de Masterminds. La actividad estudiantil y las operaciones usan datos ficticios.',
	console: 'Consola de mando', workspace: 'Operaciones del programa', operator: 'Admin', role: 'Control de misión',
	navigation: 'Navegación administrativa', backToStudents: 'Espacio del estudiante', topLabel: 'Administración',
	prototype: 'Vista previa del diseño', prototypeNote: 'Modo simulación. Datos ficticios. Los cambios duran esta sesión; no se envían mensajes ni se realizan cobros o reembolsos.',
	footer: 'Masterminds / Operaciones', version: 'Prototipo v0.1',
	sections: { overview: 'Resumen', students: 'Estudiantes', payments: 'Pagos', invitations: 'Invitaciones', reports: 'Informes de notas', events: 'Eventos' },
	intro: {
		overview: { eyebrow: 'Tu programa. A plena vista.', title: 'Centro de mando', description: 'Una vista clara de tus estudiantes. Cada próximo paso a tu alcance.' },
		students: { eyebrow: 'Personal / 01', title: 'Registro estudiantil', description: 'Mantén en formación a tus estudiantes, su progreso y sus próximos pasos.' },
		payments: { eyebrow: 'Finanzas / 02', title: 'Operaciones de pago', description: 'Explora enlaces de pago y reembolsos. Sin transacciones reales.' },
		invitations: { eyebrow: 'Reclutamiento / 03', title: 'Invitaciones al programa', description: 'Dale a tus próximos estudiantes una ruta clara para entrar al programa.' },
		reports: { eyebrow: 'Inteligencia / 04', title: 'Informes de notas', description: 'Un espacio para preparar resultados. Selecciona un CSV antes de conectar la importación real.' },
		events: { eyebrow: 'Calendario / 05', title: 'Próximas operaciones', description: 'Una vista previa de cómo se organizarán las sesiones y asignaciones.' }
	},
	common: {
		preview: 'Vista previa', sampleData: 'Datos de ejemplo', notConnected: 'Sin conectar', localOnly: 'Solo vista previa local',
		cancel: 'Cancelar', close: 'Cerrar', save: 'Guardar vista previa', create: 'Crear vista previa', copy: 'Copiar enlace',
		copied: 'Enlace de ejemplo copiado. No es un enlace funcional del programa.', copyFailed: 'Portapapeles no disponible. Selecciona y copia el enlace de ejemplo.',
		created: 'Vista previa creada. No se envió ni se guardó nada en un servidor.', updated: 'Vista previa actualizada. Los cambios se restablecen al recargar.',
		viewAll: 'Ver todos', student: 'Estudiante', cohort: 'Grupo', status: 'Estado', actions: 'Acciones',
		justNow: 'Ahora mismo', minutesAgo: 'Hace {count} min', hoursAgo: 'Hace {count} h', daysAgo: 'Hace {count} días', never: 'Aún no',
		statusLabels: { active: 'Activo', invited: 'Invitado', paused: 'En pausa' },
		allStudents: 'Todos los estudiantes', selectStudent: 'Selecciona un estudiante', required: 'Completa los campos requeridos.',
		notAvailable: '—', usd: 'USD', demoLink: 'Enlace de ejemplo no funcional',
	},
	overview: {
		addStudent: 'Añadir estudiante', quickActions: 'Acciones rápidas', createPayment: 'Enlace de pago', inviteStudent: 'Invitar estudiante', uploadGrades: 'Subir notas',
		metrics: { total: 'Total de estudiantes', active: 'Estudiantes activos', average: 'Puntuación media', attention: 'Necesitan atención' },
		metricHints: { total: 'Estudiantes del registro de ejemplo', active: 'En preparación actualmente', average: 'Entre estudiantes evaluados', attention: 'Puntuación baja o preparación pausada' },
		activityTitle: 'Actividad de preparación', activitySubtitle: 'Sesiones de estudiantes a lo largo del tiempo', chartLabel: 'Sesiones estudiantiles de ejemplo',
		week: '7 días', month: '30 días', periodLabel: 'Período de actividad', sessions: 'Sesiones', activityChange: '+18% frente al período anterior',
		chartDescription: 'Tendencia ficticia de sesiones en el período seleccionado. Los valores se enumeran debajo de la gráfica.',
		days: { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' },
		monthStart: 'Día 1', monthMiddle: 'Día 15', monthEnd: 'Día 30',
		readinessTitle: 'Radar de preparación', readinessSubtitle: 'Puntuación media de ejemplo', target: 'Puntuación objetivo', focus: 'Mantén el impulso.', readinessNote: 'Indicador visual de preparación; no es una evaluación oficial.',
		feedTitle: 'Registro de actividad', feedSubtitle: 'Últimas señales de ejemplo',
		feed: { assessment: 'Completó una evaluación de práctica', lesson: 'Terminó una lección de vocabulario', invitation: 'Invitación al programa preparada', report: 'Informe de notas listo para revisión' },
		feedTime: { assessment: 'Hace 4 min', lesson: 'Hace 12 min', invitation: 'Hace 28 min', report: 'Hace 1 h' },
		eventTitle: 'Próximo en el radar', eventName: 'Sesión de estrategia ASVAB', eventType: 'Sesión grupal', eventTime: '08 oct · 18:00', eventCohort: 'Alpha 01 + Bravo 02', eventNote: 'Calendario de ejemplo · eventos sin conectar',
		viewSchedule: 'Ver calendario de ejemplo', attentionTitle: 'Un pequeño ajuste de rumbo', attentionDescription: '{count} estudiantes podrían necesitar seguimiento. Revisa las puntuaciones bajas y la preparación en pausa.', reviewStudents: 'Revisar estudiantes',
		systems: 'Conexiones del sistema', database: 'Base de datos estudiantil', billing: 'Proveedor de pagos', scheduling: 'Calendario de eventos', awaiting: 'Pendiente de integración'
	},
	students: {
		title: 'Registro estudiantil', subtitle: 'Las personas detrás del progreso', search: 'Busca nombre, correo o grupo', searchLabel: 'Buscar estudiantes',
		filterLabel: 'Filtrar por estado del estudiante', all: 'Todos los estados', score: 'Puntuación', progress: 'Progreso', lastActive: 'Última actividad',
		add: 'Añadir estudiante', edit: 'Editar estudiante', editLabel: 'Editar a {name}', empty: 'Ningún estudiante coincide con estos filtros.', count: '{count} estudiantes',
		name: 'Nombre completo', email: 'Correo electrónico', cohort: 'Grupo', status: 'Estado del estudiante',
		addTitle: 'Añadir un estudiante', editTitle: 'Datos del estudiante', formNote: 'Esto solo modifica el registro ficticio. No se envía ninguna invitación.',
		namePlaceholder: 'Nombre completo del estudiante', emailPlaceholder: 'estudiante@example.com', cohortPlaceholder: 'p. ej., Alpha 01',
		scoreLabel: 'Puntuación de práctica (0–100)', progressLabel: 'Progreso del programa (0–100%)', noScore: 'Sin puntuación aún',
		saved: 'Estudiante guardado en el registro de ejemplo. No se creó un registro en la base de datos.',
		validation: 'Ingresa un nombre, correo válido, grupo y valores entre 0 y 100.',
	},
	payments: {
		createTitle: 'Crear un enlace de pago', createDescription: 'Prepara un ejemplo de pago del programa. El cobro real se conectará más adelante.',
		label: 'Nombre del pago', labelPlaceholder: 'p. ej., Programa de preparación ASVAB', amount: 'Importe (USD)', amountPlaceholder: '250.00',
		generate: 'Generar enlace de ejemplo', linksTitle: 'Enlaces de pago', linksDescription: 'Los enlaces de ejemplo no son funcionales.',
		empty: 'Tus enlaces de pago de ejemplo aparecerán aquí.', sampleName: 'Programa de preparación ASVAB', draft: 'Solo vista previa',
		refundsTitle: 'Solicitudes de reembolso', refundsDescription: 'Una solicitud ficticia para explorar el proceso de revisión.', refundReason: 'El estudiante solicitó cancelar',
		refundRequested: 'Solicitado', refundReviewed: 'Revisado en vista previa', reviewRefund: 'Revisar solicitud',
		refundTitle: 'Revisar un reembolso', refundNote: 'Esto marca una solicitud ficticia como revisada. No emite un reembolso ni contacta un proveedor de pagos.',
		confirmRefund: 'Marcar revisado en vista previa', refundSuccess: 'Solicitud de ejemplo revisada. No se reembolsó dinero.',
		invalidAmount: 'Ingresa un nombre de pago y un importe entre $1 y $10,000.', recipient: 'Destinatario', amountLabel: 'Importe',
	},
	invitations: {
		createTitle: 'Invitar al programa', createDescription: 'Prepara una invitación de ejemplo. No se envía ningún correo ni se crea una matrícula.',
		name: 'Nombre del estudiante', email: 'Correo del estudiante', cohort: 'Grupo asignado', expires: 'El enlace vence después de', sevenDays: '7 días', thirtyDays: '30 días',
		generate: 'Generar invitación de ejemplo', linksTitle: 'Enlaces de invitación', linksDescription: 'Invitaciones de ejemplo para tus próximos estudiantes.',
		empty: 'Crea tu primera invitación de ejemplo.', queued: 'No enviada', sampleName: 'Emma Wilson', expiresIn: 'Vencimiento de ejemplo: {count} días',
	},
	reports: {
		uploadTitle: 'Preparación de importación', uploadDescription: 'Selecciona un CSV para ver su nombre y tamaño. Este prototipo no lee notas ni actualiza estudiantes.',
		dropTitle: 'Tu próximo informe comienza aquí', dropDescription: 'Archivos CSV de hasta 5 MB · solo selección local', choose: 'Seleccionar un CSV', inputLabel: 'Seleccionar un CSV de notas para vista previa',
		formatTitle: 'Formato sugerido', formatDescription: 'Un formato ilustrativo, no un contrato de base de datos. Las columnas definitivas seguirán el nuevo esquema.',
		template: 'Descargar CSV de ejemplo', fileName: 'masterminds-notas-ejemplo.csv',
		selected: 'Archivo preparado localmente', noFile: 'Ningún archivo seleccionado', remove: 'Quitar archivo', size: 'Tamaño del archivo',
		notImported: 'No importado. La validación del CSV, la identificación de estudiantes y el guardado se conectarán más adelante.', invalidFile: 'Selecciona un archivo .csv de hasta 5 MB.',
		historyTitle: 'Historial de informes', historyDescription: 'Cargas ficticias para mostrar la futura experiencia de revisión.',
		file: 'Informe', rows: 'Filas de estudiantes', state: 'Estado de importación', reviewed: 'Ejemplo revisado', pending: 'Ejemplo pendiente de revisión',
		columns: { student: 'ID del estudiante', score: 'Puntuación de práctica', date: 'Fecha de evaluación' },
		steps: { one: 'Seleccionar informe', two: 'Validar y vincular estudiantes', three: 'Revisar e importar' }, future: 'Integración futura',
	},
	events: {
		placeholder: 'Módulo de calendario / próximamente', placeholderDescription: 'Los eventos aún no están creados. Este es un espacio visual para sesiones, asignaciones y asistencia.',
		scheduleTitle: 'Plan de vuelo de ejemplo', session: 'Sesión de estrategia ASVAB', practice: 'Evaluación de práctica cronometrada', checkIn: 'Seguimiento del progreso estudiantil',
		briefing: 'Sesión grupal', assessment: 'Evaluación de práctica', coaching: 'Sesión de orientación',
		dates: { session: '08 oct', practice: '10 oct', checkIn: '12 oct' },
		assignmentTitle: 'Explorar una asignación', assignmentDescription: 'Prueba el control de asignaciones sin crear un evento real.',
		event: 'Evento de ejemplo', student: 'Estudiante', assign: 'Ver asignación de ejemplo', assigned: 'Asignación simulada. No se creó ningún evento ni se notificó al estudiante.',
		attendance: 'Control de asistencia', attendanceNote: 'Aparecerá aquí cuando se conecten los eventos.',
	}
};

const englishAttendance = {
	pageTitle: 'Attendance certificate | Masterminds ASVAB',
	description: 'Generate a bilingual employer letter with your Masterminds ASVAB program start date and weekly class schedule.',
	eyebrow: 'Employer documents',
	title: 'Attendance certificate',
	introduction: 'Create a letter for your employer explaining your participation in the ASVAB preparation program and requesting flexibility for your weekly classes.',
	cardDescription: 'Prepare an employer letter with your program details and class schedule, then download it in English or Spanish.',
	open: 'Create your attendance certificate',

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
	cardDescription: 'Prepara una carta para tu patrono con tus datos del programa y horario de clases, y descárgala en inglés o español.',
	open: 'Crear tu certificado de asistencia',

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

const englishDesignPreview = {
	pageTitle: 'Home design study | Masterminds ASVAB',
	description: 'Compare three home page design directions using the Masterminds company colors.',
	title: 'One home. Three directions.',
	label: 'Design study',
	chooseDirection: 'Choose a design direction',
	back: 'Back to current home',
	note: 'Design comparison. Focus is now the main home page. Tool links open the existing pages.',
	recommendation: 'Recommended',
	directions: {
		focus: {
			name: 'Focus',
			summary: 'A calm, dark workspace. A sidebar keeps navigation familiar, with grades and practice up front and documents out of the way.',
			tradeoff: 'Low effort · Reuses the current shell structure. Best for everyday use; the sidebar takes some desktop space.'
		},
		'field-notes': {
			name: 'Field Notes',
			summary: 'A warm, cream-colored study space. Big typography, a featured practice card, and an uncluttered resource list.',
			tradeoff: 'Low–medium effort · Same components, light theme tokens. More distinctive, but the light palette would need checking on the other pages.'
		},
		launchpad: {
			name: 'Launchpad',
			summary: 'A compact, action-first home. No sidebar, no distractions: choose a tool and get started.',
			tradeoff: 'Lowest effort · A header and a responsive card grid. Great on phones; less room for navigation as the site grows.'
		}
	},
	workspace: 'Student workspace',
	student: 'Student',
	studentProfile: 'Student profile preview',
	home: 'Home',
	practice: 'Practice',
	resources: 'Student resources',
	allTools: 'Your toolkit',
	openTool: 'Open tool',
	footer: 'Small steps. Strong foundations.',
	focus: {
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
	},
	fieldNotes: {
		eyebrow: 'A little practice goes a long way',
		title: 'Prepare for your next chapter.',
		intro: 'A quieter space for a bigger goal. Your ASVAB practice and student essentials, thoughtfully brought together.',
		featured: 'A place to begin',
		sectionHint: 'Everything you need, without the noise.'
	},
	launchpad: {
		eyebrow: 'Less searching. More doing.',
		title: 'What will you work on today?',
		intro: 'Pick a tool. Take the next step.'
	},
	tools: {
		math: { title: 'Speed Math', description: 'Build speed and accuracy with timed arithmetic practice.', action: 'Practice math', category: 'Arithmetic' },
		vocabulary: { title: 'English vocabulary', description: 'Practice frequent English words with Spanish translations.', action: 'Practice vocabulary', category: 'English' },
		ist: { title: 'Physical readiness', description: 'Enter your IST results, check readiness, and download a report.', action: 'Open IST assessment', category: 'Readiness' },
		attendance: { title: 'Attendance certificate', description: 'Create a letter for your employer with your class schedule.', action: 'Create certificate', category: 'Documents' }
	}
};

const spanishDesignPreview: typeof englishDesignPreview = {
	pageTitle: 'Propuestas de inicio | Masterminds ASVAB',
	description: 'Compara tres propuestas para la página de inicio con los colores de Masterminds.',
	title: 'Un inicio. Tres propuestas.',
	label: 'Exploración de diseño',
	chooseDirection: 'Elige una propuesta de diseño',
	back: 'Volver al inicio actual',
	note: 'Comparación de diseños. Enfoque es ahora la página de inicio. Los enlaces abren las herramientas existentes.',
	recommendation: 'Recomendado',
	directions: {
		focus: {
			name: 'Enfoque',
			summary: 'Un espacio oscuro y tranquilo. La barra lateral mantiene la navegación familiar, con las notas y la práctica al frente y los documentos en segundo plano.',
			tradeoff: 'Esfuerzo bajo · Reutiliza la estructura actual. Ideal para el uso diario; la barra lateral ocupa parte del espacio en computadoras.'
		},
		'field-notes': {
			name: 'Cuaderno',
			summary: 'Un espacio de estudio cálido en tonos crema. Tipografía grande, una tarjeta de práctica destacada y una lista sencilla de recursos.',
			tradeoff: 'Esfuerzo bajo–medio · Los mismos componentes con un tema claro. Más distintivo, pero habría que revisar los colores en las demás páginas.'
		},
		launchpad: {
			name: 'Punto de partida',
			summary: 'Un inicio compacto que invita a actuar. Sin barra lateral ni distracciones: elige una herramienta y empieza.',
			tradeoff: 'El menor esfuerzo · Un encabezado y tarjetas adaptables. Ideal para celulares; menos espacio de navegación a medida que crezca el sitio.'
		}
	},
	workspace: 'Espacio del estudiante',
	student: 'Estudiante',
	studentProfile: 'Vista previa del perfil del estudiante',
	home: 'Inicio',
	practice: 'Práctica',
	resources: 'Recursos del estudiante',
	allTools: 'Tus herramientas',
	openTool: 'Abrir herramienta',
	footer: 'Pasos pequeños. Bases sólidas.',
	focus: {
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
	},
	fieldNotes: {
		eyebrow: 'Un poco de práctica hace la diferencia',
		title: 'Prepárate para tu próximo capítulo.',
		intro: 'Un espacio tranquilo para una gran meta. Tu práctica del ASVAB y tus recursos de estudiante, juntos en un solo lugar.',
		featured: 'Un punto de partida',
		sectionHint: 'Todo lo que necesitas, sin distracciones.'
	},
	launchpad: {
		eyebrow: 'Menos búsquedas. Más acción.',
		title: '¿Qué vas a practicar hoy?',
		intro: 'Elige una herramienta. Da el próximo paso.'
	},
	tools: {
		math: { title: 'Matemáticas rápidas', description: 'Desarrolla rapidez y precisión con práctica de aritmética cronometrada.', action: 'Practicar matemáticas', category: 'Aritmética' },
		vocabulary: { title: 'Vocabulario en inglés', description: 'Practica palabras frecuentes en inglés con traducciones al español.', action: 'Practicar vocabulario', category: 'Inglés' },
		ist: { title: 'Preparación física', description: 'Ingresa tus resultados del IST, verifica tu preparación y descarga un informe.', action: 'Abrir evaluación IST', category: 'Preparación física' },
		attendance: { title: 'Certificado de asistencia', description: 'Prepara una carta para tu patrono con tu horario de clases.', action: 'Crear certificado', category: 'Documentos' }
	}
};

const english = {
	designPreview: englishDesignPreview,
	admin: englishAdmin,
	attendance: englishAttendance,
	auth: {
		email: 'Email address',
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
			invalidCredentials: 'The email or password is incorrect. Try again.'
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
		cardDescription: 'Choose your operation and practice for 5, 10, or 15 minutes. How many can you get right?',
		open: 'Practice Speed Math',
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
		studentName: 'Student name',
		studentDescription: 'Student information',
		studentLabel: 'Student information placeholder'
	},
	navigation: {
		label: 'Dashboard navigation',
		dashboard: 'Dashboard',
		features: 'Features',
		featuresDescription: 'Your student tools.',
		ist: 'IST · Physical readiness',
				attendance: 'Attendance certificate',
		speedMath: 'Speed Math',
				frequency: 'English frequency deck'
	},
	home: {
		title: 'Student dashboard',
		pageTitle: 'Student dashboard | Masterminds ASVAB',
		description: 'Your Masterminds Programa ASVAB student dashboard.',
		eyebrow: 'Your workspace',
		introduction: 'One place for your student tools.',
		emptyTitle: 'Initial Strength Test',
				emptyDescription: 'Record your measurements and exercise results, check your readiness, and download your report.',
				openIst: 'Start your IST assessment'
			},
frequency: {
	pageTitle: 'English frequency deck | Masterminds ASVAB',
	description: 'Practice 1,001 frequent English words with Spanish translations in adaptive 25-attempt rounds that give missed words more practice.',
	eyebrow: 'Word by word',
	title: 'English frequency deck',
	introduction: 'See the English word. Recall it in Spanish. Build your vocabulary, one card at a time.',
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
					page: 'Page',
					disclaimer: 'Results are self-reported and assessed against the program’s Army-based baseline. This assessment is not official military clearance or a medical evaluation.'
				}
			}
		};

export type Messages = typeof english;

const spanish: Messages = {
	designPreview: spanishDesignPreview,
	admin: spanishAdmin,
	attendance: spanishAttendance,
	auth: {
		email: 'Correo electrónico',
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
			invalidCredentials: 'El correo o la contraseña es incorrecto. Inténtalo de nuevo.'
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
		cardDescription: 'Elige tu operación y practica durante 5, 10 o 15 minutos. ¿Cuántas puedes acertar?',
		open: 'Practicar matemáticas rápidas',
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
		studentName: 'Nombre del estudiante',
		studentDescription: 'Información del estudiante',
		studentLabel: 'Espacio para la información del estudiante'
	},
	navigation: {
		label: 'Navegación del panel',
		dashboard: 'Panel',
		features: 'Funciones',
		featuresDescription: 'Tus herramientas de estudiante.',
		ist: 'IST · Preparación física',
				attendance: 'Certificado de asistencia',
		speedMath: 'Matemáticas rápidas',
				frequency: 'Tarjetas de inglés frecuente'
	},
	home: {
		title: 'Panel del estudiante',
		pageTitle: 'Panel del estudiante | Masterminds ASVAB',
		description: 'Tu panel de estudiante de Masterminds Programa ASVAB.',
		eyebrow: 'Tu espacio de trabajo',
		introduction: 'Todas tus herramientas de estudiante en un solo lugar.',
		emptyTitle: 'Prueba de fuerza inicial',
				emptyDescription: 'Registra tus medidas y resultados de ejercicio, verifica tu preparación y descarga tu informe.',
				openIst: 'Comenzar tu evaluación IST'
			},
frequency: {
	pageTitle: 'Tarjetas de inglés frecuente | Masterminds ASVAB',
	description: 'Practica 1,001 palabras frecuentes en inglés con traducciones al español en rondas adaptativas de 25 intentos que refuerzan las palabras que te cuestan.',
	eyebrow: 'Palabra por palabra',
	title: 'Tarjetas de inglés frecuente',
	introduction: 'Mira la palabra en inglés. Recuérdala en español. Amplía tu vocabulario, una tarjeta a la vez.',
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
					page: 'Página',
					disclaimer: 'Los resultados son autodeclarados y se evalúan según los criterios del programa basados en el Ejército. Esta evaluación no es una autorización militar oficial ni una evaluación médica.'
				}
			}
		};

export const translations: Record<Language, Messages> = {
	en: english,
	es: spanish
};

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

const english = {
	accessibility: {
		skipToContent: 'Skip to content'
	},
	language: {
		label: 'Website language'
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
		ist: 'IST · Physical readiness'
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
	accessibility: {
		skipToContent: 'Saltar al contenido'
	},
	language: {
		label: 'Idioma del sitio web'
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
		ist: 'IST · Preparación física'
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

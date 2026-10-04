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

const english = {
	accessibility: {
		skipToContent: 'Skip to content'
	},
	language: {
		label: 'Website language'
	},
	speedMath: {
		pageTitle: 'Speed Math | Masterminds ASVAB',
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
	description: 'Practice 1,001 frequent English words by finding their Spanish translations in short, interactive flashcard decks.',
	eyebrow: 'Word by word',
	title: 'English frequency deck',
	introduction: 'See the English word. Recall it in Spanish. Build your vocabulary, one card at a time.',
	direction: 'English → Spanish',
			englishShort: 'EN',
			spanishShort: 'ES',
	wordCount: '{count} English words',
	deckSize: 'Up to {count} cards per deck',
	chooseDeck: 'Choose your deck',
	deckOption: 'Deck {deck} · Words {start}–{end}',
	deckHint: 'Start with the most frequent words, or pick a range. Changing decks starts a new round; progress lasts for this visit only.',
	deckLabel: 'Deck {deck}',
	reviewRound: 'Review round',
	cardProgress: 'Card {current} of {total}',
	progressLabel: 'Round progress',
	answeredProgress: '{answered} of {total} answered',
	correctCount: 'Correct',
	reviewCount: 'To review',
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
	incorrectHint: 'Compare your answer with the accepted translations, then try it again in review.',
	skippedHint: 'Read the translation, say it out loud, and give it another try in review.',
	correctHint: 'Say the pair out loud before moving on.',
	yourAnswer: 'You chose',
	nextCard: 'Next card',
	finishRound: 'See results',
	completeTitle: 'Round complete',
	completeMessage: 'You recalled {correct} of {total} words.',
	perfectMessage: 'Every word recalled. Ready for the next deck?',
	reviewMessage: 'A little repetition goes a long way. Give these words another try.',
	reviewMissed: 'Review {count} words',
	reviewList: 'Words to practice',
	restartDeck: 'Practice this deck again',
	nextDeck: 'Next deck',
	lastDeck: 'You reached the last deck. Revisit any range to keep practicing.',
	listDetails: 'About this word list',
	listNote: 'These Spanish translations have been reviewed and corrected for study. Common alternatives appear after you answer. Meanings still depend on context; the source includes informal speech, possible contraction fragments, and strong language.',
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
	accessibility: {
		skipToContent: 'Saltar al contenido'
	},
	language: {
		label: 'Idioma del sitio web'
	},
	speedMath: {
		pageTitle: 'Matemáticas rápidas | Masterminds ASVAB',
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
	description: 'Practica 1,001 palabras frecuentes en inglés buscando sus traducciones al español en mazos cortos e interactivos.',
	eyebrow: 'Palabra por palabra',
	title: 'Tarjetas de inglés frecuente',
	introduction: 'Mira la palabra en inglés. Recuérdala en español. Amplía tu vocabulario, una tarjeta a la vez.',
	direction: 'Inglés → español',
			englishShort: 'EN',
			spanishShort: 'ES',
	wordCount: '{count} palabras en inglés',
	deckSize: 'Hasta {count} tarjetas por mazo',
	chooseDeck: 'Elige tu mazo',
	deckOption: 'Mazo {deck} · Palabras {start}–{end}',
	deckHint: 'Empieza con las palabras más frecuentes o elige un rango. Cambiar de mazo inicia una ronda nueva; el progreso dura solo durante esta visita.',
	deckLabel: 'Mazo {deck}',
	reviewRound: 'Ronda de repaso',
	cardProgress: 'Tarjeta {current} de {total}',
	progressLabel: 'Progreso de la ronda',
	answeredProgress: '{answered} de {total} respondidas',
	correctCount: 'Correctas',
	reviewCount: 'Por repasar',
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
	incorrectHint: 'Compara tu respuesta con las traducciones aceptadas y vuelve a intentarlo en el repaso.',
	skippedHint: 'Lee la traducción, dila en voz alta y vuelve a intentarlo en el repaso.',
	correctHint: 'Di las dos palabras en voz alta antes de continuar.',
	yourAnswer: 'Elegiste',
	nextCard: 'Siguiente tarjeta',
	finishRound: 'Ver resultados',
	completeTitle: 'Ronda completada',
	completeMessage: 'Recordaste {correct} de {total} palabras.',
	perfectMessage: 'Recordaste todas las palabras. ¿Vamos al siguiente mazo?',
	reviewMessage: 'Un poco de repetición ayuda mucho. Vuelve a intentarlo con estas palabras.',
	reviewMissed: 'Repasar {count} palabras',
	reviewList: 'Palabras para practicar',
	restartDeck: 'Practicar este mazo otra vez',
	nextDeck: 'Siguiente mazo',
	lastDeck: 'Llegaste al último mazo. Vuelve a cualquier rango para seguir practicando.',
	listDetails: 'Acerca de esta lista de palabras',
	listNote: 'Las traducciones al español se revisaron y corrigieron para estudiar. Las alternativas comunes aparecen después de responder. El significado sigue dependiendo del contexto; la fuente incluye lenguaje informal, posibles fragmentos de contracciones y lenguaje fuerte.',
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

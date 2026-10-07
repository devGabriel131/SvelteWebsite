/** Shared document/UI presentation only. Approved legal wording lives in each event snapshot. */
export const bootcampDocumentMessages = {
	en: {
		waiverTitle: 'Bootcamp agreements and signatures',
		letterTitle: 'Bootcamp participation — employer letter',
		brand: 'Masterminds Programa ASVAB',
		timeZone: 'Puerto Rico (AST, UTC-04:00)',
		sections: {
			agreement: 'Bootcamp agreement and rules',
			liability: 'Waiver and release of liability',
			media: 'Image and media authorization'
		},
		labels: {
			event: 'Bootcamp', eventId: 'Event reference', revision: 'Event revision',
			venue: 'Venue', startsAt: 'Starts', endsAt: 'Ends', arrivalAt: 'Arrival',
			student: 'Participant information', name: 'Full name', email: 'Email',
			dateOfBirth: 'Date of birth', phone: 'Phone', municipality: 'Municipality',
			signingCity: 'Signing city', signedAt: 'Signed at', issuedAt: 'Issued at',
			participantSignature: 'Participant signature', organizerSignature: 'Organizer signature',
			employer: 'Employer', contact: 'Addressee', position: 'Position', workplace: 'Workplace'
		},
		organizer: {
			name: 'Claudy Menéndez', role: 'Representative, Masterminds Programa ASVAB',
			phone: '939-408-0440', email: 'mastermindsprogramaasvab@gmail.com'
		},
		letter: {
			introduction: (name: string) => `This letter concerns the planned participation of ${name} in the bootcamp organized by Masterminds Programa ASVAB, a preparation program for people interested in the United States Armed Forces.`,
			participation: (name: string, event: string, startsAt: string, endsAt: string, venue: string, arrivalAt: string) => `${name} plans to participate in ${event}, scheduled from ${startsAt} to ${endsAt} at ${venue}. Arrival is scheduled for ${arrivalAt}. All event times are in Puerto Rico local time.`,
			request: (name: string) => `We kindly ask you to accommodate ${name}’s work schedule during this period to allow participation in this bootcamp. This letter is a request concerning planned participation, not a certification of completed attendance.`,
			thanks: 'Thank you for your understanding and cooperation.',
			contact: (phone: string, email: string) => `For additional information, please contact us at ${phone} or ${email}.`
		}
	},
	es: {
		waiverTitle: 'Acuerdos y firmas del Bootcamp',
		letterTitle: 'Participación en Bootcamp — carta al patrono',
		brand: 'Masterminds Programa ASVAB',
		timeZone: 'Puerto Rico (AST, UTC-04:00)',
		sections: {
			agreement: 'Acuerdo y normas del Bootcamp',
			liability: 'Renuncia y relevo de responsabilidad',
			media: 'Autorización de uso de imagen'
		},
		labels: {
			event: 'Bootcamp', eventId: 'Referencia del evento', revision: 'Revisión del evento',
			venue: 'Lugar', startsAt: 'Inicio', endsAt: 'Fin', arrivalAt: 'Llegada',
			student: 'Información de quien participa', name: 'Nombre completo', email: 'Correo electrónico',
			dateOfBirth: 'Fecha de nacimiento', phone: 'Teléfono', municipality: 'Municipio',
			signingCity: 'Municipio donde se firma', signedAt: 'Fecha y hora de firma', issuedAt: 'Fecha y hora de emisión',
			participantSignature: 'Firma de quien participa', organizerSignature: 'Firma de la organización',
			employer: 'Patrono', contact: 'Destinatario', position: 'Puesto', workplace: 'Lugar de empleo'
		},
		organizer: {
			name: 'Claudy Menéndez', role: 'Representante, Masterminds Programa ASVAB',
			phone: '939-408-0440', email: 'mastermindsprogramaasvab@gmail.com'
		},
		letter: {
			introduction: (name: string) => `Por medio de la presente, informamos sobre la participación prevista de ${name} en el Bootcamp de Masterminds Programa ASVAB, un programa de preparación para personas interesadas en las Fuerzas Armadas de los Estados Unidos.`,
			participation: (name: string, event: string, startsAt: string, endsAt: string, venue: string, arrivalAt: string) => `${name} tiene previsto participar en ${event}, programado desde ${startsAt} hasta ${endsAt} en ${venue}. La llegada está programada para ${arrivalAt}. Todos los horarios corresponden a la hora local de Puerto Rico.`,
			request: (name: string) => `Solicitamos amablemente que se ajuste, en la medida de lo posible, el horario laboral de ${name} durante este período para permitir su participación en este Bootcamp. Esta carta es una solicitud relacionada con la participación prevista, no una certificación de asistencia completada.`,
			thanks: 'Agradecemos su comprensión y cooperación.',
			contact: (phone: string, email: string) => `Para información adicional, puede comunicarse al ${phone} o escribir a ${email}.`
		}
	}
} as const;

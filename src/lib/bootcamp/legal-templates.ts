import type { SectionKey } from './types';

/**
 * Canonical Spanish-only adult wording from the original Masterminds sources:
 * masterminds/frontends/waiver/src/lib/legal-text.ts
 * masterminds/apps/certificate-worker/internal/waiver/templates/adult.html
 *
 * Adaptations: plain text with WinAnsi-compatible headings and hyphen bullets;
 * adult UI first-person wording instead of PDF identity/signature fields; PDF
 * weapons, parking/arrival, companion-area, belongings/loss and waiver-signing
 * details included so UI and PDF share the same terms. Guardian/minor clauses
 * and paper delivery/carry-a-copy instructions are omitted for the 21+ flow;
 * companion rules remain without parent/guardian-specific wording.
 *
 * The caller resolves eventDate (long date/range), venue, arrivalTime (check-in
 * opening), startTime (event start/latest arrival), and USD-formatted price,
 * deposit and balance. Event-specific dates, times and the named park are tokens.
 * Payment is $30 in full or $15 initially with the $15 balance managed through
 * administration outside the website. The original absence/nonrefund provision
 * remains; the fixed Saturday/1600 no-show balance clause is omitted, with no
 * replacement deadline.
 *
 * Legal review required: the original US Army, Río Piedras recruitment office
 * and Municipio de Bayamón releases remain unchanged, regardless of venue.
 * Both the original media "irrevocable" authorization and written-revocation
 * clause remain unchanged; their contradiction is not interpreted here.
 */
export const spanishBootcampLegal: Record<SectionKey, string> = {
	agreement: `Acuerdo y Normas del Bootcamp

Fecha del Evento
{eventDate}, en {venue}.

Registro y Horario
- El registro comienza a las {arrivalTime}.
- No se aceptarán estudiantes después de las {startTime}.
- Los participantes que lleguen fuera de este horario sin excusa previa del programa NO PODRÁN PARTICIPAR de la actividad.
- El registro es obligatorio.

Requisito de Documentación Obligatoria
- Se adjuntan los detalles del acuerdo y las normas del Bootcamp. Es obligatorio leer, firmar y aceptar las mismas.
- Este documento TIENE que ser leído, aceptado y firmado.
- El estudiante que no cumpla con este requisito no podrá participar de la actividad.

Conducta y Disciplina del Participante
- Todo participante debe mantener una conducta correcta desde el momento de su llegada.
- Asignación de Platoon: Se informará al estudiante su Platoon y se le presentará a su Platoon Leader.
- El participante debe seguir estrictamente las reglas específicas de su Platoon Leader y de cualquier otro personal encargado.
- Conducta Inaceptable: Cualquier estudiante que no siga las reglas, se niegue a realizar actividades, o manifieste una actitud negativa, peligrosa o irrespetuosa será REMOVIDO de inmediato del Bootcamp y EXPULSADO PERMANENTEMENTE DEL PROGRAMA por falta grave de conducta.
- Prohibición de Salida: Ningún estudiante podrá abandonar el área del evento sin la autorización previa de la Sra. Menéndez.

Prohibiciones Estrictas (Estudiantes, Acompañantes y Staff)
- Drogas y Alcohol: Está TOTALMENTE PROHIBIDA la tenencia o consumo de bebidas alcohólicas, cualquier tipo de drogas o parafernalia (incluyendo drogas recreativas o CBD).
- La violación de esta directriz resultará en la salida inmediata del área, la expulsión permanente del programa para el estudiante, un reporte de incidentes y las medidas legales pertinentes.
- Armas: NO SE PERMITEN armas de fuego ni recreativas en el Bootcamp. No se pueden llevar armas de ninguna clase, ni en la persona, ni en los bultos.

Normas de Estacionamiento y Llegada
- Está estrictamente prohibido estacionarse FRENTE A CASAS. Tenemos que respetar el espacio y la tranquilidad de los vecinos. Los líderes darán instrucciones al llegar.
- Cualquier estudiante o familiar que se estacione frente a una casa, incluso por un minuto, quedará FUERA DEL BOOTCAMP.
- Al llegar al portón, espere instrucciones de los líderes. Favor de mantener el volumen de música bajo y apagar las luces de los carros. Una vez dentro, estacione según las indicaciones.
- Quienes deseen tener su vehículo disponible en todo momento, deberán estacionar fuera del área y caminar.
- Una vez estacionado, diríjase directamente a la fila de la mesa de registro.

Normas para Acompañantes
- Habrá un ÁREA DESTINADA DENTRO DEL BOOTCAMP PARA ACOMPAÑANTES. Es importante que lleven sillas de playa.
- No se permite traer niños al bootcamp.
- NINGÚN ACOMPAÑANTE puede utilizar el área designada para los estudiantes. Esta área es de uso exclusivo de los participantes del Bootcamp.

Artículos Personales y Responsabilidad
- Todo estudiante es responsable de traer los artículos detallados en la lista proporcionada en el chat y cumplir con las instrucciones.
- No somos responsables por la pérdida de artículos personales.

Política de Cuota y Reembolso
- La cuota del evento es de {price}. El estudiante puede pagar la cuota completa o un depósito inicial de {deposit}.
- Si se paga el depósito inicial, el balance de {balance} se gestiona con la administración fuera del sitio web.
- La cuota pagada cubre exclusivamente los gastos del evento y no será reembolsada bajo ninguna circunstancia si el estudiante no asiste.

Relevo de Responsabilidad
- TODO ESTUDIANTE FIRMARÁ UN RELEVO DE RESPONSABILIDAD.

Aceptación de las Normas
He leído y comprendo cada una de las normas establecidas. Soy consciente de que solicité la participación al bootcamp y que el incumplimiento de cualquiera de estas normas resultará en la exclusión del evento, el desalojo del área sin reembolso de la cuota pagada y una posible salida automática del programa Masterminds Repaso ASVAB.`,
	liability: `Renuncia y Relevo de Responsabilidad

Yo, el participante abajo firmante, mayor de edad y vecino/a del municipio que indico en este formulario, con capacidad legal para contratar y obligarme, hago constar que voluntaria y libremente renuncio, por mí y por mis herederos o administradores de bienes, a toda causa de acción, reclamación o demanda que tenga y/o pueda adquirir en contra de las siguientes entidades y personas:

- Masterminds Programa ASVAB, sus administradores, facultativos, staff y líderes.
- El United States Army (US Army) y la Oficina de Reclutamiento de Río Piedras, incluyendo a todo su personal militar y civil.
- El Municipio de Bayamón, su Departamento de Recreación y Deportes, así como sus empleados, funcionarios y administradores.
- {venue}, sus administradores y personal encargado.

Esta renuncia aplica a cualquier causa directa o indirecta y/o como consecuencia sobrevenida antes, durante o después de mi participación en dicha actividad. Por la presente, relevo de toda responsabilidad contractual y extracontractual a todas las personas naturales y/o jurídicas antes mencionadas por cualquier daño, lesión física o reclamo relacionado con la propiedad vinculado a mi participación en este evento.

Certifico y doy fe de que participo a mi propio riesgo, reconociendo las altas exigencias físicas que implica una actividad como el 'Bootcamp Militarizado' de Masterminds Programa ASVAB. Garantizo que me encuentro en condiciones de salud óptimas para este entrenamiento, a llevarse a cabo el {eventDate}, en {venue}.`,
	media: `Renuncia y Autorización para Uso de Imagen

Yo, el participante abajo firmante, mayor de edad, certifico que autorizo de forma libre, voluntaria e irrevocable a Masterminds Programa ASVAB, a tomar y utilizar fotografías y/o videos en los que aparezca mi imagen durante el desarrollo del Bootcamp Militarizado.

I. Alcance de la Autorización
Autorizo que dichas imágenes puedan ser utilizadas con fines educativos, promocionales, publicitarios e institucionales, incluyendo, pero sin limitarse a:

- Redes sociales
- Material promocional impreso o digital
- Página web
- Presentaciones institucionales
- Anuncios o campañas publicitarias

Entiendo que el uso de estas imágenes será realizado sin compensación económica alguna.

II. Relevo de Responsabilidad
Por medio del presente documento, libero y relevo de toda responsabilidad a Masterminds Programa ASVAB, sus administradores, instructores, personal y colaboradores, por el uso legítimo de dichas imágenes conforme a lo aquí autorizado.

Reconozco que:
- No tendré derecho a revisar o aprobar el material final.
- El uso de mi imagen no constituirá una violación a mi privacidad, honor o reputación.

III. Vigencia
Esta autorización será válida por tiempo indefinido, salvo revocación expresa por escrito, la cual no afectará el uso de material previamente publicado.

IV. Declaración Final
Certifico que he leído y comprendido el contenido de este relevo y que firmo el mismo de forma consciente y voluntaria.`
};

-- =====================================================================
--  EncuestasSIAU — Carga del catálogo de preguntas (PostgreSQL)
--  Versión: formulario unificado (13 preguntas, app v2.0)
--
--  Inserta las 13 preguntas del formulario unificado con los MISMOS
--  IDs, textos y opciones que usa la app (preguntas_unificadas.json).
--
--  Es idempotente: si la pregunta ya existe, actualiza sus datos.
--
--  Ejecutar DESPUÉS de 01_schema.sql:
--    psql -U <usuario> -d <basededatos> -f 02_seed_preguntas.sql
-- =====================================================================

INSERT INTO preguntas (id, tipo_encuesta, seccion, tipo, texto, opciones, requiere_comentario) VALUES

-- -----------------------------------------------------------------------
-- Sección 1: Trato digno y humanización  (preguntas 1–3, tipo escala)
-- -----------------------------------------------------------------------
(1, 'unificado',
 'Sección 1. Trato digno y humanización',
 'escala',
 '¿Cómo califica el trato, respeto y amabilidad que recibió del personal administrativo?
(Vigilantes, admisiones, facturadores y orientadores.)',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

(2, 'unificado',
 'Sección 1. Trato digno y humanización',
 'escala',
 '¿Cómo califica el trato, respeto y amabilidad que recibió del personal de medicina?
(Médicos generales y especialistas.)',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

(3, 'unificado',
 'Sección 1. Trato digno y humanización',
 'escala',
 '¿Cómo califica el trato, respeto y amabilidad que recibió del personal de enfermería?
(Enfermeras jefes y auxiliares de enfermería.)',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

-- -----------------------------------------------------------------------
-- Sección 2: Información y comunicación  (preguntas 4–5, tipo escala)
-- -----------------------------------------------------------------------
(4, 'unificado',
 'Sección 2. Información y comunicación',
 'escala',
 'Entendimiento y claridad

¿Las explicaciones que le dieron sobre su enfermedad, exámenes o tratamientos fueron fáciles de entender para usted?',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

(5, 'unificado',
 'Sección 2. Información y comunicación',
 'escala',
 'Oportunidad

¿Al egreso o alta del servicio le entregaron información suficiente y clara sobre órdenes médicas, resultados de exámenes, indicaciones de cuidado, recomendaciones y signos de alarma para volver a consultar en caso necesario?',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

-- -----------------------------------------------------------------------
-- Sección 3: Privacidad y confidencialidad  (preguntas 6–7, tipo escala)
-- -----------------------------------------------------------------------
(6, 'unificado',
 'Sección 3. Privacidad y confidencialidad',
 'escala',
 'Privacidad física

Durante sus revisiones médicas, exámenes o procedimientos, ¿el personal médico y de enfermería protegió su cuerpo de la vista de otras personas?
(Por ejemplo: utilizando cortinas, batas o biombos.)',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

(7, 'unificado',
 'Sección 3. Privacidad y confidencialidad',
 'escala',
 'Confidencialidad verbal

Cuando el personal le habló sobre su enfermedad o tratamiento, ¿se hizo de manera reservada y en privado, sin que otros pacientes o personas ajenas se enteraran?',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

-- -----------------------------------------------------------------------
-- Sección 4: Oportunidad general e infraestructura  (preguntas 8–11)
-- -----------------------------------------------------------------------
(8, 'unificado',
 'Sección 4. Oportunidad general e infraestructura',
 'escala',
 'Tiempo de espera

¿El tiempo total que esperó en la sala para recibir su atención o asignación de cita fue el adecuado?',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

(9, 'unificado',
 'Sección 4. Oportunidad general e infraestructura',
 'escala',
 'Instalaciones

¿Encontró las instalaciones del hospital (salas de espera, habitaciones y baños) limpias, cómodas y ordenadas?',
 '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb,
 FALSE),

(10, 'unificado',
 'Sección 4. Oportunidad general e infraestructura',
 'sino',
 '¿Durante su hospitalización, le dieron a conocer sus derechos y deberes como usuario de nuestra institución?',
 '["Sí","No"]'::jsonb,
 FALSE),

(11, 'unificado',
 'Sección 4. Oportunidad general e infraestructura',
 'sino',
 '¿Recibió información sobre cómo presentar una felicitación, reclamo, queja o sugerencia (PQRSF), así como sobre la forma de recibir una respuesta?',
 '["Sí","No"]'::jsonb,
 FALSE),

-- -----------------------------------------------------------------------
-- Sección 5: Net Promoter Score  (pregunta 12, tipo nps)
-- -----------------------------------------------------------------------
(12, 'unificado',
 'Sección 5. Indicador de recomendación (Net Promoter Score - NPS)',
 'nps',
 'Recomendación institucional

Teniendo en cuenta toda su experiencia en el hospital, ¿qué tan probable es que nos recomiende a un familiar o amigo si llegara a necesitar atención médica?',
 '["0","1","2","3","4","5","6","7","8","9","10"]'::jsonb,
 FALSE),

-- -----------------------------------------------------------------------
-- Sección 6: Retroalimentación cualitativa  (pregunta 13, tipo texto_libre)
-- -----------------------------------------------------------------------
(13, 'unificado',
 'Sección 6. Retroalimentación cualitativa',
 'texto_libre',
 '¿Tiene alguna sugerencia, felicitación o comentario adicional que nos ayude a mejorar el servicio?',
 '[]'::jsonb,
 FALSE)

ON CONFLICT (id) DO UPDATE SET
    tipo_encuesta       = EXCLUDED.tipo_encuesta,
    seccion             = EXCLUDED.seccion,
    tipo                = EXCLUDED.tipo,
    texto               = EXCLUDED.texto,
    opciones            = EXCLUDED.opciones,
    requiere_comentario = EXCLUDED.requiere_comentario;


-- =====================================================================
--  Referencia: opciones de tipificación por pregunta
--
--  La app despliega estos menús automáticamente cuando la calificación
--  es negativa ("Muy malo", "Malo" o "Regular" en preguntas 1–7;
--  NPS 0–6 en pregunta 12). El campo tipificacion en la tabla respuestas
--  llega con los ítems seleccionados separados por "|".
--
--  Esta sección es solo referencia para el backend/reporting.
--  No requiere ejecutar ningún SQL adicional.
-- =====================================================================

-- Pregunta 1 — Personal administrativo:
--   "El personal ignoró al usuario o se negó a dar orientación."
--   "Expresiones corporales o tono de voz grosero/agresivo."
--   "Demora excesiva en la ventanilla para realizar el trámite."
--   "Información contradictoria (un funcionario dice una cosa y otro algo diferente)."
--   "Falta de personal en las taquillas de atención."
--   "Otro (especifique)"

-- Pregunta 2 — Personal médico:
--   "El médico no miró al paciente a la cara (estuvo todo el tiempo frente al computador)."
--   "Tono de voz rudo, regaño o falta de empatía ante el dolor del paciente."
--   "Atención demasiado rápida o con afán (sintió que no lo revisaron bien)."
--   "Minimización de los síntomas expresados por el paciente o cuidador."
--   "Otro (especifique)"

-- Pregunta 3 — Personal de enfermería:
--   "Demora o falta de respuesta al llamado del timbre (en internación)."
--   "Mala actitud o brusquedad al aplicar medicamentos, canalizar o mover al paciente."
--   "Respuestas evasivas o groseras ante las dudas del paciente o familiar."
--   "Falta de continuidad o descuido en los turnos de atención."
--   "Otro (especifique)"

-- Preguntas 4–7 — Información y privacidad:
--   "Falta de Claridad: Usaron palabras médicas muy difíciles que nadie entendió."
--   "Falta de Privacidad Física: Lo examinaron con la puerta/cortina abierta o personas ajenas mirando."
--   "Falla de Confidencialidad: El médico dio el diagnóstico en voz alta frente a otros."
--   "Falta de Oportunidad: Entrega tardía de resultados, historias clínicas o fórmulas médicas."
--   "Otro (especifique)"

-- Pregunta 12 — NPS detractor (puntaje 0–6):
--   "Trato humano"
--   "Comunicación e información"
--   "Oportunidad en la atención (tiempos de espera)"
--   "Calidad de la atención"
--   "Procesos administrativos"
--   "Instalaciones y comodidad"
--   "Otro (especifique)"

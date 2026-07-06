-- =====================================================================
--  EncuestasSIAU — Carga del catálogo de preguntas (PostgreSQL)
--
--  Inserta las 26 preguntas (12 ambulatorias + 14 internación) con los
--  MISMOS ids y textos que precarga la app Android.
--
--  Ejecutar DESPUÉS de 01_schema.sql:
--      psql -U <usuario> -d <basededatos> -f 02_seed_preguntas.sql
--
--  Es idempotente: si la pregunta ya existe, actualiza sus datos.
-- =====================================================================

INSERT INTO preguntas (id, tipo_encuesta, texto, opciones, requiere_comentario) VALUES
-- ----------------------- AMBULATORIA -----------------------
(1,  'ambulatoria', '¿Cómo calificaría la facilidad para conseguir una cita?',
     '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(2,  'ambulatoria', '¿El tiempo de espera para ser atendido fue adecuado?',
     '["Sí","No"]'::jsonb, FALSE),
(3,  'ambulatoria', '¿Cómo calificaría la atención del personal administrativo?',
     '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(4,  'ambulatoria', '¿El tiempo de espera para la consulta fue adecuado?',
     '["Sí","No"]'::jsonb, FALSE),
(5,  'ambulatoria', '¿Cómo calificaría la atención del médico?',
     '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(6,  'ambulatoria', '¿El médico le explicó claramente su diagnóstico y tratamiento?',
     '["Sí","No"]'::jsonb, FALSE),
(7,  'ambulatoria', '¿Cómo calificaría la atención del personal de enfermería?',
     '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(8,  'ambulatoria', '¿El personal de enfermería resolvió sus dudas?',
     '["Sí","No"]'::jsonb, FALSE),
(9,  'ambulatoria', '¿Las instalaciones del servicio ambulatorio le parecieron adecuadas?',
     '["Muy inadecuadas","Inadecuadas","Regulares","Adecuadas","Muy adecuadas"]'::jsonb, FALSE),
(10, 'ambulatoria', '¿Recomendaría este servicio ambulatorio a familiares o amigos?',
     '["Definitivamente no","Probablemente no","Probablemente sí","Definitivamente sí"]'::jsonb, FALSE),
(11, 'ambulatoria', '¿Cómo calificaría en general el servicio ambulatorio recibido?',
     '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb, FALSE),
(12, 'ambulatoria', '¿Tiene algún comentario adicional sobre el servicio ambulatorio?',
     '["Ninguno","Sí, tengo un comentario"]'::jsonb, TRUE),

-- ----------------------- INTERNACIÓN -----------------------
(101, 'internacion', '¿El trato recibido durante el ingreso fue digno, respetando sus creencias, costumbres y sin discriminación?',
      '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb, FALSE),
(102, 'internacion', '¿Al momento de su ingreso al hospital le dieron información clara sobre copagos y cuotas moderadoras?',
      '["Sí","No"]'::jsonb, FALSE),
(103, 'internacion', 'La información sobre clasificación y tiempo de atención según el triage en urgencias fue…',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(104, 'internacion', 'La información sobre su estado de salud y la atención recibida por el médico en claridad y suficiencia fue…',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(105, 'internacion', 'El trato por el médico en relación a dignidad, respetando sus creencias y costumbres fue…',
      '["Muy malo","Malo","Regular","Bueno","Muy bueno"]'::jsonb, FALSE),
(106, 'internacion', 'La atención del personal de enfermería fue…',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(107, 'internacion', 'La limpieza, el orden y el funcionamiento de las instalaciones fue…',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(108, 'internacion', '¿Recibió información sobre cómo presentar felicitaciones, reclamos o sugerencias y recibir respuesta?',
      '["Sí","No"]'::jsonb, FALSE),
(109, 'internacion', '¿Durante la hospitalización le dieron a conocer sus derechos y deberes como usuario?',
      '["Sí","No"]'::jsonb, FALSE),
(110, 'internacion', '¿Durante su hospitalización se le informó que los estudiantes en formación podían atenderlo?',
      '["Sí","No","No aplica"]'::jsonb, FALSE),
(111, 'internacion', '¿La alimentación formulada fue suministrada de forma adecuada?',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(112, 'internacion', 'Al egreso o alta del servicio, ¿le dieron indicaciones claras sobre los cuidados y signos de alarma?',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, FALSE),
(113, 'internacion', '¿Cómo calificaría su experiencia general durante la hospitalización?',
      '["Muy mala","Mala","Regular","Buena","Muy buena"]'::jsonb, TRUE),
(114, 'internacion', '¿Recomendaría a sus familiares y amigos el Hospital Universitario?',
      '["Definitivamente no","Probablemente no","Probablemente sí","Definitivamente sí"]'::jsonb, TRUE)

ON CONFLICT (id) DO UPDATE SET
    tipo_encuesta       = EXCLUDED.tipo_encuesta,
    texto               = EXCLUDED.texto,
    opciones            = EXCLUDED.opciones,
    requiere_comentario = EXCLUDED.requiere_comentario;

-- =====================================================================
--  Catálogos de motivos de tipificación de detracción, por pregunta.
--  Deben coincidir EXACTAMENTE con MotivosDetraccion.kt de la app.
--  Se asignan por categoría a los ids correspondientes.
-- =====================================================================

-- Administrativo (facilidad de cita, personal administrativo, trato en ingreso)
UPDATE preguntas SET motivos = '[
  "El personal ignoró al usuario o se negó a dar orientación",
  "Expresiones corporales o tono de voz grosero/agresivo",
  "Demora excesiva en la ventanilla para realizar el trámite",
  "Información contradictoria entre funcionarios",
  "Falta de personal en las taquillas de atención",
  "Otro (especifique)"
]'::jsonb WHERE id IN (1, 3, 101);

-- Médico
UPDATE preguntas SET motivos = '[
  "El médico no miró a la cara (estuvo frente al computador)",
  "Tono de voz rudo, regaño o falta de empatía ante el dolor",
  "Atención demasiado rápida o con afán (no lo revisaron bien)",
  "Minimización de los síntomas del paciente o cuidador",
  "Otro (especifique)"
]'::jsonb WHERE id IN (5, 105);

-- Enfermería
UPDATE preguntas SET motivos = '[
  "Demora o falta de respuesta al llamado del timbre",
  "Brusquedad al aplicar medicamentos, canalizar o mover al paciente",
  "Respuestas evasivas o groseras ante las dudas",
  "Falta de continuidad o descuido en los turnos de atención",
  "Otro (especifique)"
]'::jsonb WHERE id IN (7, 106);

-- Privacidad e Información (triage, info estado de salud, indicaciones de egreso)
UPDATE preguntas SET motivos = '[
  "Falta de claridad: usaron palabras médicas muy difíciles",
  "Falta de privacidad física durante el examen",
  "Falla de confidencialidad: información en voz alta frente a otros",
  "Falta de oportunidad: entrega tardía de resultados o fórmulas",
  "Otro (especifique)"
]'::jsonb WHERE id IN (103, 104, 112);

-- Infraestructura (instalaciones, limpieza, alimentación)
UPDATE preguntas SET motivos = '[
  "Instalaciones sucias o con mal aseo",
  "Falta de mantenimiento (baños, camas o equipos dañados)",
  "Ruido excesivo o falta de comodidad",
  "Señalización confusa para ubicarse",
  "Otro (especifique)"
]'::jsonb WHERE id IN (9, 107, 111);

-- General (recomendación y experiencia global)
UPDATE preguntas SET motivos = '[
  "Tiempo de espera prolongado",
  "Desorganización en el servicio",
  "Mala coordinación entre áreas",
  "Trato poco humanizado en general",
  "Otro (especifique)"
]'::jsonb WHERE id IN (10, 11, 113, 114);

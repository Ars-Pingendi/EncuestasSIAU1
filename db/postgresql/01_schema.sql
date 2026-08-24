-- =====================================================================
--  EncuestasSIAU — Esquema de base de datos (PostgreSQL)
--  Versión: formulario unificado (13 preguntas, app v2.0)
--
--  Genera las dos tablas que respaldan la app Android:
--    · preguntas  — catálogo de las 13 preguntas del formulario
--    · respuestas — cada fila es UNA respuesta enviada por la app
--                   vía POST /respuestas
--
--  Orden de ejecución:
--    1. psql -U <usuario> -d <basededatos> -f 01_schema.sql
--    2. psql -U <usuario> -d <basededatos> -f 02_seed_preguntas.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tabla: preguntas  (catálogo — no crece en producción)
--
-- Los IDs son FIJOS (1–13) y los define la app.
-- Deben coincidir exactamente con preguntas_unificadas.json.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS preguntas (
    id                  INTEGER      PRIMARY KEY,

    -- Siempre 'unificado' en la versión actual del formulario.
    tipo_encuesta       VARCHAR(20)  NOT NULL DEFAULT 'unificado',

    -- Nombre de la sección del formulario (informativo).
    seccion             TEXT         NOT NULL DEFAULT '',

    -- Tipo de componente de UI que usa la app para esta pregunta.
    tipo                VARCHAR(20)  NOT NULL
                        CHECK (tipo IN ('escala', 'sino', 'nps', 'texto_libre')),

    texto               TEXT         NOT NULL,

    -- Opciones de respuesta válidas, como arreglo JSON.
    -- Ejemplo escala: ["Muy malo","Malo","Regular","Bueno","Muy bueno"]
    -- Ejemplo sino:   ["Sí","No"]
    -- Ejemplo nps:    ["0","1","2","3","4","5","6","7","8","9","10"]
    -- texto_libre:    [] (vacío — el usuario escribe libremente)
    opciones            JSONB        NOT NULL DEFAULT '[]'::jsonb,

    requiere_comentario BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  preguntas IS
    'Catálogo de las 13 preguntas del formulario unificado SIAU (app v2.0).';
COMMENT ON COLUMN preguntas.tipo IS
    'Tipo de componente UI: escala (caritas 1-5), sino, nps (0-10), texto_libre.';
COMMENT ON COLUMN preguntas.opciones IS
    'Arreglo JSON con las opciones válidas de respuesta para esta pregunta.';


-- ---------------------------------------------------------------------
-- Tabla: respuestas
--
-- Recibe el JSON que la app Android envía en POST /respuestas.
-- Cada fila = una respuesta a UNA pregunta de UNA encuesta.
-- Una encuesta completa produce 13 filas (una por pregunta).
--
-- Mapeo JSON (camelCase app) → columna PostgreSQL (snake_case):
--   encuestaTipo       → encuesta_tipo
--   preguntaId         → pregunta_id
--   usuarioId          → usuario_id
--   usuarioNombre      → usuario_nombre
--   personaQueResponde → persona_que_responde
--   sincronizado       → (ignorar; siempre llega false desde la app)
--   id                 → id_local (solo informativo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respuestas (

    -- PK generada por el servidor. El id que trae la app (id_local)
    -- es un autoincremental por dispositivo y NO sirve como PK global.
    id                   BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Id local del dispositivo (informativo, para trazabilidad).
    id_local             INTEGER,

    -- 'ambulatoria' o 'internacion' según la selección en la app.
    -- Las 13 preguntas son las mismas en ambos casos.
    encuesta_tipo        VARCHAR(20)  NOT NULL
                         CHECK (encuesta_tipo IN ('ambulatoria', 'internacion')),

    -- Referencia al catálogo de preguntas (IDs 1–13).
    pregunta_id          INTEGER      NOT NULL REFERENCES preguntas (id),

    -- Valor de la respuesta (texto).
    -- Escala:    "Muy malo" | "Malo" | "Regular" | "Bueno" | "Muy bueno"
    -- Sino:      "Sí" | "No"
    -- NPS:       "0" … "10"
    -- TextoLibre: texto libre del usuario
    respuesta            TEXT         NOT NULL,

    -- Nombre del servicio seleccionado (ej: "CONSULTA EXTERNA").
    servicio             VARCHAR(150) NOT NULL,

    -- Datos demográficos del encuestado.
    edad                 INTEGER      NOT NULL CHECK (edad BETWEEN 0 AND 150),
    sexo                 VARCHAR(30)  NOT NULL,

    -- Quién responde la encuesta.
    -- Valores: "El paciente" | "El cuidador principal / Familiar acompañante"
    persona_que_responde VARCHAR(80)  NOT NULL DEFAULT '',

    -- Por política de anonimato la app siempre envía null.
    identificacion       VARCHAR(30),

    -- Comentario adicional libre (solo pregunta 13 y casos especiales).
    comentario           TEXT,

    -- Fecha y hora de la respuesta en formato ISO-8601.
    -- El backend debe interpretar como hora Colombia (UTC-5) si no trae zona.
    fecha                TIMESTAMPTZ  NOT NULL,

    -- Operador del hospital que realizó la encuesta (extraído del JWT).
    usuario_id           VARCHAR(100) NOT NULL,
    usuario_nombre       VARCHAR(150) NOT NULL,

    -- Motivos de insatisfacción (tipificación).
    -- Solo aplica cuando la respuesta es negativa ("Muy malo", "Malo",
    -- "Regular" en preguntas 1–7, o NPS 0–6 en pregunta 12).
    -- Formato: ítems separados por "|".
    -- Ejemplo: "Tono de voz rudo|Atención con afán"
    -- NULL si no aplica tipificación.
    tipificacion         TEXT,

    -- Metadatos del servidor (no los envía la app).
    creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índices para las consultas más frecuentes de reporting.
CREATE INDEX IF NOT EXISTS idx_resp_pregunta  ON respuestas (pregunta_id);
CREATE INDEX IF NOT EXISTS idx_resp_tipo      ON respuestas (encuesta_tipo);
CREATE INDEX IF NOT EXISTS idx_resp_servicio  ON respuestas (servicio);
CREATE INDEX IF NOT EXISTS idx_resp_usuario   ON respuestas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_resp_fecha     ON respuestas (fecha);

COMMENT ON TABLE  respuestas IS
    'Respuestas individuales enviadas desde la app Android vía POST /respuestas.';
COMMENT ON COLUMN respuestas.id_local IS
    'Id autoincremental del dispositivo (informativo). No usar como PK global.';
COMMENT ON COLUMN respuestas.tipificacion IS
    'Motivos de detracción separados por "|". NULL si la calificación es neutra o positiva.';
COMMENT ON COLUMN respuestas.creado_en IS
    'Timestamp en que el servidor recibió la respuesta (auditoría).';

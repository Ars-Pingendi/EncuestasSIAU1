-- =====================================================================
--  EncuestasSIAU — Esquema de base de datos (PostgreSQL)
--  Servidor del hospital
--
--  Genera las tablas que respaldan la app Android:
--    - preguntas   : catálogo de preguntas de cada encuesta
--    - respuestas  : respuestas que el celular envía vía POST /respuestas
--
--  Ejecutar como:  psql -U <usuario> -d <basededatos> -f 01_schema.sql
--  Luego cargar el catálogo con: 02_seed_preguntas.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla: preguntas (catálogo)
--   Los ids son FIJOS y los define la app (1..12 ambulatoria, 101..114
--   internación). NO se autogeneran: deben coincidir con los del cliente.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS preguntas (
    id                   INTEGER      PRIMARY KEY,
    tipo_encuesta        VARCHAR(20)  NOT NULL
                         CHECK (tipo_encuesta IN ('ambulatoria', 'internacion')),
    texto                TEXT         NOT NULL,
    -- Lista de opciones. La app la serializa como arreglo JSON, p.ej.
    -- ["Muy mala","Mala","Regular","Buena","Muy buena"]
    opciones             JSONB        NOT NULL DEFAULT '[]'::jsonb,
    requiere_comentario  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Opciones de tipificación que se muestran si la pregunta es calificada
    -- en nivel detractor. Arreglo JSON; vacío = no aplica (p.ej. preguntas Sí/No).
    motivos              JSONB        NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_preguntas_tipo
    ON preguntas (tipo_encuesta);

COMMENT ON TABLE  preguntas IS 'Catálogo de preguntas de las encuestas SIAU.';
COMMENT ON COLUMN preguntas.id IS 'Id fijo definido por la app; debe coincidir con el cliente.';
COMMENT ON COLUMN preguntas.opciones IS 'Arreglo JSON de opciones de respuesta.';

-- ---------------------------------------------------------------------
-- Tabla: respuestas
--   Recibe lo que la app envía en POST /respuestas (JSON camelCase).
--   El PK 'id' lo genera el servidor; el id local del dispositivo se
--   guarda aparte en 'id_local' solo para trazabilidad.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respuestas (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Id que trae el JSON del cliente (Room autoincremental por dispositivo).
    -- Es solo informativo: NO debe usarse como clave primaria del servidor
    -- porque cada celular tiene su propia secuencia y colisionarían.
    id_local        INTEGER,

    -- UUID que agrupa todas las respuestas de UNA misma encuesta.
    encuesta_id     VARCHAR(64)  NOT NULL,

    encuesta_tipo   VARCHAR(20)  NOT NULL
                    CHECK (encuesta_tipo IN ('ambulatoria', 'internacion')),
    pregunta_id     INTEGER      NOT NULL REFERENCES preguntas (id),
    respuesta       TEXT         NOT NULL,
    servicio        VARCHAR(150) NOT NULL,
    edad            INTEGER      NOT NULL CHECK (edad BETWEEN 0 AND 150),
    sexo            VARCHAR(20)  NOT NULL,
    informante      VARCHAR(30)  NOT NULL,       -- 'Paciente' o 'Cuidador principal'
    identificacion  VARCHAR(30),                 -- opcional (puede ser NULL)
    comentario      TEXT,                        -- opcional (puede ser NULL)
    -- Motivos tipificados de detracción (arreglo JSON; vacío si no es detractor).
    motivos         JSONB        NOT NULL DEFAULT '[]'::jsonb,
    fecha           TIMESTAMPTZ  NOT NULL,       -- ISO-8601 con zona: 2026-06-30T14:23:05-05:00

    -- Usuario que realizó la encuesta (del JWT / login)
    usuario_id      VARCHAR(30)  NOT NULL,
    usuario_nombre  VARCHAR(150) NOT NULL,

    sincronizado    BOOLEAN      NOT NULL DEFAULT TRUE,  -- en el servidor ya está sincronizada
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()  -- auditoría: cuándo la recibió el servidor
);

CREATE INDEX IF NOT EXISTS idx_respuestas_pregunta   ON respuestas (pregunta_id);
CREATE INDEX IF NOT EXISTS idx_respuestas_usuario     ON respuestas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_respuestas_fecha       ON respuestas (fecha);
CREATE INDEX IF NOT EXISTS idx_respuestas_tipo        ON respuestas (encuesta_tipo);
CREATE INDEX IF NOT EXISTS idx_respuestas_encuesta    ON respuestas (encuesta_id);

COMMENT ON TABLE  respuestas IS 'Respuestas de encuestas enviadas desde la app.';
COMMENT ON COLUMN respuestas.id_local IS 'Id local del dispositivo (informativo, no es la PK).';
COMMENT ON COLUMN respuestas.encuesta_id IS 'UUID que agrupa las respuestas de una misma encuesta.';
COMMENT ON COLUMN respuestas.informante IS 'Quién responde: Paciente o Cuidador principal.';
COMMENT ON COLUMN respuestas.motivos IS 'Motivos tipificados de detracción (arreglo JSON).';
COMMENT ON COLUMN respuestas.fecha IS 'Fecha/hora de la respuesta en ISO-8601 con zona horaria.';

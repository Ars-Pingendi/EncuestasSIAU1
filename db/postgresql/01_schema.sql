-- =====================================================================
--  EncuestasSIAU — Esquema de base de datos (PostgreSQL)
--  Versión: formulario unificado (13 preguntas, app v2.0)
--  Roles: ROLE_USER (orientador) | ROLE_ADMIN (coordinadora / secretaria)
--
--  Tablas:
--    · usuarios   — operadores del hospital con rol y control de sesión
--    · preguntas  — catálogo de las 13 preguntas del formulario
--    · respuestas — cada fila es UNA respuesta enviada por la app
--                   vía POST /respuestas
--
--  Orden de ejecución:
--    1. psql -U <usuario> -d <basededatos> -f 01_schema.sql
--    2. psql -U <usuario> -d <basededatos> -f 02_seed_preguntas.sql
--    3. psql -U <usuario> -d <basededatos> -f 03_seed_usuarios.sql
--    4. psql -U <usuario> -d <basededatos> -f 04_vistas_admin.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tabla: usuarios
--
-- Almacena los operadores del hospital que se autentican en la app.
-- El backend genera un JWT con los campos:
--   sub          → username (cédula o código de empleado)
--   name_user    → nombre
--   authorities  → rol  ("ROLE_USER" | "ROLE_ADMIN")
--   iat / exp    → emitido / expiración
--
-- Roles:
--   ROLE_USER  — Orientador SIAU. Solo puede llenar encuestas y sincronizar.
--   ROLE_ADMIN — Coordinadora o secretaria del SIAU. Accede al dashboard,
--                consulta todas las respuestas, descarga consolidados.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Identificador de login (cédula o código de empleado del hospital).
    -- Es el campo "sub" del JWT.
    username          VARCHAR(100) NOT NULL UNIQUE,

    -- Hash bcrypt de la contraseña.
    password_hash     TEXT         NOT NULL,

    -- Nombre completo del operador. Es el campo "name_user" del JWT.
    nombre            VARCHAR(150) NOT NULL,

    -- Rol en la app. Es el campo "authorities" del JWT.
    rol               VARCHAR(20)  NOT NULL DEFAULT 'ROLE_USER'
                      CHECK (rol IN ('ROLE_USER', 'ROLE_ADMIN')),

    -- Permite desactivar un usuario sin eliminarlo.
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,

    creado_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- El backend actualiza este campo en cada request autenticado.
    -- Permite saber si un orientador está "en línea" en los últimos N minutos.
    ultima_actividad  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol      ON usuarios (rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo   ON usuarios (activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_actividad ON usuarios (ultima_actividad);

COMMENT ON TABLE  usuarios IS
    'Operadores del hospital con autenticación JWT y control de rol (ROLE_USER / ROLE_ADMIN).';
COMMENT ON COLUMN usuarios.username IS
    'Cédula o código de empleado. Es el campo "sub" del JWT.';
COMMENT ON COLUMN usuarios.rol IS
    'ROLE_USER = orientador (solo encuestas). ROLE_ADMIN = coordinadora/secretaria (dashboard completo).';
COMMENT ON COLUMN usuarios.ultima_actividad IS
    'Timestamp del último request autenticado. Usado para detectar orientadores activos (en línea).';


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
--   sesionId           → sesion_id          ← agrupa las 13 respuestas de un formulario
--   encuestaTipo       → encuesta_tipo
--   preguntaId         → pregunta_id
--   usuarioId          → usuario_id
--   usuarioNombre      → usuario_nombre
--   personaQueResponde → persona_que_responde
--   sincronizado       → (ignorar; siempre llega false desde la app)
--   id                 → id_local (solo informativo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respuestas (

    -- PK generada por el servidor.
    id                   BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- UUID generado por la app al iniciar una encuesta.
    -- Agrupa las 13 respuestas de un mismo formulario completo.
    -- Es NULL en registros migrados de versiones anteriores de la app.
    sesion_id            UUID,

    -- Id local del dispositivo (informativo, para trazabilidad).
    id_local             INTEGER,

    -- 'ambulatoria' o 'internacion' según la selección en la app.
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

    -- Comentario adicional libre (pregunta 13).
    comentario           TEXT,

    -- Fecha y hora de la respuesta en formato ISO-8601.
    fecha                TIMESTAMPTZ  NOT NULL,

    -- Operador del hospital que realizó la encuesta (extraído del JWT).
    usuario_id           VARCHAR(100) NOT NULL,
    usuario_nombre       VARCHAR(150) NOT NULL,

    -- Motivos de insatisfacción (tipificación).
    -- Formato: ítems separados por "|". NULL si no aplica.
    tipificacion         TEXT,

    -- Metadatos del servidor.
    creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Índices para las consultas más frecuentes de reporting.
CREATE INDEX IF NOT EXISTS idx_resp_sesion    ON respuestas (sesion_id);
CREATE INDEX IF NOT EXISTS idx_resp_pregunta  ON respuestas (pregunta_id);
CREATE INDEX IF NOT EXISTS idx_resp_tipo      ON respuestas (encuesta_tipo);
CREATE INDEX IF NOT EXISTS idx_resp_servicio  ON respuestas (servicio);
CREATE INDEX IF NOT EXISTS idx_resp_usuario   ON respuestas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_resp_fecha     ON respuestas (fecha);

COMMENT ON TABLE  respuestas IS
    'Respuestas individuales enviadas desde la app Android vía POST /respuestas.';
COMMENT ON COLUMN respuestas.sesion_id IS
    'UUID generado por la app al iniciar una encuesta. Agrupa las 13 filas de un mismo formulario.';
COMMENT ON COLUMN respuestas.id_local IS
    'Id autoincremental del dispositivo (informativo). No usar como PK global.';
COMMENT ON COLUMN respuestas.tipificacion IS
    'Motivos de detracción separados por "|". NULL si la calificación es neutra o positiva.';
COMMENT ON COLUMN respuestas.creado_en IS
    'Timestamp en que el servidor recibió la respuesta (auditoría).';


-- ---------------------------------------------------------------------
-- Requisitos de la API para el dashboard del administrador
--
-- El backend debe exponer los siguientes endpoints adicionales.
-- Los endpoints existentes (POST auth/login, POST respuestas) no cambian.
--
-- GET  /respuestas
--      Parámetros opcionales: desde (ISO date), hasta (ISO date),
--                             usuarioId (string), encuestaTipo (string)
--      Respuesta: lista de respuestas que cumplen los filtros.
--      Rol requerido: ROLE_ADMIN
--
-- GET  /orientadores/activos
--      Sin parámetros.
--      Respuesta: lista de usuarios con rol ROLE_USER cuya
--                 ultima_actividad sea mayor a NOW() - 30 minutos.
--      Rol requerido: ROLE_ADMIN
--
-- PATCH /usuarios/actividad
--      Sin body. El backend actualiza ultima_actividad del usuario
--      autenticado al timestamp actual.
--      Llamado automáticamente por la app cada 5 minutos si hay sesión activa.
--      Rol requerido: ROLE_USER o ROLE_ADMIN
-- ---------------------------------------------------------------------

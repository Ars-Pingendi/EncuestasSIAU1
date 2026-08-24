-- =====================================================================
--  EncuestasSIAU — Vistas para el dashboard del administrador
--
--  Estas vistas simplifican las consultas del backend para el
--  dashboard de la app de administrador (ROLE_ADMIN).
--
--  Ejecutar DESPUÉS de 01_schema.sql y 02_seed_preguntas.sql:
--    psql -U <usuario> -d <basededatos> -f 04_vistas_admin.sql
--
--  Convención de puntaje (escala):
--    "Muy malo" = 1 | "Malo" = 2 | "Regular" = 3
--    "Bueno"    = 4 | "Muy bueno" = 5
--
--  NPS (pregunta 12, rango 0–10):
--    Promotores  : 9–10
--    Pasivos     : 7–8
--    Detractores : 0–6
--    NPS = % promotores − % detractores
-- =====================================================================


-- ---------------------------------------------------------------------
-- Vista: v_encuestas
--
-- Una fila por encuesta COMPLETA (agrupada por sesion_id).
-- Para encuestas sin sesion_id (datos históricos pre-v3), se agrupa
-- por usuario + servicio + fecha truncada al minuto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_encuestas AS
WITH grupo AS (
    SELECT
        COALESCE(
            sesion_id::TEXT,
            usuario_id || '_' || servicio || '_' || to_char(date_trunc('minute', fecha), 'YYYYMMDDHH24MI')
        )                                                   AS encuesta_id,
        sesion_id,
        encuesta_tipo,
        servicio,
        edad,
        sexo,
        persona_que_responde,
        usuario_id,
        usuario_nombre,
        -- NPS: pregunta 12
        MAX(CASE WHEN pregunta_id = 12 THEN respuesta::INTEGER END) AS nps,
        -- Promedio de satisfacción: preguntas de escala (1–9)
        ROUND(AVG(
            CASE pregunta_id
                WHEN 1 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 2 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 3 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 4 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 5 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 6 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 7 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 8 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
                WHEN 9 THEN CASE respuesta
                    WHEN 'Muy malo'  THEN 1 WHEN 'Malo'     THEN 2
                    WHEN 'Regular'   THEN 3 WHEN 'Bueno'    THEN 4
                    WHEN 'Muy bueno' THEN 5 END
            END
        ) FILTER (WHERE pregunta_id BETWEEN 1 AND 9), 2)   AS prom_satisfaccion,
        -- Comentario cualitativo (pregunta 13)
        MAX(CASE WHEN pregunta_id = 13 THEN respuesta END) AS comentario,
        MIN(fecha)                                          AS fecha,
        MIN(creado_en)                                      AS recibido_en
    FROM respuestas
    GROUP BY
        COALESCE(
            sesion_id::TEXT,
            usuario_id || '_' || servicio || '_' || to_char(date_trunc('minute', fecha), 'YYYYMMDDHH24MI')
        ),
        sesion_id, encuesta_tipo, servicio, edad, sexo,
        persona_que_responde, usuario_id, usuario_nombre
)
SELECT
    encuesta_id,
    sesion_id,
    encuesta_tipo,
    servicio,
    edad,
    sexo,
    persona_que_responde,
    usuario_id,
    usuario_nombre,
    nps,
    CASE
        WHEN nps >= 9 THEN 'promotor'
        WHEN nps >= 7 THEN 'pasivo'
        WHEN nps IS NOT NULL THEN 'detractor'
    END                                                     AS categoria_nps,
    prom_satisfaccion,
    comentario,
    fecha,
    recibido_en,
    fecha::DATE                                             AS fecha_dia
FROM grupo;

COMMENT ON VIEW v_encuestas IS
    'Una fila por encuesta completa. Agrupada por sesion_id (o por usuario+servicio+minuto en datos históricos).';


-- ---------------------------------------------------------------------
-- Vista: v_nps_diario
--
-- NPS calculado por día. Útil para la gráfica de tendencia temporal.
-- NPS = %promotores - %detractores (escala -100 a +100).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_nps_diario AS
SELECT
    fecha_dia,
    COUNT(*)                                                          AS total_encuestas,
    COUNT(*) FILTER (WHERE categoria_nps = 'promotor')               AS promotores,
    COUNT(*) FILTER (WHERE categoria_nps = 'pasivo')                 AS pasivos,
    COUNT(*) FILTER (WHERE categoria_nps = 'detractor')              AS detractores,
    ROUND(
        100.0
        * COUNT(*) FILTER (WHERE categoria_nps = 'promotor') / NULLIF(COUNT(*), 0)
        - 100.0
        * COUNT(*) FILTER (WHERE categoria_nps = 'detractor') / NULLIF(COUNT(*), 0)
    , 1)                                                              AS nps_score,
    ROUND(AVG(nps), 2)                                                AS nps_promedio,
    ROUND(AVG(prom_satisfaccion), 2)                                  AS satisfaccion_promedio
FROM v_encuestas
WHERE nps IS NOT NULL
GROUP BY fecha_dia
ORDER BY fecha_dia;

COMMENT ON VIEW v_nps_diario IS
    'NPS score y satisfacción promedio agrupados por día. Para la gráfica de tendencia del dashboard.';


-- ---------------------------------------------------------------------
-- Vista: v_satisfaccion_por_servicio
--
-- Promedio de satisfacción y NPS por servicio. Útil para el ranking.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_satisfaccion_por_servicio AS
SELECT
    servicio,
    encuesta_tipo,
    COUNT(*)                                            AS total_encuestas,
    ROUND(AVG(prom_satisfaccion), 2)                   AS satisfaccion_promedio,
    ROUND(AVG(nps), 2)                                 AS nps_promedio,
    COUNT(*) FILTER (WHERE categoria_nps = 'promotor') AS promotores,
    COUNT(*) FILTER (WHERE categoria_nps = 'detractor') AS detractores
FROM v_encuestas
GROUP BY servicio, encuesta_tipo
ORDER BY satisfaccion_promedio DESC NULLS LAST;

COMMENT ON VIEW v_satisfaccion_por_servicio IS
    'Satisfacción promedio y NPS por servicio hospitalario. Para el ranking del dashboard.';


-- ---------------------------------------------------------------------
-- Vista: v_resumen_por_orientador
--
-- Actividad y resultados por orientador. Útil para el filtro de
-- "ver encuestas por orientador" en el dashboard de administrador.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_resumen_por_orientador AS
SELECT
    r.usuario_id,
    r.usuario_nombre,
    u.activo,
    u.ultima_actividad,
    COUNT(DISTINCT e.encuesta_id)                      AS total_encuestas,
    MIN(e.fecha)                                       AS primera_encuesta,
    MAX(e.fecha)                                       AS ultima_encuesta,
    ROUND(AVG(e.prom_satisfaccion), 2)                AS satisfaccion_promedio,
    ROUND(AVG(e.nps), 2)                              AS nps_promedio
FROM respuestas r
LEFT JOIN v_encuestas e ON e.usuario_id = r.usuario_id
LEFT JOIN usuarios u    ON u.username   = r.usuario_id
GROUP BY r.usuario_id, r.usuario_nombre, u.activo, u.ultima_actividad
ORDER BY total_encuestas DESC;

COMMENT ON VIEW v_resumen_por_orientador IS
    'Actividad y métricas de calidad agrupadas por orientador. Para el filtro de orientador en el dashboard.';


-- ---------------------------------------------------------------------
-- Vista: v_orientadores_activos
--
-- Orientadores con actividad en los últimos 30 minutos.
-- El backend actualiza ultima_actividad con PATCH /usuarios/actividad.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_orientadores_activos AS
SELECT
    username,
    nombre,
    ultima_actividad,
    EXTRACT(EPOCH FROM (now() - ultima_actividad)) / 60 AS minutos_inactivo
FROM usuarios
WHERE rol = 'ROLE_USER'
  AND activo = TRUE
  AND ultima_actividad > now() - INTERVAL '30 minutes'
ORDER BY ultima_actividad DESC;

COMMENT ON VIEW v_orientadores_activos IS
    'Orientadores con actividad en los últimos 30 minutos. Usado por GET /orientadores/activos.';


-- ---------------------------------------------------------------------
-- Vista: v_tipificaciones
--
-- Desglosa el campo tipificacion (separado por "|") en filas individuales.
-- Útil para reportes de motivos de insatisfacción más frecuentes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_tipificaciones AS
SELECT
    r.id,
    r.sesion_id,
    r.pregunta_id,
    p.seccion,
    r.servicio,
    r.usuario_id,
    r.usuario_nombre,
    r.fecha,
    TRIM(motivo.valor)                                  AS motivo
FROM respuestas r
JOIN preguntas p ON p.id = r.pregunta_id,
     LATERAL unnest(string_to_array(r.tipificacion, '|')) AS motivo(valor)
WHERE r.tipificacion IS NOT NULL
  AND r.tipificacion <> '';

COMMENT ON VIEW v_tipificaciones IS
    'Motivos de insatisfacción (tipificación) desglosados en filas individuales.';


-- ---------------------------------------------------------------------
-- Consultas de ejemplo para el backend del administrador
--
-- 1. Resumen general (tarjetas del dashboard):
--    SELECT COUNT(*) AS total, ROUND(AVG(nps),1) AS nps, ROUND(AVG(prom_satisfaccion),2) AS sat
--    FROM v_encuestas
--    WHERE fecha BETWEEN :desde AND :hasta;
--
-- 2. Encuestas por orientador en un rango de fechas:
--    SELECT * FROM v_resumen_por_orientador
--    WHERE ultima_encuesta BETWEEN :desde AND :hasta;
--
-- 3. Tendencia NPS última semana:
--    SELECT * FROM v_nps_diario
--    WHERE fecha_dia >= CURRENT_DATE - 7;
--
-- 4. Top 5 servicios con menor satisfacción:
--    SELECT * FROM v_satisfaccion_por_servicio
--    ORDER BY satisfaccion_promedio ASC LIMIT 5;
--
-- 5. Motivos de insatisfacción más frecuentes:
--    SELECT motivo, COUNT(*) AS frecuencia
--    FROM v_tipificaciones
--    WHERE fecha BETWEEN :desde AND :hasta
--    GROUP BY motivo ORDER BY frecuencia DESC;
--
-- 6. Export CSV completo con filtros:
--    SELECT * FROM v_encuestas
--    WHERE fecha BETWEEN :desde AND :hasta
--      AND (:usuarioId IS NULL OR usuario_id = :usuarioId)
--      AND (:tipo IS NULL OR encuesta_tipo = :tipo)
--    ORDER BY fecha DESC;
-- ---------------------------------------------------------------------

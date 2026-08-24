-- =====================================================================
--  EncuestasSIAU — Usuarios iniciales (PostgreSQL)
--
--  Inserta los usuarios de prueba para el entorno de desarrollo.
--  Para producción, reemplazar los hashes de contraseña por hashes
--  bcrypt reales generados con el mismo algoritmo del backend.
--
--  Cómo generar un hash bcrypt en Spring Boot:
--    new BCryptPasswordEncoder().encode("contraseña")
--
--  Ejecutar DESPUÉS de 01_schema.sql:
--    psql -U <usuario> -d <basededatos> -f 03_seed_usuarios.sql
--
--  Es idempotente: ON CONFLICT (username) DO NOTHING.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Administradores (ROLE_ADMIN)
-- Acceden al dashboard completo, descargas y reportes.
-- ---------------------------------------------------------------------
INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES

-- Coordinadora SIAU (reemplazar hash por contraseña real antes de producción)
('coordinadora_siau',
 '$2a$10$REEMPLAZAR_CON_HASH_BCRYPT_REAL_coordinadora',
 'COORDINADORA SIAU',
 'ROLE_ADMIN'),

-- Secretaria SIAU
('secretaria_siau',
 '$2a$10$REEMPLAZAR_CON_HASH_BCRYPT_REAL_secretaria',
 'SECRETARIA SIAU',
 'ROLE_ADMIN')

ON CONFLICT (username) DO NOTHING;


-- ---------------------------------------------------------------------
-- Orientadores (ROLE_USER)
-- Solo pueden llenar encuestas y sincronizar respuestas.
-- Agregar un registro por cada orientador del SIAU.
-- ---------------------------------------------------------------------
INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES

-- Usuario de prueba (eliminar antes de producción)
('admin_test',
 '$2a$10$REEMPLAZAR_CON_HASH_BCRYPT_REAL_admin_test',
 'USUARIO DE PRUEBA',
 'ROLE_USER'),

-- Ejemplo de orientador real (completar con datos del personal)
('orientador_ejemplo',
 '$2a$10$REEMPLAZAR_CON_HASH_BCRYPT_REAL_orientador',
 'NOMBRE APELLIDO ORIENTADOR',
 'ROLE_USER')

ON CONFLICT (username) DO NOTHING;


-- ---------------------------------------------------------------------
-- Verificación
-- Muestra el listado de usuarios creados.
-- ---------------------------------------------------------------------
SELECT username, nombre, rol, activo, creado_en
FROM usuarios
ORDER BY rol DESC, nombre;

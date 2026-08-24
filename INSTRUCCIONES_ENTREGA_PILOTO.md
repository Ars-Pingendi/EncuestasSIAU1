# EncuestasSIAU: instrucciones de entrega y piloto

## Estado actual — app v3.0

La aplicación compila en modo debug y contiene:

- 13 preguntas unificadas (`app/src/main/assets/preguntas_unificadas.json`).
- NPS clásico de 0 a 10.
- Guardado offline con Room (SQLite v6) y sincronización automática/manual.
- Login por `POST auth/login` con JWT que incluye el campo `authorities`.
- Envío de respuestas por `POST respuestas`.
- Tipificación de motivos para respuestas detractoras.
- Exportación CSV y modo kiosco.
- **Sistema de roles**: `ROLE_USER` (orientador) y `ROLE_ADMIN` (coordinadora / secretaria).
- **Dashboard de administrador**: tarjetas de resumen, filtro de fechas (Hoy / Semana / Mes / Rango personalizado), orientadores activos en tiempo real.

## Usuarios de prueba (solo DEBUG)

| Usuario | Contraseña | Rol | Acceso |
|---------|-----------|-----|--------|
| `admin_test` | `siau2024` | `ROLE_USER` | Flujo de encuesta (orientador) |
| `admin_admin` | `siau2024` | `ROLE_ADMIN` | Dashboard de administrador |

**Eliminar ambos bypasses antes de cualquier release a producción.**

## Bloqueos antes del piloto

1. Sistemas debe confirmar IP, puerto y protocolo del backend.
2. El backend debe tener `POST /auth/login` y `POST /respuestas` funcionando.
3. El JWT debe incluir el campo `authorities` con valor `"ROLE_USER"` o `"ROLE_ADMIN"`.
4. Para el dashboard de administrador, el backend debe exponer además:
   - `GET /respuestas/resumen?desde=&hasta=`
   - `GET /orientadores/activos`
   - `PATCH /usuarios/actividad`
5. El bypass `admin_test` / `admin_admin` debe eliminarse antes de la release.

## 1. Datos que pedir a Sistemas

> Necesitamos para el piloto de EncuestasSIAU: IP y puerto del backend, confirmación
> de `POST /auth/login` (respuesta: `{"jwt":"..."}` con campo `authorities` en el payload),
> confirmación de `POST /respuestas`, usuario de prueba para cada rol
> (ROLE_USER y ROLE_ADMIN), contraseña de prueba y nombre de la base de datos PostgreSQL.

## 2. Crear la base de datos

Sistemas debe crear una base de datos vacía y ejecutar los scripts en orden:

```bash
psql -h HOST -p PUERTO -U USUARIO -d BASE_DATOS -f db/postgresql/01_schema.sql
psql -h HOST -p PUERTO -U USUARIO -d BASE_DATOS -f db/postgresql/02_seed_preguntas.sql
psql -h HOST -p PUERTO -U USUARIO -d BASE_DATOS -f db/postgresql/03_seed_usuarios.sql
psql -h HOST -p PUERTO -U USUARIO -d BASE_DATOS -f db/postgresql/04_vistas_admin.sql
```

Los scripts son idempotentes (pueden ejecutarse varias veces sin duplicar datos).

Validar después:

```sql
SELECT COUNT(*) FROM preguntas;   -- Debe devolver 13
SELECT COUNT(*) FROM usuarios;    -- Debe devolver al menos 2 (coordinadora + secretaria)
SELECT COUNT(*) FROM respuestas;  -- En BD nueva debe devolver 0
```

## 3. Contrato del endpoint `POST /respuestas`

La app envía un objeto JSON por respuesta (camelCase). El backend debe mapear así:

| JSON de la app | Columna PostgreSQL | Notas |
|---|---|---|
| `sesionId` | `sesion_id` | UUID que agrupa las 13 respuestas de un formulario |
| `id` | `id_local` | Solo trazabilidad |
| `encuestaTipo` | `encuesta_tipo` | `"ambulatoria"` o `"internacion"` |
| `preguntaId` | `pregunta_id` | FK a `preguntas.id` (1–13) |
| `respuesta` | `respuesta` | Texto de la respuesta |
| `servicio` | `servicio` | Nombre del servicio seleccionado |
| `edad` | `edad` | Entero entre 1 y 120 |
| `sexo` | `sexo` | `"Masculino"`, `"Femenino"` u `"Otro"` |
| `personaQueResponde` | `persona_que_responde` | `"El paciente"` o `"El cuidador..."` |
| `identificacion` | `identificacion` | Siempre `null` (política de anonimato) |
| `comentario` | `comentario` | Texto libre, puede ser `null` |
| `fecha` | `fecha` | ISO-8601 con zona horaria |
| `usuarioId` | `usuario_id` | Extraído del JWT autenticado |
| `usuarioNombre` | `usuario_nombre` | Extraído del JWT autenticado |
| `tipificacion` | `tipificacion` | Ítems separados por `"\|"`, puede ser `null` |
| `sincronizado` | — | Ignorar; la app lo envía siempre en `false` |

El endpoint debe responder HTTP `2xx` tras insertar. Para errores debe responder `4xx`
con mensaje claro; la app dejará la respuesta como pendiente y reintentará.

## 4. Contrato del JWT

El payload del JWT que genera el backend debe incluir:

```json
{
  "sub": "cedula_o_codigo_empleado",
  "name_user": "NOMBRE COMPLETO EN MAYÚSCULAS",
  "authorities": "ROLE_USER",
  "iat": 1234567890,
  "exp": 1234568490
}
```

- `authorities` debe ser exactamente `"ROLE_USER"` o `"ROLE_ADMIN"` (sin corchetes ni arreglo).
- La app enruta a la pantalla de orientador o de administrador según este campo.

## 5. Configurar la app

Crear localmente `local.properties` en la raíz:

```properties
sdk.dir=C:\\Users\\USUARIO\\AppData\\Local\\Android\\Sdk
auth.base.url=http://IP_BACKEND:PUERTO/api/
api.base.url=http://IP_BACKEND:PUERTO
```

La URL de autenticación debe terminar en `/`. Si el piloto usa HTTP, la IP debe estar
permitida en `app/src/main/res/xml/network_security_config.xml`.

## 6. Compilar e instalar

Desde PowerShell en la raíz:

```powershell
$env:JAVA_HOME = "C:\Users\ASUS\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
.\gradlew assembleDebug
.\gradlew installDebug
```

## 7. Prueba de aceptación — orientador (ROLE_USER)

1. Poner tablet y backend en la misma red.
2. Iniciar sesión con un usuario `ROLE_USER`.
3. Crear una encuesta ambulatoria y otra de hospitalización.
4. Completar servicio, edad, sexo y persona que responde.
5. En una pregunta 1–7 elegir `Malo` y seleccionar al menos un motivo.
6. Mover el NPS a un valor concreto (p. ej. `8`).
7. Finalizar la encuesta.
8. Verificar en PostgreSQL que llegaron 13 filas con el mismo `sesion_id`:

```sql
SELECT sesion_id, pregunta_id, respuesta, persona_que_responde, usuario_id, fecha
FROM respuestas
ORDER BY id DESC
LIMIT 15;
```

9. Desconectar la red, crear otra encuesta → verificar que queda pendiente (punto naranja).
10. Reconectar → sincronización automática (punto verde).

## 8. Prueba de aceptación — administrador (ROLE_ADMIN)

1. Iniciar sesión con un usuario `ROLE_ADMIN`.
2. Verificar que aparece el dashboard (no el flujo de encuesta).
3. Cambiar el filtro entre Hoy / Esta semana / Este mes y verificar que las tarjetas cambian.
4. Usar el botón "Rango 📅" y seleccionar fechas personalizadas.
5. Verificar que la sección "Orientadores activos" muestra los usuarios con sesión reciente.

## Seguridad

- No subir `local.properties`, contraseñas, tokens JWT ni claves de firma.
- No usar los usuarios DEBUG (`admin_test`, `admin_admin`) en la tablet del hospital.
- Migrar HTTP a HTTPS antes de producción.
- Hacer copias de seguridad de PostgreSQL antes de cualquier cambio.
- No usar `fallbackToDestructiveMigration()` en la app.

## Criterio de "listo"

La entrega está lista cuando:
- El APK release instala sin errores.
- El login funciona con usuarios reales de ambos roles.
- Una encuesta se guarda offline y sus 13 respuestas (con el mismo `sesion_id`) llegan al servidor al recuperar la red.
- El dashboard del administrador muestra datos reales del servidor (no el banner de datos de prueba).
- Sistemas confirma que los registros se leen correctamente en PostgreSQL.

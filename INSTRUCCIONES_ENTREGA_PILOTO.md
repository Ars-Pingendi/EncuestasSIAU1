# EncuestasSIAU: instrucciones de entrega y piloto

## Estado recuperado

La version recuperada es la `2.0` (`versionCode 2`). La aplicacion compila en modo
debug y contiene:

- 13 preguntas unificadas en `app/src/main/assets/preguntas_unificadas.json`.
- NPS clasico de 0 a 10.
- Guardado offline con Room y sincronizacion automatica/manual.
- Login por `POST auth/login`.
- Envio de respuestas por `POST respuestas`.
- Tipificacion de motivos para respuestas detractoras.
- Exportacion CSV y modo kiosco.

La compilacion correcta requiere Android SDK configurado. `local.properties` es local
y no se versiona.

## Bloqueos antes del piloto

1. Sistemas debe confirmar IP, puerto y protocolo del backend.
2. El backend debe tener `POST /auth/login` y `POST /respuestas` funcionando.
3. El backend debe mapear el JSON camelCase de la app al esquema PostgreSQL.
4. Debe probarse una encuesta completa y verificar sus 13 respuestas en la BD.
5. El dashboard actual usa datos simulados y pertenece al catalogo antiguo.
6. El bypass `admin_test / siau2024` existe solo en builds DEBUG y debe eliminarse
   antes de distribuir una release.

## 1. Datos que pedir a Sistemas

> Necesitamos para el piloto de EncuestasSIAU: IP y puerto del backend, confirmacion
> de `POST /auth/login`, confirmacion de `POST /respuestas`, usuario de prueba,
> contrasena de prueba y nombre de la base de datos PostgreSQL. Confirmen tambien
> que el backend transforma los campos JSON de la app al esquema SQL.

## 2. Crear la base de datos

Sistemas debe crear una base de datos vacia y ejecutar desde la raiz del proyecto:

```bash
psql -h HOST_POSTGRES -p PUERTO_POSTGRES -U USUARIO -d BASE_DATOS \
  -v ON_ERROR_STOP=1 -f db/postgresql/00_setup_piloto_unificado.sql
```

El script no usa `DROP`, no borra datos y puede ejecutarse nuevamente sin duplicar
preguntas ni indices.

Validar despues:

```sql
SELECT COUNT(*) FROM preguntas;
-- Debe devolver 13

SELECT id, tipo_encuesta, tipo FROM preguntas ORDER BY id;
-- Debe mostrar ids 1 a 13 y tipo_encuesta = unificado

SELECT COUNT(*) FROM respuestas;
-- En una BD nueva debe devolver 0
```

Los scripts antiguos `01_schema.sql` y `02_seed_preguntas.sql` corresponden al
formulario anterior de 26 preguntas. Para una BD nueva del piloto usar el script
`00_setup_piloto_unificado.sql`.

## 3. Contrato obligatorio del backend

La app envia un objeto por respuesta con nombres camelCase. El backend debe recibir
estos campos y transformarlos antes de insertar:

| JSON de la app | Columna PostgreSQL | Accion |
|---|---|---|
| `id` | `id_local` | Copiar como trazabilidad |
| `encuestaTipo` | `encuesta_tipo` | `ambulatoria` o `internacion` |
| `preguntaId` | `pregunta_id` | Validar FK contra `preguntas.id` |
| `respuesta`, `servicio`, `edad`, `sexo` | Igual nombre | Validar edad entre 0 y 150 |
| `personaQueResponde` | `informante` | Copiar |
| `identificacion`, `comentario` | Igual nombre | Pueden ser `null` |
| `tipificacion` | `motivos` | Separar por `|` y convertir a JSONB |
| `fecha` | `fecha` | Parsear ISO-8601 con zona horaria |
| `usuarioId` | `usuario_id` | Copiar desde la sesion autenticada |
| `usuarioNombre` | `usuario_nombre` | Copiar |
| `sincronizado` | `sincronizado` | En servidor debe quedar `true` |

La version actual no envia `encuestaId` ni `dispositivoId`. El script permite
`encuesta_id` nulo y usa `dispositivo_id` vacio. Para agrupar las 13 respuestas de
una encuesta y distinguir tablets, esos campos deben agregarse en una futura version.

El endpoint debe responder HTTP `2xx` despues de insertar. Para errores debe
responder `4xx` con un mensaje claro; la app dejara la respuesta pendiente.

## 4. Configurar la app

Crear localmente `local.properties` en la raiz:

```properties
sdk.dir=C:\\Users\\USUARIO\\AppData\\Local\\Android\\Sdk
auth.base.url=http://IP_BACKEND:PUERTO/api/
api.base.url=http://IP_BACKEND:PUERTO
```

La URL de autenticacion debe terminar en `/`. Si el piloto usa HTTP, la IP tambien
debe estar permitida en `app/src/main/res/xml/network_security_config.xml`.

## 5. Compilar e instalar

Desde PowerShell en la raiz:

```powershell
$env:ANDROID_HOME = "C:\Users\USUARIO\AppData\Local\Android\Sdk"
.\gradlew.bat assembleDebug
.\gradlew.bat installDebug
```

Para una entrega formal, retirar el bypass DEBUG, generar una variante `release` y
firmar el APK con la clave institucional.

## 6. Prueba de aceptacion

1. Poner tablet y backend en la misma red.
2. Iniciar sesion con las credenciales entregadas por Sistemas.
3. Crear una encuesta ambulatoria y otra de internacion.
4. Completar edad, sexo y persona que responde.
5. En una pregunta 1 a 7 elegir `Malo` y seleccionar un motivo.
6. Mover el NPS a un valor concreto, por ejemplo `8`.
7. Finalizar la encuesta.
8. Desconectar la red, crear otra respuesta y comprobar que queda pendiente.
9. Reconectar y pulsar sincronizacion manual.
10. Verificar en PostgreSQL respuestas con `pregunta_id` del 1 al 13.

```sql
SELECT pregunta_id, respuesta, informante, motivos, usuario_id, fecha
FROM respuestas
ORDER BY id DESC
LIMIT 20;
```

## Dashboard

`dashboard/index.html` usa actualmente datos simulados y preguntas del catalogo
antiguo. Para datos reales, el backend debe exponer un endpoint de lectura y el
dashboard debe adaptarse al formulario unificado. No debe presentarse como conectado
hasta verificar datos reales en pantalla.

## Seguridad

- No subir `local.properties`, contrasenas, tokens JWT ni claves de firma.
- No usar el usuario DEBUG en la tablet del hospital.
- Migrar HTTP a HTTPS antes de produccion.
- Hacer copias de seguridad de PostgreSQL antes de cualquier cambio.
- No usar `fallbackToDestructiveMigration()` en la app.

## Criterio de listo

La entrega esta lista cuando el APK release instala, el login funciona, una encuesta
se guarda offline, las 13 respuestas llegan al servidor al recuperar la red y
Sistemas confirma que los registros se leen correctamente en PostgreSQL.
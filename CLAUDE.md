# EncuestasSIAU — Contexto del proyecto para el asistente IA

## Resumen del proyecto

**EncuestasSIAU** es una aplicación Android de kiosco para tablets que recopila encuestas de satisfacción de pacientes en un hospital de alta complejidad en Colombia. Funciona en modo offline-first: guarda respuestas en Room (SQLite local) y las sincroniza automáticamente al servidor cuando hay red disponible.

- **Plataforma**: Android (minSdk 26, targetSdk 34)
- **Lenguaje**: Kotlin 100%
- **UI**: Jetpack Compose + Material 3
- **Arquitectura**: MVVM + Repository pattern
- **Modo de despliegue**: Tablet de kiosco fija en el hospital (sin acceso público)

---

## Arquitectura general

```
MainActivity
└── LoginScreen  (si no hay sesión activa)
└── AppNavigation  (si hay sesión)
    ├── StartScreen          → selección de tipo de encuesta
    ├── ServiceScreen        → selección de servicio
    ├── EdadSexoScreen       → edad, sexo, quién responde
    ├── QuestionScreen       → 13 preguntas del formulario unificado
    └── GraciasScreen        → pantalla final
```

**Flujo de estado**: `SurveyFlowViewModel` (StateFlow) controla la navegación entre pantallas mediante el campo `screen` en `SurveyFlowState`. No se usa Navigation Compose para la navegación principal.

---

## Estructura de archivos clave

```
app/src/main/
├── assets/
│   ├── preguntas_unificadas.json   ← 13 preguntas (único formulario)
│   └── servicios.json              ← 34 servicios con campo "tipo"
├── java/com/example/encuestassiau/
│   ├── MainActivity.kt             ← kiosco, sesión, NetworkObserver
│   ├── data/
│   │   ├── AppDatabase.kt          ← Room v4, migraciones 1→2→3→4
│   │   ├── Respuesta.kt            ← entidad Room (@Serializable)
│   │   ├── Repository.kt           ← lógica de negocio, login, sync, CSV
│   │   ├── SessionManager.kt       ← EncryptedSharedPreferences (JWT)
│   │   ├── PreguntaDao.kt
│   │   ├── RespuestaDao.kt
│   │   └── converters/
│   │       └── StringListConverter.kt  ← kotlinx-serialization (no Gson)
│   ├── model/
│   │   └── Question.kt             ← entidad Room (@Serializable)
│   ├── network/
│   │   ├── AuthApi.kt              ← POST auth/login
│   │   ├── SyncApi.kt              ← POST respuestas
│   │   ├── RetrofitClient.kt       ← dos instancias Retrofit (auth + sync)
│   │   ├── LoginRequest.kt         ← {username, password}
│   │   └── LoginResponse.kt        ← {jwt, refreshToken?}
│   ├── ui/
│   │   ├── AppNavigation.kt        ← switch de pantallas según state.screen
│   │   ├── LoginScreen.kt
│   │   ├── StartScreen.kt
│   │   ├── ServiceScreen.kt
│   │   ├── EdadSexoScreen.kt
│   │   ├── QuestionScreen.kt       ← lógica de los 4 tipos de pregunta
│   │   └── GraciasScreen.kt
│   ├── util/
│   │   ├── TipificacionConfig.kt   ← menús condicionales por pregunta
│   │   ├── JwtUtils.kt             ← decodePayload + isExpired (java.util.Base64)
│   │   ├── IdleTimeoutManager.kt   ← cierre de sesión por inactividad
│   │   └── NetworkObserver.kt      ← dispara sync cuando vuelve la red
│   └── viewmodel/
│       ├── SurveyFlowViewModel.kt  ← estado de toda la encuesta
│       └── RespuestasViewModel.kt  ← guardar/cargar respuesta individual
└── res/
    ├── values/strings.xml          ← todos los textos de UI (sin hardcode)
    └── xml/network_security_config.xml
```

---

## Base de datos Room (versión 4)

### Entidades
- `respuestas` — respuestas individuales por pregunta
- `preguntas` — preguntas cargadas desde `preguntas_unificadas.json`

### Cadena de migraciones
| Migración | Cambios |
|-----------|---------|
| 1 → 2 | Añade `usuarioId`, `usuarioNombre` a `respuestas`; crea tabla `preguntas` |
| 2 → 3 | Añade `seccion`, `tipo` a `preguntas`; añade `personaQueResponde` a `respuestas`; borra preguntas obsoletas |
| 3 → 4 | Añade `tipificacion TEXT` a `respuestas` |

**Nunca usar `fallbackToDestructiveMigration()`** — hay datos reales de pacientes en producción.

### Carga de preguntas
`AppDatabase.onOpen` verifica si `preguntaDao.count() == 0` y carga `preguntas_unificadas.json` si es necesario. Nunca borrar ese archivo de assets.

---

## Autenticación

### Especificación del servidor
| Campo | Valor |
|-------|-------|
| Base URL | `http://<IP>:<PORT>/api/` |
| Endpoint login | `POST auth/login` (relativo — sin barra inicial) |
| Body | `{"username": "...", "password": "..."}` |
| Respuesta | `{"jwt": "eyJ..."}` HTTP 200 |

### Flujo
1. `MainActivity.onCreate` → `SessionManager.restoreSession()` → `RetrofitClient.setAuthToken(token)`
2. Si `repository.isTokenExpired()` → `SessionManager.clearSession()`
3. `SessionManager.isLoggedIn()` determina si mostrar `LoginScreen` o `AppNavigation`
4. `Repository.login()` → `authApi.login()` → guarda JWT con `SessionManager.saveToken()` → extrae `name_user` del payload JWT
5. Logout: `SessionManager.clearSession()` + `activity.recreate()`

### Almacenamiento del JWT
`SessionManager` usa `EncryptedSharedPreferences` con API de `security-crypto:1.0.0`:
```kotlin
MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)  // NO MasterKey.Builder
EncryptedSharedPreferences.create(filename, alias, context, keyScheme, valueScheme)
```
Archivo de prefs: `encuestas_sesion_v2` (el `v2` evita conflictos con instancias anteriores sin cifrado).

### Credenciales de prueba (solo DEBUG)
En `Repository.login()` hay un bypass protegido por `BuildConfig.DEBUG`:
- Usuario: `admin_test`
- Contraseña: `siau2024`
- **Eliminar antes de release a producción**

---

## Configuración de red

### `local.properties` (no en git)
```properties
auth.base.url=http://<IP_AUTH>:<PORT>/api/
api.base.url=http://<IP_SYNC>:<PORT>
```
Si las claves no están definidas, el `build.gradle.kts` usa valores por defecto:
- `AUTH_URL` default: `http://192.168.10.35:8001/api/`
- `API_URL` default: `http://192.168.10.150:8001`

### `network_security_config.xml`
Permite HTTP cleartext solo para las dos IPs del hospital. Todo lo demás fuerza HTTPS.

### Emulador Android Studio
El emulador accede al `localhost` de la PC mediante `10.0.2.2`. Para probar con backend local:
```properties
auth.base.url=http://10.0.2.2:<PORT>/api/
api.base.url=http://10.0.2.2:<PORT>
```

---

## Formulario unificado

### Las 13 preguntas (`preguntas_unificadas.json`)
Todos los registros tienen `tipoEncuesta: "unificado"`. `SurveyFlowViewModel.cargarPreguntas()` siempre pide `"unificado"` sin importar el tipo seleccionado en `StartScreen` (ambulatoria/internación — la distinción queda solo en el campo `servicio`).

| ID | Sección | Tipo |
|----|---------|------|
| 1–3 | Trato digno y humanización | `escala` |
| 4–5 | Información y comunicación | `escala` |
| 6–7 | Privacidad y confidencialidad | `escala` |
| 8–9 | Oportunidad e infraestructura | `escala` |
| 10–11 | Oportunidad e infraestructura | `sino` |
| 12 | NPS | `nps` |
| 13 | Retroalimentación cualitativa | `texto_libre` |

### Tipos de pregunta en `QuestionScreen`
| Tipo | UI | Validación para avanzar |
|------|----|------------------------|
| `escala` | 5 caritas emoji (😡😞😐🙂😄) en Cards circulares | `respuestaSeleccionada != null` |
| `sino` | Botones grandes Sí / No | `respuestaSeleccionada != null` |
| `nps` | Slider 0–10 + número grande | `npsInteractuado == true` (requiere mover el slider) |
| `texto_libre` | `OutlinedTextField` multilínea | Siempre puede avanzar |

### Tipificación (menús condicionales)
Se activa para preguntas 1–7 cuando `respuestaSeleccionada` está en `setOf("Muy malo", "Malo")`.
- Q1: problemas con personal administrativo (5 opciones)
- Q2: problemas con médicos (4 opciones)
- Q3: problemas con enfermería (4 opciones)
- Q4–Q7: problemas de privacidad/información (4 opciones compartidas)

Almacenamiento: ítems seleccionados separados por `|` en el campo `tipificacion` de `Respuesta`.

---

## Servicios (`servicios.json`)

34 servicios con campos `id`, `nombre`, `tipo`:
- IDs 1–11: `tipo: "ambulatoria"`
- IDs 12–34: `tipo: "internacion"`

`ServiceScreen` filtra por el `tipoEncuesta` seleccionado en `StartScreen`.

---

## Sincronización

`SyncApi` envía cada `Respuesta` a `POST respuestas` (relativo a `API_URL`).
La sincronización se dispara:
1. Automáticamente cuando `NetworkObserver` detecta que vuelve la red
2. Manualmente desde `StartScreen` → botón "Sincronizar manualmente"

**Nota pendiente**: el contrato exacto del endpoint `POST /respuestas` no ha sido confirmado por el backend. Verificar antes de ir a producción.

---

## Modo kiosco (tablet)

`MainActivity` implementa:
- `FLAG_KEEP_SCREEN_ON` — pantalla siempre encendida
- `WindowInsetsControllerCompat` — modo inmersivo (oculta barras del sistema)
- `onWindowFocusChanged` — re-aplica el modo inmersivo si una notificación lo interrumpe
- `startLockTask()` — bloqueo de kiosco (solo funciona si el dispositivo tiene Device Owner configurado por IT)
- `BackHandler(enabled = true) {}` — bloquea el botón Atrás del sistema durante la encuesta
- `IdleTimeoutManager` — cierra sesión automáticamente por inactividad

---

## Dependencias clave

```kotlin
// Network
"com.squareup.retrofit2:retrofit:2.9.0"
"com.squareup.retrofit2:converter-gson:2.9.0"
"com.squareup.okhttp3:logging-interceptor:4.12.0"

// Seguridad
"androidx.security:security-crypto:1.0.0"   // EncryptedSharedPreferences

// Room
"androidx.room:room-runtime:2.6.1"
"androidx.room:room-ktx:2.6.1"
ksp("androidx.room:room-compiler:2.6.1")    // KSP, no KAPT

// Serialización (para Room TypeConverters y assets JSON)
"org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3"
```

**Sin Ktor** — se eliminó en favor de dos instancias Retrofit en `RetrofitClient`.

---

## Patrones y convenciones establecidas

- **Textos de UI**: siempre en `strings.xml`, nunca hardcodeados en Compose
- **Serialización JSON**: usar `kotlinx-serialization`, no Gson, para modelos Room (`@Serializable`)
- **Gson**: solo para Retrofit converters (body HTTP), no para Room
- **Migraciones Room**: siempre explícitas, nunca `fallbackToDestructiveMigration()`
- **Context en Repository**: se pasa como parámetro a los métodos que lo necesitan, no se almacena
- **Identificación del paciente**: eliminada por decisión de anonimato — el campo `identificacion` en `Respuesta` siempre se pasa como `null`
- **`JwtUtils`**: usa `java.util.Base64.getUrlDecoder()` (disponible desde API 26, coincide con minSdk)

---

## Problemas recurrentes conocidos

### Worktrees huérfanos de Claude
Claude Code crea worktrees en `.claude/worktrees/`. Android Studio los indexa y genera errores `PACKAGE_OR_CLASSIFIER_REDECLARATION`. Solución:
```bash
git worktree prune
# Luego eliminar el directorio físico manualmente en el Explorador de archivos
rd /s /q ".claude\worktrees\<nombre>"
# Finalmente en Android Studio: File → Invalidate Caches → Invalidate and Restart
```

### `AuthApi.kt` — regla crítica sobre rutas Retrofit
El path debe ser **relativo** (sin barra inicial): `@POST("auth/login")`.
Una barra inicial (`@POST("/auth/login")`) hace que Retrofit ignore el segmento `/api/` de la base URL, rompiendo el endpoint.

### `EncryptedSharedPreferences` con `security-crypto:1.0.0`
Usar la API antigua, no la nueva:
```kotlin
// CORRECTO (security-crypto:1.0.0)
val alias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
EncryptedSharedPreferences.create(filename, alias, context, keyScheme, valueScheme)

// INCORRECTO (requiere security-crypto:1.1.x que no está en el proyecto)
MasterKey.Builder(context).setKeyScheme(...).build()
```

---

## Tareas pendientes (al momento de este documento)

| Prioridad | Tarea |
|-----------|-------|
| Alta | Confirmar IP y puerto del servidor con el área de IT y actualizar `local.properties` + `network_security_config.xml` |
| Alta | Confirmar contrato del endpoint `POST /respuestas` con el backend antes de ir a producción |
| Alta | **Eliminar el bypass de credenciales de prueba** en `Repository.login()` antes del release |
| Media | Migrar a HTTPS cuando el servidor tenga certificado; actualizar `network_security_config.xml` |
| Baja | Configurar Device Owner en la tablet para activar `startLockTask()` (coordinación con IT) |
| Baja | Configurar CI/CD cuando haya repositorio remoto |
| Baja | Evaluar Crashlytics o Sentry para observabilidad en producción |

---

## Contexto institucional

- Hospital de alta complejidad en Colombia
- El app reemplaza encuestas en papel del SIAU (Sistema de Información y Atención al Usuario)
- Las tablets son fijas en puntos de atención (no son dispositivos personales)
- Los operadores (personal del hospital) se autentican con usuario y contraseña
- Los pacientes interactúan directamente con la tablet sin autenticarse
- Las respuestas son anónimas por política institucional

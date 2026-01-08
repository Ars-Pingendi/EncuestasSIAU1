# EncuestasSIAU

Aplicación Android desarrollada en Kotlin + Jetpack Compose para la recolección
de encuestas de satisfacción en el Hospital Universitario San José de Popayán.

## Tecnologías
- Kotlin
- Jetpack Compose
- Room
- Ktor
- Coroutines

## Características
- Funciona offline
- Sincronización automática
- Exportación CSV

## Contenidos (índice)

1. Descripción rápida
2. Arquitectura y decisiones técnicas
3. Requisitos (desarrollo)
4. Instalación y ejecución (rápida)
5. Configuración (BASE_URL, tokens, claves)
6. Estructura de código y archivos clave
7. Base de datos y migraciones
8. Flujo de trabajo para colaboradores / Contribuciones
9. Buenas prácticas y estilo de código
10. Seguridad y privacidad
11. Problemas conocidos y tareas pendientes (TODO)
12. Contacto / Mantenedores

## Descripción rápida

Aplicación Android en Kotlin + Jetpack Compose que permite:

Seleccionar servicio, tipo de encuesta (ambulatoria / internación).
Recoger datos demográficos mínimos (edad, sexo, identificación opcional).
Registrar respuestas por pregunta (opciones predefinidas y comentarios cuando se requiere).
Guardar en Room local y sincronizar con una API interna (Ktor + Retrofit).
Exportar respuestas a CSV para análisis local.

## Arquitectura y decisiones técnicas

Lenguaje / UI: Kotlin + Jetpack Compose.
Persistencia: Room (v2.6.1) con Converters para listas.
Red / API: Ktor client para envío de respuestas y Retrofit para autenticación.
Serialización: kotlinx-serialization-json.
Manejo de sesión: SessionManager guarda JWT en SharedPreferences.
Patrón: Repositorio (Repository) + ViewModels (RespuestasViewModel).
Manejo offline: respuestas guardadas localmente; método para sincronizar pendientes.
Timeout de inactividad: IdleTimeoutManager (15 min) que invalida sesión.
(Detalles y ejemplos de los archivos principales están en el respaldo de código subido). 

## Requisitos (desarrollo)

Android Studio (recomendado Electric Eel o más reciente).
JDK 17 (proyecto target/source compatibility = 17).
Gradle compatible (el wrapper del repo).
Emulador o dispositivo con Android API >= 26 (minSdk = 26).
Conexión a la red interna del hospital para probar sincronización contra los endpoints reales (o un mock server).

# Dependencias importantes (extracto):

Room 2.6.1
Ktor client 2.3.x
kotlinx-serialization-json 1.7.x
Retrofit 2.9.0 (para Auth)
Compose BOM 2024.09.01
(Ver build.gradle/build.gradle.kts en el repo para la lista completa). 

## Instalación y ejecución (rápida)

1. Clona el repo:

git clone https://github.com/Ars-Pingendi/EncuestasSIAU1

2. Abrir en Android Studio: File > Open... → seleccionar la carpeta raíz.
3. Configurar variables locales (ver sección Configuración abajo).
4. Construir y ejecutar en un emulador o dispositivo.

# Comandos útiles:

# desde la raíz del proyecto
./gradlew assembleDebug
./gradlew installDebug    # instala en dispositivo/emulador conectado

## Configuración (BASE_URL, tokens, claves)

# IMPORTANTE: 
Hay valores hardcodeados en el código de respaldo (p. ej. NetworkClient.BASE_URL, RetrofitClient.BASE_URL y un JWT de ejemplo en SessionManager). Antes de abrir PRs para producción, conviértelos en variables de configuración y elimina secrets hardcodeados. 

# Recomendación: usar local.properties o gradle.properties + buildConfigField
Ejemplo (Kotlin DSL - app/build.gradle.kts), agrega dentro de android {}:

buildTypes {
    debug {
        buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:8001\"")
        buildConfigField("String", "AUTH_BASE_URL", "\"http://10.0.2.2:8101/\"")
    }
    release {
        buildConfigField("String", "API_BASE_URL", "\"https://api.tu-dominio.local/\"")
        buildConfigField("String", "AUTH_BASE_URL", "\"https://auth.tu-dominio.local/\"")
        // no incluir claves sensibles aquí; usar CI secrets para releases
    }
}


Luego en Kotlin:

private const val BASE_URL = BuildConfig.API_BASE_URL

# Alternativa: local.properties

En local.properties (no versionar):

API_BASE_URL=http\://192.168.10.150:8001
AUTH_BASE_URL=http\://192.168.16.160:8101

y leerlo desde build.gradle.kts para crear buildConfigField.

# Notas de red en emulador

- Emulador Android: 10.0.2.2 mapea al localhost de la máquina host.
- Device físico: usar la IP de la máquina en la red (ej. 192.168.x.y) o VPN según infraestructura.

## Estructura de código y archivos clave

Resumen de carpetas y archivos más relevantes (rutas relativas desde app/src/main/java/...):

# com.example.encuestassiau.data

- AppDatabase.kt — configuración Room (entities: Respuesta, Question, versión = 2). 
- RespuestaDao.kt, PreguntaDao.kt — operaciones DB. 
- Repository.kt — lógica: login (Retrofit), guardar respuestas, sincronizar pendientes, exportar CSV. 
- SessionManager.kt — guardar/leer JWT en SharedPreferences (NO dejar JWT hardcodeada en master). 

# com.example.encuestassiau.model

- Question.kt — entity Room para preguntas.
- preguntasAmbulatorias.kt, preguntasInternacion.kt — preguntas locales (fallback). 

# com.example.encuestassiau.network

- NetworkClient.kt — Ktor client: envía respuestas (/respuestas) y obtiene servicios (/servicios). Configura BASE_URL y timeouts. 
- RetrofitClient.kt — Retrofit para AuthApi (login). 

# UI (com.example.encuestassiau.ui)

- MainActivity.kt — nav flow y restauración de sesión.
- StartScreen, ServiceScreen, EdadSexoScreen, QuestionScreen, GraciasScreen, LoginScreen — pantallas y flujos. 

# ViewModel

RespuestasViewModel y RespuestasViewModelFactory. 

# Otros

IdleTimeoutManager — timeout inactividad.
network_security_config, AndroidManifest.xml, build.gradle(.kts).

Para detalles y el código completo revisa el respaldo subido. 

## Base de datos y migraciones

- AppDatabase tiene version = 2. Si ya existe versión anterior en dispositivos, considera agregar migraciones en lugar de fallbackToDestructiveMigration() en producción. 
- Respuestas ahora incluye el campo sincronizado: Boolean — revisar DAOs y consultas que dependen de ese campo. 

# Exportar respuestas (CSV)

El método Repository.exportarRespuestasCsv(context) genera el archivo respuestas_siau.csv en la ruta:

context.getExternalFilesDir(null)

Este archivo permite la auditoría, respaldo y análisis de la información recolectada, así como su entrega al área de Aseguramiento de la Calidad o a otras dependencias autorizadas.

# Estructura del archivo CSV

El archivo contiene las siguientes columnas, en el orden indicado:
Usuario,Servicio,Edad,Sexo,TipoEncuesta,PreguntaId,Respuesta,Comentario,Fecha,Sincronizado

# Descripción de los campos

- Usuario: nombre o identificador del usuario autenticado que realizó la encuesta.
- Servicio: servicio hospitalario seleccionado (ej. Urgencias, Hospitalización, Consulta externa).
- Edad: edad del usuario encuestado.
- Sexo: sexo del usuario encuestado.
- TipoEncuesta: tipo de encuesta aplicada (Ambulatoria o Internación).
- PreguntaId: identificador interno de la pregunta respondida.
- Respuesta: opción seleccionada o respuesta registrada.
- Comentario: observación adicional ingresada por el encuestado (si aplica).
- Fecha: fecha y hora en que se registró la respuesta.
- Sincronizado: indica si la respuesta ya fue enviada exitosamente al servidor (true / false).

# Consideraciones

Cada fila del archivo CSV representa una respuesta individual por pregunta, no una encuesta completa.
El archivo se sobrescribe cada vez que se ejecuta el proceso de exportación.
La información exportada no debe compartirse fuera del entorno institucional, ya que contiene datos operativos internos.

# Tests / Debug

No hay tests unitarios presentes por defecto en el respaldo. Recomendación: añadir pruebas para:

Repository.exportarRespuestasCsv (integración local).
RespuestaDao (Room DB testing).
ViewModel (guardar y sincronizar).

Comandos:

./gradlew test
./gradlew connectedAndroidTest

## Flujo de trabajo para colaboradores / Contribuciones

Sugerencia de flujo simple:

Fork → branch feature/bugfix feature/nombre-descriptivo → PR a develop (o main según política).

# Cada PR debe incluir:

Descripción del cambio.
Cómo probar localmente (pasos mínimos).
Si toca configuración: indicar cambios necesarios en local.properties.
Revisiones: 1 reviewer mínimo.
Merge con squash y mensaje claro.

# Issues y PR templates (sugeridos):

ISSUE_TEMPLATE.md con: pasos para reproducir, ambiente, logs, prioridad.
PULL_REQUEST_TEMPLATE.md con: qué, por qué, cómo probar.

## Buenas prácticas y estilo de código

Mantener separación clara entre UI (Compose), lógica (ViewModel) y persistence/network (Repository).
Evitar hardcodear URLs y secretos. Usar BuildConfig / local.properties.
Formato de commits: feat: descripción corta, fix: descripción, chore: ....
Lint y formatting: usar ktlint y detekt en CI si es posible.

## Seguridad y privacidad

Eliminar cualquier JWT hardcodeado (actualmente SessionManager contiene un token ejemplo) y no versionar keys. 
Usar HTTPS en producción (BuildConfig/release).
No almacenar información médica sensible en texto plano; si se planea almacenar datos sensibles, revisar marco legal y privacidad del hospital.
Proteger endpoints (API keys, CORS, red interna segura).
Anotar en la documentación dónde se manejan los tokens (SessionManager) y el header Authorization (en NetworkClient). 

## Problemas conocidos y tareas pendientes (TODO)

Preguntas remotas vs locales: actualmente el app carga preguntas desde Room; existe código con preguntas hardcoded (fallback). Si se habilita /api/preguntas, añadir modelo/endpoint y versiónado de preguntas. 
Migraciones DB: implementar migraciones si se cambia esquema en producción (evitar fallbackToDestructiveMigration() en release). 
Validaciones UI: añadir tests de usabilidad y manejo de errores (p. ej. formulario incompleto).
Monitoreo de sincronización: mejorar logs y exponer estado en UI para ver respuestas pendientes.

# Cómo revisar cambios críticos (checklist para PRs que tocan networking / DB / auth)

 No hay secrets hardcodeados en el PR.
 Variables de entorno explicadas en README.
 Migraciones DB añadidas o plan especificado.
 Pruebas mínimas o pasos de verificación en la descripción del PR.
 Revisado el manejo de errores (timeout/401/500).

## Contacto / Mantenedores

Mantenedor principal (actual): Área de Sistemas de Información HUSJ.

# Manual de Implementación — EncuestasSIAU
### Para el área de Sistemas / TI del hospital

---

## Resumen

Este documento describe todo lo que el área de Sistemas debe hacer para llevar la app **EncuestasSIAU** del estado actual (funcional en modo prueba) al despliegue completo en las tablets del hospital.

La app ya está desarrollada y probada. Solo falta conectarla al servidor real, compilar la versión de producción e instalarla en la tablet configurada como kiosco.

---

## Requisitos previos

Antes de comenzar, Sistemas debe tener a la mano:

- Computador con **Android Studio** instalado (incluye el SDK de Android y el JDK necesario)
- El código fuente del repositorio: `https://github.com/Ars-Pingendi/EncuestasSIAU1`
- Las **IPs y puertos** del servidor de autenticación y del servidor de sincronización
- El **contrato del endpoint** `POST /respuestas` (ver Paso 2)
- La tablet Android del hospital con cable USB y **depuración USB activada**
- Credenciales reales de un operador del hospital (usuario y contraseña para el login)

---

## Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/Ars-Pingendi/EncuestasSIAU1.git
cd EncuestasSIAU1
git checkout master
```

Abrir la carpeta en Android Studio: `File → Open → seleccionar la carpeta EncuestasSIAU1`.

Esperar a que Gradle sincronice el proyecto (puede tardar varios minutos la primera vez).

---

## Paso 2 — Confirmar el contrato del endpoint de sincronización

Antes de compilar, el equipo de backend debe confirmar cómo espera recibir los datos.

La app envía cada respuesta con `POST /respuestas` (relativo a la URL base del servidor de sincronización). El cuerpo del request es un objeto JSON con la siguiente estructura:

```json
{
  "id": 0,
  "encuestaTipo": "ambulatoria",
  "preguntaId": 1,
  "respuesta": "Muy bueno",
  "servicio": "CONSULTA EXTERNA",
  "edad": 45,
  "sexo": "Masculino",
  "identificacion": null,
  "comentario": null,
  "fecha": "2026-08-24T14:30:00",
  "usuarioId": "operador01",
  "usuarioNombre": "Juan Pérez",
  "personaQueResponde": "El paciente",
  "tipificacion": null,
  "sincronizado": false
}
```

> **Acción requerida**: El equipo de backend debe confirmar si este contrato es correcto, o si el endpoint espera campos diferentes o un formato distinto. Si hay cambios, modificar el archivo `app/src/main/java/com/example/encuestassiau/data/Respuesta.kt` y/o `app/src/main/java/com/example/encuestassiau/network/SyncApi.kt`.

---

## Paso 3 — Configurar las URLs del servidor

### 3.1 Crear el archivo `local.properties`

En la raíz del proyecto existe un archivo `local.properties` (no está en GitHub por seguridad). Si no existe, crearlo. Agregar las siguientes líneas con las IPs y puertos reales:

```properties
# URL del servidor de autenticación (login)
auth.base.url=http://<IP_SERVIDOR_AUTH>:<PUERTO>/api/

# URL del servidor de sincronización (envío de respuestas)
api.base.url=http://<IP_SERVIDOR_SYNC>:<PUERTO>
```

**Ejemplo con IPs reales del hospital:**
```properties
auth.base.url=http://192.168.22.148:8001/api/
api.base.url=http://192.168.22.148:8001
```

> Si el servidor de autenticación y el de sincronización son el mismo, las IPs serán iguales.
> Importante: `auth.base.url` debe terminar en `/api/` (con barra al final).

### 3.2 Actualizar la configuración de red

Abrir el archivo `app/src/main/res/xml/network_security_config.xml`.

Agregar un bloque `<domain-config>` por cada IP del servidor si no está ya incluida:

```xml
<domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.22.148</domain>
    <trust-anchors>
        <certificates src="system" />
    </trust-anchors>
</domain-config>
```

> Esto permite tráfico HTTP hacia esa IP. Si el servidor ya tiene HTTPS con certificado válido, este paso no es necesario y se puede eliminar el bloque (la configuración por defecto ya fuerza HTTPS para todo lo demás).

---

## Paso 4 — Eliminar las credenciales de prueba

Abrir el archivo:
```
app/src/main/java/com/example/encuestassiau/data/Repository.kt
```

Buscar y **eliminar por completo** el siguiente bloque (líneas ~48–59):

```kotlin
// Bypass de pruebas — solo en builds DEBUG, no llega a producción
if (BuildConfig.DEBUG && username == "admin_test" && password == "siau2024") {
    val fakeJwt = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0" +
        ".eyJzdWIiOiJ0ZXN0IiwibmFtZV91c2VyIjoiVXN1YXJpbyBUZXN0IiwiZXhwIjo5OTk5OTk5OTk5fQ" +
        ".test_sig"
    SessionManager.saveToken(context, fakeJwt)
    SessionManager.saveUsuario(context, username, "Usuario Test")
    Log.i("LOGIN", "🧪 Sesión de prueba iniciada (admin_test)")
    return Result.success(Unit)
}
```

> Este bloque permite ingresar sin servidor durante las pruebas. En producción debe eliminarse para que toda autenticación pase por el servidor real.

---

## Paso 5 — Compilar el APK de producción (release)

### 5.1 Crear un keystore de firma (solo la primera vez)

El APK de producción debe estar firmado. En Android Studio:

```
Build → Generate Signed Bundle / APK → APK → Next
→ Create new... 
→ Completar: ruta del keystore, contraseña, alias, nombre, país
→ Next → Release → Finish
```

Guardar el archivo `.jks` y las contraseñas en un lugar seguro. Se necesitarán para cada actualización futura.

### 5.2 Compilar desde línea de comandos (alternativa)

Si se configuró el keystore en `build.gradle.kts`, compilar con:

```bash
./gradlew assembleRelease
```

El APK resultante queda en:
```
app/build/outputs/apk/release/app-release.apk
```

---

## Paso 6 — Instalar el APK en la tablet

### 6.1 Verificar conexión USB

Conectar la tablet con cable USB. Activar **Depuración USB** en la tablet:
```
Configuración → Acerca del teléfono → tocar "Número de compilación" 7 veces
→ Opciones de desarrollador → Depuración USB → Activar
```

Verificar que el sistema reconoce la tablet:
```bash
adb devices
```

Debe aparecer el ID de la tablet. Si aparece "unauthorized", aceptar el diálogo en la pantalla de la tablet.

### 6.2 Instalar el APK

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

### 6.3 Lanzar la app

```bash
adb shell am start -n "com.example.encuestassiau/.MainActivity"
```

---

## Paso 7 — Configurar la tablet como kiosco (Device Owner)

El modo kiosco completo (que impide que el usuario salga de la app) requiere configurar la tablet como **Device Owner** antes de instalar cualquier aplicación de usuario.

> **Importante**: Esta configuración solo es posible en una tablet con un reset de fábrica reciente (sin cuentas de Google configuradas). Si la tablet ya tiene cuentas, primero hacer reset de fábrica.

### 7.1 Resetear la tablet a fábrica (si es necesario)

```
Configuración → Administración general → Restablecer → Restablecer datos de fábrica
```

### 7.2 Configurar Device Owner via ADB

Con la tablet recién configurada (solo con WiFi conectado, sin cuenta de Google), conectar por USB y ejecutar:

```bash
adb shell dpm set-device-owner com.example.encuestassiau/.AdminReceiver
```

> **Nota**: Si el proyecto no tiene un `AdminReceiver` registrado, Sistemas deberá coordinarlo con el desarrollador antes del despliegue final. Alternativamente, se puede usar el modo de fijación de pantalla manual de Android (menos seguro):
> ```
> Configuración → Seguridad → Fijación de pantalla → Activar
> ```
> Luego abrir la app, ir a Recientes y tocar el ícono de candado.

### 7.3 Verificar que el modo kiosco funciona

Tras instalar el APK release con Device Owner activo, la app debe:
- Arrancar automáticamente al encender la tablet
- Ocultar la barra de navegación y la barra de estado
- No permitir salir a otras aplicaciones

---

## Paso 8 — Verificar el flujo completo

Una vez instalada y configurada, realizar las siguientes pruebas antes de dejar la tablet en producción:

1. Encender la tablet → la app debe arrancar sola en la pantalla de login
2. Ingresar con las credenciales reales de un operador del hospital → debe mostrar la pantalla principal
3. Seleccionar un tipo de encuesta (ambulatoria o internación) → debe mostrar la lista de servicios correspondientes
4. Completar una encuesta de prueba hasta la pantalla de "Gracias"
5. Verificar que la respuesta quedó guardada: si hay red, debe sincronizarse automáticamente al servidor
6. Desconectar el WiFi y completar otra encuesta → debe guardarse localmente
7. Reconectar el WiFi → la respuesta pendiente debe sincronizarse sola

---

## Paso 9 (Futuro) — Migrar a HTTPS

Cuando el servidor del hospital tenga un certificado SSL válido:

1. Actualizar `local.properties` cambiando `http://` por `https://` en ambas URLs
2. Eliminar el bloque `<domain-config cleartextTrafficPermitted="true">` correspondiente en `network_security_config.xml`
3. Recompilar y redistribuir el APK

---

## Referencia rápida de archivos a modificar

| Archivo | Qué cambiar |
|---|---|
| `local.properties` | IPs y puertos reales del servidor |
| `app/src/main/res/xml/network_security_config.xml` | Agregar IP del servidor si no está |
| `app/src/main/java/com/example/encuestassiau/data/Repository.kt` | Eliminar bloque de credenciales de prueba (líneas ~48–59) |
| `app/src/main/java/com/example/encuestassiau/network/SyncApi.kt` | Ajustar si el backend cambia el endpoint |
| `app/src/main/java/com/example/encuestassiau/data/Respuesta.kt` | Ajustar si el backend cambia el contrato del JSON |

---

## Contacto

Para dudas sobre el código fuente o la arquitectura de la app, contactar al equipo de desarrollo que entregó este proyecto.

El repositorio completo con el historial de cambios está en:
`https://github.com/Ars-Pingendi/EncuestasSIAU1`

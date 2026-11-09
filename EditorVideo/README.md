# Editor de Video (Android)

Editor de video básico, 100 % local (no sube nada a internet). Kotlin + Jetpack Compose + Media3 Transformer + ML Kit.

## Funciones
| Herramienta | Qué hace |
|---|---|
| Importar | Varios videos desde la galería; se unen en una línea de tiempo |
| Recortar | Inicio/fin con deslizador o en la posición del reproductor |
| Clip | Dividir en el cursor, duplicar, reordenar, eliminar |
| Velocidad | 0.25x a 4x (audio sincronizado) |
| Filtros | B/N, sepia, vívido, cálido, frío, vintage, negativo |
| Ajustes | Brillo, contraste, saturación |
| Girar | 90° izquierda/derecha |
| Transiciones | Fundido a negro/blanco, deslizar lateral/vertical, zoom; duración ajustable |
| Audio | Volumen por clip, silenciar, quitar todo el audio, extraer audio (M4A) |
| Música | Música de fondo en bucle, volumen, mezclar o reemplazar el audio original |
| Texto | Título/subtítulo con posición, tamaño, color y fondo |
| Quitar fondo | Detección de persona con IA (ML Kit) o pantalla verde; fondo de color, desenfocado o imagen |
| Formato | Original, 16:9, 9:16, 1:1, 4:5; barras o recorte para rellenar |
| Exportar | MP4 H.264/AAC a Galería › Películas/EditorVideo |

Requisitos: Android 8.0 (API 26) o superior, dispositivo ARM.

## Compilar
```bash
./gradlew assembleRelease
```
La firma de release se lee de `keystore.properties` (no versionado):
```properties
storeFile=editorvideo-release.jks
storePassword=...
keyAlias=editorvideo
keyPassword=...
```
Sin ese archivo, el APK de release se firma con la clave de depuración.

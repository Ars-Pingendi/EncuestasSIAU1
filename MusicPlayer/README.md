# Mi Reproductor

Reproductor de música personal para Android (minSdk 26, Android 8.0+). Kotlin + Jetpack Compose + Media3.

## Qué incluye

- **Biblioteca automática**: lee el índice de audio de Android (memoria interna y tarjeta SD) y se actualiza solo cuando agregas música. Opción «Buscar música de nuevo» para forzar el escaneo.
- **Clasificación**: Canciones (con orden por título, artista, álbum, recientes, duración), Álbumes, Artistas, Géneros, Carpetas, Listas y Favoritos. Listas automáticas: agregadas recientemente, más reproducidas, reproducidas recientemente.
- **Ecualizador**: bandas reales del dispositivo con curva en vivo, 13 preajustes, preajustes propios guardables, refuerzo de graves, sonido envolvente y amplificación de volumen. Se conserva entre sesiones.
- **Listas de reproducción y favoritos** (canciones y álbumes), guardados en una base de datos local (Room).
- Reproducción en segundo plano con notificación, pantalla de bloqueo y botones de auriculares/Bluetooth; cola editable, aleatorio, repetir y temporizador de apagado.
- Búsqueda por canción, álbum o artista (sin importar tildes).

## Compilar

El APK se compila con GitHub Actions (`.github/workflows/music-player-apk.yml`) y queda como artefacto `MiReproductor-apk`.
Localmente: `./gradlew :app:assembleRelease` (requiere JDK 17 y Android SDK 34).
El APK sale firmado con `keystore/reproductor.jks`, por lo que las futuras versiones se instalan encima de la anterior sin perder listas ni favoritos.

## Instalar

1. Copia `MiReproductor.apk` al teléfono (o descárgalo desde GitHub).
2. Ábrelo y permite «Instalar apps desconocidas» para el explorador/navegador que uses.
3. Al abrir la app, concede el permiso de música y de notificaciones.

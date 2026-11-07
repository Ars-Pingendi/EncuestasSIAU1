# Pipo Music Player

Reproductor de música personal para Android (minSdk 26, Android 8.0+). Kotlin + Jetpack Compose + Media3.

## Qué incluye

- **Biblioteca automática**: lee el índice de audio de Android (memoria interna y tarjeta SD) y se actualiza solo cuando agregas música. Opción «Buscar música de nuevo» para forzar el escaneo.
- **Clasificación**: Canciones (con orden por título, artista, álbum, recientes, duración), Álbumes, Artistas, Géneros, Carpetas, Listas y Favoritos. Listas automáticas: agregadas recientemente, más reproducidas, reproducidas recientemente.
- **Ecualizador**: propio de 10 bandas (31 Hz – 16 kHz, ±12 dB, con reducción automática de ganancia y limitador suave) o el integrado de Android, con curva en vivo, 13 preajustes y preajustes propios. Refuerzo de graves, sonido envolvente y amplificación de volumen. **Cada salida de audio (altavoz, cable, Bluetooth) recuerda su propio ajuste** y se cambia sola.
- **Listas de reproducción y favoritos** (canciones y álbumes), guardados en una base de datos local (Room). Las canciones de una lista y la cola se **reordenan arrastrando**.
- **Retoma donde lo dejaste**: la cola, la canción, la posición, el aleatorio y la repetición se conservan al cerrar la app.
- Reproducción en segundo plano con notificación, pantalla de bloqueo y botones de auriculares/Bluetooth; cola editable, aleatorio, repetir y temporizador de apagado.
- Búsqueda por canción, álbum o artista (sin importar tildes).
- **YouTube sin anuncios** (pestaña YouTube): búsqueda de canciones (YouTube Music) o videos; reproduce solo el audio, en segundo plano, con el ecualizador, y las canciones se pueden guardar en listas y favoritos junto a las locales. Usa [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) y no inicia sesión con ninguna cuenta. Incumple los términos de uso de YouTube y puede dejar de funcionar cuando YouTube cambie algo: la solución suele ser actualizar la librería.
- **Descargas de YouTube** para escuchar sin internet: se guardan dentro de la app, siguen en listas y favoritos, y aparecen en la lista automática «Descargadas de YouTube». Respetar los derechos de autor de lo que se descarga es responsabilidad de quien usa la app.

## Compilar

El APK se compila con GitHub Actions (`.github/workflows/music-player-apk.yml`) y queda como artefacto `PipoMusicPlayer-apk`.
Localmente: `./gradlew :app:assembleRelease` (requiere JDK 17 y Android SDK 34).
El APK sale firmado con `keystore/reproductor.jks`, por lo que las futuras versiones se instalan encima de la anterior sin perder listas ni favoritos.

## Instalar

1. Copia `PipoMusicPlayer.apk` al teléfono (o descárgalo desde GitHub).
2. Ábrelo y permite «Instalar apps desconocidas» para el explorador/navegador que uses.
3. Al abrir la app, concede el permiso de música y de notificaciones.

## Licencia

Este proyecto usa NewPipeExtractor, publicado bajo GPL-3.0; por eso Pipo Music Player se distribuye también bajo **GPL-3.0** (ver `LICENSE`).

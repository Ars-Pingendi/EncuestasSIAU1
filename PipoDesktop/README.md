# Pipo Music Player para Windows 10 y 11

Versión de escritorio de Pipo Music Player, con las mismas funciones que la app de Android.

## Qué incluye

- **Biblioteca automática**: busca música en la carpeta *Música* de Windows y en las carpetas que agregues (también discos externos o USB). Se actualiza sola al copiar o borrar archivos. Formatos: MP3, M4A/AAC, FLAC, OGG, Opus, WAV y WebM.
- **Clasificación**: Canciones (orden por título, artista, álbum, recientes o duración), Álbumes, Artistas, Géneros y Carpetas; búsqueda sin importar tildes.
- **Ecualizador de 10 bandas** (31 Hz – 16 kHz, ±12 dB) con curva en vivo, los mismos 13 preajustes de Android, preajustes propios, refuerzo de graves, sonido envolvente y amplificación con limitador. **Cada salida de audio (altavoces, audífonos, Bluetooth) recuerda su propio ajuste** y se cambia sola.
- **Listas de reproducción y favoritos** (canciones y álbumes), reordenables arrastrando. Listas automáticas: agregadas recientemente, más reproducidas, reproducidas recientemente y descargadas de YouTube.
- **Cola editable** (arrastrar para reordenar, guardar como lista), aleatorio, repetir y **temporizador de apagado** con desvanecimiento.
- **Retoma donde lo dejaste**: cola, canción y posición se conservan al cerrar.
- **Integración con Windows**: teclas multimedia, panel multimedia del sistema, botones en la miniatura de la barra de tareas, tema claro u oscuro según Windows y atajos de teclado.
- **YouTube sin anuncios**: búsqueda de canciones (YouTube Music) o videos, reproducción solo del audio con el ecualizador, listas, favoritos y **descargas** para escuchar sin internet. Usa [yt-dlp](https://github.com/yt-dlp/yt-dlp) (incluido y actualizable desde *Ajustes*). Incumple los términos de uso de YouTube y puede dejar de funcionar si YouTube cambia algo.

## Instalar

1. Descarga `PipoMusicPlayer-Setup-1.0.0.exe` (instalador) o `PipoMusicPlayer-Portable-1.0.0.exe` (no requiere instalación) desde los artefactos **PipoMusicPlayer-Instalador** o **PipoMusicPlayer-Portable** del flujo *Pipo Music Player - Windows* en GitHub Actions.
2. Ábrelo. Como la app no está firmada digitalmente, Windows SmartScreen puede mostrar «Windows protegió su PC»: elige **Más información → Ejecutar de todas formas**.
3. Pipo encuentra sola la música de tu carpeta *Música*. Si la tienes en otra parte: *Ajustes → Agregar carpeta*.

Tus listas, favoritos y ajustes se guardan en `%APPDATA%\Pipo Music Player`.

## Compilar

Requiere Node.js 22.

```bash
npm ci
npm run build           # verificación de tipos + interfaz + proceso principal
npm run dist:win        # instalador NSIS y versión portable en release/ (en Windows)
```

Para YouTube, coloca `yt-dlp.exe` en `resources/bin/` antes de empaquetar (el flujo de GitHub Actions lo descarga solo).
`npm run dev:web` abre la interfaz en el navegador con datos simulados.

## Estructura

- `electron/`: proceso principal — biblioteca (`library.ts`), YouTube (`youtube.ts`), protocolo `pipo://` con soporte de rangos (`protocol.ts`), almacenamiento (`store.ts`).
- `src/`: interfaz en React — motor de audio Web Audio (`audio/engine.ts`), estado (`state/`), vistas y componentes.
- `scripts/smoke.mjs`: prueba automática del ejecutable de Windows con capturas (`capturas/`).

## Licencia

GPL-3.0 (ver `LICENSE`).

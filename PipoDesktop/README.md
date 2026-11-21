# Pipo Music Player para Windows 10 y 11

Versión de escritorio de Pipo Music Player, con las mismas funciones que la app de Android.

## Qué incluye

- **Inicio al estilo de Spotify**: saludo, accesos rápidos, *Escuchado recientemente*, **mixes diarios** (tus artistas más escuchados con otros parecidos por género, listas y colaboraciones), *Canciones para ti* y *Álbumes que podrían gustarte* (lo que aún no has escuchado de tus artistas y géneros), *Tus artistas*, *Para volver a escuchar*, *Agregadas recientemente* y **canciones parecidas de YouTube** (radio de YouTube Music a partir de lo último que escuchaste y de tu artista favorito). Todo se calcula en el equipo con tu historial; cualquier mix o lista se puede guardar como lista propia.
- **Biblioteca automática**: busca música en la carpeta *Música* de Windows y en las carpetas que agregues (también discos externos o USB). Se actualiza sola al copiar o borrar archivos. Formatos: MP3, M4A/AAC, FLAC, OGG, Opus, WAV y WebM.
- **Clasificación**: Canciones (orden por título, artista, álbum, recientes o duración), Álbumes, Artistas, Géneros y Carpetas; búsqueda sin importar tildes.
- **Ecualizador de 10 bandas** (31 Hz – 16 kHz, ±12 dB) con curva en vivo, los mismos 13 preajustes de Android, preajustes propios, refuerzo de graves, sonido envolvente y amplificación con limitador. **Cada salida de audio (altavoces, audífonos, Bluetooth) recuerda su propio ajuste** y se cambia sola.
- **Listas de reproducción y favoritos** (canciones y álbumes), reordenables arrastrando. Listas automáticas: agregadas recientemente, más reproducidas, reproducidas recientemente y descargadas de YouTube.
- **Compartir**: clic derecho → «Compartir» abre el archivo con nombre legible («Artista - Título») en el Explorador para enviarlo por WhatsApp, Uso compartido en proximidad, correo o Bluetooth; también se puede **arrastrar** una canción desde Pipo a WhatsApp o a cualquier carpeta, guardar una copia o guardar varias de una vez en una carpeta o memoria USB, y copiar el enlace de YouTube.
- **Pipo en la TV (LG webOS)**: *Ajustes › Pipo en la TV* comparte tu biblioteca, listas y favoritos con la app Pipo del televisor por la red de la casa, con un código de emparejamiento (ver `PipoTV/README.md`). La TV también **busca y ve videos de YouTube** a través del PC, y desde Pipo puedes mandarle música o videos: clic derecho › *Reproducir en la TV*, *Agregar a la cola de la TV* o *Ver video en la TV*, o el botón **En la TV** de la pestaña YouTube. *Ajustes › Ver registro de YouTube y la TV* muestra qué pasó si un video no carga.
- **Películas y series para la TV**: *Ajustes › Películas y series* indica las carpetas de video; Pipo reconoce películas y series (por el nombre o la carpeta), y la app de la TV las reproduce directamente o convertidas al vuelo con ffmpeg cuando el televisor no soporta el códec (por ejemplo audio DTS), con pistas de audio, subtítulos y carátulas.
- **Cola editable** (arrastrar para reordenar, guardar como lista), aleatorio, repetir y **temporizador de apagado** con desvanecimiento.
- **Retoma donde lo dejaste**: cola, canción y posición se conservan al cerrar.
- **Integración con Windows**: teclas multimedia, panel multimedia del sistema, botones en la miniatura de la barra de tareas, tema claro u oscuro según Windows y atajos de teclado.
- **YouTube sin anuncios**: búsqueda de canciones (YouTube Music) o videos, reproducción del audio con el ecualizador, listas, favoritos y **descargas** para escuchar sin internet. En *Videos* los resultados salen en una cuadrícula con miniaturas: clic en la imagen (o clic derecho › *Ver video*) y el video se **ve dentro de la app** hasta en 1080p, con selector de calidad y pantalla completa; si la imagen y el audio por separado fallan, se usa el video con audio incluido. El botón de descarga de cada video (o *Descargar* en el visor) lo **guarda en MP4 hasta 1080p** en *Videos › Pipo Music Player* para verlo sin internet: la sección **Videos descargados** los reúne (ver, mostrar en la carpeta, eliminar) y la TV también los muestra en *Películas*. Usa [yt-dlp](https://github.com/yt-dlp/yt-dlp) (incluido y actualizable desde *Ajustes*). Incumple los términos de uso de YouTube y puede dejar de funcionar si YouTube cambia algo.

## Instalar

1. Descarga `PipoMusicPlayer-Setup-1.2.0.exe` (instalador) o `PipoMusicPlayer-Portable-1.2.0.exe` (no requiere instalación) desde los artefactos **PipoMusicPlayer-Instalador** o **PipoMusicPlayer-Portable** del flujo *Pipo Music Player - Windows* en GitHub Actions.
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

- `electron/`: proceso principal — biblioteca (`library.ts`), YouTube y descargas de audio y video (`youtube.ts`), videos de YouTube por partes para el visor y la TV (`ytVideo.ts`), órdenes para la TV (`tvRemote.ts`), protocolo `pipo://` con soporte de rangos (`protocol.ts`), almacenamiento (`store.ts`).
- `src/`: interfaz en React — motor de audio Web Audio (`audio/engine.ts`), estado (`state/`), vistas y componentes.
- `scripts/smoke.mjs`: prueba automática del ejecutable de Windows con capturas (`capturas/`).

## Componentes de terceros

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense): búsqueda y descarga de YouTube.
- [FFmpeg](https://ffmpeg.org) (compilación «essentials» de [Gyan.dev](https://www.gyan.dev/ffmpeg/builds/), GPL v3): lectura y conversión de videos. El código fuente de FFmpeg está en el sitio oficial.

## Licencia

GPL-3.0 (ver `LICENSE`).

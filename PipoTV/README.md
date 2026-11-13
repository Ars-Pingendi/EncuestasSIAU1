# Pipo Music Player para TV LG (webOS)

App para televisores LG con webOS 4.0 o posterior (2018 en adelante) que reproduce en la TV:

- **Música** de **Pipo para Windows** o de **Pipo para Android**: canciones, álbumes, artistas, géneros, listas, favoritos y descargas de YouTube, con el mismo **ecualizador de 10 bandas** (13 preajustes, graves, sonido envolvente y amplificación).
- **Películas y series** guardadas en tu PC (solo con **Pipo para Windows 1.2.0** o posterior): carátulas, temporadas y episodios, **continuar donde lo dejaste**, pistas de audio, subtítulos, y siguiente episodio automático.

## Cómo funciona

Una app web de webOS no puede leer de forma fiable las memorias USB del televisor, así que la música llega desde el PC o el teléfono por la red de la casa:

1. En el PC o en el teléfono Android: **Pipo › Ajustes › Pipo en la TV** › activa **«Compartir mi música con la TV»**. Aparecen la dirección y un código de 4 cifras. En Windows, si pregunta, permite el acceso en **redes privadas**. En Android aparece una notificación mientras comparte; puedes bloquear la pantalla.
2. En la TV: abre Pipo, escribe la dirección y el código y pulsa **Conectar**. La TV queda emparejada; la próxima vez entra directo.

El PC (con Pipo abierto) o el teléfono (con la notificación de Pipo visible) deben seguir encendidos mientras escuchas o ves algo. Las películas y series solo vienen del PC con Windows. La TV y el equipo que comparte deben estar en la misma red (Wi-Fi o cable). La música y el video se detienen si sales de la app (webOS no permite reproducir en segundo plano). Convertir un video recodificándolo exige un PC razonablemente moderno; con H.264/AAC o MKV compatibles el PC casi no trabaja.

## Películas y series

1. En Pipo para Windows: **Ajustes › Películas y series (para la TV)** › **Agregar carpeta de video** (por ejemplo `D:\Películas` y `D:\Series`). La primera vez Pipo analiza cada archivo; después solo lo nuevo.
2. Mantén activado **«Compartir mi música con la TV»**. En la TV aparece el selector **Música | Video** arriba del menú.

**Cómo reconoce los nombres:** `Película (2021).mkv`, `Serie S01E02.mkv`, `Serie - 1x02 - Título.mkv`, o carpetas `Serie/Temporada 2/03 - Título.mkv`. Las etiquetas de descarga (`1080p`, `BluRay`, `x264`…) se ignoran. Si junto al video hay `poster.jpg`, `folder.jpg` o `Nombre.jpg` se usa como carátula; si no, Pipo toma un fotograma.

**Cómo se reproduce.** La TV le dice al PC qué formatos soporta y el PC elige lo más liviano:

| Situación | Qué hace el PC | Etiqueta en pantalla |
|---|---|---|
| Video, audio y contenedor compatibles (lo más común: MP4/MKV con H.264 o HEVC y AAC/AC3) | Envía el archivo tal cual; se puede adelantar al instante | Reproducción directa |
| Audio que la TV no sabe (DTS, TrueHD…), otro idioma elegido, contenedor raro | Copia la imagen y convierte el audio a AAC al vuelo (casi no usa procesador) | Audio convertido en el PC |
| Video que la TV no decodifica (AVI/Xvid, H.264 de 10 bits, VP9/AV1 en TV antiguas) | Recodifica a H.264 al vuelo (usa el procesador del PC) | Convertido en el PC |

Si la TV no logra reproducir algo, **reintenta sola** con la siguiente forma (directo → audio convertido → otro formato → recodificado). Si ves la imagen negra o falla el sonido, abre **Formato** en el reproductor y elige «Convertir todo».

**Reproductor:** ◀ ▶ adelantan o retroceden 10 s; ▼ muestra los botones (**Audio**, **Subtítulos**, **Formato**, **Siguiente**). Los subtítulos de texto (SRT, ASS, los incluidos en MKV/MP4 y los archivos sueltos `Película.es.srt`) se muestran con tu idioma recordado. Los subtítulos de imagen (PGS, VobSub) no se pueden mostrar. El avance se guarda por video y aparece en **Continuar viendo**.

## Control remoto

| Tecla | Acción |
|---|---|
| Flechas y OK | Moverse y elegir (también funciona el puntero del Magic Remote) |
| Atrás | Volver; en el inicio, salir |
| ▶ ⏸ | Reproducir o pausar |
| ⏪ ⏩ | Retroceder o adelantar 10 s (también ◀ ▶ sobre la barra de progreso) |
| Canal + / Canal − | Siguiente o anterior canción |
| ▲ ▼ sobre una banda del ecualizador | Subir o bajar 1 dB |
| ◀ ▶ sobre graves, envolvente o amplificación | Ajustar de 5 en 5 % |
| En un video: OK | Pausar o reanudar (y mostrar los controles) |
| En un video: ◀ ▶ / ⏪ ⏩ | ±10 s / ±30 s |
| En un video: Canal + / Canal − | Siguiente episodio / volver al inicio o episodio anterior |

## Instalar en la TV

El instalador es `com.personal.pipomusicplayer_1.2.0_all.ipk`.

### Opción A — Modo desarrollador (sin modificar la TV)

1. Crea una cuenta gratuita en [webostv.developer.lge.com](https://webostv.developer.lge.com).
2. En la TV abre **LG Content Store**, instala **Developer Mode**, inicia sesión con esa cuenta, activa **Dev Mode Status** (la TV se reinicia) y luego **Key Server**. Anota la IP y la frase de acceso (*passphrase*) que muestra.
3. En el PC instala **webOS Dev Manager** ([github.com/webosbrew/dev-manager-desktop](https://github.com/webosbrew/dev-manager-desktop/releases)), agrega la TV con su IP y la frase de acceso, ve a **Apps › Install** y elige el `.ipk`.

La sesión del Modo desarrollador caduca (el contador está en la app Developer Mode). Renuévala con **Extend Session** o desde webOS Dev Manager; si caduca, la TV borra las apps instaladas así y hay que volver a instalar Pipo.

### Opción B — TV con Homebrew Channel (root)

Si la TV ya tiene **Homebrew Channel**, instala el `.ipk` con webOS Dev Manager (conexión SSH con root) o con `ares-install`. Así no hay sesión que caduque.

### Con la línea de comandos (avanzado)

```bash
npx @webos-tools/cli ares-setup-device          # registrar la TV (IP, puerto 9922, frase de acceso)
npx @webos-tools/cli ares-install --device tv com.personal.pipomusicplayer_1.2.0_all.ipk
npx @webos-tools/cli ares-launch --device tv com.personal.pipomusicplayer
```

## Compilar

```bash
npm ci
npm run package     # verifica tipos, compila para Chromium 53 (webOS 4) y genera out/*.ipk
```

## Licencia

GPL-3.0.

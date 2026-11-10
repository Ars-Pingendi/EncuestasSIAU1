# Pipo Music Player para iPhone

App nativa (SwiftUI + AVAudioEngine) para iOS 16 o posterior, con las funciones de la versión de Android salvo YouTube.

## Qué incluye

- **Biblioteca**: canciones guardadas en la carpeta de Pipo (MP3, M4A/AAC, ALAC, FLAC, WAV, AIFF) y, si das permiso, las de la app **Música** que no tienen DRM (las de Apple Music no se pueden reproducir en otras apps).
- **Clasificación**: canciones (orden por título, artista, álbum, recientes o duración), álbumes, artistas, géneros y carpetas; búsqueda sin importar tildes.
- **Ecualizador de 10 bandas** (31 Hz – 16 kHz, ±12 dB) con curva en vivo, los 13 preajustes de Android, preajustes propios, refuerzo de graves, sonido envolvente, amplificación con limitador y **un ajuste por cada salida** (altavoz, audífonos con cable, cada dispositivo Bluetooth o AirPlay) que se cambia solo.
- **Listas y favoritos** (canciones y álbumes), reordenables; listas automáticas: agregadas recientemente, más reproducidas y reproducidas recientemente.
- **Cola** editable (mover, quitar, guardar como lista), aleatorio, repetir y **temporizador de apagado** con desvanecimiento.
- **Segundo plano**, pantalla bloqueada, Centro de control, AirPods y CarPlay (controles de reproducción); pausa al desconectar los audífonos.
- **Compartir** una canción, un álbum o una lista por WhatsApp, AirDrop, Mensajes, Mail o Archivos, con nombre legible («Artista - Título.m4a»).
- Retoma la cola y la posición al volver a abrir la app.

## Cómo agregar música

- **App Archivos** › En mi iPhone › **Pipo**: copia o arrastra canciones o carpetas.
- **WhatsApp, Mail, AirDrop**: toca el archivo › Compartir › **Pipo**.
- **Desde Windows**: conecta el iPhone, abre **Dispositivos Apple** (o iTunes) › Archivos › **Pipo** y arrastra la música.
- **Dentro de Pipo**: Ajustes › «Importar canciones o carpetas» (iCloud Drive, Google Drive, memorias USB…).

## Instalar en el iPhone

Apple no permite instalar archivos sueltos como en Android. Hay tres caminos:

| Opción | Costo | Renovación | Qué necesitas |
|---|---|---|---|
| **Sideloadly** o **AltStore** (recomendado para uso personal) | Gratis | Cada 7 días (AltStore la renueva sola por Wi-Fi) | PC con Windows o Mac, cable USB, tu Apple ID |
| **TestFlight** | US$99/año (Apple Developer) | Cada 90 días | Cuenta de desarrollador; subir el IPA firmado |
| **App Store** | US$99/año | — | Cuenta de desarrollador y revisión de Apple |

### Con Sideloadly (Windows)

1. Instala **iTunes** (versión del sitio de Apple, no la de Microsoft Store) y **Sideloadly** (sideloadly.io).
2. Descarga `PipoMusicPlayer-iPhone-1.0.0.ipa` desde la Release de GitHub.
3. Conecta el iPhone por cable, ábrelo y toca **Confiar**.
4. En Sideloadly arrastra el `.ipa`, escribe tu Apple ID y pulsa **Start**.
5. En el iPhone: Ajustes › General › VPN y gestión de dispositivos › tu Apple ID › **Confiar**.
6. En iOS 16 o posterior activa **Modo de desarrollador** (Ajustes › Privacidad y seguridad) y reinicia.

Con un Apple ID gratuito la app deja de abrir a los 7 días: repite el paso 4 (no se pierden tus listas ni tu música).

## Compilar

Requiere macOS con Xcode 15 o posterior y [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
cd PipoIOS
xcodegen generate
open Pipo.xcodeproj
```

El flujo `.github/workflows/pipo-ios.yml` compila en macOS, toma capturas en el simulador (`capturas/`) y genera el IPA sin firmar.

## YouTube

No está incluido: las reglas del App Store lo prohíben (guía 5.2.3) y en iPhone no puede ejecutarse yt-dlp. Para una versión de uso personal instalada con Sideloadly podría añadirse más adelante con una librería en Swift, con el mismo riesgo de dejar de funcionar cuando YouTube cambie.

## Licencia

GPL-3.0.

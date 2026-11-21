# Pipo Music Player para Android TV / Google TV

App para televisores y reproductores con **Android TV** o **Google TV** (Sony, TCL, Hisense, Philips, Xiaomi Mi TV y Mi Box, Chromecast con Google TV, Nvidia Shield, etc.; Android 5.0 o posterior). También abre en Fire TV.

Es la misma app de la TV LG (carpeta `PipoTV/`), empaquetada como app nativa de Android TV:

- **Música** de **Pipo para Windows** o de **Pipo para Android**: canciones, álbumes, artistas, géneros, listas, favoritos, descargas de YouTube y el **ecualizador de 10 bandas**.
- **«Reproducir en la TV» / «Ver en la TV»** desde el teléfono o el PC, **videos de YouTube** hasta 1080p sin anuncios, **películas y series** del PC y **videos del teléfono**.
- Aparece en el menú de apps de la TV con su banner; se maneja con el control remoto: flechas, OK, **Atrás**, **Play/Pausa**, adelantar/retroceder y **canal +/−** (siguiente/anterior).
- Mientras suena música o un video, la pantalla no se apaga ni entra el protector de pantalla. Si sales con **Inicio** o apagas la TV, se pausa.

## Instalar

1. Copia `dist/PipoMusicPlayer-AndroidTV.apk` a una memoria USB, o súbelo a Google Drive.
2. En la TV, instala un administrador de archivos (por ejemplo **File Commander** o **X-plore**) desde Google Play, o usa **Send Files to TV** para mandarlo desde el teléfono.
3. Activa **Ajustes › Privacidad (o Seguridad) › Fuentes desconocidas** para esa app (en Google TV: **Ajustes › Sistema › Acerca de › Compilación del SO**, pulsa OK 7 veces para activar las opciones de desarrollador y luego permite apps desconocidas).
4. Abre el APK e instálalo. Pipo aparece en **Apps**.

## Conectar

1. En el PC o el teléfono Android: **Pipo › Ajustes › Pipo en la TV** › activa **«Compartir mi música con la TV»**. Aparecen la dirección y un código de 4 cifras.
2. En la TV: abre Pipo. Pulsa **OK** en *Dirección* para abrir el teclado y escríbela; con la flecha **→** pasa a *Código*, escríbelo, **→** hasta **Conectar** y **OK**.

La TV y el equipo que comparte deben estar en la misma red. La próxima vez entra directo.

## Compilar

```
cd PipoTV && npm ci && npm run build      # interfaz (la misma de webOS)
cd ../PipoAndroidTV && ./gradlew assembleRelease
```

El APK queda en `app/build/outputs/apk/release/`. Se firma con la misma clave que Pipo para Android (`MusicPlayer/keystore`). El flujo de GitHub Actions `pipo-androidtv.yml` lo compila y lo prueba en un emulador de Android TV (conectar con el control, recibir «Reproducir en la TV», Play/Pausa, pantalla encendida y salir); las capturas quedan en `capturas/`.

## Licencia

GPL-3.0-or-later.

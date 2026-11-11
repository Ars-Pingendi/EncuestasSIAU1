# Pipo Music Player para TV LG (webOS)

App para televisores LG con webOS 4.0 o posterior (2018 en adelante) que reproduce en la TV la música de **Pipo para Windows**: canciones, álbumes, artistas, géneros, listas, favoritos y descargas de YouTube, con el mismo **ecualizador de 10 bandas** (13 preajustes, graves, sonido envolvente y amplificación).

## Cómo funciona

Una app web de webOS no puede leer de forma fiable las memorias USB del televisor, así que la música llega desde el PC por la red de la casa:

1. En el PC: **Pipo › Ajustes › Pipo en la TV** › activa **«Compartir mi música con la TV»**. Aparecen la dirección del PC y un código de 4 cifras. Si Windows pregunta, permite el acceso en **redes privadas**.
2. En la TV: abre Pipo, escribe la dirección y el código y pulsa **Conectar**. La TV queda emparejada; la próxima vez entra directo.

El PC debe estar encendido y con Pipo abierto mientras escuchas. La TV y el PC deben estar en la misma red (Wi-Fi o cable). La música se detiene si sales de la app (webOS no permite reproducir en segundo plano).

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

## Instalar en la TV

El instalador es `com.personal.pipomusicplayer_1.0.0_all.ipk`.

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
npx @webos-tools/cli ares-install --device tv com.personal.pipomusicplayer_1.0.0_all.ipk
npx @webos-tools/cli ares-launch --device tv com.personal.pipomusicplayer
```

## Compilar

```bash
npm ci
npm run package     # verifica tipos, compila para Chromium 53 (webOS 4) y genera out/*.ipk
```

## Licencia

GPL-3.0.

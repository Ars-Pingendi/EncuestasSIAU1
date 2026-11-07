"""Recorre Pipo Music Player en un emulador y toma las capturas del manual.

Uso: python3 capture.py <apk> <carpeta_muestras> <carpeta_salida>

Navega con adb: lee la interfaz con `uiautomator dump` (textos y descripciones de
accesibilidad) y toca los elementos por su centro. Cada escena es independiente:
si una falla, se registra y se sigue con la siguiente.
"""
import glob
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

APK, SAMPLES, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PKG = "com.personal.reproductor"
W, H = 1080, 2400
os.makedirs(OUT, exist_ok=True)
errors = []


def run(args, timeout=120):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def shell(cmd, timeout=60):
    return run(["adb", "shell", cmd], timeout=timeout)


def key(code):
    shell(f"input keyevent {code}")
    time.sleep(1.2)


def shot(name):
    data = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True, timeout=60).stdout
    with open(os.path.join(OUT, f"{name}.png"), "wb") as f:
        f.write(data)
    print(f"  captura: {name} ({len(data)} bytes)", flush=True)


def nodes():
    for _ in range(5):
        r = run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], timeout=60)
        if "dumped" in (r.stdout + r.stderr).lower():
            xml = run(["adb", "shell", "cat", "/sdcard/ui.xml"]).stdout
            i = xml.find("<?xml")
            if i >= 0:
                try:
                    return list(ET.fromstring(xml[i:]).iter("node"))
                except ET.ParseError:
                    pass
        time.sleep(2)
    raise RuntimeError("no se pudo leer la interfaz (uiautomator)")


def box(n):
    x1, y1, x2, y2 = map(int, re.findall(r"-?\d+", n.get("bounds", "[0,0][0,0]")))
    return x1, y1, x2, y2


def center(n):
    x1, y1, x2, y2 = box(n)
    return (x1 + x2) // 2, (y1 + y2) // 2


def visible(n):
    x1, y1, x2, y2 = box(n)
    return x2 > x1 and y2 > y1 and x1 >= 0 and y1 >= 0 and x2 <= W and y2 <= H


def find(ns, text=None, desc=None, contains=False):
    out = []
    for n in ns:
        t = n.get("text") or ""
        d = n.get("content-desc") or ""
        if text is not None and ((text.lower() in t.lower()) if contains else t == text):
            out.append(n)
        elif desc is not None and ((desc.lower() in d.lower()) if contains else d == desc):
            out.append(n)
    return [n for n in out if visible(n)]


def tap_xy(x, y, wait=1.8):
    shell(f"input tap {x} {y}")
    time.sleep(wait)


def tap(text=None, desc=None, contains=False, pick=-1, wait=1.8):
    """Toca un elemento. pick=-1 (el último) elige la pantalla de encima, que se dibuja después."""
    found = find(nodes(), text, desc, contains)
    if not found:
        raise RuntimeError(f"no encontré {text or desc!r}")
    x, y = center(found[pick])
    tap_xy(x, y, wait)
    return x, y


def tap_row_menu(title):
    ns = nodes()
    titles = find(ns, text=title)
    if not titles:
        raise RuntimeError(f"no encontré la fila {title!r}")
    _, ty = center(titles[-1])
    menus = [m for m in find(ns, desc="Más opciones") if abs(center(m)[1] - ty) < 90]
    if not menus:
        raise RuntimeError(f"no encontré el menú de {title!r}")
    tap_xy(*center(menus[-1]))


def swipe(x1, y1, x2, y2, ms=400):
    shell(f"input swipe {x1} {y1} {x2} {y2} {ms}")
    time.sleep(1.5)


def tap_tab(name):
    for attempt in range(4):
        ns = nodes()
        hit = find(ns, text=name)
        if hit:
            tap_xy(*center(hit[0]), wait=2.2)
            return
        tabs = find(ns, text="Álbumes") or find(ns, text="Carpetas") or find(ns, text="Listas") or find(ns, text="Canciones")
        y = center(tabs[0])[1] if tabs else 215
        if attempt < 2:
            swipe(950, y, 150, y)  # desplaza la fila de pestañas a la izquierda
        else:
            swipe(150, y, 950, y)
    raise RuntimeError(f"no encontré la pestaña {name!r}")


def launch():
    shell(f"am start -W -n {PKG}/.MainActivity")
    time.sleep(4)


def scene(name, fn):
    print(f"== {name}", flush=True)
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        errors.append(f"{name}: {e}")
        print(f"  ERROR en {name}: {e}", flush=True)
        try:
            shot(f"zz-error-{name}")
        except Exception:  # noqa: BLE001
            pass


# ----------------------------------------------------------------------------- preparación

def setup():
    print(run(["adb", "install", "-r", APK], timeout=300).stdout, flush=True)
    shell("mkdir -p /sdcard/Music/Demo")
    for f in sorted(glob.glob(os.path.join(SAMPLES, "*.mp3"))):
        run(["adb", "push", f, "/sdcard/Music/Demo/"])
    shell("content call --uri content://media/external/file --method scan_volume --arg external_primary")
    shell("cmd uimode night yes")
    shell("settings put system screen_off_timeout 1800000")
    shell("svc power stayon true")
    shell("settings put global sysui_demo_allowed 1")
    demo = "am broadcast -a com.android.systemui.demo -e command"
    shell(f"{demo} enter")
    shell(f"{demo} clock -e hhmm 1200")
    shell(f"{demo} battery -e level 100 -e plugged false")
    shell(f"{demo} network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4")
    shell(f"{demo} notifications -e visible false")
    time.sleep(2)


# ----------------------------------------------------------------------------- escenas

def s_permiso():
    launch()
    shot("01-permiso")


def s_biblioteca():
    shell(f"pm grant {PKG} android.permission.READ_MEDIA_AUDIO")
    shell(f"pm grant {PKG} android.permission.POST_NOTIFICATIONS")
    shell(f"am force-stop {PKG}")
    launch()
    # Forzar la búsqueda de música recién copiada.
    tap(desc="Más opciones", pick=0)
    tap(text="Buscar música de nuevo", wait=12)
    shot("02-canciones")


def s_albumes():
    tap_tab("Álbumes")
    shot("03-albumes")
    tap(text="Orejas al viento", wait=2.5)
    shot("04-album")
    tap(desc="Añadir álbum a favoritos")
    tap(desc="Añadir álbum a una lista")
    tap(text="Nueva lista")
    tap(text="Nombre", wait=1.2)
    shell("input text 'Para%scorrer'")
    time.sleep(1)
    tap(text="Crear", wait=2)


def s_menu_cancion():
    tap_row_menu("Paseo de las seis")
    shot("05-menu-cancion")
    tap(text="Añadir a favoritos")


def s_reproducir():
    tap(text="Ladrido en Re mayor", wait=5)
    shot("06-mini-reproductor")
    key(127)  # pausa (botón multimedia) para poder leer la interfaz
    tap(text="Ladrido en Re mayor", wait=2.5)  # el título del mini reproductor (el último)
    key(126)  # reproducir
    time.sleep(4)
    shot("07-reproduciendo")
    key(127)


def s_cola():
    tap(desc="Cola de reproducción", wait=2.5)
    shot("08-cola")
    key(4)


def s_temporizador():
    tap(desc="Temporizador de apagado")
    shot("09-temporizador")
    tap(text="Cerrar")


def s_notificacion():
    key(126)
    time.sleep(2)
    shell("cmd statusbar expand-notifications")
    time.sleep(3)
    shot("10-notificacion")
    shell("cmd statusbar collapse")
    time.sleep(1.5)
    key(127)


def s_ecualizador():
    tap(desc="Ecualizador", wait=2.5)
    tap(text="Rock", wait=1.5)
    shot("11-ecualizador")
    swipe(540, 1950, 540, 750)
    shot("12-ecualizador-2")
    swipe(540, 1950, 540, 750)
    shot("13-ecualizador-3")
    key(4)  # al álbum
    key(4)  # a Inicio


def s_listas():
    tap_tab("Listas")
    shot("14-listas")
    tap(text="Para correr", wait=2.5)
    shot("15-lista")
    key(4)


def s_favoritos():
    tap_tab("Favoritos")
    shot("16-favoritos")


def s_artistas_generos():
    tap_tab("Artistas")
    shot("17-artistas")
    tap_tab("Géneros")
    shot("18-generos")


def s_busqueda():
    tap(desc="Buscar", pick=0, wait=2)
    shell("input text luna")
    time.sleep(2)
    key(4)  # oculta el teclado
    shot("19-busqueda")
    key(4)


def s_youtube():
    tap_tab("YouTube")
    shot("20-youtube")
    try:
        tap(text="Buscar en YouTube", wait=1.2)
    except RuntimeError:
        chips = find(nodes(), text="Canciones")
        x, y = center(chips[-1])
        tap_xy(540, y - 170, wait=1.2)
    shell("input text 'beethoven%ssymphony%s9'")
    time.sleep(1)
    key(66)  # Enter = buscar
    time.sleep(12)
    key(4)  # oculta el teclado si sigue abierto
    shot("21-youtube-resultados")
    ns = nodes()
    menus = find(ns, desc="Más opciones")
    if len(menus) < 2:
        raise RuntimeError("sin resultados de YouTube")
    row_menu = menus[1]
    _, ry = center(row_menu)
    tap_xy(*center(row_menu))
    shot("22-youtube-menu")
    tap(text="Descargar", wait=30)
    shot("23-youtube-descarga")
    tap_xy(420, ry, wait=15)  # reproducir el primer resultado
    shot("24-youtube-reproduciendo")
    key(127)


def s_ajustes():
    key(127)
    tap(desc="Más opciones", pick=0)
    tap(text="Ajustes", wait=2.5)
    shot("25-ajustes")
    swipe(540, 1900, 540, 700)
    shot("26-ajustes-2")


setup()
for name, fn in [
    ("permiso", s_permiso),
    ("biblioteca", s_biblioteca),
    ("albumes", s_albumes),
    ("menu_cancion", s_menu_cancion),
    ("reproducir", s_reproducir),
    ("cola", s_cola),
    ("temporizador", s_temporizador),
    ("notificacion", s_notificacion),
    ("ecualizador", s_ecualizador),
    ("listas", s_listas),
    ("favoritos", s_favoritos),
    ("artistas_generos", s_artistas_generos),
    ("busqueda", s_busqueda),
    ("youtube", s_youtube),
    ("ajustes", s_ajustes),
]:
    scene(name, fn)

log = run(["adb", "logcat", "-d", "-v", "brief"], timeout=120).stdout
interesting = [line for line in log.splitlines()
               if re.search(r"YouTube|PlaybackService|YouTubeDownloads|AudioEffects|AndroidRuntime|MainViewModel|ExoPlayerImplInternal", line)]
print("== LOGCAT (filtrado, últimas 80 líneas)")
print("\n".join(interesting[-80:]))
print("== ERRORES:", errors if errors else "ninguno")
print("== CAPTURAS:", sorted(os.listdir(OUT)))

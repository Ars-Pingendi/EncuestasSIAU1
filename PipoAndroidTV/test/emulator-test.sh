#!/usr/bin/env bash
# Prueba de la app en un emulador de Android TV (la corre GitHub Actions).
# El emulador ve el equipo anfitrión en 10.0.2.2, donde escucha fake-pipo.mjs.
# Uso: test/emulator-test.sh <apk> <carpeta de salida>
set -u
APK="$1"
OUT="$2"
mkdir -p "$OUT"
PASS=0
FAIL=0
REPORT="$OUT/informe.txt"
: > "$REPORT"
ok() { echo "OK    $*" | tee -a "$REPORT"; PASS=$((PASS + 1)); }
bad() { echo "FALLA $*" | tee -a "$REPORT"; FAIL=$((FAIL + 1)); }
shot() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null || true; }
key() { adb shell input keyevent "$1"; sleep "${2:-0.6}"; }
log_has() { curl -s http://127.0.0.1:37373/control/log | grep -q "$1"; }
# ¿La ventana de Pipo tiene la marca «mantener la pantalla encendida»?
keep_on() {
  adb shell dumpsys window windows | awk '/Window #/{f=($0 ~ /pipotv/)} f && /KEEP_SCREEN_ON/{found=1} END{exit !found}'
}
menu_visible() { adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q "Salir de Pipo"; }
top_app() { adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity|ResumedActivity" | head -1; }

adb wait-for-device
for s in window_animation_scale transition_animation_scale animator_duration_scale; do adb shell settings put global "$s" 0; done
adb shell wm size | tee -a "$REPORT"
adb shell wm density | tee -a "$REPORT"
adb shell dumpsys package com.google.android.webview 2>/dev/null | grep -m1 versionName | tee -a "$REPORT" || true

if adb install -r "$APK" | tee -a "$REPORT" | grep -q Success; then ok "se instala el APK"; else bad "no se pudo instalar el APK"; fi
if adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER 2>/dev/null | grep -q com.personal.pipotv; then
  ok "aparece en el menú de apps de Android TV (LEANBACK_LAUNCHER)"
else
  bad "no aparece como app de Android TV"
fi

adb logcat -c
adb shell am start -W -n com.personal.pipotv/.MainActivity | tee -a "$REPORT"
sleep 10
shot 1-conexion
if top_app | grep -q pipotv; then ok "la app abre a pantalla completa"; else bad "la app no quedó abierta: $(top_app)"; fi

# Teclado en pantalla: OK sobre «Dirección» lo abre y el formulario debe quedar a la vista.
console() { adb logcat -d -s PipoTV:* 2>/dev/null; }
key KEYCODE_DPAD_CENTER 3
shot 1b-teclado
if console | grep -q "pipo:teclado true"; then
  ok "OK abre el teclado de la TV y el formulario sube para quedar a la vista"
  adb shell input text 10.0.2.2
  sleep 1
  shot 1c-escribiendo
  key KEYCODE_BACK 2   # cierra el teclado (lo atiende el teclado, no la app)
  if console | grep -q "pipo:teclado false"; then ok "al cerrar el teclado vuelve la pantalla completa"; else bad "no volvió a la pantalla completa"; fi
  if top_app | grep -q pipotv; then ok "Atrás con el teclado abierto solo cierra el teclado"; else bad "Atrás con el teclado cerró la app"; fi
else
  bad "OK sobre el campo no abrió el teclado en pantalla"
fi

# El resto con «teclado físico» (sin teclado en pantalla) para escribir de forma predecible.
for imeid in $(adb shell ime list -s | tr -d '\r'); do adb shell ime disable "$imeid" > /dev/null 2>&1; done
adb shell input keyevent KEYCODE_MOVE_END
adb shell input keyevent $(printf 'KEYCODE_DEL %.0s' $(seq 1 24))
# Conectar solo con el control: escribir la dirección, → Código, escribir 1234, → Conectar, OK.
adb shell input text 10.0.2.2
sleep 0.5
key KEYCODE_DPAD_RIGHT 0.8
adb shell input text 1234
sleep 0.5
shot 2-datos
key KEYCODE_DPAD_RIGHT 0.8
key KEYCODE_DPAD_CENTER 1
sleep 8
shot 3-biblioteca
if log_has "POST /pipo/pair" && log_has "GET /pipo/library"; then ok "se empareja y carga la biblioteca con el control remoto"; else bad "no se emparejó: $(curl -s http://127.0.0.1:37373/control/log)"; fi
if log_has "GET /pipo/remote"; then ok "escucha las órdenes «Reproducir en la TV»"; else bad "no pide órdenes al PC"; fi

# Orden «Reproducir en la TV» desde el PC/teléfono.
curl -s -X POST http://127.0.0.1:37373/control/play > /dev/null
sleep 10
shot 4-reproduciendo
if log_has "GET /pipo/media/f%3At1\|GET /pipo/media/f:t1"; then ok "reproduce la canción enviada (pide el audio al PC)"; else bad "no pidió el audio"; fi
if keep_on; then ok "mientras suena, la pantalla se mantiene encendida"; else bad "la pantalla no se mantiene encendida mientras suena"; fi

# Play/Pausa del control.
key KEYCODE_MEDIA_PLAY_PAUSE 2
if keep_on; then bad "Play/Pausa no pausó"; else ok "Play/Pausa del control pausa"; fi
shot 5-pausa
key KEYCODE_MEDIA_PLAY_PAUSE 2
if keep_on; then ok "Play/Pausa reanuda"; else bad "Play/Pausa no reanudó"; fi

# Atrás hasta la raíz: pregunta si salir; OK en «Salir» cierra la app.
asked=0
for i in 1 2 3 4 5; do
  key KEYCODE_BACK 1.2
  if console | grep -q "pipo:menu-salir"; then asked=1; break; fi
done
shot 6-salir
if [ "$asked" = 1 ]; then ok "Atrás en la raíz pregunta «¿Salir de Pipo?» (tras $i pulsaciones)"; else bad "Atrás nunca preguntó si salir"; fi
key KEYCODE_DPAD_CENTER 2
if top_app | grep -q pipotv; then bad "«Salir» no cerró la app: $(top_app)"; else ok "Atrás › «Salir» cierra la app"; fi
shot 7-lanzador

adb logcat -d -s PipoTV:* AndroidRuntime:E > "$OUT/logcat.txt" 2>/dev/null || true
echo "$PASS correctas, $FAIL con fallas" | tee -a "$REPORT"
[ "$FAIL" -eq 0 ]

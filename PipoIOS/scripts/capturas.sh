#!/usr/bin/env bash
# Instala Pipo en un simulador de iPhone con música de ejemplo, abre cada pantalla y toma capturas.
# Uso: capturas.sh <Pipo.app> <carpeta con mp3> <carpeta de salida>
set -uo pipefail
APP="$1"; SAMPLES="$2"; OUT="$3"
BUNDLE=com.personal.pipomusicplayer
mkdir -p "$OUT"

DEVTYPE=$(xcrun simctl list devicetypes -j | python3 -c "
import json,sys
ts=[t for t in json.load(sys.stdin)['devicetypes'] if t['name'].startswith('iPhone') and t['name'].endswith('Pro')]
print(ts[-1]['identifier'])")
RUNTIME=$(xcrun simctl list runtimes -j | python3 -c "
import json,sys
rs=[r for r in json.load(sys.stdin)['runtimes'] if r.get('platform','iOS')=='iOS' and r['isAvailable'] and 'iOS' in r['name']]
print(rs[-1]['identifier'])")
echo "Simulador: $DEVTYPE / $RUNTIME"
UDID=$(xcrun simctl create PipoPrueba "$DEVTYPE" "$RUNTIME")
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 || true
xcrun simctl ui "$UDID" appearance light
xcrun simctl install "$UDID" "$APP"
DATA=$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)
mkdir -p "$DATA/Documents/Música de ejemplo"
cp "$SAMPLES"/*.mp3 "$DATA/Documents/Música de ejemplo/"

shot() {
  local name=$1 wait=$2; shift 2
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  sleep 1
  xcrun simctl launch "$UDID" "$BUNDLE" "$@" >/dev/null
  sleep "$wait"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null && echo "captura $name"
}

shot 01-canciones 14 -pipoTab library -pipoSection songs -pipoSelfTest -pipoPlay
cp "$DATA/Documents/.prueba.json" "$OUT/prueba.json" 2>/dev/null && cat "$OUT/prueba.json"
shot 02-albumes 6 -pipoTab library -pipoSection albums
shot 03-album 6 -pipoTab library -pipoRoute album
shot 04-artistas 6 -pipoTab library -pipoSection artists
shot 05-carpetas 6 -pipoTab library -pipoSection folders
shot 06-listas 6 -pipoDemo -pipoTab lists
shot 07-lista 6 -pipoTab lists -pipoRoute playlist
shot 08-ecualizador 6 -pipoTab equalizer -pipoPreset "Graves potentes"
shot 09-reproduciendo 8 -pipoPlay -pipoNowPlaying
shot 10-compartir 9 -pipoTab library -pipoSection songs -pipoShare
shot 11-ajustes 6 -pipoTab settings
xcrun simctl ui "$UDID" appearance dark
shot 12-oscuro-albumes 7 -pipoPlay -pipoTab library -pipoSection albums
shot 13-oscuro-reproduciendo 8 -pipoPlay -pipoNowPlaying
shot 14-oscuro-ecualizador 6 -pipoTab equalizer

xcrun simctl spawn "$UDID" log show --last 10m --style compact \
  --predicate 'subsystem == "com.personal.pipomusicplayer"' > "$OUT/registro.txt" 2>/dev/null || true
tail -n 40 "$OUT/registro.txt" || true
xcrun simctl shutdown "$UDID" || true

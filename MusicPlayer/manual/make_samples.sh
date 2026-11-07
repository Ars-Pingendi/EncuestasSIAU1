#!/usr/bin/env bash
# Genera música de ejemplo (tonos de 45 s) con etiquetas y carátula, para las capturas del manual.
# Todos los artistas y álbumes son ficticios.
set -euo pipefail
OUT="$1"
mkdir -p "$OUT"

cover() { # nombre color1 color2
  ffmpeg -loglevel error -y -f lavfi \
    -i "gradients=s=600x600:c0=$2:c1=$3:x0=0:y0=0:x1=599:y1=599:nb_colors=2:d=1" \
    -frames:v 1 "$OUT/$1.png"
}

track() { # archivo título artista álbum género pista año portada frecuencia
  ffmpeg -loglevel error -y \
    -f lavfi -i "sine=frequency=$9:duration=45" -i "$OUT/$8.png" \
    -map 0:a -map 1:v -c:a libmp3lame -b:a 96k -c:v png -disposition:v attached_pic -id3v2_version 3 \
    -metadata title="$2" -metadata artist="$3" -metadata album="$4" -metadata genre="$5" \
    -metadata track="$6" -metadata date="$7" \
    -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" \
    "$OUT/$1.mp3"
}

cover orejas 0x6a4c93 0xf9c74f
cover caribe 0x0f766e 0xf97316
cover paramo 0x166534 0x60a5fa
cover neon   0xdb2777 0x312e81

track 01 "Ladrido en Re mayor"           "Pipo y los Rizos" "Orejas al viento"      "Rock"        1 2025 orejas 294
track 02 "Paseo de las seis"             "Pipo y los Rizos" "Orejas al viento"      "Rock"        2 2025 orejas 330
track 03 "El cartero no tiene la culpa"  "Pipo y los Rizos" "Orejas al viento"      "Rock"        3 2025 orejas 370
track 04 "Siesta en el sofá"             "Pipo y los Rizos" "Orejas al viento"      "Rock"        4 2025 orejas 247
track 05 "Brisa de Barranquilla"         "Luna Cumbiambera" "Noches de Caribe"      "Cumbia"      1 2024 caribe 392
track 06 "Cumbia del faro"               "Luna Cumbiambera" "Noches de Caribe"      "Cumbia"      2 2024 caribe 440
track 07 "Marea alta"                    "Luna Cumbiambera" "Noches de Caribe"      "Cumbia"      3 2024 caribe 494
track 08 "Frailejones"                   "Cuarteto Andino"  "Páramo"                "Andina"      1 2023 paramo 262
track 09 "Niebla en la montaña"          "Cuarteto Andino"  "Páramo"                "Andina"      2 2023 paramo 311
track 10 "Bambuco del amanecer"          "Cuarteto Andino"  "Páramo"                "Andina"      3 2023 paramo 349
track 11 "Cola que se mueve"             "DJ Spaniel"       "Ladridos electrónicos" "Electrónica" 1 2026 neon   523
track 12 "Hueso de neón"                 "DJ Spaniel"       "Ladridos electrónicos" "Electrónica" 2 2026 neon   587
track 13 "Remix del vecino"              "DJ Spaniel"       "Ladridos electrónicos" "Electrónica" 3 2026 neon   659

rm -f "$OUT"/*.png
ls -l "$OUT"

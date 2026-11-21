# Banners de estados de WhatsApp — cómo regenerarlos

- `make.mjs`: arma los 6 banners en HTML/CSS (1080 × 1920, zona segura de 250 px arriba y abajo)
  y los fotografía con Chromium (Playwright). Verifica que ningún texto quede en la zona segura.
- `guino.py`: crea `perro-guino.png` (el logo oficial con un guiño) a partir de
  `MusicPlayer/branding/icono-perro-sin-fondo.png`.
- Fuentes: Fredoka y Nunito (`npm i @fontsource/fredoka @fontsource/nunito` en esta carpeta).

```bash
cp ../../../MusicPlayer/branding/icono-perro-sin-fondo.png perro.png
python3 guino.py perro.png perro-guino.png
node make.mjs ../
```

# Variante del logo con un guiño: se borra el ojo derecho (del espectador) rellenándolo con el pelaje
# de alrededor y se dibuja un ojo cerrado sonriente con pestañas.
import math
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
rgba = np.array(im)
rgb = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
cx, cy, rx, ry = 659, 360, 64, 68
mask = np.zeros(rgb.shape[:2], np.uint8)
cv2.ellipse(mask, (cx, cy), (rx, ry), -8, 0, 360, 255, -1)
filled = cv2.inpaint(rgb, mask, 30, cv2.INPAINT_TELEA)
filled = cv2.GaussianBlur(filled, (0, 0), 3)
soft = cv2.GaussianBlur(mask, (0, 0), 5).astype(np.float32)[:, :, None] / 255.0
mixed = (filled * soft + rgb * (1 - soft)).astype(np.uint8)
out_rgba = rgba.copy()
out_rgba[:, :, :3] = cv2.cvtColor(mixed, cv2.COLOR_BGR2RGB)
res = Image.fromarray(out_rgba, 'RGBA')

S = 4
layer = Image.new('RGBA', (im.width * S, im.height * S), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
# Mechones suaves de pelaje sobre el relleno (en la dirección del pelo, hacia abajo y afuera)
fur = (196, 120, 48, 40)
for i in range(9):
    x0 = cx - 50 + i * 12
    d.arc([(x0 - 30) * S, (cy - 60) * S, (x0 + 30) * S, (cy + 70) * S], start=300, end=40, fill=fur, width=3 * S)
dark = (58, 30, 14, 255)
# Ojo cerrado sonriente (arco hacia arriba)
box = [(cx - 52) * S, (cy - 22) * S, (cx + 50) * S, (cy + 44) * S]
d.arc(box, start=196, end=344, fill=dark, width=13 * S)
ex, ey = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
rxx, ryy = (box[2] - box[0]) / 2, (box[3] - box[1]) / 2
# Pestañas en el extremo de afuera, hacia arriba y afuera
for ang, ln, tilt in [(318, 20, -0.9), (332, 22, -0.55), (344, 19, -0.2)]:
    a = math.radians(ang)
    px, py = ex + rxx * math.cos(a), ey + ryy * math.sin(a)
    out_a = a + tilt
    qx, qy = px + ln * S * math.cos(out_a), py + ln * S * math.sin(out_a)
    d.line([(px, py), (qx, qy)], fill=dark, width=7 * S)
    d.ellipse([qx - 3.5 * S, qy - 3.5 * S, qx + 3.5 * S, qy + 3.5 * S], fill=dark)
# extremos redondeados del arco
for ang in (196, 344):
    a = math.radians(ang)
    px, py = ex + rxx * math.cos(a), ey + ryy * math.sin(a)
    d.ellipse([px - 6.5 * S, py - 6.5 * S, px + 6.5 * S, py + 6.5 * S], fill=dark)
# Mejilla sonrojada
blush = Image.new('RGBA', layer.size, (0, 0, 0, 0))
ImageDraw.Draw(blush).ellipse([(cx - 34) * S, (cy + 58) * S, (cx + 52) * S, (cy + 96) * S], fill=(255, 110, 110, 85))
blush = blush.filter(ImageFilter.GaussianBlur(12 * S))
layer = Image.alpha_composite(blush, layer).resize(im.size, Image.LANCZOS)
res = Image.alpha_composite(res, layer)
res.save(out)
res.crop((520, 220, 800, 500)).resize((560, 560), Image.LANCZOS).save(out.replace('.png', '-zoom.png'))
res.resize((420, 420), Image.LANCZOS).save(out.replace('.png', '-small.png'))

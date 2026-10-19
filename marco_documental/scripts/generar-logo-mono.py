#!/usr/bin/env python3
"""scripts/generar-logo-mono.py — convierte el logo de la Cámara a monocromo para el membrete de prensa."""
# =====================================================================
#  scripts/generar-logo-mono.py  --  Logo de la Camara MONOCROMO
# ---------------------------------------------------------------------
#  El logotipo oficial de la Camara de Diputados viene con FONDO GUINDA
#  solido (diseño blanco sobre vino). En el membrete 'prensa', junto al
#  escudo nacional limpio, ese recuadro oscuro se ve pesado y ajeno.
#
#  Este script lo convierte a una version MONOCROMA sobre fondo
#  TRANSPARENTE: separa el diseño (blanco) del fondo (guinda) por
#  LUMINANCIA y lo re-tinta en el guinda de marca (o el color que se
#  indique), recortando al contenido. Asi el edificio + rotulo quedan
#  en guinda sobre el papel, en armonia con el escudo nacional.
#
#  Uso:
#     python3 scripts/generar-logo-mono.py                 # guinda de marca
#     python3 scripts/generar-logo-mono.py --color 000000  # negro
# =====================================================================
import argparse
import os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ORIGEN = os.path.join(RAIZ, "assets/logos/logo-camara-diputados.png")
DESTINO = os.path.join(RAIZ, "assets/logos/logo-camara-mono.png")

# Umbrales de luminancia: <=LO es fondo guinda (-> transparente),
# >=HI es diseño blanco (-> opaco); el tramo intermedio da el antialias.
LO, HI = 45.0, 240.0
COLOR_DEFECTO = "4D1018"   # guindaoficial (color de marca del despacho)


def hex2rgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser(description="Logo de la Camara monocromo/transparente")
    ap.add_argument("--color", default=COLOR_DEFECTO, help="color de tinta HEX (defecto: guinda)")
    ap.add_argument("--origen", default=ORIGEN)
    ap.add_argument("--destino", default=DESTINO)
    a = ap.parse_args()

    color = hex2rgb(a.color)
    im = Image.open(a.origen).convert("RGB")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            t = (lum - LO) / (HI - LO)
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            o[x, y] = (color[0], color[1], color[2], int(t * 255))

    bbox = out.split()[-1].getbbox()   # recorta el padding transparente
    if bbox:
        out = out.crop(bbox)
    out.save(a.destino)
    print(f"[ok] {a.destino}  {out.size}  tinta #{a.color}")


if __name__ == "__main__":
    main()

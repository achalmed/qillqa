#!/usr/bin/env python3
"""scripts/generar-sello.py — compone el sello de consigna del despacho (PNG)."""
# =====================================================================
#  generar-sello.py -- Compone el sello de consigna del despacho
# ---------------------------------------------------------------------
#  Version MONOCROMA en cursiva (referencia de Edison, 2026-08-03):
#  puno negro a la IZQUIERDA + la consigna en DOS lineas con letra
#  script conectada (Yellowtail, estilo rotulista):
#
#     [puno]   Solo el pueblo
#              salva al pueblo
#
#  Todo en negro/carbon. En el documento va DEBAJO del bloque de
#  firma (bajo "Diputado de la Republica"), alineado a la derecha.
#
#  Resultado: assets/logos/sello-consigna.png (fondo transparente).
#
#  Uso:      python3 scripts/generar-sello.py
#  Requiere: Pillow + pdftoppm (poppler, para rasterizar el puno).
# =====================================================================
import os
import subprocess
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("ERROR: falta Pillow. Instala con: pip install Pillow")

AQUI = os.path.dirname(os.path.abspath(__file__))
FW = os.path.dirname(AQUI)
LOGOS = os.path.join(os.environ.get("MDD_PERFIL", os.path.join(FW, "core", "perfil-defecto")), "logos")   # puño y consigna viven en el perfil del despacho
FUENTE = os.path.join(FW, "assets", "fonts", "yellowtail", "Yellowtail-Regular.ttf")
SALIDA = os.path.join(LOGOS, "sello-consigna.png")

# --- Paleta (monocroma, como la referencia) --------------------------
NEGRO = (20, 20, 22, 255)        # puno
CARBON = (58, 58, 60, 255)       # texto script

# --- Escala (px del lienzo interno) ----------------------------------
TAMANO = 170                 # cuerpo de la script
ENTRELINEA = 4               # aire entre las dos lineas (la script ya
                             # trae ascendentes/descendentes generosos)
SEP_PUNO = 55                # puno <-> texto


def fuente(px):
    return ImageFont.truetype(FUENTE, px)


def rasterizar_puno(alto_px):
    """puno-negro.pdf -> RGBA negro con fondo transparente."""
    tmp = os.path.join(AQUI, "_puno_tmp")
    subprocess.run(
        ["pdftoppm", "-png", "-r", "600", os.path.join(LOGOS, "puno-negro.pdf"), tmp],
        check=True,
    )
    ruta = tmp + "-1.png"
    img = Image.open(ruta).convert("RGBA")
    os.remove(ruta)
    px = img.load()
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    po = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            alfa = int(round((1.0 - lum) * (a / 255.0) * 255))
            po[x, y] = (NEGRO[0], NEGRO[1], NEGRO[2], alfa)
    escala = alto_px / out.height
    return out.resize((int(out.width * escala), alto_px), Image.LANCZOS)


def linea(texto, f):
    """Una linea de script sobre lienzo transparente ajustado."""
    caja = f.getbbox(texto)
    img = Image.new(
        "RGBA", (caja[2] - caja[0] + 12, caja[3] - caja[1] + 12), (0, 0, 0, 0)
    )
    ImageDraw.Draw(img).text((6 - caja[0], 6 - caja[1]), texto, font=f, fill=CARBON)
    return img


def main():
    f = fuente(TAMANO)

    l1 = linea("Solo el pueblo", f)
    l2 = linea("salva al pueblo", f)

    ancho_txt = max(l1.width, l2.width)
    alto_txt = l1.height + ENTRELINEA + l2.height
    texto = Image.new("RGBA", (ancho_txt, alto_txt), (0, 0, 0, 0))
    texto.alpha_composite(l1, (0, 0))
    texto.alpha_composite(l2, (0, l1.height + ENTRELINEA))

    # Puno a la izquierda, centrado verticalmente con el texto
    puno = rasterizar_puno(int(alto_txt * 0.94))
    W = puno.width + SEP_PUNO + ancho_txt
    H = alto_txt
    sello = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sello.alpha_composite(puno, (0, (H - puno.height) // 2))
    sello.alpha_composite(texto, (puno.width + SEP_PUNO, 0))

    sello.save(SALIDA)
    print(f"Sello generado: {SALIDA}  ({W}x{H}, proporcion {W/H:.2f})")


if __name__ == "__main__":
    main()

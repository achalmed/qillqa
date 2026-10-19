#!/usr/bin/env python3
"""scripts/generar-marca-agua.py — convierte un logo en marca de agua PNG transparente."""
# =====================================================================
#  generar-marca-agua.py -- Convierte un logo en marca de agua PNG
# ---------------------------------------------------------------------
#  Toma el logo oficial de la Camara de Diputados (lineas blancas sobre
#  fondo guinda solido) y produce un PNG transparente donde:
#    - la "blancura" de cada pixel se convierte en canal alfa
#      (las lineas del logo quedan visibles; el fondo desaparece),
#    - el color se fija al guinda institucional,
#    - la opacidad maxima se atenua (marca de agua sutil, no invasiva).
#
#  El PNG resultante se coloca centrado en cada pagina via
#  core/config/marca-agua.tex (paquete eso-pic). La opacidad viene
#  HORNEADA en el PNG: asi el PDF no depende de grupos de transparencia
#  y se ve igual en cualquier visor/impresora.
#
#  Uso:
#     python3 scripts/generar-marca-agua.py                  # defaults
#     python3 scripts/generar-marca-agua.py --opacidad 0.08
#     python3 scripts/generar-marca-agua.py --color '#6E0F22'
#
#  Requiere: Pillow (PIL). Sin dependencias adicionales.
# =====================================================================
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("ERROR: falta Pillow. Instala con: pip install Pillow")

AQUI = os.path.dirname(os.path.abspath(__file__))
FW = os.path.dirname(AQUI)  # raiz del framework (marco_documental)

DEFAULT_ENTRADA = os.path.join(FW, "assets", "logos", "logo-camara-diputados.png")
DEFAULT_SALIDA = os.path.join(FW, "assets", "logos", "marca-agua-diputados.png")
DEFAULT_COLOR = "#4D1018"   # guinda del propio logo oficial
DEFAULT_OPACIDAD = 0.10     # 10 %: visible al ojo, invisible al leer
DEFAULT_PISO = 0.16         # luminancia del fondo guinda (~0.12) + margen:
                            # todo pixel por debajo queda 100% transparente


def hex_a_rgb(hexstr: str):
    h = hexstr.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def main():
    p = argparse.ArgumentParser(
        description="Genera la marca de agua institucional a partir del logo."
    )
    p.add_argument("--entrada", default=DEFAULT_ENTRADA, help="PNG de origen")
    p.add_argument("--salida", default=DEFAULT_SALIDA, help="PNG resultante")
    p.add_argument("--color", default=DEFAULT_COLOR, help="color de la marca (hex)")
    p.add_argument(
        "--opacidad",
        type=float,
        default=DEFAULT_OPACIDAD,
        help="opacidad maxima 0..1 (defecto: %(default)s)",
    )
    p.add_argument(
        "--piso",
        type=float,
        default=DEFAULT_PISO,
        help="umbral de blancura bajo el cual el pixel es transparente "
        "(elimina el tinte del fondo; defecto: %(default)s)",
    )
    args = p.parse_args()

    rgb = hex_a_rgb(args.color)
    img = Image.open(args.entrada).convert("RGBA")

    salida = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px_in, px_out = img.load(), salida.load()

    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px_in[x, y]
            # "Blancura" = luminancia normalizada; el fondo guinda (~oscuro)
            # tiende a 0 y las lineas blancas a 1.
            blancura = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            # Recorte del piso: el fondo (blancura <= piso) desaparece por
            # completo y el resto se re-normaliza a 0..1 para conservar
            # el suavizado (antialiasing) de los bordes.
            if blancura <= args.piso:
                blancura = 0.0
            else:
                blancura = (blancura - args.piso) / (1.0 - args.piso)
            alfa = int(round(blancura * (a / 255.0) * args.opacidad * 255))
            px_out[x, y] = (rgb[0], rgb[1], rgb[2], alfa)

    salida.save(args.salida)
    print(f"Marca de agua generada: {args.salida}")
    print(f"  color={args.color}  opacidad_max={args.opacidad}  tamano={img.size}")


if __name__ == "__main__":
    main()

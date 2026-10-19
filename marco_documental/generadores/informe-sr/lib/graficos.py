"""lib/graficos.py — Gráficos del informe con matplotlib → PDF vectorial.

Estilo de casa (dataviz de la marca): barras en Puka sobre fondo blanco, sin
marcos superior/derecho, etiqueta directa del valor en cada barra (el color
nunca viaja solo), tipografía Archivo/Inter, y la fuente citada la pone el
componente \\isrgrafico del LaTeX. La paleta se lee de tokens/colors.json.
"""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402

import config  # noqa: E402

CM = 1 / 2.54


def _fuentes():
    disponibles = {f.name for f in font_manager.fontManager.ttflist}
    titulos = config.GRAFICO_FUENTE_TITULOS if config.GRAFICO_FUENTE_TITULOS in disponibles else "DejaVu Sans"
    datos = config.GRAFICO_FUENTE_DATOS if config.GRAFICO_FUENTE_DATOS in disponibles else "DejaVu Sans"
    return titulos, datos


def _estilo(pal):
    ft, fd = _fuentes()
    plt.rcParams.update({
        "font.family": fd, "font.size": 8.5, "axes.titlesize": 9.5, "axes.titleweight": "bold",
        "axes.edgecolor": pal["gris300"], "axes.labelcolor": pal["tinta"], "text.color": pal["tinta"],
        "xtick.color": pal["gris"], "ytick.color": pal["tinta"], "axes.spines.top": False,
        "axes.spines.right": False, "axes.spines.left": False, "figure.facecolor": "white",
        "axes.facecolor": "white", "pdf.fonttype": 42, "axes.axisbelow": True,
    })
    return ft, fd


def barras_horizontales(pares: list[tuple[str, int | float]], ruta: Path, *, color=None,
                        alto_cm=None, sufijo="", ancho_cm=None) -> Path:
    """Barras horizontales ordenadas de mayor a menor con etiqueta directa."""
    pal = config.paleta()
    ft, fd = _estilo(pal)
    pares = [(k, v) for k, v in pares if v]
    pares.sort(key=lambda kv: kv[1])
    n = len(pares)
    ancho = ancho_cm or config.GRAFICO_ANCHO_CM
    alto = alto_cm or max(3.0, 0.62 * n + 0.8)
    fig, ax = plt.subplots(figsize=(ancho * CM, alto * CM))
    etiquetas = [k for k, _ in pares]
    valores = [v for _, v in pares]
    ax.barh(etiquetas, valores, color=color or pal["puka"], height=0.62, zorder=3)
    ax.set_xticks([])
    ax.tick_params(axis="y", length=0, labelsize=8.6)
    ax.grid(False)
    vmax = max(valores) if valores else 1
    for i, v in enumerate(valores):
        ax.text(v + vmax * 0.012, i, f"{v:g}{sufijo}", va="center", ha="left", fontsize=8.4,
                fontfamily=fd, fontweight="semibold", color=pal["tinta"])
    ax.set_xlim(0, vmax * 1.14)
    ax.spines["bottom"].set_visible(False)
    for lab in ax.get_yticklabels():
        lab.set_fontfamily(fd)
    fig.tight_layout(pad=0.3)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(ruta, format="pdf")
    plt.close(fig)
    return ruta


def barras_verticales(pares: list[tuple[str, int | float]], ruta: Path, *, colores=None,
                      alto_cm=5.2, sufijo="", ancho_cm=None) -> Path:
    """Barras verticales en el orden dado (días, prioridades) con etiqueta directa."""
    pal = config.paleta()
    ft, fd = _estilo(pal)
    ancho = ancho_cm or config.GRAFICO_ANCHO_CM
    fig, ax = plt.subplots(figsize=(ancho * CM, alto_cm * CM))
    etiquetas = [k for k, _ in pares]
    valores = [v for _, v in pares]
    cols = colores or [pal["puka"]] * len(pares)
    ax.bar(etiquetas, valores, color=cols, width=0.62, zorder=3)
    ax.set_yticks([])
    ax.tick_params(axis="x", length=0, labelsize=8.4)
    vmax = max(valores) if valores else 1
    for i, v in enumerate(valores):
        ax.text(i, v + vmax * 0.02, f"{v:g}{sufijo}", ha="center", va="bottom", fontsize=8.4,
                fontfamily=fd, fontweight="semibold", color=pal["tinta"])
    ax.set_ylim(0, vmax * 1.18)
    ax.spines["bottom"].set_color(pal["gris300"])
    for lab in ax.get_xticklabels():
        lab.set_fontfamily(fd)
    fig.tight_layout(pad=0.3)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(ruta, format="pdf")
    plt.close(fig)
    return ruta


def generar_todos(datos: dict, carpeta_salida: Path) -> dict[str, str]:
    """Produce los gráficos estándar del informe y devuelve {clave: nombre de archivo}."""
    st = datos["stats"]
    pal = config.paleta()
    salida = {}

    # Edición pública: un solo gráfico (pedidos por sector) a ancho de texto.
    # Los demás se generan igual para la edición interna.
    p = carpeta_salida / "g_actividades_sector.pdf"
    barras_horizontales(list(st["por_sector"].items()), p, ancho_cm=8.2)
    salida["actividades_sector"] = p.name

    p = carpeta_salida / "g_pedidos_sector.pdf"
    barras_horizontales(list(st["pedidos_por_sector"].items()), p, alto_cm=6.4)
    salida["pedidos_sector"] = p.name

    p = carpeta_salida / "g_entidades.pdf"
    barras_horizontales(st["entidades"], p, color=pal["vino"])
    salida["entidades"] = p.name

    p = carpeta_salida / "g_por_dia.pdf"
    dias = [(t.split(" · ")[0], n) for t, n, _, _ in st["por_dia"]]
    barras_verticales(dias, p, alto_cm=4.6)
    salida["por_dia"] = p.name

    p = carpeta_salida / "g_prioridad.pdf"
    pri = [("Urgente", st["por_prioridad"].get("urgente", 0)), ("Alta", st["por_prioridad"].get("alta", 0)),
           ("Ordinaria", st["por_prioridad"].get("ordinaria", 0))]
    barras_verticales(pri, p, colores=[pal["puka"], pal["qillu600"], pal["gris"]], alto_cm=4.6, ancho_cm=8.2)
    salida["prioridad"] = p.name

    p = carpeta_salida / "g_tipo.pdf"
    barras_horizontales(list(st["por_tipo"].items()), p, color=pal["tinta"])
    salida["tipo"] = p.name
    return salida

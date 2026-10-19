"""generadores/informe-sr/config.py — Parámetros del generador de Informes de Semana de Representación (ISR).

TODO ajuste del usuario vive aquí, nunca en lib/ (mismo contrato que el resto
de herramientas del despacho: main.py orquesta, config.py parametriza, lib/ ejecuta).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

# --- Rutas ------------------------------------------------------------------
#  El generador vive DENTRO del marco documental (generadores/informe-sr/) y es
#  reutilizable: nada del despacho se conoce por ruta relativa, todo llega por
#  variables de entorno (las carga generar.sh del despacho desde su .env):
#    MDD_RUTA      raíz del marco documental (por defecto, este mismo repo)
#    ISR_RAIZ      carpeta de expedientes del despacho (representacion/): _plantilla/ y un
#                  expediente por semana AAAA-MM_SR-NN_slug/ (por defecto, el directorio actual)
#    DESPACHO_DIR  raíz del despacho, base de fotos.yaml:_meta.banco (por defecto, ISR_RAIZ/..)
#    ISR_TOKENS    tokens de color (colors.json) del perfil de marca
#    MDD_PERFIL    perfil LaTeX del despacho (lo consume build.sh vía TEXINPUTS)
RAIZ_SISTEMA = Path(__file__).resolve().parent          # generadores/informe-sr
MDD = Path(os.environ.get("MDD_RUTA") or RAIZ_SISTEMA.parents[1]).resolve()
BUILD_SH = MDD / "scripts" / "build.sh"                  # único compilador válido
RAIZ_SR = Path(os.environ.get("ISR_RAIZ") or Path.cwd()).resolve()
RAIZ_DESPACHO = Path(os.environ.get("DESPACHO_DIR") or RAIZ_SR.parent).resolve()
TOKENS_COLOR = Path(os.environ.get("ISR_TOKENS") or (RAIZ_DESPACHO / "perfil" / "marca" / "tokens" / "colors.json"))
# Desde M10 D5 (2026-09-15) los expedientes cuelgan directamente de ISR_RAIZ (representacion/) y la
# plantilla es _plantilla/; se aceptan los nombres anteriores (informes/AAAA/, _plantilla_informe/).
CARPETA_INFORMES = RAIZ_SR
PLANTILLAS_TEX = RAIZ_SISTEMA / "plantillas_tex"
PLANTILLA_INFORME = next((p for p in (RAIZ_SR / "_plantilla", RAIZ_SR / "_plantilla_informe") if p.is_dir()),
                         RAIZ_SR / "_plantilla")
ARCHIVO_EXPEDIENTE = "expediente.yaml"                   # registro de la semana (id SR-NN, estado, oficios, banco)

# Subcarpetas de cada informe (contrato del archivo histórico)
SUB_DATOS, SUB_FUENTES, SUB_FOTOS, SUB_ANEXOS, SUB_EDITABLES, SUB_SALIDA = (
    "datos", "fuentes", "fotos", "anexos", "editables", "salida")
ARCHIVO_MAESTRO = "informe.tex"                          # maestro LaTeX generado en editables/

# --- Nomenclatura de salida ---------------------------------------------------
#   ISR-01_2026-08_v0.1-borrador.pdf  ·  ISR-01_2026-08_v1.0.pdf  ·  ISR-01_2026-08_v1.0-interna.pdf
NOMBRE_PDF = "{codigo}_{anio}-{mes:02d}_v{version}{sufijo}{edicion}{variante}.pdf"
SUFIJO_ESTADO = {"borrador": "-borrador", "revision": "-revision", "aprobado": "", "hecho": "", "publicado": ""}   # hecho = aprobado (ciclo de vida de NORMATIVA_ARCHIVOS §2.1)
SUFIJO_COLUMNAS = {2: "", 1: "-1col"}                     # variante de lectura a una columna (2026-09-11)
SUFIJO_EDICION = {"publica": "", "interna": "-interna"}   # la interna archiva aparte: antes pisaba el PDF público aprobado (2026-09-30)

# --- Fotos -------------------------------------------------------------------------
FOTO_LADO_MAX = 2000            # px del lado mayor en fotos/seleccion: una apertura a 17 cm llega a 300 ppi si el original lo permite (antes 1400 = 209 ppi como tope)
FOTO_CALIDAD = 90               # calidad JPEG (antes 80: sobre fotos ya comprimidas por WhatsApp, la segunda compresión se veía en bloques)
FOTO_ASPECTO_H = (3, 2)         # recorte de fotos horizontales (galerías uniformes)
FOTO_ASPECTO_V = (2, 3)         # recorte de fotos verticales
PORTADA_ANCHO = 2400            # px de la foto de portada
PORTADA_ASPECTO = (3, 2)        # 21 cm x 14 cm: banda fotográfica de la portada
MAX_FOTOS_FICHA = 1             # foto en la columna derecha de la ficha
MAX_FOTOS_GALERIA_DIA = 4       # galería al cierre de cada día
GALERIA_ASPECTO = (3, 2)        # galería de la crónica: todas las fotos al mismo formato (las verticales se recortan)
GALERIA_COLUMNAS = 2            # fotos por fila en la galería de la crónica
GALERIA_LADO_MAX = 900          # px del lado mayor de las versiones «_g» (8,3 cm de ancho ≈ 275 dpi)
GALERIA_CALIDAD = 85            # calidad JPEG de las «_g» (antes 72, 2026-09-30: artefactos visibles); el PDF debe quedar < 8 MB (portal)
PPI_MINIMO = 200                # bajo esta resolución efectiva una foto grande se ve blanda o pixelada: el generador avisa
ANCHO_IMPRESO_CM = {"portada": 21.0, "apertura": 17.0}   # ancho al que se imprimen portada y apertura (para el aviso de ppi)
MAX_FOTOS_GALERIA_CRONICA = 8   # tope por día cuando la galería se arma sola (sin dias[].galeria)
FOTO_COLUMNA_TRAS = 1           # crónica: la foto de columna va tras este párrafo del relato
                                # si informe.yaml no fija dias[].foto_columna_tras

# --- Gráficos (matplotlib → PDF vectorial) ---------------------------------------
GRAFICO_ANCHO_CM = 17.0
GRAFICO_FUENTE_TITULOS = "Archivo"
GRAFICO_FUENTE_DATOS = "Inter"
TOP_ENTIDADES = 10


def paleta() -> dict:
    """Colores de marca leídos de tokens/colors.json (fuente de verdad única)."""
    with open(TOKENS_COLOR, encoding="utf-8") as fh:
        t = json.load(fh)
    esc = t["escalas"]
    return {
        "puka": esc["puka"]["600"], "vino": esc["puka"]["800"], "puka300": esc["puka"]["300"],
        "qillu": esc["qillu"]["400"], "qillu600": esc["qillu"]["600"],
        "tinta": esc["neutral"]["900"], "gris": esc["neutral"]["600"],
        "gris300": esc["neutral"]["300"], "papel": esc["neutral"]["100"],
        "categorica": t["datos"]["categorica"],
    }


# --- Vocabularios (etiquetas legibles) ---------------------------------------------
SECTORES = {
    "educacion": "Educación", "salud": "Salud", "infraestructura": "Infraestructura",
    "agricultura": "Agricultura", "seguridad": "Seguridad", "justicia_ddhh": "Justicia y DD. HH.",
    "economia": "Economía", "gobierno": "Gobierno y territorio", "comunicacion": "Comunicación",
    "deporte": "Deporte",
}
TIPOS = {
    "fiscalizacion": "Fiscalización", "visita_ie": "Visita a institución educativa",
    "visita_salud": "Visita a establecimiento de salud", "visita_comunidad": "Visita a comunidad",
    "reunion": "Reunión de trabajo", "asamblea": "Asamblea", "entrevista": "Entrevista en medios",
    "evento": "Evento institucional",
}
PRIORIDADES = ("urgente", "alta", "ordinaria")
ESTADOS_PEDIDO = ("registrado", "derivado", "respondido", "cerrado")
ESTADOS_INFORME = ("borrador", "revision", "aprobado", "hecho", "publicado")

DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES_ES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
            "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

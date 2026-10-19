"""lib/fotos.py — Pipeline fotográfico del informe (una responsabilidad).

Lee datos/fotos.yaml, toma SOLO las fotos con estado «publica» y seleccion=true,
corrige la orientación EXIF, recorta a proporción uniforme (3:2 horizontal,
2:3 vertical) para que las galerías alineen, reduce a FOTO_LADO_MAX px y guarda
en fotos/seleccion/<ACTIVIDAD>_<ID>.jpg. Los originales NO se copian al expediente
(M10 D5, 2026-09-15): viven en el banco de fotos (fotos.yaml → _meta.banco) y el
expediente solo guarda los derivados que el informe usa.
La foto de portada se recorta a PORTADA_ASPECTO (3:2, 21 x 14 cm). Toda foto
seleccionada recibe además una versión «_g» 3:2 para la galería y, si es vertical
y va de apertura, una «_h» 3:2 a resolución completa; la franja la fija
fotos.yaml → recorte: arriba | centro | abajo.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageOps

import config


def _recortar(im: Image.Image, aspecto: tuple[int, int], ancla: str = "centro") -> Image.Image:
    """Recorte a la proporción pedida (ancho:alto). `ancla` decide qué franja se
    conserva cuando se recorta la altura: arriba | centro | abajo."""
    aw, ah = aspecto
    w, h = im.size
    objetivo = aw / ah
    if w / h > objetivo:                    # demasiado ancha → recortar lados
        nw = int(round(h * objetivo))
        x0 = (w - nw) // 2
        return im.crop((x0, 0, x0 + nw, h))
    nh = int(round(w / objetivo))           # demasiado alta → recortar arriba/abajo
    y0 = {"arriba": 0, "abajo": h - nh}.get(ancla, (h - nh) // 2)
    return im.crop((0, y0, w, y0 + nh))


def _abrir(ruta: Path) -> Image.Image:
    im = Image.open(ruta)
    im = ImageOps.exif_transpose(im)        # las fotos de celular traen rotación EXIF
    return im.convert("RGB")


def preparar(carpeta_informe: Path, fotos: dict, forzar=False, portada_id: str | None = None,
             apaisadas: set[str] | None = None) -> dict:
    """Devuelve {id: {archivo, archivo_galeria[, archivo_apaisado], ancho, alto, orientacion, …}}
    de las fotos listas para el PDF.

    La foto de portada se toma de `portada_id` (informe.yaml: foto_portada) o, si
    no se indica, de la clave `portada` de fotos.yaml. `apaisadas` son los ids que
    van en una ranura horizontal grande (apertura de crónica): si la foto es
    vertical se genera además una versión 3:2 a resolución completa («_h»),
    con la franja que indique fotos.yaml → recorte: arriba | centro | abajo."""
    banco = config.RAIZ_DESPACHO / fotos["_meta"]["banco"]
    dir_sel = carpeta_informe / config.SUB_FOTOS / "seleccion"
    dir_sel.mkdir(parents=True, exist_ok=True)

    listas = {}
    for f in fotos["fotos"]:
        if f.get("estado") != "publica" or not f.get("seleccion"):
            continue
        origen = banco / f["origen"]
        if not origen.exists():
            print(f"  [fotos] AVISO: no existe {origen}")
            continue
        act = f.get("actividad") or "SIN"
        nombre = f"{act}_{f['id']}.jpg"
        destino = dir_sel / nombre
        if forzar or not destino.exists():
            im = _abrir(origen)
            horizontal = im.width >= im.height
            im = _recortar(im, config.FOTO_ASPECTO_H if horizontal else config.FOTO_ASPECTO_V)
            im.thumbnail((config.FOTO_LADO_MAX, config.FOTO_LADO_MAX))
            im.save(destino, "JPEG", quality=config.FOTO_CALIDAD, optimize=True)
        with Image.open(destino) as im:
            listas[f["id"]] = {"archivo": nombre, "ancho": im.width, "alto": im.height,
                               "orientacion": "horizontal" if im.width >= im.height else "vertical",
                               "pie": f.get("pie") or "", "actividad": f.get("actividad")}
        # Galería: versión «_g» de toda foto seleccionada, al formato único
        # GALERIA_ASPECTO y a GALERIA_LADO_MAX px (se imprime a 8,3 cm: con
        # 1400 px el PDF superaba los 8 MB del portal). En las verticales,
        # fotos.yaml → recorte: arriba | centro | abajo elige la franja.
        ancla = f.get("recorte") or "centro"
        destino_g = dir_sel / f"{act}_{f['id']}_g.jpg"
        if forzar or not destino_g.exists():
            im = _recortar(_abrir(origen), config.GALERIA_ASPECTO, ancla)
            im.thumbnail((config.GALERIA_LADO_MAX, config.GALERIA_LADO_MAX))
            im.save(destino_g, "JPEG", quality=config.GALERIA_CALIDAD, optimize=True)
        listas[f["id"]]["archivo_galeria"] = destino_g.name
        # Apertura con una foto vertical: versión apaisada 3:2 a resolución completa.
        if f["id"] in (apaisadas or set()) and listas[f["id"]]["orientacion"] == "vertical":
            destino_h = dir_sel / f"{act}_{f['id']}_h.jpg"
            if forzar or not destino_h.exists():
                im = _recortar(_abrir(origen), config.FOTO_ASPECTO_H, ancla)
                im.thumbnail((config.FOTO_LADO_MAX, config.FOTO_LADO_MAX))
                im.save(destino_h, "JPEG", quality=config.FOTO_CALIDAD, optimize=True)
            listas[f["id"]]["archivo_apaisado"] = destino_h.name

    # Portada (se regenera si cambia la foto elegida)
    pid = portada_id or fotos.get("portada")
    if pid:
        reg = next((x for x in fotos["fotos"] if x["id"] == pid), None)
        if reg and reg.get("estado") == "publica":
            origen = banco / reg["origen"]
            destino = dir_sel / "portada.jpg"
            marca = dir_sel / ".portada_id"
            if forzar or not destino.exists() or not marca.exists() or marca.read_text() != pid:
                marca.write_text(pid)
                im = _recortar(_abrir(origen), config.PORTADA_ASPECTO, reg.get("recorte") or "centro")
                im.thumbnail((config.PORTADA_ANCHO, config.PORTADA_ANCHO))
                im.save(destino, "JPEG", quality=config.FOTO_CALIDAD + 4, optimize=True)
            listas["portada"] = {"archivo": "portada.jpg", "pie": reg.get("pie") or "", "actividad": reg.get("actividad")}
        else:
            print(f"  [fotos] AVISO: la foto de portada {pid} no es pública o no existe")
    _avisar_resolucion(dir_sel, listas, apaisadas or set())
    return listas


def _avisar_resolucion(dir_sel: Path, listas: dict, aperturas: set[str]) -> None:
    """Avisa de las fotos grandes (portada, aperturas) que quedan bajo PPI_MINIMO al ancho
    impreso: son las que se ven blandas o pixeladas. El remedio es el original de la cámara
    (no el reenviado por WhatsApp, que llega a 1280 px) o una foto más pequeña en ese lugar."""
    casos = [("portada", "portada")] + [(fid, "apertura") for fid in sorted(aperturas) if fid in listas]
    for fid, lugar in casos:
        reg = listas.get(fid)
        if not reg:
            continue
        nombre = reg.get("archivo_apaisado") or reg["archivo"]
        with Image.open(dir_sel / nombre) as im:
            ppi = im.width / (config.ANCHO_IMPRESO_CM[lugar] / 2.54)
        if ppi < config.PPI_MINIMO:
            print(f"  [fotos] AVISO: {lugar} {fid if fid != 'portada' else ''} a {ppi:.0f} ppi "
                  f"(mínimo {config.PPI_MINIMO}): pedir el original de la cámara o elegir otra foto")

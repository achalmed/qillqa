"""Exportar a Word (.docx) lo que el editor guarda (2026-10-19; Edison: «facilitar su exportación a los
formatos correspondientes»). Un solo conversor del JSON de TipTap a Word para todos los módulos: lo usa
el documento de Gestión documental (campos + cuerpo) y las partes de un proyecto de ley.

El PDF oficial sigue siendo el de LuaLaTeX: el Word es una copia de trabajo (revisar fuera, compartir
con quien no entra a Qillqa), sin sello ni numeración oficial más allá de la que ya lleva el documento.
Lo que Word no expresa igual se aproxima y se dice: la nota al pie va como nota real de Word; una
fotografía del editor, como su título entre corchetes; una referencia citable, como texto llano.
"""
from __future__ import annotations

import io
import re
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ALINEACION = {"left": WD_ALIGN_PARAGRAPH.LEFT, "center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT, "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}


def texto_de(nodo: Any) -> str:
    if isinstance(nodo, dict):
        if nodo.get("type") == "text":
            return str(nodo.get("text") or "")
        if nodo.get("type") == "footnote":
            return ""
        return "".join(texto_de(h) for h in (nodo.get("content") or []))
    if isinstance(nodo, list):
        return "".join(texto_de(h) for h in nodo)
    return ""


class _Escritor:
    """Recorre el JSON y escribe en el `Document`. Las notas al pie se numeran y van al final del
    documento (python-docx no escribe notas de Word nativas): «¹» en el texto, lista «Notas» al cierre."""

    def __init__(self, doc: Document, letra_pt: float = 11.0):
        self.doc = doc
        self.letra = letra_pt
        self.notas: list[str] = []
        self._cambios = 0

    def _cambio_id(self) -> int:
        self._cambios += 1
        return self._cambios

    # --- en línea -------------------------------------------------------------------------------
    def _runs(self, parrafo, hijos: list[dict]) -> None:
        for h in hijos or []:
            t = h.get("type")
            if t == "text":
                r = parrafo.add_run(str(h.get("text") or ""))
                marcas = {m.get("type"): m for m in (h.get("marks") or [])}
                # Control de cambios (2026-10-19): la sugerencia viaja como cambio real de Word
                # (w:ins / w:del, con autor y fecha), que Word muestra y deja aceptar o rechazar.
                if "supresion" in marcas:
                    _como_cambio(r, "del", marcas["supresion"], self._cambio_id())
                elif "insercion" in marcas:
                    _como_cambio(r, "ins", marcas["insercion"], self._cambio_id())
                r.bold = "bold" in marcas or None
                r.italic = "italic" in marcas or None
                r.underline = "underline" in marcas or None
                r.font.strike = "strike" in marcas or None
                if "superscript" in marcas:
                    r.font.superscript = True
                if "subscript" in marcas:
                    r.font.subscript = True
                color = str((marcas.get("colorTexto") or {}).get("attrs", {}).get("color") or "").lstrip("#")
                if re.fullmatch(r"[0-9A-Fa-f]{6}", color):
                    r.font.color.rgb = RGBColor.from_string(color.upper())
                if "link" in marcas:
                    href = (marcas["link"].get("attrs") or {}).get("href") or ""
                    if href and href not in r.text:
                        parrafo.add_run(f" ({href})")
            elif t == "hardBreak":
                parrafo.add_run().add_break(WD_BREAK.LINE)
            elif t == "footnote":
                self.notas.append(str((h.get("attrs") or {}).get("texto") or ""))
                r = parrafo.add_run(str(len(self.notas)))
                r.font.superscript = True
            elif t == "referencia":
                r = parrafo.add_run(texto_de(h) or str((h.get("attrs") or {}).get("texto") or ""))
                nota = (h.get("attrs") or {}).get("nota")
                if nota:
                    self.notas.append(str(nota))
                    s = parrafo.add_run(str(len(self.notas)))
                    s.font.superscript = True
            elif h.get("content"):
                self._runs(parrafo, h["content"])

    # --- bloques --------------------------------------------------------------------------------
    def bloque(self, n: dict, nivel_lista: int = 0, estilo_lista: str | None = None) -> None:
        t = n.get("type")
        attrs = n.get("attrs") or {}
        if t == "paragraph":
            p = self.doc.add_paragraph(style=estilo_lista) if estilo_lista else self.doc.add_paragraph()
            self._runs(p, n.get("content") or [])
            if attrs.get("textAlign") in ALINEACION:
                p.alignment = ALINEACION[attrs["textAlign"]]
            sangria = attrs.get("sangria")
            if sangria and not estilo_lista:
                try:
                    p.paragraph_format.first_line_indent = Cm(1.25 * float(sangria))
                except (TypeError, ValueError):
                    pass
        elif t == "heading":
            nivel = int(attrs.get("level") or 2)
            p = self.doc.add_heading(level=min(max(nivel, 1), 4))
            self._runs(p, n.get("content") or [])
        elif t in ("bulletList", "orderedList"):
            estilo = "List Bullet" if t == "bulletList" else "List Number"
            for item in n.get("content") or []:
                for k, hijo in enumerate(item.get("content") or []):
                    if hijo.get("type") == "paragraph":
                        self.bloque(hijo, nivel_lista + 1, estilo if k == 0 else None)
                    else:
                        self.bloque(hijo, nivel_lista + 1)
        elif t == "table":
            filas = [f for f in (n.get("content") or []) if f.get("type") == "tableRow"]
            if not filas:
                return
            ancho = max(len(f.get("content") or []) for f in filas)
            tabla = self.doc.add_table(rows=len(filas), cols=max(1, ancho))
            tabla.style = "Table Grid"
            for i, f in enumerate(filas):
                for j, celda in enumerate(f.get("content") or []):
                    c = tabla.cell(i, j)
                    c.text = ""
                    primero = True
                    for hijo in celda.get("content") or []:
                        p = c.paragraphs[0] if primero else c.add_paragraph()
                        primero = False
                        self._runs(p, hijo.get("content") or [])
                        if celda.get("type") == "tableHeader":
                            for r in p.runs:
                                r.bold = True
            titulo = attrs.get("titulo") or attrs.get("rotulo")
            if titulo:
                self.doc.add_paragraph(str(titulo)).alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif t == "blockquote":
            for hijo in n.get("content") or []:
                self.bloque(hijo, nivel_lista)
        elif t == "saltoPagina":
            self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        elif t == "fotografia":
            titulo = attrs.get("titulo") or attrs.get("alt") or "Fotografía"
            p = self.doc.add_paragraph(f"[{titulo}]")
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif n.get("content"):
            for hijo in n["content"]:
                self.bloque(hijo, nivel_lista)

    def cerrar_notas(self) -> None:
        if not self.notas:
            return
        self.doc.add_paragraph("")
        p = self.doc.add_paragraph("Notas")
        p.runs[0].bold = True
        for i, texto in enumerate(self.notas, start=1):
            q = self.doc.add_paragraph()
            r = q.add_run(str(i))
            r.font.superscript = True
            q.add_run(f" {texto}")
            q.paragraph_format.space_after = Pt(2)


def _como_cambio(run, clase: str, marca: dict, ident: int) -> None:
    """Envuelve el `w:r` en `w:ins` o `w:del` (en una supresión, el texto va como `w:delText`)."""
    attrs = marca.get("attrs") or {}
    envoltorio = OxmlElement(f"w:{clase}")
    envoltorio.set(qn("w:id"), str(ident))
    envoltorio.set(qn("w:author"), str(attrs.get("autor") or "Qillqa")[:255])
    fecha = str(attrs.get("en") or "")[:19]
    envoltorio.set(qn("w:date"), (fecha if len(fecha) == 19 else "2026-01-01T00:00:00") + "Z")
    r = run._r  # noqa: SLF001 — el elemento XML del run
    padre = r.getparent()
    padre.replace(r, envoltorio)
    envoltorio.append(r)
    if clase == "del":
        for t in r.findall(qn("w:t")):
            t.tag = qn("w:delText")


def _letra_pt(campos: dict | None) -> float:
    try:
        v = float(str((campos or {}).get("fmt_tamano") or "11").replace(",", "."))
        return v if 8 <= v <= 14 else 11.0
    except ValueError:
        return 11.0


def _margen_cm(campos: dict | None) -> float:
    try:
        v = float(str((campos or {}).get("fmt_margenes") or "").replace(",", "."))
        return v if 1 <= v <= 4 else 2.54
    except ValueError:
        return 2.54


def documento_a_docx(campos: dict | None, cuerpo: dict | None, *, titulo: str = "", tipo_nombre: str = "", numero_completo: str = "") -> bytes:
    """Un documento de Gestión documental como .docx: encabezado con lo que el formulario sabe (número,
    lugar y fecha, destinatario, asunto, referencia), el cuerpo, «Atentamente,» y el cierre (Adj., c.c.,
    iniciales). Márgenes y letra del formato del documento."""
    c = dict(campos or {})
    doc = Document()
    for s in doc.sections:
        s.left_margin = s.right_margin = Cm(_margen_cm(c))
        s.top_margin = s.bottom_margin = Cm(2.5)
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(_letra_pt(c))
    if titulo:
        doc.core_properties.title = titulo
    if numero_completo:
        p = doc.add_paragraph()
        p.add_run(numero_completo).bold = True
    elif tipo_nombre:
        p = doc.add_paragraph()
        p.add_run(f"{tipo_nombre.upper()} N.° ___").bold = True
    if c.get("lugar") or c.get("fecha"):
        p = doc.add_paragraph(", ".join(x for x in (c.get("lugar"), _fecha_larga(c.get("fecha"))) if x))
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    bloque_dest = [c.get("destinatario_tratamiento"), c.get("destinatario_nombre"), c.get("destinatario_cargo"), c.get("destinatario_institucion")]
    if any(bloque_dest):
        for i, linea in enumerate(x for x in bloque_dest if x):
            for sub in str(linea).splitlines():
                p = doc.add_paragraph(sub)
                p.paragraph_format.space_after = Pt(0)
                if i == 1:
                    for r in p.runs:
                        r.bold = True
        doc.add_paragraph("Presente.-")
    for clave, rotulo in (("asunto", "ASUNTO"), ("sumilla", "ASUNTO"), ("referencia", "REFERENCIA")):
        if c.get(clave):
            p = doc.add_paragraph()
            p.add_run(f"{rotulo}: ").bold = True
            p.add_run(str(c[clave]).replace("\n", "; "))
    escritor = _Escritor(doc, _letra_pt(c))
    for n in (cuerpo or {}).get("content") or []:
        escritor.bloque(n)
    if any(bloque_dest):
        doc.add_paragraph("")
        doc.add_paragraph("Atentamente,")
        doc.add_paragraph("")
        doc.add_paragraph("")
    for clave, rotulo in (("anexo", "Adj.: "), ("con_copia", "c.c.: ")):
        if c.get(clave):
            lineas = str(c[clave]).splitlines()
            doc.add_paragraph(rotulo + lineas[0])
            for extra in lineas[1:]:
                doc.add_paragraph("        " + extra)
    if c.get("iniciales"):
        doc.add_paragraph(str(c["iniciales"]))
    escritor.cerrar_notas()
    salida = io.BytesIO()
    doc.save(salida)
    return salida.getvalue()


def partes_a_docx(titulo: str, partes: list[tuple[str, dict | None]]) -> bytes:
    """Varias partes (un proyecto de ley: cada una con su rótulo y su JSON) en un solo .docx."""
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(11)
    if titulo:
        doc.add_heading(titulo, level=1)
    escritor = _Escritor(doc)
    for rotulo, cuerpo in partes:
        if rotulo:
            doc.add_heading(rotulo, level=2)
        for n in (cuerpo or {}).get("content") or []:
            escritor.bloque(n)
    escritor.cerrar_notas()
    salida = io.BytesIO()
    doc.save(salida)
    return salida.getvalue()


def _fecha_larga(iso: str | None) -> str:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", iso or "")
    if not m:
        return iso or ""
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    return f"{int(m.group(3))} de {meses[int(m.group(2)) - 1]} de {m.group(1)}"


def nombre_docx(numero_completo: str, asunto: str, tipo_nombre: str = "") -> str:
    base = numero_completo or tipo_nombre or "documento"
    resumen = re.sub(r"[^\wÁÉÍÓÚÑáéíóúñ ]+", "", asunto or "")[:40].strip().replace(" ", "-")
    nombre = re.sub(r"[^\w.-]+", "-", f"{base}{'_' + resumen if resumen else ''}")
    return f"{nombre}.docx"

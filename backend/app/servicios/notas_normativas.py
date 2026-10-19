"""Notas al pie de sustento normativo que Qillqa OFRECE (nunca inserta solo) según el tipo y el
contenido del documento (2026-10-18, Edison: «identificar los tipos de documento donde corresponde una
nota de sustento normativo y ofrecerla automáticamente»).

Cada nota declara dónde aplica (tipos y una señal en el asunto o el cuerpo), cómo se reconoce que ya
está puesta, el texto fiel a la edición oficial y su fuente en la biblioteca: `calibre_id` (el archivo) y
la clave de cita de Zotero (los metadatos; N 9.6). Antes de ofrecerla se comprueba que la fuente exista
en Calibre (`biblioteca.obtener`): una nota sin fuente verificada no se ofrece. La persona la edita como
cualquier nota antes de emitir.
"""
from __future__ import annotations

import re

NOTAS: list[dict] = [
    {
        "clave": "pedido_informacion_art159",
        "titulo": "Reiteración del pedido de información (Reglamento de la Cámara de Diputados, art. 159, lit. e)",
        # Por omisión (Edison, 2026-10-19: «solo en oficios que piden información»): los cuatro oficios. El
        # administrador puede ampliar la lista en Administración → Reglas (`ajustes.notas_normativas`).
        "tipos": ("oficio", "oficio_multiple", "oficio_bancada", "oficio_multiple_bancada"),
        # Señales de un pedido de información (art. 159), su reiteración o su seguimiento: la expresión, la
        # norma, el acceso a la información o el «pedido de informe».
        "aplica": r"pedidos? de informaci|pedidos? de informes?\b|solicit\w*\s+(?:\S+\s+){0,5}informaci[oó]n|informaci[oó]n\s+(?:solicitada|requerida)|art[ií]culo\s+159|acceso a la informaci[oó]n p[uú]blica|reiter\w*\s+(?:el|del|al|mi|nuestro|su|dicho)\s+(?:pedido|requerimiento)|seguimiento\s+(?:al|del)\s+pedido",
        "ya_presente": r"reiteraci[oó]n del pedido|literal e\)",
        "texto": (
            "Conforme al artículo 159, literal e), segundo párrafo, del Reglamento de la Cámara de Diputados, "
            "si dentro de los quince días posteriores el titular de la entidad se niega a responder, la Mesa "
            "Directiva procede a la reiteración del pedido; transcurridos siete días después de la reiteración, "
            "el titular de la entidad está obligado a responder personalmente, según corresponda, ante el Pleno "
            "o ante la comisión ordinaria vinculada con el asunto motivo del pedido, bajo responsabilidad, "
            "conforme a ley."
        ),
        "fuente": {
            "calibre_id": 10090,
            "zotero": "congresodelarepublicaReglamentoCamaraDiputados2026",
            "cita": "Reglamento de la Cámara de Diputados (edición oficial 2026), artículo 159, literal e), segundo párrafo",
        },
    },
]


def texto_de(nodo) -> str:
    """El texto llano de un cuerpo TipTap (sin el de las notas al pie)."""
    if isinstance(nodo, dict):
        if nodo.get("type") == "footnote":
            return ""
        if nodo.get("type") == "text":
            return str(nodo.get("text") or "")
        return " ".join(texto_de(h) for h in (nodo.get("content") or []))
    if isinstance(nodo, list):
        return " ".join(texto_de(h) for h in nodo)
    return ""


def notas_de(nodo) -> str:
    """El texto de las notas al pie que ya tiene el cuerpo."""
    if isinstance(nodo, dict):
        if nodo.get("type") == "footnote":
            return str((nodo.get("attrs") or {}).get("texto") or "")
        return " ".join(notas_de(h) for h in (nodo.get("content") or []))
    if isinstance(nodo, list):
        return " ".join(notas_de(h) for h in nodo)
    return ""


CLAVE_AJUSTE = "notas_normativas"


def catalogo(tipos: dict[str, list[str]] | None = None) -> list[dict]:
    """El catálogo para Administración: cada nota con su título, fuente, texto, los tipos por omisión y
    los vigentes (`tipos`: lo guardado en el ajuste, clave → lista)."""
    return [{
        "clave": n["clave"], "titulo": n["titulo"], "texto": n["texto"], "fuente": n["fuente"],
        "tipos_defecto": list(n["tipos"]), "tipos": list((tipos or {}).get(n["clave"], n["tipos"])),
    } for n in NOTAS]


async def tipos_vigentes(sesion) -> dict[str, list[str]]:
    """Clave de nota → tipos donde se ofrece: lo que el administrador guardó o, si no, lo de fábrica."""
    from app.modelos import Ajuste

    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": CLAVE_AJUSTE})
    guardado = dict(fila.valor or {}) if fila else {}
    return {n["clave"]: list(guardado.get(n["clave"], n["tipos"])) for n in NOTAS}


def sugerir(tipo: str, campos: dict | None, cuerpo: dict | None, verificar=None, tipos: dict[str, list[str]] | None = None) -> list[dict]:
    """Las notas que corresponden a este documento. `verificar(calibre_id) -> bool` dice si la fuente
    está en la biblioteca (por omisión, `biblioteca.obtener`); sin fuente, la nota no se ofrece.
    `tipos` (clave → tipos) es lo vigente en Administración; sin él, lo de fábrica. `ya_presente` dice
    que el cuerpo ya la lleva (se informa, no se ofrece otra vez). Pura salvo `verificar`."""
    if verificar is None:
        from app.servicios import biblioteca

        def verificar(cid: int) -> bool:  # noqa: E306
            try:
                return biblioteca.obtener(cid) is not None
            except Exception:  # noqa: BLE001 — sin biblioteca no se ofrece
                return False

    c = campos or {}
    texto = " ".join(str(c.get(k) or "") for k in ("asunto", "referencia")) + " " + texto_de(cuerpo or {})
    notas_existentes = notas_de(cuerpo or {})
    salida: list[dict] = []
    for n in NOTAS:
        donde = (tipos or {}).get(n["clave"], n["tipos"])
        if tipo not in donde or not re.search(n["aplica"], texto, re.I):
            continue
        if not verificar(n["fuente"]["calibre_id"]):
            continue
        salida.append({
            "clave": n["clave"], "titulo": n["titulo"], "texto": n["texto"], "fuente": n["fuente"],
            "ya_presente": bool(re.search(n["ya_presente"], notas_existentes, re.I)),
        })
    return salida

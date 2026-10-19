"""Exportar a Markdown lo que el editor guarda (2026-10-19; fase 8 del editor integrado): el mismo
recorrido del JSON de TipTap que el Word, pero a texto llano con marcas de Markdown. Para pegarlo en un
prompt, en el chat o en una nota; sin pretensión de fidelidad tipográfica (eso es el PDF).
"""
from __future__ import annotations

from typing import Any


def _linea(hijos: list[dict], notas: list[str]) -> str:
    partes: list[str] = []
    for h in hijos or []:
        t = h.get("type")
        if t == "text":
            s = str(h.get("text") or "")
            marcas = {m.get("type"): m for m in (h.get("marks") or [])}
            if "supresion" in marcas:
                s = f"~~{s}~~"
            if "bold" in marcas:
                s = f"**{s}**"
            if "italic" in marcas:
                s = f"*{s}*"
            if "strike" in marcas and "supresion" not in marcas:
                s = f"~~{s}~~"
            if "link" in marcas:
                href = (marcas["link"].get("attrs") or {}).get("href") or ""
                if href:
                    s = f"[{s}]({href})"
            partes.append(s)
        elif t == "hardBreak":
            partes.append("  \n")
        elif t == "footnote":
            notas.append(str((h.get("attrs") or {}).get("texto") or ""))
            partes.append(f"[^{len(notas)}]")
        elif t == "referencia":
            partes.append(_linea(h.get("content") or [], notas) or str((h.get("attrs") or {}).get("texto") or ""))
        elif h.get("content"):
            partes.append(_linea(h["content"], notas))
    return "".join(partes)


def _bloques(nodos: list[dict], notas: list[str], nivel: int = 0) -> list[str]:
    salida: list[str] = []
    sangria = "  " * nivel
    for n in nodos or []:
        t = n.get("type")
        attrs = n.get("attrs") or {}
        if t == "paragraph":
            salida.append(sangria + _linea(n.get("content") or [], notas))
        elif t == "heading":
            salida.append("#" * min(max(int(attrs.get("level") or 2), 1), 6) + " " + _linea(n.get("content") or [], notas))
        elif t in ("bulletList", "orderedList"):
            for i, item in enumerate(n.get("content") or [], start=1):
                vineta = "-" if t == "bulletList" else f"{i}."
                hijos = item.get("content") or []
                primero = True
                for hijo in hijos:
                    if hijo.get("type") == "paragraph" and primero:
                        salida.append(f"{sangria}{vineta} {_linea(hijo.get('content') or [], notas)}")
                        primero = False
                    else:
                        salida.extend(_bloques([hijo], notas, nivel + 1))
        elif t == "table":
            filas = [f for f in (n.get("content") or []) if f.get("type") == "tableRow"]
            for i, f in enumerate(filas):
                celdas = [" ".join(_linea(h.get("content") or [], notas) for h in (c.get("content") or [])) for c in (f.get("content") or [])]
                salida.append("| " + " | ".join(celdas) + " |")
                if i == 0:
                    salida.append("|" + "---|" * len(celdas))
            salida.append("")
        elif t == "saltoPagina":
            salida.append("\n---\n")
        elif t == "fotografia":
            salida.append(f"![{attrs.get('titulo') or 'Fotografía'}]()")
        elif t == "blockquote":
            salida.extend("> " + x for x in _bloques(n.get("content") or [], notas, 0))
        elif n.get("content"):
            salida.extend(_bloques(n["content"], notas, nivel))
        if t in ("paragraph", "heading") and nivel == 0:
            salida.append("")
    return salida


def cuerpo_a_md(cuerpo: dict | None, notas: list[str] | None = None) -> str:
    """El cuerpo del editor como Markdown; las notas al pie como `[^n]` con su lista al final."""
    notas = notas if notas is not None else []
    lineas = _bloques((cuerpo or {}).get("content") or [], notas)
    texto = "\n".join(lineas).strip() + "\n"
    if notas:
        texto += "\n" + "\n".join(f"[^{i}]: {t}" for i, t in enumerate(notas, start=1)) + "\n"
    return texto


def documento_a_md(campos: dict | None, cuerpo: dict | None, titulo: str = "", numero_completo: str = "") -> str:
    c = dict(campos or {})
    cab: list[str] = []
    if numero_completo or titulo:
        cab.append(f"# {numero_completo or titulo}")
        cab.append("")
    for clave, rotulo in (("fecha", "Fecha"), ("destinatario_nombre", "Para"), ("destinatario_cargo", "Cargo"), ("destinatario_institucion", "Institución"), ("asunto", "Asunto"), ("referencia", "Referencia")):
        if c.get(clave):
            cab.append(f"**{rotulo}:** {str(c[clave]).strip()}  ")
    if cab:
        cab += ["", ""]   # una línea en blanco entre el encabezado y el cuerpo
    return "\n".join(cab) + cuerpo_a_md(cuerpo)


def partes_a_md(titulo: str, partes: list[tuple[str, dict | None]]) -> str:
    notas: list[str] = []
    salida = [f"# {titulo}", ""] if titulo else []
    for rotulo, cuerpo in partes:
        if rotulo:
            salida += [f"## {rotulo}", ""]
        salida.append(cuerpo_a_md(cuerpo, notas).rstrip())
        salida.append("")
    texto = "\n".join(salida).strip() + "\n"
    return texto

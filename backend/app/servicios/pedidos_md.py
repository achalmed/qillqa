"""Los PEDIDOS de una Semana de Representación en Markdown (Edison 2026-10-05:
«poder descargar los pedidos en .md para compartirlos»). Texto plano que se lee
bien en cualquier lado (WhatsApp, correo, Obsidian, GitHub): un resumen por
estado y los pedidos agrupados por la actividad en que se recogieron, con sus
entidades, prioridad, responsable, plazo, estado y el oficio que los derivó.

Puro: recibe los datos ya leídos (api/semanas_sr.py los junta) y devuelve el
texto. Pruebas en tests/test_pedidos_md.py.
"""

from __future__ import annotations

import unicodedata
from collections import Counter
from dataclasses import dataclass

ESTADOS = ["registrado", "derivado", "respondido", "cerrado"]
_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre"]


def _fecha(iso: str) -> str:
    """«2026-09-14» → «14 de septiembre de 2026» (el resto, tal cual)."""
    if len(iso or "") >= 10 and iso[4] == "-" and iso[7] == "-" and iso[:4].isdigit():
        try:
            return f"{int(iso[8:10])} de {_MESES[int(iso[5:7]) - 1]} de {iso[:4]}"
        except (ValueError, IndexError):
            pass
    return iso or ""


def _texto(v) -> str:
    """Una celda en una línea: listas unidas con coma, sin saltos ni «|» que rompan tablas."""
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v if str(x).strip())
    return " ".join(str(v or "").split()).replace("|", "/")


def _entidades(datos: dict) -> str:
    return _texto(datos.get("entidades")) or _texto(datos.get("entidades_texto"))


# --- Opciones de la descarga (Edison 2026-10-08: «que me permita elegir qué información quiero
# descargar en el Markdown: solo demandas con sus fechas, demandas con instituciones…, o de qué
# fecha o de qué instituciones») ------------------------------------------------------------
DETALLES = ("fecha", "lugar", "entidades", "prioridad", "responsable", "plazo", "estado", "oficio", "actuacion", "observaciones")
DETALLES_DEFECTO = ("entidades", "prioridad", "responsable", "plazo", "estado", "oficio", "actuacion", "observaciones")
AGRUPAR = ("actividad", "entidad", "estado", "fecha", "ninguno")


@dataclass
class Opciones:
    """Qué entra al .md. Por omisión, lo de siempre: todo, agrupado por actividad."""
    detalles: tuple[str, ...] = DETALLES_DEFECTO
    agrupar: str = "actividad"
    resumen: bool = True
    desde: str = ""          # AAAA-MM-DD (fecha de la actividad)
    hasta: str = ""
    entidad: str = ""        # texto: solo los pedidos dirigidos a esa entidad
    estados: tuple[str, ...] = ()
    prioridades: tuple[str, ...] = ()

    @classmethod
    def desde_consulta(cls, detalles: str | None, agrupar: str | None, resumen: bool | None, desde: str | None,
                       hasta: str | None, entidad: str | None, estados: str | None, prioridades: str | None) -> "Opciones":
        lista = lambda t: tuple(x.strip().lower() for x in (t or "").split(",") if x.strip())  # noqa: E731
        return cls(
            detalles=tuple(d for d in lista(detalles) if d in DETALLES) if detalles is not None else DETALLES_DEFECTO,
            agrupar=agrupar if agrupar in AGRUPAR else "actividad",
            resumen=True if resumen is None else resumen,
            desde=(desde or "")[:10], hasta=(hasta or "")[:10], entidad=(entidad or "").strip(),
            estados=lista(estados), prioridades=lista(prioridades),
        )


def _plano(t: str) -> str:
    t = unicodedata.normalize("NFD", t or "")
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def _filtrar(actividades: list[dict], pedidos: list[dict], op: Opciones) -> list[dict]:
    fecha_de = {a["codigo"]: _texto((a.get("datos") or {}).get("fecha"))[:10] for a in actividades}
    salida = []
    for p in pedidos:
        d = p["datos"]
        fecha = fecha_de.get(d.get("actividad") or "", "")
        if op.desde and (not fecha or fecha < op.desde):
            continue
        if op.hasta and (not fecha or fecha > op.hasta):
            continue
        if op.entidad and _plano(op.entidad) not in _plano(_entidades(d)):
            continue
        if op.estados and (d.get("estado") or "registrado").lower() not in op.estados:
            continue
        if op.prioridades and _texto(d.get("prioridad_propuesta")).lower() not in op.prioridades:
            continue
        salida.append(p)
    return salida


def _lugar(d: dict) -> str:
    return ", ".join(x for x in (_texto(d.get("localidad") or d.get("lugar")), _texto(d.get("distrito")), _texto(d.get("provincia"))) if x)


def _pedido(p: dict, act: dict | None, op: Opciones) -> list[str]:
    d = p["datos"]
    a = (act or {}).get("datos") or {}
    valores = {
        "fecha": _fecha(_texto(a.get("fecha"))),
        "lugar": _lugar(a),
        "entidades": _entidades(d),
        "prioridad": _texto(d.get("prioridad_propuesta")),
        "responsable": _texto(d.get("responsable")),
        "plazo": _fecha(_texto(d.get("plazo"))),
        "estado": _texto(d.get("estado") or "registrado").capitalize(),
        "oficio": _texto(p.get("oficio") or d.get("documento_salida")),
        "actuacion": _texto(d.get("actuacion")),
        "observaciones": _texto(d.get("observaciones")),
    }
    nombres = {"fecha": "Fecha", "lugar": "Lugar", "entidades": "Entidades", "prioridad": "Prioridad", "responsable": "Responsable",
               "plazo": "Plazo", "estado": "Estado", "oficio": "Oficio", "actuacion": "Actuación", "observaciones": "Observaciones"}
    lineas = ["", f"**{p['codigo']}.** {_texto(d.get('pedido')) or '(sin texto)'}"]
    lineas += [f"- {nombres[k]}: {valores[k]}" for k in op.detalles if valores.get(k)]
    return lineas


def semana_md(semana: dict, actividades: list[dict], pedidos: list[dict], *, encabezado: int = 1,
              op: Opciones | None = None) -> str:
    """Una semana: `semana` = {codigo, tema, fecha_inicio, fecha_fin}; `actividades` =
    [{codigo, datos}]; `pedidos` = [{codigo, datos, oficio}] (oficio: su número o '')."""
    op = op or Opciones()
    pedidos = _filtrar(actividades, pedidos, op)
    h = "#" * encabezado
    lineas = [f"{h} Pedidos de la {semana.get('codigo', '')} — {semana.get('tema', '')}".rstrip(" —")]
    periodo = " al ".join(x for x in (_fecha(semana.get("fecha_inicio", "")), _fecha(semana.get("fecha_fin", ""))) if x)
    lineas.append("")
    lineas.append(f"Semana de Representación{f' del {periodo}' if periodo else ''} · {len(pedidos)} pedido(s).")
    if not pedidos:
        lineas += ["", "_Sin pedidos registrados._" if op == Opciones() else "_Ningún pedido cumple lo elegido._", ""]
        return "\n".join(lineas)

    if op.resumen:
        cuenta = Counter((p["datos"].get("estado") or "registrado") for p in pedidos)
        lineas += ["", "| Estado | Pedidos |", "|---|---:|"]
        for e in ESTADOS + sorted(set(cuenta) - set(ESTADOS)):
            if cuenta.get(e):
                lineas.append(f"| {e.capitalize()} | {cuenta[e]} |")

    por_codigo = {a["codigo"]: a for a in actividades}
    act_de = lambda p: por_codigo.get(p["datos"].get("actividad") or "")  # noqa: E731

    if op.agrupar == "actividad":
        grupos: dict[str, list[dict]] = {}
        for p in pedidos:
            grupos.setdefault(p["datos"].get("actividad") or "", []).append(p)
        orden = [a["codigo"] for a in actividades if a["codigo"] in grupos] + [k for k in grupos if k not in por_codigo]
        for codigo in orden:
            act = por_codigo.get(codigo)
            lineas.append("")
            if act:
                d = act.get("datos") or {}
                detalle = " · ".join(x for x in (_lugar(d), _fecha(_texto(d.get("fecha")))) if x)
                lineas.append(f"{h}# {codigo} · {_texto(d.get('titulo')) or 'Actividad'}")
                if detalle:
                    lineas += ["", f"_{detalle}_"]
            else:
                lineas.append(f"{h}# Sin actividad asociada")
            for p in grupos[codigo]:
                lineas += _pedido(p, act, op)
    elif op.agrupar == "ninguno":
        for p in pedidos:
            lineas += _pedido(p, act_de(p), op)
    else:
        def claves(p: dict) -> list[str]:
            d = p["datos"]
            if op.agrupar == "entidad":
                return [x.strip() for x in _entidades(d).split(",") if x.strip()] or ["Sin entidad"]
            if op.agrupar == "estado":
                return [_texto(d.get("estado") or "registrado").capitalize()]
            return [_fecha(_texto(((act_de(p) or {}).get("datos") or {}).get("fecha"))[:10]) or "Sin fecha"]
        grupos = {}
        for p in pedidos:
            for k in claves(p):
                grupos.setdefault(k, []).append(p)
        orden = sorted(grupos, key=lambda k: (k.startswith("Sin "), -len(grupos[k]) if op.agrupar == "entidad" else 0, k))
        if op.agrupar == "fecha":
            fechas = {k: min(_texto(((act_de(p) or {}).get("datos") or {}).get("fecha")) or "9" for p in v) for k, v in grupos.items()}
            orden = sorted(grupos, key=lambda k: fechas[k])
        for k in orden:
            lineas += ["", f"{h}# {k} ({len(grupos[k])})"]
            for p in grupos[k]:
                lineas += _pedido(p, act_de(p), op)
    lineas.append("")
    return "\n".join(lineas)


def varias_md(semanas: list[tuple[dict, list[dict], list[dict]]], generado: str, op: Opciones | None = None) -> str:
    """Todas las semanas en un archivo, la más reciente primero."""
    op = op or Opciones()
    total = sum(len(_filtrar(a, p, op)) for _, a, p in semanas)
    partes = [f"# Pedidos de las Semanas de Representación", "", f"{len(semanas)} semana(s) · {total} pedido(s) · al {_fecha(generado)}.", ""]
    for s, a, p in semanas:
        partes.append(semana_md(s, a, p, encabezado=2, op=op))
    return "\n".join(partes)

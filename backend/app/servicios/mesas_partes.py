"""MESA DE PARTES DEL DESTINATARIO (2026-10-06, pedido de Edison: «que sea fácil acceder desde la
redacción del documento al enlace de la mesa de partes, sin abrir el Directorio»).

El destinatario de un documento se guarda como texto (nombre, cargo, institución), no como un
vínculo al directorio. Aquí se reconoce su institución y se busca su mesa de partes virtual:

1. La PERSONA del directorio con ese nombre (nombre y dos apellidos al menos) → su institución.
2. Si no, la institución nombrada en el texto (`entradas.cruzar_remitente`, el mismo cruce del
   remitente de los recibidos).
3. Si no, el CARGO de autoridad: «Alcalde Distrital de X» → «Municipalidad Distrital de X»,
   «Gobernador Regional de X» → «Gobierno Regional de X», «Ministro de X» → «Ministerio de X»,
   «Director Regional de Educación de X» → «Dirección Regional de Educación de X».

La mesa de partes es la de la institución o, si una dependencia no tiene la suya, la de la entidad
de la que depende (se sube por `parent_id`): `url_mesa_partes` o un enlace de tipo `mesa_partes`.
Puras salvo `cargar`; probadas en tests/test_mesas_partes.py.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.servicios.entradas import cruzar_remitente, normalizar

NIVELES_ARRIBA = 4


@dataclass
class Directorio:
    """Lo que hace falta del directorio, en memoria (unas 2000 instituciones: cabe)."""

    instituciones: dict[int, dict] = field(default_factory=dict)
    personas: list[dict] = field(default_factory=list)
    mesas_por_enlace: dict[int, str] = field(default_factory=dict)


async def cargar(sesion: AsyncSession) -> Directorio:
    from app.modelos import Enlace, Institucion, Persona

    d = Directorio()
    for i in (await sesion.execute(select(Institucion).where(Institucion.activo.is_(True)))).scalars():
        d.instituciones[i.id] = {
            "id": i.id, "nombre": i.nombre, "siglas": i.siglas or "", "parent_id": i.parent_id,
            "url_mesa_partes": i.url_mesa_partes or "", "url_oficial": i.url_oficial or "",
            "recepcion_canal": i.recepcion_canal or "", "recepcion_dato": i.recepcion_dato or "",
            "recepcion_nota": i.recepcion_nota or "",
            "email": i.email or "", "telefono": i.telefono or "",
        }
    for p in (await sesion.execute(select(Persona).where(Persona.activo.is_(True)))).scalars():
        d.personas.append({"id": p.id, "nombre": p.nombre, "cargo": p.cargo or "", "institucion_id": p.institucion_id,
                           "email": p.email or "", "celular": p.celular or "", "telefono": p.telefono or ""})
    for e in (await sesion.execute(select(Enlace).where(Enlace.tipo == "mesa_partes"))).scalars():
        d.mesas_por_enlace.setdefault(e.institucion_id, e.url)
    return d


def destinos_de(campos: dict) -> list[dict]:
    """Los destinatarios de un documento: [{nombre, cargo, institucion}]. Varios van en líneas de
    `destinatario_nombre` como «Nombre — Cargo u órgano» (formulario del destinatario)."""
    lineas = [l.strip() for l in (campos.get("destinatario_nombre") or "").splitlines() if l.strip()]
    institucion = (campos.get("destinatario_institucion") or "").strip()
    if len(lineas) > 1:
        salida = []
        for l in lineas:
            nombre, _, cargo = l.partition(" — ")
            salida.append({"nombre": nombre.strip(), "cargo": cargo.strip(), "institucion": ""})
        return salida
    if not lineas and not institucion:
        return []
    nombre = lineas[0] if lineas else ""
    cargo = (campos.get("destinatario_cargo") or "").strip()
    if " — " in nombre:
        nombre, _, cargo2 = nombre.partition(" — ")
        cargo = cargo or cargo2
    return [{"nombre": nombre.strip(), "cargo": cargo.strip(), "institucion": institucion}]


# «Alcalde Distrital de Chaclacayo» → «Municipalidad Distrital de Chaclacayo»…
_CARGOS = (
    (re.compile(r"\balcalde(?:sa)?\s+(distrital|provincial)\s+de\s+(.+)", re.I), r"municipalidad \1 de \2"),
    (re.compile(r"\balcalde(?:sa)?\s+de\s+(?:la\s+)?municipalidad\s+(.+)", re.I), r"municipalidad \1"),
    (re.compile(r"\bgobernador(?:a)?\s+regional\s+de\s+(.+)", re.I), r"gobierno regional de \1"),
    (re.compile(r"\bministr[oa]\s+de\s+(.+)", re.I), r"ministerio de \1"),
    (re.compile(r"\bdirector(?:a)?\s+regional\s+de\s+(.+)", re.I), r"dirección regional de \1"),
    (re.compile(r"\badministrador(?:a)?\s+local\s+de\s+agua\s+(.+)", re.I), r"administración local de agua \1"),
)


def _por_cargo(cargo: str, por_nombre: dict[str, int]) -> int | None:
    for patron, plantilla in _CARGOS:
        m = patron.search(cargo or "")
        if m:
            buscado = normalizar(m.expand(plantilla)).strip(" .,")
            if buscado in por_nombre:
                return por_nombre[buscado]
    return None


def reconocer(destino: dict, d: Directorio) -> tuple[dict | None, dict | None, str]:
    """(institución, persona, cómo se reconoció) de un destinatario."""
    n = normalizar(destino.get("nombre", ""))
    if len(n.split()) >= 3:
        for p in d.personas:
            if normalizar(p["nombre"]) == n and p["institucion_id"] in d.instituciones:
                return d.instituciones[p["institucion_id"]], p, "persona del directorio"
    texto = "\n".join(x for x in (destino.get("institucion", ""), destino.get("cargo", ""), destino.get("nombre", "")) if x)
    insts = [(i["id"], i["nombre"], i["siglas"]) for i in d.instituciones.values()]
    r = cruzar_remitente(texto, insts, [])
    if r.institucion_id:
        return d.instituciones[r.institucion_id], None, "institución nombrada"
    por_nombre = {normalizar(i["nombre"]): i["id"] for i in d.instituciones.values()}
    # El cargo, o el nombre cuando el destinatario es el propio cargo («Director Regional de…»).
    iid = _por_cargo(destino.get("cargo", ""), por_nombre) or _por_cargo(destino.get("nombre", ""), por_nombre)
    if iid:
        return d.instituciones[iid], None, "cargo de autoridad"
    return None, None, ""


def mesa_de(inst: dict, d: Directorio) -> tuple[str, dict | None]:
    """(url, institución que la tiene): la propia o la de una entidad superior."""
    actual: dict | None = inst
    for _ in range(NIVELES_ARRIBA + 1):
        if actual is None:
            break
        url = actual["url_mesa_partes"] or d.mesas_por_enlace.get(actual["id"], "")
        if url:
            return url, actual
        actual = d.instituciones.get(actual["parent_id"]) if actual["parent_id"] else None
    return "", None


def resolver(campos: dict, d: Directorio) -> list[dict]:
    """Por destinatario: su institución, su mesa de partes y los contactos que hay."""
    salida = []
    for destino in destinos_de(campos):
        inst, persona, como = reconocer(destino, d)
        url, de = mesa_de(inst, d) if inst else ("", None)
        salida.append({
            "destino": destino,
            "institucion": {k: inst.get(k, "") for k in ("id", "nombre", "siglas", "url_oficial", "email", "telefono", "recepcion_canal", "recepcion_dato", "recepcion_nota")} if inst else None,
            "persona": persona,
            "como": como,
            "mesa_partes": url,
            # Si la mesa es la de la entidad superior, se dice cuál.
            "mesa_de": de["nombre"] if de and inst and de["id"] != inst["id"] else "",
        })
    return salida

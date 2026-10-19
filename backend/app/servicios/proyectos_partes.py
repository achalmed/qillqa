"""PARTES EDITABLES de un proyecto (2026-10-19, Edison: «añadir, quitar, renombrar y reordenar las
partes de cada proyecto, con el mayor control posible»).

Las partes ya viven POR PROYECTO en `proyecto_secciones` (clave, título, grupo, orden): la plantilla
(`proyectos_plantillas.SECCIONES_PL`) solo dice con cuáles nace un proyecto. Aquí, la lógica pura:
la clave de una parte nueva, qué partes de la plantilla se pueden restaurar, cómo se normaliza un
orden pedido y qué se puede mover. Reglas:

  · La CLAVE es la identidad de la parte y no cambia nunca: va en el nombre del texto compartido
    (`pl:<pid>:<clave>:<gen>`), en las relaciones (`seccion:<clave>`), en la actividad y en las
    tareas. Renombrar cambia solo el título. Una parte nueva recibe una clave derivada del título
    (`objetivos-y-sectores`), única en el proyecto y distinta de las de la plantilla: así el
    generador nunca la confunde con una parte del esquema.
  · El ORDEN del panel manda en el PDF, salvo en la fórmula legal: título preliminar, parte
    sustantiva y las disposiciones finales → transitorias → modificatorias → derogatorias llevan el
    orden de la técnica legislativa (Manual, sec. VI; el esquema LaTeX lo exige). Esas partes
    «fijas» no se arrastran; una parte nueva de la fórmula se coloca entre ellas donde se quiera.
  · Los GRUPOS no se cruzan: fórmula legal → exposición de motivos → complementos.
  · Se quita cualquier parte que no sea obligatoria (el título de la ley y la parte sustantiva lo
    son); con texto, solo confirmando. Las versiones se van con ella (FK en cascada), el texto
    compartido se borra y sus citas dejan de ser fuentes del proyecto.

Pruebas: tests/test_proyectos_partes.py.
"""

from __future__ import annotations

import re
import unicodedata

from app.servicios.proyectos_plantillas import PLANTILLAS

GRUPOS_ORDEN = ("formula", "exposicion", "final")
_NO_CLAVE = re.compile(r"[^a-z0-9]+")
LARGO_CLAVE = 30


def plantilla_de(tipo: str) -> dict[str, tuple[str, str, bool]]:
    """{clave: (título, grupo, obligatoria)} de la plantilla del tipo de proyecto."""
    return {c: (t, g, o) for c, t, g, o in PLANTILLAS.get(tipo, {}).get("secciones", [])}


def slug(titulo: str) -> str:
    """«Objetivos y sectores comprendidos» → «objetivos-y-sectores-comprendid» (≤ 30, sin tildes)."""
    plano = unicodedata.normalize("NFKD", titulo or "").encode("ascii", "ignore").decode().lower()
    base = _NO_CLAVE.sub("-", plano).strip("-")[:LARGO_CLAVE].strip("-")
    return base or "parte"


def clave_nueva(titulo: str, existentes: set[str], reservadas: set[str]) -> str:
    """La clave de una parte nueva: el slug del título, único en el proyecto y nunca una clave de
    la plantilla (esas se restauran, no se inventan)."""
    base = slug(titulo)
    ocupadas = set(existentes) | set(reservadas)
    if base not in ocupadas:
        return base
    n = 2
    while True:
        cand = f"{base[: LARGO_CLAVE - len(str(n)) - 1]}-{n}"
        if cand not in ocupadas:
            return cand
        n += 1


def disponibles(tipo: str, existentes: set[str]) -> list[dict]:
    """Las partes de la plantilla que el proyecto no tiene (se pueden restaurar), en su orden."""
    return [
        {"clave": c, "titulo": t, "grupo": g, "obligatoria": o}
        for c, t, g, o in PLANTILLAS.get(tipo, {}).get("secciones", [])
        if c not in existentes
    ]


def es_fija(tipo: str, clave: str, grupo: str) -> bool:
    """¿Su lugar lo fija la técnica legislativa? Las partes de la plantilla en la fórmula legal."""
    return grupo == "formula" and clave in plantilla_de(tipo)


def orden_oficial(tipo: str, claves: list[str]) -> list[str]:
    """Las claves dadas que son de la plantilla, en el orden de la plantilla."""
    pl = list(plantilla_de(tipo))
    return sorted((c for c in claves if c in pl), key=pl.index)


def normalizar_orden(tipo: str, partes: list[tuple[str, str]], pedido: list[str]) -> list[str] | None:
    """`partes`: [(clave, grupo)] vigentes; `pedido`: las mismas claves en el orden deseado.
    Devuelve el orden final (grupos sin cruzar, fijas de la fórmula en su orden oficial) o None si
    el pedido no es una permutación exacta de las partes vigentes."""
    claves = [c for c, _ in partes]
    if sorted(pedido) != sorted(claves) or len(set(pedido)) != len(pedido):
        return None
    grupo = dict(partes)
    pos = {c: i for i, c in enumerate(pedido)}
    fijas_pedido = [c for c in pedido if es_fija(tipo, c, grupo[c])]
    if fijas_pedido != orden_oficial(tipo, fijas_pedido):
        return None
    rango = lambda g: GRUPOS_ORDEN.index(g) if g in GRUPOS_ORDEN else len(GRUPOS_ORDEN)  # noqa: E731
    return sorted(claves, key=lambda c: (rango(grupo[c]), pos[c]))


def insertar(partes: list[tuple[str, str]], clave: str, grupo: str, despues_de: str = "") -> list[str]:
    """El orden con la parte nueva: tras `despues_de` si está en su grupo; si no, al final de su
    grupo (o del todo, si el grupo aún no tiene partes)."""
    claves = [c for c, _ in partes]
    grupos = dict(partes)
    if despues_de in claves and grupos.get(despues_de) == grupo:
        i = claves.index(despues_de) + 1
    else:
        del_grupo = [i for i, (c, g) in enumerate(partes) if g == grupo]
        if del_grupo:
            i = del_grupo[-1] + 1
        else:
            rango = GRUPOS_ORDEN.index(grupo) if grupo in GRUPOS_ORDEN else len(GRUPOS_ORDEN)
            i = next((k for k, (_, g) in enumerate(partes) if (GRUPOS_ORDEN.index(g) if g in GRUPOS_ORDEN else 99) > rango), len(partes))
    return claves[:i] + [clave] + claves[i:]

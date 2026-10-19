"""FUENTES ENLAZADAS de un proyecto (paso 4.6 de la hoja de ruta).

Una fuente puede citar, además de un texto libre, una CLAVE ESTABLE de otro
almacén del ecosistema, y Qillqa muestra lo que esa clave es hoy:

  zotero:ABCD1234                       una obra de Zotero: autoridad de la referencia y la cita
                                        (servicios/zotero.py); si Zotero la enlaza a un archivo de
                                        Calibre, se dice cuál (`calibre:N`, la ubicación del archivo)
  calibre:10086                         libro de la biblioteca (metadata.db): el ARCHIVO
  datafw:contexto-macro-peru@v1         paquete de resultados de datafw (inmutable)
  datafw:contexto-macro-peru@v1#pbi     … y un indicador suyo
  sgdp:doc:272                          un documento del propio Qillqa

Las bases ajenas se abren SOLO EN LECTURA (`mode=ro`) y si no están (Docker,
otra máquina) la fuente sigue valiendo: se ve la clave tal cual. Las rutas:
CALIBRE_DB y DATAFW_CATALOGO, o las del workspace (core/env.py) si existe.
"""

from __future__ import annotations

import importlib.util
import os
import re
import sqlite3
from pathlib import Path

RE_CLAVE = re.compile(
    r"^(calibre:(?P<calibre>\d+)"
    r"|datafw:(?P<estudio>[a-z0-9][a-z0-9_-]*)@(?P<version>v\d+)(?:#(?P<indicador>[\w.-]+))?"
    r"|sgdp:doc:(?P<doc>\d+)"
    r"|zotero:(?P<zotero>[A-Z0-9]{8}))$"
)


def es_clave(texto: str) -> bool:
    return bool(RE_CLAVE.match(texto.strip()))


def _workspace() -> object | None:
    d = Path(__file__).resolve()
    while d != d.parent and not (d / "core" / "env.py").exists():
        d = d.parent
    if not (d / "core" / "env.py").exists():
        return None
    try:
        spec = importlib.util.spec_from_file_location("core_env", d / "core" / "env.py")
        env = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(env)
        return env
    except Exception:
        return None


def rutas() -> dict[str, Path | None]:
    env = _workspace()
    calibre = os.environ.get("CALIBRE_DB") or (str(env.CALIBRE_DB) if env else "")
    datafw = os.environ.get("DATAFW_CATALOGO") or (str(env.DATAFW_DIR / "catalog" / "catalogo.sqlite") if env else "")
    return {
        "calibre": Path(calibre) if calibre and Path(calibre).is_file() else None,
        "datafw": Path(datafw) if datafw and Path(datafw).is_file() else None,
    }


def _leer(base: Path, sql: str, args: tuple) -> tuple | None:
    try:
        # as_uri() escapa espacios, «#» y «?» («datafw»): a mano, una ruta
        # con «#» se leería como fragmento y abriría otra base.
        con = sqlite3.connect(f"{base.resolve().as_uri()}?mode=ro", uri=True, timeout=2)
        try:
            return con.execute(sql, args).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        return None


def resolver(clave: str, bases: dict[str, Path | None] | None = None) -> dict | None:
    """{origen, titulo, detalle} de una clave externa (sin `sgdp:doc:`, que
    resuelve la API con su sesión). None si la clave no se reconoce o su base
    no está a mano."""
    m = RE_CLAVE.match((clave or "").strip())
    if not m:
        return None
    bases = bases if bases is not None else rutas()
    if m.group("calibre") and bases.get("calibre"):
        fila = _leer(
            bases["calibre"],
            "SELECT b.title, (SELECT group_concat(a.name, '; ') FROM books_authors_link l JOIN authors a ON a.id = l.author "
            "WHERE l.book = b.id), substr(b.pubdate, 1, 4) FROM books b WHERE b.id = ?",
            (int(m.group("calibre")),),
        )
        if fila:
            anio = fila[2] if fila[2] and fila[2] != "0101" else ""
            return {"origen": "Biblioteca", "titulo": fila[0], "detalle": ", ".join(x for x in (fila[1], anio) if x)}
    if m.group("zotero"):
        from app.servicios import zotero
        try:
            d = zotero.obtener(m.group("zotero"))
        except Exception:   # Zotero cerrado y sin copia: la fuente sigue valiendo, con su clave
            d = None
        if d:
            detalle = [", ".join(x for x in ("; ".join(d["autores"]), d["anio"]) if x)]
            if d.get("citekey"):
                detalle.append(f"@{d['citekey']}")
            if d.get("calibre_id") is not None:
                detalle.append(f"archivo en la biblioteca: calibre:{d['calibre_id']}")
            return {"origen": "Zotero", "titulo": d["titulo"], "detalle": " · ".join(x for x in detalle if x),
                    "cita": d["cita"], "calibre_id": d.get("calibre_id")}
    if m.group("estudio") and bases.get("datafw"):
        fila = _leer(
            bases["datafw"],
            "SELECT titulo, fecha, n_indicadores FROM resultados WHERE estudio = ? AND version = ?",
            (m.group("estudio"), m.group("version")),
        )
        if fila:
            partes = [f"{m.group('estudio')}@{m.group('version')}", fila[1] or ""]
            if m.group("indicador"):
                partes.insert(1, f"indicador {m.group('indicador')}")
            return {"origen": "Datos (datafw)", "titulo": fila[0], "detalle": " · ".join(p for p in partes if p)}
    return None


def documento_id(clave: str) -> int | None:
    m = RE_CLAVE.match((clave or "").strip())
    return int(m.group("doc")) if m and m.group("doc") else None

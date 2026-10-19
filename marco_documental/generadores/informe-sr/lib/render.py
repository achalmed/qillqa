"""lib/render.py — Motor de plantillas Jinja2 con sintaxis segura para LaTeX.

Delimitadores que no chocan con LaTeX:
    \\BLOCK{ for x in y }  ...  \\BLOCK{ endfor }
    \\VAR{ expresion }
    \\#{ comentario }
Filtros: tex (escapa), md (markdown mínimo → LaTeX), fecha, dia, hora, dur, lista.
Cada sección del informe es una plantilla independiente en plantillas_tex/
(parte_*.tex.j2) y se escribe en editables/ como un módulo que el maestro
incluye con \\input: modificar una sección no toca las demás.
"""
from __future__ import annotations

from pathlib import Path

import jinja2

import config
from lib import latex as lx


def entorno() -> jinja2.Environment:
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(config.PLANTILLAS_TEX)),
        block_start_string=r"\BLOCK{", block_end_string="}",
        variable_start_string=r"\VAR{", variable_end_string="}",
        comment_start_string=r"\#{", comment_end_string="}",
        trim_blocks=True, lstrip_blocks=True, autoescape=False,
        undefined=jinja2.StrictUndefined,
    )
    env.filters.update({
        "tex": lx.escapar,
        "md": lx.md_a_tex,
        "fecha": lx.fecha_larga,
        "fechacorta": lambda v: lx.fecha_larga(v, con_dia=False),
        "dia": lambda v: lx.dia_nombre(v, capital=True),
        "hora": lambda a: lx.hora_rango(a.get("hora_inicio"), a.get("hora_fin")),
        "dur": lambda a: lx.duracion_texto(a.get("hora_inicio"), a.get("hora_fin")),
        "lista": lx.lista_es,
        "horas": lx.horas_texto,
    })
    env.globals.update({"SECTORES": config.SECTORES, "TIPOS": config.TIPOS})
    return env


def renderizar(env: jinja2.Environment, nombre: str, contexto: dict, destino: Path) -> Path:
    tpl = env.get_template(nombre)
    texto = tpl.render(**contexto)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto, encoding="utf-8")
    return destino

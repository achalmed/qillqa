"""Del texto pegado al bloque interpretado (puras).

`interpretar(texto, tipos_admitidos)` devuelve una `Lectura`:

- si el texto trae un bloque YAML con `tipo:` (con cerca ```yaml, con cerca pelada o sin
  cerca, empezando por `tipo:`), se lee con `yaml.safe_load`, se busca su esquema y se
  valida (`validar.validar`);
- si no lo trae, se prueban los lectores de transición por rótulos (hoy, el mensaje de
  recepción 📌/🗓️ que lee `entradas.leer_resumen`, que equivale a `documento-recibido`);
- si nada casa, `errores` dice qué formatos se aceptan y `tipo` queda vacío: el endpoint
  responde 422 y la web no rellena ningún campo.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import yaml

from .. import entradas
from .esquemas import Esquema, cargar, formatos
from .validar import validar

_RE_CERCA = re.compile(r"```[ \t]*(?:yaml|yml)?[ \t]*\r?\n(.*?)\r?\n[ \t]*```", re.S | re.I)
_RE_TIPO = re.compile(r"^[ \t]*tipo[ \t]*:[ \t]*([a-z0-9][a-z0-9_-]*)[ \t]*$", re.M | re.I)


@dataclass
class Lectura:
    tipo: str = ""
    version: int | None = None
    esquema: Esquema | None = None
    valores: dict = field(default_factory=dict)        # ya validados y normalizados
    crudo: dict = field(default_factory=dict)          # lo que dio YAML, tal cual
    errores: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    dudas: dict[str, dict] = field(default_factory=dict)
    fuente: str = ""                                   # 'yaml' | 'rotulos' | ''
    texto: str = ""                                    # lo pegado, íntegro (para `pegados`)
    resto: str = ""                                    # lo que había fuera del bloque (el mensaje)

    @property
    def valido(self) -> bool:
        return bool(self.tipo) and not self.errores

    def como_dict(self) -> dict:
        return {
            "tipo": self.tipo, "version": self.version, "valores": self.valores, "errores": self.errores,
            "avisos": self.avisos, "dudas": self.dudas, "fuente": self.fuente,
            "titulo": self.esquema.titulo if self.esquema else "", "modulo": self.esquema.modulo if self.esquema else "",
        }


def extraer_bloque(texto: str) -> tuple[str, str]:
    """→ (bloque YAML, resto del texto). Primero una cerca ``` que contenga `tipo:`; si no,
    desde la línea `tipo: …` hasta la primera línea en blanco seguida de texto que no
    parece YAML (o el final). ('', texto) si no hay bloque."""
    t = (texto or "").replace("\r\n", "\n")
    for m in _RE_CERCA.finditer(t):
        if _RE_TIPO.search(m.group(1)):
            return m.group(1).strip("\n"), (t[: m.start()] + t[m.end():]).strip()
    m = _RE_TIPO.search(t)
    if not m:
        return "", t
    lineas = t[m.start():].split("\n")
    bloque: list[str] = []
    for i, ln in enumerate(lineas):
        if ln.strip() == "":
            # Una línea en blanco cierra el bloque solo si lo que sigue no es YAML (clave: o lista).
            siguiente = next((x for x in lineas[i + 1:] if x.strip()), "")
            if not re.match(r"^\s*(-\s|[A-Za-z_][\w\-]*\s*:)", siguiente):
                break
            bloque.append(ln)
            continue
        if ln.strip().startswith("```"):
            break
        bloque.append(ln)
    cuerpo = "\n".join(bloque).strip("\n")
    resto = (t[: m.start()] + t[m.start() + len(cuerpo):]).strip()
    return cuerpo, resto


def _leer_yaml(bloque: str) -> tuple[dict | None, str]:
    try:
        datos = yaml.safe_load(bloque)
    except yaml.YAMLError as e:
        marca = getattr(e, "problem_mark", None)
        donde = f" (línea {marca.line + 1})" if marca is not None else ""
        return None, f"El bloque no es YAML válido{donde}: una clave por línea, «clave: valor», sin « · »."
    if not isinstance(datos, dict):
        return None, "El bloque no es un mapa de claves (clave: valor)."
    return datos, ""


def _por_rotulos(texto: str, tipos_admitidos: tuple[str, ...] | None) -> Lectura | None:
    """El mensaje de recepción con rótulos (📌 NUEVO DOCUMENTO RECIBIDO / 🗓️ AGENDA): el
    lector de transición. Devuelve una Lectura de `documento-recibido` o None."""
    if tipos_admitidos and "documento-recibido" not in tipos_admitidos:
        return None
    r = entradas.leer_resumen(texto)
    if not r.get("tipo"):
        return None
    esquema = cargar().get("documento-recibido")
    if esquema is None:
        return None
    f = dict(r["ficha"])
    valores = {k: v for k, v in f.items() if k in esquema.campos}
    if r.get("evento"):
        ev = r["evento"]
        valores["agenda"] = {
            "titulo": ev["titulo"], "tipo": ev["tipo"], "inicio": ev.get("inicio", ""),
            "todo_el_dia": ev["todo_el_dia"], "lugar": ev.get("lugar", ""), "modalidad": ev.get("modalidad", ""),
            "descripcion": ev.get("descripcion", ""),
        }
    return Lectura(
        tipo="documento-recibido", version=esquema.version, esquema=esquema, valores=valores, crudo=f,
        avisos=list(r.get("avisos") or []), fuente="rotulos", texto=texto,
    )


def interpretar(texto: str, tipos_admitidos: tuple[str, ...] | None = None) -> Lectura:
    """El texto pegado → Lectura. `tipos_admitidos` limita lo que ese endpoint acepta (un
    `agenda-actividades` pegado en Recibidos es un error claro, no un rellenado raro)."""
    texto = texto or ""
    bloque, resto = extraer_bloque(texto)
    aceptados = [f for f in formatos() if not tipos_admitidos or f["tipo"] in tipos_admitidos]
    nombres = ", ".join(f"{f['tipo']} ({f['titulo']})" for f in aceptados)
    if not bloque:
        por_rotulos = _por_rotulos(texto, tipos_admitidos)
        if por_rotulos:
            return por_rotulos
        return Lectura(texto=texto, errores=[
            "No se reconoció ningún formato: se espera un bloque YAML que empiece por «tipo: …» "
            f"(formatos aceptados aquí: {nombres})."
        ])
    datos, error = _leer_yaml(bloque)
    if datos is None:
        return Lectura(texto=texto, errores=[error], resto=resto)
    tipo = str(datos.get("tipo") or "").strip().lower()
    esquema = cargar().get(tipo)
    if esquema is None:
        return Lectura(tipo=tipo, texto=texto, crudo=datos, resto=resto, errores=[
            f"El formato «{tipo}» no existe en el sistema (formatos aceptados aquí: {nombres})."
        ])
    if tipos_admitidos and tipo not in tipos_admitidos:
        return Lectura(tipo=tipo, esquema=esquema, texto=texto, crudo=datos, resto=resto, errores=[
            f"Este formulario no acepta «{tipo}» ({esquema.titulo}); aquí van: {nombres}."
        ])
    r = validar(datos, esquema)
    version = datos.get("version")
    return Lectura(
        tipo=tipo, version=int(version) if str(version or "").isdigit() else None, esquema=esquema,
        valores=r.valores, crudo=datos, errores=r.errores, avisos=r.avisos, dudas=r.dudas,
        fuente="yaml", texto=texto, resto=resto,
    )

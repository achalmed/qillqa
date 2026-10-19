"""Los esquemas del contrato de pegado (`backend/app/esquemas/pegado/<tipo>.yml`): carga,
caché y resolución de sub-bloques (`esquema: actividad` del mismo archivo o
`esquema: agenda-actividades/actividad` de otro).

Un esquema es un dict con `tipo`, `version`, `titulo`, `modulo`, `prompt`, `campos`
(clave → definición) y, opcionalmente, `bloques` (nombre → definición de campos). Cada
definición de campo: `etiqueta`, `tipo` (TIPOS_CAMPO), `valores`, `sinonimos`,
`obligatorio`, `destino` (campo del formulario; None = informativo), `anexar_a`, `cruza`,
`esquema`, `ayuda`, `ejemplo`.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

CARPETA = Path(__file__).resolve().parents[2] / "esquemas" / "pegado"
TIPOS_CAMPO = (
    "texto", "texto_largo", "fecha", "hora", "fecha_hora", "opcion", "entero", "booleano",
    "lista", "bloque", "lista_bloques",
    # Un monto en soles (2026-10-18, `comprobantes-gasto`): «S/ 1,158.50», «40», 12.5 → 1158.5.
    "importe",
)


@dataclass(frozen=True)
class Esquema:
    tipo: str
    version: int
    titulo: str
    modulo: str
    prompt: str
    campos: dict
    bloques: dict

    def bloque(self, referencia: str) -> dict:
        """La definición de campos de un sub-bloque: `actividad` (de este archivo) o
        `agenda-actividades/actividad` (de otro)."""
        if "/" in referencia:
            otro, nombre = referencia.split("/", 1)
            return esquema_de(otro).bloque(nombre)
        if referencia not in self.bloques:
            raise KeyError(f"El esquema {self.tipo} no define el bloque «{referencia}»")
        return self.bloques[referencia]

    def etiqueta(self, clave: str) -> str:
        d = self.campos.get(clave) or {}
        return d.get("etiqueta") or clave.replace("_", " ").capitalize()


def _comprobar(tipo: str, campos: dict, donde: str) -> None:
    for clave, d in campos.items():
        if not isinstance(d, dict):
            raise ValueError(f"{tipo}: el campo «{clave}» de {donde} no es un mapa")
        t = d.get("tipo", "texto")
        if t not in TIPOS_CAMPO:
            raise ValueError(f"{tipo}: el campo «{clave}» de {donde} tiene un tipo desconocido «{t}»")
        if t == "opcion" and not d.get("valores"):
            raise ValueError(f"{tipo}: la opción «{clave}» de {donde} no declara `valores`")
        if t in ("bloque", "lista_bloques") and not d.get("esquema"):
            raise ValueError(f"{tipo}: el bloque «{clave}» de {donde} no declara `esquema`")


@lru_cache(maxsize=None)
def cargar(carpeta: str | None = None) -> dict[str, Esquema]:
    """Todos los esquemas de la carpeta, por `tipo`. Se cachea: los esquemas cambian con
    el código, no en caliente."""
    raiz = Path(carpeta) if carpeta else CARPETA
    esquemas: dict[str, Esquema] = {}
    for ruta in sorted(raiz.glob("*.yml")):
        with ruta.open(encoding="utf-8") as f:
            datos = yaml.safe_load(f) or {}
        tipo = str(datos.get("tipo") or "")
        if not tipo or tipo != ruta.stem:
            raise ValueError(f"{ruta.name}: `tipo` ({tipo!r}) debe ser el nombre del archivo")
        campos = datos.get("campos") or {}
        bloques = datos.get("bloques") or {}
        _comprobar(tipo, campos, "campos")
        for nombre, b in bloques.items():
            _comprobar(tipo, b, f"bloques.{nombre}")
        esquemas[tipo] = Esquema(
            tipo=tipo, version=int(datos.get("version") or 1), titulo=str(datos.get("titulo") or tipo),
            modulo=str(datos.get("modulo") or ""), prompt=str(datos.get("prompt") or ""),
            campos=campos, bloques=bloques,
        )
    return esquemas


def esquema_de(tipo: str, carpeta: str | None = None) -> Esquema:
    es = cargar(carpeta)
    if tipo not in es:
        raise KeyError(tipo)
    return es[tipo]


def formatos(carpeta: str | None = None) -> list[dict]:
    """Lo que se le dice a la persona cuando pega algo que no es ningún formato: tipo,
    título, módulo y prompt de cada esquema."""
    return [
        {"tipo": e.tipo, "version": e.version, "titulo": e.titulo, "modulo": e.modulo, "prompt": e.prompt}
        for e in cargar(carpeta).values()
    ]

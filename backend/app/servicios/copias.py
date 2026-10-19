"""Copias (c.c.) que el sistema SUGIERE, y la verificación que exige antes de
numerar un documento (Edison 2026-09-05).

El problema real de la entidad: hay copias que van siempre —la del Presidente de
la Mesa Directiva— y que se olvidan justo cuando importan. Pero ponerlas solas
sería peor: un funcionario cambia de cargo, llega otra autoridad, se reparten
las funciones, o esa copia simplemente no corresponde a ese documento. Un
oficio con copia a quien ya no ocupa el cargo es un error con membrete.

Por eso el trato es: el sistema PROPONE y la persona CONFIRMA. La confirmación
no es un adorno: `generar` —que asigna el número oficial y es irreversible— la
exige. Y como el sistema guarda la «foto» del cargo con el que se creó cada
regla, puede avisar cuando el directorio ya dice otra cosa.
"""

import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.latex.generador import parsear_copias
from app.modelos import Persona, ReglaCopia


def aplica(regla: ReglaCopia, tipo: str) -> bool:
    """`tipos` vacío = la copia va en todos los tipos de documento."""
    lista = [t.strip() for t in (regla.tipos or "").split(",") if t.strip()]
    return not lista or tipo in lista


async def sugeridas(sesion: AsyncSession, tipo: str) -> list[dict]:
    """Las copias sugeridas para un tipo de documento, ya resueltas contra el
    directorio.

    Cada una trae, además de los datos, `cambio_en_directorio`: True cuando la
    persona sigue en el directorio pero con OTRO cargo (o con otro nombre) que
    el guardado en la regla. Es exactamente el caso que Edison quiere que no
    pase inadvertido, y por eso se informa en vez de corregirse sola: quien
    firma decide si esa copia sigue teniendo sentido.
    """
    reglas = (
        (
            await sesion.execute(
                select(ReglaCopia)
                .where(ReglaCopia.activa.is_(True))
                .order_by(ReglaCopia.orden, ReglaCopia.id)
            )
        )
        .scalars()
        .all()
    )
    reglas = [r for r in reglas if aplica(r, tipo)]
    personas: dict[int, Persona] = {}
    ids = {r.persona_id for r in reglas if r.persona_id}
    if ids:
        filas = (
            await sesion.execute(select(Persona).where(Persona.id.in_(ids)))
        ).scalars().all()
        personas = {p.id: p for p in filas}

    salida = []
    for r in reglas:
        persona = personas.get(r.persona_id or 0)
        # El directorio manda sobre la foto guardada: es el dato vigente.
        nombre = (persona.nombre if persona else r.nombre) or r.nombre
        cargo = (persona.cargo if persona else r.cargo) or r.cargo
        tratamiento = r.tratamiento or (persona.tratamiento if persona else "") or "Señor:"
        cambio = bool(persona) and (
            nombre.strip() != (r.nombre or "").strip()
            or cargo.strip() != (r.cargo or "").strip()
        )
        salida.append(
            {
                "regla_id": r.id,
                "persona_id": r.persona_id,
                "tratamiento": tratamiento,
                "nombre": nombre,
                "cargo": cargo,
                "motivo": r.motivo,
                # El directorio dice algo distinto de lo que la regla guardó.
                "cambio_en_directorio": cambio,
                "nombre_anterior": r.nombre if cambio else "",
                "cargo_anterior": r.cargo if cambio else "",
            }
        )
    return salida


def _nombre_clave(nombre: str) -> str:
    """Identidad de una copia, para no sugerir a quien ya está en el documento.

    Se compara SOLO por el nombre: el cargo es justamente lo que puede haber
    cambiado, y compararlo haría aparecer la copia como «faltante» tras un
    cambio de puesto, duplicando a la misma persona.

    Y se compara SIN TILDES ni mayúsculas porque los documentos de la entidad
    escriben el mismo nombre de varias formas —«Elena Gutiérrez Salas» y
    «Elena Gutierrez Salas» conviven en los oficios ya enviados—. Sin esta
    normalización el sistema propondría agregar una copia que ya está.

    Lo que NO hace es adivinar: «Elena Salas» (sin el segundo nombre) es
    otra cadena y se sugerirá igual. Es el fallo correcto: quien confirma ve
    las dos y decide, en vez de que el sistema calle una copia por su cuenta.
    """
    limpio = unicodedata.normalize("NFKD", nombre or "")
    limpio = "".join(c for c in limpio if not unicodedata.combining(c))
    return " ".join(limpio.split()).lower()


def faltantes(con_copia: str, sugerencias: list[dict]) -> list[dict]:
    """Sugerencias que TODAVÍA no están en el campo «Con copia a»."""
    puestas = {_nombre_clave(c["nombre"]) for c in parsear_copias(con_copia or "")}
    return [s for s in sugerencias if _nombre_clave(s["nombre"]) not in puestas]


def resumen(con_copia: str) -> list[dict]:
    """Las copias que el documento lleva ahora, en el formato del frontend.

    `parsear_copias` devuelve el cargo partido en líneas (así se imprime en el
    PDF); aquí se une para mostrarlo en una sola línea al confirmar.
    """
    return [
        {
            "tratamiento": c["trat"] or "Señor:",
            "nombre": c["nombre"],
            "cargo": " ".join(c["cargos"]).strip(),
        }
        for c in parsear_copias(con_copia or "")
    ]


# --------------------------------------------------------------------------
# ORDEN INSTITUCIONAL de las copias (Edison 2026-09-05, según la guía del
# despacho): 1 Oficialía Mayor · 2 Presidencia / Mesa Directiva · 3 Presidencia
# de la comisión ordinaria · 4 Grupo parlamentario / bancada · 5 Oficina de
# enlace de la entidad · 6 Defensoría del Pueblo · después, el resto en el
# orden en que se escribieron. Se decide por palabras clave del CARGO (o del
# nombre, si es una oficina).
# --------------------------------------------------------------------------
_RANGOS: list[tuple[int, tuple[str, ...]]] = [
    (1, ("oficial mayor", "oficialia mayor", "oficialía mayor")),
    (2, ("mesa directiva", "presidente de la camara", "presidente de la cámara",
         "presidenta de la camara", "presidenta de la cámara")),
    (3, ("presidente de la comision", "presidente de la comisión",
         "presidenta de la comision", "presidenta de la comisión", "comision ordinaria",
         "comisión ordinaria")),
    (4, ("grupo parlamentario", "bancada", "vocero")),
    (5, ("oficina de enlace", "enlace con el congreso")),
    (6, ("defensor del pueblo", "defensora del pueblo", "defensoria del pueblo",
         "defensoría del pueblo")),
]


def rango_copia(nombre: str, cargo: str) -> int:
    texto = _nombre_clave(f"{cargo} {nombre}")
    for rango, claves in _RANGOS:
        if any(_nombre_clave(k) in texto for k in claves):
            return rango
    return 99


def ordenar_copias(con_copia: str) -> str:
    """Reordena el texto del campo `con_copia` según el orden institucional,
    conservando el orden original entre copias del mismo rango."""
    copias = parsear_copias(con_copia or "")
    if len(copias) < 2:
        return con_copia or ""
    indexadas = sorted(
        enumerate(copias),
        key=lambda t: (rango_copia(t[1]["nombre"], " ".join(t[1]["cargos"])), t[0]),
    )
    lineas: list[str] = []
    for _, c in indexadas:
        lineas.append(c["trat"] or "Señor:")
        lineas.append(c["nombre"])
        lineas.extend(x for x in c["cargos"] if x)
    return "\n".join(lineas)

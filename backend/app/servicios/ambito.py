"""¿El documento va DENTRO del Congreso o a una entidad de fuera?

Pedido de Edison 2026-09-05. La diferencia no es cosmética: cambia qué prueba
la entrega.

  · INTERNO (otra oficina del Congreso: Mesa Directiva, Oficialía Mayor, otro
    despacho, la Dirección General de Administración…). Circula por el Sistema
    de Trámite Documentario del Congreso, que le da un número de expediente.
    Pedir además un cargo sellado es pedir algo que nadie devuelve.
  · EXTERNO (un ministerio, un gobierno regional, una universidad, una
    empresa). Ahí sí hace falta guardar con qué se prueba la entrega: el cargo
    sellado, la constancia de mesa de partes virtual o el comprobante de envío.

Cómo se decide, en este orden:

  1. Lo que haya elegido una persona (`documentos.ambito`). Manda siempre: el
     despacho conoce casos que ninguna regla adivina.
  2. El tipo de documento: un memorando es, por definición, interno.
  3. El destinatario, contra el DIRECTORIO: si su nombre o su cargo mencionan
     un órgano que cuelga del Congreso de la República —los 75 que ya están
     cargados desde el organigrama oficial— es interno.

El paso 3 se apoya en el directorio y no en una lista escrita a mano justamente
por lo que pidió Edison: que el directorio se mantenga actualizado y el sistema
lea de ahí, en vez de repetir nombres en el código.
"""

import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Documento, Institucion

INTERNO = "interno"
EXTERNO = "externo"

# Tipos que son internos por naturaleza (no por su destinatario).
_TIPOS_INTERNOS = {"memorando"}

# Siglas que, entre paréntesis en el cargo, delatan al Congreso. Se comparan
# como palabra suelta para que «(CD)» no case con «(CDN)».
_SIGLAS_CONGRESO = {"CR", "CRP", "CD", "CS"}

# Menos de esto no distingue nada («Mesa», «Área») y produciría falsos
# positivos contra cualquier cargo.
_LARGO_MINIMO_NOMBRE = 8


def _normalizar(texto: str) -> str:
    """Minúsculas y sin tildes: los cargos se escriben de mil maneras."""
    sin_tildes = unicodedata.normalize("NFKD", texto or "")
    sin_tildes = "".join(c for c in sin_tildes if not unicodedata.combining(c))
    return " ".join(sin_tildes.lower().split())


async def indice_congreso(sesion: AsyncSession) -> set[str]:
    """Nombres normalizados de los órganos que cuelgan del Congreso.

    Una sola consulta recursiva: la bandeja clasifica decenas de documentos por
    petición y no puede pagar una consulta por fila.
    """
    raiz = (
        await sesion.execute(
            select(Institucion.id).where(Institucion.siglas == "CR").limit(1)
        )
    ).scalar_one_or_none()
    if raiz is None:
        return set()
    filas = (
        await sesion.execute(select(Institucion.id, Institucion.nombre, Institucion.parent_id))
    ).all()
    hijos: dict[int | None, list[tuple[int, str]]] = {}
    for ident, nombre, padre in filas:
        hijos.setdefault(padre, []).append((ident, nombre))
    nombres: set[str] = set()
    pendientes = [raiz]
    # Recorrido iterativo: `visitados` protege de un ciclo por un parent_id mal
    # puesto, que colgaría la petición entera.
    visitados: set[int] = set()
    while pendientes:
        actual = pendientes.pop()
        if actual in visitados:
            continue
        visitados.add(actual)
        for ident, nombre in hijos.get(actual, []):
            n = _normalizar(nombre)
            if len(n) >= _LARGO_MINIMO_NOMBRE:
                nombres.add(n)
            pendientes.append(ident)
    nombres.add(_normalizar("Congreso de la República"))
    return nombres


def _siglas_en(texto: str) -> set[str]:
    """Siglas entre paréntesis del texto: «Oficial Mayor (CR)» -> {'CR'}."""
    encontradas: set[str] = set()
    resto = texto or ""
    while "(" in resto and ")" in resto:
        ini = resto.index("(")
        fin = resto.index(")", ini)
        if fin > ini:
            encontradas.add(resto[ini + 1 : fin].strip().upper())
        resto = resto[fin + 1 :]
    return encontradas


def clasificar(doc: Documento, nombres_congreso: set[str]) -> str:
    """INTERNO o EXTERNO, con el orden de precedencia del módulo."""
    elegido = (doc.ambito or "").strip().lower()
    if elegido in (INTERNO, EXTERNO):
        return elegido
    if doc.tipo in _TIPOS_INTERNOS:
        return INTERNO
    campos = doc.campos or {}
    crudo = f"{campos.get('destinatario_nombre', '')} {campos.get('destinatario_cargo', '')}"
    if _SIGLAS_CONGRESO & _siglas_en(crudo):
        return INTERNO
    texto = _normalizar(crudo)
    if any(nombre in texto for nombre in nombres_congreso):
        return INTERNO
    return EXTERNO


def es_automatico(doc: Documento) -> bool:
    """¿La clasificación la dedujo el sistema, o la fijó una persona?"""
    return (doc.ambito or "").strip().lower() not in (INTERNO, EXTERNO)

"""Comentarios y observaciones de un documento (pedidos §3 y §4, 2026-09-04).

Un comentario es SIEMPRE un mensaje para quien redacta o corrige el documento.
Tres intenciones (`tipo`):

  observacion — qué hay que CORREGIR. Obligatorio para observar un documento:
                sin él, «Observado» no le dice nada a quien debe arreglarlo.
                Nace PENDIENTE y se levanta al corregir.
  indicacion  — el encargo: qué trabajo hay que hacer. Se deja al devolver a
                borrador o al asignar responsable. También queda pendiente:
                así el encargado ve su tarea abierta.
  nota        — comentario libre, sin pendiente asociado.

`pendientes()` es lo que hace que la observación «se reciba»: mientras haya
observaciones o indicaciones sin levantar, la bandeja las marca en la fila del
documento y el editor las muestra arriba.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Comentario, Usuario

# Tipos de comentario y su etiqueta visible.
TIPOS = ("observacion", "indicacion", "nota")
ETIQUETA_TIPO = {
    "observacion": "Observación",
    "indicacion": "Indicación",
    "nota": "Nota",
}
# Los que quedan «abiertos» hasta que alguien los da por atendidos.
_PENDIENTES = ("observacion", "indicacion")

# Longitud mínima útil: un comentario de dos letras no explica nada.
LARGO_MINIMO = 5

# A qué PARTE del documento puede anclarse un comentario (Edison 2026-09-05:
# «las observaciones deberían colocarse al lado de cada formulario o sección»).
# Las claves de campo coinciden con las del esquema de `tipos.py`; las de
# sección, con los bloques del editor. Vacío = el documento en general. Es una
# lista blanca: una clave desconocida se guarda como general, no se rechaza,
# para que un formulario con campos nuevos no rompa el seguimiento.
ETIQUETA_SECCION = {
    "": "General",
    "destinatario_nombre": "Destinatario",
    "destinatario_tratamiento": "Tratamiento",
    "destinatario_cargo": "Cargo del destinatario",
    "asunto": "Asunto",
    "referencia": "Referencia",
    "fecha": "Fecha",
    "con_copia": "Copias (c.c.)",
    "anexo": "Línea Adj.",
    "para": "Para",
    "de": "De",
    "sumilla_solicito": "Sumilla",
    "destinatario_institucion": "Institución",
    "destinatario_lugar": "Dependencia",
    "clase_sesion": "Clase de sesión",
    "organo": "Órgano",
    "presidente_nombre": "Presidente",
    "presidente_cargo": "Cargo del presidente",
    "secretario_nombre": "Secretario",
    "secretario_cargo": "Cargo del secretario",
    "cuerpo": "Cuerpo del documento",
    "anexos": "Anexos",
    "formato": "Formato",
    "archivos": "Archivos",
}


def normalizar_seccion(seccion: str | None) -> str:
    s = (seccion or "").strip()
    return s if s in ETIQUETA_SECCION else ""


def crear(
    sesion: AsyncSession,
    documento_id: int,
    autor: Usuario,
    texto: str,
    tipo: str = "observacion",
    estado_destino: str = "",
    dirigido_a: int | None = None,
    seccion: str = "",
) -> Comentario:
    """Agrega un comentario a la sesión (el llamador hace el commit, para que
    comentario y cambio de estado viajen en la MISMA transacción)."""
    c = Comentario(
        documento_id=documento_id,
        usuario_id=autor.id,
        tipo=tipo if tipo in TIPOS else "nota",
        texto=texto.strip(),
        estado_destino=estado_destino,
        dirigido_a=dirigido_a,
        seccion=normalizar_seccion(seccion),
        resuelto=tipo not in _PENDIENTES,
    )
    sesion.add(c)
    return c


async def pendientes(
    sesion: AsyncSession, documento_id: int, tipo: str | None = None
) -> list[Comentario]:
    """Comentarios abiertos del documento (más antiguo primero)."""
    consulta = select(Comentario).where(
        Comentario.documento_id == documento_id,
        Comentario.resuelto.is_(False),
        Comentario.tipo.in_([tipo] if tipo else list(_PENDIENTES)),
    )
    filas = (
        await sesion.execute(consulta.order_by(Comentario.creado_en))
    ).scalars().all()
    return list(filas)


async def conteo_pendientes(
    sesion: AsyncSession, documento_ids: list[int]
) -> dict[int, int]:
    """Pendientes por documento, en UNA consulta (bandeja, sin N+1)."""
    if not documento_ids:
        return {}
    from sqlalchemy import func

    filas = (
        await sesion.execute(
            select(Comentario.documento_id, func.count())
            .where(
                Comentario.documento_id.in_(documento_ids),
                Comentario.resuelto.is_(False),
                Comentario.tipo.in_(list(_PENDIENTES)),
            )
            .group_by(Comentario.documento_id)
        )
    ).all()
    return dict(filas)


def levantar(c: Comentario, usuario: Usuario, respuesta: str = "") -> None:
    """Da por atendido un comentario (quien corrigió explica cómo)."""
    c.resuelto = True
    c.resuelto_por = usuario.id
    c.resuelto_en = datetime.now(timezone.utc)
    if respuesta.strip():
        c.respuesta = respuesta.strip()


def vista(c: Comentario, nombres: dict[int, str]) -> dict:
    """Representación para el frontend. A diferencia del historial, el AUTOR
    de un comentario sí se muestra a todos los roles: saber quién pide la
    corrección es justamente el objetivo (nunca sale en el PDF oficial)."""
    return {
        "id": c.id,
        "tipo": c.tipo,
        "tipo_nombre": ETIQUETA_TIPO.get(c.tipo, c.tipo),
        "texto": c.texto,
        "usuario_id": c.usuario_id,
        "conformidad": c.conformidad or "",
        "seccion": c.seccion or "",
        "seccion_nombre": ETIQUETA_SECCION.get(c.seccion or "", "General"),
        "autor": nombres.get(c.usuario_id, ""),
        "dirigido_a": nombres.get(c.dirigido_a or 0, ""),
        "estado_destino": c.estado_destino,
        "resuelto": c.resuelto,
        "resuelto_por": nombres.get(c.resuelto_por or 0, ""),
        "resuelto_en": c.resuelto_en.isoformat() if c.resuelto_en else None,
        "respuesta": c.respuesta,
        "creado_en": c.creado_en.isoformat() if c.creado_en else None,
    }

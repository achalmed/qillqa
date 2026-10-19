"""EDICIÓN SIMULTÁNEA (fase 5, 2026-10-01): reglas del texto compartido.

El servidor de colaboración (Hocuspocus, `frontend/colab/servidor.ts`) une lo
que escriben varias personas a la vez (Yjs) y le entrega a la API dos cosas:
el estado Yjs en bytes (tabla `colab_estado`) y el JSON del editor derivado de
él, que queda como «borrador vivo» de la parte, sin crear versión. «Guardar»
sigue creando la versión con nota. Diseño: docs/plataforma/fase-5-edicion-simultanea.md.

Los documentos (oficios, memorandos…; paso 5.6, 2026-10-05) se comparten igual,
con el nombre `doc:<id>:<gen>`: el cuerpo es el texto y los datos del formulario
viajan en el mapa `campos` del mismo estado Yjs. Solo mientras el documento sea
compartible: nacido en el sistema y ni firmado ni enviado (`documento_compartible`).

La GENERACIÓN va en el nombre del documento compartido (`pl:<proyecto>:<parte>:<gen>`)
y sube cada vez que el contenido se reemplaza por fuera de Yjs (encender o apagar
el modo, restaurar una versión, guardar por turnos). Así un estado Yjs viejo —un
navegador que vuelve de estar sin conexión, una fila que sobrevivió— nunca se une
con el nuevo: Yjs une por identidad de operaciones, y unir dos historias
independientes del mismo texto lo DUPLICARÍA.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from dataclasses import dataclass

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import ColabEstado, Documento, ProyectoSeccion

# Claves de parte: minúsculas, dígitos, «_» y «-» (`costo-beneficio`; sin el
# guion esa parte nunca entraba en compartido). Nunca «:», que separa el nombre.
_CLAVE = re.compile(r"^[a-z0-9_-]{1,40}$")


def secreto_interno(jwt_secret: str) -> str:
    """Credencial del servidor de colaboración ante la API, DERIVADA de
    JWT_SECRET: los dos procesos la calculan igual y no hace falta otra
    variable en el .env. No sirve como sesión de nadie."""
    return hmac.new(jwt_secret.encode(), b"sgdp-colab", hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class NombreColab:
    proyecto_id: int
    clave: str
    generacion: int


def nombre_parte(proyecto_id: int, clave: str, generacion: int) -> str:
    return f"pl:{proyecto_id}:{clave}:{generacion}"


@dataclass(frozen=True)
class NombreDocumento:
    documento_id: int
    generacion: int


def nombre_documento(documento_id: int, generacion: int) -> str:
    return f"doc:{documento_id}:{generacion}"


# Estados en que un documento se puede escribir en compartido: hasta numerado
# y sin firmar (Edison 2026-10-05). Firmado, enviado o archivado, nunca:
# editarlo anularía la firma (servicios/firma.py).
ESTADOS_COMPARTIBLES = frozenset({"BORRADOR", "EN_REVISION", "OBSERVADO", "APROBADO"})


def documento_compartible(doc: Documento) -> bool:
    return doc.origen == "sgdp" and doc.estado in ESTADOS_COMPARTIBLES and not doc.oculto


def documento_en_vivo(doc: Documento) -> bool:
    """¿Rige ahora la edición simultánea? El interruptor y el estado."""
    return bool(doc.colaboracion) and documento_compartible(doc)


_SALA = re.compile(r"^sala:(sr|pl|doc):\d{1,9}$")


def es_sala(nombre: str) -> bool:
    """`sala:<sr|pl|doc>:<id>`: sala de PRESENCIA de una página (2026-10-05).
    Solo lleva awareness —quién está y en qué campo escribe—; el servidor no la
    guarda ni la convierte, y la API no le da contenido."""
    return bool(_SALA.match(nombre or ""))


def leer_nombre(nombre: str) -> NombreColab | NombreDocumento | None:
    """`pl:<id>:<clave>:<gen>` → NombreColab; `doc:<id>:<gen>` → NombreDocumento;
    cualquier otra cosa → None."""
    partes = nombre.split(":")
    if len(partes) == 3 and partes[0] == "doc":
        _, did, gen = partes
        return NombreDocumento(int(did), int(gen)) if did.isdigit() and gen.isdigit() else None
    if len(partes) != 4 or partes[0] != "pl":
        return None
    _, pid, clave, gen = partes
    if not (pid.isdigit() and gen.isdigit() and _CLAVE.match(clave)):
        return None
    return NombreColab(int(pid), clave, int(gen))


def estable(contenido: dict | None) -> str:
    """Forma canónica para comparar JSON (JSONB reordena las claves)."""
    return json.dumps(contenido or {}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sin_versionar(borrador: dict | None, contenido: dict | None) -> bool:
    """¿Hay texto escrito en compartido que todavía no es versión?"""
    return borrador is not None and estable(borrador) != estable(contenido)


async def reiniciar(sesion: AsyncSession, proyecto_id: int, secciones: list[ProyectoSeccion]) -> None:
    """El contenido de estas partes se reemplazó por fuera de Yjs: generación
    nueva, borrador vivo descartado (ya no corresponde) y estado Yjs borrado.
    Quien siga conectado a la generación anterior es rechazado al guardar y
    recarga la nueva."""
    for s in secciones:
        s.colab_gen = (s.colab_gen or 0) + 1
        s.borrador = None
        s.borrador_en = None
        s.borrador_por = None
        await sesion.execute(
            delete(ColabEstado).where(ColabEstado.documento.like(f"pl:{proyecto_id}:{s.clave}:%"))
        )


async def reiniciar_documento(sesion: AsyncSession, doc: Documento) -> None:
    """Lo mismo que `reiniciar` para un documento: su contenido se reemplazó
    por fuera de Yjs (encender o apagar, restaurar, guardar por turnos)."""
    doc.colab_gen = (doc.colab_gen or 0) + 1
    doc.borrador = None
    doc.borrador_en = None
    doc.borrador_por = None
    await sesion.execute(delete(ColabEstado).where(ColabEstado.documento.like(f"doc:{doc.id}:%")))


def documento_sin_versionar(doc: Documento) -> bool:
    """¿Hay TEXTO escrito en compartido que todavía no se guardó? Solo el
    cuerpo: los datos del formulario se normalizan al guardar (mayúsculas,
    orden de copias) y compararlos daría «sin guardar» para siempre."""
    return doc.borrador is not None and sin_versionar(doc.borrador.get("cuerpo"), doc.cuerpo)

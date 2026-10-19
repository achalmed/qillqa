"""Automatismos del circuito de REVISIÓN (pedido de Edison 2026-09-05).

Antes, el estado solo se movía a mano: alguien tenía que acordarse de pulsar
«En revisión», luego «Observado», luego volver. En la práctica el estado
quedaba desactualizado y la bandeja mentía. Aquí viven las tres reglas que
mueven el trámite SOLAS, a partir de hechos que el sistema ya conoce:

  1. `al_abrir`     — el diputado o un asesor ABRE un borrador  → EN_REVISION.
                      Nadie decide nada: el sistema registra que el revisor ya
                      tiene el documento en manos, y la secretaria lo ve al
                      instante en la bandeja.
  2. `al_observar`  — se escribe una OBSERVACIÓN → OBSERVADO (o, si el
                      documento ya salió, OBSERVADO_ENVIADO).
  3. `al_levantar`  — se atiende la ÚLTIMA observación pendiente → vuelve a
                      EN_REVISION (o a ENVIADO si la observación era posterior
                      al envío). Cierra el circuito sin intervención manual.

Es el espejo de `envio.py` (que pasa a ENVIADO al completarse firmado y
constancias): POLÍTICA del sistema, complemento —nunca reemplazo— del cambio
manual de `PUT /estado`, que sigue disponible.

CRITERIO DE PERMISOS, que no es el mismo en las tres reglas y conviene tenerlo
claro:

  * En `al_observar` y `al_levantar` se consulta la matriz de `flujo.py`: el
    comentario mueve el estado SOLO si esa persona podría haber hecho ese
    mismo cambio a mano. Así, una observación de la secretaría durante la
    revisión queda registrada pero no observa el documento (observar es acto
    del revisor), y no hace falta duplicar reglas de permisos aquí.
  * En `al_abrir` NO se consulta la matriz a propósito: el diputado no figura
    en BORRADOR → EN_REVISION porque esa transición es el acto de la
    secretaría de MANDAR a revisar. Abrirlo no es decidir: es un hecho, y el
    hecho lo registra el sistema. Se limita a diputado y asesor —el
    administrador entra a todo y dispararía el cambio sin estar revisando—.

Ninguna regla revierte nada ni salta pasos: solo adelanta el trámite cuando el
hecho ya ocurrió.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.flujo import transicion_permitida
from app.modelos import Comentario, Documento, Usuario
from app.servicios import bitacora
from app.servicios import comentarios as svc_com

# Quiénes, al abrir un borrador, lo ponen en revisión por el solo hecho de
# abrirlo. El administrador queda fuera (ver la nota de arriba).
_ROLES_QUE_REVISAN = {"diputado", "asesor"}

# A dónde va una observación según de dónde venga el documento.
_OBSERVAR = {"EN_REVISION": "OBSERVADO", "ENVIADO": "OBSERVADO_ENVIADO"}
# Y de vuelta, cuando ya no queda nada pendiente.
_RESOLVER = {"OBSERVADO": "EN_REVISION", "OBSERVADO_ENVIADO": "ENVIADO"}


def _mover(
    sesion: AsyncSession,
    doc: Documento,
    destino: str,
    usuario: Usuario,
    accion: str,
    motivo: str,
) -> bool:
    """Aplica el cambio y lo deja en la bitácora, en la MISMA transacción que
    el hecho que lo provocó (el llamador hace el commit)."""
    anterior = doc.estado
    doc.estado = destino
    bitacora.registrar(
        sesion, doc.id, usuario, accion, f"{anterior} → {destino} automáticamente ({motivo})"
    )
    return True


async def al_abrir(sesion: AsyncSession, doc: Documento, usuario: Usuario) -> bool:
    """El revisor abrió el documento: si era borrador, pasa a EN_REVISION."""
    if doc.estado != "BORRADOR" or usuario.rol not in _ROLES_QUE_REVISAN:
        return False
    return _mover(
        sesion, doc, "EN_REVISION", usuario, "revision_automatica",
        f"{usuario.nombre_completo} abrió el borrador para revisarlo",
    )


async def al_observar(
    sesion: AsyncSession, doc: Documento, usuario: Usuario, comentario: Comentario
) -> bool:
    """Se escribió una observación: el documento queda observado."""
    if comentario.tipo != "observacion":
        return False
    destino = _OBSERVAR.get(doc.estado)
    if destino is None or not transicion_permitida(doc.estado, destino, usuario.rol):
        return False
    return _mover(
        sesion, doc, destino, usuario, "observacion_automatica",
        f"observación de {usuario.nombre_completo}",
    )


async def al_levantar(sesion: AsyncSession, doc: Documento, usuario: Usuario) -> bool:
    """Se atendió una observación: si era la última pendiente, el documento
    vuelve al punto donde estaba antes de observarse."""
    destino = _RESOLVER.get(doc.estado)
    if destino is None or not transicion_permitida(doc.estado, destino, usuario.rol):
        return False
    # Las INDICACIONES (encargos) no bloquean el retorno: lo que se observó es
    # lo que hay que corregir para seguir.
    if await svc_com.pendientes(sesion, doc.id, tipo="observacion"):
        return False
    return _mover(
        sesion, doc, destino, usuario, "observacion_resuelta",
        "se atendió la última observación pendiente",
    )

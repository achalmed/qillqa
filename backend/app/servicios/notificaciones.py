"""Avisos personales del sistema (Edison 2026-09-05).

Tres momentos del circuito observación → subsanación → conformidad:
  1. Alguien OBSERVA un documento → aviso al responsable (o a quien lo redactó).
  2. El responsable SUBSANA (levanta la observación) → aviso a quien observó:
     «revise la nueva versión».
  3. Quien observó da CONFORMIDAD o la reabre → aviso a quien subsanó.

`crear` solo agrega a la sesión: el llamador hace el commit junto con el
cambio que provoca el aviso, para que nunca haya aviso sin hecho ni hecho
sin aviso.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Notificacion


def crear(
    sesion: AsyncSession,
    usuario_id: int | None,
    texto: str,
    tipo: str = "",
    documento_id: int | None = None,
    evitar: int | None = None,
    proyecto_id: int | None = None,
    destino: str = "",
) -> Notificacion | None:
    """Aviso a `usuario_id`. Nadie se avisa a sí mismo (`evitar`). `destino`:
    el lugar exacto del trabajo dentro del proyecto (parte, tarea, fase…)."""
    if not usuario_id or usuario_id == evitar:
        return None
    n = Notificacion(
        usuario_id=usuario_id, documento_id=documento_id, proyecto_id=proyecto_id,
        tipo=tipo, texto=texto[:500], destino=destino[:80],
    )
    sesion.add(n)
    # En vivo (2026-10-12, fase 8.5): la pestaña conectada al socket del chat se entera al instante y
    # recarga la campana; sin socket, el sondeo de siempre. El aviso ya está en la sesión: si el
    # commit falla, la campana no lo encontrará y no pasa nada.
    try:
        from app.servicios import difusor

        difusor.publicar({usuario_id}, {"tipo": "aviso", "texto": texto[:200], "clase": tipo, "destino": destino[:80]})
    except Exception:  # noqa: BLE001  nunca por un aviso en vivo
        pass
    # Aviso push al celular (2026-10-13, servicios/push.py) si la persona no tiene Qillqa a la vista.
    # Los del chat (directo, mención) los manda el chat (`chat.avisar`), con su acuse y su etiqueta.
    if tipo not in ("chat", "mencion"):
        try:
            from app.servicios import push

            if push.sin_la_app_a_la_vista({usuario_id}):
                push.programar({usuario_id}, push.carga("Qillqa", texto, push.ruta_aviso(documento_id, proyecto_id, destino),
                                                        f"aviso-{destino or tipo or 'sgdp'}"[:60], clase="aviso"), retraso=1.0)
        except Exception:  # noqa: BLE001  nunca por un aviso push
            pass
    return n


async def pendientes(sesion: AsyncSession, usuario_id: int) -> int:
    return (
        await sesion.execute(
            select(func.count()).select_from(Notificacion).where(
                Notificacion.usuario_id == usuario_id, Notificacion.leida.is_(False)
            )
        )
    ).scalar_one()

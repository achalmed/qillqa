"""Presencia: quién está trabajando en el sistema ahora (Edison 2026-10-01).

«Una función similar a Messenger: poner en línea a las personas que están
trabajando en el sistema.» Cada pestaña abierta manda un LATIDO cada ~30 s
(`POST /api/presencia`) con el documento que tiene delante y si la pestaña
está a la vista. Con eso cada persona queda en uno de tres estados:

  · en_linea  — latido reciente con la pestaña a la vista;
  · ausente   — latido reciente pero la pestaña oculta, o sin latido hace
                un rato (se fue a otra ventana, la laptop se suspendió);
  · desconectado — sin latido hace más de AUSENTE_HASTA.

El registro vive EN MEMORIA del proceso de la API (uvicorn corre con un
solo proceso, sin --reload): es efímero por naturaleza y no merece una
tabla. Lo que sí se guarda en la base es `usuarios.ultima_actividad`, como
mucho una vez cada PERSISTIR_CADA, para poder decir «visto hace 3 h» aunque
la API se haya reiniciado. Las funciones de cálculo son puras (pruebas en
tests/test_presencia.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# Sin latido durante este tiempo, la persona deja de estar «en línea».
EN_LINEA_HASTA = timedelta(seconds=75)
# … y pasado este, deja de estar «ausente» y figura como desconectada.
AUSENTE_HASTA = timedelta(minutes=10)
# Escritura de `ultima_actividad` en la base: no en cada latido.
PERSISTIR_CADA = timedelta(minutes=2)


@dataclass
class Latido:
    ultimo: datetime
    visible: bool
    documento_id: int | None
    persistido: datetime | None = None
    # Proyecto y parte en que trabaja (módulo de proyectos).
    proyecto_id: int | None = None
    seccion: str = ""


_registro: dict[int, Latido] = {}


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def registrar(
    usuario_id: int,
    documento_id: int | None,
    visible: bool,
    momento: datetime | None = None,
    proyecto_id: int | None = None,
    seccion: str = "",
) -> bool:
    """Anota el latido. Devuelve True si toca persistir `ultima_actividad`."""
    momento = momento or ahora()
    previo = _registro.get(usuario_id)
    persistido = previo.persistido if previo else None
    toca = persistido is None or momento - persistido >= PERSISTIR_CADA
    _registro[usuario_id] = Latido(
        ultimo=momento,
        visible=visible,
        documento_id=documento_id,
        persistido=momento if toca else persistido,
        proyecto_id=proyecto_id,
        seccion=seccion,
    )
    return toca


def olvidar(usuario_id: int) -> None:
    """Al cerrar sesión la persona sale de línea en el acto."""
    _registro.pop(usuario_id, None)


def estado_de(latido: Latido | None, momento: datetime | None = None) -> str:
    """en_linea | ausente | desconectado."""
    if latido is None:
        return "desconectado"
    momento = momento or ahora()
    edad = momento - latido.ultimo
    if edad > AUSENTE_HASTA:
        return "desconectado"
    if edad <= EN_LINEA_HASTA and latido.visible:
        return "en_linea"
    return "ausente"


def latido_de(usuario_id: int) -> Latido | None:
    return _registro.get(usuario_id)


ORDEN_ESTADO = {"en_linea": 0, "ausente": 1, "desconectado": 2}


def limpiar_registro() -> None:
    """Solo para pruebas."""
    _registro.clear()

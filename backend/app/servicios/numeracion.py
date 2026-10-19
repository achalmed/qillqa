"""Numeración oficial correlativa (sin huecos) y su presentación.

INVARIANTES (no negociables):
  1. Los números SOLO los emite el contador, con un UPDATE atómico sobre
     `contadores` dentro de la transacción de aprobación: N generaciones
     concurrentes obtienen números consecutivos distintos (la fila del
     contador serializa; verificado con generaciones simultáneas).
  2. NUNCA se usan SEQUENCE (dejarían huecos ante un rollback).
  3. La UNICIDAD la respalda el UniqueConstraint (despacho, tipo,
     periodo, numero) de `documentos`: aunque algo fallara, un duplicado
     es imposible de persistir.
  4. ELIMINAR un documento numerado no puede dejar saltos: solo se
     permite si es el ÚLTIMO de su serie (el contador se RECONCILIA al
     máximo real restante y el número se reutiliza); un número intermedio
     NO se elimina — se archiva (ver liberar_numero). El lock FOR UPDATE
     del contador serializa eliminar-último contra generar concurrente.
     Reconciliar al MAX real (no un ciego «ultimo-1») cierra correctamente
     un hueco previo: si faltaba el 0033 y se borra el último 0034, el
     contador queda en 0032 y el siguiente /generar reasigna 0033.
  5. Documentos importados del archivo no consumen contador, pero el
     importador lo reconcilia al máximo real (GREATEST) para que el
     siguiente /generar jamás colisione.
  6. Un documento ELABORADO FUERA DEL SISTEMA (Word u otro editor, con el
     número ya impreso) no recibe número: lo DECLARA, y el sistema solo lo
     acepta si es exactamente el siguiente de su serie (`asignar_declarado`,
     con el mismo lock FOR UPDATE). Un número ya emitido es un duplicado y
     uno más adelante dejaría un hueco; en los dos casos se rechaza con el
     motivo. Un número saltado se cierra declarándolo SIN documento (queda
     archivado como número anulado). Así el contador sigue siendo la única
     verdad aunque el despacho haya numerado a mano mientras el sistema
     estuvo caído (Edison 2026-09-11).
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.latex.generador import numero_completo
from app.modelos import Documento
from app.tipos import tipo_config

_SQL_SIGUIENTE = text(
    """
    INSERT INTO contadores (despacho_id, serie, periodo, ultimo)
    VALUES (:despacho, :serie, :periodo, 1)
    ON CONFLICT (despacho_id, serie, periodo)
    DO UPDATE SET ultimo = contadores.ultimo + 1
    RETURNING ultimo
    """
)


def tipodoc(doc: Documento) -> str:
    return tipo_config(doc.tipo)["tipodoc"]


def numero_mostrado(doc: Documento) -> str:
    """Los heredados conservan su numeración impresa original (p. ej.
    «Oficio Múltiple N°0001-…» o «Oficio S/N-ABC-2026-L»)."""
    if doc.origen == "framework":
        original = doc.campos.get("numero_completo_original")
        if original:
            return original
    return numero_completo(
        doc.numero, doc.periodo, config.siglas, tipodoc(doc),
        tipo_config(doc.tipo),
    )


async def asignar_siguiente(sesion: AsyncSession, doc: Documento) -> int:
    """Toma el siguiente número de la serie del documento (transaccional)."""
    resultado = await sesion.execute(
        _SQL_SIGUIENTE,
        {"despacho": doc.despacho_id, "serie": doc.serie, "periodo": doc.periodo},
    )
    return resultado.scalar_one()


_SQL_BLOQUEAR = text(
    "SELECT ultimo FROM contadores "
    "WHERE despacho_id = :despacho AND serie = :serie AND periodo = :periodo "
    "FOR UPDATE"
)

class NumeroNoConsecutivo(Exception):
    """El número declarado no es el siguiente de su serie. Lleva el motivo
    ya redactado para la persona (`str(e)`)."""

    def __init__(self, serie: str, numero: int, ultimo: int) -> None:
        self.serie, self.numero, self.ultimo = serie, numero, ultimo
        if numero <= ultimo:
            detalle = (
                f"El número {numero:04d} de la serie {serie} ya fue emitido "
                f"(el último es el {ultimo:04d}). Si ese documento ya está en "
                "el sistema, búsquelo en la bandeja; si no, revise el número."
            )
        else:
            faltan = (
                f"el {ultimo + 1:04d}"
                if numero == ultimo + 2
                else f"del {ultimo + 1:04d} al {numero - 1:04d}"
            )
            detalle = (
                f"El número {numero:04d} dejaría sin usar {faltan} de la "
                f"serie {serie}. Incorpore primero ese número (o declárelo "
                "como no utilizado), en orden."
            )
        super().__init__(detalle)


_SQL_CREAR_CONTADOR = text(
    "INSERT INTO contadores (despacho_id, serie, periodo, ultimo) "
    "VALUES (:despacho, :serie, :periodo, 0) "
    "ON CONFLICT (despacho_id, serie, periodo) DO NOTHING"
)

_SQL_FIJAR = text(
    "UPDATE contadores SET ultimo = :numero "
    "WHERE despacho_id = :despacho AND serie = :serie "
    "  AND periodo = :periodo AND ultimo = :ultimo"
)


async def asignar_declarado(sesion: AsyncSession, doc: Documento, numero: int) -> None:
    """Reserva en el contador un número que YA está impreso en un documento
    elaborado fuera del sistema (invariante 6).

    Bloquea la fila del contador (FOR UPDATE, como `liberar_numero`) y solo
    acepta `numero == ultimo + 1`; entonces deja el contador en `numero`. Si
    la serie aún no tiene contador, lo crea en 0 dentro de la misma
    transacción (el primer número declarable es el 0001). No hace commit:
    la reserva vive o muere con la transacción del llamador, igual que en
    /generar. Lanza `NumeroNoConsecutivo` con el motivo para la persona."""
    if numero < 1:
        raise NumeroNoConsecutivo(doc.serie, numero, 0)
    parametros = {
        "despacho": doc.despacho_id, "serie": doc.serie, "periodo": doc.periodo,
    }
    await sesion.execute(_SQL_CREAR_CONTADOR, parametros)
    ultimo = (await sesion.execute(_SQL_BLOQUEAR, parametros)).scalar_one()
    if numero != ultimo + 1:
        raise NumeroNoConsecutivo(doc.serie, numero, ultimo)
    await sesion.execute(_SQL_FIJAR, {**parametros, "numero": numero, "ultimo": ultimo})


_SQL_RECONCILIAR = text(
    "UPDATE contadores SET ultimo = COALESCE("
    "    (SELECT MAX(numero) FROM documentos "
    "     WHERE despacho_id = :despacho AND serie = :serie "
    "       AND periodo = :periodo AND numero IS NOT NULL "
    "       AND numero < :numero), 0) "
    "WHERE despacho_id = :despacho AND serie = :serie "
    "  AND periodo = :periodo AND ultimo = :numero"
)


async def liberar_numero(sesion: AsyncSession, doc: Documento) -> bool:
    """Intenta LIBERAR el número de un documento que va a eliminarse.

    Solo procede si el documento tiene el ÚLTIMO número emitido de su
    serie: el contador se RECONCILIA al máximo número real que queda en la
    serie (o 0 si no queda ninguno) en la MISMA transacción del borrado, y
    ese máximo+1 se reutilizará en el siguiente /generar (sin saltos). Si
    había un HUECO debajo (p. ej. faltaba 0033 y este es 0034), el contador
    baja a 0032 y el siguiente /generar reasigna 0033 —cerrando el hueco—.
    El SELECT ... FOR UPDATE serializa contra un /generar concurrente: o el
    generar toma el número antes (y este documento deja de ser el último,
    se devuelve False) o la reconciliación gana y el generar reutiliza.

    Devuelve False si el número NO es el último (eliminar dejaría un
    salto: el llamador debe rechazar la eliminación)."""
    if doc.numero is None:
        return True  # borradores: nada que liberar
    parametros = {
        "despacho": doc.despacho_id, "serie": doc.serie, "periodo": doc.periodo,
    }
    ultimo = (
        await sesion.execute(_SQL_BLOQUEAR, parametros)
    ).scalar_one_or_none()
    if ultimo is None or ultimo != doc.numero:
        return False
    await sesion.execute(_SQL_RECONCILIAR, {**parametros, "numero": doc.numero})
    return True

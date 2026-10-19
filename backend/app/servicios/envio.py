"""Regla de ENVÍO AUTOMÁTICO.

Un documento pasa solo a ENVIADO cuando queda probado que salió de la entidad.
Qué lo prueba depende del ámbito (Edison 2026-09-05):

  · EXTERNO: el PDF firmado cargado Y todas las constancias de recepción.
  · INTERNO: el registro en el STD del Congreso, que es el acto por el que el
    documento entra al circuito institucional y devuelve número de expediente.
    Pedirle además un cargo sellado sería pedir algo que nadie devuelve.

Complementa (NO reemplaza) el cambio manual del endpoint `/estado`, que sigue
disponible.

Es una POLÍTICA del sistema: corre sin importar el rol de quien completó los
archivos, pero SOLO avanza desde estados donde ENVIADO es transición válida
(APROBADO o FIRMADO; ver flujo.py), para no saltarse el flujo. Nunca revierte:
si luego se borra un archivo, el estado no retrocede automáticamente.

Desde el 2026-10-19 todo paso automático (FIRMADO, ENVIADO, la vuelta a APROBADO al
quitar el firmado) anuncia el cambio IGUAL que el manual (`anunciar_estado`): el
evento `documento.estado` y la conciliación de los recibidos que el oficio responde.
Y `al_dia` pone en FIRMADO lo que ya tiene su firmado vigente y se quedó en APROBADO
(firmados subidos antes de la regla, el barrido de carpetas, la reactivación desde
ARCHIVADO): Edison, 2026-10-19, «Por firmar» mostraba oficios con el check verde.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento, Usuario
from app.servicios import ambito as svc_ambito
from app.servicios import bitacora

# ENVIADO es transición válida desde estos estados (flujo.TRANSICIONES).
_ESTADOS_ORIGEN = {"APROBADO", "FIRMADO"}


def _destinatarios(doc: Documento) -> list[str]:
    """Mismo criterio que la bandeja: líneas «Nombre — Cargo» de
    destinatario_nombre, tomando el texto antes de « — »."""
    return [
        linea.split(" — ", 1)[0].strip()
        for linea in (doc.campos.get("destinatario_nombre") or "").splitlines()
        if linea.strip()
    ]


async def condiciones_cumplidas(sesion: AsyncSession, doc: Documento) -> bool:
    """¿Está probado que el documento salió de la entidad?

    En los INTERNOS basta el registro en el STD. En los EXTERNOS hace falta el
    documento firmado Y las constancias de recepción completas: una por
    destinatario (≥1 si hay uno solo). El conteo coincide con el indicador n/m
    de la bandeja, para que «n/m en verde» y «enviado automáticamente»
    signifiquen lo mismo.
    """
    if svc_ambito.clasificar(doc, await svc_ambito.indice_congreso(sesion)) == (
        svc_ambito.INTERNO
    ):
        return bool(doc.std_registrado)
    filas = (
        await sesion.execute(
            select(Adjunto).where(
                Adjunto.documento_id == doc.id,
                Adjunto.categoria.in_(["firmado", "recepcion"]),
            )
        )
    ).scalars().all()
    hay_firmado = any(a.categoria == "firmado" for a in filas)
    recepciones = sum(1 for a in filas if a.categoria == "recepcion")
    requeridas = max(1, len(_destinatarios(doc)))
    return hay_firmado and recepciones >= requeridas


async def anunciar_estado(
    sesion: AsyncSession, doc: Documento, usuario: Usuario | None, anterior: str, *, avisar: bool = True
) -> None:
    """Lo que acompaña a TODO cambio de estado, a mano (`PUT /estado`) o automático (este
    módulo): el evento `documento.estado`, que las reglas publican en el chat o en Telegram,
    y la conciliación de los recibidos que el oficio responde (FIRMADO o ENVIADO los da por
    respondidos). Antes solo el manual lo hacía. `avisar=False` (la puesta al día de estados
    viejos) concilia sin emitir: un «Firmado» de hace un mes en el chat sería ruido."""
    from app.servicios import entradas as svc_entradas
    from app.servicios import eventos_sistema

    if avisar:
        await eventos_sistema.emitir_seguro(
            sesion, "documento.estado", f"doc:{doc.id}",
            {**eventos_sistema.datos_documento(doc, usuario), "estado": doc.estado, "estado_anterior": anterior},
            clave=f"doc:{doc.id}:estado:{doc.estado}:{doc.version_contenido}", usuario=usuario,
        )
    await svc_entradas.conciliar_seguro(sesion, doc, usuario.id if usuario else None)


async def verificar(
    sesion: AsyncSession, doc: Documento, usuario: Usuario, *, avisar: bool = True
) -> bool:
    """Si el estado lo permite y se cumplen las condiciones, pasa el documento a
    ENVIADO y registra el evento en la MISMA transacción (el llamador hace el
    commit). Devuelve True si HIZO la transición (para avisarlo en la respuesta).
    """
    if doc.estado not in _ESTADOS_ORIGEN:
        return False
    if not await condiciones_cumplidas(sesion, doc):
        return False
    anterior = doc.estado
    doc.estado = "ENVIADO"
    interno = (
        svc_ambito.clasificar(doc, await svc_ambito.indice_congreso(sesion))
        == svc_ambito.INTERNO
    )
    bitacora.registrar(
        sesion,
        doc.id,
        usuario,
        "envio_automatico",
        f"{anterior} → ENVIADO automáticamente ("
        + (
            "documento interno registrado en el STD del Congreso"
            if interno
            else "documento firmado + constancias de recepción completas"
        )
        + ")",
    )
    await anunciar_estado(sesion, doc, usuario, anterior, avisar=avisar)
    return True


async def marcar_firmado(
    sesion: AsyncSession, doc: Documento, usuario: Usuario,
    motivo: str = "se cargó el documento firmado", *, avisar: bool = True,
) -> bool:
    """Con el PDF firmado cargado, un documento APROBADO pasa solo a FIRMADO
    (revisión de usabilidad 2026-10-01: quien subía el firmado lo seguía
    viendo en «Por firmar» de la bandeja). Es la misma política que el envío
    automático y el espejo de `firma.anular_firma` (que lo devuelve a
    APROBADO). Solo desde APROBADO: nunca salta ni retrocede otro estado.
    El llamador hace el commit; devuelve True si hizo la transición."""
    if doc.estado != "APROBADO":
        return False
    doc.estado = "FIRMADO"
    bitacora.registrar(
        sesion, doc.id, usuario, "firmado_automatico",
        f"APROBADO → FIRMADO automáticamente ({motivo})",
    )
    await anunciar_estado(sesion, doc, usuario, "APROBADO", avisar=avisar)
    return True


async def desmarcar_firmado(sesion: AsyncSession, doc: Documento, usuario: Usuario) -> bool:
    """Si se quita el último firmado de un documento FIRMADO (aún no
    enviado), vuelve a APROBADO: «Por firmar» de nuevo, como corresponde."""
    if doc.estado != "FIRMADO":
        return False
    quedan = (
        await sesion.execute(
            select(Adjunto.id).where(Adjunto.documento_id == doc.id, Adjunto.categoria == "firmado")
        )
    ).first()
    if quedan:
        return False
    doc.estado = "APROBADO"
    bitacora.registrar(
        sesion, doc.id, usuario, "firmado_retirado",
        "FIRMADO → APROBADO (se quitó el documento firmado)",
    )
    await anunciar_estado(sesion, doc, usuario, "FIRMADO")
    return True


# --- Puesta al día: APROBADO con su firmado vigente → FIRMADO -----------------------------

def motivo_pendiente(estado: str, oculto: bool, firma: str) -> str | None:
    """Por qué un documento debería estar en FIRMADO y no lo está, o None. Pura.
    `firma` es el `estado` de `vigencia.estado_firma`: solo un firmado VIGENTE cuenta
    (uno desactualizado ya no certifica lo impreso: ese sí espera otra firma)."""
    if estado != "APROBADO" or oculto:
        return None
    if firma != "vigente":
        return None
    return "tiene su documento firmado vigente y seguía en Aprobado"


async def al_dia(
    sesion: AsyncSession, doc: Documento, usuario: Usuario,
    motivo: str = "ya tenía su documento firmado", *, avisar: bool = True,
) -> bool:
    """Si el documento está APROBADO y ya tiene su firmado vigente, pasa a FIRMADO (y, si
    con eso se completa el envío, a ENVIADO). Para los caminos que registran un firmado sin
    pasar por la subida: el barrido de carpetas, la reactivación desde ARCHIVADO y la
    puesta al día de lo subido antes de la regla. No hace commit. Devuelve si cambió."""
    from app.servicios import vigencia

    firma = (await vigencia.estado_firma(sesion, doc))["estado"]
    if motivo_pendiente(doc.estado, bool(doc.oculto), firma) is None:
        return False
    await marcar_firmado(sesion, doc, usuario, motivo, avisar=avisar)
    await verificar(sesion, doc, usuario, avisar=avisar)
    return True


async def pendientes_de_firmado(sesion: AsyncSession) -> list[Documento]:
    """Los APROBADO visibles que tienen algún firmado (la vigencia se mira después)."""
    con_firmado = select(Adjunto.documento_id).where(Adjunto.categoria == "firmado")
    return list((await sesion.execute(
        select(Documento).where(
            Documento.estado == "APROBADO", Documento.oculto.is_(False), Documento.id.in_(con_firmado)
        ).order_by(Documento.id)
    )).scalars().all())


async def poner_al_dia(sesion: AsyncSession, usuario: Usuario, aplicar: bool) -> list[dict]:
    """Recorre los APROBADO con firmado y dice cuáles pasan a FIRMADO y por qué; con
    `aplicar`, los pasa (sin publicar en el chat: son estados viejos). No hace commit: el
    llamador confirma o, al simular, deshace (la vigencia anota la huella de los firmados
    anteriores a 2026-10-06 al leerla)."""
    from app.servicios import vigencia
    from app.servicios.numeracion import numero_mostrado
    from app.tipos import asunto_de

    filas: list[dict] = []
    for doc in await pendientes_de_firmado(sesion):
        firma = await vigencia.estado_firma(sesion, doc)
        motivo = motivo_pendiente(doc.estado, bool(doc.oculto), firma["estado"])
        adj = await vigencia.firmado_vigente(sesion, doc)
        fila = {
            "id": doc.id, "numero": numero_mostrado(doc) or "", "tipo": doc.tipo,
            "asunto": asunto_de(doc.tipo, doc.campos) or "",
            "firmado": (adj.nombre_original if adj else ""),
            "firmado_subido": adj.subido_en.isoformat() if adj and adj.subido_en else "",
            "firma": firma["estado"], "pasa": motivo is not None,
            "motivo": motivo or firma.get("motivo") or "el firmado no está vigente",
            "enviado": False,
        }
        if aplicar and motivo is not None:
            await marcar_firmado(sesion, doc, usuario, "puesta al día: ya tenía su documento firmado", avisar=False)
            fila["enviado"] = await verificar(sesion, doc, usuario, avisar=False)
        elif motivo is not None:
            fila["enviado"] = await condiciones_cumplidas(sesion, doc)
        if aplicar or motivo is None:
            fila["estado_final"] = doc.estado
        else:
            fila["estado_final"] = "ENVIADO" if fila["enviado"] else "FIRMADO"
        filas.append(fila)
    return filas

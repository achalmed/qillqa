"""Seguimiento del documento: comentarios, responsable y registro en el STD.

Tres piezas que responden a los pedidos de Edison del 2026-09-04:

  §1  Registro en el STD del Congreso — el último paso de la ruta del oficio.
      El sistema EXIGE tener antes la constancia de recepción; el «check verde»
      de la bandeja sale de `servicios/tramite.py`.
  §3  Observaciones — el diputado no puede observar sin decir qué corregir
      (la guarda vive en `documentos.py::cambiar_estado`, que usa este módulo).
  §4  Encargos — al devolver a borrador se deja la indicación del trabajo y se
      asigna un responsable (el diputado u otra persona), con historial.

Va en su propio router para no seguir engordando `api/documentos.py`; comparte
el prefijo /api/documentos porque todo cuelga de un documento.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Asignacion, Comentario, Documento, Usuario
from app.seguridad import usuario_actual
from app.servicios import ambito as svc_ambito
from app.servicios import bitacora, envio, revision, tramite
from app.servicios import notificaciones as svc_notif
from app.servicios import comentarios as svc_com

router = APIRouter(prefix="/api/documentos", tags=["seguimiento"])


# ------------------------------ entrada ------------------------------

class NuevoComentario(BaseModel):
    texto: str = Field(min_length=svc_com.LARGO_MINIMO, max_length=4000)
    tipo: str = "observacion"
    # A quién se dirige (opcional): por omisión, el responsable vigente.
    dirigido_a: int | None = None
    # Parte del documento a la que se refiere (clave de campo o de sección;
    # ver servicios/comentarios.py::ETIQUETA_SECCION). Vacío = general.
    seccion: str = Field(default="", max_length=40)


class LevantarComentario(BaseModel):
    respuesta: str = Field(default="", max_length=4000)


class CambioResponsable(BaseModel):
    # None = quitar el responsable (el documento queda sin dueño).
    responsable_id: int | None = None
    # Indicación del trabajo encargado; se guarda como comentario 'indicacion'.
    nota: str = Field(default="", max_length=4000)


class RegistroStd(BaseModel):
    registrado: bool = True
    numero: str = Field(default="", max_length=120)
    fecha: str = Field(default="", max_length=20)  # ISO
    nota: str = Field(default="", max_length=1000)


# ------------------------------ helpers ------------------------------

async def _cargar(documento_id: int, sesion: AsyncSession) -> Documento:
    doc = await sesion.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    return doc


async def _nombres(sesion: AsyncSession, ids: set[int]) -> dict[int, str]:
    """Mapa id -> nombre completo para las cuentas citadas (una consulta)."""
    ids = {i for i in ids if i}
    if not ids:
        return {}
    filas = await sesion.execute(
        select(Usuario.id, Usuario.nombre_completo).where(Usuario.id.in_(ids))
    )
    return dict(filas.all())


async def _validar_usuario(sesion: AsyncSession, usuario_id: int) -> Usuario:
    u = await sesion.get(Usuario, usuario_id)
    if u is None or not u.activo:
        raise HTTPException(422, "La persona indicada no es una cuenta activa.")
    return u


# ------------------------------ comentarios --------------------------

@router.post("/{documento_id}/abrir")
async def abrir(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Registra que alguien ABRIÓ el documento para trabajarlo.

    Hoy tiene una sola consecuencia: si el diputado o un asesor abre un
    borrador, el documento pasa solo a «En revisión» (servicios/revision.py) —
    abrirlo ES el hecho de estar revisándolo, y la secretaría lo ve al
    instante sin que nadie tenga que acordarse de cambiar el estado.

    Es un POST y no un efecto colgado del GET del documento a propósito: ese
    GET se pide varias veces por documento (la ruta sondea el origen para
    elegir la vista, el editor refresca el estado tras cada acción) y un efecto
    ahí se dispararía donde nadie lo espera. Aquí la intención es explícita:
    la vista lo llama UNA vez, al montarse.
    """
    doc = await _cargar(documento_id, sesion)
    if doc.oculto and usuario.rol != "administrador":
        raise HTTPException(404, "El documento no existe.")
    movido = await revision.al_abrir(sesion, doc, usuario)
    if movido:
        await sesion.commit()
    return {"estado": doc.estado, "revision_automatica": movido}


@router.get("/{documento_id}/comentarios")
async def listar_comentarios(
    documento_id: int,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Observaciones, indicaciones y notas del documento (más reciente
    primero). El AUTOR sí se muestra a todos los roles: el objetivo del panel
    es saber quién pide qué corrección."""
    await _cargar(documento_id, sesion)
    filas = (
        (
            await sesion.execute(
                select(Comentario)
                .where(Comentario.documento_id == documento_id)
                .order_by(Comentario.creado_en.desc())
            )
        )
        .scalars()
        .all()
    )
    citados = {c.usuario_id for c in filas}
    citados |= {c.dirigido_a for c in filas if c.dirigido_a}
    citados |= {c.resuelto_por for c in filas if c.resuelto_por}
    nombres = await _nombres(sesion, citados)
    return [svc_com.vista(c, nombres) for c in filas]


@router.post("/{documento_id}/comentarios", status_code=201)
async def crear_comentario(
    documento_id: int,
    datos: NuevoComentario,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Deja un comentario y, si es una OBSERVACIÓN de quien puede observar,
    mueve el documento a «Observado» en el mismo paso (Edison 2026-09-05).

    Antes había dos caminos que hacían falta a la vez: observar desde
    `PUT /estado` (que exige el comentario) o comentar aquí sin mover nada. El
    diputado escribía la observación y el documento seguía «En revisión». Ahora
    escribir la observación basta: `servicios/revision.py` decide si mueve —solo
    si esa persona podría haber hecho ese cambio a mano—. `PUT /estado` sigue
    funcionando igual para quien prefiera el camino explícito."""
    doc = await _cargar(documento_id, sesion)
    if datos.tipo not in svc_com.TIPOS:
        raise HTTPException(422, f"Tipo de comentario no válido: {datos.tipo}")
    if datos.dirigido_a:
        await _validar_usuario(sesion, datos.dirigido_a)
    c = svc_com.crear(
        sesion,
        doc.id,
        usuario,
        datos.texto,
        tipo=datos.tipo,
        dirigido_a=datos.dirigido_a or doc.responsable_id,
        seccion=datos.seccion,
    )
    donde = f" [{svc_com.ETIQUETA_SECCION[c.seccion]}]" if c.seccion else ""
    bitacora.registrar(
        sesion,
        doc.id,
        usuario,
        "comentario",
        f"{svc_com.ETIQUETA_TIPO.get(c.tipo, c.tipo)}{donde}: {c.texto[:200]}",
    )
    # La observación mueve el trámite: EN_REVISION → OBSERVADO, o ENVIADO →
    # OBSERVADO_ENVIADO si el documento ya salió de la entidad.
    movido = await revision.al_observar(sesion, doc, usuario, c)
    # Aviso a quien debe atenderla: el destinatario del comentario, el
    # responsable vigente o, en su defecto, quien creó el documento.
    donde = f" [{svc_com.ETIQUETA_SECCION[c.seccion]}]" if c.seccion else ""
    svc_notif.crear(
        sesion,
        c.dirigido_a or doc.responsable_id or doc.creado_por,
        f"{usuario.nombre_completo} dejó una {svc_com.ETIQUETA_TIPO.get(c.tipo, c.tipo).lower()}{donde}: "
        f"{c.texto[:120]}",
        tipo=c.tipo,
        documento_id=doc.id,
        evitar=usuario.id,
    )
    await sesion.commit()
    await sesion.refresh(c)
    nombres = await _nombres(sesion, {c.usuario_id, c.dirigido_a or 0})
    return {
        **svc_com.vista(c, nombres),
        "estado": doc.estado,
        "estado_automatico": movido,
    }


@router.post("/{documento_id}/comentarios/{comentario_id}/levantar")
async def levantar_comentario(
    documento_id: int,
    comentario_id: int,
    datos: LevantarComentario,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Da por atendida una observación o indicación: quien corrigió explica
    cómo la levantó. No se borra nada — queda la traza completa.

    Si con esto ya no quedan observaciones pendientes, el documento vuelve solo
    al punto donde estaba (OBSERVADO → En revisión, OBSERVADO_ENVIADO →
    Enviado): así se cierra el circuito observación → corrección → reenvío sin
    que nadie tenga que acordarse de mover el estado."""
    doc = await _cargar(documento_id, sesion)
    c = await sesion.get(Comentario, comentario_id)
    if c is None or c.documento_id != documento_id:
        raise HTTPException(404, "El comentario no existe.")
    if c.resuelto:
        raise HTTPException(409, "Ese comentario ya estaba atendido.")
    svc_com.levantar(c, usuario, datos.respuesta)
    bitacora.registrar(
        sesion,
        documento_id,
        usuario,
        "comentario_levantado",
        f"{svc_com.ETIQUETA_TIPO.get(c.tipo, c.tipo)} atendida: {c.texto[:120]}"
        + (f" — {datos.respuesta[:120]}" if datos.respuesta.strip() else ""),
    )
    movido = await revision.al_levantar(sesion, doc, usuario)
    # Aviso a quien OBSERVÓ: la subsanación está lista para que la revise y dé
    # conformidad (Edison 2026-09-05). Queda pendiente de conformidad.
    c.conformidad = ""
    svc_notif.crear(
        sesion,
        c.usuario_id,
        f"{usuario.nombre_completo} subsanó su observación «{c.texto[:80]}». "
        "Revise la nueva versión y dé su conformidad.",
        tipo="subsanacion",
        documento_id=doc.id,
        evitar=usuario.id,
    )
    await sesion.commit()
    await sesion.refresh(c)
    nombres = await _nombres(sesion, {c.usuario_id, c.resuelto_por or 0})
    return {
        **svc_com.vista(c, nombres),
        "estado": doc.estado,
        "estado_automatico": movido,
    }


class Conformidad(BaseModel):
    valor: str = Field(pattern="^(conforme|pendiente)$")


@router.post("/{documento_id}/comentarios/{comentario_id}/conformidad")
async def conformidad_comentario(
    documento_id: int,
    comentario_id: int,
    datos: Conformidad,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Quien OBSERVÓ revisa la subsanación: «conforme» la cierra del todo;
    «pendiente» la REABRE (vuelve a resuelto=False y el documento vuelve a
    Observado, igual que una observación nueva). Cierra el circuito
    observación → subsanación → conformidad con trazabilidad completa."""
    doc = await _cargar(documento_id, sesion)
    c = await sesion.get(Comentario, comentario_id)
    if c is None or c.documento_id != documento_id:
        raise HTTPException(404, "El comentario no existe.")
    if not c.resuelto:
        raise HTTPException(409, "La observación todavía no fue subsanada.")
    if c.usuario_id != usuario.id and usuario.rol != "administrador":
        raise HTTPException(403, "Solo quien hizo la observación puede dar conformidad.")
    movido = False
    if datos.valor == "conforme":
        c.conformidad = "conforme"
        bitacora.registrar(sesion, doc.id, usuario, "conformidad",
                           f"Conforme con la subsanación: {c.texto[:120]}")
        svc_notif.crear(sesion, c.resuelto_por, f"{usuario.nombre_completo} dio conformidad a la subsanación de «{c.texto[:80]}».",
                        tipo="conformidad", documento_id=doc.id, evitar=usuario.id)
    else:
        c.conformidad = ""
        c.resuelto = False
        quien = c.resuelto_por
        c.resuelto_por = None
        c.resuelto_en = None
        bitacora.registrar(sesion, doc.id, usuario, "comentario",
                           f"Observación reabierta (sigue pendiente): {c.texto[:120]}")
        movido = await revision.al_observar(sesion, doc, usuario, c)
        svc_notif.crear(sesion, quien or doc.responsable_id or doc.creado_por,
                        f"{usuario.nombre_completo} indicó que la observación «{c.texto[:80]}» sigue pendiente.",
                        tipo="reapertura", documento_id=doc.id, evitar=usuario.id)
    await sesion.commit()
    await sesion.refresh(c)
    nombres = await _nombres(sesion, {c.usuario_id, c.resuelto_por or 0})
    return {**svc_com.vista(c, nombres), "estado": doc.estado, "estado_automatico": movido}


# ------------------------------ responsable --------------------------

@router.get("/{documento_id}/asignaciones")
async def listar_asignaciones(
    documento_id: int,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Historial de encargos del documento (quién lo tuvo y con qué
    indicación), más reciente primero."""
    await _cargar(documento_id, sesion)
    filas = (
        (
            await sesion.execute(
                select(Asignacion)
                .where(Asignacion.documento_id == documento_id)
                .order_by(Asignacion.creado_en.desc())
            )
        )
        .scalars()
        .all()
    )
    nombres = await _nombres(
        sesion,
        {a.asignado_por for a in filas} | {a.responsable_id for a in filas if a.responsable_id},
    )
    return [
        {
            "id": a.id,
            "responsable": nombres.get(a.responsable_id or 0, "") or "— sin responsable —",
            "responsable_id": a.responsable_id,
            "asignado_por": nombres.get(a.asignado_por, ""),
            "nota": a.nota,
            "creado_en": a.creado_en.isoformat() if a.creado_en else None,
        }
        for a in filas
    ]


@router.put("/{documento_id}/responsable")
async def cambiar_responsable(
    documento_id: int,
    datos: CambioResponsable,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Encarga el documento a alguien (el diputado u otra persona) con la
    indicación de lo que debe hacer. Cada cambio se apunta en el historial y
    la indicación queda como comentario PENDIENTE del nuevo responsable."""
    doc = await _cargar(documento_id, sesion)
    destino = None
    if datos.responsable_id:
        destino = await _validar_usuario(sesion, datos.responsable_id)
    anterior = doc.responsable_id
    doc.responsable_id = destino.id if destino else None
    sesion.add(
        Asignacion(
            documento_id=doc.id,
            responsable_id=doc.responsable_id,
            asignado_por=usuario.id,
            nota=datos.nota.strip(),
        )
    )
    # La indicación es un comentario dirigido al nuevo responsable: así la ve
    # en el documento, no solo en un historial que nadie abre.
    if datos.nota.strip():
        svc_com.crear(
            sesion,
            doc.id,
            usuario,
            datos.nota,
            tipo="indicacion",
            dirigido_a=doc.responsable_id,
        )
    svc_notif.crear(
        sesion, doc.responsable_id,
        f"{usuario.nombre_completo} le encargó el documento"
        + (f": {datos.nota.strip()[:120]}" if datos.nota.strip() else "."),
        tipo="indicacion", documento_id=doc.id, evitar=usuario.id,
    )
    nombres = await _nombres(sesion, {anterior or 0, doc.responsable_id or 0})
    bitacora.registrar(
        sesion,
        doc.id,
        usuario,
        "responsable",
        f"{nombres.get(anterior or 0, '— sin responsable —')} → "
        f"{nombres.get(doc.responsable_id or 0, '— sin responsable —')}"
        + (f" · {datos.nota.strip()[:200]}" if datos.nota.strip() else ""),
    )
    await sesion.commit()
    return {
        "ok": True,
        "responsable_id": doc.responsable_id,
        "responsable": nombres.get(doc.responsable_id or 0, ""),
    }


# ------------------------------ ámbito -------------------------------

class CambioAmbito(BaseModel):
    # '' = que lo deduzca el sistema; 'interno' | 'externo' = lo fija la persona.
    ambito: str = Field(default="", max_length=20)


@router.put("/{documento_id}/ambito")
async def cambiar_ambito(
    documento_id: int,
    datos: CambioAmbito,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Fija a mano si el documento es interno o externo, o devuelve la decisión
    al sistema (`ambito` vacío).

    Existe porque ninguna regla acierta siempre: el despacho conoce casos que
    el directorio no refleja todavía. Cambiar el ámbito cambia el trámite —un
    interno deja de esperar cargo de recepción—, así que queda en la bitácora.
    """
    valor = datos.ambito.strip().lower()
    if valor not in ("", svc_ambito.INTERNO, svc_ambito.EXTERNO):
        raise HTTPException(422, "El ámbito debe ser «interno», «externo» o vacío.")
    doc = await _cargar(documento_id, sesion)
    anterior = doc.ambito or "automático"
    doc.ambito = valor
    bitacora.registrar(
        sesion, doc.id, usuario, "ambito",
        f"Ámbito del documento: {anterior} → {valor or 'automático'}",
    )
    await sesion.commit()
    nuevo = await tramite.de_documento(sesion, doc)
    permitido, motivo = tramite.puede_registrar_std(nuevo)
    return {
        "ok": True,
        **nuevo,
        "std_nota": doc.std_nota or "",
        "plazo_legal": doc.plazo_legal or {},
        "puede_std": permitido,
        "motivo_std": motivo,
    }


# ------------------------------ registro en el STD -------------------

@router.get("/{documento_id}/tramite")
async def ver_tramite(
    documento_id: int,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Los cuatro hitos de la ruta del oficio y si el proceso está completo."""
    doc = await _cargar(documento_id, sesion)
    estado = await tramite.de_documento(sesion, doc)
    permitido, motivo = tramite.puede_registrar_std(estado)
    return {**estado, "std_nota": doc.std_nota or "", "plazo_legal": doc.plazo_legal or {}, "puede_std": permitido, "motivo_std": motivo}


class ExpedienteEntidad(BaseModel):
    numero: str = Field(default="", max_length=120)


@router.put("/{documento_id}/expediente-entidad")
async def poner_expediente_entidad(
    documento_id: int,
    datos: ExpedienteEntidad,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Corrige o escribe a mano el n.º de expediente que la entidad dio al documento (el
    sistema lo lee solo del cargo de recepción cuando el PDF tiene texto)."""
    if usuario.rol == "invitado":
        raise HTTPException(403, "Su rol no permite cambiar el seguimiento.")
    doc = await _cargar(documento_id, sesion)
    doc.expediente_entidad = datos.numero.strip()
    bitacora.registrar(
        sesion, doc.id, usuario, "expediente_externo",
        f"N.º de expediente de la entidad: {doc.expediente_entidad}" if doc.expediente_entidad else "Quitó el n.º de expediente de la entidad",
    )
    await sesion.commit()
    return {"expediente_entidad": doc.expediente_entidad}


@router.put("/{documento_id}/std")
async def registrar_std(
    documento_id: int,
    datos: RegistroStd,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Marca (o desmarca) el registro del documento en el Sistema de Trámite
    Documentario del Congreso.

    REGLA DEL DESPACHO para los documentos EXTERNOS: para registrar hace falta
    la constancia de recepción — en Mesa de Partes / Oficialía Mayor se
    registra el cargo, no el oficio suelto. Sin ella, 409 con el motivo.

    En los INTERNOS es al revés: el registro en el STD ES la prueba de entrega,
    así que no se pide nada antes y, al marcarlo, el documento pasa solo a
    ENVIADO (Edison 2026-09-05; la regla vive en servicios/envio.py).

    Desmarcar siempre se permite (fue un error de digitación) y queda en la
    bitácora.
    """
    doc = await _cargar(documento_id, sesion)
    estado = await tramite.de_documento(sesion, doc)
    if datos.registrado:
        permitido, motivo = tramite.puede_registrar_std(estado)
        if not permitido:
            raise HTTPException(409, motivo)
        doc.std_registrado = True
        doc.std_numero = datos.numero.strip()
        doc.std_fecha = datos.fecha.strip()
        doc.std_nota = datos.nota.strip()
        doc.std_registrado_por = usuario.id
        detalle = "Registrado en el STD del Congreso" + (
            f" — expediente {doc.std_numero}" if doc.std_numero else ""
        ) + (f" ({doc.std_fecha})" if doc.std_fecha else "")
    else:
        doc.std_registrado = False
        doc.std_numero = ""
        doc.std_fecha = ""
        doc.std_nota = datos.nota.strip()
        doc.std_registrado_por = None
        detalle = "Se retiró la marca de registro en el STD"
    bitacora.registrar(sesion, doc.id, usuario, "std", detalle)
    # En un interno, registrarlo en el STD es lo que prueba que salió: el envío
    # automático se evalúa aquí y no espera a que suban un archivo.
    enviado_solo = await envio.verificar(sesion, doc, usuario) if datos.registrado else False
    await sesion.commit()
    nuevo = await tramite.de_documento(sesion, doc)
    permitido, motivo = tramite.puede_registrar_std(nuevo)
    return {
        "ok": True,
        **nuevo,
        "std_nota": doc.std_nota or "",
        "plazo_legal": doc.plazo_legal or {},
        "puede_std": permitido,
        "motivo_std": motivo,
        "envio_automatico": enviado_solo,
        "estado": doc.estado,
    }


# --- pegar el resultado del prompt de seguimiento (2026-10-12; servicios/pegado) ---------------
# `POST /{id}/pegar-seguimiento` interpreta el bloque `seguimiento-documento` y devuelve la vista
# previa: expediente de la entidad, plazo legal, actuaciones (nuevas o ya registradas), respuestas
# halladas en Recibidos y la tarea de próxima revisión. `POST /{id}/aplicar-seguimiento` escribe lo
# que la persona marcó, en una transacción, y deja la constancia en `pegados`. El estado del
# documento nunca se toca desde aquí: `estado_propuesto` solo se muestra.


class PegarSeguimiento(BaseModel):
    texto: str = Field(min_length=1, max_length=60000)


@router.post("/{documento_id}/pegar-seguimiento")
async def pegar_seguimiento(
    documento_id: int,
    datos: PegarSeguimiento,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    import re as _re

    from app.modelos import Entrada
    from app.servicios import actuaciones as svc_act
    from app.servicios import pegado as svc_pegado
    from app.servicios.entradas import similitud
    from app.servicios.numeracion import numero_mostrado

    if usuario.rol == "invitado":
        raise HTTPException(403, "Su rol no permite cambiar el seguimiento.")
    doc = await _cargar(documento_id, sesion)
    le = svc_pegado.interpretar(datos.texto, ("seguimiento-documento",))
    if not le.valido:
        raise HTTPException(422, {"codigo": "pegado_invalido", "errores": le.errores, "avisos": le.avisos,
                                  "formatos": [f for f in svc_pegado.formatos() if f["tipo"] == "seguimiento-documento"]})
    v = le.valores
    avisos = list(le.avisos)
    # ¿Es este documento? Se compara el número del bloque con el número oficial y el de serie.
    numero = numero_mostrado(doc) or ""
    dicho = v.get("documento") or ""
    cifras_dicho = _re.findall(r"\d{3,}", dicho)
    cifras_doc = _re.findall(r"\d{3,}", numero) + ([f"{doc.numero:04d}", str(doc.numero)] if doc.numero else [])
    mismo = bool(cifras_dicho) and any(c.lstrip("0") in {x.lstrip("0") for x in cifras_doc} for c in cifras_dicho)
    if not mismo:
        avisos.append(f"El bloque dice «{dicho}» y este documento es {numero or 'un borrador sin número'}: compruebe que pegó el seguimiento correcto.")
    # Actuaciones: nuevas o ya registradas.
    existentes = await svc_act.listar(sesion, f"doc:{doc.id}")
    actuaciones = svc_act.deduplicar(v.get("actuaciones") or [], existentes)
    # Respuestas: se buscan en Recibidos por n.º STD o por el número del documento.
    respuestas = []
    for r in v.get("respuestas") or []:
        hallada = None
        std = "".join(ch for ch in (r.get("std_numero") or "") if ch.isdigit())
        if std:
            hallada = (await sesion.execute(select(Entrada).where(Entrada.std_numero == std))).scalars().first()
        if hallada is None and r.get("documento"):
            cifras = _re.findall(r"\d{3,}", r["documento"])
            if cifras:
                candidatas = (await sesion.execute(select(Entrada).where(Entrada.documento.ilike(f"%{cifras[0]}%")).limit(10))).scalars().all()
                hallada = max(candidatas, key=lambda e: similitud(e.documento or "", r["documento"]), default=None)
        ya = hallada is not None and hallada.respuesta_documento_id == doc.id
        respuestas.append({**r, "entrada": {"id": hallada.id, "asunto": hallada.asunto, "documento": hallada.documento, "estado": hallada.estado} if hallada else None,
                           "estado": "vinculada" if ya else ("hallada" if hallada else "no_hallada")})
    plazo = v.get("plazo_legal") or {}
    propuesto = {
        "expediente_entidad": v.get("expediente_entidad") or "",
        "plazo_legal": plazo,
        "estado_propuesto": v.get("estado_propuesto") or "",
        "ubicacion": v.get("ubicacion") or "", "responsable_entidad": v.get("responsable_entidad") or "",
        "pendientes": v.get("pendientes") or [], "proxima_revision": v.get("proxima_revision") or "",
        "resumen": v.get("resumen") or "",
    }
    actual = {"expediente_entidad": doc.expediente_entidad or "", "plazo_legal": doc.plazo_legal or {}, "std_nota": doc.std_nota or ""}
    diferencias = svc_pegado.comparar(
        {k: propuesto[k] for k in ("expediente_entidad", "plazo_legal") if propuesto[k]},
        actual, {"expediente_entidad": "Expediente en la entidad", "plazo_legal": "Plazo legal"},
    )
    return {
        "lectura": {**le.como_dict(), "avisos": avisos}, "mismo_documento": mismo, "numero": numero,
        "diferencias": diferencias, "propuesto": propuesto, "actuaciones": actuaciones, "respuestas": respuestas,
        "tarea": {"titulo": f"Revisar el trámite de {numero or 'este documento'}", "vence": propuesto["proxima_revision"]} if propuesto["proxima_revision"] else None,
        "resto": le.resto,
    }


class ActuacionPegada(BaseModel):
    fecha: str = Field(min_length=10, max_length=10)
    clase: str = "nota"
    texto: str = Field(min_length=1, max_length=4000)
    fuente: str = Field("", max_length=200)


class AplicarSeguimiento(BaseModel):
    expediente_entidad: str | None = Field(None, max_length=120)
    plazo_legal: dict | None = None
    std_nota_anexar: list[str] = []
    actuaciones: list[ActuacionPegada] = []
    vincular_entradas: list[int] = []
    tarea: dict | None = None            # {titulo, vence: AAAA-MM-DD}
    pegado: dict | None = None           # {tipo, version, fuente, texto, campos_propuestos, rechazados}
    # Lo que dice la fuente y no se guarda en el documento (estado propuesto, ubicación, responsable en la
    # entidad, qué falta, en resumen): solo viaja al estado del expediente que se publica en el chat.
    # Sin ella se toma de `pegado.campos_propuestos` (la vista previa de `pegar-seguimiento`).
    situacion: dict | None = None


@router.post("/{documento_id}/aplicar-seguimiento")
async def aplicar_seguimiento(
    documento_id: int,
    datos: AplicarSeguimiento,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    from app.modelos import Entrada, Pegado
    from app.modelos_tareas import Tarea
    from app.servicios import actuaciones as svc_act
    from app.servicios import entradas as svc_entradas
    from app.servicios import tareas as svc_tareas
    from app.servicios import tareas_reglas as reglas

    if usuario.rol == "invitado":
        raise HTTPException(403, "Su rol no permite cambiar el seguimiento.")
    doc = await _cargar(documento_id, sesion)
    hecho: dict = {"actuaciones": 0, "vinculadas": 0, "tarea_id": None}
    pegado = None
    if datos.pegado and datos.pegado.get("texto"):
        pegado = Pegado(
            usuario_id=usuario.id, tipo=str(datos.pegado.get("tipo") or "seguimiento-documento"),
            version=int(datos.pegado.get("version") or 1), fuente=str(datos.pegado.get("fuente") or "yaml"),
            texto=str(datos.pegado["texto"]), campos_propuestos=datos.pegado.get("campos_propuestos") or {},
            campos_aplicados=datos.model_dump(exclude={"pegado"}), rechazados=list(datos.pegado.get("rechazados") or []),
            entidad=f"doc:{doc.id}",
        )
        sesion.add(pegado)
        await sesion.flush()
    if datos.expediente_entidad is not None and datos.expediente_entidad.strip() != (doc.expediente_entidad or ""):
        doc.expediente_entidad = datos.expediente_entidad.strip()
        bitacora.registrar(sesion, doc.id, usuario, "expediente_externo", f"N.º de expediente de la entidad (pegado): {doc.expediente_entidad}")
    if datos.plazo_legal is not None:
        doc.plazo_legal = {k: v for k, v in datos.plazo_legal.items() if k in ("norma", "articulo", "dias", "desde", "vence") and v not in (None, "")}
        bitacora.registrar(sesion, doc.id, usuario, "plazo_legal", f"Plazo legal: {doc.plazo_legal.get('norma', '')} {doc.plazo_legal.get('articulo', '')}, vence {doc.plazo_legal.get('vence', '')}".strip())
    if datos.std_nota_anexar:
        base = doc.std_nota or ""
        nuevas = [ln for ln in datos.std_nota_anexar if ln and ln not in base]
        if nuevas:
            doc.std_nota = (base + "\n" if base else "") + "\n".join(nuevas)
    for a in datos.actuaciones:
        svc_act.crear(sesion, entidad=f"doc:{doc.id}", fecha=a.fecha, clase=a.clase, texto=a.texto, fuente=a.fuente,
                      origen="pegado", usuario=usuario, pegado_id=pegado.id if pegado else None)
        hecho["actuaciones"] += 1
    if hecho["actuaciones"]:
        bitacora.registrar(sesion, doc.id, usuario, "actuacion", f"{hecho['actuaciones']} actuación(es) desde el pegado de seguimiento, por confirmar")
    for eid in datos.vincular_entradas:
        e = await sesion.get(Entrada, eid)
        if e is not None:
            await svc_entradas.vincular(sesion, e, doc, usuario.id, "manual")
            hecho["vinculadas"] += 1
    if datos.tarea and datos.tarea.get("vence"):
        vence, con_hora = reglas.plazo(str(datos.tarea["vence"])[:10], None, svc_tareas.zona())
        t = Tarea(
            titulo=str(datos.tarea.get("titulo") or f"Revisar el trámite de {doc.id}")[:300], descripcion="Propuesta por el pegado de seguimiento.",
            estado="por_hacer", prioridad="normal", responsable_id=doc.responsable_id or usuario.id, vence_en=vence, con_hora=con_hora,
            origen="pegado", externo_id=f"doc:{doc.id}:revision:{str(datos.tarea['vence'])[:10]}", creado_por=usuario.id,
            etiquetas=[], checklist=[],
        )
        sesion.add(t)
        await sesion.flush()
        await svc_tareas.poner_vinculos(sesion, f"tarea:{t.id}", [f"doc:{doc.id}"], usuario.id)
        hecho["tarea_id"] = t.id
    await _publicar_estado(sesion, doc, datos, pegado, usuario)
    await sesion.commit()
    return {**hecho, "pegado_id": pegado.id if pegado else None}


async def _publicar_estado(sesion: AsyncSession, doc: Documento, datos: AplicarSeguimiento, pegado, usuario: Usuario) -> None:
    """El ESTADO DEL EXPEDIENTE en el chat (2026-10-18; evento `documento.seguimiento`, regla
    `canal-seguimiento-estado`, texto de `redaccion_chat.seguimiento`): dónde está, quién lo tiene,
    desde cuándo, el plazo, qué falta. Solo si la fuente dijo algo del trámite."""
    from datetime import datetime, timezone

    from app.servicios import actuaciones as svc_act
    from app.servicios import eventos_sistema
    from app.servicios.numeracion import numero_mostrado
    from app.servicios.redaccion_chat import fecha_movimiento
    from app.tipos import asunto_de

    s = datos.situacion or ((datos.pegado or {}).get("campos_propuestos") or {})
    claves = ("estado_propuesto", "ubicacion", "responsable_entidad", "pendientes", "resumen")
    if not any(s.get(k) for k in claves) and not datos.actuaciones:
        return
    await sesion.flush()
    estado = {k: s.get(k) or ("" if k != "pendientes" else []) for k in claves}
    await eventos_sistema.emitir_seguro(
        sesion, "documento.seguimiento", f"doc:{doc.id}",
        {"numero": numero_mostrado(doc) or "", "asunto": asunto_de(doc.tipo, doc.campos) or "", "expediente_entidad": doc.expediente_entidad or "",
         **estado, "plazo_legal": doc.plazo_legal or {}, "ultima_fecha": fecha_movimiento(await svc_act.listar(sesion, f"doc:{doc.id}"))},
        clave=f"doc:{doc.id}:seguimiento:" + (str(pegado.id) if pegado else datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")), usuario=usuario)

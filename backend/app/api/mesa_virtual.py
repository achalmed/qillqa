"""API del EQUIPO para la mesa de partes virtual (2026-10-12; con sesión). La página pública vive en
api/mesa_publica.py; esto es lo que se hace desde Recibidos y desde Administración.

- `GET  /api/mesa-virtual/config`                 — la configuración (todo el equipo la lee; el enlace para copiar).
- `PUT  /api/mesa-virtual/config`                 — guardarla (solo administración): horario,
                                                     días no hábiles, plazo de subsanación, límites y tipos.
- `GET  /api/mesa-virtual/plazo?dias=2`           — hasta qué día hábil iría un plazo que empieza hoy.
- `GET  /api/mesa-virtual/entradas/{eid}`         — el trámite de un recibido que llegó por la mesa virtual.
- `POST /api/mesa-virtual/entradas/{eid}/accion`  — revisión, observar (motivo y plazo en días hábiles),
                                                     derivar, archivar o reabrir: cambia el estado PÚBLICO.
- `POST /api/mesa-virtual/entradas/{eid}/atender` — atender con la respuesta: un PDF subido o un documento
                                                     propio de Qillqa (firmado o generado), que el remitente descarga.
- `GET  /api/mesa-virtual/archivos/{aid}`         — un archivo del trámite (principal, anexo, subsanación, respuesta).
- `GET|POST /api/mesa-virtual/entradas/{eid}/contacto` — el remitente al directorio (2026-10-13): lo que se
                                                     propone y lo que coincide; vincular o crear, con confirmación.
"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import enviar_archivo
from app.db import obtener_sesion
from app.modelos import Adjunto, Documento, Entrada, Usuario
from app.modelos_mesa import MesaArchivo, MesaTramite
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import bitacora
from app.servicios import entradas as svc_entradas
from app.servicios import eventos_sistema
from app.servicios import mesa_virtual as mv

router = APIRouter(prefix="/api/mesa-virtual", tags=["mesa de partes virtual"])


def _puede_escribir(u: Usuario) -> None:
    if u.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


# --- configuración ---------------------------------------------------------------------------------


@router.get("/config")
async def leer_config(_: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    cfg = await mv.cargar_config(sesion)
    return {**cfg, "receptor": mv.nombre_receptor(cfg)}


@router.put("/config")
async def guardar_config(datos: dict, usuario: Usuario = Depends(solo_administrador),
                         sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    # Encenderla o apagarla (y su mensaje) va por `PUT /api/modulos/mesa_virtual`; aquí, lo demás.
    cfg = await mv.guardar_config(sesion, datos)
    bitacora.registrar(sesion, None, usuario, "ajustes", "Configuración de la mesa de partes virtual")
    await sesion.commit()
    return {**cfg, "receptor": mv.nombre_receptor(cfg)}


@router.get("/plazo")
async def plazo(dias: int = 0, _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    cfg = await mv.cargar_config(sesion)
    n = dias if 1 <= dias <= 30 else cfg["plazo_subsanacion"]
    return {"dias": n, "plazo": mv.sumar_habiles(mv.ahora_local().date(), n, cfg).isoformat(), "hasta": mv.hora_cierre(cfg)}


# --- el trámite de un recibido ------------------------------------------------------------------------


async def _tramite(sesion: AsyncSession, eid: int) -> tuple[MesaTramite, Entrada]:
    e = await sesion.get(Entrada, eid)
    t = await mv.tramite_de_entrada(sesion, eid) if e is not None else None
    if e is None or t is None:
        raise HTTPException(404, "Este recibido no llegó por la mesa de partes virtual.")
    return t, e


async def _vista(sesion: AsyncSession, t: MesaTramite) -> dict:
    cfg = await mv.cargar_config(sesion)
    movimientos = await mv.movimientos_de(sesion, t.id)
    uids = {m.usuario_id for m in movimientos if m.usuario_id}
    usuarios = {u.id: u.nombre_completo for u in (await sesion.execute(select(Usuario).where(Usuario.id.in_(uids)))).scalars()} if uids else {}
    return mv.vista_interna(t, await mv.archivos_de(sesion, t.id), movimientos, usuarios, cfg)


@router.get("/entradas/{eid}")
async def ver(eid: int, _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    t, _e = await _tramite(sesion, eid)
    return await _vista(sesion, t)


class Accion(BaseModel):
    accion: str
    nota: str = Field("", max_length=4000)
    dias: int | None = None


@router.post("/entradas/{eid}/accion")
async def accion(eid: int, datos: Accion, usuario: Usuario = Depends(usuario_actual),
                 sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Cambia el estado que ve el remitente. Observar exige decir QUÉ subsanar (en un solo acto,
    TUO 27444, arts. 125.1 y 126.2) y fija el plazo en días hábiles desde el día hábil siguiente."""
    _puede_escribir(usuario)
    if datos.accion not in mv.ACCIONES:
        raise HTTPException(422, f"Acción no válida: {datos.accion}.")
    t, e = await _tramite(sesion, eid)
    nota = datos.nota.strip()
    cfg = await mv.cargar_config(sesion)
    if datos.accion == "observar":
        if len(nota) < 10:
            raise HTTPException(422, "Diga qué falta o qué debe corregir (lo leerá el remitente).")
        if t.estado in ("atendido", "archivado"):
            raise HTTPException(409, "El trámite ya está cerrado: reábralo antes de observarlo.")
        dias = datos.dias if datos.dias and 1 <= datos.dias <= 30 else cfg["plazo_subsanacion"]
        t.observacion = nota
        t.plazo_subsanacion = mv.sumar_habiles(mv.ahora_local().date(), dias, cfg)
    elif datos.accion == "reabrir":
        if t.estado not in ("atendido", "archivado"):
            raise HTTPException(409, "El trámite no está cerrado.")
    elif t.estado == mv.ACCIONES[datos.accion] and not nota:
        return await _vista(sesion, t)
    mv.poner_estado(t, e, mv.ACCIONES[datos.accion])
    accion_mov = {"revision": "revision", "observar": "observado", "derivar": "derivado", "archivar": "archivado", "reabrir": "reabierto"}[datos.accion]
    texto = nota
    if datos.accion == "observar":
        texto = f"{nota}\nPlazo para subsanar: hasta el {t.plazo_subsanacion.strftime('%d/%m/%Y')} ({mv.hora_cierre(cfg)})."
    mv.movimiento(sesion, t, accion_mov, texto, usuario_id=usuario.id)
    if datos.accion == "archivar" and nota:
        e.nota = (f"{e.nota}\n" if e.nota else "") + f"Archivada: {nota}"
    await sesion.commit()
    return await _vista(sesion, t)


def _ruta_del_documento(doc: Documento, firmado: Adjunto | None) -> Path | None:
    from app.servicios.adjuntos import ruta_en_disco
    from app.servicios.pdf import principal

    if firmado is not None:
        r = ruta_en_disco(doc, firmado)
        if r is not None and r.is_file():
            return r
    return principal(doc)


@router.post("/entradas/{eid}/atender")
async def atender(eid: int, peticion: Request, usuario: Usuario = Depends(usuario_actual),
                  sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Atiende el trámite con su respuesta: `documento_id` (un documento propio; se toma el
    FIRMADO si lo tiene, si no el PDF generado, y queda vinculado como respuesta del recibido) o
    `archivo` (un PDF subido). La copia queda en la carpeta del trámite: lo que se entregó no cambia
    si después se recompila el documento."""
    _puede_escribir(usuario)
    t, e = await _tramite(sesion, eid)
    cfg = await mv.cargar_config(sesion)
    form = await peticion.form(max_files=2, max_fields=10)
    nota = str(form.get("nota") or "").strip()[:4000]
    doc_id = str(form.get("documento_id") or "").strip()
    subido = form.get("archivo")
    carpeta = mv.carpeta_tramite(t.expediente, t.recibido_en.astimezone(mv.zona()).date())
    orden = len(await mv.archivos_de(sesion, t.id)) + 1
    doc = None
    if doc_id.isdigit():
        doc = await sesion.get(Documento, int(doc_id))
        if doc is None:
            raise HTTPException(404, "El documento no existe.")
        firmado = (await sesion.execute(select(Adjunto).where(Adjunto.documento_id == doc.id, Adjunto.categoria == "firmado")
                                        .order_by(Adjunto.id.desc()))).scalars().first()
        # Al remitente solo se entrega lo que ya vale: firmado o enviado (nunca un borrador).
        if firmado is None and doc.estado not in svc_entradas.ESTADOS_DOC_RESPONDE:
            raise HTTPException(409, "Ese documento aún no está firmado ni enviado: entréguelo cuando lo esté o suba el PDF firmado.")
        origen = _ruta_del_documento(doc, firmado)
        if origen is None or not origen.is_file():
            raise HTTPException(409, "Ese documento aún no tiene PDF: genérelo o súbalo firmado.")
        destino = carpeta / mv.nombre_en_disco(orden, "respuesta", "pdf")
        await asyncio.to_thread(shutil.copyfile, origen, destino)
        nombre = origen.name
    elif subido is not None and hasattr(subido, "read"):
        trabajo = Path(tempfile.mkdtemp(prefix="respuesta-", dir=mv.carpeta_recepcion()))
        try:
            try:
                r = await mv.recibir_archivo(subido, "principal", trabajo, 40 * 1024 * 1024, [0], 40 * 1024 * 1024)
            except mv.Rechazo as x:
                raise HTTPException(x.codigo, x.motivo.replace("El documento principal", "La respuesta")) from None
            destino = await asyncio.to_thread(mv.mover, r.ruta, carpeta, mv.nombre_en_disco(orden, "respuesta", "pdf"))
            nombre = r.nombre
        finally:
            shutil.rmtree(trabajo, ignore_errors=True)
    else:
        raise HTTPException(422, "Elija el documento propio que responde o suba el PDF de la respuesta.")
    from app.servicios.pdf import contar_paginas

    sesion.add(MesaArchivo(tramite_id=t.id, clase="respuesta", archivo=mv.relativa(destino), nombre=mv.sanear_nombre(nombre),
                           tipo="pdf", bytes=destino.stat().st_size, paginas=await asyncio.to_thread(contar_paginas, destino),
                           sha256=await asyncio.to_thread(mv.huella, destino), documento_id=doc.id if doc else None,
                           creado_por=usuario.id))
    if doc is not None:
        await svc_entradas.vincular(sesion, e, doc, usuario.id, "manual")
    mv.poner_estado(t, e, "atendido")
    mv.movimiento(sesion, t, "atendido", nota or "La respuesta está disponible para descargar.", usuario_id=usuario.id)
    await eventos_sistema.emitir_seguro(sesion, "entrada.respondida", f"entrada:{e.id}",
                                        {"asunto": e.asunto or e.documento or "", "responsable_id": e.responsable_id,
                                         "documento": f"doc:{doc.id}" if doc else ""}, usuario=usuario)
    await sesion.commit()
    return await _vista(sesion, t)


@router.get("/archivos/{aid}")
async def archivo(aid: int, peticion: Request, _: Usuario = Depends(usuario_actual),
                  sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    a = await sesion.get(MesaArchivo, aid)
    ruta = mv.absoluta(a.archivo) if a else None
    if a is None or ruta is None:
        raise HTTPException(404, "El archivo no está en el archivo documental.")
    t = await sesion.get(MesaTramite, a.tramite_id)
    nombre = f"{t.expediente}-{a.nombre}" if t else a.nombre
    r = enviar_archivo(ruta, nombre, media_type=mv.TIPOS_ARCHIVO.get(a.tipo, "application/octet-stream"), peticion=peticion)
    r.headers["X-Content-Type-Options"] = "nosniff"
    return r


# --- el remitente al directorio (2026-10-13) --------------------------------------------------------
# Edison: «eso de datos personales podemos usarlo para el directorio, para tener contacto». Al atender
# un trámite, el remitente se PROPONE como contacto (persona o institución, con su celular y correo):
# vincular si ya está, crear si no. Nada se crea solo: la persona del equipo lo confirma con un toque,
# y el recibido queda vinculado a su ficha (docs/arquitectura.md §27). La regla de duplicados es la
# misma de la importación de contactos (servicios/contactos.py).


async def _remitente_y_coincidencias(sesion: AsyncSession, t: MesaTramite, e: Entrada) -> dict:
    from app.modelos import Institucion, Persona
    from app.servicios import contactos as svc_contactos
    from app.servicios import directorio as svc_directorio

    propuesta = svc_contactos.propuesta_remitente({
        "tipo_persona": t.tipo_persona, "nombre": t.nombre, "representante": t.representante, "cargo": t.cargo,
        "correo": t.correo, "telefono": t.telefono, "direccion": t.direccion, "doc_numero": t.doc_numero,
    })
    personas = [svc_directorio.resumen_persona(p) for p in (await sesion.execute(select(Persona).where(Persona.activo.is_(True)))).scalars()]
    coincide_persona = None
    if propuesta["persona"]:
        hallado = svc_contactos.Indice(personas).buscar(propuesta["persona"])
        if hallado:
            p = next(x for x in personas if x["id"] == hallado[0])
            coincide_persona = {"id": p["id"], "nombre": p["nombre"], "cargo": p["cargo"], "celular": p["celular"],
                                "email": p["email"], "motivo": svc_contactos.MOTIVO[hallado[1]]}
    coincide_inst = None
    if propuesta["institucion"]:
        ruc = propuesta["institucion"]["ruc"]
        inst = (await sesion.execute(select(Institucion).where(Institucion.ruc == ruc, Institucion.ruc != ""))).scalars().first() if ruc else None
        motivo = "mismo RUC"
        if inst is None:
            filas = (await sesion.execute(select(Institucion.id, Institucion.nombre, Institucion.siglas, Institucion.activo))).all()
            elegida = svc_contactos.institucion_por_nombre(propuesta["institucion"]["nombre"],
                                                          [{"id": i, "nombre": n, "siglas": s, "activo": a} for i, n, s, a in filas])
            inst = await sesion.get(Institucion, elegida["id"]) if elegida else None
            motivo = "mismo nombre"
        if inst is not None:
            coincide_inst = {"id": inst.id, "nombre": inst.nombre, "siglas": inst.siglas, "motivo": motivo}
    vinc_p = await sesion.get(Persona, e.remitente_persona_id) if e.remitente_persona_id else None
    vinc_i = await sesion.get(Institucion, e.remitente_institucion_id) if e.remitente_institucion_id else None
    return {
        "propuesta": propuesta,
        "coincide": {"persona": coincide_persona, "institucion": coincide_inst},
        "vinculado": {
            "persona": {"id": vinc_p.id, "nombre": vinc_p.nombre, "cargo": vinc_p.cargo} if vinc_p else None,
            "institucion": {"id": vinc_i.id, "nombre": vinc_i.nombre, "siglas": vinc_i.siglas} if vinc_i else None,
        },
    }


@router.get("/entradas/{eid}/contacto")
async def contacto_del_remitente(eid: int, _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Lo que se propone llevar al directorio y lo que ya hay: la persona o institución que coincide
    (mismo celular, correo o nombre; la entidad por RUC o nombre) y lo ya vinculado al recibido."""
    t, e = await _tramite(sesion, eid)
    return await _remitente_y_coincidencias(sesion, t, e)


class AlDirectorio(BaseModel):
    # vincular (con su id) | crear | omitir
    persona: str = "omitir"
    persona_id: int | None = None
    institucion: str = "omitir"
    institucion_id: int | None = None


@router.post("/entradas/{eid}/contacto")
async def llevar_al_directorio(eid: int, datos: AlDirectorio, usuario: Usuario = Depends(usuario_actual),
                               sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Vincula el recibido a la ficha que ya existe (rellenando solo lo vacío: celular, correo; lo
    que dicta una cuenta de Qillqa no se toca) o crea la ficha con los datos del remitente."""
    from app.modelos import Institucion, Persona
    from app.servicios import contactos as svc_contactos
    from app.servicios import cuentas
    from app.servicios import directorio as svc_directorio

    _puede_escribir(usuario)
    t, e = await _tramite(sesion, eid)
    propuesta = (await _remitente_y_coincidencias(sesion, t, e))["propuesta"]
    hecho: list[str] = []
    inst = None
    if datos.institucion == "vincular" and datos.institucion_id:
        inst = await sesion.get(Institucion, datos.institucion_id)
        if inst is None:
            raise HTTPException(404, "La institución no existe.")
        pi = propuesta["institucion"] or {}
        for campo in ("ruc", "email", "telefono", "direccion"):
            if pi.get(campo) and not (getattr(inst, campo) or "").strip():
                setattr(inst, campo, pi[campo])
        hecho.append(f"vinculado a «{inst.nombre}»")
    elif datos.institucion == "crear" and propuesta["institucion"]:
        pi = propuesta["institucion"]
        inst = Institucion(origen="mesa_virtual", tipo="empresa" if pi["ruc"].startswith("20") else "otro", **pi)
        sesion.add(inst)
        await sesion.flush()
        hecho.append(f"institución «{inst.nombre}» creada")
    if inst is not None:
        e.remitente_institucion_id = inst.id
    persona = None
    if datos.persona == "vincular" and datos.persona_id:
        persona = await sesion.get(Persona, datos.persona_id)
        if persona is None:
            raise HTTPException(404, "La persona no existe.")
        cuenta = (await sesion.execute(select(Usuario).where(Usuario.persona_id == persona.id, Usuario.rol != "invitado"))).scalars().first()
        protegidos = set(cuentas.dictado_por_cuenta(cuenta)) if cuenta is not None else set()
        pp = propuesta["persona"] or {}
        cambios = svc_contactos.fusionar(svc_directorio.resumen_persona(persona), {k: pp.get(k, "") for k in ("cargo", "celular", "email")}, protegidos)
        cambios.pop("etiquetas", None)
        for k, v in cambios.items():
            setattr(persona, k, v)
        if inst is not None and not persona.institucion_id:
            persona.institucion_id = inst.id
        hecho.append(f"vinculado a «{persona.nombre}»")
    elif datos.persona == "crear" and propuesta["persona"]:
        pp = propuesta["persona"]
        persona = Persona(origen="mesa_virtual", nombre=pp["nombre"], cargo=pp["cargo"], celular=pp["celular"], email=pp["email"],
                          etiquetas=pp["etiquetas"], institucion_id=inst.id if inst is not None else None,
                          notas=f"Llegó por la mesa de partes virtual ({t.expediente}).")
        sesion.add(persona)
        await sesion.flush()
        hecho.append(f"contacto «{persona.nombre}» creado")
    if persona is not None:
        e.remitente_persona_id = persona.id
    if not hecho:
        raise HTTPException(422, "Elija vincular o crear la persona o la institución.")
    mv.movimiento(sesion, t, "directorio", "Remitente en el directorio: " + "; ".join(hecho) + ".", publico=False, usuario_id=usuario.id)
    bitacora.registrar(sesion, None, usuario, "directorio", f"Mesa virtual {t.expediente}: " + "; ".join(hecho))
    await sesion.commit()
    return await _remitente_y_coincidencias(sesion, t, e)

"""PROYECTOS: el trabajo con fases, tareas, equipo y partes redactadas en
colaboración (piloto 2026-10-01; primer tipo: proyecto de ley).

Reglas en `servicios/proyectos.py`; plantillas por tipo en
`servicios/proyectos_plantillas.py`. Todo cambio deja una línea en
`proyecto_actividad` (quién, qué, cuándo, en qué parte): esa es la
trazabilidad del proyecto. Ningún rol ajeno al despacho (invitado) escribe.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import shutil
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import enviar_archivo
from app.config import raiz_documentos
from app.latex import proyecto_ley, serializador
from app.latex.compilador import ejecutar_build
from app.db import obtener_sesion
from app.modelos import (
    ColabEstado,
    Documento,
    Persona,
    Proyecto,
    ProyectoActividad,
    ProyectoArchivo,
    ProyectoDocumento,
    ProyectoFase,
    ProyectoFuente,
    ProyectoMiembro,
    ProyectoSeccion,
    ProyectoSeccionVersion,
    ProyectoTarea,
    Usuario,
)
from app.flujo import ve_autoria
from app.seguridad import usuario_actual
from app.servicios import catalogos_legislativos as catalogo
from app.servicios import colab
from app.servicios import comparativo as cuadro
from app.servicios import fuentes as enlaces
from app.servicios import notificaciones as avisos
from app.servicios import proyectos as reglas
from app.servicios import proyectos_partes as svc_partes
from app.servicios import relaciones
from app.servicios import validar_firmado
from app.servicios import vigencia
from app.servicios.numeracion import numero_mostrado
from app.servicios.proyectos_plantillas import PLANTILLAS
from app.tipos import asunto_de, tipo_config

router = APIRouter(prefix="/api/proyectos", tags=["proyectos"])

MAX_BYTES = 50 * 1024 * 1024


def _puede_escribir(u: Usuario) -> None:
    if u.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


async def _proyecto(sesion: AsyncSession, pid: int) -> Proyecto:
    p = await sesion.get(Proyecto, pid)
    if p is None or p.eliminado_en is not None:
        raise HTTPException(404, "Proyecto no encontrado.")
    return p


def _doc_parrafo(texto: str) -> dict:
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": texto}]}]}


def _texto_plano(contenido: dict | None) -> str:
    """Todo el texto de un documento TipTap, en una línea."""
    def plano(n: dict) -> str:
        if n.get("type") == "referencia":
            return str((n.get("attrs") or {}).get("texto") or "")
        return n.get("text", "") if n.get("type") == "text" else " ".join(plano(h) for h in n.get("content") or [])
    return " ".join(plano(contenido or {}).split())


# Un proyecto se puede eliminar mientras es borrador (antes de revisión).
ESTADOS_BORRADOR = ("idea", "en_elaboracion")


def puede_eliminar(u: Usuario, p: Proyecto) -> bool:
    """El administrador, siempre; el responsable (o quien lo creó, si no tiene
    responsable), solo su propio proyecto en borrador (Edison 2026-10-01)."""
    if u.rol == "administrador":
        return True
    duenio = p.responsable_id if p.responsable_id is not None else p.creado_por
    return u.rol != "invitado" and duenio == u.id and p.estado in ESTADOS_BORRADOR


def _registrar(
    sesion: AsyncSession, p: Proyecto, u: Usuario, tipo: str, texto: str, seccion: str = ""
) -> None:
    sesion.add(
        ProyectoActividad(proyecto_id=p.id, usuario_id=u.id, tipo=tipo, texto=texto, seccion=seccion)
    )
    p.actualizado_en = reglas.ahora()


async def _fase_auto(sesion: AsyncSession, p: Proyecto, u: Usuario, clave: str, estado: str, desde: tuple[str, ...]) -> None:
    """Avanza SOLA una fase cuando el trabajo ya lo dice (revisión de
    usabilidad 2026-10-01: nadie tenía que acordarse de marcar «Redacción en
    curso» mientras escribía, ni «Presentación» al presentar). Solo desde los
    estados de `desde`: lo que alguien marcó a mano no se toca."""
    f = (await sesion.execute(select(ProyectoFase).where(ProyectoFase.proyecto_id == p.id, ProyectoFase.clave == clave))).scalar_one_or_none()
    if f is None or f.estado not in desde or f.estado == estado:
        return
    _registrar(sesion, p, u, "fase", f"Fase «{f.nombre}»: {reglas.etiqueta(f.estado)} → {reglas.etiqueta(estado)} (automático).")
    f.estado = estado


async def _nombres(sesion: AsyncSession) -> dict[int, str]:
    return dict((await sesion.execute(select(Usuario.id, Usuario.nombre_completo))).all())


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


# --- Proyectos ---------------------------------------------------------------


class NuevoProyecto(BaseModel):
    tipo: str = "proyecto_de_ley"
    titulo: str = Field(min_length=3, max_length=2000)
    datos: dict = Field(default_factory=dict)


class CambioProyecto(BaseModel):
    titulo: str | None = None
    estado: str | None = None
    numero_oficial: str | None = None
    fecha_presentacion: str | None = None
    datos: dict | None = None
    responsable_id: int | None = None
    # Interruptor de la edición simultánea (fase 5).
    colaboracion: bool | None = None


@router.get("/catalogos")
async def catalogos(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Lo que la ficha ofrece para ELEGIR (2026-10-01): comisiones, grupos y cámaras de la
    Cámara de Diputados (servicios/catalogos_legislativos.py) y el titular de la entidad (perfil).
    Los grupos y comisiones ya usados en otros proyectos también se ofrecen."""
    usados = (await sesion.execute(select(Proyecto.datos))).scalars().all()
    grupos = list(catalogo.GRUPOS)
    comisiones = list(catalogo.COMISIONES)
    for d in usados:
        g = (d or {}).get("grupo", "").strip()
        if g and g not in grupos:
            grupos.append(g)
        for c in re.split(r"\s*;\s*", (d or {}).get("comisiones", "") or ""):
            if c and c not in comisiones:
                comisiones.append(c)
    # Diputados del directorio institucional (para elegir autor y adherentes).
    diputados = sorted({
        " ".join(n.split()) for (n,) in (await sesion.execute(
            select(Persona.nombre).where(Persona.cargo.ilike("%diputad%"))
        )).all() if n and n.strip()
    })
    pf = catalogo.perfil()
    return {
        "diputados": diputados,
        "comisiones": comisiones, "fuente_comisiones": catalogo.FUENTE_COMISIONES,
        "grupos": grupos, "camaras": catalogo.CAMARAS,
        "autor": pf.get("autor", ""), "cargo": pf.get("cargo", ""), "lugar": pf.get("lugar", ""),
    }


@router.get("/tipos")
async def tipos(_: Usuario = Depends(usuario_actual)) -> list[dict]:
    return [
        {"tipo": k, "nombre": v["nombre"], "grupos": v["grupos"]}
        for k, v in PLANTILLAS.items()
    ]


@router.get("")
async def listar(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    proyectos = (await sesion.execute(select(Proyecto).where(Proyecto.eliminado_en.is_(None)).order_by(Proyecto.actualizado_en.desc()))).scalars().all()
    if not proyectos:
        return []
    ids = [p.id for p in proyectos]
    fases = (await sesion.execute(select(ProyectoFase.proyecto_id, ProyectoFase.estado).where(ProyectoFase.proyecto_id.in_(ids)))).all()
    secs = (await sesion.execute(select(ProyectoSeccion.proyecto_id, ProyectoSeccion.estado, ProyectoSeccion.obligatoria).where(ProyectoSeccion.proyecto_id.in_(ids)))).all()
    tars = (await sesion.execute(select(ProyectoTarea.proyecto_id, ProyectoTarea.estado).where(ProyectoTarea.proyecto_id.in_(ids)))).all()
    nombres = await _nombres(sesion)
    salida = []
    for p in proyectos:
        a = reglas.avance(
            [e for pid, e in fases if pid == p.id],
            [(e, ob) for pid, e, ob in secs if pid == p.id],
            [e for pid, e in tars if pid == p.id],
        )
        salida.append(
            {
                "id": p.id,
                "codigo": p.codigo,
                "tipo": p.tipo,
                "tipo_nombre": PLANTILLAS.get(p.tipo, {}).get("nombre", p.tipo),
                "titulo": reglas.titulo_ley(p.titulo),
                "estado": p.estado,
                "numero_oficial": p.numero_oficial,
                "responsable": nombres.get(p.responsable_id or 0, ""),
                "actualizado_en": _iso(p.actualizado_en),
                "avance": a,
            }
        )
    return salida


@router.post("")
async def crear(
    datos: NuevoProyecto,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    plantilla = PLANTILLAS.get(datos.tipo)
    if plantilla is None:
        raise HTTPException(422, "Tipo de proyecto desconocido.")
    existentes = list((await sesion.execute(select(Proyecto.codigo))).scalars())
    # La ficha se llena SOLA con lo que ya se sabe (2026-10-01): el titular, su
    # cargo y su lugar (perfil de la entidad), la cámara, y el grupo del último
    # proyecto. Lo que llegue en `datos` manda.
    pf = catalogo.perfil()
    ultimo = (await sesion.execute(select(Proyecto.datos).order_by(Proyecto.id.desc()).limit(1))).scalar_one_or_none() or {}
    previos = {
        "autor": pf.get("autor", ""), "cargo": pf.get("cargo", ""), "lugar": pf.get("lugar", ""),
        "camara": catalogo.CAMARAS[0], "grupo": ultimo.get("grupo", ""),
    }
    p = Proyecto(
        tipo=datos.tipo,
        codigo=reglas.codigo_siguiente(plantilla["prefijo"], reglas.ahora().year, existentes),
        titulo=reglas.titulo_ley(datos.titulo),
        datos={**{k: v for k, v in previos.items() if v}, **(datos.datos or {})},
        responsable_id=usuario.id,
        creado_por=usuario.id,
        estado="en_elaboracion",
    )
    sesion.add(p)
    await sesion.flush()
    sesion.add(ProyectoMiembro(proyecto_id=p.id, usuario_id=usuario.id, rol="responsable"))
    for i, f in enumerate(plantilla["fases"], 1):
        sesion.add(
            ProyectoFase(
                proyecto_id=p.id, orden=i, clave=f["clave"], nombre=f["nombre"],
                descripcion=f.get("descripcion", ""), ambito=f.get("ambito", "interna"),
                requisitos=[
                    {
                        "texto": r[0],
                        "fuente": r[1],
                        "naturaleza": r[2] if len(r) > 2 else reglas.naturaleza_de(r[1]),
                        "hecho": False,
                    }
                    for r in f.get("requisitos", [])
                ],
                depende_de=f.get("depende_de", []),
            )
        )
    for i, (clave, titulo, grupo, obligatoria) in enumerate(plantilla["secciones"], 1):
        sesion.add(
            ProyectoSeccion(
                proyecto_id=p.id, clave=clave, titulo=titulo, grupo=grupo, orden=i,
                obligatoria=obligatoria,
                # El título de la ley nace escrito con el del proyecto: es la
                # misma cosa (el PDF lo toma de esta parte).
                contenido=_doc_parrafo(p.titulo) if clave == "titulo" and p.titulo else {"type": "doc", "content": []},
            )
        )
    _registrar(sesion, p, usuario, "creo", f"Creó el proyecto «{p.titulo[:120]}».")
    await sesion.commit()
    return {"id": p.id, "codigo": p.codigo}


@router.get("/mis-tareas")
async def mis_tareas(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Lo que le toca a ESTA persona en los proyectos (para Inicio): sus
    tareas sin terminar y las partes a su cargo que aún no están aprobadas.
    Antes de `/{pid}`: si no, «mis-tareas» se leería como un id."""
    activos = select(Proyecto.id).where(Proyecto.estado.notin_(reglas.ESTADOS_CERRADOS), Proyecto.eliminado_en.is_(None))
    nombres = {p.id: (p.codigo, p.titulo) for p in (await sesion.execute(select(Proyecto).where(Proyecto.eliminado_en.is_(None)))).scalars()}
    tareas = (await sesion.execute(
        select(ProyectoTarea)
        .where(ProyectoTarea.responsable_id == usuario.id, ProyectoTarea.estado != "hecha", ProyectoTarea.proyecto_id.in_(activos))
        .order_by(ProyectoTarea.limite == "", ProyectoTarea.limite, ProyectoTarea.id)
    )).scalars().all()
    partes = (await sesion.execute(
        select(ProyectoSeccion)
        .where(ProyectoSeccion.responsable_id == usuario.id, ProyectoSeccion.estado != "aprobada", ProyectoSeccion.proyecto_id.in_(activos))
        .order_by(ProyectoSeccion.proyecto_id, ProyectoSeccion.orden)
    )).scalars().all()
    return {
        "tareas": [
            {"id": t.id, "proyecto_id": t.proyecto_id, "proyecto": nombres.get(t.proyecto_id, ("", ""))[0], "titulo": t.titulo,
             "estado": t.estado, "estado_texto": reglas.etiqueta(t.estado), "limite": t.limite, "seccion": t.seccion}
            for t in tareas
        ],
        "partes": [
            {"proyecto_id": s.proyecto_id, "proyecto": nombres.get(s.proyecto_id, ("", ""))[0], "clave": s.clave,
             "titulo": s.titulo, "estado": s.estado, "estado_texto": reglas.etiqueta(s.estado)}
            for s in partes
        ],
    }


@router.get("/{pid}")
async def ver(
    pid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    p = await _proyecto(sesion, pid)
    nombres = await _nombres(sesion)
    usuarios = {
        u.id: u.nombre_usuario for u in (await sesion.execute(select(Usuario))).scalars()
    }
    miembros = (await sesion.execute(select(ProyectoMiembro).where(ProyectoMiembro.proyecto_id == pid))).scalars().all()
    fases = (await sesion.execute(select(ProyectoFase).where(ProyectoFase.proyecto_id == pid).order_by(ProyectoFase.orden))).scalars().all()
    secs = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid).order_by(ProyectoSeccion.orden))).scalars().all()
    tareas = (await sesion.execute(select(ProyectoTarea).where(ProyectoTarea.proyecto_id == pid).order_by(ProyectoTarea.id))).scalars().all()
    fuentes = (await sesion.execute(select(ProyectoFuente).where(ProyectoFuente.proyecto_id == pid).order_by(ProyectoFuente.id))).scalars().all()
    resueltas = await _resolver_fuentes(sesion, fuentes)
    archivos = (await sesion.execute(select(ProyectoArchivo).where(ProyectoArchivo.proyecto_id == pid).order_by(ProyectoArchivo.id))).scalars().all()
    vinc = (await sesion.execute(select(ProyectoDocumento, Documento).join(Documento, Documento.id == ProyectoDocumento.documento_id).where(ProyectoDocumento.proyecto_id == pid))).all()
    momento = reglas.ahora()
    plantilla = PLANTILLAS.get(p.tipo, {})
    claves_plantilla = svc_partes.plantilla_de(p.tipo)
    bloqueos = (await sesion.execute(select(func.count()).select_from(ProyectoActividad).where(ProyectoActividad.proyecto_id == pid, ProyectoActividad.tipo == "bloqueo"))).scalar_one()
    return {
        "id": p.id,
        "codigo": p.codigo,
        "tipo": p.tipo,
        "tipo_nombre": plantilla.get("nombre", p.tipo),
        "grupos": plantilla.get("grupos", {}),
        "titulo": reglas.titulo_ley(p.titulo),
        "estado": p.estado,
        "estados": list(reglas.ESTADOS_PROYECTO),
        "numero_oficial": p.numero_oficial,
        "fecha_presentacion": p.fecha_presentacion,
        "datos": p.datos,
        "responsable_id": p.responsable_id,
        "colaboracion": p.colaboracion,
        "puede_eliminar": puede_eliminar(usuario, p),
        "creado_por": nombres.get(p.creado_por, ""),
        "creado_en": _iso(p.creado_en),
        "actualizado_en": _iso(p.actualizado_en),
        "miembros": [
            {"usuario_id": m.usuario_id, "nombre": nombres.get(m.usuario_id, ""), "usuario": usuarios.get(m.usuario_id, ""), "rol": m.rol}
            for m in miembros
        ],
        "fases": [
            {
                "id": f.id, "clave": f.clave, "nombre": f.nombre, "descripcion": f.descripcion,
                "ambito": f.ambito, "estado": f.estado, "responsable_id": f.responsable_id,
                "responsable": nombres.get(f.responsable_id or 0, ""), "inicio": f.inicio,
                "limite": f.limite, "requisitos": f.requisitos, "depende_de": f.depende_de,
            }
            for f in fases
        ],
        "secciones": [
            {
                # `id`: la identidad numérica estable de la parte (el Formato Word la usa aunque se
                # reordene); `fija`: su lugar lo fija la técnica legislativa (no se arrastra);
                # `de_plantilla`: nació de la plantilla (al quitarla se puede restaurar).
                "id": s.id, "fija": svc_partes.es_fija(p.tipo, s.clave, s.grupo), "de_plantilla": s.clave in claves_plantilla,
                "clave": s.clave, "titulo": s.titulo, "grupo": s.grupo, "orden": s.orden,
                "obligatoria": s.obligatoria, "estado": s.estado, "contenido": s.contenido,
                "version": s.version, "responsable_id": s.responsable_id,
                "responsable": nombres.get(s.responsable_id or 0, ""),
                "editando_por": s.editando_por if reglas.candado_vigente(s.editando_por, s.editando_desde, momento) else None,
                "editando": nombres.get(s.editando_por or 0, "") if reglas.candado_vigente(s.editando_por, s.editando_desde, momento) else "",
                "actualizado_por": nombres.get(s.actualizado_por or 0, ""),
                "actualizado_en": _iso(s.actualizado_en),
                "palabras": len(reglas.texto_plano(s.contenido).split()),
                # Edición simultánea: generación del texto compartido y lo
                # escrito que aún no es versión (el borrador vivo).
                "generacion": s.colab_gen,
                "sin_versionar": colab.sin_versionar(s.borrador, s.contenido),
                "borrador": s.borrador if colab.sin_versionar(s.borrador, s.contenido) else None,
                "borrador_por": nombres.get(s.borrador_por or 0, ""),
                "borrador_en": _iso(s.borrador_en),
            }
            for s in secs
        ],
        "tareas": [
            {
                "id": t.id, "fase_id": t.fase_id, "seccion": t.seccion, "titulo": t.titulo,
                "detalle": t.detalle, "responsable_id": t.responsable_id,
                "responsable": nombres.get(t.responsable_id or 0, ""), "estado": t.estado,
                "limite": t.limite, "creado_por": nombres.get(t.creado_por, ""),
            }
            for t in tareas
        ],
        "fuentes": [
            {"id": f.id, "tipo": f.tipo, "referencia": f.referencia, "url": f.url, "clave_externa": f.clave_externa, "seccion": f.seccion, "nota": f.nota,
             "resuelta": resueltas.get(f.id)}
            for f in fuentes
        ],
        "archivos": [
            {"id": a.id, "categoria": a.categoria, "etiqueta": a.etiqueta, "nombre": Path(a.nombre_archivo).name, "tamano": a.tamano, "subido_en": _iso(a.subido_en), "subido_por": nombres.get(a.subido_por, ""), "sha256": a.sha256}
            for a in archivos
        ],
        # Qué PDF mostrar al entrar (como en Gestión Documental, sin pulsar
        # nada): el último generado y el último firmado, y si siguen al día
        # con el texto (ningún cambio de las partes después de ellos).
        "pdf": _estado_pdf(archivos, secs, p),
        "documentos": [
            {"documento_id": d.id, "numero": numero_mostrado(d), "tipo": tipo_config(d.tipo).get("nombre", d.tipo), "asunto": asunto_de(d.tipo, d.campos), "estado": d.estado, "rol": v.rol}
            for v, d in vinc
        ],
        "avance": reglas.avance([f.estado for f in fases], [(s.estado, s.obligatoria) for s in secs], [t.estado for t in tareas]),
        # Veces que alguien quiso escribir en una parte ocupada (criterio Yjs).
        "bloqueos": bloqueos,
    }


@router.patch("/{pid}")
async def cambiar(
    pid: int,
    cambio: CambioProyecto,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    hechos = []
    if cambio.titulo is not None and reglas.titulo_ley(cambio.titulo) != p.titulo:
        p.titulo = reglas.titulo_ley(cambio.titulo)
        hechos.append("título")
    if cambio.estado is not None and cambio.estado != p.estado:
        if cambio.estado not in reglas.ESTADOS_PROYECTO:
            raise HTTPException(422, "Estado desconocido.")
        _registrar(sesion, p, usuario, "estado", f"Estado del proyecto: {reglas.etiqueta(p.estado)} → {reglas.etiqueta(cambio.estado)}.")
        p.estado = cambio.estado
        if p.estado in reglas.ESTADOS_PRESENTADO:
            # Presentado: la fecha deja de ser automática (si nadie la fijó,
            # la de hoy) y la fase de la entidad que cierra el trabajo, hecha.
            if cambio.fecha_presentacion is None and not p.fecha_presentacion:
                p.fecha_presentacion = reglas.fecha_fija("", date.today())
                hechos.append(f"fecha del proyecto fija ({p.fecha_presentacion})")
            await _fase_auto(sesion, p, usuario, "presentacion", "hecha", ("pendiente", "en_curso"))
    if cambio.numero_oficial is not None and cambio.numero_oficial != p.numero_oficial:
        p.numero_oficial = cambio.numero_oficial.strip()
        hechos.append(f"número oficial «{p.numero_oficial}»")
    if cambio.fecha_presentacion is not None and cambio.fecha_presentacion.strip()[:10] != p.fecha_presentacion:
        p.fecha_presentacion = cambio.fecha_presentacion.strip()[:10]
        hechos.append(f"fecha del proyecto ({p.fecha_presentacion or 'automática'})")
    if cambio.datos is not None:
        p.datos = {**(p.datos or {}), **cambio.datos}
        hechos.append("ficha")
    if cambio.responsable_id is not None:
        p.responsable_id = cambio.responsable_id or None
        hechos.append("responsable")
    if cambio.colaboracion is not None and cambio.colaboracion != p.colaboracion:
        secs = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid))).scalars().all()
        if not cambio.colaboracion:
            # Apagar no puede perder texto: lo escrito en compartido que aún
            # no es versión se guarda primero (con «Guardar» en cada parte).
            pendientes = [s.titulo for s in secs if colab.sin_versionar(s.borrador, s.contenido)]
            if pendientes:
                raise HTTPException(409, {"codigo": "borradores_sin_version", "mensaje": "Antes de apagar la edición simultánea, guarde como versión lo escrito en: " + ", ".join(f"«{x}»" for x in pendientes) + ".", "partes": pendientes})
        # Encender o apagar reemplaza el texto compartido de todas las partes
        # (generación nueva) y suelta los candados: en un modo no se toman y
        # en el otro se empiezan de cero.
        await colab.reiniciar(sesion, pid, list(secs))
        for s in secs:
            s.editando_por = None
            s.editando_desde = None
        p.colaboracion = cambio.colaboracion
        _registrar(sesion, p, usuario, "edito", "Encendió la edición simultánea de las partes." if p.colaboracion else "Apagó la edición simultánea: las partes vuelven a escribirse por turnos.")
    if hechos:
        _registrar(sesion, p, usuario, "edito", "Actualizó " + ", ".join(hechos) + ".")
    await sesion.commit()
    return {"ok": True}


class Miembros(BaseModel):
    miembros: list[dict]


@router.put("/{pid}/miembros")
async def poner_miembros(
    pid: int,
    datos: Miembros,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    await sesion.execute(delete(ProyectoMiembro).where(ProyectoMiembro.proyecto_id == pid))
    vistos = set()
    for m in datos.miembros:
        uid = int(m.get("usuario_id") or 0)
        rol = m.get("rol") or "colaborador"
        if not uid or uid in vistos or rol not in reglas.ROLES_MIEMBRO:
            continue
        vistos.add(uid)
        sesion.add(ProyectoMiembro(proyecto_id=pid, usuario_id=uid, rol=rol))
        avisos.crear(sesion, uid, f"Le sumaron al equipo de {p.codigo} ({rol}).", "proyecto", proyecto_id=pid, evitar=usuario.id, destino="resumen")
    _registrar(sesion, p, usuario, "equipo", f"Actualizó el equipo ({len(vistos)} personas).")
    await sesion.commit()
    return {"ok": True}


# --- Fases y tareas ----------------------------------------------------------


class CambioFase(BaseModel):
    estado: str | None = None
    responsable_id: int | None = None
    inicio: str | None = None
    limite: str | None = None
    requisitos: list[dict] | None = None


@router.patch("/{pid}/fases/{fid}")
async def cambiar_fase(
    pid: int,
    fid: int,
    cambio: CambioFase,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    f = await sesion.get(ProyectoFase, fid)
    if f is None or f.proyecto_id != pid:
        raise HTTPException(404, "Fase no encontrada.")
    if cambio.estado is not None and cambio.estado != f.estado:
        if cambio.estado not in reglas.ESTADOS_FASE:
            raise HTTPException(422, "Estado de fase desconocido.")
        _registrar(sesion, p, usuario, "fase", f"Fase «{f.nombre}»: {reglas.etiqueta(f.estado)} → {reglas.etiqueta(cambio.estado)}.")
        f.estado = cambio.estado
    if cambio.responsable_id is not None and cambio.responsable_id != f.responsable_id:
        f.responsable_id = cambio.responsable_id or None
        avisos.crear(sesion, f.responsable_id, f"{p.codigo}: le encargaron la fase «{f.nombre}».", "proyecto", proyecto_id=pid, evitar=usuario.id, destino=f"fase:{f.id}")
        _registrar(sesion, p, usuario, "fase", f"Responsable de «{f.nombre}» cambiado.")
    if cambio.inicio is not None:
        f.inicio = cambio.inicio[:10]
    if cambio.limite is not None:
        f.limite = cambio.limite[:10]
    if cambio.requisitos is not None:
        f.requisitos = [
            {
                "texto": str(r.get("texto", ""))[:500],
                "fuente": str(r.get("fuente", ""))[:300],
                "naturaleza": r.get("naturaleza") if r.get("naturaleza") in reglas.NATURALEZAS else reglas.naturaleza_de(str(r.get("fuente", ""))),
                "hecho": bool(r.get("hecho")),
            }
            for r in cambio.requisitos
        ]
    await sesion.commit()
    return {"ok": True}


class DatosTarea(BaseModel):
    titulo: str | None = Field(default=None, max_length=500)
    detalle: str | None = None
    fase_id: int | None = None
    seccion: str | None = None
    responsable_id: int | None = None
    estado: str | None = None
    limite: str | None = None


@router.post("/{pid}/tareas")
async def crear_tarea(
    pid: int,
    datos: DatosTarea,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    if not (datos.titulo or "").strip():
        raise HTTPException(422, "La tarea necesita un título.")
    t = ProyectoTarea(
        proyecto_id=pid, titulo=datos.titulo.strip(), detalle=datos.detalle or "",
        fase_id=datos.fase_id, seccion=datos.seccion or "", responsable_id=datos.responsable_id,
        limite=(datos.limite or "")[:10], creado_por=usuario.id,
    )
    sesion.add(t)
    await sesion.flush()  # el id de la tarea va en el destino del aviso
    avisos.crear(sesion, t.responsable_id, f"{p.codigo}: nueva tarea para usted — {t.titulo[:120]}", "proyecto", proyecto_id=pid, evitar=usuario.id, destino=f"tarea:{t.id}")
    _registrar(sesion, p, usuario, "tarea", f"Creó la tarea «{t.titulo[:120]}».", t.seccion)
    await sesion.commit()
    return {"id": t.id}


@router.patch("/{pid}/tareas/{tid}")
async def cambiar_tarea(
    pid: int,
    tid: int,
    datos: DatosTarea,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    t = await sesion.get(ProyectoTarea, tid)
    if t is None or t.proyecto_id != pid:
        raise HTTPException(404, "Tarea no encontrada.")
    if datos.estado is not None and datos.estado != t.estado:
        if datos.estado not in reglas.ESTADOS_TAREA:
            raise HTTPException(422, "Estado de tarea desconocido.")
        t.estado = datos.estado
        t.hecha_en = reglas.ahora() if datos.estado == "hecha" else None
        _registrar(sesion, p, usuario, "tarea", f"Tarea «{t.titulo[:100]}»: {reglas.etiqueta(datos.estado)}.", t.seccion)
    for campo in ("titulo", "detalle", "fase_id", "seccion", "limite"):
        v = getattr(datos, campo)
        if v is not None:
            setattr(t, campo, v)
    if datos.responsable_id is not None and datos.responsable_id != t.responsable_id:
        t.responsable_id = datos.responsable_id or None
        avisos.crear(sesion, t.responsable_id, f"{p.codigo}: le asignaron la tarea — {t.titulo[:120]}", "proyecto", proyecto_id=pid, evitar=usuario.id, destino=f"tarea:{t.id}")
    await sesion.commit()
    return {"ok": True}


@router.delete("/{pid}/tareas/{tid}")
async def borrar_tarea(
    pid: int,
    tid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    t = await sesion.get(ProyectoTarea, tid)
    if t is None or t.proyecto_id != pid:
        raise HTTPException(404, "Tarea no encontrada.")
    _registrar(sesion, p, usuario, "tarea", f"Quitó la tarea «{t.titulo[:100]}».", t.seccion)
    await sesion.delete(t)
    await sesion.commit()
    return {"ok": True}


# --- Partes del texto: candado, guardado, versiones --------------------------


async def _seccion(sesion: AsyncSession, pid: int, clave: str) -> ProyectoSeccion:
    s = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid, ProyectoSeccion.clave == clave))).scalar_one_or_none()
    if s is None:
        raise HTTPException(404, "Parte no encontrada.")
    return s


@router.post("/{pid}/secciones/{clave}/tomar")
async def tomar(
    pid: int,
    clave: str,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Abrir la parte para escribir (o seguir en ella: el editor late cada
    30 s). Si otra persona la tiene, 409 con su nombre."""
    _puede_escribir(usuario)
    s = await _seccion(sesion, pid, clave)
    if not reglas.puede_tomar(usuario.id, s.editando_por, s.editando_desde):
        # Se CUENTA cada vez que alguien encuentra una parte ocupada: es el
        # dato que dirá si hace falta la edición simultánea (Yjs) o no.
        sesion.add(ProyectoActividad(proyecto_id=pid, usuario_id=usuario.id, tipo="bloqueo", seccion=clave, texto="Encontró la parte ocupada."))
        await sesion.commit()
        otro = await sesion.get(Usuario, s.editando_por)
        raise HTTPException(409, {"codigo": "parte_ocupada", "mensaje": f"{otro.nombre_completo if otro else 'Otra persona'} está escribiendo en esta parte.", "editando": otro.nombre_completo if otro else ""})
    s.editando_por = usuario.id
    s.editando_desde = reglas.ahora()
    await sesion.commit()
    return {"ok": True, "version": s.version}


@router.post("/{pid}/secciones/{clave}/soltar")
async def soltar(
    pid: int,
    clave: str,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    s = await _seccion(sesion, pid, clave)
    if s.editando_por == usuario.id:
        s.editando_por = None
        s.editando_desde = None
        await sesion.commit()
    return {"ok": True}


class GuardadoSeccion(BaseModel):
    contenido: dict
    version_base: int
    nota: str = Field(default="", max_length=200)
    # Solo el editor COMPARTIDO la manda: la generación del texto que tiene
    # abierto. Sin ella, el guardado es «por turnos» (con candado).
    generacion: int | None = None
    # Guardado automático del editor por turnos (al dejar de escribir, al
    # pasar a otra parte, al salir): se une con el anterior automático.
    auto: bool = False
    # Guardar y soltar la parte en una sola llamada (al cerrar la pestaña o
    # «Terminar de escribir»): dos llamadas sueltas llegaban en desorden.
    soltar: bool = False


@router.delete("/{pid}")
async def eliminar(
    pid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Eliminar un proyecto (Edison 2026-10-01): el administrador, cualquiera; el
    responsable, el suyo mientras es borrador. Se RETIRA, no se borra: deja de
    verse en las listas y en los avisos, pero sus partes, versiones, archivos y
    bitácora se conservan (trazabilidad) y se puede recuperar desde la base."""
    p = await _proyecto(sesion, pid)
    if not puede_eliminar(usuario, p):
        raise HTTPException(
            403,
            "Solo el administrador o el responsable del proyecto, mientras está en borrador, pueden eliminarlo.",
        )
    p.eliminado_en = reglas.ahora()
    p.eliminado_por = usuario.id
    # Sus relaciones genéricas (2026-10-06): lo que sus partes citaban y lo que el sistema
    # le asoció se quita; las citas que OTROS textos le hacen quedan marcadas (el mapa no
    # las dibuja). Si se recupera desde la base, guardar cada parte las vuelve a crear.
    from app.servicios.eliminacion import limpiar_relaciones

    await limpiar_relaciones(sesion, f"pl:{p.id}", p.codigo or p.titulo[:120])
    _registrar(sesion, p, usuario, "elimino", f"Eliminó el proyecto «{p.titulo[:120]}» (se conserva retirado).")
    await sesion.commit()
    return {"ok": True}


@router.put("/{pid}/secciones/{clave}")
async def guardar_seccion(
    pid: int,
    clave: str,
    datos: GuardadoSeccion,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    s = await _seccion(sesion, pid, clave)
    compartido = p.colaboracion and datos.generacion is not None
    if compartido:
        # En compartido no hay candado: todos escriben el mismo texto. Solo
        # se rechaza un editor que quedó en una generación anterior.
        if datos.generacion != s.colab_gen:
            raise HTTPException(409, {"codigo": "generacion_vieja", "mensaje": "El texto de esta parte se reemplazó mientras escribía; se recargará."})
    elif not reglas.puede_tomar(usuario.id, s.editando_por, s.editando_desde):
        raise HTTPException(409, {"codigo": "parte_ocupada", "mensaje": "Otra persona está escribiendo en esta parte."})
    if datos.version_base != s.version:
        raise HTTPException(409, {"codigo": "parte_modificada", "mensaje": "Esta parte cambió desde que la abrió; recárguela."})
    ultima = None
    if datos.auto and not compartido:
        ultima = (await sesion.execute(select(ProyectoSeccionVersion).where(ProyectoSeccionVersion.seccion_id == s.id).order_by(ProyectoSeccionVersion.version.desc()).limit(1))).scalar_one_or_none()
        if ultima is not None and not reglas.unir_autoguardado(ultima.nota, ultima.usuario_id, ultima.version, ultima.creado_en, usuario.id, s.version):
            ultima = None
    titulo_rehecho = False
    if clave == "titulo":
        # El título de la ley es UNO (Edison 2026-10-01: «pongo el título y no
        # sale en el PDF»): la parte manda y el proyecto toma su texto, que es
        # el que ven la lista, los avisos y los nombres de archivo. Se guarda
        # sin el rótulo pegado de Word («PROPOSICIÓN LEGISLATIVA QUE…»).
        texto = reglas.titulo_ley(_texto_plano(datos.contenido))
        if texto:
            p.titulo = texto
            if texto != _texto_plano(datos.contenido):
                datos.contenido = _doc_parrafo(texto)
                titulo_rehecho = True
    s.version += 1
    s.contenido = datos.contenido
    s.actualizado_por = usuario.id
    await _citas(sesion, pid, clave, datos.contenido, usuario.id)
    s.actualizado_en = reglas.ahora()
    if compartido:
        # Lo escrito ya es versión; el servidor compartido vuelve a dejar
        # borrador en cuanto alguien siga escribiendo.
        s.borrador = None
        if titulo_rehecho:
            # El texto compartido aún dice el título sin depurar.
            await colab.reiniciar(sesion, pid, [s])
    elif datos.soltar:
        s.editando_por = None
        s.editando_desde = None
        if p.colaboracion:
            # Guardar y soltar por turnos en un proyecto compartido: igual que
            # abajo, o el estado compartido viejo vuelve sobre lo guardado.
            await colab.reiniciar(sesion, pid, [s])
    else:
        s.editando_por = usuario.id
        s.editando_desde = reglas.ahora()
        if p.colaboracion:
            # Guardado por turnos en un proyecto compartido (el servidor de
            # colaboración no estaba disponible): el texto compartido se
            # rehace desde esta versión.
            await colab.reiniciar(sesion, pid, [s])
    if s.estado == "aprobada":
        # Un cambio en una parte aprobada la devuelve a revisión: lo aprobado
        # debe ser exactamente lo que se aprobó.
        s.estado = "en_revision"
    if ultima is not None:
        # Racha de guardados automáticos: la misma versión avanza (no se
        # llena el historial ni la bitácora con cada pausa al escribir).
        ultima.version = s.version
        ultima.contenido = datos.contenido
        ultima.estado = s.estado
        ultima.creado_en = reglas.ahora()
    else:
        nota = reglas.NOTA_AUTO if datos.auto and not datos.nota else datos.nota
        sesion.add(ProyectoSeccionVersion(seccion_id=s.id, version=s.version, contenido=datos.contenido, nota=nota, usuario_id=usuario.id, basada_en=s.version - 1, estado=s.estado))
        _registrar(sesion, p, usuario, "redacto", f"Guardó «{s.titulo}» (v{s.version}){': ' + nota if nota else ''}.", clave)
    # Escribir es estar redactando: la fase lo dice sola.
    await _fase_auto(sesion, p, usuario, "redaccion", "en_curso", ("pendiente",))
    await sesion.commit()
    return {"version": s.version, "estado": s.estado}


async def _citas(sesion: AsyncSession, pid: int, clave: str, contenido: dict, usuario_id: int) -> None:
    """Las citas de la parte (nodos `referencia`) son relaciones del proyecto, y la norma o
    el libro citado se vuelve fuente del proyecto sin escribirlo dos veces
    (servicios/relaciones.py, 2026-10-06)."""
    await relaciones.sincronizar(sesion, f"pl:{pid}", f"seccion:{clave}", contenido, usuario_id)
    await relaciones.fuentes_del_proyecto(sesion, pid, usuario_id, clave)


class CambioSeccion(BaseModel):
    estado: str | None = None
    responsable_id: int | None = None
    # Al OBSERVAR: qué hay que corregir. Queda como comentario de la parte y
    # va en el aviso a quien la redacta (antes el aviso decía solo «quedó
    # Observada» y había que ir a buscar por qué).
    observacion: str | None = Field(default=None, max_length=4000)
    # Renombrar la parte (2026-10-05: el esquema de la exposición varía según el
    # proyecto; desde el 2026-10-19 también las de la fórmula legal, salvo el título de la ley).
    # Es el rótulo del PDF (en las disposiciones, el bloque lo rotula la técnica legislativa y el
    # nombre es el del panel); la clave y el lugar no cambian.
    titulo: str | None = Field(default=None, max_length=200)


@router.patch("/{pid}/secciones/{clave}")
async def cambiar_seccion(
    pid: int,
    clave: str,
    cambio: CambioSeccion,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    s = await _seccion(sesion, pid, clave)
    if cambio.estado is not None and cambio.estado != s.estado:
        if cambio.estado not in reglas.ESTADOS_SECCION:
            raise HTTPException(422, "Estado de parte desconocido.")
        _registrar(sesion, p, usuario, "revision" if cambio.estado in ("aprobada", "observada") else "estado", f"«{s.titulo}»: {reglas.etiqueta(s.estado)} → {reglas.etiqueta(cambio.estado)} (v{s.version}).", clave)
        obs = (cambio.observacion or "").strip() if cambio.estado == "observada" else ""
        if obs:
            sesion.add(ProyectoActividad(proyecto_id=pid, usuario_id=usuario.id, tipo="comentario", seccion=clave, texto=obs, menciones=[]))
        if s.responsable_id and cambio.estado in ("aprobada", "observada"):
            avisos.crear(sesion, s.responsable_id, f"{p.codigo}: «{s.titulo}» quedó {reglas.etiqueta(cambio.estado)}{': ' + obs[:160] if obs else ''}.", "proyecto", proyecto_id=pid, evitar=usuario.id, destino=f"parte:{s.clave}")
        s.estado = cambio.estado
    if cambio.titulo is not None and " ".join(cambio.titulo.split()) != s.titulo:
        nuevo = " ".join(cambio.titulo.split())
        if len(nuevo) < 3:
            raise HTTPException(422, "El nombre de la parte necesita al menos 3 caracteres.")
        if clave == "titulo":
            raise HTTPException(422, "El título de la ley es su propio texto: se edita en la parte, no se renombra.")
        _registrar(sesion, p, usuario, "estado", f"Renombró «{s.titulo}» a «{nuevo}».", clave)
        s.titulo = nuevo
    if cambio.responsable_id is not None and cambio.responsable_id != s.responsable_id:
        s.responsable_id = cambio.responsable_id or None
        avisos.crear(sesion, s.responsable_id, f"{p.codigo}: le encargaron redactar «{s.titulo}».", "proyecto", proyecto_id=pid, evitar=usuario.id, destino=f"parte:{s.clave}")
        _registrar(sesion, p, usuario, "encargo", f"Encargó «{s.titulo}».", clave)
    await sesion.commit()
    return {"ok": True}


# --- Partes editables (2026-10-19, Edison): añadir, quitar y reordenar ---------------------------
# La lógica pura (claves, orden, qué es fijo) vive en servicios/proyectos_partes.py.


class NuevaParte(BaseModel):
    # Una parte NUEVA (título y grupo) o una de la plantilla que se quitó y se restaura (`plantilla`).
    titulo: str = Field(default="", max_length=160)
    grupo: str = "exposicion"
    plantilla: str = Field(default="", max_length=40)
    # Tras qué parte va (clave); sin ella, al final de su grupo.
    despues_de: str = Field(default="", max_length=40)


class OrdenPartes(BaseModel):
    claves: list[str] = Field(default_factory=list, max_length=80)


async def _partes_ordenadas(sesion: AsyncSession, pid: int) -> list[ProyectoSeccion]:
    return list((await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid).order_by(ProyectoSeccion.orden, ProyectoSeccion.id))).scalars().all())


def _aplicar_orden(secs: list[ProyectoSeccion], claves: list[str]) -> None:
    por = {s.clave: s for s in secs}
    for i, c in enumerate(claves, 1):
        por[c].orden = i


@router.get("/{pid}/partes-disponibles")
async def partes_disponibles(
    pid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Las partes de la plantilla que el proyecto no tiene (se restauran con `POST /secciones`
    y `plantilla`), y los grupos donde cabe una parte nueva."""
    p = await _proyecto(sesion, pid)
    secs = await _partes_ordenadas(sesion, pid)
    return {
        "plantilla": svc_partes.disponibles(p.tipo, {s.clave for s in secs}),
        "grupos": [{"clave": g, "nombre": n} for g, n in PLANTILLAS.get(p.tipo, {}).get("grupos", {}).items()],
    }


@router.post("/{pid}/secciones", status_code=201)
async def crear_parte(
    pid: int,
    datos: NuevaParte,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Añade una parte al proyecto: nueva (título y grupo; clave derivada del título, única) o
    restaurada de la plantilla (`plantilla`: su clave; vuelve con su título, grupo y lugar de
    siempre, y el generador la trata como la parte del esquema que es). Nace vacía, en borrador."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    secs = await _partes_ordenadas(sesion, pid)
    existentes = {s.clave for s in secs}
    pl = svc_partes.plantilla_de(p.tipo)
    if datos.plantilla:
        if datos.plantilla not in pl:
            raise HTTPException(422, "Esa parte no está en la plantilla de este tipo de proyecto.")
        if datos.plantilla in existentes:
            raise HTTPException(409, "El proyecto ya tiene esa parte.")
        clave = datos.plantilla
        titulo, grupo, obligatoria = pl[clave]
    else:
        titulo = " ".join(datos.titulo.split())
        if len(titulo) < 3:
            raise HTTPException(422, "El nombre de la parte necesita al menos 3 caracteres.")
        grupo = datos.grupo if datos.grupo in svc_partes.GRUPOS_ORDEN else "exposicion"
        clave = svc_partes.clave_nueva(titulo, existentes, set(pl))
        obligatoria = False
    orden = svc_partes.insertar([(s.clave, s.grupo) for s in secs], clave, grupo, datos.despues_de)
    nueva = ProyectoSeccion(proyecto_id=pid, clave=clave, titulo=titulo, grupo=grupo, orden=0, obligatoria=obligatoria, contenido={"type": "doc", "content": []})
    sesion.add(nueva)
    _aplicar_orden(secs + [nueva], orden)
    _registrar(sesion, p, usuario, "estado", f"Añadió la parte «{titulo}»." + (" (restaurada de la plantilla)" if datos.plantilla else ""), clave)
    await sesion.commit()
    return {"clave": clave, "titulo": titulo, "grupo": grupo, "orden": nueva.orden}


@router.delete("/{pid}/secciones/{clave}")
async def quitar_parte(
    pid: int,
    clave: str,
    confirmar: bool = False,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Quita una parte que no sea obligatoria. Con texto (guardado o escrito en compartido), solo
    con `confirmar` (409 `parte_con_texto` si falta). Se van sus versiones y su texto compartido;
    sus citas dejan de ser fuentes del proyecto; la actividad que la nombra se conserva. Una parte
    de la plantilla se puede restaurar después (vacía)."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    s = await _seccion(sesion, pid, clave)
    if s.obligatoria or clave == "titulo":
        raise HTTPException(422, f"«{s.titulo}» es obligatoria en un {PLANTILLAS.get(p.tipo, {}).get('nombre', 'proyecto').lower()}: no se quita.")
    if not p.colaboracion and not reglas.puede_tomar(usuario.id, s.editando_por, s.editando_desde):
        raise HTTPException(409, {"codigo": "parte_ocupada", "mensaje": "Otra persona está escribiendo en esta parte."})
    texto = reglas.texto_plano(s.borrador if (p.colaboracion and colab.sin_versionar(s.borrador, s.contenido)) else s.contenido or {})
    palabras = len(texto.split())
    if palabras and not confirmar:
        raise HTTPException(409, {"codigo": "parte_con_texto", "palabras": palabras, "mensaje": f"«{s.titulo}» tiene {palabras} palabras: confirme para quitarla."})
    await relaciones.sincronizar(sesion, f"pl:{pid}", f"seccion:{clave}", {"type": "doc", "content": []}, usuario.id)
    await relaciones.fuentes_del_proyecto(sesion, pid, usuario.id, clave)
    await sesion.execute(delete(ColabEstado).where(ColabEstado.documento.like(f"pl:{pid}:{clave}:%")))
    titulo = s.titulo
    await sesion.delete(s)
    await sesion.flush()
    secs = await _partes_ordenadas(sesion, pid)
    _aplicar_orden(secs, [x.clave for x in secs])
    _registrar(sesion, p, usuario, "estado", f"Quitó la parte «{titulo}»" + (f" ({palabras} palabras)" if palabras else "") + ".", clave)
    await sesion.commit()
    return {"ok": True}


@router.put("/{pid}/secciones-orden")
async def ordenar_partes(
    pid: int,
    datos: OrdenPartes,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El orden de las partes (todas las claves, en el orden deseado). Los grupos no se cruzan y
    las partes fijas de la fórmula legal conservan el orden de la técnica legislativa (422 si se
    pide otra cosa). La exposición de motivos y las partes nuevas salen en el PDF en este orden."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    secs = await _partes_ordenadas(sesion, pid)
    orden = svc_partes.normalizar_orden(p.tipo, [(s.clave, s.grupo) for s in secs], datos.claves)
    if orden is None:
        raise HTTPException(422, "El orden pedido no vale: deben ir todas las partes, sin cruzar los grupos, y la fórmula legal en el orden de la técnica legislativa.")
    if orden != [s.clave for s in secs]:
        _aplicar_orden(secs, orden)
        _registrar(sesion, p, usuario, "estado", "Reordenó las partes.")
        await sesion.commit()
    return {"claves": orden}


@router.get("/{pid}/secciones/{clave}/versiones")
async def versiones(
    pid: int,
    clave: str,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    s = await _seccion(sesion, pid, clave)
    nombres = await _nombres(sesion)
    filas = (await sesion.execute(select(ProyectoSeccionVersion).where(ProyectoSeccionVersion.seccion_id == s.id).order_by(ProyectoSeccionVersion.version.desc()))).scalars().all()
    # El autor de cada versión es dato interno del equipo, como en los
    # documentos (`ve_autoria`: todos menos el invitado; 2026-10-05).
    autoria = ve_autoria(usuario)
    return [
        {"version": v.version, "nota": v.nota, "usuario": nombres.get(v.usuario_id, "") if autoria else "", "creado_en": _iso(v.creado_en), "basada_en": v.basada_en, "estado": v.estado, "palabras": len(reglas.texto_plano(v.contenido).split()), "contenido": v.contenido}
        for v in filas
    ]


@router.get("/{pid}/comparativo/armado")
async def comparativo_armado(
    pid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El cuadro comparativo DERIVADO de las citas de las modificatorias,
    conservando la columna vigente ya escrita (servicios/comparativo.py). No
    guarda nada: el editor lo carga y quien tiene la parte lo guarda como una
    versión más (con su candado y su historial)."""
    dcm = await _seccion(sesion, pid, "dcm")
    actual = await _seccion(sesion, pid, "comparativo")
    doc = cuadro.armar((dcm.contenido or {}).get("content", []) or [], actual.contenido)
    citas = len(cuadro.citas_de((dcm.contenido or {}).get("content", []) or []))
    return {"contenido": doc, "citas": citas, "pendientes": cuadro.pendientes(doc)}


@router.post("/{pid}/secciones/{clave}/versiones/{version}/restaurar")
async def restaurar(
    pid: int,
    clave: str,
    version: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Restaurar NO borra la historia: crea una versión nueva con el texto
    de la elegida (la historia es append-only)."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    s = await _seccion(sesion, pid, clave)
    if not p.colaboracion and not reglas.puede_tomar(usuario.id, s.editando_por, s.editando_desde):
        raise HTTPException(409, {"codigo": "parte_ocupada", "mensaje": "Otra persona está escribiendo en esta parte."})
    v = (await sesion.execute(select(ProyectoSeccionVersion).where(ProyectoSeccionVersion.seccion_id == s.id, ProyectoSeccionVersion.version == version))).scalar_one_or_none()
    if v is None:
        raise HTTPException(404, "Versión no encontrada.")
    s.version += 1
    s.contenido = v.contenido
    s.actualizado_por = usuario.id
    await _citas(sesion, pid, clave, v.contenido, usuario.id)
    s.actualizado_en = reglas.ahora()
    if s.estado == "aprobada":
        s.estado = "en_revision"
    if p.colaboracion:
        # Restaurar REEMPLAZA el texto compartido de todos: generación nueva;
        # los editores abiertos recargan la restaurada.
        await colab.reiniciar(sesion, pid, [s])
    sesion.add(ProyectoSeccionVersion(seccion_id=s.id, version=s.version, contenido=v.contenido, nota=f"Restaurada desde v{version}", usuario_id=usuario.id, basada_en=version, estado=s.estado))
    _registrar(sesion, p, usuario, "restauro", f"Restauró «{s.titulo}» a la v{version} (queda como v{s.version}).", clave)
    await sesion.commit()
    return {"version": s.version}


# --- Conversación y bitácora -------------------------------------------------


class Comentario(BaseModel):
    texto: str = Field(min_length=1, max_length=5000)
    seccion: str = ""


@router.get("/{pid}/actividad")
async def actividad(
    pid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    await _proyecto(sesion, pid)
    nombres = await _nombres(sesion)
    filas = (await sesion.execute(select(ProyectoActividad).where(ProyectoActividad.proyecto_id == pid, ProyectoActividad.tipo != "bloqueo").order_by(ProyectoActividad.creado_en.desc()).limit(300))).scalars().all()
    return [
        {"id": a.id, "tipo": a.tipo, "usuario": nombres.get(a.usuario_id, ""), "seccion": a.seccion, "texto": a.texto, "menciones": a.menciones, "resuelto": a.resuelto, "creado_en": _iso(a.creado_en)}
        for a in filas
    ]


@router.post("/{pid}/comentarios")
async def comentar(
    pid: int,
    datos: Comentario,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    p = await _proyecto(sesion, pid)
    por_usuario = {u.nombre_usuario.lower(): u for u in (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)))).scalars()}
    mencionados = reglas.menciones(datos.texto, set(por_usuario))
    a = ProyectoActividad(proyecto_id=pid, usuario_id=usuario.id, tipo="comentario", seccion=datos.seccion, texto=datos.texto.strip(), menciones=mencionados)
    sesion.add(a)
    p.actualizado_en = reglas.ahora()
    for u in mencionados:
        avisos.crear(sesion, por_usuario[u].id, f"{usuario.nombre_completo} le mencionó en {p.codigo}: {datos.texto.strip()[:160]}", "mencion", proyecto_id=pid, evitar=usuario.id, destino="conversacion")
    await sesion.commit()
    # `id` (2026-10-19): el Formato Word ancla el comentario al tramo seleccionado.
    return {"ok": True, "id": a.id, "menciones": mencionados}


@router.patch("/{pid}/comentarios/{aid}")
async def resolver(
    pid: int,
    aid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    a = await sesion.get(ProyectoActividad, aid)
    if a is None or a.proyecto_id != pid or a.tipo != "comentario":
        raise HTTPException(404, "Comentario no encontrado.")
    a.resuelto = not a.resuelto
    await sesion.commit()
    return {"resuelto": a.resuelto}


# --- Fuentes, archivos y documentos vinculados -------------------------------


class DatosFuente(BaseModel):
    tipo: str = "norma"
    referencia: str = Field(min_length=2, max_length=3000)
    url: str = ""
    clave_externa: str = ""
    seccion: str = ""
    nota: str = ""


async def _resolver_fuentes(sesion: AsyncSession, fuentes) -> dict[int, dict]:
    """Lo que hoy es cada clave externa (servicios/fuentes.py); los documentos
    de Qillqa, con su número y asunto, y su enlace dentro del sistema."""
    salida: dict[int, dict] = {}
    con_clave = [f for f in fuentes if f.clave_externa]
    if not con_clave:
        return salida
    ids = {d for f in con_clave if (d := enlaces.documento_id(f.clave_externa))}
    docs = {d.id: d for d in (await sesion.execute(select(Documento).where(Documento.id.in_(ids)))).scalars()} if ids else {}
    bases = enlaces.rutas()
    for f in con_clave:
        did = enlaces.documento_id(f.clave_externa)
        if did and did in docs:
            d = docs[did]
            salida[f.id] = {"origen": "Qillqa", "titulo": numero_mostrado(d), "detalle": asunto_de(d.tipo, d.campos), "ruta": f"/documentos/{d.id}"}
        # En un hilo: una clave zotero:… puede preguntar a la API local de Zotero o leer su copia.
        elif (r := await asyncio.to_thread(enlaces.resolver, f.clave_externa, bases)):
            salida[f.id] = r
    return salida


@router.post("/{pid}/fuentes")
async def crear_fuente(
    pid: int,
    datos: DatosFuente,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    valores = datos.model_dump()
    # Escribir una clave («calibre:10086», «datafw:…@v1», «sgdp:doc:272») en la
    # referencia la vuelve fuente ENLAZADA: se guarda la clave y se muestra lo
    # que es (servicios/fuentes.py).
    if enlaces.es_clave(valores["referencia"]) and not valores.get("clave_externa"):
        valores["clave_externa"] = valores["referencia"].strip()
        r = enlaces.resolver(valores["clave_externa"])
        if r:
            valores["referencia"] = r["titulo"]
    f = ProyectoFuente(proyecto_id=pid, creado_por=usuario.id, **valores)
    sesion.add(f)
    _registrar(sesion, p, usuario, "fuente", f"Agregó la fuente «{datos.referencia[:120]}».", datos.seccion)
    await sesion.commit()
    return {"id": f.id}


@router.delete("/{pid}/fuentes/{fid}")
async def borrar_fuente(
    pid: int,
    fid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    f = await sesion.get(ProyectoFuente, fid)
    if f is None or f.proyecto_id != pid:
        raise HTTPException(404, "Fuente no encontrada.")
    _registrar(sesion, p, usuario, "fuente", f"Quitó la fuente «{f.referencia[:120]}».", f.seccion)
    await sesion.delete(f)
    await sesion.commit()
    return {"ok": True}


def _huella_contenido(p: Proyecto, secs) -> str:
    """Huella del contenido GUARDADO del proyecto (vigencia.huella_proyecto):
    lo escrito en compartido sin versionar no entra, como no entra al PDF."""
    orden = sorted(secs, key=lambda s: (s.orden or 0, s.id or 0))
    titulo = next((" ".join(reglas.texto_plano(s.contenido).split()) for s in orden if s.clave == "titulo"), "") or p.titulo
    return vigencia.huella_proyecto(titulo, p.datos, [(s.clave, s.contenido) for s in orden])


def _estado_pdf(archivos, secs, p: Proyecto) -> dict:
    """¿El último PDF generado y el último firmado siguen al día con el texto?

    Vigencia (2026-10-06): se compara la HUELLA DEL CONTENIDO con la que salió
    el generado —y, en el firmado, la del generado sobre el que se firmó—, no
    las fechas. Antes un borrador vivo (texto compartido sin guardar) marcaba
    desactualizado lo que no lo estaba, y un firmado subido tarde sobre un PDF
    viejo parecía al día. Los archivos anteriores, sin huella, siguen con la
    regla de fechas (solo cambios guardados)."""
    cambios = [s.actualizado_en for s in secs if s.actualizado_en]
    ultimo = max(cambios) if cambios else None
    actual = _huella_contenido(p, secs)

    def ficha(categoria: str) -> dict | None:
        lista = [a for a in archivos if a.categoria == categoria]
        if not lista:
            return None
        a = lista[-1]
        if a.huella:
            al_dia = a.huella == actual
        else:
            al_dia = ultimo is None or (a.subido_en is not None and a.subido_en >= ultimo)
        return {"id": a.id, "etiqueta": a.etiqueta, "subido_en": _iso(a.subido_en), "al_dia": al_dia, "base_id": a.base_id}

    return {"generado": ficha("generado"), "firmado": ficha("firmado"), "ultimo_cambio": _iso(ultimo)}


def _carpeta(p: Proyecto) -> Path:
    return raiz_documentos() / "proyectos" / p.codigo


async def _guardar_subida(archivo: UploadFile, destino: Path) -> tuple[int, str]:
    """Escribe la subida en `destino` (tope MAX_BYTES) y devuelve (tamaño, SHA-256)."""
    tam = 0
    h = hashlib.sha256()
    with destino.open("wb") as fh:
        while trozo := await archivo.read(1024 * 1024):
            tam += len(trozo)
            if tam > MAX_BYTES:
                fh.close()
                destino.unlink(missing_ok=True)
                raise HTTPException(413, "El archivo supera 50 MB.")
            h.update(trozo)
            fh.write(trozo)
    return tam, h.hexdigest()


def _sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as fh:
        while trozo := fh.read(1024 * 1024):
            h.update(trozo)
    return h.hexdigest()


@router.post("/{pid}/firmado")
async def subir_firmado(
    pid: int,
    archivo: UploadFile,
    forzar: str | None = Form(None),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El PROYECTO FIRMADO (2026-10-01), como el firmado de un documento: solo
    PDF, con nombre estable (<código>_firmado-vN.pdf), huella SHA-256 y línea en
    la bitácora. Cada firmado es una versión nueva: el anterior se conserva.
    Queda anotado sobre qué PDF generado se firmó."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    # Solo el PDF firmado del último generado (servicios/validar_firmado.py, 2026-10-08): con
    # firma digital y el mismo texto y páginas; el administrador puede forzarlo.
    contenido = await archivo.read()
    await archivo.seek(0)
    ultimo_gen = (await sesion.execute(select(ProyectoArchivo).where(ProyectoArchivo.proyecto_id == pid, ProyectoArchivo.categoria == "generado").order_by(ProyectoArchivo.id.desc()).limit(1))).scalar_one_or_none()
    motivos = validar_firmado.motivos(contenido, archivo.filename or "", Path(ultimo_gen.nombre_archivo) if ultimo_gen else None, exigir_nombre=False)
    if motivos:
        if usuario.rol == "administrador" and (forzar or "").strip().lower() in ("1", "true", "si", "sí"):
            _registrar(sesion, p, usuario, "firmado_forzado", "Firmado aceptado sin validar por el administrador: " + " ".join(motivos))
        else:
            raise HTTPException(422, {"codigo": "firmado_invalido", "mensaje": "No se aceptó como firmado: " + " ".join(motivos), "motivos": motivos, "puede_forzar": usuario.rol == "administrador"})
    previos = (await sesion.execute(select(func.count()).select_from(ProyectoArchivo).where(ProyectoArchivo.proyecto_id == pid, ProyectoArchivo.categoria == "firmado"))).scalar_one()
    generados = (await sesion.execute(select(func.count()).select_from(ProyectoArchivo).where(ProyectoArchivo.proyecto_id == pid, ProyectoArchivo.categoria == "generado"))).scalar_one()
    n = previos + 1
    carpeta = _carpeta(p) / "firmado"
    carpeta.mkdir(parents=True, exist_ok=True)
    destino = carpeta / f"{p.codigo}_firmado-v{n}.pdf"
    tam, huella = await _guardar_subida(archivo, destino)
    sobre = f" (sobre el PDF generado v{generados})" if generados else ""
    # El firmado certifica el contenido del generado sobre el que se firmó (el
    # último): hereda su huella, y con ella se sabe si sigue al día.
    base = (await sesion.execute(select(ProyectoArchivo).where(ProyectoArchivo.proyecto_id == pid, ProyectoArchivo.categoria == "generado").order_by(ProyectoArchivo.id.desc()).limit(1))).scalar_one_or_none()
    a = ProyectoArchivo(proyecto_id=pid, categoria="firmado", etiqueta=f"Proyecto firmado v{n}{sobre}", nombre_archivo=str(destino), tamano=tam, subido_por=usuario.id, sha256=huella,
                        huella=base.huella if base else "", base_id=base.id if base else None)
    sesion.add(a)
    _registrar(sesion, p, usuario, "firmado", f"Subió el proyecto FIRMADO v{n}{sobre}. Huella SHA-256 {huella[:16]}…")
    if not p.fecha_presentacion:
        # Lo firmado lleva la fecha del día en que se generó ese PDF: desde
        # ahora es la del proyecto, para que un PDF nuevo no la cambie.
        ultimo = (await sesion.execute(select(ProyectoArchivo.subido_en).where(ProyectoArchivo.proyecto_id == pid, ProyectoArchivo.categoria == "generado").order_by(ProyectoArchivo.id.desc()).limit(1))).scalar_one_or_none()
        p.fecha_presentacion = reglas.fecha_fija("", ultimo.astimezone().date() if ultimo else date.today())
        _registrar(sesion, p, usuario, "edito", f"La fecha del proyecto quedó fija en {p.fecha_presentacion}: la del PDF firmado.")
    await sesion.commit()
    return {"id": a.id, "version": n, "sha256": huella}


@router.post("/{pid}/archivos")
async def subir_archivo(
    pid: int,
    archivo: UploadFile,
    etiqueta: str = Form(""),
    categoria: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    nombre = Path(archivo.filename or "archivo").name
    destino_dir = _carpeta(p)
    destino_dir.mkdir(parents=True, exist_ok=True)
    destino = destino_dir / nombre
    n = 2
    while destino.exists():
        destino = destino_dir / f"{Path(nombre).stem}-{n}{Path(nombre).suffix}"
        n += 1
    tam, huella = await _guardar_subida(archivo, destino)
    a = ProyectoArchivo(proyecto_id=pid, categoria=categoria[:30], etiqueta=etiqueta.strip() or destino.stem, nombre_archivo=str(destino), tamano=tam, subido_por=usuario.id, sha256=huella)
    sesion.add(a)
    _registrar(sesion, p, usuario, "archivo", f"Subió «{a.etiqueta}» ({destino.name}).")
    await sesion.commit()
    return {"id": a.id}


@router.get("/{pid}/archivos/{aid}")
async def bajar_archivo(
    pid: int,
    aid: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    a = await sesion.get(ProyectoArchivo, aid)
    if a is None or a.proyecto_id != pid or not Path(a.nombre_archivo).is_file():
        raise HTTPException(404, "Archivo no encontrado.")
    ruta = Path(a.nombre_archivo)
    tipo = "application/pdf" if ruta.suffix.lower() == ".pdf" else "application/octet-stream"
    return enviar_archivo(ruta, ruta.name, media_type=tipo, peticion=peticion)


class Vinculo(BaseModel):
    documento_id: int
    rol: str = ""


@router.post("/{pid}/documentos")
async def vincular(
    pid: int,
    datos: Vinculo,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    d = await sesion.get(Documento, datos.documento_id)
    if d is None:
        raise HTTPException(404, "Documento no encontrado.")
    ya = (await sesion.execute(select(func.count()).select_from(ProyectoDocumento).where(ProyectoDocumento.proyecto_id == pid, ProyectoDocumento.documento_id == d.id))).scalar_one()
    if not ya:
        sesion.add(ProyectoDocumento(proyecto_id=pid, documento_id=d.id, rol=datos.rol[:60], creado_por=usuario.id))
        _registrar(sesion, p, usuario, "documento", f"Vinculó {numero_mostrado(d)}{' (' + datos.rol + ')' if datos.rol else ''}.")
        await sesion.commit()
    return {"ok": True}


# --- Generación del documento (LaTeX) ----------------------------------------


def _componer(p: Proyecto, secs, carpeta: Path, sustituir: dict[str, dict] | None = None) -> tuple[Path, list[str]]:
    """Escribe metadata.tex y el maestro del proyecto en `carpeta`. Con
    `sustituir` ({clave: contenido}), esas partes se toman de ahí y no de la
    base: la vista previa muestra lo que se está escribiendo sin guardarlo."""
    sustituir = sustituir or {}
    partes = [{"clave": s.clave, "titulo": s.titulo, "grupo": s.grupo, "contenido": sustituir.get(s.clave, s.contenido), "obligatoria": s.obligatoria} for s in secs]
    # El título de la ley es la parte «titulo» si tiene texto (corregirla
    # corrige el PDF); si está vacía, el título con que se creó el proyecto.
    titulo = next((" ".join(reglas.texto_plano(x["contenido"]).split()) for x in partes if x["clave"] == "titulo"), "") or p.titulo
    datos = {"codigo": p.codigo, "titulo": titulo, "numero_oficial": p.numero_oficial, "fecha_presentacion": p.fecha_presentacion, "datos": p.datos or {}}
    tex, avisos = proyecto_ley.maestro(datos, partes)
    carpeta.mkdir(parents=True, exist_ok=True)
    # Las fotografías se copian junto al maestro (se compila dentro de su carpeta):
    # así \includegraphics usa una ruta relativa, sin los espacios de la de la entidad.
    origen = _carpeta(p) / "imagenes"
    for nombre in sorted(proyecto_ley.fotografias(partes)):
        fuente = origen / nombre
        if not fuente.is_file():
            avisos.append(f"Falta la fotografía {nombre}: vuelva a subirla.")
            continue
        (carpeta / "imagenes").mkdir(exist_ok=True)
        if not (carpeta / "imagenes" / nombre).is_file():
            shutil.copy2(fuente, carpeta / "imagenes" / nombre)
    (carpeta / "metadata.tex").write_text(proyecto_ley.metadata(datos), encoding="utf-8")
    maestro = carpeta / f"{proyecto_ley.CLASE}.tex"
    maestro.write_text(tex, encoding="utf-8")
    return maestro, avisos


TIPOS_IMAGEN = {b"\xff\xd8\xff": "jpg", b"\x89PNG\r\n\x1a\n": "png"}
MAX_IMAGEN = 15 * 1024 * 1024


@router.post("/{pid}/imagenes")
async def subir_imagen(
    pid: int,
    archivo: UploadFile,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Fotografía para el texto del proyecto (2026-10-05). Se guarda una vez por
    contenido (nombre = SHA-256 + extensión) en `imagenes/` del proyecto; el nodo
    `fotografia` del editor guarda ese nombre y el PDF la compone con su rótulo."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    datos = await archivo.read(MAX_IMAGEN + 1)
    if len(datos) > MAX_IMAGEN:
        raise HTTPException(413, "La imagen supera 15 MB.")
    ext = next((e for firma, e in TIPOS_IMAGEN.items() if datos.startswith(firma)), None)
    if ext is None:
        raise HTTPException(415, "Solo se admiten fotografías JPG o PNG.")
    nombre = f"{hashlib.sha256(datos).hexdigest()[:32]}.{ext}"
    carpeta = _carpeta(p) / "imagenes"
    carpeta.mkdir(parents=True, exist_ok=True)
    if not (carpeta / nombre).is_file():
        (carpeta / nombre).write_bytes(datos)
    return {"archivo": nombre, "url": f"/api/proyectos/{pid}/imagenes/{nombre}"}


@router.get("/{pid}/imagenes/{nombre}")
async def ver_imagen(
    pid: int,
    nombre: str,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    p = await _proyecto(sesion, pid)
    if not serializador.RE_ARCHIVO_IMAGEN.match(nombre):
        raise HTTPException(404, "No existe esa imagen.")
    ruta = _carpeta(p) / "imagenes" / nombre
    if not ruta.is_file():
        raise HTTPException(404, "No existe esa imagen.")
    return enviar_archivo(ruta, nombre, media_type="image/png" if nombre.endswith(".png") else "image/jpeg", peticion=peticion)


@router.post("/{pid}/importar-word")
async def importar_word(
    pid: int,
    archivo: UploadFile,
    aplicar: bool = Form(False),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Carga el texto del proyecto desde un Word (2026-10-05: «permitir cargar el archivo Word
    previamente trabajado»). Sin `aplicar`, solo dice qué irá a cada parte; con `aplicar`, cada
    parte leída queda como versión NUEVA (la anterior sigue en su historial), con sus notas al
    pie y sus fotos. Una parte que otra persona está escribiendo no se toca. El Word queda entre
    los archivos del proyecto (categoría «origen»)."""
    import asyncio
    import tempfile

    from app.servicios import importar_word as word

    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    nombre = Path(archivo.filename or "proyecto.docx").name
    if not nombre.lower().endswith(".docx"):
        raise HTTPException(415, "Suba el proyecto en Word (.docx). Un .doc antiguo: ábralo en Word y guárdelo como .docx.")
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / "proyecto.docx"
        tam, huella = await _guardar_subida(archivo, ruta)
        if ruta.read_bytes()[:2] != b"PK":
            raise HTTPException(415, "El archivo no es un Word (.docx) válido.")
        try:
            contenido, fotos = await asyncio.to_thread(word.analizar, ruta)
        except Exception as e:  # un .docx dañado o con algo que el lector no conoce
            raise HTTPException(422, f"No se pudo leer el Word: {e}") from e
        secs = {s.clave: s for s in (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid))).scalars().all()}
        partes = []
        for clave, nodos in contenido.items():
            s = secs.get(clave)
            r = word.resumen(clave, nodos)
            r["titulo"] = s.titulo if s else clave
            r["existe"] = s is not None
            r["reemplaza"] = bool(s and reglas.texto_plano(s.contenido or {}).strip())
            r["ocupada"] = bool(s and not p.colaboracion and not reglas.puede_tomar(usuario.id, s.editando_por, s.editando_desde))
            if s is None or s.grupo != "exposicion":
                r["titulo_propio"] = ""
            partes.append(r)
        if not aplicar:
            return {"partes": partes}

        carpeta_img = _carpeta(p) / "imagenes"

        def guardar(datos: bytes, ext: str) -> tuple[str, str]:
            n = f"{hashlib.sha256(datos).hexdigest()[:32]}.{ext}"
            carpeta_img.mkdir(parents=True, exist_ok=True)
            if not (carpeta_img / n).is_file():
                (carpeta_img / n).write_bytes(datos)
            return n, f"/api/proyectos/{pid}/imagenes/{n}"

        lector = word.lector()
        with word._CANDADO:
            lector.FOTOS.clear()
            lector.FOTOS.update(fotos)
            contenido = lector.asignar_fotos(contenido, guardar)
        cambiadas: list[ProyectoSeccion] = []
        for r in partes:
            s = secs.get(r["clave"])
            if s is None or r["ocupada"]:
                continue
            doc = {"type": "doc", "content": contenido[r["clave"]]}
            s.version += 1
            s.contenido = doc
            s.borrador = None
            s.actualizado_por = usuario.id
            s.actualizado_en = reglas.ahora()
            if s.estado == "aprobada":
                s.estado = "en_revision"
            if r["titulo_propio"]:
                s.titulo = r["titulo_propio"][:200]
            if s.clave == "titulo" and reglas.texto_plano(doc).strip():
                p.titulo = reglas.titulo_ley(reglas.texto_plano(doc))
            sesion.add(ProyectoSeccionVersion(seccion_id=s.id, version=s.version, contenido=doc, nota=f"Importada del Word ({nombre})", usuario_id=usuario.id, basada_en=s.version - 1, estado=s.estado))
            cambiadas.append(s)
        if p.colaboracion and cambiadas:
            await colab.reiniciar(sesion, pid, cambiadas)
        destino_dir = _carpeta(p)
        destino_dir.mkdir(parents=True, exist_ok=True)
        destino = destino_dir / nombre
        n = 2
        while destino.exists():
            destino = destino_dir / f"{Path(nombre).stem}-{n}{Path(nombre).suffix}"
            n += 1
        shutil.copy2(ruta, destino)
    sesion.add(ProyectoArchivo(proyecto_id=pid, categoria="origen", etiqueta=f"Word cargado ({nombre})", nombre_archivo=str(destino), tamano=tam, subido_por=usuario.id, sha256=huella))
    hechas = ", ".join(f"«{s.titulo}»" for s in cambiadas) or "ninguna"
    _registrar(sesion, p, usuario, "redacto", f"Cargó el Word {nombre}: partes {hechas}.")
    await _fase_auto(sesion, p, usuario, "redaccion", "en_curso", ("pendiente",))
    await sesion.commit()
    return {"aplicadas": [s.clave for s in cambiadas], "omitidas": [r["clave"] for r in partes if r["ocupada"] or not r["existe"]]}


class DatosVistaPrevia(BaseModel):
    # La parte que se está editando, con su contenido AÚN SIN GUARDAR (opcional).
    clave: str = ""
    contenido: dict | None = None


def _carpeta_vista(p: Proyecto, usuario: Usuario) -> Path:
    # Una por persona: dos personas previsualizando a la vez no se pisan.
    return _carpeta(p) / "vista-previa" / f"u{usuario.id}"


@router.post("/{pid}/vista-previa")
async def vista_previa(
    pid: int,
    datos: DatosVistaPrevia,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Compila el proyecto TAL COMO VA, para verlo a la derecha como en los
    documentos. No es una versión: no se registra, no numera y se reemplaza en
    cada vista previa («Generar PDF» sigue siendo el que queda)."""
    p = await _proyecto(sesion, pid)
    secs = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid).order_by(ProyectoSeccion.orden))).scalars().all()
    # En compartido, la vista previa muestra lo que todos van escribiendo (los
    # borradores vivos), no solo lo guardado como versión.
    sustituir = {s.clave: s.borrador for s in secs if p.colaboracion and colab.sin_versionar(s.borrador, s.contenido)}
    if datos.clave and datos.contenido is not None:
        sustituir[datos.clave] = datos.contenido
    maestro, avisos = _componer(p, secs, _carpeta_vista(p, usuario), sustituir)
    resultado = await ejecutar_build(maestro)
    if not resultado.exito or resultado.ruta_pdf is None:
        raise HTTPException(422, f"No se pudo armar la vista previa: {resultado.mensaje}")
    destino = maestro.parent / "vista-previa.pdf"
    shutil.move(str(resultado.ruta_pdf), destino)
    from app.servicios.pdf import contar_paginas

    return {"paginas": contar_paginas(destino), "avisos": avisos, "marca": int(destino.stat().st_mtime)}


@router.get("/{pid}/vista-previa")
async def ver_vista_previa(
    pid: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    p = await _proyecto(sesion, pid)
    ruta = _carpeta_vista(p, usuario) / "vista-previa.pdf"
    if not ruta.is_file():
        raise HTTPException(404, "Aún no hay vista previa.")
    return enviar_archivo(ruta, f"{p.codigo}_vista-previa.pdf", peticion=peticion)


@router.post("/{pid}/generar")
async def generar_pdf(
    pid: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Compone el .tex desde las PARTES y la ficha (latex/proyecto_ley.py) y lo
    compila con el marco. Cada PDF es una versión NUEVA (…_v3.pdf): nunca
    reemplaza a la anterior, y la bitácora dice de qué versiones de cada
    parte salió."""
    _puede_escribir(usuario)
    p = await _proyecto(sesion, pid)
    secs = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid).order_by(ProyectoSeccion.orden))).scalars().all()
    carpeta = _carpeta(p) / "generado"
    maestro, avisos_tl = _componer(p, secs, carpeta)
    # El PDF que queda sale de las VERSIONES: lo escrito en compartido sin
    # guardar no entra, y se dice.
    avisos_tl += [f"«{s.titulo}» tiene texto escrito sin guardar como versión: el PDF usa la v{s.version}." for s in secs if p.colaboracion and colab.sin_versionar(s.borrador, s.contenido)]
    resultado = await ejecutar_build(maestro)
    if not resultado.exito or resultado.ruta_pdf is None:
        _registrar(sesion, p, usuario, "generacion", f"La generación del PDF falló: {resultado.mensaje[:300]}")
        await sesion.commit()
        raise HTTPException(422, f"No se pudo generar el PDF: {resultado.mensaje}")
    previas = (await sesion.execute(select(func.count()).select_from(ProyectoArchivo).where(ProyectoArchivo.proyecto_id == pid, ProyectoArchivo.categoria == "generado"))).scalar_one()
    n = previas + 1
    destino = carpeta / f"{p.codigo}_generado-v{n}.pdf"
    shutil.move(str(resultado.ruta_pdf), destino)
    origen = ", ".join(f"{s.clave} v{s.version}" for s in secs if s.version)
    a = ProyectoArchivo(proyecto_id=pid, categoria="generado", etiqueta=f"PDF generado v{n}", nombre_archivo=str(destino), tamano=destino.stat().st_size, subido_por=usuario.id, sha256=_sha256(destino),
                        huella=_huella_contenido(p, secs))
    sesion.add(a)
    _registrar(sesion, p, usuario, "generacion", f"Generó el PDF v{n} desde las partes ({origen}).")
    await sesion.commit()
    from app.servicios.pdf import contar_paginas

    return {"id": a.id, "version": n, "paginas": contar_paginas(destino), "avisos": avisos_tl}


# --- Exportar a Word (2026-10-19) ---------------------------------------------------------------------


@router.get("/{pid}/docx")
async def exportar_docx(pid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)):
    """El proyecto como .docx: sus partes en orden, cada una con su título (copia de trabajo; el
    definitivo sigue saliendo de `/generar` con LuaLaTeX). `servicios/exportar_docx.partes_a_docx`."""
    from urllib.parse import quote

    from fastapi import Response as _Response

    from app.servicios import exportar_docx as svc_docx

    p = await sesion.get(Proyecto, pid)
    if p is None or p.eliminado_en is not None:
        raise HTTPException(404, "El proyecto no existe.")
    secs = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid).order_by(ProyectoSeccion.orden))).scalars().all()
    partes = [(s.titulo, s.contenido) for s in secs if s.contenido and s.clave != "titulo"]   # el título ya encabeza el Word
    titulo = next((" ".join(reglas.texto_plano(s.contenido).split()) for s in secs if s.clave == "titulo" and s.contenido), "") or p.titulo or ""
    datos = await asyncio.to_thread(svc_docx.partes_a_docx, titulo, partes)
    nombre = svc_docx.nombre_docx(p.codigo or "", titulo, "Proyecto-de-ley")
    return _Response(datos, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                     headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nombre)}", "Cache-Control": "no-store"})


@router.get("/{pid}/md")
async def exportar_md(pid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)):
    """El proyecto como Markdown: sus partes en orden (`servicios/exportar_md.partes_a_md`)."""
    from urllib.parse import quote

    from fastapi import Response as _Response

    from app.servicios import exportar_docx as svc_docx
    from app.servicios import exportar_md as svc_md

    p = await sesion.get(Proyecto, pid)
    if p is None or p.eliminado_en is not None:
        raise HTTPException(404, "El proyecto no existe.")
    secs = (await sesion.execute(select(ProyectoSeccion).where(ProyectoSeccion.proyecto_id == pid).order_by(ProyectoSeccion.orden))).scalars().all()
    titulo = next((" ".join(reglas.texto_plano(s.contenido).split()) for s in secs if s.clave == "titulo" and s.contenido), "") or p.titulo or ""
    texto = svc_md.partes_a_md(titulo, [(s.titulo, s.contenido) for s in secs if s.contenido and s.clave != "titulo"])
    nombre = svc_docx.nombre_docx(p.codigo or "", titulo, "Proyecto-de-ley").replace(".docx", ".md")
    return _Response(texto, media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nombre)}", "Cache-Control": "no-store"})

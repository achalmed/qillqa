"""API de las fotografías de la entidad (2026-10-06; servicios/fototeca.py).

Lista con filtros y facetas, subida múltiple con detección de duplicados, original /
vista / miniatura (todas por `enviar_archivo`), edición no destructiva, cambios en
lote, exportación por tamaños, papelera sin borrado físico, álbumes y la importación
de las fotos que ya estaban en los bancos de las semanas de representación.

Videos (2026-10-06): se suben y se listan como las fotos (`medio=video`), con su póster
como miniatura; no se editan ni se exportan por tamaños (se descarga el original). El
navegador los reproduce desde `GET /{id}/video?firma=…`: un enlace firmado y de vida
corta que da `GET /{id}/enlace-video` (un <video> no puede mandar el token), servido por
`enviar_archivo` con Range para poder adelantar.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import enviar_archivo
from app.config import config
from app.db import obtener_sesion
from app.modelos import AlbumFoto, Documento, Foto, FotoSR, Proyecto, SemanaSR, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import etiquetas
from app.servicios import fototeca as ft

router = APIRouter(prefix="/api/fototeca", tags=["fototeca"])

MEDIA = {"jpg": "image/jpeg", "webp": "image/webp", "png": "image/png", "tif": "image/tiff", "heic": "image/heic",
         **{k.lstrip("."): v for k, v in ft.MEDIA_VIDEO.items()}}
# Enlace firmado de un video: audiencia propia (no sirve como token de la API) y vida corta.
AUDIENCIA_VIDEO = "fototeca-video"
HORAS_ENLACE = 4


def firmar_video(foto_id: int, ahora: datetime | None = None) -> str:
    ahora = ahora or datetime.now(timezone.utc)
    carga = {"sub": str(foto_id), "aud": AUDIENCIA_VIDEO, "iat": ahora, "exp": ahora + timedelta(hours=HORAS_ENLACE)}
    return jwt.encode(carga, config.jwt_secret, algorithm="HS256")


def leer_firma_video(firma: str | None) -> int | None:
    """El id de la foto de un enlace válido, o None (falta, vencido, alterado o de otro uso)."""
    if not firma:
        return None
    try:
        carga = jwt.decode(firma, config.jwt_secret, algorithms=["HS256"], audience=AUDIENCIA_VIDEO,
                           options={"require": ["exp", "sub", "aud"]})
    except jwt.InvalidTokenError:
        return None
    sub = str(carga.get("sub") or "")
    return int(sub) if sub.isdigit() else None


def _puede_escribir(u: Usuario) -> None:
    if u.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


async def _foto(sesion: AsyncSession, foto_id: int, papelera_ok: bool = True) -> Foto:
    foto = await sesion.get(Foto, foto_id)
    if foto is None or (not papelera_ok and foto.eliminada_en is not None):
        raise HTTPException(404, "Foto no encontrada.")
    return foto


async def _en_hilo(fn, *args):
    """Pillow trabaja en un hilo (no bloquea la API) y sus fallos son 4xx/5xx legibles."""
    try:
        return await asyncio.to_thread(fn, *args)
    except ft.ErrorFototeca as e:
        raise HTTPException(422, str(e))
    except FileNotFoundError:
        raise HTTPException(404, "El original no está en la Fototeca.")


# --- Lista, facetas y vocabularios ----------------------------------------------------------


@router.get("")
async def listar(
    q: str = "",
    album: str = "",
    etiqueta: str = "",
    persona: str = "",
    estado: str = "",
    favorita: bool = False,
    desde: str = "",
    hasta: str = "",
    mes: str = "",
    vinculo: str = "",
    papelera: bool = False,
    medio: str = "",
    orden: str = "reciente",
    limite: int = 120,
    desde_n: int = 0,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Una página de fotos (`desde_n`, `limite` ≤ 500) y el total con esos filtros.
    `medio=foto|video` filtra por tipo (el selector de fotos de otros módulos pide solo fotos)."""
    f = ft.leer_filtros(q, album, etiqueta, persona, estado, favorita, desde, hasta, mes, vinculo, papelera, medio)
    cond = ft.condiciones(f)
    limite = max(1, min(500, limite))
    total = (await sesion.execute(select(func.count(Foto.id)).where(*cond))).scalar_one()
    filas = (await sesion.execute(
        select(Foto).where(*cond).order_by(*ft.orden(orden)).offset(max(0, desde_n)).limit(limite)
    )).scalars().all()
    siguiente = desde_n + len(filas)
    return {"fotos": await _vigentes(sesion, [ft.ficha(x) for x in filas]), "total": total,
            "siguiente": siguiente if siguiente < total else None}


@router.get("/facetas")
async def facetas(
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Los contadores del panel: totales, álbumes, etiquetas, personas, meses y vínculos."""
    tz = config.zona_horaria
    tot = (await sesion.execute(text(
        "SELECT count(*) FILTER (WHERE eliminada_en IS NULL), "
        "count(*) FILTER (WHERE eliminada_en IS NULL AND estado = 'por_revisar'), "
        "count(*) FILTER (WHERE eliminada_en IS NULL AND favorita), "
        "count(*) FILTER (WHERE eliminada_en IS NULL AND album_id IS NULL), "
        "count(*) FILTER (WHERE eliminada_en IS NOT NULL), "
        "count(*) FILTER (WHERE eliminada_en IS NULL AND medio = 'video') FROM fototeca_fotos"
    ))).one()
    albumes = (await sesion.execute(text(
        "SELECT a.id, a.nombre, a.descripcion, a.fecha, a.portada_id, "
        "count(f.id) FILTER (WHERE f.eliminada_en IS NULL) AS n, "
        "(SELECT min(g.id) FROM fototeca_fotos g WHERE g.album_id = a.id AND g.eliminada_en IS NULL) AS primera "
        "FROM fototeca_albumes a LEFT JOIN fototeca_fotos f ON f.album_id = a.id "
        "GROUP BY a.id ORDER BY a.fecha DESC, a.nombre"
    ))).all()

    async def _lista(columna: str) -> list[dict]:
        filas = (await sesion.execute(text(
            f"SELECT e, count(*) FROM fototeca_fotos, jsonb_array_elements_text({columna}) e "
            "WHERE eliminada_en IS NULL GROUP BY e ORDER BY count(*) DESC, e LIMIT 300"
        ))).all()
        return [{"valor": v, "n": n} for v, n in filas]

    meses = (await sesion.execute(text(
        "SELECT to_char(timezone(:tz, tomada_en), 'YYYY-MM') m, count(*) FROM fototeca_fotos "
        "WHERE eliminada_en IS NULL GROUP BY m ORDER BY m DESC"
    ), {"tz": tz})).all()
    vinculos = (await sesion.execute(text(
        "SELECT v->>'tipo', (v->>'id')::int, max(v->>'etiqueta'), count(*) FROM fototeca_fotos, "
        "jsonb_array_elements(vinculos) v WHERE eliminada_en IS NULL AND v ? 'id' "
        "GROUP BY 1, 2 ORDER BY 1, 2 DESC"
    ))).all()
    return {
        "total": tot[0], "por_revisar": tot[1], "favoritas": tot[2], "sin_album": tot[3], "papelera": tot[4],
        "videos": tot[5],
        "albumes": [{"id": a.id, "nombre": a.nombre, "descripcion": a.descripcion, "fecha": a.fecha,
                     "portada_id": a.portada_id or a.primera, "n": a.n} for a in albumes],
        "etiquetas": await _lista("etiquetas"),
        "personas": await _lista("personas"),
        "meses": [{"mes": m, "n": n} for m, n in meses],
        "vinculos": await _vigentes_resumen(sesion, vinculos),
    }


async def _vigentes(sesion: AsyncSession, fichas: list[dict]) -> list[dict]:
    """Los vínculos de cada foto con la etiqueta VIGENTE de lo vinculado (2026-10-12): la guardada
    («OF (borrador 95)») era una copia del momento de vincular. Si ya no existe, queda la guardada."""
    claves = {f"{v.get('tipo')}:{v.get('id')}" for f in fichas for v in f.get("vinculos") or [] if v.get("id") is not None}
    vigentes = await etiquetas.cortas_de(sesion, claves) if claves else {}
    for f in fichas:
        f["vinculos"] = [{**v, "etiqueta": vigentes.get(f"{v.get('tipo')}:{v.get('id')}", v.get("etiqueta") or "")}
                         for v in f.get("vinculos") or []]
    return fichas


async def _vigentes_resumen(sesion: AsyncSession, vinculos) -> list[dict]:
    vigentes = await etiquetas.cortas_de(sesion, {f"{t}:{i}" for t, i, _, _ in vinculos})
    return [{"tipo": t, "id": i, "etiqueta": vigentes.get(f"{t}:{i}") or e or f"{t} {i}", "n": n} for t, i, e, n in vinculos]


@router.get("/presets")
async def presets(_: Usuario = Depends(usuario_actual)) -> list[dict]:
    return [{"clave": k, "etiqueta": v["etiqueta"], "proporcion": v["proporcion"]} for k, v in ft.PRESETS.items()]


# --- Subida -----------------------------------------------------------------------------------



async def _album_de_actividad(sesion: AsyncSession, semana_id: int, actividad: str, usuario_id: int) -> int | None:
    """El álbum de una actividad de una semana de representación («SR-05 · A-01 · Visita a la
    UGEL»); se crea si no existe. None si la semana o la actividad no están."""
    from app.modelos import ActividadSR, SemanaSR

    semana = await sesion.get(SemanaSR, semana_id)
    if semana is None:
        return None
    act = (await sesion.execute(
        select(ActividadSR).where(ActividadSR.semana_id == semana_id, ActividadSR.codigo == actividad)
    )).scalar_one_or_none()
    datos = (act.datos if act else None) or {}
    titulo = str(datos.get("titulo") or datos.get("nombre") or "").strip()
    nombre = " · ".join(x for x in (semana.codigo, actividad, titulo) if x)[:200]
    existente = (await sesion.execute(select(AlbumFoto).where(AlbumFoto.nombre == nombre))).scalars().first()
    if existente:
        return existente.id
    album = AlbumFoto(nombre=nombre, fecha=str(datos.get("fecha") or "")[:10], creado_por=usuario_id,
                      descripcion=f"Actividad {actividad} de la semana {semana.codigo}")
    sesion.add(album)
    await sesion.flush()
    return album.id

@router.post("/subir")
async def subir(
    archivos: list[UploadFile] = File(...),
    album_id: int | None = Form(None),
    semana_id: int | None = Form(None),
    actividad: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Varias fotos (o videos) a la vez. Cada original se guarda una vez: las repetidas (por
    su contenido, no por su nombre) se informan en `duplicadas` y no se vuelven a guardar.

    Con `semana_id` (y `actividad`), son fotos de una Semana de Representación (2026-10-10):
    además de entrar aquí, pasan al banco de trabajo de esa semana —la carpeta donde se
    procesan y eligen para el informe— y quedan registradas en su actividad. La Fototeca sigue
    siendo la única biblioteca; el banco es su copia de trabajo."""
    _puede_escribir(usuario)
    if album_id is not None and await sesion.get(AlbumFoto, album_id) is None:
        raise HTTPException(404, "Álbum no encontrado.")
    # Ninguna foto suelta (Edison 2026-10-10, segunda vuelta: «deben estar agrupadas por
    # actividad, como en la Semana de Representación»): las de una actividad de una semana van
    # a un álbum propio «SR-NN · A-NN · título» (se crea la primera vez), así la Mediateca las
    # agrupa igual que el banco de la semana.
    if album_id is None and semana_id is not None and actividad.strip():
        album_id = await _album_de_actividad(sesion, semana_id, actividad.strip(), usuario.id)
    nuevas, duplicadas, rechazadas = [], [], []
    tmp_dir = ft.carpeta_temporal()
    for archivo in archivos:
        nombre = Path(archivo.filename or "foto.jpg").name
        if not ft.admitido(nombre):
            rechazadas.append({"nombre": nombre, "motivo": "No es una foto (JPG, PNG, WEBP, HEIC o TIFF) ni un video (MP4, MOV o WEBM)."})
            continue
        maximo = ft.MAX_VIDEO if ft.es_video(nombre) else ft.MAX_FOTO
        tmp = tmp_dir / f"{uuid.uuid4().hex}{Path(nombre).suffix.lower()}"
        tam = 0
        with tmp.open("wb") as fh:
            while trozo := await archivo.read(1024 * 1024):
                tam += len(trozo)
                if tam > maximo:
                    break
                fh.write(trozo)
        if tam > maximo:
            tmp.unlink(missing_ok=True)
            rechazadas.append({"nombre": nombre, "motivo": f"Pesa más de {maximo // 1024 // 1024} MB."})
            continue
        try:
            foto, nueva = await ft.registrar(sesion, tmp, nombre, usuario.id, mover=True,
                                             datos={"album_id": album_id})
        except ft.ErrorFototeca as e:
            tmp.unlink(missing_ok=True)
            rechazadas.append({"nombre": nombre, "motivo": str(e)})
            continue
        if nueva:
            nuevas.append(foto)
        else:
            duplicadas.append({"nombre": nombre, "id": foto.id, "en_papelera": foto.eliminada_en is not None})
    await sesion.commit()
    semana_resultado = None
    ids_semana = [x.id for x in nuevas] + [d["id"] for d in duplicadas if not d["en_papelera"]]
    if semana_id is not None and ids_semana:
        from app.api.semanas_sr import DesdeFototeca, fotos_desde_fototeca

        semana_resultado = await fotos_desde_fototeca(
            semana_id, DesdeFototeca(ids=ids_semana, actividad=actividad.strip()), usuario, sesion,
        )
    return {"nuevas": [ft.ficha(x) for x in nuevas], "duplicadas": duplicadas, "rechazadas": rechazadas,
            "semana": semana_resultado}


# --- Cambios en lote y exportación múltiple (antes de /{foto_id}) --------------------------


class Lote(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=2000)
    etiquetas_agregar: list[str] = Field(default_factory=list)
    etiquetas_quitar: list[str] = Field(default_factory=list)
    personas_agregar: list[str] = Field(default_factory=list)
    personas_quitar: list[str] = Field(default_factory=list)
    # Presente (aunque sea null) = mover a ese álbum o sacar del álbum.
    album_id: int | None = None
    estado: str | None = None
    favorita: bool | None = None
    calificacion: int | None = Field(default=None, ge=0, le=5)
    lugar: str | None = None
    # True = a la papelera; False = restaurar.
    papelera: bool | None = None


def _quitar(lista: list, quitar: list[str]) -> list:
    fuera = {q.casefold() for q in quitar}
    return [x for x in lista if str(x).casefold() not in fuera]


@router.patch("/lote")
async def cambiar_lote(
    datos: Lote,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    if datos.estado is not None and datos.estado not in ft.ESTADOS:
        raise HTTPException(422, "Estado desconocido.")
    if "album_id" in datos.model_fields_set and datos.album_id is not None \
            and await sesion.get(AlbumFoto, datos.album_id) is None:
        raise HTTPException(404, "Álbum no encontrado.")
    fotos = (await sesion.execute(select(Foto).where(Foto.id.in_(datos.ids)))).scalars().all()
    ahora = datetime.now().astimezone()
    for f in fotos:
        if datos.etiquetas_agregar or datos.etiquetas_quitar:
            f.etiquetas = ft.normalizar_lista(_quitar(f.etiquetas or [], datos.etiquetas_quitar) + datos.etiquetas_agregar)
        if datos.personas_agregar or datos.personas_quitar:
            f.personas = ft.normalizar_lista(_quitar(f.personas or [], datos.personas_quitar) + datos.personas_agregar)
        if "album_id" in datos.model_fields_set:
            f.album_id = datos.album_id
        if datos.estado is not None:
            f.estado = datos.estado
        if datos.favorita is not None:
            f.favorita = datos.favorita
        if datos.calificacion is not None:
            f.calificacion = datos.calificacion
        if datos.lugar is not None:
            f.lugar = datos.lugar.strip()[:200]
        if datos.papelera is not None:
            f.eliminada_en = ahora if datos.papelera else None
    await sesion.commit()
    return {"cambiadas": len(fotos)}


class Exportar(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    preset: str = "original"
    formato: str = "jpg"


@router.post("/exportar")
async def exportar_lote(
    datos: Exportar,
    peticion: Request,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Una foto: el archivo exportado; varias: un .zip con todas (con sus ajustes). Un
    video va tal cual (su original): no tiene tamaños de exportación."""
    fotos = (await sesion.execute(select(Foto).where(Foto.id.in_(datos.ids)).order_by(Foto.tomada_en))).scalars().all()
    if not fotos:
        raise HTTPException(404, "Ninguna de esas fotos existe.")
    entradas = []
    for f in fotos:
        if f.medio == "video":
            ruta = ft.ruta_original(f.archivo)
            if not ruta.is_file():
                raise HTTPException(404, "El original no está en la Fototeca.")
            entradas.append((ruta, f.nombre_original or ruta.name))
            continue
        ruta = await _en_hilo(ft.exportar, f.archivo, f.sha256, f.ajustes, datos.preset, datos.formato)
        entradas.append((ruta, ft.nombre_exportado(f.nombre_original, f.titulo, datos.preset, datos.formato)))
    if len(entradas) == 1:
        media = MEDIA.get(entradas[0][0].suffix.lstrip(".").lower(), MEDIA[datos.formato])
        return enviar_archivo(entradas[0][0], entradas[0][1], media_type=media, peticion=peticion)
    zip_ = await asyncio.to_thread(ft.armar_zip, entradas)
    return enviar_archivo(zip_, zip_.name, media_type="application/zip")


# --- Álbumes ------------------------------------------------------------------------------


class DatosAlbum(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    descripcion: str = ""
    fecha: str = Field(default="", max_length=10)
    portada_id: int | None = None


def _album(a: AlbumFoto) -> dict:
    return {"id": a.id, "nombre": a.nombre, "descripcion": a.descripcion, "fecha": a.fecha, "portada_id": a.portada_id}


@router.get("/albumes")
async def albumes(_: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    filas = (await sesion.execute(select(AlbumFoto).order_by(AlbumFoto.fecha.desc(), AlbumFoto.nombre))).scalars().all()
    return [_album(a) for a in filas]


@router.post("/albumes")
async def crear_album(
    datos: DatosAlbum,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    a = AlbumFoto(nombre=datos.nombre.strip(), descripcion=datos.descripcion.strip(), fecha=datos.fecha,
                  portada_id=datos.portada_id, creado_por=usuario.id)
    sesion.add(a)
    await sesion.commit()
    return _album(a)


@router.patch("/albumes/{album_id}")
async def cambiar_album(
    album_id: int,
    datos: DatosAlbum,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _puede_escribir(usuario)
    a = await sesion.get(AlbumFoto, album_id)
    if a is None:
        raise HTTPException(404, "Álbum no encontrado.")
    a.nombre, a.descripcion, a.fecha = datos.nombre.strip(), datos.descripcion.strip(), datos.fecha
    if "portada_id" in datos.model_fields_set:
        a.portada_id = datos.portada_id
    await sesion.commit()
    return _album(a)


@router.delete("/albumes/{album_id}")
async def quitar_album(
    album_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Quita el álbum; sus fotos se quedan en la Fototeca, sin álbum."""
    _puede_escribir(usuario)
    a = await sesion.get(AlbumFoto, album_id)
    if a is None:
        raise HTTPException(404, "Álbum no encontrado.")
    await sesion.execute(update(Foto).where(Foto.album_id == album_id).values(album_id=None))
    await sesion.delete(a)
    await sesion.commit()
    return {"ok": True}


# --- Importar los bancos de las semanas ------------------------------------------------------


@router.post("/importar-semanas")
async def importar_semanas(
    crear_albumes: bool = True,
    semana_id: int | None = None,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Trae a la Fototeca las fotos de los bancos de TODAS las semanas de representación.

    Idempotente: una foto ya traída (misma huella) solo gana el vínculo con la semana que
    le falte; lo corregido en la Fototeca no se pisa. El banco de la semana no se toca (el
    informe sigue leyendo de él). Con `crear_albumes`, cada semana tiene su álbum; con
    `semana_id`, solo esa semana."""
    return await importar_bancos(sesion, usuario.id, crear_albumes, semana_id)


async def importar_bancos(sesion: AsyncSession, usuario_id: int | None, crear_albumes: bool = True,
                          semana_id: int | None = None) -> dict:
    resumen = {"semanas": 0, "nuevas": 0, "ya_estaban": 0, "sin_original": 0, "errores": []}
    consulta = select(SemanaSR).order_by(SemanaSR.numero)
    if semana_id is not None:
        consulta = consulta.where(SemanaSR.id == semana_id)
    semanas = (await sesion.execute(consulta)).scalars().all()
    for semana in semanas:
        banco = ((semana.resto or {}).get("fotos") or {}).get("_meta", {}).get("banco")
        if not banco:
            continue
        banco = Path(str(banco)).expanduser()
        resumen["semanas"] += 1
        exp = semana.expediente or {}
        tema = str(exp.get("tema") or semana.carpeta.split("_", 2)[-1]).strip()
        album_nombre = f"{semana.codigo} · {tema}" if tema else semana.codigo
        etiqueta = semana.codigo
        album_id = None
        if crear_albumes:
            album = (await sesion.execute(select(AlbumFoto).where(AlbumFoto.nombre == album_nombre))).scalar_one_or_none()
            if album is None:
                album = AlbumFoto(nombre=album_nombre, descripcion="Fotos del banco de la semana de representación.",
                                  fecha=str((exp.get("periodo") or {}).get("inicio") or "")[:10], creado_por=usuario_id)
                sesion.add(album)
                await sesion.flush()
            album_id = album.id
        fotos = (await sesion.execute(
            select(FotoSR).where(FotoSR.semana_id == semana.id).order_by(FotoSR.orden, FotoSR.id)
        )).scalars().all()
        for fsr in fotos:
            d = fsr.datos or {}
            vinculo = {"tipo": "semana", "id": semana.id, "codigo": fsr.codigo, "etiqueta": etiqueta,
                       "seleccion": bool(d.get("seleccion")) or None}
            # Llegó DESDE la Fototeca (quizá con ajustes, es decir, otro archivo): solo el vínculo.
            if d.get("fototeca_id"):
                origen = await sesion.get(Foto, int(d["fototeca_id"]))
                if origen is not None:
                    origen.vinculos = ft.con_vinculo(origen.vinculos, vinculo)
                    resumen["ya_estaban"] += 1
                    continue
            ruta = (banco / str(d.get("origen") or "")).resolve()
            if not d.get("origen") or not ruta.is_file():
                resumen["sin_original"] += 1
                continue
            try:
                _, nueva = await ft.registrar(
                    sesion, ruta, ruta.name, usuario_id, vinculo=vinculo,
                    datos={"descripcion": str(d.get("pie") or ""), "estado": ft.estado_desde_semana(d.get("estado")),
                           "album_id": album_id, "etiquetas": ["Semana de representación"]},
                )
            except ft.ErrorFototeca as e:
                resumen["errores"].append(f"{semana.codigo} {fsr.codigo}: {e}")
                continue
            resumen["nuevas" if nueva else "ya_estaban"] += 1
        await sesion.commit()
    return resumen


# --- Una foto ------------------------------------------------------------------------------


@router.get("/{foto_id}")
async def ver(foto_id: int, _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    foto = await _foto(sesion, foto_id)
    d = (await _vigentes(sesion, [ft.ficha(foto, detalle=True)]))[0]
    if foto.subido_por:
        u = await sesion.get(Usuario, foto.subido_por)
        d["subido_por_nombre"] = u.nombre_completo if u else ""
    return d


@router.get("/{foto_id}/original")
async def original(foto_id: int, peticion: Request, _: Usuario = Depends(usuario_actual),
                   sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    foto = await _foto(sesion, foto_id)
    ruta = ft.ruta_original(foto.archivo)
    if not ruta.is_file():
        raise HTTPException(404, "El original no está en la Fototeca.")
    ext = ruta.suffix.lstrip(".").lower()
    return enviar_archivo(ruta, foto.nombre_original or ruta.name, media_type=MEDIA.get(ext, "application/octet-stream"),
                          peticion=peticion, rangos=foto.medio == "video")


@router.get("/{foto_id}/enlace-video")
async def enlace_video(foto_id: int, _: Usuario = Depends(usuario_actual),
                       sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Dirección firmada (vida corta) para reproducir un video en un <video>."""
    foto = await _foto(sesion, foto_id)
    if foto.medio != "video":
        raise HTTPException(422, "No es un video.")
    return {"url": f"/api/fototeca/{foto.id}/video?firma={firmar_video(foto.id)}", "horas": HORAS_ENLACE}


@router.get("/{foto_id}/video")
async def video(foto_id: int, peticion: Request, firma: str = "",
                sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    """El video para el reproductor: sin token (no lo manda un <video>), con el enlace
    firmado de `enlace-video`, y con Range para adelantar."""
    if leer_firma_video(firma) != foto_id:
        raise HTTPException(401, "Enlace del video vencido o no válido: vuelva a abrirlo desde la Fototeca.")
    foto = await _foto(sesion, foto_id)
    ruta = ft.ruta_original(foto.archivo)
    if foto.medio != "video" or not ruta.is_file():
        raise HTTPException(404, "El video no está en la Fototeca.")
    return enviar_archivo(ruta, foto.nombre_original or ruta.name,
                          media_type=ft.MEDIA_VIDEO.get(ruta.suffix.lower(), "video/mp4"), peticion=peticion, rangos=True)


async def _derivado(sesion: AsyncSession, foto_id: int, tipo: str, peticion: Request) -> Response:
    foto = await _foto(sesion, foto_id)
    ruta = await _en_hilo(ft.derivado, foto.archivo, foto.sha256, foto.ajustes, tipo)
    return enviar_archivo(ruta, f"{tipo}-{foto.id}.jpg", media_type="image/jpeg", peticion=peticion)


@router.get("/{foto_id}/miniatura")
async def miniatura(foto_id: int, peticion: Request, _: Usuario = Depends(usuario_actual),
                    sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    """400 px con los ajustes. La web pide `?v=<version>`: un ajuste nuevo es otra dirección."""
    return await _derivado(sesion, foto_id, "miniatura", peticion)


@router.get("/{foto_id}/vista")
async def vista(foto_id: int, peticion: Request, crudo: bool = False, _: Usuario = Depends(usuario_actual),
                sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    """1600 px con los ajustes; `crudo=1`, sin ellos (la base del editor)."""
    return await _derivado(sesion, foto_id, "crudo" if crudo else "vista", peticion)


@router.get("/{foto_id}/exportar")
async def exportar(foto_id: int, peticion: Request, preset: str = "original", formato: str = "jpg",
                   _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> Response:
    foto = await _foto(sesion, foto_id)
    ruta = await _en_hilo(ft.exportar, foto.archivo, foto.sha256, foto.ajustes, preset, formato)
    return enviar_archivo(ruta, ft.nombre_exportado(foto.nombre_original, foto.titulo, preset, formato),
                          media_type=MEDIA.get(formato, "image/jpeg"), peticion=peticion)


@router.get("/{foto_id}/sugerir-ajustes")
async def sugerir(foto_id: int, _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Mejora automática propuesta (luz y contraste); no se guarda hasta aceptarla."""
    foto = await _foto(sesion, foto_id)
    return await _en_hilo(ft.sugerir_ajustes, foto.archivo, foto.sha256)


class Cambio(BaseModel):
    titulo: str | None = Field(default=None, max_length=300)
    descripcion: str | None = None
    lugar: str | None = Field(default=None, max_length=200)
    etiquetas: list[str] | None = None
    personas: list[str] | None = None
    estado: str | None = None
    favorita: bool | None = None
    calificacion: int | None = Field(default=None, ge=0, le=5)
    album_id: int | None = None
    ajustes: dict | None = None
    # Corregir la fecha cuando la cámara no la tenía (AAAA-MM-DDTHH:MM).
    tomada_en: str | None = None


@router.patch("/{foto_id}")
async def cambiar(
    foto_id: int,
    datos: Cambio,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Solo cambia lo que viaja (a diferencia del PUT de los documentos)."""
    _puede_escribir(usuario)
    foto = await _foto(sesion, foto_id)
    enviados = datos.model_fields_set
    for clave in ("titulo", "descripcion", "lugar"):
        if clave in enviados and getattr(datos, clave) is not None:
            setattr(foto, clave, getattr(datos, clave).strip())
    if datos.etiquetas is not None:
        foto.etiquetas = ft.normalizar_lista(datos.etiquetas)
    if datos.personas is not None:
        foto.personas = ft.normalizar_lista(datos.personas)
    if datos.estado is not None:
        if datos.estado not in ft.ESTADOS:
            raise HTTPException(422, "Estado desconocido.")
        foto.estado = datos.estado
    if datos.favorita is not None:
        foto.favorita = datos.favorita
    if datos.calificacion is not None:
        foto.calificacion = datos.calificacion
    if "album_id" in enviados:
        if datos.album_id is not None and await sesion.get(AlbumFoto, datos.album_id) is None:
            raise HTTPException(404, "Álbum no encontrado.")
        foto.album_id = datos.album_id
    if datos.ajustes is not None:
        if foto.medio == "video" and ft.normalizar_ajustes(datos.ajustes):
            raise HTTPException(422, "Los videos no se editan en la Fototeca (se editan en Prensa).")
        foto.ajustes = ft.normalizar_ajustes(datos.ajustes)
    if datos.tomada_en:
        try:
            nueva = datetime.fromisoformat(datos.tomada_en)
        except ValueError:
            raise HTTPException(422, "Fecha inválida.")
        foto.tomada_en = nueva if nueva.tzinfo else nueva.replace(tzinfo=ft.zona())
    await sesion.commit()
    await sesion.refresh(foto)
    return (await _vigentes(sesion, [ft.ficha(foto, detalle=True)]))[0]


@router.delete("/{foto_id}")
async def a_papelera(foto_id: int, usuario: Usuario = Depends(usuario_actual),
                     sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """A la papelera (se restaura cuando se quiera). El original no se borra."""
    _puede_escribir(usuario)
    foto = await _foto(sesion, foto_id)
    foto.eliminada_en = datetime.now().astimezone()
    await sesion.commit()
    return {"ok": True}


@router.post("/{foto_id}/restaurar")
async def restaurar(foto_id: int, usuario: Usuario = Depends(usuario_actual),
                    sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _puede_escribir(usuario)
    foto = await _foto(sesion, foto_id)
    foto.eliminada_en = None
    await sesion.commit()
    return {"ok": True}


class Vinculo(BaseModel):
    tipo: str
    id: int
    codigo: str | None = None


async def etiqueta_vinculo(sesion: AsyncSession, tipo: str, ident: int) -> str:
    """Cómo se nombra el destino de un vínculo (SR-02, PL-0003, OF-0100)."""
    if tipo == "semana":
        s = await sesion.get(SemanaSR, ident)
        return s.codigo if s else ""
    if tipo == "proyecto":
        p = await sesion.get(Proyecto, ident)
        return p.codigo if p else ""
    if tipo == "documento":
        d = await sesion.get(Documento, ident)
        if d is None:
            return ""
        return f"{d.serie}-{d.numero:04d}" if d.numero is not None else f"{d.serie} (borrador {d.id})"
    return ""


@router.post("/{foto_id}/vincular")
async def vincular(
    foto_id: int,
    datos: Vinculo,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Anota dónde se usó la foto (un proyecto, un documento, una semana)."""
    _puede_escribir(usuario)
    if datos.tipo not in ft.TIPOS_VINCULO:
        raise HTTPException(422, "Tipo de vínculo desconocido.")
    foto = await _foto(sesion, foto_id)
    etiqueta = await etiqueta_vinculo(sesion, datos.tipo, datos.id)
    if not etiqueta:
        raise HTTPException(404, "No existe aquello con lo que se quiere vincular.")
    foto.vinculos = ft.con_vinculo(foto.vinculos, {"tipo": datos.tipo, "id": datos.id, "codigo": datos.codigo,
                                                   "etiqueta": etiqueta})
    await sesion.commit()
    return {"vinculos": foto.vinculos}

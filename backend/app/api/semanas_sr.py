"""SEMANA DE REPRESENTACIÓN como lugar de trabajo (2026-10-02).

Edison: «que el usuario pueda realizar todo el trabajo de la Semana de Representación
desde el sistema: registrar actividades, pedidos, participantes, entidades, evidencias
[…] y generar el informe directamente desde esos datos». Antes el módulo solo leía los
PDF de `salida/` (api/informes_sr.py, que sigue sirviendo los PDF) y el informe se
hacía editando YAML a mano; el ISR figuraba en «Nuevo documento» de la gestión
documental aunque nunca pudo redactarse allí (es un tipo externo).

Reparto (nada se duplica):
  - registro de la semana → aquí (tablas semanas_sr, actividades_sr, pedidos_sr, fotos_sr);
  - informe → el generador del marco, sin cambios (servicios/generador_sr.py), con los
    YAML que este módulo exporta al expediente (servicios/semanas_sr.py);
  - número, firma, cargo y STD del ISR → la gestión documental (tipo `informe_sr`), al
    que la semana lo incorpora con `servicios/incorporacion.py`;
  - derivar un pedido → un oficio borrador de la gestión documental, enlazado al pedido.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import enviar_archivo
from app.config import config, raiz_informes_sr
from app.db import SesionAsincrona, obtener_sesion
from app.modelos import ActividadSR, Documento, FotoSR, Institucion, PedidoSR, SemanaSR, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import bitacora, generador_sr, informes_sr
from app.servicios import eventos_sistema
from app.servicios import comentarios as svc_com
from app.servicios import fototeca
from app.servicios import incorporacion
from app.servicios import pedidos_md
from app.servicios import semanas_sr as sr
from app.servicios.carpetas import carpeta as carpeta_documento
from app.tipos import TIPOS

router = APIRouter(prefix="/api/semanas", tags=["semana de representación"])
# Rutas fijas que deben resolverse ANTES que `POST /{semana_id}/{lista}` (main.py las incluye primero).
router_pegar = APIRouter(prefix="/api/semanas", tags=["semana de representación"])
log = logging.getLogger("sgdp.semanas")

MODELOS = {"actividades": ActividadSR, "pedidos": PedidoSR, "fotos": FotoSR}
# Quién aprueba el informe (lo firma el diputado; el administrador lo opera).
APRUEBAN = ("administrador", "diputado")
EXTENSIONES_FOTO = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
MAX_FOTO = 40 * 1024 * 1024
MINIATURA = "miniaturas"

# Generación en curso o terminada, por semana (en memoria: la API es un solo proceso).
TRABAJOS: dict[int, dict] = {}


# --- Lectura y escritura de una semana ---------------------------------------------------


async def _semana(sesion: AsyncSession, semana_id: int, bloquear: bool = False) -> SemanaSR:
    consulta = select(SemanaSR).where(SemanaSR.id == semana_id)
    if bloquear:
        consulta = consulta.with_for_update()
    semana = (await sesion.execute(consulta)).scalar_one_or_none()
    if semana is None:
        raise HTTPException(404, "Semana no encontrada.")
    return semana


async def _filas(sesion: AsyncSession, semana_id: int, lista: str) -> list:
    modelo = MODELOS[lista]
    return list(
        (await sesion.execute(
            select(modelo).where(modelo.semana_id == semana_id).order_by(modelo.orden, modelo.id)
        )).scalars()
    )


def _codigo_doc(doc: Documento | None) -> str | None:
    """El código con que los YAML citan un documento: OF-0073-2026-2027, ISR-02-2026-2027
    (con las cifras de su serie: el ISR lleva dos)."""
    if doc is None or doc.numero is None:
        return None
    cifras = int((TIPOS.get(doc.tipo) or {}).get("numero_digitos") or 4)
    return f"{doc.serie}-{doc.numero:0{cifras}d}-{doc.periodo}"


async def _documentos(sesion: AsyncSession, ids: set[int]) -> dict[int, Documento]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    filas = (await sesion.execute(select(Documento).where(Documento.id.in_(ids)))).scalars()
    return {d.id: d for d in filas}


def _ficha_doc(doc: Documento | None) -> dict | None:
    if doc is None:
        return None
    return {"id": doc.id, "codigo": _codigo_doc(doc), "estado": doc.estado, "serie": doc.serie,
            "numero": doc.numero}


async def estructura(sesion: AsyncSession, semana: SemanaSR) -> dict:
    """La semana como la entiende servicios/semanas_sr.py (para exportarla). El expediente
    se completa con lo que el sistema SABE: estado, resumen de pedidos contado, oficios
    de salida por su número real y el ISR registrado."""
    filas = {lista: await _filas(sesion, semana.id, lista) for lista in MODELOS}
    docs = await _documentos(
        sesion, {p.documento_id for p in filas["pedidos"]} | {semana.documento_id or 0}
    )
    pedidos = []
    for p in filas["pedidos"]:
        datos = dict(p.datos)
        codigo = _codigo_doc(docs.get(p.documento_id))
        if codigo:
            datos["documento_salida"] = codigo
        pedidos.append(datos)
    expediente = dict(semana.expediente or {})
    expediente.update({"id": semana.codigo, "estado": semana.estado,
                       "pedidos": sr.resumen_pedidos(pedidos)})
    isr = docs.get(semana.documento_id)
    if isr is not None:
        entrega = dict(expediente.get("entrega") or {})
        entrega["numero_sgdp"] = _codigo_doc(isr)
        expediente["entrega"] = entrega
    informe = dict(semana.informe or {})
    # Créditos al día (2026-10-10, Edison: «si cambio el cargo en Administración debe cambiar en
    # la semana; todo conectado»): a cada persona del equipo que tiene cuenta se le pone su
    # cargo vigente; lo escrito a mano para quien no tiene cuenta se respeta.
    informe["equipo"] = await equipo_vigente(sesion, informe.get("equipo") or [])
    if not informe.get("foto_portada"):
        # Sin portada elegida, la primera foto horizontal marcada para el informe (antes salía
        # la franja gris con el texto de reserva aunque hubiera fotos).
        marcadas = [f.datos for f in filas["fotos"] if f.datos.get("estado") == "publica" and f.datos.get("seleccion")]
        # (si todas son verticales, la primera: el generador la recorta a 3:2)
        elegida = next((f for f in marcadas if f.get("orientacion") != "vertical"), marcadas[0] if marcadas else None)
        if elegida:
            informe["foto_portada"] = elegida.get("id")
    return {
        "carpeta": semana.carpeta,
        "expediente": expediente,
        "informe": informe,
        "resto": dict(semana.resto or {}),
        "actividades": [dict(a.datos) for a in filas["actividades"]],
        "pedidos": pedidos,
        "fotos": [dict(f.datos) for f in filas["fotos"]],
    }


async def _guardar_estructura(sesion: AsyncSession, semana: SemanaSR, e: dict) -> None:
    """Escribe en las tablas una estructura leída de disco (importar, crear)."""
    semana.expediente = e["expediente"]
    semana.informe = e["informe"]
    semana.resto = e["resto"]
    for lista, modelo in MODELOS.items():
        for orden, datos in enumerate(e[lista], start=1):
            sesion.add(modelo(semana_id=semana.id, codigo=str(datos.get("id") or ""),
                              orden=orden, datos=datos))


def _plantilla_informe() -> dict:
    ruta = raiz_informes_sr() / sr.PLANTILLA / sr.DATOS / sr.INFORME
    try:
        return sr.a_json(sr._leer_yaml(ruta))
    except sr.ErrorSemana:
        return {}


def _carpeta_semana(semana: SemanaSR) -> Path:
    return raiz_informes_sr() / semana.carpeta


# --- Lista, vocabularios, alta e importación ----------------------------------------------


@router.get("/vocabularios")
async def vocabularios(_: Usuario = Depends(usuario_actual)) -> dict:
    try:
        return sr.vocabularios(config.mdd_ruta)
    except sr.ErrorSemana as error:
        raise HTTPException(503, str(error))


@router.get("")
async def listar(
    _: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)
) -> dict:
    """Las semanas registradas en el sistema (con su PDF vigente, leído de `salida/`) y las
    carpetas del expediente que aún no se importaron."""
    raiz = raiz_informes_sr()
    semanas = list((await sesion.execute(select(SemanaSR).order_by(SemanaSR.carpeta.desc()))).scalars())
    conteo = dict((await sesion.execute(
        select(PedidoSR.semana_id, func.count()).group_by(PedidoSR.semana_id))).all())
    actividades = dict((await sesion.execute(
        select(ActividadSR.semana_id, func.count()).group_by(ActividadSR.semana_id))).all())
    registradas = {s.carpeta for s in semanas}
    salida = []
    for s in semanas:
        ficha = informes_sr.semana(raiz / s.carpeta) or {}
        exp = s.expediente or {}
        periodo = exp.get("periodo") or {}
        salida.append({
            "id": s.id, "codigo": s.codigo, "carpeta": s.carpeta, "estado": s.estado,
            "informe": f"ISR-{s.numero:02d}", "tema": exp.get("tema") or s.carpeta.split("_", 2)[-1],
            "inicio": periodo.get("inicio") or "", "fin": periodo.get("fin") or "",
            "provincias": list((exp.get("ambito") or {}).get("provincias") or []),
            "actividades": actividades.get(s.id, 0), "pedidos": conteo.get(s.id, 0),
            "version": str((s.informe or {}).get("version") or ""),
            "estado_informe": str((s.informe or {}).get("estado") or ""),
            "documento_id": s.documento_id,
            "pdfs": ficha.get("pdfs") or [],
        })
    sin_importar = [f["carpeta"] for f in informes_sr.listar(raiz) if f["carpeta"] not in registradas]
    return {"semanas": salida, "sin_importar": sin_importar}


class NuevaSemana(BaseModel):
    tema: str = Field(min_length=3, max_length=200)
    slug: str = Field(min_length=2, max_length=60)
    inicio: date
    fin: date
    provincias: list[str] = Field(default_factory=list)


@router.post("")
async def crear(
    datos: NuevaSemana,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Una semana nueva: el generador copia `_plantilla/` (como `generar.sh --nuevo`) y la
    semana entra al sistema SIN las filas de ejemplo; la prosa de la plantilla queda como
    guía de lo que hay que escribir."""
    if datos.fin < datos.inicio:
        raise HTTPException(422, "La fecha de fin es anterior a la de inicio.")
    numero = ((await sesion.execute(select(func.max(SemanaSR.numero)))).scalar() or 0) + 1
    raiz = raiz_informes_sr()
    registradas = set((await sesion.execute(select(SemanaSR.carpeta))).scalars())
    try:
        carpeta = sr.carpeta_de(datos.inicio.year, datos.inicio.month, numero, datos.slug)
        # Las carpetas en disco que aún no se importaron también cuentan, salvo la que quedó
        # de un intento fallido de ESTA misma semana (mismo nombre), que se reutiliza.
        en_disco = {c.name for c in raiz.glob("*_SR-*") if c.name not in registradas}
        while carpeta not in en_disco and any(f"_SR-{numero:02d}_" in c for c in en_disco):
            numero += 1
            carpeta = sr.carpeta_de(datos.inicio.year, datos.inicio.month, numero, datos.slug)
    except sr.ErrorSemana as error:
        raise HTTPException(422, str(error))
    try:
        # Una carpeta que quedó de un intento fallido (existe en disco y no en la base) se
        # reutiliza: volver a pulsar «Crear» no debe chocar con «Ya existe».
        if not (raiz / carpeta).is_dir():
            await generador_sr.nuevo(raiz, datos.inicio.year, datos.inicio.month, numero,
                                     carpeta.split("_", 2)[2])
        e = sr.vaciar(sr.leer(raiz / carpeta))
    except (generador_sr.ErrorGenerador, sr.ErrorSemana) as error:
        raise HTTPException(500, f"No se pudo crear la carpeta de la semana: {error}")
    codigo = f"SR-{numero:02d}"
    e["expediente"].update({
        "id": codigo, "tema": datos.tema.strip(), "estado": "activo",
        "periodo": {"inicio": datos.inicio.isoformat(), "fin": datos.fin.isoformat()},
        "ambito": {"provincias": datos.provincias, "distritos": []},
        "responsables": [], "oficios": [], "notas": [],
    })
    meta = (e["resto"].setdefault("fotos", {})).setdefault("_meta", {})
    if "/AAAA/" in str(meta.get("banco", "")):
        # La plantilla de fotos.yaml trae «…/AAAA/«AAAA-MM_sr-NN_slug»»; el álbum de la semana
        # es el que `--nuevo` ya escribió en expediente.yaml (banco: ~/Pictures/despacho/…).
        album = f"{datos.inicio.year}/{carpeta.lower()}"
        meta["banco"] = f"{str(meta['banco']).split('/AAAA/')[0]}/{album}"
    inicio, fin = datos.inicio.isoformat(), datos.fin.isoformat()
    # Lo que la semana ya sabe no se vuelve a escribir: días del recorrido, título, periodo
    # y ámbito del informe salen de los datos; el equipo de créditos y la contraportada, de
    # la semana anterior (cambian poco de un mes a otro).
    e["resto"].setdefault("actividades", {})["dias"] = sr.dias_de(inicio, fin, [])
    anterior = (await sesion.execute(select(SemanaSR).order_by(SemanaSR.numero.desc()).limit(1))).scalar_one_or_none()
    previo = (anterior.informe if anterior else None) or {}
    inf = e["informe"]
    region = sr.region_de(str(inf.get("ambito_texto") or ""), str(previo.get("ambito_texto") or ""))
    auto = sr.textos_automaticos(numero, inicio, datos.provincias, fin, region)
    mes_anio = f"{sr.MESES[datos.inicio.month]} de {datos.inicio.year}"
    inf.update(auto)
    inf.update({"fecha_inicio": inicio, "fecha_fin": fin, "fecha_documento": fin,
                "pendientes": [],
                "fuentes": [str(f).replace("«mes» de «AAAA»", mes_anio) for f in inf.get("fuentes") or []]})
    for clave in ("equipo", "retrato_pie", "nota_contraportada"):
        if previo.get(clave):
            inf[clave] = previo[clave]
    # Sin semana anterior, los créditos salen del equipo de la entidad (cuentas con cargo).
    if not inf.get("equipo"):
        inf["equipo"] = await equipo_del_despacho(sesion)
    # El equipo que sale a territorio suele repetirse: se propone el de la semana anterior.
    if anterior and (anterior.expediente or {}).get("responsables"):
        e["expediente"]["responsables"] = anterior.expediente["responsables"]
    inf["equipo"] = [m for m in inf.get("equipo") or [] if not sr.tiene_marcador(m)]
    e["resto"]["_auto"] = auto
    semana = SemanaSR(codigo=codigo, numero=numero, carpeta=carpeta, estado="activo",
                      creado_por=usuario.id)
    sesion.add(semana)
    await sesion.flush()
    await _guardar_estructura(sesion, semana, e)
    await sesion.commit()
    return {"id": semana.id, "carpeta": carpeta}


class Importar(BaseModel):
    carpeta: str


@router.post("/importar")
async def importar(
    datos: Importar,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Trae al sistema una semana hecha antes con los YAML (SR-01, SR-02). No borra ni
    cambia nada en disco: los YAML se reescriben recién al generar desde la web."""
    m = sr.RE_CARPETA.match(datos.carpeta)
    if not m or "/" in datos.carpeta:
        raise HTTPException(422, "Carpeta de semana no válida.")
    existe = (await sesion.execute(select(SemanaSR).where(SemanaSR.carpeta == datos.carpeta))).scalar_one_or_none()
    if existe:
        raise HTTPException(409, "Esa semana ya está en el sistema.")
    try:
        e = sr.leer(raiz_informes_sr() / datos.carpeta)
    except sr.ErrorSemana as error:
        raise HTTPException(422, str(error))
    numero = int(m.group(3))
    exp = e["expediente"]
    # Lo que el sistema escribiría con sus datos: si el informe dice eso mismo, desde ahora
    # se mantiene solo (título, periodo, ámbito); si se escribió distinto, se respeta.
    periodo = exp.get("periodo") or {}
    e["resto"]["_auto"] = sr.textos_automaticos(
        numero, str(periodo.get("inicio") or ""), list((exp.get("ambito") or {}).get("provincias") or []),
        str(periodo.get("fin") or ""), sr.region_de(str(e["informe"].get("ambito_texto") or "")))
    semana = SemanaSR(codigo=f"SR-{numero:02d}", numero=numero, carpeta=datos.carpeta,
                      estado=str(exp.get("estado") or "activo"), creado_por=usuario.id)
    sesion.add(semana)
    try:
        await sesion.flush()
    except Exception:
        await sesion.rollback()
        raise HTTPException(409, f"Ya hay una semana SR-{numero:02d} en el sistema.")
    await _guardar_estructura(sesion, semana, e)
    # Los oficios ya citados en los pedidos (documento_salida: OF-0100-2026-2027) se
    # enlazan si existen en la gestión documental.
    await sesion.flush()
    for p in await _filas(sesion, semana.id, "pedidos"):
        doc = await _doc_por_codigo(sesion, p.datos.get("documento_salida"))
        if doc is not None:
            p.documento_id = doc.id
    await sesion.commit()
    return {"id": semana.id, "actividades": len(e["actividades"]), "pedidos": len(e["pedidos"]),
            "fotos": len(e["fotos"])}


async def _doc_por_codigo(sesion: AsyncSession, codigo) -> Documento | None:
    m = re.match(r"^([A-Z]+)-(\d{1,4})(?:-(\d{4}-\d{4}))?$", str(codigo or "").strip())
    if not m:
        return None
    consulta = select(Documento).where(Documento.serie == m.group(1), Documento.numero == int(m.group(2)))
    if m.group(3):
        consulta = consulta.where(Documento.periodo == m.group(3))
    return (await sesion.execute(consulta.limit(1))).scalar_one_or_none()


@router.get("/origen/{documento_id}")
async def origen(
    documento_id: int,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict | None:
    """Trazabilidad desde la gestión documental: si el documento es el ISR de una semana o el
    oficio que deriva uno de sus pedidos, de qué semana (y pedido) viene."""
    semana = (await sesion.execute(select(SemanaSR).where(SemanaSR.documento_id == documento_id))).scalar_one_or_none()
    pedido = None
    if semana is None:
        pedido = (await sesion.execute(select(PedidoSR).where(PedidoSR.documento_id == documento_id).limit(1))).scalar_one_or_none()
        if pedido is None:
            return None
        semana = await _semana(sesion, pedido.semana_id)
    exp = semana.expediente or {}
    return {"semana_id": semana.id, "codigo": semana.codigo,
            "tema": str(exp.get("tema") or semana.carpeta.split("_", 2)[-1].replace("-", " ")),
            "pedido": pedido.codigo if pedido else None, "es_isr": pedido is None}


# --- Una semana ------------------------------------------------------------------------


async def _datos_pedidos(sesion: AsyncSession, semana: SemanaSR) -> tuple[dict, list[dict], list[dict]]:
    """Lo que pedidos_md necesita de una semana: cabecera, actividades y pedidos con su oficio."""
    actividades = await _filas(sesion, semana.id, "actividades")
    pedidos = await _filas(sesion, semana.id, "pedidos")
    docs = await _documentos(sesion, {p.documento_id for p in pedidos})
    inf = semana.informe or {}
    cabecera = {
        "codigo": semana.codigo,
        "tema": (semana.expediente or {}).get("tema") or semana.carpeta.split("_", 2)[-1],
        "fecha_inicio": str(inf.get("fecha_inicio") or ""),
        "fecha_fin": str(inf.get("fecha_fin") or ""),
    }
    return (
        cabecera,
        [{"codigo": a.codigo, "datos": a.datos or {}} for a in actividades],
        [{"codigo": p.codigo, "datos": p.datos or {},
          "oficio": _codigo_doc(docs[p.documento_id]) if p.documento_id in docs else ""} for p in pedidos],
    )


def _markdown(texto: str, nombre: str) -> Response:
    """Un .md generado al vuelo (no es un archivo de la entidad en disco: no pasa por
    enviar_archivo); sin caché, para que siempre salga lo vigente."""
    return Response(
        texto.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"', "Cache-Control": "no-store"},
    )


def _opciones_md(
    detalles: str | None = Query(None, description="fecha,lugar,entidades,prioridad,responsable,plazo,estado,oficio,actuacion,observaciones"),
    agrupar: str | None = Query(None, description="actividad | entidad | estado | fecha | ninguno"),
    resumen: bool | None = None,
    desde: str | None = None,
    hasta: str | None = None,
    entidad: str | None = None,
    estados: str | None = None,
    prioridades: str | None = None,
) -> pedidos_md.Opciones:
    """Qué entra al .md (2026-10-08): campos, agrupación y filtros por fecha, entidad, estado."""
    return pedidos_md.Opciones.desde_consulta(detalles, agrupar, resumen, desde, hasta, entidad, estados, prioridades)


async def equipo_del_despacho(sesion: AsyncSession) -> list[dict]:
    """[{nombre, rol}] con las cuentas activas de la entidad y su cargo vigente."""
    from app.servicios import cuentas

    filas = (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)).order_by(Usuario.nombre_completo))).scalars().all()
    return [{"nombre": u.nombre_completo, "rol": u.cargo or cuentas.CARGO_POR_ROL.get(u.rol, "")}
            for u in filas if u.rol != "invitado" and u.nombre_completo]


async def equipo_vigente(sesion: AsyncSession, equipo: list) -> list:
    """Los créditos con el cargo vigente de quien tiene cuenta (por nombre, sin tildes)."""
    import unicodedata

    def plano(t: str) -> str:
        t = unicodedata.normalize("NFD", (t or "").lower())
        return " ".join("".join(c for c in t if unicodedata.category(c) != "Mn").split())

    vigentes = {plano(m["nombre"]): m["rol"] for m in await equipo_del_despacho(sesion)}
    salida = []
    for m in equipo:
        if isinstance(m, dict):
            cargo = vigentes.get(plano(str(m.get("nombre") or "")))
            salida.append({**m, "rol": cargo} if cargo else m)
        else:
            salida.append(m)
    return salida


@router.get("/pedidos.md")
async def pedidos_de_todas_md(
    semanas_ids: str | None = Query(None, alias="semanas", description="Ids separados por coma; vacío = todas"),
    op: pedidos_md.Opciones = Depends(_opciones_md),
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Los pedidos de TODAS las semanas (o de las elegidas) en un .md, la más reciente primero."""
    consulta = select(SemanaSR).order_by(SemanaSR.numero.desc())
    ids = [int(x) for x in (semanas_ids or "").split(",") if x.strip().isdigit()]
    if ids:
        consulta = consulta.where(SemanaSR.id.in_(ids))
    semanas = (await sesion.execute(consulta)).scalars().all()
    datos = [await _datos_pedidos(sesion, s) for s in semanas]
    hoy = date.today().isoformat()
    return _markdown(pedidos_md.varias_md(datos, hoy, op), f"Pedidos_Semanas_de_Representacion_{hoy}.md")


@router.get("/{semana_id}/pedidos.md")
async def pedidos_md_semana(
    semana_id: int,
    op: pedidos_md.Opciones = Depends(_opciones_md),
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Los pedidos de una semana en Markdown, para compartirlos (2026-10-05)."""
    semana = await _semana(sesion, semana_id)
    cabecera, actividades, pedidos = await _datos_pedidos(sesion, semana)
    return _markdown(pedidos_md.semana_md(cabecera, actividades, pedidos, op=op), f"Pedidos_{semana.codigo}.md")


@router.get("/{semana_id}")
async def ver(
    semana_id: int,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    semana = await _semana(sesion, semana_id)
    filas = {lista: await _filas(sesion, semana.id, lista) for lista in MODELOS}
    docs = await _documentos(sesion, {p.documento_id for p in filas["pedidos"]} | {semana.documento_id or 0})
    ficha = informes_sr.semana(_carpeta_semana(semana)) or {}
    plantilla = _plantilla_informe()
    return {
        "id": semana.id, "codigo": semana.codigo, "numero": semana.numero, "carpeta": semana.carpeta,
        "estado": semana.estado, "version": semana.version_contenido,
        "expediente": semana.expediente, "informe": semana.informe, "resto": semana.resto,
        "actividades": [{"id": a.id, "codigo": a.codigo, **{"datos": a.datos}} for a in filas["actividades"]],
        "pedidos": [{"id": p.id, "codigo": p.codigo, "datos": p.datos,
                     "documento": _ficha_doc(docs.get(p.documento_id))} for p in filas["pedidos"]],
        "fotos": [{"id": f.id, "codigo": f.codigo, "datos": f.datos} for f in filas["fotos"]],
        "isr": _ficha_doc(docs.get(semana.documento_id)),
        # Sobre el informe tal como se exportaría (con la portada automática), no el guardado.
        "pendientes": sr.pendientes((await estructura(sesion, semana))["informe"], plantilla),
        # El borrador posterior a la aprobada primero: es lo que se está revisando.
        "pdfs": (ficha.get("borrador") or []) + (ficha.get("pdfs") or []),
        "generacion": _estado_trabajo(semana.id),
    }


class CambioSemana(BaseModel):
    expediente: dict | None = None
    informe: dict | None = None
    resto: dict | None = None
    estado: str | None = None
    version_base: int | None = None


@router.put("/{semana_id}")
async def guardar(
    semana_id: int,
    datos: CambioSemana,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Guarda los datos generales y los textos. Cada bloque REEMPLAZA solo las claves que
    trae (lo demás queda como estaba), y con `version_base` vieja responde 409 como el
    editor de documentos: nunca se pisa en silencio lo que otro guardó."""
    semana = await _semana(sesion, semana_id, bloquear=True)
    if datos.version_base is not None and datos.version_base != semana.version_contenido:
        raise HTTPException(409, {"codigo": "semana_modificada", "mensaje": (
            "Otra persona guardó esta semana después de que usted la abrió. Recargue para ver "
            "sus cambios; los suyos de esta pestaña no se guardaron.")})
    if datos.expediente:
        semana.expediente = {**(semana.expediente or {}), **datos.expediente}
    if datos.informe:
        semana.informe = {**(semana.informe or {}), **datos.informe}
    if datos.resto:
        resto = dict(semana.resto or {})
        for archivo, valor in datos.resto.items():
            if archivo in sr.LISTAS and isinstance(valor, dict):
                resto[archivo] = {**(resto.get(archivo) or {}), **valor}
        semana.resto = resto
    if datos.estado:
        if datos.estado not in sr.ESTADOS_SEMANA:
            raise HTTPException(422, f"Estado no válido: {datos.estado}")
        semana.estado = datos.estado
    # El periodo y las provincias se escriben una vez: el expediente manda y el informe lo
    # sigue (fechas, y título/periodo/ámbito mientras nadie los haya cambiado a mano).
    exp = semana.expediente or {}
    periodo = exp.get("periodo") or {}
    if periodo.get("inicio"):
        informe = dict(semana.informe or {})
        informe["fecha_inicio"], informe["fecha_fin"] = periodo.get("inicio"), periodo.get("fin")
        resto = dict(semana.resto or {})
        previos = resto.get("_auto") or {}
        auto = sr.textos_automaticos(
            semana.numero, str(periodo.get("inicio")), list((exp.get("ambito") or {}).get("provincias") or []),
            str(periodo.get("fin") or ""), sr.region_de(str(informe.get("ambito_texto") or ""), str(previos.get("ambito_texto") or "")))
        tocados = set((datos.informe or {}).keys())
        for clave, valor in auto.items():
            if clave not in tocados and valor and sr.es_automatico(informe.get(clave), [previos.get(clave)]):
                informe[clave] = valor
        resto["_auto"] = auto
        semana.resto = resto
        semana.informe = informe
    # La versión cuenta los cambios de los TEXTOS del informe (lo que dos personas pueden
    # estar escribiendo a la vez); guardar los datos generales no deja vieja una pestaña
    # que redacta la crónica.
    if datos.informe:
        semana.version_contenido += 1
        # Una cita insertada en los textos (autocompletado «@», 2026-10-06) que ya no aparece
        # en ellos deja de ser relación de la semana.
        from app.servicios import relaciones

        filas = [f.datos for lista in ("actividades", "pedidos") for f in await _filas(sesion, semana.id, lista)]
        await relaciones.depurar_textos(sesion, f"sr:{semana.id}", relaciones.texto_de_valores([semana.informe, filas]))
    await sesion.commit()
    return {"ok": True, "version": semana.version_contenido}


# --- Actividades, pedidos y fotos ---------------------------------------------------------


class Fila(BaseModel):
    datos: dict


def _lista(lista: str) -> str:
    if lista not in MODELOS:
        raise HTTPException(404, "Lista desconocida.")
    return lista


async def _fila(sesion: AsyncSession, semana_id: int, lista: str, codigo: str):
    modelo = MODELOS[lista]
    fila = (await sesion.execute(
        select(modelo).where(modelo.semana_id == semana_id, modelo.codigo == codigo)
    )).scalar_one_or_none()
    if fila is None:
        raise HTTPException(404, f"{codigo} no existe en esta semana.")
    return fila


async def _ordenar_dia(sesion: AsyncSession, semana_id: int, fecha) -> None:
    """`orden_dia` sale de la hora de inicio (las sin hora, al final, por código): nadie
    tiene que numerar las actividades a mano."""
    del_dia = [a for a in await _filas(sesion, semana_id, "actividades") if a.datos.get("fecha") == fecha]
    del_dia.sort(key=lambda a: (str(a.datos.get("hora_inicio") or "99:99"), a.codigo))
    for i, a in enumerate(del_dia, start=1):
        if a.datos.get("orden_dia") != i:
            a.datos = {**a.datos, "orden_dia": i}


async def _tocar(sesion: AsyncSession, semana_id: int) -> None:
    semana = await _semana(sesion, semana_id)
    semana.actualizado_en = datetime.now().astimezone()


async def agregar(
    semana_id: int,
    lista: str,
    fila: Fila,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    lista = _lista(lista)
    await _semana(sesion, semana_id, bloquear=True)
    existentes = await _filas(sesion, semana_id, lista)
    codigo = sr.siguiente_codigo(lista, [f.codigo for f in existentes])
    datos = {"id": codigo, **{k: v for k, v in fila.datos.items() if k != "id"}}
    nueva = MODELOS[lista](semana_id=semana_id, codigo=codigo,
                           orden=max((f.orden for f in existentes), default=0) + 1, datos=datos)
    sesion.add(nueva)
    if lista == "pedidos":
        await _enlazar_pedido(sesion, semana_id, datos.get("actividad"), codigo)
    if lista == "actividades":
        await sesion.flush()
        await _ordenar_dia(sesion, semana_id, datos.get("fecha"))
    if lista == "fotos" and not datos.get("pie") and datos.get("actividad"):
        datos["pie"] = await _pie_de(sesion, semana_id, datos.get("actividad"))
        nueva.datos = datos
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"codigo": codigo, "datos": datos}


async def _enlazar_pedido(sesion, semana_id, actividad: str | None, pedido: str, quitar: str | None = None):
    """La actividad lista sus pedidos (`actividades.yaml → pedidos`): se mantiene sola."""
    for a in await _filas(sesion, semana_id, "actividades"):
        pedidos = [p for p in (a.datos.get("pedidos") or []) if p != (quitar or pedido)]
        if a.codigo == actividad:
            pedidos.append(pedido)
        if pedidos != (a.datos.get("pedidos") or []):
            a.datos = {**a.datos, "pedidos": sorted(set(pedidos))}


async def cambiar(
    semana_id: int,
    lista: str,
    codigo: str,
    fila: Fila,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    lista = _lista(lista)
    actual = await _fila(sesion, semana_id, lista, codigo)
    datos = {**fila.datos, "id": codigo}
    if lista == "pedidos" and datos.get("actividad") != actual.datos.get("actividad"):
        await _enlazar_pedido(sesion, semana_id, datos.get("actividad"), codigo, quitar=codigo)
    if lista == "fotos":
        _invalidar_foto(await _semana(sesion, semana_id), actual.datos, datos)
    fecha_antes = actual.datos.get("fecha")
    actual.datos = datos
    if lista == "actividades":
        await sesion.flush()
        for fecha in {fecha_antes, datos.get("fecha")}:
            await _ordenar_dia(sesion, semana_id, fecha)
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"codigo": codigo, "datos": datos}


async def quitar(
    semana_id: int,
    lista: str,
    codigo: str,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    lista = _lista(lista)
    fila = await _fila(sesion, semana_id, lista, codigo)
    if lista == "pedidos" and fila.documento_id:
        raise HTTPException(409, "El pedido ya se derivó con un oficio: no se quita, se cierra.")
    if lista == "actividades":
        con_pedidos = [p.codigo for p in await _filas(sesion, semana_id, "pedidos")
                       if p.datos.get("actividad") == codigo]
        if con_pedidos:
            raise HTTPException(409, f"La actividad tiene pedidos ({', '.join(con_pedidos)}): "
                                     "muévalos a otra actividad o quítelos primero.")
    if lista == "pedidos":
        await _enlazar_pedido(sesion, semana_id, None, codigo, quitar=codigo)
    # Una foto quitada del registro conserva su original en el banco.
    await sesion.delete(fila)
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"ok": True}


# --- Derivar un pedido ------------------------------------------------------------------


class Vincular(BaseModel):
    documento_id: int | None = None
    # O el código con que se conoce: OF-0100, OF-0100-2026-2027.
    codigo: str | None = None


@router.post("/{semana_id}/pedidos/{codigo}/derivar")
async def derivar(
    semana_id: int,
    codigo: str,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Crea el oficio BORRADOR que deriva el pedido (redactado en la gestión documental,
    con su número cuando se genere) y lo deja enlazado: el pedido pasa a «derivado»."""
    from app.api.documentos import NuevoDocumento, crear as crear_documento

    semana = await _semana(sesion, semana_id)
    pedido = await _fila(sesion, semana_id, "pedidos", codigo)
    if pedido.documento_id:
        raise HTTPException(409, "El pedido ya tiene su oficio.")
    nuevo = await crear_documento(NuevoDocumento(tipo="oficio"), usuario=usuario, sesion=sesion)
    doc = (await sesion.execute(select(Documento).where(Documento.id == nuevo["id"]))).scalar_one()
    d = pedido.datos
    texto = str(d.get("pedido") or "").strip().rstrip(".")
    actividad = next((a.datos for a in await _filas(sesion, semana_id, "actividades")
                      if a.codigo == d.get("actividad")), {})
    periodo = (semana.expediente or {}).get("periodo") or {}
    cuando = sr.texto_periodo(str(periodo.get("inicio") or ""), str(periodo.get("fin") or ""))
    titulo = str(actividad.get("titulo") or "").strip()
    distrito = str(actividad.get("distrito") or "").strip()
    # El borrador ya sale redactado como oficio de la entidad (fórmulas de la casa,
    # docs/redaccion-administrativa.md §11), sin los códigos internos P-NNN/SR-NN, que a la
    # entidad no le dicen nada; se revisa y se completa en el editor antes de numerar.
    donde = (f", en el marco de la actividad «{titulo}»" + (f" (distrito de {distrito})" if distrito else "")) if titulo else ""
    parrafos = [
        "Es grato dirigirme a usted para saludarlo cordialmente y, en ejercicio de la función de "
        f"representación, hacer de su conocimiento que durante la Semana de Representación del {cuando}"
        f"{donde}, se me planteó el siguiente pedido: {texto}.",
        "En ese sentido, solicito a su despacho disponer la atención del referido pedido e informarme "
        "sobre las acciones adoptadas.",
        "Sin otro particular, hago propicia la oportunidad para expresarle las muestras de mi "
        "especial consideración.",
    ]
    # La actuación propuesta es una nota INTERNA de la entidad («pedir a la UGEL…»): no va en
    # el oficio, va como nota del documento para quien lo termine de redactar.
    accion = str(d.get("actuacion") or "").strip()
    if accion:
        svc_com.crear(sesion, doc.id, usuario, f"Actuación propuesta para el pedido {codigo} de la "
                      f"{semana.codigo}: {accion}", tipo="nota")
    campos = {
        **doc.campos,
        "asunto": f"Solicito atención al pedido recogido en la Semana de Representación: {texto[:150]}",
        "sumilla": f"Pedido {codigo} {semana.codigo}",
    }
    # El destinatario: la primera entidad competente, si está en el directorio.
    for entidad in d.get("entidades") or []:
        inst = (await sesion.execute(select(Institucion).where(
            Institucion.activo.is_(True),
            (func.lower(Institucion.siglas) == str(entidad).lower()) | (func.lower(Institucion.nombre) == str(entidad).lower()),
        ).limit(1))).scalar_one_or_none()
        if inst is not None:
            campos["destinatario_institucion"] = inst.nombre
            break
    doc.campos = campos
    doc.cuerpo = {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in parrafos
    ]}
    await eventos_sistema.emitir_seguro(sesion, "sr.pedido_derivado", f"sr:{semana_id}",
                                        {"semana": semana_id, "codigo": codigo, "pedido": str(pedido.datos.get("pedido") or "")[:200], "numero": f"doc:{doc.id}"},
                                        clave=f"sr:{semana_id}:pedido:{codigo}:derivado:{doc.id}", usuario=usuario)
    bitacora.registrar(sesion, doc.id, usuario, "derivado_de_pedido",
                       f"Creado para derivar el pedido {codigo} de la {semana.codigo}")
    pedido.documento_id = doc.id
    pedido.datos = {**pedido.datos, "estado": "derivado"}
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"documento_id": doc.id}


@router.post("/{semana_id}/pedidos/{codigo}/vincular")
async def vincular(
    semana_id: int,
    codigo: str,
    datos: Vincular,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Enlaza un oficio que YA existe (emitido antes de que el pedido estuviera aquí)."""
    pedido = await _fila(sesion, semana_id, "pedidos", codigo)
    if datos.documento_id:
        doc = (await sesion.execute(select(Documento).where(Documento.id == datos.documento_id))).scalar_one_or_none()
    else:
        doc = await _doc_por_codigo(sesion, (datos.codigo or "").strip().upper())
    if doc is None:
        raise HTTPException(404, "No hay un documento con ese código (p. ej. OF-0100).")
    pedido.documento_id = doc.id
    estado = pedido.datos.get("estado")
    pedido.datos = {**pedido.datos, "estado": "derivado" if estado == "registrado" else estado}
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"ok": True, "documento": _ficha_doc(doc)}


@router.delete("/{semana_id}/pedidos/{codigo}/vincular")
async def desvincular(
    semana_id: int,
    codigo: str,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    pedido = await _fila(sesion, semana_id, "pedidos", codigo)
    pedido.documento_id = None
    pedido.datos = {**pedido.datos, "documento_salida": None,
                    "estado": "registrado" if pedido.datos.get("estado") == "derivado" else pedido.datos.get("estado")}
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"ok": True}


# --- Fotos -------------------------------------------------------------------------------


def _banco(semana: SemanaSR) -> Path:
    banco = ((semana.resto or {}).get("fotos") or {}).get("_meta", {}).get("banco")
    if not banco:
        raise HTTPException(409, "La semana no tiene banco de fotos definido.")
    return Path(str(banco)).expanduser()


async def _pie_de(sesion: AsyncSession, semana_id: int, actividad: str | None) -> str:
    """Pie propuesto para una foto: el título y el lugar de su actividad («Visita de trabajo al
    Hospital …, Huanta»). Se corrige en la foto si hace falta; no nombra a personas."""
    act = next((a.datos for a in await _filas(sesion, semana_id, "actividades") if a.codigo == actividad), {})
    titulo = str(act.get("titulo") or "").strip()
    lugar = str(act.get("localidad") or act.get("distrito") or "").strip()
    return f"{titulo}, {lugar}" if titulo and lugar and lugar.lower() not in titulo.lower() else titulo


def _medidas(ruta: Path) -> tuple[int, int] | None:
    """Ancho y alto ya girados según EXIF (ImageMagick: %w %h tras -auto-orient)."""
    try:
        r = subprocess.run(["magick", str(ruta) + "[0]", "-auto-orient", "-format", "%w %h", "info:"],
                           capture_output=True, text=True, timeout=30)
        ancho, alto = (int(x) for x in r.stdout.split())
        return ancho, alto
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def _invalidar_foto(semana: SemanaSR, antes: dict, despues: dict) -> None:
    """El generador rehace una foto preparada (`fotos/seleccion/`) solo si falta: si cambia
    el recorte o la actividad (que va en el nombre), la de antes se borra para que el PDF
    muestre lo elegido en la web y no el recorte viejo."""
    if all(antes.get(k) == despues.get(k) for k in ("recorte", "actividad", "origen")):
        return
    sel = _carpeta_semana(semana) / "fotos" / "seleccion"
    codigo = str(antes.get("id") or "")
    if not sel.is_dir() or not codigo:
        return
    for f in sel.glob(f"*_{codigo}*.jpg"):
        if re.match(rf"^[A-Za-z0-9-]+_{re.escape(codigo)}(_[gh])?\.jpg$", f.name):
            f.unlink(missing_ok=True)
    marca = sel / ".portada_id"
    if marca.is_file() and marca.read_text().strip() == codigo:
        marca.unlink(missing_ok=True)


@router.post("/{semana_id}/fotos-subir")
async def subir_fotos(
    semana_id: int,
    archivos: list[UploadFile] = File(...),
    actividad: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Las fotos van al BANCO de la semana (el original nunca entra a la base ni al
    expediente), en la subcarpeta de su actividad, y quedan «por revisar». Desde
    2026-10-06 quedan también en la Fototeca, vinculadas a la semana; si eso falla, la
    subida al banco sigue valiendo (el informe lee del banco)."""
    semana = await _semana(sesion, semana_id, bloquear=True)
    banco = _banco(semana)
    sub = re.sub(r"[^A-Za-z0-9-]", "", actividad) or "sin-actividad"
    destino = banco / sub
    destino.mkdir(parents=True, exist_ok=True)
    existentes = await _filas(sesion, semana_id, "fotos")
    codigos = [f.codigo for f in existentes]
    pie = await _pie_de(sesion, semana_id, actividad) if actividad else ""
    orden = max((f.orden for f in existentes), default=0)
    nuevas = []
    for archivo in archivos:
        nombre = Path(archivo.filename or "foto.jpg").name
        if Path(nombre).suffix.lower() not in EXTENSIONES_FOTO:
            continue
        contenido = await archivo.read()
        if len(contenido) > MAX_FOTO:
            raise HTTPException(413, f"{nombre} pesa más de {MAX_FOTO // 1024 // 1024} MB.")
        ruta = destino / nombre
        n = 1
        while ruta.exists():
            ruta = destino / f"{Path(nombre).stem}-{n}{Path(nombre).suffix}"
            n += 1
        ruta.write_bytes(contenido)
        medidas = _medidas(ruta)
        codigo = sr.siguiente_codigo("fotos", codigos)
        codigos.append(codigo)
        orden += 1
        datos = {"id": codigo, "origen": f"{sub}/{ruta.name}", "actividad": actividad or None,
                 "estado": "revisar", "tipo": "actividad", "seleccion": False, "pie": pie,
                 "observaciones": None}
        if medidas:
            datos.update({"ancho": medidas[0], "alto": medidas[1],
                          "orientacion": "horizontal" if medidas[0] >= medidas[1] else "vertical"})
        fototeca_id = await _a_la_fototeca(sesion, semana, ruta, codigo, pie, usuario.id)
        if fototeca_id:
            datos["fototeca_id"] = fototeca_id
        sesion.add(FotoSR(semana_id=semana_id, codigo=codigo, orden=orden, datos=datos))
        nuevas.append(codigo)
    if not nuevas:
        raise HTTPException(422, "No llegó ninguna foto (JPG, PNG, WEBP o HEIC).")
    # Como cualquier cambio de la semana: el informe generado deja de estar al
    # día (antes las fotos subidas no lo marcaban; 2026-10-06).
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"fotos": nuevas}


async def _a_la_fototeca(sesion: AsyncSession, semana: SemanaSR, ruta: Path, codigo: str, pie: str,
                         usuario_id: int | None) -> int | None:
    """Copia la foto del banco a la Fototeca (en un punto de guardado: un fallo aquí no
    deshace la subida al banco). Devuelve su id en la Fototeca (la fila lo guarda)."""
    try:
        async with sesion.begin_nested():
            foto, _ = await fototeca.registrar(
                sesion, ruta, ruta.name, usuario_id,
                vinculo={"tipo": "semana", "id": semana.id, "codigo": codigo, "etiqueta": semana.codigo},
                datos={"descripcion": pie, "etiquetas": ["Semana de representación"]},
            )
    except Exception as e:  # noqa: BLE001 — la Fototeca es un añadido; el banco manda
        log.warning("La foto %s de %s no pasó a la Fototeca: %s", codigo, semana.codigo, e)
        return None
    return foto.id


class DesdeFototeca(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    actividad: str = ""


@router.post("/{semana_id}/fotos-desde-fototeca")
async def fotos_desde_fototeca(
    semana_id: int,
    pedido: DesdeFototeca,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Agrega al registro de la semana fotos que ya están en la Fototeca: cada una se
    copia al banco (con sus ajustes aplicados, si los tiene: el informe lee del banco),
    con el pie y el estado de la Fototeca, y la foto queda vinculada a la semana."""
    from app.modelos import Foto

    semana = await _semana(sesion, semana_id, bloquear=True)
    banco = _banco(semana)
    sub = re.sub(r"[^A-Za-z0-9-]", "", pedido.actividad) or "sin-actividad"
    destino = banco / sub
    destino.mkdir(parents=True, exist_ok=True)
    existentes = await _filas(sesion, semana_id, "fotos")
    codigos = [f.codigo for f in existentes]
    ya = {(f.datos or {}).get("fototeca_id") for f in existentes}
    pie_actividad = await _pie_de(sesion, semana_id, pedido.actividad) if pedido.actividad else ""
    orden = max((f.orden for f in existentes), default=0)
    nuevas, repetidas = [], []
    fotos = (await sesion.execute(
        # Solo fotos: un video no entra al banco del informe (el generador ISR lo abre con Pillow;
        # auditoría 2026-10-10, MD-02).
        select(Foto).where(Foto.id.in_(pedido.ids), Foto.eliminada_en.is_(None), Foto.medio == "foto")
        .order_by(Foto.tomada_en)
    )).scalars().all()
    for foto in fotos:
        if foto.id in ya:
            repetidas.append(foto.id)
            continue
        try:
            if fototeca.normalizar_ajustes(foto.ajustes):
                fuente = await asyncio.to_thread(fototeca.exportar, foto.archivo, foto.sha256, foto.ajustes, "original")
            else:
                fuente = fototeca.ruta_original(foto.archivo)
        except fototeca.ErrorFototeca as e:
            raise HTTPException(422, f"Foto {foto.id}: {e}")
        nombre = Path(foto.nombre_original or fuente.name).stem + fuente.suffix
        ruta = destino / nombre
        n = 1
        while ruta.exists():
            ruta = destino / f"{Path(nombre).stem}-{n}{fuente.suffix}"
            n += 1
        await asyncio.to_thread(shutil.copy2, fuente, ruta)
        medidas = _medidas(ruta)
        codigo = sr.siguiente_codigo("fotos", codigos)
        codigos.append(codigo)
        orden += 1
        datos = {"id": codigo, "origen": f"{sub}/{ruta.name}", "actividad": pedido.actividad or None,
                 "estado": fototeca.estado_hacia_semana(foto.estado), "tipo": "actividad", "seleccion": False,
                 "pie": foto.descripcion or pie_actividad, "observaciones": None, "fototeca_id": foto.id}
        if medidas:
            datos.update({"ancho": medidas[0], "alto": medidas[1],
                          "orientacion": "horizontal" if medidas[0] >= medidas[1] else "vertical"})
        sesion.add(FotoSR(semana_id=semana_id, codigo=codigo, orden=orden, datos=datos))
        foto.vinculos = fototeca.con_vinculo(foto.vinculos, {"tipo": "semana", "id": semana.id, "codigo": codigo,
                                                             "etiqueta": semana.codigo})
        nuevas.append(codigo)
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"fotos": nuevas, "repetidas": repetidas}


# --- Fotos en lote (2026-10-06) ------------------------------------------------------------
# Una semana trae 180–230 fotos (SR-01, SR-02): revisarlas una por una era el cuello de
# botella. El lote cambia varias a la vez en UNA transacción, sin pisar las claves que no
# viajan, y el orden fija qué foto abre cada actividad en el informe (el generador las toma
# en el orden de fotos.yaml: la primera de cada actividad va en su ficha).

# Claves que el lote puede cambiar; `pedidos` e `instituciones` relacionan la foto con lo que
# muestra (las exporta fotos.yaml; el generador no las lee).
CLAVES_LOTE = {"actividad", "estado", "seleccion", "pie", "tipo", "recorte", "observaciones",
               "pedidos", "instituciones"}


def aplicar_lote(datos: dict, cambios: dict, pie_actividad: str | None = None, sumar: dict | None = None) -> dict:
    """Los datos de una foto tras un cambio en lote (pura: la prueban los tests).

    `sumar` agrega a las listas `pedidos` / `instituciones` sin quitar lo que cada foto ya tenía.

    - Elegir para el informe una foto «por revisar» la hace pública (como la estrella).
    - Una foto reservada no puede ir al informe: marcarla reservada la saca de él.
    - `pie_actividad` (el pie propuesto por su actividad) solo llena pies vacíos."""
    nuevos = {**datos, **{k: v for k, v in cambios.items() if k in CLAVES_LOTE}}
    if cambios.get("seleccion") is True and nuevos.get("estado") == "revisar":
        nuevos["estado"] = "publica"
    if nuevos.get("estado") == "reservada":
        nuevos["seleccion"] = False
    for clave in ("pedidos", "instituciones"):
        if clave in cambios:
            nuevos[clave] = sorted({str(x).strip() for x in (cambios[clave] or []) if str(x).strip()})
        if (sumar or {}).get(clave):
            previas = nuevos.get(clave) or []
            nuevos[clave] = sorted({str(x).strip() for x in [*previas, *sumar[clave]] if str(x).strip()})
    if pie_actividad and not str(nuevos.get("pie") or "").strip():
        nuevos["pie"] = pie_actividad
    return nuevos


def nuevo_orden(actuales: list[str], primero: list[str]) -> list[str]:
    """`primero` (en ese orden) delante y el resto en el orden que tenía (pura)."""
    vistos = [c for c in dict.fromkeys(primero) if c in set(actuales)]
    return vistos + [c for c in actuales if c not in set(vistos)]


class LoteFotos(BaseModel):
    codigos: list[str] = Field(min_length=1, max_length=1000)
    cambios: dict = Field(default_factory=dict)
    # Listas que se SUMAN a las de cada foto (relacionar varias sin borrar lo que tenían).
    sumar: dict = Field(default_factory=dict)
    # Llenar los pies vacíos con el de su actividad.
    pie_de_actividad: bool = False
    # Pasar las fotos a la Fototeca (o sumarles el vínculo con la semana si ya estaban).
    fototeca: bool = False


@router.post("/{semana_id}/fotos-lote")
async def fotos_lote(
    semana_id: int,
    lote: LoteFotos,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    semana = await _semana(sesion, semana_id, bloquear=True)
    cambios = {k: v for k, v in lote.cambios.items() if k in CLAVES_LOTE}
    if "estado" in cambios and cambios["estado"] not in sr.ESTADOS_FOTO:
        raise HTTPException(422, f"Estado de foto no válido: {cambios['estado']}.")
    if "tipo" in cambios and cambios["tipo"] not in sr.TIPOS_FOTO:
        raise HTTPException(422, f"Tipo de foto no válido: {cambios['tipo']}.")
    actividades = {a.codigo: a for a in await _filas(sesion, semana_id, "actividades")}
    if cambios.get("actividad") and cambios["actividad"] not in actividades:
        raise HTTPException(422, f"La actividad {cambios['actividad']} no existe en esta semana.")
    pies: dict[str, str] = {}
    fotos = {f.codigo: f for f in await _filas(sesion, semana_id, "fotos")}
    faltan = [c for c in lote.codigos if c not in fotos]
    if faltan:
        raise HTTPException(404, f"No existen en esta semana: {', '.join(faltan[:10])}.")
    resumen = {"cambiadas": 0, "fototeca": {"nuevas": 0, "ya_estaban": 0, "sin_original": 0}}
    banco = _banco(semana) if lote.fototeca else None
    for codigo in dict.fromkeys(lote.codigos):
        fila = fotos[codigo]
        pie = None
        if lote.pie_de_actividad:
            act = str((cambios.get("actividad") or fila.datos.get("actividad")) or "")
            if act and act not in pies:
                pies[act] = await _pie_de(sesion, semana_id, act)
            pie = pies.get(act)
        datos = aplicar_lote(dict(fila.datos), cambios, pie, lote.sumar)
        if banco is not None:
            datos = await _vincular_fototeca(sesion, semana, banco, datos, usuario.id, resumen["fototeca"])
        if datos != fila.datos:
            _invalidar_foto(semana, fila.datos, datos)
            fila.datos = datos
            resumen["cambiadas"] += 1
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return resumen


async def _vincular_fototeca(sesion: AsyncSession, semana: SemanaSR, banco: Path, datos: dict,
                             usuario_id: int, cuenta: dict) -> dict:
    """La foto queda en la Fototeca con el vínculo a la semana (idempotente: por la huella)
    y la fila guarda `fototeca_id`. Lo corregido en la Fototeca no se pisa."""
    from app.modelos import Foto

    vinculo = {"tipo": "semana", "id": semana.id, "codigo": datos.get("id"), "etiqueta": semana.codigo,
               "seleccion": bool(datos.get("seleccion")) or None}
    if datos.get("fototeca_id"):
        foto = await sesion.get(Foto, int(datos["fototeca_id"]))
        if foto is not None:
            foto.vinculos = fototeca.con_vinculo(foto.vinculos, vinculo)
            cuenta["ya_estaban"] += 1
            return datos
    ruta = (banco / str(datos.get("origen") or "")).resolve()
    if not datos.get("origen") or not ruta.is_file():
        cuenta["sin_original"] += 1
        return datos
    try:
        async with sesion.begin_nested():
            foto, nueva = await fototeca.registrar(
                sesion, ruta, ruta.name, usuario_id, vinculo=vinculo,
                datos={"descripcion": str(datos.get("pie") or ""), "estado": fototeca.estado_desde_semana(datos.get("estado")),
                       "etiquetas": ["Semana de representación"]},
            )
    except Exception as e:  # noqa: BLE001 — la Fototeca es un añadido; el registro de la semana manda
        log.warning("La foto %s de %s no pasó a la Fototeca: %s", datos.get("id"), semana.codigo, e)
        cuenta["sin_original"] += 1
        return datos
    cuenta["nuevas" if nueva else "ya_estaban"] += 1
    return {**datos, "fototeca_id": foto.id}


class OrdenFotos(BaseModel):
    codigos: list[str] = Field(min_length=1, max_length=1000)


@router.post("/{semana_id}/fotos-ordenar")
async def fotos_ordenar(
    semana_id: int,
    orden: OrdenFotos,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Pone `codigos` delante, en ese orden (el orden del informe), y el resto detrás."""
    await _semana(sesion, semana_id, bloquear=True)
    fotos = await _filas(sesion, semana_id, "fotos")
    por_codigo = {f.codigo: f for f in fotos}
    for i, codigo in enumerate(nuevo_orden([f.codigo for f in fotos], orden.codigos), start=1):
        if por_codigo[codigo].orden != i:
            por_codigo[codigo].orden = i
    await _tocar(sesion, semana_id)
    await sesion.commit()
    return {"ok": True}


async def _reducida(sesion: AsyncSession, semana_id: int, codigo: str, carpeta: str, lado: int,
                    calidad: int) -> Path:
    """Una copia reducida del original (girada según EXIF), en `fotos/<carpeta>/` del
    expediente (fuera de git): no se manda al celular el original de 5 MB."""
    semana = await _semana(sesion, semana_id)
    foto = await _fila(sesion, semana_id, "fotos", codigo)
    banco = _banco(semana).resolve()
    original = (banco / str(foto.datos.get("origen") or "")).resolve()
    if banco not in original.parents or not original.is_file():
        raise HTTPException(404, "El original no está en el banco.")
    cache = _carpeta_semana(semana) / "fotos" / carpeta / f"{codigo}.jpg"
    if not cache.is_file() or cache.stat().st_mtime < original.stat().st_mtime:
        cache.parent.mkdir(parents=True, exist_ok=True)
        r = await asyncio.to_thread(subprocess.run, [
            "magick", str(original) + "[0]", "-auto-orient", "-thumbnail", f"{lado}x{lado}>",
            "-quality", str(calidad), str(cache)], capture_output=True, timeout=60)
        if r.returncode != 0 or not cache.is_file():
            raise HTTPException(500, "No se pudo preparar la imagen.")
    return cache


@router.get("/{semana_id}/fotos/{codigo}/miniatura")
async def miniatura(
    semana_id: int,
    codigo: str,
    peticion: Request,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Miniatura de 480 px para la cuadrícula."""
    cache = await _reducida(sesion, semana_id, codigo, MINIATURA, 480, 78)
    return enviar_archivo(cache, f"{codigo}.jpg", media_type="image/jpeg", peticion=peticion)


@router.get("/{semana_id}/fotos/{codigo}/vista")
async def vista(
    semana_id: int,
    codigo: str,
    peticion: Request,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Vista de 1600 px para el visor de la semana (2026-10-06)."""
    cache = await _reducida(sesion, semana_id, codigo, "vistas", 1600, 82)
    return enviar_archivo(cache, f"{codigo}.jpg", media_type="image/jpeg", peticion=peticion)


# --- Generar el informe y registrarlo --------------------------------------------------


class Generar(BaseModel):
    edicion: str = "publica"
    # Las dos variantes de la edición pública: revista (2) y lectura en el celular (1).
    columnas: list[int] = Field(default_factory=lambda: [2, 1])
    # Aprobar: fija la versión, el estado «aprobado» e incorpora el PDF al ISR.
    aprobar: bool = False
    version: str | None = None
    # Borrador en una versión NUEVA (0.2 → 0.3): los borradores anteriores quedan en salida/.
    nueva_version: bool = False


def _siguiente_menor(version: str) -> str:
    try:
        mayor, menor = (int(x) for x in str(version).split("."))
    except ValueError:
        return "0.1"
    return f"{mayor}.{menor + 1}"


def _estado_trabajo(semana_id: int) -> dict | None:
    t = TRABAJOS.get(semana_id)
    if not t:
        return None
    return {k: v for k, v in t.items() if k != "tarea"}


@router.get("/{semana_id}/generacion")
async def generacion(semana_id: int, _: Usuario = Depends(usuario_actual)) -> dict:
    return _estado_trabajo(semana_id) or {"estado": "sin_generar"}


@router.post("/{semana_id}/generar")
async def generar(
    semana_id: int,
    datos: Generar,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Valida, exporta los YAML al expediente y lanza el generador EN SEGUNDO PLANO (tarda
    minutos); la web consulta `/generacion` hasta que termina."""
    if datos.edicion not in ("publica", "interna") or not set(datos.columnas) <= {1, 2} or not datos.columnas:
        raise HTTPException(422, "Edición o columnas no válidas.")
    if datos.aprobar and usuario.rol not in APRUEBAN:
        raise HTTPException(403, "Aprobar el informe corresponde al diputado o al administrador.")
    if datos.aprobar and datos.edicion != "publica":
        raise HTTPException(422, "Se aprueba la edición pública: es la que se entrega.")
    semana = await _semana(sesion, semana_id, bloquear=True)
    if TRABAJOS.get(semana_id, {}).get("estado") == "en_curso":
        raise HTTPException(409, "Ya se está generando el informe de esta semana.")
    try:
        cfg = sr.config_generador(config.mdd_ruta)
    except sr.ErrorSemana as error:
        raise HTTPException(503, str(error))
    if datos.aprobar and not semana.documento_id:
        # El ISR toma el número de su semana y la serie no admite huecos: se comprueba
        # ANTES de generar (minutos) y no al registrar, cuando ya no hay vuelta atrás.
        await _exigir_correlativo(sesion, semana.numero)
    if datos.aprobar:
        version = (datos.version or "").strip()
        if not re.match(r"^\d+\.\d+$", version) or int(version.split(".")[0]) < 1:
            raise HTTPException(422, "La versión aprobada es 1.0 o mayor (p. ej. 1.0, 1.1).")
        semana.informe = {**(semana.informe or {}), "version": version, "estado": "aprobado",
                          "fecha_documento": date.today().isoformat()}
        semana.expediente = {**(semana.expediente or {}), "informe_aprobado": {
            "version": version, "fecha": date.today().isoformat(),
            "archivo": f"salida/ISR-{semana.numero:02d}_{semana.carpeta[:7]}_v{version}.pdf"}}
        semana.estado = "hecho"
    else:
        # Un borrador nunca se escribe con el nombre de una versión aprobada: tras aprobar,
        # «Generar borrador» abre la siguiente (1.0 → 1.1-borrador) y el PDF aprobado de
        # salida/ queda intacto, igual que el registrado en la gestión documental.
        inf = dict(semana.informe or {})
        version = str(inf.get("version") or "0.1")
        if datos.nueva_version or inf.get("estado") in ("aprobado", "hecho", "publicado"):
            version = _siguiente_menor(version)
        semana.informe = {**inf, "version": version, "estado": "borrador" if datos.edicion == "publica" else inf.get("estado", "borrador")}
        if datos.edicion == "interna" and inf.get("estado") in ("aprobado", "hecho", "publicado"):
            semana.informe = {**inf, "version": inf.get("version"), "estado": inf.get("estado")}
    e = await estructura(sesion, semana)
    errores = sr.validar(e, cfg)
    if errores:
        await sesion.rollback()
        raise HTTPException(422, {"codigo": "datos_incompletos", "errores": errores})
    if datos.aprobar:
        faltan = sr.pendientes(e["informe"], _plantilla_informe())
        if faltan:
            await sesion.rollback()
            raise HTTPException(422, {"codigo": "textos_pendientes", "errores": [
                f"Falta escribir «{c}» (sigue el texto de la plantilla)." for c in faltan]})
    sr.escribir(_carpeta_semana(semana), e)
    semana.version_contenido += 1
    await sesion.commit()
    TRABAJOS[semana_id] = {"estado": "en_curso", "inicio": datetime.now().isoformat(timespec="seconds"),
                           "edicion": datos.edicion, "columnas": datos.columnas, "aprobar": datos.aprobar,
                           "pdfs": [], "avisos": [], "registro": "", "error": None, "isr": None}
    TRABAJOS[semana_id]["tarea"] = asyncio.create_task(
        _trabajo(semana_id, semana.carpeta, datos, usuario.id))
    return {"estado": "en_curso"}


async def _exigir_correlativo(sesion: AsyncSession, numero: int) -> None:
    ultimo = (await sesion.execute(
        text("SELECT ultimo FROM contadores WHERE despacho_id = 1 AND serie = :serie AND periodo = :periodo"),
        {"serie": TIPOS["informe_sr"]["serie"], "periodo": config.periodo},
    )).scalar_one_or_none() or 0
    if numero != ultimo + 1:
        falta = f"ISR-{ultimo + 1:02d}" if numero > ultimo + 1 else f"ISR-{numero:02d} ya está registrado"
        raise HTTPException(409, (
            f"El ISR-{numero:02d} no puede registrarse todavía: la serie va en el {ultimo:02d}. "
            f"Registre antes el {falta} desde su semana (o, si ya está, abra su documento)."
            if numero > ultimo + 1 else
            f"El {falta} en la gestión documental, pero esta semana no lo tiene enlazado."))


async def _trabajo(semana_id: int, carpeta: str, datos: Generar, usuario_id: int) -> None:
    t = TRABAJOS[semana_id]
    try:
        async with generador_sr.candado(carpeta):
            for columnas in sorted(datos.columnas, reverse=True):
                r = await generador_sr.generar(raiz_informes_sr(), carpeta, datos.edicion, columnas)
                t["pdfs"].append(r["pdf"])
                # Las dos variantes avisan lo mismo (fotos): una vez basta.
                t["avisos"] = list(dict.fromkeys(t["avisos"] + r["avisos"]))
                t["registro"] = r["registro"]
        if datos.aprobar:
            t["isr"] = await _registrar_isr(semana_id, usuario_id, t["pdfs"][0])
        t["estado"] = "listo"
    except Exception as error:  # el error se muestra en la web tal cual
        t["estado"] = "error"
        t["error"] = str(getattr(error, "detail", None) or error)
    finally:
        t["fin"] = datetime.now().isoformat(timespec="seconds")


async def _registrar_isr(semana_id: int, usuario_id: int, pdf: str) -> dict:
    """El PDF aprobado entra a la gestión documental como el ISR de la semana (serie ISR,
    número = número de la semana), por la misma puerta que un documento elaborado fuera:
    `incorporacion.incorporar`. Si ya estaba, se reemplaza su PDF (una nueva versión
    aprobada); la firma, el cargo y el STD siguen allí."""
    async with SesionAsincrona() as sesion:
        semana = await _semana(sesion, semana_id, bloquear=True)
        usuario = (await sesion.execute(select(Usuario).where(Usuario.id == usuario_id))).scalar_one()
        ruta = _carpeta_semana(semana) / "salida" / pdf
        contenido = ruta.read_bytes()
        exp = semana.expediente or {}
        periodo = exp.get("periodo") or {}
        inf = semana.informe or {}
        campos = {
            "asunto": str(inf.get("titulo_documento") or f"Informe de Semana de Representación N.º {semana.numero:02d}"),
            "expediente_sr": semana.codigo,
            "periodo_sr": str(inf.get("periodo_texto") or f"{periodo.get('inicio', '')} al {periodo.get('fin', '')}"),
            "ambito": str(inf.get("ambito_texto") or ", ".join((exp.get("ambito") or {}).get("provincias") or [])),
            "fecha": date.today().isoformat(),
            "sumilla": f"ISR-{semana.numero:02d} {exp.get('tema') or ''}".strip(),
        }
        if semana.documento_id:
            doc = (await sesion.execute(select(Documento).where(Documento.id == semana.documento_id))).scalar_one()
            await incorporacion.reemplazar_pdf(sesion, doc, usuario, contenido, pdf)
        else:
            doc = await incorporacion.incorporar(sesion, usuario, "informe_sr", semana.numero, campos,
                                                 contenido, nombre_origen=pdf)
            semana = await _semana(sesion, semana_id, bloquear=True)
            semana.documento_id = doc.id
            await sesion.commit()
        # El expediente se vuelve a exportar: ahora lleva el número del ISR (entrega.numero_sgdp).
        semana = await _semana(sesion, semana_id)
        sr.escribir(_carpeta_semana(semana), await estructura(sesion, semana))
        return {"id": doc.id, "codigo": _codigo_doc(doc)}



class RegistrarIsr(BaseModel):
    pdf: str


@router.post("/{semana_id}/registrar-isr")
async def registrar_isr(
    semana_id: int,
    datos: RegistrarIsr,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Registra en la gestión documental un PDF APROBADO que ya está en `salida/`, sin
    regenerarlo. Es el caso del ISR-01: su PDF aprobado es una edición a mano de los
    editables que el generador no reproduce idéntica (expediente.yaml → notas)."""
    if usuario.rol not in APRUEBAN:
        raise HTTPException(403, "Registrar el informe aprobado corresponde al diputado o al administrador.")
    semana = await _semana(sesion, semana_id)
    p = informes_sr.RE_PDF.match(datos.pdf)
    if not p or p.group(8) or (p.group(6) or "") not in ("",):
        raise HTTPException(422, "Elija la versión aprobada (sin «borrador» ni «revision») de la edición pública.")
    if not (_carpeta_semana(semana) / "salida" / datos.pdf).is_file():
        raise HTTPException(404, "Ese PDF no está en la carpeta de salida de la semana.")
    if not semana.documento_id:
        await _exigir_correlativo(sesion, semana.numero)
    await sesion.commit()
    return await _registrar_isr(semana_id, usuario.id, datos.pdf)


# --- Vista previa (mientras se escriben los textos) -------------------------------------


class VistaPrevia(BaseModel):
    # Los textos del informe AÚN SIN GUARDAR (los de la pestaña «Textos del informe»).
    informe: dict | None = None
    columnas: int = 2


def _carpeta_vista(semana: SemanaSR, usuario: Usuario) -> Path:
    """Como la vista previa de los proyectos de ley: una por persona, dentro de `editables/`
    del expediente (fuera de git, regenerable). Nunca toca `salida/`: los PDF de la semana y
    sus nombres siguen siendo solo los que se generan a propósito."""
    return _carpeta_semana(semana) / "editables" / "vista-previa" / f"u{usuario.id}" / semana.carpeta


def _prestar_fotos(origen: Path, destino: Path) -> None:
    """Las fotos ya preparadas de la semana (`fotos/seleccion/`) se enlazan, no se rehacen:
    la vista previa tarda lo que tarda LuaLaTeX. La portada se copia, porque el generador la
    reescribe en su sitio y un enlace la cambiaría también en el expediente."""
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    if not origen.is_dir():
        return
    for f in origen.iterdir():
        if not f.is_file():
            continue
        if f.name in ("portada.jpg", ".portada_id"):
            shutil.copy2(f, destino / f.name)
            continue
        try:
            (destino / f.name).hardlink_to(f)
        except OSError:
            shutil.copy2(f, destino / f.name)


@router.post("/{semana_id}/vista-previa")
async def vista_previa(
    semana_id: int,
    datos: VistaPrevia,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Compone el informe TAL COMO VA, con los textos sin guardar si vienen. No es una
    versión: no cambia la semana, no escribe sus YAML ni `salida/`, no numera."""
    semana = await _semana(sesion, semana_id)
    try:
        cfg = sr.config_generador(config.mdd_ruta)
    except sr.ErrorSemana as error:
        raise HTTPException(503, str(error))
    e = await estructura(sesion, semana)
    if datos.informe:
        e["informe"] = {**e["informe"], **{k: v for k, v in datos.informe.items() if k not in ("version", "estado")}}
    errores = sr.validar(e, cfg)
    if errores:
        raise HTTPException(422, {"codigo": "datos_incompletos", "errores": errores})
    destino = _carpeta_vista(semana, usuario)
    seleccion = _carpeta_semana(semana) / "fotos" / "seleccion"
    # Nada que guardar: se suelta la sesión mientras compila (ojo: tras esto `semana` está
    # caducada; todo lo que hace falta de ella se calculó arriba).
    await sesion.rollback()
    async with generador_sr.candado(str(destino)):
        destino.mkdir(parents=True, exist_ok=True)
        sr.escribir(destino, e)
        _prestar_fotos(seleccion, destino / "fotos" / "seleccion")
        try:
            r = await generador_sr.generar(raiz_informes_sr(), str(destino), "publica",
                                           2 if datos.columnas != 1 else 1)
        except generador_sr.ErrorGenerador as error:
            raise HTTPException(422, {"codigo": "generador", "mensaje": "No se pudo armar la vista previa.",
                                      "errores": [str(error)]})
        pdf = destino.parent / "vista-previa.pdf"
        shutil.move(str(destino / "salida" / r["pdf"]), pdf)
    from app.servicios.pdf import contar_paginas

    return {"paginas": contar_paginas(pdf), "avisos": r["avisos"], "marca": int(pdf.stat().st_mtime * 1000)}


@router.get("/{semana_id}/vista-previa")
async def ver_vista_previa(
    semana_id: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    semana = await _semana(sesion, semana_id)
    ruta = _carpeta_vista(semana, usuario).parent / "vista-previa.pdf"
    if not ruta.is_file():
        raise HTTPException(404, "Aún no hay vista previa.")
    return enviar_archivo(ruta, f"ISR-{semana.numero:02d}_vista-previa.pdf", peticion=peticion)

# Las rutas genéricas de las listas van AL FINAL: registradas antes, `/{semana_id}/{lista}`
# capturaría `/generar` y `/fotos-subir` (Starlette prueba las rutas en orden).
router.add_api_route("/{semana_id}/{lista}", agregar, methods=["POST"])
router.add_api_route("/{semana_id}/{lista}/{codigo}", cambiar, methods=["PUT"])
router.add_api_route("/{semana_id}/{lista}/{codigo}", quitar, methods=["DELETE"])


# --- pegar el registro de una jornada (2026-10-12; servicios/pegado, bloque `registro-representacion`) ---


class PegarSemana(BaseModel):
    texto: str = Field(min_length=1, max_length=60000)


def _casar_vocabulario(valor: str | None, opciones: list[dict]) -> tuple[str | None, bool]:
    """→ (valor del vocabulario, casó). Por clave o por etiqueta, sin tildes ni mayúsculas."""
    from app.servicios.entradas import normalizar

    n = normalizar(str(valor or "")).strip()
    if not n:
        return None, True
    for o in opciones:
        if normalizar(o["valor"]) == n or normalizar(o["etiqueta"]) == n:
            return o["valor"], True
    parciales = [o["valor"] for o in opciones if len(n) >= 4 and (n in normalizar(o["etiqueta"]) or normalizar(o["etiqueta"]) in n)]
    if len(parciales) == 1:  # «visita» casa con varias clases de visita: que elija la persona
        return parciales[0], True
    return str(valor), False


@router_pegar.post("/{semana_id}/pegar")
async def pegar(
    semana_id: int,
    datos: PegarSemana,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """El resultado del prompt de la Semana de representación pegado (bloque
    `registro-representacion`) → vista previa: cada actividad y cada pedido listos para
    `POST /{id}/actividades` y `/pedidos`, con lo que ya está registrado marcado como
    existente (misma fecha y título parecido; mismo pedido), los vocabularios casados
    (tipo, sector, prioridad), el responsable casado con el equipo y las fechas fuera del
    recorrido avisadas. No escribe nada."""
    from app.servicios import pegado as svc_pegado
    from app.servicios.entradas import normalizar, similitud

    if usuario.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")
    semana = await _semana(sesion, semana_id)
    le = svc_pegado.interpretar(datos.texto, ("registro-representacion",))
    if not le.valido:
        raise HTTPException(422, {"codigo": "pegado_invalido", "errores": le.errores, "avisos": le.avisos,
                                  "formatos": [f for f in svc_pegado.formatos() if f["tipo"] == "registro-representacion"]})
    try:
        voc = sr.vocabularios(config.mdd_ruta)
    except sr.ErrorSemana:
        voc = {"sectores": [], "tipos_actividad": [], "prioridades": []}
    dias = {str(d.get("fecha")) for d in ((semana.resto or {}).get("actividades") or {}).get("dias") or []}
    actividades_db = await _filas(sesion, semana.id, "actividades")
    pedidos_db = await _filas(sesion, semana.id, "pedidos")
    equipo = (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True)))).scalars().all()
    nombres_equipo = {normalizar(u.nombre_completo or ""): u.nombre_completo for u in equipo}
    nombres_equipo.update({normalizar(u.nombre_usuario or ""): u.nombre_completo for u in equipo if u.nombre_usuario})

    def responsable_de(nombre: str | None) -> tuple[str, bool]:
        n = normalizar(nombre or "")
        if not n:
            return "", True
        if n in nombres_equipo:
            return nombres_equipo[n], True
        parciales = [v for k, v in nombres_equipo.items() if len(n) >= 6 and (n in k or k in n)]
        return (parciales[0], True) if len(parciales) == 1 else (str(nombre), False)

    actividades = []
    for i, a in enumerate(le.valores.get("actividades") or [], 1):
        tipo, ok_tipo = _casar_vocabulario(a.get("tipo"), voc["tipos_actividad"])
        sector, ok_sector = _casar_vocabulario(a.get("sector"), voc["sectores"])
        avisos = []
        if dias and a.get("fecha") not in dias:
            avisos.append(f"La fecha {a.get('fecha')} no es un día del recorrido ({', '.join(sorted(dias))}).")
        if not ok_tipo:
            avisos.append(f"Tipo «{a.get('tipo')}» no está en el vocabulario; elija uno al editar.")
        if not ok_sector:
            avisos.append(f"Sector «{a.get('sector')}» no está en el vocabulario; elija uno al editar.")
        existente = next((x for x in actividades_db if str(x.datos.get("fecha")) == a.get("fecha")
                          and similitud(str(x.datos.get("titulo") or ""), a.get("titulo") or "") >= 0.6), None)
        fila = {
            "titulo": a.get("titulo"), "fecha": a.get("fecha"), "tipo": tipo if ok_tipo else None, "sector": sector if ok_sector else None,
            "hora_inicio": a.get("hora_inicio"), "hora_fin": a.get("hora_fin"), "lugar": a.get("lugar"), "localidad": a.get("localidad"),
            "distrito": a.get("distrito"), "provincia": a.get("provincia"), "participantes": a.get("participantes") or [],
            "contexto": a.get("contexto"), "hallazgos": a.get("hallazgos") or [], "documentos": a.get("documentos") or [],
            "observaciones": a.get("observaciones"), "pedidos": [], "fotos": [],
        }
        actividades.append({"n": i, "ref": a.get("codigo") or f"A-{i:02d}", "datos": fila, "avisos": avisos,
                            "existente": {"codigo": existente.codigo, "titulo": existente.datos.get("titulo")} if existente else None,
                            "estado": "existente" if existente else "nuevo"})
    refs = {x["ref"]: x for x in actividades}
    pedidos = []
    for i, p in enumerate(le.valores.get("pedidos") or [], 1):
        avisos = []
        prioridad, ok_pri = _casar_vocabulario(p.get("prioridad_propuesta"), [{"valor": x, "etiqueta": x} for x in voc["prioridades"]])
        if not ok_pri:
            avisos.append(f"Prioridad «{p.get('prioridad_propuesta')}» no está entre {', '.join(voc['prioridades'])}.")
        responsable, ok_resp = responsable_de(p.get("responsable"))
        if not ok_resp:
            avisos.append(f"Responsable «{p.get('responsable')}» no es nadie del equipo; se deja como texto.")
        ref = p.get("actividad") or ""
        # La referencia apunta primero a una actividad DEL BLOQUE (A-01 del pegado); solo si el bloque
        # no la define se busca entre las ya registradas por su código.
        act = refs.get(ref)
        act_existente = None if act else next((x.codigo for x in actividades_db if x.codigo == ref), None)
        if not act and not act_existente:
            avisos.append(f"La actividad «{ref}» no está en el bloque ni en la semana: el pedido queda sin actividad.")
        existente = next((x for x in pedidos_db if similitud(str(x.datos.get("pedido") or ""), p.get("pedido") or "") >= 0.6), None)
        fila = {
            "actividad": act_existente or (act["existente"]["codigo"] if act and act["existente"] else None),
            "pedido": p.get("pedido"), "entidades": p.get("entidades") or [], "entidades_texto": p.get("entidades_texto"),
            "actuacion": p.get("actuacion"), "prioridad_propuesta": prioridad if ok_pri else None, "responsable": responsable or None,
            "plazo": p.get("plazo"), "estado": "registrado",
            "observaciones": "\n".join(x for x in [p.get("observaciones") or "", *(f"Quién lo pidió: {p['quien']}" for _ in [0] if p.get("quien")),
                                                  *(["Afirmaciones a verificar: " + "; ".join(p["afirmaciones_a_verificar"])] if p.get("afirmaciones_a_verificar") else [])] if x) or None,
        }
        pedidos.append({"n": i, "ref": p.get("codigo") or f"P-{i:03d}", "actividad_ref": ref, "datos": fila, "avisos": avisos,
                        "existente": {"codigo": existente.codigo} if existente else None, "estado": "existente" if existente else "nuevo"})
    return {"lectura": le.como_dict(), "actividades": actividades, "pedidos": pedidos, "resto": le.resto}

"""Router de documentos: CRUD, flujo de estados, numeración y PDF.

Solo orquesta HTTP y valida permisos; la lógica vive en app/servicios/*
(carpetas, numeracion, compilacion, bitacora, borradores, eliminacion).
"""

import asyncio
import json
from datetime import date
from pathlib import Path

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import enviar_archivo
from app.config import config
from app.db import obtener_sesion
from app.flujo import (
    ETIQUETA as ETIQUETA_ESTADO,
    transicion_permitida,
    transiciones_para,
    ve_autoria,
)
from app.latex.generador import numero_completo as _fmt_numero
from app.modelos import (
    Adjunto,
    Asignacion,
    Documento,
    DocumentoRelacion,
    Evento,
    Usuario,
    VersionDocumento,
)
from app.seguridad import usuario_actual
from app.latex.redaccion import normalizar_campos
from app.servicios import adjuntos as svc_adjuntos
from app.servicios import agenda_detectada
from app.servicios import eventos_sistema
from app.servicios import (
    ambito as svc_ambito,
    bitacora,
    copias as svc_copias,
    verificacion as svc_verif,
    borradores,
    compilacion,
    eliminacion,
    envio,
    tramite,
    vigencia,
)
from app.servicios import colab as svc_colab
from app.servicios import comentarios as svc_com
from app.servicios import incorporacion as svc_incorporacion
from app.servicios import pdf as svc_pdf
from app.servicios import relaciones as svc_relaciones
from app.servicios import entradas as svc_entradas
from app.servicios.carpetas import carpeta
from app.servicios.comun import CUERPO_VACIO, ESTADOS_VALIDOS
from app.servicios import instituciones_destino as svc_inst
from app.servicios.numeracion import asignar_siguiente, numero_mostrado, tipodoc
from app.tipos import SQL_ASUNTO, asunto_de, destinatario_de, tipo_config

# Los campos que viajan con los eventos de un documento viven en servicios/eventos_sistema.py.
_datos_evento_doc = eventos_sistema.datos_documento


router = APIRouter(prefix="/api/documentos", tags=["documentos"])


# ------------------------------ modelos de entrada -------------------

class DatosDocumento(BaseModel):
    campos: dict = Field(default_factory=dict)
    cuerpo: dict = Field(default_factory=lambda: dict(CUERPO_VACIO))
    # Solo en /generar: la persona revisó destinatario, asunto, fecha y copias
    # uno por uno. Sin esto, numerar se rechaza con 409 (ver
    # servicios/verificacion.py). El nombre viene de cuando la revisión era
    # solo de copias; se conserva para no romper llamadas en vuelo.
    copias_verificadas: bool = False
    # Control de concurrencia (2026-09-14): la versión del contenido sobre la
    # que se editó (`version` del GET). Si ya no es la vigente, el servidor
    # responde 409 `documento_modificado` y NO pisa nada. None = cliente
    # antiguo o script que no la manda: se acepta, como antes.
    version_base: int | None = None
    # Edición simultánea (paso 5.6): la generación del texto compartido desde
    # el que se guarda. Si es la vigente, lo que llega es el texto unido de
    # todos y no se exige `version_base` (ver `_preparar_escritura`).
    generacion: int | None = None
    # Vigencia (2026-10-06): None = cliente que no conoce el aviso previo
    # (scripts, pestañas viejas): si el cambio anula la firma, se anula y se
    # informa. False = responder 409 `anula_firma` con las consecuencias sin
    # guardar nada. True = la persona ya lo confirmó.
    confirmar_anulacion: bool | None = None
    # Guardado automático de la web (2026-10-08): agrupa versiones y eventos
    # (bitacora.automatico_reciente). Un cliente que no lo manda guarda como siempre.
    auto: bool = False


class NuevoDocumento(BaseModel):
    tipo: str = "oficio"


def _campos_entrantes(tipo: str, campos: dict) -> dict:
    """Normalización de redacción administrativa (mayúsculas ->
    convenciones), SALVO en los tipos cuyo formato usa MAYÚSCULAS a
    propósito (normalizar=False en tipos.py, p. ej. la bancada)."""
    if tipo_config(tipo).get("normalizar", True):
        return normalizar_campos(campos)
    return campos


class CambioEstado(BaseModel):
    estado: str
    # §3/§4 (Edison 2026-09-04): el cambio de estado puede traer el comentario
    # que lo explica. Es OBLIGATORIO al observar (qué corregir) y opcional al
    # devolver a borrador (qué trabajo hacer) o en cualquier otro paso (nota).
    comentario: str = ""
    # Al devolver a borrador se puede encargar el documento a alguien.
    responsable_id: int | None = None


class CambioFolios(BaseModel):
    folios: int | None = None


class CambioOculto(BaseModel):
    oculto: bool


# ------------------------------ helpers HTTP -------------------------

def _resumen(doc: Documento) -> dict:
    return {
        "id": doc.id,
        "tipo": doc.tipo,
        "tipo_nombre": tipo_config(doc.tipo)["nombre"],
        "numero": doc.numero,
        "numero_completo": numero_mostrado(doc),
        "estado": doc.estado,
        "origen": doc.origen,
        "asunto": asunto_de(doc.tipo, doc.campos),
        "destinatario": destinatario_de(doc.campos),
        # Fecha OFICIAL del documento (la que se edita y sale en el PDF), no
        # confundir con actualizado_en (última modificación del registro). La
        # bandeja mostraba solo actualizado_en, por eso un cambio de fecha
        # parecía "no aplicarse" (pedido de Edison 2026-09-01).
        "fecha": doc.campos.get("fecha"),
        "folios": doc.folios,
        "oculto": doc.oculto,
        "responsable_id": doc.responsable_id,
        "actualizado_en": doc.actualizado_en.isoformat(),
        "version": doc.version_contenido,
    }


async def _ultimo_editor(sesion: AsyncSession, doc_id: int) -> dict:
    """Quién tocó por última vez el CONTENIDO del documento y cuándo, para
    decirlo en el 409 de concurrencia («fue modificado por X a las HH:MM»)."""
    fila = (
        await sesion.execute(
            select(Evento.fecha, Usuario.nombre_completo)
            .join(Usuario, Usuario.id == Evento.usuario_id)
            .where(
                Evento.documento_id == doc_id,
                Evento.accion.in_(("editado", "generado", "restaurado")),
            )
            .order_by(Evento.id.desc())
            .limit(1)
        )
    ).first()
    if fila is None:
        return {"editado_por": "", "editado_en": ""}
    return {"editado_por": fila[1] or "", "editado_en": fila[0].isoformat()}


async def _ultima_edicion(sesion: AsyncSession, doc_id: int, usuario: Usuario) -> dict:
    """La misma consulta de `_ultimo_editor`, con el nombre oculto a quien no
    ve la autoría: {"por": nombre, "en": ISO} (vacíos si nadie editó aún)."""
    quien = await _ultimo_editor(sesion, doc_id)
    return {
        "por": quien["editado_por"] if ve_autoria(usuario) else "",
        "en": quien["editado_en"],
    }


async def _exigir_version_vigente(
    sesion: AsyncSession, doc: Documento, datos: "DatosDocumento"
) -> None:
    """Rechaza con 409 `documento_modificado` un guardado hecho sobre una
    versión que ya no es la vigente (2026-09-14).

    El caso real: el servidor se reinició a media mañana; una pestaña del
    despacho recargó el documento desde la copia local (modo sin conexión),
    siguió editando sobre esa copia vieja y, al volver el servidor, cada
    «vista previa» mandó campos+cuerpo completos y PISÓ el interlineado, las
    referencias y la fecha que ya estaban guardados. Con esto, la pestaña
    vieja recibe el aviso y elige; nunca pisa en silencio."""
    if datos.version_base is None or datos.version_base == doc.version_contenido:
        return
    quien = await _ultimo_editor(sesion, doc.id)
    raise HTTPException(
        409,
        {
            "codigo": "documento_modificado",
            "mensaje": (
                "Este documento fue guardado desde otro lugar después de que "
                "usted lo abrió. Sus cambios de esta pestaña NO se guardaron "
                "para no pisar los de la otra persona."
            ),
            "version": doc.version_contenido,
            "version_base": datos.version_base,
            "actualizado_en": doc.actualizado_en.isoformat(),
            **quien,
        },
    )


async def _preparar_escritura(
    sesion: AsyncSession, doc: Documento, datos: "DatosDocumento"
) -> None:
    """Antes de escribir el contenido (2026-10-05, edición simultánea).

    Desde el editor compartido con la generación vigente, lo que llega es el
    texto unido de todos: no hay versión ajena que pisar y no se exige
    `version_base`; el borrador vivo queda absorbido en lo guardado. Desde
    cualquier otro lado rige el control de siempre (409 si la base es vieja)
    y, si el documento tenía texto compartido, se reinicia: el contenido se
    reemplazó por fuera de Yjs y unir el estado viejo lo duplicaría."""
    if svc_colab.documento_en_vivo(doc) and datos.generacion == doc.colab_gen:
        doc.borrador = None
        doc.borrador_en = None
        doc.borrador_por = None
        return
    await _exigir_version_vigente(sesion, doc, datos)
    if doc.colaboracion:
        await svc_colab.reiniciar_documento(sesion, doc)


def _contenido_cambia(doc: Documento, campos: dict, cuerpo: dict) -> bool:
    return (doc.campos or {}) != (campos or {}) or (doc.cuerpo or {}) != (cuerpo or {})


async def _agendar(sesion: AsyncSession, doc: Documento, usuario: Usuario) -> int:
    """Lo que el documento anuncia (reunión, sesión… con fecha y hora) queda en la agenda como
    PROPUESTO (servicios/agenda_detectada.py, 2026-10-08). Nunca hace fallar el guardado."""
    try:
        return await agenda_detectada.sincronizar_documento(sesion, doc, usuario)
    except Exception:  # noqa: BLE001 — la agenda es un extra: el guardado ya está hecho
        logging.getLogger("sgdp.agenda_detectada").exception("No se pudo agendar lo del documento %s", doc.id)
        await sesion.rollback()
        return 0


async def _compilar_sin_perder(sesion: AsyncSession, doc: Documento, rapido: bool = False) -> dict:
    """Compila y devuelve {compilado, error_compilacion} en vez de lanzar.

    El contenido YA quedó guardado (compilar() hace commit antes de LaTeX);
    si LaTeX falla, el guardado sigue siendo un éxito y el error es solo de
    la vista previa. Antes un 500 de LaTeX hacía que el editor ENCOLARA el
    guardado como «sin conexión» y lo reenviara una y otra vez."""
    try:
        await compilacion.compilar(sesion, doc, rapido=rapido)
        return {
            "compilado": True, "error_compilacion": "",
            "ajuste_firma": getattr(doc, "ajuste_firma", ""),
            "ajuste_valores": getattr(doc, "ajuste_valores", {}) or {},
            "estado_compilacion": doc.estado_compilacion or {},
        }
    except HTTPException as error:
        await sesion.rollback()
        # Tras el rollback la instancia queda expirada y leer `doc.estado` en el llamador
        # lanzaba MissingGreenlet (500 sin cuerpo; auditoría 2026-10-10, GD-07): se recarga.
        await sesion.refresh(doc)
        detalle = error.detail if isinstance(error.detail, str) else str(error.detail)
        return {"compilado": False, "error_compilacion": detalle, "estado_compilacion": doc.estado_compilacion or {}}


def _instituciones(doc: Documento, idx: svc_inst.Indice | None = None) -> list[str]:
    """Institución / órgano de cada destinatario, para la columna «Institución
    destino» de la bandeja. No hay campo propio en oficios, así que se deriva:
    varios destinatarios → el cargo tras « — » (o la línea, si es un órgano sin
    cargo); uno solo → institución explícita (carta), si no el cargo. El
    frontend muestra las siglas «(XXX)» cuando las hay y el nombre completo en
    el tooltip."""
    campos = doc.campos or {}
    lineas = [
        l.strip()
        for l in (campos.get("destinatario_nombre") or "").splitlines()
        if l.strip()
    ]
    if len(lineas) > 1:
        crudas = [l.split(" — ", 1)[1].strip() if " — " in l else l for l in lineas]
    elif lineas and " — " in lineas[0]:
        crudas = [lineas[0].split(" — ", 1)[1].strip()]
    else:
        inst = (campos.get("destinatario_institucion") or "").strip() or (
            campos.get("destinatario_cargo") or ""
        ).strip()
        crudas = [inst] if inst else []
    if idx is None:
        return crudas
    # Un solo formato (2026-10-08): la institución, no el cargo; el nombre del directorio;
    # nombre propio en vez de MAYÚSCULAS (servicios/instituciones_destino.py).
    vistas: list[str] = []
    for c in crudas:
        v = svc_inst.mostrar(c, idx)
        if v and v not in vistas:
            vistas.append(v)
    return vistas


async def _cargar(
    documento_id: int, sesion: AsyncSession, con_bloqueo: bool = False
) -> Documento:
    doc = await sesion.get(Documento, documento_id, with_for_update=con_bloqueo)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    return doc


def _exigir_plataforma(doc: Documento) -> None:
    """Los heredados conservan su .tex original: el editor visual no los
    reescribe (perdería su personalización LaTeX). Los elaborados fuera del
    sistema no tienen nada que compilar: su PDF es la fuente."""
    if doc.origen == "manual":
        raise HTTPException(
            409,
            "Este documento se elaboró fuera del sistema (Word u otro editor) "
            "y se incorporó con su PDF: su contenido no se edita ni se "
            "compila aquí. Puede corregir sus datos, reemplazar el PDF y "
            "seguir el trámite (firma, cargos, STD).",
        )
    if doc.origen == "framework":
        raise HTTPException(
            409,
            "Este documento proviene del archivo de la entidad y conserva "
            "su formato original. Desde la plataforma puede consultarlo, "
            "descargarlo, cambiar su estado y recompilarlo, pero su "
            "contenido se edita con el sistema LaTeX.",
        )


# ------------------------------ CRUD ---------------------------------

def _con_etapas(doc: Documento, hitos: dict) -> dict:
    """Hitos del oficio + ruta completa del proceso, como los espera el
    frontend (mismo formato que `tramite.de_documento`)."""
    return {**hitos, "etapas": tramite.etapas(doc, hitos)}


async def _enriquecer(
    sesion: AsyncSession, docs: list[Documento], usuario: Usuario
) -> list[dict]:
    """Convierte documentos en filas de bandeja (MISMO formato para la lista y
    para la búsqueda avanzada): resumen + firmado/recepción + destinatarios +
    instituciones + anexos + procesado_por. Una consulta por dimensión (sin
    N+1)."""
    ids = [d.id for d in docs]
    cat = await svc_adjuntos.por_categoria(sesion, ids)
    # Interno o externo (decide si el trámite exige cargo de recepción). El
    # índice del Congreso se arma UNA vez por petición: la bandeja clasifica
    # decenas de filas y no puede pagar una consulta por documento.
    congreso = await svc_ambito.indice_congreso(sesion)
    idx_inst = await svc_inst.indice(sesion)
    anexos_n = await svc_adjuntos.conteo_anexos(sesion, ids)
    # Comentarios abiertos por documento (observaciones e indicaciones sin
    # levantar): la bandeja los marca para que no se pierdan de vista.
    pendientes = await svc_com.conteo_pendientes(sesion, ids)
    # «Procesado por» es dato INTERNO (nunca aparece en el PDF oficial), pero
    # del EQUIPO: todos los roles de trabajo lo ven para saber quién hizo qué
    # y seguir el recorrido del expediente (Edison 2026-10-01; antes, solo el
    # administrador). Un mapa id->nombre en una consulta.
    nombres: dict[int, str] = {}
    if ve_autoria(usuario) and docs:
        filas = await sesion.execute(
            select(Usuario.id, Usuario.nombre_completo).where(
                Usuario.id.in_({d.creado_por for d in docs})
            )
        )
        nombres = dict(filas.all())
    # El RESPONSABLE sí lo ven todos los roles: la columna existe justamente
    # para saber quién tiene el documento en mano (dato interno, nunca en PDF).
    responsables: dict[int, str] = {}
    ids_resp = {d.responsable_id for d in docs if d.responsable_id}
    if ids_resp:
        filas = await sesion.execute(
            select(Usuario.id, Usuario.nombre_completo).where(Usuario.id.in_(ids_resp))
        )
        responsables = dict(filas.all())

    def fila(d: Documento) -> dict:
        c = cat.get(d.id, {"firmado": None, "recepciones": []})
        # Destinatarios (para el seguimiento n/m de constancias en múltiples).
        lineas = [
            l.split(" — ", 1)[0].strip()
            for l in (d.campos.get("destinatario_nombre") or "").splitlines()
            if l.strip()
        ]
        return {
            **_resumen(d),
            # Estados a los que el rol puede mover el documento (selector inline).
            "transiciones": transiciones_para(d.estado, usuario.rol),
            "firmado_id": c["firmado"],
            "recepciones": c["recepciones"],
            "destinatarios": lineas,
            "instituciones": _instituciones(d, idx_inst),
            "anexos": anexos_n.get(d.id, 0),
            # Vacío solo para el rol invitado (ver `ve_autoria`).
            "procesado_por": nombres.get(d.creado_por, ""),
            # Ruta del oficio: generado → enviado → constancia → STD. El check
            # verde de la bandeja es `tramite.completo` (servicios/tramite.py).
            # `etapas` agrega la ruta COMPLETA (redactar → … → STD): de ahí sale
            # el «paso que toca ahora» que la bandeja muestra en cada fila.
            "tramite": _con_etapas(
                d,
                tramite.estado(
                    d,
                    c["firmado"],
                    len(c["recepciones"]),
                    svc_ambito.clasificar(d, congreso),
                ),
            ),
            "responsable": responsables.get(d.responsable_id or 0, ""),
            "comentarios_pendientes": pendientes.get(d.id, 0),
        }

    return [fila(d) for d in docs]


@router.get("")
async def listar(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    docs = (
        (
            await sesion.execute(
                select(Documento).order_by(Documento.actualizado_en.desc())
            )
        )
        .scalars()
        .all()
    )
    docs = await borradores.purgar_vacios(sesion, list(docs))
    # Documentos OCULTOS por el administrador: invisibles para los demás
    # roles (el admin sí los ve; su bandeja los relega al final).
    if usuario.rol != "administrador":
        docs = [d for d in docs if not d.oculto]
    return await _enriquecer(sesion, docs, usuario)


@router.get("/buscar")
async def buscar(
    q: str = "",
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Autocompletado de REFERENCIAS: busca documentos ya NUMERADOS por
    número o por palabra del asunto y devuelve su número completo (para
    citarlos) y el asunto. Declarado ANTES de /{documento_id} para que la
    ruta de id no capture «buscar»."""
    q = (q or "").strip()
    if len(q) < 2:
        return []
    digitos = "".join(c for c in q if c.isdigit())
    filas = (
        await sesion.execute(
            text(
                f"SELECT id, numero, tipo, periodo, {SQL_ASUNTO} AS asunto "
                "FROM documentos "
                f"WHERE numero IS NOT NULL AND ({SQL_ASUNTO} ILIKE :kw "
                "  OR CAST(numero AS TEXT) ILIKE :num) "
                "ORDER BY numero DESC LIMIT 15"
            ),
            {
                "kw": f"%{q}%",
                # Sin dígitos, un centinela no numérico: CAST(numero AS TEXT)
                # es solo dígitos, así que nunca casa (evita int('') y no
                # arrastra todos los números en búsquedas por palabra).
                "num": f"%{int(digitos)}%" if digitos else "sin-numero",
            },
        )
    ).all()
    salida = []
    for id_, numero, tipo, periodo, asunto in filas:
        tipodoc = tipo_config(tipo)["tipodoc"]
        salida.append(
            {
                # El id permite que una referencia a un documento del sistema
                # quede vinculada sola como «documento relacionado».
                "id": id_,
                "numero_completo": _fmt_numero(
                    numero, periodo, config.siglas, tipodoc, tipo_config(tipo)
                ),
                "asunto": (asunto or "")[:120],
            }
        )
    return salida


@router.get("/buscar-vinculo")
async def buscar_vinculo(
    q: str = "",
    excluir: int | None = None,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Autocompletado para VINCULAR documentos (respuestas / relacionados):
    busca por número o palabra del asunto entre TODOS los documentos (numerados
    o no) y devuelve su id además del número y asunto. Excluye el propio
    documento (`excluir`) y los ocultos si el rol no es admin. Declarado ANTES
    de /{documento_id} para que la ruta de id no lo capture."""
    q = (q or "").strip()
    if len(q) < 2:
        return []
    digitos = "".join(c for c in q if c.isdigit())
    filas = (
        await sesion.execute(
            text(
                "SELECT id, tipo, periodo, numero, estado, oculto, "
                f"{SQL_ASUNTO} AS asunto FROM documentos "
                f"WHERE ({SQL_ASUNTO} ILIKE :kw OR CAST(numero AS TEXT) ILIKE :num) "
                # asyncpg no infiere el tipo de un parámetro que solo se compara
                # con NULL: hay que castearlo explícitamente a INTEGER.
                "AND (CAST(:excluir AS INTEGER) IS NULL OR id <> CAST(:excluir AS INTEGER)) "
                "ORDER BY (numero IS NULL), numero DESC, actualizado_en DESC LIMIT 15"
            ),
            {
                "kw": f"%{q}%",
                "num": f"%{int(digitos)}%" if digitos else "sin-numero",
                "excluir": excluir,
            },
        )
    ).all()
    salida = []
    for id_, tipo, periodo, numero, estado, oculto, asunto in filas:
        if oculto and usuario.rol != "administrador":
            continue
        cfg = tipo_config(tipo)
        numero_txt = (
            _fmt_numero(numero, periodo, config.siglas, cfg["tipodoc"], cfg)
            if numero is not None
            else "S/N (borrador)"
        )
        salida.append(
            {
                "id": id_,
                "numero_completo": numero_txt,
                "tipo_nombre": cfg["nombre"],
                "estado": estado,
                "asunto": (asunto or "")[:120],
            }
        )
    return salida


def _texto_cuerpo(nodo) -> str:
    """Texto visible de un cuerpo TipTap (concatena los nodos «text»), para
    poder buscar por CONTENIDO. Ignora las claves estructurales del JSON."""
    trozos: list[str] = []

    def rec(n) -> None:
        if isinstance(n, dict):
            if n.get("type") == "text" and isinstance(n.get("text"), str):
                trozos.append(n["text"])
            elif n.get("type") == "referencia":
                trozos.append(str((n.get("attrs") or {}).get("texto") or ""))
            for v in n.values():
                rec(v)
        elif isinstance(n, list):
            for x in n:
                rec(x)

    rec(nodo)
    return " ".join(trozos)


@router.get("/buscar-avanzado")
async def buscar_avanzado(
    q: str = "",
    tipo: str = "",
    estado: str = "",
    anio: str = "",
    desde: str = "",
    hasta: str = "",
    destinatario: str = "",
    firma: str = "",
    vinculo: str = "",
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Búsqueda AVANZADA de la bandeja: texto libre + filtros combinables, con
    filas del MISMO formato que la lista (para pintarlas en la misma tabla).
    Declarada ANTES de /{documento_id} para que la ruta de id no la capture.

    - ``q``: texto libre; deben casar TODOS sus términos (AND) contra número,
      asunto, sumilla, destinatario(s), institución, tipo, estado, fecha y el
      CONTENIDO del cuerpo.
    - ``tipo`` / ``estado``: igualdad.
    - ``anio``: año de la fecha oficial (``campos.fecha`` empieza por «AAAA»).
    - ``desde`` / ``hasta``: rango sobre la fecha oficial (ISO; comparación de
      texto, válida para AAAA-MM-DD).
    - ``destinatario``: subcadena en nombre/cargo/institución del destinatario.
    - ``firma``: «firmado» (tiene PDF firmado) | «pendiente» (numerado y sin
      firma).
    - ``vinculo``: «respondido» (tiene relación de respuesta) | «relacionado»
      (tiene cualquier documento relacionado).

    El corpus de la entidad es pequeño (decenas–cientos), así que filtra en
    memoria sobre una sola consulta: instantáneo y sin SQL frágil para los
    EXISTS de firma/vínculo. Si algún día son miles, conviene pasar los filtros
    a SQL con un índice pg_trgm."""
    docs = list(
        (
            await sesion.execute(
                select(Documento).order_by(Documento.actualizado_en.desc())
            )
        ).scalars().all()
    )
    if usuario.rol != "administrador":
        docs = [d for d in docs if not d.oculto]

    # Firma: mapa doc -> {firmado, recepciones} en una consulta.
    cat = await svc_adjuntos.por_categoria(sesion, [d.id for d in docs])
    # Vínculos: ids con relación (cualquiera) y con relación de respuesta.
    con_relacion: set[int] = set()
    con_respuesta: set[int] = set()
    if vinculo:
        rels = (await sesion.execute(select(DocumentoRelacion))).scalars().all()
        for r in rels:
            for lado in (r.origen_id, r.destino_id):
                if lado is not None:
                    con_relacion.add(lado)
                    if r.tipo in ("responde", "respondido"):
                        con_respuesta.add(lado)

    tokens = [t for t in q.lower().split() if t]
    dest_kw = destinatario.strip().lower()

    def coincide(d: Documento) -> bool:
        campos = d.campos or {}
        fecha = campos.get("fecha") or ""
        if tipo and d.tipo != tipo:
            return False
        if estado and d.estado != estado:
            return False
        if anio and not fecha.startswith(anio):
            return False
        if desde and fecha < desde:
            return False
        if hasta and fecha > hasta:
            return False
        if dest_kw:
            dd = " ".join(
                [
                    campos.get("destinatario_nombre", ""),
                    campos.get("destinatario_cargo", ""),
                    campos.get("destinatario_institucion", ""),
                    " ".join(_instituciones(d)),
                ]
            ).lower()
            if dest_kw not in dd:
                return False
        firmado = cat.get(d.id, {}).get("firmado")
        if firma == "firmado" and firmado is None:
            return False
        if firma == "pendiente" and (d.numero is None or firmado is not None):
            return False
        if vinculo == "respondido" and d.id not in con_respuesta:
            return False
        if vinculo == "relacionado" and d.id not in con_relacion:
            return False
        if tokens:
            hay = " ".join(
                [
                    str(d.numero or ""),
                    numero_mostrado(d),
                    asunto_de(d.tipo, campos),
                    campos.get("destinatario_nombre", ""),
                    campos.get("destinatario_cargo", ""),
                    campos.get("destinatario_institucion", ""),
                    fecha,
                    campos.get("lugar", ""),
                    tipo_config(d.tipo)["nombre"],
                    ETIQUETA_ESTADO.get(d.estado, d.estado),
                    " ".join(_instituciones(d)),
                    _texto_cuerpo(d.cuerpo),
                ]
            ).lower()
            if not all(tok in hay for tok in tokens):
                return False
        return True

    return await _enriquecer(sesion, [d for d in docs if coincide(d)], usuario)


async def _nuevo_borrador(sesion: AsyncSession, usuario: Usuario, cfg: dict, campos_extra: dict | None = None,
                          cuerpo: dict | None = None, detalle: str = "") -> Documento:
    """El borrador nuevo de un tipo, con lo que el sistema siembra (lugar, fecha de hoy, formato
    predeterminado, copias por regla) y, encima, lo que trae quien lo crea (`campos_extra`, `cuerpo`:
    «Documentos desde un Word», 2026-10-18). Sin commit."""
    if cfg.get("externo"):
        # Un tipo externo (ISR, documento recibido) no se redacta aquí: su PDF se hace
        # fuera y entra por «incorporar» (o, el ISR, desde Semana de representación).
        raise HTTPException(422, f"«{cfg['nombre']}» no se redacta en el editor: se incorpora con su PDF.")
    # La fecha viene con HOY por defecto (editable en el formulario).
    campos_iniciales = {"lugar": config.lugar, "fecha": date.today().isoformat()}
    # Formato PREDETERMINADO del tipo («convertir a predeterminado»).
    from app.api.ajustes import formato_defecto

    campos_iniciales.update(await formato_defecto(sesion, cfg["codigo"]))
    if cfg["codigo"] == "oficio_multiple":
        campos_iniciales["destinatario_tratamiento"] = "Señores:"
    # Copias por defecto (Edison 2026-09-05: «por defecto, la primera copia
    # debe ser al presidente de la Cámara de Diputados»). Se siembran desde
    # las reglas de copia —con el cargo VIGENTE del directorio— en los tipos
    # que llevan c.c.; quien redacta las ve puestas desde el primer momento y
    # puede quitarlas. La verificación de /generar sigue exigiendo confirmar
    # cada una antes de numerar: sembrar no es confirmar.
    if any(c["clave"] == "con_copia" for c in cfg["campos"]):
        sugeridas = await svc_copias.sugeridas(sesion, cfg["codigo"])
        if sugeridas:
            campos_iniciales["con_copia"] = "\n".join(
                linea
                for c in sugeridas
                for linea in (c["tratamiento"] or "Señor:", c["nombre"], c["cargo"])
                if linea
            )
    permitidos = {c["clave"] for c in cfg["campos"]} | {"lugar", "fecha"}
    for k, v in (campos_extra or {}).items():
        if k in permitidos and v not in (None, ""):
            campos_iniciales[k] = v
    doc = Documento(
        despacho_id=1,
        periodo=config.periodo,
        tipo=cfg["codigo"],
        serie=cfg["serie"],
        campos=_campos_entrantes(cfg["codigo"], campos_iniciales),
        cuerpo=cuerpo or dict(CUERPO_VACIO),
        creado_por=usuario.id,
    )
    sesion.add(doc)
    await sesion.flush()
    bitacora.registrar(
        sesion, doc.id, usuario, "creado", detalle or f"Nuevo borrador de {cfg['nombre'].lower()}"
    )
    return doc


@router.post("")
async def crear(
    datos: NuevoDocumento | None = None,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    cfg = tipo_config((datos or NuevoDocumento()).tipo)
    doc = await _nuevo_borrador(sesion, usuario, cfg)
    await sesion.commit()
    return {"id": doc.id}


@router.post("/{documento_id}/duplicar")
async def duplicar(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Un borrador nuevo con todo lo de otro documento (Edison 2026-10-08: «duplicar todo y
    hacer los cambios a partir de lo que ya se había hecho»): mismo tipo, campos y cuerpo,
    sin número, con la fecha de hoy. Nada del trámite (firmado, cargos, STD) pasa a la copia."""
    if usuario.rol == "invitado":
        raise HTTPException(403, "Su rol no permite crear documentos.")
    origen = await _cargar(documento_id, sesion)
    if origen.oculto and usuario.rol != "administrador":
        raise HTTPException(404, "El documento no existe.")
    cfg = tipo_config(origen.tipo)
    if cfg.get("externo") or origen.origen == "manual":
        raise HTTPException(
            409, "Este documento se elaboró fuera del sistema: no hay contenido que duplicar."
        )
    campos = dict(origen.campos or {})
    campos["fecha"] = date.today().isoformat()
    doc = Documento(
        despacho_id=origen.despacho_id,
        periodo=config.periodo,
        tipo=origen.tipo,
        serie=origen.serie,
        campos=campos,
        cuerpo=dict(origen.cuerpo or CUERPO_VACIO),
        creado_por=usuario.id,
    )
    sesion.add(doc)
    await sesion.flush()
    bitacora.registrar(
        sesion, doc.id, usuario, "creado", f"Duplicado de {numero_mostrado(origen)}"
    )
    bitacora.registrar(
        sesion, origen.id, usuario, "duplicado", f"Se duplicó como borrador (id {doc.id})"
    )
    await sesion.commit()
    return {"id": doc.id}


@router.get("/{documento_id}")
async def obtener(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    doc = await _cargar(documento_id, sesion)
    # Un documento oculto no existe para los roles no administradores.
    if doc.oculto and usuario.rol != "administrador":
        raise HTTPException(404, "El documento no existe.")
    cfg = tipo_config(doc.tipo)
    # (La puesta en revisión automática NO va aquí: es un POST /abrir. Este GET
    # se llama varias veces por documento —AbrirDocumento sondea el origen, el
    # editor refresca el estado— y un efecto colgado de él se dispararía donde
    # nadie lo espera. Ver api/seguimiento.py::abrir.)
    # Trámite (los 4 hitos + check verde) y responsable vigente: el editor y la
    # vista heredada los pintan sin tener que pedir otra ruta.
    est_tramite = await tramite.de_documento(sesion, doc)
    puede_std, motivo_std = tramite.puede_registrar_std(est_tramite)
    responsable = ""
    if doc.responsable_id:
        u = await sesion.get(Usuario, doc.responsable_id)
        responsable = u.nombre_completo if u else ""
    return {
        **_resumen(doc),
        "campos": doc.campos,
        "cuerpo": doc.cuerpo,
        "esquema_campos": cfg["campos"],
        "cuerpo_con_secciones": cfg["cuerpo_con_secciones"],
        "transiciones": transiciones_para(doc.estado, usuario.rol),
        "ajuste_valores": compilacion.valores_ultimo_ajuste(doc.id),
        "estado_compilacion": doc.estado_compilacion or {},
        "tramite": {
            **est_tramite,
            "std_nota": doc.std_nota or "",
            "plazo_legal": doc.plazo_legal or {},
            "puede_std": puede_std,
            "motivo_std": motivo_std,
        },
        "responsable": responsable,
        "comentarios_pendientes": len(await svc_com.pendientes(sesion, doc.id)),
        # «Última edición: X, hace N min» del editor (Edison 2026-10-05). El
        # nombre es dato interno del equipo (`ve_autoria`), nunca del PDF.
        "ultima_edicion": await _ultima_edicion(sesion, doc.id, usuario),
        # Edición simultánea (paso 5.6): si rige ahora, si se podría encender
        # y la generación del texto compartido (`doc:<id>:<generacion>`).
        "colaboracion": svc_colab.documento_en_vivo(doc),
        "compartible": svc_colab.documento_compartible(doc),
        "generacion": doc.colab_gen,
        "sin_versionar": svc_colab.documento_sin_versionar(doc),
        # Lo último escrito en compartido: si el servidor de colaboración no
        # responde, el editor sigue por turnos desde aquí y no desde lo guardado.
        "borrador": doc.borrador if svc_colab.documento_en_vivo(doc) else None,
        # ¿Hay una firma que un cambio de lo impreso anularía? (Edison
        # 2026-10-06: un documento ya firmado no debe invitar a guardar). El
        # editor abre así en solo lectura; la regla es la de vigencia.aplicar.
        "firma_en_curso": await vigencia.ciclo_activo(
            sesion, doc, await vigencia.firmado_vigente(sesion, doc)
        ),
    }


@router.put("/{documento_id}")
async def guardar(
    documento_id: int,
    datos: DatosDocumento,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    # Bloqueo de fila: serializa guardados concurrentes del MISMO
    # documento para que el versionado numere sin colisiones.
    doc = await _cargar(documento_id, sesion, con_bloqueo=True)
    # Documento elaborado fuera del sistema: el MISMO PUT corrige sus DATOS
    # (destinatario, asunto, fecha… — lo que ve la bandeja), sin cuerpo, sin
    # compilar y sin tocar la firma: el PDF que se firmó no cambia.
    if svc_incorporacion.es_manual(doc):
        await svc_incorporacion.actualizar_datos(sesion, doc, usuario, datos.campos)
        return {"ok": True, "estado": doc.estado, "firmado_invalidado": False}
    _exigir_plataforma(doc)
    await _preparar_escritura(sesion, doc, datos)
    # Normalización de redacción administrativa (mayúsculas -> convenciones;
    # ver docs/redaccion-administrativa.md y app/latex/redaccion.py).
    campos_nuevos = _campos_entrantes(doc.tipo, datos.campos)
    # Las copias se ordenan SOLAS según el orden institucional de la entidad
    # (Oficialía → Mesa Directiva → comisión → grupo → enlace; Edison
    # 2026-09-05), sin que nadie tenga que acomodarlas a mano.
    if campos_nuevos.get("con_copia"):
        campos_nuevos["con_copia"] = svc_copias.ordenar_copias(campos_nuevos["con_copia"])
    # Vigencia de la firma (Edison 2026-09-01; regla única desde 2026-10-06 en
    # servicios/vigencia.py): si cambia LO IMPRESO y el documento ya estaba
    # firmado, se anula la firma y vuelve a «pendiente de firma» (APROBADO).
    # La huella previa se toma ANTES de pisar campos/cuerpo. El número no cambia.
    antes = await vigencia.huella_impresa(sesion, doc)
    # Un Guardar sin cambios no crea versión ni figura como edición
    # (2026-10-05): llenaba el historial de copias idénticas y hacía decir
    # «última edición de X» a quien solo abrió y guardó.
    cambio = _contenido_cambia(doc, campos_nuevos, datos.cuerpo)
    doc.campos = campos_nuevos
    doc.cuerpo = datos.cuerpo
    # Las citas del cuerpo (nodos `referencia` del editor) son relaciones: se agregan las
    # nuevas y se quitan las que ya no están (servicios/relaciones.py, 2026-10-06).
    await svc_relaciones.sincronizar(sesion, f"doc:{doc.id}", "cuerpo", datos.cuerpo, usuario.id)
    # Un oficio que cita en su Referencia el n.º STD de un documento RECIBIDO queda vinculado
    # a él (bandeja de entrada, servicios/entradas.py, 2026-10-06).
    await svc_entradas.conciliar_seguro(sesion, doc, usuario.id)
    vig = await vigencia.aplicar(
        sesion, doc, usuario, antes, "modificación del documento", datos.confirmar_anulacion
    )
    doc.version_contenido = (doc.version_contenido or 0) + 1
    if cambio and not (datos.auto and await bitacora.automatico_reciente(sesion, doc.id, usuario)):
        await bitacora.versionar(sesion, doc, usuario, bitacora.NOTA_AUTOMATICO if datos.auto else "Guardado")
        bitacora.registrar(sesion, doc.id, usuario, "editado")
    # El PDF se regenera en el MISMO guardado, numerado o borrador, para que
    # datos guardados, PDF y pantalla SIEMPRE coincidan (Edison 2026-09-01
    # para los numerados; 2026-09-14 también para los borradores: «el visor
    # debe mostrar lo que está en el formulario» — guardar un borrador y ver
    # la vista previa vieja se leía como «no se guardó»). compilar() renombra
    # la carpeta si cambió fecha/sumilla, actualiza pdf_archivo + folios y
    # hace el commit; si LaTeX falla, el contenido ya quedó guardado y se
    # informa `compilado=false` en vez de un error.
    resultado = await _compilar_sin_perder(sesion, doc, rapido=bool(datos.auto))
    respuesta = {
        "ok": True,
        "estado": doc.estado,
        **vig.respuesta(),
        "version": doc.version_contenido,
        **resultado,
    }
    respuesta["agenda_propuesta"] = await _agendar(sesion, doc, usuario)
    return respuesta


@router.put("/{documento_id}/folios")
async def cambiar_folios(
    documento_id: int,
    cambio: CambioFolios,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Registra el número de folios del documento físico (metadato de la
    bandeja; no toca el contenido, así que vale también para heredados)."""
    if cambio.folios is not None and cambio.folios < 0:
        raise HTTPException(422, "El número de folios no puede ser negativo.")
    doc = await _cargar(documento_id, sesion)
    doc.folios = cambio.folios
    bitacora.registrar(
        sesion, doc.id, usuario, "folios",
        f"Folios: {cambio.folios if cambio.folios is not None else '—'}",
    )
    await sesion.commit()
    return {"ok": True, "folios": doc.folios}


@router.put("/{documento_id}/oculto")
async def cambiar_oculto(
    documento_id: int,
    cambio: CambioOculto,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Oculta/muestra un documento (SOLO administrador). Un documento oculto
    es invisible para los demás roles (bandeja, apertura y sincronización) y
    la bandeja del admin lo relega al final. No elimina nada."""
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador puede ocultar documentos.")
    doc = await _cargar(documento_id, sesion)
    doc.oculto = cambio.oculto
    bitacora.registrar(
        sesion, doc.id, usuario, "oculto",
        "Documento OCULTADO (invisible para los demás roles)"
        if cambio.oculto
        else "Documento visible de nuevo para todos los roles",
    )
    await sesion.commit()
    return {"ok": True, "oculto": doc.oculto}


@router.delete("/{documento_id}")
async def eliminar_documento(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Elimina un documento. El administrador puede eliminar cualquiera;
    una secretaria, solo sus propios borradores aún sin número. Documentos
    numerados: solo el ÚLTIMO de su serie (el contador retrocede; un número
    intermedio se ARCHIVA, nunca se borra — sin saltos de numeración)."""
    doc = await _cargar(documento_id, sesion, con_bloqueo=True)
    if usuario.rol != "administrador":
        propio_borrador = (
            doc.creado_por == usuario.id
            and doc.numero is None
            and doc.origen == "sgdp"
        )
        if not propio_borrador:
            raise HTTPException(
                403,
                "No tiene permiso para eliminar este documento. "
                "Solo el administrador puede eliminar documentos oficiales.",
            )
    await eliminacion.eliminar(sesion, doc)
    return {"ok": True}


# ------------------------------ compilación --------------------------

@router.post("/{documento_id}/previsualizar")
async def previsualizar(
    documento_id: int,
    datos: DatosDocumento,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Guarda y compila SIN consumir número (S/N si es borrador)."""
    doc = await _cargar(documento_id, sesion, con_bloqueo=True)
    _exigir_plataforma(doc)
    await _preparar_escritura(sesion, doc, datos)
    campos_nuevos = _campos_entrantes(doc.tipo, datos.campos)
    # Las copias se ordenan SOLAS según el orden institucional de la entidad
    # (Oficialía → Mesa Directiva → comisión → grupo → enlace; Edison
    # 2026-09-05), sin que nadie tenga que acomodarlas a mano.
    if campos_nuevos.get("con_copia"):
        campos_nuevos["con_copia"] = svc_copias.ordenar_copias(campos_nuevos["con_copia"])
    antes = await vigencia.huella_impresa(sesion, doc)
    # La vista previa también GUARDA (siempre lo hizo), pero no dejaba rastro:
    # el 14-09 hubo que reconstruir a ciegas quién cambió qué. Ahora, si el
    # contenido cambia, queda el evento y una versión restaurable, igual que
    # Guardar (solo si cambia: la vista previa automática del formato se
    # dispara a cada ajuste).
    if _contenido_cambia(doc, campos_nuevos, datos.cuerpo):
        doc.campos = campos_nuevos
        doc.cuerpo = datos.cuerpo
        await svc_relaciones.sincronizar(sesion, f"doc:{doc.id}", "cuerpo", datos.cuerpo, usuario.id)
        doc.version_contenido = (doc.version_contenido or 0) + 1
        await bitacora.versionar(sesion, doc, usuario, "Vista previa")
        bitacora.registrar(sesion, doc.id, usuario, "editado", "vista previa")
    # Un ajuste de formato también cambia lo impreso: antes anulaba la firma
    # en silencio; ahora la web pregunta antes (409 `anula_firma`).
    vig = await vigencia.aplicar(
        sesion, doc, usuario, antes, "modificación del documento", datos.confirmar_anulacion
    )
    await compilacion.compilar(sesion, doc)
    respuesta = {
        "ok": True,
        "estado": doc.estado,
        **vig.respuesta(),
        "version": doc.version_contenido,
        "estado_compilacion": doc.estado_compilacion or {},
    }
    respuesta["agenda_propuesta"] = await _agendar(sesion, doc, usuario)
    return respuesta


@router.post("/{documento_id}/generar")
async def generar_oficial(
    documento_id: int,
    datos: DatosDocumento,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Asigna número oficial (una única vez, transacción ACID) y compila.

    Antes de numerar —que es irreversible— EXIGE que se hayan verificado las
    copias (c.c.): un oficio con copia a quien ya no ocupa el cargo es un error
    con membrete, y el número ya no se devuelve. La guarda solo corre en la
    PRIMERA generación; regenerar el PDF de un documento ya numerado no vuelve
    a preguntar (Edison 2026-09-05).
    """
    doc = await _cargar(documento_id, sesion, con_bloqueo=True)
    _exigir_plataforma(doc)
    await _preparar_escritura(sesion, doc, datos)
    campos_nuevos = _campos_entrantes(doc.tipo, datos.campos)
    # Las copias se ordenan SOLAS según el orden institucional de la entidad
    # (Oficialía → Mesa Directiva → comisión → grupo → enlace; Edison
    # 2026-09-05), sin que nadie tenga que acomodarlas a mano.
    if campos_nuevos.get("con_copia"):
        campos_nuevos["con_copia"] = svc_copias.ordenar_copias(campos_nuevos["con_copia"])
    if doc.numero is None and not datos.copias_verificadas:
        # Se revisa TODO lo que obliga a rehacer el documento con otro número
        # si está mal —destinatario, asunto, fecha y copias—, no solo las
        # copias (Edison 2026-09-05). Ver servicios/verificacion.py.
        sugerencias = await svc_copias.sugeridas(sesion, doc.tipo)
        # Lo que el directorio dice HOY del destinatario y de cada copia se ofrece al lado (nunca se
        # aplica solo; servicios/verificacion.segun_directorio, 2026-10-12).
        puntos_v, copias_v = await svc_verif.segun_directorio(
            sesion, campos_nuevos, svc_verif.puntos(doc, campos_nuevos),
            svc_copias.resumen(campos_nuevos.get("con_copia", "")))
        raise HTTPException(
            409,
            {
                "codigo": "verificacion_pendiente",
                "mensaje": (
                    "Revise los datos del documento antes de numerarlo: el "
                    "número no se puede deshacer."
                ),
                "puntos": puntos_v,
                "copias": copias_v,
                "sugeridas": svc_copias.faltantes(
                    campos_nuevos.get("con_copia", ""), sugerencias
                ),
            },
        )
    # Si ya estaba firmado y lo impreso cambia, se anula la firma (vuelve a
    # APROBADO). Al (re)generar un documento ya numerado, aplica igual. Se
    # evalúa ANTES de numerar: un borrador no tiene firma que anular.
    antes = await vigencia.huella_impresa(sesion, doc)
    doc.campos = campos_nuevos
    doc.cuerpo = datos.cuerpo
    # Las citas del cuerpo (nodos `referencia` del editor) son relaciones: se agregan las
    # nuevas y se quitan las que ya no están (servicios/relaciones.py, 2026-10-06).
    await svc_relaciones.sincronizar(sesion, f"doc:{doc.id}", "cuerpo", datos.cuerpo, usuario.id)
    # Un oficio que cita en su Referencia el n.º STD de un documento RECIBIDO queda vinculado
    # a él (bandeja de entrada, servicios/entradas.py, 2026-10-06).
    await svc_entradas.conciliar_seguro(sesion, doc, usuario.id)
    vig = await vigencia.aplicar(
        sesion, doc, usuario, antes, "modificación del documento", datos.confirmar_anulacion
    )
    doc.version_contenido = (doc.version_contenido or 0) + 1
    if doc.numero is None:
        doc.numero = await asignar_siguiente(sesion, doc)
        # Leídos ANTES del flush: tras un fallo el objeto no se puede consultar.
        numero, serie, periodo = doc.numero, doc.serie, doc.periodo
        try:
            await sesion.flush()
        except IntegrityError:
            # El contador de la serie va por detrás de un número ya usado (una base sembrada o
            # migrada a mano): antes salía un 500 en texto plano (auditoría 2026-10-10, GD-01).
            # No se toca `contadores` desde aquí (invariante de numeración): se informa.
            await sesion.rollback()
            raise HTTPException(
                409,
                f"El número {numero:04d} de la serie {serie} {periodo} ya existe: el contador va "
                "por detrás de los documentos registrados. Avise al administrador para reconciliarlo.",
            )
        doc.estado = "APROBADO"
        bitacora.registrar(
            sesion, doc.id, usuario, "numerado",
            f"Número oficial asignado: {doc.numero:04d}",
        )
        await eventos_sistema.emitir_seguro(sesion, "documento.numerado", f"doc:{doc.id}", _datos_evento_doc(doc, usuario), usuario=usuario)
        # Qué se dio por bueno al numerar: si mañana aparece un dato mal, la
        # bitácora dice quién lo confirmó y con qué valor.
        confirmadas = svc_copias.resumen(campos_nuevos.get("con_copia", ""))
        revisados = [
            f"{p['etiqueta']}: {p['valor'][:80] or '(vacío)'}"
            for p in svc_verif.puntos(doc, campos_nuevos)
            if p["confirmar"]
        ]
        bitacora.registrar(
            sesion, doc.id, usuario, "datos_verificados",
            "Verificado al numerar — "
            + " · ".join(revisados)
            + " · Copias: "
            + ("; ".join(f"{c['nombre']} ({c['cargo']})" for c in confirmadas)
               if confirmadas else "sin copias"),
        )
    else:
        # Regenerar uno ya numerado también queda en el historial (2026-10-08: «toda acción
        # registrada: quién generó el documento y a qué hora»).
        bitacora.registrar(sesion, doc.id, usuario, "generado", f"Regeneró el PDF de {numero_mostrado(doc)}")
    await bitacora.versionar(
        sesion, doc, usuario,
        f"Generado {'N°%04d' % doc.numero if doc.numero else 'S/N'}",
    )
    # Lo numerado sale COMPLETO: aquí no se aceptan reparaciones que pierdan contenido (tablas,
    # imágenes); si hacen falta, el error se explica y no se numera a medias (2026-10-12).
    await compilacion.compilar(sesion, doc, permitir_perdida=False)
    respuesta = {
        "ok": True,
        "numero": doc.numero,
        "numero_completo": numero_mostrado(doc),
        "estado": doc.estado,
        **vig.respuesta(),
        "version": doc.version_contenido,
    }
    respuesta["agenda_propuesta"] = await _agendar(sesion, doc, usuario)
    return respuesta


@router.get("/{documento_id}/pdf")
async def descargar_pdf(
    documento_id: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    doc = await _cargar(documento_id, sesion)
    ruta = svc_pdf.principal(doc)
    if ruta is None:
        raise HTTPException(404, "Aún no se ha generado un PDF.")
    return enviar_archivo(ruta, ruta.name, peticion=peticion)


# ------------------------------ flujo de estados ---------------------

@router.put("/{documento_id}/estado")
async def cambiar_estado(
    documento_id: int,
    cambio: CambioEstado,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Avanza el documento por el flujo (revisión, aprobación, firma,
    envío, archivo). Valida la transición y el permiso del rol. El paso
    a APROBADO se hace por /generar (asigna número)."""
    if cambio.estado not in ESTADOS_VALIDOS:
        raise HTTPException(422, f"Estado no válido: {cambio.estado}")
    doc = await _cargar(documento_id, sesion)
    anterior = doc.estado
    if anterior == cambio.estado:
        return {"ok": True, "estado": doc.estado}
    if not transicion_permitida(anterior, cambio.estado, usuario.rol):
        raise HTTPException(
            409,
            f"No se permite pasar de «{anterior}» a «{cambio.estado}» "
            f"con el rol «{usuario.rol}».",
        )
    # APROBADO exige número: se llega SOLO por /generar (evita oficiales
    # sin numeración al reactivar desde ARCHIVADO un borrador sin número).
    if cambio.estado == "APROBADO" and doc.numero is None:
        raise HTTPException(
            409,
            "Este documento aún no tiene número oficial. Use «Generar "
            "oficial» para aprobarlo y numerarlo.",
        )
    # --- Observar EXIGE decir qué corregir (§3, Edison 2026-09-04) --------
    # «Observado» sin explicación no le sirve a quien tiene que arreglarlo. La
    # guarda está aquí y no en flujo.py a propósito: la matriz de transiciones
    # responde QUIÉN puede, este endpoint responde BAJO QUÉ CONDICIONES.
    texto = (cambio.comentario or "").strip()
    if cambio.estado in ("OBSERVADO", "OBSERVADO_ENVIADO"):
        abiertas = await svc_com.pendientes(sesion, doc.id, tipo="observacion")
        if len(texto) < svc_com.LARGO_MINIMO and not abiertas:
            raise HTTPException(
                409,
                "Para observar el documento debe registrar primero la "
                "observación: escriba qué se debe corregir, para que quien lo "
                "redactó sepa exactamente qué cambiar.",
            )

    # --- Encargo al devolver a borrador (§4) ------------------------------
    # Devolver a BORRADOR puede venir con la indicación del trabajo a realizar
    # y con la persona a la que se le encarga (el diputado u otra).
    if cambio.responsable_id is not None:
        destino_u = await sesion.get(Usuario, cambio.responsable_id)
        if destino_u is None or not destino_u.activo:
            raise HTTPException(422, "La persona indicada no es una cuenta activa.")
        # Delegar la revisión a quien no puede revisar (prensa, secretaría, invitado) dejaba el
        # documento esperando a alguien que el flujo no autoriza (auditoría 2026-10-10, GD-06).
        if cambio.estado == "EN_REVISION" and not transicion_permitida("EN_REVISION", "OBSERVADO", destino_u.rol):
            raise HTTPException(
                422,
                f"{destino_u.nombre_completo} no puede revisar documentos (rol «{destino_u.rol}»): "
                "elija a un asesor, al titular o al administrador.",
            )
        if doc.responsable_id != destino_u.id:
            sesion.add(
                Asignacion(
                    documento_id=doc.id,
                    responsable_id=destino_u.id,
                    asignado_por=usuario.id,
                    nota=texto,
                )
            )
            doc.responsable_id = destino_u.id
            bitacora.registrar(
                sesion, doc.id, usuario, "responsable",
                f"Encargado a {destino_u.nombre_completo}",
            )

    # El comentario acompaña al cambio en la MISMA transacción: si el cambio de
    # estado falla, no queda una observación huérfana.
    if len(texto) >= svc_com.LARGO_MINIMO:
        # La intención se deduce del destino: al observar es una observación
        # (pendiente de corregir); al devolver a borrador, la indicación del
        # encargo; en cualquier otro paso, una nota de contexto.
        tipo = (
            "observacion"
            if cambio.estado in ("OBSERVADO", "OBSERVADO_ENVIADO")
            else "indicacion" if cambio.estado == "BORRADOR" else "nota"
        )
        svc_com.crear(
            sesion, doc.id, usuario, texto, tipo=tipo,
            estado_destino=cambio.estado, dirigido_a=doc.responsable_id,
        )

    # --- Levantar observaciones al reenviar a revisión --------------------
    # Cierra el circuito del §3: Documento → observación → corrección →
    # reenvío. Al salir de OBSERVADO hacia revisión, lo observado se da por
    # atendido (con la respuesta de quien corrigió, si la escribió).
    levantadas = 0
    if anterior in ("OBSERVADO", "OBSERVADO_ENVIADO") and cambio.estado in (
        "EN_REVISION",
        "ENVIADO",
    ):
        for c in await svc_com.pendientes(sesion, doc.id, tipo="observacion"):
            svc_com.levantar(c, usuario, texto)
            levantadas += 1
        if levantadas:
            bitacora.registrar(
                sesion, doc.id, usuario, "comentario_levantado",
                f"{levantadas} observación(es) atendidas al reenviar a revisión",
            )

    estado_anterior = doc.estado
    doc.estado = cambio.estado
    # El evento `documento.estado` y, firmado o enviado, los recibidos que responde: lo
    # mismo que un cambio automático (servicios/envio.anunciar_estado).
    await envio.anunciar_estado(sesion, doc, usuario, estado_anterior)
    bitacora.registrar(
        sesion, doc.id, usuario, "estado",
        f"{anterior} → {cambio.estado}" + (f" · {texto[:200]}" if texto else ""),
    )
    # Reactivado desde ARCHIVADO con su firmado vigente: el paso manual se cumple tal cual y
    # la regla lo lleva a FIRMADO, como al subir el firmado (2026-10-19).
    if anterior == "ARCHIVADO" and doc.estado == "APROBADO":
        await envio.al_dia(sesion, doc, usuario, "reactivado con su documento firmado")
    await sesion.commit()
    return {
        "ok": True,
        "estado": doc.estado,
        "transiciones": transiciones_para(doc.estado, usuario.rol),
        "observaciones_levantadas": levantadas,
        "responsable_id": doc.responsable_id,
    }


# ------------------------------ historial y versiones ----------------

@router.get("/{documento_id}/historial")
async def historial(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Bitácora: qué pasó y cuándo (más reciente primero). QUIÉN lo hizo
    es dato interno del equipo (`ve_autoria`: todos menos el invitado);
    nunca sale en el documento oficial."""
    await _cargar(documento_id, sesion)
    filas = (
        await sesion.execute(
            select(Evento, Usuario.nombre_completo)
            .join(Usuario, Usuario.id == Evento.usuario_id)
            .where(Evento.documento_id == documento_id)
            .order_by(Evento.fecha.desc())
        )
    ).all()
    autoria = ve_autoria(usuario)
    return [
        {
            "accion": ev.accion,
            "detalle": ev.detalle,
            "usuario": nombre if autoria else "",
            "fecha": ev.fecha.isoformat(),
        }
        for ev, nombre in filas
    ]


@router.get("/{documento_id}/versiones")
async def listar_versiones(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Versiones guardadas (metadatos), más reciente primero. El autor de
    cada versión es dato interno del equipo (ver `ve_autoria`)."""
    doc = await _cargar(documento_id, sesion)
    filas = (
        await sesion.execute(
            select(VersionDocumento, Usuario.nombre_completo)
            .join(Usuario, Usuario.id == VersionDocumento.creado_por)
            .where(VersionDocumento.documento_id == documento_id)
            .order_by(VersionDocumento.numero_version.desc())
        )
    ).all()
    autoria = ve_autoria(usuario)
    return [
        {
            "numero_version": v.numero_version,
            "nota": v.nota,
            "asunto": asunto_de(doc.tipo, v.campos),
            "usuario": nombre if autoria else "",
            "creado_en": v.creado_en.isoformat(),
        }
        for v, nombre in filas
    ]


class CambioColaboracion(BaseModel):
    activa: bool


@router.patch("/{documento_id}/colaboracion")
async def cambiar_colaboracion(
    documento_id: int,
    datos: CambioColaboracion,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Enciende o apaga la edición simultánea del documento (paso 5.6). Solo
    en borradores y numerados sin firmar; apagarla se niega si queda texto
    escrito en compartido sin guardar (el editor guarda antes). Encender o
    apagar sube la generación: el texto compartido nace de lo guardado."""
    if usuario.rol == "invitado":
        raise HTTPException(403, "El rol invitado solo puede leer.")
    doc = await _cargar(documento_id, sesion, con_bloqueo=True)
    if datos.activa and not svc_colab.documento_compartible(doc):
        raise HTTPException(
            409,
            {"codigo": "no_compartible", "mensaje": "Solo se edita en simultáneo un documento hecho en el sistema que aún no está firmado ni enviado."},
        )
    if not datos.activa and svc_colab.documento_sin_versionar(doc):
        raise HTTPException(
            409,
            {"codigo": "sin_versionar", "mensaje": "Hay texto escrito en compartido sin guardar. Guarde antes de apagar la edición simultánea."},
        )
    if bool(doc.colaboracion) != datos.activa:
        doc.colaboracion = datos.activa
        await svc_colab.reiniciar_documento(sesion, doc)
        bitacora.registrar(
            sesion, doc.id, usuario, "estado",
            "Encendió la edición simultánea" if datos.activa else "Apagó la edición simultánea",
        )
        await sesion.commit()
    return {"colaboracion": svc_colab.documento_en_vivo(doc), "generacion": doc.colab_gen}


@router.get("/{documento_id}/versiones/{numero_version}")
async def obtener_version(
    documento_id: int,
    numero_version: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Contenido completo de una versión (campos + cuerpo), para que el
    editor muestre qué cambió entre dos versiones (2026-10-05). Leer no
    restaura nada."""
    doc = await _cargar(documento_id, sesion)
    if doc.oculto and usuario.rol != "administrador":
        raise HTTPException(404, "El documento no existe.")
    fila = (
        await sesion.execute(
            select(VersionDocumento, Usuario.nombre_completo)
            .join(Usuario, Usuario.id == VersionDocumento.creado_por)
            .where(
                VersionDocumento.documento_id == documento_id,
                VersionDocumento.numero_version == numero_version,
            )
        )
    ).first()
    if fila is None:
        raise HTTPException(404, "La versión no existe.")
    v, nombre = fila
    return {
        "numero_version": v.numero_version,
        "nota": v.nota,
        "usuario": nombre if ve_autoria(usuario) else "",
        "creado_en": v.creado_en.isoformat(),
        "campos": v.campos,
        "cuerpo": v.cuerpo,
    }


@router.post("/{documento_id}/versiones/{numero_version}/restaurar")
async def restaurar_version(
    documento_id: int,
    numero_version: int,
    confirmar_anulacion: bool | None = None,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Restaura una versión anterior: NO borra nada, crea una versión
    nueva con ese contenido (queda todo en el historial)."""
    doc = await _cargar(documento_id, sesion, con_bloqueo=True)
    _exigir_plataforma(doc)
    version = (
        await sesion.execute(
            select(VersionDocumento).where(
                VersionDocumento.documento_id == documento_id,
                VersionDocumento.numero_version == numero_version,
            )
        )
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(404, "La versión no existe.")
    antes = await vigencia.huella_impresa(sesion, doc)
    doc.campos = dict(version.campos)
    doc.cuerpo = dict(version.cuerpo)
    await svc_relaciones.sincronizar(sesion, f"doc:{doc.id}", "cuerpo", doc.cuerpo, usuario.id)
    # Restaurar también cambia lo impreso: antes no anulaba la firma.
    vig = await vigencia.aplicar(
        sesion, doc, usuario, antes, f"restauración de la versión {numero_version}",
        confirmar_anulacion,
    )
    doc.version_contenido = (doc.version_contenido or 0) + 1
    if doc.colaboracion:
        # Reemplazo por fuera de Yjs: los que están en compartido recargan.
        await svc_colab.reiniciar_documento(sesion, doc)
    await bitacora.versionar(
        sesion, doc, usuario, f"Restaurada la versión {numero_version}"
    )
    bitacora.registrar(
        sesion, doc.id, usuario, "restaurado",
        f"Restaurada la versión {numero_version}",
    )
    await sesion.commit()
    return {"ok": True, "version": doc.version_contenido, "estado": doc.estado, **vig.respuesta()}


# --------------------------- documentos relacionados -----------------

class NuevaRelacion(BaseModel):
    destino_id: int
    tipo: str = "relacionado"  # 'relacionado' (simétrico) | 'responde' (dirigido)
    nota: str = ""


def _etiqueta_relacion(tipo: str, sale: bool) -> str:
    """Cómo se lee la relación DESDE el documento consultado. 'responde' es
    dirigido: el origen es la respuesta; 'relacionado' es simétrico."""
    if tipo == "responde":
        return "Responde a" if sale else "Respondido por"
    return "Relacionado con"


def _etiqueta_externa(tipo: str) -> str:
    """Etiqueta de un vínculo con documento EXTERNO, leída desde el interno."""
    return {"responde": "Responde a", "respondido": "Respondido por"}.get(
        tipo, "Relacionado con"
    )


@router.get("/{documento_id}/relaciones")
async def listar_relaciones(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Documentos vinculados a este (salientes y entrantes), con la etiqueta ya
    orientada y los datos del otro documento para enlazarlo."""
    await _cargar(documento_id, sesion)
    rels = list(
        (
            await sesion.execute(
                select(DocumentoRelacion).where(
                    or_(
                        DocumentoRelacion.origen_id == documento_id,
                        DocumentoRelacion.destino_id == documento_id,
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    if not rels:
        return []
    # Cargar el otro documento SOLO de los vínculos internos (destino no nulo).
    otros_ids = {
        (r.destino_id if r.origen_id == documento_id else r.origen_id)
        for r in rels
        if r.destino_id is not None
    }
    otros = (
        {
            d.id: d
            for d in (
                await sesion.execute(
                    select(Documento).where(Documento.id.in_(otros_ids))
                )
            )
            .scalars()
            .all()
        }
        if otros_ids
        else {}
    )
    # Archivos (adjuntos categoría 'respuesta') de las relaciones externas.
    externas_ids = [r.id for r in rels if r.destino_id is None]
    adj_por_rel: dict[int, list] = {}
    if externas_ids:
        adjs = (
            await sesion.execute(
                select(Adjunto).where(Adjunto.relacion_id.in_(externas_ids))
            )
        ).scalars().all()
        for a in adjs:
            adj_por_rel.setdefault(a.relacion_id, []).append(
                {"id": a.id, "nombre": a.nombre_original}
            )
    salida = []
    for r in rels:
        if r.destino_id is None:
            # Documento EXTERNO: datos embebidos en la propia fila.
            salida.append(
                {
                    "relacion_id": r.id,
                    "tipo": r.tipo,
                    "sale": True,
                    "externo": True,
                    "etiqueta": _etiqueta_externa(r.tipo),
                    "nota": r.nota,
                    "tiene_archivo": len(adj_por_rel.get(r.id, [])) > 0,
                    "archivos": adj_por_rel.get(r.id, []),
                    "documento": {
                        "id": None,
                        "numero_completo": r.externo_numero or "(sin número)",
                        "tipo_nombre": r.externo_tipo or "Documento externo",
                        "estado": "externo",
                        "asunto": r.externo_asunto,
                        "institucion": r.externo_institucion,
                        "fecha": r.externo_fecha,
                    },
                }
            )
            continue
        sale = r.origen_id == documento_id
        otro = otros.get(r.destino_id if sale else r.origen_id)
        if otro is None or (otro.oculto and usuario.rol != "administrador"):
            continue
        salida.append(
            {
                "relacion_id": r.id,
                "tipo": r.tipo,
                "sale": sale,
                "externo": False,
                "etiqueta": _etiqueta_relacion(r.tipo, sale),
                "nota": r.nota,
                "tiene_archivo": False,
                "documento": {
                    "id": otro.id,
                    "numero_completo": numero_mostrado(otro),
                    "tipo_nombre": tipo_config(otro.tipo)["nombre"],
                    "estado": otro.estado,
                    "asunto": asunto_de(otro.tipo, otro.campos),
                },
            }
        )
    # Respuestas primero, luego relacionados; entrantes antes que salientes.
    orden = {"responde": 0, "respondido": 0, "relacionado": 1}
    salida.sort(key=lambda x: (orden.get(x["tipo"], 9), x["sale"]))
    return salida


@router.post("/{documento_id}/relaciones")
async def crear_relacion(
    documento_id: int,
    datos: NuevaRelacion,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if datos.tipo not in ("relacionado", "responde"):
        raise HTTPException(422, "Tipo de relación no válido.")
    if datos.destino_id == documento_id:
        raise HTTPException(422, "Un documento no se vincula consigo mismo.")
    await _cargar(documento_id, sesion)
    destino = await _cargar(datos.destino_id, sesion)  # 404 si no existe
    # ¿Ya existe el mismo vínculo? Para 'relacionado' (simétrico) también en
    # sentido inverso (A-B == B-A).
    condiciones = [
        (DocumentoRelacion.origen_id == documento_id)
        & (DocumentoRelacion.destino_id == datos.destino_id)
    ]
    if datos.tipo == "relacionado":
        condiciones.append(
            (DocumentoRelacion.origen_id == datos.destino_id)
            & (DocumentoRelacion.destino_id == documento_id)
        )
    existe = (
        await sesion.execute(
            select(DocumentoRelacion).where(
                DocumentoRelacion.tipo == datos.tipo, or_(*condiciones)
            )
        )
    ).scalar_one_or_none()
    if existe is not None:
        raise HTTPException(409, "Ese vínculo ya existe.")
    rel = DocumentoRelacion(
        origen_id=documento_id,
        destino_id=datos.destino_id,
        tipo=datos.tipo,
        nota=datos.nota or "",
        creado_por=usuario.id,
    )
    sesion.add(rel)
    verbo = "responde a" if datos.tipo == "responde" else "relacionado con"
    bitacora.registrar(
        sesion, documento_id, usuario, "vinculado",
        f"Vinculado ({verbo}) {numero_mostrado(destino)}",
    )
    await sesion.commit()
    return {"relacion_id": rel.id}


@router.post("/{documento_id}/relaciones-externas")
async def crear_relacion_externa(
    documento_id: int,
    tipo: str = Form("respondido"),
    numero: str = Form(""),
    doc_tipo: str = Form(""),
    institucion: str = Form(""),
    fecha: str = Form(""),
    asunto: str = Form(""),
    nota: str = Form(""),
    archivos: list[UploadFile] = File(default=[]),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Registra y vincula un documento EXTERNO (una respuesta que no está en el
    sistema): datos manuales + 0..N archivos digitales (multipart/form-data).
    Una respuesta puede llegar en VARIOS documentos (p. ej. el oficio del
    ministro + sus anexos)."""
    if tipo not in ("responde", "respondido", "relacionado"):
        raise HTTPException(422, "Tipo de relación no válido.")
    if not (numero.strip() or asunto.strip()):
        raise HTTPException(
            422, "Indique al menos el número o el asunto del documento externo."
        )
    doc = await _cargar(documento_id, sesion)
    rel = DocumentoRelacion(
        origen_id=documento_id,
        destino_id=None,
        tipo=tipo,
        externo_numero=numero.strip(),
        externo_tipo=doc_tipo.strip(),
        externo_institucion=institucion.strip(),
        externo_fecha=fecha.strip(),
        externo_asunto=asunto.strip(),
        nota=nota.strip(),
        creado_por=usuario.id,
    )
    sesion.add(rel)
    await sesion.flush()  # rel.id para ligar los archivos
    # Cada archivo (0..N) se guarda como Adjunto categoría 'respuesta' ligado a
    # la relación (relacion_id): se ven en el visor derecho como el firmado/las
    # constancias. svc_adjuntos.guardar valida extensión/tamaño y renombra.
    validos = [a for a in (archivos or []) if a is not None and a.filename]
    base_etq = numero.strip() or asunto.strip()[:60] or "documento externo"
    for i, archivo in enumerate(validos):
        # Si vienen varios, numerarlos para distinguirlos (p. ej. el oficio del
        # ministro y, aparte, el paquete de anexos).
        etq = base_etq if len(validos) == 1 else f"{base_etq} ({i + 1})"
        adj = await svc_adjuntos.guardar(
            sesion, doc, archivo, usuario, categoria="respuesta", etiqueta=etq,
        )
        adj.relacion_id = rel.id
    n_archivos = len(validos)
    bitacora.registrar(
        sesion, documento_id, usuario, "vinculado",
        "Registró respuesta externa: "
        + (numero.strip() or asunto.strip()[:40] or "documento externo")
        + (f" ({n_archivos} archivo{'s' if n_archivos != 1 else ''})" if n_archivos else ""),
    )
    await sesion.commit()
    return {"relacion_id": rel.id, "archivos": n_archivos}


@router.delete("/{documento_id}/relaciones/{relacion_id}")
async def eliminar_relacion(
    documento_id: int,
    relacion_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    rel = await sesion.get(DocumentoRelacion, relacion_id)
    if rel is None or documento_id not in (rel.origen_id, rel.destino_id):
        raise HTTPException(404, "El vínculo no existe.")
    # Borrar los archivos (Adjuntos categoría 'respuesta') de la respuesta
    # externa, si los hay.
    adjs = (
        await sesion.execute(
            select(Adjunto).where(Adjunto.relacion_id == relacion_id)
        )
    ).scalars().all()
    if adjs:
        doc = await _cargar(rel.origen_id, sesion)
        for adj in adjs:
            ruta = svc_adjuntos.ruta_en_disco(doc, adj)
            if ruta and ruta.is_file():
                ruta.unlink()
            await sesion.delete(adj)
    await sesion.execute(
        delete(DocumentoRelacion).where(DocumentoRelacion.id == relacion_id)
    )
    bitacora.registrar(
        sesion, documento_id, usuario, "desvinculado", "Se quitó un documento vinculado"
    )
    await sesion.commit()
    return {"ok": True}


# --- Documentos desde un Word (2026-10-18; fase 0 de docs/plataforma/formato-word.md) --------------


@router.post("/importar-word")
async def importar_word_documentos(
    archivo: UploadFile | None = File(None),
    token: str = Form(""),
    aplicar: bool = Form(False),
    indices: str = Form(""),
    tipos: str = Form(""),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Un `.docx` con uno o varios oficios → vista previa (qué documentos trae, con sus campos leídos y
    sus avisos) y, con `aplicar`, un borrador por cada índice elegido (`indices`: «1,3»; `tipos`:
    «1=oficio,3=carta» corrige el tipo detectado). El archivo espera una hora con su `token`; los
    documentos nacen `origen='sgdp'` y siguen el trámite de siempre. Nunca se numera aquí."""
    from app.servicios import importar_word_documentos as svc_word

    if usuario.rol == "invitado":
        raise HTTPException(403, "Su rol no permite crear documentos.")
    if archivo is not None:
        nombre = (archivo.filename or "").lower()
        if not nombre.endswith(".docx"):
            raise HTTPException(422, "Suba un archivo .docx (Word).")
        contenido = await archivo.read()
        if len(contenido) > 30 * 1024 * 1024:
            raise HTTPException(413, "El Word pesa más de 30 MB.")
        token = svc_word.guardar_temporal(contenido)
    ruta = svc_word.ruta_temporal(token)
    if ruta is None:
        raise HTTPException(410, "El Word ya no está a la espera (pasó una hora): vuelva a subirlo.")
    try:
        leidos = await asyncio.to_thread(svc_word.analizar, ruta)
    except Exception as e:  # noqa: BLE001 — un Word roto no es un 500
        logging.getLogger("sgdp.documentos").exception("No se pudo leer el Word de documentos")
        raise HTTPException(422, f"No se pudo leer el Word: {e}") from e
    if not aplicar:
        return {"token": token, "documentos": [d.como_dict() for d in leidos]}
    elegidos = {int(x) for x in indices.split(",") if x.strip().isdigit()} or {d.indice for d in leidos}
    correcciones = dict(par.split("=", 1) for par in tipos.split(",") if "=" in par)
    creados: list[dict] = []
    for d in leidos:
        if d.indice not in elegidos:
            continue
        cfg = tipo_config(correcciones.get(str(d.indice)) or d.tipo)
        doc = await _nuevo_borrador(sesion, usuario, cfg, d.campos, d.cuerpo,
                                    detalle=f"Nuevo borrador de {cfg['nombre'].lower()} desde un Word ({ruta.name})")
        creados.append({"id": doc.id, "indice": d.indice, "tipo": cfg["codigo"], "asunto": d.campos.get("asunto", "")})
    await sesion.commit()
    return {"creados": creados}


# --- Notas al pie de sustento normativo (2026-10-18) -------------------------------------------------


@router.get("/{documento_id}/notas-sugeridas")
async def notas_sugeridas(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Las notas de sustento que corresponden al documento según su tipo y su contenido
    (`servicios/notas_normativas.py`), con su fuente verificada en la biblioteca. Solo se OFRECEN:
    insertarlas es decisión de quien redacta, y se editan como cualquier nota."""
    from app.servicios import notas_normativas

    doc = await _cargar(documento_id, sesion)
    if doc.origen != "sgdp":
        return {"notas": []}
    tipos = await notas_normativas.tipos_vigentes(sesion)
    notas = await asyncio.to_thread(notas_normativas.sugerir, doc.tipo, doc.campos or {}, doc.cuerpo or {}, None, tipos)
    return {"notas": notas}


# --- Exportar a Word (2026-10-19) ---------------------------------------------------------------------


@router.get("/{documento_id}/docx")
async def exportar_docx(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """El documento como .docx (copia de trabajo: el PDF oficial sigue siendo el de LuaLaTeX). Se genera
    al momento desde lo guardado (`servicios/exportar_docx.py`); no se guarda ni se cachea."""
    from fastapi import Response as _Response
    from urllib.parse import quote

    from app.servicios import exportar_docx as svc_docx

    doc = await _cargar(documento_id, sesion)
    if doc.origen != "sgdp":
        raise HTTPException(409, "Este documento no tiene contenido en el editor: descargue su PDF.")
    cfg = tipo_config(doc.tipo)
    datos = await asyncio.to_thread(
        svc_docx.documento_a_docx, doc.campos or {}, doc.cuerpo or {},
        titulo=asunto_de(doc.tipo, doc.campos) or "", tipo_nombre=cfg["nombre"],
        numero_completo=numero_mostrado(doc) if doc.numero is not None else "",
    )
    nombre = svc_docx.nombre_docx(numero_mostrado(doc) if doc.numero is not None else "", asunto_de(doc.tipo, doc.campos) or "", cfg["nombre"])
    return _Response(datos, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                     headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nombre)}", "Cache-Control": "no-store"})


@router.get("/{documento_id}/md")
async def exportar_md(
    documento_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """El documento como Markdown (para un prompt, el chat o una nota); `servicios/exportar_md.py`."""
    from fastapi import Response as _Response
    from urllib.parse import quote

    from app.servicios import exportar_docx as svc_docx
    from app.servicios import exportar_md as svc_md

    doc = await _cargar(documento_id, sesion)
    if doc.origen != "sgdp":
        raise HTTPException(409, "Este documento no tiene contenido en el editor: descargue su PDF.")
    numero = numero_mostrado(doc) if doc.numero is not None else ""
    texto = svc_md.documento_a_md(doc.campos or {}, doc.cuerpo or {}, titulo=asunto_de(doc.tipo, doc.campos) or "", numero_completo=numero)
    nombre = svc_docx.nombre_docx(numero, asunto_de(doc.tipo, doc.campos) or "", tipo_config(doc.tipo)["nombre"]).replace(".docx", ".md")
    return _Response(texto, media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nombre)}", "Cache-Control": "no-store"})

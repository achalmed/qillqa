"""Router del directorio institucional: instituciones, personas y enlaces.

Lecturas (buscar/listar/sugerencias) para cualquier usuario autenticado (las
usa el autocompletado del formulario). Crear y editar TAMBIÉN para cualquier
usuario: el flujo pedido es actualizar el dato (p. ej. cambió un ministro)
desde el propio formulario, sin pasar por una sección administrativa; cada
escritura queda en la bitácora. Desactivar (DELETE) e importar siguen siendo
SOLO administrador — la protección real está aquí, no en ocultar la UI.
"""

import hashlib
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.archivos import enviar_archivo
from app.config import config, raiz_documentos
from app.db import obtener_sesion
from app.modelos import ContactoFavorito, Enlace, Institucion, Persona, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios.eventos_bandeja import anotar_bitacora
from app.servicios import contactos as svc_contactos
from app.servicios import directorio as svc
from app.servicios import mesas_partes as mp

router = APIRouter(prefix="/api/directorio", tags=["directorio"])


# ------------------------------ modelos de entrada -------------------

class InstitucionEntrada(BaseModel):
    nombre: str
    siglas: str = ""
    tipo: str = "otro"
    sector: str = ""
    nivel_gobierno: str = ""
    parent_id: int | None = None
    region: str = ""
    url_oficial: str = ""
    url_mesa_partes: str = ""
    email: str = ""
    telefono: str = ""
    direccion: str = ""
    ruc: str = ""
    activo: bool = True
    notas: str = ""
    categoria: str = ""
    orden: int = 0
    fuente: str = ""
    url_fuente: str = ""
    fecha_consulta: str = ""
    norma: str = ""


class PersonaEntrada(BaseModel):
    """Ficha de contacto de una autoridad o funcionario. Ampliada el
    2026-09-04 a pedido de Edison: además del correo institucional, el
    CELULAR (el dato que más se usa), el ANEXO (vía interna del Congreso),
    la oficina/sede y el área. Todos opcionales."""
    nombre: str
    cargo: str = ""
    tratamiento: str = ""
    institucion_id: int | None = None
    email: str = ""
    email_alterno: str = ""
    telefono: str = ""
    celular: str = ""
    anexo: str = ""
    oficina: str = ""
    area: str = ""
    activo: bool = True
    notas: str = ""
    # Contactos (2026-10-13): las etiquetas o grupos. None = no se tocan (quien edita sin ellas,
    # como el formulario de un documento, no las borra).
    etiquetas: list[str] | None = None


class EnlaceEntrada(BaseModel):
    tipo: str = "otro"
    url: str
    etiqueta: str = ""


# ------------------------------ estado / import ----------------------

@router.get("/estado")
async def estado(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Conteos del directorio (para la cabecera de la página)."""
    n_inst = (await sesion.execute(select(func.count()).select_from(Institucion))).scalar()
    n_pers = (await sesion.execute(select(func.count()).select_from(Persona))).scalar()
    por_tipo = dict(
        (
            await sesion.execute(
                select(Institucion.tipo, func.count())
                .where(Institucion.activo.is_(True))
                .group_by(Institucion.tipo)
            )
        ).all()
    )
    return {"instituciones": n_inst, "personas": n_pers, "por_tipo": por_tipo}


@router.get("/sugerencias")
async def sugerencias(
    q: str = "",
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Autocompletado del formulario: personas (con el nombre de su
    institución) + instituciones que casan con `q`, en UNA llamada."""
    personas = await svc.buscar_personas(sesion, q, limite=8)
    inst_ids = {p.institucion_id for p in personas if p.institucion_id}
    nombres: dict[int, str] = {}
    siglas: dict[int, str] = {}
    if inst_ids:
        filas = (
            await sesion.execute(
                select(Institucion.id, Institucion.nombre, Institucion.siglas)
                .where(Institucion.id.in_(inst_ids))
            )
        ).all()
        nombres = {i: n for i, n, _ in filas}
        siglas = {i: s for i, _, s in filas}
    instituciones = await svc.buscar_instituciones(sesion, q, limite=8)
    return {
        "personas": [
            {
                **svc.resumen_persona(p),
                "institucion_nombre": nombres.get(p.institucion_id or 0, ""),
                "institucion_siglas": siglas.get(p.institucion_id or 0, ""),
            }
            for p in personas
        ],
        "instituciones": [svc.resumen_inst(i) for i in instituciones],
    }


@router.post("/importar")
async def importar(
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Siembra/actualiza el directorio desde la carpeta de marcadores
    (`config.bookmarks_ruta`). Idempotente. SOLO administrador."""
    res = await svc.importar(sesion, Path(config.bookmarks_ruta))
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Importación del directorio desde marcadores: "
        f"+{res['instituciones']} instituciones, {res['actualizadas']} actualizadas, "
        f"+{res['personas']} personas, +{res['enlaces']} enlaces",
    )
    await sesion.commit()
    return res


# ------------------------------ organigramas -------------------------

class NodoOrganigrama(BaseModel):
    """Un órgano/unidad del organigrama oficial, con sus dependencias."""
    nombre: str
    siglas: str = ""
    tipo: str = "organo"
    # alta_direccion | organo_linea | organo_apoyo | organo_asesoramiento |
    # organo_control | organo_resolutivo | organo_desconcentrado |
    # unidad_organica | programa | proyecto | adscrito | comision
    categoria: str = ""
    hijos: list["NodoOrganigrama"] = Field(default_factory=list)


NodoOrganigrama.model_rebuild()


class OrganigramaEntrada(BaseModel):
    """Carga del organigrama OFICIAL de una institución como árbol JSON, con
    su procedencia (fuente/URL/fecha/norma). Idempotente: upsert por nombre
    bajo cada padre; `reemplazar=True` desactiva los sub-órganos previos
    (origen 'organigrama') que ya no figuren — actualización de estructura."""
    fuente: str = ""
    url_fuente: str = ""
    fecha_consulta: str = ""
    norma: str = ""
    reemplazar: bool = False
    nodos: list[NodoOrganigrama] = Field(default_factory=list)


@router.post("/instituciones/{inst_id}/organigrama")
async def cargar_organigrama(
    inst_id: int,
    datos: OrganigramaEntrada,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    raiz = await sesion.get(Institucion, inst_id)
    if raiz is None:
        raise HTTPException(404, "La institución no existe.")
    res = {"creados": 0, "actualizados": 0, "desactivados": 0}

    async def hijos_activos(padre_id: int) -> list[Institucion]:
        return list(
            (
                await sesion.execute(
                    select(Institucion).where(
                        Institucion.parent_id == padre_id,
                        Institucion.activo.is_(True),
                    )
                )
            ).scalars().all()
        )

    async def desactivar_no_mencionados(padre_id: int, nombres: set[str]) -> None:
        for h in await hijos_activos(padre_id):
            # Solo se desactiva lo que NACIÓ de un organigrama: lo agregado a
            # mano (import/manual) no se toca aunque no figure en el árbol.
            if h.nombre.strip().lower() not in nombres and h.origen == "organigrama":
                h.activo = False
                res["desactivados"] += 1

    async def upsert(nodo: NodoOrganigrama, padre_id: int, orden: int) -> None:
        existente = (
            await sesion.execute(
                select(Institucion).where(
                    Institucion.parent_id == padre_id,
                    func.lower(Institucion.nombre) == nodo.nombre.strip().lower(),
                )
            )
        ).scalars().first()
        if existente is None:
            existente = Institucion(
                nombre=nodo.nombre.strip(),
                parent_id=padre_id,
                origen="organigrama",
                nivel_gobierno=raiz.nivel_gobierno,
                region=raiz.region,
            )
            sesion.add(existente)
            res["creados"] += 1
        else:
            res["actualizados"] += 1
        existente.siglas = nodo.siglas or existente.siglas
        existente.tipo = nodo.tipo or existente.tipo
        existente.categoria = nodo.categoria or existente.categoria
        existente.orden = orden
        existente.activo = True
        existente.fuente = datos.fuente or existente.fuente
        existente.url_fuente = datos.url_fuente or existente.url_fuente
        existente.fecha_consulta = datos.fecha_consulta or existente.fecha_consulta
        existente.norma = datos.norma or existente.norma
        await sesion.flush()
        if datos.reemplazar:
            await desactivar_no_mencionados(
                existente.id, {h.nombre.strip().lower() for h in nodo.hijos}
            )
        for k, h in enumerate(nodo.hijos):
            await upsert(h, existente.id, k)

    if datos.reemplazar:
        await desactivar_no_mencionados(
            raiz.id, {n.nombre.strip().lower() for n in datos.nodos}
        )
    for k, n in enumerate(datos.nodos):
        await upsert(n, raiz.id, k)
    # La procedencia también queda registrada en la raíz.
    raiz.fuente = datos.fuente or raiz.fuente
    raiz.url_fuente = datos.url_fuente or raiz.url_fuente
    raiz.fecha_consulta = datos.fecha_consulta or raiz.fecha_consulta
    raiz.norma = datos.norma or raiz.norma
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Organigrama de «{raiz.nombre}»: {res['creados']} nuevos, "
        f"{res['actualizados']} actualizados, {res['desactivados']} desactivados"
        + (f" · fuente: {datos.fuente}" if datos.fuente else ""),
    )
    await sesion.commit()
    return res


# ------------------------------ instituciones ------------------------

@router.get("/instituciones")
async def listar_instituciones(
    q: str = "",
    inactivos: bool = False,
    limite: int = 50,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """`limite` alto (máx. 5000) lo usa la página Directorio para cargar el
    árbol de jerarquía COMPLETO y los selectores de institución padre — con los
    organigramas oficiales el directorio pasa de varios miles de dependencias."""
    filas = await svc.buscar_instituciones(
        sesion, q, incluir_inactivos=inactivos, limite=max(1, min(5000, limite))
    )
    return [svc.resumen_inst(i) for i in filas]


@router.post("/instituciones")
async def crear_institucion(
    datos: InstitucionEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if not datos.nombre.strip():
        raise HTTPException(422, "El nombre es obligatorio.")
    inst = Institucion(origen="manual", **datos.model_dump())
    sesion.add(inst)
    await sesion.flush()
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Agregó al directorio la institución «{inst.nombre}»",
    )
    await sesion.commit()
    return svc.resumen_inst(inst)


@router.put("/instituciones/{inst_id}")
async def editar_institucion(
    inst_id: int,
    datos: InstitucionEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    inst = await sesion.get(Institucion, inst_id)
    if inst is None:
        raise HTTPException(404, "La institución no existe.")
    for campo, valor in datos.model_dump().items():
        setattr(inst, campo, valor)
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Actualizó en el directorio la institución «{inst.nombre}»",
    )
    await sesion.commit()
    return svc.resumen_inst(inst)


@router.delete("/instituciones/{inst_id}")
async def desactivar_institucion(
    inst_id: int,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Desactiva (no borra) — deja de sugerirse pero se conserva el histórico."""
    inst = await sesion.get(Institucion, inst_id)
    if inst is None:
        raise HTTPException(404, "La institución no existe.")
    inst.activo = False
    await sesion.commit()
    return {"ok": True}


# ------------------------------ personas -----------------------------

@router.get("/personas")
async def listar_personas(
    q: str = "",
    institucion_id: int | None = None,
    inactivos: bool = False,
    limite: int = 50,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """`limite` alto (máx. 5000) lo usa la página Directorio para ver a TODAS las
    personas y medir qué datos faltan; el autocompletado sigue con 50."""
    if institucion_id is not None:
        consulta = select(Persona).where(Persona.institucion_id == institucion_id)
        if not inactivos:
            consulta = consulta.where(Persona.activo.is_(True))
        filas = list((await sesion.execute(consulta.order_by(Persona.nombre))).scalars().all())
    else:
        filas = await svc.buscar_personas(sesion, q, incluir_inactivos=inactivos, limite=max(1, min(5000, limite)))
    return await _con_cuenta_y_favorito(sesion, usuario, [svc.resumen_persona(p) for p in filas])


async def _con_cuenta_y_favorito(sesion: AsyncSession, usuario: Usuario, filas: list[dict]) -> list[dict]:
    """Añade a cada persona `usuario_id` (si tiene cuenta en Qillqa: Mensaje en el chat y su ficha
    se cambia en Mi perfil) y `favorito` (de quien mira)."""
    ids = [f["id"] for f in filas]
    if not ids:
        return filas
    cuentas = dict((await sesion.execute(
        select(Usuario.persona_id, Usuario.id).where(Usuario.persona_id.in_(ids), Usuario.rol != "invitado")
    )).all())
    favoritos = set((await sesion.execute(
        select(ContactoFavorito.persona_id).where(ContactoFavorito.usuario_id == usuario.id, ContactoFavorito.persona_id.in_(ids))
    )).scalars())
    for f in filas:
        f["usuario_id"] = cuentas.get(f["id"])
        f["favorito"] = f["id"] in favoritos
    return filas


@router.post("/personas")
async def crear_persona(
    datos: PersonaEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if not datos.nombre.strip():
        raise HTTPException(422, "El nombre es obligatorio.")
    _sin_invitado(usuario)
    p = Persona(origen="manual", **datos.model_dump(exclude={"etiquetas"}),
                etiquetas=svc_contactos.limpiar_etiquetas(datos.etiquetas or []))
    sesion.add(p)
    await sesion.flush()
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Agregó al directorio a «{p.nombre}» ({p.cargo or 'sin cargo'})",
    )
    await sesion.commit()
    return svc.resumen_persona(p)


@router.put("/personas/{persona_id}")
async def editar_persona(
    persona_id: int,
    datos: PersonaEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    p = await sesion.get(Persona, persona_id)
    if p is None:
        raise HTTPException(404, "La persona no existe.")
    anterior = f"{p.nombre} ({p.cargo or 'sin cargo'})"
    # Si es la ficha de una cuenta de Qillqa, lo que dicta la cuenta se cambia en Mi perfil o en
    # Administración (servicios/cuentas.py; un solo lugar de verdad, 2026-10-12).
    from app.servicios import cuentas

    cuenta = (await sesion.execute(select(Usuario).where(Usuario.persona_id == p.id, Usuario.rol != "invitado"))).scalars().first()
    if cuenta is not None:
        cambiados = {k: v for k, v in datos.model_dump(exclude={"etiquetas"}).items() if getattr(p, k, None) != v}
        choques = cuentas.conflictos_con_cuenta(cambiados, cuentas.dictado_por_cuenta(cuenta))
        if choques:
            raise HTTPException(409, f"{cuenta.nombre_completo} tiene cuenta en Qillqa: su "
                                     f"{', '.join(cuentas.ROTULOS_CUENTA[c] for c in choques)} se cambia en Mi perfil "
                                     "o en Administración, y el directorio lo toma de ahí.")
    for campo, valor in datos.model_dump(exclude={"etiquetas"}).items():
        setattr(p, campo, valor)
    if datos.etiquetas is not None:
        p.etiquetas = svc_contactos.limpiar_etiquetas(datos.etiquetas)
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Actualizó en el directorio: {anterior} → "
        f"«{p.nombre}» ({p.cargo or 'sin cargo'})",
    )
    await sesion.commit()
    return svc.resumen_persona(p)


@router.delete("/personas/{persona_id}")
async def desactivar_persona(
    persona_id: int,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    p = await sesion.get(Persona, persona_id)
    if p is None:
        raise HTTPException(404, "La persona no existe.")
    p.activo = False
    await sesion.commit()
    return {"ok": True}


# ------------------------------ enlaces ------------------------------

@router.get("/instituciones/{inst_id}/enlaces")
async def listar_enlaces(
    inst_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    filas = list(
        (
            await sesion.execute(
                select(Enlace).where(Enlace.institucion_id == inst_id).order_by(Enlace.tipo)
            )
        ).scalars().all()
    )
    return [
        {"id": e.id, "tipo": e.tipo, "url": e.url, "etiqueta": e.etiqueta}
        for e in filas
    ]


@router.post("/instituciones/{inst_id}/enlaces")
async def crear_enlace(
    inst_id: int,
    datos: EnlaceEntrada,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if await sesion.get(Institucion, inst_id) is None:
        raise HTTPException(404, "La institución no existe.")
    if not datos.url.strip():
        raise HTTPException(422, "La URL es obligatoria.")
    e = Enlace(institucion_id=inst_id, **datos.model_dump())
    sesion.add(e)
    await sesion.commit()
    return {"id": e.id, "tipo": e.tipo, "url": e.url, "etiqueta": e.etiqueta}


@router.delete("/enlaces/{enlace_id}")
async def eliminar_enlace(
    enlace_id: int,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    e = await sesion.get(Enlace, enlace_id)
    if e is None:
        raise HTTPException(404, "El enlace no existe.")
    await sesion.delete(e)
    await sesion.commit()
    return {"ok": True}


# ------------------------- mesa de partes del destinatario -------------------------
# (2026-10-06) Desde la redacción: la mesa de partes de cada destinatario a un clic, y
# añadirla ahí mismo si falta; y la lista de las que faltan en todos los documentos.

class DestinosEntrada(BaseModel):
    campos: dict = Field(default_factory=dict)


@router.post("/destinos")
async def destinos(
    datos: DestinosEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Los destinatarios de los campos de un documento con su institución y su mesa de partes."""
    claves = ("destinatario_nombre", "destinatario_cargo", "destinatario_institucion")
    campos = {k: str(datos.campos.get(k) or "") for k in claves}
    return mp.resolver(campos, await mp.cargar(sesion))


class MesaEntrada(BaseModel):
    url: str = Field(max_length=1000)


@router.put("/instituciones/{inst_id}/mesa-partes")
async def poner_mesa_partes(
    inst_id: int,
    datos: MesaEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Solo el enlace de la mesa de partes (sin reenviar la ficha entera)."""
    if usuario.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")
    url = datos.url.strip()
    if url and not re.match(r"^https?://\S+$", url):
        raise HTTPException(422, "El enlace debe empezar con http:// o https://.")
    inst = await sesion.get(Institucion, inst_id)
    if inst is None:
        raise HTTPException(404, "La institución no existe.")
    inst.url_mesa_partes = url
    await anotar_bitacora(
        sesion, usuario, "directorio",
        f"Puso la mesa de partes de «{inst.nombre}»" if url else f"Quitó la mesa de partes de «{inst.nombre}»",
    )
    await sesion.commit()
    return svc.resumen_inst(inst)


CANALES_RECEPCION = ("", "virtual", "correo", "whatsapp", "presencial", "otro")


class RecepcionEntrada(BaseModel):
    canal: str = ""
    dato: str = Field(default="", max_length=300)
    nota: str = Field(default="", max_length=2000)
    # Con canal «virtual», el enlace de la mesa.
    url: str = Field(default="", max_length=1000)
    # Para registrar de paso una institución que no estaba en el directorio.
    nombre_nuevo: str = Field(default="", max_length=300)


@router.put("/instituciones/{inst_id}/recepcion")
async def poner_recepcion(
    inst_id: int,
    datos: RecepcionEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Cómo recibe documentos la entidad (mesa virtual, correo, WhatsApp, presencial…), desde
    la ventana de mesa de partes del documento (2026-10-10). `inst_id` 0 + `nombre_nuevo`
    crea la institución."""
    if usuario.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")
    if datos.canal not in CANALES_RECEPCION:
        raise HTTPException(422, "Canal desconocido.")
    url = datos.url.strip()
    if url and not re.match(r"^https?://\S+$", url):
        raise HTTPException(422, "El enlace debe empezar con http:// o https://.")
    if inst_id == 0:
        if not datos.nombre_nuevo.strip():
            raise HTTPException(422, "Falta el nombre de la institución.")
        inst = Institucion(nombre=datos.nombre_nuevo.strip(), origen="manual")
        sesion.add(inst)
        await sesion.flush()
        await anotar_bitacora(sesion, usuario, "directorio", f"Creó la institución «{inst.nombre}» desde la mesa de partes")
    else:
        inst = await sesion.get(Institucion, inst_id)
        if inst is None:
            raise HTTPException(404, "La institución no existe.")
    inst.recepcion_canal = datos.canal
    inst.recepcion_dato = datos.dato.strip()
    inst.recepcion_nota = datos.nota.strip()
    if datos.canal == "virtual" or url:
        inst.url_mesa_partes = url
    await anotar_bitacora(sesion, usuario, "directorio", f"Puso cómo recibe documentos «{inst.nombre}»: {datos.canal or 'sin dato'}")
    await sesion.commit()
    return svc.resumen_inst(inst)


@router.get("/mesas-faltantes")
async def mesas_faltantes(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """De los documentos EXTERNOS (lo interno va por el STD): las instituciones destinatarias SIN
    mesa de partes (con los documentos que van a ellas) y los destinatarios que no se reconocen."""
    from tiqsi.modulo import opcional

    d = await mp.cargar(sesion)
    sin_mesa: dict[int, dict] = {}
    sin_reconocer: dict[str, dict] = {}
    # Los documentos que van fuera del Congreso (lo interno va por el STD, no por mesa de partes; Edison 2026-10-06)
    # son de Gestión documental: por «documentos.v1» (Qillqasqa Q3b, 2026-10-21).
    documentos = opcional("documentos.v1")
    for doc in await documentos.externos() if documentos is not None else ():
        numero = doc["numero"]
        for r in mp.resolver(doc["campos"], d):
            if r["institucion"] is None:
                texto = " · ".join(x for x in (r["destino"]["nombre"], r["destino"]["cargo"], r["destino"]["institucion"]) if x)
                if texto:
                    sin_reconocer.setdefault(texto, {"destino": texto, "documentos": []})["documentos"].append(numero)
            elif not r["mesa_partes"]:
                i = r["institucion"]
                sin_mesa.setdefault(i["id"], {**i, "documentos": []})["documentos"].append(numero)
    orden = lambda x: (-len(x["documentos"]), x.get("nombre") or x.get("destino"))  # noqa: E731
    return {
        "sin_mesa": sorted(sin_mesa.values(), key=orden),
        "sin_reconocer": sorted(sin_reconocer.values(), key=orden),
    }


# ------------------------- contactos, como Google Contacts (2026-10-13) -------------------------
# Edison (2026-10-12): el directorio «como Google Contacts y mucho mejor todavía»: favoritos de cada
# cuenta, foto, etiquetas o grupos para filtrar, importar el .vcf del celular o el .csv de Google con
# los duplicados a la vista, y exportar a .vcf. Lo puro vive en servicios/contactos.py.

CARPETA_FOTOS_DIRECTORIO = Path("directorio") / "fotos"
MAX_IMPORTAR_BYTES = 5 * 1024 * 1024


def _sin_invitado(usuario: Usuario) -> None:
    if usuario.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


async def _persona(sesion: AsyncSession, persona_id: int) -> Persona:
    p = await sesion.get(Persona, persona_id)
    if p is None:
        raise HTTPException(404, "La persona no existe.")
    return p


class FavoritoEntrada(BaseModel):
    favorito: bool


@router.put("/personas/{persona_id}/favorito")
async def poner_favorito(
    persona_id: int,
    datos: FavoritoEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """La estrella: cada cuenta tiene sus favoritos (salen arriba de la lista)."""
    await _persona(sesion, persona_id)
    fila = await sesion.get(ContactoFavorito, {"usuario_id": usuario.id, "persona_id": persona_id})
    if datos.favorito and fila is None:
        sesion.add(ContactoFavorito(usuario_id=usuario.id, persona_id=persona_id))
    elif not datos.favorito and fila is not None:
        await sesion.delete(fila)
    await sesion.commit()
    return {"favorito": datos.favorito}


def _ruta_foto(relativa: str) -> Path | None:
    """La foto de una persona, solo si está dentro de su carpeta y existe."""
    if not relativa:
        return None
    raiz = raiz_documentos()
    base = (raiz / CARPETA_FOTOS_DIRECTORIO).resolve()
    ruta = (raiz / relativa).resolve()
    return ruta if base in ruta.parents and ruta.is_file() else None


@router.post("/personas/{persona_id}/foto")
async def subir_foto(
    persona_id: int,
    archivo: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """La foto del contacto: cuadrada, 512 px, JPEG (la misma receta que la foto de perfil)."""
    from app.servicios import perfil as svc_perfil

    _sin_invitado(usuario)
    p = await _persona(sesion, persona_id)
    contenido = await archivo.read(svc_perfil.MAX_FOTO_BYTES + 1)
    if len(contenido) > svc_perfil.MAX_FOTO_BYTES:
        raise HTTPException(413, "La foto pesa más de 15 MB.")
    try:
        jpeg = svc_perfil.recortar_foto(contenido)
    except svc_perfil.DatoInvalido as e:
        raise HTTPException(422, str(e)) from None
    relativa = CARPETA_FOTOS_DIRECTORIO / f"p{p.id}-{hashlib.sha256(jpeg).hexdigest()[:8]}.jpg"
    destino = raiz_documentos() / relativa
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(jpeg)
    anterior = _ruta_foto(p.foto or "")
    p.foto = str(relativa)
    await anotar_bitacora(sesion, usuario, "directorio", f"Puso la foto de «{p.nombre}» en el directorio")
    await sesion.commit()
    if anterior is not None and anterior != destino.resolve():
        anterior.unlink(missing_ok=True)
    return (await _con_cuenta_y_favorito(sesion, usuario, [svc.resumen_persona(p)]))[0]


@router.delete("/personas/{persona_id}/foto")
async def quitar_foto(
    persona_id: int,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    _sin_invitado(usuario)
    p = await _persona(sesion, persona_id)
    anterior = _ruta_foto(p.foto or "")
    p.foto = ""
    await sesion.commit()
    if anterior is not None:
        anterior.unlink(missing_ok=True)
    return (await _con_cuenta_y_favorito(sesion, usuario, [svc.resumen_persona(p)]))[0]


@router.get("/personas/{persona_id}/foto")
async def ver_foto(
    persona_id: int,
    peticion: Request,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    p = await _persona(sesion, persona_id)
    ruta = _ruta_foto(p.foto or "")
    if ruta is None:
        raise HTTPException(404, "Sin foto.")
    return enviar_archivo(ruta, f"contacto-{persona_id}.jpg", "image/jpeg", peticion)


@router.get("/etiquetas")
async def etiquetas(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Las etiquetas (grupos) en uso, con cuántas personas activas tiene cada una."""
    conteo: dict[str, dict] = {}
    for lista in (await sesion.execute(select(Persona.etiquetas).where(Persona.activo.is_(True)))).scalars():
        for e in lista or []:
            k = svc_contactos.plano(e)
            conteo.setdefault(k, {"nombre": e, "n": 0})["n"] += 1
    return sorted(conteo.values(), key=lambda x: svc_contactos.plano(x["nombre"]))


class RenombrarEtiqueta(BaseModel):
    de: str = Field(max_length=60)
    a: str = Field(default="", max_length=60)


@router.post("/etiquetas/renombrar")
async def renombrar_etiqueta(
    datos: RenombrarEtiqueta,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Renombra una etiqueta en todas las personas que la llevan; con `a` vacío, la quita."""
    _sin_invitado(usuario)
    de = svc_contactos.plano(datos.de)
    if not de:
        raise HTTPException(422, "Falta la etiqueta.")
    nueva = svc_contactos.limpiar_etiquetas([datos.a])
    n = 0
    for p in (await sesion.execute(select(Persona))).scalars():
        actuales = list(p.etiquetas or [])
        if not any(svc_contactos.plano(e) == de for e in actuales):
            continue
        p.etiquetas = svc_contactos.limpiar_etiquetas([*(x if svc_contactos.plano(x) != de else (nueva[0] if nueva else "") for x in actuales)])
        n += 1
    await anotar_bitacora(sesion, usuario, "directorio",
                          f"Renombró la etiqueta «{datos.de}» a «{nueva[0]}» ({n} personas)" if nueva else f"Quitó la etiqueta «{datos.de}» ({n} personas)")
    await sesion.commit()
    return {"personas": n}


async def _personas_para_cruzar(sesion: AsyncSession) -> list[dict]:
    filas = (await sesion.execute(select(Persona))).scalars().all()
    return [svc.resumen_persona(p) for p in filas]


async def _instituciones_para_cruzar(sesion: AsyncSession) -> list[dict]:
    filas = (await sesion.execute(select(Institucion.id, Institucion.nombre, Institucion.siglas, Institucion.activo))).all()
    return [{"id": i, "nombre": n, "siglas": s, "activo": a} for i, n, s, a in filas]


@router.post("/contactos/previa")
async def previa_importar(
    archivo: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Lee el `.vcf` o el `.csv` y devuelve cada contacto con su duplicado en el directorio (mismo
    celular, correo o nombre) y la acción propuesta. No guarda nada."""
    _sin_invitado(usuario)
    contenido = await archivo.read(MAX_IMPORTAR_BYTES + 1)
    if len(contenido) > MAX_IMPORTAR_BYTES:
        raise HTTPException(413, "El archivo pasa de 5 MB: expórtelo por partes (por etiqueta).")
    try:
        leidos = svc_contactos.leer_archivo(archivo.filename or "", contenido)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    filas = svc_contactos.previa(leidos, await _personas_para_cruzar(sesion))
    instituciones = await _instituciones_para_cruzar(sesion)
    for f in filas:
        inst = svc_contactos.institucion_por_nombre(f["institucion"], instituciones)
        f["institucion_id"] = inst["id"] if inst else None
    return {
        "contactos": filas,
        "total": len(filas),
        "duplicados": sum(1 for f in filas if f["duplicado"]),
        "repetidos": sum(1 for f in filas if f["repetido_de"] is not None),
    }


class ContactoImportar(BaseModel):
    nombre: str = Field(max_length=200)
    celular: str = Field(default="", max_length=80)
    telefono: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=200)
    email_alterno: str = Field(default="", max_length=200)
    institucion: str = Field(default="", max_length=300)
    institucion_id: int | None = None
    cargo: str = Field(default="", max_length=200)
    area: str = Field(default="", max_length=200)
    notas: str = Field(default="", max_length=4000)
    etiquetas: list[str] = Field(default_factory=list)
    favorito: bool = False
    accion: str = "crear"  # crear | fusionar | omitir
    persona_id: int | None = None


class ImportarEntrada(BaseModel):
    contactos: list[ContactoImportar] = Field(default_factory=list, max_length=svc_contactos.MAX_CONTACTOS)
    # Etiqueta para todo lo importado (p. ej. «Importados 2026-10-13»), opcional.
    etiqueta: str = Field(default="", max_length=60)


@router.post("/contactos/importar")
async def importar_contactos(
    datos: ImportarEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Guarda lo que la persona confirmó en la vista previa: crea, fusiona (solo rellena lo vacío;
    lo que dicta una cuenta no se toca) u omite. Una sola transacción."""
    from app.servicios import cuentas

    _sin_invitado(usuario)
    res = {"creados": 0, "fusionados": 0, "omitidos": 0}
    extra = svc_contactos.limpiar_etiquetas([datos.etiqueta])
    instituciones = {i["id"] for i in await _instituciones_para_cruzar(sesion)}
    for c in datos.contactos:
        if c.accion == "omitir" or not c.nombre.strip():
            res["omitidos"] += 1
            continue
        etiquetas = svc_contactos.limpiar_etiquetas([*c.etiquetas, *extra])
        inst_id = c.institucion_id if c.institucion_id in instituciones else None
        notas = c.notas.strip()
        if c.institucion and inst_id is None:
            # La organización que no está en el directorio queda en la nota (no se crean
            # instituciones a ciegas: el directorio del Estado tiene su propia procedencia).
            notas = "\n".join(x for x in (f"Organización: {c.institucion}", notas) if x)
        celular = svc_contactos.normalizar_celular(c.celular)
        telefono = svc_contactos.normalizar_celular(c.telefono)
        if c.accion == "fusionar" and c.persona_id:
            p = await sesion.get(Persona, c.persona_id)
            if p is None:
                res["omitidos"] += 1
                continue
            cuenta = (await sesion.execute(select(Usuario).where(Usuario.persona_id == p.id, Usuario.rol != "invitado"))).scalars().first()
            protegidos = set(cuentas.dictado_por_cuenta(cuenta)) if cuenta is not None else set()
            cambios = svc_contactos.fusionar(svc.resumen_persona(p), {
                "celular": celular, "telefono": telefono, "email": c.email.strip().lower(), "email_alterno": c.email_alterno.strip().lower(),
                "cargo": c.cargo, "area": c.area, "notas": notas, "etiquetas": etiquetas,
            }, protegidos)
            if inst_id and not p.institucion_id:
                cambios["institucion_id"] = inst_id
            for k, v in cambios.items():
                setattr(p, k, v)
            res["fusionados"] += 1
        else:
            p = Persona(origen="importado", nombre=c.nombre.strip(), celular=celular, telefono=telefono,
                        email=c.email.strip().lower(), email_alterno=c.email_alterno.strip().lower(), cargo=c.cargo.strip(),
                        area=c.area.strip(), notas=notas, institucion_id=inst_id, etiquetas=etiquetas)
            sesion.add(p)
            await sesion.flush()
            res["creados"] += 1
        if c.favorito and await sesion.get(ContactoFavorito, {"usuario_id": usuario.id, "persona_id": p.id}) is None:
            sesion.add(ContactoFavorito(usuario_id=usuario.id, persona_id=p.id))
    await anotar_bitacora(sesion, usuario, "directorio",
                          f"Importó contactos: {res['creados']} nuevos, {res['fusionados']} fusionados, {res['omitidos']} omitidos")
    await sesion.commit()
    return res


@router.get("/contactos/exportar")
async def exportar_contactos(
    ids: str = "",
    etiqueta: str = "",
    favoritos: bool = False,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> Response:
    """Las personas activas como `.vcf` (vCard 3.0, lo que importan Google Contacts y el celular).
    Filtros: `ids` (lista separada por comas), `etiqueta` o `favoritos`; sin filtros, todas."""
    consulta = select(Persona).where(Persona.activo.is_(True)).order_by(Persona.nombre)
    lista_ids = [int(x) for x in ids.split(",") if x.strip().isdigit()][:5000]
    if lista_ids:
        consulta = consulta.where(Persona.id.in_(lista_ids))
    if favoritos:
        consulta = consulta.where(Persona.id.in_(select(ContactoFavorito.persona_id).where(ContactoFavorito.usuario_id == usuario.id)))
    if usuario.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")
    personas = list((await sesion.execute(consulta)).scalars())
    if etiqueta.strip():
        k = svc_contactos.plano(etiqueta)
        personas = [p for p in personas if any(svc_contactos.plano(e) == k for e in (p.etiquetas or []))]
    nombres = dict((await sesion.execute(select(Institucion.id, Institucion.nombre))).all())
    filas = [{**svc.resumen_persona(p), "institucion_nombre": nombres.get(p.institucion_id or 0, "")} for p in personas]
    nombre = "contactos" + (f"-{re.sub(r'[^a-z0-9]+', '-', svc_contactos.plano(etiqueta)).strip('-')}" if etiqueta.strip() else "") + ".vcf"
    return Response(svc_contactos.a_vcard(filas), media_type="text/vcard; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="{nombre}"', "Cache-Control": "no-store"})

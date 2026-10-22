"""PLATAFORMA — Qillqa como anfitrión de módulos con el contrato de Tiqsi (fase 10.2 de
docs/plataforma/propuesta-repositorios.md, 2026-10-20).

Cada módulo declara su `Manifiesto`: sus routers (en el orden en que se montan), los prefijos de su API
(los mismos de `servicios/modulos.py::CATALOGO`, que apagan el módulo), sus tareas en segundo plano y el
proyecto al que se irá en la fase 10.3. `main.py` ya no incluye routers uno por uno: monta lo que dice
cada manifiesto. Los puertos («identidad.v1», «archivos.v1», «sesion.v1») son lo que Qillqa da a todos:
hoy los módulos aún importan esas funciones directamente; al extraer cada uno, pasará a pedirlas al
anfitrión.

Nada cambia para quien usa el sistema: tests/test_linea_base.py exige las mismas 483 operaciones, con el
mismo acceso y atendidas por la misma ruta (precedencia), y el recorrido de punta a punta en verde.
"""
from __future__ import annotations

from types import SimpleNamespace

from tiqsi import Anfitrion, Manifiesto
from tiqsi import puertos as marcadores

from app.api import admin, anuncios, auth, directorio, grafo, health, notificaciones, openproject, presencia
from app.api import acerca as api_acerca
from app.api import biblioteca as api_biblioteca
from app.api import contrasenas as api_contrasenas
from app.api import modulos as api_modulos
from app.api import pegar as api_pegar
from app.api import perfil as api_perfil
from app.api import push as api_push
from app.api import reglas as api_reglas
from app.api import uso as api_uso
from app.api import zotero as api_zotero
from app.api.archivos import enviar_archivo
from app.db import obtener_sesion, obtener_sesion_mediateca
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import contratos_plataforma as contratos
from app.servicios import avisos_chat
from rikchay import manifiesto as fototeca_manifiesto
from app.servicios import directorio_contrato, registro_chat
from qillqasqa import manifiesto as qillqasqa_manifiesto
from app.servicios import biblioteca as svc_biblioteca
from app.servicios import grafo as svc_grafo
from wayra import manifiesto as wayra_manifiesto
from tullpu import manifiesto as tullpu_manifiesto
from kuyuy import manifiesto as kuyuy_manifiesto
from awana import manifiesto as awana_manifiesto
from qhawana import manifiesto as qhawana_manifiesto
from yupay import manifiesto as rendicion_manifiesto
from minka import manifiesto as minka_manifiesto
from rimay import manifiesto as rimay_manifiesto
from punku import manifiesto as punku_manifiesto
from app.servicios import modulos as svc_modulos
from app.servicios.acerca import VERSION
from app.servicios.eventos_bandeja import BandejaEventosSistema, bandeja_de_salida

# --- tareas en segundo plano (antes, en el ciclo de vida de main.py) -------------------------------------


async def _al_evento(evento) -> None:
    from app.servicios import eventos_sistema

    await eventos_sistema.desde_bus(evento)


async def _al_qillqasqa(evento) -> None:
    from app.servicios import eventos_sistema

    await eventos_sistema.desde_qillqasqa(evento)


async def _al_reapuntar(evento) -> None:
    """«referencias.reapuntar» (Tareas y Agenda fusionó eventos repetidos): los avisos de la campana que nombraban a
    los absorbidos nombran al que queda (los mensajes del chat los reapunta el chat: rimay_contrato.al_reapuntar)."""
    from sqlalchemy import update

    from app.db import SesionAsincrona
    from app.modelos import Notificacion

    d = (evento.datos or {}).get("datos") or {}   # el sobre de minka_eventos.emitir: {entidad, datos, clave, usuario_id}
    viejos, nuevo = list(d.get("viejos") or []), str(d.get("nuevo") or "")
    if not viejos or not nuevo:
        return
    async with SesionAsincrona() as sesion:
        await sesion.execute(update(Notificacion).where(Notificacion.destino.in_(viejos)).values(destino=nuevo))
        await sesion.commit()


async def _al_aviso(evento) -> None:
    from app.servicios import notificaciones

    await notificaciones.desde_bus(evento)


async def _openproject(_anfitrion) -> None:
    """OpenProject (2026-10-02): sin OPENPROJECT_URL y OPENPROJECT_TOKEN no hace nada."""
    from app.servicios import openproject_sync

    await openproject_sync.bucle()


# --- los módulos -----------------------------------------------------------------------------------------


def _prefijos(mid: str) -> tuple[str, ...]:
    """Los prefijos de API con que el módulo se apaga, de su fila del registro de módulos encendibles."""
    return tuple(svc_modulos.POR_ID[mid].get("rutas", ())) if mid in svc_modulos.POR_ID else ()


PROYECTO: dict[str, str] = {}
"""Módulo → repositorio al que se irá en la fase 10.3 («qillqa» si se queda en la plataforma)."""


def _m(mid: str, nombre: str, routers: list, proyecto: str, **resto) -> Manifiesto:
    PROYECTO[mid] = proyecto
    return Manifiesto(id=mid, nombre=nombre, version=VERSION, contrato="^0.1", routers=routers, prefijos=_prefijos(mid), **resto)


MODULOS: list[Manifiesto] = [
    _m("nucleo", "Núcleo de la plataforma", [
        health.router, api_acerca.router, auth.router, notificaciones.router, anuncios.router, presencia.router,
        api_uso.router, admin.router, api_pegar.router, api_reglas.router, api_push.router,
        api_perfil.router, api_modulos.router,
    ], "qillqa", ofrece={"pegado.v1": contratos.PEGADO_V1, "calendario.v1": contratos.CALENDARIO_V1, "avisos.v1": contratos.AVISOS_V1,
               # Lo que el sistema dice en el chat lo compone Qillqa (servicios/avisos_chat.py, Rimay R1).
               "redaccion.v1": avisos_chat.REDACCION_V1,
               # Lo que el chat reconoce y registra en Qillqa (servicios/registro_chat.py, Rimay R1b).
               "registro.v1": registro_chat.REGISTRO_V1,
               # El aviso al celular es de la plataforma: el chat lo pide (Rimay R2).
               "push.v1": contratos.PUSH_V1,
               # El registro de módulos encendibles (la mesa virtual; Punku P1a).
               "modulos.v1": contratos.MODULOS_V1},
       # Lo que cuentan y avisan los módulos aislados por su bandeja de salida (Tareas y Agenda): reglas y campana.
       eventos={"tarea.*": [_al_evento], "evento.*": [_al_evento], "agenda.*": [_al_evento], "aviso.*": [_al_aviso],
               "referencias.*": [_al_reapuntar],
               # Lo que cuenta la Mesa de Partes por su bandeja (Punku P1b): las reglas.
               "entrada.*": [_al_evento],
               # Lo que cuenta el editor de piezas por su bandeja (Awana E4b): las reglas de los canales Prensa y Noticias.
               "prensa.*": [_al_evento],
               # Lo que cuentan Gestión documental, Proyectos de ley y la Semana por su bandeja (Qillqasqa Q4a).
               "documento.*": [_al_qillqasqa], "proyecto.*": [_al_qillqasqa], "sr.*": [_al_qillqasqa],
               # El chat sembró temas nuevos: las reglas de fábrica que se ordenan (Rimay R2).
               "conversaciones.temas_nuevos": [avisos_chat.al_sembrar_temas]}),
    # Gestión documental, Proyectos de ley y la Semana: Qillqasqa, el mismo manifiesto que cuando corre sola (Q6a).
    *qillqasqa_manifiesto.MANIFIESTOS,
    _m("directorio", "Directorio institucional", [directorio.router], "qillqa",
       ofrece={"personas.v1": contratos.PERSONAS_V1,
               # Lo que la Mesa de Partes lee y lleva al directorio (Punku P1a).
               "directorio.v1": directorio_contrato.DIRECTORIO_V1}),
    punku_manifiesto.MANIFIESTO,  # la Mesa de Partes: Punku, su repositorio (punku.manifiesto)
    minka_manifiesto.MANIFIESTO,  # Tareas y Agenda: Minka, su repositorio (minka.manifiesto)
    rimay_manifiesto.MANIFIESTO,  # el chat: Rimay, su repositorio (rimay.manifiesto)
    fototeca_manifiesto.MANIFIESTO,  # la Mediateca (Rikchay): el mismo manifiesto que cuando corre sola (rikchay.sola)
    # Prensa (E5, 2026-10-21) es solo su página en la web: sus editores son módulos (Awana, Tullpu, Kuyuy).
    _m("prensa", "Prensa", [], "qillqa"),
    _m("mapa", "Mapa de relaciones", [grafo.router], "qillqa",
       aprovecha=("rendiciones.v1", "documentos.v1", "proyectos.v1", "semanas.v1"),
       # El mapa para las Estadísticas de Gestión documental (Qillqasqa Q3c).
       ofrece={"mapa.v1": svc_grafo.MAPA_V1}),
    wayra_manifiesto.MANIFIESTO,  # el kit de transmisiones (OBS): Wayra, su repositorio (wayra.manifiesto)
    tullpu_manifiesto.MANIFIESTO,  # el editor de fotos: Tullpu, su repositorio (tullpu.manifiesto)
    kuyuy_manifiesto.MANIFIESTO,  # el editor de videos: Kuyuy, su repositorio (kuyuy.manifiesto)
    awana_manifiesto.MANIFIESTO,  # el editor de piezas: Awana, su repositorio (awana.manifiesto)
    qhawana_manifiesto.MANIFIESTO,  # el Observatorio de datos: Qhawana, su repositorio (qhawana.manifiesto)
    _m("biblioteca", "Biblioteca y Zotero", [api_biblioteca.router, api_zotero.router], "qillqa",
       # La biblioteca y Zotero para las fuentes, las citas y las notas normativas de Gestión documental (Qillqasqa Q4c).
       ofrece={"biblioteca.v1": svc_biblioteca.BIBLIOTECA_V1}),
    _m("openproject", "OpenProject", [openproject.router], "qillqa", tareas=[_openproject]),
    _m("contrasenas", "Contraseñas", [api_contrasenas.router], "qillqa",
       # Las cuentas de un sitio, para la mesa de partes de Gestión documental (Qillqasqa Q4c).
       ofrece={"credenciales.v1": api_contrasenas.CREDENCIALES_V1}),
    rendicion_manifiesto.MANIFIESTO,  # Rendición de cuentas: Yupay, su repositorio (yupay.manifiesto)
]


# --- los puertos: lo que Qillqa da a todos los módulos ----------------------------------------------------


async def _persona(usuario_id: int) -> dict | None:
    """«identidad.v1».persona: el nombre y el cargo de una cuenta (p. ej., quién subió una foto)."""
    from app.db import SesionAsincrona
    from app.modelos import Usuario

    async with SesionAsincrona() as sesion:
        u = await sesion.get(Usuario, usuario_id)
    return {"nombre": u.nombre_completo, "cargo": u.cargo or ""} if u else None


def _ficha_cuenta(u) -> dict:
    from app.servicios.cuentas import CARGO_POR_ROL

    return {"id": u.id, "usuario": u.nombre_usuario, "nombre_completo": u.nombre_completo or "", "nombres": u.nombres or "",
            "cargo": u.cargo or "", "dni": u.dni or "", "rol": u.rol, "activo": bool(u.activo),
            # El cargo que se muestra: el propio o el de su rol (Qillqasqa Q4c: el equipo del informe de la semana).
            "cargo_vigente": u.cargo or CARGO_POR_ROL.get(u.rol, "")}


async def _cuenta(usuario_id: int) -> dict | None:
    """«identidad.v1».cuenta: la cuenta vigente {id, usuario, nombre_completo, nombres, cargo, dni, rol, activo}."""
    from app.db import SesionAsincrona
    from app.modelos import Usuario

    async with SesionAsincrona() as sesion:
        u = await sesion.get(Usuario, usuario_id)
        return _ficha_cuenta(u) if u else None


async def _cuentas() -> list[dict]:
    """«identidad.v1».cuentas: todas las cuentas, con los campos de `cuenta`, en orden de id."""
    from sqlalchemy import select

    from app.db import SesionAsincrona
    from app.modelos import Usuario

    async with SesionAsincrona() as sesion:
        return [_ficha_cuenta(u) for u in (await sesion.execute(select(Usuario).order_by(Usuario.id))).scalars()]


async def _de_ficha(token: str):
    """«identidad.v1».de_ficha: la cuenta de una ficha de sesión (el WebSocket del chat no manda cabeceras); lanza si no
    vale, como `usuario_actual`."""
    from fastapi.security import HTTPAuthorizationCredentials

    from app.db import SesionAsincrona
    from app.seguridad import usuario_autenticado

    async with SesionAsincrona() as sesion:
        return await usuario_autenticado(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), sesion)


async def _cortas_de(claves) -> dict[str, str]:
    """«etiquetas.v1».cortas_de: la etiqueta corta y vigente de lo vinculado («documento:12» → «OF-0012»)."""
    from app.db import SesionAsincrona
    from app.servicios import etiquetas

    async with SesionAsincrona() as sesion:
        return await etiquetas.cortas_de(sesion, claves)


async def _etiquetas_de(claves) -> dict[str, str]:
    """«etiquetas.v1».de: el nombre legible y vigente de cada clave («doc:12», «tarea:3»)."""
    from app.db import SesionAsincrona
    from app.servicios import etiquetas

    async with SesionAsincrona() as sesion:
        return await etiquetas.etiquetas_de(sesion, set(claves))


async def _propagar(entidad: str) -> None:
    """«etiquetas.v1».propagar: lo que muestra el nombre de `entidad` (los mensajes del chat), al día. Con su propia
    sesión y su commit: quien llama ya guardó lo suyo."""
    from app.db import SesionAsincrona
    from app.servicios import etiquetas

    async with SesionAsincrona() as sesion:
        await etiquetas.propagar(sesion, entidad)
        await sesion.commit()


PROYECTO["fototeca"] = "rikchay"
PROYECTO["rendicion"] = "yupay"
PROYECTO["tareas"] = "minka"
PROYECTO["chat"] = "rimay"
PROYECTO["recibidos"] = "punku"
PROYECTO["observatorio"] = "qhawana"
PROYECTO["obs"] = "wayra"
PROYECTO["fotos"] = "tullpu"
PROYECTO["videos"] = "kuyuy"
PROYECTO["piezas"] = "awana"
for _q in ("documentos", "proyectos", "representacion"):
    PROYECTO[_q] = "qillqasqa"


def crear_anfitrion() -> Anfitrion:
    """Qillqa con sus puertos y todos sus módulos registrados (lanza ErrorDeMontaje si algo no encaja)."""
    anfitrion = Anfitrion("qillqa", puertos={
        "identidad.v1": SimpleNamespace(usuario_actual=usuario_actual, solo_administrador=solo_administrador,
                                        persona=_persona, cuenta=_cuenta, cuentas=_cuentas, de_ficha=_de_ficha),
        "archivos.v1": SimpleNamespace(enviar_archivo=enviar_archivo),
        "sesion.v1": SimpleNamespace(documental=obtener_sesion, mediateca=obtener_sesion_mediateca),
        "etiquetas.v1": SimpleNamespace(cortas_de=_cortas_de, de=_etiquetas_de, propagar=_propagar),
    }, dependencias={
        # Los marcadores de Tiqsi que usan los módulos aislados se atienden con las cuentas de Qillqa.
        marcadores.usuario_actual: usuario_actual,
        marcadores.solo_administrador: solo_administrador,
    })
    anfitrion.registrar(MODULOS)
    # Los eventos del sistema de Qillqa son su bandeja de salida durable: el repartidor los entrega al bus (fase 10.2b).
    anfitrion.bandejas["qillqa"] = BandejaEventosSistema()
    # Y lo que Qillqa manda a los módulos aislados tras su commit (los mensajes del sistema para el chat, Rimay R1).
    anfitrion.bandejas["qillqa-salida"] = bandeja_de_salida()
    return anfitrion


# Activo: los módulos piden capacidades al anfitrión del proceso (tiqsi.modulo), sin importarse entre sí.
anfitrion = crear_anfitrion().activar()

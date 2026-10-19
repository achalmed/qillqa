"""Ajustes de la entidad: formato PREDETERMINADO por tipo documental.

«Convertir a predeterminado» (panel Formato): guarda los fmt_* del
documento actual como plantilla del tipo; cada documento NUEVO de ese
tipo nace con esos ajustes ya aplicados (el usuario puede cambiarlos
por documento, como siempre).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Ajuste, Usuario
from app.seguridad import solo_administrador, usuario_actual
from app.servicios import bitacora
from app.tipos import TIPOS

router = APIRouter(prefix="/api/ajustes", tags=["ajustes"])

# Solo claves de formato (lista blanca): nada de contenido en la plantilla.
_CLAVES_FMT = "fmt_"


def _clave(tipo: str) -> str:
    return f"fmt_defecto_{tipo}"


async def formato_defecto(sesion: AsyncSession, tipo: str) -> dict:
    """Los fmt_* predeterminados del tipo ({} si no se definieron)."""
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _clave(tipo)})
    return dict(fila.valor) if fila else {}


class FormatoDefecto(BaseModel):
    valores: dict = Field(default_factory=dict)


@router.get("/formato/{tipo}")
async def obtener(
    tipo: str,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if tipo not in TIPOS:
        raise HTTPException(404, "Tipo documental desconocido.")
    return {"tipo": tipo, "valores": await formato_defecto(sesion, tipo)}


@router.put("/formato/{tipo}")
async def guardar(
    tipo: str,
    datos: FormatoDefecto,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Guarda los fmt_* como predeterminados del tipo (sobrescribe).
    Solo se aceptan claves fmt_* con valor de texto; lo demás se ignora."""
    if tipo not in TIPOS:
        raise HTTPException(404, "Tipo documental desconocido.")
    valores = {
        k: v
        for k, v in datos.valores.items()
        if k.startswith(_CLAVES_FMT) and isinstance(v, str) and v.strip()
    }
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _clave(tipo)})
    if fila is None:
        fila = Ajuste(despacho_id=1, clave=_clave(tipo), valor=valores)
        sesion.add(fila)
    else:
        fila.valor = valores
    bitacora.registrar(
        sesion, None, usuario, "ajustes",
        f"Formato predeterminado de «{tipo}»: "
        + (", ".join(f"{k}={v}" for k, v in valores.items()) or "restablecido"),
    )
    await sesion.commit()
    return {"ok": True, "tipo": tipo, "valores": valores}


# --------------------------- columnas de la bandeja ---------------------
# El administrador ajusta ancho (px) y nº de líneas por columna y lo guarda
# como PREDETERMINADO de la entidad; el resto de usuarios solo lo aplica.

_CLAVE_COLUMNAS = "bandeja_columnas"
_COLS_VALIDAS = {
    "numero", "tipo", "asunto", "destinatario", "institucion", "estado",
    "folios", "firmado", "recepcion", "std", "tramite", "responsable",
    "anexos", "procesado", "fecha", "acciones",
}


class ConfigColumnas(BaseModel):
    anchos: dict = Field(default_factory=dict)  # colKey -> px
    lineas: dict = Field(default_factory=dict)  # colKey -> 1|2|3


@router.get("/bandeja-columnas")
async def obtener_columnas(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Config de columnas guardada ({} si el admin no definió ninguna). La
    leen TODOS los usuarios para aplicar el predeterminado de la entidad."""
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_COLUMNAS})
    return dict(fila.valor) if fila else {}


@router.put("/bandeja-columnas")
async def guardar_columnas(
    datos: ConfigColumnas,
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Guarda ancho/líneas por columna como PREDETERMINADO. SOLO administrador
    (la protección real está aquí; ocultar la UI a otros roles es cosmético)."""
    anchos = {
        k: max(48, min(900, int(v)))
        for k, v in datos.anchos.items()
        if k in _COLS_VALIDAS and isinstance(v, (int, float)) and not isinstance(v, bool)
    }
    lineas = {
        k: int(v)
        for k, v in datos.lineas.items()
        if k in _COLS_VALIDAS and isinstance(v, (int, float)) and int(v) in (1, 2, 3)
    }
    valor = {"anchos": anchos, "lineas": lineas}
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_COLUMNAS})
    if fila is None:
        fila = Ajuste(despacho_id=1, clave=_CLAVE_COLUMNAS, valor=valor)
        sesion.add(fila)
    else:
        fila.valor = valor
    bitacora.registrar(
        sesion, None, usuario, "ajustes",
        "Configuración de columnas de la bandeja guardada como predeterminada",
    )
    await sesion.commit()
    return valor


# --------------------------------------------------------------------------
# TIPOS de documento EXTERNO (Edison 2026-09-05): al registrar la respuesta
# de una entidad, el «tipo» era texto libre y cada quien escribía distinto
# (Oficio / oficio / OF.). Ahora es una lista ESTÁNDAR que cualquier usuario
# puede ampliar desde el mismo formulario; se guarda en `ajustes` bajo una
# sola clave, como el resto de preferencias de la entidad.
# --------------------------------------------------------------------------
_CLAVE_TIPOS_EXT = "tipos_documento_externo"
TIPOS_EXTERNOS_BASE = [
    "Oficio", "Oficio múltiple", "Carta", "Memorando", "Memorando múltiple",
    "Informe", "Resolución", "Solicitud", "Carta notarial", "Nota",
    "Proveído", "Decreto", "Acta", "Correo electrónico", "Otro",
]


class NuevoTipoExterno(BaseModel):
    nombre: str = Field(min_length=2, max_length=60)


async def _tipos_externos(sesion: AsyncSession) -> list[str]:
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_TIPOS_EXT})
    extra = list((fila.valor or {}).get("lista", [])) if fila else []
    vistos: list[str] = []
    for t in TIPOS_EXTERNOS_BASE + extra:
        if t and t not in vistos:
            vistos.append(t)
    return vistos


@router.get("/tipos-externos")
async def listar_tipos_externos(
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[str]:
    return await _tipos_externos(sesion)


@router.post("/tipos-externos", status_code=201)
async def agregar_tipo_externo(
    datos: NuevoTipoExterno,
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[str]:
    """Agrega un tipo a la lista (cualquier usuario: es un dato de trabajo, no
    una configuración sensible). Idempotente: repetir el nombre no duplica."""
    nombre = " ".join(datos.nombre.split()).strip()
    actuales = await _tipos_externos(sesion)
    if nombre.lower() in (t.lower() for t in actuales):
        return actuales
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_TIPOS_EXT})
    lista = list((fila.valor or {}).get("lista", [])) if fila else []
    lista.append(nombre)
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=_CLAVE_TIPOS_EXT, valor={"lista": lista}))
    else:
        fila.valor = {"lista": lista}
    await sesion.commit()
    return await _tipos_externos(sesion)


# --- Enlace del STD del Congreso (2026-10-10) ------------------------------------------------
# Los documentos INTERNOS se envían por el Sistema de Trámite Documentario de la intranet: el
# botón «Enviar» del editor abre este enlace. Lo fija el administrador; nada de la entidad va
# en el código (CLAUDE.md), así que vive en `ajustes`.
class EnlaceStd(BaseModel):
    url: str = Field(default="", max_length=500)


async def enlace_std(sesion: AsyncSession) -> str:
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": "std_url"})
    return str((fila.valor or {}).get("url", "")) if fila else ""


@router.get("/std-url")
async def ver_enlace_std(
    _: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    return {"url": await enlace_std(sesion)}


@router.put("/std-url")
async def poner_enlace_std(
    datos: EnlaceStd,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador cambia el enlace del STD.")
    url = datos.url.strip()
    if url and not url.lower().startswith(("http://", "https://")):
        raise HTTPException(422, "El enlace debe empezar por http:// o https://.")
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": "std_url"})
    if fila is None:
        fila = Ajuste(despacho_id=1, clave="std_url", valor={"url": url})
        sesion.add(fila)
    else:
        fila.valor = {"url": url}
    await sesion.commit()
    return {"url": url}


# --- Formato Word: el espacio de trabajo de cada persona (2026-10-19) ---------------------------
# Los documentos del espacio son borradores reales (cada uno con su registro y su número); aquí solo
# se recuerda cuáles tiene abiertos cada cuenta, para seguir en otro equipo o en el celular. La
# lógica (y la limpieza de ids de documentos ya borrados) vive en `servicios/espacio_word.py`.


class EspacioWord(BaseModel):
    documentos: list[int] = Field(default_factory=list, max_length=60)
    activo: int | None = None


@router.get("/espacio-word")
async def ver_espacio_word(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    from app.servicios import espacio_word

    return await espacio_word.leer(sesion, usuario.id)


@router.put("/espacio-word")
async def guardar_espacio_word(
    datos: EspacioWord,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    from app.servicios import espacio_word

    return await espacio_word.guardar(sesion, usuario.id, datos.documentos, datos.activo)


# --- Preferencias de cada cuenta (2026-10-19) ------------------------------------------------------
# Lo que cada persona elige para sí y vale en todos sus aparatos (el `localStorage` no viaja):
# cómo abrir un proyecto de ley y un documento (formulario o Formato Word; vacío = preguntar).
# Lista blanca de claves y valores: nada de contenido aquí.

_CLAVE_PREFERENCIAS = "preferencias"
PREFERENCIAS: dict[str, tuple[str, ...]] = {
    "modalidad_proyectos": ("", "formulario", "word"),
    "modalidad_documentos": ("", "formulario", "word"),
}


def _preferencias_limpias(valor: dict | None) -> dict:
    return {k: v for k, v in (valor or {}).items() if k in PREFERENCIAS and v in PREFERENCIAS[k]}


@router.get("/preferencias")
async def ver_preferencias(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": f"{_CLAVE_PREFERENCIAS}:{usuario.id}"})
    return {k: "" for k in PREFERENCIAS} | _preferencias_limpias(fila.valor if fila else None)


@router.put("/preferencias")
async def guardar_preferencias(
    datos: dict[str, str],
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Cambia solo las claves que viajan (las demás se conservan); una clave o un valor fuera de la
    lista blanca se ignora."""
    clave = f"{_CLAVE_PREFERENCIAS}:{usuario.id}"
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": clave})
    valor = {**_preferencias_limpias(fila.valor if fila else None), **_preferencias_limpias(datos)}
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=clave, valor=valor))
    else:
        fila.valor = valor
    await sesion.commit()
    return {k: "" for k in PREFERENCIAS} | valor


# --- Notas de sustento normativo: en qué tipos se ofrece cada una (2026-10-19) ---------------------
# Edison: «ofrecerla también en otros tipos; que sea un ajuste editable por tipo». El catálogo (texto,
# fuente, señales) vive en `servicios/notas_normativas.py`; aquí solo los tipos donde se ofrece.


@router.get("/notas-normativas")
async def ver_notas_normativas(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    from app.servicios import notas_normativas

    return notas_normativas.catalogo(await notas_normativas.tipos_vigentes(sesion))


@router.put("/notas-normativas")
async def guardar_notas_normativas(
    datos: dict[str, list[str]],
    usuario: Usuario = Depends(solo_administrador),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """{clave de nota: [tipos]}; un tipo desconocido o externo se descarta. Solo administrador."""
    from app.servicios import notas_normativas

    validas = {n["clave"] for n in notas_normativas.NOTAS}
    redactables = {cod for cod, cfg in TIPOS.items() if not cfg.get("externo")}
    valor = {k: [t for t in dict.fromkeys(v) if t in redactables] for k, v in datos.items() if k in validas and isinstance(v, list)}
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": notas_normativas.CLAVE_AJUSTE})
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=notas_normativas.CLAVE_AJUSTE, valor=valor))
    else:
        fila.valor = {**(fila.valor or {}), **valor}
    await sesion.commit()
    return notas_normativas.catalogo(await notas_normativas.tipos_vigentes(sesion))

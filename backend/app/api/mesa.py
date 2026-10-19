"""Apoyo para la Mesa de Partes (2026-10-08, Edison): todo lo que un formulario de mesa de
partes pide, listo para copiar o autocompletar desde la ventana de apoyo de la web.

- `GET  /api/mesa/documentos/{id}` — los datos del documento (tipo, número, asunto, fecha,
  folios, destinatario…), los del titular, la mesa de partes de cada destinatario y sus
  credenciales (sin la clave) y el PDF firmado.
- `GET|PUT /api/mesa/titular` — datos personales del titular, ESTRUCTURADOS (apellido paterno,
  materno, nombres, DNI…), porque cada formulario los pide distinto. Viven en la BD (tabla
  `ajustes`, clave `titular`), nunca en el repo (D13); los edita solo el administrador.
- Las cuentas (usuario y clave) viven en el módulo Contraseñas (`api/contrasenas.py`); aquí
  solo se juntan las de la mesa del documento.
- `POST /api/mesa/documentos/{id}/abrir-ubicacion` — abre la carpeta del firmado en el
  explorador de archivos DE LA COMPUTADORA QUE CORRE EL SISTEMA.

Permisos (decisión de Edison 2026-10-08): todo el equipo menos el invitado ve y copia; solo el
administrador edita.
"""

import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import contrasenas
from app.api.archivos import enviar_archivo
from app.db import obtener_sesion
from app.modelos import Adjunto, Ajuste, Documento, Usuario
from app.seguridad import usuario_actual
from app.servicios import mesas_partes as mp
from app.servicios.adjuntos import ruta_en_disco
from app.servicios.carpetas import carpeta
from app.servicios.numeracion import numero_mostrado
from app.tipos import tipo_config

router = APIRouter(prefix="/api/mesa", tags=["mesa de partes"])

CLAVE_TITULAR = "titular"
# Campos del titular, en el orden en que se muestran. Lista blanca: nada más se guarda.
CAMPOS_TITULAR = (
    "apellido_paterno", "apellido_materno", "nombres", "tipo_documento", "dni", "digito_verificador",
    "fecha_emision", "fecha_caducidad", "fecha_nacimiento", "ubigeo", "sexo", "cargo", "entidad",
    "ruc_entidad", "direccion", "distrito", "provincia", "departamento", "correo", "celular", "telefono",
)


def _no_invitado(usuario: Usuario) -> None:
    if usuario.rol == "invitado":
        raise HTTPException(403, "Esta información no está disponible para invitados.")


def _solo_admin(usuario: Usuario) -> None:
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador puede cambiar estos datos.")


async def _titular(sesion: AsyncSession) -> dict:
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": CLAVE_TITULAR})
    datos = dict(fila.valor) if fila else {}
    return {k: str(datos.get(k) or "") for k in CAMPOS_TITULAR}


def _fecha(iso: str) -> str:
    try:
        return date.fromisoformat(iso[:10]).strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return iso or ""


# --- titular -------------------------------------------------------------------------------

@router.get("/titular")
async def ver_titular(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _no_invitado(usuario)
    return {"campos": list(CAMPOS_TITULAR), "datos": await _titular(sesion)}


class DatosTitular(BaseModel):
    datos: dict = Field(default_factory=dict)


@router.put("/titular")
async def guardar_titular(
    entrada: DatosTitular, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)
) -> dict:
    _solo_admin(usuario)
    limpio = {k: str(entrada.datos.get(k) or "").strip()[:300] for k in CAMPOS_TITULAR}
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": CLAVE_TITULAR})
    if fila is None:
        sesion.add(Ajuste(despacho_id=1, clave=CLAVE_TITULAR, valor=limpio))
    else:
        fila.valor = limpio
    await sesion.commit()
    return {"ok": True, "datos": limpio}


# --- el documento ---------------------------------------------------------------------------

async def _firmado(sesion: AsyncSession, doc: Documento) -> Adjunto | None:
    return (await sesion.execute(
        select(Adjunto).where(Adjunto.documento_id == doc.id, Adjunto.categoria == "firmado").order_by(Adjunto.id.desc()).limit(1)
    )).scalar_one_or_none()


@router.get("/documentos/{documento_id}")
async def paquete(
    documento_id: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)
) -> dict:
    """Lo que piden los formularios de mesa de partes, listo para copiar."""
    _no_invitado(usuario)
    doc = await sesion.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    campos = doc.campos or {}
    cfg = tipo_config(doc.tipo)
    titular = await _titular(sesion)
    destinos = mp.resolver(
        {k: str(campos.get(k) or "") for k in ("destinatario_nombre", "destinatario_cargo", "destinatario_institucion")},
        await mp.cargar(sesion),
    )
    # Las cuentas del módulo Contraseñas para esta mesa: por la institución del destino o por el
    # SITIO de su mesa (mismo dominio, aunque sea la de la entidad superior).
    ids = [d["institucion"]["id"] for d in destinos if d.get("institucion")]
    creds: list[dict] = []
    for url in [d["mesa_partes"] for d in destinos if d.get("mesa_partes")] or [""]:
        for c in await contrasenas.para_sitio(sesion, url, ids):
            if all(c["id"] != x["id"] for x in creds):
                creds.append(c)
    firmado = await _firmado(sesion, doc)
    nombre_completo = " ".join(x for x in (titular["nombres"], titular["apellido_paterno"], titular["apellido_materno"]) if x)
    return {
        "documento": {
            "id": str(doc.id),
            "tipo": cfg.get("nombre", doc.tipo),
            "numero": numero_mostrado(doc),
            "numero_simple": f"{doc.numero:04d}" if doc.numero else "",
            "asunto": str(campos.get("asunto") or ""),
            "fecha": _fecha(str(campos.get("fecha") or "")),
            "folios": str(doc.folios or ""),
            "destinatario": str(campos.get("destinatario_nombre") or ""),
            "cargo_destinatario": str(campos.get("destinatario_cargo") or ""),
            "institucion_destino": str(campos.get("destinatario_institucion") or ""),
            "referencia": str(campos.get("referencia") or ""),
            "remitente": nombre_completo,
            "cargo_remitente": titular["cargo"],
        },
        "titular": {**titular, "nombre_completo": nombre_completo},
        "destinos": destinos,
        "credenciales": creds,
        "firmado": {"id": firmado.id, "nombre": firmado.nombre_archivo} if firmado else None,
        # Lo que la extensión aprendió de formularios anteriores de esas mesas (etiqueta → valor).
        "aprendido": await _aprendido_de(sesion, [d["mesa_partes"] for d in destinos if d.get("mesa_partes")]),
    }


def _entorno_escritorio() -> dict:
    """La API puede correr sin el entorno gráfico (arranque automático): se completa con el de
    la sesión del usuario para que el explorador de archivos se abra en su pantalla."""
    env = dict(os.environ)
    run = f"/run/user/{os.getuid()}"
    env.setdefault("XDG_RUNTIME_DIR", run)
    env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path={run}/bus")
    env.setdefault("DISPLAY", ":0")
    if "WAYLAND_DISPLAY" not in env and Path(run, "wayland-0").exists():
        env["WAYLAND_DISPLAY"] = "wayland-0"
    return env


@router.post("/documentos/{documento_id}/abrir-ubicacion")
async def abrir_ubicacion(
    documento_id: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)
) -> dict:
    """Abre el explorador de archivos con el firmado SELECCIONADO (o el PDF generado si aún no
    hay firmado), en la computadora donde corre el sistema."""
    _no_invitado(usuario)
    doc = await sesion.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(404, "El documento no existe.")
    firmado = await _firmado(sesion, doc)
    ruta = ruta_en_disco(doc, firmado) if firmado else None
    if ruta is None or not ruta.exists():
        base = carpeta(doc)
        ruta = base / doc.pdf_archivo if base and doc.pdf_archivo else base
    if ruta is None or not ruta.exists():
        raise HTTPException(404, "El documento todavía no tiene archivo en disco.")
    env = _entorno_escritorio()
    # FileManager1.ShowItems abre la carpeta con el archivo seleccionado (Nautilus, Dolphin,
    # Nemo…); si no hay quien lo atienda, se abre la carpeta con gio/xdg-open.
    ordenes = []
    if shutil.which("gdbus") and ruta.is_file():
        ordenes.append(["gdbus", "call", "--session", "--dest", "org.freedesktop.FileManager1",
                        "--object-path", "/org/freedesktop/FileManager1",
                        "--method", "org.freedesktop.FileManager1.ShowItems", f"['{ruta.as_uri()}']", ""])
    carpeta_abrir = ruta.parent if ruta.is_file() else ruta
    for programa in ("gio", "xdg-open"):
        if shutil.which(programa):
            ordenes.append([programa, "open", str(carpeta_abrir)] if programa == "gio" else [programa, str(carpeta_abrir)])
    for orden in ordenes:
        try:
            r = subprocess.run(orden, env=env, capture_output=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            continue
        if r.returncode == 0:
            return {"ok": True, "ruta": str(ruta)}
    raise HTTPException(500, "No se pudo abrir el explorador de archivos en la computadora del sistema.")


# --- la extensión del navegador ------------------------------------------------------------

EXTENSION = Path(__file__).resolve().parents[3] / "extension"


@router.get("/extension.zip")
async def descargar_extension(
    peticion: Request, navegador: str = "chrome", usuario: Usuario = Depends(usuario_actual)
) -> Response:
    """La extensión «Qillqa · Mesa de partes» (carpeta extension/ del repo), para instalarla una vez
    por computadora (Directorio → Mesas de partes). `navegador=firefox` (también Zen, que es
    Firefox) la entrega como .xpi con el manifiesto que Firefox pide: el proceso de fondo como
    script (no admite service_worker) y un identificador propio."""
    _no_invitado(usuario)
    if not (EXTENSION / "manifest.json").exists():
        raise HTTPException(404, "La extensión no está disponible en esta instalación.")
    firefox = navegador.lower() in ("firefox", "zen")
    manifiesto = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    if firefox:
        manifiesto["background"] = {"scripts": ["fondo.js"]}
        manifiesto["browser_specific_settings"] = {"gecko": {
            "id": "sgdp-mesa-de-partes@sgdp.local", "strict_min_version": "128.0",
            # Mozilla pide declararlo (web-ext lint, 2026-10): la extensión no recoge datos para nadie
            # más que el propio Qillqa de la entidad.
            "data_collection_permissions": {"required": ["none"]},
        }}
    nombre = "sgdp-mesa-de-partes.xpi" if firefox else "sgdp-mesa-de-partes.zip"
    destino = Path(tempfile.gettempdir()) / nombre
    # Chrome carga una CARPETA (se descomprime); Firefox instala el .xpi, con el manifiesto en la raíz.
    base = Path("") if firefox else Path("sgdp-mesa-de-partes")
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(str(base / "manifest.json"), json.dumps(manifiesto, ensure_ascii=False, indent=2))
        for f in sorted(EXTENSION.rglob("*")):
            if f.is_file() and f.suffix != ".md" and f.name != "manifest.json":
                z.write(f, str(base / f.relative_to(EXTENSION)))
    return enviar_archivo(destino, nombre, "application/x-xpinstall" if firefox else "application/zip", peticion)


# --- Lo aprendido de los formularios (2026-10-10) --------------------------------------------
# Edison: «captar información nueva para que el siguiente autocompletado sea más completo». Al
# enviar un formulario en una mesa, la extensión manda (etiqueta, valor) de los campos llenos
# que NO llenó Qillqa; se guardan por sitio en ajustes.mesa_aprendido y la próxima vez
# se ofrecen para los campos vacíos con la misma etiqueta.
from urllib.parse import urlparse as _urlparse

from app.modelos import Ajuste

_CLAVE_APRENDIDO = "mesa_aprendido"


class Aprendido(BaseModel):
    host: str = Field(max_length=200)
    campos: list[dict] = Field(default_factory=list, max_length=80)


def _host(u: str) -> str:
    try:
        return (_urlparse(u if "://" in u else f"https://{u}").hostname or "").lower().removeprefix("www.")
    except ValueError:
        return ""


async def _aprendido_de(sesion: AsyncSession, urls: list[str]) -> dict:
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_APRENDIDO})
    todo = (fila.valor or {}) if fila else {}
    salida: dict = {}
    for u in urls:
        salida.update(todo.get(_host(u), {}))
    return salida


@router.post("/aprendido")
async def aprender(d: Aprendido, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    _no_invitado(usuario)
    host = _host(d.host)
    if not host:
        return {"guardados": 0}
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_APRENDIDO})
    if fila is None:
        fila = Ajuste(despacho_id=1, clave=_CLAVE_APRENDIDO, valor={})
        sesion.add(fila)
    todo = dict(fila.valor or {})
    del_sitio = dict(todo.get(host) or {})
    n = 0
    for c in d.campos:
        etiqueta = str(c.get("etiqueta") or "").strip()[:120]
        valor = str(c.get("valor") or "").strip()[:200]
        if not etiqueta or not valor or len(etiqueta) < 3:
            continue
        if del_sitio.get(etiqueta) != valor:
            del_sitio[etiqueta] = valor
            n += 1
    # Sin crecer sin fin: las últimas 60 etiquetas por sitio.
    if len(del_sitio) > 60:
        del_sitio = dict(list(del_sitio.items())[-60:])
    todo[host] = del_sitio
    fila.valor = todo
    await sesion.commit()
    return {"guardados": n}

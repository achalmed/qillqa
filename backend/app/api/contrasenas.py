"""Módulo Contraseñas (2026-10-08, Edison: «gestionar los usuarios y contraseñas de todas las
mesas de partes a las que entra el diputado… como un módulo nuevo, similar a Google Contraseñas
o KeePassXC, que permita incluso autocompletar el acceso»).

- La clave va cifrada (servicios/boveda.py) y solo se descifra a pedido: cada «ver», «copiar» o
  «autocompletar» queda en `accesos_credencial` y actualiza `ultimo_uso`.
- `GET /sitio?host=` da las cuentas de un sitio para que la extensión ofrezca autocompletar el
  ingreso en cualquier mesa de partes guardada (extension/).
- `POST /importar` toma el CSV que exportan Google Contraseñas o KeePassXC.

Permisos (decisión de Edison 2026-10-08): todo el equipo menos el invitado ve, copia y usa;
solo el administrador agrega, edita, borra e importa.
"""

import copy
import csv
import io
import re
import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import AccesoCredencial, Credencial, Institucion, Usuario
from app.seguridad import usuario_actual
from app.servicios import boveda

router = APIRouter(prefix="/api/contrasenas", tags=["contraseñas"])

ACCIONES = {"ver", "copiar", "autocompletar"}


def no_invitado(usuario: Usuario) -> None:
    if usuario.rol == "invitado":
        raise HTTPException(403, "Las contraseñas no están disponibles para invitados.")


def solo_admin(usuario: Usuario) -> None:
    if usuario.rol != "administrador":
        raise HTTPException(403, "Solo el administrador puede cambiar las contraseñas guardadas.")


def host_de(url: str) -> str:
    """«https://www.mesa.gob.pe/ingreso» → «mesa.gob.pe» (sin www, en minúsculas). Pura."""
    try:
        h = (urlparse(url if "//" in url else f"//{url}").hostname or "").lower()
    except ValueError:
        return ""
    return h[4:] if h.startswith("www.") else h


def mismo_sitio(a: str, b: str) -> bool:
    """El mismo dominio o uno es subdominio del otro (sso.mesa.gob.pe ~ mesa.gob.pe). Pura."""
    a, b = host_de(a) or a, host_de(b) or b
    return bool(a and b) and (a == b or a.endswith(f".{b}") or b.endswith(f".{a}"))


# --- formas de ingreso ------------------------------------------------------------------------
TIPOS = ("DNI", "Correo", "Usuario", "RUC", "Código", "Otro")


def tipo_de(usuario: str) -> str:
    """Tipo probable de un identificador de ingreso. Pura."""
    u = (usuario or "").strip()
    if "@" in u:
        return "Correo"
    if re.fullmatch(r"\d{8}", u):
        return "DNI"
    if re.fullmatch(r"\d{11}", u):
        return "RUC"
    return "Usuario"


def ingresos_de(c: Credencial) -> list[dict]:
    """Las formas de ingreso; una cuenta anterior a la lista se lee de usuario y clave_cifrada."""
    # COPIA PROFUNDA: con una copia superficial los dict interiores eran los mismos que los del
    # JSONB cargado; al editarlos «en sitio» y reasignar, SQLAlchemy comparaba viejo == nuevo y
    # no escribía nada (aceptar una observada o importar sobre una cuenta existente devolvían
    # 200 sin persistir; auditoría 2026-10-10, CT-01).
    lista = copy.deepcopy(list(c.ingresos or []))
    if not lista and (c.usuario or c.clave_cifrada):
        lista = [{"id": "1", "tipo": tipo_de(c.usuario), "usuario": c.usuario, "cifrada": c.clave_cifrada}]
    return lista


def sincronizar(c: Credencial, lista: list[dict]) -> None:
    """Guarda la lista (asignándola: JSONB no ve cambios hechos dentro) y copia la primera."""
    c.ingresos = [dict(i) for i in lista]
    flag_modified(c, "ingresos")
    c.usuario = lista[0]["usuario"][:200] if lista else ""
    c.clave_cifrada = lista[0]["cifrada"] if lista else ""


def nuevo_id() -> str:
    return uuid.uuid4().hex[:8]


def resumen(c: Credencial, institucion: str = "", quien: str = "") -> dict:
    return {
        "id": c.id, "nombre": c.nombre, "url": c.url, "host": host_de(c.url), "usuario": c.usuario,
        "tiene_clave": any(i.get("cifrada") for i in ingresos_de(c)), "notas": c.notas, "categoria": c.categoria or "",
        "ingresos": [{"id": i["id"], "tipo": i.get("tipo") or tipo_de(i.get("usuario", "")), "usuario": i.get("usuario", ""),
                      "tiene_clave": bool(i.get("cifrada"))} for i in ingresos_de(c)],
        "favorita": bool(c.favorita), "institucion_id": c.institucion_id, "institucion": institucion,
        "actualizado_en": c.actualizado_en.isoformat() if c.actualizado_en else None, "actualizado_por": quien,
        "ultimo_uso": c.ultimo_uso.isoformat() if c.ultimo_uso else None,
    }


async def _todas(sesion: AsyncSession) -> list[dict]:
    filas = (await sesion.execute(
        select(Credencial, Institucion.nombre, Usuario.nombres, Usuario.apellidos)
        .outerjoin(Institucion, Institucion.id == Credencial.institucion_id)
        .outerjoin(Usuario, Usuario.id == Credencial.actualizado_por)
        .order_by(Credencial.favorita.desc(), func.lower(Credencial.nombre))
    )).all()
    return [resumen(c, inst or "", f"{n or ''} {a or ''}".strip()) for c, inst, n, a in filas]


async def para_sitio(sesion: AsyncSession, url_o_host: str, institucion_ids: list[int] | None = None) -> list[dict]:
    """Las cuentas de un sitio (o de esas instituciones): la extensión y la ventana de apoyo."""
    ids = institucion_ids or []
    salida = []
    for c in (await sesion.execute(select(Credencial))).scalars():
        if (c.institucion_id in ids) or (url_o_host and c.url and mismo_sitio(c.url, url_o_host)):
            salida.append(resumen(c))
    return salida


@router.get("")
async def listar(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    no_invitado(usuario)
    return await _todas(sesion)


@router.get("/sitio")
async def de_un_sitio(host: str, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    no_invitado(usuario)
    return await para_sitio(sesion, host)


class Ingreso(BaseModel):
    id: str | None = None
    tipo: str = ""
    usuario: str = ""
    # Vacía o None al editar = se conserva la clave guardada de ESA forma de ingreso.
    clave: str | None = None


class DatosCredencial(BaseModel):
    institucion_id: int | None = None
    nombre: str = ""
    url: str = ""
    ingresos: list[Ingreso] = []
    # Clientes de antes de las formas de ingreso: una sola.
    usuario: str = ""
    clave: str | None = None
    notas: str = ""
    categoria: str = ""
    favorita: bool = False


def _aplicar(c: Credencial, d: DatosCredencial, usuario: Usuario) -> None:
    url = d.url.strip()
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(422, "La dirección debe empezar por http:// o https://.")
    c.institucion_id = d.institucion_id
    c.nombre = (d.nombre.strip() or host_de(url))[:200]
    c.url = url[:500]
    c.notas = d.notas.strip()
    c.categoria = d.categoria.strip()[:60]
    c.favorita = d.favorita
    entradas = d.ingresos or ([Ingreso(id=None, usuario=d.usuario, clave=d.clave)] if (d.usuario or d.clave) else [])
    previas = {i["id"]: i for i in ingresos_de(c)}
    if not d.ingresos and previas and (d.usuario or d.clave):
        # Cliente antiguo editando: la primera forma de ingreso conserva su id.
        entradas[0].id = next(iter(previas))
    lista = []
    for e in entradas:
        previa = previas.get(e.id or "")
        if not (e.usuario.strip() or e.clave or (previa and previa.get("cifrada"))):
            continue
        lista.append({
            "id": previa["id"] if previa else nuevo_id(),
            "tipo": (e.tipo.strip() or tipo_de(e.usuario))[:20],
            "usuario": e.usuario.strip()[:200],
            "cifrada": boveda.cifrar(e.clave) if e.clave else (previa or {}).get("cifrada", ""),
        })
    sincronizar(c, lista)
    c.actualizado_por = usuario.id


@router.post("")
async def crear(d: DatosCredencial, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    solo_admin(usuario)
    if not (d.nombre.strip() or d.url.strip()):
        raise HTTPException(422, "Ponga al menos un nombre o la dirección del sitio.")
    c = Credencial()
    _aplicar(c, d, usuario)
    sesion.add(c)
    await sesion.commit()
    await sesion.refresh(c)
    return resumen(c)


async def _cargar(sesion: AsyncSession, cid: int) -> Credencial:
    c = await sesion.get(Credencial, cid)
    if c is None:
        raise HTTPException(404, "Esa cuenta no existe.")
    return c


@router.put("/{cid}")
async def editar(cid: int, d: DatosCredencial, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    solo_admin(usuario)
    c = await _cargar(sesion, cid)
    _aplicar(c, d, usuario)
    await sesion.commit()
    # La base recalcula actualizado_en (onupdate): se relee antes de responder (si no, leerlo
    # aquí dispara una consulta fuera de su contexto asíncrono: MissingGreenlet).
    await sesion.refresh(c)
    return resumen(c)


@router.delete("/{cid}")
async def borrar(cid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    solo_admin(usuario)
    await sesion.delete(await _cargar(sesion, cid))
    await sesion.commit()
    return {"ok": True}


@router.post("/{cid}/revelar")
async def revelar(
    cid: int, accion: str = "copiar", ingreso: str = "",
    usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """La clave en claro de una forma de ingreso (la primera si no se dice cuál): ver, copiar o
    autocompletar. Cada vez queda registrada."""
    no_invitado(usuario)
    c = await _cargar(sesion, cid)
    lista = ingresos_de(c)
    elegido = next((i for i in lista if i["id"] == ingreso), lista[0] if lista else None)
    if elegido is None:
        raise HTTPException(404, "Esa cuenta no tiene formas de ingreso.")
    try:
        clave = boveda.descifrar(elegido.get("cifrada", ""))
    except ValueError as error:
        raise HTTPException(409, str(error))
    sesion.add(AccesoCredencial(credencial_id=c.id, usuario_id=usuario.id, accion=accion if accion in ACCIONES else "copiar"))
    c.ultimo_uso = func.now()
    await sesion.commit()
    return {"clave": clave}


@router.get("/{cid}/accesos")
async def accesos(cid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    solo_admin(usuario)
    filas = (await sesion.execute(
        select(AccesoCredencial, Usuario.nombres, Usuario.apellidos)
        .join(Usuario, Usuario.id == AccesoCredencial.usuario_id)
        .where(AccesoCredencial.credencial_id == cid).order_by(AccesoCredencial.id.desc()).limit(100)
    )).all()
    return [{"en": a.en.isoformat(), "accion": a.accion, "quien": f"{n} {ap}".strip()} for a, n, ap in filas]


# --- importar ------------------------------------------------------------------------------

# Encabezados de los CSV que exportan Google Contraseñas (name,url,username,password,note) y
# KeePassXC ("Group","Title","Username","Password","URL","Notes",…); también Bitwarden y Firefox.
_COLUMNAS = {
    "nombre": ("name", "title", "nombre"),
    "url": ("url", "login_uri", "sitio", "website"),
    "usuario": ("username", "login_username", "usuario", "user"),
    "clave": ("password", "login_password", "contraseña", "clave"),
    "notas": ("note", "notes", "notas", "comments"),
    "categoria": ("group", "folder", "categoria", "grupo"),
}


def leer_csv(texto: str) -> list[dict]:
    """Filas normalizadas {nombre, url, usuario, clave, notas, categoria}. Pura."""
    lector = csv.DictReader(io.StringIO(texto.lstrip("﻿")))
    campos = {(h or "").strip().lower(): h for h in (lector.fieldnames or [])}
    mapa = {k: next((campos[a] for a in alias if a in campos), None) for k, alias in _COLUMNAS.items()}
    if not mapa["clave"] or not (mapa["usuario"] or mapa["url"]):
        raise ValueError("No es un CSV de contraseñas: faltan las columnas de usuario o URL y de contraseña.")
    filas = []
    for r in lector:
        fila = {k: (r.get(col) or "").strip() if col else "" for k, col in mapa.items()}
        if fila["categoria"].lower() in ("root", "raíz", "raiz"):
            fila["categoria"] = ""
        if fila["clave"] and (fila["usuario"] or fila["url"]):
            filas.append(fila)
    return filas


@router.post("/importar")
async def importar(
    archivo: UploadFile,
    simular: bool = True,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Importa un CSV. Con `simular` (por defecto) solo cuenta lo que haría. Un sitio que ya
    existe se ACTUALIZA (su clave si es el mismo usuario; si no, una forma de ingreso más)."""
    solo_admin(usuario)
    try:
        filas = leer_csv((await archivo.read()).decode("utf-8", "replace"))
    except (ValueError, csv.Error) as error:
        raise HTTPException(422, str(error))
    existentes = list((await sesion.execute(select(Credencial))).scalars())
    creadas = actualizadas = 0
    for f in filas:
        url = f["url"] if f["url"].startswith(("http://", "https://")) else (f"https://{f['url']}" if f["url"] else "")
        # El MISMO sitio es una sola cuenta: el mismo usuario actualiza su clave; otro usuario se
        # suma como otra forma de ingreso.
        sitio = next((c for c in existentes if mismo_sitio(c.url, url)), None) if url else None
        if sitio:
            actualizadas += 1
            if not simular:
                lista = ingresos_de(sitio)
                igual = next((i for i in lista if i.get("usuario") == f["usuario"]), None)
                if igual:
                    igual["cifrada"] = boveda.cifrar(f["clave"])
                else:
                    lista.append({"id": nuevo_id(), "tipo": tipo_de(f["usuario"]), "usuario": f["usuario"][:200], "cifrada": boveda.cifrar(f["clave"])})
                sincronizar(sitio, lista)
                sitio.notas = sitio.notas or f["notas"]
                sitio.actualizado_por = usuario.id
        else:
            creadas += 1
            if not simular:
                c = Credencial(
                    nombre=(f["nombre"] or host_de(url))[:200], url=url[:500], notas=f["notas"],
                    categoria=f["categoria"][:60], actualizado_por=usuario.id,
                )
                sincronizar(c, [{"id": nuevo_id(), "tipo": tipo_de(f["usuario"]), "usuario": f["usuario"][:200], "cifrada": boveda.cifrar(f["clave"])}])
                sesion.add(c)
                existentes.append(c)
    if not simular:
        await sesion.commit()
    return {"simulado": simular, "leidas": len(filas), "creadas": creadas, "actualizadas": actualizadas}


@router.patch("/{cid}/favorita")
async def marcar_favorita(cid: int, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    no_invitado(usuario)
    c = await _cargar(sesion, cid)
    c.favorita = not c.favorita
    await sesion.commit()
    return {"favorita": c.favorita}


@router.get("/categorias/todas")
async def categorias(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[str]:
    no_invitado(usuario)
    filas = await sesion.execute(select(Credencial.categoria).where(Credencial.categoria != "").distinct())
    return sorted(r[0] for r in filas)



# --- Observado por la extensión (2026-10-10) --------------------------------------------------
# Edison: «identificar cambios de contraseña o creación de cuentas en mesas de partes para
# actualizar nuestra base». La extensión manda lo que vio al enviar un formulario con clave;
# aquí se compara con lo guardado y, si es nuevo o distinto, queda PENDIENTE de aprobación en
# Contraseñas (nunca se cambia una clave sola). Vive en ajustes.contrasenas_observadas.
import uuid as _uuid
from datetime import datetime as _dt, timezone as _tz

from app.modelos import Ajuste
from app.servicios import boveda as _boveda

_CLAVE_OBS = "contrasenas_observadas"


class Observacion(BaseModel):
    host: str = Field(max_length=200)
    url: str = Field(default="", max_length=500)
    usuario: str = Field(default="", max_length=200)
    clave: str = Field(max_length=500)


async def _observadas(sesion: AsyncSession) -> tuple[Ajuste, list]:
    fila = await sesion.get(Ajuste, {"despacho_id": 1, "clave": _CLAVE_OBS})
    if fila is None:
        fila = Ajuste(despacho_id=1, clave=_CLAVE_OBS, valor={"lista": []})
        sesion.add(fila)
        await sesion.flush()
    # Copia profunda por la misma razón que `ingresos_de` (CT-01).
    return fila, copy.deepcopy(list((fila.valor or {}).get("lista") or []))


def _publica(o: dict) -> dict:
    return {k: v for k, v in o.items() if k != "clave"}


@router.post("/observadas")
async def observar(d: Observacion, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """La extensión vio un ingreso con clave en `host`. Si coincide con lo guardado, nada; si es
    una cuenta nueva o una clave distinta, queda pendiente para que el administrador la apruebe."""
    if usuario.rol == "invitado" or not d.clave.strip():
        return {"estado": "ignorado"}
    host = host_de(d.url or d.host) or d.host.lower()
    for c in (await sesion.execute(select(Credencial))).scalars():
        if c.url and mismo_sitio(c.url, host):
            for ing in ingresos_de(c):
                if (ing.get("usuario") or "").strip().lower() == d.usuario.strip().lower():
                    try:
                        if _boveda.descifrar(ing.get("cifrada") or "") == d.clave:
                            return {"estado": "igual"}
                    except Exception:  # noqa: BLE001
                        pass
                    break
    fila, lista = await _observadas(sesion)
    # Una observación igual (host + usuario + clave) no se repite.
    for o in lista:
        if o["host"] == host and o["usuario"] == d.usuario.strip() and o["estado"] == "pendiente":
            try:
                if _boveda.descifrar(o["clave"]) == d.clave:
                    return {"estado": "pendiente"}
            except Exception:  # noqa: BLE001
                pass
    lista.append({
        "id": _uuid.uuid4().hex[:12], "host": host, "url": d.url[:500], "usuario": d.usuario.strip(),
        "clave": _boveda.cifrar(d.clave), "visto_por": usuario.nombre_completo,
        "en": _dt.now(_tz.utc).isoformat(timespec="minutes"), "estado": "pendiente",
    })
    fila.valor = {"lista": lista[-100:]}
    flag_modified(fila, "valor")
    await sesion.commit()
    return {"estado": "pendiente"}


@router.get("/observadas")
async def listar_observadas(usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> list[dict]:
    if usuario.rol == "invitado":
        return []
    _, lista = await _observadas(sesion)
    return [_publica(o) for o in lista if o.get("estado") == "pendiente"]


@router.post("/observadas/{oid}/aceptar")
async def aceptar_observada(oid: str, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Guarda la clave observada: actualiza la forma de ingreso de la cuenta de ese sitio y
    usuario, o crea la cuenta si no existía."""
    solo_admin(usuario)
    fila, lista = await _observadas(sesion)
    o = next((x for x in lista if x["id"] == oid and x["estado"] == "pendiente"), None)
    if o is None:
        raise HTTPException(404, "Esa observación ya no está pendiente.")
    clave = _boveda.descifrar(o["clave"])
    destino = None
    for c in (await sesion.execute(select(Credencial))).scalars():
        if c.url and mismo_sitio(c.url, o["host"]):
            destino = c
            break
    if destino is None:
        destino = Credencial(nombre=o["host"], url=o["url"] or f"https://{o['host']}", actualizado_por=usuario.id)
        sincronizar(destino, [{"id": nuevo_id(), "tipo": tipo_de(o["usuario"]), "usuario": o["usuario"], "cifrada": _boveda.cifrar(clave)}])
        sesion.add(destino)
        await sesion.flush()
    else:
        ingresos = ingresos_de(destino)
        mio = next((i for i in ingresos if (i.get("usuario") or "").strip().lower() == o["usuario"].lower()), None)
        if mio is None:
            ingresos.append({"id": nuevo_id(), "tipo": tipo_de(o["usuario"]), "usuario": o["usuario"],
                             "cifrada": _boveda.cifrar(clave)})
        else:
            mio["cifrada"] = _boveda.cifrar(clave)
        sincronizar(destino, ingresos)
        destino.actualizado_por = usuario.id
    o["estado"] = "aceptada"
    fila.valor = {"lista": lista}
    flag_modified(fila, "valor")
    await sesion.commit()
    return {"ok": True, "id": destino.id}


@router.post("/observadas/{oid}/descartar")
async def descartar_observada(oid: str, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    solo_admin(usuario)
    fila, lista = await _observadas(sesion)
    for o in lista:
        if o["id"] == oid:
            o["estado"] = "descartada"
    fila.valor = {"lista": lista}
    flag_modified(fila, "valor")
    await sesion.commit()
    return {"ok": True}

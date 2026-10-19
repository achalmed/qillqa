"""Presencia del equipo: latido de cada pestaña y lista de quién está en línea.

La lógica (estados, umbrales, registro en memoria) vive en
`servicios/presencia.py`; aquí solo se recibe el latido, se persiste
`ultima_actividad` cuando toca y se arma la lista para la barra superior.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Documento, Proyecto, ProyectoSeccion, Usuario
from app.seguridad import usuario_actual
from app.servicios import presencia as svc
from app.servicios.numeracion import numero_mostrado
from app.tipos import tipo_config

router = APIRouter(prefix="/api/presencia", tags=["presencia"])


class LatidoEntrada(BaseModel):
    documento_id: int | None = None
    visible: bool = True
    proyecto_id: int | None = None
    seccion: str = ""


def _iso(momento: datetime | None) -> str | None:
    return momento.isoformat() if momento else None


class Visibilidad(BaseModel):
    visible: bool


async def _lista(sesion: AsyncSession, yo: int, admin: bool = False) -> list[dict]:
    """La lista del equipo. Quien apagó «mostrar mi estado» (2026-10-19) figura DESCONECTADA para los
    demás, sin documento ni «visto hace»; el administrador (y ella misma) ven el estado real, con
    la marca `oculto`."""
    usuarios = (
        (await sesion.execute(select(Usuario).where(Usuario.activo.is_(True))))
        .scalars()
        .all()
    )
    latidos = {u.id: svc.latido_de(u.id) for u in usuarios}
    # Número del documento que cada quien tiene abierto («en OF-012»).
    ids = {l.documento_id for l in latidos.values() if l and l.documento_id}
    numeros: dict[int, str] = {}
    if ids:
        docs = (await sesion.execute(select(Documento).where(Documento.id.in_(ids)))).scalars()
        # Un borrador no tiene número: «Oficio (borrador)» se lee mejor en una
        # línea que «Oficio S/N-2026-2027-…».
        numeros = {
            d.id: numero_mostrado(d) if d.numero is not None or d.origen == "framework"
            else f"{tipo_config(d.tipo).get('nombre', d.tipo)} (borrador)"
            for d in docs
        }
    # Proyecto y parte («En PL-2026-001 · Fundamentos»).
    pids = {l.proyecto_id for l in latidos.values() if l and l.proyecto_id}
    proyectos: dict[int, str] = {}
    titulos: dict[tuple[int, str], str] = {}
    if pids:
        proyectos = dict((await sesion.execute(select(Proyecto.id, Proyecto.codigo).where(Proyecto.id.in_(pids)))).all())
        for pid, clave, titulo in (await sesion.execute(select(ProyectoSeccion.proyecto_id, ProyectoSeccion.clave, ProyectoSeccion.titulo).where(ProyectoSeccion.proyecto_id.in_(pids)))).all():
            titulos[(pid, clave)] = titulo
    filas = []
    for u in usuarios:
        latido = latidos[u.id]
        estado = svc.estado_de(latido)
        oculto = not u.mostrar_presencia
        if oculto and not admin and u.id != yo:
            filas.append({
                "id": u.id, "nombre": u.nombre_completo, "cargo": u.cargo, "rol": u.rol, "yo": False,
                "estado": "desconectado", "ultima_actividad": None, "documento_id": None, "documento": "",
                "proyecto_id": None, "proyecto": "", "seccion": "", "seccion_titulo": "",
            })
            continue
        documento_id = latido.documento_id if latido and estado != "desconectado" else None
        filas.append(
            {
                "id": u.id,
                "nombre": u.nombre_completo,
                "cargo": u.cargo,
                "rol": u.rol,
                "yo": u.id == yo,
                "estado": estado,
                "oculto": oculto,
                "ultima_actividad": _iso(latido.ultimo if latido else u.ultima_actividad),
                "documento_id": documento_id,
                "documento": numeros.get(documento_id or 0, ""),
                "proyecto_id": latido.proyecto_id if latido and estado != "desconectado" else None,
                "proyecto": proyectos.get(latido.proyecto_id or 0, "") if latido and estado != "desconectado" else "",
                "seccion": latido.seccion if latido and estado != "desconectado" else "",
                "seccion_titulo": titulos.get((latido.proyecto_id or 0, latido.seccion), "") if latido and estado != "desconectado" else "",
            }
        )
    filas.sort(key=lambda f: (svc.ORDEN_ESTADO[f["estado"]], not f["yo"], f["nombre"].lower()))
    return filas


@router.post("")
async def latir(
    datos: LatidoEntrada,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    """Latido de una pestaña; devuelve la lista del equipo (un solo viaje)."""
    if svc.registrar(
        usuario.id, datos.documento_id, datos.visible,
        proyecto_id=datos.proyecto_id, seccion=datos.seccion[:40],
    ):
        await sesion.execute(
            update(Usuario).where(Usuario.id == usuario.id).values(ultima_actividad=svc.ahora())
        )
        await sesion.commit()
    return await _lista(sesion, usuario.id, usuario.rol == "administrador")


@router.get("")
async def equipo(
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> list[dict]:
    return await _lista(sesion, usuario.id, usuario.rol == "administrador")


@router.get("/visible")
async def ver_visible(usuario: Usuario = Depends(usuario_actual)) -> dict:
    """¿Esta cuenta muestra su estado en línea a los demás?"""
    return {"visible": usuario.mostrar_presencia}


@router.put("/visible")
async def poner_visible(
    datos: Visibilidad,
    usuario: Usuario = Depends(usuario_actual),
    sesion: AsyncSession = Depends(obtener_sesion),
) -> dict:
    """Apagar «mostrar mi estado en línea a los demás» (2026-10-19): para el equipo la cuenta figura
    desconectada; el administrador sigue viendo el estado real y las acciones recientes
    (Administración → Uso)."""
    await sesion.execute(update(Usuario).where(Usuario.id == usuario.id).values(mostrar_presencia=datos.visible))
    await sesion.commit()
    return {"visible": datos.visible}


@router.delete("")
async def salir(usuario: Usuario = Depends(usuario_actual)) -> dict:
    """Al cerrar sesión: fuera de línea en el acto, sin esperar 10 minutos."""
    svc.olvidar(usuario.id)
    return {"ok": True}

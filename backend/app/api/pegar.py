"""API del mecanismo común de «pegar el resultado de un prompt» (2026-10-11; servicios/pegado;
`docs/plataforma/propuesta-automatizacion.md` §3).

Lo que es de todos los módulos vive aquí: qué formatos existen (`GET /formatos`), interpretar
un texto sin cruces con la base (`POST /interpretar`, para formularios que no tienen un
endpoint propio), dejar constancia de lo pegado y aplicado (`POST /registrar`, tabla
`pegados`) y leer esa constancia (`GET /historial?entidad=`). Lo que exige cruzar con la
base de un módulo (directorio, duplicados, agenda) vive en el módulo: `POST
/api/entradas/pegar`, `POST /api/agenda/pegar`, `POST /api/documentos/{id}/pegar-seguimiento`.
Nada de aquí escribe en las entidades: el guardado es del endpoint de cada módulo.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import obtener_sesion
from app.modelos import Pegado, Usuario
from app.seguridad import usuario_actual
from app.servicios import pegado as svc
from app.servicios.pegado.asignar import con_anexos
from app.servicios.pegado.comparar import etiquetas_de
from app.servicios.pegado.validar import vinculo_valido

# Lo que puede ser la entidad de un pegado, además de los vínculos: una pieza de prensa (Awana E4b, 2026-10-20: su web deja
# la constancia por aquí; antes la guardaba el backend de Prensa sin pasar por esta puerta).
_ENTIDAD_PIEZA = __import__("re").compile(r"^pieza:\d{1,9}$")


def _entidad_valida(entidad: str) -> bool:
    return vinculo_valido(entidad) or bool(_ENTIDAD_PIEZA.match((entidad or "").strip()))

router = APIRouter(prefix="/api/pegar", tags=["pegar"])


def _puede_escribir(u: Usuario) -> None:
    if u.rol == "invitado":
        raise HTTPException(403, "La cuenta de invitado solo puede consultar.")


def respuesta_lectura(lectura: svc.Lectura, actual: dict | None = None, etiquetas_extra: dict | None = None,
                      dudosos: set[str] | None = None) -> dict:
    """La forma común de todas las respuestas de pegado: la lectura (tipo, avisos, dudas),
    los campos del formulario, los anexos, lo informativo y la tabla de diferencias."""
    campos, anexos, informativos = svc.asignar(lectura)
    propuesto = con_anexos(campos, anexos, actual)
    etiquetas = etiquetas_de(lectura.esquema, {**(etiquetas_extra or {}), "nota": "Nota", "descripcion": "Detalle", "std_nota": "Nota del trámite"})
    dud = set(dudosos or set()) | {k.split(".")[0] for k in lectura.dudas}
    # Una duda sobre una clave se traslada a su campo del formulario.
    if lectura.esquema:
        for clave, d in lectura.esquema.campos.items():
            if clave in dud and d.get("destino"):
                dud.add(d["destino"])
    return {
        "lectura": lectura.como_dict(),
        "campos": propuesto,
        "informativos": informativos,
        "diferencias": svc.comparar(propuesto, actual, etiquetas, dud),
        "resto": lectura.resto,
    }


@router.get("/formatos")
async def formatos(usuario: Usuario = Depends(usuario_actual)) -> dict:
    """Qué formatos acepta el sistema y qué prompt los produce (para el enlace «Abrir el
    prompt» de cada formulario y para el mensaje de error cuando nada casa)."""
    return {"formatos": svc.formatos()}


class Texto(BaseModel):
    texto: str = Field(min_length=1, max_length=60000)
    tipos: list[str] = []
    actual: dict = {}


@router.post("/interpretar")
async def interpretar(datos: Texto, usuario: Usuario = Depends(usuario_actual)) -> dict:
    """Interpretar sin cruces con la base (formularios sin endpoint propio: ficha del
    proyecto, documento administrativo). 422 si el texto no es ningún formato."""
    _puede_escribir(usuario)
    le = svc.interpretar(datos.texto, tuple(datos.tipos) or None)
    if not le.valido:
        raise HTTPException(422, {"codigo": "pegado_invalido", "errores": le.errores, "avisos": le.avisos,
                                  "formatos": [f for f in svc.formatos() if not datos.tipos or f["tipo"] in datos.tipos]})
    return respuesta_lectura(le, datos.actual)


class Registro(BaseModel):
    tipo: str = Field(min_length=1, max_length=60)
    version: int | None = None
    fuente: str = "yaml"
    texto: str = Field(min_length=1, max_length=60000)
    campos_propuestos: dict = {}
    campos_aplicados: dict = {}
    rechazados: list[str] = []
    entidad: str = Field("", max_length=80)


@router.post("/registrar")
async def registrar(datos: Registro, usuario: Usuario = Depends(usuario_actual), sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """La constancia de un pegado aplicado: la web lo llama justo después de que el módulo
    guardó, con la entidad que resultó (`entrada:12`, `evento:7`)."""
    _puede_escribir(usuario)
    if datos.entidad and not _entidad_valida(datos.entidad):
        raise HTTPException(422, "La entidad no tiene la forma `tipo:id`.")
    if datos.tipo not in svc.cargar():
        raise HTTPException(422, f"El formato «{datos.tipo}» no existe.")
    p = Pegado(
        usuario_id=usuario.id, tipo=datos.tipo, version=datos.version or svc.esquema_de(datos.tipo).version,
        fuente=datos.fuente, texto=datos.texto, campos_propuestos=datos.campos_propuestos,
        campos_aplicados=datos.campos_aplicados, rechazados=datos.rechazados, entidad=datos.entidad,
    )
    sesion.add(p)
    await sesion.commit()
    return {"id": p.id}


@router.get("/historial")
async def historial(entidad: str = Query(..., max_length=80), usuario: Usuario = Depends(usuario_actual),
                    sesion: AsyncSession = Depends(obtener_sesion)) -> dict:
    """Los pegados aplicados sobre una entidad, del más reciente al más antiguo."""
    if not _entidad_valida(entidad):
        raise HTTPException(422, "La entidad no tiene la forma `tipo:id`.")
    filas = (await sesion.execute(
        select(Pegado, Usuario.nombre_completo).join(Usuario, Usuario.id == Pegado.usuario_id, isouter=True)
        .where(Pegado.entidad == entidad).order_by(Pegado.creado_en.desc()).limit(50)
    )).all()
    return {"pegados": [
        {"id": p.id, "tipo": p.tipo, "version": p.version, "fuente": p.fuente, "usuario": nombre or "",
         "creado_en": p.creado_en.isoformat() if p.creado_en else None,
         "campos_aplicados": p.campos_aplicados, "rechazados": p.rechazados, "texto": p.texto}
        for p, nombre in filas
    ]}


@router.get("/prompt/{tipo}")
async def prompt_de(tipo: str, _: Usuario = Depends(usuario_actual)) -> dict:
    """El texto del prompt institucional que produce un formato (para «Copiar el prompt» desde el
    botón del módulo): se lee del repo de prompts (`PROMPTS_DIR` o la carpeta hermana `prompts`).
    Si no está en esta máquina, devuelve solo la ruta para que la persona lo abra en el vault."""
    import os
    from pathlib import Path as _Path

    if tipo not in svc.cargar():
        raise HTTPException(404, "Formato desconocido.")
    esquema = svc.esquema_de(tipo)
    ruta_rel = esquema.prompt  # «prompts/06 legislativo/prompt_13_….md», relativa al vault
    # api → app → backend → qillqa → ~/Documents: el repo de prompts es hermano de qillqa (en un
    # contenedor la ruta es más corta: sin PROMPTS_DIR, el prompt queda «no disponible»).
    padres = _Path(__file__).resolve().parents
    raiz = _Path(os.environ.get("PROMPTS_DIR") or (padres[4] if len(padres) > 4 else padres[-1]) / "prompts")
    sin_prefijo = ruta_rel.split("/", 1)[1] if ruta_rel.startswith("prompts/") else ruta_rel
    archivo = raiz / sin_prefijo
    texto = archivo.read_text(encoding="utf-8") if archivo.exists() else ""
    return {"tipo": tipo, "titulo": esquema.titulo, "ruta": ruta_rel, "nombre": archivo.name, "texto": texto, "disponible": bool(texto)}

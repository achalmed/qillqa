"""backend/app/servicios/directorio_contrato.py — «directorio.v1»: lo que el Directorio de Qillqa ofrece a la Mesa de Partes (proyecto Punku P1a; fase 10.2b, 2026-10-20).

Punku ya no lee las tablas `personas` ni `instituciones`: pide lo que necesita por aquí, cada función con su propia
sesión de la base documental.

- `para_cruzar()`: las instituciones (id, nombre, siglas) y las personas (id, nombre, institución, cargo) ACTIVAS, para
  cruzar el membrete y la firma de un documento recibido (`servicios/entradas.cruzar_remitente`);
- `fichas(personas, instituciones)`: la ficha de cada persona (`directorio.resumen_persona`) y de cada institución
  {id, nombre, siglas, ruc, activo}, por id; lo que ya no existe no aparece;
- `institucion_por_ruc(ruc)`: la institución con ese RUC, o None;
- `coincidencias(remitente, persona_id, institucion_id)`: lo que se propone llevar al directorio desde el remitente de
  la mesa virtual y lo que ya hay (la regla de duplicados de `servicios/contactos.py`);
- `llevar(...)`: vincula a la ficha que ya existe (rellenando solo lo vacío) o la crea, con su bitácora; hace commit;
- `destinos(campos)`: los destinatarios escritos en un documento (nombre, cargo, institución) con su institución y su
  mesa de partes (`servicios/mesas_partes.py`); lo pide Gestión documental (Qillqasqa Q3b, 2026-10-21).

Y para Gestión documental, que ya no lee las tablas del directorio (Qillqasqa Q4c, 2026-10-21):

- `instituciones()`: todas, {id, nombre, siglas, parent_id, activo, tipo}, en el orden de la base (el ámbito interno o
  externo de un documento, la institución destino con un solo formato);
- `institucion_por_texto(texto)`: la activa cuyas siglas o nombre son ese texto (sin mayúsculas), o None;
- `buscar(palabra, limite)`: las instituciones y las personas activas cuyo nombre (o siglas) contiene la palabra, sin
  tildes ni mayúsculas (lo citable en un texto);
- `personas_por_nombre(nombres)`: las personas activas con esos nombres normalizados, con su institución (verificar
  destinatarios y copias antes de numerar);
- `diputados()`: los nombres de quienes tienen cargo de diputado (autor y adherentes de un proyecto de ley).
"""
from __future__ import annotations

from sqlalchemy import or_, select

from app.servicios.contratos_plataforma import Superficie


def _ficha_institucion(i) -> dict:
    return {"id": i.id, "nombre": i.nombre, "siglas": i.siglas or "", "ruc": i.ruc or "", "activo": bool(i.activo)}


async def _para_cruzar() -> tuple[list[tuple], list[tuple]]:
    from app.db import SesionAsincrona
    from app.modelos import Institucion, Persona

    async with SesionAsincrona() as sesion:
        insts = [(i.id, i.nombre, i.siglas or "") for i in (await sesion.execute(
            select(Institucion).where(Institucion.activo.is_(True)))).scalars()]
        personas = [(p.id, p.nombre, p.institucion_id, p.cargo or "") for p in (await sesion.execute(
            select(Persona).where(Persona.activo.is_(True)))).scalars()]
    return insts, personas


async def _fichas(personas=(), instituciones=()) -> dict:
    from app.db import SesionAsincrona
    from app.modelos import Institucion, Persona
    from app.servicios.directorio import resumen_persona

    pids = {int(x) for x in personas or () if x}
    iids = {int(x) for x in instituciones or () if x}
    salida: dict = {"personas": {}, "instituciones": {}}
    async with SesionAsincrona() as sesion:
        if pids:
            salida["personas"] = {p.id: resumen_persona(p) for p in (await sesion.execute(select(Persona).where(Persona.id.in_(pids)))).scalars()}
        if iids:
            salida["instituciones"] = {i.id: _ficha_institucion(i) for i in (await sesion.execute(
                select(Institucion).where(Institucion.id.in_(iids)))).scalars()}
    return salida


async def _institucion_por_ruc(ruc: str) -> int | None:
    from app.db import SesionAsincrona
    from app.modelos import Institucion

    async with SesionAsincrona() as sesion:
        return (await sesion.execute(select(Institucion.id).where(Institucion.ruc == ruc))).scalars().first()


async def _coincidencias_en(sesion, remitente: dict, persona_id: int | None, institucion_id: int | None) -> dict:
    from app.modelos import Institucion, Persona
    from app.servicios import contactos as svc_contactos
    from app.servicios import directorio as svc_directorio

    propuesta = svc_contactos.propuesta_remitente(remitente)
    personas = [svc_directorio.resumen_persona(p) for p in (await sesion.execute(select(Persona).where(Persona.activo.is_(True)))).scalars()]
    coincide_persona = None
    if propuesta["persona"]:
        hallado = svc_contactos.Indice(personas).buscar(propuesta["persona"])
        if hallado:
            p = next(x for x in personas if x["id"] == hallado[0])
            coincide_persona = {"id": p["id"], "nombre": p["nombre"], "cargo": p["cargo"], "celular": p["celular"],
                                "email": p["email"], "motivo": svc_contactos.MOTIVO[hallado[1]]}
    coincide_inst = None
    if propuesta["institucion"]:
        ruc = propuesta["institucion"]["ruc"]
        inst = (await sesion.execute(select(Institucion).where(Institucion.ruc == ruc, Institucion.ruc != ""))).scalars().first() if ruc else None
        motivo = "mismo RUC"
        if inst is None:
            filas = (await sesion.execute(select(Institucion.id, Institucion.nombre, Institucion.siglas, Institucion.activo))).all()
            elegida = svc_contactos.institucion_por_nombre(propuesta["institucion"]["nombre"],
                                                          [{"id": i, "nombre": n, "siglas": s, "activo": a} for i, n, s, a in filas])
            inst = await sesion.get(Institucion, elegida["id"]) if elegida else None
            motivo = "mismo nombre"
        if inst is not None:
            coincide_inst = {"id": inst.id, "nombre": inst.nombre, "siglas": inst.siglas, "motivo": motivo}
    vinc_p = await sesion.get(Persona, persona_id) if persona_id else None
    vinc_i = await sesion.get(Institucion, institucion_id) if institucion_id else None
    return {
        "propuesta": propuesta,
        "coincide": {"persona": coincide_persona, "institucion": coincide_inst},
        "vinculado": {
            "persona": {"id": vinc_p.id, "nombre": vinc_p.nombre, "cargo": vinc_p.cargo} if vinc_p else None,
            "institucion": {"id": vinc_i.id, "nombre": vinc_i.nombre, "siglas": vinc_i.siglas} if vinc_i else None,
        },
    }


async def _coincidencias(remitente: dict, persona_id: int | None = None, institucion_id: int | None = None) -> dict:
    from app.db import SesionAsincrona

    async with SesionAsincrona() as sesion:
        return await _coincidencias_en(sesion, remitente, persona_id, institucion_id)


async def _llevar(remitente: dict, expediente: str, persona: str, persona_id: int | None, institucion: str,
                  institucion_id: int | None, usuario_id: int, vinculado_persona: int | None = None,
                  vinculado_institucion: int | None = None) -> dict:
    """→ {persona_id, institucion_id, hecho}. LookupError si lo elegido para vincular no existe; ValueError si no se
    eligió nada. Su propia sesión y su commit (la bitácora va en la misma transacción)."""
    from app.db import SesionAsincrona
    from app.modelos import Institucion, Persona, Usuario
    from app.servicios import cuentas
    from app.servicios.eventos_bandeja import anotar_bitacora
    from app.servicios import contactos as svc_contactos
    from app.servicios import directorio as svc_directorio

    async with SesionAsincrona() as sesion:
        propuesta = (await _coincidencias_en(sesion, remitente, vinculado_persona, vinculado_institucion))["propuesta"]
        hecho: list[str] = []
        inst = None
        if institucion == "vincular" and institucion_id:
            inst = await sesion.get(Institucion, institucion_id)
            if inst is None:
                raise LookupError("La institución no existe.")
            pi = propuesta["institucion"] or {}
            for campo in ("ruc", "email", "telefono", "direccion"):
                if pi.get(campo) and not (getattr(inst, campo) or "").strip():
                    setattr(inst, campo, pi[campo])
            hecho.append(f"vinculado a «{inst.nombre}»")
        elif institucion == "crear" and propuesta["institucion"]:
            pi = propuesta["institucion"]
            inst = Institucion(origen="mesa_virtual", tipo="empresa" if pi["ruc"].startswith("20") else "otro", **pi)
            sesion.add(inst)
            await sesion.flush()
            hecho.append(f"institución «{inst.nombre}» creada")
        p = None
        if persona == "vincular" and persona_id:
            p = await sesion.get(Persona, persona_id)
            if p is None:
                raise LookupError("La persona no existe.")
            cuenta = (await sesion.execute(select(Usuario).where(Usuario.persona_id == p.id, Usuario.rol != "invitado"))).scalars().first()
            protegidos = set(cuentas.dictado_por_cuenta(cuenta)) if cuenta is not None else set()
            pp = propuesta["persona"] or {}
            cambios = svc_contactos.fusionar(svc_directorio.resumen_persona(p), {k: pp.get(k, "") for k in ("cargo", "celular", "email")}, protegidos)
            cambios.pop("etiquetas", None)
            for k, v in cambios.items():
                setattr(p, k, v)
            if inst is not None and not p.institucion_id:
                p.institucion_id = inst.id
            hecho.append(f"vinculado a «{p.nombre}»")
        elif persona == "crear" and propuesta["persona"]:
            pp = propuesta["persona"]
            p = Persona(origen="mesa_virtual", nombre=pp["nombre"], cargo=pp["cargo"], celular=pp["celular"], email=pp["email"],
                        etiquetas=pp["etiquetas"], institucion_id=inst.id if inst is not None else None,
                        notas=f"Llegó por la mesa de partes virtual ({expediente}).")
            sesion.add(p)
            await sesion.flush()
            hecho.append(f"contacto «{p.nombre}» creado")
        if not hecho:
            raise ValueError("Elija vincular o crear la persona o la institución.")
        usuario = await sesion.get(Usuario, usuario_id)
        await anotar_bitacora(sesion, usuario, "directorio", f"Mesa virtual {expediente}: " + "; ".join(hecho))
        await sesion.commit()
        return {"persona_id": p.id if p is not None else None, "institucion_id": inst.id if inst is not None else None, "hecho": hecho}


async def _destinos(campos: dict) -> list[dict]:
    from app.db import SesionAsincrona
    from app.servicios import mesas_partes

    claves = ("destinatario_nombre", "destinatario_cargo", "destinatario_institucion")
    async with SesionAsincrona() as sesion:
        return mesas_partes.resolver({k: str((campos or {}).get(k) or "") for k in claves}, await mesas_partes.cargar(sesion))


async def _instituciones() -> list[dict]:
    from app.db import SesionAsincrona
    from app.modelos import Institucion

    async with SesionAsincrona() as sesion:
        return [{"id": i.id, "nombre": i.nombre, "siglas": i.siglas, "parent_id": i.parent_id, "activo": bool(i.activo),
                 "tipo": i.tipo} for i in (await sesion.execute(select(Institucion))).scalars()]


async def _institucion_por_texto(texto: str) -> dict | None:
    from sqlalchemy import func

    from app.db import SesionAsincrona
    from app.modelos import Institucion

    t = str(texto or "").lower()
    async with SesionAsincrona() as sesion:
        i = (await sesion.execute(select(Institucion).where(
            Institucion.activo.is_(True), (func.lower(Institucion.siglas) == t) | (func.lower(Institucion.nombre) == t),
        ).limit(1))).scalar_one_or_none()
    return _ficha_institucion(i) if i is not None else None


def _sin_tildes(col):
    from sqlalchemy import func

    return func.translate(func.lower(col), "áéíóúüñ", "aeiouun")


async def _buscar(palabra: str, limite: int = 200) -> dict:
    from app.db import SesionAsincrona
    from app.modelos import Institucion, Persona

    async with SesionAsincrona() as sesion:
        insts = (await sesion.execute(select(Institucion).where(
            Institucion.activo.is_(True),
            or_(_sin_tildes(Institucion.nombre).contains(palabra), _sin_tildes(Institucion.siglas).contains(palabra))).limit(limite)
        )).scalars().all()
        personas = (await sesion.execute(select(Persona).where(
            Persona.activo.is_(True), _sin_tildes(Persona.nombre).contains(palabra)).limit(limite))).scalars().all()
    return {"instituciones": [{**_ficha_institucion(i), "tipo": i.tipo} for i in insts],
            "personas": [{"id": p.id, "nombre": p.nombre, "cargo": p.cargo, "institucion_id": p.institucion_id} for p in personas]}


async def _personas_por_nombre(nombres) -> list[dict]:
    from sqlalchemy import func

    from app.db import SesionAsincrona
    from app.modelos import Institucion, Persona

    normalizado = func.trim(func.regexp_replace(
        func.translate(func.lower(Persona.nombre), "áéíóúüñàèìòù", "aeiouunaeiou"), r"\s+", " ", "g"))
    async with SesionAsincrona() as sesion:
        filas = (await sesion.execute(
            select(Persona, Institucion.nombre).outerjoin(Institucion, Institucion.id == Persona.institucion_id)
            .where(Persona.activo.is_(True), normalizado.in_(sorted(nombres)))
        )).all()
    return [{"nombre": p.nombre, "cargo": p.cargo or "", "institucion": inst or ""} for p, inst in filas]


async def _diputados() -> list[str]:
    from app.db import SesionAsincrona
    from app.modelos import Persona

    async with SesionAsincrona() as sesion:
        return [n for (n,) in (await sesion.execute(select(Persona.nombre).where(Persona.cargo.ilike("%diputad%")))).all()]


DIRECTORIO_V1 = Superficie("directorio.v1", {
    "para_cruzar": lambda: _para_cruzar, "fichas": lambda: _fichas, "institucion_por_ruc": lambda: _institucion_por_ruc,
    "coincidencias": lambda: _coincidencias, "llevar": lambda: _llevar, "destinos": lambda: _destinos,
    "instituciones": lambda: _instituciones, "institucion_por_texto": lambda: _institucion_por_texto,
    "buscar": lambda: _buscar, "personas_por_nombre": lambda: _personas_por_nombre, "diputados": lambda: _diputados,
})

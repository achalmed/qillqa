"""Datos de las cuentas de la entidad: correo institucional, nombre de usuario
y clave inicial (reglas de Edison 2026-09-05).

  · Correo institucional = primera letra del PRIMER nombre + PRIMER apellido,
    sin tildes ni espacios, en minúsculas, @entidad.gob.pe.
        «Rosa María» «Quispe Huamán»  →  rquispe@entidad.gob.pe
  · Nombre de usuario = la parte local del correo (rquispe). Si ya existe, se
    le añade un número (rquispe2) para no chocar.
  · Clave INICIAL = el DNI. Es de UN solo uso: `debe_cambiar_clave` obliga a
    elegir otra en el primer acceso y `usuario_actual` bloquea la API hasta
    entonces. Sin DNI, la clave inicial es el propio usuario (regla anterior).

Se puede iniciar sesión con el usuario, con el correo completo o con la parte
local del correo: así una cuenta antigua cuyo usuario no coincide con el
correo (p. ej. `yjara` / rquispe@…) sigue entrando de las dos formas.
"""

import re
import unicodedata

DOMINIO = "congreso.gob.pe"


def sin_tildes(texto: str) -> str:
    limpio = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in limpio if not unicodedata.combining(c))


def _palabras(texto: str) -> list[str]:
    return [p for p in re.split(r"\s+", sin_tildes(texto).strip()) if p]


# Partículas que no cuentan como «primer apellido» («de la Cruz» → cruz).
_PARTICULAS = {"de", "del", "la", "las", "los", "y", "da", "do", "dos", "van", "von"}


def primer_apellido(apellidos: str) -> str:
    partes = _palabras(apellidos)
    for i, p in enumerate(partes):
        if p.lower() not in _PARTICULAS:
            # «De la Cruz» → se conserva la partícula pegada: delacruz
            return "".join(partes[: i + 1]) if i > 0 and partes[0].lower() in _PARTICULAS else p
    return partes[0] if partes else ""


def parte_local(nombres: str, apellidos: str) -> str:
    nombres_l = _palabras(nombres)
    apellido = primer_apellido(apellidos)
    if not nombres_l or not apellido:
        return ""
    local = (nombres_l[0][0] + apellido).lower()
    return re.sub(r"[^a-z0-9]", "", local)


def correo_institucional(nombres: str, apellidos: str) -> str:
    local = parte_local(nombres, apellidos)
    return f"{local}@{DOMINIO}" if local else ""


def usuario_de_correo(email: str) -> str:
    """Parte local del correo, normalizada como nombre de usuario."""
    local = (email or "").strip().lower().split("@", 1)[0]
    return re.sub(r"[^a-z0-9._-]", "", local)


def nombre_completo(nombres: str, apellidos: str) -> str:
    return " ".join(p for p in (nombres.strip(), apellidos.strip()) if p)


def dni_valido(dni: str) -> bool:
    return bool(re.fullmatch(r"\d{8}", (dni or "").strip()))


# --------------------------------------------------------------------------
# CARGO = lo único que se elige (Edison 2026-09-05: «el rol y el cargo son lo
# mismo»). Los permisos internos (`usuarios.rol`, que es lo que consulta
# `flujo.py`) se DERIVAN del cargo; nadie vuelve a elegir un «rol» aparte. La
# única excepción es «administrador del sistema», que no es un cargo del
# despacho sino un permiso extra (Edison es Auxiliar y administra el sistema):
# va como casilla y, si está marcada, manda sobre el cargo.
# --------------------------------------------------------------------------
CARGOS: dict[str, str] = {
    "Diputado": "diputado",
    "Asesor principal": "asesor",
    "Asesor": "asesor",
    "Coordinador": "asesor",
    "Asistente": "secretaria",
    "Auxiliar": "secretaria",
    # Técnico (2026-10-18): el cargo de parte del equipo comisionado a la Semana de representación; sale
    # tal cual en la declaración jurada y la rendición de viáticos (docs/arquitectura.md §32).
    "Técnico": "secretaria",
    "Secretaría": "secretaria",
    "Practicante": "secretaria",
    # Prensa (2026-10-06): el estudio de piezas y la Fototeca; no tramita documentos.
    "Prensa": "prensa",
    "Invitado": "invitado",
}

# Cargo que se muestra cuando una cuenta antigua no tiene ninguno guardado.
CARGO_POR_ROL = {
    "diputado": "Diputado",
    "asesor": "Asesor",
    "secretaria": "Secretaría",
    "prensa": "Prensa",
    "invitado": "Invitado",
    "administrador": "Auxiliar",
}


def normalizar_cargo(cargo: str) -> str:
    """Devuelve el cargo tal como está en la lista (sin importar mayúsculas o
    tildes) o '' si no es uno de los conocidos."""
    clave = sin_tildes(cargo or "").strip().lower()
    for c in CARGOS:
        if sin_tildes(c).lower() == clave:
            return c
    return ""


def rol_de(cargo: str, administrador: bool) -> str:
    if administrador:
        return "administrador"
    return CARGOS.get(normalizar_cargo(cargo), "secretaria")


# --- La cuenta y su ficha del directorio (2026-10-10) ---------------------------------------
# Edison: «solo debe haber un lugar desde donde se actualiza la información del equipo: desde
# Administración cambio el rol o el cargo y debe cambiar en el directorio y en la semana».
async def sincronizar_persona(sesion, u) -> None:
    """Pone al día (o crea) la persona del directorio de esta cuenta: nombre, cargo y correo.
    No hace commit. Busca por `persona_id`; si no hay, por nombre exacto (sin tildes) entre
    las personas sin institución, para no duplicar a quien ya estaba."""
    from sqlalchemy import select

    from app.modelos import Persona

    if not u.nombre_completo or u.rol == "invitado":
        return
    persona = await sesion.get(Persona, u.persona_id) if u.persona_id else None
    if persona is None:
        candidatas = (await sesion.execute(
            select(Persona).where(Persona.institucion_id.is_(None), Persona.activo.is_(True))
        )).scalars().all()
        clave = sin_tildes(u.nombre_completo).lower().split()
        persona = next((p for p in candidatas if sin_tildes(p.nombre or "").lower().split() == clave), None)
    cargo = u.cargo or CARGO_POR_ROL.get(u.rol, "")
    if persona is None:
        persona = Persona(nombre=u.nombre_completo, cargo=cargo, email=u.email or "", celular=getattr(u, "telefono", "") or "",
                          area="Equipo de la entidad",
                          notas="Cuenta de Qillqa: sus datos se cambian en Mi perfil o en Administración.", origen="manual")
        sesion.add(persona)
        await sesion.flush()
    else:
        persona.nombre = u.nombre_completo
        if cargo:
            persona.cargo = cargo
        if u.email:
            persona.email = u.email
        # El celular del perfil (2026-10-12) también llega a la ficha.
        if getattr(u, "telefono", ""):
            persona.celular = u.telefono
        persona.activo = bool(u.activo)
    u.persona_id = persona.id


# El otro sentido (2026-10-12): la ficha de quien tiene cuenta se edita en el directorio, pero lo que
# manda la cuenta (nombre, cargo, correo, celular, activo) se cambia en Mi perfil o en Administración:
# un solo lugar de verdad. El directorio no lo pisa en silencio: se explica.
ROTULOS_CUENTA = {"nombre": "nombre", "cargo": "cargo", "email": "correo", "celular": "celular", "activo": "estado activo"}


def dictado_por_cuenta(u) -> dict:
    """Lo que la cuenta dicta a su ficha del directorio (lo mismo que escribe `sincronizar_persona`)."""
    salida = {"nombre": u.nombre_completo or "", "activo": bool(u.activo)}
    cargo = u.cargo or CARGO_POR_ROL.get(u.rol, "")
    if cargo:
        salida["cargo"] = cargo
    if u.email:
        salida["email"] = u.email
    if getattr(u, "telefono", ""):
        salida["celular"] = u.telefono
    return salida


def conflictos_con_cuenta(enviados: dict, dictado: dict) -> list[str]:
    """Campos que la edición del directorio cambiaría respecto de lo que dicta la cuenta (sin
    distinguir mayúsculas ni espacios en los textos). Pura."""
    def igual(a, b) -> bool:
        if isinstance(b, bool) or isinstance(a, bool):
            return bool(a) == bool(b)
        return " ".join(str(a or "").split()).lower() == " ".join(str(b or "").split()).lower()

    return [c for c, v in dictado.items() if c in enviados and not igual(enviados[c], v)]


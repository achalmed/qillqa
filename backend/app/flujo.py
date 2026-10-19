"""Flujo de estados del documento y permisos por rol.

Un solo lugar define QUÉ transiciones son válidas y QUIÉN puede
hacerlas. La API valida contra esta matriz; el frontend pide las
transiciones permitidas para pintar solo los botones que aplican.

Nota (Fase 2): hoy todas las cuentas son 'administrador' (admin/admin),
que puede todo. La matriz por rol queda lista para cuando existan
cuentas personales de secretaria, asesor y diputado.
"""

# Estados del ciclo de vida (orden lógico).
ESTADOS = [
    "BORRADOR",
    "EN_REVISION",
    "OBSERVADO",
    "APROBADO",
    "FIRMADO",
    "ENVIADO",
    "OBSERVADO_ENVIADO",
    "ARCHIVADO",
]

# Etiquetas legibles (para mensajes del backend; el frontend tiene las suyas).
ETIQUETA = {
    "BORRADOR": "Borrador",
    "EN_REVISION": "En revisión",
    "OBSERVADO": "Observado",
    "APROBADO": "Aprobado",
    "FIRMADO": "Firmado",
    "ENVIADO": "Enviado",
    "OBSERVADO_ENVIADO": "Observado posterior",
    "ARCHIVADO": "Archivado",
}

# Matriz: estado_origen -> { estado_destino: {roles permitidos} }.
# El paso a APROBADO NO está aquí: aprobar asigna el número oficial y se
# hace por /generar (transacción con el contador). Desde ARCHIVADO sí se
# puede reactivar a APROBADO (el número ya existe) — solo administrador.
_ROLES_SECRETARIA = {"secretaria", "administrador"}
_ROLES_REVISOR = {"diputado", "asesor", "administrador"}
_ROLES_DIPUTADO = {"diputado", "administrador"}
_SOLO_ADMIN = {"administrador"}

TRANSICIONES: dict[str, dict[str, set[str]]] = {
    "BORRADOR": {
        "EN_REVISION": _ROLES_SECRETARIA | {"asesor"},
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    "EN_REVISION": {
        "OBSERVADO": _ROLES_REVISOR,
        "BORRADOR": _ROLES_SECRETARIA,
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    "OBSERVADO": {
        "EN_REVISION": _ROLES_SECRETARIA | {"asesor"},
        "BORRADOR": _ROLES_SECRETARIA,
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    "APROBADO": {
        "FIRMADO": _ROLES_DIPUTADO,
        "ENVIADO": _ROLES_SECRETARIA,
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    "FIRMADO": {
        "ENVIADO": _ROLES_SECRETARIA,
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    "ENVIADO": {
        # Observar después del envío es un acto de REVISIÓN, no de secretaría:
        # el diputado y el asesor deben poder hacerlo igual que en revisión
        # (antes solo secretaría, y el diputado se quedaba sin la acción que
        # el flujo de observaciones le atribuye — corregido 2026-09-04).
        "OBSERVADO_ENVIADO": _ROLES_SECRETARIA | _ROLES_REVISOR,
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    # Observación POSTERIOR al envío (algo surgió tras enviar): se resuelve
    # volviendo a ENVIADO o se archiva. Quien corrige puede ser el asesor,
    # igual que al levantar una observación de revisión.
    "OBSERVADO_ENVIADO": {
        "ENVIADO": _ROLES_SECRETARIA | {"asesor"},
        "ARCHIVADO": _ROLES_SECRETARIA,
    },
    "ARCHIVADO": {
        "APROBADO": _SOLO_ADMIN,
        "BORRADOR": _SOLO_ADMIN,
    },
}


def transicion_permitida(origen: str, destino: str, rol: str) -> bool:
    return rol in TRANSICIONES.get(origen, {}).get(destino, set())


def transiciones_para(origen: str, rol: str) -> list[str]:
    """Estados a los que `rol` puede mover un documento que está en `origen`."""
    return [
        destino
        for destino, roles in TRANSICIONES.get(origen, {}).items()
        if rol in roles
    ]


def puede_aprobar(rol: str) -> bool:
    """Aprobar (= numerar oficialmente) vía /generar."""
    return rol in _ROLES_DIPUTADO


def ve_autoria(usuario_o_rol) -> bool:
    """¿Ve QUIÉN hizo cada cosa (procesado por, bitácora, autor de versiones)?

    Todos los roles de trabajo de la entidad, no solo el administrador (Edison
    2026-10-01: «forma parte de la información necesaria para conocer quién
    está haciendo y el recorrido del expediente»). El invitado no: es una
    cuenta de consulta, a menudo de alguien ajeno al despacho.
    """
    rol = getattr(usuario_o_rol, "rol", usuario_o_rol)
    return rol != "invitado"

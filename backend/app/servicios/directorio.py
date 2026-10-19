"""Directorio institucional: siembra desde ~/Documents/bookmarks y consultas
para el autocompletado.

El proyecto de marcadores es la fuente: `DIRECTORIO_RAPIDO.md` (tablas de
ministerios, poderes, autónomos y reguladores con su Mesa de Partes Virtual)
y `instituciones/regiones/README.md` (los 25 GORE + Callao, con gobernador).
El importador es IDEMPOTENTE (upsert por siglas/nombre) y solo rellena campos
VACÍOS al reimportar, para no pisar lo que el usuario haya editado a mano.
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import and_, case, func, func as safunc, or_, select
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Enlace, Institucion, Persona

# Nombre oficial de los ministerios (las tablas solo traen la sigla). Datos
# estables; el resto de entidades usa el rótulo de la tabla como nombre.
NOMBRES = {
    "PCM": "Presidencia del Consejo de Ministros",
    "RREE": "Ministerio de Relaciones Exteriores",
    "MINDEF": "Ministerio de Defensa",
    "MEF": "Ministerio de Economía y Finanzas",
    "MININTER": "Ministerio del Interior",
    "MINJUSDH": "Ministerio de Justicia y Derechos Humanos",
    "MINEDU": "Ministerio de Educación",
    "MINSA": "Ministerio de Salud",
    "MIDAGRI": "Ministerio de Desarrollo Agrario y Riego",
    "MTPE": "Ministerio de Trabajo y Promoción del Empleo",
    "PRODUCE": "Ministerio de la Producción",
    "MINCETUR": "Ministerio de Comercio Exterior y Turismo",
    "MINEM": "Ministerio de Energía y Minas",
    "MTC": "Ministerio de Transportes y Comunicaciones",
    "MVCS": "Ministerio de Vivienda, Construcción y Saneamiento",
    "MIMP": "Ministerio de la Mujer y Poblaciones Vulnerables",
    "MINAM": "Ministerio del Ambiente",
    "MINCUL": "Ministerio de Cultura",
    "MIDIS": "Ministerio de Desarrollo e Inclusión Social",
}

# Título de sección (en minúsculas, por subcadena) -> tipo de institución.
_TIPO_SECCION = [
    ("ministerio", "ministerio"),
    ("poderes del estado", "poder"),
    ("organismos autónomos", "autonomo"),
    ("reguladores", "regulador"),
]

# Palabra clave del encabezado de columna -> (tipo de enlace, ¿es url principal?)
_COLS = [
    ("mesa de partes", "mesa_partes"),
    ("ficha", "oficial"),
    ("portal", "oficial"),
    ("gob.pe", "oficial"),
    ("seguimiento", "seguimiento"),
    ("transp", "transparencia"),
    ("func", "funcionarios"),
    ("autoridad", "funcionarios"),
    ("datos", "datos"),
    ("repositorio", "datos"),
    ("admis", "servicio"),
    ("servicio", "servicio"),
    ("pte", "transparencia"),
]


# --------------------------- primitivas markdown -------------------------

def _celdas(linea: str) -> list[str]:
    return [c.strip() for c in linea.strip().strip("|").split("|")]


def _es_separador(linea: str) -> bool:
    s = linea.strip()
    return s.startswith("|") and set(s) <= set("|-: ")


def _tablas(texto: str) -> list[tuple[list[str], list[list[str]]]]:
    """Cada tabla markdown como (encabezados, filas)."""
    out: list[tuple[list[str], list[list[str]]]] = []
    lineas = texto.splitlines()
    i = 0
    while i < len(lineas):
        if (
            lineas[i].strip().startswith("|")
            and i + 1 < len(lineas)
            and _es_separador(lineas[i + 1])
        ):
            enc = _celdas(lineas[i])
            filas = []
            j = i + 2
            while j < len(lineas) and lineas[j].strip().startswith("|"):
                filas.append(_celdas(lineas[j]))
                j += 1
            out.append((enc, filas))
            i = j
        else:
            i += 1
    return out


def _secciones(texto: str) -> list[tuple[str, str]]:
    """[(titulo, cuerpo)] por cada encabezado '## '."""
    partes = re.split(r"^##\s+(.+)$", texto, flags=re.M)
    return [
        (partes[k].strip(), partes[k + 1] if k + 1 < len(partes) else "")
        for k in range(1, len(partes), 2)
    ]


_RE_ENLACE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
_RE_SIMBOLOS = re.compile(r"[⭐✅❌⚠️🏛️📂👤🗓️📊📥✉️🎓🏢🧭•·]")


def _primer_url(celda: str) -> str:
    m = _RE_ENLACE.search(celda or "")
    if m:
        u = m.group(2).strip()
        return u if u.lower().startswith(("http://", "https://")) else ""
    return ""


def _texto_plano(celda: str) -> str:
    s = _RE_ENLACE.sub(r"\1", celda or "")
    s = s.replace("**", "").replace("`", "")
    s = _RE_SIMBOLOS.sub("", s)
    return s.strip(" *—-").strip()


def _es_sigla(t: str) -> bool:
    return bool(t) and " " not in t and len(t) <= 10 and t.upper() == t


# ------------------------------ upsert helpers ---------------------------

async def _buscar_inst(sesion: AsyncSession, siglas: str, nombre: str) -> Institucion | None:
    if siglas:
        q = select(Institucion).where(safunc.lower(Institucion.siglas) == siglas.lower())
    else:
        q = select(Institucion).where(safunc.lower(Institucion.nombre) == nombre.lower())
    return (await sesion.execute(q)).scalars().first()


async def _upsert_inst(
    sesion: AsyncSession,
    res: dict,
    *,
    nombre: str,
    siglas: str = "",
    tipo: str = "otro",
    url_oficial: str = "",
    url_mesa_partes: str = "",
    region: str = "",
    nivel_gobierno: str = "",
) -> Institucion | None:
    if not nombre:
        return None
    inst = await _buscar_inst(sesion, siglas, nombre)
    if inst is None:
        inst = Institucion(
            nombre=nombre, siglas=siglas, tipo=tipo, region=region,
            nivel_gobierno=nivel_gobierno, url_oficial=url_oficial,
            url_mesa_partes=url_mesa_partes, origen="import",
        )
        sesion.add(inst)
        await sesion.flush()
        res["instituciones"] += 1
        return inst
    # Existente: rellenar SOLO lo que esté vacío (no pisar ediciones a mano).
    cambiado = False
    for campo, valor in (
        ("url_oficial", url_oficial),
        ("url_mesa_partes", url_mesa_partes),
        ("region", region),
        ("nivel_gobierno", nivel_gobierno),
    ):
        if valor and not getattr(inst, campo):
            setattr(inst, campo, valor)
            cambiado = True
    if cambiado:
        res["actualizadas"] += 1
    return inst


async def _agregar_enlace(
    sesion: AsyncSession, res: dict, inst: Institucion, tipo: str, url: str, etiqueta: str = ""
) -> None:
    if not url:
        return
    ya = (
        await sesion.execute(
            select(Enlace.id).where(Enlace.institucion_id == inst.id, Enlace.url == url)
        )
    ).first()
    if ya:
        return
    sesion.add(Enlace(institucion_id=inst.id, tipo=tipo, url=url, etiqueta=etiqueta))
    res["enlaces"] += 1


async def _agregar_persona(
    sesion: AsyncSession, res: dict, inst: Institucion, nombre: str, cargo: str
) -> None:
    if not nombre:
        return
    ya = (
        await sesion.execute(
            select(Persona.id).where(
                Persona.institucion_id == inst.id,
                safunc.lower(Persona.nombre) == nombre.lower(),
            )
        )
    ).first()
    if ya:
        return
    sesion.add(Persona(nombre=nombre, cargo=cargo, institucion_id=inst.id, origen="import"))
    res["personas"] += 1


# ------------------------------ parsers por fuente -----------------------

async def _importar_directorio_rapido(sesion: AsyncSession, texto: str, res: dict) -> None:
    for titulo, cuerpo in _secciones(texto):
        t = titulo.lower()
        tipo = next((v for clave, v in _TIPO_SECCION if clave in t), None)
        if tipo is None:
            continue
        for enc, filas in _tablas(cuerpo):
            encl = [c.lower() for c in enc]
            for celdas in filas:
                try:
                    if not celdas or not celdas[0].strip():
                        continue
                    rotulo = _texto_plano(celdas[0])
                    if not rotulo:
                        continue
                    if _es_sigla(rotulo):
                        siglas, nombre = rotulo, NOMBRES.get(rotulo, rotulo)
                    else:
                        siglas, nombre = "", rotulo
                    # Recolectar urls por columna
                    url_oficial = url_mp = ""
                    enlaces: list[tuple[str, str]] = []
                    for k in range(1, min(len(celdas), len(encl))):
                        url = _primer_url(celdas[k])
                        if not url:
                            continue
                        cab = encl[k]
                        tipo_enl = next((v for clave, v in _COLS if clave in cab), "otro")
                        if tipo_enl == "mesa_partes" and not url_mp:
                            url_mp = url
                        if tipo_enl == "oficial" and not url_oficial:
                            url_oficial = url
                        enlaces.append((tipo_enl, url))
                    inst = await _upsert_inst(
                        sesion, res, nombre=nombre, siglas=siglas, tipo=tipo,
                        url_oficial=url_oficial, url_mesa_partes=url_mp,
                        nivel_gobierno="nacional",
                    )
                    if inst is None:
                        continue
                    for tipo_enl, url in enlaces:
                        await _agregar_enlace(sesion, res, inst, tipo_enl, url)
                except Exception:
                    continue  # una fila mal formada nunca tumba el import


async def _importar_regiones(sesion: AsyncSession, texto: str, res: dict) -> None:
    for enc, filas in _tablas(texto):
        encl = [c.lower() for c in enc]
        # La tabla de regiones tiene "Región" en la 1.ª columna.
        if not encl or "regi" not in encl[0]:
            continue
        for celdas in filas:
            try:
                region = _texto_plano(celdas[0]) if celdas else ""
                if not region:
                    continue
                nombre = f"Gobierno Regional de {region}"
                url_oficial = _primer_url(celdas[1]) if len(celdas) > 1 else ""
                url_mp = _primer_url(celdas[2]) if len(celdas) > 2 else ""
                inst = await _upsert_inst(
                    sesion, res, nombre=nombre, siglas="", tipo="region",
                    url_oficial=url_oficial, url_mesa_partes=url_mp,
                    region=region, nivel_gobierno="regional",
                )
                if inst is None:
                    continue
                # PTE (transparencia)
                if len(celdas) > 3:
                    await _agregar_enlace(sesion, res, inst, "transparencia", _primer_url(celdas[3]))
                # Gobernador + enlace de funcionarios (última columna)
                if len(celdas) > 4:
                    gob = _texto_plano(celdas[4])
                    await _agregar_enlace(sesion, res, inst, "funcionarios", _primer_url(celdas[4]))
                    if gob and "directorio" not in gob.lower() and "ver " not in gob.lower():
                        await _agregar_persona(sesion, res, inst, gob, "Gobernador Regional")
            except Exception:
                continue


async def _importar_consolidado(
    sesion: AsyncSession,
    texto: str,
    res: dict,
    *,
    tipo: str,
    primera_col: str,
    transformar=None,
    nivel: str = "",
) -> None:
    """Importa un README consolidado (universidades / municipalidades /
    empresas públicas): tablas markdown cuya PRIMERA columna (encabezado que
    contiene `primera_col`) es la entidad y las demás son URLs clasificadas
    por su encabezado (_COLS). Las tablas de otro tipo (p. ej. «Directorios
    nacionales», Recurso|URL) se saltan solas por el encabezado."""
    for enc, filas in _tablas(texto):
        encl = [c.lower() for c in enc]
        if not encl or primera_col not in encl[0]:
            continue
        for celdas in filas:
            try:
                rotulo = _texto_plano(celdas[0]) if celdas else ""
                if not rotulo:
                    continue
                nombre = transformar(rotulo) if transformar else rotulo
                url_oficial = url_mp = ""
                enlaces: list[tuple[str, str]] = []
                for k in range(1, min(len(celdas), len(encl))):
                    url = _primer_url(celdas[k])
                    if not url:
                        continue
                    tipo_enl = next((v for clave, v in _COLS if clave in encl[k]), "otro")
                    if tipo_enl == "mesa_partes" and not url_mp:
                        url_mp = url
                    if tipo_enl == "oficial" and not url_oficial:
                        url_oficial = url
                    enlaces.append((tipo_enl, url))
                inst = await _upsert_inst(
                    sesion, res, nombre=nombre, tipo=tipo,
                    url_oficial=url_oficial, url_mesa_partes=url_mp,
                    nivel_gobierno=nivel,
                )
                if inst is None:
                    continue
                for tipo_enl, url in enlaces:
                    await _agregar_enlace(sesion, res, inst, tipo_enl, url)
            except Exception:
                continue


_RE_PARENTESIS = re.compile(r"\s*\([^)]*\)\s*$")


def _nombre_universidad(rotulo: str) -> str:
    """«UN Mayor de San Marcos» -> «Universidad Nacional Mayor de San Marcos»."""
    r = rotulo.strip()
    return f"Universidad Nacional {r[3:]}" if r.startswith("UN ") else r


_MUNIS_ESPECIALES = {
    "Lima Metropolitana": "Municipalidad Metropolitana de Lima",
    "Callao": "Municipalidad Provincial del Callao",
    "Cusco": "Municipalidad Provincial del Cusco",
}


def _nombre_municipalidad(rotulo: str) -> str:
    """«Maynas (Iquitos)» -> «Municipalidad Provincial de Maynas»."""
    r = _RE_PARENTESIS.sub("", rotulo).strip()
    return _MUNIS_ESPECIALES.get(r, f"Municipalidad Provincial de {r}")


def _nombre_empresa(rotulo: str) -> str:
    """«FONAFE (holding)» -> «FONAFE»."""
    return _RE_PARENTESIS.sub("", rotulo).strip()


# Nombre del directorio rápido en la carpeta de marcadores: el actual (kebab-case, 2026-09-15) y el anterior.
DIRECTORIO_RAPIDO = ("directorio-rapido.md", "DIRECTORIO_RAPIDO.md")


def archivo_directorio_rapido(ruta: Path) -> Path | None:
    return next((ruta / n for n in DIRECTORIO_RAPIDO if (ruta / n).is_file()), None)


async def importar(sesion: AsyncSession, ruta: Path) -> dict:
    """Siembra el directorio desde la carpeta de marcadores. Idempotente."""
    if not ruta or not ruta.is_dir():
        raise HTTPException(400, f"No se encontró la carpeta de marcadores: {ruta}")
    res = {"instituciones": 0, "actualizadas": 0, "personas": 0, "enlaces": 0, "avisos": []}
    dr = archivo_directorio_rapido(ruta)
    if dr:
        await _importar_directorio_rapido(sesion, dr.read_text(encoding="utf-8"), res)
    else:
        # Antes se omitía en silencio: el 2026-09-15 el archivo pasó a kebab-case y el directorio dejó de importarse.
        res["avisos"].append(f"No está el directorio rápido ({' ni '.join(DIRECTORIO_RAPIDO)}) en {ruta}: "
                             "ministerios, poderes, autónomos y reguladores no se importaron.")
    reg = ruta / "instituciones" / "regiones" / "README.md"
    if reg.is_file():
        await _importar_regiones(sesion, reg.read_text(encoding="utf-8"), res)
    # Consolidados: universidades, municipalidades y empresas públicas.
    base_inst = ruta / "instituciones"
    consolidados = [
        (base_inst / "universidades" / "README.md",
         dict(tipo="universidad", primera_col="universidad",
              transformar=_nombre_universidad, nivel="nacional")),
        (base_inst / "municipalidades" / "README.md",
         dict(tipo="municipalidad", primera_col="municipalidad",
              transformar=_nombre_municipalidad, nivel="local")),
        (base_inst / "empresas-publicas" / "README.md",
         dict(tipo="empresa", primera_col="empresa",
              transformar=_nombre_empresa, nivel="nacional")),
    ]
    for archivo, kwargs in consolidados:
        if archivo.is_file():
            await _importar_consolidado(
                sesion, archivo.read_text(encoding="utf-8"), res, **kwargs
            )
    # El llamador (endpoint) hace commit + registra en bitácora.
    return res


# ------------------------------ consultas (API) --------------------------

def resumen_inst(i: Institucion) -> dict:
    return {
        "id": i.id, "nombre": i.nombre, "siglas": i.siglas, "tipo": i.tipo,
        "sector": i.sector, "nivel_gobierno": i.nivel_gobierno,
        "parent_id": i.parent_id, "region": i.region,
        "url_oficial": i.url_oficial, "url_mesa_partes": i.url_mesa_partes,
        "recepcion_canal": i.recepcion_canal, "recepcion_dato": i.recepcion_dato, "recepcion_nota": i.recepcion_nota,
        "email": i.email, "telefono": i.telefono, "direccion": i.direccion,
        "ruc": i.ruc,
        "activo": i.activo, "notas": i.notas, "origen": i.origen,
        "categoria": i.categoria, "orden": i.orden, "fuente": i.fuente,
        "url_fuente": i.url_fuente, "fecha_consulta": i.fecha_consulta,
        "norma": i.norma,
    }


def resumen_persona(p: Persona) -> dict:
    return {
        "id": p.id, "nombre": p.nombre, "cargo": p.cargo,
        "tratamiento": p.tratamiento, "institucion_id": p.institucion_id,
        "email": p.email, "email_alterno": p.email_alterno,
        "telefono": p.telefono, "celular": p.celular, "anexo": p.anexo,
        "oficina": p.oficina, "area": p.area, "activo": p.activo,
        "notas": p.notas, "origen": p.origen,
        # Contactos (2026-10-13): la versión de la foto (cambia con cada subida; vacía = sin foto) y
        # las etiquetas o grupos.
        "foto": Path(p.foto).stem if p.foto else "",
        "etiquetas": list(p.etiquetas or []),
    }


# --------------------------------------------------------------------------
# BÚSQUEDA FLEXIBLE (Edison 2026-09-05): «que encuentre a la persona se escriba
# como se escriba el apellido» — completo, parcial, con coma, nombre y
# apellido, y también por su institución («MEF», «Educ»). Reglas:
#   · la consulta se parte en PALABRAS (la coma y los espacios separan);
#   · cada palabra debe aparecer en ALGÚN campo (nombre, cargo, institución,
#     siglas, contacto…); todas las palabras deben cumplirse (AND);
#   · sin tildes ni mayúsculas en los dos lados («Jose» encuentra «José»).
# La comparación sin tildes se hace en SQL con translate(), que no necesita
# la extensión unaccent.
# --------------------------------------------------------------------------
_CON_TILDE = "áéíóúüñÁÉÍÓÚÜÑ"
_SIN_TILDE = "aeiouunAEIOUUN"


def _plano(col):
    return func.lower(func.translate(col, _CON_TILDE, _SIN_TILDE))


def _palabras(q: str) -> list[str]:
    import re
    limpio = (q or "").translate(str.maketrans(_CON_TILDE, _SIN_TILDE)).lower()
    return [w for w in re.split(r"[\s,;]+", limpio) if len(w) >= 1]


def _condicion_palabras(q: str, columnas) -> object | None:
    """AND de palabras; cada palabra, OR sobre las columnas dadas."""
    palabras = _palabras(q)
    if not palabras:
        return None
    return and_(*[
        or_(*[_plano(c).like(f"%{w}%") for c in columnas]) for w in palabras
    ])


async def buscar_instituciones(
    sesion: AsyncSession, q: str, incluir_inactivos: bool = False, limite: int = 20
) -> list[Institucion]:
    consulta = select(Institucion)
    if not incluir_inactivos:
        consulta = consulta.where(Institucion.activo.is_(True))
    cond = _condicion_palabras(q, [
        Institucion.nombre, Institucion.siglas, Institucion.region, Institucion.ruc,
    ])
    if cond is not None:
        consulta = consulta.where(cond)
    # Las siglas que EMPIEZAN por lo escrito («MIN» → MINEDU, MININTER) van
    # primero; luego el resto por nombre.
    palabras = _palabras(q)
    if palabras:
        consulta = consulta.order_by(
            case((_plano(Institucion.siglas).like(f"{palabras[0]}%"), 0), else_=1),
            Institucion.nombre,
        )
    else:
        consulta = consulta.order_by(Institucion.nombre)
    consulta = consulta.limit(limite)
    return list((await sesion.execute(consulta)).scalars().all())


async def buscar_personas(
    sesion: AsyncSession, q: str, incluir_inactivos: bool = False, limite: int = 20
) -> list[Persona]:
    # outerjoin con la institución para poder buscar por «MEF» o por parte
    # del nombre de la entidad.
    consulta = select(Persona).outerjoin(Institucion, Persona.institucion_id == Institucion.id)
    if not incluir_inactivos:
        consulta = consulta.where(Persona.activo.is_(True))
    # Se busca también por los DATOS DE CONTACTO: en el despacho se pregunta
    # «¿de quién es este número?» tanto como «¿cuál es el número de fulano?».
    cond = _condicion_palabras(q, [
        Persona.nombre, Persona.cargo, Persona.email, Persona.email_alterno,
        Persona.celular, Persona.telefono, Persona.anexo, Persona.area,
        Persona.oficina, Institucion.nombre, Institucion.siglas,
    ])
    if cond is not None:
        consulta = consulta.where(cond)
    consulta = consulta.order_by(Persona.nombre).limit(limite)
    return list((await sesion.execute(consulta)).scalars().all())

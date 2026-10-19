"""Reglas del módulo de PROYECTOS (piloto 2026-10-01), puras y probables.

  · Candado de PARTE: quien abre una parte para escribir la «toma»; mientras
    su pestaña siga latiendo (CANDADO_VIGENTE) nadie más la escribe, y todos
    ven quién está en ella. Es colaboración por partes —cada persona en su
    sección, a la vez—, la fase 1 recomendada antes de la edición simultánea
    con Yjs (docs/plataforma/propuesta.md §Colaboración). Un candado que no
    late caduca solo: una laptop cerrada no deja una parte bloqueada.
  · Menciones: «@usuario» en un comentario avisa a esa persona.
  · Avance: fases hechas, partes aprobadas, tareas abiertas.
  · Guardado automático: lo escrito se guarda solo; una racha de guardados
    automáticos de la misma persona es UNA versión que avanza, no cincuenta.
  · Fecha del proyecto: automática (la del día en que se compone el PDF)
    hasta que se fija sola al firmar o al presentar.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

CANDADO_VIGENTE = timedelta(seconds=90)

ESTADOS_SECCION = ("borrador", "en_revision", "observada", "aprobada")
ESTADOS_FASE = ("pendiente", "en_curso", "hecha", "omitida")
ESTADOS_TAREA = ("por_hacer", "en_curso", "hecha")
ROLES_MIEMBRO = ("responsable", "redactor", "revisor", "colaborador")
ESTADOS_PROYECTO = (
    "idea",
    "en_elaboracion",
    "en_revision",
    "listo_para_presentar",
    "presentado",
    "en_comision",
    "dictaminado",
    "en_pleno",
    "aprobado",
    "ley_publicada",
    "archivado",
    "retirado",
)
# Desde «presentado» el proyecto ya salió de la entidad: su fecha no cambia más.
ESTADOS_PRESENTADO = ("presentado", "en_comision", "dictaminado", "en_pleno", "aprobado", "ley_publicada")
# Proyectos que ya no piden trabajo: sus tareas no salen en «Mis tareas».
ESTADOS_CERRADOS = ("ley_publicada", "archivado", "retirado")


# Cómo se nombra cada estado en la bitácora (se lee, no se interpreta).
ETIQUETA = {
    "pendiente": "pendiente", "en_curso": "en curso", "hecha": "hecha", "omitida": "no aplica",
    "borrador": "borrador", "en_revision": "en revisión", "observada": "observada", "aprobada": "aprobada",
    "por_hacer": "por hacer", "idea": "idea", "en_elaboracion": "en elaboración",
    "listo_para_presentar": "lista para presentar", "presentado": "presentado", "en_comision": "en comisión",
    "dictaminado": "dictaminado", "en_pleno": "en el Pleno", "aprobado": "aprobado",
    "ley_publicada": "ley publicada", "archivado": "archivado", "retirado": "retirado",
}


def etiqueta(estado: str) -> str:
    return ETIQUETA.get(estado, estado.replace("_", " "))


# Las tres categorías que no se mezclan (Edison 2026-10-01, §5):
#   oficial        = lo que exige la norma (Constitución, reglamentos);
#   despacho       = el flujo interno que el despacho decide seguir;
#   buena_practica = mejora el trabajo, pero no es requisito de nadie.
NATURALEZAS = ("oficial", "despacho", "buena_practica")


def naturaleza_de(fuente: str) -> str:
    """Categoría de un requisito por su fuente, cuando la plantilla no la dice."""
    f = (fuente or "").lower()
    if f.startswith("buena práctica") or f.startswith("buena practica"):
        return "buena_practica"
    if any(k in f for k in ("reglamento", "const.", "constitución", "ley ")):
        return "oficial"
    return "despacho"


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def candado_vigente(
    editando_por: int | None, editando_desde: datetime | None, momento: datetime | None = None
) -> bool:
    if not editando_por or editando_desde is None:
        return False
    return (momento or ahora()) - editando_desde <= CANDADO_VIGENTE


def puede_tomar(
    usuario_id: int,
    editando_por: int | None,
    editando_desde: datetime | None,
    momento: datetime | None = None,
) -> bool:
    """La parte está libre, es suya, o el candado ajeno caducó."""
    return (
        not candado_vigente(editando_por, editando_desde, momento)
        or editando_por == usuario_id
    )


_MENCION = re.compile(r"(?<![\w.])@([a-z0-9][a-z0-9._-]{1,48})", re.IGNORECASE)


def menciones(texto: str, usuarios_validos: set[str]) -> list[str]:
    """Usuarios mencionados con «@usuario» que existen, sin repetir y en orden."""
    vistos: list[str] = []
    for m in _MENCION.finditer(texto or ""):
        u = m.group(1).lower().rstrip(".")
        if u in usuarios_validos and u not in vistos:
            vistos.append(u)
    return vistos


def avance(fases: list[str], secciones: list[tuple[str, bool]], tareas: list[str]) -> dict:
    """fases: estados; secciones: (estado, obligatoria); tareas: estados."""
    utiles = [f for f in fases if f != "omitida"]
    obligatorias = [e for e, ob in secciones if ob]
    return {
        "fases_hechas": sum(1 for f in utiles if f == "hecha"),
        "fases_total": len(utiles),
        "partes_aprobadas": sum(1 for e in obligatorias if e == "aprobada"),
        "partes_total": len(obligatorias),
        "tareas_abiertas": sum(1 for t in tareas if t != "hecha"),
    }


def codigo_siguiente(prefijo: str, anio: int, existentes: list[str]) -> str:
    """PL-2026-001, PL-2026-002… (correlativo interno por año)."""
    base = f"{prefijo}-{anio}-"
    usados = [int(c[len(base):]) for c in existentes if c.startswith(base) and c[len(base):].isdigit()]
    return f"{base}{(max(usados) + 1) if usados else 1:03d}"


def texto_plano(contenido: dict) -> str:
    """Texto de un documento TipTap (para contar palabras y buscar)."""
    partes: list[str] = []

    def recorrer(n: dict) -> None:
        if n.get("type") == "text":
            partes.append(n.get("text", ""))
        for h in n.get("content", []) or []:
            recorrer(h)
        if n.get("type") in ("paragraph", "heading", "listItem"):
            partes.append("\n")

    recorrer(contenido or {})
    return "".join(partes).strip()


# --- Guardado automático (2026-10-01) -------------------------------------
# Revisión de usabilidad: quien escribía una parte y pasaba a otra sin pulsar
# «Guardar» perdía el texto sin aviso. Ahora se guarda solo; para no llenar el
# historial de versiones casi iguales, los guardados automáticos seguidos de
# la misma persona se UNEN en una sola versión (la última) mientras no pase
# VENTANA_AUTO ni la guarde otra persona o a mano. Un «Guardar» con nota sigue
# creando su propia versión.
# Título de la ley (2026-10-06, lo aprendido del asesor): pegado desde Word
# llega como «PROPOSICIÓN LEGISLATIVA QUE DECLARA…» y el sistema, que antepone
# la forma «Ley que», lo dejaba «Ley que PROPOSICIÓN LEGISLATIVA QUE DECLARA…».
# El rótulo del documento («proposición legislativa», «proyecto de ley») no es
# parte del título: el título dice qué hace la ley (Manual de Técnica
# Legislativa, p. 43). Espejo de normalizarTitulo (frontend/src/estructuraLey.ts).
_RUIDO_TITULO = re.compile(
    r"^(?:(?:la\s+)?(?:proposici[oó]n\s+legisl\w*|proyecto\s+de\s+ley)\s+|ley\s+que\s+(?=(?:proposici[oó]n|proyecto\s+de\s+ley|ley\s+que)\b))",
    re.IGNORECASE,
)


def titulo_ley(titulo: str) -> str:
    """«Ley que PROPOSICIÓN LEGISLATIVA QUE declara…» → «Ley que declara…»."""
    t = " ".join((titulo or "").split())
    for _ in range(4):
        nuevo = _RUIDO_TITULO.sub("", t, count=1)
        if nuevo == t:
            break
        t = nuevo
    if re.match(r"^que\s", t, re.IGNORECASE):
        t = "Ley que " + t[4:]
    return uniformar_mayusculas(t)


# Mayúsculas del título (2026-10-06, pedido de Edison: «algunos se ven en todo mayúscula, otros en
# minúscula; que se uniforme solo, aunque el trabajador lo escriba en distintos formatos»). Un
# título en MAYÚSCULAS (lo que se pega del Word), en minúsculas o con Cada Palabra Capitalizada pasa
# a la forma del Manual de Técnica Legislativa: mayúscula inicial y nombres propios. Un título
# ya escrito en forma normal no se toca: lo que el autor corrija a mano se respeta.
_FORMAS = ("Ley de Reforma Constitucional que", "Resolución Legislativa que", "Ley Orgánica de", "Ley Marco de",
           "Ley General de", "Ley que", "Ley de")
_MENORES = {"de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "a", "al", "en", "para", "por", "con", "que", "sobre"}
_SIGLAS = ("SUNAT", "MINSA", "MINEDU", "MIDAGRI", "MTC", "MEF", "MVCS", "ANA", "ANIN", "INDECI", "PNP", "ONP", "SIS",
           "UGEL", "DRE", "INEI", "JNE", "ONPE", "RENIEC", "SUNEDU", "OSCE", "SERVIR", "CEPLAN", "EsSalud", "COVID-19")
_PROPIOS = ("Perú", "República", "Congreso de la República", "Constitución Política", "Poder Ejecutivo", "Poder Judicial",
            "Amazonas", "Áncash", "Apurímac", "Arequipa", "Cajamarca", "Callao", "Cusco", "Huancavelica", "Huánuco",
            "Ica", "Junín", "La Libertad", "Lambayeque", "Lima", "Loreto", "Madre de Dios", "Moquegua", "Pasco",
            "Piura", "Puno", "San Martín", "Tacna", "Tumbes", "Ucayali", "VRAEM")
# Distritos que son también palabras comunes: no se capitalizan solos.
_COMUNES = {"independencia", "concepcion", "paras", "canaria", "tambo", "chaca", "anco", "lampa", "san juan", "colca"}
_ROMANO = re.compile(r"^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})$")


def _sin_tildes(s: str) -> str:
    import unicodedata
    # Carácter a carácter: la longitud se conserva y las posiciones sirven en el original.
    return "".join(unicodedata.normalize("NFD", c)[0] for c in s).lower()


_PATRON_PROPIOS: tuple[re.Pattern, dict[str, str]] | None = None


def _propios() -> tuple[re.Pattern, dict[str, str]]:
    """Nombres propios conocidos (los de arriba y los distritos y provincias del catálogo)."""
    global _PATRON_PROPIOS
    if _PATRON_PROPIOS is None:
        from app.servicios.territorio import filas_csv

        nombres = set(_PROPIOS) | set(_SIGLAS)
        for f in filas_csv():
            for clave in ("departamento", "provincia", "distrito"):
                nombres.add(re.sub(r"\s*\(.*\)$", "", f.get(clave) or "").strip())
        mapa = {_sin_tildes(n): n for n in nombres if n and _sin_tildes(n) not in _COMUNES}
        alternativas = "|".join(re.escape(k) for k in sorted(mapa, key=len, reverse=True))
        _PATRON_PROPIOS = (re.compile(rf"(?<![\w-])(?:{alternativas})(?![\w-])"), mapa)
    return _PATRON_PROPIOS


def _desordenado(t: str) -> bool:
    letras = [c for c in t if c.isalpha()]
    if len(letras) < 12:
        return False
    mayus = sum(c.isupper() for c in letras) / len(letras)
    palabras = [p for p in t.split() if len(p) > 3 and p[0].isalpha()]
    capitalizadas = sum(p[0].isupper() for p in palabras) / len(palabras) if palabras else 0
    # «Ley que DECLARA de…»: el verbo tras la forma, en mayúsculas, es lo pegado del Word.
    verbo = re.match(r"^ley\s+que\s+(\S{4,})", t, re.IGNORECASE)
    gritado = bool(verbo and verbo.group(1).isupper() and verbo.group(1) not in _SIGLAS)
    return gritado or mayus > 0.5 or mayus == 0 or (len(palabras) >= 5 and capitalizadas > 0.75)


def uniformar_mayusculas(t: str) -> str:
    """«Ley que DECLARA A LA PROVINCIA DE HUANTA…» → «Ley que declara a la provincia de Huanta…»."""
    if not _desordenado(t):
        return t
    s = list(t.lower())
    patron, mapa = _propios()
    for m in patron.finditer(_sin_tildes(t)):
        s[m.start():m.end()] = mapa[m.group(0)]
    s = "".join(s)
    for forma in _FORMAS:
        if s.lower().startswith(forma.lower() + " "):
            s = forma + s[len(forma):]
            break
    else:
        s = s[:1].upper() + s[1:]
    # Números romanos («II etapa») y «Ley N.° 27795, Ley de Demarcación…» (la ley citada va con su nombre).
    s = re.sub(r"\b[ivx]+\b", lambda m: m.group(0).upper() if _ROMANO.match(m.group(0).upper()) else m.group(0), s)
    s = re.sub(r"\bley(?=\s+(?:n[.°º]*\s*)?\d)", "Ley", s)
    s = re.sub(r"\bn([.°º]+)\s*(?=\d)", lambda m: "N" + m.group(1) + " ", s)

    def nombre_de_ley(m: re.Match) -> str:
        palabras = m.group(2).split(" ")
        return m.group(1) + " ".join(
            p if (i and p in _MENORES) else p[:1].upper() + p[1:] for i, p in enumerate(palabras))

    s = re.sub(r"(Ley\s+(?:N\S*\s+)?[\d-]+,\s+)(ley\b[^,;]*)", nombre_de_ley, s)
    return s


NOTA_AUTO = "Guardado automático"
VENTANA_AUTO = timedelta(minutes=30)


def unir_autoguardado(
    ultima_nota: str,
    ultima_usuario: int | None,
    ultima_version: int | None,
    ultima_creada: datetime | None,
    usuario_id: int,
    version_actual: int,
    momento: datetime | None = None,
) -> bool:
    """¿Este guardado automático reemplaza a la última versión en vez de
    crear otra? Solo si aquella también fue automática, de la misma persona,
    es la vigente (nadie guardó después) y es reciente."""
    if ultima_nota != NOTA_AUTO or ultima_usuario != usuario_id:
        return False
    if ultima_version != version_actual or ultima_creada is None:
        return False
    return (momento or ahora()) - ultima_creada < VENTANA_AUTO


def fecha_fija(fecha_actual: str, motivo_fecha: date | None) -> str:
    """La fecha del proyecto es AUTOMÁTICA (vacía = la del día en que se
    compone el PDF) hasta que se fija: al subir el firmado, con la del PDF que
    se firmó; al presentarlo, con la de ese día. Una fecha ya puesta a mano
    nunca se pisa."""
    if (fecha_actual or "").strip() or motivo_fecha is None:
        return (fecha_actual or "").strip()
    return motivo_fecha.isoformat()

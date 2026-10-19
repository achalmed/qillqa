"""REFERENCIAS Y AUTOMATIZACIÓN (2026-10-06, Edison: «lo que pueda hacerse automáticamente
debe ser automático»; «al seleccionar, se crea la relación, sin registrar dos veces»).

Tres piezas, todas sobre la tabla genérica `relaciones` (modelos.Relacion):

1. BUSCAR lo citable mientras se escribe (`GET /api/referencias/buscar`): normas (catálogo
   público `app/catalogos/normas.csv`, leyes de creación de los distritos y las fuentes de
   tipo norma de los proyectos), documentos, proyectos de ley, semanas de representación,
   pedidos, personas, instituciones y obras de ZOTERO (servicios/zotero.py: la referencia
   y la cita las formatea Zotero; Calibre queda para los archivos). Los nodos `libro`
   (calibre:N) de antes siguen valiendo, pero ya no se ofrecen. La puntuación es pura (`puntuar`, `interpretar`).
2. SINCRONIZAR al guardar: los nodos `referencia` del texto TipTap ({tipo, id, texto})
   se vuelven relaciones `fuente='editor'`; un nodo que desaparece borra la suya en el
   siguiente guardado; las manuales y las automáticas de otra fuente no se tocan
   (`extraer`, `plan`).
3. El OFICIO QUE PRESENTA UN INFORME SR: reconocerlo por su asunto, referencia, sumilla y
   cuerpo, y proponer (o asociar, si es inequívoco) el informe de la semana
   (`parece_presentacion_informe`, `candidatos_informe`).

Nada de esto escribe en el marco ni numera: solo lee y relaciona.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

DATOS = Path(__file__).resolve().parent.parent / "catalogos"

# --- identificadores (los mismos del mapa de relaciones) ----------------------------------

PREFIJO = {
    "documento": "doc",
    "proyecto": "pl",
    "semana": "sr",
    "pedido": "pedido",
    "persona": "persona",
    "institucion": "inst",
    "norma": "norma",
    "libro": "libro",      # cita antigua por calibre_id (se conserva; ya no se ofrece)
    "zotero": "zotero",    # obra de Zotero por su clave de 8 caracteres (2026-10-06)
    "entrada": "entrada",  # documento RECIBIDO de la bandeja de entrada (servicios/entradas.py)
}
TIPOS_REFERENCIA = tuple(PREFIJO)

# Qué relación crea citar cada cosa (se lee desde el texto que cita).
TIPO_RELACION = {
    "norma": "referencia_normativa",
    "libro": "cita",
    "zotero": "cita",
    "documento": "cita",
    "proyecto": "menciona",
    "semana": "menciona",
    "pedido": "menciona",
    "persona": "menciona",
    "institucion": "menciona",
    "entrada": "cita",
}
ETIQUETA_RELACION = {
    "referencia_normativa": "cita la norma",
    "cita": "cita",
    "menciona": "menciona",
    "presenta_informe": "presenta el informe",
    "responde": "responde a",
}

GRUPO = {
    "norma": "Normas",
    "documento": "Documentos",
    "proyecto": "Proyectos de ley",
    "semana": "Semanas de representación",
    "pedido": "Pedidos",
    "persona": "Personas",
    "institucion": "Instituciones",
    "libro": "Biblioteca",
    "zotero": "Zotero",
    "entrada": "Mesa de Partes",
}

_ID_VALIDO = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
_ID_ZOTERO = re.compile(r"^[A-Z0-9]{8}$")


def nodo_de(tipo: str, ident) -> str | None:
    """`('documento', 12)` → `doc:12`; None si el tipo o el id no valen."""
    pref = PREFIJO.get(str(tipo or ""))
    ident = str(ident if ident is not None else "").strip()
    if not pref or not _ID_VALIDO.match(ident):
        return None
    if tipo == "zotero":
        return f"{pref}:{ident}" if _ID_ZOTERO.match(ident) else None
    if tipo not in ("norma",) and not ident.isdigit():
        return None
    return f"{pref}:{ident}"


# --- texto comparable ---------------------------------------------------------------------


def normalizar(texto: str) -> str:
    """minúsculas, sin tildes ni signos; los números sin ceros a la izquierda («0095» → «95»)."""
    t = unicodedata.normalize("NFKD", (texto or "").replace("º", "°")).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    # «N°0095» y «SR02» se parten: letras y cifras pegadas son dos palabras.
    t = re.sub(r"(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])", " ", t)
    return " ".join(str(int(p)) if p.isdigit() and len(p) < 12 else p for p in t.split())


# --- la cita en la Referencia y en «Adj.» ----------------------------------------------------
# Edison, 2026-10-18: «de ahora en adelante no quiero esa información adicional». Un documento
# se cita por su denominación y su número («Oficio Múltiple N.º 007-2026-FREDDEH-HUANTA/P»):
# sin la fecha, sin «y anexos» y sin páginas ni folios. La fecha solo se queda cuando el
# documento no tiene número (un memorial s/n): es lo único que lo identifica.

_FECHA = (r"(?:\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|se?tiembre|octubre"
          r"|noviembre|diciembre)(?:\s+(?:de|del)\s+\d{4})?|\d{1,2}/\d{1,2}/\d{2,4})")
_RE_CON_NUMERO = re.compile(r"\bN\s*\.?\s*[°º]|\bN\.?\s*o\.?\s*\d|\bNro\.?\s*\d|\bNúm(?:ero)?\.?\s*\d", re.I)
_RE_EXTENSION = re.compile(r"\s*\((?:[^()]*?\b(?:p[áa]ginas?|p[áa]gs?\.|pp\.|folios?|fs\.|hojas?)\b[^()]*)\)", re.I)
_RE_ANEXOS = re.compile(r",?\s+(?:y|con|más)\s+(?:sus\s+|los\s+)?anexos(?:\s+adjuntos)?\b", re.I)
_RE_FECHA = (
    re.compile(rf"\s*\(\s*(?:de\s+fecha\s+|del?\s+|fecha\s*:?\s*)?{_FECHA}\s*\)", re.I),
    re.compile(rf"\s*,?\s*(?:de\s+fecha|del?|fechad[oa]\s+(?:el\s+)?)\s+{_FECHA}", re.I),
    re.compile(rf"\s*[–—-]\s*{_FECHA}(?=\s|$|[,.;/])", re.I),
)


def cita_documento(texto: str) -> str:
    """Una línea de Referencia o de «Adj.» con solo la denominación y el número del documento:
    «Oficio Múltiple Nº 007-2026-FREDDEH-HUANTA/P, de 15 de octubre de 2026, y anexos (31
    páginas del archivo remitido).» → «Oficio Múltiple Nº 007-2026-FREDDEH-HUANTA/P». Lo que
    no reconoce lo deja como está; la fecha de un documento sin número se conserva."""
    original = (texto or "").strip()
    t = _RE_EXTENSION.sub("", original)
    t = _RE_ANEXOS.sub("", t)
    if _RE_CON_NUMERO.search(t):
        for patron in _RE_FECHA:
            t = patron.sub("", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    if t != original:
        t = t.rstrip(" ,;:–—-").removesuffix(".").rstrip(" ,;")
    return t


# --- normas -------------------------------------------------------------------------------

_ABREV = {
    "ley": ("Ley", "ley"),
    "decreto supremo": ("Decreto Supremo", "ds"),
    "decreto legislativo": ("Decreto Legislativo", "dleg"),
    "decreto de urgencia": ("Decreto de Urgencia", "du"),
    "resolucion legislativa": ("Resolución Legislativa", "rleg"),
    "resolucion ministerial": ("Resolución Ministerial", "rm"),
}
_RE_NORMA = re.compile(
    r"\b(ley|decreto\s+supremo|d\.?\s*s\.?|decreto\s+legislativo|d\.?\s*leg\.?|d\.?\s*l\.?|decreto\s+de\s+urgencia|d\.?\s*u\.?"
    r"|resoluci[oó]n\s+legislativa|resoluci[oó]n\s+ministerial|r\.?\s*m\.?)\s*(?:n\s*\.?\s*[°º]?\s*)?([0-9][0-9A-Za-z\-]*)",
    re.IGNORECASE,
)


def clave_norma(texto: str) -> str | None:
    """«Ley N° 27795» → `ley-27795`; «D.S. N° 004-2019-JUS» → `ds-004-2019-jus`. None si no hay norma."""
    m = _RE_NORMA.search(texto or "")
    if not m:
        return None
    t = normalizar(m.group(1))
    if t in ("ds", "d s", "decreto supremo"):
        pref = "ds"
    elif t in ("dleg", "d leg", "d l", "dl", "decreto legislativo"):
        pref = "dleg"
    elif t in ("du", "d u", "decreto de urgencia"):
        pref = "du"
    elif t.startswith("resolucion legislativa"):
        pref = "rleg"
    elif t.startswith("resolucion ministerial") or t in ("rm", "r m"):
        pref = "rm"
    else:
        pref = "ley"
    numero = m.group(2).strip("-").lower()
    if pref == "ley":
        numero = numero.split("-")[0]
    return f"{pref}-{numero}"


def texto_norma(n: dict) -> str:
    """Cómo se cita en el texto: «Ley N° 27795, Ley de Demarcación y Organización Territorial»."""
    if not n.get("numero"):
        return n["titulo"]
    return f"{n['tipo']} N° {n['numero']}, {n['titulo']}"


_CACHE_NORMAS: list[dict] | None = None


def normas_catalogo() -> list[dict]:
    """El catálogo público de normas y las leyes de creación de los distritos (datos públicos,
    `app/catalogos/`). Cada norma: {clave, tipo, numero, titulo, url, fuente}."""
    global _CACHE_NORMAS
    if _CACHE_NORMAS is not None:
        return _CACHE_NORMAS
    salida: dict[str, dict] = {}
    archivo = DATOS / "normas.csv"
    if archivo.is_file():
        with archivo.open(encoding="utf-8", newline="") as f:
            for fila in csv.DictReader(f):
                salida[fila["clave"]] = {k: (fila.get(k) or "").strip() for k in ("clave", "tipo", "numero", "titulo", "url", "fuente")}
    # Leyes de creación de los distritos (territorio): «Ley N.° 15232» crea Acocro.
    por_ley: dict[str, list[str]] = {}
    for archivo in sorted(DATOS.glob("distritos_*.csv")):
        with archivo.open(encoding="utf-8", newline="") as f:
            for fila in csv.DictReader(f):
                clave = clave_norma(fila.get("norma", ""))
                if clave and clave.startswith("ley-"):
                    por_ley.setdefault(clave, []).append(f"{fila['distrito']} ({fila['provincia']})")
    for clave, distritos in por_ley.items():
        if clave in salida:
            continue
        nombres = ", ".join(distritos[:3]) + ("…" if len(distritos) > 3 else "")
        salida[clave] = {
            "clave": clave, "tipo": "Ley", "numero": clave.split("-", 1)[1],
            "titulo": f"Ley de creación del distrito de {nombres}" if len(distritos) == 1 else f"Ley de creación de los distritos de {nombres}",
            "url": "", "fuente": "Territorio (INEI, El Peruano)",
        }
    _CACHE_NORMAS = list(salida.values())
    return _CACHE_NORMAS


def norma_de_fuente(referencia: str, url: str = "") -> dict | None:
    """Una fuente de tipo norma de un proyecto («Ley N° 31988, Ley que…») como norma citable."""
    clave = clave_norma(referencia)
    if not clave:
        return None
    m = re.match(r"^\s*[^,]+,\s*(.+)$", referencia or "")
    tipo = "Ley" if clave.startswith("ley-") else _tipo_de_clave(clave)
    return {"clave": clave, "tipo": tipo, "numero": clave.split("-", 1)[1].upper() if tipo != "Ley" else clave.split("-", 1)[1],
            "titulo": (m.group(1).strip() if m else referencia.strip()), "url": url or "", "fuente": "Fuentes de los proyectos"}


def _tipo_de_clave(clave: str) -> str:
    return {"ds": "Decreto Supremo", "dleg": "Decreto Legislativo", "du": "Decreto de Urgencia",
            "rleg": "Resolución Legislativa", "rm": "Resolución Ministerial"}.get(clave.split("-", 1)[0], "Ley")


# --- interpretación y puntuación de la consulta (puras) ------------------------------------

_DISPARADORES = (
    (re.compile(r"^(ley|leyes)\b"), ("norma", "proyecto")),
    (re.compile(r"^(decreto|d s|ds|d leg|dleg|d u|du|resolucion|r m|rm|constitucion|reglamento|tuo)\b"), ("norma",)),
    (re.compile(r"^(pl|proyecto de ley|proyecto)\b"), ("proyecto",)),
    (re.compile(r"^(oficio|memorando|memo|carta|solicitud|of|mem)\b"), ("documento",)),
    (re.compile(r"^(informe|isr|semana|sr)\b"), ("semana", "documento")),
    (re.compile(r"^(pedido|p)\b"), ("pedido",)),
    (re.compile(r"^(libro|obra|cita|articulo|zotero)\b"), ("zotero",)),
)
# Palabras del disparador que no deben exigirse en el resultado («Ley N° …»: el «n»).
_RELLENO = {"n", "no", "nro", "numero", "de", "del", "la", "el", "los", "las"}


def interpretar(q: str) -> tuple[tuple[str, ...], list[str]]:
    """(tipos preferidos, palabras a buscar) de lo que se escribió: «Ley N° 2779» → (norma,
    proyecto), [ley, 2779]; «@huamanga» → (todos), [huamanga]."""
    n = normalizar(q.lstrip("@"))
    preferidos: tuple[str, ...] = ()
    for patron, tipos in _DISPARADORES:
        if patron.match(n):
            preferidos = tipos
            break
    palabras = [p for p in n.split() if p not in _RELLENO]
    return preferidos, palabras


def puntuar(palabras: list[str], principal: str, secundario: str = "") -> int:
    """0 si alguna palabra no está; si están todas, más puntos cuanto más «al principio» y
    más exactas (un número completo vale más que un prefijo). Puro."""
    if not palabras:
        return 1
    a = normalizar(principal)
    b = normalizar(secundario)
    tokens_a = a.split()
    tokens_b = b.split()
    total = 0
    for p in palabras:
        if p in tokens_a:
            total += 30 if p.isdigit() else 14
        elif any(t.startswith(p) for t in tokens_a):
            total += 10
        elif p in tokens_b:
            total += 8
        elif any(t.startswith(p) for t in tokens_b):
            total += 5
        elif not p.isdigit() and len(p) >= 3 and (p in a or p in b):
            # Dentro de una palabra («demarc» en «sindemarcacion»), solo para palabras: un
            # número dentro de otro («9» en «39») no es coincidencia.
            total += 2
        else:
            return 0
    if tokens_a and tokens_a[0].startswith(palabras[0]):
        total += 6
    return total


PRIORIDAD_CONTEXTO = {
    "parte": ("norma", "zotero", "proyecto"),
    "informe": ("pedido", "semana", "institucion", "persona"),
    "documento": ("documento", "norma"),
}


def ordenar_resultados(resultados: list[dict], preferidos: tuple[str, ...], contexto: str = "",
                       por_grupo: int = 6, tope: int = 30) -> list[dict]:
    """Orden de la lista del autocompletado. Puro.

    Primero lo que pide lo escrito («Ley…» → normas); después, por puntaje, con una
    pequeña ventaja para lo que suele citarse en ese editor (`contexto`). Dentro de
    cada grupo, `por_grupo` como tope; los grupos quedan juntos, en el orden de su
    mejor resultado."""
    afines = PRIORIDAD_CONTEXTO.get(contexto, ())
    clave = lambda r: (-(r["tipo"] in preferidos), -(r["puntaje"] + (8 if r["tipo"] in afines else 0)))  # noqa: E731
    elegidos: list[dict] = []
    cuenta: dict[str, int] = {}
    for r in sorted(resultados, key=clave):
        if cuenta.get(r["tipo"], 0) >= por_grupo:
            continue
        cuenta[r["tipo"]] = cuenta.get(r["tipo"], 0) + 1
        elegidos.append(r)
    primero: dict[str, int] = {}
    for i, r in enumerate(elegidos):
        primero.setdefault(r["tipo"], i)
    elegidos.sort(key=lambda r: primero[r["tipo"]])
    return elegidos[:tope]


# --- extracción y sincronización de los nodos `referencia` (puras) -------------------------


def extraer(contenido) -> list[dict]:
    """Los nodos `referencia` de un texto TipTap: [{tipo, id, texto, destino, nota}] sin
    repetir el mismo destino (vale el primero). Ignora los mal formados."""
    vistos: dict[str, dict] = {}

    def rec(n) -> None:
        if isinstance(n, dict):
            if n.get("type") == "referencia":
                a = n.get("attrs") or {}
                destino = nodo_de(a.get("tipo"), a.get("id"))
                if destino and destino not in vistos:
                    vistos[destino] = {
                        "tipo": a.get("tipo"), "id": str(a.get("id")), "texto": str(a.get("texto") or "")[:500],
                        "destino": destino, "nota": str(a.get("nota") or "")[:1000],
                    }
            for h in n.get("content") or []:
                rec(h)
        elif isinstance(n, list):
            for h in n:
                rec(h)

    rec(contenido)
    return list(vistos.values())


def plan(existentes: list[tuple[str, str]], deseadas: list[dict]) -> tuple[list[dict], set[tuple[str, str]]]:
    """Qué relaciones del EDITOR agregar y cuáles quitar. `existentes` son SOLO las de
    fuente 'editor' de ese origen y contexto, como (destino, tipo); las manuales no entran
    aquí y por eso nunca se borran. Puro."""
    actuales = set(existentes)
    queridas = {(d["destino"], TIPO_RELACION.get(d["tipo"], "menciona")): d for d in deseadas}
    agregar = [d for k, d in queridas.items() if k not in actuales]
    quitar = {k for k in actuales if k not in queridas}
    return agregar, quitar


def texto_plano(contenido) -> str:
    """Texto visible de un TipTap, con el de las referencias (para buscar y reconocer)."""
    trozos: list[str] = []

    def rec(n) -> None:
        if isinstance(n, dict):
            if n.get("type") == "text":
                trozos.append(str(n.get("text") or ""))
            elif n.get("type") == "referencia":
                trozos.append(str((n.get("attrs") or {}).get("texto") or ""))
            for h in n.get("content") or []:
                rec(h)
        elif isinstance(n, list):
            for h in n:
                rec(h)

    rec(contenido)
    return " ".join(" ".join(trozos).split())


def presentes_en_texto(relaciones: list[tuple[str, str]], texto: str) -> set[str]:
    """De las relaciones insertadas en un texto plano [(destino, texto insertado)], los
    destinos cuyo texto sigue apareciendo (comparación sin tildes ni mayúsculas). Puro."""
    t = normalizar(texto)
    return {destino for destino, insertado in relaciones if insertado and normalizar(insertado) in t}


# --- el oficio que presenta un informe SR (puras) -----------------------------------------

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "setiembre": 9, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
NOMBRE_MES = {v: k for k, v in MESES.items() if k != "septiembre"}

_RE_CODIGO_SR = re.compile(r"\b(?:I?SR)\s*[-–]?\s*(?:N\s*\.?\s*[°º]?\s*)?(\d{1,2})\b", re.IGNORECASE)
_RE_SEMANA_N = re.compile(r"semana\s+de\s+representaci[oó]n\s+(?:n\s*\.?\s*[°º]?\s*)?(\d{1,2})\b", re.IGNORECASE)


def parece_presentacion_informe(campos: dict, cuerpo_texto: str = "") -> bool:
    """¿Es (o parece) el oficio que presenta el informe de una semana de representación?
    Mira asunto, referencia y sumilla; el cuerpo solo si menciona las dos cosas juntas."""
    cabecera = normalizar(" ".join(str(campos.get(k) or "") for k in ("asunto", "referencia", "sumilla", "sumilla_solicito")))
    if re.search(r"\bisr\b|\bsr \d", cabecera):
        return True

    def habla_de_presentar(texto: str) -> bool:
        palabras = texto.split()
        # «representación» no es «presentar»: se miran las palabras, no las subcadenas.
        verbo = any(p.startswith(("remit", "present", "adjunt", "elev")) for p in palabras)
        return "informe" in palabras and "semana de representacion" in texto and verbo

    if habla_de_presentar(cabecera):
        return True
    return habla_de_presentar(normalizar(cuerpo_texto)[:4000])


@dataclass
class Candidato:
    id: int
    puntaje: int
    motivos: list[str]


def candidatos_informe(campos: dict, cuerpo_texto: str, semanas: list[dict]) -> list[Candidato]:
    """Las semanas cuyo informe puede ser el que presenta el oficio, de la más probable a la
    menos. Cada semana: {id, numero, codigo, tema, inicio (AAAA-MM-DD), fin}. Un código
    explícito (SR-02, ISR-02, «Semana de Representación N° 2») pesa más que el mes y el
    tema. Sin ninguna señal, todas con puntaje 1, las más recientes primero. Puro."""
    texto = " ".join(str(campos.get(k) or "") for k in ("asunto", "referencia", "sumilla")) + " " + (cuerpo_texto or "")[:4000]
    numeros = {int(m.group(1)) for m in _RE_CODIGO_SR.finditer(texto)} | {int(m.group(1)) for m in _RE_SEMANA_N.finditer(texto)}
    plano = normalizar(texto)
    meses = set()
    for nombre, mes in MESES.items():
        for m in re.finditer(rf"\b{nombre}\b(?:(?: de| del)? (\d{{4}}))?", plano):
            meses.add((mes, int(m.group(1)) if m.group(1) else None))
    salida: list[Candidato] = []
    for s in semanas:
        puntos = 0
        motivos: list[str] = []
        if s.get("numero") in numeros:
            puntos += 100
            motivos.append(f"menciona {s.get('codigo')}")
        inicio = str(s.get("inicio") or "")
        if len(inicio) >= 7 and inicio[:4].isdigit():
            anio, mes = int(inicio[:4]), int(inicio[5:7])
            if any(m == mes and (a is None or a == anio) for m, a in meses):
                puntos += 40
                motivos.append(f"menciona {NOMBRE_MES.get(mes, '')} {anio}".strip())
        tema = [p for p in normalizar(str(s.get("tema") or "")).split() if len(p) > 4]
        comunes = [p for p in tema if p in plano.split()]
        if comunes:
            puntos += min(20, 10 * len(comunes))
            motivos.append("coincide el tema")
        salida.append(Candidato(int(s["id"]), puntos, motivos))
    if any(c.puntaje for c in salida):
        salida = [c for c in salida if c.puntaje]
    else:
        for c in salida:
            c.puntaje = 1
    orden = {int(s["id"]): str(s.get("inicio") or "") for s in semanas}
    salida.sort(key=lambda c: orden.get(c.id, ""), reverse=True)  # las más recientes primero…
    salida.sort(key=lambda c: -c.puntaje)  # …dentro de cada puntaje (orden estable)
    return salida


def es_confiable(candidatos: list[Candidato]) -> bool:
    """¿Se puede asociar sin preguntar? Con una señal fuerte (código explícito, o mes y tema
    a la vez) y sin rival cercano; o si una sola semana tiene señales (la única del mes)."""
    if not candidatos:
        return False
    if len(candidatos) == 1:
        # La única semana con señales (p. ej. la única de ese mes): basta el mes.
        return candidatos[0].puntaje >= 40
    return candidatos[0].puntaje >= 60 and candidatos[1].puntaje * 2 <= candidatos[0].puntaje


def periodo_texto(inicio: str, fin: str) -> str:
    """«2026-09-14», «2026-09-18» → «setiembre de 2026» (lo que se lee en un aviso)."""
    if len(inicio or "") >= 7 and inicio[:4].isdigit():
        return f"{NOMBRE_MES.get(int(inicio[5:7]), '')} de {inicio[:4]}"
    return ""

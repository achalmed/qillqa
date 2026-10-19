"""Qué hay que MIRAR antes de numerar un documento (Edison 2026-09-05).

La primera versión solo exigía revisar las copias (c.c.). Edison lo amplió: «la
verificación debe ser con los datos más importantes, no solo con la con copia».
Tiene razón — un asunto mal escrito o una fecha equivocada pesan tanto como una
copia de más, y el número es igual de irreversible.

Lo que se pide confirmar es lo que, si está mal, obliga a rehacer el documento
con OTRO número:

    destinatario · asunto · fecha · copias

Y se MUESTRAN, sin exigir marca, los datos que se corrigen sin perder el número
(referencia, anexo, ámbito). La diferencia importa: si el sistema obligara a
marcar quince casillas, la gente marcaría quince casillas sin leer ninguna, que
es exactamente el hábito que Edison quiere evitar.

Este módulo NO valida contenido —no sabe si el asunto es bueno— ni escribe:
arma la lista de lo que hay que mirar y con qué valor está hoy.
"""

from app.modelos import Documento
from app.tipos import tipo_config

# Campos que se confirman uno por uno, en el orden en que se leen en el PDF.
# El primero que exista en el tipo gana (un memorando usa «para», no
# «destinatario_nombre»).
_CLAVES_DESTINATARIO = ("destinatario_nombre", "para", "dirigido_a")

_A_CONFIRMAR = (
    ("destinatario", "A quién va", _CLAVES_DESTINATARIO),
    ("asunto", "Asunto", ("asunto", "sumilla", "sumilla_solicito")),
    ("fecha", "Fecha del documento", ("fecha",)),
)

# Se muestran para dar contexto, pero no bloquean: se corrigen después sin
# perder el número.
_INFORMATIVOS = (
    ("referencia", "Referencia"),
    ("anexo", "Anexo (Adj.)"),
    ("destinatario_cargo", "Cargo del destinatario"),
)


def _primero(campos: dict, claves: tuple[str, ...]) -> tuple[str, str]:
    """(clave, valor) del primer campo con contenido; si ninguno lo tiene,
    devuelve la primera clave y cadena vacía (para que el aviso diga qué falta).
    """
    for clave in claves:
        valor = (campos.get(clave) or "").strip()
        if valor:
            return clave, valor
    return claves[0], ""


def puntos(doc: Documento, campos: dict) -> list[dict]:
    """Los datos a confirmar antes de numerar, con su valor actual.

    `vacio` marca los que están en blanco: no se rechaza el documento por eso
    —hay oficios sin referencia y sin anexo— pero quien confirma lo ve.
    """
    esquema = {c["clave"] for c in tipo_config(doc.tipo)["campos"]}
    salida: list[dict] = []
    usadas: set[str] = set()
    for ident, etiqueta, claves in _A_CONFIRMAR:
        # Solo las claves que el tipo TIENE: confirmar un «asunto» que el acta
        # no imprime, o escribirlo en una clave que la plantilla no lee, no
        # protege nada. La solicitud va dirigida a un cargo, no a un nombre.
        disponibles = tuple(c for c in claves if c in esquema)
        if not disponibles and ident == "destinatario" and "destinatario_cargo" in esquema:
            disponibles = ("destinatario_cargo",)
        if not disponibles:
            continue
        clave, valor = _primero(campos, disponibles)
        usadas.add(clave)
        salida.append(
            {
                "id": ident,
                "etiqueta": etiqueta,
                "clave": clave,
                "valor": valor,
                "vacio": not valor,
                # Estos hay que marcarlos uno por uno para poder numerar.
                "confirmar": True,
            }
        )
    for clave, etiqueta in _INFORMATIVOS:
        if clave not in esquema or clave in usadas:
            continue
        valor = (campos.get(clave) or "").strip()
        if not valor:
            continue
        salida.append(
            {
                "id": clave,
                "etiqueta": etiqueta,
                "clave": clave,
                "valor": valor,
                "vacio": False,
                "confirmar": False,
            }
        )
    return salida


# --- Lo que el directorio dice HOY (2026-10-12, «todo vinculado, nada suelto») -----------------
# En un BORRADOR, si el destinatario o una copia está en el directorio con otro cargo (o su nombre
# se corrigió), se OFRECE el valor vigente junto al guardado; nunca se aplica solo. Lo numerado,
# firmado o enviado es historia oficial: esta revisión solo corre antes de numerar.


def _norma(texto: str) -> str:
    import unicodedata

    t = unicodedata.normalize("NFD", (texto or "").lower())
    return " ".join("".join(c for c in t if unicodedata.category(c) != "Mn").split())


def _distinto(guardado: str, vigente: str) -> bool:
    return bool((vigente or "").strip()) and " ".join((guardado or "").split()) != " ".join(vigente.split())


def unica(personas: list[dict]) -> dict | None:
    """La persona del directorio que corresponde a un nombre, si es una sola (o todas dicen lo
    mismo). Pura."""
    distintas = {(p.get("nombre"), p.get("cargo"), p.get("institucion")) for p in personas}
    return personas[0] if len(distintas) == 1 else None


def diferencias_destinatario(campos: dict, persona: dict | None) -> dict[str, str]:
    """{clave: valor del directorio} para los datos del destinatario que difieren. Pura."""
    if not persona:
        return {}
    salida = {}
    # La institución no se ofrece: el documento la escribe a su manera (forma oficial completa).
    for clave, valor in (("destinatario_nombre", persona.get("nombre")), ("destinatario_cargo", persona.get("cargo"))):
        if clave in campos and _distinto(str(campos.get(clave) or ""), str(valor or "")):
            salida[clave] = str(valor)
    return salida


def anotar_puntos(lista: list[dict], diferencias: dict[str, str], campos: dict) -> list[dict]:
    """Cada punto con `directorio` (el valor vigente) si difiere; el cargo o la institución que no
    tenían punto se agregan como informativos para poder aceptarlos. Pura."""
    rotulos = {"destinatario_cargo": "Cargo del destinatario", "destinatario_nombre": "A quién va"}
    salida = [{**p, **({"directorio": diferencias[p["clave"]]} if p["clave"] in diferencias else {})} for p in lista]
    claves = {p["clave"] for p in salida}
    for clave, vigente in diferencias.items():
        if clave not in claves:
            salida.append({"id": clave, "etiqueta": rotulos.get(clave, clave), "clave": clave,
                           "valor": str(campos.get(clave) or ""), "vacio": not campos.get(clave), "confirmar": False,
                           "directorio": vigente})
    return salida


def anotar_copias(copias: list[dict], por_nombre: dict[str, list[dict]]) -> list[dict]:
    """Cada copia con `cargo_directorio` si el directorio le da hoy otro cargo. Pura."""
    salida = []
    for c in copias:
        p = unica(por_nombre.get(_norma(c.get("nombre", "")), []))
        extra = {"cargo_directorio": p["cargo"]} if p and _distinto(c.get("cargo", ""), p.get("cargo") or "") else {}
        salida.append({**c, **extra})
    return salida


async def segun_directorio(sesion, campos: dict, lista: list[dict], copias: list[dict]) -> tuple[list[dict], list[dict]]:
    """Puntos y copias anotados con lo que el directorio dice hoy (búsqueda por nombre exacto,
    sin tildes; un solo destinatario)."""
    from sqlalchemy import func, select

    from app.modelos import Institucion, Persona

    nombre = str(campos.get("destinatario_nombre") or "").strip()
    buscados = {_norma(c.get("nombre", "")) for c in copias if c.get("nombre")}
    if nombre and "\n" not in nombre:
        buscados.add(_norma(nombre))
    buscados.discard("")
    if not buscados:
        return lista, copias
    normalizado = func.trim(func.regexp_replace(
        func.translate(func.lower(Persona.nombre), "áéíóúüñàèìòù", "aeiouunaeiou"), r"\s+", " ", "g"))
    filas = (await sesion.execute(
        select(Persona, Institucion.nombre).outerjoin(Institucion, Institucion.id == Persona.institucion_id)
        .where(Persona.activo.is_(True), normalizado.in_(sorted(buscados)))
    )).all()
    por_nombre: dict[str, list[dict]] = {}
    for p, inst in filas:
        n = _norma(p.nombre)
        if n in buscados:
            por_nombre.setdefault(n, []).append({"nombre": p.nombre, "cargo": p.cargo or "", "institucion": inst or ""})
    persona = unica(por_nombre.get(_norma(nombre), [])) if nombre and "\n" not in nombre else None
    return anotar_puntos(lista, diferencias_destinatario(campos, persona), campos), anotar_copias(copias, por_nombre)

"""NOMBRES DE ARCHIVO: una sola convención para todo el sistema.

Pedido de Edison (2026-09-08). Antes había dos motores de nombres —el
framework en Bash (`scripts/lib/nombrado.sh`) para el PDF oficial y este
backend para adjuntos y expediente— y salían cosas como
`0173-OFICIO-N0060-2026-2027---Solicito-la-inmediata-instalacion-de-cielo…`:
un id interno al principio empujando lo importante, el tipo escrito entero y
separadores repetidos. Al compartirlo por WhatsApp o verlo en un USB, no se
identifica de un vistazo.

La convención, igual para TODOS los tipos:

    SERIE-NÚMERO-PERIODO_Asunto-breve.pdf
    OF-0061-2026-2027_Uso-del-auditorio-para-reuniones-estudiantiles.pdf
    OM-0016-2026-2027_Reunion-con-estudiantes-de-institutos.pdf

y los archivos DERIVADOS anteponen qué son, conservando la referencia al
documento del que cuelgan (así siguen juntos al ordenar por nombre):

    FIRM-OF-0060-2026-2027_Cielo-raso-en-aulas.pdf     documento firmado
    CR-OM-0014-2026-2027_Director-de-la-UGEL-Huanta.pdf cargo de recepción
    ADJ-OF-0060-2026-2027_Relacion-de-dirigentes.pdf    adjunto que acompaña
    RESP-OF-0057-2026-2027_MINEDU.pdf                   documento recibido
    EXP-OF-0060-2026-2027_Cielo-raso_firmado.pdf        expediente completo

Reglas que aplica `sanear`: sin tildes ni ñ, sin caracteres que Windows
prohíbe, un solo guion como separador, sin puntos ni guiones colgando. El
resultado es válido en Windows, Linux, Android, WhatsApp, Telegram y correo.

El id interno del adjunto NO va en el nombre: la trazabilidad la da la base de
datos (`adjuntos.id`, `documentos.pdf_archivo`), no el nombre que ve la gente.
Las colisiones en una misma carpeta se resuelven con un sufijo `-2`, `-3`.
"""

import re
import unicodedata
from pathlib import Path

# Largo máximo del nombre COMPLETO (con extensión). Windows admite 255, pero
# un nombre corto es el objetivo: cabe en la pantalla de un teléfono y no se
# recorta al adjuntarlo en un correo.
LIMITE = 100

# Qué es cada archivo derivado. Cortos y sin palabras vacías («DOCUMENTO»,
# «ARCHIVO»): el prefijo ya dice todo lo que hay que saber.
PREFIJO = {
    "firmado": "FIRM",
    "recepcion": "CR",
    "respuesta": "RESP",
    "": "ADJ",  # adjunto que acompaña al documento
}
PREFIJO_EXPEDIENTE = "EXP"


# Palabras que no aportan nada al final de un nombre truncado: «…-de-la-» o
# «…-para» sobran y hacen que el nombre parezca cortado a la fuerza.
_VACIAS = {"de", "del", "la", "el", "los", "las", "en", "y", "a", "al", "con",
           "por", "para", "un", "una", "the", "of"}


def sanear(texto: str, maximo: int = 60) -> str:
    """Texto libre → trozo de nombre de archivo: sin tildes, sin caracteres
    problemáticos, palabras unidas por un solo guion y cortado POR PALABRAS
    (nunca a media palabra, que es lo que produce nombres ilegibles)."""
    base = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-")
    base = re.sub(r"-{2,}", "-", base)
    if len(base) <= maximo:
        return base
    corte = base[:maximo]
    if "-" in corte:
        corte = corte.rsplit("-", 1)[0]  # sin dejar media palabra
    partes = [p for p in corte.split("-") if p]
    while len(partes) > 1 and partes[-1].lower() in _VACIAS:
        partes.pop()
    return "-".join(partes) or base[:maximo].strip("-")


def numero_texto(doc) -> str:
    """«0061» del documento, o «SN» mientras es borrador (el «S/N» oficial
    lleva una barra, que en un nombre de archivo abriría una subcarpeta)."""
    return f"{doc.numero:04d}" if doc.numero else "SN"


def base(doc) -> str:
    """«OF-0061-2026-2027»: la parte que identifica al documento. Es lo
    primero del nombre porque es lo que se busca con la vista."""
    from app.tipos import tipo_config

    serie = (tipo_config(doc.tipo).get("serie") or "DOC").upper()
    return base_de(serie, doc.numero, doc.periodo)


def base_de(serie: str, numero: int | None, periodo: str) -> str:
    """La misma base a partir de datos sueltos (para quien no tiene el
    documento cargado, p. ej. una migración o el framework)."""
    parte = f"{numero:04d}" if numero else "SN"
    return f"{(serie or 'DOC').upper()}-{parte}-{periodo}"


# Lo inverso de `base_de` con su prefijo de derivado: «FIRM-OF-0152-2026-2027_Asunto» →
# («FIRM», «OF», 152, «2026-2027»). Tolera el prefijo «ADJ-<serie>-<n>-<periodo>_» que el
# sistema antepone al subir un archivo como adjunto de otro documento (2026-10-19).
_RE_PROPIO = re.compile(
    r"^(?:ADJ-[A-Z]+-(?:\d{1,5}|SN)-\d{4}(?:-\d{4})?[_-])?"
    r"(?:(?P<prefijo>FIRM|CR|RESP|ADJ)-)?(?P<serie>[A-Z]{2,6})-(?P<numero>\d{1,5})-(?P<periodo>\d{4}(?:-\d{4})?)(?:[_\s-]|$)"
)


def leer(nombre: str) -> tuple[str, str, int, str] | None:
    """(prefijo, serie, número, periodo) de un nombre de la convención, o None si no lo es.
    Pura."""
    m = _RE_PROPIO.match(Path(nombre or "").stem if "." in (nombre or "")[-6:] else (nombre or "").strip())
    if not m:
        return None
    return m["prefijo"] or "", m["serie"], int(m["numero"]), m["periodo"]


def asunto_breve(doc, maximo: int) -> str:
    """El texto que hace reconocible al documento. Se prefiere la SUMILLA
    —existe justo para esto: corta y distintiva— y, si no hay, el asunto."""
    campos = doc.campos or {}
    crudo = (campos.get("sumilla") or "").strip() or (campos.get("asunto") or "").strip()
    return sanear(crudo, maximo)


def _componer(prefijo: str, doc, descripcion: str, ext: str, extra: str = "") -> str:
    """Arma «[PREFIJO-]BASE_Descripcion[_extra].ext» respetando el límite: lo
    que se recorta es SIEMPRE la descripción, nunca el identificador."""
    ext = ext if ext.startswith(".") else f".{ext}" if ext else ""
    cabeza = f"{prefijo}-{base(doc)}" if prefijo else base(doc)
    cola = f"_{sanear(extra, 24)}" if extra else ""
    disponible = LIMITE - len(cabeza) - len(cola) - len(ext) - 1  # 1 = «_»
    cuerpo = sanear(descripcion, max(disponible, 0)) if disponible > 8 else ""
    return f"{cabeza}{'_' + cuerpo if cuerpo else ''}{cola}{ext}"


def documento(doc, ext: str = ".pdf") -> str:
    """Nombre del PDF oficial del documento."""
    return _componer("", doc, asunto_breve(doc, LIMITE), ext)


def derivado(doc, categoria: str, etiqueta: str = "", ext: str = ".pdf") -> str:
    """Nombre de un archivo que cuelga del documento (ver PREFIJO).

    En un CARGO de recepción manda el destinatario —es lo que distingue un
    cargo de otro dentro del mismo oficio múltiple—; en un adjunto o una
    respuesta, la descripción que escribió quien lo subió. Sin etiqueta se
    cae al asunto del documento, para que el archivo siga siendo reconocible.
    """
    prefijo = PREFIJO.get(categoria, PREFIJO[""])
    texto = (etiqueta or "").strip()
    if not texto or categoria == "firmado":
        # El firmado es el MISMO documento: lleva su asunto, no una etiqueta.
        texto = asunto_breve(doc, LIMITE)
    return _componer(prefijo, doc, texto, ext)


def expediente(doc, con_firma: bool, ext: str = ".pdf") -> str:
    """Expediente fusionado. El sufijo dice si incluye el documento FIRMADO o
    solo el PDF sin firma: se ha entregado por error más de una vez la versión
    sin firmar, y el nombre es la última barrera antes de mandarlo."""
    return _componer(
        PREFIJO_EXPEDIENTE,
        doc,
        asunto_breve(doc, LIMITE),
        ext,
        extra="firmado" if con_firma else "sin-firma",
    )


def unico_en(carpeta: Path, nombre: str) -> str:
    """El mismo nombre si está libre; si no, «…-2», «…-3». Sustituye al
    prefijo con el id que se usaba para garantizar unicidad."""
    destino = carpeta / nombre
    if not destino.exists():
        return nombre
    tallo, ext = Path(nombre).stem, Path(nombre).suffix
    for i in range(2, 100):
        candidato = f"{tallo}-{i}{ext}"
        if not (carpeta / candidato).exists():
            return candidato
    return nombre


def entrada(std: str, fecha: str, remitente: str, asunto: str, ext: str = ".pdf") -> str:
    """Nombre del PDF de un documento RECIBIDO (bandeja de entrada, 2026-10-06):
    «ENT-2437652-2026-10-03_SUTE-Huanta_Delegacion-de-facultades.pdf». El número de
    registro STD va primero (es por lo que se busca y como lo descarga el STD); sin él,
    «SN». La descripción es el remitente y el asunto, recortados por palabras."""
    numero = re.sub(r"\D", "", std or "") or "SN"
    cabeza = f"ENT-{numero}" + (f"-{fecha}" if re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha or "") else "")
    ext = ext if ext.startswith(".") else f".{ext}"
    disponible = LIMITE - len(cabeza) - len(ext) - 1
    quien = sanear(remitente, 30)
    que = sanear(asunto, max(disponible - len(quien) - 1, 0))
    cuerpo = "_".join(x for x in (quien, que) if x)[:disponible].strip("-_")
    return f"{cabeza}{'_' + cuerpo if cuerpo else ''}{ext}"

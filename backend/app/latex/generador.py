"""Generador de los archivos del contrato de compilacion del framework:

    carpeta-de-trabajo/
    ├── metadata.tex   <- datos del formulario
    └── oficio.tex     <- estructura fija + cuerpo serializado

El Qillqa escribe exactamente lo que hoy produce scripts/nuevo.sh a mano;
el formato sigue siendo responsabilidad exclusiva del framework.

Convenciones tipograficas del texto nuevo (0.5\\,\\%, S/~487.00, N°~735) y
la politica de revision ortografica/administrativa estan en
docs/redaccion-administrativa.md. Este modulo NO corrige contenido: compone
la estructura y delega el cuerpo al serializador (lista blanca).
"""

import re
import textwrap
import unicodedata
from datetime import date

from app.config import config
from app.latex.serializador import con_paquetes, cuerpo_a_latex, escapar, escapar_linea

_MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def fecha_en_espanol(valor: str | None) -> str:
    """'2026-08-06' -> '06 de agosto del 2026' (estilo de la entidad).

    Si el valor NO es una fecha ISO (p. ej. un heredado convertido trae la
    fecha ya en formato de la entidad, «04 de agosto del 2026»), se devuelve
    tal cual en vez de fallar."""
    if not valor:
        return _fecha_larga(date.today())
    try:
        return _fecha_larga(date.fromisoformat(valor.strip()))
    except ValueError:
        return valor.strip()


def _fecha_larga(dia: date) -> str:
    return f"{dia.day:02d} de {_MESES[dia.month - 1]} del {dia.year}"


def _slug(texto: str) -> str:
    """'Útiles de oficina' -> 'utiles-de-oficina' (para el nombre de carpeta)."""
    base = unicodedata.normalize("NFKD", texto or "")
    base = base.encode("ascii", "ignore").decode("ascii").lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base[:40] or "documento"


def nombre_carpeta(
    serie: str, numero: int | None, fecha_iso: str | None, sumilla: str, doc_id: int
) -> str:
    """Nombre de carpeta con la convención del framework
    (SERIE-NUMERO-AAAAMMDD-slug). Los borradores sin número usan un
    nombre estable por id para no chocar entre sí."""
    dia = date.fromisoformat(fecha_iso) if fecha_iso else date.today()
    fecha = dia.strftime("%Y%m%d")
    if numero is None:
        return f"{serie}-BORRADOR{doc_id:04d}-{fecha}-{_slug(sumilla)}"
    return f"{serie}-{numero:04d}-{fecha}-{_slug(sumilla)}"


def resumen_sumilla(asunto: str | None, limite: int = 60) -> str:
    """Sumilla automática para el nombre del PDF, derivada del asunto:
    primera frase, sin punto final, recortada."""
    texto = " ".join((asunto or "").split())
    if not texto:
        return ""
    # Cortar en el primer punto/dos puntos si aparece pronto.
    for sep in (". ", ": ", "; "):
        if sep in texto[:limite + 20]:
            texto = texto.split(sep)[0]
            break
    texto = texto.rstrip(".:;, ")
    return texto[:limite].rstrip()


def numero_completo(
    numero: int | None, periodo: str, siglas: str, tipodoc: str = "Oficio",
    tipo_cfg: dict | None = None,
) -> str:
    """Número oficial completo. Un tipo puede declarar en su registro
    (tipos.py) una identidad de serie PROPIA: `siglas`, `numero_prefijo`
    («N°» de la casa / «N.° » de la bancada), `numero_digitos` (0014 /
    001) y `sep_siglas` («-» / «/»). Sin esas claves: formato de la casa."""
    cfg = tipo_cfg or {}
    siglas = cfg.get("siglas") or siglas
    prefijo = cfg.get("numero_prefijo") or "N°"
    digitos = cfg.get("numero_digitos") or 4
    sep = cfg.get("sep_siglas") or "-"
    parte = f"{prefijo}{numero:0{digitos}d}" if numero else "S/N"
    return f"{tipodoc} {parte}-{periodo}{sep}{siglas}"


def generar_metadata(
    campos: dict, numero: int | None, tipodoc: str = "Oficio",
    tipo_cfg: dict | None = None,
) -> str:
    cfg = tipo_cfg or {}
    periodo = config.periodo
    siglas = cfg.get("siglas") or config.siglas
    digitos = cfg.get("numero_digitos") or 4
    lineas = [
        f"%% GENERADO por sgdp desde la base de datos ({date.today().isoformat()}); no editar a mano",
        f"\\setmeta{{numerocompleto}}{{{numero_completo(numero, periodo, siglas, tipodoc, cfg)}}}",
        f"\\setmeta{{tipodoc}}{{{escapar(tipodoc)}}}",
        # Sigla de la serie (OF, OM, MEM…): la usa el nombrado del framework
        # para bautizar el PDF si el .tex se compila a mano con build.sh, con
        # la MISMA convención que aplica el backend (servicios/nombres.py).
        f"\\setmeta{{serie}}{{{escapar((cfg.get('serie') or '').upper())}}}",
        f"\\setmeta{{numero}}{{{numero:0{digitos}d}}}" if numero else "\\setmeta{numero}{S/N}",
        f"\\setmeta{{anio}}{{{periodo}}}",
        f"\\setmeta{{siglas}}{{{escapar(siglas)}}}",
        f"\\setmeta{{lugar}}{{{escapar(campos.get('lugar') or config.lugar)}}}",
        f"\\setmeta{{fecha}}{{{fecha_en_espanol(campos.get('fecha'))}}}",
    ]
    # Identidad propia del tipo en el MEMBRETE (p. ej. la caja de la
    # bancada: autor «Bancada Regional» y cargo vacío -> línea omitida).
    for clave, valor in (cfg.get("metadata_extra") or {}).items():
        lineas.append(f"\\setmeta{{{clave}}}{{{escapar(valor)}}}")
    # La sumilla (nombre del PDF) es AUTOMÁTICA: sale del asunto,
    # recortado. El usuario ya no la escribe a mano.
    sumilla = (campos.get("sumilla") or resumen_sumilla(campos.get("asunto"))).strip()
    if sumilla:
        lineas.append(f"\\setmeta{{sumilla}}{{{escapar(sumilla)}}}")
    return "\n".join(lineas) + "\n"


_TRATAMIENTOS_COPIA = {
    "señor:", "señora:", "señorita:", "señores:", "señoras:",
}


def parsear_copias(con_copia: str) -> list[dict]:
    """Agrupa las líneas del campo con_copia en COPIAS individuales:
    [{'trat': 'Señor:', 'nombre': '…', 'cargos': ['…', …]}, …].

    Una línea de tratamiento («Señor:», «Señora:»…) abre una copia nueva;
    la siguiente línea es el nombre y las demás, su cargo (puede ocupar
    varias líneas). Compatible con los documentos existentes (mismo
    formato de líneas) y con VARIAS copias en un solo campo."""
    copias: list[dict] = []
    actual: dict | None = None
    for cruda in (con_copia or "").splitlines():
        linea = cruda.strip()
        if not linea:
            continue
        if linea.lower() in _TRATAMIENTOS_COPIA:
            actual = {"trat": linea, "nombre": "", "cargos": []}
            copias.append(actual)
            continue
        if actual is None:
            # Sin tratamiento explícito (copia escrita a la antigua).
            actual = {"trat": "", "nombre": "", "cargos": []}
            copias.append(actual)
        if not actual["nombre"]:
            actual["nombre"] = linea
        else:
            actual["cargos"].append(linea)
    return copias


def entradas_copia(con_copia: str) -> list[str]:
    """Una entrada por copia, en UNA línea: «Nombre, Cargo» (sin el
    tratamiento). Dos niveles —etiqueta y una línea por persona— en lugar de
    tres (tratamiento / nombre / cargo), que con varias copias ocupaba media
    hoja (Edison 2026-10-01)."""
    return [
        ", ".join(p for p in [c["nombre"], *c["cargos"]] if p)
        for c in parsear_copias(con_copia)
        if c["nombre"] or c["cargos"]
    ]


_SUFIJO_ADJ = re.compile(r"\s*\(\d+ documentos?\)\s*$")


def items_adjunto(anexo: str) -> list[str]:
    """Elementos de la línea «Adj.» («A; B; C» → [A, B, C]). Tolera el sufijo
    «(N documentos)» que la línea llevaba hasta 2026-10-01."""
    return [t.strip() for t in _SUFIJO_ADJ.sub("", anexo or "").split(";") if t.strip()]


def _copias_ocultas(campos: dict) -> bool:
    """La c.c. NO se imprime en el PDF (fmt_copia_mostrar='no'; Edison
    2026-09-08: «desactivar con copia en un documento»).

    Es un ajuste de FORMATO, no de contenido: el campo `con_copia` se
    conserva tal cual —sigue siendo metadata de la bandeja, sigue ordenándose
    solo y sigue pasando por la verificación previa a numerar—; lo único que
    cambia es que no se emite ni el bloque «Con copia a:» del destinatario ni
    la línea «c.c.:» del pie. Se consulta desde UN solo lugar porque la copia
    tiene DOS salidas al LaTeX y omitir una sola dejaría la copia impresa a
    medias."""
    return (campos.get("fmt_copia_mostrar") or "").strip() == "no"


def _cierre_normativo(campos: dict, copia_ya_arriba: bool = False) -> str:
    """Pie normativo COMPARTIDO por todos los tipos: adjunto (Adj.), con
    copia (c.c.) y sello al fondo, tras el bloque de firma. Solo emite lo
    que el usuario ajustó. \\adjunto/\\concopia/\\selloalfondo viven en
    core/lib/partes-comunes.tex.

    copia_ya_arriba=True (solo el oficio, cuando el usuario eligió «copia
    arriba») omite la c.c. del pie porque ya se compuso en el bloque de
    destinatario. `iniciales` («ABC/xyz») cierra el pie: identifica a quien
    firma y a quien redactó, y es parte del oficio administrativo (2026-09-23).
    """
    cierre = ""
    anexo = (campos.get("anexo") or "").strip()
    con_copia = (campos.get("con_copia") or "").strip()
    iniciales = (campos.get("iniciales") or "").strip()
    # Adj. y c.c. en LISTA, uno por línea (Edison 2026-10-01: «los adjuntos
    # se muestran de manera horizontal y se ve feo»); «en una línea» queda
    # como opción (fmt_pie_forma=linea) y es lo que traen los .tex a mano.
    en_lista = _fmt(campos, "fmt_pie_forma") != "linea"
    if anexo:
        items = items_adjunto(anexo)
        if en_lista and items:
            numerar = len(items) > 1
            cuerpo = "".join(
                f"\\itempie[{i}.]{{{escapar(t)}}}" if numerar else f"\\itempie{{{escapar(t)}}}"
                for i, t in enumerate(items, 1)
            )
            cierre += f"\n\\adjuntos{{{cuerpo}}}"
        else:
            cierre += f"\n\\adjunto{{{escapar(anexo)}}}"
    # La c.c. va al pie SALVO que ya se haya compuesto arriba (solo el
    # oficio soporta «copia arriba»; los demás tipos pasan el flag en
    # False, así que su c.c. nunca se pierde).
    if con_copia and not copia_ya_arriba and not _copias_ocultas(campos):
        # c.c. al pie: una entrada por copia («Nombre, Cargo»), separadas
        # por « · » (varias copias en el mismo pie sin repetir «Señor:»).
        entradas = entradas_copia(con_copia)
        if en_lista:
            cuerpo = "".join(f"\\itempie{{{escapar(e)}}}" for e in entradas)
            cierre += f"\n\\concopias{{{cuerpo}}}"
        else:
            cc = escapar(" · ".join(entradas))
            cierre += f"\n\\concopia{{{cc}}}"
    # El sello va al PIE cuando corresponde (ver _sello_al_fondo): si se
    # pidió fmt_sello=fondo o si la firma sigue al texto (si no, el sello
    # colgaría a media página, pegado a la firma — el error que reportó
    # Edison 2026-08-15). El hueco firma↕sello es intencional (firma tras el
    # texto, sello en la esquina inferior).
    # Iniciales de responsabilidad, al final del pie: van DESPUÉS de Adj. y
    # c.c. y antes del sello, que es lo último de la hoja.
    if iniciales:
        cierre += f"\n\\iniciales{{{escapar(iniciales)}}}"
    if _sello_al_fondo(campos):
        cierre += "\n\\selloalfondo"
    return cierre


def _bloque_firma_y_pie(firma: str, cierre: str) -> str:
    """Firma + Adj./c.c./iniciales como UN bloque indivisible (Edison 2026-10-10: «el adjunto no
    debe quedar aislado en una segunda página cuando hay espacio»): si no caben juntos tras el
    texto, pasan juntos y la escalera de compilacion.py aprieta el documento. El sello (una
    inserción) va fuera del bloque, porque dentro de una minipage no vale."""
    sello = "\n\\selloalfondo" if cierre.endswith("\\selloalfondo") else ""
    pie = cierre[: -len("\n\\selloalfondo")] if sello else cierre
    return (
        "\\noindent\\begin{minipage}{\\textwidth}\n"
        f"\\bloquefirma[{firma}]{pie}\n"
        "\\end{minipage}\\par" + sello
    )


def _firma_sigue_texto(campos: dict) -> bool:
    """La firma sigue al texto (sin \\vfill que la ancle al pie): documento
    multipágina o con la posición de la firma fijada (fmt_firma_espacio)."""
    return (
        _fmt(campos, "fmt_multipagina") == "si"
        or bool(_DIM_FIRMA.match(_fmt(campos, "fmt_firma_espacio")))
    )


def _sello_al_fondo(campos: dict) -> bool:
    """El sello va SIEMPRE al pie de la página donde cae la firma
    (\\sinsello + \\selloalfondo), en posición fija cerca del filete y sin
    poder saltar solo a otra página (Edison 2026-09-07; antes «colgaba» de
    la firma salvo con fmt_sello=fondo, y el \\vfill del pie lo mandaba a
    una segunda hoja vacía). Solo se omite si el sello está desactivado
    (fmt_sello=no). El valor «fondo» se acepta por compatibilidad."""
    return _fmt(campos, "fmt_sello") != "no"


def referencia_texto(campos: dict) -> str:
    """Texto de la REFERENCIA. El campo puede traer VARIAS referencias (una
    por línea: leyes, oficios previos, etc.); se unen con «; » en una sola
    línea REF. Compatible con una sola referencia."""
    refs = [l.strip() for l in (campos.get("referencia") or "").splitlines() if l.strip()]
    return "; ".join(refs)


def referencia_latex(campos: dict) -> str:
    """La REFERENCIA del oficio, ya como comando LaTeX (o cadena vacía).
    Una sola → «REFERENCIA: texto» en la misma línea (\\referencia). Varias →
    la etiqueta sola en su línea y la lista a), b), c) DEBAJO
    (\\referencias + \\itemreferencia, structure.tex del oficio), como en
    los oficios en Word de la entidad (Edison 2026-09-14: «con la palabra
    completa y la lista abajo»; antes, 2026-09-05, iba en parbox junto a
    «REF.»)."""
    refs = [l.strip() for l in (campos.get("referencia") or "").splitlines() if l.strip()]
    # Si la persona ya escribió la letra («a) Carta…», como en el borrador
    # 217), se quita: la pone el formato, y si no saldría «a) a) Carta…».
    refs = [re.sub(r"^[a-zA-Z]\)\s*", "", r) for r in refs]
    if not refs:
        return ""
    if len(refs) == 1:
        return f"\\referencia{{{escapar(refs[0])}}}"
    letras = "abcdefghijklmnopqrstuvwxyz"
    items = "\n".join(
        f"  \\itemreferencia{{{letras[i % 26]}}}{{{escapar(r)}}}" for i, r in enumerate(refs)
    )
    return f"\\referencias{{%\n{items}}}"


def _ref_opcional(campos: dict) -> str:
    """Argumento opcional [{REFERENCIA}] para la cabecera de memorando/
    informe (\\cabeceramemo/\\cabecerainforme); cadena vacía si no se
    llenó. Las llaves internas protegen un ']' del texto de cerrar el
    argumento opcional antes de tiempo."""
    referencia = referencia_texto(campos)
    return f"[{{{escapar(referencia)}}}]" if referencia else ""


# --- Formato de documento (panel «Formato» del editor) ----------------
# Los ajustes de formato son campos fmt_* del documento. Cada valor se
# VALIDA contra una lista blanca / patrón estricto antes de emitirse como
# comando LaTeX: abrir la edición de formato NO reabre la inyección que la
# lista blanca del serializador cierra (un valor libre en \setinterlineado
# podría inyectar comandos). Un valor inválido se ignora (default).
_DIM = re.compile(r"^\d{1,3}(?:\.\d{1,2})?(?:pt|cm|mm|em|ex|bp)$")
# Dimensión con signo (el sello puede SUBIR con valores negativos).
_DIM_SIGNADA = re.compile(r"^-?\d{1,2}(?:\.\d{1,2})?cm$")
# Espacio de la firma: 0–6 cm (el hueco entre «Atentamente,» y el nombre).
_DIM_FIRMA = re.compile(r"^[0-5](?:\.\d{1,2})?cm$")
# Tamaño de letra de las tablas del cuerpo/anexo (lista blanca).
_TABLA_TAMANOS = {
    "": "\\small",              # estándar de la casa
    "normal": "\\normalsize",   # igual al cuerpo
    "pequeno": "\\small",
    "muy-pequeno": "\\footnotesize",
    "diminuto": "\\scriptsize",
}
# Interlineado: un número entre 1 y 2 con hasta 2 decimales (1, 1.05, 1.15,
# 1.5, 2...). Regex, no lista fija, para aceptar los valores de compactación
# que usan los documentos ya hechos (p. ej. 1.05) al convertirlos.
_INTERLINEADO = re.compile(r"^(?:0\.[6-9]\d?|1(?:\.\d{1,2})?|2)$")
_TAMANOS_OPCION = {"10", "12"}          # 11 pt = default del framework
# Medios puntos del documento entero (2026-10-08): \setescala del marco
# (core/config/tamanos.tex) escala cuerpo, tablas y notas en proporción. El
# piso legible del cuerpo es 10 pt: no hay valores por debajo.
_TAMANOS_ESCALA = {"10.5", "11.5"}
TAMANO_MINIMO = 10.0
# Interlineado de UNA parte (destinatario, copias): admite compactar por
# debajo de 1 (0.8, 0.9), cosa que el interlineado global no permite.
_INTERLINEADO_PARTE = re.compile(r"^(?:0\.[6-9]\d?|1(?:\.\d{1,2})?|2)$")
# Tamaño del CUERPO relativo al del documento (Edison 2026-09-07: «cambiar
# el tamaño de letra únicamente en» una parte).
_CUERPO_TAMANOS = {"pequeno": "\\small", "grande": "\\large"}
# Ajuste EXCEPCIONAL del sello fijo: ±1.5 cm (negativo = sube).
_DIM_SELLO = re.compile(r"^-?[01](?:\.\d{1,2})?cm$")
_DEST_TAMANOS = {                        # tamaño de letra del destinatario
    "normal": "",
    "pequeno": "\\small",
    "muy-pequeno": "\\footnotesize",
}
# Tamaño de letra de UNA parte en PUNTOS, como en Word (Edison 2026-09-07:
# «8, 9, 10, 11, 12… para elegir exactamente el tamaño»). Lista blanca:
# solo estos valores se convierten en \fontsize{N}{1.2N}\selectfont.
_PUNTOS = {"7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13", "14"}
# Espacios VERTICALES de la composición, en líneas (factor de \baselineskip:
# siguen al interlineado). 0–2 líneas con hasta 2 decimales (2026-10-01).
_FACTOR = re.compile(r"^(?:[01](?:\.\d{1,2})?|2)$")
# Márgenes laterales (izquierdo = derecho). 2,54 cm es el del framework.
_MARGENES = {"2cm", "2.2cm", "2.54cm", "3cm"}


def _tamano_parte(valor: str) -> str:
    """Comando LaTeX del tamaño de una parte: puntos («9» → \\fontsize) o
    los nombres antiguos (pequeno/muy-pequeno); '' si es el del documento."""
    v = (valor or "").strip()
    if v in _PUNTOS:
        n = float(v)
        return f"\\fontsize{{{v}}}{{{n * 1.2:g}}}\\selectfont"
    return _DEST_TAMANOS.get(v, "")


def _fmt(campos: dict, clave: str) -> str:
    return (campos.get(clave) or "").strip()


def _opcion_tamano(campos: dict) -> str:
    """Opción [Npt] de \\documentclass; vacía si es el estándar (11 pt)."""
    t = _fmt(campos, "fmt_tamano")
    return f"[{t}pt]" if t in _TAMANOS_OPCION else ""


def _preambulo_formato(campos: dict) -> str:
    """Comandos de formato para el preámbulo del maestro (tras metadata,
    antes de \\begin{document}). Solo emite lo que el usuario ajustó y que
    pase la validación; lo demás queda en los defaults del framework."""
    lineas: list[str] = []
    t = _fmt(campos, "fmt_tamano")
    if t in _TAMANOS_ESCALA:
        lineas.append(f"\\setescala{{{t}}}")
    il = _fmt(campos, "fmt_interlineado")
    if _INTERLINEADO.match(il):
        lineas.append(f"\\setinterlineado{{{il}}}")
    ep = _fmt(campos, "fmt_espacioparrafos")
    if _DIM.match(ep):
        lineas.append(f"\\setespacioparrafos{{{ep}}}")
    sa = _fmt(campos, "fmt_sangria")
    if _DIM.match(sa):
        lineas.append(f"\\setsangriaparrafo{{{sa}}}")
    dest = _tamano_parte(_fmt(campos, "fmt_dest_tamano"))
    if dest:
        lineas.append(f"\\settamdestinatario{{{dest}}}")
    # Ajustes por PARTE (Edison 2026-09-07): interlineado del destinatario y
    # tamaño/interlineado de las copias, independientes del cuerpo.
    il = _fmt(campos, "fmt_dest_interlineado")
    if _INTERLINEADO_PARTE.match(il):
        lineas.append(f"\\setinterlineadodest{{{il}}}")
    tam = _tamano_parte(_fmt(campos, "fmt_copia_tamano"))
    if tam:
        lineas.append(f"\\settamcopia{{{tam}}}")
    il = _fmt(campos, "fmt_copia_interlineado")
    if _INTERLINEADO_PARTE.match(il):
        lineas.append(f"\\setinterlineadocopia{{{il}}}")
    # Pie y notas con medidas propias (2026-10-10): letra de las notas, letra de Adj./iniciales y
    # aire sobre Adj. (core/lib/partes-comunes.tex).
    tam = _tamano_parte(_fmt(campos, "fmt_notas_tamano"))
    if tam:
        lineas.append(f"\\settamnotas{{{tam}}}")
    tam = _tamano_parte(_fmt(campos, "fmt_pie_tamano"))
    if tam:
        lineas.append(f"\\settampie{{{tam}}}")
    v = _fmt(campos, "fmt_pie_espacio")
    if _FACTOR.match(v):
        lineas.append(f"\\setespaciopie{{{v}}}")
    # Espacios de la composición (Edison 2026-10-01: «controlar el espacio
    # entre la sumilla y el primer párrafo, y entre las partes»). Solo los
    # tipos cuya estructura los define los reciben (\ifdefined): el
    # memorando no tiene saludo, el informe no tiene cabecera de oficio.
    for clave, comando in (
        ("fmt_espacio_partes", "setespaciopartes"),
        ("fmt_espacio_saludo", "setespaciosaludo"),
    ):
        v = _fmt(campos, clave)
        if _FACTOR.match(v):
            lineas.append(f"\\ifdefined\\{comando}\\{comando}{{{v}}}\\fi")
    v = _fmt(campos, "fmt_espacio_cuerpo")
    if _FACTOR.match(v):
        lineas.append(f"\\setespacioantescuerpo{{{v}}}")
    m = _fmt(campos, "fmt_margenes")
    if m in _MARGENES:
        lineas.append(f"\\geometry{{left={m},right={m}}}")
    sello = _fmt(campos, "fmt_sello")
    if sello == "no":
        lineas.append("\\setmeta{sello}{no}")
    else:
        # El sello NO cuelga de la firma: va fijo al pie de la página de la
        # firma (\selloalfondo en el cierre; ver _sello_al_fondo).
        lineas.append("\\sinsello")
    # Ajuste EXCEPCIONAL de la posición fija del sello: negativo lo SUBE,
    # positivo lo baja hacia el filete (botones del panel Formato).
    sa = _fmt(campos, "fmt_sello_altura")
    if _DIM_SELLO.match(sa):
        lineas.append(f"\\setselloajuste{{{sa}}}")
    folio = _fmt(campos, "fmt_folio")
    if folio == "si":
        lineas.append("\\confolio")
    elif folio == "no":
        lineas.append("\\sinfolio")
    return "\n".join(lineas)


def _espacio_firma(campos: dict, defecto: str = "2.0cm") -> str:
    """Espacio entre «Atentamente,» y el nombre (posición vertical de la
    posfirma). Botones ↑/↓ del panel Formato: menos cm = firma más arriba."""
    v = _fmt(campos, "fmt_firma_espacio")
    return v if _DIM_FIRMA.match(v) else defecto


# Firma acompañada (2026-10-08): cuando el cierre no cabe en la hoja anterior ni apretando
# lo legible, compilacion.py pide acortar la PRIMERA hoja en N líneas para que más texto
# pase a la última y la firma no vaya solo con un par de renglones. Clave interna (la pone
# el servicio, nunca la web): un entero de 1 a 20.
_ALIGERAR = re.compile(r"^(?:[1-9]|1\d|20)$")


def _aligerar_primera_hoja(campos: dict) -> str:
    v = str(campos.get("_ajuste_aligerar") or "").strip()
    return f"\\enlargethispage{{-{v}\\baselineskip}}\n" if _ALIGERAR.match(v) else ""


def _cuerpo_formateado(campos: dict, cuerpo: str) -> str:
    """Envuelve el cuerpo en su tamaño de letra propio (fmt_cuerpo_tamano)
    cuando el usuario lo cambió; si no, lo devuelve tal cual. Antepone el
    acortamiento de la primera hoja si el servicio lo pidió."""
    v = _fmt(campos, "fmt_cuerpo_tamano")
    # Piso legible (2026-10-08): el cuerpo no baja de 10 pt aunque la lista de
    # puntos de las partes (destinatario, copias) llegue a 7.
    if v in _PUNTOS and float(v) < TAMANO_MINIMO:
        v = f"{TAMANO_MINIMO:g}"
    tam = _tamano_parte(v) or _CUERPO_TAMANOS.get(v, "")
    cuerpo = _aligerar_primera_hoja(campos) + cuerpo if cuerpo.strip() else cuerpo
    if not tam or not cuerpo.strip():
        return cuerpo
    return f"\\begingroup{tam}\n{cuerpo}\\par\\endgroup"


def _tamano_tabla(campos: dict) -> str:
    """Comando LaTeX del tamaño de letra de las tablas (lista blanca)."""
    return _TABLA_TAMANOS.get(_fmt(campos, "fmt_tabla_tamano"), "\\small")


def _anexos_lista(campos: dict) -> list[dict]:
    """Normaliza los anexos del formulario a [{'titulo', 'cuerpo'(doc)}].

    Fuente NUEVA: campos['anexos'] (JSON string de lista
    [{'titulo': str, 'cuerpo': <doc TipTap>}, ...]) — VARIOS anexos.
    Fuente HEREDADA (un solo anexo, docs anteriores a esta mejora):
    campos['anexo_titulo'] + campos['anexo_cuerpo']."""
    import json as _json

    def _doc(valor) -> dict | None:
        if isinstance(valor, dict):
            return valor
        if isinstance(valor, str) and valor.strip():
            try:
                d = _json.loads(valor)
            except (ValueError, TypeError):
                return None
            return d if isinstance(d, dict) else None
        return None

    crudo = (campos.get("anexos") or "").strip()
    if crudo:
        try:
            datos = _json.loads(crudo)
        except (ValueError, TypeError):
            datos = None
        if isinstance(datos, list):
            salida: list[dict] = []
            for it in datos:
                if not isinstance(it, dict):
                    continue
                doc = _doc(it.get("cuerpo"))
                if doc is not None:
                    salida.append({"titulo": it.get("titulo") or "", "cuerpo": doc})
            return salida
    # Heredado: anexo único.
    doc = _doc(campos.get("anexo_cuerpo"))
    if doc is not None:
        return [{"titulo": campos.get("anexo_titulo") or "", "cuerpo": doc}]
    return []


def _bloque_anexo(campos: dict) -> str:
    """ANEXOS compuestos DESDE EL FORMULARIO (cuadros/figuras del editor),
    aparte de los adjuntos escaneados. Cada anexo va tras la firma, en
    página nueva, con su título centrado. El contenido de cada uno es un
    doc TipTap que pasa por el MISMO serializador de lista blanca que el
    cuerpo. Si hay VARIOS y alguno no trae título, se rotula «ANEXO N»."""
    lista = _anexos_lista(campos)
    if not lista:
        return ""
    varios = len(lista) > 1
    bloques: list[str] = []
    for i, an in enumerate(lista, start=1):
        contenido = cuerpo_a_latex(an["cuerpo"], "oficio", _tamano_tabla(campos))
        if not contenido.strip():
            continue
        titulo_raw = (an.get("titulo") or "").strip()
        if not titulo_raw:
            titulo_raw = f"ANEXO {i}" if varios else "ANEXO"
        titulo = escapar(titulo_raw)
        bloques.append(
            f"""

%% ---- ANEXO compuesto en el editor (tablas/figuras del formulario) ----
\\clearpage
{{\\centering \\textbf{{{titulo}}}\\par}}
\\vspace{{0.8\\baselineskip}}
{contenido}"""
        )
    return "".join(bloques)


def _bloque_copia_arriba(campos: dict) -> str:
    """Texto de la copia que va DENTRO del destinatario (antes de
    «Presente.»), cuando el usuario elige copia arriba. Devuelve '' si no
    aplica. La etiqueta «Con copia a:» y el espacio los pone la propia
    estructura \\destinatario; aquí solo va el texto (escapado), una línea
    por copia."""
    if _fmt(campos, "fmt_copia_arriba") != "si" or _copias_ocultas(campos):
        return ""
    con_copia = _fmt(campos, "con_copia")
    if not con_copia:
        return ""
    # Una LÍNEA por copia («Nombre, Cargo»), con sangría francesa si se
    # alarga (Edison 2026-10-01: la c.c. en tres niveles —tratamiento,
    # nombre, cargo— ocupaba cuatro o más líneas por persona).
    return "".join(f"\\itempie{{{escapar(e)}}}" for e in entradas_copia(con_copia))


def _destinatario_nombre_latex(campos: dict) -> str:
    """Nombre(s) del destinatario. Formato ESTABLECIDO de la entidad:

    - UNA sola línea → texto (oficio simple).
    - VARIAS líneas con «Nombre — Cargo» (oficio a varias personas con
      nombre y cargo, p. ej. dos ministros) → bloques APILADOS: nombre en
      seriesemi y el cargo DEBAJO en peso normal, SIN numerar ni comas —el
      mismo bloque del destinatario simple, repetido—.
    - VARIAS líneas SIN el separador (destinatarios que son cargos/oficinas,
      p. ej. las UGEL) → lista `enumerate` (formato OM-0011).

    Cada trozo se ESCAPA (la lista blanca del serializador no aplica aquí).
    El resultado se inserta dentro de `{\\seriesemi ...}` de \\destinatario;
    por eso el cargo lleva `\\normalfont` y cada nombre siguiente reactiva
    `\\seriesemi`."""
    crudo = campos.get("destinatario_nombre") or ""
    lineas = [l.strip() for l in crudo.splitlines() if l.strip()]
    if len(lineas) <= 1:
        return escapar(lineas[0] if lineas else "")
    if any(" — " in l for l in lineas):
        bloques = []
        for l in lineas:
            if " — " in l:
                nom, car = (p.strip() for p in l.split(" — ", 1))
                bloques.append(
                    rf"\seriesemi {escapar(nom)}\par\normalfont {escapar(car)}"
                )
            else:
                bloques.append(rf"\seriesemi {escapar(l)}")
        return "\\par\\smallskip\n".join(bloques)
    items = "\n".join(rf"     \item {escapar(l)}" for l in lineas)
    return f"\\begin{{enumerate}}\n{items}\n   \\end{{enumerate}}"


# Instituciones femeninas por su primera palabra (las demás van con «del»).
_FEMENINAS = {
    "municipalidad", "universidad", "escuela", "direccion", "dirección", "unidad", "autoridad",
    "comision", "comisión", "presidencia", "gerencia", "oficina", "superintendencia", "agencia",
    "asociacion", "asociación", "federacion", "federación", "confederacion", "confederación",
    "junta", "red", "mesa", "secretaria", "secretaría", "defensoria", "defensoría", "contraloria",
    "contraloría", "procuraduria", "procuraduría", "fiscalia", "fiscalía", "corte", "camara",
    "cámara", "facultad", "institucion", "institución", "i.e.", "ie", "ugel", "dre", "drelm",
    "empresa", "cooperativa", "central", "sociedad", "fundacion", "fundación", "ong", "zona",
    "sede", "subgerencia", "subdireccion", "subdirección", "jefatura", "prefectura", "region",
    "región", "provincia", "comunidad", "compañia", "compañía", "entidad", "organizacion",
    "organización", "policia", "policía", "marina", "fuerza", "caja", "beneficencia",
}


def preposicion_institucion(institucion: str) -> str:
    """«del» o «de la» según la primera palabra de la institución («Ministerio» → del;
    «Municipalidad» → de la). Si ya empieza por «de», «del» o «la», no añade nada más."""
    palabras = institucion.strip().split()
    if not palabras:
        return "de"
    primera = palabras[0].strip("«»\"'").lower()
    if primera in ("de", "del"):
        return ""
    if primera in ("la", "el", "los", "las"):
        return "de"
    if primera in _FEMENINAS or (primera.endswith("a") and not primera.endswith("ma") and len(primera) > 3):
        return "de la"
    return "del"


def _cargo_nombra(cargo: str, institucion: str) -> bool:
    """¿El cargo ya menciona a la institución («Alcalde de la Municipalidad de Vilcanchos»)?"""
    def plano(t: str) -> str:
        import unicodedata
        t = unicodedata.normalize("NFD", t.lower())
        return "".join(c for c in t if unicodedata.category(c) != "Mn")
    inst = plano(institucion)
    sin_siglas = re.sub(r"\s*\([^)]*\)\s*$", "", inst).strip()
    c = plano(cargo)
    if not sin_siglas:
        return False
    if sin_siglas in c:
        return True
    # «Ministro de Vivienda…» ya nombra al «Ministerio de Vivienda…»: se compara lo que sigue
    # a la primera palabra de cada uno.
    resto = sin_siglas.split(" ", 1)[1] if " " in sin_siglas else ""
    return len(resto) > 8 and resto in c


def _maestro_oficio(campos: dict, cuerpo_json: dict) -> str:
    tratamiento = escapar(campos.get("destinatario_tratamiento") or "Señor:")
    nombre = _destinatario_nombre_latex(campos)
    cargo = escapar(campos.get("destinatario_cargo") or "")
    # Institución del destinatario: la CUARTA línea del bloque, que la
    # estructura ya aceptaba (\destinatario[copia]{nombre}{cargo}{extra}) y
    # el oficio no usaba. Sin ella, la entidad terminaba metida en el cargo o
    # —peor— en el renglón del nombre (2026-09-23, oficio al TACUNE).
    institucion = escapar(campos.get("destinatario_institucion") or "")
    # Cargo e institución en UNA línea unidos por «del» / «de la» (Edison 2026-10-10, «para
    # ahorrar espacio en el PDF»): «Director de la UGEL Huamanga». Si el cargo ya nombra a la
    # institución, o alguno falta, queda como estaba.
    cargo_crudo = (campos.get("destinatario_cargo") or "").strip()
    inst_cruda = (campos.get("destinatario_institucion") or "").strip()
    if cargo_crudo and inst_cruda and not _cargo_nombra(cargo_crudo, inst_cruda):
        from app.servicios.instituciones_destino import nombre_propio

        inst_linea = nombre_propio(inst_cruda)   # «ESCUELA DE …» → «Escuela de …»
        prep = preposicion_institucion(inst_linea)
        cargo = escapar(f"{cargo_crudo} {prep} {inst_linea}" if prep else f"{cargo_crudo} {inst_linea}")
        institucion = ""
    linea_institucion = (f"\\setdestinatarioinstitucion{{{institucion}}}\n"
                         if institucion else "")
    asunto = escapar_linea(campos.get("asunto") or "")
    saludo = escapar(campos.get("saludo") or "De mi mayor consideración:")
    cuerpo = _cuerpo_formateado(campos, cuerpo_a_latex(cuerpo_json, "oficio", _tamano_tabla(campos)))
    # Campos normativos opcionales (guías de redacción administrativa):
    # la referencia va tras el asunto (\referencia, propio del oficio);
    # el adjunto (Adj.) y la copia (c.c.) van tras la firma mediante el
    # pie normativo compartido con memorando e informe.
    referencia = referencia_latex(campos)
    ref_linea = f"\n{referencia}" if referencia else ""
    opcion = _opcion_tamano(campos)          # [10pt]/[12pt] o vacío
    preambulo = _preambulo_formato(campos)   # interlineado, sello, folio…
    # Sangría del bloque ASUNTO (más cm = más a la derecha). Solo el
    # oficio define \setsangriaasunto (structures/oficio/structure.tex).
    sa = _fmt(campos, "fmt_asunto_sangria")
    if _DIM.match(sa):
        preambulo += f"\n\\setsangriaasunto{{{sa}}}"
    copia = _bloque_copia_arriba(campos)     # texto de la copia (va arriba)
    dest_opc = f"[{{{copia}}}]" if copia else ""
    cierre = _cierre_normativo(campos, copia_ya_arriba=bool(copia))
    anexo_editor = _bloque_anexo(campos)     # anexo compuesto en el editor
    firma = _espacio_firma(campos, "2.0cm")  # posición vertical de la posfirma
    # La firma «sigue al texto» (sin \vfill que la anclaría al fondo de una
    # hoja) cuando el doc es MULTIPÁGINA o cuando el usuario FIJÓ su posición
    # con fmt_firma_espacio: sin esto, el \vfill la deja clavada abajo y los
    # botones ↑/↓ del panel no la mueven. El sello va al fondo con
    # \selloalfondo (fmt_sello=fondo). Ver §5 del CLAUDE.md.
    vfill = "" if _firma_sigue_texto(campos) else "\\vfill"

    return f"""%% GENERADO por sgdp desde la base de datos ({date.today().isoformat()}); no editar a mano
\\documentclass{opcion}{{oficio}}

\\input{{metadata.tex}}

\\confolio
{preambulo}
\\begin{{document}}

\\lugaryfecha
\\numerodocumento

{linea_institucion}\\destinatario{dest_opc}{{\\textbf{{{tratamiento}}}}}%
  {{{nombre}}}%
  {{{cargo}}}

\\asunto{{\\textbf{{{asunto}}}}}{ref_linea}

\\saludo[{saludo}]

%% Sin líneas viudas: un párrafo no deja su última línea sola en la hoja siguiente (y a la
%% firma la acompaña el último párrafo entero, no un renglón suelto; 2026-10-06, OF-0123).
\\widowpenalty=10000\\relax
{cuerpo}

%% El final del cuerpo, «Atentamente», el espacio de la firma y el nombre van
%% ENCADENADOS (\\nobreak): si no caben, la hoja se corta dentro del último párrafo y
%% al menos sus últimas líneas acompañan a la firma. Antes un \\needspace pasaba el
%% cierre entero a la hoja siguiente y la firma quedaba sola en ella (2026-10-06,
%% OF-0123); y el corte entre «Atentamente» y el nombre tampoco ocurre (OF-0119).
%% El aire que ancla la firma al pie va ANTES de «Atentamente» (2026-10-10, segunda vuelta): la
%% despedida viaja con la firma, como en Word; antes quedaba pegada al texto y el nombre diez
%% centímetros más abajo. El \\nobreak previo hace que ese \\vfill no sea un punto de corte.
\\par\\nobreak
{vfill}
\\nobreak
\\atentamente
\\nobreak
{_bloque_firma_y_pie(firma, cierre)}{anexo_editor}

\\end{{document}}
"""


def _maestro_memorando(campos: dict, cuerpo_json: dict) -> str:
    para = escapar(campos.get("para") or "")
    de = escapar(campos.get("de") or "")
    asunto = escapar_linea(campos.get("asunto") or "")
    cuerpo = _cuerpo_formateado(campos, cuerpo_a_latex(cuerpo_json, "memorando", _tamano_tabla(campos)))
    ref = _ref_opcional(campos)          # fila REF. opcional en la cabecera
    cierre = _cierre_normativo(campos)   # Adj./c.c. tras la firma
    opcion = _opcion_tamano(campos)
    preambulo = _preambulo_formato(campos)
    anexo_editor = _bloque_anexo(campos)
    firma = _espacio_firma(campos, "1.8cm")
    return f"""%% GENERADO por sgdp desde la base de datos ({date.today().isoformat()}); no editar a mano
\\documentclass{opcion}{{memorando}}

\\input{{metadata.tex}}
{preambulo}
\\begin{{document}}

\\numerodocumento

\\cabeceramemo{ref}
  {{{para}}}
  {{{de}}}
  {{{asunto}}}

%% Sin líneas viudas: un párrafo no deja su última línea sola en la hoja siguiente (y a la
%% firma la acompaña el último párrafo entero, no un renglón suelto; 2026-10-06, OF-0123).
\\widowpenalty=10000\\relax
{cuerpo}

%% El final del cuerpo, «Atentamente», el espacio de la firma y el nombre van
%% ENCADENADOS (\\nobreak): si no caben, la hoja se corta dentro del último párrafo y
%% al menos sus últimas líneas acompañan a la firma. Antes un \\needspace pasaba el
%% cierre entero a la hoja siguiente y la firma quedaba sola en ella (2026-10-06,
%% OF-0123); y el corte entre «Atentamente» y el nombre tampoco ocurre (OF-0119).
\\par\\nobreak
\\atentamente
\\nobreak
{_bloque_firma_y_pie(firma, cierre)}{anexo_editor}

\\end{{document}}
"""


def _maestro_informe(campos: dict, cuerpo_json: dict) -> str:
    para = escapar(campos.get("para") or "")
    de = escapar(campos.get("de") or "")
    asunto = escapar_linea(campos.get("asunto") or "")
    # El cuerpo del informe usa \seccion (encabezados del editor).
    cuerpo = _cuerpo_formateado(campos, cuerpo_a_latex(cuerpo_json, "informe", _tamano_tabla(campos)))
    ref = _ref_opcional(campos)          # fila REF. opcional en la cabecera
    cierre = _cierre_normativo(campos)   # Adj./c.c. tras la firma
    opcion = _opcion_tamano(campos)
    preambulo = _preambulo_formato(campos)
    anexo_editor = _bloque_anexo(campos)
    firma = _espacio_firma(campos, "1.8cm")
    return f"""%% GENERADO por sgdp desde la base de datos ({date.today().isoformat()}); no editar a mano
\\documentclass{opcion}{{informe}}

\\input{{metadata.tex}}
{preambulo}
\\begin{{document}}

\\numerodocumento

\\cabecerainforme{ref}
  {{{para}}}
  {{{de}}}
  {{{asunto}}}

%% Sin líneas viudas: un párrafo no deja su última línea sola en la hoja siguiente (y a la
%% firma la acompaña el último párrafo entero, no un renglón suelto; 2026-10-06, OF-0123).
\\widowpenalty=10000\\relax
{cuerpo}

%% El final del cuerpo, «Atentamente», el espacio de la firma y el nombre van
%% ENCADENADOS (\\nobreak): si no caben, la hoja se corta dentro del último párrafo y
%% al menos sus últimas líneas acompañan a la firma. Antes un \\needspace pasaba el
%% cierre entero a la hoja siguiente y la firma quedaba sola en ella (2026-10-06,
%% OF-0123); y el corte entre «Atentamente» y el nombre tampoco ocurre (OF-0119).
\\par\\nobreak
\\atentamente
\\nobreak
{_bloque_firma_y_pie(firma, cierre)}{anexo_editor}

\\end{{document}}
"""


def _maestro_solicitud(campos: dict, cuerpo_json: dict) -> str:
    # Sumilla SOLICITO: (arriba-derecha); el destinatario va en mayúsculas
    # (lo hace la estructura). La solicitud NO lleva antefirma; el pie
    # normativo (Adj./c.c.) sí, compartido con los demás tipos.
    sumilla = escapar(campos.get("sumilla_solicito") or "SOLICITO:")
    dest_cargo = escapar(campos.get("destinatario_cargo") or "")
    dest_inst = escapar(campos.get("destinatario_institucion") or "")
    dest_lugar = escapar(campos.get("destinatario_lugar") or "S.D.")
    cuerpo = _cuerpo_formateado(campos, cuerpo_a_latex(cuerpo_json, "solicitud"))
    cierre = _cierre_normativo(campos)
    opcion = _opcion_tamano(campos)
    preambulo = _preambulo_formato(campos)
    return f"""%% GENERADO por sgdp desde la base de datos ({date.today().isoformat()}); no editar a mano
\\documentclass{opcion}{{solicitud}}

\\input{{metadata.tex}}
{preambulo}
\\begin{{document}}

\\sumillasolicitud{{{sumilla}}}

\\destinatariosolicitud
  {{{dest_cargo}}}
  {{{dest_inst}}}
  {{{dest_lugar}}}

{cuerpo}

\\vfill
\\lugaryfecha
{_bloque_firma_y_pie('2.0cm', cierre)}

\\end{{document}}
"""


def _maestro_acta(campos: dict, cuerpo_json: dict) -> str:
    # El título ("ACTA DE SESIÓN N°...") sale de \numerodocumento; la
    # clase (Ordinaria/Extraordinaria) y el órgano van en la línea
    # \organosesion. El cuerpo usa \estacion (encabezados del editor).
    clase = escapar(campos.get("clase_sesion") or "Ordinaria")
    organo = escapar(campos.get("organo") or "")
    pres_n = escapar(campos.get("presidente_nombre") or "")
    pres_c = escapar(campos.get("presidente_cargo") or "Presidente")
    sec_n = escapar(campos.get("secretario_nombre") or "")
    sec_c = escapar(campos.get("secretario_cargo") or "Secretario")
    cuerpo = _cuerpo_formateado(campos, cuerpo_a_latex(cuerpo_json, "acta"))
    linea = f"Sesión {clase}"
    if organo:
        linea += f" \\textperiodcentered\\ {organo}"
    opcion = _opcion_tamano(campos)
    preambulo = _preambulo_formato(campos)
    return f"""%% acta.tex generado por Qillqa -- NO editar a mano
\\documentclass{opcion}{{acta}}

\\input{{metadata.tex}}
{preambulo}
\\begin{{document}}

\\numerodocumento
\\organosesion{{{linea}}}

{cuerpo}

\\firmasacta
  {{{pres_n}}}{{{pres_c}}}
  {{{sec_n}}}{{{sec_c}}}

\\end{{document}}
"""


_MAESTROS = {
    "oficio": _maestro_oficio,
    "memorando": _maestro_memorando,
    "informe": _maestro_informe,
    "solicitud": _maestro_solicitud,
    "acta": _maestro_acta,
}


def _paginas_anexo(anexos: list[str]) -> str:
    """Bloque de páginas de anexo: cada imagen a página completa (respeta
    proporción). Los archivos viven en <carpeta>/adjuntos/ con nombre ya
    saneado (sin caracteres peligrosos para \\includegraphics)."""
    bloques = [
        "\\clearpage\n"
        "{\\centering\\includegraphics"
        "[width=\\textwidth,height=0.92\\textheight,keepaspectratio]"
        "{adjuntos/" + nombre + "}\\par}"
        for nombre in anexos
    ]
    return "\n".join(bloques)


def _pagina_relacion(relacion: list[dict]) -> str:
    """Página «RELACIÓN DE DOCUMENTOS ADJUNTOS»: enumera los documentos
    que ACOMPAÑAN al oficio (descripción + folios), los que se fusionan
    aparte en el expediente. Es DISTINTA de los ANEXOS de cuadros del
    editor (esos son páginas de contenido del propio documento)."""
    if not relacion:
        return ""
    filas = []
    for i, a in enumerate(relacion, start=1):
        desc = escapar(a.get("descripcion") or f"Documento {i}")
        folios = a.get("folios")
        detalle = (
            f" ({folios} folio{'s' if folios != 1 else ''})"
            if isinstance(folios, int) and folios > 0
            else ""
        )
        filas.append(f"  \\item {desc}{detalle}")
    cuerpo = "\n".join(filas)
    return (
        "\n\\clearpage\n"
        "{\\centering \\textbf{RELACIÓN DE DOCUMENTOS ADJUNTOS}\\par}\n"
        "\\vspace{0.8\\baselineskip}\n"
        "\\begin{enumerate}\n" + cuerpo + "\n\\end{enumerate}"
    )


def encabezado_descriptivo(
    clase: str, tipodoc: str, numero: int | None, campos: dict, ruta_rel: str
) -> str:
    """Encabezado en comentarios de CADA .tex generado (pedido de Edison,
    2026-08-12): dice QUÉ es el documento (tipo, número y una descripción
    del asunto) y CÓMO compilarlo. Es 100% comentario LaTeX (no requiere
    escape)."""
    num = f"N°{numero:04d}" if numero else "S/N"
    desc = (campos.get("asunto") or campos.get("sumilla") or "documento de la entidad")
    desc = " ".join(str(desc).split())
    titulo = f"{tipodoc} {num}: {desc}"
    prefijo = f"%%  {clase}.tex  --  "
    cont = "%%" + " " * (len(prefijo) - 2)
    envueltas = textwrap.wrap(titulo, width=71 - len(prefijo)) or [titulo]
    lineas_titulo = [prefijo + envueltas[0]] + [cont + w for w in envueltas[1:]]
    barra = "%% " + "=" * 69
    sep = "%% " + "-" * 69
    return "\n".join([
        barra,
        *lineas_titulo,
        sep,
        "%%  Uso:",
        f'%%    scripts/build.sh "{ruta_rel}"',
        sep,
        "%%  Generado desde Qillqa; el contenido se edita en la plataforma",
        "%%  (este archivo se regenera al guardar/generar).",
        barra,
    ])


def generar_maestro(
    clase: str,
    campos: dict,
    cuerpo_json: dict,
    anexos: list[str] | None = None,
    encabezado: str | None = None,
    relacion: list[dict] | None = None,
) -> str:
    """Compone el .tex maestro según la CLASE del framework. Con
    `encabezado`, reemplaza el comentario genérico inicial por uno
    descriptivo. Cola tras la firma (antes de \\end{document}): la RELACIÓN
    de documentos adjuntos (si hay) y luego las imágenes marcadas como
    anexo, incrustadas como páginas finales."""
    constructor = _MAESTROS.get(clase, _maestro_oficio)
    tex = constructor(campos, cuerpo_json)
    if encabezado:
        tex = re.sub(
            r"^%%[^\n]*generado por Qillqa[^\n]*\n", encabezado + "\n", tex, count=1
        )
    cola = ""
    if relacion:
        cola += "\n" + _pagina_relacion(relacion)
    if anexos:
        cola += "\n" + _paginas_anexo(anexos)
    if cola:
        tex = tex.replace("\\end{document}", cola + "\n\n\\end{document}")
    # Tachado o celdas combinadas en vertical: su paquete, solo si se usan.
    return con_paquetes(tex)

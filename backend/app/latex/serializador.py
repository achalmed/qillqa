"""Serializador: JSON de TipTap (ProseMirror) -> LaTeX del framework.

Funciona por LISTA BLANCA: solo se traduce lo que este modulo conoce;
cualquier nodo o marca desconocida detiene la serializacion. Asi es
imposible, por construccion, inyectar LaTeX desde la web.

INVARIANTE DE REDACCION (ver docs/redaccion-administrativa.md, seccion 12):
este modulo NO corrige ni altera el texto (ni ortografia, ni mayusculas, ni
puntuacion). Solo TRADUCE nodos y ESCAPA caracteres. La revision
ortografica/administrativa es un paso EDITORIAL previo sobre el modelo
(campos/cuerpo), nunca un filtro silencioso aqui: auto-normalizar contenido
romperia la integridad del texto legal y la garantia anti-inyeccion.
"""

import re
import unicodedata
from contextvars import ContextVar

# Número de la nota al pie que se está componiendo (2026-10-14): lo pone cuerpo_a_latex.
_NOTA_N: ContextVar[int] = ContextVar("_NOTA_N", default=0)


def sin_numero_pegado(texto: str, numero: int) -> str:
    """Quita del inicio de una nota su propio número, pegado de Word una o más veces
    («1 1 1 Debe tenerse…» en la nota 1 → «Debe tenerse…»; 2026-10-14, oficios 133, 134 y 144).
    Solo el número de ESA nota: una nota que de verdad empieza con una cifra («15 días…») queda."""
    if numero <= 0:
        return texto
    return re.sub(rf"^\s*(?:{numero}[.)]?\s+)+", "", texto or "")


def _siguiente_nota() -> int:
    n = _NOTA_N.get() + 1
    _NOTA_N.set(n)
    return n


class NodoNoSoportado(ValueError):
    """El cuerpo contiene un elemento que el sistema aun no traduce."""


_ESCAPES = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

# Caracteres INVISIBLES que llegan al pegar desde Word/web y que rompen o
# ensucian la compilación: controles C0/C1 (salvo \n en bloques), espacios
# raros y ancho-cero. Se sustituyen ANTES de escapar (texto pegado -> texto
# limpio -> LaTeX). Ver docs/redaccion-administrativa.md (§9, typos).
_INVISIBLES = {
    " ": " ",   # espacio no separable (nbsp de Word)
    " ": " ",   # nbsp fino
    " ": " ",   # espacio de cifra
    " ": " ",   # espacio fino
    "\t": " ",
    "​": "",    # ancho cero
    "‌": "",
    "‍": "",
    "﻿": "",    # BOM
    "­": "",    # guion suave
    "\r": "",
}


# Word escribe los símbolos de sus fuentes Symbol y Wingdings en la zona de USO PRIVADO
# (U+F000–U+F0FF): el «°» de Symbol llega como U+F0B0, la viñeta como U+F0B7… Ninguna fuente
# del marco los dibuja y desaparecían del PDF. Se traducen al carácter real; el resto de la
# zona privada se descarta.
_PRIVADOS_WORD = {
    "\uf0b0": "°", "\uf0b7": "•", "\uf0a7": "•", "\uf0a8": "•", "\uf076": "•", "\uf0d8": "•",
    "\uf0fc": "✓", "\uf0fb": "✗", "\uf0e0": "→", "\uf0ae": "→", "\uf0ac": "←", "\uf0b1": "±",
    "\uf0b4": "×", "\uf0a3": "≤", "\uf0b3": "≥", "\uf0b9": "≠", "\uf02d": "-", "\uf02a": "*",
}
# Lo que las fuentes del marco (Source Serif 4, Archivo, Inter) no tienen: se compone en modo
# matemático, que sí lo dibuja.
_SIN_GLIFO = {
    "→": r"\ensuremath{\rightarrow}", "←": r"\ensuremath{\leftarrow}", "↔": r"\ensuremath{\leftrightarrow}",
    "⇒": r"\ensuremath{\Rightarrow}", "≤": r"\ensuremath{\leq}", "≥": r"\ensuremath{\geq}",
    "≠": r"\ensuremath{\neq}", "≈": r"\ensuremath{\approx}", "✓": r"\ensuremath{\surd}",
    "✔": r"\ensuremath{\surd}", "✗": "x", "✘": "x", "\u2011": "-", "−": "-",
}


def _visible(c: str) -> bool:
    """Fuera: controles C0 (salvo salto de línea) y C1, selectores de variante, zona privada y
    emoji (ninguna fuente del marco los tiene)."""
    o = ord(c)
    if c == "\n":
        return True
    if o < 32 or 0x7F <= o <= 0x9F or 0xFE00 <= o <= 0xFE0F or 0xE000 <= o <= 0xF8FF:
        return False
    return not (0x1F000 <= o <= 0x1FAFF or 0x2600 <= o <= 0x26FF or 0x2700 <= o <= 0x27BF and c not in _SIN_GLIFO)


def limpiar(texto: str) -> str:
    """Texto pegado de Word o de la web → texto limpio: forma Unicode compuesta (NFC: la «é»
    de dos piezas pasa a una), invisibles y espacios raros, separadores de línea Unicode, los
    símbolos de las fuentes de Word y fuera lo que no se puede imprimir."""
    texto = unicodedata.normalize("NFC", texto or "")
    texto = texto.replace("\u2028", "\n").replace("\u2029", "\n")
    texto = "".join(_PRIVADOS_WORD.get(c, _INVISIBLES.get(c, c)) for c in texto)
    return "".join(c for c in texto if _visible(c))


def escapar(texto: str) -> str:
    """Neutraliza los caracteres especiales de LaTeX en un solo paso
    (limpiando antes los caracteres invisibles del pegado)."""
    return "".join(_ESCAPES.get(c) or _SIN_GLIFO.get(c, c) for c in limpiar(texto))


def escapar_linea(texto: str) -> str:
    """`escapar` para un campo de UNA línea (asunto, referencia): los saltos y las líneas en
    blanco pegadas de Word se vuelven un espacio. Una línea en blanco dentro de \\asunto{…}
    es un \\par que corta el argumento y el asunto no sale."""
    return escapar(" ".join(limpiar(texto).split()))


# URL confiable = esquema http(s)/mailto + SOLO caracteres RFC 3986. El
# conjunto excluye \ { } ^ ` espacio y controles, de modo que una URL
# valida NO puede cerrar un grupo LaTeX ni iniciar un comando: la
# inyeccion queda cerrada antes de cualquier escape.
_URL_VALIDA = re.compile(
    r"^(?:https?://|mailto:)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$"
)

# En el objetivo de \href, % y # se leen (comentario / parametro) ANTES
# de que hyperref recatcodee; & y $ tambien son especiales. Se
# neutralizan produciendo el caracter literal en el enlace (verificado
# compilando). ~ y _ hyperref los acepta crudos.
_ESCAPES_HREF = {"%": r"\%", "#": r"\#", "&": r"\&", "$": r"\$"}


def _validar_url(url: str) -> str:
    if not _URL_VALIDA.match(url):
        raise NodoNoSoportado(
            "El enlace no es una dirección web válida o contiene "
            "caracteres no permitidos. Use una dirección http(s) o de correo."
        )
    return url


def _escapar_url_href(url: str) -> str:
    return "".join(_ESCAPES_HREF.get(c, c) for c in url)


# URL dentro del TEXTO de una nota al pie (2026-10-01: se salían del margen).
# Las notas guardan texto plano; aquí cada URL se compone partible (xurl,
# cargado por el marco). \url sirve dentro del argumento de \footnote salvo con
# % o # (url.sty): esas se escriben como texto con cortes permitidos.
_URL_EN_TEXTO = re.compile(r"(?:https?://|www\.)[^\s<>\"“”«»]+[^\s<>\"“”«».,;:)\]]")


def _texto_con_urls(texto: str) -> str:
    salida: list[str] = []
    pos = 0
    for m in _URL_EN_TEXTO.finditer(texto):
        salida.append(escapar(texto[pos:m.start()]))
        url = m.group(0)
        if _URL_VALIDA.match(url) and "%" not in url and "#" not in url:
            salida.append(rf"\url{{{url}}}")
        else:
            salida.append(re.sub(r"([/.\-_?=&])", r"\1\\allowbreak{}", escapar(url)))
        pos = m.end()
    salida.append(escapar(texto[pos:]))
    return "".join(salida)


def _texto(nodo: dict) -> str:
    latex = escapar(nodo.get("text", ""))
    for marca in nodo.get("marks", []):
        tipo = marca.get("type")
        if tipo == "bold":
            latex = rf"\textbf{{{latex}}}"
        elif tipo == "italic":
            latex = rf"\textit{{{latex}}}"
        elif tipo == "underline":
            latex = rf"\underline{{{latex}}}"
        elif tipo == "strike":
            # Tachado (2026-10-05): lo que se suprime en el cuadro comparativo.
            # \sout (ulem) parte renglones; el paquete lo añade con_paquetes().
            latex = rf"\sout{{{latex}}}"
        elif tipo == "insercion":
            # Control de cambios (2026-10-19): una sugerencia de inserción sale subrayada con \uline
            # (ulem, como \sout) hasta que alguien la acepte; la supresión, tachada.
            latex = rf"\uline{{{latex}}}"
        elif tipo == "supresion":
            latex = rf"\sout{{{latex}}}"
        elif tipo == "superscript":
            latex = rf"\textsuperscript{{{latex}}}"
        elif tipo == "subscript":
            latex = rf"\textsubscript{{{latex}}}"
        elif tipo == "colorTexto":
            # Color de texto (2026-10-19): solo un hex de 6 dígitos de la paleta del editor; otra
            # cosa se ignora (xcolor va en el núcleo del marco, colores.tex).
            color = str(marca.get("attrs", {}).get("color", "")).strip().lstrip("#")
            if re.fullmatch(r"[0-9A-Fa-f]{6}", color):
                latex = rf"\textcolor[HTML]{{{color.upper()}}}{{{latex}}}"
        elif tipo == "link":
            href = str(marca.get("attrs", {}).get("href", "")).strip()
            if not _URL_VALIDA.match(href):
                # Un enlace que no es web ni correo (el ancla «#_ftn1» de una nota pegada de Word,
                # una ruta local, «javascript:…») ya no aborta la compilación entera (2026-10-12:
                # borradores sin vista previa y «el documento no existe»): se conserva el TEXTO sin
                # enlace, como con las marcas desconocidas. La lista blanca sigue intacta.
                continue
            url = _validar_url(href)
            if escapar(url) == latex or not latex.strip():
                # URL sola: \url la tipografia verbatim (hyperref catcodea
                # % # & _ ~); la validacion ya descarto \ { } -> es segura.
                latex = rf"\url{{{url}}}"
            else:
                latex = rf"\href{{{_escapar_url_href(url)}}}{{{latex}}}"
        else:
            # Marca desconocida (color, resaltado, estilos que Word pega):
            # se IGNORA el formato y se conserva el texto. La lista blanca
            # sigue intacta: solo se emite LaTeX conocido y texto escapado;
            # antes esto abortaba la compilacion entera (pedido de Edison
            # 2026-08-14: pegar de Word no debe tumbar la vista previa).
            continue
    return latex


def _hijos(nodo: dict) -> list[dict]:
    return nodo.get("content", []) or []


def _parrafo(nodo: dict) -> str:
    partes: list[str] = []
    for hijo in _hijos(nodo):
        tipo = hijo.get("type")
        if tipo == "text":
            partes.append(_texto(hijo))
        elif tipo == "hardBreak":
            # Al inicio del párrafo no hay renglón que terminar: LaTeX aborta
            # con «There's no line here to end» (vista previa del 2026-10-05).
            if not "".join(partes).strip():
                continue
            # «{}» corta la búsqueda de \\[espacio]: un renglón que empieza
            # con «[» («[Pegue aquí…]», «[sic]») no se lee como argumento.
            partes.append("\\\\{}\n")
        elif tipo == "footnote":
            # Nota al pie: texto en el atributo, escapado (no admite
            # formato interno — LaTeX pone número, tamaño y filete).
            # Las URL de la nota se componen partibles (no rebasan el margen).
            crudo = sin_numero_pegado(str(hijo.get("attrs", {}).get("texto", "")), _siguiente_nota())
            nota = _texto_con_urls(crudo)
            partes.append(f"\\footnote{{{nota}}}")
        elif tipo == "referencia":
            # Cita insertada desde el autocompletado (2026-10-06): en el PDF es
            # SOLO su texto, escapado, como si se hubiera escrito a mano. Una obra
            # (de Zotero, que formatea su referencia; antes, un libro de Calibre)
            # lleva además su referencia como nota al pie (atributo `nota`), igual
            # que una nota escrita por el autor.
            attrs = hijo.get("attrs", {}) or {}
            partes.append(escapar(str(attrs.get("texto", ""))))
            nota = str(attrs.get("nota", "") or "").strip()
            if nota:
                partes.append(f"\\footnote{{{_texto_con_urls(sin_numero_pegado(nota, _siguiente_nota()))}}}")
        else:
            # Nodo en línea desconocido (imagen pegada, emoji-objeto, etc.):
            # se rescata su texto interno si lo tiene; si no, se OMITE en
            # vez de abortar la compilación (tolerancia al pegado de Word).
            partes.append(_solo_texto(hijo))
    return "".join(partes)


def _solo_texto(nodo: dict) -> str:
    """Texto plano (escapado) de un nodo desconocido, recursivo."""
    if nodo.get("type") == "text":
        return escapar(nodo.get("text", ""))
    return "".join(_solo_texto(h) for h in _hijos(nodo))


# Numeración de una lista ordenada (atributo `type` del editor): 1. · a) · A) · i) · I).
_ETIQUETAS_LISTA = {"a": r"\alph*)", "A": r"\Alph*)", "i": r"\roman*)", "I": r"\Roman*)"}


def _lista(nodo: dict, entorno: str, clase: str, tabla_tamano: str = "\\small") -> str:
    filas = []
    for item in _hijos(nodo):
        if item.get("type") != "listItem":
            # Elemento suelto en la lista (pegado raro): rescatar su texto.
            texto = _solo_texto(item).strip()
            if texto:
                filas.append(f"  \\item {texto}")
            continue
        contenido = " ".join(
            _bloque(sub, clase, tabla_tamano) for sub in _hijos(item)
        ).strip()
        filas.append(f"  \\item {contenido}")
    if not filas:
        return ""
    cuerpo = "\n".join(filas)
    opciones: list[str] = []
    if entorno == "enumerate":
        attrs = nodo.get("attrs") or {}
        if attrs.get("type") in _ETIQUETAS_LISTA:
            opciones.append(f"label={_ETIQUETAS_LISTA[attrs['type']]}")
        try:
            inicio = int(attrs.get("start") or 1)
        except (TypeError, ValueError):
            inicio = 1
        if 1 < inicio < 1000:
            opciones.append(f"start={inicio}")
    extra = f"[{', '.join(opciones)}]" if opciones else ""
    return f"\\begin{{{entorno}}}{extra}\n{cuerpo}\n\\end{{{entorno}}}"


def _encabezado(nodo: dict, clase: str) -> str:
    """Un encabezado del editor. En informes es una \\seccion; en los
    demás tipos, un párrafo en negrita (no existe \\seccion en esas
    clases)."""
    texto = "".join(
        _texto(h) for h in _hijos(nodo) if h.get("type") == "text"
    )
    if clase == "informe":
        return f"\\seccion{{{texto}}}"
    if clase == "acta":
        # En el acta los encabezados son ESTACIONES (control de
        # asistencia, orden del día, aprobación del acta, ...).
        return f"\\estacion{{{texto}}}"
    return f"\\textbf{{{texto}}}"


_ALINEACIONES = {"left", "center", "right"}  # lista blanca del attr align


def _celda(celda: dict) -> tuple[str, int, str, int]:
    """Contenido de una celda (párrafos unidos), su colspan, su alineación
    ('left'|'center'|'right', del menú contextual del editor) y su rowspan."""
    # Una celda admite lo mismo que el cuerpo (2026-10-01): varios párrafos
    # (separados con \\par), listas, negritas, enlaces y notas. Antes solo se
    # tomaban los párrafos y una lista dentro de una celda se perdía.
    partes = [
        _parrafo(h) if h.get("type") == "paragraph" else _bloque(h, "celda")
        for h in _hijos(celda)
    ]
    texto = "\\par ".join(p for p in partes if p.strip()).strip()
    attrs = celda.get("attrs", {}) or {}
    colspan = max(1, int(attrs.get("colspan") or 1))
    rowspan = max(1, int(attrs.get("rowspan") or 1))
    align = attrs.get("align") or "left"
    if align not in _ALINEACIONES:
        align = "left"
    return texto, colspan, align, rowspan


def _anchos_proporcionales(filas: list[dict], ncols: int) -> list[float]:
    """Fracción del ancho para cada columna según su CONTENIDO real (2026-10-01:
    en «Efecto de la vigencia» la columna «Resultado» necesitaba más que «Norma»).
    Peso = largo medio del texto de la columna, sin bajar de la palabra más
    larga (que no debe partirse) ni de un mínimo; luego se reparte el 100 %."""
    largos: list[list[int]] = [[] for _ in range(ncols)]
    palabra: list[int] = [0] * ncols
    for f in filas:
        j = 0
        for c in _hijos(f):
            span = int((c.get("attrs") or {}).get("colspan") or 1)
            if span == 1 and j < ncols:
                texto = _solo_texto(c)
                largos[j].append(len(texto))
                palabra[j] = max([palabra[j], *(len(w) for w in texto.split())])
            j += span
    pesos = []
    for j in range(ncols):
        medio = sum(largos[j]) / len(largos[j]) if largos[j] else 10
        # Raíz cuadrada: una columna con el triple de texto no necesita el
        # triple de ancho (gana alto); así las cortas no se aplastan.
        pesos.append(max(medio, palabra[j] * 1.6, 8) ** 0.5)
    total = sum(pesos)
    fr = [p / total for p in pesos]
    # Ninguna columna por debajo de la mitad del reparto igual.
    minimo = 0.5 / ncols
    fr = [max(x, minimo) for x in fr]
    s = sum(fr)
    return [x / s for x in fr]


# Clases cuyas tablas reparten el ancho según el contenido y alinean el
# texto a la izquierda (justificar en columnas estrechas abría huecos).
_TABLA_PROPORCIONAL = {"proyecto-de-ley"}


def _tabla(nodo: dict, tamano: str = "\\small", proporcional: bool = False) -> str:
    """Tabla del editor (pegada de Word/Excel) -> longtable del
    framework (booktabs). SIEMPRE a todo el ancho del texto (columnas
    p{} que reparten \\linewidth de extremo a extremo) y parte entre
    páginas. `tamano` = comando de tamaño de letra de la tabla
    (fmt_tabla_tamano del panel Formato)."""
    filas = [f for f in _hijos(nodo) if f.get("type") == "tableRow"]
    if not filas:
        return ""

    def ancho(f: dict) -> int:
        return sum(
            int(c.get("attrs", {}).get("colspan") or 1) for c in _hijos(f)
        )

    ncols = max((ancho(f) for f in filas), default=1) or 1
    primera = _hijos(filas[0])
    es_encabezado = bool(primera) and all(
        c.get("type") == "tableHeader" for c in primera
    )

    # Ancho de columna: uniforme, o según el contenido (la tabla SIEMPRE va de
    # extremo a extremo: las fracciones suman 1).
    ancho_col = rf"\dimexpr\linewidth/{ncols} - 2\tabcolsep\relax"
    fracciones = _anchos_proporcionales(filas, ncols) if proporcional and ncols > 1 else None
    # Alineación por celda DENTRO de la columna p{} (cada celda de tabular
    # es un grupo, así \centering/\raggedleft no se escapan): no requiere
    # el paquete array ni cambia el ancho de extremo a extremo.
    _ALINEA_CELDA = {"center": r"\centering", "right": r"\raggedleft"}

    # Celdas combinadas en vertical (rowspan, 2026-10-05): en el JSON las filas
    # siguientes OMITEN la celda tapada; LaTeX necesita una celda vacía en su
    # lugar. `tapadas` = columna -> filas que aún tapa.
    tapadas: dict[int, int] = {}

    def render(f: dict, negrita: bool = False) -> str:
        celdas = []
        en_esta = {k for k, v in tapadas.items() if v > 0}
        j = 0

        def saltar_tapadas() -> None:
            nonlocal j
            while j in en_esta:
                celdas.append("")
                j += 1

        for c in _hijos(f):
            saltar_tapadas()
            texto, colspan, align, rowspan = _celda(c)
            # Una celda que empieza con «[» tras el «\\» de la fila anterior se
            # leía como \\[espacio] y abortaba la compilación (hallado con el
            # cuadro comparativo, 2026-10-01: «[Pegue aquí el texto vigente]»).
            if texto.startswith("["):
                texto = "{}" + texto
            if negrita and texto:
                texto = rf"{{\fuentedatossemi {texto}}}"
            if rowspan > 1:
                # \multirow{n}{=}: el ancho de la columna p{} (multirow 2.x).
                texto = rf"\multirow{{{rowspan}}}{{=}}{{{texto}}}"
                for k in range(j, j + colspan):
                    tapadas[k] = rowspan - 1
            j += colspan
            if colspan > 1:
                letra = {"center": "c", "right": "r"}.get(align, "l")
                celdas.append(rf"\multicolumn{{{colspan}}}{{{letra}}}{{{texto}}}")
            elif align in _ALINEA_CELDA and texto:
                celdas.append(rf"{{{_ALINEA_CELDA[align]} {texto}\par}}")
            elif proporcional and texto:
                # En bandera (izquierda), con guiones: sin los huecos que deja
                # justificar una columna estrecha.
                celdas.append(rf"{{\raggedright\hyphenpenalty=50 {texto}\par}}")
            else:
                celdas.append(texto)
        saltar_tapadas()
        for k in en_esta:
            tapadas[k] -= 1
        return " & ".join(celdas) + r" \\"

    col = rf"p{{{ancho_col}}}"
    if fracciones:
        cols = [rf"p{{\dimexpr {x:.3f}\linewidth - 2\tabcolsep\relax}}" for x in fracciones]
        # Las columnas no llevan \tabcolsep en los bordes (@{}): se reparte.
        spec = "@{} " + " ".join(cols) + " @{}"
    else:
        spec = "@{} " + " ".join([col] * ncols) + " @{}"
    out = [f"{{{tamano}", rf"\begin{{longtable}}{{{spec}}}", r"\toprule"]
    cuerpo_desde = 0
    if es_encabezado:
        out += [render(filas[0], negrita=True), r"\midrule", r"\endhead"]
        cuerpo_desde = 1
    for i, f in enumerate(filas[cuerpo_desde:]):
        # Tablas por contenido: un poco de aire entre filas (con celdas de
        # varias líneas, sin él las filas se pegaban).
        if proporcional and i:
            out.append(r"\addlinespace[3pt]")
        out.append(render(f))
    out += [r"\bottomrule", r"\end{longtable}}"]
    # Cuadro con rótulo (2026-10-05): «CUADRO — N° n» y su título encima, la
    # fuente debajo; mismo estilo que la fotografía (partes-comunes.tex). El
    # contador lo declara con_paquetes() solo si hay cuadros.
    attrs = nodo.get("attrs") or {}
    titulo = escapar(" ".join(str(attrs.get("titulo") or "").split()))
    fuente = _texto_con_urls(" ".join(str(attrs.get("fuente") or "").split()))
    if titulo or fuente:
        rotulo = (
            r"\par\medskip\begingroup\centering\refstepcounter{cuadrosgdp}"
            r"{\color{franjacongreso}\bfseries CUADRO — N° \thecuadrosgdp}\par"
            + (rf"{{\color{{franjacongreso}}\itshape {titulo}}}\par" if titulo else "")
            + r"\endgroup\nopagebreak\smallskip"
        )
        pie = rf"{{\footnotesize\noindent Fuente: {fuente}\par}}\medskip" if fuente else r"\medskip"
        out = [rotulo, *out, pie]
    return "\n".join(out)


# Sangría por párrafo (tecla Tab del editor): nivel 0..6 en pasos de
# 0.75 cm, con tres modos. Los valores vienen ACOTADOS aquí (lista blanca:
# entero pequeño y modo conocido), así que no abren inyección.
_PASO_SANGRIA_CM = 0.75
_MODOS_SANGRIA = {"completa", "primera", "francesa"}


def _con_sangria(nodo: dict, contenido: str) -> str:
    attrs = nodo.get("attrs") or {}
    try:
        nivel = int(attrs.get("sangria") or 0)
    except (TypeError, ValueError):
        nivel = 0
    nivel = max(0, min(6, nivel))
    modo = attrs.get("sangriaTipo") or "completa"
    if nivel == 0 or modo not in _MODOS_SANGRIA or not contenido.strip():
        return contenido
    cm = f"{nivel * _PASO_SANGRIA_CM:.2f}cm"
    if modo == "primera":
        # Sangría extra SOLO en la primera línea.
        return f"{{\\setlength{{\\parindent}}{{{cm}}}{contenido}\\par}}"
    if modo == "francesa":
        # Primera línea al margen; las siguientes, adentro (colgante).
        return f"{{\\hangindent={cm}\\hangafter=1 {contenido}\\par}}"
    # completa: todo el bloque corrido a la derecha, primera línea incluida.
    return (
        f"{{\\setlength{{\\leftskip}}{{{cm}}}\\noindent {contenido}\\par}}"
    )


# Alineación de párrafo (botones del editor; lista blanca). Justificado es el
# valor por omisión del documento: no emite nada.
_ALINEA_PARRAFO = {"left": r"\raggedright", "center": r"\centering", "right": r"\raggedleft"}


def _alineado(nodo: dict, contenido: str) -> str:
    align = (nodo.get("attrs") or {}).get("textAlign")
    if align in _ALINEA_PARRAFO and contenido.strip():
        return f"{{{_ALINEA_PARRAFO[align]} {contenido}\\par}}"
    return contenido


# Fotografía subida desde el editor (2026-10-05): el archivo vive en la carpeta
# `imagenes/` del proyecto y quien compone lo copia junto al maestro; aquí solo
# se acepta el nombre que el servidor le dio (hash + extensión), nunca una ruta.
RE_ARCHIVO_IMAGEN = re.compile(r"^[0-9a-f]{16,64}\.(?:jpg|png)$")


def fotografia(nodo: dict) -> str:
    """Nodo `fotografia` → \\fotografia{imagenes/<archivo>}{<ancho>}{<título>}{<fuente>}.
    El rótulo «FOTOGRAFÍA — N° n» lo numera la clase; la fuente va a nota al pie."""
    attrs = nodo.get("attrs") or {}
    archivo = str(attrs.get("archivo") or "")
    if not RE_ARCHIVO_IMAGEN.match(archivo):
        return ""
    try:
        ancho = min(max(float(attrs.get("ancho") or 0.8), 0.3), 1.0)
    except (TypeError, ValueError):
        ancho = 0.8
    titulo = escapar(" ".join(str(attrs.get("titulo") or "").split()))
    fuente = _texto_con_urls(" ".join(str(attrs.get("fuente") or "").split()))
    return f"\\fotografia{{imagenes/{archivo}}}{{{ancho:.2f}}}{{{titulo}}}{{{fuente}}}"


def _bloque(nodo: dict, clase: str, tabla_tamano: str = "\\small") -> str:
    tipo = nodo.get("type")
    if tipo == "fotografia":
        return fotografia(nodo)
    if tipo == "paragraph":
        return _alineado(nodo, _con_sangria(nodo, _parrafo(nodo)))
    if tipo == "saltoPagina":
        # Salto de página pedido en el editor (2026-10-01).
        return r"\clearpage"
    if tipo == "heading":
        return _encabezado(nodo, clase)
    if tipo == "bulletList":
        return _lista(nodo, "itemize", clase, tabla_tamano)
    if tipo == "orderedList":
        return _lista(nodo, "enumerate", clase, tabla_tamano)
    if tipo == "table":
        return _tabla(nodo, tabla_tamano, proporcional=clase in _TABLA_PROPORCIONAL)
    # Bloque desconocido (p. ej. imagen pegada de Word): se rescata su
    # texto interno; si no tiene, se OMITE sin abortar la compilación.
    return _solo_texto(nodo)


def cuerpo_a_latex(
    documento_json: dict, clase: str = "oficio", tabla_tamano: str = "\\small"
) -> str:
    """Convierte el documento TipTap completo a LaTeX del cuerpo. La
    CLASE decide cómo se traducen ciertos nodos (p. ej. encabezados);
    `tabla_tamano` fija la letra de las tablas (fmt_tabla_tamano)."""
    if not documento_json or documento_json.get("type") != "doc":
        return ""
    marca = _NOTA_N.set(0)
    try:
        bloques = [_bloque(n, clase, tabla_tamano) for n in _hijos(documento_json)]
    finally:
        _NOTA_N.reset(marca)
    return "\n\n".join(b for b in bloques if b.strip())


# Paquetes que una marca o una tabla del cuerpo necesita y que el marco no
# carga (2026-10-05). Se añaden al .tex generado SOLO si se usan, antes de
# \begin{document}: el marco no se toca y el resto de documentos no cambia.
_PAQUETES = (
    ("\\sout{", "\\usepackage[normalem]{ulem}"),
    ("\\uline{", "\\usepackage[normalem]{ulem}"),
    ("\\multirow{", "\\usepackage{multirow}"),
    ("{cuadrosgdp}", "\\newcounter{cuadrosgdp}"),
    ("\\needspace{", "\\usepackage{needspace}"),
)


def con_paquetes(tex: str) -> str:
    faltan = [paquete for uso, paquete in _PAQUETES if uso in tex and paquete not in tex]
    if not faltan or "\\begin{document}" not in tex:
        return tex
    return tex.replace("\\begin{document}", "\n".join(faltan) + "\n\\begin{document}", 1)

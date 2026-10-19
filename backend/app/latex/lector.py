"""Lector LaTeX -> JSON de TipTap (el inverso del serializador, para los
casos comunes de los documentos heredados).

Sirve para CONVERTIR un documento del archivo (hecho a mano) en un
documento editable de la plataforma: extrae el cuerpo de su .tex y lo
traduce a los nodos que el editor entiende (párrafos, listas, tabla,
negrita/cursiva/enlace). Lo que no reconoce se degrada a texto plano,
nunca falla.
"""

import re

# --- limpieza de inline LaTeX a texto -------------------------------

_SUSTITUCIONES = [
    (r"``", "“"), (r"''", "”"),      # comillas latex -> tipográficas
    (r"~", " "), (r"\\,", " "), (r"\\ ", " "),  # espacios
    (r"\\&", "&"), (r"\\%", "%"), (r"\\#", "#"),
    (r"\\_", "_"), (r"\\\$", "$"),
    (r"\\textasciitilde\{\}", "~"),
]


def _limpiar_texto(s: str) -> str:
    for patron, rep in _SUSTITUCIONES:
        s = re.sub(patron, rep, s)
    # Quitar \begin{...}/\end{...} y comandos sueltos del framework
    # (\fuentedatossemi, \small, \centering…) que no aportan texto.
    s = re.sub(r"\\(begin|end)\{[^}]*\}", " ", s)
    s = re.sub(r"\\[a-zA-Z]+\*?", " ", s)
    s = s.replace("{", " ").replace("}", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _nodo_texto(texto: str, marcas: list[dict] | None = None) -> dict:
    n = {"type": "text", "text": texto}
    if marcas:
        n["marks"] = marcas
    return n


def _conserva(n: dict) -> bool:
    """¿Vale la pena conservar este nodo inline? Texto con contenido, texto
    con marcas, o un nodo atómico como la nota al pie (que no tiene texto
    propio pero sí debe sobrevivir)."""
    return bool(
        n.get("text", "").strip() or n.get("marks") or n.get("type") == "footnote"
    )


def _inline(s: str) -> list[dict]:
    """Convierte una porción inline con \\textbf, \\emph/\\textit y \\url
    en una lista de nodos de texto TipTap con marcas."""
    nodos: list[dict] = []
    i = 0
    patron = re.compile(r"\\(textbf|emph|textit|underline|url|href|footnote)\b")
    while i < len(s):
        m = patron.search(s, i)
        if not m:
            resto = _limpiar_texto(s[i:])
            if resto:
                nodos.append(_nodo_texto(resto))
            break
        antes = _limpiar_texto(s[i:m.start()])
        if antes:
            nodos.append(_nodo_texto(antes))
        cmd = m.group(1)
        j = m.end()
        if cmd == "href":
            url, j = _grupo(s, j)          # primer argumento: destino
            texto, j = _grupo(s, j)        # segundo: texto visible
            nodos.append(_nodo_texto(
                _limpiar_texto(texto) or url,
                [{"type": "link", "attrs": {"href": _limpiar_texto(url)}}],
            ))
        elif cmd == "url":
            url, j = _grupo(s, j)
            u = _limpiar_texto(url)
            nodos.append(_nodo_texto(u, [{"type": "link", "attrs": {"href": u}}]))
        elif cmd == "footnote":
            # \footnote{...} -> nodo de nota al pie (inverso del serializador).
            contenido, j = _grupo(s, j)
            nodos.append({
                "type": "footnote",
                "attrs": {"texto": _limpiar_texto(contenido)},
            })
        else:
            contenido, j = _grupo(s, j)
            marca = {"textbf": "bold", "emph": "italic",
                     "textit": "italic", "underline": "underline"}[cmd]
            # el contenido puede tener más inline anidado
            for sub in _inline(contenido):
                sub.setdefault("marks", []).append({"type": marca})
                nodos.append(sub)
        i = j
    return nodos or [_nodo_texto("")]


def _grupo(s: str, i: int) -> tuple[str, int]:
    """Lee un grupo {...} a partir de i (que apunta justo antes de '{');
    devuelve el contenido y el índice tras el '}' de cierre."""
    while i < len(s) and s[i] != "{":
        i += 1
    if i >= len(s):
        return "", i
    prof, ini = 0, i
    while i < len(s):
        if s[i] == "{":
            prof += 1
        elif s[i] == "}":
            prof -= 1
            if prof == 0:
                return s[ini + 1:i], i + 1
        i += 1
    return s[ini + 1:], i


def _parrafo(texto: str) -> dict | None:
    contenido = [n for n in _inline(texto) if _conserva(n)]
    if not contenido:
        return None
    return {"type": "paragraph", "content": contenido}


def _items(entorno_texto: str) -> list[dict]:
    """Divide el contenido de itemize/enumerate en listItem por \\item."""
    partes = re.split(r"\\item\b", entorno_texto)
    items = []
    for p in partes:
        if not p.strip():
            continue
        contenido = _inline(p)
        contenido = [n for n in contenido if _conserva(n)]
        if contenido:
            items.append({
                "type": "listItem",
                "content": [{"type": "paragraph", "content": contenido}],
            })
    return items


def _tabla(cuerpo_tabla: str) -> dict | None:
    """Convierte las filas de un longtable (separadas por \\\\, celdas por
    &) en una tabla de TipTap. Ignora \\toprule/\\midrule/\\endhead, etc."""
    cuerpo_tabla = re.sub(r"\\(toprule|midrule|bottomrule|endhead|endfirsthead|endfoot|endlastfoot)\b", "", cuerpo_tabla)
    filas = []
    firma_anterior = None
    for linea in cuerpo_tabla.split(r"\\"):
        celdas_txt = [c for c in linea.split("&")]
        if not any(c.strip() for c in celdas_txt):
            continue
        celdas, firma = [], []
        for c in celdas_txt:
            contenido = _inline(c)
            contenido = [n for n in contenido if _conserva(n)] or [_nodo_texto("")]
            firma.append("".join(n.get("text", "") for n in contenido))
            celdas.append({
                "type": "tableCell",
                "content": [{"type": "paragraph", "content": contenido}],
            })
        # El longtable repite el encabezado (\endfirsthead + \endhead):
        # descartar una fila idéntica consecutiva.
        if firma == firma_anterior:
            continue
        firma_anterior = firma
        filas.append({"type": "tableRow", "content": celdas})
    return {"type": "table", "content": filas} if filas else None


_ENTORNO = re.compile(r"\\begin\{(itemize|enumerate|longtable)\}(.*?)\\end\{\1\}", re.S)


def _cuerpo_region(tex: str, clase: str) -> str:
    """Aísla el cuerpo del documento: entre el encabezado estructural y
    \\atentamente."""
    # Fin del cuerpo.
    fin = tex.find(r"\atentamente")
    if fin == -1:
        fin = len(tex)
    cuerpo = tex[:fin]
    # Inicio del cuerpo según la clase.
    if clase == "oficio":
        m = re.search(r"\\saludo(\[[^\]]*\])?", cuerpo)
        if m:
            cuerpo = cuerpo[m.end():]
    else:  # memorando / informe: tras la cabecera de 3 grupos
        cmd = "cabeceramemo" if clase == "memorando" else "cabecerainforme"
        m = re.search(r"\\" + cmd, cuerpo)
        if m:
            k = m.end()
            for _ in range(3):
                _, k = _grupo(cuerpo, k)
            cuerpo = cuerpo[k:]
    return cuerpo


def tex_a_tiptap(tex: str, clase: str = "oficio") -> dict:
    """Cuerpo de un .tex heredado -> documento TipTap editable."""
    region = _cuerpo_region(tex, clase)
    bloques: list[dict] = []

    pos = 0
    for m in _ENTORNO.finditer(region):
        # Texto antes del entorno -> párrafos (separados por línea en blanco).
        previo = region[pos:m.start()]
        for trozo in re.split(r"\n\s*\n", previo):
            # También tratar \seccion{...} como encabezado.
            for sm in re.finditer(r"\\seccion\{", trozo):
                pass
            p = _seccion_o_parrafo(trozo)
            if p:
                bloques.append(p)
        env, contenido = m.group(1), m.group(2)
        if env == "itemize":
            items = _items(contenido)
            if items:
                bloques.append({"type": "bulletList", "content": items})
        elif env == "enumerate":
            items = _items(contenido)
            if items:
                bloques.append({"type": "orderedList", "content": items})
        elif env == "longtable":
            # Descartar la especificación de columnas {@{} r p{..} ..}
            # (con llaves anidadas) que sigue a \begin{longtable}.
            contenido = contenido.lstrip()
            if contenido.startswith("{"):
                _, k = _grupo(contenido, 0)
                contenido = contenido[k:]
            t = _tabla(contenido)
            if t:
                bloques.append(t)
        pos = m.end()

    # Texto tras el último entorno.
    for trozo in re.split(r"\n\s*\n", region[pos:]):
        p = _seccion_o_parrafo(trozo)
        if p:
            bloques.append(p)

    if not bloques:
        bloques = [{"type": "paragraph"}]
    return {"type": "doc", "content": bloques}


def _seccion_o_parrafo(trozo: str) -> dict | None:
    """Un \\seccion{...} se vuelve encabezado; lo demás, párrafo."""
    ms = re.search(r"\\seccion\{", trozo)
    if ms:
        titulo, _ = _grupo(trozo, ms.end() - 1)
        return {
            "type": "heading",
            "attrs": {"level": 2},
            "content": [_nodo_texto(_limpiar_texto(titulo))],
        }
    # Quitar comandos estructurales sueltos que no aportan texto.
    limpio = re.sub(r"\\(confolio|sinfolio|vfill|par|noindent|centering)\b", " ", trozo)
    return _parrafo(limpio)


# =====================================================================
#  Conversión de heredados: extraer su formato y ver si es convertible.
# =====================================================================

def _arg_de(tex: str, comando: str) -> str | None:
    """Argumento {...} de la primera aparición de \\comando (o None)."""
    m = re.search(r"\\" + re.escape(comando) + r"\s*\{", tex)
    if not m:
        return None
    contenido, _ = _grupo(tex, m.end() - 1)
    return contenido.strip()


def _tamano_de_comando(cmd: str) -> str:
    """«\\fontsize{9}{10.8}\\selectfont» → «9»; «\\small» → «pequeno»."""
    m = re.search(r"\\fontsize\{\s*([\d.]+)\s*\}", cmd)
    if m:
        return m.group(1).rstrip("0").rstrip(".") if "." in m.group(1) else m.group(1)
    return {"\\small": "pequeno", "\\footnotesize": "muy-pequeno"}.get(cmd.strip(), "")


def extraer_formato(tex: str) -> dict:
    """Del .tex de un documento heredado, extrae los ajustes de formato
    como campos fmt_* (para conservarlos al convertirlo a editable). Solo
    lee lo que reconoce; el generador vuelve a validar cada valor."""
    fmt: dict[str, str] = {}
    m = re.search(r"\\documentclass\s*\[\s*(1[02])pt", tex)  # [10pt]/[12pt]
    if m:
        fmt["fmt_tamano"] = m.group(1)
    for comando, clave in (
        ("setinterlineado", "fmt_interlineado"),
        ("setespacioparrafos", "fmt_espacioparrafos"),
        ("setsangriaparrafo", "fmt_sangria"),
        ("setinterlineadodest", "fmt_dest_interlineado"),
        ("setinterlineadocopia", "fmt_copia_interlineado"),
        ("setselloajuste", "fmt_sello_altura"),
    ):
        val = _arg_de(tex, comando)
        if val:
            fmt[clave] = val
    for comando, clave in (
        ("settamdestinatario", "fmt_dest_tamano"),
        ("settamcopia", "fmt_copia_tamano"),
    ):
        val = _arg_de(tex, comando)
        if val:
            fmt[clave] = _tamano_de_comando(val)
    if re.search(r"\\setmeta\{sello\}\{no\}", tex):
        fmt["fmt_sello"] = "no"
    elif "\\selloalfondo" in tex:
        fmt["fmt_sello"] = "fondo"
    if "\\sinfolio" in tex:
        fmt["fmt_folio"] = "no"
    elif "\\confolio" in tex:
        fmt["fmt_folio"] = "si"
    # Firma que SIGUE al texto: el generador solo emite «\vfill» antes de
    # \bloquefirma cuando la firma va anclada al pie (desde 2026-09-07 el
    # \selloalfondo va SIEMPRE, así que ya no sirve de señal).
    if "\\bloquefirma" in tex and not re.search(r"\\vfill\s*\n\s*\\bloquefirma", tex):
        fmt["fmt_multipagina"] = "si"
    return {k: v for k, v in fmt.items() if v}


def motivos_no_convertible(tex: str) -> list[str]:
    """Razones por las que un heredado NO se puede convertir a editable sin
    perder fidelidad. Lista vacía = se puede convertir con seguridad."""
    motivos: list[str] = []
    if "\\includegraphics" in tex:
        motivos.append(
            "tiene anexos escaneados incrustados (imágenes) que el editor aún no maneja"
        )
    if "Con copia a:" in tex:
        motivos.append(
            "tiene un bloque «Con copia a:» compuesto a mano en el destinatario"
        )
    return motivos

"""PROYECTO DE LEY: de las partes estructuradas del proyecto al .tex del marco.

Piloto de la plataforma (2026-10-01; Edison: «datos estructurados → partes →
plantilla LaTeX → compilación → PDF»; la fuente sigue estructurada y el PDF es
un producto). Separa CONTENIDO (las partes, TipTap JSON), DATOS (la ficha del
proyecto), PLANTILLA (la clase `proyecto-de-ley` del marco y su esquema) y
GENERACIÓN (este módulo + build.sh).

Reglas que este módulo hace cumplir, no el usuario:
  · el ORDEN de las piezas es el del esquema oficial (Reglamento y Manual de
    Técnica Legislativa): finales → transitorias → modificatorias →
    derogatorias, aunque el texto de origen las traiga en otro orden;
  · los rótulos los pone la plantilla: un título repetido al comienzo de una
    parte («II. EFECTO DE LA VIGENCIA…») se omite;
  · «Artículo N.- Epígrafe» y «PRIMERA. - Epígrafe» se vuelven \\articulo y
    \\disposicion; los demás títulos, \\apartadolegislativo (I.1, I.7.1);
  · el texto citado de otra norma (un `blockquote` del editor) va sangrado en
    `textocitado`, y sus «“Artículo…» no se confunden con los propios;
  · un párrafo que empieza por su marca de inciso («a)», «1.», «i)», «–») es
    un inciso con sangría completa (\\itemlegislativo), aunque venga como
    párrafo suelto del texto importado;
  · la exposición de motivos se numera como la numera el TEXTO: el número de
    cada sección sale de sus apartados («III.1» → III) y una parte que vive
    dentro de otra sección («I.17. Antecedentes…») se rotula como apartado.
Puro (sin base de datos): pruebas en tests/test_proyecto_ley.py.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date

from app.latex.generador import fecha_en_espanol
from app.latex.serializador import _bloque, _parrafo, con_paquetes, escapar
from app.servicios import comparativo as cuadro

CLASE = "proyecto-de-ley"

# Orden del esquema `proyecto-de-ley` (escritura/esquemas/): no se altera.
FORMULA = ["preliminar", "sustantiva", "dcf", "dct", "dcm", "dcd"]
EXPOSICION = ["fundamentos", "antecedentes", "efecto", "costo-beneficio", "ambiental", "agenda"]
BLOQUE = {"dcf": "finales", "dct": "transitorias", "dcm": "modificatorias", "dcd": "derogatorias"}
SINGULAR = {"finales": "final", "transitorias": "transitoria", "modificatorias": "modificatoria", "derogatorias": "derogatoria"}

# Guion o raya tras el número («Artículo 1.-», «SEGUNDA. –»).
RE_ARTICULO = re.compile(r"^Art[ií]culo\s+(\d+[A-Za-z]*)\s*\.?\s*[-–]?\s*(.*)$")
RE_DISPOSICION = re.compile(
    r"^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[EÉ]PTIMA|OCTAVA|NOVENA|D[EÉ]CIMA|UND[EÉ]CIMA|DUOD[EÉ]CIMA|DECIMO\w+|VIG[EÉ]SIMA|[ÚU]NICA)\s*\.?\s*[-–]?\s*(.*)$",
    re.IGNORECASE,
)


def _plano(nodo: dict) -> str:
    partes: list[str] = []

    def rec(n: dict) -> None:
        if n.get("type") == "text":
            partes.append(n.get("text", ""))
        for h in n.get("content", []) or []:
            rec(h)

    rec(nodo)
    return "".join(partes).strip()


def _clave_titulo(t: str) -> str:
    t = re.sub(r"^[IVX]+(\.\d+)*\.?\s*", "", t.strip())
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z ]", "", t).strip()


def _sin_titulo_repetido(nodos: list[dict], titulo: str) -> list[dict]:
    """Quita un título inicial que repite el de la parte (lo pone la plantilla)."""
    if not nodos or nodos[0].get("type") != "heading":
        return nodos
    primero = _clave_titulo(_plano(nodos[0]))
    propio = _clave_titulo(titulo)
    if primero.startswith("DISPOSICI") or primero[:16] == propio[:16]:
        return nodos[1:]
    return nodos


def _nodos(seccion: dict) -> list[dict]:
    return (seccion.get("contenido") or {}).get("content", []) or []


# «Lima, 15 de septiembre de 2026»: lugar y fecha de cierre. Los pone la
# plantilla (con la fecha de presentación), como los rótulos: si una parte
# importada termina con ella, se omite para no repetirla (hallado en el piloto).
RE_LUGAR_FECHA = re.compile(r"^[A-ZÁÉÍÓÚ][\wáéíóúñ .]{1,40},\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+del?\s+\d{4}\.?$")


def _sin_fecha_final(nodos: list[dict]) -> list[dict]:
    if nodos and nodos[-1].get("type") == "paragraph" and RE_LUGAR_FECHA.match(_plano(nodos[-1])):
        return nodos[:-1]
    return nodos


# Marca de inciso al comienzo de un párrafo: a) · iv) · 12) · 3. · – · •
# Nunca «5.1.» (numeral de una sección: no es inciso, va al margen).
RE_INCISO = re.compile(r"^((?:[a-zñ]|[ivxlc]{1,5}|\d{1,2})\)|\d{1,2}\.(?=\s)|[-–•])\s+")


def _sin_prefijo(nodo: dict, largo: int) -> dict:
    """Copia de un párrafo sin sus primeros `largo` caracteres de texto."""
    resto = largo
    hijos: list[dict] = []
    for h in nodo.get("content", []) or []:
        if resto > 0 and h.get("type") == "text":
            texto = h.get("text", "")
            if len(texto) <= resto:
                resto -= len(texto)
                continue
            h = {**h, "text": texto[resto:]}
            resto = 0
        hijos.append(h)
    return {**nodo, "content": hijos}


def _parrafo_o_inciso(nodo: dict) -> str:
    """Un párrafo; si empieza por su marca de inciso, \\itemlegislativo (marca
    al margen y todas sus líneas alineadas con el texto)."""
    if nodo.get("type") == "paragraph" and not (nodo.get("attrs") or {}).get("sangria"):
        m = RE_INCISO.match(_plano(nodo))
        if m and len(_plano(nodo)) > len(m.group(0)):
            cuerpo = _parrafo(_sin_prefijo(nodo, len(m.group(0))))
            return f"\\itemlegislativo{{{escapar(m.group(1))}}}{{{cuerpo}}}"
    return _bloque(nodo, CLASE)


# «TÍTULO I», «CAPÍTULO II», «SECCIÓN PRIMERA»: divisiones de la fórmula legal.
# Niveles de agrupación del Manual de Técnica Legislativa (3.ª ed., pp. 57-59):
# LIBRO y SECCIÓN con ordinales en letras (LIBRO PRIMERO, SECCIÓN SEGUNDA),
# TÍTULO y CAPÍTULO con romanos, SUBCAPÍTULO con arábigos.
_ORDINALES = r"PRIMER[OA]|SEGUND[OA]|TERCER[OA]|CUART[OA]|QUINT[OA]|SEXT[OA]|S[EÉ]PTIM[OA]|OCTAV[OA]|NOVEN[OA]|D[EÉ]CIM[OA]|[ÚU]NIC[OA]"
RE_DIVISION = re.compile(rf"^(LIBRO|T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|SUBCAP[ÍI]TULO)\s+([IVXLC]+|\d+|PRELIMINAR|{_ORDINALES})\b\.?\s*[-–.:]?\s*(.*)$", re.IGNORECASE)


# «I.10.1. Título»: numeral decimal de un apartado de la exposición.
RE_APARTADO = re.compile(r"^([IVX]+(?:\.\d+)+)\.?\s+(.+)$")
# «IV. INCIDENCIA AMBIENTAL»: rótulo de sección con su número romano.
RE_SECCION = re.compile(r"^([IVX]+)\.\s+\S")


def _apartado(nodo: dict) -> str:
    texto = _plano(nodo)
    m = RE_APARTADO.match(texto)
    if m:
        return f"\\apartadolegislativo[{m.group(1)}.]{{{escapar(m.group(2))}}}"
    return f"\\apartadolegislativo{{{_parrafo(nodo)}}}"


_ROMANOS = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def romano(n: int) -> str:
    salida = ""
    for valor, letra in _ROMANOS:
        while n >= valor:
            salida += letra
            n -= valor
    return salida


def entero_romano(r: str) -> int:
    valores = {"I": 1, "V": 5, "X": 10}
    total = 0
    for i, c in enumerate(r):
        v = valores[c]
        total += -v if i + 1 < len(r) and valores[r[i + 1]] > v else v
    return total


def cabecera_exposicion(titulo: str, nodos: list[dict], ultimo: int) -> tuple[str, list[dict], int]:
    """(\\cabeceraexplicita{…}, nodos sin el rótulo propio, número de la sección).

    El número lo da el texto: el rótulo romano con que empieza la parte
    («IV. INCIDENCIA AMBIENTAL»), o el de su primer apartado («III.1» → III).
    Si la parte empieza con un apartado de la sección en curso («I.17.
    Antecedentes…»), vive DENTRO de ella y se rotula como apartado. Sin
    pistas, la siguiente sección. El título es el de la parte (en mayúsculas y
    minúsculas): las mayúsculas del texto importado no se copian."""
    primero = _plano(nodos[0]) if nodos and nodos[0].get("type") == "heading" else ""
    m = RE_SECCION.match(primero)
    if m:
        n = entero_romano(m.group(1))
        return f"\\cabeceraexplicita{{\\seccionlegislativa[{romano(n)}]{{{escapar(titulo)}}}}}", nodos[1:], n
    a = RE_APARTADO.match(primero)
    if a and ultimo and entero_romano(a.group(1).split(".")[0]) == ultimo:
        return f"\\cabeceraexplicita{{{_apartado(nodos[0])}}}", nodos[1:], ultimo
    for nd in nodos:
        if nd.get("type") == "heading":
            a = RE_APARTADO.match(_plano(nd))
            if a:
                n = entero_romano(a.group(1).split(".")[0])
                if n > ultimo:
                    return f"\\cabeceraexplicita{{\\seccionlegislativa[{romano(n)}]{{{escapar(titulo)}}}}}", nodos, n
                break
    n = ultimo + 1
    return f"\\cabeceraexplicita{{\\seccionlegislativa[{romano(n)}]{{{escapar(titulo)}}}}}", nodos, n


def _cita(nodo: dict) -> str:
    """`blockquote` (texto citado de otra norma) → entorno `textocitado`:
    sangrado, con sus epígrafes tal cual (comillas incluidas)."""
    piezas: list[str] = []
    for h in nodo.get("content", []) or []:
        if h.get("type") == "heading":
            piezas.append(f"\\rubrocitado{{{_parrafo(h)}}}")
        else:
            b = _parrafo_o_inciso(h)
            if b.strip():
                piezas.append(b)
    return "\\begin{textocitado}\n" + "\n\n".join(piezas) + "\n\\end{textocitado}"


def grupo_de(seccion: dict) -> str:
    """El grupo de la parte: el que trae o, si no (partes de siempre), el que su clave indica."""
    g = seccion.get("grupo")
    if g:
        return g
    c = seccion.get("clave", "")
    if c == "titulo" or c in FORMULA:
        return "formula"
    return "final" if c == "comparativo" else "exposicion"


def parte_a_latex(clave: str, titulo: str, nodos: list[dict], grupo: str = "") -> str:
    # Una parte NUEVA de la fórmula legal (2026-10-19; clave propia, grupo «formula») lleva artículos
    # como la sustantiva; las disposiciones solo se reconocen en los cuatro bloques del esquema.
    formula = clave in FORMULA or grupo == "formula"
    salida: list[str] = []
    for n in _sin_fecha_final(_sin_titulo_repetido(nodos, titulo)):
        if n.get("type") == "blockquote":
            salida.append(_cita(n))
        elif n.get("type") == "heading":
            texto = _plano(n)
            m = RE_ARTICULO.match(texto) if formula else None
            d = RE_DISPOSICION.match(texto) if clave in BLOQUE else None
            v = RE_DIVISION.match(texto) if formula else None
            if v:
                # «TÍTULO I» y, si el texto la trae en el mismo renglón, su
                # denominación; si viene en el título siguiente, se le une.
                rotulo = f"{v.group(1).upper()} {v.group(2).upper()}"
                salida.append(f"\\divisionlegislativa{{{escapar(rotulo)}}}{{{escapar(v.group(3))}}}")
                continue
            if salida and salida[-1].startswith("\\divisionlegislativa{") and salida[-1].endswith("}{}") and not m and not d:
                # La denominación de la división, en su propio título.
                salida[-1] = salida[-1][:-2] + "{" + escapar(texto) + "}"
                continue
            if m:
                salida.append(f"\\articulo{{{escapar(m.group(1))}}}{{{escapar(m.group(2))}}}")
            elif d:
                salida.append(f"\\disposicion{{{escapar(d.group(1).capitalize())}}}{{{escapar(d.group(2))}}}")
            else:
                salida.append(_apartado(n))
        else:
            bloque = _parrafo_o_inciso(n)
            if bloque.strip():
                salida.append(bloque)
    return "\n\n".join(salida)


def _disposiciones(clave: str, nodos: list[dict]) -> int:
    return sum(
        1 for n in nodos if n.get("type") == "heading" and RE_DISPOSICION.match(_plano(n))
    )


def metadata(proyecto: dict) -> str:
    d = proyecto.get("datos") or {}
    autor = (d.get("autor") or "").split(",")[0].strip()
    lineas = [
        f"%% GENERADO por sgdp desde el proyecto {proyecto.get('codigo', '')} ({date.today().isoformat()}); no editar a mano",
        f"\\setmeta{{numero}}{{{escapar(proyecto.get('numero_oficial') or 'S/N')}}}",
        f"\\setmeta{{fecha}}{{{fecha_en_espanol(proyecto.get('fecha_presentacion') or None)}}}",
        f"\\setmeta{{grupo}}{{{escapar(d.get('grupo', ''))}}}",
        "\\setmeta{cargofirmante}{Diputado de la Rep\\'ublica}",
    ]
    if autor:
        lineas.append(f"\\setmeta{{firmante}}{{{escapar(autor)}}}")
    if d.get("decenio"):
        lineas.append(f"\\setmeta{{decenio}}{{{escapar(d['decenio'])}}}")
    if d.get("lugar"):
        lineas.append(f"\\setmeta{{lugar}}{{{escapar(d['lugar'])}}}")
    sumilla = re.sub(r"^LEY\s+", "", (proyecto.get("titulo") or "").strip(), flags=re.IGNORECASE)
    lineas.append(f"\\setmeta{{sumilla}}{{{escapar(sumilla[:80])}}}")
    return "\n".join(lineas) + "\n"


def titulo_de_la_ley(proyecto: dict, por: dict) -> str:
    """El texto de la parte «Título de la ley» (sin saltos) o el del proyecto."""
    parte = por.get("titulo")
    texto = " ".join(" ".join(_plano(n) for n in _nodos(parte)).split()) if parte else ""
    return texto or (proyecto.get("titulo") or "").strip()


def texto_proposicion(titulo: str) -> str:
    """Lo que sigue a «Proposición legislativa» en el rótulo de la primera hoja.
    «Ley que modifica…» → «que modifica…» (como el proyecto presentado); los
    demás títulos del Manual («Ley de…», «Ley Orgánica de…», «Resolución
    Legislativa que…») van enteros tras «de»: «Proposición legislativa de Ley
    Orgánica de…»."""
    if re.match(r"^LEY\s+QUE\b", titulo, flags=re.IGNORECASE):
        return re.sub(r"^LEY\s+", "", titulo, flags=re.IGNORECASE)
    return f"de {titulo}" if titulo else ""


RE_POR_COMPLETAR = re.compile(r"\[[^\]]{2,80}\]")


def _plan_formula(secciones: list[dict]) -> tuple[list[dict], bool]:
    """Las partes de la fórmula legal (sin el título) en el orden en que SALEN: las del esquema en el
    orden de la técnica legislativa (el esquema LaTeX lo exige y el Manual lo fija) y las nuevas
    (2026-10-19) donde el panel las puso: tras la parte fija que las precede. Devuelve también si el
    panel las traía en otro orden (se avisa)."""
    formula = [s for s in secciones if grupo_de(s) == "formula" and s["clave"] != "titulo"]
    fijas = [s["clave"] for s in formula if s["clave"] in FORMULA]
    desordenadas = fijas != sorted(fijas, key=FORMULA.index)
    rango: dict[str, float] = {}
    ultimo = -1.0
    for i, s in enumerate(formula):
        c = s["clave"]
        if c in FORMULA:
            ultimo = float(FORMULA.index(c))
            rango[c] = ultimo
        else:
            rango[c] = ultimo + 0.5
    return sorted(formula, key=lambda s: (rango[s["clave"]], formula.index(s))), desordenadas


def maestro(proyecto: dict, secciones: list[dict]) -> tuple[str, list[str]]:
    """(.tex maestro, avisos). `secciones`: [{clave, titulo, contenido[, grupo, obligatoria]}], en el
    ORDEN DEL PROYECTO (2026-10-19: las partes se añaden, quitan y reordenan por proyecto). La
    exposición de motivos y las partes nuevas salen en ese orden; la fórmula legal, en el de la
    técnica legislativa (`_plan_formula`). El esquema LaTeX solo admite sus marcadores
    ``\\componente{clave}`` hacia adelante: una parte del esquema que el panel puso antes que otra ya
    abierta se compone con su cabecera explícita y sin marcador, y el proyecto se declara «en
    avance» para que el esquema no exija lo que no se marcó. Una parte nueva (clave propia) nunca
    lleva marcador: el esquema no la contempla; su texto va bajo la parte que la precede."""
    por = {s["clave"]: s for s in secciones}
    llenas = {c for c, s in por.items() if _nodos(s)}
    avisos: list[str] = []
    # La estructura base del editor trae textos «[entre corchetes]» para
    # completar: se avisa cuáles partes los conservan.
    pendientes = [s["titulo"] for s in secciones if RE_POR_COMPLETAR.search(" ".join(_plano(n) for n in _nodos(s)))]
    if pendientes:
        avisos.append("Quedan textos por completar [entre corchetes] en: " + ", ".join(pendientes) + ".")
    d = proyecto.get("datos") or {}
    # El título de la ley es UNO: la parte «Título de la ley» si tiene texto
    # (es lo que se edita) y, si no, el título con que se creó el proyecto.
    titulo = titulo_de_la_ley(proyecto, por)
    autor = (d.get("autor") or "").split(",")[0].strip()
    base = d.get("base_legal_texto") or (
        "el artículo 107 de la Constitución Política del Perú y los artículos 98 y 107 "
        "del Reglamento de la Cámara de Diputados"
    )
    t: list[str] = [
        f"%% GENERADO por sgdp desde el proyecto {proyecto.get('codigo', '')} ({date.today().isoformat()}); no editar a mano",
        f"\\documentclass{{{CLASE}}}",
        "\\input{metadata.tex}",
        # Forma de la Cámara de Diputados: «Artículo 1.-» y «PRIMERA. -» (primer
        # proyecto) o «PRIMERA.-» (segundo): la ficha puede fijar cada uno.
        f"\\setseparadorarticulo{{{escapar(d.get('separador_articulo') or '.-')}\\ }}",
        f"\\setseparadordisposicion{{{escapar(d.get('separador_disposicion') or '. -')}\\ }}",
    ]
    formula, desordenada = _plan_formula(secciones)
    if desordenada:
        avisos.append("La fórmula legal se compuso en el orden de la técnica legislativa (título preliminar, parte "
                      "sustantiva, disposiciones finales, transitorias, modificatorias y derogatorias), no en el del panel.")
    # La exposición en el orden del panel; marcadores del esquema solo hacia adelante.
    exposicion = [s for s in secciones if grupo_de(s) == "exposicion" and s["clave"] in llenas]
    marcadas = [EXPOSICION.index(s["clave"]) for s in exposicion if s["clave"] in EXPOSICION]
    marcadores_saltados = marcadas != sorted(marcadas)
    finales = [s for s in secciones if grupo_de(s) == "final" and s["clave"] in llenas and s["clave"] != "comparativo"]
    # Un proyecto en avance (sin exposición de motivos todavía) se compone
    # igual: el marco avisa en vez de detenerse; aquí se listan las partes.
    # El esquema del marco exige fundamentos, antecedentes, efecto y costo-beneficio:
    # con cualquiera vacía (o sin su marcador, por el orden del panel) se compone igual
    # (\\proyectoenavance avisa en el log).
    if marcadores_saltados or any(c not in llenas for c in ("fundamentos", "antecedentes", "efecto", "costo-beneficio")):
        t.append("\\proyectoenavance")
    if not exposicion:
        avisos.append("La exposición de motivos está vacía: el Reglamento la exige (fundamentos, efecto de la "
                      "vigencia y análisis costo-beneficio, o lo que corresponda al tipo de proyecto).")
    for cond in ("ambiental", "agenda"):
        if cond in llenas:
            t.append(f"\\esquemacondicion{{{cond}}}")
    if "comparativo" in llenas:
        t.append("\\esquemacondicion{modificatoria}")
        faltan = cuadro.pendientes(por["comparativo"].get("contenido"))
        if faltan:
            avisos.append(
                f"Cuadro comparativo: falta pegar el texto vigente de {faltan} "
                f"artículo{'s' if faltan > 1 else ''} modificado{'s' if faltan > 1 else ''}."
            )
    elif "dcm" in llenas:
        avisos.append(
            "Modifica normas vigentes y no tiene cuadro comparativo: el Manual de Técnica "
            "Legislativa lo recomienda (parte «Cuadro comparativo»)."
        )
    t += ["\\begin{document}", ""]
    t.append(f"\\proposicionlegislativa{{{escapar(texto_proposicion(titulo))}}}")
    t += [
        "\\componente{presentacion}",
        f"\\noindent El Diputado de la Rep\\'ublica que suscribe, \\textbf{{{escapar(autor.upper())}}}, "
        f"integrante del {escapar(d.get('grupo', ''))}, en ejercicio del derecho de iniciativa legislativa "
        f"que le confiere {escapar(base)}, presenta la siguiente proposici\\'on legislativa:",
        "",
        "\\componente{titulo}",
        "\\rotulolegislativo{F\\'ormula legal}",
        f"\\titulodelaley{{{escapar(titulo)}}}",
        "",
        "\\componente{formula}",
    ]
    for s in formula:
        clave = s["clave"]
        if clave not in llenas:
            continue
        if clave in FORMULA:
            t.append(f"\\componente{{{clave}}}")
        if clave in BLOQUE:
            n = _disposiciones(clave, _nodos(s))
            nombre = BLOQUE[clave]
            t.append(f"\\bloquedisposicion{{{SINGULAR[nombre]}}}" if n == 1 else f"\\bloquedisposiciones{{{nombre}}}")
        t.append(parte_a_latex(clave, s["titulo"], _nodos(s), "formula"))
        t.append("")
    t.append("\\componente{firmas}")
    t.append("\\begin{cuadrofirmas}")
    if autor:
        t.append(f"\\firmadigital{{{escapar(autor)}}}{{Diputado de la Rep\\'ublica}}")
    for adh in [x.strip() for x in (d.get("adherentes") or "").splitlines() if x.strip()]:
        t.append(f"\\firmadigital{{{escapar(adh)}}}{{Diputado de la Rep\\'ublica}}")
    t += ["\\end{cuadrofirmas}", ""]
    for s in secciones:
        if grupo_de(s) == "exposicion" and s["clave"] not in llenas and s.get("obligatoria"):
            avisos.append(f"Falta la parte obligatoria «{s['titulo']}».")
    if exposicion:
        # Sin ninguna parte escrita, no se imprime una hoja con el rótulo solo.
        t.append("\\componente{exposicion}")
    seccion = 0
    ultimo_marcador = -1
    for s in exposicion:
        clave = s["clave"]
        cabecera, nodos, seccion = cabecera_exposicion(s["titulo"], _nodos(s), seccion)
        idx = EXPOSICION.index(clave) if clave in EXPOSICION else -1
        if idx > ultimo_marcador:
            # La cabecera explícita la consume el marcador del esquema.
            t.append(cabecera)
            t.append(f"\\componente{{{clave}}}")
            ultimo_marcador = idx
        else:
            # Sin marcador (parte nueva, o del esquema pero fuera de su orden): la cabecera se
            # imprime directamente, numerada como las demás.
            t.append(cabecera.replace("\\cabeceraexplicita{", "{", 1))
        t.append(parte_a_latex(clave, s["titulo"], nodos))
        t.append("")
    # Lugar y fecha cierran la exposición; el cuadro va DESPUÉS, como anexo.
    t += ["", "\\par\\vspace{1\\baselineskip}\\begin{flushright}\\meta{lugar}, \\ifmetadef{fecha}{\\meta{fecha}}{\\today}\\end{flushright}"]
    if "comparativo" in llenas:
        # Anexo en hoja propia (el rótulo lo pone \\componente); la tabla
        # parte entre páginas por filas (una por párrafo; servicios/comparativo.py).
        t.append("\\clearpage")
        t.append("\\componente{comparativo}")
        t.append(parte_a_latex("comparativo", por["comparativo"]["titulo"], _nodos(por["comparativo"])))
    for s in finales:
        # Un complemento nuevo (2026-10-19): hoja propia con su rótulo, sin marcador del esquema.
        t.append("\\clearpage")
        t.append(f"\\rotulolegislativo{{{escapar(s['titulo'])}}}")
        t.append(parte_a_latex(s["clave"], s["titulo"], _nodos(s)))
    t += ["\\end{document}", ""]
    # Tachado (cuadro comparativo) o celdas combinadas: su paquete, si se usan.
    return con_paquetes("\n".join(t)), avisos


def fotografias(partes: list[dict]) -> set[str]:
    """Nombres de archivo de las fotografías que citan las partes (nodos `fotografia`),
    para copiarlas junto al maestro antes de compilar."""
    vistos: set[str] = set()

    def rec(n: dict) -> None:
        if n.get("type") == "fotografia":
            vistos.add(str((n.get("attrs") or {}).get("archivo") or ""))
        for h in n.get("content", []) or []:
            rec(h)

    for x in partes:
        rec(x.get("contenido") or {})
    return {v for v in vistos if v}

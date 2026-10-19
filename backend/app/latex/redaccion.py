"""Normalización automática de campos del formulario.

Aplica las convenciones de docs/redaccion-administrativa.md cuando el
usuario escribe TODO EN MAYÚSCULAS (muy común al copiar de Word):

  - nombres/cargos  -> caja de título («WILFREDO OSCORIMA» -> «Wilfredo
    Oscorima»), con partículas en minúscula (de, del, la, y...).
  - asunto          -> caja de oración (primera letra y siglas en alto).

REGLA: solo se transforma un texto si está (casi) todo en mayúsculas; si
el usuario escribió con mayúsculas y minúsculas, se respeta tal cual (es
una decisión de redacción, no un descuido). Las SIGLAS conocidas del
dominio se conservan en alto. El contenido del CUERPO nunca se toca aquí
(solo limpieza de caracteres invisibles, en el serializador).
"""

import re

from app.config import config

# Siglas y abreviaturas del dominio que se conservan en mayúsculas; las del
# titular y la bancada llegan del .env (config.siglas, config.siglas_bancada).
SIGLAS = {
    "SUTEP", "CEN-SUTEP", "MINEDU", "MEF", "MINEM", "INEI", "INGEMMET",
    "REINFO", "MAPE", "FONCOR", "UGEL", "DRE", "DREA", "DIRESA", "GORE",
    "GORESAM", "PCM", "ONU", "GTDA", "SERVIR", "CGP", "CTS", "ATS", "PEIP",
    "EB", "CUI", "SNIP", "PIA", "SPP", "RIM", "DNI", "SITER", "FENATE",
    "FENATEPERÚ", "I.E.", "I.E", "D.S.", "D.L.", "N°", "N.°", "Nº", "S/",
    "SM/SG", "CER", "OIT", "APAFA", "FREDEPA",
    config.siglas.upper(), config.siglas_bancada.upper(),
}

# Partículas que van en minúscula dentro de nombres propios y cargos.
_PARTICULAS = {"de", "del", "la", "las", "los", "y", "e", "el", "al", "en"}

# Palabras que inician con mayúscula dentro de un asunto en caja de
# oración (nombres de normas y tratamientos frecuentes).
_ALTAS_ASUNTO = {"ley", "decreto", "resolución", "casación", "constitución"}

# Nombres propios frecuentes de la entidad (lugares/instituciones de la
# región): se capitalizan aunque el asunto venga todo en mayúsculas.
PROPIOS = {
    "ayacucho", "huamanga", "huanta", "cangallo", "lucanas", "parinacochas",
    "sucre", "vilcas", "huamán", "fajardo", "víctor", "páucar", "sara",
    "huanca", "sancos", "mar", "lima", "perú", "cusco", "arequipa",
    "callao", "san", "juan", "bautista", "martín", "educación", "economía",
    "finanzas", "congreso", "república", "cámara", "diputados",
}

# Tras estas palabras, la siguiente es casi siempre un nombre propio
# («UGEL Huamanga», «región Ayacucho», «provincia de Huamanga»).
_CAPITALIZA_SIGUIENTE = {"ugel", "dre", "drea", "gore", "región", "region",
                         "provincia", "distrito", "departamento", "i.e.", "i.e"}


def _es_todo_mayusculas(texto: str) -> bool:
    """¿El texto está (casi) todo en mayúsculas? (>=90 % de sus letras)."""
    letras = [c for c in texto if c.isalpha()]
    if len(letras) < 4:
        return False
    altas = sum(1 for c in letras if c.isupper())
    return altas / len(letras) >= 0.9


def _capitalizar(palabra: str) -> str:
    """Primera letra alta, resto bajo (respetando guiones: Huanca-Sancos)."""
    return "-".join(p[:1].upper() + p[1:].lower() if p else p
                    for p in palabra.split("-"))


def _token_titulo(palabra: str, primera: bool) -> str:
    limpia = palabra.strip("().,;:")
    if limpia.upper() in SIGLAS:
        return palabra  # sigla del dominio: se conserva en alto
    if any(c.isdigit() for c in palabra):
        return palabra  # números de ley, DNI, montos: tal cual
    if not primera and palabra.lower() in _PARTICULAS:
        return palabra.lower()
    return _capitalizar(palabra)


def caja_titulo(texto: str) -> str:
    """«WILFREDO OSCORIMA NÚÑEZ» -> «Wilfredo Oscorima Núñez». Solo si
    el texto viene (casi) todo en mayúsculas; si no, se respeta."""
    if not _es_todo_mayusculas(texto):
        return texto
    palabras = texto.split(" ")
    out: list[str] = []
    for i, p in enumerate(palabras):
        out.append(_token_titulo(p, primera=(i == 0)))
    return " ".join(out)


def caja_oracion(texto: str) -> str:
    """Asunto en MAYÚSCULAS -> caja de oración, conservando siglas,
    números y nombres de normas. Solo si viene (casi) todo en alto."""
    if not _es_todo_mayusculas(texto):
        return texto
    palabras = texto.split(" ")
    out: list[str] = []
    inicio_oracion = True
    tras_propio = False
    for p in palabras:
        limpia = p.strip("().,;:“”\"«»")
        base = limpia.lower()
        if limpia.upper() in SIGLAS:
            out.append(p)  # sigla: tal cual (ya está en alto)
        elif any(c.isdigit() for c in p):
            out.append(p)
        elif inicio_oracion or base in _ALTAS_ASUNTO or base in PROPIOS or tras_propio:
            out.append(_capitalizar(p))
        else:
            out.append(p.lower())
        tras_propio = base in _CAPITALIZA_SIGUIENTE
        # Solo el PUNTO cierra oración (tras «;» o «:» se sigue en baja).
        if p.strip():
            inicio_oracion = p.rstrip().endswith(".")
    return " ".join(out)


# Campos por tratamiento. Los multilínea (destinatarios, con_copia) se
# normalizan línea a línea; el separador « — » (nombre — cargo) se
# normaliza por partes.
_CAMPOS_TITULO = {"destinatario_cargo", "para", "de"}
_CAMPOS_TITULO_MULTILINEA = {"destinatario_nombre", "con_copia"}
_CAMPOS_ORACION = {"asunto"}


def _linea_titulo(linea: str) -> str:
    if " — " in linea:
        nombre, cargo = linea.split(" — ", 1)
        return f"{caja_titulo(nombre.strip())} — {caja_titulo(cargo.strip())}"
    return caja_titulo(linea)


def normalizar_campos(campos: dict) -> dict:
    """Devuelve los campos con la normalización de mayúsculas aplicada.
    No muta el dict de entrada; los valores no-texto pasan tal cual."""
    out = dict(campos)
    for clave, valor in campos.items():
        if not isinstance(valor, str) or not valor.strip():
            continue
        if clave in _CAMPOS_TITULO:
            out[clave] = caja_titulo(valor)
        elif clave in _CAMPOS_TITULO_MULTILINEA:
            out[clave] = "\n".join(
                _linea_titulo(l) if l.strip() else l for l in valor.splitlines()
            )
        elif clave in _CAMPOS_ORACION:
            out[clave] = caja_oracion(valor)
    return out

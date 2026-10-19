"""Documentos desde un Word (2026-10-18; fase 0 de docs/plataforma/formato-word.md).

Quien redacta varios oficios en un solo `.docx` los trae de una vez: el archivo se parte por el
encabezado de cada documento («OFICIO N.° …», «CARTA N.° …», «MEMORANDO …») y de cada trozo se leen,
por patrones, los campos del formulario (lugar y fecha, tratamiento, destinatario, cargo, institución,
asunto, referencia, anexo, copias, iniciales) y el cuerpo —los párrafos entre «Presente.-» y
«Atentamente,»— como nodos del editor, con sus notas al pie en su lugar. Nada se adivina: lo que no se
reconoce queda vacío y se avisa; la persona completa en el editor, que es el único lugar de verdad.

La lectura del `.docx` es la de `scripts/importar_proyecto_ley.py` (`texto_docx`, `parrafos_docx`,
`con_notas`, `_con_notas_word`), cargada por `importar_word.lector()`: un solo lector de Word.
Los documentos creados son borradores `origen='sgdp'` comunes: siguen el trámite uno por uno.
"""
from __future__ import annotations

import hashlib
import re
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.servicios import importar_word
from app.servicios.entradas import extraer_asunto, extraer_fecha, extraer_referencia

# Encabezado que abre un documento. El tipo por su nombre; el número puede faltar («N.° ___»).
RE_ENCABEZADO = re.compile(
    r"^\s*(OFICIO\s+M[UÚ]LTIPLE|OFICIO|CARTA|MEMORANDO|MEMOR[AÁ]NDUM|INFORME|SOLICITUD)\s*"
    r"(?:N[°º.ºo]*\s*|No\.?\s*|Nro\.?\s*)?(?:[\w_]*[-/][\w/_-]*|S/N|_{2,})?\s*$",
    re.IGNORECASE,
)
TIPO_POR_NOMBRE = {
    "oficio multiple": "oficio_multiple", "oficio múltiple": "oficio_multiple", "oficio": "oficio",
    "carta": "carta", "memorando": "memorando", "memorándum": "memorando", "memorandum": "memorando",
    "informe": "informe", "solicitud": "solicitud",
}
RE_TRATAMIENTO = re.compile(r"^\s*(Señor(?:a|es|as)?|Sr\.|Sra\.|Doctor(?:a)?|Ingeniero(?:a)?|Licenciad[oa])\s*[:.]?\s*$", re.I)
RE_PRESENTE = re.compile(r"^\s*(Presente|De mi (?:mayor |especial )?consideraci[oó]n)\b", re.I)
RE_CIERRE = re.compile(r"^\s*(Atentamente|Cordialmente|Sin otro particular|Es propicia la ocasi[oó]n|Hago propicia la ocasi[oó]n|Aprovecho la (?:oportunidad|ocasi[oó]n))\b", re.I)
RE_ROTULO = re.compile(r"^\s*(ASUNTO|REFERENCIA|REF\.?|ADJ\.?|ADJUNTO|ANEXOS?|C\.?\s?C\.?|CON COPIA)\s*[:.\-–]", re.I)
RE_INICIALES = re.compile(r"^\s*[A-ZÁÉÍÓÚÑ]{2,5}/[a-záéíóúñ]{2,5}\.?\s*$")
RE_LUGAR_FECHA = re.compile(r"^\s*([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúñÑ .]{1,40}),\s*\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}\s*\.?\s*$", re.I)
MARCA_NOTA = re.compile(r"⟦(\d+)⟧")


@dataclass
class DocumentoLeido:
    indice: int
    tipo: str = "oficio"
    campos: dict = field(default_factory=dict)
    cuerpo: dict = field(default_factory=lambda: {"type": "doc", "content": []})
    encabezado: str = ""
    avisos: list[str] = field(default_factory=list)
    palabras: int = 0

    def como_dict(self) -> dict:
        return {"indice": self.indice, "tipo": self.tipo, "campos": self.campos, "cuerpo": self.cuerpo,
                "encabezado": self.encabezado, "avisos": self.avisos, "palabras": self.palabras}


def _sin_notas(t: str) -> str:
    return MARCA_NOTA.sub("", t).strip()


def partir(parrafos: list[str]) -> list[list[str]]:
    """Los trozos del Word, uno por documento: cada encabezado «OFICIO N.° …» abre uno. Sin
    encabezados, todo es un documento. Pura."""
    trozos: list[list[str]] = []
    actual: list[str] = []
    for p in parrafos:
        if RE_ENCABEZADO.match(_sin_notas(p)) and any(_sin_notas(x) for x in actual):
            trozos.append(actual)
            actual = []
        actual.append(p)
    if any(_sin_notas(x) for x in actual):
        trozos.append(actual)
    return trozos or [parrafos]


def leer_campos(parrafos: list[str]) -> tuple[str, dict, list[str], list[str]]:
    """(tipo, campos, párrafos del cuerpo, avisos) de un documento, por patrones. Pura."""
    limpios = [_sin_notas(p) for p in parrafos]
    campos: dict = {}
    avisos: list[str] = []
    tipo = "oficio"
    encabezado = next((l for l in limpios[:6] if RE_ENCABEZADO.match(l)), "")
    if encabezado:
        m = RE_ENCABEZADO.match(encabezado)
        tipo = TIPO_POR_NOMBRE.get(re.sub(r"\s+", " ", m.group(1).lower()), "oficio") if m else "oficio"
    texto = "\n".join(limpios)
    # Lugar y fecha («Lima, 3 de octubre de 2026»).
    for l in limpios[:8]:
        m = RE_LUGAR_FECHA.match(l)
        if m:
            campos["lugar"] = m.group(1).strip()
            f = extraer_fecha(l)
            if f:
                campos["fecha"] = f
            break
    # Destinatario: tratamiento, nombre, cargo, institución (hasta «Presente» o un rótulo).
    i_trat = next((i for i, l in enumerate(limpios[:25]) if RE_TRATAMIENTO.match(l)), None)
    if i_trat is not None:
        campos["destinatario_tratamiento"] = limpios[i_trat].strip().rstrip(".") + (":" if not limpios[i_trat].strip().endswith(":") else "")
        bloque = []
        for l in limpios[i_trat + 1:i_trat + 7]:
            if not l or RE_PRESENTE.match(l) or RE_ROTULO.match(l) or RE_TRATAMIENTO.match(l):
                break
            bloque.append(l.strip())
        if bloque:
            campos["destinatario_nombre"] = bloque[0]
        if len(bloque) > 1:
            campos["destinatario_cargo"] = bloque[1]
        if len(bloque) > 2:
            campos["destinatario_institucion"] = " ".join(bloque[2:])
    else:
        avisos.append("No se encontró el destinatario («Señor:» y las líneas que siguen).")
    asunto = extraer_asunto(texto)
    if asunto:
        campos["asunto"] = asunto
    else:
        avisos.append("No se encontró el rótulo ASUNTO.")
    ref = extraer_referencia(texto)
    if ref:
        campos["referencia"] = ref
    # Cuerpo: desde «Presente.-» (o después del último rótulo) hasta «Atentamente,».
    inicio = next((i + 1 for i, l in enumerate(limpios) if RE_PRESENTE.match(l)), None)
    if inicio is None:
        ultimo_rotulo = max((i for i, l in enumerate(limpios[:30]) if RE_ROTULO.match(l)), default=-1)
        inicio = ultimo_rotulo + 1 if ultimo_rotulo >= 0 else (i_trat + 1 if i_trat is not None else 0)

    # Los rótulos (ASUNTO, REFERENCIA…) y sus líneas de continuación van antes o después de
    # «Presente.-» según la casa: en ningún caso son cuerpo.
    def _rotulo_o_continuacion(l: str) -> bool:
        return (not l) or bool(RE_ROTULO.match(l)) or bool(asunto and l in asunto) or bool(ref and l in ref)

    while inicio < len(limpios) and _rotulo_o_continuacion(limpios[inicio]):
        inicio += 1
    fin = next((i for i, l in enumerate(limpios) if i > inicio and RE_CIERRE.match(l)), len(limpios))
    cuerpo = [p for p in parrafos[inicio:fin] if _sin_notas(p)]
    # Lo que viene tras el cierre: adjuntos, copias e iniciales.
    cola = limpios[fin + 1:] if fin < len(limpios) else []
    for j, l in enumerate(cola):
        if re.match(r"^\s*(ADJ\.?|ADJUNTO|ANEXOS?)\s*[:.\-–]", l, re.I):
            campos["anexo"] = re.sub(r"^\s*(ADJ\.?|ADJUNTO|ANEXOS?)\s*[:.\-–]\s*", "", l, flags=re.I).strip()
        elif re.match(r"^\s*(C\.?\s?C\.?|CON COPIA)\s*[:.\-–]", l, re.I):
            copias = [re.sub(r"^\s*(C\.?\s?C\.?|CON COPIA)\s*[:.\-–]\s*", "", l, flags=re.I).strip()]
            for sig in cola[j + 1:j + 6]:
                if not sig or RE_INICIALES.match(sig) or RE_ROTULO.match(sig):
                    break
                copias.append(sig.strip())
            campos["con_copia"] = "\n".join(c for c in copias if c)
        elif RE_INICIALES.match(l):
            campos["iniciales"] = l.strip()
    if not cuerpo:
        avisos.append("No se reconoció el cuerpo (entre «Presente.-» y «Atentamente,»).")
    return tipo, campos, cuerpo, avisos


def analizar(ruta: Path) -> list[DocumentoLeido]:
    """Los documentos de un `.docx`, con sus campos y su cuerpo como nodos del editor."""
    with importar_word._CANDADO:  # noqa: SLF001 — el lector guarda tablas y fotos en el módulo
        mod = importar_word.lector()
        parrafos, rotulos, notas = mod.texto_docx(ruta)
        salida: list[DocumentoLeido] = []
        for k, trozo in enumerate(partir(parrafos), start=1):
            tipo, campos, cuerpo, avisos = leer_campos(trozo)
            pars = mod.parrafos_docx(cuerpo, rotulos)
            nodos = [mod._con_notas_word(n, notas) for n in mod.con_notas(pars, {}, set(), buscar=False)]  # noqa: SLF001
            # Un Word de oficios no trae fotos del editor: una imagen se avisa y se omite.
            if any(n.get("type") == "fotografia" for n in nodos):
                nodos = [n for n in nodos if n.get("type") != "fotografia"]
                avisos.append("El documento traía una imagen; se omitió (insértela desde la Mediateca).")
            texto = " ".join(_sin_notas(p) for p in cuerpo)
            salida.append(DocumentoLeido(
                indice=k, tipo=tipo, campos=campos, cuerpo={"type": "doc", "content": nodos or [{"type": "paragraph"}]},
                encabezado=_sin_notas(trozo[0])[:120] if trozo else "", avisos=avisos, palabras=len(texto.split()),
            ))
        return salida


# --- el archivo espera a que la persona confirme (una hora) --------------------------------------

_CARPETA = Path(tempfile.gettempdir()) / "sgdp-word-documentos"
_ESPERA_S = 3600


def guardar_temporal(contenido: bytes) -> str:
    _CARPETA.mkdir(parents=True, exist_ok=True, mode=0o700)
    token = hashlib.sha256(contenido).hexdigest()[:40]
    (_CARPETA / f"{token}.docx").write_bytes(contenido)
    for viejo in _CARPETA.glob("*.docx"):
        if time.time() - viejo.stat().st_mtime > _ESPERA_S:
            viejo.unlink(missing_ok=True)
    return token


def ruta_temporal(token: str) -> Path | None:
    if not re.fullmatch(r"[0-9a-f]{40}", token or ""):
        return None
    ruta = _CARPETA / f"{token}.docx"
    return ruta if ruta.exists() and time.time() - ruta.stat().st_mtime <= _ESPERA_S else None

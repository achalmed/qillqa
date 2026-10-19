"""SEMANA DE REPRESENTACIÓN: ida y vuelta entre el expediente y la base (2026-10-02).

La semana se registra en Qillqa (actividades, pedidos, fotos, prosa) y su informe
lo sigue haciendo el generador del marco (generadores/informe-sr), que lee cuatro
YAML de `datos/` y el `expediente.yaml` de la carpeta de la semana. Este módulo es
el contrato entre los dos, sin base de datos (puro, probado en tests/):

    expediente (YAML) ──leer()──►  estructura JSON  ──►  tablas semanas_sr, *_sr
    tablas  ──►  estructura JSON  ──volcar()──►  expediente (YAML) ──► generador

La estructura es la de los YAML tal cual: cada fila de las listas (actividades,
pedidos, fotos) es su diccionario, y lo que no es lista se guarda en `resto`. Así
el generador no cambia y exportar devuelve exactamente lo importado (salvo los
comentarios del YAML: desde que Qillqa es la fuente, los YAML de `datos/` son
salida, con su marca GENERADO). Lo único que se transforma son las fechas: JSON no
tiene fechas, así que viajan como texto ISO y vuelven a ser fechas al volcar
(ningún YAML de la entidad tenía una fecha entre comillas; ver la prueba).
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import os
import re
from pathlib import Path

import yaml

# Archivo de datos → la clave de su lista (la de cada archivo coincide con su nombre).
LISTAS = ("actividades", "pedidos", "fotos")
DATOS = "datos"
EXPEDIENTE = "expediente.yaml"
INFORME = "informe.yaml"
# Prefijo y cifras de cada código: A-01, P-001, F-001.
CODIGOS = {"actividades": ("A", 2), "pedidos": ("P", 3), "fotos": ("F", 3)}
# Tipos de foto (comentario de la plantilla, `_plantilla/datos/fotos.yaml`).
TIPOS_FOTO = ("documento", "infraestructura", "reunion", "territorio", "actividad", "grafica")
ESTADOS_FOTO = ("publica", "reservada", "revisar")
ESTADOS_SEMANA = ("borrador", "activo", "hecho", "archivado")
# Las plantillas de la entidad marcan con «…» lo que falta escribir.
MARCADOR = "«"
PLANTILLA = "_plantilla"

RE_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RE_CARPETA = re.compile(r"^(\d{4})-(\d{2})_SR-(\d{2})_([a-z0-9-]+)$")

CABECERA = (
    "# {nombre} — GENERADO por Qillqa (módulo Semana de representación) el {cuando}; "
    "no editar aquí: se edita en la web y se vuelve a exportar al generar.\n"
)


class ErrorSemana(ValueError):
    pass


# --- Fechas: YAML ⇄ JSON -------------------------------------------------------------


def a_json(valor):
    """Copia JSON de un valor leído de YAML: fechas a texto ISO."""
    if isinstance(valor, dict):
        return {str(k): a_json(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [a_json(v) for v in valor]
    if isinstance(valor, (dt.date, dt.datetime)):
        return valor.isoformat()
    return valor


def a_yaml(valor):
    """Inverso de `a_json`: el texto AAAA-MM-DD vuelve a ser fecha."""
    if isinstance(valor, dict):
        return {k: a_yaml(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [a_yaml(v) for v in valor]
    if isinstance(valor, str) and RE_FECHA.match(valor):
        try:
            return dt.date.fromisoformat(valor)
        except ValueError:
            return valor
    return valor


# --- Leer un expediente --------------------------------------------------------------


def _leer_yaml(ruta: Path) -> dict:
    if not ruta.is_file():
        raise ErrorSemana(f"Falta {ruta.name} en {ruta.parent}")
    return yaml.safe_load(ruta.read_text(encoding="utf-8")) or {}


def leer(carpeta: Path) -> dict:
    """La estructura de una semana desde su carpeta (expediente + datos/*.yaml)."""
    if not RE_CARPETA.match(carpeta.name):
        raise ErrorSemana(f"No es una carpeta de semana (AAAA-MM_SR-NN_slug): {carpeta.name}")
    datos = carpeta / DATOS
    estructura = {
        "carpeta": carpeta.name,
        "expediente": a_json(_leer_yaml(carpeta / EXPEDIENTE)) if (carpeta / EXPEDIENTE).is_file() else {},
        "informe": a_json(_leer_yaml(datos / INFORME)),
        "resto": {},
    }
    for lista in LISTAS:
        contenido = a_json(_leer_yaml(datos / f"{lista}.yaml"))
        estructura[lista] = list(contenido.pop(lista, None) or [])
        estructura["resto"][lista] = contenido
    return estructura


def vaciar(estructura: dict) -> dict:
    """Una semana recién copiada de `_plantilla/` trae filas de EJEMPLO (A-01 «Título de la
    actividad», P-001, F-001, la crónica del día 1): una semana nueva empieza sin ninguna.
    La prosa de la plantilla sí se conserva: es la guía de qué escribir (`pendientes()`)."""
    for lista in LISTAS:
        estructura[lista] = []
    (estructura["resto"].setdefault("actividades", {}))["dias"] = []
    estructura["informe"]["dias"] = []
    return estructura


def tiene_marcador(valor) -> bool:
    """¿Lleva algún «…» de la plantilla? (Solo para filas de ejemplo: en la prosa el despacho
    usa «» como comillas, por eso `pendientes()` compara con la plantilla.)"""
    if isinstance(valor, str):
        return MARCADOR in valor
    if isinstance(valor, dict):
        return any(tiene_marcador(v) for v in valor.values())
    if isinstance(valor, list):
        return any(tiene_marcador(v) for v in valor)
    return False


# Textos que SOLO imprime la edición interna (plantillas metodologia, ambito, matriz): no
# bloquean aprobar la pública. Balance (analisis_*) y seguimiento_intro SÍ van en la pública.
SOLO_INTERNA = ("criterio_competencia", "pauta_prosa", "metodologia", "prioridad_explicacion",
                "ambito_descripcion", "matriz_intro")


def pendientes(informe: dict, plantilla: dict) -> list[str]:
    """Qué textos de la edición pública siguen IGUAL que en la plantilla y con su marcador
    «…»: el PDF los imprimiría tal cual. (No basta con buscar «: el despacho usa «» como
    comillas.) El texto de portada solo cuenta mientras no haya foto de portada."""
    return [
        clave for clave, modelo in plantilla.items()
        if clave != "dias" and clave not in SOLO_INTERNA and MARCADOR in str(modelo)
        and informe.get(clave) == modelo
        and not (clave == "portada_codigo" and informe.get("foto_portada"))
    ]


# --- Volcar al expediente -------------------------------------------------------------


def resumen_pedidos(pedidos: list[dict]) -> dict:
    """El resumen que `expediente.yaml → pedidos` guarda, contado (nunca escrito a mano)."""
    estados = [p.get("estado") for p in pedidos]
    return {
        "total": len(pedidos),
        "registrados": estados.count("registrado"),
        "derivados": estados.count("derivado"),
        "respondidos": estados.count("respondido"),
        "cerrados": estados.count("cerrado"),
    }


def volcar(estructura: dict) -> dict[str, dict]:
    """Los diccionarios de cada archivo, listos para `yaml.safe_dump` (fechas como fechas).
    La clave es la ruta relativa a la carpeta de la semana."""
    salida = {f"{DATOS}/{INFORME}": a_yaml(estructura["informe"])}
    for lista in LISTAS:
        resto = dict(estructura["resto"].get(lista) or {})
        resto[lista] = estructura[lista]
        salida[f"{DATOS}/{lista}.yaml"] = a_yaml(resto)
    if estructura.get("expediente"):
        salida[EXPEDIENTE] = a_yaml(estructura["expediente"])
    return salida


def texto_yaml(nombre: str, contenido: dict, cuando: str | None = None) -> str:
    cuando = cuando or dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    cuerpo = yaml.safe_dump(contenido, allow_unicode=True, sort_keys=False, width=110,
                            default_flow_style=False)
    return CABECERA.format(nombre=nombre, cuando=cuando) + cuerpo


def escribir(carpeta: Path, estructura: dict) -> list[Path]:
    """Exporta la semana a su carpeta. Cada archivo se escribe aparte y se reemplaza de
    golpe (os.replace): el generador nunca lee un YAML a medio escribir."""
    escritos = []
    for relativa, contenido in volcar(estructura).items():
        ruta = carpeta / relativa
        ruta.parent.mkdir(parents=True, exist_ok=True)
        temporal = ruta.with_suffix(ruta.suffix + ".tmp")
        temporal.write_text(texto_yaml(f"{carpeta.name}/{relativa}", contenido), encoding="utf-8")
        os.replace(temporal, ruta)
        escritos.append(ruta)
    return escritos


# --- Códigos y vocabularios -------------------------------------------------------------


def siguiente_codigo(lista: str, existentes: list[str]) -> str:
    prefijo, cifras = CODIGOS[lista]
    numeros = [int(c.split("-")[1]) for c in existentes if re.match(rf"^{prefijo}-\d+$", c)]
    return f"{prefijo}-{(max(numeros, default=0) + 1):0{cifras}d}"


def carpeta_de(anio: int, mes: int, numero: int, slug: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    if not slug:
        raise ErrorSemana("El nombre corto de la carpeta no puede quedar vacío.")
    return f"{anio:04d}-{mes:02d}_SR-{numero:02d}_{slug}"


def config_generador(mdd_ruta: str):
    """El `config.py` del generador: la ÚNICA fuente de los vocabularios (sectores, tipos,
    prioridades, estados). Solo usa la biblioteca estándar, así que se carga aquí sin las
    dependencias gráficas del generador."""
    ruta = Path(mdd_ruta) / "generadores" / "informe-sr" / "config.py"
    if not ruta.is_file():
        raise ErrorSemana(f"No se encuentra el generador del informe en {ruta.parent}")
    spec = importlib.util.spec_from_file_location("isr_config", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def vocabularios(mdd_ruta: str) -> dict:
    cfg = config_generador(mdd_ruta)
    return {
        "sectores": [{"valor": k, "etiqueta": v} for k, v in cfg.SECTORES.items()],
        "tipos_actividad": [{"valor": k, "etiqueta": v} for k, v in cfg.TIPOS.items()],
        "prioridades": list(cfg.PRIORIDADES),
        "estados_pedido": list(cfg.ESTADOS_PEDIDO),
        "estados_informe": list(cfg.ESTADOS_INFORME),
        "tipos_foto": list(TIPOS_FOTO),
        "estados_foto": list(ESTADOS_FOTO),
        "estados_semana": list(ESTADOS_SEMANA),
    }


def validar(estructura: dict, cfg) -> list[str]:
    """Las mismas comprobaciones que hará el generador (lib/datos.py: validar), dichas
    antes de lanzarlo y en palabras de la web."""
    errores = []
    ids_a = [a.get("id") for a in estructura["actividades"]]
    ids_p = [p.get("id") for p in estructura["pedidos"]]
    for a in estructura["actividades"]:
        if a.get("sector") not in cfg.SECTORES:
            errores.append(f"{a.get('id')}: falta el sector de la actividad.")
        if a.get("tipo") not in cfg.TIPOS:
            errores.append(f"{a.get('id')}: falta el tipo de la actividad.")
        for pid in a.get("pedidos") or []:
            if pid not in ids_p:
                errores.append(f"{a.get('id')} cita el pedido {pid}, que no existe.")
    for p in estructura["pedidos"]:
        if p.get("actividad") not in ids_a:
            errores.append(f"{p.get('id')}: elija la actividad en que se recogió.")
        if p.get("prioridad_propuesta") not in cfg.PRIORIDADES:
            errores.append(f"{p.get('id')}: elija la prioridad.")
        if p.get("estado") not in cfg.ESTADOS_PEDIDO:
            errores.append(f"{p.get('id')}: estado «{p.get('estado')}» no válido.")
    if not estructura["actividades"]:
        errores.append("Registre al menos una actividad antes de generar el informe.")
    return errores


# --- Lo que el informe puede escribir solo (2026-10-02) -----------------------------------
# Título, periodo y ámbito del informe repiten datos que la semana ya tiene (número, fechas,
# provincias). Se escriben solos y se mantienen al día mientras nadie los cambie a mano: un
# texto se considera «automático» si sigue igual a la plantilla o a lo que el sistema escribió.

MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def fechas_entre(inicio: str, fin: str) -> list[str]:
    try:
        a, b = dt.date.fromisoformat(inicio), dt.date.fromisoformat(fin)
    except (TypeError, ValueError):
        return []
    return [(a + dt.timedelta(days=i)).isoformat() for i in range(min((b - a).days + 1, 15))]


def nombre_dia(iso: str) -> str:
    return DIAS[dt.date.fromisoformat(iso).weekday()]


def texto_periodo(inicio: str, fin: str) -> str:
    """«21 al 25 de septiembre de 2026» · «29 de septiembre al 3 de octubre de 2026»."""
    try:
        a, b = dt.date.fromisoformat(inicio), dt.date.fromisoformat(fin)
    except (TypeError, ValueError):
        return ""
    if (a.year, a.month) == (b.year, b.month):
        return f"{a.day} al {b.day} de {MESES[b.month]} de {b.year}"
    if a.year == b.year:
        return f"{a.day} de {MESES[a.month]} al {b.day} de {MESES[b.month]} de {b.year}"
    return f"{a.day} de {MESES[a.month]} de {a.year} al {b.day} de {MESES[b.month]} de {b.year}"


def _enumerar(cosas: list[str]) -> str:
    cosas = [c for c in cosas if c]
    return cosas[0] if len(cosas) == 1 else ", ".join(cosas[:-1]) + " y " + cosas[-1] if cosas else ""


def textos_automaticos(numero: int, inicio: str, provincias: list[str], fin: str, region: str) -> dict:
    """Los textos del informe que salen de los datos de la semana."""
    try:
        f = dt.date.fromisoformat(inicio)
        mes = f"{MESES[f.month].capitalize()} de {f.year}"
        mes_corto = f"{MESES[f.month].capitalize()} {f.year}"
    except (TypeError, ValueError):
        mes = mes_corto = ""
    ambito = ""
    if provincias:
        ambito = ("Provincia de " if len(provincias) == 1 else "Provincias de ") + _enumerar(provincias)
        if region:
            ambito += f" · {region}"
    return {
        "titulo_documento": f"Informe de Semana de Representación N.º {numero:02d} · {mes}",
        "titulo_corrido": f"Informe de Semana de Representación N.º {numero:02d} · {mes_corto}",
        "periodo_texto": texto_periodo(inicio, fin),
        "ambito_texto": ambito,
    }


def region_de(*textos: str) -> str:
    """La región con que el despacho cierra el ámbito («… · Región Ayacucho»): se toma de la
    plantilla o de una semana anterior, nunca se escribe en el código (D12)."""
    for t in textos:
        if t and " · " in t:
            cola = t.rsplit(" · ", 1)[1].strip()
            if cola and MARCADOR not in cola:
                return cola
    return ""


def es_automatico(valor, previos: list) -> bool:
    """¿Se puede reescribir solo? Vacío, con marcador de plantilla, o igual a lo que el sistema
    escribió antes (nadie lo cambió a mano)."""
    return not valor or MARCADOR in str(valor) or valor in previos


def dias_de(inicio: str, fin: str, previos: list[dict]) -> list[dict]:
    """Los días del recorrido para el periodo; conserva el ámbito ya escrito de cada fecha."""
    por_fecha = {str(d.get("fecha")): d for d in previos or []}
    return [por_fecha.get(f) or {"fecha": f, "nombre": nombre_dia(f), "ambito": ""}
            for f in fechas_entre(inicio, fin)]

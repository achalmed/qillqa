"""ZOTERO (2026-10-06): la autoridad de METADATOS, REFERENCIAS y CITAS de Qillqa, en SOLO LECTURA.

Roles del ecosistema, corregidos por Edison el 2026-10-06 (`docs/decisiones.md` §Biblioteca y
citas): CALIBRE organiza y administra los ARCHIVOS (dónde está el libro, el documento, el
artículo); ZOTERO manda en los metadatos, las referencias y las citas, para escribir en
cualquier contexto (escritura, Qillqa, Obsidian, LibreOffice…). Qillqa no reimplementa a
Zotero: le pide la referencia y la cita ya formateadas con su propio procesador CSL (citeproc)
y la clave de Better BibTeX.

Dos caminos, en este orden:

1. La API LOCAL de Zotero 7 (`ZOTERO_URL`, por defecto http://127.0.0.1:23119/api/): solo
   responde en la máquina donde Zotero está abierto y con «Permitir que otras aplicaciones de
   este equipo se comuniquen con Zotero» (Ajustes → Avanzado). El servidor de Qillqa corre en
   esa misma laptop, así que basta con tener Zotero abierto. `include=data,bib,citation` con
   `style=apa&locale=es-ES` trae la referencia (`bib`) y la cita en el texto (`citation`)
   formateadas por Zotero. La clave de cita es el campo nativo `citationKey` (Better BibTeX lo
   fija ahí); si falta, se pide a Better BibTeX por JSON-RPC (`item.citationkey`).
2. Con Zotero CERRADO, una COPIA de `zotero.sqlite` (y su `-wal`) en una carpeta temporal,
   leída y borrada al instante: nunca se abre la base viva (Zotero la bloquea y escribir es
   de `scripts-biblioteca`, por su puerta única). Se carga en memoria y se recarga solo si
   cambia el `mtime`. La referencia y la cita se arman entonces con el respaldo APA 7 del
   Qillqa y van MARCADAS (`formateado_por = 'qillqa-respaldo'`): no son de Zotero.

Sin ninguno de los dos, `estado()` lo dice («Zotero no está abierto…») y `buscar()` devuelve [].

El enlace con Calibre: Zotero enlaza los adjuntos de la biblioteca por
`attachments:<Autor>/<Título> (<calibre_id>)/<archivo>` (`core/py-common/biblioteca.py`); de esa
ruta sale `calibre_id`, que Qillqa usa para ubicar el ARCHIVO, nunca para el texto de la cita.

Contrato de cada obra: `zotero_key`, `citekey`, `titulo`, `autores` (lista «Apellido, Nombre»),
`anio`, `tipo`, `contenedor`, `editorial`, `doi`, `url`, `etiquetas`, `calibre_id`, `cita`
(entrada de la bibliografía, texto plano), `cita_md` (con *cursivas*), `cita_corta` (cita en el
texto, «(Cotler, 1978)»), `formateado_por` ('zotero' | 'qillqa-respaldo'), `origen` ('api' | 'sqlite').
"""

from __future__ import annotations

import html
import logging
import re
import shutil
import sqlite3
import tempfile
import threading
import time
from pathlib import Path

import httpx

from app.config import config
from app.servicios.biblioteca import norm, puntuar

log = logging.getLogger("qillqa.zotero")

LIMITE_DEFECTO = 20
LIMITE_MAXIMO = 50
RE_KEY = re.compile(r"^[A-Z0-9]{8}$")
# «attachments:Julio Cotler/Clases, Estado y Nación (2)/archivo.pdf» o la ruta absoluta equivalente.
RE_CALIBRE_RUTA = re.compile(r"\((\d+)\)/[^/]+$")
TIPOS_FUERA = {"note", "attachment", "annotation"}
CAMPOS_CONTENEDOR = ("publicationTitle", "bookTitle", "proceedingsTitle", "websiteTitle", "blogTitle",
                     "forumTitle", "programTitle", "encyclopediaTitle", "dictionaryTitle", "code")
# En la base, cada tipo guarda la fecha en su campo propio (una norma: `dateEnacted`).
CAMPOS_FECHA = ("date", "dateEnacted", "dateDecided", "issueDate", "filingDate", "accessDate")
TTL_BUSQUEDA = 30.0
TTL_OBRA = 300.0
TTL_ESTADO = 15.0


# ---------------------------------------------------------------- piezas puras
def calibre_de_ruta(ruta: str | None) -> int | None:
    """`attachments:Autor/Título (123)/archivo.pdf` → 123; None si el adjunto no es de Calibre."""
    m = RE_CALIBRE_RUTA.search((ruta or "").replace("\\", "/"))
    return int(m.group(1)) if m else None


def html_a_texto(fragmento: str | None, cursiva: bool = False) -> str:
    """El HTML de citeproc (`<div class="csl-entry">…<i>Título</i>…</div>`) en texto plano;
    con `cursiva`, las cursivas como `*…*`. Las entidades se resuelven y los espacios se pliegan."""
    s = fragmento or ""
    if cursiva:
        s = re.sub(r"<\s*(i|em)\b[^>]*>(.*?)<\s*/\s*\1\s*>", r"*\2*", s, flags=re.I | re.S)
    s = re.sub(r"<[^>]+>", "", s)
    return " ".join(html.unescape(s).split())


def anio_de(fecha: str | None) -> str:
    """Año de un campo `date` de Zotero («2010-06-01 2010-06-01», «junio 2010», «s. f.»)."""
    m = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", fecha or "")
    return m.group(1) if m else "s. f."


def _nombre(c: dict) -> str:
    """Un creador de Zotero ({firstName, lastName} o {name}) como «Apellido, Nombre»."""
    if c.get("name"):
        return str(c["name"]).strip()
    apellido, nombre = str(c.get("lastName") or "").strip(), str(c.get("firstName") or "").strip()
    return f"{apellido}, {nombre}" if apellido and nombre else apellido or nombre


def _iniciales(nombres: str) -> str:
    return " ".join("-".join(f"{s[0].upper()}." for s in p.split("-") if s[:1].isalpha()) for p in nombres.split())


def _apa_autor(c: dict) -> str:
    if c.get("name") or not c.get("firstName"):
        return str(c.get("name") or c.get("lastName") or "").strip()
    return f"{str(c['lastName']).strip()}, {_iniciales(str(c['firstName']))}".strip(", ")


def _corto_autor(c: dict) -> str:
    return str(c.get("name") or c.get("lastName") or c.get("firstName") or "").strip()


def _quienes(creadores: list[dict]) -> list[dict]:
    """Los autores; si no hay, los editores; si tampoco, todos los creadores."""
    for tipos in (("author",), ("editor", "seriesEditor"), None):
        lista = [c for c in creadores if tipos is None or c.get("creatorType") in tipos]
        if lista:
            return lista
    return []


def cita_respaldo(d: dict, cursiva: bool = False) -> str:
    """Referencia APA 7 del RESPALDO (Zotero cerrado): Autores (año). Título. Contenedor. Editorial. DOI/URL."""
    lista = [_apa_autor(c) for c in _quienes(d.get("_creadores") or [])] or ["Autor desconocido"]
    if len(lista) == 1:
        firma = lista[0]
    elif len(lista) <= 20:
        firma = ", ".join(lista[:-1]) + f" y {lista[-1]}"
    else:
        firma = ", ".join(lista[:19]) + ", … " + lista[-1]
    titulo, contenedor = d.get("titulo") or "Sin título", d.get("contenedor") or ""
    if contenedor:
        ref = f"{firma} ({d.get('anio') or 's. f.'}). {titulo}. {f'*{contenedor}*' if cursiva else contenedor}."
    else:
        ref = f"{firma} ({d.get('anio') or 's. f.'}). {f'*{titulo}*' if cursiva else titulo}."
    editorial = d.get("editorial") or ""
    if editorial and norm(editorial) != norm(firma):
        ref += f" {editorial}."
    if d.get("doi"):
        ref += f" https://doi.org/{d['doi']}"
    elif d.get("url"):
        ref += f" {d['url']}"
    return ref


def cita_corta_respaldo(d: dict) -> str:
    """Cita en el texto APA 7 del RESPALDO, con paréntesis como la de Zotero: «(Cotler, 1978)»."""
    autores = _quienes(d.get("_creadores") or [])
    anio = d.get("anio") or "s. f."
    if not autores:
        return f"({d.get('titulo') or 'Sin título'}, {anio})"
    if len(autores) == 1:
        quien = _corto_autor(autores[0])
    elif len(autores) == 2:
        quien = f"{_corto_autor(autores[0])} y {_corto_autor(autores[1])}"
    else:
        quien = f"{_corto_autor(autores[0])} et al."
    return f"({quien}, {anio})"


def _indices(d: dict) -> dict:
    """Campos de búsqueda del respaldo (los mismos nombres que la búsqueda de biblioteca.py)."""
    d["_titulo"] = norm(d["titulo"])
    d["_autores"] = norm(" ".join(d["autores"]))
    d["_resto"] = norm(" ".join([d["anio"], d["citekey"], d["contenedor"], d["editorial"], d.get("_numero", ""),
                                 *d["etiquetas"]]))
    return d


def desde_api(obj: dict, rutas_adjuntos: dict[str, str] | None = None) -> dict:
    """Una obra tal como la devuelve la API local (`include=data,bib,citation`). Puro."""
    data = obj.get("data") or {}
    adj = ((obj.get("links") or {}).get("attachment") or {}).get("href", "")
    clave_adj = adj.rstrip("/").rsplit("/", 1)[-1] if adj else ""
    ruta = (rutas_adjuntos or {}).get(clave_adj, "")
    creadores = data.get("creators") or []
    d = {
        "zotero_key": obj.get("key") or data.get("key") or "",
        "citekey": data.get("citationKey") or "",
        "titulo": data.get("title") or data.get("caseName") or data.get("nameOfAct") or "",
        "autores": [_nombre(c) for c in _quienes(creadores)],
        "anio": anio_de(data.get("date") or (obj.get("meta") or {}).get("parsedDate")),
        "tipo": data.get("itemType") or "",
        "contenedor": next((data[c] for c in CAMPOS_CONTENEDOR if data.get(c)), ""),
        "editorial": data.get("publisher") or data.get("institution") or data.get("university") or "",
        "doi": (data.get("DOI") or "").strip().lower(),
        "url": data.get("url") or "",
        "etiquetas": [t.get("tag", "") for t in data.get("tags") or [] if t.get("tag")],
        "calibre_id": calibre_de_ruta(ruta),
        "_creadores": creadores,
    }
    if obj.get("bib"):
        d["cita"], d["cita_md"] = html_a_texto(obj["bib"]), html_a_texto(obj["bib"], cursiva=True)
        d["cita_corta"] = html_a_texto(obj.get("citation")) or cita_corta_respaldo(d)
        d["formateado_por"] = "zotero"
    else:
        d["cita"], d["cita_md"], d["cita_corta"] = cita_respaldo(d), cita_respaldo(d, True), cita_corta_respaldo(d)
        d["formateado_por"] = "qillqa-respaldo"
    d["origen"] = "api"
    return d


def publico(d: dict) -> dict:
    return {k: v for k, v in d.items() if not k.startswith("_")}


def interpretar(q: str) -> tuple[str, list[str], bool]:
    """(texto, etiquetas, ¿clave de cita?) de lo escrito: «#economía Cotler» → ('Cotler', ['economía'], False);
    «@cotler1978» → ('cotler1978', [], True)."""
    etiquetas = [p[1:] for p in q.split() if p.startswith("#") and len(p) > 1]
    resto = " ".join(p for p in q.split() if not p.startswith("#")).strip()
    es_clave = resto.startswith("@")
    return resto.lstrip("@").strip(), etiquetas, es_clave


# ---------------------------------------------------------------- respaldo: copia de zotero.sqlite
def _workspace_dir() -> Path | None:
    from app.servicios.biblioteca import workspace   # el mismo resolutor que la biblioteca y las fuentes enlazadas
    env = workspace()
    return Path(env.ZOTERO_DIR) if env and getattr(env, "ZOTERO_DIR", None) else None


def ruta_base() -> Path | None:
    """zotero.sqlite de `ZOTERO_DIR` (config) o del workspace (core/env.py); None si no hay ninguna."""
    d = Path(config.zotero_dir) if config.zotero_dir else _workspace_dir()
    return d / "zotero.sqlite" if d else None


def _huella(base: Path) -> tuple:
    wal = base.with_name(base.name + "-wal")
    return (base.stat().st_mtime_ns, wal.stat().st_mtime_ns if wal.exists() else 0)


SQL_OBRAS = """
SELECT i.itemID, i.key, t.typeName FROM items i
JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
JOIN libraries l ON l.libraryID = i.libraryID AND l.type = 'user'
WHERE t.typeName NOT IN ('note', 'attachment', 'annotation')
  AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
"""


def leer_sqlite(con: sqlite3.Connection) -> dict[str, dict]:
    """Las obras de la biblioteca personal de una base de Zotero ya abierta. Pura sobre `con`."""
    obras: dict[int, dict] = {}
    for iid, key, tipo in con.execute(SQL_OBRAS):
        obras[iid] = {"zotero_key": key, "tipo": tipo, "_campos": {}, "_creadores": [], "etiquetas": [], "calibre_id": None}
    for iid, campo, valor in con.execute(
        "SELECT d.itemID, f.fieldName, v.value FROM itemData d JOIN fields f ON f.fieldID = d.fieldID "
        "JOIN itemDataValues v ON v.valueID = d.valueID"
    ):
        if iid in obras:
            obras[iid]["_campos"][campo] = str(valor or "")
    for iid, nombre, apellido, modo, rol in con.execute(
        "SELECT ic.itemID, c.firstName, c.lastName, c.fieldMode, ct.creatorType FROM itemCreators ic "
        "JOIN creators c ON c.creatorID = ic.creatorID JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID "
        "ORDER BY ic.itemID, ic.orderIndex"
    ):
        if iid in obras:
            c = {"name": apellido} if modo == 1 else {"firstName": nombre or "", "lastName": apellido or ""}
            obras[iid]["_creadores"].append({**c, "creatorType": rol})
    for iid, nombre in con.execute("SELECT it.itemID, t.name FROM itemTags it JOIN tags t ON t.tagID = it.tagID ORDER BY t.name"):
        if iid in obras:
            obras[iid]["etiquetas"].append(nombre)
    for padre, ruta in con.execute("SELECT parentItemID, path FROM itemAttachments WHERE parentItemID IS NOT NULL AND path IS NOT NULL"):
        if padre in obras and obras[padre]["calibre_id"] is None:
            obras[padre]["calibre_id"] = calibre_de_ruta(ruta)
    salida: dict[str, dict] = {}
    for o in obras.values():
        f = o.pop("_campos")
        d = {
            "zotero_key": o["zotero_key"], "citekey": f.get("citationKey", ""),
            "titulo": f.get("title") or f.get("caseName") or f.get("nameOfAct") or "",
            "autores": [_nombre(c) for c in _quienes(o["_creadores"])], "anio": anio_de(next((f[c] for c in CAMPOS_FECHA if f.get(c)), "")),
            "tipo": o["tipo"], "contenedor": next((f[c] for c in CAMPOS_CONTENEDOR if f.get(c)), ""),
            "editorial": f.get("publisher") or f.get("institution") or f.get("university") or "",
            "doi": f.get("DOI", "").strip().lower(), "url": f.get("url", ""), "etiquetas": o["etiquetas"],
            "calibre_id": o["calibre_id"], "_creadores": o["_creadores"],
            # El número de una norma o un informe («Ley 27795»): se busca, no se muestra.
            "_numero": " ".join(f.get(c, "") for c in ("publicLawNumber", "number", "billNumber", "reportNumber") if f.get(c)),
        }
        d["cita"], d["cita_md"], d["cita_corta"] = cita_respaldo(d), cita_respaldo(d, True), cita_corta_respaldo(d)
        d["formateado_por"], d["origen"] = "qillqa-respaldo", "sqlite"
        salida[d["zotero_key"]] = _indices(d)
    return salida


def cargar_copia(base: Path) -> dict[str, dict]:
    """Copia `zotero.sqlite` (y su `-wal`) a una carpeta temporal, la lee y la borra. La base
    viva no se abre nunca (Zotero la bloquea mientras corre)."""
    with tempfile.TemporaryDirectory(prefix="qillqa-zotero-") as tmp:
        copia = Path(tmp) / "zotero.sqlite"
        shutil.copy2(base, copia)
        wal = base.with_name(base.name + "-wal")
        if wal.exists() and wal.stat().st_size:
            shutil.copy2(wal, copia.with_name("zotero.sqlite-wal"))
        con = sqlite3.connect(copia, timeout=2)
        try:
            return leer_sqlite(con)
        finally:
            con.close()


def buscar_en(obras: dict[str, dict], q: str, limite: int = LIMITE_DEFECTO) -> list[dict]:
    """Búsqueda del respaldo por título, creador, año, etiquetas (#…) y clave de cita (@…). Pura."""
    texto, etiquetas, es_clave = interpretar(q or "")
    limite = max(1, min(int(limite or LIMITE_DEFECTO), LIMITE_MAXIMO))
    if not obras or not (texto or etiquetas):
        return []
    tags = {norm(t) for t in etiquetas}
    candidatas = [d for d in obras.values() if not tags or tags <= {norm(t) for t in d["etiquetas"]}]
    if RE_KEY.match(texto) and texto in obras:
        return [publico(obras[texto])]
    if es_clave:
        exactas = [d for d in candidatas if d["citekey"].lower() == texto.lower()]
        parecidas = [d for d in candidatas if d not in exactas and d["citekey"].lower().startswith(texto.lower())]
        return [publico(d) for d in [*exactas, *parecidas][:limite]]
    if not texto:
        return [publico(d) for d in sorted(candidatas, key=lambda d: d["titulo"])[:limite]]
    consulta = norm(texto)
    fichas = [f for f in consulta.split() if f]
    puntuadas = sorted(((p, d) for d in candidatas if (p := puntuar(d, consulta, fichas))),
                       key=lambda x: (-x[0], len(x[1]["titulo"]), x[1]["zotero_key"]))
    return [publico(d) for _, d in puntuadas[:limite]]


# ---------------------------------------------------------------- la API local (y Better BibTeX)
class ZoteroCerrado(Exception):
    """La API local no responde (Zotero cerrado) o está deshabilitada en sus ajustes."""


def _cliente() -> httpx.Client:
    return httpx.Client(base_url=config.zotero_url.rstrip("/"), timeout=httpx.Timeout(5.0, connect=0.7))


def _get(cli: httpx.Client, ruta: str, params: dict | None = None):
    try:
        r = cli.get(ruta, params=params)
    except httpx.HTTPError as e:
        raise ZoteroCerrado("Zotero no está abierto en el servidor (su API local no responde).") from e
    if r.status_code == 403:
        raise ZoteroCerrado("La API local de Zotero está deshabilitada: Ajustes → Avanzado → «Permitir que otras "
                            "aplicaciones de este equipo se comuniquen con Zotero».")
    if r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise ZoteroCerrado(f"La API local de Zotero respondió {r.status_code}.")
    return r.json()


def _rpc(cli: httpx.Client, metodo: str, params: list):
    """Better BibTeX por JSON-RPC; None si no está instalado o no responde."""
    try:
        r = cli.post("/better-bibtex/json-rpc", json={"jsonrpc": "2.0", "method": metodo, "params": params, "id": 1},
                     timeout=3.0)
        return r.json().get("result") if r.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None


def _parametros_formato() -> dict:
    return {"include": "data,bib,citation", "style": config.zotero_estilo, "locale": config.zotero_idioma}


def _completar(cli: httpx.Client, crudos: list[dict]) -> list[dict]:
    """Las rutas de los adjuntos (para el `calibre_id`) en UNA petición y las claves que falten, a Better BibTeX."""
    claves_adj = [h.rstrip("/").rsplit("/", 1)[-1] for o in crudos
                  if (h := ((o.get("links") or {}).get("attachment") or {}).get("href"))]
    rutas: dict[str, str] = {}
    if claves_adj:
        for a in _get(cli, "/api/users/0/items", {"itemKey": ",".join(claves_adj[:50]), "format": "json"}) or []:
            rutas[a.get("key", "")] = (a.get("data") or {}).get("path", "")
    obras = [desde_api(o, rutas) for o in crudos]
    faltan = [d["zotero_key"] for d in obras if not d["citekey"]]
    if faltan and (claves := _rpc(cli, "item.citationkey", [faltan])) and isinstance(claves, dict):
        for d in obras:
            d["citekey"] = d["citekey"] or str(claves.get(d["zotero_key"]) or claves.get(f"1:{d['zotero_key']}") or "")
    return obras


def buscar_api(q: str, limite: int = LIMITE_DEFECTO) -> list[dict]:
    """Búsqueda en la API local: Zotero ordena y formatea. Lanza ZoteroCerrado."""
    texto, etiquetas, es_clave = interpretar(q)
    params = {**_parametros_formato(), "limit": min(limite + 10, 100), "format": "json",
              "qmode": "everything" if es_clave else "titleCreatorYear"}
    if texto:
        params["q"] = texto
    if etiquetas:
        params["tag"] = etiquetas
    with _cliente() as cli:
        if RE_KEY.match(texto):
            uno = _get(cli, f"/api/users/0/items/{texto}", _parametros_formato())
            if uno:
                return [publico(d) for d in _completar(cli, [uno])]
        crudos = [o for o in _get(cli, "/api/users/0/items/top", params) or []
                  if (o.get("data") or {}).get("itemType") not in TIPOS_FUERA][:limite]
        obras = _completar(cli, crudos)
    if es_clave:   # «everything» también halla el texto en otros campos: las claves exactas, primero
        obras.sort(key=lambda d: (d["citekey"].lower() != texto.lower(), not d["citekey"].lower().startswith(texto.lower())))
    return [publico(d) for d in obras]


def obtener_api(key: str) -> dict | None:
    with _cliente() as cli:
        uno = _get(cli, f"/api/users/0/items/{key}", _parametros_formato())
        if not uno:
            return None
        d = _completar(cli, [uno])[0]
        if d["calibre_id"] is None:   # sin «mejor adjunto»: se miran los hijos
            for h in _get(cli, f"/api/users/0/items/{key}/children", {"format": "json"}) or []:
                if (cid := calibre_de_ruta((h.get("data") or {}).get("path"))) is not None:
                    d["calibre_id"] = cid
                    break
        return publico(d)


# ---------------------------------------------------------------- caché y fachada
class _Estado:
    def __init__(self) -> None:
        self.cerrojo = threading.Lock()
        self.base: Path | None = None
        self.huella: tuple | None = None
        self.obras: dict[str, dict] = {}
        self.motivo_sqlite = ""
        self.busquedas: dict[tuple, tuple[float, list[dict]]] = {}
        self.sueltas: dict[str, tuple[float, dict]] = {}
        self.estado: tuple[float, dict] | None = None
        self.api_caida_hasta = 0.0
        self.motivo_api = ""

    def copia(self) -> dict[str, dict]:
        base = ruta_base()
        with self.cerrojo:
            if base is None or not base.is_file():
                self.obras, self.huella = {}, None
                self.motivo_sqlite = "No hay datos de Zotero en esta máquina (ZOTERO_DIR)."
                return self.obras
            try:
                huella = _huella(base)
                if base != self.base or huella != self.huella:
                    self.obras = cargar_copia(base)
                    self.base, self.huella, self.motivo_sqlite = base, huella, ""
            except (OSError, sqlite3.Error) as e:
                self.motivo_sqlite = f"No se pudo leer la copia de zotero.sqlite ({e.__class__.__name__})."
            return self.obras


_e = _Estado()


def _api_disponible() -> bool:
    return time.monotonic() >= _e.api_caida_hasta


def _api_cayo(e: Exception) -> None:
    _e.api_caida_hasta = time.monotonic() + 10   # no reintentar en cada tecla
    _e.motivo_api = str(e)


def buscar(q: str, limite: int = LIMITE_DEFECTO) -> list[dict]:
    """Obras de Zotero que responden a `q`: API local si Zotero está abierto; si no, la copia."""
    q = (q or "").strip()
    limite = max(1, min(int(limite or LIMITE_DEFECTO), LIMITE_MAXIMO))
    if len(q.lstrip("@#")) < 2:
        return []
    clave = (q.lower(), limite)
    if (c := _e.busquedas.get(clave)) and time.monotonic() - c[0] < TTL_BUSQUEDA:
        return c[1]
    resultado: list[dict] | None = None
    if _api_disponible():
        try:
            resultado = buscar_api(q, limite)
            _e.motivo_api = ""
        except ZoteroCerrado as e:
            _api_cayo(e)
    if resultado is None:
        resultado = buscar_en(_e.copia(), q, limite)
    if len(_e.busquedas) > 300:
        _e.busquedas.clear()
    _e.busquedas[clave] = (time.monotonic(), resultado)
    return resultado


def obtener(key: str) -> dict | None:
    """Una obra por su clave de Zotero (8 caracteres)."""
    key = (key or "").strip().upper()
    if not RE_KEY.match(key):
        return None
    if (c := _e.sueltas.get(key)) and time.monotonic() - c[0] < TTL_OBRA:
        return c[1]
    d: dict | None = None
    api_ok = False
    if _api_disponible():
        try:
            d, api_ok = obtener_api(key), True
        except ZoteroCerrado as e:
            _api_cayo(e)
    if d is None and not api_ok:
        d = publico(o) if (o := _e.copia().get(key)) else None
    if d is not None:
        _e.sueltas[key] = (time.monotonic(), d)
    return d


def estado() -> dict:
    """{modo: 'api'|'sqlite'|'apagado', api, bbt, sqlite, obras, estilo, motivo}."""
    if _e.estado and time.monotonic() - _e.estado[0] < TTL_ESTADO:
        return _e.estado[1]
    api = bbt = False
    motivo = ""
    try:
        with _cliente() as cli:
            _get(cli, "/api/users/0/items", {"limit": 1, "format": "json"})
            api = True
            bbt = bool(_rpc(cli, "api.ready", []))
        _e.api_caida_hasta = 0.0
    except ZoteroCerrado as e:
        motivo = str(e)
    obras = 0 if api else len(_e.copia())
    sqlite_ok = bool(obras) or (api and ruta_base() is not None and ruta_base().is_file())
    if api:
        modo = "api"
    elif obras:
        modo = "sqlite"
        motivo += " Se lee una copia de zotero.sqlite: las citas las arma el respaldo de Qillqa, no Zotero."
    else:
        modo = "apagado"
        motivo = (motivo + " " + _e.motivo_sqlite).strip() or "Zotero no está abierto."
    salida = {"modo": modo, "api": api, "bbt": bbt, "sqlite": sqlite_ok, "obras": obras,
              "estilo": config.zotero_estilo, "idioma": config.zotero_idioma, "motivo": motivo.strip()}
    _e.estado = (time.monotonic(), salida)
    return salida

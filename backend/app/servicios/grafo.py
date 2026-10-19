"""MAPA DE RELACIONES (2026-10-05): el grafo de todo lo que Qillqa sabe que
está conectado, para la vista tipo «graph view» de Obsidian (página /mapa).

Nodos: documentos del sistema y externos, proyectos, semanas de
representación, personas e instituciones del directorio y, aparte, el equipo.
Cada arista dice de dónde sale (`tipo`) y si es **fiable** (una relación
guardada en la base: respuesta, proyecto, semana, responsable) o **inferida**
del texto (destinatario o copia que coincide con una persona del directorio,
«Oficio N° …» de la referencia que coincide con un documento). Hoy casi todo
lo que une a los documentos está en el texto: sin lo inferido el mapa estaría
vacío; la web lo dibuja punteado y se puede ocultar.

ARCHIVOS (Edison 2026-10-06: «considerar las relaciones locales como
documentos relacionados como doc de recepción, adjuntos, doc firmado»): en el
mapa LOCAL (`foco`) se suman los archivos de cada documento —firmado, cargos
de recepción, adjuntos, archivos de las respuestas externas y el expediente—
como nodos `archivo` que se abren desde el mapa. En el mapa completo no: serían
miles de puntos sin relación con nada más.

Nada aquí escribe en la base; solo lee y une. Las funciones de coincidencia
son puras (pruebas en tests/test_grafo.py).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.latex.generador import parsear_copias
from app.modelos import (
    Adjunto,
    Documento,
    DocumentoRelacion,
    Entrada,
    Institucion,
    PedidoSR,
    Persona,
    Proyecto,
    ProyectoDocumento,
    ProyectoFuente,
    ProyectoMiembro,
    Relacion,
    SemanaSR,
    Usuario,
)
from app.servicios import expediente as svc_expediente
from app.servicios.numeracion import numero_mostrado
from app.servicios.referencias import ETIQUETA_RELACION
from app.tipos import asunto_de, tipo_config

# --- coincidencias de texto (puras) ----------------------------------------

_GRADOS = re.compile(
    r"^(dr|dra|ing|lic|mg|abog|prof|arq|econ|cpc|sr|sra|srta|general de brigada|brigadier general|"
    r"gral|crnl|coronel|cbp|ep|fap|pnp|ap|mag)\.?\s+",
)


def normalizar(texto: str) -> str:
    """minúsculas, sin tildes ni signos, espacios simples: «Óscar  de Jesús» → «oscar de jesus»."""
    sin_tildes = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", sin_tildes.lower())).strip()


def nombre_de_persona(texto: str) -> str:
    """El nombre comparable de una línea de destinatario: sin «— Cargo» detrás
    ni grados o títulos delante («General de Brigada EP Luis …» → «luis …»)."""
    nombre = re.split(r"\s+[—–-]\s+|,", texto or "", maxsplit=1)[0]
    n = normalizar(nombre)
    anterior = None
    while anterior != n:
        anterior = n
        n = _GRADOS.sub("", n)
    return n


def clave_numero(texto: str) -> str:
    """Forma comparable de un número de documento: mayúsculas, sin espacios
    ni «N.°/Nº/N°»: «Oficio N° 0095-2026-2027-ABC-CD/CRP» → «OFICIO0095-2026-2027-ABC-CD/CRP»."""
    # «º» (ordinal) antes de NFKC, que lo volvería una «o».
    t = unicodedata.normalize("NFKC", (texto or "").replace("º", "°")).upper()
    t = re.sub(r"N\s*\.?\s*[°º]\s*", "", t)
    return re.sub(r"\s+", "", t)


def _etiqueta_norma(texto: str) -> str:
    """El rótulo corto de una norma en el mapa: «Ley N° 27795» (sin su nombre largo)."""
    return (texto or "Norma").split(",", 1)[0].strip()[:60]


def lineas_destinatario(campo: str) -> list[str]:
    return [linea.strip() for linea in (campo or "").splitlines() if linea.strip()]


# --- el grafo ---------------------------------------------------------------


@dataclass
class Grafo:
    nodos: dict[str, dict] = field(default_factory=dict)
    aristas: dict[tuple[str, str, str], dict] = field(default_factory=dict)

    def nodo(self, nid: str, **datos) -> None:
        self.nodos.setdefault(nid, {"id": nid, **datos})

    def arista(self, origen: str, destino: str, tipo: str, fiable: bool, etiqueta: str = "") -> None:
        if origen == destino or origen not in self.nodos or destino not in self.nodos:
            return
        clave = (origen, destino, tipo)
        if clave not in self.aristas:
            self.aristas[clave] = {"source": origen, "target": destino, "tipo": tipo, "fiable": fiable, "etiqueta": etiqueta}

    def salida(self) -> dict:
        # Grado de cada nodo (el tamaño del punto en el mapa).
        grado: dict[str, int] = {}
        for a in self.aristas.values():
            grado[a["source"]] = grado.get(a["source"], 0) + 1
            grado[a["target"]] = grado.get(a["target"], 0) + 1
        nodos = [{**n, "grado": grado.get(n["id"], 0)} for n in self.nodos.values()]
        # Personas e instituciones solo si se conectan con algo: el directorio
        # entero (2 000 entidades) no es un mapa, es una nube.
        nodos = [n for n in nodos if n["grado"] or n["tipo"] not in ("persona", "institucion")]
        return {"nodos": nodos, "aristas": list(self.aristas.values())}


async def construir(sesion: AsyncSession, *, ver_ocultos: bool, ver_autoria: bool) -> dict:
    g = Grafo()

    # Documentos del sistema.
    docs = (await sesion.execute(select(Documento))).scalars().all()
    if not ver_ocultos:
        docs = [d for d in docs if not d.oculto]
    por_numero: dict[str, str] = {}
    for d in docs:
        numero = numero_mostrado(d) if d.numero is not None or d.origen != "sgdp" else f"{tipo_config(d.tipo)['nombre']} (borrador)"
        nid = f"doc:{d.id}"
        g.nodo(
            nid, tipo="documento", subtipo=tipo_config(d.tipo)["nombre"], etiqueta=numero,
            titulo=asunto_de(d.tipo, d.campos) or "", estado=d.estado, fecha=(d.campos or {}).get("fecha") or "",
            ruta=f"/documentos/{d.id}",
        )
        if d.numero is not None:
            por_numero[clave_numero(numero)] = nid

    # Directorio: personas por nombre comparable; instituciones por nombre y siglas.
    personas = (await sesion.execute(select(Persona))).scalars().all()
    instituciones = {i.id: i for i in (await sesion.execute(select(Institucion))).scalars().all()}
    persona_por_nombre: dict[str, Persona] = {}
    for p in personas:
        persona_por_nombre.setdefault(nombre_de_persona(p.nombre), p)
    inst_por_nombre: dict[str, Institucion] = {}
    for i in instituciones.values():
        inst_por_nombre.setdefault(normalizar(i.nombre), i)
        if i.siglas:
            inst_por_nombre.setdefault(normalizar(i.siglas), i)

    def nodo_persona(p: Persona) -> str:
        nid = f"persona:{p.id}"
        g.nodo(nid, tipo="persona", subtipo="Persona", etiqueta=p.nombre, titulo=p.cargo or "", ruta=f"/directorio?contacto={p.id}")
        if p.institucion_id and p.institucion_id in instituciones:
            g.arista(nid, nodo_institucion(instituciones[p.institucion_id]), "trabaja_en", True, "trabaja en")
        return nid

    def nodo_institucion(i: Institucion) -> str:
        nid = f"inst:{i.id}"
        g.nodo(nid, tipo="institucion", subtipo=(i.tipo or "institución").capitalize(), etiqueta=i.siglas or i.nombre,
               titulo=i.nombre, ruta=f"/directorio?pestana=instituciones&ver={i.id}")
        return nid

    for d in docs:
        nid = f"doc:{d.id}"
        campos = d.campos or {}
        # Destinatario(s): una línea por destinatario («Nombre — Cargo»).
        for linea in lineas_destinatario(campos.get("destinatario_nombre", "")):
            p = persona_por_nombre.get(nombre_de_persona(linea))
            if p:
                g.arista(nid, nodo_persona(p), "destinatario", False, "dirigido a")
                # Lo dirigido a una persona del directorio también cuenta para SU institución
                # (2026-10-19, Edison: «a MINEDU solo 3 documentos pero al ministro 15»): el campo
                # «institución» del oficio muchas veces va vacío o lleva otra cosa (el cargo, una
                # dirección), y el mapa contaba solo los que lo escribían igual que el directorio.
                if p.institucion_id and p.institucion_id in instituciones:
                    g.arista(nid, nodo_institucion(instituciones[p.institucion_id]), "destinatario", False, "dirigido a")
        inst = inst_por_nombre.get(normalizar(campos.get("destinatario_institucion", "")))
        if inst:
            g.arista(nid, nodo_institucion(inst), "destinatario", False, "dirigido a")
        # Copias (c.c.).
        for copia in parsear_copias(campos.get("con_copia", "")):
            p = persona_por_nombre.get(nombre_de_persona(copia["nombre"]))
            if p:
                g.arista(nid, nodo_persona(p), "copia", False, "con copia a")
        # Referencia: «Oficio N° …» que es un documento del sistema.
        ref = clave_numero(campos.get("referencia", ""))
        if ref:
            for clave, otro in por_numero.items():
                if clave and clave in ref:
                    g.arista(nid, otro, "referencia", False, "hace referencia a")

    # Relaciones guardadas entre documentos (y con documentos externos).
    for r in (await sesion.execute(select(DocumentoRelacion))).scalars().all():
        origen = f"doc:{r.origen_id}"
        if r.destino_id:
            g.arista(origen, f"doc:{r.destino_id}", r.tipo, True, "responde a" if r.tipo == "responde" else "relacionado con")
            continue
        eid = f"ext:{r.id}"
        g.nodo(eid, tipo="externo", subtipo=r.externo_tipo or "Documento externo",
               etiqueta=r.externo_numero or "Documento externo", titulo=r.externo_asunto or "",
               fecha=r.externo_fecha or "", institucion=r.externo_institucion or "")
        etiqueta = {"respondido": "respondido por", "responde": "responde a"}.get(r.tipo, "relacionado con")
        g.arista(origen, eid, r.tipo, True, etiqueta)
        inst = inst_por_nombre.get(normalizar(r.externo_institucion))
        if inst:
            g.arista(eid, nodo_institucion(inst), "emitido_por", False, "emitido por")

    # Proyectos de ley y sus documentos.
    proyectos = (await sesion.execute(select(Proyecto).where(Proyecto.eliminado_en.is_(None)))).scalars().all()
    for p in proyectos:
        g.nodo(f"pl:{p.id}", tipo="proyecto", subtipo="Proyecto de ley", etiqueta=p.codigo, titulo=p.titulo,
               estado=p.estado, ruta=f"/proyectos/{p.id}")
    for pd in (await sesion.execute(select(ProyectoDocumento))).scalars().all():
        g.arista(f"pl:{pd.proyecto_id}", f"doc:{pd.documento_id}", "proyecto", True, pd.rol or "documento del proyecto")
    # Fuentes del proyecto que son documentos del sistema (`sgdp:doc:N`).
    for f in (await sesion.execute(select(ProyectoFuente))).scalars().all():
        m = re.fullmatch(r"sgdp:doc:(\d+)", (f.clave_externa or "").strip())
        if m:
            g.arista(f"pl:{f.proyecto_id}", f"doc:{m.group(1)}", "fuente", True, "fuente")

    # Semanas de representación: su informe y los oficios de sus pedidos.
    for s in (await sesion.execute(select(SemanaSR))).scalars().all():
        sid = f"sr:{s.id}"
        tema = (s.expediente or {}).get("tema") or s.carpeta.split("_", 2)[-1]
        g.nodo(sid, tipo="semana", subtipo="Semana de representación", etiqueta=s.codigo, titulo=tema,
               estado=s.estado, ruta=f"/informes/{s.id}")
        if s.documento_id:
            g.arista(sid, f"doc:{s.documento_id}", "informe", True, "su informe")
    for pe in (await sesion.execute(select(PedidoSR).where(PedidoSR.documento_id.is_not(None)))).scalars().all():
        g.arista(f"sr:{pe.semana_id}", f"doc:{pe.documento_id}", "pedido", True, "oficio del pedido")

    # Documentos RECIBIDOS (bandeja de entrada, 2026-10-06; servicios/entradas.py): cada
    # entrada es un nodo, unido a su remitente del directorio; el oficio que la responde
    # llega por las relaciones genéricas de abajo (`doc:N` → `entrada:M`).
    for e in (await sesion.execute(select(Entrada).where(Entrada.estado != "archivada"))).scalars().all():
        eid = f"entrada:{e.id}"
        g.nodo(eid, tipo="entrada", subtipo="Documento recibido",
               etiqueta=e.documento or (f"STD {e.std_numero}" if e.std_numero else "Recibido"),
               titulo=e.asunto or "", estado=e.estado, fecha=e.fecha_documento or e.fecha_recepcion or "",
               institucion=e.remitente or "", ruta=f"/recibidos?ver={e.id}")
        if e.remitente_persona_id:
            p = next((x for x in personas if x.id == e.remitente_persona_id), None)
            if p is not None:
                g.arista(eid, nodo_persona(p), "remitente", True, "enviado por")
        if e.remitente_institucion_id and e.remitente_institucion_id in instituciones:
            g.arista(eid, nodo_institucion(instituciones[e.remitente_institucion_id]), "emitido_por", True, "emitido por")

    # Relaciones genéricas (2026-10-06): lo que cita o menciona cada texto (nodos
    # `referencia` del editor, citas en los textos del informe SR) y lo que el sistema
    # asoció solo (el oficio que presenta un informe). Son fiables: alguien eligió la
    # cita, o el sistema la dedujo sin ambigüedad. Normas, libros y pedidos aparecen
    # como nodos propios solo si algo los cita.
    pedidos_vistos: dict[int, PedidoSR] = {}
    persona_por_id = {p.id: p for p in personas}
    for r in (await sesion.execute(select(Relacion))).scalars().all():
        destino = r.destino
        pref, _, ident = destino.partition(":")
        datos = r.datos or {}
        if datos.get("destino_eliminado"):
            continue  # cita a algo que se eliminó (servicios/eliminacion.limpiar_relaciones)
        if pref == "norma":
            g.nodo(destino, tipo="norma", subtipo="Norma", etiqueta=_etiqueta_norma(r.texto), titulo=r.texto,
                   url=datos.get("url", ""))
        elif pref == "libro":
            g.nodo(destino, tipo="libro", subtipo="Libro (biblioteca)", etiqueta=r.texto or f"calibre:{ident}",
                   titulo=datos.get("cita", "") or r.texto, cita=datos.get("cita", ""))
        elif pref == "zotero":   # obra citada desde Zotero (2026-10-06); se dibuja como un libro
            g.nodo(destino, tipo="libro", subtipo="Obra (Zotero)", etiqueta=r.texto or f"zotero:{ident}",
                   titulo=datos.get("cita", "") or r.texto, cita=datos.get("cita", ""))
        elif pref == "persona" and ident.isdigit():
            p = persona_por_id.get(int(ident))
            if p is not None:
                nodo_persona(p)
        elif pref == "inst" and ident.isdigit() and int(ident) in instituciones:
            nodo_institucion(instituciones[int(ident)])
        elif pref == "pedido" and ident.isdigit():
            pe = pedidos_vistos.get(int(ident)) or await sesion.get(PedidoSR, int(ident))
            if pe is not None:
                pedidos_vistos[pe.id] = pe
                g.nodo(destino, tipo="pedido", subtipo="Pedido", etiqueta=pe.codigo,
                       titulo=str((pe.datos or {}).get("pedido") or ""), ruta=f"/informes/{pe.semana_id}")
                g.arista(f"sr:{pe.semana_id}", destino, "pedido", True, "pedido de la semana")
        g.arista(r.origen, destino, r.tipo, True, ETIQUETA_RELACION.get(r.tipo, "relacionado con"))

    # El equipo: quién creó cada documento y quién está en cada proyecto. Es
    # dato interno (como la autoría de las versiones): no lo ve el invitado.
    if ver_autoria:
        usuarios = {u.id: u for u in (await sesion.execute(select(Usuario))).scalars().all()}

        def nodo_usuario(uid: int | None) -> str | None:
            u = usuarios.get(uid) if uid else None
            if not u:
                return None
            nid = f"usuario:{u.id}"
            g.nodo(nid, tipo="usuario", subtipo="Equipo", etiqueta=u.nombre_completo, titulo=u.cargo or "")
            return nid

        for d in docs:
            if (u := nodo_usuario(d.responsable_id or d.creado_por)):
                g.arista(u, f"doc:{d.id}", "equipo", True, "a cargo de" if d.responsable_id else "elaboró")
        for p in proyectos:
            if (u := nodo_usuario(p.responsable_id)):
                g.arista(u, f"pl:{p.id}", "equipo", True, "responsable de")
        for m in (await sesion.execute(select(ProyectoMiembro))).scalars().all():
            if (u := nodo_usuario(m.usuario_id)):
                g.arista(u, f"pl:{m.proyecto_id}", "equipo", True, "integra")

    return g.salida()


def vecindad(grafo: dict, foco: str, saltos: int = 1, excluir: frozenset[str] = frozenset({"copia", "equipo"})) -> dict:
    """Solo `foco` y lo que está a `saltos` de él (el «mapa local» de la
    ventanita de un documento o proyecto). Sin copias de rutina ni equipo:
    unirían el documento con casi todo."""
    aristas = [a for a in grafo["aristas"] if a["tipo"] not in excluir]
    cerca = {foco}
    frontera = {foco}
    for _ in range(max(1, min(saltos, 2))):
        nueva = set()
        for a in aristas:
            if a["source"] in frontera and a["target"] not in cerca:
                nueva.add(a["target"])
            if a["target"] in frontera and a["source"] not in cerca:
                nueva.add(a["source"])
        cerca |= nueva
        frontera = nueva
    return {
        "nodos": [n for n in grafo["nodos"] if n["id"] in cerca],
        "aristas": [a for a in aristas if a["source"] in cerca and a["target"] in cerca],
    }


# --- correspondencia: quién respondió lo enviado (puras) ---------------------
# Estadísticas y el Mapa leen lo MISMO (Edison 2026-10-19: «que estadísticas y el módulo de
# relaciones trabajen de manera colaborativa»): las cifras de respuesta salen de las aristas
# de este grafo, y el mapa las muestra en la ficha de cada institución, persona y oficio.

ESTADOS_ENVIADOS = {"ENVIADO", "OBSERVADO_ENVIADO"}


def _dia(texto: str | None):
    from datetime import date

    try:
        return date.fromisoformat(str(texto or "")[:10])
    except ValueError:
        return None


def respuestas(mapa: dict) -> dict[str, list[dict]]:
    """`doc:N` → los nodos que lo responden: el externo registrado como «respondido por»,
    otro documento del sistema que «responde a» él, o un recibido que lo contesta
    (`entrada:M` → `doc:N`, servicios/entradas.py). Lo que NUESTRO oficio responde no cuenta."""
    nodos = {n["id"]: n for n in mapa["nodos"]}
    salida: dict[str, list[dict]] = {}
    for a in mapa["aristas"]:
        origen, destino, tipo = a["source"], a["target"], a["tipo"]
        if tipo == "respondido" and origen.startswith("doc:"):
            doc, resp = origen, destino
        elif tipo == "responde" and destino.startswith("doc:"):
            doc, resp = destino, origen
        else:
            continue
        if resp in nodos:
            salida.setdefault(doc, []).append(nodos[resp])
    return salida


def _promedio(dias: list[int]) -> int | None:
    return round(sum(dias) / len(dias)) if dias else None


def correspondencia(mapa: dict, hoy) -> dict:
    """De los oficios enviados: cuántos tienen respuesta, en cuántos días (de la fecha del
    oficio a la de la respuesta) y, por institución y persona destinataria (las aristas
    «dirigido a» del mapa), lo mismo. `pendientes`: los enviados sin respuesta, del más
    antiguo al más reciente. `por_nodo` alimenta las fichas del mapa."""
    nodos = {n["id"]: n for n in mapa["nodos"]}
    resp = respuestas(mapa)
    destinos: dict[str, list[str]] = {}
    for a in mapa["aristas"]:
        if a["tipo"] == "destinatario" and a["source"].startswith("doc:") and a["target"] in nodos:
            if nodos[a["target"]]["tipo"] in ("institucion", "persona"):
                destinos.setdefault(a["source"], []).append(a["target"])
    por_doc: dict[str, dict] = {}
    for n in mapa["nodos"]:
        if n.get("tipo") != "documento" or n.get("estado") not in ESTADOS_ENVIADOS:
            continue
        emitido = _dia(n.get("fecha"))
        fechas = sorted(f for f in (_dia(r.get("fecha")) for r in resp.get(n["id"], [])) if f)
        dias = (fechas[0] - emitido).days if emitido and fechas and fechas[0] >= emitido else None
        por_doc[n["id"]] = {
            "respondido": n["id"] in resp, "dias": dias,
            "espera": (hoy - emitido).days if emitido and n["id"] not in resp else None,
        }
    por_nodo: dict[str, dict] = {}
    for doc, d in por_doc.items():
        for destino in dict.fromkeys(destinos.get(doc, [])):
            fila = por_nodo.setdefault(destino, {"enviados": 0, "respondidos": 0, "_dias": []})
            fila["enviados"] += 1
            if d["respondido"]:
                fila["respondidos"] += 1
                if d["dias"] is not None:
                    fila["_dias"].append(d["dias"])
    for fila in por_nodo.values():
        fila["sin_respuesta"] = fila["enviados"] - fila["respondidos"]
        fila["dias_promedio"] = _promedio(fila.pop("_dias"))
    instituciones = sorted(
        ({"foco": nid, "nombre": nodos[nid].get("titulo") or nodos[nid].get("etiqueta") or "", **fila}
         for nid, fila in por_nodo.items() if nodos[nid]["tipo"] == "institucion"),
        key=lambda f: (-f["enviados"], f["nombre"]),
    )
    pendientes = sorted(
        ({"foco": doc, "numero": nodos[doc].get("etiqueta") or "", "asunto": nodos[doc].get("titulo") or "",
          "fecha": nodos[doc].get("fecha") or "", "espera": d["espera"],
          "destino": ", ".join(nodos[x].get("etiqueta") or "" for x in dict.fromkeys(destinos.get(doc, []))
                               if nodos[x]["tipo"] == "institucion")}
         for doc, d in por_doc.items() if not d["respondido"]),
        key=lambda f: (-(f["espera"] or -1), f["numero"]),
    )
    dias = [d["dias"] for d in por_doc.values() if d["dias"] is not None]
    respondidos = sum(1 for d in por_doc.values() if d["respondido"])
    return {
        "enviados": len(por_doc), "respondidos": respondidos, "sin_respuesta": len(por_doc) - respondidos,
        "dias_promedio": _promedio(dias),
        "por_institucion": instituciones[:12],
        "pendientes": pendientes[:10],
        "por_nodo": por_nodo, "por_doc": por_doc,
    }


def anotar_correspondencia(mapa: dict, hoy) -> dict:
    """El mapa con la correspondencia en sus nodos: `correspondencia` en cada institución y
    persona destinataria, `respuesta` en cada oficio enviado (la ficha del mapa los muestra)."""
    c = correspondencia(mapa, hoy)
    nodos = []
    for n in mapa["nodos"]:
        if n["id"] in c["por_nodo"]:
            n = {**n, "correspondencia": c["por_nodo"][n["id"]]}
        elif n["id"] in c["por_doc"]:
            n = {**n, "respuesta": c["por_doc"][n["id"]]}
        nodos.append(n)
    return {**mapa, "nodos": nodos}


def foco_por_nombre(mapa: dict) -> tuple[dict[str, str], dict[str, str]]:
    """Para que una fila de Estadísticas abra su nodo del mapa: institución por nombre plano
    (el formato de la bandeja, servicios/instituciones_destino.py) y persona por nombre
    comparable (`nombre_de_persona`, el mismo que une destinatarios con el directorio)."""
    from app.servicios import instituciones_destino as svc_inst

    inst: dict[str, str] = {}
    pers: dict[str, str] = {}
    for n in mapa["nodos"]:
        if n.get("tipo") == "institucion":
            for texto in (n.get("titulo"), n.get("etiqueta")):
                if texto:
                    inst.setdefault(svc_inst.plano(svc_inst.nombre_propio(texto)), n["id"])
        elif n.get("tipo") == "persona" and n.get("etiqueta"):
            pers.setdefault(nombre_de_persona(n["etiqueta"]), n["id"])
    return inst, pers


# --- los archivos de cada documento (solo en el mapa local) -----------------

# Qué es cada archivo según su categoría (las de `Adjunto.categoria`; los
# prefijos de nombre correspondientes, en servicios/nombres.py).
ARCHIVO = {
    "firmado": ("Documento firmado", "firmado", "su versión firmada"),
    "recepcion": ("Cargo de recepción", "recepcion", "su cargo de recepción"),
    "respuesta": ("Archivo de la respuesta", "respuesta", "archivo de la respuesta"),
    "": ("Adjunto", "adjunto", "adjunto"),
}


def agregar_archivos(sub: dict, adjuntos: list, foco: str, expediente: str | None = None) -> dict:
    """Suma a la vecindad `sub` los archivos de sus documentos: los del foco y
    los de los documentos a un salto de él (más lejos, el mapa se llenaría de
    papeles ajenos). El archivo de una respuesta externa cuelga de esa
    respuesta si está a la vista; si no, de su documento. `expediente` es el
    nombre del expediente del foco, si existe. Pura: recibe los adjuntos ya
    leídos (cualquier objeto con los campos de `Adjunto`)."""
    ids = {n["id"] for n in sub["nodos"]}
    cerca = {foco}
    for a in sub["aristas"]:
        if a["source"] == foco:
            cerca.add(a["target"])
        elif a["target"] == foco:
            cerca.add(a["source"])
    docs = {nid for nid in cerca if nid.startswith("doc:")}
    por_id = {n["id"]: n for n in sub["nodos"]}

    def unir(origen: str, nodo: dict, tipo: str, etiqueta: str) -> None:
        sub["nodos"].append({**nodo, "grado": 1})
        sub["aristas"].append({"source": origen, "target": nodo["id"], "tipo": tipo, "fiable": True, "etiqueta": etiqueta})
        if origen in por_id:
            por_id[origen]["grado"] = por_id[origen].get("grado", 0) + 1

    for adj in adjuntos:
        doc = f"doc:{adj.documento_id}"
        if doc not in docs:
            continue
        subtipo, tipo, etiqueta = ARCHIVO.get(adj.categoria or "", ARCHIVO[""])
        externo = f"ext:{adj.relacion_id}" if adj.relacion_id else ""
        origen = externo if externo in ids else doc
        fecha = adj.subido_en.date().isoformat() if getattr(adj, "subido_en", None) else ""
        unir(origen, {
            "id": f"archivo:{adj.id}", "tipo": "archivo", "subtipo": subtipo, "categoria": tipo,
            "etiqueta": adj.etiqueta or adj.nombre_original, "titulo": adj.nombre_original, "fecha": fecha,
            "archivo": f"/api/documentos/{adj.documento_id}/adjuntos/{adj.id}", "nombre": adj.nombre_original,
            "documento": adj.documento_id,
        }, tipo, etiqueta)
    if expediente and foco.startswith("doc:") and foco in ids:
        did = int(foco.split(":", 1)[1])
        unir(foco, {
            "id": f"expediente:{did}", "tipo": "archivo", "subtipo": "Expediente", "categoria": "expediente",
            "etiqueta": "Expediente", "titulo": expediente, "archivo": f"/api/documentos/{did}/expediente",
            "nombre": expediente, "documento": did,
        }, "expediente", "su expediente")
    return sub


async def con_archivos(sesion: AsyncSession, sub: dict, foco: str) -> dict:
    """La vecindad de `foco` con los archivos de sus documentos (lee los
    adjuntos y, si el foco es un documento, busca su expediente en disco)."""
    docs = [int(n["id"].split(":", 1)[1]) for n in sub["nodos"] if n["id"].startswith("doc:")]
    if not docs:
        return sub
    adjuntos = (
        await sesion.execute(select(Adjunto).where(Adjunto.documento_id.in_(docs)).order_by(Adjunto.subido_en))
    ).scalars().all()
    expediente = None
    if foco.startswith("doc:") and foco.split(":", 1)[1].isdigit():
        doc = await sesion.get(Documento, int(foco.split(":", 1)[1]))
        salida = svc_expediente.existente(doc) if doc is not None else None
        if salida is not None and salida.is_file():
            expediente = salida.name
    return agregar_archivos(sub, list(adjuntos), foco, expediente)


# --- rendiciones de cuentas (2026-10-18) -------------------------------------
#
# Edison: «Vínculos al modo Obsidian, como en otros módulos». Una rendición (`rend:N`) se une a su Semana
# de representación, al memorando que pidió los viáticos, a su comisionado y a la otra rendición de su
# comisión; en el mapa local, además, sus comprobantes (un punto que lleva a la lista), sus otros sustentos
# y el PDF de los Anexos 3 y 4. Solo las rendiciones que la cuenta puede ver (las suyas, las que hizo como
# encargado y, para Administración, todas): el mapa no revela las de otros.


def _desde(grafo: dict) -> Grafo:
    g = Grafo()
    for n in grafo["nodos"]:
        g.nodos[n["id"]] = {k: v for k, v in n.items() if k != "grado"}
    for a in grafo["aristas"]:
        g.aristas[(a["source"], a["target"], a["tipo"])] = a
    return g


def unir_rendiciones(grafo: dict, rendiciones: list[dict]) -> dict:
    """Suma al grafo las rendiciones visibles. `rendiciones`: [{id, codigo, comisionado, corto, usuario_id,
    semana_id, documento_id, comision_id, estado, titulo}]. Las aristas a la semana y al memorando solo si
    esos nodos están (un documento oculto no aparece); el comisionado entra como nodo del equipo. Pura."""
    if not rendiciones:
        return grafo
    g = _desde(grafo)
    for r in rendiciones:
        rid = f"rend:{r['id']}"
        g.nodo(rid, tipo="rendicion", subtipo="Rendición de cuentas", etiqueta=f"{r['codigo']} · {r['corto'] or r['comisionado']}",
               titulo=r.get("titulo") or "", estado=r.get("estado") or "", ruta=f"/rendiciones/{r['id']}")
        if r.get("semana_id"):
            g.arista(rid, f"sr:{r['semana_id']}", "rendicion_semana", True, "de la semana")
        if r.get("documento_id"):
            g.arista(rid, f"doc:{r['documento_id']}", "rendicion_memorando", True, "memorando de viáticos")
        if r.get("usuario_id"):
            uid = f"usuario:{r['usuario_id']}"
            g.nodo(uid, tipo="usuario", subtipo="Equipo", etiqueta=r["comisionado"], titulo="")
            g.arista(uid, rid, "comisionado", True, "comisionado")
    por_comision: dict[int, list[str]] = {}
    for r in rendiciones:
        if r.get("comision_id"):
            por_comision.setdefault(r["comision_id"], []).append(f"rend:{r['id']}")
    for ids in por_comision.values():
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                g.arista(a, b, "comision", True, "misma comisión")
    return g.salida()


def agregar_sustentos(sub: dict, rid: int, comprobantes: int, anexos: list[dict], pdf: str = "") -> dict:
    """En el mapa LOCAL de una rendición: un punto con sus comprobantes (lleva a la lista; serían decenas de
    puntos), cada otro sustento (boleta aérea, recibo de devolución) y el PDF de los Anexos 3 y 4, que se
    abren desde el mapa. `anexos`: [{id, descripcion, archivo}]. Pura."""
    foco = f"rend:{rid}"
    if foco not in {n["id"] for n in sub["nodos"]}:
        return sub

    def unir(nodo: dict, etiqueta: str) -> None:
        sub["nodos"].append({**nodo, "tipo": "archivo", "grado": 1})
        sub["aristas"].append({"source": foco, "target": nodo["id"], "tipo": nodo["categoria"], "fiable": True, "etiqueta": etiqueta})

    if comprobantes:
        unir({"id": f"comprobantes:{rid}", "subtipo": "Comprobantes", "categoria": "comprobantes",
              "etiqueta": f"{comprobantes} comprobante{'s' if comprobantes != 1 else ''}", "titulo": "Boletas, facturas y tickets de la rendición",
              "ruta": f"/rendiciones/{rid}?ver=comprobantes"}, "sus comprobantes")
    for a in anexos:
        unir({"id": f"anexo_rendicion:{a['id']}", "subtipo": "Otro sustento", "categoria": "anexo",
              "etiqueta": a.get("descripcion") or "Sustento", "titulo": a.get("descripcion") or "",
              "archivo": f"/api/rendiciones/{rid}/anexos/{a['id']}/archivo", "nombre": str(a.get("archivo") or "").split("/")[-1]},
             "otro sustento")
    if pdf:
        unir({"id": f"anexos_pdf:{rid}", "subtipo": "Anexos 3 y 4", "categoria": "documento", "etiqueta": "Anexos 3 y 4",
              "titulo": pdf, "archivo": f"/api/rendiciones/{rid}/documento.pdf", "nombre": pdf}, "su documento")
    return sub

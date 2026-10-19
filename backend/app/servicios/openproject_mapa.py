"""Qué es cada cosa de Qillqa en OpenProject (2026-10-02). Puro: sin red ni base de datos.

El Qillqa es el sistema de REGISTRO (documentos, proyectos de ley); OpenProject es el de
PLANIFICACIÓN de la entidad. Para que el Gantt, el calendario y los tableros de OpenProject
muestren el trabajo de Qillqa sin volver a cargarlo, cada elemento se REFLEJA como un paquete
de trabajo con una clave estable en el campo «Ruta en disco»:

    documento producido   → Documento en «documentos»            sgdp:doc:<id>
    documento recibido    → Solicitud recibida en «correspondencia» sgdp:doc:<id>
    proyecto de ley       → Proyecto de Ley en «legislativo»     sgdp:pl:<id>
      └ fase              → Tarea hija, con inicio y límite      sgdp:pl-fase:<id>
          └ tarea         → Tarea hija de su fase (o del PL)     sgdp:pl-tarea:<id>

Lo que Qillqa ESCRIBE en el reflejo (asunto, estado, responsable, fechas, número) es suyo
y se rehace en cada cambio; la DESCRIPCIÓN solo se pone al crear, así los comentarios, los
adjuntos, el tiempo y las notas que el equipo añada en OpenProject nunca se pisan. Lo único
que vuelve de OpenProject a Qillqa es cerrar o reabrir una fase o tarea de un proyecto de ley
(servicios/openproject_sync.py).

Los nombres de estados, tipos y campos son los del modelo que siembra `openproject/`
(seeds/10–15): los flujos de cada tipo solo admiten estos estados.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field

# --- Estados -----------------------------------------------------------------

# Documento: Nuevo → En revisión → Numerado → En firma → Enviado → Recepcionado → Archivado.
ESTADO_DOCUMENTO = {
    "BORRADOR": "Nuevo",
    "EN_REVISION": "En revisión",
    "OBSERVADO": "En revisión",
    "APROBADO": "Numerado",
    "FIRMADO": "En firma",
    "ENVIADO": "Enviado",
    "OBSERVADO_ENVIADO": "Enviado",
    "ARCHIVADO": "Archivado",
}
# Solicitud recibida: Nuevo → Triage → En análisis → En espera → Recepcionado → Archivado.
ESTADO_RECIBIDO = {"ARCHIVADO": "Archivado"}
# Proyecto de Ley: Nuevo → En análisis → Redacción → En revisión → Presentado → En comisión →
# Dictaminado → En pleno → Aprobado (y Rechazado).
ESTADO_PL = {
    "idea": "Nuevo",
    "en_elaboracion": "Redacción",
    "en_revision": "En revisión",
    "listo_para_presentar": "En revisión",
    "presentado": "Presentado",
    "en_comision": "En comisión",
    "dictaminado": "Dictaminado",
    "en_pleno": "En pleno",
    "aprobado": "Aprobado",
    "ley_publicada": "Aprobado",
    "archivado": "Rechazado",
    "retirado": "Rechazado",
}
# Tarea: Nuevo → En curso → En espera → Cerrado.
ESTADO_FASE = {"pendiente": "Nuevo", "en_curso": "En curso", "hecha": "Cerrado", "omitida": "Cerrado"}
ESTADO_TAREA = {"por_hacer": "Nuevo", "en_curso": "En curso", "hecha": "Cerrado"}

# Opción del campo «Tipo documental» (perfil de la entidad, `campos.tipo_documental`).
TIPO_DOCUMENTAL = {
    "oficio": "Oficio", "oficio_bancada": "Oficio",
    "oficio_multiple": "Oficio múltiple", "oficio_multiple_bancada": "Oficio múltiple",
    "memorando": "Memorando", "informe": "Informe", "solicitud": "Solicitud", "acta": "Acta",
    "carta": "Oficio",
}

# Campos personalizados (seed 13): la clave de enlace y los que se llenan.
CAMPO_CLAVE = "Ruta en disco"


@dataclass
class Item:
    """Un paquete de trabajo tal como Qillqa lo quiere en OpenProject."""

    clave: str
    proyecto: str  # identificador del proyecto de OpenProject
    tipo: str  # nombre del tipo de paquete
    asunto: str
    estado: str  # nombre del estado
    responsable_id: int | None = None  # usuario de Qillqa (se traduce a OpenProject)
    inicio: str = ""
    fin: str = ""
    padre: str = ""  # clave del padre
    textos: dict = field(default_factory=dict)  # campos de texto por nombre
    listas: dict = field(default_factory=dict)  # campos de lista por nombre → opción
    enlace: str = ""  # dirección en Qillqa
    descripcion: str = ""  # solo al crear

    def huella(self, op_responsable: int | None) -> str:
        """Resume lo que se ESCRIBE (no la descripción): si no cambia, no se reenvía."""
        datos = asdict(self)
        datos.pop("descripcion")
        datos["responsable_id"] = op_responsable
        return hashlib.sha256(json.dumps(datos, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _fecha(v: str | None) -> str:
    v = (v or "").strip()[:10]
    return v if len(v) == 10 and v[4] == "-" and v[7] == "-" else ""


def _enlace(base: str, ruta: str) -> str:
    return f"{base.rstrip('/')}{ruta}" if base else ""


def _descripcion(enlace: str, que: str) -> str:
    pie = "Reflejado desde Qillqa: el asunto, el estado, el responsable y las fechas se actualizan solos."
    if enlace:
        return f"{que} — [abrir en Qillqa]({enlace})\n\n_{pie}_"
    return f"{que}\n\n_{pie}_"


def numero_documento(tipo_nombre: str, numero: int | None, periodo: str) -> str:
    """«OFICIO N° 033-2026-2027» o «(sin numerar)»: lo que va en «N° Documento»."""
    if numero in (None, ""):
        return "(sin numerar)"
    return f"{tipo_nombre.upper()} N° {int(numero):03d}-{periodo}"


def item_documento(d: dict, *, base_sgdp: str, proyecto_documentos: str, proyecto_recibidos: str) -> Item | None:
    """`d`: id, tipo, tipo_nombre, numero, periodo, estado, asunto, responsable_id, recibido.
    Devuelve None para lo que no se refleja (anulados)."""
    estado = d.get("estado") or ""
    if estado == "ANULADO":
        return None
    enlace = _enlace(base_sgdp, f"/documentos/{d['id']}")
    numero = numero_documento(d.get("tipo_nombre") or d.get("tipo") or "documento", d.get("numero"), d.get("periodo") or "")
    asunto = (d.get("asunto") or "").strip() or f"{d.get('tipo_nombre') or 'Documento'} {numero}"
    if d.get("recibido"):
        return Item(
            clave=f"sgdp:doc:{d['id']}", proyecto=proyecto_recibidos, tipo="Solicitud recibida",
            asunto=asunto[:250], estado=ESTADO_RECIBIDO.get(estado, "Nuevo"),
            responsable_id=d.get("responsable_id"), textos={"N° Documento": numero}, enlace=enlace,
            descripcion=_descripcion(enlace, f"Documento recibido {numero}"),
        )
    pelota = "De tercero" if estado in ("ENVIADO", "OBSERVADO_ENVIADO") else "Ninguna" if estado == "ARCHIVADO" else "Nuestra"
    listas = {"Pelota": pelota}
    if d.get("tipo") in TIPO_DOCUMENTAL:
        listas["Tipo documental"] = TIPO_DOCUMENTAL[d["tipo"]]
    return Item(
        clave=f"sgdp:doc:{d['id']}", proyecto=proyecto_documentos, tipo="Documento",
        asunto=asunto[:250], estado=ESTADO_DOCUMENTO.get(estado, "Nuevo"),
        responsable_id=d.get("responsable_id"), textos={"N° Documento": numero}, listas=listas,
        enlace=enlace, descripcion=_descripcion(enlace, numero if d.get("numero") not in (None, "") else f"{d.get('tipo_nombre') or 'Documento'} sin numerar"),
    )


def items_proyecto(p: dict, fases: list[dict], tareas: list[dict], *, base_sgdp: str, proyecto_legislativo: str) -> list[Item]:
    """El proyecto de ley y, debajo, sus fases y tareas, padres antes que hijos.
    `p`: id, codigo, titulo, estado, responsable_id, numero_oficial, comisiones.
    `fases`: id, nombre, estado, responsable_id, inicio, limite, ambito.
    `tareas`: id, fase_id, titulo, estado, responsable_id, limite."""
    base = _enlace(base_sgdp, f"/proyectos/{p['id']}")
    clave_pl = f"sgdp:pl:{p['id']}"
    textos = {"N° Documento": p.get("numero_oficial") or ""}
    if p.get("comisiones"):
        textos["Comisión"] = p["comisiones"][:250]
    salida = [Item(
        clave=clave_pl, proyecto=proyecto_legislativo, tipo="Proyecto de Ley",
        asunto=f"{p['codigo']} · {p['titulo']}"[:250], estado=ESTADO_PL.get(p.get("estado") or "", "Nuevo"),
        responsable_id=p.get("responsable_id"), textos={k: v for k, v in textos.items() if v},
        enlace=base, descripcion=_descripcion(base, f"Proyecto de ley {p['codigo']}"),
    )]
    for f in fases:
        enlace = f"{base}?ir=fase:{f['id']}" if base else ""
        salida.append(Item(
            clave=f"sgdp:pl-fase:{f['id']}", proyecto=proyecto_legislativo, tipo="Tarea",
            asunto=f"{p['codigo']} · {f['nombre']}"[:250], estado=ESTADO_FASE.get(f.get("estado") or "", "Nuevo"),
            responsable_id=f.get("responsable_id"), inicio=_fecha(f.get("inicio")), fin=_fecha(f.get("limite")),
            padre=clave_pl, enlace=enlace,
            descripcion=_descripcion(enlace, f"Fase «{f['nombre']}» del proyecto {p['codigo']}"),
        ))
    for t in tareas:
        enlace = f"{base}?ir=tarea:{t['id']}" if base else ""
        salida.append(Item(
            clave=f"sgdp:pl-tarea:{t['id']}", proyecto=proyecto_legislativo, tipo="Tarea",
            asunto=(t.get("titulo") or "Tarea")[:250], estado=ESTADO_TAREA.get(t.get("estado") or "", "Nuevo"),
            responsable_id=t.get("responsable_id"), fin=_fecha(t.get("limite")),
            padre=f"sgdp:pl-fase:{t['fase_id']}" if t.get("fase_id") else clave_pl, enlace=enlace,
            descripcion=_descripcion(enlace, f"Tarea del proyecto {p['codigo']}"),
        ))
    return salida


def usuarios_op(sgdp: list[dict], op: list[dict]) -> dict[int, int]:
    """Usuario de Qillqa → usuario de OpenProject: por correo y, si no, por nombre de usuario
    (el «login» de OpenProject). `sgdp`: id, email, nombre_usuario. `op`: id, email, login."""
    por_correo = {(u.get("email") or "").strip().lower(): u["id"] for u in op if u.get("email")}
    por_login = {(u.get("login") or "").strip().lower(): u["id"] for u in op if u.get("login")}
    salida: dict[int, int] = {}
    for u in sgdp:
        correo = (u.get("email") or "").strip().lower()
        login = (u.get("nombre_usuario") or "").strip().lower()
        op_id = por_correo.get(correo) if correo else None
        if op_id is None and login:
            op_id = por_login.get(login)
        if op_id is not None:
            salida[u["id"]] = op_id
    return salida


def cierre_desde_op(clave: str, cerrado: bool, estado_sgdp: str) -> str | None:
    """Lo que vuelve de OpenProject: una fase o tarea de un PL cerrada o reabierta ALLÁ.
    Devuelve el estado nuevo de Qillqa, o None si ya coincide o no aplica."""
    if clave.startswith("sgdp:pl-tarea:"):
        if cerrado and estado_sgdp != "hecha":
            return "hecha"
        if not cerrado and estado_sgdp == "hecha":
            return "por_hacer"
    elif clave.startswith("sgdp:pl-fase:"):
        if cerrado and estado_sgdp not in ("hecha", "omitida"):
            return "hecha"
        if not cerrado and estado_sgdp in ("hecha", "omitida"):
            return "en_curso"
    return None

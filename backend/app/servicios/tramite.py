"""Seguimiento del TRÁMITE de un documento: los cuatro hitos de la ruta del
oficio y el «check verde» que indica que el proceso está completo.

Pedido de Edison 2026-09-04. La ruta real del oficio en la Cámara de Diputados
(Reglamento, arts. 31.º, 102.º, 34.º inc. i) tiene cuatro hitos verificables
dentro del sistema:

    1. GENERADO   — el documento tiene número oficial (lo asignó /generar).
    2. ENVIADO    — salió de la entidad a la entidad destinataria.
    3. CONSTANCIA — está el cargo/constancia de recepción sellada, una por
                    destinatario (mismo criterio que el n/m de la bandeja).
    4. STD        — quedó registrado en el Sistema de Trámite Documentario del
                    Congreso, con su número de expediente.

El ORDEN importa y el sistema lo hace cumplir: no se puede marcar el registro
en el STD sin tener antes la constancia de recepción (`puede_registrar_std`),
porque en Mesa de Partes / Oficialía Mayor se registra el cargo, no el oficio
suelto. Cuando los cuatro hitos están, `completo` es True: es el check verde.

Además de esos cuatro hitos —que son los del OFICIO ya nacido—, `etapas()`
devuelve la ruta COMPLETA del proceso, desde que alguien se sienta a redactar
hasta el registro en el STD (Edison 2026-09-05). Es lo que numera los botones
del sistema: cada botón lleva el número del paso que ejecuta, los pasos ya
hechos se ven atenuados y el que toca ahora, resaltado. Al entrar, cualquiera
ve por dónde empezar y qué sigue.

Este módulo NO decide estados (eso es flujo.py) ni escribe: solo LEE y calcula,
para que la bandeja, el editor y las estadísticas usen exactamente el mismo
criterio.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento
from app.servicios import ambito as svc_ambito

# Estados en los que el documento ya salió de la entidad hacia la entidad.
# ARCHIVADO no basta por sí solo (se puede archivar un borrador): exige que el
# documento esté numerado y tenga al menos una constancia.
_ESTADOS_ENVIADO = {"ENVIADO", "OBSERVADO_ENVIADO"}

# Etiqueta de cada hito, en el orden de la ruta.
HITOS = ("generado", "enviado", "constancia", "std")
ETIQUETA_HITO = {
    "generado": "Generado y numerado",
    "enviado": "Enviado a la entidad",
    "constancia": "Constancia de recepción",
    "std": "Registrado en el STD del Congreso",
}


def destinatarios(doc: Documento) -> list[str]:
    """Destinatarios del documento (mismo criterio que la bandeja y envio.py):
    líneas «Nombre — Cargo» de `destinatario_nombre`, tomando lo anterior a
    « — »."""
    return [
        linea.split(" — ", 1)[0].strip()
        for linea in ((doc.campos or {}).get("destinatario_nombre") or "").splitlines()
        if linea.strip()
    ]


def estado(
    doc: Documento,
    firmado_id: int | None,
    recepciones: int,
    ambito: str = svc_ambito.EXTERNO,
) -> dict:
    """Los hitos de un documento, ya con sus adjuntos contados.

    `firmado_id` y `recepciones` vienen de `adjuntos.por_categoria` (una sola
    consulta para toda la bandeja). Devuelve el dict que consume el frontend.

    Los hitos que APLICAN dependen del ámbito (Edison 2026-09-05): un documento
    INTERNO circula por el STD del Congreso y no devuelve cargo sellado, así
    que la constancia no cuenta para darlo por completo. Uno EXTERNO sí la
    necesita: es la única prueba de que la entidad lo recibió.
    """
    requeridas = max(1, len(destinatarios(doc)))
    generado = doc.numero is not None
    con_constancia = recepciones >= requeridas
    std = bool(doc.std_registrado)
    interno = ambito == svc_ambito.INTERNO
    enviado = doc.estado in _ESTADOS_ENVIADO or (
        doc.estado == "ARCHIVADO" and generado and (recepciones > 0 or (interno and std))
    )
    hitos = {
        "generado": generado,
        "enviado": enviado,
        "constancia": con_constancia,
        "std": std,
    }
    # En los internos la constancia queda fuera de la cuenta: ni suma ni falta.
    aplican = [h for h in HITOS if not (interno and h == "constancia")]
    hechos = sum(1 for h in aplican if hitos[h])
    return {
        **hitos,
        "ambito": ambito,
        "ambito_automatico": svc_ambito.es_automatico(doc),
        # Qué hitos cuentan para este documento (el frontend pinta solo esos).
        "hitos_aplicables": aplican,
        # Detalle del avance de constancias (n/m), para el tooltip.
        "recepciones": recepciones,
        "recepciones_requeridas": requeridas,
        "firmado": firmado_id is not None,
        "hechos": hechos,
        "total": len(aplican),
        # El check verde: la ruta documental está completa.
        "completo": hechos == len(aplican),
        # Siguiente paso pendiente (lo que el usuario debe hacer ahora).
        "siguiente": next((h for h in aplican if not hitos[h]), ""),
        "std_numero": doc.std_numero or "",
        "std_fecha": doc.std_fecha or "",
        # El n.º que le dio la entidad destinataria (leído del cargo o escrito a mano).
        "expediente_entidad": doc.expediente_entidad or "",
    }


# --------------------------------------------------------------------------
# RUTA COMPLETA DEL PROCESO (los pasos numerados de la interfaz)
# --------------------------------------------------------------------------
# Los cuatro HITOS de arriba miden el oficio ya numerado. Estas ETAPAS miden
# todo el proceso de la entidad, incluidos los pasos previos que el usuario
# tiene que dar (redactar, mandar a revisar, aprobar) y la firma. El orden es
# el real: cada paso supone hecho el anterior.
#
# `accion` es la clave con la que el frontend empareja cada BOTÓN con su paso;
# si un botón no tiene etapa, simplemente no lleva número.
# Ayudas breves (Edison 2026-10-06: «breves, precisos y fáciles de entender»).
ETAPAS = (
    {
        "clave": "redactar",
        "titulo": "Redactar",
        # No hay botón numerado para este paso: el paso ES el formulario
        # (sub-numerales 1.1…1.7). «Guardar» es una acción transversal, no una
        # etapa (Edison 2026-09-05).
        "accion": "redactar",
        "ayuda": "Llene destinatario, asunto y cuerpo, y guarde.",
    },
    # Paso OPCIONAL: se puede hacer cuantas veces se quiera y no detiene el
    # flujo. Lleva número propio para que quede claro que es distinto de
    # Guardar y de Generar (Edison 2026-09-05), pero el «paso que toca» lo
    # salta si está pendiente.
    {
        "clave": "previsualizar",
        "titulo": "Vista previa",
        "accion": "previsualizar",
        "opcional": True,
        "ayuda": "Opcional: ver el PDF sin asignar número.",
    },
    {
        "clave": "revisar",
        "titulo": "Enviar a revisión",
        "accion": "revision",
        "ayuda": "Pasarlo al diputado o al asesor.",
    },
    {
        "clave": "generado",
        "titulo": "Generar oficial",
        "accion": "generar",
        "ayuda": "Asigna el número oficial. Es irreversible.",
    },
    {
        "clave": "firmado",
        "titulo": "Firmar",
        "accion": "firmado",
        "ayuda": "Suba el PDF firmado (escaneado o digital).",
    },
    {
        "clave": "enviado",
        "titulo": "Enviar",
        "accion": "enviar",
        # 2026-10-10 (Edison): el botón ABRE la mesa de partes; «enviado» lo marca el cargo.
        "ayuda": "Abra la mesa de partes de la entidad y haga el envío; queda «enviado» al subir el cargo.",
    },
    {
        "clave": "constancia",
        "titulo": "Cargo de recepción",
        "accion": "recepcion",
        "ayuda": "Suba el cargo sellado de la entidad: con él, el documento pasa a «enviado».",
    },
    {
        "clave": "std",
        "titulo": "Registrar en el STD",
        "accion": "std",
        "ayuda": "Anote el n.º de expediente del STD (en los internos, con eso queda enviado).",
    },
)

# Estados que prueban que el documento YA salió de la mesa de redacción.
_ESTADOS_REVISADOS = {
    "EN_REVISION", "OBSERVADO", "APROBADO", "FIRMADO",
    "ENVIADO", "OBSERVADO_ENVIADO", "ARCHIVADO",
}


def _cuerpo_con_texto(cuerpo: dict | None) -> bool:
    """¿El cuerpo TipTap tiene algún texto? El borrador recién creado trae un
    párrafo VACÍO (CUERPO_VACIO), así que mirar solo `content` daba «Redactar»
    por hecho en un documento sin una sola letra (Edison 2026-09-05)."""
    pila = list((cuerpo or {}).get("content", []) or [])
    while pila:
        n = pila.pop()
        if not isinstance(n, dict):
            continue
        if n.get("type") == "text" and (n.get("text") or "").strip():
            return True
        pila.extend(n.get("content", []) or [])
    return False


def _redactado(doc: Documento) -> bool:
    """¿Está redactado? Hace falta el ASUNTO y un cuerpo con TEXTO, guardados.
    Es lo mínimo que hace de un documento algo revisable; con menos, el paso
    sigue pendiente aunque se haya guardado."""
    campos = doc.campos or {}
    asunto = (campos.get("asunto") or campos.get("sumilla_solicito") or "").strip()
    # Un documento del archivo (.tex a mano) o elaborado fuera del sistema
    # (PDF de Word) tiene el cuerpo FUERA del editor: su `cuerpo` TipTap está
    # vacío a propósito. Exigirle texto dejaba «Redactar» pendiente para
    # siempre y la ruta señalaba el paso 1 en un documento ya numerado.
    if doc.origen != "sgdp":
        return bool(asunto)
    return bool(asunto) and _cuerpo_con_texto(doc.cuerpo)


def etapas(doc: Documento, hitos: dict) -> list[dict]:
    """La ruta completa del proceso con el avance de ESTE documento.

    Devuelve, por etapa, `hecho` (ya pasó) y `actual` (es la que toca ahora).
    El frontend numera los botones con `orden`, atenúa los `hecho` y resalta
    el `actual`. Un documento archivado no tiene «paso que toca»: el trámite
    se cortó ahí a propósito.
    """
    logrado = {
        "redactar": _redactado(doc),
        # Vista previa: hay un PDF compilado (con o sin número).
        "previsualizar": bool(doc.pdf_archivo),
        "revisar": doc.estado in _ESTADOS_REVISADOS,
        "generado": hitos["generado"],
        "firmado": hitos["firmado"],
        "enviado": hitos["enviado"],
        "constancia": hitos["constancia"],
        "std": hitos["std"],
    }
    # Un documento INTERNO no lleva el paso del cargo de recepción: su ruta
    # tiene seis pasos en vez de siete, y se renumeran para que no quede un
    # hueco (Edison 2026-09-05).
    # Un INTERNO tampoco lleva «Enviar» (2026-10-10): sale por el STD del Congreso, no por
    # una mesa de partes, y registrarlo ahí es lo que lo da por enviado.
    interno = hitos.get("ambito") == svc_ambito.INTERNO
    aplican = [e for e in ETAPAS if not (interno and e["clave"] in ("constancia", "enviado"))]
    # El primer paso pendiente es el que toca; si el documento está archivado
    # o ya terminó, no se resalta ninguno.
    # El paso que toca es el primer pendiente NO opcional: la vista previa
    # nunca «detiene» el flujo.
    pendiente = next(
        (e["clave"] for e in aplican if not logrado[e["clave"]] and not e.get("opcional")),
        "",
    )
    if doc.estado == "ARCHIVADO":
        pendiente = ""
    # Paso OBSERVADO (Edison 2026-09-05): el documento volvió atrás con una
    # observación. Se marca la etapa donde ocurrió —la revisión, o el envío si
    # fue después de enviado— para que la ruta lo diga sin abrir el panel.
    observada = (
        "revisar" if doc.estado == "OBSERVADO"
        else "enviado" if doc.estado == "OBSERVADO_ENVIADO"
        else ""
    )
    return [
        {
            **e,
            "opcional": bool(e.get("opcional")),
            "orden": i + 1,
            "hecho": logrado[e["clave"]],
            "actual": e["clave"] == pendiente,
            "estado": "observado" if e["clave"] == observada else "",
        }
        for i, e in enumerate(aplican)
    ]


async def de_documento(sesion: AsyncSession, doc: Documento) -> dict:
    """`estado()` para UN documento (editor y vista heredada)."""
    filas = (
        await sesion.execute(
            select(Adjunto).where(
                Adjunto.documento_id == doc.id,
                Adjunto.categoria.in_(["firmado", "recepcion"]),
            )
        )
    ).scalars().all()
    firmado = next((a.id for a in filas if a.categoria == "firmado"), None)
    recepciones = sum(1 for a in filas if a.categoria == "recepcion")
    ambito = svc_ambito.clasificar(doc, await svc_ambito.indice_congreso(sesion))
    hitos = estado(doc, firmado, recepciones, ambito)
    # La vista interna del documento numera sus botones con esta ruta.
    return {**hitos, "etapas": etapas(doc, hitos)}


def puede_registrar_std(tramite: dict) -> tuple[bool, str]:
    """¿Se puede marcar el registro en el STD? Regla de la entidad: primero la
    constancia de recepción; sin ella no hay nada que registrar.

    Devuelve (permitido, motivo). El motivo es el mensaje que ve el usuario.
    """
    if not tramite["generado"]:
        return False, "Primero genere el número oficial."
    # En un documento INTERNO el registro en el STD ES la constancia: pedirle
    # antes un cargo sellado sería pedir algo que nadie devuelve.
    if tramite.get("ambito") == svc_ambito.INTERNO:
        return True, ""
    if not tramite["constancia"]:
        # Breve (Edison 2026-10-06): el motivo sale como ayuda del botón.
        return False, (
            f"Falta el cargo de recepción ({tramite['recepciones']}/"
            f"{tramite['recepciones_requeridas']})."
        )
    return True, ""

"""backend/app/servicios/registro_chat.py — LO QUE EL CHAT REGISTRA EN QILLQA (fase 10.2b, Rimay R1b, 2026-10-20).

El chat (proyecto Rimay) guarda los mensajes y sus archivos; QUÉ se reconoce en ellos y DÓNDE entra es de Qillqa:
los formatos de los prompts pegados (`servicios/pegado`), las rutas de sus módulos, Mesa de Partes, la Mediateca, la
Agenda, Prensa y el seguimiento. El chat lo pide por «registro.v1»:

- `reconocer_mensaje(texto, mensaje_id, con_pdf)`: si el texto trae un bloque `tipo: …`, la contestación del sistema
  {texto, acciones} («Reconocí un formato…» y sus botones «Registrar» / «Abrir y revisar»); None si no trae;
- `bloque_recibido(texto)`: ¿trae un bloque `documento-recibido` válido? (sus imágenes son el documento);
- `ofrecer_archivo(nombre, con_bloque_recibido)`: qué ofrecer con un archivo subido (Mesa de Partes o la Mediateca);
- `registrar(...)`: «Registrar» el bloque de un mensaje en su módulo (con su constancia y el evento «chat.reconocido»);
- `archivo(...)`: un archivo del chat entra por la puerta que le toca (Recibidos o la Mediateca);
- `clasificar(nombre, como_foto)` y `de_telegram(...)`: lo que trae el puente de Telegram del chat (Rimay R2).

Las dos últimas trabajan en su propia sesión y hacen commit; el chat cuenta después lo hecho en el canal.
Las reglas puras se prueban en tests/test_chat.py y test_chat_encuestas.py.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from app.servicios.contratos_plataforma import Superficie

# --- el chat reconoce un resultado de prompt pegado (2026-10-12, fase 9.3) ----------------------

RUTA_MODULO = {
    "documento-recibido": ("Mesa de Partes", "/recibidos?subir=1&pegar={mid}"),
    "agenda-actividades": ("Agenda", "/agenda?pegar={mid}"),
    "seguimiento-documento": ("Seguimiento", "/documentos?pegar={mid}"),
    "registro-representacion": ("Semana de representación", "/informes?pegar={mid}"),
    "proyecto-de-ley": ("Proyectos de ley", "/proyectos?pegar={mid}"),
    "documento-administrativo": ("Nuevo documento", "/documentos?nuevo=1&pegar={mid}"),
    "pieza-de-prensa": ("Prensa", "/prensa?ver=piezas&pegar={mid}"),
    "plan-de-tareas": ("Tareas", "/tareas?pegar={mid}"),
    # Rendición de cuentas (2026-10-18): los comprobantes leídos de las fotos van a la rendición abierta.
    "comprobantes-gasto": ("Rendición de cuentas", "/rendiciones?pegar={mid}"),
}
# Lo que el chat puede registrar solo (sin abrir el módulo), con un toque en «Registrar».
REGISTRABLES = ("agenda-actividades", "pieza-de-prensa", "seguimiento-documento", "documento-recibido")
# Lo que se registra revisándolo en un diálogo DENTRO del chat (fase 9.6): el plan de tareas pide casar
# responsables y plazos antes de crear, así que «Registrar en Tareas» abre «Pegar tareas» con el texto
# del mensaje (`componentes/tareas/DialogoPegarTareas.tsx`) en vez de crear a ciegas.
EN_EL_CHAT = {"plan-de-tareas": "pegar_tareas"}


def reconocer(texto: str):
    """La Lectura si el texto trae un bloque `tipo: …` válido; None si no hay bloque. Un bloque
    con errores devuelve la Lectura con `errores` (para decirlo en el chat)."""
    from app.servicios import pegado

    bloque, _ = pegado.extraer_bloque(texto)
    if not bloque:
        return None
    return pegado.interpretar(texto)


def respuesta_reconocido(lectura, mensaje_id: int, con_pdf: bool) -> tuple[str, list[dict]]:
    """Texto y acciones del mensaje del sistema que contesta a un bloque pegado."""
    if not lectura.valido:
        return ("No pude leer el bloque: " + (lectura.errores[0] if lectura.errores else "formato desconocido"), [])
    modulo, ruta = RUTA_MODULO.get(lectura.tipo, (lectura.esquema.titulo if lectura.esquema else lectura.tipo, ""))
    v = lectura.valores
    resumen = ""
    if lectura.tipo == "agenda-actividades":
        n = len(v.get("actividades") or [])
        resumen = f"{n} actividad(es): " + "; ".join(str(a.get("titulo") or "")[:50] for a in (v.get("actividades") or [])[:3])
    elif lectura.tipo == "registro-representacion":
        resumen = f"{len(v.get('actividades') or [])} actividad(es) y {len(v.get('pedidos') or [])} pedido(s)"
    elif lectura.tipo == "plan-de-tareas":
        tareas = v.get("tareas") or []
        resumen = f"{len(tareas)} tarea(s): " + "; ".join(str(t.get("titulo") or "")[:50] for t in tareas[:3]) if tareas else ""
    else:
        resumen = str(v.get("titular") or v.get("asunto") or v.get("titulo") or v.get("documento") or "")[:90]
    texto = f"Reconocí un formato «{lectura.esquema.titulo if lectura.esquema else lectura.tipo}»" + (f": {resumen}." if resumen else ".")
    acciones: list[dict] = []
    if lectura.tipo in EN_EL_CHAT:
        # Una sola acción: revisar y registrar en el mismo chat (no además «Abrir en … y revisar»).
        return texto, [{"texto": f"Registrar en {modulo}", "accion": EN_EL_CHAT[lectura.tipo], "mensaje_id": mensaje_id}]
    if lectura.tipo in REGISTRABLES and (lectura.tipo != "documento-recibido" or con_pdf):
        acciones.append({"texto": f"Registrar en {modulo}", "accion": "registrar", "mensaje_id": mensaje_id})
    elif lectura.tipo == "documento-recibido":
        texto += " Adjunte el PDF o la foto del documento en este mismo mensaje para registrarlo desde aquí."
    if ruta:
        acciones.append({"texto": f"Abrir en {modulo} y revisar", "ruta": ruta.format(mid=mensaje_id)})
    return texto, acciones


def trae_bloque_recibido(texto: str | None) -> bool:
    """¿El texto del mensaje trae un bloque `documento-recibido` válido? (sus imágenes son el documento)."""
    le = reconocer(texto or "")
    return bool(le is not None and le.valido and le.tipo == "documento-recibido")


def ofrecer_archivo(nombre: str, con_bloque_recibido: bool = False) -> list[dict]:
    """Qué ofrece el sistema con un archivo subido: registrarlo en Recibidos (documento) o en la Mediateca (foto o
    video). Una IMAGEN del chat es conversación (2026-10-18, Edison: «al enviar una imagen el chat dice que debe
    registrarse en Mesa de Partes»): se ofrece guardarla en la Mediateca, como cualquier foto. Solo cuenta como
    documento recibido cuando el mensaje trae el bloque `documento-recibido`: ahí la foto ES el documento escaneado.
    Un PDF o un Word siempre son documento. (La nota de voz se queda en el chat: la descarta el chat.)"""
    from app.servicios.ingreso import clasificar

    clase = clasificar(nombre, como_foto=not con_bloque_recibido)
    if clase == "" and not con_bloque_recibido:
        clase = clasificar(nombre, como_foto=False)   # .pdf, .docx…: documento aunque la imagen no lo sea
        if clase == "foto":
            clase = ""
    if clase == "recibido":
        return [{"texto": "Registrar en Mesa de Partes", "accion": "archivo_a_recibidos"}]
    if clase == "foto":
        return [{"texto": "Guardar en la Mediateca", "accion": "archivo_a_mediateca"}]
    return []


def reconocer_mensaje(texto: str, mensaje_id: int, con_pdf: bool) -> dict | None:
    """La contestación del sistema a un bloque pegado: {texto, acciones}; None si el texto no trae bloque."""
    le = reconocer(texto or "")
    if le is None:
        return None
    respuesta, acciones = respuesta_reconocido(le, mensaje_id, con_pdf)
    return {"texto": respuesta, "acciones": acciones}


def _copia(ruta: str, nombre: str) -> Path:
    copia = Path(tempfile.mkdtemp(prefix="qillqa-chat-")) / nombre
    shutil.copy(ruta, copia)
    return copia


async def registrar(texto_mensaje: str, archivos: list[dict], usuario_id: int, mensaje_id: int, canal: str) -> dict:
    """Registra en el módulo lo que el bloque del mensaje trae (los tipos REGISTRABLES), con la constancia del pegado y
    el evento «chat.reconocido». `archivos`: los del mensaje, [{nombre, ruta}] (ruta None si ya no está). → {texto
    para el chat, entidad creada}. Lanza ValueError con el motivo si no se puede. Su propia sesión; hace commit."""
    from app.db import SesionAsincrona
    from app.modelos import Pegado, Usuario
    from app.servicios import eventos_sistema

    le = reconocer(texto_mensaje)
    if le is None or not le.valido:
        raise ValueError("El mensaje no trae un bloque válido.")
    if le.tipo not in REGISTRABLES:
        raise ValueError("Ese formato se registra desde su módulo («Abrir y revisar»).")
    async with SesionAsincrona() as sesion:
        usuario = await sesion.get(Usuario, usuario_id)
        if usuario is None:
            raise ValueError("La cuenta no existe.")
        pegado = Pegado(usuario_id=usuario.id, tipo=le.tipo, version=le.version or 1, fuente=le.fuente, texto=texto_mensaje,
                        campos_propuestos=le.valores, campos_aplicados={}, rechazados=[], entidad="")
        sesion.add(pegado)
        await sesion.flush()
        v = le.valores
        texto, entidad = "", ""
        if le.tipo == "agenda-actividades":
            # Las agenda Tareas y Agenda, por su contrato (fase 10.2b): lo ya agendado no se repite y lo nuevo se cuenta en el
            # tema «Agenda» como lo agendado desde la Agenda.
            from tiqsi.modulo import opcional

            agenda = opcional("agenda.v1")
            if agenda is None:
                raise ValueError("La Agenda no está disponible.")
            hecho = await agenda.registrar_actividades(v.get("actividades") or [], usuario.id)
            creados, existentes = hecho["creados"], hecho["existentes"]
            entidad = f"evento:{creados[0]['id']}" if creados else ""
            pendientes = sum(1 for e in creados if e["estado"] == "propuesto")
            texto = (f"Agendé {len(creados)} actividad(es)" if creados else "No agendé nada") + (f" ({pendientes} por confirmar)" if pendientes else "") \
                + (f"; {len(existentes)} ya estaba(n): {', '.join(existentes)[:120]}" if existentes else "") + "."
            pegado.campos_aplicados = {"eventos": [e["id"] for e in creados]}
        elif le.tipo == "pieza-de-prensa":
            # Las piezas de prensa son del editor de piezas (Awana E4b): por «piezas.v1», que la cuenta a las reglas
            # («prensa.pieza_registrada») por su bandeja.
            from tiqsi.modulo import opcional

            piezas = opcional("piezas.v1")
            if piezas is None:
                raise ValueError("Las piezas de prensa no están disponibles.")
            campos = {k: val for k, val in v.items() if k not in ("observaciones", "documento")}
            pieza = await piezas.registrar(campos, usuario.id, origen="chat", pegado_id=pegado.id)
            entidad = f"pieza:{pieza['id']}"
            texto = f"Registré la pieza de prensa «{pieza['titular'][:80]}» ({pieza['clase'].replace('_', ' ')})."
            pegado.campos_aplicados = campos
        elif le.tipo == "seguimiento-documento":
            # El seguimiento es de Gestión documental: por «documentos.v1» (Qillqasqa Q3d), con su propia sesión.
            from tiqsi.modulo import opcional

            documentos = opcional("documentos.v1")
            if documentos is None:
                raise ValueError("La Gestión documental no está disponible.")
            hecho = await documentos.seguimiento_pegado(texto_mensaje, v.get("documento") or "", usuario.id)
            entidad = hecho["entidad"]
            texto = f"Seguimiento de {hecho['numero']}: {hecho['actuaciones']} actuación(es) por confirmar, {hecho['vinculadas']} respuesta(s) vinculada(s)" + (", tarea de revisión creada" if hecho.get("tarea_id") else "") + "."
            pegado.campos_aplicados = hecho["aplicados"]
        elif le.tipo == "documento-recibido":
            from app.servicios import ingreso
            from app.servicios import pegado as svc_pegado
            from app.servicios.pegado.asignar import con_anexos

            pdf = next((a for a in archivos if ingreso.clasificar(a["nombre"]) == "recibido"), None)
            if pdf is None:
                raise ValueError("Adjunte el PDF o la foto del documento en el mensaje para registrarlo desde aquí.")
            if not pdf.get("ruta"):
                raise ValueError("El archivo del mensaje ya no está en el archivo documental.")
            copia = _copia(pdf["ruta"], pdf["nombre"])
            campos, anexos, _ = svc_pegado.asignar(le)
            campos = con_anexos(campos, anexos)
            eid, texto = await ingreso.a_recibidos(sesion, copia, pdf["nombre"], usuario, f"Llegó por el chat ({usuario.nombre_completo}).", campos)
            if eid is None:
                raise ValueError(texto)
            entidad = f"entrada:{eid}"
            pegado.campos_aplicados = campos
        pegado.entidad = entidad
        await eventos_sistema.emitir_seguro(sesion, "chat.reconocido", entidad or f"mensaje:{mensaje_id}",
                                            {"tipo": le.tipo, "entidad": entidad, "canal": canal, "usuario_id": usuario.id},
                                            clave=f"chat:{mensaje_id}:registrado", usuario=usuario)
        await sesion.commit()
    return {"texto": texto, "entidad": entidad}


async def archivo(ruta: str, nombre: str, usuario_id: int, texto_mensaje: str, ofrecida: str | None) -> dict:
    """Un archivo subido al chat entra por la puerta que le toca: documento → Recibidos (ficha automática, con el
    bloque `documento-recibido` del mensaje si lo trae), foto o video → Mediateca (álbum «Chat de la entidad»). La
    puerta la dice la acción que el mensaje ofreció para ESTE archivo; sin acción, la extensión. → {texto, entidad}.
    ValueError si no es un documento ni una foto. Su propia sesión; hace commit."""
    from app.db import SesionAsincrona
    from app.modelos import Usuario
    from app.servicios import ingreso

    clase = {"archivo_a_recibidos": "recibido", "archivo_a_mediateca": "foto"}.get(ofrecida or "") \
        or ingreso.clasificar(nombre, como_foto=not trae_bloque_recibido(texto_mensaje)) or ingreso.clasificar(nombre)
    if clase not in ("recibido", "foto"):
        raise ValueError("Ese archivo no es un documento ni una foto.")
    copia = _copia(ruta, nombre)
    async with SesionAsincrona() as sesion:
        usuario = await sesion.get(Usuario, usuario_id)
        if usuario is None:
            raise ValueError("La cuenta no existe.")
        if clase == "recibido":
            le = reconocer(texto_mensaje)
            campos = {}
            if le and le.valido and le.tipo == "documento-recibido":
                from app.servicios import pegado as svc_pegado
                from app.servicios.pegado.asignar import con_anexos

                cs, anexos, _ = svc_pegado.asignar(le)
                campos = con_anexos(cs, anexos)
            ident, texto = await ingreso.a_recibidos(sesion, copia, nombre, usuario, f"Llegó por el chat ({usuario.nombre_completo}).", campos)
            entidad = f"entrada:{ident}" if ident else ""
        else:
            ident, texto = await ingreso.a_fototeca(sesion, copia, nombre, usuario, "Chat de la entidad", "Fotos y videos compartidos en el chat de Qillqa.")
            entidad = f"foto:{ident}" if ident else ""
        await sesion.commit()
    return {"texto": texto, "entidad": entidad}


def clasificar(nombre: str, como_foto: bool = False) -> str:
    """«recibido», «foto» o "" por el nombre del archivo (la misma regla de Recibidos y la Mediateca)."""
    from app.servicios.ingreso import clasificar as _c

    return _c(nombre, como_foto)


async def de_telegram(ruta: str, nombre: str, clase: str, usuario_id: int, remitente: str) -> str:
    """Lo que llegó por el grupo de Telegram (el puente es del chat, Rimay R2) entra por la puerta de siempre: un
    documento a Recibidos, una foto o un video a la Mediateca (álbum «Grupo de Telegram»). → el texto para el grupo."""
    from app.db import SesionAsincrona
    from app.modelos import Usuario
    from app.servicios import ingreso

    async with SesionAsincrona() as sesion:
        usuario = await sesion.get(Usuario, usuario_id)
        if usuario is None:
            raise ValueError("La cuenta no existe.")
        if clase == "recibido":
            return (await ingreso.a_recibidos(sesion, Path(ruta), nombre, usuario, f"Llegó por el grupo de Telegram ({remitente})."))[1]
        return (await ingreso.a_fototeca(sesion, Path(ruta), nombre, usuario, "Grupo de Telegram",
                                         "Fotos y videos que el equipo compartió en el grupo (puente automático)."))[1]


REGISTRO_V1 = Superficie("registro.v1", {
    "reconocer_mensaje": lambda: reconocer_mensaje, "bloque_recibido": lambda: trae_bloque_recibido,
    "ofrecer_archivo": lambda: ofrecer_archivo, "registrar": lambda: registrar, "archivo": lambda: archivo,
    "clasificar": lambda: clasificar, "de_telegram": lambda: de_telegram,
})

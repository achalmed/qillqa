"""backend/tests/recorrido_flujos.py — los flujos que no pueden romperse al separar Qillqa en proyectos
(fase 0 de docs/plataforma/propuesta-repositorios.md, 2026-10-20). Uno por cada proyecto que se separa y
por lo que se queda: se corren con tests/recorrido.py contra la instancia de prueba.

Cada flujo va de punta a punta por la API, como la web: crear, cambiar, leer de vuelta y comprobar el
resultado (un PDF que empieza por %PDF, un mensaje que aparece en su canal, una foto citada en su semana).
Los datos llevan «Recorrido <fecha>» para reconocerlos; lo que se puede borrar, se borra.
"""
from __future__ import annotations

import datetime as dt
import io
import os
import subprocess
import time
import traceback
import uuid
from pathlib import Path

import httpx

MARCA = f"Recorrido {dt.datetime.now():%Y-%m-%d %H:%M}"
HOY = dt.date.today()


class Fallo(Exception):
    pass


def _ok(r: httpx.Response, paso: str, *estados: int):
    if r.status_code not in (estados or (200, 201)):
        raise Fallo(f"{paso}: {r.status_code} {r.text[:200]}")
    return r.json() if "json" in r.headers.get("content-type", "") else r


def _id(x) -> int:
    return x if isinstance(x, int) else x["id"]


def doc(parrafos: list[str]) -> dict:
    """Cuerpo TipTap mínimo (el mismo de la siembra de la demo)."""
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in parrafos]}


def pdf_minimo(titulo: str, lineas: list[str]) -> bytes:
    """Un PDF de una página, válido y legible, escrito a mano (como la siembra de la demo)."""
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")  # noqa: E731
    texto = ["BT /F1 15 Tf 72 760 Td (" + esc(titulo) + ") Tj ET"]
    texto += [f"BT /F1 11 Tf 72 {725 - i * 18} Td (" + esc(linea) + ") Tj ET" for i, linea in enumerate(lineas)]
    flujo = "\n".join(texto).encode("latin-1", "replace")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            b"<< /Length %d >>\nstream\n" % len(flujo) + flujo + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    salida, pos = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        pos.append(len(salida))
        salida += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(salida)
    salida += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % p for p in pos)
    return salida + b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)


def jpeg(texto: str) -> bytes:
    """Una foto pequeña y única (cada corrida, otra huella: la Mediateca no la toma por duplicada)."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (640, 480), (40, 90, 140))
    ImageDraw.Draw(img).text((20, 20), f"{texto} {uuid.uuid4().hex}", fill=(255, 255, 255))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=85)
    return b.getvalue()


# --- los flujos -----------------------------------------------------------------------------------------
def documentos(c: httpx.Client, ctx: dict) -> str:
    """Gestión documental: borrador → número oficial → PDF compilado con el marco."""
    d = _id(_ok(c.post("/api/documentos", json={"tipo": "oficio"}), "crear borrador"))
    actual = _ok(c.get(f"/api/documentos/{d}"), "leer borrador")
    campos = {**actual.get("campos", {}), "destinatario_tratamiento": "Señor:", "destinatario_nombre": "Persona de prueba",
              "destinatario_cargo": "Cargo de prueba", "destinatario_institucion": "Institución de prueba",
              "asunto": f"{MARCA}: oficio de punta a punta", "fecha": HOY.isoformat()}
    r = _ok(c.post(f"/api/documentos/{d}/generar", json={"campos": campos, "cuerpo": doc(["Texto del recorrido."]),
                                                         "version_base": actual.get("version"), "copias_verificadas": True}),
            "generar con número")
    pdf = c.get(f"/api/documentos/{d}/pdf")
    if pdf.status_code != 200 or not pdf.content.startswith(b"%PDF"):
        raise Fallo(f"PDF del documento: {pdf.status_code}")
    ctx["documento_id"] = d
    return f"{r.get('numero_completo', 'con número')} y su PDF ({len(pdf.content) // 1024} KB)"


def mesa_de_partes(c: httpx.Client, ctx: dict) -> str:
    """Mesa de Partes: registrar un PDF recibido → responsable y estado → oficio de respuesta vinculado."""
    archivo = ("archivos", (f"RECORRIDO-{uuid.uuid4().hex[:6]}.pdf",
                            pdf_minimo("OFICIO N.° 001-2026-PRUEBA", [MARCA, "Asunto: documento recibido de prueba"]),
                            "application/pdf"))
    r = _ok(c.post("/api/entradas/subir", files=[archivo], data={"via": "mesa_partes"}), "registrar recibido")
    if not r.get("creadas"):
        raise Fallo(f"registrar recibido: no se creó ({r})")
    e = _id(r["creadas"][0])
    _ok(c.put(f"/api/entradas/{e}", json={"responsable_id": ctx["yo"], "asunto": f"{MARCA}: recibido"}), "asignar responsable")
    resp = _ok(c.post(f"/api/entradas/{e}/responder"), "crear la respuesta")
    ficha = _ok(c.get(f"/api/entradas/{e}"), "leer el recibido")
    if ficha.get("respuesta_documento_id") not in (None, resp["id"]) and not resp.get("ya_existia"):
        raise Fallo("la respuesta no quedó vinculada al recibido")
    return f"recibido {e} con respuesta {resp['id']}"


def chat(c: httpx.Client, ctx: dict) -> str:
    """Chat: grupo → mensaje → adjunto → los dos aparecen en el canal."""
    canal = _ok(c.post("/api/chat/canales", json={"clase": "grupo", "nombre": MARCA, "miembros": [ctx["yo"]]}), "crear grupo")
    cid = _id(canal)
    _ok(c.post(f"/api/chat/canales/{cid}/mensajes", json={"texto": f"{MARCA}: hola"}), "mandar mensaje")
    _ok(c.post(f"/api/chat/canales/{cid}/archivos", files=[("archivos", ("prueba.pdf", pdf_minimo("Adjunto", [MARCA]),
                                                                          "application/pdf"))]), "mandar adjunto")
    mensajes = _ok(c.get(f"/api/chat/canales/{cid}/mensajes"), "leer el canal")
    lista = mensajes.get("mensajes", mensajes) if isinstance(mensajes, dict) else mensajes
    textos = " ".join(str(m) for m in lista)
    if f"{MARCA}: hola" not in textos or "prueba" not in textos:
        raise Fallo("el mensaje o el adjunto no aparecen en el canal")
    _ok(c.patch(f"/api/chat/canales/{cid}", json={"archivado": True}), "archivar el grupo")
    return f"grupo {cid} con mensaje y adjunto"


def mediateca(c: httpx.Client, ctx: dict) -> str:
    """Mediateca: subir → ficha → miniatura → etiquetar."""
    r = _ok(c.post("/api/fototeca/subir", files=[("archivos", ("recorrido.jpg", jpeg(MARCA), "image/jpeg"))]), "subir foto")
    if not r.get("nuevas"):
        raise Fallo(f"subir foto: no entró ({r.get('duplicadas') or r.get('rechazadas')})")
    f = _id(r["nuevas"][0])
    _ok(c.get(f"/api/fototeca/{f}"), "leer la ficha")
    mini = c.get(f"/api/fototeca/{f}/miniatura")
    if mini.status_code != 200 or not mini.content:
        raise Fallo(f"miniatura: {mini.status_code}")
    _ok(c.patch(f"/api/fototeca/{f}", json={"etiquetas": ["recorrido"], "titulo": MARCA}), "etiquetar")
    ctx["foto_id"] = f
    return f"foto {f} con miniatura y etiqueta"


def tareas_y_agenda(c: httpx.Client, ctx: dict) -> str:
    """Tareas y Agenda: tarea con plazo → hecha; evento → aparece en la agenda → se borra."""
    t = _id(_ok(c.post("/api/tareas", json={"titulo": f"{MARCA}: tarea", "responsable_id": ctx["yo"],
                                             "vence_fecha": (HOY + dt.timedelta(days=2)).isoformat()}), "crear tarea"))
    _ok(c.patch(f"/api/tareas/{t}", json={"estado": "hecha"}), "cerrar tarea")
    if _ok(c.get(f"/api/tareas/{t}"), "leer tarea").get("estado") != "hecha":
        raise Fallo("la tarea no quedó hecha")
    manana = (HOY + dt.timedelta(days=1)).isoformat()
    ev = _id(_ok(c.post("/api/agenda/eventos", json={"titulo": f"{MARCA}: reunión", "inicio": f"{manana}T09:00:00",
                                                      "fin": f"{manana}T10:00:00"}), "crear evento"))
    _ok(c.get(f"/api/agenda/eventos/{ev}"), "leer evento")
    _ok(c.delete(f"/api/tareas/{t}"), "borrar tarea", 200, 204)
    _ok(c.delete(f"/api/agenda/eventos/{ev}"), "borrar evento", 200, 204)
    return f"tarea {t} cerrada y evento {ev}"


def rendicion(c: httpx.Client, ctx: dict) -> str:
    """Rendición de cuentas: rendición → comprobante → se lee de vuelta → se borra."""
    rid = _id(_ok(c.post("/api/rendiciones", json={"datos": {"nota": MARCA}}), "crear rendición"))
    _ok(c.post(f"/api/rendiciones/{rid}/comprobantes", json={"fecha": HOY.isoformat(), "tipo": "boleta", "serie": "B001",
                                                             "numero": "123", "proveedor": "Proveedor de prueba",
                                                             "concepto": "almuerzo", "importe": 25.5}), "agregar comprobante")
    r = _ok(c.get(f"/api/rendiciones/{rid}"), "leer rendición")
    if "Proveedor de prueba" not in str(r):
        raise Fallo("el comprobante no aparece en la rendición")
    _ok(c.delete(f"/api/rendiciones/{rid}"), "borrar rendición", 200, 204)
    return f"rendición {rid} con comprobante"


def semana(c: httpx.Client, ctx: dict) -> str:
    """Semana de representación: semana → foto citada de la Mediateca → informe generado con el marco."""
    sufijo = uuid.uuid4().hex[:6]
    s = _id(_ok(c.post("/api/semanas", json={"tema": f"{MARCA} {sufijo}", "slug": f"recorrido-{sufijo}",
                                              "inicio": HOY.isoformat(), "fin": HOY.isoformat()}), "crear semana"))
    voc = _ok(c.get("/api/semanas/vocabularios"), "vocabularios")
    primero = lambda clave: voc[clave][0]["valor"]  # noqa: E731  (el primer valor de su vocabulario)
    act = _ok(c.post(f"/api/semanas/{s}/actividades", json={"datos": {
        "titulo": f"{MARCA}: visita de trabajo", "fecha": HOY.isoformat(), "tipo": primero("tipos_actividad"),
        "sector": primero("sectores"), "hora_inicio": "09:00", "hora_fin": "11:00", "localidad": "Localidad de prueba",
        "distrito": "Distrito de prueba", "provincia": "Provincia de prueba", "participantes": ["Persona de prueba, Cargo"],
        "hallazgos": ["Hallazgo de prueba."], "pedidos": [], "documentos": [], "fotos": []}}), "registrar actividad")
    # Con pedido: el balance del informe aún no admite una semana sin pedidos (pendiente aparte).
    _ok(c.post(f"/api/semanas/{s}/pedidos", json={"datos": {
        "actividad": act.get("codigo", ""), "fecha": HOY.isoformat(), "pedido": f"{MARCA}: pedido de la población.",
        "entidades": ["Entidad de prueba"], "estado": voc["estados_pedido"][0], "prioridad_propuesta": voc["prioridades"][0], "sector": primero("sectores")}}),
        "registrar pedido")
    if ctx.get("foto_id"):
        _ok(c.post(f"/api/semanas/{s}/fotos-desde-fototeca", json={"ids": [ctx["foto_id"]], "actividad": act.get("codigo", "")}),
            "citar foto de la Mediateca")
    _ok(c.post(f"/api/semanas/{s}/generar", json={}), "pedir el informe")
    limite = time.monotonic() + 600
    while time.monotonic() < limite:
        estado = _ok(c.get(f"/api/semanas/{s}/generacion"), "estado del informe")
        if estado.get("estado") in ("listo", "hecho", "ok", "terminado"):
            return f"semana {s} con su informe"
        if estado.get("estado") in ("error", "fallo"):
            raise Fallo(f"el informe falló: {str(estado)[:300]}")
        time.sleep(3)
    raise Fallo("el informe no terminó en 10 minutos")


def proyecto(c: httpx.Client, ctx: dict) -> str:
    """Proyectos de ley: proyecto → parte escrita → se lee de vuelta → se borra."""
    p = _id(_ok(c.post("/api/proyectos", json={"tipo": "proyecto_de_ley", "titulo": f"{MARCA}: proyecto", "datos": {}}),
                "crear proyecto"))
    _ok(c.put(f"/api/proyectos/{p}/secciones/fundamentos",
              json={"contenido": doc([f"{MARCA}: fundamentos."]), "version_base": 0, "nota": MARCA, "soltar": True}),
        "escribir una parte")
    if f"{MARCA}: fundamentos." not in str(_ok(c.get(f"/api/proyectos/{p}"), "leer proyecto")):
        raise Fallo("la parte escrita no aparece en el proyecto")
    _ok(c.delete(f"/api/proyectos/{p}"), "borrar proyecto", 200, 204)
    return f"proyecto {p} con una parte"


def dos_personas_a_la_vez(c: httpx.Client, ctx: dict) -> str:
    """Edición simultánea: la prueba de dos clientes Yjs reales (web/colab/prueba_dos_clientes.ts de Qillqasqa, que trae el
    servidor de colab desde el 2026-10-22)."""
    import qillqasqa
    from tests.recorrido import API, USUARIO, clave_de

    entorno = {**os.environ, "QILLQA_BASE": API, "QILLQA_USUARIO": USUARIO, "QILLQA_CLAVE": clave_de(USUARIO),
               "COLAB_URL": os.environ.get("RECORRIDO_COLAB", "ws://127.0.0.1:8011")}
    r = subprocess.run(["node", "colab/prueba_dos_clientes.ts"], cwd=Path(qillqasqa.__file__).resolve().parents[1] / "web", env=entorno,
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise Fallo(f"edición simultánea: {(r.stdout + r.stderr).strip().splitlines()[-3:]}")
    return "dos clientes sin pérdidas ni duplicados"


FLUJOS = [documentos, mesa_de_partes, chat, mediateca, tareas_y_agenda, rendicion, semana, proyecto, dos_personas_a_la_vez]


def correr(c: httpx.Client, solo: set[str] | None = None) -> list[str]:
    ctx = {"yo": _ok(c.get("/api/cuenta/perfil"), "perfil")["id"]}
    fallos = []
    for flujo in FLUJOS:
        if solo and flujo.__name__ not in solo:
            continue
        t = time.monotonic()
        try:
            detalle = flujo(c, ctx)
            print(f"  ok     {flujo.__name__:<22} {time.monotonic() - t:5.1f} s  {detalle}")
        except Fallo as e:
            print(f"  FALLA  {flujo.__name__:<22} {time.monotonic() - t:5.1f} s  {e}")
            fallos.append(f"{flujo.__name__}: {e}")
        except Exception as e:  # noqa: BLE001  (un error inesperado también es un fallo del recorrido)
            print(f"  FALLA  {flujo.__name__:<22} {type(e).__name__}: {e}")
            traceback.print_exc(limit=2)
            fallos.append(f"{flujo.__name__}: {type(e).__name__}: {e}")
    return fallos

#!/usr/bin/env python3
"""demo/sembrar_demo.py — llena una instalación VACÍA de Qillqa con datos ficticios para probar todo.

Habla solo con la API (el mismo camino que la web): cuentas del equipo, directorio con organigrama,
documentos con número oficial y PDF, documentos recibidos en la mesa de partes, tareas, agenda, chat y
un proyecto con partes. Es idempotente: si la cuenta «ana.torres» ya existe, no vuelve a sembrar.
Todo es inventado: ninguna persona, institución, número ni documento corresponde a la realidad.

Uso:
  docker compose run --rm siembra                       (dentro de Docker)
  QILLQA_API=http://127.0.0.1:8000 ADMIN_USUARIO=administrador ADMIN_CLAVE=… python3 demo/sembrar_demo.py
Variables: QILLQA_API, ADMIN_USUARIO, ADMIN_CLAVE (la del .env), DEMO_CLAVE (clave de las cuentas de demo).
Solo usa la biblioteca estándar de Python.
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

API = os.environ.get("QILLQA_API", "http://127.0.0.1:8000").rstrip("/")
ADMIN = os.environ.get("ADMIN_USUARIO") or "administrador"
ADMIN_CLAVE = os.environ.get("ADMIN_CLAVE") or ADMIN
DEMO_CLAVE = os.environ.get("DEMO_CLAVE") or "qillqa-demo"
HOY = dt.date.today()


class ErrorApi(Exception):
    def __init__(self, estado, cuerpo):
        super().__init__(f"{estado}: {cuerpo}")
        self.estado, self.cuerpo = estado, cuerpo


def pedir(metodo, ruta, cuerpo=None, token=None, multipart=None, tiempo=240):
    cab = {"Accept": "application/json"}
    datos = None
    if token:
        cab["Authorization"] = f"Bearer {token}"
    if multipart is not None:
        borde = uuid.uuid4().hex
        partes = []
        for nombre, valor in multipart:
            if isinstance(valor, tuple):                      # (archivo, bytes, tipo)
                partes.append((f'--{borde}\r\nContent-Disposition: form-data; name="{nombre}"; filename="{valor[0]}"\r\n'
                               f"Content-Type: {valor[2]}\r\n\r\n").encode() + valor[1] + b"\r\n")
            else:
                partes.append(f'--{borde}\r\nContent-Disposition: form-data; name="{nombre}"\r\n\r\n{valor}\r\n'.encode())
        datos = b"".join(partes) + f"--{borde}--\r\n".encode()
        cab["Content-Type"] = f"multipart/form-data; boundary={borde}"
    elif cuerpo is not None:
        datos = json.dumps(cuerpo).encode()
        cab["Content-Type"] = "application/json"
    req = urllib.request.Request(API + ruta, data=datos, method=metodo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=tiempo) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors="replace")
        try:
            t = json.loads(t)
        except ValueError:
            pass
        raise ErrorApi(e.code, t) from None


def codigo(e: ErrorApi) -> str:
    d = e.cuerpo.get("detail") if isinstance(e.cuerpo, dict) else None
    return d.get("codigo", "") if isinstance(d, dict) else ""


def entrar(usuario, clave, clave_nueva=None, datos=None) -> str:
    """Inicia sesión y despeja los dos pasos del primer ingreso (clave temporal y datos personales)."""
    token = pedir("POST", "/api/auth/login", {"usuario": usuario, "clave": clave})["token"]
    for _ in range(3):
        try:
            pedir("GET", "/api/modulos", token=token)          # cualquier ruta protegida dice si falta un paso
            return token
        except ErrorApi as e:
            if e.estado != 428:
                raise
            if codigo(e) == "clave_temporal":
                r = pedir("POST", "/api/auth/clave", {"clave_actual": clave, "clave_nueva": clave_nueva or DEMO_CLAVE}, token=token)
                token, clave = r["token"], clave_nueva or DEMO_CLAVE
            elif codigo(e) == "datos_pendientes":
                pedir("POST", "/api/cuenta/bienvenida", datos, token=token)
            else:
                raise
    return token


def esperar_api():
    for _ in range(90):
        try:
            pedir("GET", "/api/health", tiempo=5)
            return
        except Exception:
            time.sleep(2)
    sys.exit(f"[error] La API no responde en {API}/api/health.")


def doc(tipo, texto_parrafos):
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in texto_parrafos]}


def pdf_minimo(titulo: str, lineas: list[str]) -> bytes:
    """Un PDF de una página, válido y legible, escrito a mano (sin bibliotecas)."""
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    texto = ["BT /F1 15 Tf 72 760 Td (" + esc(titulo) + ") Tj ET"]
    for i, l in enumerate(lineas):
        texto.append(f"BT /F1 11 Tf 72 {725 - i * 18} Td (" + esc(l) + ") Tj ET")
    flujo = "\n".join(texto).encode("latin-1", "replace")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            b"<< /Length %d >>\nstream\n" % len(flujo) + flujo + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    salida, pos = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        pos.append(len(salida))
        salida += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(salida)
    salida += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    salida += b"".join(b"%010d 00000 n \n" % p for p in pos)
    salida += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(salida)


EQUIPO = [
    # usuario, nombres, apellidos, cargo, celular
    ("ana.torres", "Ana", "Torres Huamán", "Asesor", "987111222"),
    ("luis.mamani", "Luis", "Mamani Quispe", "Coordinador", "955444333"),
    ("rosa.quispe", "Rosa", "Quispe Rojas", "Secretaría", "944000111"),
]


def main() -> int:
    esperar_api()
    adm = entrar(ADMIN, ADMIN_CLAVE, DEMO_CLAVE if ADMIN_CLAVE == ADMIN else ADMIN_CLAVE + "-1",
                 {"nombres": "Carmen", "apellidos": "Vargas Ríos", "celular": "966555444",
                  "email": "administracion@ejemplo.pe", "cargo": "Coordinador"})
    usuarios = pedir("GET", "/api/admin/usuarios", token=adm)
    usuarios = usuarios.get("usuarios", usuarios) if isinstance(usuarios, dict) else usuarios
    if any(u.get("nombre_usuario") == "ana.torres" for u in usuarios):
        print("[ok] La demo ya estaba sembrada: no se toca nada.")
        return 0

    print("· Ajustes: primer ingreso sin formulario de datos y mesa de partes virtual encendida")
    pedir("PUT", "/api/admin/primer-ingreso", {"activo": False, "excluir_cargos": []}, token=adm)
    pedir("PUT", "/api/modulos/mesa_virtual", {"activo": True}, token=adm)

    print("· Cuentas del equipo")
    ids, tokens = {}, {}
    for usuario, nombres, apellidos, cargo, cel in EQUIPO:
        temporal = f"temporal-{usuario}-{HOY.year}"
        r = pedir("POST", "/api/admin/usuarios", {"nombres": nombres, "apellidos": apellidos, "cargo": cargo,
                                                  "nombre_usuario": usuario, "email": f"{usuario}@ejemplo.pe",
                                                  "clave": temporal}, token=adm)
        ids[usuario] = r.get("id") or r.get("usuario", {}).get("id")
        tokens[usuario] = entrar(usuario, temporal, DEMO_CLAVE,
                                 {"nombres": nombres, "apellidos": apellidos, "celular": cel,
                                  "email": f"{usuario}@ejemplo.pe", "cargo": cargo})

    print("· Directorio: instituciones, personas y un organigrama")
    inst = {}
    for nombre, siglas, tipo, nivel in [
        ("Municipalidad Distrital de Villa Ejemplo", "MDVE", "municipalidad", "local"),
        ("Ministerio de Servicios Públicos de Ejemplo", "MSPE", "ministerio", "nacional"),
        ("Universidad Nacional de Ejemplo", "UNE", "universidad", "nacional"),
        ("Empresa de Agua Río Ejemplo S.A.", "ARESA", "empresa", "regional"),
    ]:
        inst[siglas] = pedir("POST", "/api/directorio/instituciones",
                             {"nombre": nombre, "siglas": siglas, "tipo": tipo, "nivel_gobierno": nivel,
                              "email": f"mesadepartes@{siglas.lower()}.ejemplo.pe", "telefono": "(01) 000 0000",
                              "notas": "Institución ficticia de la demostración."}, token=adm)["id"]
    personas = [
        ("Jorge Salazar Medina", "Alcalde", "MDVE", "Señor:"),
        ("Patricia León Cárdenas", "Ministra de Servicios Públicos", "MSPE", "Señora:"),
        ("Miguel Ángel Paredes Soto", "Rector", "UNE", "Señor:"),
        ("Lucía Fernández Rojas", "Gerenta General", "ARESA", "Señora:"),
    ]
    for nombre, cargo, siglas, trat in personas:
        pedir("POST", "/api/directorio/personas",
              {"nombre": nombre, "cargo": cargo, "tratamiento": trat, "institucion_id": inst[siglas],
               "email": nombre.split()[0].lower() + "@" + siglas.lower() + ".ejemplo.pe"}, token=adm)
    pedir("POST", f"/api/directorio/instituciones/{inst['MDVE']}/organigrama",
          {"fuente": "Organigrama ficticio de demostración", "url_fuente": "", "fecha_consulta": HOY.isoformat(),
           "norma": "Ordenanza de ejemplo", "reemplazar": False,
           "nodos": [{"nombre": "Concejo Municipal", "siglas": "CM", "tipo": "organo", "categoria": "alta_direccion", "hijos": [
               {"nombre": "Alcaldía", "siglas": "ALC", "tipo": "organo", "categoria": "alta_direccion", "hijos": [
                   {"nombre": "Gerencia Municipal", "siglas": "GM", "tipo": "organo", "categoria": "alta_direccion", "hijos": [
                       {"nombre": "Oficina de Asesoría Jurídica", "siglas": "OAJ", "tipo": "organo", "categoria": "organo_asesoramiento", "hijos": []},
                       {"nombre": "Oficina de Administración", "siglas": "OA", "tipo": "organo", "categoria": "organo_apoyo", "hijos": []},
                       {"nombre": "Gerencia de Desarrollo Urbano", "siglas": "GDU", "tipo": "organo", "categoria": "organo_linea", "hijos": []},
                       {"nombre": "Gerencia de Desarrollo Social", "siglas": "GDS", "tipo": "organo", "categoria": "organo_linea", "hijos": []},
                   ]}]}]}]}, token=adm)

    print("· Documentos (los que llevan número oficial se compilan a PDF: puede tardar)")
    documentos = [
        ("oficio", True, {"destinatario_tratamiento": "Señor:", "destinatario_nombre": "Jorge Salazar Medina",
                          "destinatario_cargo": "Alcalde", "destinatario_institucion": "Municipalidad Distrital de Villa Ejemplo",
                          "asunto": "Solicito información sobre el mantenimiento del sistema de agua potable"},
         ["Tengo el agrado de dirigirme a usted para solicitarle información sobre el estado del mantenimiento "
          "del sistema de agua potable del distrito y el cronograma de obras previsto para este año.",
          "Agradeceré que la información se remita en un plazo de diez días hábiles."], "ana.torres"),
        ("oficio", True, {"destinatario_tratamiento": "Señora:", "destinatario_nombre": "Patricia León Cárdenas",
                          "destinatario_cargo": "Ministra de Servicios Públicos",
                          "destinatario_institucion": "Ministerio de Servicios Públicos de Ejemplo",
                          "asunto": "Invitación a la mesa de trabajo sobre gestión documental electrónica"},
         ["Me es grato invitarla a la mesa de trabajo sobre gestión documental electrónica en las entidades públicas, "
          "que se realizará la próxima semana en nuestra sede.",
          "La agenda incluye la numeración digital de documentos, la mesa de partes virtual y la firma electrónica."],
         "luis.mamani"),
        ("oficio", False, {"destinatario_tratamiento": "Señor:", "destinatario_nombre": "Miguel Ángel Paredes Soto",
                           "destinatario_cargo": "Rector", "destinatario_institucion": "Universidad Nacional de Ejemplo",
                           "asunto": "Propuesta de convenio de prácticas preprofesionales"},
         ["Me dirijo a usted para proponer un convenio de prácticas preprofesionales con las facultades de "
          "Derecho, Economía e Ingeniería de Sistemas."], "ana.torres"),
        ("memorando", True, {"para": "Rosa Quispe Rojas — Mesa de partes", "de": "Luis Mamani Quispe — Coordinación",
                             "asunto": "Turnos de atención de la mesa de partes"},
         ["A partir del lunes, la mesa de partes atenderá de 8:30 a 16:30 en horario corrido.",
          "Los documentos que lleguen por la mesa virtual fuera de ese horario se registran al día hábil siguiente."],
         "luis.mamani"),
        ("informe", True, {"para": "Carmen Vargas Ríos — Administración", "de": "Ana Torres Huamán — Asesoría",
                           "asunto": "Informe sobre el uso del sistema de gestión documental en el primer mes"},
         ["En el primer mes se registraron documentos en todas las series sin números repetidos ni huecos.",
          "Se recomienda capacitar al personal en el uso de la mesa de partes virtual y del control de cambios."],
         "ana.torres"),
        ("carta", False, {"destinatario_tratamiento": "Señora:", "destinatario_nombre": "Lucía Fernández Rojas",
                          "destinatario_cargo": "Gerenta General",
                          "destinatario_institucion": "Empresa de Agua Río Ejemplo S.A.",
                          "asunto": "Agradecimiento por la información remitida"},
         ["Agradezco la información remitida sobre el plan de inversiones del presente año."], "rosa.quispe"),
    ]
    creados = []
    for tipo, generar, campos, parrafos, autor in documentos:
        tok = tokens[autor]
        d_id = pedir("POST", "/api/documentos", {"tipo": tipo}, token=tok)["id"]
        actual = pedir("GET", f"/api/documentos/{d_id}", token=tok)
        cuerpo = {"campos": {**actual.get("campos", {}), **campos, "fecha": HOY.isoformat()},
                  "cuerpo": doc(tipo, parrafos), "version_base": actual.get("version")}
        if generar:
            try:
                r = pedir("POST", f"/api/documentos/{d_id}/generar", {**cuerpo, "copias_verificadas": True}, token=tok, tiempo=600)
                print(f"    {r.get('numero_completo', '?')}")
            except ErrorApi as e:
                print(f"    [aviso] {tipo} {d_id}: no se pudo generar ({e.estado}); queda como borrador")
        else:
            r = pedir("PUT", f"/api/documentos/{d_id}", cuerpo, token=tok, tiempo=600)
            print(f"    borrador {tipo} {d_id}")
        creados.append(d_id)
    try:
        pedir("PUT", f"/api/documentos/{creados[2]}/estado",
              {"estado": "EN_REVISION", "comentario": "Para revisión de coordinación", "responsable_id": ids["luis.mamani"]},
              token=tokens["ana.torres"])
    except ErrorApi as e:
        print(f"    [aviso] no se pudo pasar a revisión ({e.estado})")

    print("· Mesa de partes: documentos recibidos")
    recibidos = [
        ("OFICIO-0045-MDVE.pdf", "OFICIO N.° 045-2026-MDVE/A", ["Municipalidad Distrital de Villa Ejemplo",
         "Asunto: Remito información sobre el sistema de agua potable", "Firmado: Jorge Salazar Medina, Alcalde"]),
        ("CARTA-012-ARESA.pdf", "CARTA N.° 012-2026-ARESA/GG", ["Empresa de Agua Río Ejemplo S.A.",
         "Asunto: Plan de inversiones del presente año", "Firmado: Lucía Fernández Rojas, Gerenta General"]),
        ("INVITACION-UNE.pdf", "INVITACIÓN", ["Universidad Nacional de Ejemplo",
         "Asunto: Ceremonia de inauguración del año académico", "Fecha: el próximo viernes a las 10:00"]),
    ]
    archivos = [("archivos", (n, pdf_minimo(t, l + [f"Documento ficticio de demostración · {uuid.uuid4().hex[:8]}"]), "application/pdf"))
                for n, t, l in recibidos]
    try:
        r = pedir("POST", "/api/entradas/subir", multipart=archivos + [("via", "mesa_partes")], token=tokens["rosa.quispe"])
        print(f"    {len(r.get('creadas', []))} recibidos")
    except ErrorApi as e:
        print(f"    [aviso] no se pudieron registrar los recibidos ({e.estado})")

    print("· Tareas y agenda")
    tareas = [
        ("Responder el oficio de la Municipalidad de Villa Ejemplo", "ana.torres", "alta", 3, True),
        ("Preparar la mesa de trabajo de gestión documental", "luis.mamani", "urgente", 1, True),
        ("Archivar los cargos de recepción de la semana", "rosa.quispe", "normal", 5, False),
        ("Revisar el borrador del convenio con la universidad", "luis.mamani", "normal", 7, True),
        ("Actualizar el directorio de instituciones", "rosa.quispe", "baja", 14, False),
    ]
    for titulo, resp, prioridad, dias, importante in tareas:
        pedir("POST", "/api/tareas", {"titulo": titulo, "responsable_id": ids[resp], "prioridad": prioridad,
                                      "importante": importante, "vence_fecha": (HOY + dt.timedelta(days=dias)).isoformat()},
              token=adm)
    lunes = HOY - dt.timedelta(days=HOY.weekday())
    eventos = [
        ("Reunión de coordinación semanal", 0, "09:00", "10:00", "despacho", "confirmado", "Sala de reuniones"),
        ("Mesa de trabajo: gestión documental electrónica", 2, "10:00", "12:30", "externa", "confirmado", "Auditorio principal"),
        ("Visita a la Municipalidad de Villa Ejemplo", 3, "08:00", "13:00", "externa", "propuesto", "Villa Ejemplo"),
        ("Capacitación: mesa de partes virtual", 4, "15:00", "16:30", "despacho", "confirmado", "Virtual"),
    ]
    for titulo, dia, ini, fin, tipo, estado, lugar in eventos:
        f = (lunes + dt.timedelta(days=dia)).isoformat()
        pedir("POST", "/api/agenda/eventos", {"titulo": titulo, "inicio": f"{f}T{ini}:00", "fin": f"{f}T{fin}:00",
                                              "tipo": tipo, "estado": estado, "lugar": lugar,
                                              "modalidad": "virtual" if lugar == "Virtual" else "presencial"}, token=adm)

    print("· Chat")
    try:
        canal = pedir("POST", "/api/chat/canales", {"clase": "grupo", "nombre": "Equipo de demostración",
                                                     "descripcion": "Coordinación del día a día",
                                                     "miembros": list(ids.values())}, token=adm)
        for quien, texto in [("luis.mamani", "Buenos días, equipo. Hoy cerramos el informe del primer mes."),
                             ("ana.torres", "Listo, ya lo generé con número oficial; está en la bandeja."),
                             ("rosa.quispe", "Llegaron tres documentos por mesa de partes, ya están registrados.")]:
            pedir("POST", f"/api/chat/canales/{canal['id']}/mensajes", {"texto": texto}, token=tokens[quien])
    except ErrorApi as e:
        print(f"    [aviso] chat: {e.estado}")

    print("· Proyecto con partes")
    try:
        p = pedir("POST", "/api/proyectos", {"tipo": "proyecto_de_ley",
                                             "titulo": "Ley de gestión documental electrónica en las entidades públicas",
                                             "datos": {}}, token=adm)
        for clave, texto in [("titulo", ["Ley de gestión documental electrónica en las entidades públicas"]),
                             ("preliminar", ["Artículo 1. Objeto. La presente ley regula la gestión documental "
                                             "electrónica en las entidades de la administración pública."]),
                             ("fundamentos", ["Las entidades aún numeran y archivan sus documentos a mano. La gestión "
                                              "electrónica reduce tiempos, evita pérdidas y facilita la transparencia."])]:
            pedir("PUT", f"/api/proyectos/{p['id']}/secciones/{clave}",
                  {"contenido": doc("", texto), "version_base": 0, "nota": "Texto de demostración", "soltar": True}, token=adm)
    except ErrorApi as e:
        print(f"    [aviso] proyecto: {e.estado}")

    print(f"[ok] Demo sembrada. Entre en la web con «{ADMIN}» o con ana.torres, luis.mamani o rosa.quispe "
          f"(clave de las cuentas de demostración: {DEMO_CLAVE}).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ErrorApi as e:
        sys.exit(f"[error] La API respondió {e}")

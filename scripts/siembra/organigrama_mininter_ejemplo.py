"""Organigrama OFICIAL del Ministerio del Interior (MININTER). Anexo 1 de la
Sección Segunda del ROF (RM 1050-2019-IN, modif. RM 0429-2026-IN y 0642-2026-IN).
Fundamento: PDF publicado en la página institucional del MININTER en gob.pe.
"""
import json, os, urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — MININTER: Organigrama oficial (Anexo 1, Sección Segunda del ROF)"
URL_FUENTE = "https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NjI5OTE0LCJwdXIiOiJibG9iX2lkIn19--d2bbe1009024af61acdd04480c86419fdc1af99d/ORGANIGRAMA%20MININTER%20%202026%20%208-05-2026.pdf"
FECHA = "2026-08-24"
NORMA = "RM 1050-2019-IN (Sección Segunda del ROF), modif. RM 0429-2026-IN y RM 0642-2026-IN"


def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def OF(n, hijos=None): return O(n, tipo="oficina", hijos=hijos or [])
def OG(n, hijos=None, cat="organo_apoyo"): return O(n, tipo="oficina", cat=cat, hijos=hijos or [])
def DG(n, hijos): return O(n, tipo="direccion", cat="organo_linea", hijos=hijos)
def D(n): return O(n, tipo="direccion", cat="unidad_organica")
def PR(n): return O(n, tipo="organo", cat="organo_defensa")  # procuraduría


ORG = [
    O("Despacho Ministerial", cat="alta_direccion", hijos=[
        O("Órgano de Control Institucional", cat="organo_control", hijos=[
            OF("Oficina de Servicios de Control"),
            OF("Oficina de Servicios Relacionados y Actividades de Apoyo"),
        ]),
        O("Tribunal de Disciplina Policial", cat="organo_resolutivo"),
        O("Defensoría del Policía", cat="organo_resolutivo"),
        O("Oficina de Seguridad y Defensa Nacional", tipo="oficina"),
        PR("Procuraduría Pública a cargo del Sector Interior"),
        PR("Procuraduría Pública Especializada en Delitos de Tráfico Ilícito de Drogas"),
        PR("Procuraduría Pública Especializada en Delitos de Terrorismo"),
        PR("Procuraduría Pública Especializada en Delitos contra el Orden Público"),
        PR("Procuraduría Pública Especializada en Delitos de Lavado de Activos y Proceso de Pérdida de Dominio"),
        PR("Procuraduría Pública Especializada en Delitos de Crimen Organizado"),
        OG("Oficina General de Integridad Institucional", [
            OF("Oficina de Control, Cumplimiento y Confianza"), OF("Oficina de Asuntos Internos"),
        ]),
        OG("Oficina General de Comunicación Social e Imagen Institucional"),
        O("Secretaría General", cat="alta_direccion", hijos=[
            OF("Oficina de Atención al Ciudadano y Gestión Documental"),
            OG("Oficina General de Asesoría Jurídica", cat="organo_asesoramiento"),
            OG("Oficina General de Planeamiento y Presupuesto", [
                OF("Oficina de Planeamiento y Estadística"), OF("Oficina de Presupuesto"),
                OF("Oficina de Programación Multianual de Inversiones"),
                OF("Oficina de Cooperación y Relaciones Internacionales"),
                OF("Oficina de Modernización y Desarrollo Institucional"),
            ], cat="organo_asesoramiento"),
            OG("Oficina General de Administración y Finanzas (UE 001)", [
                OF("Oficina de Contabilidad"), OF("Oficina de Tesorería"),
                OF("Oficina de Abastecimiento"), OF("Oficina de Control Patrimonial"),
            ]),
            OG("Oficina General de Gestión de Recursos Humanos", [
                OF("Oficina de Desarrollo de Recursos Humanos"),
                OF("Oficina de Administración del Personal y Compensaciones"),
                OF("Oficina de Relaciones Humanas y Sociales"),
            ]),
            OG("Oficina General de Tecnologías de la Información y Comunicaciones", [
                OF("Oficina de Soluciones Informáticas y Gestión de Proyectos"),
                OF("Oficina de Servicios de Tecnología y Comunicaciones"),
                OF("Oficina de Gestión de Gobierno Digital"),
            ]),
            OG("Oficina General de Infraestructura (UE 032)", [
                OF("Oficina de Estudios"), OF("Oficina de Obras"),
                OF("Oficina de Liquidación de Contratos"),
            ]),
        ]),
        O("Despacho Viceministerial de Orden Interno", cat="alta_direccion", hijos=[
            DG("Dirección General de Inteligencia", [
                D("Dirección de Inteligencia"), D("Dirección de Contrainteligencia"),
                D("Dirección de Operaciones Estratégicas de Recursos"),
                O("Escuela de Inteligencia", tipo="organo", cat="organo_desconcentrado"),
            ]),
            DG("Dirección General contra el Crimen Organizado", [
                D("Dirección de Control de Drogas y Cultivos Ilegales"),
                D("Dirección Contra Delitos de Crimen Organizado"),
            ]),
            DG("Dirección General de Orden Público", [
                D("Dirección de Prevención y Gestión de Conflictos Sociales"),
                D("Dirección de Diálogo y Articulación Social"),
            ]),
            DG("Dirección General de Gobierno Interior", [
                D("Dirección de Autoridades Políticas"),
                D("Dirección de Autorizaciones Especiales y Garantías"),
                O("Órganos Desconcentrados", cat="organo_desconcentrado"),
            ]),
        ]),
        O("Despacho Viceministerial de Seguridad Pública", cat="alta_direccion", hijos=[
            DG("Dirección General de Seguridad Ciudadana", [
                D("Dirección de Diseño y Evaluación de Políticas de Seguridad Ciudadana"),
                D("Dirección de Ejecución de Políticas de Seguridad Ciudadana"),
            ]),
            DG("Dirección General de Seguridad Democrática", [
                D("Dirección de Derechos Fundamentales"), D("Dirección de Participación Ciudadana"),
            ]),
            DG("Dirección General de Información para la Seguridad", [
                D("Dirección de Gestión del Conocimiento para la Seguridad"),
                D("Dirección de Canales de Atención y Denuncias"),
            ]),
        ]),
        # Organismos y entidades adscritas
        O("Policía Nacional del Perú", tipo="organismo", cat="adscrito", siglas="PNP"),
        O("Superintendencia Nacional de Control de Servicios de Seguridad, Armas, Municiones y Explosivos de Uso Civil", tipo="organismo", cat="adscrito", siglas="SUCAMEC"),
        O("Superintendencia Nacional de Migraciones", tipo="organismo", cat="adscrito", siglas="MIGRACIONES"),
        O("Intendencia Nacional de Bomberos del Perú", tipo="organismo", cat="adscrito", siglas="INBP"),
        O("Fondo de Aseguramiento en Salud de la Policía Nacional del Perú", tipo="organismo", cat="adscrito", siglas="SALUDPOL"),
        O("Programa de Reducción de Cultivos Ilegales en el Perú - PRECIP", tipo="programa", cat="programa", siglas="PRECIP"),
    ]),
]


def req(method, path, tok=None, body=None):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if body is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))


def main():
    tok = req("POST", "/api/auth/login", body={"usuario": os.environ.get("QILLQA_USUARIO", "admin"), "clave": os.environ["QILLQA_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    mi = next(i for i in todas if i["siglas"] == "MININTER")
    print(f"MININTER: id={mi['id']}")
    res = req("POST", f"/api/directorio/instituciones/{mi['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORG,
    })
    print("organigrama:", res)
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    hijos = {}
    for i in todas: hijos.setdefault(i["parent_id"], []).append(i)
    def contar(pid): return sum(1 + contar(h["id"]) for h in hijos.get(pid, []))
    print(f"Descendientes MININTER: {contar(mi['id'])}  |  total: {len(todas)}")


main()

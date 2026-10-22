"""Organigrama OFICIAL de la CONTRALORÍA GENERAL DE LA REPÚBLICA (CGR).
Fundamento: PDF "ORGANIGRAMA CGR" de la página institucional de la Contraloría en
gob.pe (Anexo del ROF). Transcrito íntegro. Sin simplificar.
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — Contraloría General de la República: Organigrama oficial (ROF)"
URL_FUENTE = 'https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NTAzNjQwLCJwdXIiOiJibG9iX2lkIn19--431c73f119e4c289f02765c7ee62ec9abe73d19c/ORGANIGRAMA%20CGR.pdf'
FECHA = "2026-08-24"
NORMA = "ROF de la Contraloría General de la República (organigrama oficial, gob.pe)"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def G(n, hijos=None, cat="organo_apoyo"): return O(n, tipo="gerencia", cat=cat, hijos=hijos)
def SG(n): return O(n, tipo="subgerencia", cat="unidad_organica")
def U(n): return O(n, tipo="unidad", cat="unidad_organica")

ORG = [O("Despacho del Contralor", cat="alta_direccion", hijos=[
    O("Órgano de Auditoría Interna", cat="organo_control"),
    O("Procuraduría Pública", cat="organo_defensa"),
    O("Oficina de Integridad Institucional", tipo="oficina", cat="unidad_organica"),
    O("Oficina de Gestión de la Potestad Administrativa Sancionadora", tipo="oficina", cat="unidad_organica"),
    O("Tribunal Superior de Responsabilidades Administrativas", cat="organo_resolutivo", hijos=[
        O("Órgano Instructor", tipo="organo", cat="unidad_organica"),
        O("Órgano Sancionador", tipo="organo", cat="unidad_organica"),
    ]),
    O("Escuela Nacional de Control", cat="organo_desconcentrado", hijos=[
        O("Subdirección de Posgrado y Servicios Académicos", tipo="subdireccion", cat="unidad_organica"),
    ]),
    O("Secretaría General", cat="alta_direccion", hijos=[
        O("Oficina de Seguridad y Defensa Nacional", tipo="oficina", cat="unidad_organica"),
        G("Gerencia de Administración", [
            SG("Subgerencia de Abastecimiento"), SG("Subgerencia de Gestión Documentaria"),
            U("Unidad de Contabilidad"), U("Unidad de Tesorería"),
            U("Unidad de Gestión Administrativa Sociedades de Auditoría"),
        ]),
        G("Gerencia de Capital Humano", [
            SG("Subgerencia de Políticas y Desarrollo Humano"),
            SG("Subgerencia de Personal y Compensaciones"),
            SG("Subgerencia de Bienestar y Relaciones Laborales"),
        ]),
        G("Gerencia de Tecnologías de la Información y Gobierno Digital", [
            SG("Subgerencia de Operaciones y Plataforma Tecnológica"),
            SG("Subgerencia de Sistemas de Información y Analítica de Datos"),
            U("Unidad de Atención Digital y Soporte Técnico"),
        ]),
        G("Gerencia de Comunicaciones", [
            SG("Subgerencia de Comunicación y Medios Digitales"),
            SG("Subgerencia de Imagen y Relaciones Corporativas"),
            U("Unidad de Transparencia y Acceso a la Información Pública"),
        ]),
        G("Gerencia de Asesoría Jurídica y Normatividad en Control Gubernamental", [
            SG("Subgerencia de Asesoría Jurídica"),
            SG("Subgerencia de Normatividad en Control Gubernamental"),
        ], cat="organo_asesoramiento"),
        G("Gerencia de Modernización y Planeamiento", [
            SG("Subgerencia de Planeamiento, Presupuesto y Programación de Inversiones"),
            SG("Subgerencia de Modernización"), SG("Subgerencia de Gestión de Riesgos"),
            SG("Subgerencia de Seguimiento y Evaluación del Sistema Nacional de Control"),
        ], cat="organo_asesoramiento"),
        G("Gerencia de Relaciones Institucionales", [
            SG("Subgerencia de Coordinación Parlamentaria"),
            SG("Subgerencia de Coordinación Institucional Nacional"),
            SG("Subgerencia de Cooperación y Asuntos Internacionales"),
        ], cat="organo_asesoramiento"),
        G("Gerencia de Gestión de Proyectos", [
            SG("Subgerencia de Infraestructura"), SG("Subgerencia de Gestión de Inversiones"),
            U("Unidad de Formulación de Inversiones"),
        ]),
    ]),
    O("Vicecontraloría de Control Gubernamental", cat="alta_direccion", hijos=[
        O("Oficina de Aseguramiento de la Calidad de Servicios de Control", tipo="oficina", cat="unidad_organica"),
        O("Oficina de Control Especializado", tipo="oficina", cat="unidad_organica"),
        O("Oficina de Supervisión Técnica de Auditoría Financiera", tipo="oficina", cat="unidad_organica"),
        G("Gerencia de Prevención y Control Social", [
            SG("Subgerencia de Prevención"),
            SG("Subgerencia de Participación Ciudadana y Control Social"),
        ], cat="organo_linea"),
        G("Gerencia de Gestión y Fiscalización de Declaraciones Juradas", [
            SG("Subgerencia de Gestión de Declaraciones Juradas"),
            SG("Subgerencia de Fiscalización"),
        ], cat="organo_linea"),
        G("Gerencia de Control Político Institucional y Económico", [
            SG("Subgerencia de Control del Sector Seguridad Interna y Externa"),
            SG("Subgerencia de Control del Sector Justicia, Político y Electoral"),
            SG("Subgerencia de Control del Sector Social y Cultura"),
            SG("Subgerencia de Control del Sector Económico y Financiero"),
            SG("Subgerencia de Control del Sector Productivo y Trabajo"),
        ], cat="organo_linea"),
        G("Gerencia de Control de Servicios Públicos Básicos", [
            SG("Subgerencia de Control del Sector Transportes y Comunicaciones"),
            SG("Subgerencia de Control del Sector Vivienda, Construcción y Saneamiento"),
            SG("Subgerencia de Control del Sector Agricultura y Ambiente"),
            SG("Subgerencia de Control del Sector Educación"),
            SG("Subgerencia de Control del Sector Salud"),
        ], cat="organo_linea"),
        G("Gerencia de Control de Megaproyectos", [
            SG("Subgerencia de Control de Megaproyectos"),
            SG("Subgerencia de Control de Asociaciones Público Privadas y Obras por Impuestos"),
            SG("Subgerencia de Control Previo de Adicionales de Obra y Supervisión de Obra"),
        ], cat="organo_linea"),
        O("Gerencias Regionales de Control", tipo="gerencia", cat="organo_desconcentrado"),
        O("Órganos de Control Institucional", tipo="organo", cat="organo_desconcentrado"),
    ]),
])]

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))

def main():
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("QILLQA_USUARIO", "admin"), "clave": os.environ["QILLQA_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    cgr = next(i for i in todas if i["nombre"] == "Contraloría" or i["siglas"] == "CGR")
    print(f"CGR: id={cgr['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{cgr['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes CGR: {c(cgr['id'])}  |  total: {len(todas)}")

main()

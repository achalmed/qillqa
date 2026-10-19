"""Organigrama OFICIAL de la ONPE (Oficina Nacional de Procesos Electorales).
Fundamento: PDF de la página institucional de la ONPE en gob.pe.
Norma: Resolución Jefatural N.° 125-2024-JN. Transcrito íntegro. Sin simplificar.
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — ONPE: Organigrama oficial"
URL_FUENTE = 'https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NjQ0MTk4LCJwdXIiOiJibG9iX2lkIn19--07bc1aa3b5458eaf3cbe0d9929773383e86baad9/Organigrama.pdf'
FECHA = "2026-08-24"
NORMA = "Resolución Jefatural N.° 125-2024-JN"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def G(n, hijos=None, cat="organo_linea"): return O(n, tipo="gerencia", cat=cat, hijos=hijos)
def SG(n): return O(n, tipo="subgerencia", cat="unidad_organica")

ORG = [O("Jefatura Nacional", cat="alta_direccion", hijos=[
    O("Órgano de Control Institucional", cat="organo_control", hijos=[
        SG("Subgerencia de Control Institucional"),
    ]),
    O("Procuraduría Pública", cat="organo_defensa", hijos=[
        O("Procuraduría Pública Adjunta", tipo="organo", cat="unidad_organica"),
    ]),
    O("Secretaría General", cat="alta_direccion", hijos=[
        SG("Subgerencia de Atención al Ciudadano y Trámite Documentario"),
        SG("Subgerencia de Patrimonio Documental"),
    ]),
    O("Comité de Gerencia", cat="comision"),
    O("Gerencia General", tipo="gerencia", cat="alta_direccion", hijos=[
        G("Gerencia de Recursos Humanos", [
            SG("Subgerencia de Recursos Humanos"),
            SG("Subgerencia de Bienestar y Desarrollo Humano"),
        ], cat="organo_apoyo"),
        G("Gerencia de Administración", [
            SG("Subgerencia de Logística"),
            SG("Subgerencia de Mantenimiento y Control Patrimonial"),
            SG("Subgerencia de Finanzas"),
        ], cat="organo_apoyo"),
        G("Gerencia de Asesoría Jurídica", [
            SG("Subgerencia de Asesoría Administrativa"),
            SG("Subgerencia de Asesoría Electoral"),
        ], cat="organo_asesoramiento"),
        G("Gerencia de Planeamiento y Presupuesto", [
            SG("Subgerencia de Planeamiento"),
            SG("Subgerencia de Presupuesto"),
            SG("Subgerencia de Modernización"),
        ], cat="organo_asesoramiento"),
        G("Gerencia de Gestión Electoral", [
            SG("Subgerencia de Producción Electoral"),
        ]),
        G("Gerencia de Información y Educación Electoral", [
            SG("Subgerencia de Información y Comunicación Electoral"),
            SG("Subgerencia de Documentación e Investigación Electoral"),
            SG("Subgerencia de Relaciones Interinstitucionales"),
        ]),
        G("Gerencia de Supervisión de Fondos Partidarios", [
            SG("Subgerencia de Verificación y Control"),
            SG("Subgerencia Técnica Normativa"),
            SG("Subgerencia de Asistencia Técnica"),
        ]),
        G("Gerencia de Informática y Tecnología Electoral", [
            SG("Subgerencia de Gobierno Digital e Innovación"),
            SG("Subgerencia de Sistemas de Información"),
            SG("Subgerencia de Infraestructura y Seguridad Tecnológica"),
            SG("Subgerencia de Operaciones Informáticas"),
        ]),
        G("Gerencia de Organización Electoral y Coordinación Regional", [
            SG("Subgerencia de Organización y Ejecución Electoral"),
            SG("Subgerencia de Capacitación y Formación Electoral"),
            O("Oficinas Regionales de Coordinación", tipo="oficina", cat="organo_desconcentrado"),
            O("Oficinas Descentralizadas de Procesos Electorales", tipo="oficina", cat="organo_desconcentrado", siglas="ODPE"),
        ]),
    ]),
])]

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))

def main():
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    onpe = next(i for i in todas if i["siglas"] == "ONPE")
    print(f"ONPE: id={onpe['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{onpe['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes ONPE: {c(onpe['id'])}  |  total: {len(todas)}")

main()

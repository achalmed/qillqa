"""Organigrama ESTRUCTURAL OFICIAL del INEI (Instituto Nacional de Estadística e
Informática). Fuente: PDF de la página institucional del INEI en gob.pe.
Norma: D.S. N.° 043-2001-PCM (21/04/2001), modificado por D.S. N.° 066-2003-PCM.
Transcrito íntegro. (O.T. = Oficina Técnica, expandido.)
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — INEI: Organigrama estructural oficial"
URL_FUENTE = 'https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NTA3NjUsInB1ciI6ImJsb2JfaWQifX0=--26d5c60fb8bfd35da209c55ecd867d257368510e/PLAN_4_2016_ORGANIGRAMA_INEI.PDF'
FECHA = "2026-08-24"
NORMA = "D.S. N.° 043-2001-PCM (21/04/2001), modificado por D.S. N.° 066-2003-PCM"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}

ORG = [O("Jefatura", cat="alta_direccion", hijos=[
    O("Consejo Consultivo Nacional de Estadística e Informática (CCONEI)", cat="comision", siglas="CCONEI"),
    O("Comité de Coordinación Interinstitucional de Informática (CCOI)", cat="comision", siglas="CCOI"),
    O("Secretaría General", cat="alta_direccion"),
    O("Órgano de Control Institucional", cat="organo_control"),
    O("Oficina Técnica de Administración", tipo="oficina", cat="organo_apoyo"),
    O("Oficina Técnica de Difusión", tipo="oficina", cat="organo_apoyo"),
    O("Oficina Técnica de Informática", tipo="oficina", cat="organo_apoyo"),
    O("Oficina Técnica de Estadísticas Departamentales", tipo="oficina", cat="organo_apoyo"),
    O("Oficina Técnica de Planificación, Presupuesto y Cooperación Técnica", tipo="oficina", cat="organo_asesoramiento"),
    O("Oficina Técnica de Asesoría Jurídica", tipo="oficina", cat="organo_asesoramiento"),
    O("Oficina de Defensa Nacional", tipo="oficina", cat="organo_asesoramiento"),
    O("Sub Jefatura de Estadística", cat="alta_direccion", hijos=[
        O("Dirección Nacional de Censos y Encuestas", tipo="direccion", cat="organo_linea"),
        O("Dirección Nacional de Cuentas Nacionales", tipo="direccion", cat="organo_linea"),
        O("Dirección Técnica de Indicadores Económicos", tipo="direccion", cat="organo_linea"),
        O("Dirección Técnica de Demografía e Indicadores Sociales", tipo="direccion", cat="organo_linea"),
        O("Oficinas Departamentales de Estadística e Informática (ODEI)", tipo="oficina", cat="organo_desconcentrado", siglas="ODEI"),
    ]),
    O("Escuela Nacional de Estadística e Informática", cat="organo_desconcentrado"),
    O("Centro de Investigación y Desarrollo", cat="organo_desconcentrado"),
])]

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))

def main():
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    inei = next(i for i in todas if i["siglas"] == "INEI")
    print(f"INEI: id={inei['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{inei['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes INEI: {c(inei['id'])}  |  total: {len(todas)}")

main()

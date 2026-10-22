"""Organigrama ESTRUCTURAL OFICIAL de PROMPERÚ (Comisión de Promoción del Perú
para la Exportación y el Turismo). Fuente: PDF "Organigrama estructural" de la
página institucional de PROMPERÚ en gob.pe (ROF). Transcrito íntegro.
PROMPERÚ es organismo público adscrito al MINCETUR: si no existe en el
directorio, este script lo crea bajo MINCETUR antes de cargar su organigrama.
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — PROMPERÚ: Organigrama estructural oficial (ROF)"
URL_FUENTE = 'https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTc0MTIsInB1ciI6ImJsb2JfaWQifX0=--9b84c3ec1e50492507d5005b75de09dab8de905e/OrganigramaPromperu.pdf'
FECHA = "2026-08-24"
NORMA = "ROF de PROMPERÚ (organigrama estructural oficial, gob.pe)"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def OF(n, hijos=None, cat="organo_apoyo"): return O(n, tipo="oficina", cat=cat, hijos=hijos)
def U(n): return O(n, tipo="unidad", cat="unidad_organica")
def DIR(n, hijos=None): return O(n, tipo="direccion", cat="organo_linea", hijos=hijos)
def SD(n): return O(n, tipo="subdireccion", cat="unidad_organica")

ORG = [O("Consejo Directivo", cat="alta_direccion", hijos=[
    O("Órgano de Control Institucional", cat="organo_control"),
    O("Presidencia Ejecutiva", cat="alta_direccion", hijos=[
        O("Gerencia General", tipo="gerencia", cat="alta_direccion", hijos=[
            OF("Oficina de Administración", [
                U("Unidad de Logística"), U("Unidad de Finanzas"),
                U("Unidad de Infraestructura y Gestión Documental"),
            ]),
            OF("Oficina de Recursos Humanos"),
            OF("Oficina de Tecnologías de la Información"),
            OF("Oficina de Comunicaciones"),
            OF("Oficina de Producción"),
            OF("Oficina de Estrategia de Imagen y Marca País", cat="organo_asesoramiento"),
            OF("Oficina de Asesoría Jurídica", cat="organo_asesoramiento"),
            OF("Oficina de Planeamiento y Presupuesto", [
                U("Unidad de Desarrollo Organizacional y Modernización"),
                U("Unidad de Planeamiento y Presupuesto"),
                U("Unidad de Cooperación Técnica Internacional"),
            ], cat="organo_asesoramiento"),
            DIR("Dirección de Coordinación de las Oficinas Regionales", [
                O("Oficinas Regionales", tipo="organo", cat="organo_desconcentrado"),
            ]),
            DIR("Dirección de Promoción de las Exportaciones", [
                SD("Subdirección de Inteligencia y Prospectiva Comercial"),
                SD("Subdirección de Desarrollo Exportador"),
                SD("Subdirección de Promoción Comercial"),
            ]),
            DIR("Dirección de Promoción de Inversiones Empresariales"),
            DIR("Dirección de Promoción del Turismo", [
                SD("Subdirección de Inteligencia y Prospectiva Turística"),
                SD("Subdirección de Promoción del Turismo Interno"),
                SD("Subdirección de Promoción del Turismo Receptivo"),
            ]),
            DIR("Dirección de las Oficinas Comerciales del Perú en el Exterior", [
                O("Oficinas Comerciales del Perú en el Exterior", tipo="organo", cat="organo_desconcentrado"),
            ]),
        ]),
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
    prom = next((i for i in todas if i["siglas"] == "PROMPERU"), None)
    if prom is None:
        mincetur = next(i for i in todas if i["siglas"] == "MINCETUR")
        prom = req("POST", "/api/directorio/instituciones", tok, {
            "nombre": "Comisión de Promoción del Perú para la Exportación y el Turismo",
            "siglas": "PROMPERU", "tipo": "organismo", "sector": "Comercio Exterior y Turismo",
            "parent_id": mincetur["id"], "categoria": "adscrito",
            "url_oficial": "https://www.promperu.gob.pe", "notas": "Adscrito al MINCETUR",
        })
        print(f"PROMPERÚ creado: id={prom['id']} bajo MINCETUR (id {mincetur['id']})")
    print(f"PROMPERÚ: id={prom['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{prom['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes PROMPERÚ: {c(prom['id'])}  |  total: {len(todas)}")

main()

"""Organigrama OFICIAL del DESPACHO PRESIDENCIAL.
Fundamento: "Anexo N.° 02 de la Sección Segunda del ROF del Despacho Presidencial",
aprobado por Resolución N.° 000044-2024/DP-SG (PDF de gob.pe). Transcrito íntegro.
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — Despacho Presidencial: Organigrama oficial (Anexo N.° 02, Sección Segunda del ROF)"
URL_FUENTE = 'https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MzYyNDUwLCJwdXIiOiJibG9iX2lkIn19--03f5a2821472c2348371a20f2e05865008116a91/organigrama.pdf'
FECHA = "2026-08-24"
NORMA = "Resolución N.° 000044-2024/DP-SG (Anexo N.° 02, Sección Segunda del ROF del Despacho Presidencial)"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def OF(n, hijos=None, cat="unidad_organica"): return O(n, tipo="oficina", cat=cat, hijos=hijos)
def SEC(n, hijos=None): return O(n, tipo="secretaria", cat="organo_linea", hijos=hijos)
def SS(n): return O(n, tipo="subsecretaria", cat="unidad_organica")

ORG = [O("Secretaría General del Despacho Presidencial", cat="alta_direccion", hijos=[
    O("Órgano de Control Institucional", cat="organo_control"),
    OF("Oficina de Protocolo"),
    OF("Oficina General de Monitoreo Intergubernamental", cat="organo_linea"),
    SEC("Secretaría de Comunicación Estratégica y Prensa", [
        SS("Subsecretaría de Prensa"),
        SS("Subsecretaría de Comunicación Estratégica e Imagen Institucional"),
    ]),
    SEC("Secretaría del Consejo de Ministros"),
    SEC("Secretaría de Actividades"),
    SEC("Secretaría de Seguridad de la Casa de Gobierno"),
    O("Subsecretaría General", cat="alta_direccion", hijos=[
        OF("Oficina de Gestión Documental y Atención al Ciudadano"),
        OF("Oficina de Integridad Institucional"),
        OF("Oficina General de Administración", [
            OF("Oficina de Abastecimiento"),
            OF("Oficina de Contabilidad y Finanzas"),
            OF("Oficina de Infraestructura y Patrimonio Cultural"),
            OF("Oficina de Operaciones"),
        ], cat="organo_apoyo"),
        OF("Oficina General de Recursos Humanos", cat="organo_apoyo"),
        OF("Oficina General de Tecnologías de la Información y Comunicaciones", cat="organo_apoyo"),
        OF("Oficina General de Asesoría Jurídica", cat="organo_asesoramiento"),
        OF("Oficina General de Planeamiento, Presupuesto y Modernización", cat="organo_asesoramiento"),
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
    dp = next(i for i in todas if i["nombre"] == "Despacho Presidencial")
    print(f"Despacho Presidencial: id={dp['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{dp['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes Despacho Presidencial: {c(dp['id'])}  |  total: {len(todas)}")

main()

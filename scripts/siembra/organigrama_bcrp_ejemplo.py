"""Organigrama GENERAL OFICIAL del BCRP (Banco Central de Reserva del Perú).
Fundamento: "Organigrama General" (Título IX del ROF del BCRP), PDF del portal de
transparencia del BCRP. Confirmado contra el "Artículo 8. Estructura Orgánica
del Banco". Transcrito íntegro a nivel de Gerencia (el ROF trae además
organigramas de detalle por gerencia con subgerencias/departamentos).
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "bcrp.gob.pe — BCRP: Organigrama General (Título IX del ROF)"
URL_FUENTE = 'https://www.bcrp.gob.pe/docs/Transparencia/Organizacion/Organigrama/rof-bcrp-rd-001-2021.pdf'
FECHA = "2026-08-24"
NORMA = "ROF del BCRP — Organigrama General (Título IX) y Artículo 8 (Estructura Orgánica)"

def O(n, tipo="gerencia", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}

ORG = [O("Directorio", tipo="organo", cat="alta_direccion", hijos=[
    O("Presidencia", tipo="organo", cat="alta_direccion"),
    O("Gerencia de Auditoría", cat="organo_control"),
    O("Oficina del Abogado Consultor", tipo="oficina", cat="organo_asesoramiento"),
    O("Secretaría General", tipo="organo", cat="alta_direccion"),
    O("Gerencia General", cat="alta_direccion", hijos=[
        O("Gerencia Jurídica", cat="organo_asesoramiento"),
        O("Gerencia de Comunicaciones", cat="organo_apoyo"),
        O("Gerencia de Riesgos", cat="organo_apoyo"),
        O("Gerencia de Contabilidad y Supervisión", cat="organo_apoyo"),
        O("Gerencia Central de Administración", cat="organo_apoyo", hijos=[
            O("Gerencia de Recursos Humanos"),
            O("Gerencia de Tecnologías de Información"),
            O("Gerencia de Compras y Servicios"),
        ]),
        O("Gerencia Central de Estudios Económicos", cat="organo_linea", hijos=[
            O("Gerencia de Información y Análisis Económico"),
            O("Gerencia de Política Monetaria"),
            O("Gerencia de Política Económica"),
        ]),
        O("Gerencia Central de Operaciones", cat="organo_linea", hijos=[
            O("Gerencia de Operaciones Monetarias y Estabilidad Financiera"),
            O("Gerencia de Operaciones Internacionales"),
            O("Gerencia de Gestión del Circulante"),
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
    bcrp = next(i for i in todas if i["siglas"] == "BCRP")
    print(f"BCRP: id={bcrp['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{bcrp['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes BCRP: {c(bcrp['id'])}  |  total: {len(todas)}")

main()

"""Estructura orgánica OFICIAL de la UNIVERSIDAD NACIONAL DE SAN CRISTÓBAL DE
HUAMANGA (UNSCH). Fuente: "Artículo 5. Estructura Orgánica" del Reglamento de
Organización y Funciones (ROF 2021), aprobado por Resolución Rectoral
N.° 041-2021-UNSCH (portal de transparencia UNSCH). Transcrito íntegro; typos
de OCR corregidos. Dependencias según las secciones "Órganos dependientes del
Rectorado / Vicerrectorado Académico / Vicerrectorado de Investigación".
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "unsch.edu.pe (transparencia) — UNSCH: Estructura Orgánica del ROF 2021 (Art. 5)"
URL_FUENTE = 'https://enlinea2.unsch.edu.pe/new_transparencia/wp-content/uploads/2023/08/ROF-2021-RR-041-2021-UNSCH.pdf'
FECHA = "2026-08-24"
NORMA = "Resolución Rectoral N.° 041-2021-UNSCH (ROF 2021), Artículo 5"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def OF(n, hijos=None, cat="organo_asesoramiento"): return O(n, tipo="oficina", cat=cat, hijos=hijos)
def DIR(n, hijos=None, cat="organo_linea"): return O(n, tipo="direccion", cat=cat, hijos=hijos)
def U(n): return O(n, tipo="unidad", cat="unidad_organica")

VR_ACADEMICO = O("Vicerrectorado Académico", cat="alta_direccion", hijos=[
    DIR("Dirección de Bienestar Universitario", [
        U("Unidad de Comedor y Residencia"),
        U("Unidad de Salud, Psicopedagogía y Servicio Social"),
        U("Unidad de Deportes y Recreación"),
    ]),
    DIR("Dirección de Responsabilidad Social, Proyección y Extensión Cultural", [
        U("Unidad de Responsabilidad Social Universitaria"),
    ]),
    DIR("Dirección de Admisión y Estudios Generales"),
    DIR("Dirección de Gestión Académica", [U("Unidad de Biblioteca")]),
])

VR_INVESTIGACION = O("Vicerrectorado de Investigación", cat="alta_direccion", hijos=[
    DIR("Dirección de Innovación y Transferencia Tecnológica", [
        U("Unidad de Fondo Editorial"),
        U("Unidad de Derechos de Autor y Patentes"),
    ]),
    O("Instituto de Investigación", tipo="organo", cat="organo_linea"),
    DIR("Dirección de Incubadora de Empresas"),
    DIR("Dirección de Fomento a la Formación Científica"),
])

RECTORADO = O("Rectorado", cat="alta_direccion", hijos=[
    # Órganos especiales
    O("Comisión Permanente de Fiscalización", cat="organo_control"),
    O("Defensoría Universitaria", cat="organo_resolutivo"),
    O("Tribunal de Honor Universitario", cat="organo_resolutivo"),
    # Órgano de Control Institucional
    O("Órgano de Control Institucional", siglas="OCI", cat="organo_control"),
    # Asesoramiento
    OF("Oficina de Asesoría Jurídica"),
    OF("Oficina de Cooperación y Relaciones Internacionales"),
    OF("Oficina de Planeamiento y Presupuesto", [
        U("Unidad de Planeamiento y Modernización"),
        U("Unidad de Presupuesto"), U("Unidad Formuladora"),
    ]),
    OF("Oficina de Gestión de la Calidad, Licenciamiento y Acreditación"),
    OF("Oficina de Comunicación e Imagen Institucional"),
    # Apoyo
    O("Dirección General de Administración", tipo="direccion", cat="organo_apoyo", hijos=[
        U("Unidad de Contabilidad"), U("Unidad de Recursos Humanos"),
        U("Unidad de Servicios Generales"), U("Unidad de Abastecimiento"),
        U("Unidad de Tesorería"), U("Unidad Ejecutora de Inversiones"),
    ]),
    OF("Oficina de Tecnologías de la Información", cat="organo_apoyo"),
    O("Secretaría General", cat="organo_apoyo", hijos=[
        U("Unidad de Certificación, Grados y Títulos"),
        U("Unidad de Administración Documentaria y Archivo Central"),
    ]),
    # Órganos de línea (facultades)
    O("Facultades", tipo="organo", cat="organo_linea", hijos=[
        O("Consejo de Facultad", tipo="organo", cat="organo_linea"),
        O("Decanato", tipo="organo", cat="organo_linea", hijos=[
            U("Departamentos Académicos"), U("Unidad de Posgrado"),
            U("Escuelas Profesionales"), U("Unidad de Investigación"),
        ]),
    ]),
    # Órgano dependiente del Rectorado
    O("Escuela de Posgrado", tipo="organo", cat="organo_linea"),
    VR_ACADEMICO,
    VR_INVESTIGACION,
])

ORG = [O("Asamblea Universitaria", cat="alta_direccion", hijos=[
    O("Consejo Universitario", cat="alta_direccion", hijos=[RECTORADO]),
])]

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))

def main():
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    u = next(i for i in todas if i["siglas"] == "UNSCH" or "San Cristóbal de Huamanga" in i["nombre"])
    print(f"UNSCH: id={u['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{u['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes UNSCH: {c(u['id'])}  |  total: {len(todas)}")

main()

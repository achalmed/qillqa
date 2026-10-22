"""Organigrama del MINISTERIO DE RELACIONES EXTERIORES (RREE / MRE).
Fundamento: PDF publicado en gob.pe. Anexo del Texto Integrado del ROF del MRE,
aprobado con RM N.° 0516-2025-RE. Transcrito íntegro.
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — RREE (MRE): Organigrama oficial"
URL_FUENTE = ("https://www.gob.pe/rails/active_storage/blobs/redirect/"
              "eyJfcmFpbHMiOnsiZGF0YSI6NDgyOTQ0LCJwdXIiOiJibG9iX2lkIn19"
              "--50dcb713b0dd6b3f0ecb54ea40c16df372bc535d/"
              "organigrama-del-ministerio-de-relaciones-exteriores-del-peru-2025.pdf")
FECHA = "2026-08-24"
NORMA = "RM N.° 0516-2025-RE (Texto Integrado del ROF del MRE)"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def OF(n, hijos=None): return O(n, tipo="oficina", hijos=hijos or [])
def OG(n, hijos=None, cat="organo_apoyo"): return O(n, tipo="oficina", cat=cat, hijos=hijos or [])
def DG(n, hijos): return O(n, tipo="direccion", cat="organo_linea", hijos=hijos)
def D(n): return O(n, tipo="direccion", cat="unidad_organica")

ORG = [O("Despacho Ministerial", cat="alta_direccion", hijos=[
    O("Órgano de Control Institucional", cat="organo_control"),
    O("Procuraduría Pública", cat="organo_defensa"),
    OG("Oficina General de Comunicación Estratégica y Proyección de Imagen Internacional", [
        OF("Oficina de Gestión de Prensa y Difusión Internacional"),
        OF("Oficina de Comunicación Digital e Imagen Institucional"),
    ]),
    O("Secretaría General", cat="alta_direccion", hijos=[
        OF("Oficina de Coordinación y Monitoreo de las Direcciones Desconcentradas"),
        OG("Oficina General de Administración", [
            OF("Oficina de Finanzas"), OF("Oficina de Logística"),
            OF("Oficina de Seguridad y Gestión del Riesgo de Desastres"),
        ]),
        OG("Oficina General de Recursos Humanos", [
            OF("Oficina de Administración de Personal"),
            OF("Oficina de Remuneraciones y Pensiones"),
            OF("Oficina de Servicios de Bienestar"), OF("Oficina de Capacitación"),
        ]),
        OG("Oficina General de Transformación Digital Institucional", [
            OF("Oficina de Servicios Digitales, Innovación Digital e Inteligencia Artificial"),
            OF("Oficina de Arquitectura y Seguridad Digital"),
            OF("Oficina de Gestión Documental y Archivo"),
        ]),
        OG("Oficina General de Gestión Exterior"),
        OG("Oficina General de Inversiones, Infraestructura y Lineamientos para la Adquisición y Mantenimiento de Bienes en el Exterior", [
            OF("Oficina de Inversiones e Infraestructura"),
            OF("Oficina de Control Patrimonial y Gestión de Bienes en el Exterior"),
            OF("Oficina de Gestión del Patrimonio Cultural Institucional"),
        ]),
        OG("Oficina General de Planeamiento y Presupuesto", [
            OF("Oficina de Programación y Presupuesto"),
            OF("Oficina de Organización y Modernización"),
        ], cat="organo_asesoramiento"),
        OG("Oficina General de Asuntos Legales", [
            OF("Oficina de Asuntos Administrativos"),
            OF("Oficina de Cooperación Judicial Internacional"),
            OF("Oficina de Integridad Institucional"),
            OF("Oficina de Transparencia y Acceso a la Información Pública"),
        ], cat="organo_asesoramiento"),
    ]),
    O("Despacho Viceministerial", cat="alta_direccion", hijos=[
        DG("Dirección General de Estudios y Estrategias de Política Exterior", [
            D("Dirección de Políticas y Estrategias"),
            D("Dirección de Evaluación de la Política Exterior"),
            D("Dirección de Manejo de Crisis y Prevención de Conflictos"),
            D("Centro de Estudios Globales y Estratégicos"),
        ]),
        DG("Dirección General de América", [
            D("Dirección de América del Sur"), D("Dirección de América del Norte"),
            D("Dirección de Centroamérica"),
            D("Dirección del Caribe y Asuntos de la Comunidad del Caribe"),
            D("Dirección de Asuntos Amazónicos"),
            D("Dirección de Mecanismos de Coordinación Sudamericanos"),
        ]),
        DG("Dirección General de Desarrollo e Integración Fronteriza", [
            D("Dirección de Desarrollo Fronterizo"), D("Dirección de Integración Fronteriza"),
        ]),
        DG("Dirección General de Soberanía, Límites y Asuntos Antárticos", [
            D("Dirección de Límites"), D("Dirección de Asuntos Marítimos"),
            D("Dirección de Aguas Transfronterizas"),
            D("Dirección de Asuntos Aéreos y Espaciales"),
            D("Dirección de Asuntos Antárticos"),
        ]),
        DG("Dirección General de Europa", [
            D("Dirección de Europa Comunitaria"), D("Dirección de Europa No Comunitaria"),
            D("Dirección de Integración Europea"),
        ]),
        DG("Dirección General de Asia y Oceanía", [
            D("Dirección de Asia Oriental"), D("Dirección de Sudeste Asiático y Oceanía"),
            D("Dirección de Asia Central y Meridional"),
            D("Dirección de APEC y Foros Especializados"),
        ]),
        DG("Dirección General de África, Medio Oriente y Países del Golfo", [
            D("Dirección de África"), D("Dirección de Medio Oriente y Países del Golfo"),
        ]),
        DG("Dirección General para Asuntos Multilaterales y Globales", [
            D("Dirección de Organismos y Política Multilateral"),
            D("Dirección de Seguridad y Defensa"), D("Dirección de Medio Ambiente"),
            D("Dirección de Derechos Humanos"), D("Dirección para Asuntos Sociales"),
            D("Dirección de Control de Drogas"),
        ]),
        DG("Dirección General para Asuntos Económicos", [
            D("Dirección de Negociaciones Económicas Internacionales"),
            D("Dirección de Integración"),
            D("Dirección de Cooperación Internacional y Asistencia Humanitaria Internacional"),
            D("Dirección de Ciencia, Tecnología, Innovación y Energía"),
        ]),
        DG("Dirección General de Promoción Económica", [
            D("Dirección de Promoción Comercial"), D("Dirección de Promoción de Inversiones"),
            D("Dirección de Promoción del Turismo y Gastronomía"),
        ]),
        DG("Dirección General de Comunidades Peruanas en el Exterior y Asuntos Consulares", [
            D("Dirección de Política Consular"), D("Dirección de Trámites Consulares"),
            D("Dirección de Política Migratoria"),
            D("Dirección de Protección y Asistencia al Nacional"),
        ]),
        DG("Dirección General de Diplomacia Cultural", [
            D("Dirección de Diplomacia Cultural"), D("Dirección de Promoción Cultural"),
        ]),
        DG("Dirección General de Tratados y Derecho Internacional", [
            D("Dirección de Tratados y Asuntos Jurídicos Internacionales"),
            D("Dirección de Registro de Tratados y Otros Instrumentos Internacionales"),
            D("Dirección de Relaciones Educativas y del Deporte"),
            D("Dirección de Protección y Repatriación de Bienes Culturales"),
            D("Centro Cultural Inca Garcilaso"),
        ]),
        DG("Dirección General de Protocolo y Ceremonial del Estado", [
            D("Dirección de Ceremonial del Estado"), D("Dirección de Privilegios e Inmunidades"),
        ]),
    ]),
    O("Órganos de Servicio Exterior", cat="organo_desconcentrado", hijos=[
        O("Embajadas", cat="organo_desconcentrado"),
        O("Representaciones Permanentes ante Organismos Internacionales", cat="organo_desconcentrado"),
        O("Oficinas Consulares", cat="organo_desconcentrado"),
    ]),
    O("Direcciones Desconcentradas", cat="organo_desconcentrado"),
    O("Academia Diplomática del Perú", tipo="organismo", cat="organo_desconcentrado"),
    O("Agencia Peruana de Cooperación Internacional", tipo="organismo", cat="adscrito", siglas="APCI"),
])]

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))

def main():
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("QILLQA_USUARIO", "admin"), "clave": os.environ["QILLQA_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    rree = next(i for i in todas if i["siglas"] == "RREE")
    print(f"RREE: id={rree['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{rree['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes RREE: {c(rree['id'])}  |  total: {len(todas)}")

main()

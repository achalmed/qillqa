"""Organigrama OFICIAL del MINISTERIO DE SALUD (MINSA).
Fundamento: "ORGANIGRAMA DEL MINSA" publicado en el Diario Oficial El Peruano
(lunes 24 de abril de 2017), Anexo del ROF aprobado por D.S. N.° 008-2017-SA.
Transcrito íntegro del PDF oficial (una página). Sin simplificar.
"""
import json, os, urllib.request
BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe / El Peruano — MINSA: Organigrama oficial (Anexo del ROF)"
URL_FUENTE = ("https://www.gob.pe/rails/active_storage/blobs/redirect/"
              "eyJfcmFpbHMiOnsiZGF0YSI6MTc0MDAsInB1ciI6ImJsb2JfaWQifX0="
              "--3e8330d32cc61dcdd58bbaf94ca7456de6888ed3/Organigrama_2018.pdf")
FECHA = "2026-08-24"
NORMA = "D.S. N.° 008-2017-SA (ROF del MINSA), organigrama publicado el 24/04/2017"

def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def OF(n, hijos=None): return O(n, tipo="oficina", cat="unidad_organica", hijos=hijos)
def OG(n, hijos=None, cat="organo_apoyo"): return O(n, tipo="oficina", cat=cat, hijos=hijos)
def DG(n, hijos=None): return O(n, tipo="direccion", cat="organo_linea", hijos=hijos)
def D(n): return O(n, tipo="direccion", cat="unidad_organica")

SECRETARIA_GENERAL = O("Secretaría General", cat="alta_direccion", hijos=[
    OF("Oficina de Transparencia y Anticorrupción"),
    OF("Oficina de Gestión Documental y Atención al Ciudadano"),
    OG("Oficina General de Administración", [
        OF("Oficina de Abastecimiento"), OF("Oficina de Contabilidad"),
        OF("Oficina de Tesorería"), OF("Oficina de Cobranzas y Ejecución Coactiva"),
    ]),
    OG("Oficina General de Gestión de Recursos Humanos", [
        OF("Oficina de Desarrollo de Recursos Humanos"),
        OF("Oficina de Administración de Recursos Humanos"),
    ]),
    OG("Oficina General de Tecnologías de la Información", [
        OF("Oficina de Gestión de la Información"),
        OF("Oficina de Soporte e Infraestructura Tecnológica"),
        OF("Oficina de Innovación y Desarrollo Tecnológico"),
    ]),
    OG("Oficina General de Comunicaciones", [
        OF("Oficina de Información Pública"),
        OF("Oficina de Comunicación Estratégica"),
    ]),
    OG("Oficina General de Planeamiento, Presupuesto y Modernización", [
        OF("Oficina de Planeamiento y Estudios Económicos"),
        OF("Oficina de Programación Multianual de Inversiones"),
        OF("Oficina de Organización y Modernización"),
        OF("Oficina de Presupuesto"),
    ], cat="organo_asesoramiento"),
    OG("Oficina General de Gestión Descentralizada"),
    OG("Oficina General de Asesoría Jurídica", cat="organo_asesoramiento"),
    OG("Oficina General de Cooperación Técnica Internacional", cat="organo_asesoramiento"),
])

VM_SALUD_PUBLICA = O("Despacho Viceministerial de Salud Pública", cat="alta_direccion", hijos=[
    DG("Dirección General de Intervenciones Estratégicas en Salud Pública", [
        D("Dirección de Salud Mental"),
        D("Dirección de Prevención y Control de Discapacidad"),
        D("Dirección de Salud Sexual y Reproductiva"),
        D("Dirección de Prevención y Control de Enfermedades No Transmisibles, Raras y Huérfanas"),
        D("Dirección de Prevención y Control del Cáncer"),
        D("Dirección de Salud Bucal"),
        D("Dirección de Inmunizaciones"),
        D("Dirección de Enfermedades Metaxénicas y Zoonosis"),
        D("Dirección de Prevención y Control de VIH-SIDA, ETS y Hepatitis"),
        D("Dirección de Prevención y Control de Tuberculosis"),
        D("Dirección de Intervenciones por Curso de Vida y Cuidado Integral"),
        D("Dirección de Pueblos Indígenas u Originarios"),
        D("Dirección de Promoción de la Salud"),
    ]),
    DG("Dirección General de Salud Ambiental e Inocuidad Alimentaria", [
        D("Dirección de Certificaciones y Autorizaciones"),
        D("Dirección de Control y Vigilancia"),
        D("Dirección de Fiscalización y Sanción"),
    ]),
    DG("Dirección General de Medicamentos, Insumos y Drogas", [
        D("Dirección de Productos Farmacéuticos"),
        D("Dirección de Dispositivos Médicos y Productos Sanitarios"),
        D("Dirección de Inspección y Certificación"),
        D("Dirección de Farmacovigilancia, Acceso y Uso"),
    ]),
    DG("Dirección General de Gestión de Riesgos de Desastres y Defensa Nacional en Salud"),
    DG("Dirección General de Donaciones, Trasplantes y Banco de Sangre", [
        D("Dirección de Donaciones y Trasplantes"),
        D("Dirección de Banco de Sangre y Hemoterapia (PRONAHEBAS)"),
    ]),
    O("Centro Nacional de Epidemiología, Prevención y Control de Enfermedades (CDC)",
      tipo="organo", cat="organo_desconcentrado", siglas="CDC"),
])

VM_PRESTACIONES = O("Despacho Viceministerial de Prestaciones y Aseguramiento en Salud",
                    cat="alta_direccion", hijos=[
    DG("Dirección General de Aseguramiento e Intercambio Prestacional", [
        D("Dirección de Aseguramiento en Salud"),
        D("Dirección de Intercambio Prestacional, Organización y Servicios de Salud"),
    ]),
    DG("Dirección General de Telesalud, Referencia y Urgencias", [
        D("Dirección de Telemedicina"),
        D("Dirección de INFOSALUD"),
        D("Dirección de Servicios de Atención Móvil de Urgencias"),
    ]),
    DG("Dirección General de Operaciones en Salud", [
        D("Dirección de Monitoreo y Evaluación de la Gestión en Salud"),
        D("Dirección de Equipamiento y Mantenimiento"),
    ]),
    DG("Dirección General de Personal de la Salud", [
        D("Dirección de Planificación del Personal de la Salud"),
        D("Dirección de Fortalecimiento de Capacidades del Personal de la Salud"),
    ]),
    # Programa y órganos desconcentrados que penden de este Viceministerio en el organigrama
    O("Programa Nacional de Inversiones en Salud (PRONIS)", tipo="programa", cat="programa", siglas="PRONIS"),
    O("Centro Nacional de Abastecimiento de Recursos Estratégicos en Salud (CENARES)",
      tipo="organo", cat="organo_desconcentrado", siglas="CENARES"),
    O("Escuela Nacional de Salud Pública (ENSAP)", tipo="organo", cat="organo_desconcentrado", siglas="ENSAP"),
    O("Direcciones de Redes Integradas de Salud", tipo="organo", cat="organo_desconcentrado", siglas="DIRIS"),
    O("Institutos Nacionales Especializados", tipo="organo", cat="organo_desconcentrado"),
])

ORG = [O("Despacho Ministerial", cat="alta_direccion", hijos=[
    O("Consejo Nacional de Salud", tipo="organo", cat="comision", hijos=[
        O("Secretaría de Coordinación", tipo="oficina", cat="unidad_organica"),
    ]),
    O("Órgano de Control Institucional", cat="organo_control", hijos=[
        OF("Oficina de Servicios de Control Posterior"),
        OF("Oficina de Servicios de Control Simultáneo y Servicios Relacionados"),
    ]),
    O("Procuraduría Pública", cat="organo_defensa"),
    SECRETARIA_GENERAL,
    VM_SALUD_PUBLICA,
    VM_PRESTACIONES,
    # Organismos públicos adscritos NUEVOS (INS, INEN, SIS). SUSALUD ya existe
    # como raíz (regulador) -> se re-vincula por PUT, no se duplica aquí.
    O("Instituto Nacional de Salud", tipo="organismo", cat="adscrito", siglas="INS"),
    O("Instituto Nacional de Enfermedades Neoplásicas", tipo="organismo", cat="adscrito", siglas="INEN"),
    O("Seguro Integral de Salud", tipo="organismo", cat="adscrito", siglas="SIS"),
])]

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))

def main():
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("QILLQA_USUARIO", "admin"), "clave": os.environ["QILLQA_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    minsa = next(i for i in todas if i["siglas"] == "MINSA")
    print(f"MINSA: id={minsa['id']}")
    print("organigrama:", req("POST", f"/api/directorio/instituciones/{minsa['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
        "reemplazar": True, "nodos": ORG}))
    # Re-vincular SUSALUD (regulador raíz) como adscrito del MINSA, sin borrar sus datos
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    despacho = next(i for i in todas if i["parent_id"] == minsa["id"] and i["nombre"] == "Despacho Ministerial")
    sus = next((i for i in todas if i["siglas"] == "SUSALUD"), None)
    if sus and sus["parent_id"] != despacho["id"]:
        cuerpo = {k: v for k, v in sus.items() if k not in ("id", "origen")}
        cuerpo["parent_id"] = despacho["id"]; cuerpo["categoria"] = "adscrito"
        req("PUT", f"/api/directorio/instituciones/{sus['id']}", tok, cuerpo)
        print(f"SUSALUD (id {sus['id']}) re-vinculado como adscrito bajo Despacho Ministerial (id {despacho['id']})")
    # Conteo final
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"Descendientes MINSA: {c(minsa['id'])}  |  total: {len(todas)}")

main()

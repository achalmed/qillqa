"""Estructura Orgánica del GOBIERNO REGIONAL DE AYACUCHO (Anexo 001).
Fundamento: PDF «ORGANIGRAMA-MODIFICADO-2025.pdf» publicado en la página
institucional del GORE Ayacucho en gob.pe. Transcrito del organigrama oficial.
"""
import json, os, urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — Gobierno Regional de Ayacucho: Estructura orgánica (Anexo 001)"
URL_FUENTE = "https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NDIzNTQzLCJwdXIiOiJibG9iX2lkIn19--a277b780f57660c53bbad5625d2a45ba20bb155a/ORGANIGRAMA-MODIFICADO-2025.pdf"
FECHA = "2026-08-24"
NORMA = "ROF del Gobierno Regional de Ayacucho (organigrama modificado 2025)"


def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def SG(n, hijos=None): return O(n, tipo="unidad", cat="unidad_organica", hijos=hijos or [])  # Subgerencia/Subdirección
def OF(n, hijos=None): return O(n, tipo="oficina", hijos=hijos or [])
def DR(n): return O(n, tipo="direccion", cat="organo_desconcentrado")  # Dirección Regional (desconcentrado)


ORG = [
    O("Consejo Regional", cat="organo_resolutivo", hijos=[
        O("Secretaría Técnica de Consejo Regional", tipo="unidad", cat="unidad_organica"),
    ]),
    O("Gobernación Regional", cat="alta_direccion", hijos=[
        O("Vice Gobernación", cat="alta_direccion"),
        O("Órgano de Control Institucional", cat="organo_control"),
        O("Procuraduría Pública Regional", cat="organo_defensa"),
        O("Consejo de Coordinación Regional", cat="comision"),
        O("Consejos Consultivos Regionales", cat="comision"),
        O("Gerencia General Regional", cat="alta_direccion", hijos=[
            O("Directorio de Gerentes Regionales", cat="comision"),
            OF("Oficina de Integridad Institucional"),
            OF("Oficina de Imagen Institucional"),
            OF("Oficina de Atención al Ciudadano y Gestión Documentario"),
            OF("Oficina de Tecnologías de la Información y Comunicaciones"),
            OF("Oficina de Bienes Regionales"),
            O("Gerencia Regional de Gestión del Riesgo de Desastres, Seguridad y Defensa", tipo="direccion", cat="organo_linea"),
            O("Oficina Regional de Administración", tipo="oficina", cat="organo_apoyo", hijos=[
                OF("Oficina de Abastecimiento y Patrimonio"), OF("Oficina de Contabilidad"),
                OF("Oficina de Tesorería"), OF("Oficina de Gestión de Recursos Humanos"),
            ]),
            O("Gerencia Regional de Planeamiento, Presupuesto y Acondicionamiento Territorial", tipo="direccion", cat="organo_asesoramiento", hijos=[
                SG("Subgerencia de Planeamiento Estratégico y Cooperación Internacional"),
                SG("Subgerencia de Programación Multianual y Gestión de Inversiones"),
                SG("Subgerencia de Presupuesto"),
                SG("Subgerencia de Organización y Modernización"),
                SG("Subgerencia de Demarcación y Organización Territorial"),
                SG("Subgerencia de Estudios de Preinversión y Estadística"),
            ]),
            O("Oficina Regional de Asesoría Jurídica", tipo="oficina", cat="organo_asesoramiento"),
            OF("Oficina Regional de Supervisión y Liquidación de Programas e Inversiones"),
            O("Gerencia Regional de Desarrollo Económico", tipo="direccion", cat="organo_linea", hijos=[
                O("Dirección Regional de la Producción", tipo="direccion", cat="organo_desconcentrado", hijos=[
                    SG("Sub Dirección de MYPE e Industria"), SG("Sub Dirección de Acuicultura y Pesca"),
                ]),
                O("Dirección Regional Comercio Exterior y Turismo", tipo="direccion", cat="organo_desconcentrado", hijos=[
                    SG("Sub Dirección de Comercio Exterior"), SG("Sub Dirección de Turismo y Artesanía"),
                ]),
                O("Dirección Regional de Energía, Minas e Hidrocarburos", tipo="direccion", cat="organo_desconcentrado", hijos=[
                    SG("Sub Dirección de Energía e Hidrocarburos"), SG("Sub Dirección de Minas"),
                ]),
                DR("Dirección Regional de Agricultura"),
            ]),
            O("Gerencia Regional de Desarrollo Social", tipo="direccion", cat="organo_linea", hijos=[
                O("Dirección Regional de Vivienda, Construcción y Saneamiento", tipo="direccion", cat="organo_desconcentrado", hijos=[
                    SG("Sub Dirección de Vivienda y Urbanismo"), SG("Sub Dirección de Construcción y Saneamiento"),
                ]),
                O("Dirección Regional de Trabajo y Promoción del Empleo", tipo="direccion", cat="organo_desconcentrado", hijos=[
                    SG("Sub Dirección de Prevención y Solución de Conflictos Laborales, Derechos Fundamentales y Seguridad y Salud en el Trabajo"),
                    SG("Sub Dirección de Promoción del Empleo y Capacitación Laboral"),
                ]),
                O("Dirección de Archivo Regional", tipo="direccion", cat="unidad_organica"),
                SG("Subgerencia de Desarrollo Humano"),
                DR("Dirección Regional de Educación"),
                DR("Dirección Regional de Salud"),
            ]),
            O("Gerencia Regional de Infraestructura", tipo="direccion", cat="organo_linea", hijos=[
                SG("Subgerencia de Estudios Definitivos y Expedientes Técnicos"),
                SG("Subgerencia de Ejecución de Inversiones"),
                SG("Subgerencia de Operación y Mantenimiento de Equipo Mecánico"),
                DR("Dirección Regional de Transportes y Comunicaciones"),
            ]),
            O("Gerencia Regional de Recursos Naturales y Gestión del Medio Ambiente", tipo="direccion", cat="organo_linea", hijos=[
                SG("Sub Gerencia de Gestión de Recursos Naturales"),
                SG("Sub Gerencia de Gestión Ambiental"),
                O("Programa Regional de Irrigación y Desarrollo Rural - PRIDER", tipo="programa", cat="programa", siglas="PRIDER"),
                O("Operador Infraestructura Hidráulica Cachi", tipo="proyecto", cat="proyecto"),
            ]),
            O("Direcciones Subregionales Territoriales (11)", tipo="direccion", cat="organo_desconcentrado"),
        ]),
    ]),
]


def req(method, path, tok=None, body=None):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if body is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))


def main():
    tok = req("POST", "/api/auth/login", body={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    gore = next(i for i in todas if i["nombre"] == "Gobierno Regional de Ayacucho")
    print(f"GORE Ayacucho: id={gore['id']}")
    res = req("POST", f"/api/directorio/instituciones/{gore['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORG,
    })
    print("organigrama:", res)
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    hijos = {}
    for i in todas: hijos.setdefault(i["parent_id"], []).append(i)
    def contar(pid): return sum(1 + contar(h["id"]) for h in hijos.get(pid, []))
    print(f"Descendientes GORE Ayacucho: {contar(gore['id'])}  |  total: {len(todas)}")


main()

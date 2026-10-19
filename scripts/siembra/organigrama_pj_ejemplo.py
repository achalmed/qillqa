"""Estructura Orgánica del PODER JUDICIAL (primer tramo de implementación del
ROF, RA 302-2024-CE-PJ y RA 420-2024-CE-PJ). Fuente: PDF publicado en la página
institucional del Poder Judicial en gob.pe. Transcrito del organigrama oficial.
"""
import json, os, urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — Poder Judicial: Estructura orgánica"
URL_FUENTE = "https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6NTcxMDEyLCJwdXIiOiJibG9iX2lkIn19--775d35f0fcd71cf21ab66db38cb727d6acc76698/Organigrama%20del%20Poder%20Judicial%20(Primer%20tramo%20de%20implementaci%C3%B3n,%20aprobado%20por%20R.A.%20N.%C2%B0%20302-2024-CE-PJ%20y%20modificado%20por%20R.A.%20N.%C2%B0%20420-2024-CE-PJ).pdf"
FECHA = "2026-08-24"
NORMA = "ROF del Poder Judicial (RA 302-2024-CE-PJ y RA 420-2024-CE-PJ, primer tramo)"


def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def U(n): return O(n, tipo="unidad", cat="unidad_organica")
def OF(n, hijos=None): return O(n, tipo="oficina", hijos=hijos or [])
def GER(n, hijos=None): return O(n, tipo="direccion", cat="organo_apoyo", hijos=hijos or [])  # gerencia
def SUB(n): return O(n, tipo="unidad", cat="unidad_organica")  # subgerencia


ORG = [
    O("Corte Suprema de Justicia", cat="alta_direccion", siglas="", hijos=[
        O("Órgano de Control Institucional", cat="organo_control"),
        O("Autoridad Nacional de Control del Poder Judicial", cat="organo_control", siglas="ANC-PJ"),
        O("Procuraduría Pública", cat="organo_defensa"),
        O("Presidencia de la Corte Suprema y Sala Plena", cat="alta_direccion", hijos=[
            O("Gabinete de Asesores", tipo="unidad", cat="organo_asesoramiento"),
            U("Unidad de Información"), OF("Observatorio Judicial"),
            O("Secretaría General", tipo="oficina"),
            OF("Oficina de Protocolo"), OF("Oficina de Seguridad Integral"),
            OF("Oficina de Administración"),
            O("Salas Supremas Permanentes", cat="organo_resolutivo"),
            O("Salas Supremas Transitorias", cat="organo_resolutivo"),
            O("Cortes Superiores de Justicia", cat="organo_desconcentrado", hijos=[
                O("Consejo Ejecutivo Distrital", cat="organo_desconcentrado"),
                O("Oficina Distrital de Apoyo a la Justicia de Paz (ODAJUP)", tipo="oficina", cat="organo_desconcentrado", siglas="ODAJUP"),
                O("Oficina o Gerencia de Administración Distrital", tipo="oficina", cat="organo_desconcentrado"),
                O("Salas Superiores Especializadas y Salas Superiores Mixtas", cat="organo_desconcentrado"),
                O("Juzgados Especializados y Juzgados Mixtos", cat="organo_desconcentrado"),
                O("Juzgados de Paz Letrados", cat="organo_desconcentrado"),
                O("Juzgados de Paz", cat="organo_desconcentrado"),
            ]),
            O("Oficina Desconcentrada de la Autoridad Nacional de Control (ODANC)", tipo="oficina", cat="organo_desconcentrado", siglas="ODANC"),
        ]),
    ]),
    O("Consejo Ejecutivo del Poder Judicial", cat="alta_direccion", hijos=[
        O("Secretaría General", tipo="oficina"),
        O("Asesoría Legal", tipo="oficina", cat="organo_asesoramiento"),
        OF("Oficina de Cooperación Técnica Internacional"),
        U("Unidad de Integridad"),
        OF("Centro de Investigaciones Judiciales"),
        OF("Oficina de Productividad Judicial"),
        U("Unidad de Gestión de Despacho Judicial"),
        U("Unidad de Equipo Técnico Institucional de Código Procesal Penal"),
        O("Oficina Nacional de Apoyo a la Justicia de Paz y a la Justicia Indígena", tipo="oficina", cat="organo_desconcentrado", hijos=[
            O("Oficina de Coordinación de Proyectos", tipo="oficina", hijos=[
                U("Unidad de Planes y Estudios de Proyectos"),
                U("Unidad de Administración y Finanzas"),
                U("Unidad de Monitoreo y Supervisión de Proyectos"),
            ]),
        ]),
        O("Gerencia General del Poder Judicial", cat="alta_direccion", hijos=[
            O("Secretaría de Atención al Ciudadano y Trámite Documental", tipo="unidad", cat="unidad_organica"),
            GER("Gerencia de Administración y Finanzas", [
                SUB("Subgerencia de Abastecimiento"), SUB("Subgerencia de Administración de Bienes"),
                SUB("Subgerencia de Contabilidad"), SUB("Subgerencia de Tesorería"),
            ]),
            GER("Gerencia de Comunicaciones e Imagen Institucional", [
                SUB("Subgerencia de Prensa y Comunicaciones"), SUB("Subgerencia de Televisión Judicial"),
            ]),
            GER("Gerencia de Gestión de Inversiones", [
                SUB("Subgerencia de Formulación y Evaluación de Inversiones"),
                SUB("Subgerencia de Ejecución de Inversiones"),
            ]),
            GER("Gerencia de Recursos Humanos", [
                SUB("Subgerencia de Capacitación y de Rendimiento"),
                SUB("Subgerencia de Gestión de la Compensación"),
                SUB("Subgerencia de Gestión del Empleo"),
                SUB("Subgerencia de Registros Laborales"),
                SUB("Subgerencia de Relaciones Humanas y Sociales"),
            ]),
            GER("Gerencia de Servicios Judiciales", [
                SUB("Subgerencia de Recaudación Judicial"), SUB("Subgerencia de Registros Judiciales"),
                SUB("Subgerencia de Servicios Judiciales y Atención al Usuario"),
            ]),
            GER("Gerencia de Tecnologías de Información", [
                SUB("Subgerencia de Administración de Tecnologías de Información"),
                SUB("Subgerencia de Desarrollo de Sistemas de Información"),
                SUB("Subgerencia de Soporte de Tecnologías de Información"),
            ]),
            GER("Gerencia de Asesoría Jurídica"),
            GER("Gerencia de Gestión de Procesos e Innovación", [
                SUB("Subgerencia de Gestión de Procesos"), SUB("Subgerencia de Innovación de Servicios"),
            ]),
            GER("Gerencia de Modernización, Planeamiento y Presupuesto", [
                SUB("Subgerencia de Modernización"),
                SUB("Subgerencia de Programación Multianual de Inversiones"),
                SUB("Subgerencia de Estadística"), SUB("Subgerencia de Planes y Presupuesto"),
            ]),
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
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    pj = next(i for i in todas if i["nombre"] == "Poder Judicial" or i["siglas"] == "PJ")
    print(f"Poder Judicial: id={pj['id']} «{pj['nombre']}»")
    res = req("POST", f"/api/directorio/instituciones/{pj['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORG,
    })
    print("organigrama:", res)
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    hijos = {}
    for i in todas: hijos.setdefault(i["parent_id"], []).append(i)
    def contar(pid): return sum(1 + contar(h["id"]) for h in hijos.get(pid, []))
    print(f"Descendientes PJ: {contar(pj['id'])}  |  total: {len(todas)}")


main()

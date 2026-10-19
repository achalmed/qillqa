"""Estructura Orgánica del SERVICIO PARLAMENTARIO del Congreso de la República.
Fundamento: PDF «ORGANIGRAMA_03012024.pdf» publicado en la página institucional del
Congreso en gob.pe. Aprobado por Acuerdo de Mesa N.° 059-2023-2024/MESA-CR del
17 de noviembre de 2023. Transcrito del organigrama oficial.
"""
import json, os, urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — Congreso de la República: Estructura orgánica del Servicio Parlamentario"
URL_FUENTE = "https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MjE4NjY1LCJwdXIiOiJibG9iX2lkIn19--c3a38b08edc11f9b14f42b96052dfe5dad788300/ORGANIGRAMA_03012024.pdf"
FECHA = "2026-08-24"
NORMA = "Acuerdo de Mesa N.° 059-2023-2024/MESA-CR (17 de noviembre de 2023)"


def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}


def A(n):  # Área (nivel más bajo)
    return O(n, tipo="unidad", cat="unidad_organica")


def DEP(n, hijos=None):  # Departamento
    return O(n, tipo="unidad", cat="unidad_organica", hijos=hijos or [])


def OF(n, hijos=None):
    return O(n, tipo="oficina", hijos=hijos or [])


ORG = [
    O("Consejo Directivo", cat="alta_direccion", hijos=[
        O("Mesa Directiva", cat="alta_direccion", hijos=[
            O("Presidencia del Congreso", cat="alta_direccion", hijos=[
                OF("Oficina de Auditoría Interna", ) if False else O("Oficina de Auditoría Interna", tipo="oficina", cat="organo_control"),
                O("Procuraduría Pública del Congreso", cat="organo_defensa"),
                OF("Oficina de Comunicaciones e Imagen Institucional"),
                O("Oficialía Mayor", cat="alta_direccion", hijos=[
                    O("Secretaría Técnica", tipo="unidad", cat="unidad_organica"),
                    OF("Oficina de Participación Ciudadana", [
                        A("Área de Educación Ciudadana"), A("Área de Atención Ciudadana"),
                    ]),
                    OF("Oficina de Enlace con los Gobiernos Regionales y Locales"),
                    OF("Fondo Editorial"),
                    OF("Oficina de Protocolo"),
                    OF("Centro de Estudios Constitucionales y Parlamentarios"),
                    OF("Oficina de Seguridad"),
                    OF("Oficina de Gestión del Riesgo de Desastres"),
                    OF("Oficina de Cooperación Internacional"),
                    OF("Oficina de Calidad Legislativa"),
                    OF("Oficina de Asesoramiento Científico"),
                    OF("Oficina Legal y Constitucional del Congreso", [
                        A("Área de Asesoría Jurídica"), A("Área de Defensa de las Leyes"),
                    ]),
                    OF("Oficina de Planeamiento, Presupuesto y Modernización", [
                        A("Área de Planeamiento"), A("Área de Presupuesto"),
                        A("Área de Modernización"),
                    ]),
                    O("Dirección General de Administración", tipo="direccion", cat="organo_apoyo", hijos=[
                        DEP("Departamento de Abastecimiento", [
                            A("Área de Programación y Gestión de Adquisiciones"),
                            A("Área de Administración de Bienes"),
                        ]),
                        DEP("Departamento de Recursos Humanos", [
                            A("Área de Administración de Personal"),
                            A("Área de Desarrollo y Bienestar de Personal"),
                            A("Área de Seguros"), A("Área de Asesoría Laboral"),
                        ]),
                        DEP("Departamento de Finanzas", [
                            A("Área de Contabilidad"), A("Área de Tesorería"),
                        ]),
                        DEP("Departamento de Tecnologías de la Información", [
                            A("Área de Ingeniería de Software"),
                            A("Área de Soporte y Servicios Informáticos"),
                            A("Área de Infraestructura Tecnológica"),
                        ]),
                        DEP("Departamento de Servicios Generales", [
                            A("Área de Ingeniería e Infraestructura"),
                            A("Área de Administración de Edificios"),
                            A("Área de Transportes y Servicios"),
                        ]),
                    ]),
                    O("Dirección General Parlamentaria", tipo="direccion", cat="organo_linea", hijos=[
                        DEP("Departamento de Investigación Parlamentaria", [
                            A("Área de Servicios de Investigación y Seguimiento Prospectivo"),
                            A("Área de Estadística Parlamentaria"),
                        ]),
                        DEP("Departamento de Redacción del Diario de los Debates", [
                            A("Área de Grabaciones"), A("Área de Transcripciones"),
                            A("Área de Servicios Auxiliares Parlamentarios"),
                        ]),
                        DEP("Departamento de Comisiones", [
                            A("Área de Control Político"), A("Área de Técnica Legislativa"),
                        ]),
                        DEP("Departamento de Relatoría, Agenda y Actas", [
                            A("Área de Relatoría y Agenda"),
                            A("Área de Despacho Parlamentario"),
                            A("Área de Redacción de Actas"),
                        ]),
                        DEP("Departamento de Gestión Documental", [
                            A("Área de Trámite Documentario"), A("Área de Archivo General"),
                        ]),
                        DEP("Departamento de Biblioteca", [
                            A("Área de Servicios de Información, Traducción y Circulación"),
                            A("Área de Procesos Técnicos Bibliotecarios"),
                        ]),
                    ]),
                ]),
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
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    cong = next((i for i in todas if "congreso de la" in i["nombre"].lower()), None) \
        or next(i for i in todas if "congreso" in i["nombre"].lower())
    print(f"Congreso: id={cong['id']} «{cong['nombre']}»")
    res = req("POST", f"/api/directorio/instituciones/{cong['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORG,
    })
    print("organigrama:", res)
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    hijos = {}
    for i in todas: hijos.setdefault(i["parent_id"], []).append(i)
    def contar(pid): return sum(1 + contar(h["id"]) for h in hijos.get(pid, []))
    print(f"Descendientes del Congreso: {contar(cong['id'])}  |  total: {len(todas)}")


main()

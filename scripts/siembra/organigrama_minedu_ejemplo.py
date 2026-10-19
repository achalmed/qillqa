"""Organigrama OFICIAL del MINEDU (Anexo del ROF, hasta el 3.er nivel).
Fundamento: PDF «organigrama-2018-minedu.pdf» publicado en la página institucional
del MINEDU en gob.pe. Aprobado por D.S. N.° 001-2015-MINEDU. Transcrito íntegro.
"""
import json, os, urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — MINEDU: Organigrama oficial"
URL_FUENTE = "https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTczOTEsInB1ciI6ImJsb2JfaWQifX0=--0feac250360921b01ff703aaa1fb38125ee4e1db/organigrama-2018-minedu.pdf"
FECHA = "2026-08-24"
NORMA = "D.S. N.° 001-2015-MINEDU (Reglamento de Organización y Funciones del MINEDU)"


def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}


def U(n):  # unidad orgánica (3.er nivel)
    return O(n, tipo="unidad", cat="unidad_organica")


def OF(n, hijos=None):  # oficina
    return O(n, tipo="oficina", hijos=hijos or [])


def DIR(n):  # dirección (3.er nivel bajo dirección general)
    return O(n, tipo="direccion", cat="unidad_organica")


def DG(n, cat="organo_linea", hijos=None):  # dirección general (órgano de línea)
    return O(n, tipo="direccion", cat=cat, hijos=hijos or [])


ORG = [
    O("Despacho Ministerial", cat="alta_direccion", hijos=[
        O("Órgano de Control Institucional", cat="organo_control", hijos=[
            U("Unidad de Control en Gestión"), U("Unidad de Control Financiero"),
        ]),
        O("Procuraduría Pública", cat="organo_defensa"),
        O("Consejo Nacional de Educación", cat="comision"),
        O("Secretaría General", cat="alta_direccion", hijos=[
            OF("Oficina General de Administración", [
                OF("Oficina de Logística"), OF("Oficina de Contabilidad y Control Previo"),
                OF("Oficina de Tesorería"), OF("Oficina de Ejecución Coactiva"),
            ]),
            OF("Oficina General de Recursos Humanos", [
                OF("Oficina de Gestión de Personal"),
                OF("Oficina de Gestión del Desarrollo y la Capacitación"),
                OF("Oficina de Bienestar Social y Relaciones Laborales"),
            ]),
            OF("Oficina General de Comunicaciones", [
                OF("Oficina de Comunicaciones"),
                OF("Oficina de Relaciones Interinstitucionales"),
                OF("Oficina de Prensa"),
            ]),
            OF("Oficina General de Transparencia, Ética Pública y Anticorrupción"),
            OF("Oficina de Atención al Ciudadano y Gestión Documental"),
            OF("Oficina de Diálogo"),
            OF("Oficina General de Asesoría Jurídica"),
            OF("Oficina General de Cooperación y Asuntos Internacionales"),
            OF("Oficina de Defensa Nacional y de Gestión del Riesgo de Desastres"),
        ]),
        O("Secretaría de Planificación Estratégica", cat="organo_asesoramiento", hijos=[
            OF("Oficina de Planificación Estratégica y Presupuesto", [
                U("Unidad de Financiamiento por Desempeño"),
                U("Unidad de Planificación y Presupuesto"),
                U("Unidad de Programación e Inversiones"),
                U("Unidad de Organización y Métodos"),
            ]),
            OF("Oficina de Seguimiento y Evaluación Estratégica", [
                U("Unidad de Estadística"), U("Unidad de Seguimiento y Evaluación"),
            ]),
            OF("Oficina de Medición de la Calidad de los Aprendizajes"),
            OF("Oficina de Tecnologías de la Información y Comunicación", [
                U("Unidad de Calidad y Seguridad de la Información"),
                U("Unidad de Sistemas de Información"),
                U("Unidad de Infraestructura Tecnológica"),
                U("Unidad de Servicio de Atención al Usuario"),
            ]),
        ]),
        O("Secretaría Nacional de la Juventud", siglas="SENAJU", cat="organo_linea", hijos=[
            DIR("Dirección de Promoción, Organización y Gestión"),
            DIR("Dirección de Investigación y Desarrollo"),
            DIR("Dirección de Asistencia Integral y Monitoreo"),
        ]),
        O("Despacho Viceministerial de Gestión Pedagógica", cat="alta_direccion", hijos=[
            DG("Dirección General de Educación Básica Regular", hijos=[
                DIR("Dirección de Educación Inicial"), DIR("Dirección de Educación Primaria"),
                DIR("Dirección de Educación Secundaria"),
                DIR("Dirección de Educación Física y Deporte"),
            ]),
            DG("Dirección General de Educación Básica Alternativa, Intercultural Bilingüe y de Servicios Educativos en el Ámbito Rural", hijos=[
                DIR("Dirección de Educación Básica Alternativa"),
                DIR("Dirección de Educación Intercultural Bilingüe"),
                DIR("Dirección de Servicios Educativos en el Ámbito Rural"),
            ]),
            DG("Dirección General de Servicios Educativos Especializados", hijos=[
                DIR("Dirección de Educación Básica Especial"),
                DIR("Dirección de Educación Básica para Estudiantes con Desempeño Sobresaliente y Alto Rendimiento"),
            ]),
            O("Dirección de Innovación Tecnológica en Educación", tipo="direccion", cat="organo_linea"),
            DG("Dirección General de Desarrollo Docente", hijos=[
                DIR("Dirección Técnico Normativa de Docentes"),
                DIR("Dirección de Evaluación Docente"),
                DIR("Dirección de Promoción del Bienestar y Reconocimiento Docente"),
                DIR("Dirección de Formación Inicial Docente"),
                DIR("Dirección de Formación Docente en Servicio"),
            ]),
            DG("Dirección General de Educación Superior Universitaria", hijos=[
                DIR("Dirección de Políticas para el Desarrollo y Aseguramiento de la Calidad de la Educación Superior Universitaria"),
                DIR("Dirección de Coordinación y Promoción de la Calidad de la Educación Superior Universitaria"),
            ]),
            DG("Dirección General de Educación Técnico-Productiva y Superior Tecnológica y Artística", hijos=[
                DIR("Dirección de Servicios de Educación Técnico-Productiva y Superior Tecnológica y Artística"),
                DIR("Dirección de Gestión de Instituciones de Educación Superior Tecnológica y Artística"),
            ]),
            O("Casa de la Literatura Peruana", cat="organo_desconcentrado"),
        ]),
        O("Despacho Viceministerial de Gestión Institucional", cat="alta_direccion", hijos=[
            DG("Dirección General de Gestión Descentralizada", hijos=[
                DIR("Dirección de Relaciones Intergubernamentales"),
                DIR("Dirección de Apoyo a la Gestión Educativa Descentralizada"),
                DIR("Dirección de Fortalecimiento de Capacidades"),
            ]),
            DG("Dirección General de Calidad de la Gestión Escolar", hijos=[
                DIR("Dirección de Gestión Escolar"),
                DIR("Dirección de Fortalecimiento de la Gestión Escolar"),
            ]),
            DG("Dirección General de Infraestructura Educativa", hijos=[
                DIR("Dirección de Planificación de Inversiones"),
                DIR("Dirección de Normatividad de Infraestructura"),
                DIR("Dirección de Saneamiento Físico Legal y Registro Inmobiliario"),
            ]),
            DG("Dirección General de Becas y Crédito Educativo"),
        ]),
        # Órganos desconcentrados
        O("Dirección de Gestión de Recursos Educativos", tipo="direccion", cat="organo_desconcentrado"),
        O("Dirección Regional de Educación de Lima Metropolitana", tipo="direccion", cat="organo_desconcentrado", siglas="DRELM"),
        # Adscritos / programas que NO existían en el directorio
        O("Instituto Peruano del Deporte", tipo="organismo", cat="adscrito", siglas="IPD"),
        O("Programa Nacional de Infraestructura Educativa", tipo="programa", cat="programa", siglas="PRONIED"),
    ]),
]

# Adscritos/programas que YA existen en el directorio -> re-vincular a MINEDU.
REPARENT = {"SUNEDU": "adscrito", "PRONABEC": "programa"}


def req(method, path, tok=None, body=None):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if body is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))


def main():
    tok = req("POST", "/api/auth/login", body={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    minedu = next(i for i in todas if i["siglas"] == "MINEDU")
    print(f"MINEDU: id={minedu['id']}")
    res = req("POST", f"/api/directorio/instituciones/{minedu['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORG,
    })
    print("organigrama:", res)
    for siglas, cat in REPARENT.items():
        inst = next((i for i in todas if i["siglas"] == siglas), None)
        if inst:
            req("PUT", f"/api/directorio/instituciones/{inst['id']}", tok, {
                **inst, "parent_id": minedu["id"], "categoria": cat,
                "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
            })
            print(f"  re-vinculado: {siglas}")
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    hijos = {}
    for i in todas: hijos.setdefault(i["parent_id"], []).append(i)
    def contar(pid): return sum(1 + contar(h["id"]) for h in hijos.get(pid, []))
    print(f"\nDescendientes de MINEDU: {contar(minedu['id'])}  |  total instituciones: {len(todas)}")


main()

"""Organigrama OFICIAL del Ministerio de Economía y Finanzas (MEF).
Fundamento: PDF «Organigrama_MEF_27092023.pdf» publicado en la página institucional
del MEF en gob.pe. Transcrito íntegro del organigrama oficial.
"""
import json, os, urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — MEF: Organigrama oficial"
URL_FUENTE = "https://www.gob.pe/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MjE5MDY5LCJwdXIiOiJibG9iX2lkIn19--a57f0ba943a95b21081aa92f49fc1a002fd91ce1/Organigrama_MEF_27092023.pdf"
FECHA = "2026-08-24"
NORMA = "Reglamento de Organización y Funciones del MEF (organigrama 27/09/2023)"


def O(n, tipo="organo", cat="", siglas="", hijos=None):
    return {"nombre": n, "tipo": tipo, "categoria": cat, "siglas": siglas, "hijos": hijos or []}
def DG(n, hijos): return O(n, tipo="direccion", cat="organo_linea", hijos=hijos)  # dir. general
def D(n): return O(n, tipo="direccion", cat="unidad_organica")  # dirección
def OG(n, hijos=None, cat="organo_apoyo"): return O(n, tipo="oficina", cat=cat, hijos=hijos or [])
def OF(n, hijos=None): return O(n, tipo="oficina", hijos=hijos or [])
def CM(n): return O(n, cat="comision")


ORG = [
    O("Despacho Ministerial", cat="alta_direccion", hijos=[
        O("Órgano de Control Institucional", cat="organo_control", hijos=[
            OF("Oficina de Planeamiento"), OF("Oficina de Control Económico"),
            OF("Oficina de Control Administrativo"),
        ]),
        O("Procuraduría Pública", cat="organo_defensa"),
        O("Defensoría del Contribuyente y Usuario Aduanero", cat="organo_resolutivo"),
        O("Tribunal Fiscal", cat="organo_resolutivo", hijos=[
            O("Sala Plena", tipo="unidad", cat="unidad_organica"),
            O("Salas Especializadas", tipo="unidad", cat="unidad_organica"),
            O("Vocalía Administrativa", tipo="unidad", cat="unidad_organica"),
            OF("Oficina Técnica"), OF("Oficina de Asesoría Contable"),
            OF("Oficina de Atención de Quejas"),
        ]),
        CM("Comisión Consultiva"), CM("Comité de Financiamiento Multisectorial"),
        CM("Consejo Normativo de Contabilidad"),
        CM("Comisión Especial encargada de la representación del Estado en las Controversias Internacionales de Inversión"),
        CM("Comisión Multisectorial de Inclusión Financiera"),
        CM("Consejo Nacional de la Competitividad y Formalización"),
        CM("Consejo Fiscal"),
        O("Secretaría General", cat="alta_direccion", hijos=[
            OF("Oficina de Comunicaciones"),
            OG("Oficina General de Administración", [OF("Oficina de Abastecimiento"), OF("Oficina de Finanzas")]),
            OG("Oficina General de Tecnologías de la Información", [
                OF("Oficina de Infraestructura Tecnológica"), OF("Oficina de Sistemas de Información"),
                OF("Oficina de Gobierno de Tecnologías de la Información"),
            ]),
            OG("Oficina General de Servicios al Usuario", [
                OF("Oficina de Gestión Documental y Atención al Usuario"),
                OF("Oficina de Gestión de los CONECTAMEF"),
            ]),
            OG("Oficina General de Inversiones y Proyectos", [
                OF("Oficina de Gestión de Inversiones y Proyectos"),
                OF("Oficina de Ejecución de Inversiones y Proyectos"),
            ]),
            OG("Oficina General de Enlace"),
            OG("Oficina General de Recursos Humanos", [
                OF("Oficina de Desarrollo, Relaciones Humanas y Sociales"),
                OF("Oficina de Gestión del Empleo y Compensaciones"),
            ]),
            OG("Oficina General de Planeamiento y Presupuesto", [
                OF("Oficina de Planeamiento y Modernización de la Gestión"),
                OF("Oficina de Presupuesto, Inversiones y Cooperación Técnica"),
            ], cat="organo_asesoramiento"),
            OG("Oficina General de Asesoría Jurídica", [
                OF("Oficina de Asuntos Jurídicos Económicos y Administrativos"),
                OF("Oficina de Asuntos Jurídicos Hacendarios"),
            ], cat="organo_asesoramiento"),
            OG("Oficina General de Prevención e Integridad Institucional", [
                OF("Oficina de Seguridad, Defensa Nacional y Gestión del Riesgo de Desastres"),
                OF("Oficina de Gestión de la Integridad"),
                OF("Oficina de Prevención y Gestión de Riesgos"),
            ]),
        ]),
        O("Despacho Viceministerial de Hacienda", cat="alta_direccion", hijos=[
            DG("Dirección General de Presupuesto Público", [
                D("Dirección de Normatividad"), D("Dirección de Programación y Seguimiento Presupuestal"),
                D("Dirección de Calidad del Gasto Público"), D("Dirección de Presupuesto Temático"),
                D("Dirección de Articulación del Presupuesto Territorial"),
            ]),
            DG("Dirección General de Contabilidad Pública", [
                D("Dirección de Normatividad"), D("Dirección de Gobierno Nacional y Gobiernos Regionales"),
                D("Dirección de Gobiernos Locales"), D("Dirección de Empresas Públicas"),
                D("Dirección de Análisis y Consolidación Contable"),
                D("Dirección de Estadística de las Finanzas Públicas"),
            ]),
            DG("Dirección General del Tesoro Público", [
                D("Dirección de Normatividad"), D("Dirección de Planificación Financiera y Estrategia"),
                D("Dirección de Créditos"),
                D("Dirección de Gestión de Inversiones Financieras y Mercado de Capitales"),
                D("Dirección de Operaciones de Tesorería"),
                D("Dirección de Administración de Deuda, Contabilidad y Estadística"),
                D("Dirección de Riesgos Fiscales"),
            ]),
            DG("Dirección General de Gestión Fiscal de los Recursos Humanos", [
                D("Dirección de Gestión de Personal Activo"), D("Dirección de Gestión de Pensiones"),
                D("Dirección de Normatividad"),
                D("Dirección de Programación de Gestión Fiscal de los Recursos Humanos"),
                D("Dirección de Técnica y de Registro de Información"),
            ]),
            DG("Dirección General de Abastecimiento", [
                D("Dirección de Normatividad"), D("Dirección de Planeamiento Integrado y Programación"),
                D("Dirección de Adquisiciones"), D("Dirección de Bienes Muebles"),
                D("Dirección de Bienes Inmuebles"), D("Dirección de Investigación, Desarrollo e Innovación"),
            ]),
        ]),
        O("Despacho Viceministerial de Economía", cat="alta_direccion", hijos=[
            DG("Dirección General de Política Macroeconómica y Descentralización Fiscal", [
                D("Dirección de Proyecciones Macroeconómicas"), D("Dirección de Política Fiscal"),
                D("Dirección de Política de Descentralización Fiscal y Finanzas Subnacionales"),
            ]),
            DG("Dirección General de Política de Ingresos Públicos", [
                D("Dirección de Renta y Patrimonio"),
                D("Dirección de Consumo y de Tributación sobre el Comercio Exterior"),
                D("Dirección de Asuntos Tributarios Internacionales"),
                D("Dirección de Tributación Subnacional"),
            ]),
            DG("Dirección General de Programación Multianual de Inversiones", [
                D("Dirección de Política y Estrategias de la Inversión Pública"),
                D("Dirección de Gestión de Inversiones"),
                D("Dirección de Seguimiento y Evaluación de la Inversión Pública"),
                D("Dirección de Inteligencia Económica y Optimización Tributaria"),
            ]),
            DG("Dirección General de Mercados Financieros y Previsional Privado", [
                D("Dirección de Sistema Financiero y Mercado de Capitales"),
                D("Dirección de Mercado de Seguros y Previsional Privado"),
                D("Dirección de Inclusión y Educación Financiera"),
            ]),
            DG("Dirección General de Asuntos de Economía Internacional, Competencia y Productividad", [
                D("Dirección de Asuntos de Economía Internacional"),
                D("Dirección de Eficiencia Normativa para la Productividad y Competencia"),
                D("Dirección de Economía Sostenible para la Productividad y Competencia"),
            ]),
            DG("Dirección General de Política de Promoción de la Inversión Privada", [
                D("Dirección de Promoción de Inversión Privada"),
                D("Dirección de Política de Inversión Privada"),
                D("Dirección de Mejores Prácticas para la Gestión de Proyectos"),
            ]),
        ]),
        # Organismos públicos adscritos NUEVOS (los ya existentes se re-vinculan)
        O("Superintendencia del Mercado de Valores", tipo="organismo", cat="adscrito", siglas="SMV"),
        O("Oficina de Normalización Previsional", tipo="organismo", cat="adscrito", siglas="ONP"),
        O("Organismo Supervisor de las Contrataciones del Estado", tipo="organismo", cat="adscrito", siglas="OSCE"),
        O("Agencia de Promoción de la Inversión Privada", tipo="organismo", cat="adscrito", siglas="PROINVERSIÓN"),
        O("Central de Compras Públicas", tipo="organismo", cat="adscrito", siglas="PERÚ COMPRAS"),
    ]),
]

REPARENT = {"SUNAT": "adscrito", "FONAFE": "adscrito", "Banco de la Nación": "adscrito"}


def req(method, path, tok=None, body=None):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if body is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))


def main():
    tok = req("POST", "/api/auth/login", body={"usuario": os.environ.get("QILLQA_USUARIO", "admin"), "clave": os.environ["QILLQA_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    mef = next(i for i in todas if i["siglas"] == "MEF")
    print(f"MEF: id={mef['id']}")
    res = req("POST", f"/api/directorio/instituciones/{mef['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORG,
    })
    print("organigrama:", res)
    for clave, cat in REPARENT.items():
        inst = next((i for i in todas if i["siglas"] == clave or i["nombre"] == clave), None)
        if inst:
            req("PUT", f"/api/directorio/instituciones/{inst['id']}", tok, {
                **inst, "parent_id": mef["id"], "categoria": cat,
                "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA, "norma": NORMA,
            })
            print(f"  re-vinculado: {clave}")
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    hijos = {}
    for i in todas: hijos.setdefault(i["parent_id"], []).append(i)
    def contar(pid): return sum(1 + contar(h["id"]) for h in hijos.get(pid, []))
    print(f"Descendientes MEF: {contar(mef['id'])}  |  total: {len(todas)}")


main()

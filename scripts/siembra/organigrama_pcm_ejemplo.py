"""Siembra el organigrama OFICIAL de la PCM en el directorio del SGDP.

Fundamento: PDF «Organigrama PCM RM 234 2026 PCM Publicacion.pdf» publicado en
gob.pe (página institucional de la PCM), transcrito íntegro: Anexo 2 del ROF,
aprobado por RM 141-2021-PCM y modificatorias (215-2023, 188-2025, 234-2026).
Además re-vincula como adscritos los organismos que YA existían en el
directorio (SERVIR, CEPLAN, INDECOPI, INEI, OSIPTEL, OSINERGMIN, SUNASS),
poniéndoles su nombre oficial completo (el mismo que figura en el PDF).
"""
import json
import os
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000"
FUENTE = "gob.pe — PCM: Organigrama oficial (Anexo 2 del ROF)"
URL_FUENTE = (
    "https://www.gob.pe/rails/active_storage/blobs/redirect/"
    "eyJfcmFpbHMiOnsiZGF0YSI6NjQxNzc1LCJwdXIiOiJibG9iX2lkIn19--"
    "5347a0c92e18714a0fd5b5a94e46fda1b2257514/"
    "25%20Organigrama%20PCM%20RM%20234%202026%20PCM%20Publicacion.pdf"
)
FECHA = "2026-08-24"
NORMA = (
    "RM N.° 141-2021-PCM (Sección Segunda del ROF de la PCM), modificada por "
    "RM N.° 215-2023-PCM, RM N.° 188-2025-PCM y RM N.° 234-2026-PCM"
)


def O(nombre, tipo="organo", categoria="", siglas="", hijos=None):
    return {
        "nombre": nombre, "tipo": tipo, "categoria": categoria,
        "siglas": siglas, "hijos": hijos or [],
    }


ORGANIGRAMA = [
    O("Despacho de la Presidencia del Consejo de Ministros", categoria="alta_direccion", hijos=[
        O("Órgano de Control Institucional", categoria="organo_control"),
        O("Procuraduría Pública", categoria="organo_defensa"),
        O("Oficina de Cumplimiento de Gobierno", tipo="oficina"),
        O("Oficina de Relaciones Nacionales e Internacionales", tipo="oficina"),
        O("Consejo Consultivo de Ordenamiento Territorial", categoria="comision"),
        O("Secretaría General", categoria="alta_direccion", hijos=[
            O("Oficina General de Asesoría Jurídica", tipo="oficina"),
            O("Oficina de Prensa e Imagen Institucional", tipo="oficina"),
            O("Oficina de Integridad Institucional", tipo="oficina"),
            O("Oficina de Seguridad y Defensa Nacional", tipo="oficina"),
            O("Secretaría Administrativa", hijos=[
                O("Oficina de Gestión Documental y Atención al Ciudadano", tipo="oficina"),
                O("Oficina General de Administración", tipo="oficina", hijos=[
                    O("Oficina de Abastecimiento", tipo="oficina"),
                    O("Oficina de Contabilidad y Tesorería", tipo="oficina"),
                ]),
                O("Oficina General de Tecnologías de la Información", tipo="oficina"),
                O("Oficina General de Recursos Humanos", tipo="oficina"),
            ]),
            O("Oficina General de Planeamiento y Presupuesto", tipo="oficina", hijos=[
                O("Oficina de Presupuesto", tipo="oficina"),
                O("Oficina de Modernización", tipo="oficina"),
                O("Oficina de Planeamiento", tipo="oficina"),
                O("Oficina de Programación Multianual de Inversiones", tipo="oficina"),
            ]),
            O("Secretaría de Coordinación", hijos=[
                O("Subsecretaría de Coordinación con Entidades Públicas y Privadas", tipo="unidad"),
                O("Subsecretaría de Coordinación Intersectorial", tipo="unidad"),
            ]),
            O("Secretaría de Comunicación Social"),
            O("Secretaría de Gestión Pública", hijos=[
                O("Subsecretaría de Administración Pública", tipo="unidad"),
                O("Subsecretaría de Simplificación y Análisis Regulatorio", tipo="unidad"),
                O("Subsecretaría de Calidad de Servicios", tipo="unidad"),
            ]),
            O("Secretaría de Gobierno y Transformación Digital", hijos=[
                O("Subsecretaría de Política y Regulación Digital", tipo="unidad"),
                O("Subsecretaría de Tecnologías y Seguridad Digital", tipo="unidad"),
                O("Subsecretaría de Servicios e Innovación Digital", tipo="unidad"),
            ]),
            O("Secretaría de Integridad Pública", hijos=[
                O("Subsecretaría de Gestión Estratégica de la Integridad Pública", tipo="unidad"),
                O("Subsecretaría de Monitoreo de la Integridad Pública", tipo="unidad"),
            ]),
        ]),
        O("Despacho Viceministerial de Gobernanza Territorial", categoria="alta_direccion", hijos=[
            O("Secretaría de Descentralización", hijos=[
                O("Subsecretaría de Promoción del Desarrollo Territorial", tipo="unidad"),
                O("Subsecretaría de Articulación Regional y Local", tipo="unidad"),
                O("Subsecretaría de Fortalecimiento de la Gestión Descentralizada", tipo="unidad"),
            ]),
            O("Secretaría de Gestión Social y Diálogo", hijos=[
                O("Subsecretaría de Prevención y Gestión de la Información", tipo="unidad"),
                O("Subsecretaría de Gestión del Diálogo", tipo="unidad"),
                O("Subsecretaría de Seguimiento y Gestión de Compromisos", tipo="unidad"),
            ]),
            O("Secretaría de Demarcación y Organización Territorial", hijos=[
                O("Subsecretaría de Asuntos Técnicos de Demarcación y Organización Territorial", tipo="unidad"),
                O("Subsecretaría de Información y Análisis Territorial", tipo="unidad"),
            ]),
            O("Secretaría de Gestión del Riesgo de Desastres"),
            O("Secretaría de Ordenamiento Territorial"),
        ]),
    ]),
    # Programa (banda PROGRAMA del organigrama)
    O("Programa de Mejor Atención al Ciudadano", tipo="programa", categoria="programa"),
    # Organismos públicos ejecutores adscritos (banda del organigrama)
    O("Despacho Presidencial", tipo="organismo", categoria="adscrito"),
    O("Comisión Nacional para el Desarrollo y Vida sin Drogas", tipo="organismo", categoria="adscrito", siglas="DEVIDA"),
    O("Dirección Nacional de Inteligencia", tipo="organismo", categoria="adscrito", siglas="DINI"),
    O("Organismo de Supervisión de los Recursos Forestales y de Fauna Silvestre", tipo="organismo", categoria="adscrito", siglas="OSINFOR"),
    O("Autoridad Nacional de Infraestructura", tipo="organismo", categoria="adscrito", siglas="ANIN"),
    O("Organismo de Estudios y Diseño de Proyectos de Inversión", tipo="organismo", categoria="adscrito"),
    O("Secretaría de Seguridad y Defensa Nacional", tipo="organismo", categoria="adscrito"),
    # Técnico especializado adscrito que no existía en el directorio
    O("Consejo Nacional de Ciencia, Tecnología e Innovación", tipo="organismo", categoria="adscrito", siglas="CONCYTEC"),
    # Regulador adscrito que no existía en el directorio
    O("Organismo Supervisor de la Inversión en Infraestructura de Transporte de Uso Público", tipo="regulador", categoria="adscrito", siglas="OSITRAN"),
    # Entidad dependiente ad-hoc
    O("Autoridad Nacional Autónoma para el desarrollo estratégico e integral del Terminal Portuario Multipropósito de Chancay", tipo="organismo", categoria="adscrito"),
    # Proyecto especial
    O("Secretaría Técnica de apoyo a la Comisión Ad Hoc, creada por Decreto Supremo Nº 006-2012-EF", tipo="proyecto", categoria="proyecto"),
]

# Adscritos que YA existen como entidades raíz del directorio: se re-vinculan
# (parent=PCM, categoria=adscrito) y toman su nombre oficial completo (tal
# cual figura en el organigrama).
REPARENT = {
    "SERVIR": "Autoridad Nacional del Servicio Civil",
    "CEPLAN": "Centro Nacional de Planeamiento Estratégico",
    "INDECOPI": "Instituto Nacional de Defensa de la Competencia y de la Protección de la Propiedad Intelectual",
    "INEI": "Instituto Nacional de Estadística e Informática",
    "OSIPTEL": "Organismo Supervisor de la Inversión Privada en Telecomunicaciones",
    "OSINERGMIN": "Organismo Supervisor de la Inversión en Energía y Minería",
    "SUNASS": "Superintendencia Nacional de Servicios de Saneamiento",
}


def req(method, path, tok=None, body=None):
    r = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
    )
    if tok:
        r.add_header("Authorization", f"Bearer {tok}")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=120))


def main():
    tok = req("POST", "/api/auth/login", body={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    pcm = next(i for i in todas if i["siglas"] == "PCM")
    print(f"PCM: id={pcm['id']} «{pcm['nombre']}»")

    # 1) Cargar el organigrama interno + adscritos nuevos
    res = req("POST", f"/api/directorio/instituciones/{pcm['id']}/organigrama", tok, {
        "fuente": FUENTE, "url_fuente": URL_FUENTE, "fecha_consulta": FECHA,
        "norma": NORMA, "reemplazar": True, "nodos": ORGANIGRAMA,
    })
    print(f"organigrama: {res}")

    # 2) Re-vincular los adscritos ya existentes (con nombre oficial completo)
    for siglas, nombre_oficial in REPARENT.items():
        inst = next((i for i in todas if i["siglas"] == siglas), None)
        if inst is None:
            print(f"  (no existe {siglas}, saltado)")
            continue
        req("PUT", f"/api/directorio/instituciones/{inst['id']}", tok, {
            **inst, "nombre": nombre_oficial, "parent_id": pcm["id"],
            "categoria": "adscrito", "fuente": FUENTE, "url_fuente": URL_FUENTE,
            "fecha_consulta": FECHA, "norma": NORMA,
        })
        print(f"  vinculado: [{siglas}] {nombre_oficial[:60]}")

    # 3) Verificación: contar descendientes de la PCM y mostrar una ruta
    todas = req("GET", "/api/directorio/instituciones?q=&limite=500", tok)
    hijos_de = {}
    for i in todas:
        hijos_de.setdefault(i["parent_id"], []).append(i)

    def contar(pid):
        n = 0
        for h in hijos_de.get(pid, []):
            n += 1 + contar(h["id"])
        return n

    print(f"\nDescendientes de la PCM: {contar(pcm['id'])}")
    por_id = {i["id"]: i for i in todas}
    objetivo = next(i for i in todas if i["nombre"] == "Subsecretaría de Calidad de Servicios")
    ruta, n = [], objetivo
    while n:
        ruta.insert(0, n["siglas"] or n["nombre"])
        n = por_id.get(n["parent_id"])
    print("Ruta de ejemplo:", "  →  ".join(ruta))
    print(f"Total instituciones ahora: {len(todas)}")


main()

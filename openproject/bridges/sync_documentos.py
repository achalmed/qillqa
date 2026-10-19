#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# bridges/sync_documentos.py — openproject_despacho: puente SGDP → OpenProject (proyecto «documentos»): un work package tipo Documento por documento del SGDP, idempotente; simula por defecto.
"""
Lee la tabla `documentos` de la base de datos del SGDP (repo ~/Documents/sgdp) y crea/actualiza
un Work Package tipo "Documento" por cada uno, enlazado por un localizador ESTABLE
(sgdp:doc:<id>) guardado en el campo "Ruta en disco". La FUENTE DE VERDAD sigue
siendo el SGDP; OpenProject refleja el estado del ciclo (borrador→…→enviado).

Uso:
    python3 sync_documentos.py --dry-run     # muestra qué haría (sin tocar nada; por defecto)
    python3 sync_documentos.py --apply       # aplica vía API (requiere token)

Configuración por variables de entorno (las de OpenProject se leen también del .env de
operaciones, ver op_api.cargar_entorno):
    SGDP_DB_CONTAINER  (def. sgdp-db-1)   contenedor Docker de la BD del SGDP
    SGDP_DB_USER       (def. sgdp)        usuario psql (acceso por socket, trust)
    SGDP_DB_NAME       (def. sgdp)        base de datos
    OPENPROJECT_URL    (def. http://localhost:8080)
    OPENPROJECT_TOKEN  (token de API para --apply)
    OPENPROJECT_IDS    (def. operaciones/op_ids.json; ./sembrar.sh --ids lo regenera)

Solo librería estándar de Python (usa `docker exec … psql` y `urllib`).
"""
import os, sys, json, base64, subprocess, urllib.request, urllib.error
from op_api import cargar_entorno

cargar_entorno()

CONFIG = {
    "db_container": os.environ.get("SGDP_DB_CONTAINER", "sgdp-db-1"),
    "db_user": os.environ.get("SGDP_DB_USER", "sgdp"),
    "db_name": os.environ.get("SGDP_DB_NAME", "sgdp"),
    "op_url": os.environ.get("OPENPROJECT_URL", "http://localhost:8080"),
    "op_token": os.environ.get("OPENPROJECT_TOKEN", ""),
    "project": "documentos",
    "type": "Documento",
}

# estado SGDP  ->  estado (status) del Documento en OpenProject
MAPA_ESTADO = {
    "BORRADOR": "Nuevo", "EN_REVISION": "En revisión", "APROBADO": "Numerado",
    "FIRMADO": "En firma", "ENVIADO": "Enviado", "ARCHIVADO": "Archivado",
}
# tipo SGDP  ->  opción del campo "Tipo documental"
MAPA_TIPO = {
    "oficio": "Oficio", "oficio_multiple": "Oficio múltiple",
    "memorando": "Memorando", "memorandum": "Memorando",
    "informe": "Informe", "comunicado": "Comunicado",
    "solicitud": "Solicitud", "acta": "Acta",
}

CONSULTA = """
SELECT COALESCE(json_agg(row), '[]'::json) FROM (
  SELECT id, tipo, serie, numero, periodo, estado,
         campos->>'asunto'  AS asunto,
         campos->>'destinatario_nombre' AS destinatario,
         pdf_archivo,
         to_char(actualizado_en,'YYYY-MM-DD') AS actualizado
  FROM documentos
  WHERE estado <> 'ANULADO'
  ORDER BY id
) row;
"""


def leer_documentos():
    cmd = ["docker", "exec", CONFIG["db_container"], "psql",
           "-U", CONFIG["db_user"], "-d", CONFIG["db_name"],
           "-t", "-A", "-c", CONSULTA.strip()]
    try:
        salida = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
    except subprocess.CalledProcessError as e:
        sys.exit(f"❌ No pude leer la BD de SGDP: {e.stderr[:200]}")
    except FileNotFoundError:
        sys.exit("❌ No encuentro 'docker'. ¿Está en el PATH?")
    return json.loads(salida or "[]")


def a_work_package(d):
    numero = d.get("numero")
    periodo = d.get("periodo") or ""
    tipo = (d.get("tipo") or "").lower()
    n_doc = (f"{tipo.upper()} N° {int(numero):03d}-{periodo}"
             if numero not in (None, "") else "(sin numerar)")
    asunto = (d.get("asunto") or "").strip()
    subject = asunto[:250] if asunto else f"{tipo or 'documento'} {d.get('serie','')} {numero or 's/n'}/{periodo}"
    return {
        "locator": f"sgdp:doc:{d['id']}",           # clave ESTABLE de enlace (Ruta en disco)
        "subject": subject,
        "estado": MAPA_ESTADO.get(d.get("estado", ""), "Nuevo"),
        "n_documento": n_doc,
        "tipo_documental": MAPA_TIPO.get(tipo, "Oficio"),
        "destinatario": d.get("destinatario") or "",
        "pelota": "Nuestra",
        "actualizado": d.get("actualizado"),
        "sgdp_estado": d.get("estado"),
    }


def dry_run():
    docs = leer_documentos()
    print(f"\n📄 Documentos en SGDP (no anulados): {len(docs)}\n" + "=" * 60)
    por_estado = {}
    for d in docs:
        wp = a_work_package(d)
        por_estado[wp["estado"]] = por_estado.get(wp["estado"], 0) + 1
    for d in docs[:12]:
        wp = a_work_package(d)
        print(f"\n• {wp['n_documento']}  ({wp['sgdp_estado']} → {wp['estado']})")
        print(f"    {wp['subject'][:80]}")
        print(f"    tipo={wp['tipo_documental']}  dest={wp['destinatario'][:40]}  enlace={wp['locator']}")
    if len(docs) > 12:
        print(f"\n… y {len(docs) - 12} más.")
    print("\nResumen por estado OpenProject:")
    for est, n in sorted(por_estado.items()):
        print(f"    {est:14} {n}")
    print("\n(Simulación: no se creó ni modificó nada. Usa --apply para sincronizar.)")


def apply():
    if not CONFIG["op_token"]:
        sys.exit("❌ Falta OPENPROJECT_TOKEN (OpenProject → Mi cuenta → Tokens de acceso).")
    from op_api import OpenProject
    op = OpenProject(CONFIG["op_url"], CONFIG["op_token"])
    docs = leer_documentos()
    print(f"⚙️  Sincronizando {len(docs)} documentos → OpenProject (proyecto '{CONFIG['project']}')…")
    creados = actualizados = errores = 0
    for d in docs:
        wp = a_work_package(d)
        text_cfs = {"Ruta en disco": wp["locator"], "N° Documento": wp["n_documento"]}
        list_cfs = {"Pelota": wp["pelota"], "Tipo documental": wp["tipo_documental"]}
        accion, wid, err = op.upsert(
            match_cf="Ruta en disco", match_value=wp["locator"],
            subject=wp["subject"], type_name=CONFIG["type"],
            status_name=wp["estado"], priority_name="Media",
            project_ident=CONFIG["project"], text_cfs=text_cfs, list_cfs=list_cfs)
        if err:
            errores += 1;      print(f"   ! {wp['n_documento']}: {err}")
        elif accion == "creado":
            creados += 1;      print(f"   + creado #{wid}: {wp['n_documento']}")
        else:
            actualizados += 1; print(f"   ~ actualizado #{wid}: {wp['n_documento']}")
    print(f"\n✅ Creados: {creados} · Actualizados: {actualizados} · Errores: {errores}")


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "--dry-run"
    (apply if modo == "--apply" else dry_run)()

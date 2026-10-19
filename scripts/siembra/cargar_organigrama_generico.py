"""Cargador genérico del lote 3. Recibe UN archivo "envelope" JSON por
institución y carga su organigrama en el directorio (API local).

Envelope:
{
  "target_id": 41,                      # usar institución existente, O bien:
  "create": {                           # crear una nueva y cargarla
      "nombre": "...", "siglas": "...", "tipo": "municipalidad",
      "nivel_gobierno": "Local", "region": "Ayacucho", "categoria": "",
      "url_oficial": "", "notas": "",
      "parent_id": null,                # o resolver por:
      "parent_lookup": {"siglas": "..."} | {"nombre": "..."}
  },
  "fuente": "...", "url_fuente": "...", "fecha_consulta": "2026-08-25", "norma": "...",
  "nodos": [ {"nombre":...,"tipo":...,"categoria":...,"siglas":...,"hijos":[...]} ]
}

Uso: SGDP_CLAVE=<clave del administrador> python3 scripts/siembra/cargar_organigrama_generico.py <envelope.json>
"""
import json, os, sys, urllib.request
BASE = "http://127.0.0.1:8000"

def req(m, p, tok=None, b=None):
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m)
    if tok: r.add_header("Authorization", f"Bearer {tok}")
    if b is not None: r.add_header("Content-Type", "application/json")
    return json.load(urllib.request.urlopen(r, timeout=180))

def main(ruta):
    env = json.load(open(ruta))
    tok = req("POST", "/api/auth/login", b={"usuario": os.environ.get("SGDP_USUARIO", "admin"), "clave": os.environ["SGDP_CLAVE"]})["token"]
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    by_id = {i["id"]: i for i in todas}

    if env.get("target_id"):
        tid = env["target_id"]
        assert tid in by_id, f"target_id {tid} no existe"
        nombre_obj = by_id[tid]["nombre"]
    else:
        c = dict(env["create"])
        pl = c.pop("parent_lookup", None)
        if pl and not c.get("parent_id"):
            k, v = next(iter(pl.items()))
            padre = next((i for i in todas if (i.get(k) or "") == v), None)
            assert padre, f"no encontré el padre por {pl}"
            c["parent_id"] = padre["id"]
        # ¿ya existe una con esas siglas/nombre? (idempotencia)
        ex = next((i for i in todas if (c.get("siglas") and i["siglas"] == c["siglas"])
                   or i["nombre"] == c["nombre"]), None)
        if ex:
            tid = ex["id"]; nombre_obj = ex["nombre"]
            print(f"(ya existía id={tid})")
        else:
            nueva = req("POST", "/api/directorio/instituciones", tok, c)
            tid = nueva["id"]; nombre_obj = nueva["nombre"]
            print(f"CREADA id={tid}: {nombre_obj}  parent_id={c.get('parent_id')}")

    res = req("POST", f"/api/directorio/instituciones/{tid}/organigrama", tok, {
        "fuente": env["fuente"], "url_fuente": env.get("url_fuente", ""),
        "fecha_consulta": env.get("fecha_consulta", "2026-08-25"),
        "norma": env.get("norma", ""), "reemplazar": True, "nodos": env["nodos"],
    })
    print(f"[{nombre_obj}] id={tid} organigrama: {res}")
    todas = req("GET", "/api/directorio/instituciones?q=&limite=5000", tok)
    h = {}
    for i in todas: h.setdefault(i["parent_id"], []).append(i)
    def c(pid): return sum(1 + c(x["id"]) for x in h.get(pid, []))
    print(f"  descendientes: {c(tid)}  |  total directorio: {len(todas)}")

if __name__ == "__main__":
    main(sys.argv[1])

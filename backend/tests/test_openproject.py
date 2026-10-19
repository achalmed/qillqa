"""backend/tests/test_openproject.py — integración con OpenProject (2026-10-02).

Mapeo Qillqa → OpenProject (puro) y el cliente + la escritura contra un OpenProject
SIMULADO (http.server local que imita lo que usa la API v3: catálogos, esquema,
búsqueda por campo, alta, cambio con lockVersion y un flujo que rechaza un estado).
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_openproject.py
"""
import json
import os
import re
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import openproject as op  # noqa: E402
from app.servicios import openproject_mapa as mapa  # noqa: E402
from app.servicios import openproject_sync as sync  # noqa: E402

BASE = "https://sgdp.ejemplo"


# --- Mapeo ---------------------------------------------------------------------


def test_documento_producido_y_recibido():
    it = mapa.item_documento(
        {"id": 7, "tipo": "oficio", "tipo_nombre": "Oficio", "numero": 33, "periodo": "2026-2027", "estado": "ENVIADO",
         "asunto": "Pedido de información", "responsable_id": 3},
        base_sgdp=BASE, proyecto_documentos="documentos", proyecto_recibidos="correspondencia")
    assert (it.clave, it.proyecto, it.tipo, it.estado) == ("sgdp:doc:7", "documentos", "Documento", "Enviado")
    assert it.textos["N° Documento"] == "OFICIO N° 033-2026-2027"
    assert it.listas == {"Pelota": "De tercero", "Tipo documental": "Oficio"}
    assert it.enlace == f"{BASE}/documentos/7" and it.enlace in it.descripcion
    rec = mapa.item_documento({"id": 8, "tipo": "recibido", "estado": "BORRADOR", "recibido": True},
                              base_sgdp=BASE, proyecto_documentos="documentos", proyecto_recibidos="correspondencia")
    assert (rec.proyecto, rec.tipo, rec.estado) == ("correspondencia", "Solicitud recibida", "Nuevo")
    assert mapa.item_documento({"id": 9, "estado": "ANULADO"}, base_sgdp="", proyecto_documentos="d", proyecto_recibidos="c") is None


def test_proyecto_de_ley_con_fases_y_tareas_en_orden():
    items = mapa.items_proyecto(
        {"id": 2, "codigo": "PL-2026-002", "titulo": "Ley que…", "estado": "en_elaboracion", "responsable_id": 1, "comisiones": "Transportes"},
        [{"id": 40, "nombre": "Redacción", "estado": "en_curso", "inicio": "2026-10-01", "limite": "2026-10-20"}],
        [{"id": 7, "fase_id": 40, "titulo": "Revisar art. 2", "estado": "hecha", "limite": "2026-10-05"},
         {"id": 8, "fase_id": None, "titulo": "Suelta", "estado": "por_hacer", "limite": "mañana"}],
        base_sgdp=BASE, proyecto_legislativo="legislativo")
    claves = [i.clave for i in items]
    assert claves == ["sgdp:pl:2", "sgdp:pl-fase:40", "sgdp:pl-tarea:7", "sgdp:pl-tarea:8"]
    pl, fase, t7, t8 = items
    assert (pl.tipo, pl.estado, pl.textos.get("Comisión")) == ("Proyecto de Ley", "Redacción", "Transportes")
    assert (fase.padre, fase.inicio, fase.fin, fase.estado) == ("sgdp:pl:2", "2026-10-01", "2026-10-20", "En curso")
    assert (t7.padre, t7.estado, t7.fin) == ("sgdp:pl-fase:40", "Cerrado", "2026-10-05")
    assert (t8.padre, t8.fin) == ("sgdp:pl:2", "")  # sin fase cuelga del PL; fecha inválida no viaja


def test_huella_cambia_solo_con_lo_que_se_escribe():
    it = mapa.item_documento({"id": 1, "tipo": "oficio", "estado": "BORRADOR", "asunto": "A"}, base_sgdp="", proyecto_documentos="d", proyecto_recibidos="c")
    h = it.huella(5)
    it.descripcion = "otra"
    assert it.huella(5) == h
    assert it.huella(6) != h
    it.asunto = "B"
    assert it.huella(5) != h


def test_usuarios_por_correo_y_por_login():
    sgdp = [{"id": 1, "email": "Ana@Despacho.pe", "nombre_usuario": "ana"}, {"id": 2, "email": "", "nombre_usuario": "luis"}, {"id": 3, "email": "x@y", "nombre_usuario": "nadie"}]
    opu = [{"id": 10, "email": "ana@despacho.pe", "login": "aperez"}, {"id": 11, "email": "", "login": "luis"}]
    assert mapa.usuarios_op(sgdp, opu) == {1: 10, 2: 11}


def test_cierre_desde_openproject():
    assert mapa.cierre_desde_op("sgdp:pl-tarea:1", True, "por_hacer") == "hecha"
    assert mapa.cierre_desde_op("sgdp:pl-tarea:1", False, "hecha") == "por_hacer"
    assert mapa.cierre_desde_op("sgdp:pl-tarea:1", True, "hecha") is None
    assert mapa.cierre_desde_op("sgdp:pl-fase:1", True, "omitida") is None
    assert mapa.cierre_desde_op("sgdp:pl-fase:1", False, "hecha") == "en_curso"
    assert mapa.cierre_desde_op("sgdp:doc:1", True, "BORRADOR") is None


# --- Un OpenProject simulado ----------------------------------------------------


class Falso:
    def __init__(self):
        self.wps: dict[int, dict] = {}
        self.siguiente = 100
        self.rechazar_estado: set[int] = set()  # estados que el «flujo» no admite
        self.escrituras: list[tuple[str, dict]] = []


def servidor(falso: Falso):
    estados = [{"id": 1, "name": "Nuevo", "isClosed": False}, {"id": 2, "name": "En revisión", "isClosed": False},
               {"id": 3, "name": "Enviado", "isClosed": False}, {"id": 4, "name": "Cerrado", "isClosed": True}]

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _r(self, codigo, datos):
            b = json.dumps(datos).encode()
            self.send_response(codigo)
            self.send_header("Content-Type", "application/hal+json")
            self.end_headers()
            self.wfile.write(b)

        def _col(self, els):
            return {"total": len(els), "_embedded": {"elements": els}}

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(u.query)
            if u.path == "/api/v3":
                return self._r(200, {"coreVersion": "17.0.0"})
            if u.path == "/api/v3/statuses":
                return self._r(200, self._col(estados))
            if u.path == "/api/v3/priorities":
                return self._r(200, self._col([{"id": 8, "name": "Media", "isDefault": True}]))
            if u.path == "/api/v3/projects":
                return self._r(200, self._col([{"id": 5, "identifier": "documentos"}, {"id": 6, "identifier": "legislativo"}]))
            if u.path == "/api/v3/types":
                return self._r(200, self._col([{"id": 1, "name": "Tarea"}, {"id": 9, "name": "Documento"}, {"id": 10, "name": "Proyecto de Ley"}]))
            if u.path == "/api/v3/users":
                return self._r(200, self._col([{"id": 21, "login": "ana", "email": "ana@d.pe", "name": "Ana", "status": "active"}]))
            return self._get_wp(u, q)

        def _esquema(self):
            return {"_embedded": {"schema": {
                    "customField1": {"name": "Ruta en disco", "type": "String"},
                    "customField2": {"name": "N° Documento", "type": "String"},
                    "customField3": {"name": "Pelota", "type": "CustomOption", "_links": {"allowedValues": [
                        {"href": "/api/v3/custom_options/31", "title": "Nuestra"}, {"href": "/api/v3/custom_options/32", "title": "De tercero"}]}},
            }}}

        def _get_wp(self, u, q):
            m = re.fullmatch(r"/api/v3/work_packages/(\d+)", u.path)
            if m:
                wp = falso.wps.get(int(m.group(1)))
                return self._r(200, wp) if wp else self._r(404, {"message": "no existe"})
            if u.path == "/api/v3/work_packages":
                filtros = json.loads(q.get("filters", ["[]"])[0])
                els = list(falso.wps.values())
                for f in filtros:
                    (campo, cond), = f.items()
                    if campo.startswith("customField"):
                        els = [w for w in els if w.get(campo) in cond["values"]]
                    elif campo == "id":
                        els = [w for w in els if str(w["id"]) in cond["values"]]
                return self._r(200, self._col(els))
            return self._r(404, {"message": u.path})

        def _cuerpo(self):
            return json.loads(self.rfile.read(int(self.headers["Content-Length"])))

        def _aplicar(self, wp, cuerpo):
            st = (cuerpo.get("_links", {}).get("status") or {}).get("href")
            if st and int(st.rsplit("/", 1)[-1]) in falso.rechazar_estado:
                return self._r(422, {"message": "Status is invalid because no valid transition exists"})
            for k, v in cuerpo.items():
                if k == "_links":
                    wp["_links"].update(v)
                elif k != "lockVersion":
                    wp[k] = v
            wp["lockVersion"] += 1
            return None

        def do_POST(self):
            c = self._cuerpo()
            if self.path.startswith("/api/v3/work_packages/form"):
                return self._r(200, self._esquema())
            falso.escrituras.append(("POST", c))
            wp = {"id": falso.siguiente, "lockVersion": 0, "_links": {"status": {"href": "/api/v3/statuses/1"}}}
            if self._aplicar(wp, c) is None:
                falso.wps[wp["id"]] = wp
                falso.siguiente += 1
                self._r(201, wp)

        def do_PATCH(self):
            wp = falso.wps[int(re.search(r"/work_packages/(\d+)", self.path).group(1))]
            c = self._cuerpo()
            falso.escrituras.append(("PATCH", c))
            if c.get("lockVersion") != wp["lockVersion"]:
                return self._r(409, {"message": "conflicto"})
            if self._aplicar(wp, c) is None:
                self._r(200, wp)

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def test_escribir_crea_adopta_actualiza_y_tolera_un_estado_no_admitido():
    falso = Falso()
    srv = servidor(falso)
    try:
        cli = op.Cliente(f"http://127.0.0.1:{srv.server_port}", "token-de-prueba")
        cat = cli.catalogo()
        assert cat["proyectos"]["documentos"] == 5 and cat["cerrados"] == {4} and cat["prioridad_defecto"] == 8
        it = mapa.item_documento({"id": 7, "tipo": "oficio", "tipo_nombre": "Oficio", "estado": "EN_REVISION", "asunto": "Pedido"},
                                 base_sgdp=BASE, proyecto_documentos="documentos", proyecto_recibidos="correspondencia")
        # Alta: proyecto, prioridad, descripción, clave y opción de lista.
        wp_id, cerrado, nota = sync.escribir(cli, cat, it, 21, None, None)
        alta = falso.escrituras[-1][1]
        assert falso.escrituras[-1][0] == "POST" and not cerrado and not nota
        assert alta["customField1"] == "sgdp:doc:7" and alta["_links"]["project"]["href"].endswith("/5")
        assert alta["_links"]["customField3"]["href"].endswith("/31") and alta["_links"]["assignee"]["href"].endswith("/21")
        assert "abrir en Qillqa" in alta["description"]["raw"]
        # Sin wp_id guardado, la misma clave se ADOPTA (no se duplica) y se actualiza sin tocar la descripción.
        it.estado = "Enviado"
        wp2, _, _ = sync.escribir(cli, cat, it, None, None, None)
        assert wp2 == wp_id and len(falso.wps) == 1
        cambio = falso.escrituras[-1][1]
        assert falso.escrituras[-1][0] == "PATCH" and "description" not in cambio and "project" not in cambio["_links"]
        assert cambio["_links"]["assignee"] == {"href": None}
        # Un estado que el flujo no admite: se escribe lo demás y se anota.
        falso.rechazar_estado.add(4)
        it.estado, it.asunto = "Cerrado", "Pedido corregido"
        _, _, nota = sync.escribir(cli, cat, it, None, None, wp_id)
        assert "no admitió el estado" in nota and falso.wps[wp_id]["subject"] == "Pedido corregido"
    finally:
        srv.shutdown()

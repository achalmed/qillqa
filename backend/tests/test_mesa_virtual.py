"""backend/tests/test_mesa_virtual.py — la mesa de partes virtual (2026-10-12; servicios/mesa_virtual.py).

Pruebas puras (sin base de datos): días hábiles y horario de atención, código de seguimiento,
documentos de identidad, validación de archivos por su firma de bytes, nombres saneados, IP real
tras el proxy, límites por ventana, fichas firmadas, el cargo en PDF y que la aplicación no deje
abierta ninguna ruta además de las públicas conocidas. Uso: cd backend && .venv/bin/python -m pytest -q
"""
import asyncio
import os
import shutil
import subprocess
from datetime import date, datetime

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import cargo_pdf  # noqa: E402
from app.servicios import mesa_virtual as mv  # noqa: E402

CFG = mv.normalizar_config({})
# Un horario de atención GUARDADO antes de existir `continua` (como el de producción): se respeta.
CON_HORARIO = mv.normalizar_config({"horario": {"inicio": "08:30", "fin": "17:30", "dias": [0, 1, 2, 3, 4]}})


# --- configuración ------------------------------------------------------------------------------


def test_config_por_omision_con_plazo_del_tuo():
    # Encendida o apagada lo decide el registro de módulos (servicios/modulos.py); aquí, apagada.
    assert CFG["activa"] is False
    assert CFG["plazo_subsanacion"] == 2
    # De fábrica, 24 horas todos los días (TUO 27444, art. 117.1; Edison 2026-10-13).
    assert CFG["horario"] == {"continua": True, "inicio": "08:30", "fin": "17:30", "dias": [0, 1, 2, 3, 4]}
    assert "Otro" in CFG["tipos"]


def test_un_horario_ya_guardado_no_se_pisa():
    assert CON_HORARIO["horario"]["continua"] is False
    assert mv.normalizar_config({"horario": {"continua": True, "inicio": "08:30", "fin": "17:30"}})["horario"]["continua"] is True
    assert mv.normalizar_config({"horario": {"continua": False}})["horario"]["continua"] is False


def test_mesa_de_24_horas_presenta_el_mismo_dia_y_cuenta_plazos_en_habiles():
    # Sábado de noche y feriado: se tiene por presentado ese mismo día, nunca «fuera de horario».
    assert mv.momento_presentacion(_l("2026-10-17T23:40"), CFG) == (date(2026, 10, 17), False)
    assert mv.momento_presentacion(_l("2026-10-08T03:00"), CFG) == (date(2026, 10, 8), False)
    # Los plazos siguen en días hábiles (lunes a viernes sin feriados), desde el día hábil siguiente.
    assert mv.sumar_habiles(date(2026, 10, 16), 2, CFG) == date(2026, 10, 20)   # viernes → martes
    assert mv.sumar_habiles(date(2026, 10, 17), 2, CFG) == date(2026, 10, 20)   # sábado → martes
    assert mv.dias_habiles(CFG) == [0, 1, 2, 3, 4]
    assert mv.hora_cierre(CFG) == "23:59" and mv.hora_cierre(CON_HORARIO) == "17:30"


def test_config_se_sanea():
    c = mv.normalizar_config({
        "activa": True, "horario": {"inicio": "18:00", "fin": "09:00", "dias": [9, "x", 5]},
        "max_archivo_mb": 999, "max_total_mb": 1, "plazo_subsanacion": 0, "no_habiles": ["2026-12-24", "mañana"],
        "tipos": ["  Carta ", "Carta", ""], "enlace_publico": "javascript:alert(1)", "desconocido": 1,
    })
    assert c["activa"] is True
    assert c["horario"]["inicio"] == "08:30" and c["horario"]["fin"] == "17:30"   # fin antes que inicio: vuelve al de fábrica
    assert c["horario"]["dias"] == [5]
    assert c["max_archivo_mb"] == 40 and c["max_total_mb"] == 40                  # el total nunca menor que un archivo
    assert c["plazo_subsanacion"] == 1
    assert c["no_habiles"] == ["2026-12-24"]
    assert c["tipos"] == ["Carta"]
    assert c["enlace_publico"] == ""
    assert "desconocido" not in c


# --- días hábiles y horario -----------------------------------------------------------------------


def _l(texto: str) -> datetime:
    return datetime.fromisoformat(texto)


def test_presentacion_en_horario_cuenta_ese_dia():
    assert mv.momento_presentacion(_l("2026-10-12T10:00"), CON_HORARIO) == (date(2026, 10, 12), False)  # lunes


def test_presentacion_despues_del_cierre_pasa_al_dia_habil_siguiente():
    assert mv.momento_presentacion(_l("2026-10-12T17:30"), CON_HORARIO) == (date(2026, 10, 13), True)
    assert mv.momento_presentacion(_l("2026-10-16T22:15"), CON_HORARIO) == (date(2026, 10, 19), True)  # viernes noche → lunes


def test_presentacion_antes_de_abrir_cuenta_ese_dia_pero_se_marca():
    assert mv.momento_presentacion(_l("2026-10-13T07:10"), CON_HORARIO) == (date(2026, 10, 13), True)


def test_presentacion_en_fin_de_semana_y_feriados():
    assert mv.momento_presentacion(_l("2026-10-17T11:00"), CON_HORARIO) == (date(2026, 10, 19), True)   # sábado
    # Lunes 7-12 tras el cierre: martes 8 y miércoles 9 son feriados → jueves 10.
    assert mv.momento_presentacion(_l("2026-12-07T18:00"), CON_HORARIO) == (date(2026, 12, 10), True)
    # El 8 de octubre (Angamos) en horario no cuenta: pasa al 9.
    assert mv.momento_presentacion(_l("2026-10-08T10:00"), CON_HORARIO) == (date(2026, 10, 9), True)


def test_dias_no_habiles_del_despacho_cuentan():
    c = mv.normalizar_config({"no_habiles": ["2026-10-13"], "horario": {"continua": False}})
    assert mv.momento_presentacion(_l("2026-10-12T19:00"), c) == (date(2026, 10, 14), True)
    assert mv.sumar_habiles(date(2026, 10, 12), 2, c) == date(2026, 10, 15)


def test_plazo_de_subsanacion_en_dias_habiles_desde_el_siguiente():
    assert mv.sumar_habiles(date(2026, 10, 12), 2, CFG) == date(2026, 10, 14)   # lunes → miércoles
    assert mv.sumar_habiles(date(2026, 10, 16), 2, CFG) == date(2026, 10, 20)   # viernes → martes
    assert mv.sumar_habiles(date(2026, 10, 17), 2, CFG) == date(2026, 10, 20)   # sábado → martes
    assert mv.sumar_habiles(date(2026, 12, 4), 2, CFG) == date(2026, 12, 10)    # salta el 8 y el 9 de diciembre


def test_horario_con_sabado_habil():
    c = mv.normalizar_config({"horario": {"inicio": "09:00", "fin": "13:00", "dias": [0, 1, 2, 3, 4, 5]}})
    assert mv.momento_presentacion(_l("2026-10-17T10:00"), c) == (date(2026, 10, 17), False)
    assert mv.momento_presentacion(_l("2026-10-17T14:00"), c) == (date(2026, 10, 19), True)


# --- código y expediente ------------------------------------------------------------------------------


def test_codigo_aleatorio_legible_y_sin_ambiguos():
    codigos = {mv.generar_codigo() for _ in range(2000)}
    assert len(codigos) == 2000
    for c in list(codigos)[:50]:
        assert len(c) == 14 and c[4] == "-" and c[9] == "-"
        assert not set(c.replace("-", "")) & set("01OIL")


def test_normalizar_codigo():
    c = mv.generar_codigo()
    assert mv.normalizar_codigo(c.lower().replace("-", " ")) == c
    assert mv.normalizar_codigo("ABCD-EFGH-IJKL") == ""     # I y L no existen en el alfabeto
    assert mv.normalizar_codigo("123") == ""
    assert mv.texto_expediente(2026, 7) == "MPV-2026-00007"


# --- documentos de identidad ------------------------------------------------------------------------


def _ruc_con_verificador(base10: str) -> str:
    pesos = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    resto = 11 - sum(int(c) * p for c, p in zip(base10, pesos)) % 11
    return base10 + str(resto - 10 if resto >= 10 else resto)


def test_ruc_valido_por_digito_verificador():
    ruc = _ruc_con_verificador("2013131295")
    assert mv.ruc_valido(ruc)
    malo = ruc[:-1] + str((int(ruc[-1]) + 1) % 10)
    assert not mv.ruc_valido(malo)
    assert not mv.ruc_valido("30131312955")   # prefijo inexistente
    assert mv.error_doc("RUC", ruc) == ""
    assert "RUC" in mv.error_doc("RUC", malo)


def test_documentos_de_persona():
    assert mv.error_doc("DNI", "12345678") == ""
    assert mv.error_doc("DNI", "1234567") != ""
    assert mv.error_doc("CE", "001234567") == ""
    assert mv.error_doc("PAS", "x") != ""
    assert mv.enmascarar("12345678") == "****5678"
    assert mv.coincide_dato(" 12.345.678 ", "12345678")
    assert not mv.coincide_dato("12345679", "12345678", "")
    assert not mv.coincide_dato("", "12345678")


# --- archivos --------------------------------------------------------------------------------------


def test_tipo_por_firma_de_bytes():
    assert mv.tipo_por_firma(b"%PDF-1.7\n") == "pdf"
    assert mv.tipo_por_firma(b"\xff\xd8\xff\xe0abc") == "jpg"
    assert mv.tipo_por_firma(b"\x89PNG\r\n\x1a\nxxxx") == "png"
    assert mv.tipo_por_firma(b"<html><script>") is None
    assert mv.tipo_por_firma(b"MZ\x90\x00") is None


def test_error_archivo():
    mb = 1024 * 1024
    assert mv.error_archivo("principal", "pdf", 10, 5 * mb) == ""
    assert "PDF" in mv.error_archivo("principal", "png", 10, 5 * mb)
    assert mv.error_archivo("anexo", "png", 10, 5 * mb) == ""
    assert "Solo se admiten" in mv.error_archivo("anexo", None, 10, 5 * mb)
    assert "5 MB" in mv.error_archivo("anexo", "pdf", 6 * mb, 5 * mb)
    assert "vacío" in mv.error_archivo("anexo", "pdf", 0, 5 * mb)


def test_sanear_nombre_nunca_deja_rutas():
    assert mv.sanear_nombre("../../etc/passwd") == "passwd"
    assert mv.sanear_nombre("C:\\Users\\x\\carta.pdf") == "carta.pdf"
    assert mv.sanear_nombre("a\x00b<>|.pdf") == "ab.pdf"
    assert mv.sanear_nombre("...") == "archivo"
    largo = mv.sanear_nombre("x" * 300 + ".pdf")
    assert len(largo) <= 90 and largo.endswith(".pdf")


class _Subido:
    def __init__(self, nombre: str, datos: bytes):
        self.filename = nombre
        self._datos = datos

    async def read(self, n: int = -1) -> bytes:
        trozo, self._datos = (self._datos, b"") if n < 0 else (self._datos[:n], self._datos[n:])
        return trozo


def _pdf_valido() -> bytes:
    lz = cargo_pdf.Lienzo()
    lz.parrafo("Solicitud de prueba")
    return lz.pdf()


@pytest.mark.skipif(shutil.which("pdfinfo") is None, reason="sin poppler")
def test_recibir_archivo(tmp_path):
    mb = 1024 * 1024
    r = asyncio.run(mv.recibir_archivo(_Subido("../carta final.PDF", _pdf_valido()), "principal", tmp_path, mb, [0], 2 * mb))
    assert r.tipo == "pdf" and r.paginas == 1 and len(r.sha256) == 64 and r.nombre == "carta final.PDF"
    assert r.ruta.parent == tmp_path
    # Un HTML disfrazado de PDF se rechaza por su contenido.
    with pytest.raises(mv.Rechazo) as e:
        asyncio.run(mv.recibir_archivo(_Subido("oficio.pdf", b"<html>hola</html>"), "anexo", tmp_path, mb, [0], 2 * mb))
    assert "Solo se admiten" in e.value.motivo
    # Un «PDF» que solo tiene la cabecera no se puede leer.
    with pytest.raises(mv.Rechazo) as e:
        asyncio.run(mv.recibir_archivo(_Subido("x.pdf", b"%PDF-1.4\nbasura"), "principal", tmp_path, mb, [0], 2 * mb))
    assert "dañado" in e.value.motivo
    # Más grande que el límite: corta mientras lee.
    with pytest.raises(mv.Rechazo) as e:
        asyncio.run(mv.recibir_archivo(_Subido("g.pdf", b"%PDF-" + b"0" * (mb + 10)), "principal", tmp_path, mb, [0], 4 * mb))
    assert e.value.codigo == 413
    # El total del envío también.
    with pytest.raises(mv.Rechazo) as e:
        asyncio.run(mv.recibir_archivo(_Subido("p.pdf", _pdf_valido()), "anexo", tmp_path, mb, [2 * mb], 2 * mb))
    assert "en total" in e.value.motivo


# --- IP real y límites -------------------------------------------------------------------------------


def test_ip_real_tras_el_proxy():
    assert mv.ip_real("192.168.1.20", "1.2.3.4") == "192.168.1.20"             # sin proxy: no se cree a la cabecera
    assert mv.ip_real("127.0.0.1", "") == "127.0.0.1"
    assert mv.ip_real("127.0.0.1", "203.0.113.10, 127.0.0.1") == "203.0.113.10"  # Funnel → vite → API
    assert mv.ip_real("127.0.0.1", "6.6.6.6, 192.168.1.30") == "192.168.1.30"  # lo de la izquierda lo escribió el cliente
    assert mv.ip_real("127.0.0.1", "basura, 127.0.0.1") == "127.0.0.1"
    assert mv.ip_real("::1", "2800:200::1") == "2800:200::1"
    assert mv.ip_real("::ffff:127.0.0.1", "::ffff:203.0.113.10") == "203.0.113.10"   # IPv4 dentro de IPv6 (vite en doble pila)


def test_disco_suficiente(tmp_path, monkeypatch):
    import collections

    uso = collections.namedtuple("uso", "total used free")
    monkeypatch.setattr(mv.shutil, "disk_usage", lambda _: uso(100, 0, 3 * 1024 ** 3))
    assert mv.disco_suficiente(tmp_path, 30 * 1024 ** 2)
    assert not mv.disco_suficiente(tmp_path, 400 * 1024 ** 2)   # diez envíos de 400 MB no caben en 3 GB
    monkeypatch.setattr(mv.shutil, "disk_usage", lambda _: uso(100, 0, 1024 ** 3))
    assert not mv.disco_suficiente(tmp_path, 1024)


def test_limitador_por_ventana():
    lim = mv.Limitador()
    assert all(lim.permitir("a", 3, 60, ahora=t) for t in (0, 1, 2))
    assert not lim.permitir("a", 3, 60, ahora=3)
    assert lim.permitir("b", 3, 60, ahora=3)          # otra IP no se ve afectada
    assert lim.permitir("a", 3, 60, ahora=61.5)       # pasó la ventana
    assert lim.restantes("a", 3, 60, ahora=61.5) == 1   # quedan la marca de t=2 y la nueva


# --- fichas firmadas -----------------------------------------------------------------------------------


def test_ficha_del_formulario():
    f = mv.ficha_formulario(ahora=1000)
    assert mv.error_ficha_formulario(f, ahora=1001) == "rapida"
    assert mv.error_ficha_formulario(f, ahora=1010) == ""
    assert mv.error_ficha_formulario(f, ahora=1000 + 2 * 86400) == "vencida"
    assert mv.error_ficha_formulario(f.replace(".", ".0"), ahora=1010) == "invalida"
    assert mv.error_ficha_formulario("", ahora=1010) == "invalida"


def test_ficha_de_acceso_no_sirve_como_sesion():
    import time

    import jwt

    from app.config import config

    f = mv.ficha_acceso(42)
    assert mv.tramite_de_acceso(f) == 42
    assert mv.tramite_de_acceso(f + "x") is None
    assert mv.tramite_de_acceso(mv.ficha_acceso(42, ahora=time.time() - 3 * 3600)) is None   # vencida
    with pytest.raises(jwt.InvalidTokenError):
        jwt.decode(f, config.jwt_secret, algorithms=["HS256"], options={"verify_aud": False})
    # Y una sesión del sistema no abre un trámite.
    assert mv.tramite_de_acceso(jwt.encode({"sub": "1", "mpv": 42}, config.jwt_secret, algorithm="HS256")) is None


# --- cargo en PDF ------------------------------------------------------------------------------------------


def _vista() -> dict:
    return {
        "expediente": "MPV-2026-00012", "codigo": "K7QF-9M2X-HT4P", "recibido_en": "2026-10-12T22:14",
        "presentado_el": "2026-10-13", "fuera_de_horario": True, "receptor": "Despacho de prueba",
        "remitente": {"tipo_persona": "natural", "nombre": "María Ñahui Quispe", "doc_tipo": "DNI", "doc": "****5678",
                      "representante": "", "cargo": ""},
        "documento": {"tipo": "Solicitud", "numero": "", "folios": 3, "asunto": "Pedido de información sobre el puente «Añaypampa» " * 3,
                      "referencia": ""},
        "archivos": [{"clase": "principal", "nombre": "solicitud.pdf", "tipo": "pdf", "bytes": 120_000, "paginas": 3,
                      "sha256": "a" * 64}],
    }


def test_cargo_pdf_es_un_pdf_con_los_datos():
    pdf = cargo_pdf.cargo(_vista(), "https://ejemplo.ts.net/mesa-de-partes")
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
    if shutil.which("pdftotext"):
        texto = subprocess.run(["pdftotext", "-", "-"], input=pdf, capture_output=True).stdout.decode()
        assert "MPV-2026-00012" in texto and "K7QF-9M2X-HT4P" in texto
        assert "Ñahui" in texto and "«Añaypampa»" in texto and "13/10/2026" in texto


def test_partir_respeta_el_ancho():
    lineas = cargo_pdf.partir("palabra " * 80, 200, 10)
    assert all(cargo_pdf.ancho_texto(x, 10) <= 200 for x in lineas)
    assert len(cargo_pdf.partir("f" * 64, 100, 8.5, "F3")) > 1


# --- ninguna ruta abierta por descuido -------------------------------------------------------------------

# Rutas sin la dependencia de sesión que ya existían (cada una con su propia comprobación) y las de
# la mesa pública. Una ruta nueva sin sesión hace fallar esta prueba: hay que decidirlo a propósito.
PUBLICAS_CONOCIDAS = {
    "/api/health", "/api/auth/login", "/api/auth/clave", "/api/auth/olvide", "/api/colab/estado",
    "/api/fototeca/{foto_id}/video", "/api/prensa/sesion", "/estudio/{ruta:path}", "/api/agenda.ics",
    # El acuse del aviso push (2026-10-13): el service worker no tiene sesión; lo protege la firma HMAC del aviso.
    "/api/push/recibido",
    # Los lotes de uso (2026-10-19): `navigator.sendBeacon` no manda cabeceras; la sesión viaja en el
    # cuerpo y la API la valida como cualquier JWT (sin sesión válida, 204 y nada se guarda).
    "/api/uso",
}


def test_solo_las_rutas_publicas_conocidas_no_piden_sesion():
    from fastapi.routing import APIRoute

    from app.main import app

    def deps(d, acc):
        for s in d.dependencies:
            acc.add(getattr(s.call, "__name__", ""))
            deps(s, acc)
        return acc

    abiertas = set()
    for r in app.routes:
        if isinstance(r, APIRoute) and not ({"usuario_actual", "usuario_con_clave_propia", "solo_administrador"} & deps(r.dependant, set())):
            abiertas.add(r.path)
    mesa = {p for p in abiertas if p.startswith("/api/publico/mesa/")}
    assert mesa == {f"/api/publico/mesa/{x}" for x in ("config", "enviar", "seguimiento", "cargo", "respuesta", "subsanar")}
    assert abiertas - mesa <= PUBLICAS_CONOCIDAS, abiertas - mesa - PUBLICAS_CONOCIDAS
    # Lo del equipo sí pide sesión.
    assert not any(p.startswith("/api/mesa-virtual") for p in abiertas)

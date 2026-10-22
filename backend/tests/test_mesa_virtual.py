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

from punku import cargo_pdf  # noqa: E402
from punku import mesa_virtual as mv  # noqa: E402

CFG = mv.normalizar_config({})
# Un horario de atención GUARDADO antes de existir `continua` (como el de producción): se respeta.
CON_HORARIO = mv.normalizar_config({"horario": {"inicio": "08:30", "fin": "17:30", "dias": [0, 1, 2, 3, 4]}})


# --- configuración ------------------------------------------------------------------------------


# --- días hábiles y horario -----------------------------------------------------------------------


def _l(texto: str) -> datetime:
    return datetime.fromisoformat(texto)


# --- código y expediente ------------------------------------------------------------------------------


# --- documentos de identidad ------------------------------------------------------------------------


def _ruc_con_verificador(base10: str) -> str:
    pesos = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    resto = 11 - sum(int(c) * p for c, p in zip(base10, pesos)) % 11
    return base10 + str(resto - 10 if resto >= 10 else resto)


# --- archivos --------------------------------------------------------------------------------------


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


# --- IP real y límites -------------------------------------------------------------------------------


# --- fichas firmadas -----------------------------------------------------------------------------------


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


# --- ninguna ruta abierta por descuido -------------------------------------------------------------------

# Rutas sin la dependencia de sesión que ya existían (cada una con su propia comprobación) y las de
# la mesa pública. Una ruta nueva sin sesión hace fallar esta prueba: hay que decidirlo a propósito.
PUBLICAS_CONOCIDAS = {
    "/api/health", "/api/auth/login", "/api/auth/clave", "/api/auth/olvide", "/api/colab/estado",
    "/api/fototeca/{foto_id}/video", "/api/agenda.ics",
    # El acuse del aviso push (2026-10-13): el service worker no tiene sesión; lo protege la firma HMAC del aviso.
    "/api/push/recibido",
    # Los lotes de uso (2026-10-19): `navigator.sendBeacon` no manda cabeceras; la sesión viaja en el
    # cuerpo y la API la valida como cualquier JWT (sin sesión válida, 204 y nada se guarda).
    "/api/uso",
    # El Observatorio de datos (Qhawana Q1, 2026-10-20): su página y su estado, públicos como antes /obs/ (indicadores
    # de fuentes oficiales; va en un marco, que no manda cabeceras).
    "/api/observatorio/estado", "/api/observatorio/plataforma.html",
    # El kit de transmisiones (Wayra, editores E1, 2026-10-20): OBS carga sus piezas por URL, sin sesión; no llevan datos.
    "/api/obs/video/obs-studio/{ruta:path}", "/api/obs/tokens/{archivo}",
    # El editor de fotos (Tullpu, editores E2a, 2026-10-20): sus páginas y su API las protege la cookie del editor, que da
    # `POST /api/fotos/sesion` con la ficha (el marco no manda cabeceras), como antes /estudio/; borrarla no pide nada.
    "/api/fotos", "/api/fotos/{ruta:path}", "/api/fotos/sesion",
    # El editor de videos (Kuyuy, E3), igual que el de fotos.
    "/api/videos", "/api/videos/{ruta:path}", "/api/videos/sesion",
    # El editor de piezas (Awana, E4a), igual.
    "/api/piezas/editor", "/api/piezas/editor/{ruta:path}", "/api/piezas/editor/sesion",
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


def test_mesa_de_24_horas_presenta_el_mismo_dia_y_cuenta_plazos_en_habiles():
    # Sábado de noche y feriado: se tiene por presentado ese mismo día, nunca «fuera de horario».
    assert mv.momento_presentacion(_l("2026-10-17T23:40"), CFG) == (date(2026, 10, 17), False)
    assert mv.momento_presentacion(_l("2026-10-08T03:00"), CFG) == (date(2026, 10, 8), False)
    # Los plazos siguen en días hábiles (lunes a viernes sin feriados), desde el día hábil siguiente.
    assert mv.sumar_habiles(date(2026, 10, 16), 2, CFG) == date(2026, 10, 20)   # viernes → martes
    assert mv.sumar_habiles(date(2026, 10, 17), 2, CFG) == date(2026, 10, 20)   # sábado → martes
    assert mv.dias_habiles(CFG) == [0, 1, 2, 3, 4]
    assert mv.hora_cierre(CFG) == "23:59" and mv.hora_cierre(CON_HORARIO) == "17:30"


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

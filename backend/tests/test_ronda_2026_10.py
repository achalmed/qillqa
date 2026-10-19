"""backend/tests/test_ronda_2026_10.py — presencia del equipo, pie en lista, copias compactas y ajustes de espaciado (2026-10-01).

Pruebas puras (sin base de datos): estados de presencia por edad del latido, persistencia
espaciada de `ultima_actividad`, elementos de «Adj.» y «c.c.», listas blancas de los fmt_*
nuevos y quién ve la autoría. Uso: cd backend && .venv/bin/python -m pytest -q
"""
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.flujo import ve_autoria  # noqa: E402
from app.latex import generador as g  # noqa: E402
from app.servicios import presencia as p  # noqa: E402
from app.servicios.adjuntos import linea_adj  # noqa: E402

T0 = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)


def test_presencia_estados_por_edad_y_visibilidad():
    p.limpiar_registro()
    p.registrar(1, documento_id=7, visible=True, momento=T0)
    lat = p.latido_de(1)
    assert p.estado_de(lat, T0 + timedelta(seconds=30)) == "en_linea"
    assert p.estado_de(lat, T0 + timedelta(minutes=3)) == "ausente"
    assert p.estado_de(lat, T0 + timedelta(minutes=11)) == "desconectado"
    p.registrar(1, documento_id=None, visible=False, momento=T0)
    assert p.estado_de(p.latido_de(1), T0 + timedelta(seconds=5)) == "ausente"
    assert p.estado_de(None) == "desconectado"
    p.olvidar(1)
    assert p.latido_de(1) is None


def test_presencia_persiste_cada_dos_minutos():
    p.limpiar_registro()
    assert p.registrar(2, None, True, momento=T0) is True
    assert p.registrar(2, None, True, momento=T0 + timedelta(seconds=30)) is False
    assert p.registrar(2, None, True, momento=T0 + timedelta(minutes=2)) is True


def test_adjuntos_en_lista_y_sufijo_antiguo():
    assert linea_adj(["Informe", " ", "Acta"]) == "Informe; Acta"
    assert g.items_adjunto("Informe; Acta (2 documentos)") == ["Informe", "Acta"]
    assert g.items_adjunto("Lo indicado (05 folios)") == ["Lo indicado (05 folios)"]
    cierre = g._cierre_normativo({"anexo": "Informe; Acta"})
    assert "\\adjuntos{\\itempie[1.]{Informe}\\itempie[2.]{Acta}}" in cierre
    # Uno solo: sin número.
    assert "\\adjuntos{\\itempie{Informe}}" in g._cierre_normativo({"anexo": "Informe"})
    # En una línea, como antes, si se elige.
    linea = g._cierre_normativo({"anexo": "Informe; Acta", "fmt_pie_forma": "linea"})
    assert "\\adjunto{Informe; Acta}" in linea


def test_copias_en_una_linea_por_persona():
    cc = "Señor:\nJuan Pérez\nGerente\nSeñora:\nAna Ríos\nDirectora"
    assert g.entradas_copia(cc) == ["Juan Pérez, Gerente", "Ana Ríos, Directora"]
    pie = g._cierre_normativo({"con_copia": cc})
    assert "\\concopias{\\itempie{Juan Pérez, Gerente}\\itempie{Ana Ríos, Directora}}" in pie
    arriba = g._bloque_copia_arriba({"con_copia": cc, "fmt_copia_arriba": "si"})
    assert arriba == "\\itempie{Juan Pérez, Gerente}\\itempie{Ana Ríos, Directora}"
    assert "Señor:" not in arriba


def test_espacios_y_margenes_por_lista_blanca():
    pre = g._preambulo_formato(
        {
            "fmt_espacio_partes": "0.4",
            "fmt_espacio_cuerpo": "1",
            "fmt_espacio_saludo": "0.3",
            "fmt_margenes": "2.2cm",
        }
    )
    assert "\\ifdefined\\setespaciopartes\\setespaciopartes{0.4}\\fi" in pre
    assert "\\setespacioantescuerpo{1}" in pre
    assert "\\ifdefined\\setespaciosaludo\\setespaciosaludo{0.3}\\fi" in pre
    assert "\\geometry{left=2.2cm,right=2.2cm}" in pre
    # Nada fuera de la lista blanca llega al LaTeX.
    malo = g._preambulo_formato(
        {"fmt_espacio_cuerpo": "1}\\input{x", "fmt_margenes": "9cm", "fmt_espacio_partes": "3"}
    )
    assert "input" not in malo and "geometry" not in malo and "espaciopartes" not in malo


def test_autoria_visible_para_el_equipo_no_para_invitado():
    assert ve_autoria("secretaria") and ve_autoria("asesor") and ve_autoria("administrador")
    assert not ve_autoria("invitado")


def test_expediente_firmado_se_reconoce_por_el_nombre_nuevo_y_el_antiguo():
    from app.servicios.expediente import con_firma_por_nombre

    assert con_firma_por_nombre("EXP-OF-0015-2026-2027_Solicita-informacion_firmado.pdf")
    assert not con_firma_por_nombre("EXP-OF-0015-2026-2027_Solicita-informacion_sin-firma.pdf")
    assert con_firma_por_nombre("EXPEDIENTE OF 0015 (firmado).pdf")
    assert not con_firma_por_nombre("EXPEDIENTE OF 0015 (SIN FIRMA).pdf")


def test_adjunto_escrito_que_luego_tiene_archivo_no_se_repite():
    from app.servicios.adjuntos import combinar_adjuntos

    assert combinar_adjuntos(["Oficio N° 108", "Acta"], ["oficio  n° 108"]) == ["Acta", "oficio  n° 108"]
    assert combinar_adjuntos(["Lo indicado"], []) == ["Lo indicado"]

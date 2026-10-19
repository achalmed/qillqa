"""Imagen de página del visor rápido (2026-10-19): el ETag que se calcula ANTES de rasterizar, su
comparación con `If-None-Match`, y el caché en disco acotado (`servicios/imagen.py`). Puras: sin
base de datos, sin pdftocairo y sin PDF (la fecha y el tamaño se pasan como números)."""

import os
import time

from app.api.archivos import coincide_etag
from app.servicios import imagen


# --- la clave (ETag) --------------------------------------------------------------------------


def test_clave_es_estable_y_cambia_con_lo_que_determina_la_imagen():
    base = imagen.clave_pagina("/d/of.pdf", 1_000, 50_000, 1, 768, "png")
    assert len(base) == 32 and base == imagen.clave_pagina("/d/of.pdf", 1_000, 50_000, 1, 768, "png")
    # Recompilar el PDF cambia la fecha (o el tamaño): otra clave, otra imagen.
    assert base != imagen.clave_pagina("/d/of.pdf", 1_001, 50_000, 1, 768, "png")
    assert base != imagen.clave_pagina("/d/of.pdf", 1_000, 50_001, 1, 768, "png")
    # Otra página, otro archivo, otro ancho útil u otro formato: otra clave.
    assert base != imagen.clave_pagina("/d/of.pdf", 1_000, 50_000, 2, 768, "png")
    assert base != imagen.clave_pagina("/d/otro.pdf", 1_000, 50_000, 1, 768, "png")
    assert base != imagen.clave_pagina("/d/of.pdf", 1_000, 50_000, 1, 1240, "png")
    assert base != imagen.clave_pagina("/d/of.pdf", 1_000, 50_000, 1, 768, "jpeg")


def test_dos_anchos_con_la_misma_resolucion_son_la_misma_imagen():
    # 768 y 770 px caen en los mismos ppp (resolucion_para): no se rasteriza dos veces.
    assert imagen.resolucion_para(768) == imagen.resolucion_para(770)
    assert imagen.clave_pagina("/d/of.pdf", 1, 1, 1, 768) == imagen.clave_pagina("/d/of.pdf", 1, 1, 1, 770)
    # Sin ancho, 0 o la página entera: la resolución de siempre.
    assert imagen.clave_pagina("/d/of.pdf", 1, 1, 1, None) == imagen.clave_pagina("/d/of.pdf", 1, 1, 1, 1240)


def test_formato_valido_solo_png_o_jpeg():
    assert imagen.formato_valido(None) == "png"
    assert imagen.formato_valido("") == "png"
    assert imagen.formato_valido("JPEG") == "jpeg"
    assert imagen.formato_valido("jpg") == "jpeg"
    assert imagen.formato_valido("webp") == "png"
    assert imagen.clave_pagina("/d/of.pdf", 1, 1, 1, 768, "jpg") == imagen.clave_pagina("/d/of.pdf", 1, 1, 1, 768, "jpeg")


def test_clave_de_lee_fecha_y_tamano_del_disco(tmp_path):
    pdf = tmp_path / "of.pdf"
    pdf.write_bytes(b"%PDF-1.4 ...")
    st = pdf.stat()
    assert imagen.clave_de(pdf, 1, 768, "png") == imagen.clave_pagina(str(pdf), st.st_mtime_ns, st.st_size, 1, 768, "png")
    antes = imagen.clave_de(pdf, 1, 768, "png")
    pdf.write_bytes(b"%PDF-1.4 ... recompilado")
    assert imagen.clave_de(pdf, 1, 768, "png") != antes


def test_coincide_etag_como_lo_manda_el_navegador():
    assert coincide_etag('"abc"', '"abc"')
    assert coincide_etag('"x", "abc"', '"abc"')
    assert coincide_etag("*", '"abc"')
    assert not coincide_etag('"abd"', '"abc"')
    assert not coincide_etag(None, '"abc"')
    assert not coincide_etag("", '"abc"')
    # El ETag es fuerte: el débil del mismo valor no cuenta.
    assert not coincide_etag('W/"abc"', '"abc"')


# --- el caché en disco -------------------------------------------------------------------------


def test_guardar_y_leer_cache(tmp_path):
    carpeta = tmp_path / "imagenes"  # todavía no existe: se crea al guardar
    assert imagen.leer_cache(carpeta, "k1", "jpeg") is None
    imagen.guardar_cache(carpeta, "k1", "jpeg", b"\xff\xd8datos")
    assert imagen.leer_cache(carpeta, "k1", "jpeg") == b"\xff\xd8datos"
    assert imagen.leer_cache(carpeta, "k1", "png") is None  # otro formato, otro archivo
    assert [a.name for a in carpeta.iterdir()] == ["k1.jpeg"]  # sin temporales
    # Caché apagado (None) o datos vacíos: no se guarda nada y no falla.
    imagen.guardar_cache(None, "k2", "png", b"x")
    imagen.guardar_cache(carpeta, "k2", "png", b"")
    assert imagen.leer_cache(None, "k1", "jpeg") is None
    assert imagen.leer_cache(carpeta, "k2", "png") is None


def test_un_acierto_renueva_la_fecha(tmp_path):
    imagen.guardar_cache(tmp_path, "k", "png", b"png")
    archivo = tmp_path / "k.png"
    viejo = time.time() - 10 * 86400
    os.utime(archivo, (viejo, viejo))
    imagen.leer_cache(tmp_path, "k", "png")
    assert archivo.stat().st_mtime > viejo + 86400


def test_a_borrar_primero_lo_viejo_y_luego_lo_menos_usado_hasta_el_tope():
    ahora = 1_000_000.0
    entradas = [
        ("vieja", 10, ahora - 40 * 86400),   # más vieja que 30 días: fuera siempre
        ("a", 30, ahora - 3 * 86400),
        ("b", 30, ahora - 2 * 86400),
        ("c", 30, ahora - 1 * 86400),
    ]
    # Sin tope: solo la vieja.
    assert imagen.a_borrar(entradas, 0, 30 * 86400, ahora) == ["vieja"]
    # Tope de 70: las vivas suman 90; se va la menos usada (a) y ya caben.
    assert imagen.a_borrar(entradas, 70, 30 * 86400, ahora) == ["vieja", "a"]
    # Tope de 20: se van a, b y c en orden de uso.
    assert imagen.a_borrar(entradas, 20, 30 * 86400, ahora) == ["vieja", "a", "b", "c"]
    # Sin edad máxima ni tope: nada.
    assert imagen.a_borrar(entradas, 0, 0, ahora) == []


def test_podar_borra_en_disco_y_los_temporales_abandonados(tmp_path):
    ahora = time.time()
    for nombre, tamano, edad in [("vieja.png", 10, 40 * 86400), ("a.jpeg", 30, 3 * 86400), ("b.jpeg", 30, 60)]:
        (tmp_path / nombre).write_bytes(b"x" * tamano)
        os.utime(tmp_path / nombre, (ahora - edad, ahora - edad))
    (tmp_path / "c.png.123.tmp").write_bytes(b"x")
    os.utime(tmp_path / "c.png.123.tmp", (ahora - 7200, ahora - 7200))
    (tmp_path / "d.png.456.tmp").write_bytes(b"x")  # recién creado: un proceso lo está escribiendo
    # Tope de 40 bytes: la vieja por edad, «a» por tope, el temporal de dos horas por abandono.
    assert imagen.podar(tmp_path, tope_mb=0, dias=30, ahora=ahora) == 2  # solo vieja + tmp (tope 0 = sin tope)
    assert sorted(a.name for a in tmp_path.iterdir()) == ["a.jpeg", "b.jpeg", "d.png.456.tmp"]
    # Un tope en MB se aplica en bytes; aquí basta uno minúsculo para forzarlo.
    assert imagen.a_borrar([("a.jpeg", 30, ahora - 3 * 86400), ("b.jpeg", 30, ahora - 60)], 40, 30 * 86400, ahora) == ["a.jpeg"]
    # Sin carpeta o carpeta inexistente: 0 y sin error.
    assert imagen.podar(None, 200, 30) == 0
    assert imagen.podar(tmp_path / "no-existe", 200, 30) == 0


def test_podar_si_toca_respeta_el_intervalo(tmp_path, monkeypatch):
    llamadas = []
    monkeypatch.setattr(imagen, "podar", lambda *a, **k: llamadas.append(a) or 0)
    monkeypatch.setattr(imagen, "_ultima_poda", 0.0)
    imagen.podar_si_toca(tmp_path, 200, 30)
    imagen.podar_si_toca(tmp_path, 200, 30)
    assert len(llamadas) == 1

"""backend/tests/test_compilador_pdf_anterior.py — si la compilación falla, el PDF anterior se
conserva (2026-10-12: un fallo dejaba el borrador sin vista previa). Sin LaTeX: se simula el build.
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_compilador_pdf_anterior.py
"""
import asyncio
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.latex import compilador  # noqa: E402

CUERPO = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hola"}]}]}


def _correr(tmp_path, monkeypatch, exito: bool):
    viejo = tmp_path / "OF-0001_viejo.pdf"
    viejo.write_bytes(b"%PDF-viejo")

    async def build_falso(maestro):
        if exito:
            nuevo = maestro.parent / "OF-0001_nuevo.pdf"
            nuevo.write_bytes(b"%PDF-nuevo")
            return compilador.ResultadoCompilacion(True, nuevo, "PDF generado.")
        return compilador.ResultadoCompilacion(False, None, "falló")

    monkeypatch.setattr(compilador, "ejecutar_build", build_falso)
    campos = {"asunto": "Prueba", "fecha": "2026-10-12", "destinatario_nombre": "Alguien"}
    return asyncio.run(compilador.compilar_en_carpeta(tmp_path, "oficio", "Oficio", campos, CUERPO, None, tipo_cfg={"serie": "OF"})), viejo


def test_fallo_conserva_el_pdf_anterior(tmp_path, monkeypatch):
    r, viejo = _correr(tmp_path, monkeypatch, exito=False)
    assert not r.exito and viejo.exists() and viejo.read_bytes() == b"%PDF-viejo"
    assert not (tmp_path / ".pdf-anterior").exists()


def test_exito_reemplaza_el_pdf_anterior(tmp_path, monkeypatch):
    r, viejo = _correr(tmp_path, monkeypatch, exito=True)
    assert r.exito and not viejo.exists() and (tmp_path / "OF-0001_nuevo.pdf").exists()
    assert not (tmp_path / ".pdf-anterior").exists()


def test_contenido_no_componible_no_toca_la_carpeta(tmp_path, monkeypatch):
    from app.latex.serializador import NodoNoSoportado

    viejo = tmp_path / "OF-0001_viejo.pdf"
    viejo.write_bytes(b"%PDF-viejo")

    def maestro_roto(*a, **k):
        raise NodoNoSoportado("no se puede")

    monkeypatch.setattr(compilador, "generar_maestro", maestro_roto)
    try:
        asyncio.run(compilador.compilar_en_carpeta(tmp_path, "oficio", "Oficio", {}, CUERPO, None))
    except NodoNoSoportado:
        pass
    assert viejo.exists() and not (tmp_path / "oficio.tex").exists()

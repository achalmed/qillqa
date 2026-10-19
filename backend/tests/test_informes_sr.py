"""backend/tests/test_informes_sr.py — informes de representación en Inicio (paso 4.3, 2026-10-01)."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import informes_sr as isr  # noqa: E402


def _semana(raiz, nombre, pdfs, yaml_txt=""):
    c = raiz / nombre
    (c / "salida").mkdir(parents=True)
    for p in pdfs:
        (c / "salida" / p).write_bytes(b"%PDF-1.4")
    if yaml_txt:
        (c / "expediente.yaml").write_text(yaml_txt, encoding="utf-8")
    return c


def test_vigente_publica_y_orden(tmp_path):
    _semana(tmp_path, "2026-08_SR-01_la-mar", ["ISR-01_2026-08_v1.3-1col.pdf", "ISR-01_2026-08_v1.3.pdf", "ISR-01_2026-08_v1.2.pdf"])
    _semana(
        tmp_path, "2026-09_SR-02_educacion-superior",
        ["ISR-02_2026-09_v0.2-borrador.pdf", "ISR-02_2026-09_v0.2-borrador-interna.pdf", "ISR-02_2026-09_v0.1-borrador.pdf"],
        "id: SR-02\nestado: activo\nperiodo: {inicio: 2026-09-21, fin: 2026-09-25}\nambito: {provincias: [Huanta]}\npedidos: {total: 57}\n",
    )
    (tmp_path / "_plantilla").mkdir()
    l = isr.listar(tmp_path)
    assert [s["id"] for s in l] == ["SR-02", "SR-01"]  # la más reciente primero
    assert [p["nombre"] for p in l[0]["pdfs"]] == ["ISR-02_2026-09_v0.2-borrador.pdf"]  # sin la interna
    assert l[0]["pdfs"][0]["estado"] == "borrador" and l[0]["inicio"] == "2026-09-21" and l[0]["pedidos"] == 57
    assert [p["nombre"] for p in l[1]["pdfs"]] == ["ISR-01_2026-08_v1.3.pdf", "ISR-01_2026-08_v1.3-1col.pdf"]
    assert l[1]["pdfs"][0]["estado"] == "aprobado"


def test_archivo_no_sale_de_la_raiz_ni_da_la_interna(tmp_path):
    _semana(tmp_path, "2026-09_SR-02_x", ["ISR-02_2026-09_v0.2-borrador.pdf", "ISR-02_2026-09_v0.2-borrador-interna.pdf"])
    assert isr.archivo(tmp_path, "2026-09_SR-02_x", "ISR-02_2026-09_v0.2-borrador.pdf")
    assert isr.archivo(tmp_path, "2026-09_SR-02_x", "ISR-02_2026-09_v0.2-borrador-interna.pdf") is None
    assert isr.archivo(tmp_path, "..", "ISR-02_2026-09_v0.2-borrador.pdf") is None
    assert isr.archivo(tmp_path, "2026-09_SR-02_x", "../../etc/passwd") is None


def test_tema_distritos_y_estado_de_los_pedidos(tmp_path):
    _semana(
        tmp_path, "2026-09_SR-02_educacion-superior", [],
        "id: SR-02\ntema: Educación superior\nambito: {provincias: [Huanta], distritos: [Huanta, Luricocha]}\n"
        "pedidos: {total: 57, registrados: 57, derivados: 3, respondidos: 0, cerrados: 0, nota: x}\n",
    )
    _semana(tmp_path, "2026-08_SR-01_la-mar", [])
    s2, s1 = isr.listar(tmp_path)
    assert s2["tema"] == "Educación superior" and s1["tema"] == "la mar"  # sin `tema`, el de la carpeta
    assert s2["distritos"] == ["Huanta", "Luricocha"]
    assert s2["pedidos_estado"] == {"registrados": 57, "derivados": 3, "respondidos": 0, "cerrados": 0}
    assert s1["pedidos_estado"] == {}


def test_tras_aprobar_se_lee_la_aprobada_y_el_borrador_va_aparte(tmp_path):
    _semana(tmp_path, "2026-10_SR-03_x", ["ISR-03_2026-10_v1.0.pdf", "ISR-03_2026-10_v1.0-1col.pdf",
                                          "ISR-03_2026-10_v1.1-borrador.pdf"])
    s = isr.listar(tmp_path)[0]
    assert [p["nombre"] for p in s["pdfs"]] == ["ISR-03_2026-10_v1.0.pdf", "ISR-03_2026-10_v1.0-1col.pdf"]
    assert [p["nombre"] for p in s["borrador"]] == ["ISR-03_2026-10_v1.1-borrador.pdf"]

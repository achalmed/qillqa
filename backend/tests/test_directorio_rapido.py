"""El directorio rápido se encuentra con su nombre actual y con el anterior; si falta, se sabe (ola 4, U2)."""
from app.servicios.directorio import archivo_directorio_rapido


def test_nombre_actual_y_anterior(tmp_path):
    assert archivo_directorio_rapido(tmp_path) is None
    (tmp_path / "DIRECTORIO_RAPIDO.md").write_text("# x\n", encoding="utf-8")
    assert archivo_directorio_rapido(tmp_path).name == "DIRECTORIO_RAPIDO.md"
    (tmp_path / "directorio-rapido.md").write_text("# x\n", encoding="utf-8")
    assert archivo_directorio_rapido(tmp_path).name == "directorio-rapido.md"

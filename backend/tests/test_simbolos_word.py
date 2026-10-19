"""backend/tests/test_simbolos_word.py — los símbolos que Word pega (zona privada de Symbol y
Wingdings, invisibles, emoji, flechas que las fuentes no tienen) llegan bien al LaTeX en todos los
formularios: documentos y proyectos de ley (`latex/serializador.py`) y el informe de la semana
(`marco_documental/generadores/informe-sr/lib/latex.py`, copia que debe dar lo mismo).
Uso: cd backend && .venv/bin/python -m pytest -q tests/test_simbolos_word.py
"""
import importlib.util
import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.latex.serializador import escapar, escapar_linea, limpiar  # noqa: E402

PEGADO = "N. 0641  punto → 10% ≥ 5 ✓ 😀 ºª “x” — é fin​­ sigue\x0bya️"


def test_simbolos_de_word():
    t = escapar(PEGADO)
    assert "N.° 0641 • punto" in t
    assert r"\ensuremath{\rightarrow}" in t and r"\ensuremath{\geq}" in t and r"\ensuremath{\surd}" in t
    assert "😀" not in t and "" not in t and "\x0b" not in t and "️" not in t
    assert "ºª “x” — é fin" in t and "\nsigue" in t
    assert r"10\%" in t


def test_asunto_en_una_linea():
    assert escapar_linea("Solicito\n\ninforme   N.° 1 sobre") == "Solicito informe N.° 1 sobre"


def test_el_informe_sr_limpia_igual():
    import sys

    gen = Path(__file__).resolve().parents[2] / "marco_documental/generadores/informe-sr"
    sys.path.insert(0, str(gen))  # su `lib/latex.py` importa `config` de esa carpeta
    try:
        spec = importlib.util.spec_from_file_location("latex_isr", gen / "lib/latex.py")
        isr = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(isr)
    finally:
        sys.path.remove(str(gen))
    assert isr.limpiar(PEGADO) == limpiar(PEGADO)
    assert isr.escapar(PEGADO) == escapar(PEGADO)


# --- la firma no queda sola en la última hoja (servicios/compilacion.py) ------------------------

from app.servicios.compilacion import espacios_a_probar, firma_sola_al_final  # noqa: E402

_MEMBRETE = "NOMBRE DEL TITULAR\nCARGO\n"
_PIE = "\nDirección de la entidad\ncorreo · celular   Pág. {n} de {m}"


def test_firma_sola_al_final():
    p1 = _MEMBRETE + "Señor: Fulano\nASUNTO: algo\nCuerpo del oficio." + _PIE.format(n=1, m=3)
    p2 = _MEMBRETE + "Sigue el cuerpo.\nSin otro particular." + _PIE.format(n=2, m=3)
    sola = _MEMBRETE + "\n   Atentamente,\n\n   NOMBRE DEL TITULAR\n   Cargo" + _PIE.format(n=3, m=3)
    assert firma_sola_al_final([p1, p2, sola])
    con_cuerpo = _MEMBRETE + "Última frase del cuerpo.\nAtentamente,\nNOMBRE" + _PIE.format(n=3, m=3)
    assert not firma_sola_al_final([p1, p2, con_cuerpo])
    assert not firma_sola_al_final([p1])


def test_cierre_solo_con_el_ultimo_parrafo():
    """El último párrafo acompaña a la firma: con pocas líneas antes de «Atentamente», la hoja es solo de cierre."""
    p1 = "MEMBRETE\nTexto uno\nPie de página\nPág. 1 de 3"
    p2 = "MEMBRETE\nTexto dos\nPie de página\nPág. 2 de 3"
    cierre = "MEMBRETE\nSin otro particular, hago propicia la oportunidad\nmi especial consideración.\nAtentamente,\nNOMBRE\nPie de página\nPág. 3 de 3"
    assert not firma_sola_al_final([p1, p2, cierre])
    assert firma_sola_al_final([p1, p2, cierre], 4)
    largo = "MEMBRETE\n" + "\n".join(f"línea {i}" for i in range(8)) + "\nAtentamente,\nPie de página"
    assert not firma_sola_al_final([p1, p2, largo], 4)


def test_espacios_a_probar():
    assert espacios_a_probar(3.0) == ["2.5cm", "2cm"]
    assert espacios_a_probar(2.5) == ["2cm"]
    assert espacios_a_probar(2.0) == []
    assert espacios_a_probar(None) == ["2cm"]  # 2,2 cm del marco


def test_espacios_a_probar_segun_el_tipo():
    """Memorando e informe parten de 1,8 cm: nunca se prueba MÁS espacio que el suyo."""
    assert espacios_a_probar(None, 1.8) == []
    assert espacios_a_probar(None, 2.0) == []


def test_cierre_del_informe():
    """El informe cierra con «Es cuanto informo…», no con «Atentamente»."""
    p1 = "MEMBRETE\nTexto uno\nPie\nPág. 1 de 2"
    p2 = "MEMBRETE\nEs cuanto informo a usted para los fines pertinentes.\nNOMBRE\nPie\nPág. 2 de 2"
    assert firma_sola_al_final([p1, p2])


from app.servicios.compilacion import pasos_de_ajuste  # noqa: E402


def test_pasos_de_ajuste_acumulan_y_respetan_los_pisos():
    campos = {"fmt_firma_espacio": "3cm", "fmt_interlineado": "1.0", "fmt_espacioparrafos": "2pt"}
    pasos = pasos_de_ajuste(campos, "oficio")
    nombres = [n for n, _ in pasos]
    assert nombres[:2] == ["espacio de firma 2,5 cm", "espacio de firma 2 cm"]
    assert "interlineado 1,0" not in nombres          # ya está en 1,0
    assert nombres[-2:] == ["letra 10,5 pt", "letra 10 pt"]
    ultimo = pasos[-1][1]
    assert ultimo["fmt_firma_espacio"] == "2cm"       # acumulativo
    assert ultimo["fmt_espacioparrafos"] == "1pt"
    assert ultimo["fmt_tamano"] == "10"               # nunca por debajo de 10 pt


def test_pasos_de_ajuste_bajan_el_tamano_propio_del_cuerpo():
    pasos = pasos_de_ajuste({"fmt_cuerpo_tamano": "10.5"}, "memorando")
    assert pasos[-1][1]["fmt_cuerpo_tamano"] == "10"
    assert "fmt_tamano" not in pasos[-1][1]
    assert not any(n.startswith("espacio de firma") for n, _ in pasos)


# --- el memorando de viáticos y pasajes, siempre en una hoja (Edison 2026-10-18) -----------------

from app.servicios.compilacion import exige_una_hoja  # noqa: E402
from app.tipos import tipo_config  # noqa: E402


def test_memorando_de_viaticos_exige_una_hoja():
    memo = tipo_config("memorando")
    assert exige_una_hoja(memo, {"asunto": "Solicito asignación de viáticos y pasajes terrestres"})
    assert exige_una_hoja(memo, {"asunto": "Pasajes de la semana de representación"})
    assert not exige_una_hoja(memo, {"asunto": "Coordinación de la agenda"})
    assert not exige_una_hoja(tipo_config("oficio"), {"asunto": "Viáticos"})


def test_pasos_de_una_hoja_terminan_en_tablas_y_margenes():
    pasos = pasos_de_ajuste({}, "memorando", una_hoja=True)
    assert [n for n, _ in pasos[-2:]] == ["tablas en letra menor", "márgenes de 2 cm"]
    ultimo = pasos[-1][1]
    assert ultimo["fmt_tamano"] == "10" and ultimo["fmt_interlineado"] == "1.0"   # pisos legibles
    assert "tablas en letra menor" not in [n for n, _ in pasos_de_ajuste({}, "memorando")]

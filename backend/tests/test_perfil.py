"""backend/tests/test_perfil.py — reglas puras del perfil (servicios/perfil.py): DNI, correo,
celular peruano, «Info», cargos según el rol, qué ve cada quien de una tarjeta y el recorte de
la foto. Sin base de datos. Uso: cd backend && .venv/bin/python -m pytest -q tests/test_perfil.py
"""
import io
import os
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://x:y@127.0.0.1/z")
os.environ.setdefault("JWT_SECRET", "prueba")

from app.servicios import perfil  # noqa: E402
from app.servicios.perfil import DatoInvalido  # noqa: E402


def test_dni_y_correo():
    assert perfil.validar_dni(" 4567 8912 ") == "45678912"
    assert perfil.validar_dni("") == ""
    for malo in ("1234567", "123456789", "4567891a"):
        with pytest.raises(DatoInvalido):
            perfil.validar_dni(malo)
    assert perfil.validar_correo("  Nombre.Apellido@Dominio.PE ") == "nombre.apellido@dominio.pe"
    assert perfil.validar_correo("") == ""
    for malo in ("sin-arroba", "a@b", "a b@c.pe", "a@@c.pe"):
        with pytest.raises(DatoInvalido):
            perfil.validar_correo(malo)


def test_celular_peruano():
    for bueno in ("987654321", "987 654 321", "987-654-321", "+51 987 654 321", "51987654321"):
        assert perfil.normalizar_celular(bueno) == "987654321"
    assert perfil.normalizar_celular("  ") == ""
    for malo in ("87654321", "887654321", "9876543210", "+1 987 654 321", "014567890"):
        with pytest.raises(DatoInvalido):
            perfil.normalizar_celular(malo)
    assert perfil.celular_legible("987654321") == "987 654 321"
    assert perfil.enlace_whatsapp("987654321") == "https://wa.me/51987654321"
    assert perfil.enlace_whatsapp("") == ""


def test_acerca_y_nombres():
    assert perfil.validar_acerca("  En  comisión\nhasta las 3  ") == "En comisión hasta las 3"
    assert perfil.validar_acerca("x" * 140) == "x" * 140
    with pytest.raises(DatoInvalido):
        perfil.validar_acerca("x" * 141)
    assert perfil.limpiar_nombre("  Nombre   Segundo ", "nombres") == "Nombre Segundo"
    with pytest.raises(DatoInvalido):
        perfil.limpiar_nombre("   ", "nombres")


def test_cargo_solo_dentro_del_rol():
    assert set(perfil.cargos_permitidos("asesor")) == {"Asesor principal", "Asesor", "Coordinador"}
    assert "Diputado" not in perfil.cargos_permitidos("secretaria")
    assert "Invitado" not in perfil.cargos_permitidos("administrador")
    assert "Diputado" in perfil.cargos_permitidos("administrador")
    assert perfil.validar_cargo("auxiliar", "secretaria") == "Auxiliar"
    assert perfil.validar_cargo("", "secretaria") == ""
    with pytest.raises(DatoInvalido):
        perfil.validar_cargo("Diputado", "secretaria")
    with pytest.raises(DatoInvalido):
        perfil.validar_cargo("Cargo inventado", "asesor")


def _usuario(**k):
    base = dict(id=1, nombre_completo="Nombre Apellido", nombre_usuario="napellido", nombres="Nombre",
                apellidos="Apellido", cargo="Asesor", rol="asesor", dni="45678912", email="n@dominio.pe",
                telefono="987654321", acerca="En comisión", foto="chat/perfiles/u1-abcd1234.jpg", activo=True)
    base.update(k)
    return NS(**base)


def test_tarjeta_segun_quien_mira():
    u = _usuario()
    propia = perfil.tarjeta(u, u)
    assert propia["dni"] == "45678912" and propia["propia"] and not propia["puede_chatear"]
    assert propia["foto"] == "u1-abcd1234"

    colega = perfil.tarjeta(u, _usuario(id=2, rol="secretaria"))
    assert "dni" not in colega
    assert colega["celular"] == "987654321" and colega["whatsapp"] == "https://wa.me/51987654321"
    assert colega["email"] == "n@dominio.pe" and colega["puede_chatear"]

    admin = perfil.tarjeta(u, _usuario(id=3, rol="administrador"))
    assert admin["dni"] == "45678912"

    invitado = perfil.tarjeta(u, _usuario(id=4, rol="invitado"))
    assert "dni" not in invitado and not invitado["con_contacto"]
    assert invitado["celular"] == invitado["email"] == invitado["whatsapp"] == ""
    assert invitado["nombre"] == "Nombre Apellido" and invitado["acerca"] == "En comisión"
    assert not invitado["puede_chatear"]

    # Con un invitado no se chatea; con una cuenta desactivada, tampoco.
    assert not perfil.tarjeta(_usuario(rol="invitado"), _usuario(id=2))["puede_chatear"]
    assert not perfil.tarjeta(_usuario(activo=False), _usuario(id=2))["puede_chatear"]


def _imagen(ancho: int, alto: int, modo: str = "RGB", formato: str = "PNG") -> bytes:
    from PIL import Image

    salida = io.BytesIO()
    Image.new(modo, (ancho, alto), (120, 20, 40, 128) if modo == "RGBA" else (120, 20, 40)).save(salida, format=formato)
    return salida.getvalue()


def test_foto_cuadrada_jpeg():
    from PIL import Image

    jpeg = perfil.recortar_foto(_imagen(1600, 900))
    img = Image.open(io.BytesIO(jpeg))
    assert img.format == "JPEG" and img.size == (512, 512)
    # Una imagen pequeña no se agranda; una transparente queda sobre blanco.
    chica = Image.open(io.BytesIO(perfil.recortar_foto(_imagen(300, 200, "RGBA"))))
    assert chica.size == (200, 200) and chica.mode == "RGB"
    with pytest.raises(DatoInvalido):
        perfil.recortar_foto(b"no es una imagen")
    nombre = perfil.nombre_foto(7, jpeg)
    assert str(nombre).startswith("chat/perfiles/u7-") and nombre.suffix == ".jpg"


def test_ruta_foto_no_sale_de_su_carpeta(tmp_path: Path):
    carpeta = tmp_path / "chat" / "perfiles"
    carpeta.mkdir(parents=True)
    (carpeta / "u1-x.jpg").write_bytes(b"x")
    (tmp_path / "secreto.pdf").write_bytes(b"x")
    assert perfil.ruta_foto(tmp_path, "chat/perfiles/u1-x.jpg") == (carpeta / "u1-x.jpg").resolve()
    assert perfil.ruta_foto(tmp_path, "chat/perfiles/../../secreto.pdf") is None
    assert perfil.ruta_foto(tmp_path, "chat/perfiles/no-existe.jpg") is None
    assert perfil.ruta_foto(tmp_path, "") is None

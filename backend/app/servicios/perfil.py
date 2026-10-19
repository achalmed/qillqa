"""backend/app/servicios/perfil.py — el PERFIL de cada persona del equipo (2026-10-12).

Edison: «que los usuarios tengan un perfil donde puedan actualizar sus datos del sistema: DNI,
correo, su rol, su cargo, nombre, número, etc., como en Telegram o WhatsApp». La persona edita
lo suyo (`PUT /api/cuenta/perfil`); el ROL solo lo cambia un administrador desde el panel, y el
cargo que la persona elige tiene que ser uno de los de su mismo rol (así cambiar «Asistente» por
«Auxiliar» no le da ni le quita permisos).

Aquí vive lo puro —validar y normalizar los datos, decidir qué ve cada quien de una tarjeta— y
el tratamiento de la foto (recorte cuadrado, 512 px, JPEG). La API está en `api/perfil.py`.
Pruebas sin base de datos: tests/test_perfil.py.
"""
from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime
from pathlib import Path

from app.servicios import cuentas

# «Info» de WhatsApp: una sola línea.
MAX_ACERCA = 140
# La foto: lado del cuadrado, calidad y tope de lo que se acepta subir.
LADO_FOTO = 512
CALIDAD_FOTO = 85
MAX_FOTO_BYTES = 15 * 1024 * 1024
# Carpeta de las fotos, relativa a la raíz documental (junto a lo que se sube al chat).
CARPETA_FOTOS = Path("chat") / "perfiles"

_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


class DatoInvalido(ValueError):
    """Un dato del perfil no tiene el formato esperado; el mensaje se muestra tal cual."""


# --- datos ---------------------------------------------------------------------------------------


def limpiar_nombre(texto: str, que: str) -> str:
    limpio = " ".join((texto or "").split())
    if not limpio:
        raise DatoInvalido(f"Escriba sus {que}.")
    if len(limpio) > 80:
        raise DatoInvalido(f"Sus {que}: 80 caracteres como mucho.")
    return limpio


def validar_dni(dni: str) -> str:
    """8 dígitos, o vacío."""
    limpio = re.sub(r"\s+", "", dni or "")
    if limpio and not cuentas.dni_valido(limpio):
        raise DatoInvalido("El DNI tiene 8 dígitos.")
    return limpio


def validar_correo(correo: str) -> str:
    """Un correo con forma de correo (en minúsculas), o vacío."""
    limpio = (correo or "").strip().lower()
    if limpio and (len(limpio) > 120 or not _CORREO.match(limpio)):
        raise DatoInvalido("El correo no es válido (ejemplo: nombre@dominio.pe).")
    return limpio


def normalizar_celular(celular: str) -> str:
    """Celular peruano: 9 dígitos que empiezan por 9. Acepta «+51 987 654 321», «51987654321»,
    «987-654-321»… y devuelve «987654321»; vacío si viene vacío."""
    digitos = re.sub(r"\D", "", celular or "")
    if not digitos:
        return ""
    if len(digitos) == 11 and digitos.startswith("51"):
        digitos = digitos[2:]
    if len(digitos) != 9 or not digitos.startswith("9"):
        raise DatoInvalido("El celular tiene 9 dígitos y empieza con 9 (ejemplo: 987 654 321).")
    return digitos


def celular_legible(celular: str) -> str:
    """«987654321» → «987 654 321»."""
    c = celular or ""
    return f"{c[:3]} {c[3:6]} {c[6:]}" if len(c) == 9 else c


def enlace_whatsapp(celular: str) -> str:
    return f"https://wa.me/51{celular}" if celular else ""


def validar_acerca(acerca: str) -> str:
    """Una línea de 140 caracteres como mucho (los saltos se vuelven espacios)."""
    limpio = " ".join((acerca or "").split())
    if len(limpio) > MAX_ACERCA:
        raise DatoInvalido(f"«Info»: {MAX_ACERCA} caracteres como mucho.")
    return limpio


def cargos_permitidos(rol: str) -> list[str]:
    """Los cargos que la persona puede elegirse sin cambiar de rol (el rol lo cambia solo un
    administrador). Quien administra el sistema puede elegir cualquier cargo de la entidad: su rol
    no depende del cargo."""
    if rol == "administrador":
        return [c for c, r in cuentas.CARGOS.items() if r != "invitado"]
    return [c for c, r in cuentas.CARGOS.items() if r == rol]


def validar_cargo(cargo: str, rol: str) -> str:
    """El cargo tal como está en la lista; uno de otro rol se rechaza."""
    if not (cargo or "").strip():
        return ""
    normal = cuentas.normalizar_cargo(cargo)
    permitidos = cargos_permitidos(rol)
    if normal not in permitidos:
        raise DatoInvalido(
            f"Con su rol puede elegir: {', '.join(permitidos)}. Para otro cargo, pídalo a quien administra."
            if permitidos else "Su cargo lo asigna quien administra."
        )
    return normal


# --- datos al primer ingreso (2026-10-18) ----------------------------------------------------------
# Edison: «cuando una persona entra por primera vez, que el sistema le pida completar sus datos antes
# de seguir; al diputado no». Se configura en Administración (ajustes, clave `primer_ingreso`): si
# está en uso y qué CARGOS no lo pasan (de fábrica, «Diputado»: el titular, sin su nombre en el
# código). La marca es `usuarios.datos_completos_en`; la exige `seguridad.usuario_actual` con 428
# `datos_pendientes`, como la clave temporal: primero la contraseña, después los datos.

CLAVE_PRIMER_INGRESO = "primer_ingreso"
PRIMER_INGRESO_POR_OMISION = {"activo": True, "excluir_cargos": ["Diputado"]}
# Lo que se pide (columna del usuario → rótulo). El DNI y la «Info» quedan para Mi perfil.
DATOS_PEDIDOS = {"nombres": "nombres", "apellidos": "apellidos", "telefono": "celular", "email": "correo", "cargo": "cargo"}


def normalizar_primer_ingreso(datos: dict | None) -> dict:
    d = datos if isinstance(datos, dict) else {}
    excluir = []
    for c in d.get("excluir_cargos", PRIMER_INGRESO_POR_OMISION["excluir_cargos"]) or []:
        normal = cuentas.normalizar_cargo(str(c))
        if normal and normal not in excluir:
            excluir.append(normal)
    return {"activo": bool(d.get("activo", PRIMER_INGRESO_POR_OMISION["activo"])), "excluir_cargos": excluir}


def exceptuado(u, cfg: dict) -> bool:
    """El cargo de la cuenta (o el de su rol, en una cuenta antigua sin cargo) está exceptuado."""
    cargo = cuentas.normalizar_cargo(u.cargo or "") or cuentas.CARGO_POR_ROL.get(u.rol, "")
    return cargo in cfg["excluir_cargos"]


def pide_bienvenida(u, cfg: dict) -> bool:
    """¿Hay que pasar por el paso de bienvenida antes de usar el sistema?"""
    return bool(cfg["activo"]) and getattr(u, "datos_completos_en", None) is None and not exceptuado(u, cfg)


def datos_faltantes(u) -> list[str]:
    """Los rótulos de lo que falta para cerrar la bienvenida (en el orden del formulario)."""
    return [rotulo for campo, rotulo in DATOS_PEDIDOS.items() if not str(getattr(u, campo, "") or "").strip()]


# --- la tarjeta ----------------------------------------------------------------------------------


def version_foto(foto: str) -> str:
    """La «versión» de la foto: el nombre del archivo sin extensión (cambia con cada subida), para
    que el navegador pida la nueva sin esperar al caché."""
    return Path(foto).stem if foto else ""


def tarjeta(u, quien_mira, estado: str = "desconectado", visto: datetime | None = None) -> dict:
    """La tarjeta de contacto de `u` tal como la ve `quien_mira`.

    · La propia persona y quien administra: todo, DNI incluido.
    · El resto del equipo: todo menos el DNI.
    · Un invitado: nombre, cargo, rol, «Info», foto y presencia; sin correo ni celular.
    """
    propia = u.id == quien_mira.id
    admin = quien_mira.rol == "administrador"
    contacto = propia or admin or quien_mira.rol != "invitado"
    celular = getattr(u, "telefono", "") or ""
    datos = {
        "id": u.id,
        "nombre": u.nombre_completo or u.nombre_usuario,
        "nombres": u.nombres or "",
        "apellidos": u.apellidos or "",
        "cuenta": u.nombre_usuario,
        "cargo": u.cargo or cuentas.CARGO_POR_ROL.get(u.rol, ""),
        "rol": u.rol,
        "acerca": getattr(u, "acerca", "") or "",
        "foto": version_foto(getattr(u, "foto", "") or ""),
        "activo": bool(u.activo),
        "estado": estado,
        "ultima_actividad": visto.isoformat() if visto else None,
        "propia": propia,
        "con_contacto": contacto,
        "email": (u.email or "") if contacto else "",
        "celular": celular if contacto else "",
        "whatsapp": enlace_whatsapp(celular) if contacto else "",
        "puede_chatear": (not propia and quien_mira.rol != "invitado" and u.rol != "invitado" and bool(u.activo)),
    }
    if propia or admin:
        datos["dni"] = u.dni or ""
    return datos


# --- la foto -------------------------------------------------------------------------------------


def recortar_foto(contenido: bytes) -> bytes:
    """Cualquier imagen → JPEG cuadrado de LADO_FOTO px: gira según el EXIF (fotos del celular),
    recorta al centro y quita la transparencia sobre blanco. `DatoInvalido` si no es una imagen."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:  # fotos HEIC del iPhone, si pillow-heif está instalado (como en la Fototeca)
        from pillow_heif import register_heif_opener  # type: ignore

        register_heif_opener()
    except ImportError:
        pass
    try:
        imagen = Image.open(io.BytesIO(contenido))
        imagen.load()
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise DatoInvalido("El archivo no es una imagen (use JPG, PNG o WEBP).") from e
    imagen = ImageOps.exif_transpose(imagen)
    if imagen.mode in ("RGBA", "LA", "P"):
        imagen = imagen.convert("RGBA")
        fondo = Image.new("RGB", imagen.size, (255, 255, 255))
        fondo.paste(imagen, mask=imagen.split()[-1])
        imagen = fondo
    elif imagen.mode != "RGB":
        imagen = imagen.convert("RGB")
    lado = min(LADO_FOTO, imagen.width, imagen.height)
    cuadrada = ImageOps.fit(imagen, (lado, lado), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    salida = io.BytesIO()
    cuadrada.save(salida, format="JPEG", quality=CALIDAD_FOTO, optimize=True, progressive=True)
    return salida.getvalue()


def nombre_foto(usuario_id: int, jpeg: bytes) -> Path:
    """Ruta relativa (a la raíz documental) de la foto: `chat/perfiles/u<id>-<sha8>.jpg`."""
    return CARPETA_FOTOS / f"u{usuario_id}-{hashlib.sha256(jpeg).hexdigest()[:8]}.jpg"


def ruta_foto(raiz: Path, relativa: str) -> Path | None:
    """Ruta absoluta de una foto guardada, solo si está dentro de la carpeta de fotos y existe."""
    if not relativa:
        return None
    base = (raiz / CARPETA_FOTOS).resolve()
    ruta = (raiz / relativa).resolve()
    return ruta if base in ruta.parents and ruta.is_file() else None

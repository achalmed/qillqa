#!/usr/bin/env python3
"""scripts/openproject_cuentas.py — crea en OpenProject las cuentas del equipo a partir del SGDP (usuario, correo, cargo y rol) y de los nombres completos de los informes de representación; simula por defecto.

Cada cuenta nueva:
  · login = el usuario del SGDP y el MISMO correo: así la integración la vincula sola
    (servicios/openproject_sync.py) y los encargos del SGDP llegan con responsable;
  · nombre completo: el del SGDP o, si en un informe de representación (`responsables`
    de cada `expediente.yaml`) aparece la misma persona con más apellidos, ese;
  · rol de proyecto según el rol y el cargo del SGDP, y los proyectos que el perfil de
    OpenProject da a ese rol (`roles_proyectos`); nunca administradora;
  · una contraseña temporal PROPIA, que OpenProject obliga a cambiar en el primer ingreso.

No toca a quien ya tiene cuenta en OpenProject (por usuario, correo o nombre completo:
si el correo difiere, lo dice, para igualarlo y que se vincule). Salta a quien no tiene
correo en el SGDP y a los invitados.

Lo corre una PERSONA (crea cuentas y contraseñas: el asistente no lo hace). Las claves
temporales NO se muestran en pantalla: van a un archivo con permiso 600 que se entrega
a cada persona y luego se borra.

Uso:
  python3 scripts/openproject_cuentas.py             # simula: muestra a quién crearía y con qué rol
  python3 scripts/openproject_cuentas.py --aplicar   # crea las cuentas (pide confirmación)
Rutas: el .env del SGDP (base, ISR_RAIZ) y, por core/env.py (DESPACHO_DIR), `<despacho>/operaciones/openproject/.env`
(OPENPROJECT_PERFIL y OPENPROJECT_CONTENEDOR).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import secrets
import string
import subprocess
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]

# Rol del SGDP (y pistas del cargo) → rol de proyecto de OpenProject (seeds/14_roles.rb).
ROL_POR_ROL = {"diputado": "Diputado", "secretaria": "Asistente Administrativo", "asesor": "Asesor Legislativo", "administrador": "Asesor Legislativo"}
ROL_POR_CARGO = [
    (r"jefe|jefa", "Jefe de Despacho"),
    (r"prensa|comunicaci", "Prensa"),
    (r"enlace|t[eé]cnic|territori|distrital", "Enlace Distrital"),
    (r"secretari|asistente|auxiliar administrativ", "Asistente Administrativo"),
]
# Si el perfil no trae `roles_proyectos` (los de perfil.ejemplo/openproject.yml).
PROYECTOS_POR_ROL = {
    "Jefe de Despacho": "todos", "Diputado": "todos",
    "Asesor Legislativo": ["despacho", "legislativo", "cil", "coordinacion"],
    "Asistente Administrativo": ["despacho", "correspondencia", "documentos", "administracion", "coordinacion"],
    "Prensa": ["despacho", "prensa", "coordinacion"],
    "Enlace Distrital": ["despacho", "representacion", "coordinacion"],
    "Colaborador": ["despacho"],
}


# --- Puras (se prueban sin base ni contenedor) ----------------------------------


def normal(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", t)).strip()


def nombre_completo(sgdp_nombre: str, nombres_isr: list[str]) -> str:
    """El nombre más completo de la persona: el de un informe que contiene TODAS las
    palabras del nombre del SGDP (al menos dos), o el del SGDP."""
    propias = set(normal(sgdp_nombre).split())
    if len(propias) < 2:
        return sgdp_nombre.strip()
    candidatos = [n for n in nombres_isr if propias <= set(normal(n).split())]
    return max(candidatos, key=lambda n: len(n.split()), default=sgdp_nombre.strip())


def partir(nombre: str, nombres: str = "", apellidos: str = "") -> tuple[str, str]:
    """(nombres, apellidos). Con los dos campos del SGDP, esos; si no, los dos últimos
    términos son los apellidos (uso peruano: paterno y materno)."""
    if nombres.strip() and apellidos.strip() and len(nombre.split()) <= len(f"{nombres} {apellidos}".split()):
        return nombres.strip(), apellidos.strip()
    p = nombre.split()
    if len(p) <= 1:
        return nombre.strip(), "-"
    corte = len(p) - 2 if len(p) >= 3 else 1
    return " ".join(p[:corte]), " ".join(p[corte:])


def rol_op(rol_sgdp: str, cargo: str) -> str | None:
    if rol_sgdp == "invitado":
        return None
    for patron, rol in ROL_POR_CARGO:
        if re.search(patron, cargo or "", re.IGNORECASE) and rol_sgdp != "diputado":
            return rol
    return ROL_POR_ROL.get(rol_sgdp, "Colaborador")


def clave_temporal(largo: int = 14) -> str:
    """Mayúscula, minúscula, número y signo: cumple la política por defecto de OpenProject."""
    alfabeto = string.ascii_letters + string.digits + "-_.!?"
    while True:
        c = "".join(secrets.choice(alfabeto) for _ in range(largo))
        if any(x.islower() for x in c) and any(x.isupper() for x in c) and any(x.isdigit() for x in c) and any(x in "-_.!?" for x in c):
            return c


def ya_tiene(u: dict, op_usuarios: list[dict]) -> dict | None:
    """La cuenta de OpenProject de esta persona, si existe (usuario, correo o nombre)."""
    for o in op_usuarios:
        if o["login"].lower() == u["login"].lower() or (u["correo"] and o["mail"].lower() == u["correo"].lower()):
            return o
        if normal(f"{o['firstname']} {o['lastname']}") and normal(f"{o['firstname']} {o['lastname']}") in (normal(u["nombre_completo"]), normal(u["nombre_sgdp"])):
            return o
    return None


# --- Entorno ----------------------------------------------------------------------


def leer_env(ruta: Path) -> dict:
    datos = {}
    if ruta.is_file():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, _, v = linea.partition("=")
                v = v.split(" #")[0].strip()
                datos[k.strip()] = v[1:-1] if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'" else v
    return datos


def core_env():
    d = RAIZ
    while d != d.parent and not (d / "core" / "env.py").exists():
        d = d.parent
    spec = importlib.util.spec_from_file_location("core_env", d / "core" / "env.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def usuarios_sgdp(env: dict) -> list[dict]:
    sql = ("SELECT COALESCE(json_agg(u ORDER BY u.id), '[]') FROM (SELECT id, nombre_usuario, nombre_completo, nombres, apellidos, "
           "email, cargo, rol FROM usuarios WHERE activo) u")
    r = subprocess.run(["docker", "compose", "exec", "-T", "db", "psql", "-U", env["POSTGRES_USER"], "-d", env["POSTGRES_DB"], "-At", "-c", sql],
                       cwd=RAIZ, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"❌ No pude leer los usuarios del SGDP: {r.stderr.strip()[:200]}")
    return json.loads(r.stdout.strip() or "[]")


def nombres_isr(env: dict, despacho_dir: Path) -> list[str]:
    raiz = Path(env["ISR_RAIZ"]) if env.get("ISR_RAIZ") else (Path(env["MDD_DOCUMENTOS"]).parent / "representacion" if env.get("MDD_DOCUMENTOS") else despacho_dir / "representacion")
    salida: list[str] = []
    for f in sorted(raiz.glob("*/expediente.yaml")):
        if f.parent.name.startswith("_"):
            continue
        try:
            import yaml  # noqa: PLC0415
            d = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
            salida += [r["nombre"] for r in d.get("responsables") or [] if isinstance(r, dict) and r.get("nombre")]
        except ImportError:
            salida += re.findall(r"nombre:\s*['\"]?([^'\"\n]+)", f.read_text(encoding="utf-8"))
    return sorted(set(salida))


def roles_proyectos(op_env: dict) -> dict:
    ruta = op_env.get("OPENPROJECT_PERFIL", "")
    try:
        import yaml  # noqa: PLC0415
        return (yaml.safe_load(Path(ruta).read_text(encoding="utf-8")) or {}).get("roles_proyectos") or PROYECTOS_POR_ROL
    except (ImportError, OSError):
        return PROYECTOS_POR_ROL


def rails(contenedor: str, codigo: str, entorno: dict | None = None) -> str:
    extra = []
    for k in entorno or {}:
        extra += ["-e", k]
    r = subprocess.run(["docker", "exec", "-i", *extra, contenedor, "bash", "-lc", "cd /app && bundle exec rails runner -"],
                       input=codigo, capture_output=True, text=True, env={**os.environ, **(entorno or {})})
    if r.returncode:
        sys.exit(f"❌ OpenProject respondió con error: {r.stderr.strip()[-300:]}")
    return r.stdout


LISTAR = 'require "json"\nputs "OPU=" + User.where(type: "User").map { |u| {login: u.login, mail: u.mail.to_s, firstname: u.firstname.to_s, lastname: u.lastname.to_s} }.to_json\n'

CREAR = '''require "json"
cuentas = JSON.parse(ENV.fetch("OP_CUENTAS"))
rol_clase = defined?(ProjectRole) ? ProjectRole : Role
cuentas.each do |c|
  if User.where(login: c["login"]).or(User.where(mail: c["correo"])).exists?
    puts "RES=" + {login: c["login"], estado: "ya existía"}.to_json; next
  end
  u = User.new(login: c["login"], firstname: c["nombre"], lastname: c["apellido"], mail: c["correo"], language: "es", admin: false)
  u.password = c["clave"]; u.password_confirmation = c["clave"]
  u.force_password_change = true if u.respond_to?(:force_password_change=)
  u.status = User.statuses[:active]
  unless u.save
    puts "RES=" + {login: c["login"], estado: "error", error: u.errors.full_messages.join("; ")}.to_json; next
  end
  rol = rol_clase.find_by(name: c["rol"])
  proyectos = c["proyectos"] == "todos" ? Project.where(active: true) : Project.where(identifier: c["proyectos"])
  n = 0
  if rol
    proyectos.each do |p|
      m = Member.find_or_initialize_by(project_id: p.id, user_id: u.id)
      next unless m.new_record?
      m.roles = [rol]; m.save!; n += 1
    end
  end
  puts "RES=" + {login: c["login"], estado: "creada", membresias: n, rol: rol ? c["rol"] : "(rol no encontrado)"}.to_json
end
'''


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--aplicar", action="store_true", help="crea las cuentas (sin esto, simula)")
    args = ap.parse_args()
    cenv = core_env()
    env = leer_env(RAIZ / ".env")
    op_ops = Path(os.environ.get("OPENPROJECT_OPERACIONES") or Path(cenv.DESPACHO_DIR) / "operaciones" / "openproject")   # ola 8: sin enlace; antes se leía de la carpeta de tareas del vault
    op_env = leer_env(op_ops / ".env")
    contenedor = op_env.get("OPENPROJECT_CONTENEDOR") or "openproject"
    proyectos_rol = roles_proyectos(op_env)

    sgdp = usuarios_sgdp(env)
    isr = nombres_isr(env, Path(cenv.DESPACHO_DIR))
    op_usuarios = json.loads(next((l[4:] for l in rails(contenedor, LISTAR).splitlines() if l.startswith("OPU=")), "[]"))

    crear, informe = [], []
    for u in sgdp:
        login = u["nombre_usuario"]
        rol = rol_op(u.get("rol") or "", u.get("cargo") or "")
        completo = nombre_completo(u.get("nombre_completo") or "", isr)
        fila = {"login": login, "nombre_sgdp": u.get("nombre_completo") or "", "nombre_completo": completo, "correo": (u.get("email") or "").strip(), "rol": rol}
        if rol is None:
            informe.append((login, completo, "—", "se omite: cuenta de invitado"))
            continue
        existente = ya_tiene(fila, op_usuarios)
        if existente:
            nota = f"ya tiene cuenta: {existente['login']}"
            if fila["correo"] and existente["mail"].lower() != fila["correo"].lower():
                nota += f" (correo distinto: iguálelo en el SGDP o en OpenProject para vincularla)"
            informe.append((login, completo, "—", nota))
            continue
        if not fila["correo"]:
            informe.append((login, completo, rol, "se omite: sin correo en el SGDP (agréguelo en Administración)"))
            continue
        nombre, apellido = partir(completo, u.get("nombres") or "", u.get("apellidos") or "")
        proyectos = proyectos_rol.get(rol, ["despacho"])
        crear.append({**fila, "nombre": nombre, "apellido": apellido, "proyectos": proyectos})
        informe.append((login, f"{nombre} {apellido}", rol, f"se crea · {'todos los proyectos' if proyectos == 'todos' else ', '.join(proyectos)}"))

    print(f"Cuentas del SGDP: {len(sgdp)} · nombres completos de los informes: {len(isr)} · cuentas en OpenProject: {len(op_usuarios)}\n")
    ancho = max([len(f[1]) for f in informe] + [10])
    for login, nombre, rol, nota in informe:
        print(f"  {login:<16} {nombre:<{ancho}}  {rol:<26} {nota}")
    if not crear:
        print("\nNada que crear.")
        return
    if not args.aplicar:
        print(f"\nSimulación: se crearían {len(crear)} cuenta(s). Para crearlas: python3 scripts/openproject_cuentas.py --aplicar")
        return
    if input(f"\n¿Crear {len(crear)} cuenta(s) en OpenProject? [s/N] ").strip().lower() != "s":
        print("Cancelado.")
        return

    for c in crear:
        c["clave"] = clave_temporal()
    salida = rails(contenedor, CREAR, {"OP_CUENTAS": json.dumps(crear, ensure_ascii=False)})
    resultados = {r["login"]: r for r in (json.loads(l[4:]) for l in salida.splitlines() if l.startswith("RES="))}

    # Las claves temporales van a un archivo privado, nunca a la pantalla.
    estado = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state") / "sgdp"
    estado.mkdir(parents=True, exist_ok=True)
    os.chmod(estado, 0o700)
    archivo = estado / f"openproject_cuentas_{datetime.now():%Y%m%d-%H%M}.txt"
    url = op_env.get("OPENPROJECT_HOST_NAME", "")
    lineas = [f"Cuentas de OpenProject creadas el {datetime.now():%Y-%m-%d %H:%M}. Entrar en http://{url} con el usuario y la",
              "clave temporal; OpenProject pide cambiarla en el primer ingreso. Entregue a cada persona SOLO la suya",
              "y borre este archivo después.", ""]
    for c in crear:
        r = resultados.get(c["login"], {"estado": "sin respuesta"})
        if r.get("estado") == "creada":
            lineas.append(f"{c['nombre']} {c['apellido']}\tusuario: {c['login']}\tclave temporal: {c['clave']}")
        print(f"  {c['login']:<16} {r.get('estado')}" + (f" · {r.get('membresias', 0)} proyecto(s) como {r.get('rol')}" if r.get("estado") == "creada" else f" · {r.get('error', '')}"))
    fd = os.open(archivo, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lineas) + "\n")
    for c in crear:
        c.pop("clave", None)
    print(f"\n✅ Claves temporales en {archivo} (permiso 600; no se muestran aquí).")
    print("   La integración las vincula sola en menos de 2 minutos: SGDP → Administración → OpenProject.")


if __name__ == "__main__":
    main()

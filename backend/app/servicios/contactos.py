"""CONTACTOS del directorio (2026-10-13): importar y exportar como Google Contacts y el celular.

Edison (2026-10-12, con capturas de Google Contacts): el directorio «como Google Contacts y mucho
mejor todavía»; subir el `.vcf` que exporta el celular o el `.csv` de Google, ver los duplicados
antes de guardar (mismo celular, correo o nombre) y exportar a `.vcf`. Todo PURO: aquí no se toca
la base ni el disco (probado en tests/test_contactos.py). La API (api/directorio.py) lee el archivo,
cruza con las personas del directorio y guarda lo que la persona del equipo confirma.

Un contacto normalizado es un dict con: nombre, celular, telefono, email, email_alterno,
institucion (el texto de la organización), cargo, area, notas, etiquetas (lista) y favorito.

La misma detección de duplicados la usa la mesa de partes virtual para proponer al remitente
como contacto (api/mesa_virtual.py, `GET /entradas/{id}/contacto`): una sola regla.
"""

from __future__ import annotations

import csv
import io
import quopri
import re
import unicodedata

CAMPOS = ("nombre", "celular", "telefono", "email", "email_alterno", "institucion", "cargo", "area", "notas")
MAX_CONTACTOS = 3000
MAX_ETIQUETA = 40
# Etiquetas del sistema de Google que no son grupos de la persona.
ETIQUETAS_SISTEMA = {"mycontacts", "my contacts", "starred", "mis contactos", "destacados", "otros contactos", "other contacts"}


# --- textos ---------------------------------------------------------------------------------------


def plano(texto: str) -> str:
    """Sin tildes, en minúsculas y con un solo espacio: «  José  PÉREZ » → «jose perez»."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(t.lower().split())


def clave_nombre(nombre: str) -> str:
    """El nombre como conjunto de palabras ordenadas: «Pérez Quispe, Juan» y «Juan Pérez Quispe»
    dan la misma clave. Vacío si tiene una sola palabra (un nombre suelto no basta para decir que
    dos fichas son la misma persona)."""
    palabras = sorted(re.findall(r"[a-zñ0-9]+", plano(nombre)))
    return " ".join(palabras) if len(palabras) >= 2 else ""


def digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def clave_telefono(texto: str) -> str:
    """Para comparar números: los últimos 9 dígitos (así «+51 987 654 321», «0051987654321» y
    «987654321» son el mismo). Vacío si tiene menos de 6 dígitos."""
    d = digitos(texto)
    return d[-9:] if len(d) >= 6 else ""


def normalizar_celular(texto: str) -> str:
    """Un celular peruano queda como «987654321»; otro número, tal como vino pero limpio
    («+1 555 123 4567»). Vacío si no hay dígitos."""
    t = (texto or "").strip()
    d = digitos(t)
    if not d:
        return ""
    if d.startswith("0051"):
        d = d[2:]
    if len(d) == 11 and d.startswith("51") and d[2] == "9":
        d = d[2:]
    if len(d) == 9 and d.startswith("9"):
        return d
    return re.sub(r"[^\d+()\- ]", "", t).strip()[:40]


def es_celular_peruano(texto: str) -> bool:
    return bool(re.fullmatch(r"9\d{8}", normalizar_celular(texto)))


def limpiar_etiquetas(etiquetas) -> list[str]:
    """Sin repetidas (sin distinguir tildes ni mayúsculas), recortadas, sin las de sistema."""
    salida: list[str] = []
    vistas: set[str] = set()
    for e in etiquetas or []:
        t = re.sub(r"\s+", " ", str(e or "")).strip().lstrip("*").strip()[:MAX_ETIQUETA]
        k = plano(t)
        if t and k not in vistas and k not in ETIQUETAS_SISTEMA:
            vistas.add(k)
            salida.append(t)
    return salida


def contacto_vacio() -> dict:
    return {**{c: "" for c in CAMPOS}, "etiquetas": [], "favorito": False}


def _completar(c: dict) -> dict | None:
    """Ordena teléfonos y correos en sus campos y descarta lo que no tiene nombre ni contacto."""
    c["nombre"] = re.sub(r"\s+", " ", c.get("nombre") or "").strip()[:200]
    for k in ("cargo", "area", "institucion"):
        c[k] = re.sub(r"\s+", " ", c.get(k) or "").strip()[:200]
    c["notas"] = (c.get("notas") or "").strip()[:4000]
    c["etiquetas"] = limpiar_etiquetas(c.get("etiquetas"))
    if not c["nombre"]:
        c["nombre"] = c["institucion"] or c["email"] or c["celular"] or c["telefono"]
    if not c["nombre"]:
        return None
    return c


# --- vCard ----------------------------------------------------------------------------------------


def _desplegar(texto: str) -> list[str]:
    """Las líneas lógicas de un vCard: une las plegadas (empiezan con espacio o tabulación) y las
    de quoted-printable que terminan en «=» (vCard 2.1 de Android)."""
    lineas: list[str] = []
    for cruda in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if cruda[:1] in (" ", "\t") and lineas:
            lineas[-1] += cruda[1:]
        elif lineas and lineas[-1].endswith("=") and "QUOTED-PRINTABLE" in lineas[-1].split(":", 1)[0].upper():
            lineas[-1] = lineas[-1][:-1] + cruda
        else:
            lineas.append(cruda)
    return [x for x in lineas if x.strip()]


def _desescapar(v: str) -> str:
    return re.sub(r"\\([\\,;nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), v)


def _partir(v: str, sep: str) -> list[str]:
    """Parte por `sep` sin cortar los escapados (`\\;`)."""
    partes, actual, i = [], "", 0
    while i < len(v):
        ch = v[i]
        if ch == "\\" and i + 1 < len(v):
            actual += v[i:i + 2]
            i += 2
            continue
        if ch == sep:
            partes.append(actual)
            actual = ""
        else:
            actual += ch
        i += 1
    partes.append(actual)
    return partes


def _propiedad(linea: str) -> tuple[str, dict[str, list[str]], str] | None:
    if ":" not in linea:
        return None
    cabeza, valor = linea.split(":", 1)
    trozos = cabeza.split(";")
    nombre = trozos[0].split(".")[-1].upper()  # «item1.TEL» → TEL
    params: dict[str, list[str]] = {}
    for p in trozos[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params.setdefault(k.upper(), []).extend(x.strip('"').upper() for x in v.split(","))
        else:  # vCard 2.1: «TEL;CELL;PREF:…»
            params.setdefault("TYPE", []).append(p.upper())
    if "QUOTED-PRINTABLE" in params.get("ENCODING", []):
        juego = (params.get("CHARSET") or ["UTF-8"])[0]
        try:
            valor = quopri.decodestring(valor.encode("latin-1", "replace")).decode(juego.lower(), "replace")
        except LookupError:
            valor = quopri.decodestring(valor.encode("latin-1", "replace")).decode("utf-8", "replace")
    return nombre, params, valor


def leer_vcard(texto: str) -> list[dict]:
    """Los contactos de un `.vcf` (vCard 2.1, 3.0 o 4.0; Google, Android, iPhone, Outlook)."""
    contactos: list[dict] = []
    actual: dict | None = None
    telefonos: list[tuple[list[str], str]] = []
    correos: list[str] = []
    n_partes: list[str] = []
    for linea in _desplegar(texto):
        prop = _propiedad(linea)
        if prop is None:
            continue
        nombre, params, valor = prop
        if nombre == "BEGIN" and valor.strip().upper() == "VCARD":
            actual, telefonos, correos, n_partes = contacto_vacio(), [], [], []
            continue
        if actual is None:
            continue
        if nombre == "END":
            if not actual["nombre"] and n_partes:
                # N: Apellidos;Nombres;Otros;Prefijo;Sufijo → «Nombres Otros Apellidos».
                apellidos, nombres, otros = (n_partes + ["", "", ""])[:3]
                actual["nombre"] = " ".join(x for x in (nombres, otros, apellidos) if x.strip())
            _repartir_telefonos(actual, telefonos)
            if correos:
                actual["email"] = correos[0]
                actual["email_alterno"] = next((x for x in correos[1:] if x != correos[0]), "")
            c = _completar(actual)
            if c:
                contactos.append(c)
            actual = None
            if len(contactos) >= MAX_CONTACTOS:
                break
            continue
        if nombre == "FN":
            actual["nombre"] = _desescapar(valor)
        elif nombre == "N":
            n_partes = [_desescapar(x).strip() for x in _partir(valor, ";")]
        elif nombre == "TEL":
            telefonos.append((params.get("TYPE", []), _desescapar(valor).replace("tel:", "")))
        elif nombre == "EMAIL":
            v = _desescapar(valor).strip().lower()
            if v and v not in correos:
                correos.append(v)
        elif nombre == "ORG":
            partes = [_desescapar(x).strip() for x in _partir(valor, ";")]
            actual["institucion"] = partes[0] if partes else ""
            if len(partes) > 1 and partes[1]:
                actual["area"] = partes[1]
        elif nombre == "TITLE":
            actual["cargo"] = _desescapar(valor)
        elif nombre == "ROLE" and not actual["cargo"]:
            actual["cargo"] = _desescapar(valor)
        elif nombre == "NOTE":
            actual["notas"] = _desescapar(valor)
        elif nombre == "CATEGORIES":
            actual["etiquetas"] += [_desescapar(x) for x in _partir(valor, ",")]
        elif nombre == "X-STARRED" or (nombre == "X-ANDROID-CUSTOM" and "starred" in valor.lower()):
            actual["favorito"] = valor.strip().lower() in ("1", "true", "yes")
    return contactos


def _repartir_telefonos(c: dict, telefonos: list[tuple[list[str], str]]) -> None:
    """El primer celular (TYPE=CELL o un número peruano de 9 dígitos que empieza con 9) va a
    `celular`; el primer otro número, a `telefono`."""
    celular = telefono = ""
    for tipos, numero in telefonos:
        n = normalizar_celular(numero)
        if not n:
            continue
        movil = "CELL" in tipos or "MOBILE" in tipos or es_celular_peruano(n)
        if movil and not celular:
            celular = n
        elif not telefono and n != celular:
            telefono = n
    c["celular"], c["telefono"] = celular, telefono


# --- CSV (Google Contacts, Outlook) ---------------------------------------------------------------


def _col(fila: dict, *nombres: str) -> str:
    for n in nombres:
        v = fila.get(n)
        if v and str(v).strip():
            return str(v).strip()
    return ""


def _valores(texto: str) -> list[str]:
    """Google junta varios valores en una celda con « ::: »."""
    return [x.strip() for x in (texto or "").split(":::") if x.strip()]


def leer_csv(texto: str) -> list[dict]:
    """Los contactos del `.csv` de Google Contacts (formato nuevo y antiguo) o de Outlook."""
    muestra = texto[:4096]
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t")
    except csv.Error:
        dialecto = csv.excel
    lector = csv.DictReader(io.StringIO(texto), dialect=dialecto)
    lector.fieldnames = [(f or "").strip().lstrip("﻿") for f in (lector.fieldnames or [])]
    contactos: list[dict] = []
    for fila in lector:
        c = contacto_vacio()
        nombres = " ".join(x for x in (_col(fila, "First Name", "Given Name", "Nombre"), _col(fila, "Middle Name", "Additional Name", "Segundo nombre"),
                                       _col(fila, "Last Name", "Family Name", "Apellido", "Apellidos")) if x)
        c["nombre"] = _col(fila, "Name", "Nombre completo", "Display Name", "File As") or nombres
        c["institucion"] = _col(fila, "Organization Name", "Organization 1 - Name", "Company", "Empresa", "Organización")
        c["cargo"] = _col(fila, "Organization Title", "Organization 1 - Title", "Job Title", "Cargo", "Puesto")
        c["area"] = _col(fila, "Organization Department", "Organization 1 - Department", "Department", "Departamento")
        c["notas"] = _col(fila, "Notes", "Notas")
        # Teléfonos: «Phone 1 - Label/Type» + «Phone 1 - Value»; Outlook: «Mobile Phone», «Business Phone».
        telefonos: list[tuple[list[str], str]] = []
        correos: list[str] = []
        for k in range(1, 10):
            tipo = _col(fila, f"Phone {k} - Label", f"Phone {k} - Type").upper()
            for v in _valores(_col(fila, f"Phone {k} - Value")):
                telefonos.append((["CELL"] if "MOBILE" in tipo or "CELL" in tipo or "MÓVIL" in tipo or "MOVIL" in tipo else [tipo], v))
            for v in _valores(_col(fila, f"E-mail {k} - Value")):
                if v.lower() not in correos:
                    correos.append(v.lower())
        for clave, tipo in (("Mobile Phone", "CELL"), ("Celular", "CELL"), ("Business Phone", "WORK"), ("Home Phone", "HOME"),
                            ("Primary Phone", "VOICE"), ("Teléfono", "VOICE"), ("Phone", "VOICE")):
            if (v := _col(fila, clave)):
                telefonos.append(([tipo], v))
        for clave in ("E-mail Address", "E-mail 2 Address", "Email", "Correo", "Correo electrónico"):
            if (v := _col(fila, clave).lower()) and v not in correos:
                correos.append(v)
        _repartir_telefonos(c, telefonos)
        if correos:
            c["email"] = correos[0]
            c["email_alterno"] = correos[1] if len(correos) > 1 else ""
        grupos = _valores(_col(fila, "Labels", "Group Membership", "Categories", "Etiquetas"))
        c["favorito"] = any(plano(g).lstrip("* ") == "starred" for g in grupos)
        c["etiquetas"] = grupos
        hecho = _completar(c)
        if hecho:
            contactos.append(hecho)
        if len(contactos) >= MAX_CONTACTOS:
            break
    return contactos


def decodificar(contenido: bytes) -> str:
    for juego in ("utf-8-sig", "utf-16") if contenido[:2] in (b"\xff\xfe", b"\xfe\xff") else ("utf-8-sig",):
        try:
            return contenido.decode(juego)
        except UnicodeDecodeError:
            pass
    return contenido.decode("latin-1")


def leer_archivo(nombre: str, contenido: bytes) -> list[dict]:
    """Lee un `.vcf` o un `.csv` por su contenido (el nombre solo desempata). `ValueError` si no es
    ninguno de los dos o no trae contactos."""
    texto = decodificar(contenido)
    if "BEGIN:VCARD" in texto[:20000].upper():
        contactos = leer_vcard(texto)
    elif (nombre or "").lower().endswith((".csv", ".txt")) or "," in texto.split("\n", 1)[0] or ";" in texto.split("\n", 1)[0]:
        contactos = leer_csv(texto)
    else:
        raise ValueError("El archivo no es un .vcf ni un .csv de contactos.")
    if not contactos:
        raise ValueError("El archivo no trae contactos con nombre, celular o correo.")
    return contactos


# --- duplicados -----------------------------------------------------------------------------------


def _claves(p: dict) -> dict[str, set[str]]:
    return {
        "celular": {k for k in (clave_telefono(p.get("celular", "")), clave_telefono(p.get("telefono", ""))) if k},
        "correo": {x for x in (plano(p.get("email", "")), plano(p.get("email_alterno", ""))) if x},
        "nombre": {k for k in (clave_nombre(p.get("nombre", "")),) if k},
    }


MOTIVO = {"celular": "mismo celular", "correo": "mismo correo", "nombre": "mismo nombre"}


class Indice:
    """Índice de las personas del directorio para hallar duplicados al importar o al proponer el
    remitente de la mesa virtual. Orden de la prueba: celular, correo, nombre."""

    def __init__(self, personas: list[dict]):
        self.por: dict[str, dict[str, int]] = {"celular": {}, "correo": {}, "nombre": {}}
        self.personas = {p["id"]: p for p in personas}
        for p in personas:
            for tipo, claves in _claves(p).items():
                for k in claves:
                    self.por[tipo].setdefault(k, p["id"])

    def buscar(self, contacto: dict) -> tuple[int, str] | None:
        claves = _claves(contacto)
        for tipo in ("celular", "correo", "nombre"):
            for k in claves[tipo]:
                if k in self.por[tipo]:
                    return self.por[tipo][k], tipo
        return None

    def agregar(self, contacto: dict, ref: int) -> None:
        for tipo, claves in _claves(contacto).items():
            for k in claves:
                self.por[tipo].setdefault(k, ref)


def previa(contactos: list[dict], personas: list[dict]) -> list[dict]:
    """Cada contacto con su duplicado en el directorio (`duplicado`: id, nombre y motivo) o,
    si no, con el contacto anterior del MISMO archivo que repite (`repetido_de`: su número de
    fila). La acción propuesta: fusionar con el duplicado, omitir el repetido, crear lo nuevo."""
    directorio = Indice(personas)
    archivo = Indice([])
    salida = []
    for i, c in enumerate(contactos):
        item = {**c, "fila": i, "duplicado": None, "repetido_de": None}
        hallado = directorio.buscar(c)
        if hallado:
            pid, motivo = hallado
            p = directorio.personas[pid]
            item["duplicado"] = {"persona_id": pid, "nombre": p.get("nombre", ""), "cargo": p.get("cargo", ""), "motivo": MOTIVO[motivo]}
            item["accion"] = "fusionar"
        elif (rep := archivo.buscar(c)):
            item["repetido_de"] = rep[0]
            item["motivo"] = MOTIVO[rep[1]]
            item["accion"] = "omitir"
        else:
            item["accion"] = "crear"
        archivo.agregar(c, i)
        salida.append(item)
    return salida


def fusionar(persona: dict, contacto: dict, protegidos: set[str] = frozenset()) -> dict:
    """Los cambios que el contacto aporta a una persona ya registrada: SOLO rellena lo vacío
    (nunca pisa un dato), pone el segundo correo o número en su campo alterno, suma etiquetas y
    añade la nota si no estaba. `protegidos`: campos que no se tocan (los que dicta una cuenta)."""
    cambios: dict = {}

    def poner(campo: str, valor: str) -> None:
        if valor and campo not in protegidos and not (persona.get(campo) or "").strip() and campo not in cambios:
            cambios[campo] = valor

    for campo in ("cargo", "area", "telefono"):
        poner(campo, contacto.get(campo, ""))
    # Celular: si ya tiene otro, el nuevo va a teléfono (si está libre).
    cel = contacto.get("celular", "")
    if cel:
        if not (persona.get("celular") or "").strip():
            poner("celular", cel)
        elif clave_telefono(cel) != clave_telefono(persona.get("celular", "")) and clave_telefono(cel) != clave_telefono(persona.get("telefono", "")):
            poner("telefono", cel)
    # Correos: el que no tenga, en el primero libre.
    tiene = {plano(persona.get("email", "")), plano(persona.get("email_alterno", ""))}
    for correo in (contacto.get("email", ""), contacto.get("email_alterno", "")):
        if correo and plano(correo) not in tiene:
            if not (persona.get("email") or "").strip() and "email" not in cambios:
                poner("email", correo)
            else:
                poner("email_alterno", correo)
            tiene.add(plano(correo))
    nota = (contacto.get("notas") or "").strip()
    if nota and "notas" not in protegidos and plano(nota) not in plano(persona.get("notas", "")):
        previas = (persona.get("notas") or "").strip()
        cambios["notas"] = f"{previas}\n{nota}" if previas else nota
    etiquetas = limpiar_etiquetas([*(persona.get("etiquetas") or []), *(contacto.get("etiquetas") or [])])
    if [plano(e) for e in etiquetas] != [plano(e) for e in (persona.get("etiquetas") or [])]:
        cambios["etiquetas"] = etiquetas
    return cambios


def institucion_por_nombre(texto: str, instituciones: list[dict]) -> dict | None:
    """La institución del directorio cuyo nombre o siglas es exactamente ese texto (sin tildes ni
    mayúsculas). Si hay varias con el mismo nombre, no se adivina."""
    t = plano(texto)
    if not t:
        return None
    hallados = [i for i in instituciones if t in (plano(i.get("nombre", "")), plano(i.get("siglas", "")))]
    activos = [i for i in hallados if i.get("activo", True)] or hallados
    return activos[0] if len(activos) == 1 else None


# --- exportar a vCard 3.0 -------------------------------------------------------------------------


def _escapar(v: str) -> str:
    return (v or "").replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _plegar(linea: str) -> str:
    """Líneas de 75 octetos como mucho (RFC 6350 §3.2), sin cortar un carácter UTF-8."""
    salida, actual, largo = [], "", 0
    for ch in linea:
        n = len(ch.encode("utf-8"))
        if largo + n > (75 if not salida else 74):
            salida.append(actual)
            actual, largo = "", 0
        actual += ch
        largo += n
    salida.append(actual)
    return "\r\n ".join(salida)


def _tel_internacional(numero: str) -> str:
    n = normalizar_celular(numero)
    return f"+51{n}" if re.fullmatch(r"9\d{8}", n) else n


def a_vcard(personas: list[dict]) -> str:
    """Las personas (con `institucion_nombre`) como un `.vcf` que importan Google Contacts, Android
    e iPhone. Persona: nombre, cargo, institucion_nombre, area, celular, telefono, anexo, email,
    email_alterno, oficina, notas, etiquetas."""
    tarjetas = []
    for p in personas:
        nombre = (p.get("nombre") or "").strip()
        if not nombre:
            continue
        lineas = ["BEGIN:VCARD", "VERSION:3.0", f"FN:{_escapar(nombre)}", f"N:;{_escapar(nombre)};;;"]
        if p.get("institucion_nombre") or p.get("area"):
            lineas.append(f"ORG:{_escapar(p.get('institucion_nombre', ''))}" + (f";{_escapar(p['area'])}" if p.get("area") else ""))
        if p.get("cargo"):
            lineas.append(f"TITLE:{_escapar(p['cargo'])}")
        if p.get("celular"):
            lineas.append(f"TEL;TYPE=CELL:{_tel_internacional(p['celular'])}")
        if p.get("telefono"):
            fijo = p["telefono"] + (f" anexo {p['anexo']}" if p.get("anexo") else "")
            lineas.append(f"TEL;TYPE=WORK:{_escapar(fijo)}")
        elif p.get("anexo"):
            lineas.append(f"TEL;TYPE=WORK:{_escapar('anexo ' + p['anexo'])}")
        if p.get("email"):
            lineas.append(f"EMAIL;TYPE=WORK:{_escapar(p['email'])}")
        if p.get("email_alterno"):
            lineas.append(f"EMAIL;TYPE=HOME:{_escapar(p['email_alterno'])}")
        if p.get("oficina"):
            lineas.append(f"ADR;TYPE=WORK:;;{_escapar(p['oficina'])};;;;")
        if p.get("etiquetas"):
            lineas.append("CATEGORIES:" + ",".join(_escapar(e) for e in p["etiquetas"]))
        if p.get("notas"):
            lineas.append(f"NOTE:{_escapar(p['notas'])}")
        lineas.append("END:VCARD")
        tarjetas.append("\r\n".join(_plegar(x) for x in lineas))
    return "\r\n".join(tarjetas) + ("\r\n" if tarjetas else "")


# --- el remitente de la mesa de partes virtual como contacto --------------------------------------

ETIQUETA_MESA = "Mesa de Partes"


def propuesta_remitente(r: dict) -> dict:
    """Lo que la mesa virtual propone llevar al directorio del remitente de un trámite (Edison
    2026-10-12: «eso de datos personales podemos usarlo para el directorio, para tener contacto»).
    Solo lo necesario para el contacto: nombre, cargo, celular y correo de la persona; razón social,
    RUC, correo, teléfono y dirección de la entidad. El documento de identidad de una persona no
    pasa al directorio (Ley 29733: lo mínimo para la finalidad)."""
    celular = normalizar_celular(r.get("telefono", ""))
    correo = (r.get("correo") or "").strip().lower()
    if r.get("tipo_persona") == "juridica":
        institucion = {"nombre": (r.get("nombre") or "").strip(), "ruc": digitos(r.get("doc_numero", "")), "email": correo,
                       "telefono": celular, "direccion": (r.get("direccion") or "").strip()}
        persona = None
        if (r.get("representante") or "").strip():
            persona = {"nombre": r["representante"].strip(), "cargo": (r.get("cargo") or "").strip(), "celular": celular, "email": correo,
                       "etiquetas": [ETIQUETA_MESA]}
        return {"persona": persona, "institucion": institucion}
    return {"persona": {"nombre": (r.get("nombre") or "").strip(), "cargo": "", "celular": celular, "email": correo,
                        "etiquetas": [ETIQUETA_MESA]}, "institucion": None}

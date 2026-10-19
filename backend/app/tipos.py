"""Registro de tipos documentales.

Cada tipo declara: su serie de numeración, la CLASE LaTeX del framework
que usa, el tipodoc que va en metadata.tex y el ESQUEMA de su formulario
(los campos que el frontend pinta). Añadir un tipo que reuse una clase
existente es solo agregar una entrada aquí — sin tocar el generador.

(Un tipo con una clase LaTeX nueva requiere además crearla en el
framework y un constructor de maestro en latex/generador.py.)
"""

from app.config import config   # siglas y nombres de la bancada vienen del .env (P317)

# Tipos de campo que entiende el formulario del frontend:
#   texto | area | select | fecha
_TRATAMIENTOS = ["Señor:", "Señora:", "Señorita:", "Señores:", "Señoras:"]

# `destinatario_tratamiento` va como 'oculto' (no se pinta suelto) pero
# CONSERVA sus opciones: el componente de destinatarios lo dibuja INLINE,
# delante del nombre, que es donde se lee «Señor: Fulano» (Edison
# 2026-09-05: «el tratamiento debe ir junto al nombre del destinatario»).
# `seccion: "anexos"` saca la línea «Adj.» del bloque de datos y la lleva a
# la sección de anexos, junto a los cuadros/tablas, para que todo lo que es
# «anexo» viva en un solo lugar (antes eran los numerales 4 y 9 del índice).
_CAMPOS_OFICIO = [
    {"clave": "destinatario_tratamiento", "etiqueta": "Tratamiento",
     "tipo": "oculto", "opciones": _TRATAMIENTOS},
    # "destinatarios": filas Nombre + Cargo (cargo opcional) con botón
    # «Agregar destinatario». UNA fila -> oficio normal (nombre + cargo en
    # su campo); VARIAS -> el generador apila «Nombre — Cargo» (bloques,
    # formato de la casa) o lista si son cargos/oficinas.
    {"clave": "destinatario_nombre", "etiqueta": "Destinatario(s)",
     "tipo": "destinatarios"},
    {"clave": "destinatario_cargo", "etiqueta": "Cargo del destinatario",
     "tipo": "oculto", "opcional": True},
    # Institución o entidad del destinatario: cuarta línea del bloque, bajo el
    # cargo. Es una PARTE del oficio, no un adorno: sin ella la entidad acaba
    # escrita dentro del cargo o del nombre (2026-09-23, oficio al TACUNE).
    {"clave": "destinatario_institucion",
     "etiqueta": "Institución o entidad del destinatario",
     "tipo": "texto", "opcional": True},
    {"clave": "asunto", "etiqueta": "Asunto", "tipo": "area"},
    {"clave": "referencia", "etiqueta": "Referencia (leyes, oficios previos…)",
     "tipo": "referencias", "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha", "tipo": "fecha", "ancho": "corto"},
    # La línea «Adj.» del pie ya NO se escribe: se arma sola con los nombres
    # de los documentos adjuntos al compilar (servicios/compilacion.py;
    # Edison 2026-09-05: «la línea Adj. en realidad es el nombre del archivo
    # adjunto»). El campo queda oculto por compatibilidad con lo guardado.
    {"clave": "anexo", "etiqueta": "Línea «Adj.» al pie",
     "tipo": "oculto", "opcional": True, "seccion": "anexos"},
    {"clave": "con_copia", "etiqueta": "Con copia (c.c.)",
     "tipo": "copias", "opcional": True},
    # Iniciales de responsabilidad («ABC/xyz»): quien firma / quien redacta.
    # Última línea del pie; parte del oficio administrativo (2026-09-23).
    {"clave": "iniciales", "etiqueta": "Iniciales de responsabilidad (p. ej. ABC/xyz)",
     "tipo": "texto", "opcional": True, "ancho": "corto"},
]

# Oficio múltiple: VARIOS destinatarios con el componente de filas
# «Agregar destinatario» (nombre + cargo opcional). Filas SIN cargo (son
# cargos/oficinas, p. ej. las UGEL) -> lista `enumerate` (formato OM-0011);
# filas CON cargo (personas) -> bloques apilados nombre/cargo debajo.
_CAMPOS_OFICIO_MULTIPLE = [
    {"clave": "destinatario_tratamiento", "etiqueta": "Tratamiento",
     "tipo": "oculto", "opciones": _TRATAMIENTOS},
    {"clave": "destinatario_nombre", "etiqueta": "Destinatarios",
     "tipo": "destinatarios"},
    {"clave": "destinatario_cargo", "etiqueta": "Cargo",
     "tipo": "oculto", "opcional": True},
    {"clave": "asunto", "etiqueta": "Asunto", "tipo": "area"},
    {"clave": "referencia", "etiqueta": "Referencia (leyes, oficios previos…)",
     "tipo": "referencias", "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha", "tipo": "fecha", "ancho": "corto"},
    # La línea «Adj.» del pie ya NO se escribe: se arma sola con los nombres
    # de los documentos adjuntos al compilar (servicios/compilacion.py;
    # Edison 2026-09-05: «la línea Adj. en realidad es el nombre del archivo
    # adjunto»). El campo queda oculto por compatibilidad con lo guardado.
    {"clave": "anexo", "etiqueta": "Línea «Adj.» al pie",
     "tipo": "oculto", "opcional": True, "seccion": "anexos"},
    {"clave": "con_copia", "etiqueta": "Con copia (c.c.)",
     "tipo": "copias", "opcional": True},
]

_CAMPOS_MEMO = [
    {"clave": "para", "etiqueta": "Para", "tipo": "texto"},
    {"clave": "de", "etiqueta": "De", "tipo": "texto"},
    {"clave": "asunto", "etiqueta": "Asunto", "tipo": "area"},
    {"clave": "referencia", "etiqueta": "Referencia (documento que se responde)",
     "tipo": "texto", "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha", "tipo": "fecha", "ancho": "corto"},
    # Campos normativos del pie, compartidos con el oficio (Adj. / c.c.).
    # La línea «Adj.» del pie ya NO se escribe: se arma sola con los nombres
    # de los documentos adjuntos al compilar (servicios/compilacion.py;
    # Edison 2026-09-05: «la línea Adj. en realidad es el nombre del archivo
    # adjunto»). El campo queda oculto por compatibilidad con lo guardado.
    {"clave": "anexo", "etiqueta": "Línea «Adj.» al pie",
     "tipo": "oculto", "opcional": True, "seccion": "anexos"},
    {"clave": "con_copia", "etiqueta": "Con copia (c.c.)",
     "tipo": "copias", "opcional": True},
]

# Solicitud formal (norma administrativa peruana): sumilla SOLICITO:,
# destinatario en mayúsculas, cuerpo libre, firma sin antefirma.
_CAMPOS_SOLICITUD = [
    {"clave": "sumilla_solicito", "etiqueta": "Sumilla (empiece con SOLICITO:)",
     "tipo": "area"},
    {"clave": "destinatario_cargo",
     "etiqueta": "Destinatario (tratamiento y cargo)", "tipo": "texto"},
    {"clave": "destinatario_institucion", "etiqueta": "Institución",
     "tipo": "texto", "opcional": True},
    {"clave": "destinatario_lugar", "etiqueta": "Dependencia (S.D. / PRESENTE)",
     "tipo": "texto", "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha", "tipo": "fecha", "ancho": "corto"},
    # La línea «Adj.» del pie ya NO se escribe: se arma sola con los nombres
    # de los documentos adjuntos al compilar (servicios/compilacion.py;
    # Edison 2026-09-05: «la línea Adj. en realidad es el nombre del archivo
    # adjunto»). El campo queda oculto por compatibilidad con lo guardado.
    {"clave": "anexo", "etiqueta": "Línea «Adj.» al pie",
     "tipo": "oculto", "opcional": True, "seccion": "anexos"},
    {"clave": "con_copia", "etiqueta": "Con copia (c.c.)",
     "tipo": "copias", "opcional": True},
]

# Acta de sesión (órganos deliberantes): título + clase + órgano, cuerpo
# con estaciones (encabezados → \estacion) y doble firma.
_CAMPOS_ACTA = [
    {"clave": "clase_sesion", "etiqueta": "Clase de sesión", "tipo": "select",
     "opciones": ["Ordinaria", "Extraordinaria"], "ancho": "corto"},
    {"clave": "organo", "etiqueta": "Órgano deliberante", "tipo": "texto"},
    {"clave": "presidente_nombre", "etiqueta": "Presidente (nombre)",
     "tipo": "texto"},
    {"clave": "presidente_cargo", "etiqueta": "Presidente (cargo)",
     "tipo": "texto", "opcional": True},
    {"clave": "secretario_nombre", "etiqueta": "Secretario (nombre)",
     "tipo": "texto"},
    {"clave": "secretario_cargo", "etiqueta": "Secretario (cargo)",
     "tipo": "texto", "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha de la sesión", "tipo": "fecha",
     "ancho": "corto"},
]

# Informe de Semana de Representación (M10 D5, 2026-09-15). El PDF lo produce el
# generador del marco documental (generadores/informe-sr) a partir del expediente
# de la semana (despacho/representacion/AAAA-MM_SR-NN_slug/); Qillqa lo NUMERA
# (serie ISR), lo REGISTRA y lo ENTREGA a Oficialía Mayor: el PDF aprobado entra
# por «incorporar» (servicios/incorporacion.py), nunca por compilar (externo).
_CAMPOS_INFORME_SR = [
    {"clave": "asunto", "etiqueta": "Título del informe", "tipo": "area"},
    {"clave": "expediente_sr", "etiqueta": "Expediente de la semana (SR-NN)",
     "tipo": "texto", "ancho": "corto"},
    {"clave": "periodo_sr", "etiqueta": "Periodo (del … al …)", "tipo": "texto"},
    {"clave": "ambito", "etiqueta": "Ámbito (provincias y distritos)", "tipo": "texto",
     "opcional": True},
    {"clave": "destinatario_nombre", "etiqueta": "Se entrega a", "tipo": "texto",
     "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha", "tipo": "fecha", "ancho": "corto"},
]

# Documento RECIBIDO (M10 D5): lo que llega a la entidad por mesa de partes, correo
# institucional, STD o entrega en mano. Sustituye a la carpeta de expedientes de
# correo (la antigua 06_gestion_correo, disuelta en M10 D4): un documento recibido es un registro con serie de
# ENTRADA (REC), su escaneo entra por «incorporar» y las respuestas se enlazan por
# documento_relaciones. Externo: Qillqa no lo compila.
_CAMPOS_RECIBIDO = [
    {"clave": "remitente_nombre", "etiqueta": "Remitente", "tipo": "texto"},
    {"clave": "remitente_cargo", "etiqueta": "Cargo del remitente", "tipo": "texto",
     "opcional": True},
    {"clave": "institucion", "etiqueta": "Institución de origen", "tipo": "texto"},
    {"clave": "documento_origen", "etiqueta": "Documento de origen (tipo y número)",
     "tipo": "texto"},
    {"clave": "asunto", "etiqueta": "Asunto", "tipo": "area"},
    {"clave": "via", "etiqueta": "Vía de recepción", "tipo": "select",
     "opciones": ["Mesa de partes", "Correo institucional", "STD", "En mano", "Otra"]},
    {"clave": "fecha_documento", "etiqueta": "Fecha del documento", "tipo": "fecha",
     "ancho": "corto", "opcional": True},
    {"clave": "fecha", "etiqueta": "Fecha de recepción", "tipo": "fecha", "ancho": "corto"},
    {"clave": "plazo", "etiqueta": "Plazo de atención", "tipo": "fecha", "ancho": "corto",
     "opcional": True},
]

TIPOS: dict[str, dict] = {
    "oficio": {
        "codigo": "oficio",
        "nombre": "Oficio",
        "serie": "OF",
        "clase": "oficio",
        "carpeta": "oficios",
        "tipodoc": "Oficio",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_OFICIO,
    },
    "oficio_multiple": {
        "codigo": "oficio_multiple",
        "nombre": "Oficio múltiple",
        "serie": "OM",
        "clase": "oficio",
        "carpeta": "oficios",
        "tipodoc": "Oficio Múltiple",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_OFICIO_MULTIPLE,
    },
    # Oficio múltiple de la BANCADA REGIONAL (espacio de coordinación
    # parlamentaria multipartidario y bicameral). Identidad PROPIA de
    # serie declarada aquí y consumida por numero_completo()/
    # generar_metadata(): siglas «BANCADA REGIONAL-CR», número de 3
    # dígitos con «N.° » y «/» ante las siglas (impreso: «OFICIO MÚLTIPLE
    # N.° 001-2026-2027/BANCADA REGIONAL-CR»); la caja del membrete dice
    # «BANCADA REGIONAL» sin línea de cargo (metadata_extra) y NO se
    # normalizan mayúsculas (destinatarios/asunto van en MAYÚSCULAS y
    # negrita a propósito). Las firmas son escaneos de los parlamentarios
    # de la bancada -> hand-LaTeX + origen 'framework' tras generar
    # (§5/§7 del CLAUDE.md). Primer uso: invitación al I Encuentro
    # Regional con las organizaciones populares (pedido Edison 2026-08-23).
    "oficio_multiple_bancada": {
        "codigo": "oficio_multiple_bancada",
        "nombre": f"Oficio múltiple — {config.nombre_bancada}",
        "serie": "OMB",
        "clase": "oficio",
        "carpeta": "bancada",
        "tipodoc": "Oficio Múltiple",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_OFICIO_MULTIPLE,
        "siglas": config.siglas_bancada,
        "numero_prefijo": "N.° ",
        "numero_digitos": 3,
        "sep_siglas": "/",
        "metadata_extra": {"autor": config.nombre_bancada, "cargo": ""},
        "normalizar": False,
    },
    # Oficio SIMPLE de la BANCADA REGIONAL: gemelo del oficio_multiple_bancada
    # pero con serie PROPIA («OB») y tipodoc «Oficio» (no «Múltiple»), para los
    # oficios de la bancada dirigidos a UN solo destinatario. Su contador es
    # INDEPENDIENTE del de los múltiples (la numeración se lleva por `serie` en
    # `contadores`), así el simple arranca en «N.° 001» sin chocar con el OMB.
    # Misma identidad visual de bancada (siglas «BANCADA REGIONAL-CR», «N.° »
    # de 3 dígitos, «/» ante las siglas -> «OFICIO N.° 001-2026-2027/BANCADA
    # REGIONAL-CR», caja del membrete «BANCADA REGIONAL» sin cargo, sin
    # normalizar) y misma personalización A MANO + origen 'framework' tras
    # generar (§5/§7). Distinción pedida por Edison 2026-08-24: el oficio
    # simple de bancada numera aparte del oficio múltiple.
    "oficio_bancada": {
        "codigo": "oficio_bancada",
        "nombre": f"Oficio — {config.nombre_bancada}",
        "serie": "OB",
        "clase": "oficio",
        "carpeta": "bancada",
        "tipodoc": "Oficio",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_OFICIO,
        "siglas": config.siglas_bancada,
        "numero_prefijo": "N.° ",
        "numero_digitos": 3,
        "sep_siglas": "/",
        "metadata_extra": {"autor": config.nombre_bancada, "cargo": ""},
        "normalizar": False,
    },
    # La carta reusa la clase LaTeX del oficio (como el oficio múltiple):
    # mismo formato de destinatario/asunto/cuerpo/firma, cambia el tipodoc.
    # Primer uso: confirmación de pasajes a LATAM (pedido Edison 2026-08-21).
    "carta": {
        "codigo": "carta",
        "nombre": "Carta",
        "serie": "CARTA",
        "clase": "oficio",
        "carpeta": "cartas",
        "tipodoc": "Carta",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_OFICIO,
    },
    "memorando": {
        "codigo": "memorando",
        "nombre": "Memorando",
        "serie": "MEM",
        "clase": "memorando",
        "carpeta": "memorandos",
        "tipodoc": "Memorando",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_MEMO,
        # El memorando de asignación de viáticos y pasajes va SIEMPRE en una hoja (Edison
        # 2026-10-18): si el asunto casa con esta expresión, servicios/compilacion.py aprieta el
        # formato hasta que quepa, aunque la firma no haya quedado sola.
        "una_hoja": r"vi[áa]tico|pasaje",
    },
    "informe": {
        "codigo": "informe",
        "nombre": "Informe",
        "serie": "INF",
        "clase": "informe",
        "carpeta": "informes",
        "tipodoc": "Informe",
        # El informe organiza su cuerpo en secciones (\seccion).
        "cuerpo_con_secciones": True,
        "campos": _CAMPOS_MEMO,
    },
    "solicitud": {
        "codigo": "solicitud",
        "nombre": "Solicitud",
        "serie": "SOL",
        "clase": "solicitud",
        "carpeta": "solicitudes",
        "tipodoc": "Solicitud",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_SOLICITUD,
    },
    "acta": {
        "codigo": "acta",
        "nombre": "Acta de sesión",
        "serie": "ACT",
        "clase": "acta",
        "carpeta": "actas",
        "tipodoc": "Acta de Sesión",
        # El acta organiza su cuerpo en estaciones (encabezados).
        "cuerpo_con_secciones": True,
        "campos": _CAMPOS_ACTA,
    },
    # --- Series propias de la entidad (M10 D5): el PDF se produce fuera y entra por «incorporar» ---
    "informe_sr": {
        "codigo": "informe_sr",
        "nombre": "Informe de Semana de Representación",
        "serie": "ISR",
        "clase": "informe-sr",
        "carpeta": "isr",
        "tipodoc": "Informe de Semana de Representación",
        "cuerpo_con_secciones": True,
        "campos": _CAMPOS_INFORME_SR,
        "externo": True,
        "numero_digitos": 2,
    },
    "recibido": {
        "codigo": "recibido",
        "nombre": "Documento recibido",
        "serie": "REC",
        "clase": "recibido",
        "carpeta": "recibidos",
        "tipodoc": "Documento recibido",
        "cuerpo_con_secciones": False,
        "campos": _CAMPOS_RECIBIDO,
        "externo": True,
    },
}


# EL ASUNTO de un documento para la bandeja, la búsqueda y la revisión antes
# de numerar. No todos los tipos lo llaman «asunto»: la solicitud usa
# `sumilla_solicito` y el acta no tiene (se resume con la sesión). Leer solo
# `asunto` mostraba «(sin asunto)» en toda solicitud y la revisión la daba
# «en blanco» (revisión de usabilidad 2026-10-01).
CLAVES_ASUNTO = ("asunto", "sumilla", "sumilla_solicito")
# Lo mismo en SQL (búsquedas por texto).
SQL_ASUNTO = (
    "COALESCE(NULLIF(campos->>'asunto', ''), NULLIF(campos->>'sumilla', ''), "
    "NULLIF(campos->>'sumilla_solicito', ''), NULLIF(campos->>'organo', ''), '')"
)


def asunto_de(tipo: str, campos: dict | None) -> str:
    c = campos or {}
    # Primero la clave que el tipo TIENE (la que se edita y se imprime).
    propias = {x["clave"] for x in TIPOS.get(tipo, {}).get("campos", [])}
    for k in sorted(CLAVES_ASUNTO, key=lambda k: k not in propias):
        if (c.get(k) or "").strip():
            return c[k].strip()
    if tipo == "acta":
        sesion = " ".join(x.strip() for x in (c.get("clase_sesion") or "", c.get("organo") or "") if x and x.strip())
        return f"Sesión {sesion}" if sesion else ""
    return ""


def destinatario_de(campos: dict | None) -> str:
    """A quién va: el nombre; si el tipo no lo pide (solicitud), el cargo."""
    c = campos or {}
    return c.get("destinatario_nombre") or c.get("para") or c.get("destinatario_cargo") or ""


def es_externo(codigo: str) -> bool:
    """True si el tipo se produce fuera de Qillqa (su PDF entra por «incorporar»)."""
    return bool(TIPOS.get(codigo, {}).get("externo"))


def tipo_config(codigo: str) -> dict:
    """Config del tipo; cae a 'oficio' si el código es desconocido."""
    return TIPOS.get(codigo, TIPOS["oficio"])


def lista_tipos() -> list[dict]:
    """Datos que el frontend necesita para el selector y el formulario."""
    return [
        {
            "codigo": t["codigo"],
            "nombre": t["nombre"],
            "serie": t["serie"],
            "cuerpo_con_secciones": t["cuerpo_con_secciones"],
            "campos": t["campos"],
            "externo": bool(t.get("externo")),
        }
        for t in TIPOS.values()
    ]

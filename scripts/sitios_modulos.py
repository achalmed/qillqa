#!/usr/bin/env python3
"""scripts/sitios_modulos.py — el sitio de demostración de cada proyecto de la plataforma (Tiqsi y sus módulos).

Cada repositorio hermano publica su demo en GitHub (`achalmed/<id>`) y su sitio en GitHub Pages
(`https://achalmed.github.io/<id>/`), con la misma cara que el de Qillqa (`demo/vendor/sitio/`): la hoja de estilos se
copia tal cual, `app.js` es uno solo para todos (pantallas, cómo se conecta, la familia y, en algunos, una pieza que se
prueba en el navegador) y `index.html` se compone con los datos de abajo. Lo escribe en `<repo>/demo/vendor/sitio/`
(y el flujo de Pages en `<repo>/demo/vendor/.github/workflows/`), que el exportador de cada receta pone en la raíz.

Las capturas propias de un módulo (`img/<pantalla>.webp`, de su instancia sola con datos ficticios) viven en su
receta y no se tocan; las que comparte con Qillqa (bandeja, editor, tablero, chat…) se copian de aquí.

Uso (simula por defecto: muestra qué escribiría):
  python3 scripts/sitios_modulos.py                 todos
  python3 scripts/sitios_modulos.py minka rimay     solo esos
  python3 scripts/sitios_modulos.py --aplicar       escribe
Salida: 0 bien · 1 falta una captura o un repositorio · 2 error de uso.
"""
from __future__ import annotations

import argparse
import html
import json
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ESPACIO = RAIZ.parent
PLANTILLA = RAIZ / "demo" / "vendor" / "sitio"
GITHUB = "https://github.com/achalmed"
PAGES = "https://achalmed.github.io"
AVISO = "GENERADO por scripts/sitios_modulos.py de Qillqa; no editar"

# --------------------------------------------------------------------------------------------- la plataforma
# Lo que ofrece el núcleo de Qillqa a los módulos (backend/app/plataforma.py) y el anfitrión mínimo de Tiqsi.
NUCLEO_QILLQA = ("identidad.v1", "personas.v1", "directorio.v1", "etiquetas.v1", "pegado.v1", "calendario.v1",
                 "avisos.v1", "redaccion.v1", "registro.v1", "push.v1", "modulos.v1", "mapa.v1", "biblioteca.v1",
                 "credenciales.v1")
MINIMO_TIQSI = ("identidad.v1",)

CAPACIDADES = {
    "identidad.v1": "quién entró y con qué papel",
    "personas.v1": "las personas del equipo",
    "directorio.v1": "instituciones, autoridades y contactos",
    "etiquetas.v1": "etiquetas comunes a todo",
    "pegado.v1": "reconocer lo que se pega",
    "calendario.v1": "días hábiles y feriados",
    "avisos.v1": "la campana de avisos",
    "redaccion.v1": "cómo dice el sistema lo que pasó",
    "registro.v1": "registrar desde el chat",
    "push.v1": "notificaciones al celular",
    "modulos.v1": "qué módulos están encendidos",
    "mapa.v1": "el mapa de relaciones",
    "biblioteca.v1": "la biblioteca (Zotero y Calibre)",
    "credenciales.v1": "las claves guardadas",
    "documentos.v1": "los documentos oficiales",
    "relaciones.v1": "qué cita y responde a qué",
    "proyectos.v1": "los proyectos de ley",
    "catalogos.v1": "el catálogo legislativo",
    "semanas.v1": "la semana de representación",
    "medios.v1": "fotos y videos",
    "medios.v2": "fotos y videos, con su selección",
    "piezas.v1": "las piezas de prensa",
    "rendiciones.v1": "las rendiciones de cuentas",
    "tareas.v1": "las tareas",
    "agenda.v1": "la agenda",
    "vinculos.v1": "vínculos con lo que origina una tarea",
    "conversaciones.v1": "las conversaciones del chat",
    "recibidos.v1": "los documentos recibidos",
}

# Los manifiestos (lo que dice cada `<paquete>/manifiesto.py`). Qillqasqa trae tres.
MANIFIESTOS = [
    {"id": "documentos", "repo": "qillqasqa", "nombre": "Gestión documental", "necesita": ["identidad.v1"],
     "aprovecha": ["directorio.v1", "pegado.v1", "mapa.v1", "credenciales.v1", "etiquetas.v1", "biblioteca.v1"],
     "ofrece": ["documentos.v1", "relaciones.v1"]},
    {"id": "proyectos", "repo": "qillqasqa", "nombre": "Proyectos de ley", "necesita": ["identidad.v1"],
     "aprovecha": [], "ofrece": ["proyectos.v1", "catalogos.v1"]},
    {"id": "representacion", "repo": "qillqasqa", "nombre": "Semana de representación", "necesita": ["identidad.v1"],
     "aprovecha": ["medios.v2", "pegado.v1"], "ofrece": ["semanas.v1"]},
    {"id": "recibidos", "repo": "punku", "nombre": "Mesa de Partes", "necesita": ["identidad.v1"],
     "aprovecha": ["directorio.v1", "pegado.v1", "calendario.v1", "etiquetas.v1", "modulos.v1", "agenda.v1",
                   "documentos.v1", "relaciones.v1"], "ofrece": ["recibidos.v1"]},
    {"id": "tareas", "repo": "minka", "nombre": "Tareas y Agenda", "necesita": ["identidad.v1"],
     "aprovecha": ["personas.v1", "pegado.v1", "calendario.v1", "etiquetas.v1", "avisos.v1", "documentos.v1",
                   "recibidos.v1"], "ofrece": ["tareas.v1", "agenda.v1", "vinculos.v1"]},
    {"id": "chat", "repo": "rimay", "nombre": "Chat", "necesita": ["identidad.v1"],
     "aprovecha": ["redaccion.v1", "registro.v1", "etiquetas.v1", "push.v1", "catalogos.v1"],
     "ofrece": ["conversaciones.v1"]},
    {"id": "fototeca", "repo": "rikchay", "nombre": "Mediateca", "necesita": ["identidad.v1"],
     "aprovecha": ["semanas.v1", "etiquetas.v1"], "ofrece": ["medios.v1", "medios.v2"]},
    {"id": "rendicion", "repo": "yupay", "nombre": "Rendición de cuentas", "necesita": ["identidad.v1"],
     "aprovecha": ["semanas.v1", "documentos.v1", "pegado.v1", "calendario.v1"], "ofrece": ["rendiciones.v1"]},
    {"id": "piezas", "repo": "awana", "nombre": "Editor de piezas", "necesita": ["identidad.v1"],
     "aprovecha": ["medios.v2", "pegado.v1"], "ofrece": ["piezas.v1"]},
    {"id": "fotos", "repo": "tullpu", "nombre": "Editor de fotos", "necesita": [], "aprovecha": [], "ofrece": []},
    {"id": "videos", "repo": "kuyuy", "nombre": "Editor de videos", "necesita": [], "aprovecha": [], "ofrece": []},
    {"id": "obs", "repo": "wayra", "nombre": "Kit de transmisiones", "necesita": [], "aprovecha": [], "ofrece": []},
    {"id": "observatorio", "repo": "qhawana", "nombre": "Observatorio de datos", "necesita": [], "aprovecha": [],
     "ofrece": []},
]

# La familia, en el orden en que se presenta (Qillqa es el anfitrión; Tiqsi, el contrato).
FAMILIA = [
    ("qillqa", "Qillqa", "la plataforma que los monta", "inicio"),
    ("tiqsi", "Tiqsi", "el contrato entre módulos", "enchufe"),
    ("qillqasqa", "Qillqasqa", "documentos y proyectos de ley", "documentos"),
    ("punku", "Punku", "mesa de partes", "puerta"),
    ("minka", "Minka", "tareas y agenda", "tareas"),
    ("rimay", "Rimay", "chat", "chat"),
    ("rikchay", "Rikchay", "mediateca", "foto"),
    ("yupay", "Yupay", "rendición de cuentas", "dinero"),
    ("ruray", "Ruray", "base de los editores", "ajustes"),
    ("tullpu", "Tullpu", "editor de fotos", "pincel"),
    ("kuyuy", "Kuyuy", "editor de videos", "video"),
    ("awana", "Awana", "editor de piezas", "capas"),
    ("wayra", "Wayra", "kit de transmisiones", "antena"),
    ("qhawana", "Qhawana", "observatorio de datos", "ojo"),
]

# Las capturas que se toman del sitio de Qillqa (las mismas pantallas, con los mismos datos ficticios).
DE_QILLQA = {"bandeja", "editor", "seguimiento", "proyecto", "estadisticas", "mapa", "recibidos", "mesa-virtual",
             "tablero", "matriz", "agenda", "chat", "movil-bandeja", "movil-chat", "movil-agenda"}
# Las de un módulo que otro repo muestra (Tiqsi y Ruray enseñan a los que se montan sobre ellos).
PRESTADAS = {"mediateca": "rikchay", "rendiciones": "yupay", "observatorio": "qhawana", "fotos": "tullpu",
             "videos": "kuyuy", "piezas": "awana"}


def P(img, icono, nombre, titulo, texto, puntos):
    return {"img": img, "icono": icono, "nombre": nombre, "titulo": titulo, "texto": texto, "puntos": puntos}


def probar(paquete, puerto, entorno, *, base=None, extra=(), requiere=("tiqsi",), web=True, cuentas="datos"):
    """Las órdenes de «Probar», con las variables de su `sola.py`."""
    clonar = " ".join((*requiere, paquete))
    pip = " ".join(f"-e ../{r}" for r in requiere)
    lineas = ["mkdir plataforma && cd plataforma",
              f"for r in {clonar}; do git clone {GITHUB}/$r.git; done",
              f"cd {paquete}",
              f"python3 -m venv .venv && .venv/bin/pip install -r requirements.txt {pip} -e '.[sola]'"]
    if web:
        lineas.append("npm install && npm run web:construir      # la página sola → web/dist")
    lineas += [f"mkdir -p datos && .venv/bin/python -m tiqsi.minimo cuenta {cuentas}/cuentas.json ana --rol administrador",
               "export JWT_SECRET=$(openssl rand -hex 32)"]
    lineas += list(extra)
    variables = " ".join(f"{k}={v}" for k, v in entorno)
    if base:
        variables = f"{base}=postgresql+asyncpg://usuario:clave@127.0.0.1:5432/{paquete} " + variables
    lineas.append(f"{variables} \\\n  .venv/bin/uvicorn {paquete}.sola:app --port {puerto}")
    return lineas


MODULOS = {
    "tiqsi": {
        "nombre": "Tiqsi", "que": "el contrato entre módulos", "icono": "enchufe", "licencia": "Apache-2.0",
        "significado": "«cimiento»",
        "h1": "El cimiento", "tenue": "sobre el que se conectan los módulos.",
        "entrada": "Tiqsi es el contrato con que los proyectos de una plataforma se conectan sin importar el código de "
                   "los otros: cada módulo declara un manifiesto con lo que ofrece, lo que necesita y lo que aprovecha, "
                   "y un anfitrión los monta en orden. Cada uno puede funcionar solo, con el anfitrión mínimo, o junto a "
                   "los demás dentro de Qillqa.",
        "fichas": [("✓", "verde", "12 proyectos conectados", "sin importarse entre sí"), ("⇄", "azul", "«medios.v2»", "capacidad ofrecida por Rikchay")],
        "cifras": [(12, "", "proyectos de la plataforma que se conectan por Tiqsi"), (0, "", "dependencias obligatorias: FastAPI y SQLAlchemy son extras"),
                   (2, "", "maneras de usar un módulo: solo o dentro de una plataforma"), (1, "", "anfitrión que nunca arranca a medias")],
        "pantallas": [
            P("mediateca", "foto", "Rikchay, sola", "Un módulo, funcionando solo",
              "La Mediateca con el anfitrión mínimo de Tiqsi: sus cuentas locales, su inicio de sesión y nada más. Lo que "
              "aprovecharía de una plataforma (la semana de representación, las etiquetas) simplemente no se ofrece.",
              ["Cuentas locales con clave derivada por scrypt", "La cáscara mínima de la web: menú del módulo y tema neutro", "El mismo manifiesto que monta Qillqa"]),
            P("rendiciones", "dinero", "Yupay, sola", "Otro módulo, la misma cáscara",
              "La rendición de cuentas, sola. El manifiesto declara que aprovecha la semana, los documentos, el pegado y "
              "los feriados: sola no los tiene y sigue funcionando.",
              ["«necesita» se exige; «aprovecha» se usa si está", "Su propia base de datos, creada si falta", "Ninguna clave foránea a otro módulo: referencias «modulo:tipo:id»"]),
            P("observatorio", "ojo", "Qhawana, solo", "Hasta un módulo sin base",
              "El Observatorio no usa base de datos ni pide nada al anfitrión: solo sirve su página y su estado. También "
              "es un módulo de Tiqsi, con su manifiesto y sus rutas.",
              ["Rutas montadas bajo su prefijo", "Se apaga y se enciende por su prefijo", "Público si el manifiesto lo dice"]),
        ],
        "funciones": [
            ("documentos", "Manifiesto", "Id, nombre, versión, rutas y prefijos, lo que ofrece, necesita y aprovecha, eventos, resolutores y tareas."),
            ("enchufe", "Capacidades", "Un registro de contratos con versión («documentos.v1»): «obtener» si se necesita, «opcional» si se aprovecha."),
            ("rayo", "Bus de eventos", "Dentro del proceso, con comodines y manejadores aislados: un error de uno no tumba a los demás."),
            ("recibidos", "Bandeja durable", "El evento se guarda con el cambio que lo origina y se entrega al menos una vez, aunque la API se reinicie."),
            ("mapa", "Referencias", "«modulo:tipo:id» en lugar de claves foráneas entre módulos, con sus resolutores."),
            ("inicio", "Anfitrión", "Valida, conecta y monta las rutas en el orden declarado; arranca y detiene las tareas; nunca a medias."),
            ("ajustes", "Anfitrión mínimo", "Cuentas locales, inicio de sesión e identidad: lo justo para que un módulo funcione solo."),
            ("nube", "Exportador de demos", "La versión pública de un proyecto, escaneada y en una rama huérfana que no comparte historia."),
        ],
        "probar": ["mkdir plataforma && cd plataforma",
                   f"git clone {GITHUB}/tiqsi.git && cd tiqsi",
                   "python3 -m venv .venv && .venv/bin/pip install -e '.[pruebas]'",
                   ".venv/bin/python -m pytest -q tests"],
        "probar_texto": "Requisitos: Python 3.11 o más nuevo. Tiqsi es una biblioteca: se instala y se prueba; los módulos que la usan se arrancan solos con su anfitrión mínimo.",
        "probar_cuadro": ("Un módulo en diez líneas", [
            "Declara su <code>Manifiesto</code> con sus rutas y sus capacidades.",
            "Pide al anfitrión lo que necesita con <code>capacidad('identidad.v1')</code>.",
            "Usa lo opcional solo si <code>hay('medios.v2')</code>.",
            "Se arranca solo con <code>tiqsi.minimo.crear_app([MANIFIESTO], …)</code>.",
        ]),
        "codigo": ("Un manifiesto", [
            "from tiqsi import Manifiesto, EntradaMenu",
            "",
            "MANIFIESTO = Manifiesto(",
            "    id=\"recibidos\", nombre=\"Mesa de Partes\", version=\"0.1.0\", contrato=\"^0.1\",",
            "    routers=[router], prefijos=(\"/api/entradas\",),",
            "    necesita=(\"identidad.v1\",),                 <span class=\"c\"># sin esto no arranca</span>",
            "    aprovecha=(\"directorio.v1\", \"calendario.v1\"), <span class=\"c\"># si el anfitrión lo tiene</span>",
            "    ofrece={\"recibidos.v1\": RECIBIDOS_V1},        <span class=\"c\"># lo que da a los demás</span>",
            "    resolutores={\"entrada\": resolver_entrada},   <span class=\"c\"># «recibidos:entrada:42»</span>",
            ")",
        ]),
    },
    "qillqasqa": {
        "nombre": "Qillqasqa", "que": "documentos, proyectos de ley y la semana", "icono": "documentos",
        "significado": "«lo escrito»",
        "h1": "Lo escrito,", "tenue": "de la idea al archivo.",
        "entrada": "Qillqasqa reúne la <b>gestión documental</b> (redactar, numerar sin huecos, componer el PDF con LuaLaTeX, "
                   "firmar y seguir el trámite), los <b>proyectos de ley</b> escritos entre varios y la <b>semana de "
                   "representación</b> con su informe. Trae el marco documental y el servidor de edición simultánea.",
        "fichas": [("✓", "verde", "Oficio N.° 0142-2026", "Numerado y firmado · hace 2 min"), ("⇄", "azul", "3 personas editando", "Proyecto de ley · parte 2")],
        "pantallas": [
            P("bandeja", "documentos", "Documentos", "La bandeja de documentos",
              "Cada oficio, memorando o informe con su número, su estado y su destinatario. Se filtra por pestaña y se busca también dentro del contenido.",
              ["Estados claros: borrador, en revisión, por firmar, enviado", "Visor rápido del PDF sin salir de la lista", "Selección múltiple para acciones en lote"]),
            P("editor", "editor", "Editor", "Redactar sin pelear con el formato",
              "Un formulario por tipo de documento y un cuerpo que se escribe como en un procesador de textos. El PDF se recompone en cada guardado.",
              ["Destinatario, asunto, referencia y copias en su sitio", "El número lo da un contador transaccional: nunca a mano", "Dos personas no se pisan: cada guardado verifica la versión"]),
            P("seguimiento", "seguimiento", "Seguimiento", "Qué pasó con cada oficio",
              "El trámite completo de un documento: cuándo salió, quién lo recibió, el expediente en la otra entidad, los plazos y la respuesta.",
              ["Cargo de recepción y número de expediente", "Plazos que avisan antes de vencer", "La respuesta queda ligada al oficio que la pidió"]),
            P("proyecto", "proyectos", "Proyectos de ley", "Trabajos largos, escritos entre varios",
              "Un proyecto de ley se divide en partes, con fases, responsables y fuentes. Varias personas escriben a la vez sin pisarse.",
              ["Edición simultánea en tiempo real", "Fases y responsables por parte", "Fuentes y cuadro comparativo"]),
            P("estadisticas", "estadisticas", "Estadísticas", "Cuánto se produce y cuánto se responde",
              "Documentos por estado, por tipo y por mes, y la correspondencia con cada institución: enviados, respondidos y días de respuesta.",
              ["Cada cifra abre su lista", "Oficios sin respuesta a la vista", "Unidas al mapa de relaciones"]),
            P("mapa", "mapa", "Relaciones", "Qué cita y responde a qué",
              "Qillqasqa ofrece el grafo de relaciones entre documentos («relaciones.v1»); el anfitrión lo dibuja: quién respondió a qué y qué quedó sin respuesta.",
              ["Se explora con el dedo o el ratón", "Ficha de cada nodo con sus cifras", "Encuentra el hilo de un expediente"]),
        ],
        "movil": [("movil-bandeja", "Documentos en el celular")],
        "funciones": [
            ("documentos", "Numeración sin huecos", "Un contador transaccional por serie y período; un número intermedio se archiva, nunca se borra."),
            ("pdf", "Marco documental", "Clases LuaLaTeX y plantillas por tipo: oficio, memorando, informe, carta, acta…"),
            ("firma", "Firma y vigencia", "El firmado guarda su huella para comprobar después que nada cambió."),
            ("proyectos", "Edición simultánea", "El servidor de edición en tiempo real viene con el módulo (Node)."),
            ("informe", "Semana de representación", "Actividades, pedidos y fotos de la semana de campo, y su informe en PDF."),
            ("mapa", "Relaciones", "Lo que cita y responde a qué, para el mapa del anfitrión."),
        ],
        "probar": probar("qillqasqa", 8040, [("QILLQASQA_DIR", "datos"), ("QILLQASQA_WEB", "web/dist")], base="QILLQASQA_DATABASE_URL"),
        "probar_texto": "Requisitos: Python 3.11, Node 20, PostgreSQL en marcha (la base se crea sola si falta) y TeX Live con LuaLaTeX para el PDF. Sin <code>MDD_RUTA</code> usa el marco documental que trae.",
    },
    "punku": {
        "nombre": "Punku", "que": "la mesa de partes", "icono": "puerta", "significado": "«puerta»",
        "h1": "La puerta de entrada", "tenue": "de todo lo que llega.",
        "entrada": "Punku es la <b>mesa de partes</b>: registra cada documento recibido con su remitente, su responsable y su "
                   "plazo en días hábiles, y abre una <b>mesa de partes virtual</b> pública donde quien no tiene cuenta "
                   "presenta un escrito, recibe su cargo en PDF y sigue su trámite.",
        "fichas": [("✓", "verde", "Expediente 2026-0318", "Cargo enviado · 10:42"), ("⏱", "azul", "Vence en 3 días hábiles", "Responsable: L. Mamani")],
        "pantallas": [
            P("recibidos", "recibidos", "Recibidos", "Lo que llega, registrado y asignado",
              "Los documentos recibidos se registran con su remitente, su responsable y su plazo. El sistema lee la ficha del PDF para ahorrar tipeo.",
              ["Responsable y plazo desde el registro", "Lo que el recibido propone agendar o responder", "El remitente, cruzado con el directorio si lo hay"]),
            P("mesa-virtual", "mesa", "Mesa virtual", "Atención al público sin ventanilla",
              "Una página pública, sin cuenta, donde cualquier persona presenta un escrito y recibe su cargo. Lo presentado entra directo a los recibidos.",
              ["Cargo en PDF con número de expediente", "Consulta del estado con ese número", "Cuenta según el horario y los días hábiles"]),
        ],
        "funciones": [
            ("recibidos", "Registro de recibidos", "Ficha, remitente, responsable y plazo; la ficha del PDF se lee sola."),
            ("reloj", "Días hábiles", "El plazo y la hora de presentación cuentan según el horario de atención."),
            ("mesa", "Mesa virtual pública", "Quien no tiene cuenta presenta su escrito y recibe su cargo en PDF."),
            ("seguimiento", "Seguimiento ciudadano", "Con su número de expediente, cada persona consulta el estado de su trámite."),
            ("agenda", "Propone, no impone", "Un recibido puede proponer una reunión o una respuesta; quien registra decide."),
            ("directorio", "Con el directorio", "Si el anfitrión lo ofrece, el remitente se reconoce y se completa."),
        ],
        "probar": probar("punku", 8034, [("PUNKU_DIR", "datos"), ("PUNKU_WEB", "web/dist")], base="PUNKU_DATABASE_URL"),
        "probar_texto": "Requisitos: Python 3.11, Node 20 y PostgreSQL en marcha (la base se crea sola si falta).",
    },
    "minka": {
        "nombre": "Minka", "que": "tareas y agenda", "icono": "tareas", "significado": "«trabajo en común»",
        "h1": "El trabajo en común,", "tenue": "a la vista de todo el equipo.",
        "entrada": "Minka lleva las <b>tareas</b> y la <b>agenda</b>: alta rápida en lenguaje natural, listas, tablero y "
                   "matriz de prioridades, vínculos con lo que origina cada tarea, y la agenda con su recurrencia, sus "
                   "participantes y su suscripción .ics.",
        "fichas": [("✓", "verde", "Tarea cerrada sola", "El oficio se numeró"), ("◷", "azul", "Reunión de coordinación", "Mañana · 10:00")],
        "pantallas": [
            P("tablero", "tareas", "Tablero", "Un tablero para el equipo",
              "Las tareas del equipo en columnas, con su responsable, su plazo y lo que las originó. Lo que se mueve aquí se ve en la agenda.",
              ["Tablero, lista y matriz de prioridades", "Tareas que nacen y se cierran solas", "Comentarios y plantillas"]),
            P("matriz", "matriz", "Prioridades", "Urgente e importante, por separado",
              "La matriz reparte las tareas en cuatro cuadrantes para decidir qué se hace hoy, qué se programa, qué se delega y qué se deja.",
              ["Se arrastra de un cuadrante a otro", "Usa los mismos datos del tablero", "Ayuda a repartir la semana"]),
            P("agenda", "agenda", "Agenda", "La semana del equipo",
              "Reuniones, plazos y actividades en vista de mes, semana o día, con recurrencia y participantes.",
              ["Suscripción .ics para el calendario del celular", "Por confirmar, confirmado y realizado", "La programación del día"]),
        ],
        "movil": [("movil-agenda", "Agenda en el celular")],
        "funciones": [
            ("editor", "Alta rápida", "Se escribe la tarea como se dice; la fecha y la hora se leen de lo escrito."),
            ("tareas", "Tablero, lista y matriz", "Tres maneras de ver lo mismo, con su responsable y su plazo."),
            ("agenda", "Agenda con recurrencia", "Participantes, repeticiones y suscripción .ics."),
            ("mapa", "Vínculos", "Cada tarea sabe de dónde viene: un documento, un recibido, un proyecto."),
            ("rayo", "Se crean y se cierran solas", "Escucha los eventos de los otros módulos: el oficio numerado cierra su tarea."),
            ("nube", "Importa Super Productivity", "Trae las tareas que ya se llevaban en otra aplicación."),
        ],
        "probar": probar("minka", 8032, [("MINKA_DIR", "datos"), ("MINKA_WEB", "web/dist")], base="MINKA_DATABASE_URL"),
        "probar_texto": "Requisitos: Python 3.11, Node 20 y PostgreSQL en marcha (la base se crea sola si falta).",
    },
    "rimay": {
        "nombre": "Rimay", "que": "el chat", "icono": "chat", "significado": "«hablar»",
        "h1": "Hablar en equipo,", "tenue": "con el trabajo al lado.",
        "entrada": "Rimay es el <b>chat</b>: conversaciones uno a uno y grupos, hilos, reacciones, adjuntos y notas de voz, "
                   "encuestas y avisos en vivo, con puente a Telegram. Reconoce lo que se pega (una agenda, tareas, un "
                   "recibido) y ofrece registrarlo en su módulo.",
        "fichas": [("✓", "verde", "Leído por 4", "Grupo de coordinación"), ("✎", "azul", "Pegaste una agenda", "¿Registrarla en Minka?")],
        "pantallas": [
            P("chat", "chat", "Chat", "Conversaciones con contexto",
              "Conversaciones directas y grupos del equipo. Un documento compartido aparece como tarjeta con su número, su asunto y su estado.",
              ["Hilos, respuestas, reacciones y menciones", "Tarjetas del sistema cuando algo cambia", "Reemplaza el grupo de mensajería suelto"]),
        ],
        "movil": [("movil-chat", "Chat en el celular")],
        "funciones": [
            ("chat", "Directas y grupos", "Uno a uno y por comisión, con hilos, respuestas y reacciones."),
            ("voz", "Adjuntos y voz", "Archivos, fotos y notas de voz en la conversación."),
            ("estadisticas", "Encuestas y lecturas", "Quién leyó, qué se votó, sin salir del chat."),
            ("rayo", "En vivo", "Avisos por WebSocket y notificaciones push al celular."),
            ("avion", "Puente con Telegram", "Lo que se escribe allá llega aquí, y al revés."),
            ("documentos", "Lo pegado se registra", "Una agenda o una lista pegada se ofrece a su módulo."),
        ],
        "probar": probar("rimay", 8033, [("RIMAY_DIR", "datos"), ("RIMAY_WEB", "web/dist")], base="RIMAY_DATABASE_URL"),
        "probar_texto": "Requisitos: Python 3.11, Node 20 y PostgreSQL en marcha (la base se crea sola si falta).",
    },
    "rikchay": {
        "nombre": "Rikchay", "que": "la mediateca", "icono": "foto", "significado": "«imagen, semejanza»",
        "h1": "Las fotos y los videos de una institución,", "tenue": "en orden y a la mano.",
        "entrada": "Rikchay es una <b>mediateca</b>: las fotos, los videos y los documentos de marca de una institución en un "
                   "solo lugar, con su selección, personas y caras, lugares en el mapa, etiquetas, versiones no "
                   "destructivas, fotos parecidas y dónde se usó cada una.",
        "fichas": [("✓", "verde", "18 fotos aceptadas", "Salida de campo (ejemplo)"), ("◎", "azul", "3 parecidas", "Se queda la mejor")],
        "pantallas": [
            P("mediateca", "foto", "Mediateca", "Todo el material, en una rejilla",
              "Las fotos y los videos del equipo por álbum, con su estado de selección, sus etiquetas y sus personas.",
              ["Aceptada, pendiente o rechazada", "Favoritos y papelera", "Se sube desde el celular"]),
        ],
        "funciones": [
            ("foto", "Selección", "Aceptada, pendiente o rechazada: lo que se publica, a la vista."),
            ("directorio", "Personas y caras", "Quién aparece en cada foto."),
            ("pin", "Lugares", "Cada foto en el mapa, por su ubicación."),
            ("etiqueta", "Etiquetas", "Las propias y, dentro de una plataforma, las comunes."),
            ("capas", "Versiones", "Retoques que no destruyen el original."),
            ("ojo", "Parecidas y usos", "Las fotos casi iguales juntas, y dónde se usó cada una."),
        ],
        "probar": probar("rikchay", 8030, [("MEDIATECA_DIR", "datos"), ("MEDIATECA_WEB", "web/dist")], base="MEDIATECA_DATABASE_URL"),
        "probar_texto": "Requisitos: Python 3.11, Node 20 y PostgreSQL en marcha (la base se crea sola si falta).",
    },
    "yupay": {
        "nombre": "Yupay", "que": "la rendición de cuentas", "icono": "dinero", "significado": "«contar»",
        "h1": "Una comisión de servicio,", "tenue": "rendida al céntimo.",
        "entrada": "Yupay lleva la <b>rendición de cuentas de viáticos</b>: la comisión y su movilidad, los comprobantes "
                   "(también pegados desde un texto), los topes por día, la declaración jurada, la liquidación en Excel "
                   "con las fórmulas del libro de referencia y los anexos en PDF con su propio marco LaTeX.",
        "fichas": [("✓", "verde", "S/ 389.00 con comprobante", "8 comprobantes"), ("=", "azul", "Saldo S/ 571.00", "Por devolver")],
        "pantallas": [
            P("rendiciones", "dinero", "Rendiciones", "Las comisiones, una por una",
              "Cada rendición con su comisionado, su semana, lo recibido y lo rendido. Se empieza por la comisión y el resto se llena solo.",
              ["Mías, todas o el resumen", "Borrador, en revisión y cerrada", "Parámetros: topes y montos"]),
            P("rendicion", "informe", "Comprobantes", "Los comprobantes, por día",
              "Boletas, facturas y tickets agrupados por día contra el tope diario. Se suben como foto o PDF, o se pegan desde un texto.",
              ["Lo gastado contra el tope de cada día", "Los que faltan de foto, marcados", "Movilidad, revisión y documento"]),
            P("rendicion-resumen", "estadisticas", "Resumen", "El saldo de todo el equipo",
              "Lo recibido, lo que tiene comprobante, la declaración jurada, lo reconocido y el saldo de cada comisionado.",
              ["Por semana o por período", "Totales listos para la liquidación", "La misma cuenta que el libro de referencia"]),
        ],
        "funciones": [
            ("informe", "Comprobantes", "Foto, PDF o texto pegado; con su tipo, su serie y su monto."),
            ("reloj", "Topes por día", "Lo gastado contra el tope y «Ajustar a lo sugerido»."),
            ("firma", "Declaración jurada", "Lo que no tiene comprobante, declarado como corresponde."),
            ("tabla", "Liquidación en Excel", "Con las mismas fórmulas del libro de referencia."),
            ("pdf", "Anexos en PDF", "Compuestos con su propio marco LaTeX y sus fuentes."),
            ("bus", "Movilidad compartida", "Los tramos de la comisión y quién viajó con quién."),
        ],
        "probar": probar("yupay", 8031, [("RENDICIONES_DIR", "datos"), ("RENDICION_WEB", "web/dist")], base="RENDICION_DATABASE_URL"),
        "probar_texto": "Requisitos: Python 3.11, Node 20, PostgreSQL en marcha (la base se crea sola si falta) y LuaLaTeX para los anexos.",
    },
    "ruray": {
        "nombre": "Ruray", "que": "la base de los editores", "icono": "ajustes", "significado": "«hacer, obrar»",
        "h1": "El taller", "tenue": "donde corren los editores.",
        "entrada": "Ruray es la base común de los editores: <b>Tullpu</b> (fotos), <b>Kuyuy</b> (videos) y <b>Awana</b> "
                   "(piezas). Trae el estudio, con su servidor, sus motores y lo común de las páginas, y su puente a "
                   "FastAPI para que cada editor monte solo sus rutas, con su cookie y sus páginas.",
        "fichas": [("✓", "verde", "3 editores", "sobre la misma base"), ("▶", "azul", "Cola de video", "un trabajo a la vez")],
        "pantallas": [
            P("fotos", "pincel", "Tullpu", "El editor de fotos, sobre Ruray",
              "Retoque por capas y revelado rápido. Sus páginas viven en su repositorio; las sirve Ruray bajo su prefijo, con su cookie.",
              ["crear_router(Editor(...)) monta solo lo suyo", "Lo común de las páginas viene del estudio", "Exporta a la Mediateca si el anfitrión la ofrece"]),
            P("videos", "video", "Kuyuy", "El editor de videos, sobre Ruray",
              "La línea de tiempo vive en Kuyuy; la cola de video, la orden de ffmpeg y los ajustes por red social son del servidor del estudio, en Ruray.",
              ["Un trabajo de video a la vez", "ffmpeg en la computadora", "Ajustes por red social, en un solo lugar"]),
            P("piezas", "capas", "Awana", "El editor de piezas, sobre Ruray",
              "Las plantillas de la marca al estilo de Canva. Ruray le da el banco de imágenes, el almacén y las salidas del perfil del estudio.",
              ["Banco, almacén y salidas por perfil", "El kit de identidad común", "Su propio registro de piezas"]),
        ],
        "funciones": [
            ("enchufe", "Un editor, un prefijo", "Cada editor declara su Editor y Ruray le monta sus rutas y su cookie."),
            ("ajustes", "El estudio", "El servidor, los motores (numpy y Pillow) y las plantillas de cortes verticales."),
            ("video", "Cola de video", "Un trabajo a la vez y la orden de ffmpeg armada en un solo lugar."),
            ("foto", "Puente con la Mediateca", "Si el anfitrión ofrece «medios.v2», el selector la incluye y lo exportado entra a ella."),
            ("documentos", "Perfil del estudio", "Dónde viven el banco, el almacén y las salidas."),
            ("codigo", "Lo común de las páginas", "Lo que comparten los tres editores, una sola vez."),
        ],
        "probar": ["mkdir plataforma && cd plataforma",
                   f"for r in tiqsi ruray; do git clone {GITHUB}/$r.git; done",
                   "cd ruray",
                   "python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -e ../tiqsi -e '.[pruebas]'",
                   ".venv/bin/python -m pytest -q      # sus pruebas y las del estudio"],
        "probar_texto": "Requisitos: Python 3.11. Ruray no se arranca solo: lo usan los editores. Para ver uno funcionando, prueba Tullpu, Kuyuy o Awana.",
        "requiere": ["tiqsi"],
    },
    "tullpu": {
        "nombre": "Tullpu", "que": "el editor de fotos", "icono": "pincel", "significado": "«tinte, color»",
        "h1": "Retocar una foto,", "tenue": "con la marca ya puesta.",
        "entrada": "Tullpu es el <b>editor de fotos</b>: retoque por capas con selecciones, pinceles, clonar, niveles y "
                   "curvas, filtros, texto, marcos y logos de la marca; y un revelado rápido de una foto suelta con la "
                   "plantilla y los formatos de cada red social.",
        "fichas": [("✓", "verde", "Exportada a 1080 × 1350", "Formato de red social"), ("◐", "azul", "Capa de marco", "Logo y colores del kit")],
        "pantallas": [
            P("fotos", "pincel", "Editor de fotos", "Capas, como en un programa de escritorio",
              "Retoque por capas con el motor miniPaint: selecciones, pinceles, clonar, niveles y curvas, filtros y texto, con los marcos y logos de la marca.",
              ["Abre desde su banco o desde la Mediateca", "Marcos y logos del kit de identidad", "Formatos por red social al exportar"]),
        ],
        "funciones": [
            ("capas", "Capas y selecciones", "Pinceles, clonar y máscaras, sin salir del navegador."),
            ("ajustes", "Niveles y curvas", "Y los filtros de siempre, con vista previa."),
            ("texto", "Texto y logos", "Con la letra y los logos del kit de identidad."),
            ("marco", "Marcos de la marca", "Los de la institución, listos para aplicar."),
            ("foto", "Revelado rápido", "Una foto suelta con la plantilla y los formatos por red social."),
            ("enchufe", "Con la Mediateca", "Dentro de una plataforma, lo exportado entra a ella."),
        ],
        "probar": probar("tullpu", 8037, [("TULLPU_DIR", "datos"), ("TULLPU_WEB", "web/dist")], requiere=("tiqsi", "ruray")),
        "probar_texto": "Requisitos: Python 3.11 con numpy y Pillow, y Node 20. Sin base de datos. Los colores, la letra y los logos salen de un kit de identidad (<code>UNANCHA_DIR</code>).",
    },
    "kuyuy": {
        "nombre": "Kuyuy", "que": "el editor de videos", "icono": "video", "significado": "«mover, movimiento»",
        "h1": "Un video con la marca,", "tenue": "sin salir del navegador.",
        "entrada": "Kuyuy es el <b>editor de videos</b>: una línea de tiempo con pistas de video, superposición, texto y "
                   "audio; cortes, transiciones, Ken Burns, títulos y rótulos de la marca, música con ducking y "
                   "subtítulos automáticos palabra a palabra. Exporta con ffmpeg o con ffmpeg.wasm en el navegador.",
        "fichas": [("▶", "verde", "Exportando 9:16", "ffmpeg.wasm · 62 %"), ("♪", "azul", "Ducking activo", "La música baja con la voz")],
        "pantallas": [
            P("videos", "video", "Editor de videos", "Una línea de tiempo con la marca",
              "Pistas de video, superposición, texto y audio; cortes y transiciones; títulos y rótulos de la marca listos para usar.",
              ["Subtítulos automáticos palabra a palabra", "Ken Burns sobre fotos fijas", "Ajustes por red social"]),
        ],
        "funciones": [
            ("video", "Pistas", "Video, superposición, texto y audio en una línea de tiempo."),
            ("capas", "Transiciones y Ken Burns", "Movimiento sobre fotos fijas y cortes suaves."),
            ("texto", "Títulos y subtítulos", "Rótulos de la marca y subtítulos palabra a palabra."),
            ("musica", "Música con ducking", "Baja sola cuando alguien habla."),
            ("nube", "Dos maneras de exportar", "ffmpeg en la computadora o ffmpeg.wasm en el navegador."),
            ("foto", "Formatos por red", "9:16, 1:1, 16:9, con sus ajustes."),
        ],
        "probar": probar("kuyuy", 8038, [("KUYUY_DIR", "datos"), ("KUYUY_WEB", "web/dist")], requiere=("tiqsi", "ruray"),
                         extra=["paginas/vendor/ffmpeg/actualizar.sh --aplicar   # ffmpeg-core.wasm (31 MB), para exportar en el navegador"]),
        "probar_texto": "Requisitos: Python 3.11 con numpy y Pillow, Node 20 y ffmpeg. Sin base de datos. Los colores, la letra y los logos salen de un kit de identidad (<code>UNANCHA_DIR</code>).",
    },
    "awana": {
        "nombre": "Awana", "que": "el editor de piezas", "icono": "capas", "significado": "«tejer»",
        "h1": "La pieza se teje", "tenue": "con las plantillas de la marca.",
        "entrada": "Awana es el <b>editor de piezas</b>: publicaciones con las plantillas de la marca al estilo de Canva "
                   "(paletas por roles, marcos, exportación a redes, SVG editable e imprenta) y el <b>registro de las "
                   "piezas de prensa</b>, en su base propia.",
        "fichas": [("✓", "verde", "Pieza registrada", "Nota de prensa · hoy"), ("◧", "azul", "Paleta institucional", "Fondo · texto · acento")],
        "pantallas": [
            P("piezas", "capas", "Editor de piezas", "Plantillas de la marca, listas para llenar",
              "Se elige una plantilla, se cambian los textos y las fotos, y se exporta para cada red o para la imprenta.",
              ["Paletas por roles: fondo, texto, acento", "Marcos y logos del kit de identidad", "SVG editable y PDF de imprenta"]),
        ],
        "funciones": [
            ("capas", "Plantillas", "Al estilo de Canva, con la marca de la institución."),
            ("pincel", "Paletas por roles", "Fondo, texto y acento: cambiar uno cambia toda la pieza."),
            ("foto", "Exportación a redes", "Los tamaños de cada red, de una vez."),
            ("codigo", "SVG editable", "Para seguir en otro programa sin perder nada."),
            ("pdf", "Imprenta", "Con sangrado y marcas de corte."),
            ("informe", "Registro de piezas", "Las noticias y notas de prensa, con su referencia «piezas:pieza:N»."),
        ],
        "probar": probar("awana", 8039, [("AWANA_DIR", "datos"), ("AWANA_WEB", "web/dist")], base="AWANA_DATABASE_URL", requiere=("tiqsi", "ruray")),
        "probar_texto": "Requisitos: Python 3.11 con numpy y Pillow, Node 20 y PostgreSQL en marcha. Los colores, la letra y los logos salen de un kit de identidad (<code>UNANCHA_DIR</code>).",
    },
    "wayra": {
        "nombre": "Wayra", "que": "el kit de transmisiones", "icono": "antena", "significado": "«viento»: «al aire»",
        "h1": "Al aire,", "tenue": "con la marca en cada rótulo.",
        "entrada": "Wayra es el <b>kit de transmisiones</b> para OBS Studio: rótulos, tarjetas, overlays y pantallas que OBS "
                   "carga como fuente de navegador por su URL, con los textos en la consulta, y un panel que arma y copia "
                   "esa URL por ti.",
        "fichas": [("●", "verde", "EN VIVO", "Overlay · reloj"), ("⧉", "azul", "URL copiada", "Fuente de navegador")],
        "pantallas": [
            P("transmisiones", "antena", "Panel", "Cada pieza, a un clic de OBS",
              "El panel lista los rótulos, tarjetas, overlays y pantallas; se escriben los textos y se copia la URL para la fuente de navegador.",
              ["Rótulos de entrevistado, tema y ubicación", "Tarjetas de cita, dato y pregunta", "Pantallas de portada, pausa y cierre"]),
        ],
        "funciones": [
            ("antena", "Fuente de navegador", "OBS carga cada pieza por su URL: nada que instalar en OBS."),
            ("texto", "Textos en la URL", "?nombre=…&rol=…: el mismo archivo sirve para todos los casos."),
            ("capas", "Cuatro familias", "Rótulos, tarjetas, overlays y pantallas."),
            ("pincel", "La marca", "Colores y letra del kit de identidad."),
            ("reloj", "Reloj y cuenta regresiva", "Para el «en breve» y la hora en pantalla."),
            ("ojo", "Sin base de datos", "Solo archivos: se lleva a cualquier computadora."),
        ],
        "probar": probar("wayra", 8036, [("WAYRA_DIR", "datos"), ("WAYRA_WEB", "web/dist")]),
        "probar_texto": "Requisitos: Python 3.11 y Node 20. Sin base de datos. Los colores y la letra de las piezas salen de un kit de identidad (<code>UNANCHA_DIR</code>).",
    },
    "qhawana": {
        "nombre": "Qhawana", "que": "el observatorio de datos", "icono": "ojo", "significado": "«mirador»",
        "h1": "Un mirador", "tenue": "sobre los datos.",
        "entrada": "Qhawana es el <b>Observatorio de datos</b>: una página de vistas, datos y gráficos que construye datafw "
                   "con el tema de quien la muestra, y que el Observatorio sirve en línea junto con su estado.",
        "fichas": [("✓", "verde", "Página al día", "Generada con el tema del anfitrión"), ("▦", "azul", "Vistas y gráficos", "En un marco, en línea")],
        "pantallas": [
            P("observatorio", "ojo", "Observatorio", "Los datos, con la cara de la plataforma",
              "La página que construye datafw, servida en línea con el tema de quien la muestra: dentro de Qillqa, el suyo; sola, el del kit de identidad.",
              ["Vistas, datos y gráficos", "Su estado, a la vista", "Público si se quiere"]),
        ],
        "funciones": [
            ("estadisticas", "Vistas y gráficos", "Lo que datafw prepara, listo para leer."),
            ("pincel", "El tema de quien lo muestra", "El del anfitrión, o el del kit de identidad si va solo."),
            ("ojo", "En línea", "Se sirve en un marco, sin salir de la plataforma."),
            ("codigo", "Simula por omisión", "«generar» muestra el tema y lo que haría antes de escribir."),
            ("seguimiento", "Su estado", "Cuándo se generó y con qué."),
            ("nube", "Sin base de datos", "Una página y su estado, en una carpeta."),
        ],
        "probar": probar("qhawana", 8035, [("QHAWANA_DIR", "datos"), ("QHAWANA_WEB", "web/dist")],
                         extra=["DATAFW_DIR=/ruta/datafw UNANCHA_DIR=/ruta/kit QHAWANA_DIR=datos .venv/bin/python -m qhawana.generar --aplicar"]),
        "probar_texto": "Requisitos: Python 3.11 y Node 20. Sin base de datos. La página la construye datafw (<code>DATAFW_DIR</code>) con un kit de identidad (<code>UNANCHA_DIR</code>).",
    },
}

# Una pieza que se prueba en el navegador, en los módulos que se prestan (el código está en app.js).
PIEZA = {
    "tiqsi": ("Pruébalo", "Arma tu anfitrión.", "Elige el anfitrión y los módulos. Tiqsi valida lo que cada uno necesita, conecta lo que aprovecha y los monta en orden; si algo falta, no arranca ninguno."),
    "wayra": ("Pruébalo", "Arma un rótulo y copia su URL.", "Escribe los textos: así se verá en la transmisión y esta es la URL que se pega en OBS como fuente de navegador."),
    "yupay": ("Pruébalo", "Rinde un día de comisión.", "Marca los comprobantes que tienes: lo gastado contra el tope del día y lo que va a la declaración jurada, a la vista."),
}


# --------------------------------------------------------------------------------------------- composición
def e(texto: str) -> str:
    return html.escape(texto, quote=True)


def icono_svg(ruta: str) -> str:
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
            '  <rect width="64" height="64" rx="15" fill="#1d1d1f"/>\n'
            f'  <g transform="translate(14 14) scale(1.5)" fill="none" stroke="#fff" stroke-width="1.9" '
            f'stroke-linecap="round" stroke-linejoin="round"><path d="{ruta}"/></g>\n</svg>\n')


def iconos_js() -> dict[str, str]:
    """Las rutas de los íconos, leídas de app.js (una sola fuente)."""
    texto = (Path(__file__).resolve().parent / "sitios_modulos.js").read_text(encoding="utf-8")
    inicio = texto.index("const ICONOS = {") + len("const ICONOS = ")
    fin = texto.index("\n}\n", inicio) + 2
    cuerpo = texto[inicio:fin]
    rutas = {}
    for linea in cuerpo.splitlines():
        linea = linea.strip()
        if ":" in linea and "'" in linea:
            clave, valor = linea.split(":", 1)
            rutas[clave.strip().strip("'")] = valor.strip().rstrip(",").strip("'")
    return rutas


def conexion(rid: str) -> dict:
    """Lo que el sitio necesita para «Cómo se conecta»: sus manifiestos y quién da cada capacidad."""
    propios = [m for m in MANIFIESTOS if m["repo"] == rid]
    if rid == "ruray":
        propios = [{"id": "ruray", "repo": "ruray", "nombre": "Editores (Ruray)", "necesita": [], "aprovecha": ["medios.v2"], "ofrece": []}]
    return {"manifiestos": propios}


def plataforma() -> dict:
    proveedor = {c: "Qillqa" for c in NUCLEO_QILLQA}
    for m in MANIFIESTOS:
        for c in m["ofrece"]:
            proveedor[c] = MODULOS.get(m["repo"], {}).get("nombre", m["repo"].capitalize())
    return {"capacidades": CAPACIDADES, "proveedor": proveedor, "nucleo": list(NUCLEO_QILLQA),
            "minimo": list(MINIMO_TIQSI), "manifiestos": MANIFIESTOS}


def componer(rid: str, m: dict) -> str:
    nombre = m["nombre"]
    lic = m.get("licencia", "AGPL-3.0")
    pantallas = m["pantallas"]
    primera = pantallas[0]
    hay_pieza = rid in PIEZA
    hay_conexion = rid != "tiqsi" and any(x["necesita"] or x["aprovecha"] or x["ofrece"] for x in conexion(rid)["manifiestos"])
    nav = [("pantallas", "Recorrido")]
    if hay_pieza:
        nav.append(("pieza", "Pruébalo"))
    if hay_conexion:
        nav.append(("conexion", "Cómo se conecta"))
    if "codigo" in m:
        nav.append(("codigo", "El manifiesto"))
    nav += [("funciones", "Qué hace"), ("probar", "Probar"), ("familia", "La familia")]
    datos = {"id": rid, "nombre": nombre, "pantallas": pantallas, "conexion": conexion(rid), "plataforma": plataforma(),
             "familia": [{"id": f, "nombre": n, "que": q, "icono": i} for f, n, q, i in FAMILIA], "pages": PAGES}
    json_datos = json.dumps(datos, ensure_ascii=False).replace("</", "<\\/")

    fichas = "".join(
        f'\n    <div class="ficha ficha-{"ab"[i]} vidrio" aria-hidden="true">\n      <span class="ficha-icono {c}">{e(s)}</span>\n'
        f'      <div><b>{e(t)}</b><small>{e(d)}</small></div>\n    </div>' for i, (s, c, t, d) in enumerate(m["fichas"]))
    of = len(set(sum((x["ofrece"] for x in conexion(rid)["manifiestos"]), [])))
    ap = len(set(sum((x["aprovecha"] for x in conexion(rid)["manifiestos"]), [])))
    cifras = m.get("cifras") or [
        (of, "", "capacidades que ofrece a los demás módulos"),
        (ap, "", "que aprovecha si el anfitrión las tiene; sin ellas, sigue funcionando"),
        (0, "", "importaciones de Qillqa: solo usa Tiqsi"),
        (2, "", "maneras de usarlo: solo o dentro de una plataforma"),
    ]
    cifras_html = "".join(f'\n  <div class="cifra vidrio"><b data-contar="{n}"{f" data-sufijo={chr(34)}{s}{chr(34)}" if s else ""}>{n}{s}</b><span>{e(t)}</span></div>'
                          for n, s, t in cifras)
    movil = m.get("movil", [])
    movil_html = ""
    if movil:
        figuras = "".join(f'\n      <figure class="telefono"><img src="img/{i}.webp" alt="{e(a)}" width="600" height="1298" loading="lazy" data-ampliar><figcaption>{e(a)}</figcaption></figure>'
                          for i, a in movil)
        movil_html = f"""
<!-- Celular -->
<section class="seccion" id="celular">
  <div class="encabezado revelar">
    <p class="sobre">En el bolsillo</p>
    <h2>También en el celular.</h2>
    <p>Cada pantalla está pensada primero para el celular y se instala como aplicación.</p>
  </div>
  <div class="carrusel revelar">
    <div class="carrusel-pista solo" id="carrusel" tabindex="0" aria-label="Capturas en el celular">{figuras}
    </div>
  </div>
</section>
"""
    pieza_html = ""
    if hay_pieza:
        sobre, h2, p = PIEZA[rid]
        pieza_html = f"""
<!-- Pieza que se prueba -->
<section class="seccion" id="pieza">
  <div class="encabezado revelar">
    <p class="sobre">{e(sobre)}</p>
    <h2>{e(h2)}</h2>
    <p>{e(p)}</p>
  </div>
  <div class="pieza revelar" id="pieza-{rid}"></div>
</section>
"""
    conexion_html = ""
    if hay_conexion:
        conexion_html = f"""
<!-- Cómo se conecta -->
<section class="seccion" id="conexion">
  <div class="encabezado revelar">
    <p class="sobre">Un módulo de Tiqsi</p>
    <h2>Solo o dentro de una plataforma.</h2>
    <p>{e(nombre)} declara en su manifiesto lo que necesita, lo que aprovecha y lo que ofrece. Cambia de anfitrión y mira qué se enciende.</p>
  </div>
  <div class="conexion revelar">
    <div class="conexion-panel vidrio">
      <div class="segmentos" role="radiogroup" aria-label="Anfitrión" id="anfitrion">
        <button type="button" role="radio" aria-checked="true" data-anfitrion="minimo">Solo</button>
        <button type="button" role="radio" aria-checked="false" data-anfitrion="qillqa">Dentro de Qillqa</button>
      </div>
      <p class="conexion-texto" id="conexion-texto" aria-live="polite"></p>
    </div>
    <div class="conexion-grupos" id="conexion-grupos" aria-live="polite"></div>
  </div>
</section>
"""
    codigo_html = ""
    if "codigo" in m:
        titulo, lineas = m["codigo"]
        codigo_html = f"""
<!-- El manifiesto -->
<section class="seccion" id="codigo">
  <div class="encabezado revelar">
    <p class="sobre">El contrato</p>
    <h2>{e(titulo)}, y nada más.</h2>
    <p>Un módulo no importa el código de los otros: dice lo que da y lo que pide. El anfitrión hace el resto.</p>
  </div>
  <figure class="ventana terminal codigo revelar">
    <div class="ventana-barra"><span class="ventana-titulo">manifiesto.py</span></div>
    <pre><code>{chr(10).join(lineas)}</code></pre>
  </figure>
</section>
"""
    comandos = "\n".join(_comando(l) for l in m["probar"])
    cuadro = m.get("probar_cuadro")
    puerto = next((l.rsplit("--port ", 1)[1] for l in m["probar"] if "--port " in l), None)
    if cuadro:
        t, items = cuadro
        cuadro_html = f'<h3>{e(t)}</h3>\n      <ul class="lista-check">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
    elif puerto:
        cuadro_html = (f'<h3>Abre <code>localhost:{puerto}</code></h3>\n'
                       f'      <p>Entra con la cuenta <code>ana</code> y la clave que elegiste al crearla. Las cuentas viven en '
                       f'<code>datos/cuentas.json</code>; crea más con la misma orden.</p>\n'
                       f'      <p>Para verlo dentro de la plataforma, con los demás módulos, prueba <a href="{PAGES}/qillqa/">Qillqa</a>.</p>')
    else:
        cuadro_html = ('<h3>Lo usan los editores</h3>\n      <ul class="lista-check">'
                       + "".join(f'<li><a href="{PAGES}/{r}/">{n}</a>: {q}</li>' for r, n, q in
                                 (("tullpu", "Tullpu", "fotos"), ("kuyuy", "Kuyuy", "videos"), ("awana", "Awana", "piezas")))
                       + "</ul>")
    titulo_pagina = f"{nombre} — {m['que']}"
    descripcion = html.unescape(m["entrada"]).replace("<b>", "").replace("</b>", "")
    return f"""<!doctype html>
<!-- {AVISO} -->
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(titulo_pagina)}</title>
<meta name="description" content="{e(descripcion)}">
<meta name="theme-color" content="#eef1f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c0e14" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="{e(titulo_pagina)}">
<meta property="og:description" content="{e(descripcion)}">
<meta property="og:image" content="img/{primera['img']}.webp">
<link rel="icon" href="img/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="estilos.css">
<script>
  // El tema elegido se aplica antes de pintar para que no parpadee (el mismo en todos los sitios de la plataforma).
  try {{ const t = localStorage.getItem('qillqa-tema'); if (t) document.documentElement.dataset.theme = t }} catch {{}}
</script>
</head>
<body>
<a class="saltar" href="#principal">Saltar al contenido</a>

<header class="menu" id="menu">
  <a class="menu-marca" href="#inicio" aria-label="{e(nombre)}, inicio">
    <span class="marca-modulo" data-icono="{m['icono']}" aria-hidden="true"></span>{e(nombre)}
  </a>
  <nav class="menu-nav" aria-label="Secciones">
    {"".join(f'<a href="#{i}">{e(t)}</a>' for i, t in nav)}
  </nav>
  <div class="menu-derecha">
    <button class="menu-boton" id="tema" type="button" aria-label="Cambiar entre tema claro y oscuro" title="Tema claro u oscuro">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path class="sol" d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/><path class="luna" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>
    </button>
    <a class="boton chico primario" href="{GITHUB}/{rid}">Ver en GitHub</a>
  </div>
</header>

<main id="principal">

<section class="portada" id="inicio">
  <div class="portada-texto revelar">
    <p class="sobre">Software libre · {lic} · parte de la plataforma Qillqa</p>
    <h1>{e(m['h1'])}<br><span class="tenue">{e(m['tenue'])}</span></h1>
    <p class="entrada">{m['entrada']}</p>
    <div class="acciones">
      <a class="boton primario" href="#probar">Probarlo</a>
      <a class="boton" href="#pantallas">Ver el recorrido</a>
    </div>
    <p class="nota-quechua"><i>{e(nombre)}</i> significa {e(m['significado'])} en quechua.</p>
  </div>
  <div class="portada-ventana revelar">
    <figure class="ventana ventana-flota">
      <div class="ventana-barra"><span class="ventana-titulo">{e(nombre)} · {e(primera['nombre'])}</span></div>
      <img src="img/{primera['img']}.webp" alt="{e(primera['nombre'])}: {e(primera['titulo'])}" width="1600" height="1000" data-ampliar fetchpriority="high">
    </figure>{fichas}
  </div>
</section>

<section class="cifras revelar" aria-label="{e(nombre)} en cifras">{cifras_html}
</section>

<!-- Recorrido -->
<section class="seccion" id="pantallas">
  <div class="encabezado revelar">
    <p class="sobre">Recorrido</p>
    <h2>{"Recorre sus pantallas." if len(pantallas) > 1 else "Así se ve."}</h2>
    <p>Las capturas son de la demo, con datos ficticios.{" Elige una pantalla." if len(pantallas) > 1 else " Pulsa la imagen para ampliarla."}</p>
  </div>
  <div class="escritorio{" una" if len(pantallas) == 1 else ""} revelar">
    <nav class="modulos vidrio" id="dock" aria-label="Pantallas de {e(nombre)}" role="tablist"></nav>
    <figure class="ventana ventana-grande" id="ventana-modulo">
      <div class="ventana-barra">
        <span class="ventana-titulo" id="modulo-titulo">{e(nombre)}</span>
        <span class="ventana-pasos" aria-hidden="true"><button type="button" id="modulo-ant" aria-label="Pantalla anterior">‹</button><button type="button" id="modulo-sig" aria-label="Pantalla siguiente">›</button></span>
      </div>
      <div class="ventana-cuerpo">
        <img id="modulo-imagen" src="img/{primera['img']}.webp" alt="" width="1600" height="1000" data-ampliar loading="lazy">
      </div>
    </figure>
    <aside class="explicacion vidrio" aria-live="polite">
      <p class="sobre" id="modulo-grupo"></p>
      <h3 id="modulo-nombre"></h3>
      <p id="modulo-texto"></p>
      <ul id="modulo-puntos"></ul>
    </aside>
  </div>
</section>
{pieza_html}{conexion_html}{codigo_html}{movil_html}
<!-- Qué hace -->
<section class="seccion" id="funciones">
  <div class="encabezado revelar">
    <p class="sobre">Qué hace</p>
    <h2>{e(nombre)}, en pocas palabras.</h2>
  </div>
  <div class="rejilla revelar" id="rejilla">{"".join(f'''
    <article class="funcion vidrio"><span class="icono" data-icono="{i}"></span><h3>{e(t)}</h3><p>{e(d)}</p></article>''' for i, t, d in m["funciones"])}
  </div>
</section>

<!-- Probar -->
<section class="seccion" id="probar">
  <div class="encabezado revelar">
    <p class="sobre">Probarlo</p>
    <h2>En tu computadora.</h2>
    <p>{m['probar_texto']}</p>
  </div>
  <div class="probar revelar">
    <figure class="ventana terminal">
      <div class="ventana-barra"><span class="ventana-titulo">Terminal</span>
        <button class="copiar" type="button" data-copiar="comandos">Copiar</button></div>
      <pre id="comandos"><code>{comandos}</code></pre>
    </figure>
    <div class="cuentas vidrio">
      {cuadro_html}
      <a class="boton primario" href="{GITHUB}/{rid}">Ver el código en GitHub</a>
    </div>
  </div>
</section>

<!-- La familia -->
<section class="seccion" id="familia">
  <div class="encabezado revelar">
    <p class="sobre">La plataforma Qillqa</p>
    <h2>Cada pieza, en su propio repositorio.</h2>
    <p>Todos se conectan por Tiqsi y todos funcionan solos. Cada nombre está en quechua.</p>
  </div>
  <div class="familia revelar" id="familia-lista"></div>
</section>

</main>

<footer class="pie">
  <p><b>{e(nombre)}</b> · {e(m['que'])} · <a href="{GITHUB}/{rid}/blob/main/LICENSE">{lic}</a> · parte de la <a href="{PAGES}/qillqa/">plataforma Qillqa</a></p>
  <p>Todas las personas, números y documentos de esta página son ficticios.</p>
</footer>

<dialog class="visor" id="visor" aria-label="Captura ampliada">
  <button class="visor-cerrar" type="button" id="visor-cerrar" aria-label="Cerrar">✕</button>
  <img id="visor-imagen" alt="">
</dialog>

<script id="datos" type="application/json">{json_datos}</script>
<script src="app.js" defer></script>
</body>
</html>
"""


def _comando(linea: str) -> str:
    """Una orden de la terminal, con su comentario en gris."""
    if "  # " in linea:
        orden, comentario = linea.split("#", 1)
        return f'{e(orden)}<span class="c">#{e(comentario)}</span>'
    return e(linea)


# --------------------------------------------------------------------------------------------- escritura
def planear(rid: str) -> tuple[list[tuple[Path, str | Path]], list[str]]:
    """Lo que se escribiría (destino, contenido o archivo de origen) y lo que falta."""
    m = MODULOS[rid]
    repo = ESPACIO / rid
    if not repo.is_dir():
        return [], [f"{rid}: no está el repositorio {repo}"]
    sitio = repo / "demo" / "vendor" / "sitio"
    plan: list[tuple[Path, str | Path]] = []
    faltan: list[str] = []
    estilos = (PLANTILLA / "estilos.css").read_text(encoding="utf-8")
    extra = (Path(__file__).resolve().parent / "sitios_modulos.css").read_text(encoding="utf-8")
    plan.append((sitio / "index.html", componer(rid, m)))
    plan.append((sitio / "estilos.css", f"/* {AVISO}: la hoja del sitio de Qillqa y, al final, lo propio de los módulos. */\n"
                 + estilos + "\n" + extra))
    plan.append((sitio / "app.js", f"/* {AVISO}. */\n" + (Path(__file__).resolve().parent / "sitios_modulos.js").read_text(encoding="utf-8")))
    plan.append((sitio / "img" / "icono.svg", icono_svg(iconos_js()[m["icono"]])))
    plan.append((repo / "demo" / "vendor" / ".github" / "workflows" / "pages.yml",
                 (RAIZ / "demo" / "vendor" / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")))
    imagenes = [p["img"] for p in m["pantallas"]] + [i for i, _ in m.get("movil", [])]
    for img in imagenes:
        destino = sitio / "img" / f"{img}.webp"
        if img in DE_QILLQA:
            plan.append((destino, PLANTILLA / "img" / f"{img}.webp"))
        elif img in PRESTADAS and PRESTADAS[img] != rid:
            origen = ESPACIO / PRESTADAS[img] / "demo" / "vendor" / "sitio" / "img" / f"{img}.webp"
            if origen.exists():
                plan.append((destino, origen))
            else:
                faltan.append(f"{rid}: falta {origen} (la captura de {PRESTADAS[img]})")
        elif not destino.exists():
            faltan.append(f"{rid}: falta su captura {destino}")
    return plan, faltan


def main() -> int:
    ap = argparse.ArgumentParser(description="El sitio de demostración de cada proyecto de la plataforma.")
    ap.add_argument("repos", nargs="*", help="los proyectos (por omisión, todos)")
    ap.add_argument("--aplicar", action="store_true", help="escribe (sin esto, simula)")
    a = ap.parse_args()
    repos = a.repos or list(MODULOS)
    desconocidos = [r for r in repos if r not in MODULOS]
    if desconocidos:
        print(f"No conozco: {', '.join(desconocidos)}. Hay: {', '.join(MODULOS)}.", file=sys.stderr)
        return 2
    # Las prestadas primero: Tiqsi y Ruray enseñan capturas de otros.
    repos.sort(key=lambda r: r in ("tiqsi", "ruray"))
    falta_algo = False
    for rid in repos:
        plan, faltan = planear(rid)
        for f in faltan:
            print("  FALTA", f)
        falta_algo |= bool(faltan)
        for destino, contenido in plan:
            rel = destino.relative_to(ESPACIO)
            if isinstance(contenido, Path):
                igual = destino.exists() and destino.read_bytes() == contenido.read_bytes()
            else:
                igual = destino.exists() and destino.read_text(encoding="utf-8") == contenido
            if igual:
                continue
            print(("  escribe " if a.aplicar else "  escribiría ") + str(rel))
            if a.aplicar:
                destino.parent.mkdir(parents=True, exist_ok=True)
                if isinstance(contenido, Path):
                    shutil.copyfile(contenido, destino)
                else:
                    destino.write_text(contenido, encoding="utf-8")
    if not a.aplicar:
        print("Simulación: nada escrito. Con --aplicar, se escribe.")
    return 1 if falta_algo else 0


if __name__ == "__main__":
    sys.exit(main())

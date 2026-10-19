"""Configuracion central de Qillqa.

Todos los valores ajustables se leen de variables de entorno (definidas
en docker-compose.yml / .env). Ningun modulo debe leer os.environ
directamente: siempre a traves de `config`.
"""

from pydantic_settings import BaseSettings


class Configuracion(BaseSettings):
    """Valores de entorno con defaults seguros para desarrollo."""

    database_url: str = "postgresql+asyncpg://sgdp:sgdp@db:5432/sgdp"
    nombre_sistema: str = "Qillqa — Gestión documental"

    # Autenticacion
    jwt_secret: str = "cambiar-en-produccion"
    # Claves de las mesas de partes (servicios/boveda.py, 2026-10-08): clave Fernet propia. Si
    # falta, se deriva de jwt_secret; cambiar jwt_secret sin definir esta deja ilegibles las claves.
    sgdp_boveda_clave: str = ""
    horas_sesion: int = 12
    # Cuenta administradora inicial: la siembra la crea si no existe (ADMIN_USUARIO / ADMIN_CLAVE en
    # .env; sin clave, la clave inicial es el propio usuario y se obliga a cambiarla). DOC7 2026-09-20.
    admin_usuario: str = "admin"
    admin_clave: str = ""

    # Motor documental: ruta del Marco Documental (framework LaTeX).
    # TODOS los documentos —a mano o por la web— viven en
    # <mdd_ruta>/documentos/oficios; la plataforma no copia nada. En modo
    # laptop apunta al host; en modo Docker, a /framework (montado R/W).
    mdd_ruta: str = "/framework"
    # Archivo documental del DESPACHO (M10 D2, 2026-09-15): los expedientes ya no
    # viven dentro del framework sino en la raíz de la entidad (documentos/). Si
    # esta variable no se define, se usa <mdd_ruta>/documentos (compatibilidad).
    mdd_documentos: str = ""
    # Perfil del DESPACHO (carpeta con perfil-despacho.tex): de él salen el titular, su cargo y el
    # lugar que la ficha de un proyecto llena sola (2026-10-01). Sin él, se escriben a mano.
    mdd_perfil: str = ""
    tiempo_max_compilacion: int = 180  # segundos

    # Identidad institucional de la entidad (panel admin en Fase 4)
    periodo: str = "2026-2027"
    # Siglas y nombres del titular y de la bancada: del .env (SIGLAS, SIGLAS_BANCADA, NOMBRE_BANCADA); aquí solo
    # valores neutros (P317, ola 9/10: nada de un despacho concreto en el código).
    siglas: str = "DESPACHO-CD/CRP"
    siglas_bancada: str = "BANCADA-CR"
    nombre_bancada: str = "Bancada"
    # Temas propios del chat (2026-10-18): el nombre con que el despacho los llama (`servicios/chat.py::temas_propios`).
    nombre_grupo_parlamentario: str = "Grupo parlamentario"
    nombre_programa_radio: str = "Programa de radio"
    lugar: str = "Lima"

    # Directorio de marcadores institucionales (proyecto aparte) del que se
    # SIEMBRA el directorio institucional de Qillqa. Se lee al importar.
    # SIN default absoluto (M10 D2): la ruta la da BOOKMARKS_RUTA en .env.
    bookmarks_ruta: str = ""
    # Puente con el grupo de Telegram durante la transición al chat propio (2026-10-12; servicios/telegram.py).
    # Vacío = apagado. `telegram_usuario`: cuenta de Qillqa a cuyo nombre el bot registra (si no, el primer administrador).
    telegram_token: str = ""
    telegram_chat: str = ""
    telegram_usuario: str = ""

    # Informes de semana de representación (ISR, 2026-10-01): carpeta con un
    # expediente por semana (AAAA-MM_SR-NN_slug/). Si falta, la hermana
    # `representacion/` del archivo documental (convención de la entidad).
    isr_raiz: str = ""
    # Intérprete con el que se lanza el generador del informe (jinja2, matplotlib y Pillow;
    # la API no los instala). Por defecto, el `python3` del PATH, el mismo de generar.sh.
    isr_python: str = "python3"

    # Fototeca (2026-10-06): originales de las fotografías de la entidad y sus derivados
    # (miniaturas, vistas, exportaciones). Si falta, la hermana `fototeca/` del archivo
    # documental, como `representacion/`.
    fototeca_dir: str = ""
    # Rendiciones de cuentas (2026-10-18, Edison: «fuera de la carpeta de la Semana, en una carpeta propia
    # de la entidad»): los PDF y Excel que genera el sistema y las fotos y PDF de los comprobantes, por año y
    # comisión (`docs/arquitectura.md` §32). Si falta, la hermana `rendiciones/` del archivo documental.
    rendiciones_dir: str = ""
    # Caché en disco de las páginas rasterizadas del visor rápido (2026-10-19; servicios/imagen.py):
    # IMAGENES_CACHE_DIR o, si falta, $XDG_CACHE_HOME/sgdp/imagenes (~/.cache/sgdp/imagenes). Es una
    # copia desechable: borrar la carpeta solo cuesta volver a rasterizar. Vacío en IMAGENES_CACHE_MB
    # (0) lo apaga. Nunca dentro de la carpeta de un documento ni del archivo documental.
    imagenes_cache_dir: str = ""
    imagenes_cache_mb: int = 200
    imagenes_cache_dias: int = 30
    xdg_cache_home: str = ""

    # Biblioteca Calibre (2026-10-06): metadata.db que se lee en SOLO LECTURA para buscar obras y
    # citarlas (servicios/biblioteca.py). Si falta, la del workspace (CALIBRE_DB de core/env.py);
    # si tampoco está, la búsqueda en la biblioteca queda apagada.
    calibre_db: str = ""
    # Zotero (2026-10-06, roles corregidos por Edison): AUTORIDAD de metadatos, referencias y citas
    # (servicios/zotero.py). Primero su API local (Zotero 7 abierto, «Permitir que otras aplicaciones
    # de este equipo se comuniquen con Zotero»; Better BibTeX para las claves); si está cerrado, una
    # COPIA de zotero.sqlite en solo lectura. `zotero_dir` vacío: ZOTERO_DIR de core/env.py.
    zotero_url: str = "http://127.0.0.1:23119"
    zotero_dir: str = ""
    zotero_estilo: str = "apa"          # estilo CSL instalado en Zotero (formatea Zotero, no Qillqa)
    zotero_idioma: str = "es-ES"        # locale CSL: «y», «s. f.», «Ed.»
    # Nombre de la entidad que muestra la web (VITE_NOMBRE_DESPACHO del .env, el mismo del login): la
    # mesa de partes virtual lo pone en el cargo si Administración no fijó otro (2026-10-12).
    vite_nombre_despacho: str = ""
    # Zona horaria con que se leen las fechas del EXIF (vienen sin zona) y se agrupan por día.
    zona_horaria: str = "America/Lima"

    # Prensa (2026-10-06): el estudio de Identidad Visual (editor de piezas y de fotos y videos,
    # `identidad-visual/editor/servidor/servidor.py`) corre aparte y la API lo publica bajo
    # /estudio/ (api/prensa.py). Sin servidor arriba, el módulo lo dice y nada más se rompe.
    estudio_url: str = "http://127.0.0.1:8099"
    # Banco de fotos del estudio, donde «Usar en Prensa» deja la foto de la Fototeca (subcarpeta
    # fototeca/). Si falta, `rutas.banco` del perfil de identidad (IDENTIDAD_PERFIL → perfil.json).
    estudio_banco: str = ""
    identidad_perfil: str = ""
    # Cuántas fotos de la Fototeca (públicas o del álbum «Prensa») ofrece el selector del estudio.
    estudio_limite_fotos: int = 300

    # OpenProject (planificación de la entidad, suite `openproject/`; 2026-10-02). Sin URL o sin
    # token la integración queda APAGADA y Qillqa funciona igual. El token es el de una cuenta
    # ADMINISTRADORA de OpenProject (Mi cuenta → Tokens de acceso → API): los flujos sembrados
    # solo dejan avanzar paso a paso y el reflejo necesita poner el estado que tenga Qillqa.
    openproject_url: str = ""
    openproject_token: str = ""
    # Dirección con la que el EQUIPO abre OpenProject (enlaces «Ver en OpenProject»); si falta,
    # la de arriba. La API puede ir por localhost y la gente por el nombre de la LAN.
    openproject_url_publica: str = ""
    # Dirección de Qillqa para los enlaces «Abrir en Qillqa» que se escriben en OpenProject.
    sgdp_url_publica: str = ""
    # Avisos push (Web Push, 2026-10-13; servicios/push.py). Sin estas, el sistema genera su par
    # VAPID la primera vez y lo guarda cifrado en `ajustes`; definirlas fija el par (p. ej., al
    # mudar la base). VAPID_CONTACTO: un correo o la dirección https de Qillqa para el servicio de push.
    vapid_publica: str = ""
    vapid_privada: str = ""
    vapid_contacto: str = ""
    # Cada cuántos segundos se revisan cambios en uno y otro lado.
    openproject_intervalo: int = 30
    # Proyectos de OpenProject (identificadores del modelo sembrado por `openproject/`).
    openproject_proyecto_documentos: str = "documentos"
    openproject_proyecto_recibidos: str = "correspondencia"
    openproject_proyecto_legislativo: str = "legislativo"


config = Configuracion()


def raiz_informes_sr() -> "Path":
    """Carpeta de los ISR: ISR_RAIZ o, si falta, <archivo documental>/../representacion."""
    from pathlib import Path
    return Path(config.isr_raiz) if config.isr_raiz else raiz_documentos().parent / "representacion"


def raiz_fototeca() -> "Path":
    """Carpeta de la Fototeca: FOTOTECA_DIR o, si falta, <archivo documental>/../fototeca."""
    from pathlib import Path
    return Path(config.fototeca_dir) if config.fototeca_dir else raiz_documentos().parent / "fototeca"


def raiz_rendiciones() -> "Path":
    """Carpeta de las rendiciones: RENDICIONES_DIR o, si falta, <archivo documental>/../rendiciones."""
    from pathlib import Path
    return Path(config.rendiciones_dir) if config.rendiciones_dir else raiz_documentos().parent / "rendiciones"


def raiz_cache_imagenes() -> "Path | None":
    """Carpeta del caché de páginas rasterizadas: IMAGENES_CACHE_DIR o, si falta,
    $XDG_CACHE_HOME/sgdp/imagenes (por omisión ~/.cache/sgdp/imagenes). None = caché apagado
    (IMAGENES_CACHE_MB=0)."""
    from pathlib import Path
    if config.imagenes_cache_mb <= 0:
        return None
    if config.imagenes_cache_dir:
        return Path(config.imagenes_cache_dir)
    base = Path(config.xdg_cache_home) if config.xdg_cache_home else Path.home() / ".cache"
    return base / "sgdp" / "imagenes"


def raiz_documentos() -> "Path":
    """Raíz del archivo documental: MDD_DOCUMENTOS o, si falta, <mdd_ruta>/documentos."""
    from pathlib import Path
    return Path(config.mdd_documentos) if config.mdd_documentos else Path(config.mdd_ruta) / "documentos"

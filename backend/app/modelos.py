"""Modelos de la base de datos de Qillqa.

Todas las tablas centrales llevan despacho_id y periodo desde el dia 1
(multi-despacho futuro). El contenido del documento es JSON de TipTap
(JSONB): la fuente de verdad del contenido, nunca LaTeX.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_usuario: Mapped[str] = mapped_column(String(50), unique=True)
    nombre_completo: Mapped[str] = mapped_column(String(120))
    # Datos de la persona (Edison 2026-09-05): nombres y apellidos por
    # separado —de ahí salen el correo institucional y el usuario—, DNI (clave
    # inicial de un solo uso), correo y cargo. `nombre_completo` se mantiene
    # como «nombres apellidos» para todo lo que ya lo usa (bitácora, bandeja).
    nombres: Mapped[str] = mapped_column(String(80), default="")
    apellidos: Mapped[str] = mapped_column(String(80), default="")
    dni: Mapped[str] = mapped_column(String(15), default="")
    email: Mapped[str] = mapped_column(String(120), default="")
    cargo: Mapped[str] = mapped_column(String(120), default="")
    # Su ficha en el DIRECTORIO (2026-10-10): la cuenta manda; al cambiar nombre, cargo o correo
    # aquí, la persona del directorio se pone al día (servicios/cuentas.py::sincronizar_persona).
    persona_id: Mapped[int | None] = mapped_column(ForeignKey("personas.id", ondelete="SET NULL"), nullable=True)
    # PERFIL (2026-10-12, servicios/perfil.py): celular peruano de 9 dígitos, la foto (ruta
    # relativa a la raíz documental, `chat/perfiles/u<id>-<sha8>.jpg`) y «Info» como en WhatsApp.
    telefono: Mapped[str] = mapped_column(String(20), default="")
    foto: Mapped[str] = mapped_column(String(200), default="")
    acerca: Mapped[str] = mapped_column(String(140), default="")
    clave_hash: Mapped[str] = mapped_column(String(200))
    # administrador | secretaria | asesor | diputado | prensa | invitado
    rol: Mapped[str] = mapped_column(String(20), default="secretaria")
    activo: Mapped[bool] = mapped_column(default=True)
    # Presencia (2026-10-19): si los demás ven su estado en línea; el administrador lo ve siempre.
    mostrar_presencia: Mapped[bool] = mapped_column(default=True)
    # La clave vigente es TEMPORAL: la puso el administrador al crear la cuenta
    # o al restablecerla, y viajó por WhatsApp o correo. Mientras esta marca
    # esté puesta, el sistema NO deja usar nada hasta cambiarla (Edison
    # 2026-09-05). Se apaga sola cuando la persona elige su propia clave.
    debe_cambiar_clave: Mapped[bool] = mapped_column(default=False)
    # Último latido de la persona (servicios/presencia.py), para «visto hace
    # 3 h» en la lista del equipo. Se escribe como mucho cada 2 minutos.
    ultima_actividad: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Cuándo confirmó sus datos en el paso de bienvenida (2026-10-18). NULL: todavía no; mientras
    # tanto el sistema no deja seguir (428 `datos_pendientes`), salvo a los cargos exceptuados
    # (servicios/perfil.py::pide_bienvenida). Quien administra puede volver a pedirlos.
    datos_completos_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SolicitudClave(Base):
    """Alguien pulsó «¿Olvidaste tu contraseña?» en la pantalla de inicio.

    El sistema no tiene correo de los usuarios (ni servidor de envío), así que
    no hay recuperación por enlace: lo que hay es un AVISO al administrador,
    que restablece la cuenta a su clave inicial y se lo comunica por donde ya
    se hablan. La solicitud se guarda aunque el usuario no exista —así el
    formulario responde siempre lo mismo y nadie puede averiguar qué cuentas
    hay probando nombres— y en ese caso `usuario_id` queda en NULL.
    """

    __tablename__ = "solicitudes_clave"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Lo que la persona escribió, tal cual (puede no corresponder a nadie).
    nombre_usuario: Mapped[str] = mapped_column(String(50))
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    nota: Mapped[str] = mapped_column(Text, default="")
    atendida: Mapped[bool] = mapped_column(default=False)
    atendida_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    atendida_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Documento(Base):
    __tablename__ = "documentos"
    __table_args__ = (
        # Un numero oficial no puede repetirse dentro de su serie y
        # periodo (los borradores sin numero no chocan: NULL != NULL).
        UniqueConstraint("despacho_id", "tipo", "periodo", "numero"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int] = mapped_column(Integer, default=1)
    periodo: Mapped[str] = mapped_column(String(20))
    tipo: Mapped[str] = mapped_column(String(30))       # p. ej. "oficio"
    serie: Mapped[str] = mapped_column(String(10))      # p. ej. "OF"
    numero: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # BORRADOR | EN_REVISION | OBSERVADO | APROBADO | FIRMADO | ENVIADO | ARCHIVADO
    estado: Mapped[str] = mapped_column(String(20), default="BORRADOR")
    # sgdp = nacido en la plataforma (cuerpo = JSON TipTap, lo regenera
    # el serializador). framework = importado del archivo de la entidad
    # (su .tex y PDF originales se conservan verbatim; el editor visual
    # no los toca para no perder la personalizacion LaTeX). manual =
    # elaborado FUERA del sistema (Word u otro editor) e incorporado con su
    # PDF y su numero ya impreso: el PDF es la fuente, no hay .tex ni
    # recompilacion (servicios/incorporacion.py, Edison 2026-09-11).
    origen: Mapped[str] = mapped_column(String(20), default="sgdp")
    # Solo documentos importados: carpeta original y PDF institucional.
    ruta_original: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_archivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Número de folios del documento físico (lo registra la secretaría a
    # mano desde la bandeja; None = aún no registrado).
    folios: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Oculto por el administrador: INVISIBLE para los demás roles (bandeja,
    # apertura y sincronización) y relegado al final de la bandeja del admin.
    # No elimina nada: el documento sigue en el sistema.
    oculto: Mapped[bool] = mapped_column(default=False)
    # RESPONSABLE actual del documento: a quién se le encargó redactarlo,
    # corregirlo o revisarlo (pedido de Edison 2026-09-04). Se asigna desde la
    # bandeja o el editor; cada cambio queda en `asignaciones_documento` y en
    # la bitácora. NULL = sin responsable asignado (nadie lo tiene «en mano»).
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    # --- Registro en el STD (Sistema de Trámite Documentario) del Congreso ---
    # Último paso de la ruta del oficio: todo documento enviado a la entidad
    # debe quedar registrado en el STD, y para registrarlo hace falta la
    # CONSTANCIA DE RECEPCIÓN. El sistema exige ese orden (servicios/tramite.py).
    std_registrado: Mapped[bool] = mapped_column(default=False)
    std_numero: Mapped[str] = mapped_column(String(120), default="")   # n.º de expediente STD
    std_fecha: Mapped[str] = mapped_column(String(20), default="")     # ISO
    std_nota: Mapped[str] = mapped_column(Text, default="")
    # N.º de expediente (o de registro, hoja de ruta, CUT…) que la ENTIDAD destinataria dio al
    # documento al recibirlo: se lee solo del cargo de recepción y sirve para el seguimiento.
    expediente_entidad: Mapped[str] = mapped_column(String(120), default="")
    # Plazo LEGAL de respuesta de la entidad (2026-10-11, pegado de seguimiento; auditoría RC-03/GD-05):
    # {norma, articulo, dias, desde, vence}; distinto del plazo interno de la tarea.
    plazo_legal: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # Estado de la última compilación (2026-10-12): {ok, en, error, reparaciones: [{paso, descripcion,
    # detalle, pierde}], pdf_al_dia}. La web lo muestra sobre el visor: una vista previa reparada o
    # desactualizada nunca se presenta como si fuera la actual.
    estado_compilacion: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # '' = lo deduce el sistema; 'interno'/'externo' = lo fijó una persona.
    # Decide si el trámite exige cargo de recepción (ver servicios/ambito.py).
    ambito: Mapped[str] = mapped_column(String(20), default="")
    std_registrado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    # Campos del formulario (destinatario, asunto, sumilla, lugar, ...)
    campos: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Cuerpo del documento: JSON de TipTap
    cuerpo: Mapped[dict] = mapped_column(JSONB, default=dict)
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Versión del CONTENIDO (campos + cuerpo). Sube 1 en cada guardado, vista
    # previa, numeración o restauración; NO cambia por estado, archivos ni
    # seguimiento (para eso está actualizado_en). Es la base del control de
    # concurrencia: el editor manda la versión sobre la que editó
    # (`version_base`) y el servidor rechaza con 409 `documento_modificado`
    # si ya no es la vigente. Antes (2026-09-14) una pestaña con una copia
    # vieja —abierta mientras el servidor estaba caído, o simplemente sin
    # refrescar— pisaba en silencio lo que otra persona ya había guardado.
    version_contenido: Mapped[int] = mapped_column(default=0, server_default="0")
    # Edición simultánea (paso 5.6, 2026-10-05), como las partes del proyecto
    # de ley: interruptor por documento, generación del texto compartido
    # (`doc:<id>:<gen>`) y borrador vivo {campos, cuerpo} que deriva el
    # servidor compartido sin crear versión. Solo rige mientras el documento
    # es compartible (servicios/colab.py::documento_compartible).
    colaboracion: Mapped[bool] = mapped_column(default=True, server_default="true")
    colab_gen: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    borrador: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    borrador_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    borrador_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)


class Contador(Base):
    """Numeracion oficial sin huecos: una fila por (serie, periodo).

    El numero se toma con un UPDATE atomico dentro de la transaccion
    de aprobacion; un rollback lo devuelve. NUNCA usar SEQUENCE.
    """

    __tablename__ = "contadores"

    despacho_id: Mapped[int] = mapped_column(primary_key=True)
    serie: Mapped[str] = mapped_column(String(10), primary_key=True)
    periodo: Mapped[str] = mapped_column(String(20), primary_key=True)
    ultimo: Mapped[int] = mapped_column(Integer, default=0)


class Evento(Base):
    """Bitacora append-only: quien hizo que y cuando. Nunca se borra."""

    __tablename__ = "eventos"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id"), nullable=True
    )
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    accion: Mapped[str] = mapped_column(String(40))
    detalle: Mapped[str] = mapped_column(Text, default="")
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Adjunto(Base):
    """Archivo anexo de un documento (evidencia, respaldo). Se guarda en
    la carpeta del propio documento, bajo adjuntos/."""

    __tablename__ = "adjuntos"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(ForeignKey("documentos.id"))
    nombre_original: Mapped[str] = mapped_column(String(255))
    nombre_archivo: Mapped[str] = mapped_column(String(255))
    tamano: Mapped[int] = mapped_column(Integer, default=0)
    tipo_mime: Mapped[str] = mapped_column(String(120), default="")
    # Categoría del adjunto: "" (evidencia genérica), "firmado" (PDF del
    # oficio firmado escaneado) o "recepcion" (cargo/constancia de recepción
    # sellada). La bandeja muestra una columna ✓ por cada categoría.
    categoria: Mapped[str] = mapped_column(String(20), default="")
    # Etiqueta libre: en constancias de recepción de un oficio MÚLTIPLE,
    # identifica a QUÉ destinatario corresponde (seguimiento n/m).
    etiqueta: Mapped[str] = mapped_column(String(160), default="")
    # Si el adjunto es el archivo de una RESPUESTA EXTERNA (categoría
    # 'respuesta'), a qué vínculo pertenece — una respuesta externa puede traer
    # VARIOS archivos. NULL para los adjuntos normales.
    relacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("documento_relaciones.id", ondelete="SET NULL"), nullable=True
    )
    # Si es imagen y se marca, se incrusta como PÁGINA FINAL del PDF del
    # documento (anexo escaneado). Solo aplica a imágenes.
    es_anexo: Mapped[bool] = mapped_column(default=False)
    # Vigencia (2026-10-06, servicios/vigencia.py): SHA-256 del archivo (se
    # calcula al guardarlo; los anteriores, la primera vez que hace falta) y,
    # en un firmado, la huella de lo impreso que certifica. NULL = aún sin
    # calcular.
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    huella_impresa: Mapped[str | None] = mapped_column(String(90), nullable=True)
    subido_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    subido_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Ajuste(Base):
    """Ajustes de la entidad (clave -> JSON). Hoy: formato predeterminado
    por tipo documental («convertir a predeterminado» del panel Formato),
    bajo la clave fmt_defecto_<tipo>."""

    __tablename__ = "ajustes"

    despacho_id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    clave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[dict] = mapped_column(JSONB, default=dict)


class Credencial(Base):
    """Usuario y clave de una cuenta (mesas de partes y otros sitios; módulo Contraseñas, 2026-10-08): la clave va CIFRADA
    (servicios/boveda.py) y solo se descifra a pedido, con registro en AccesoCredencial."""

    __tablename__ = "credenciales"

    id: Mapped[int] = mapped_column(primary_key=True)
    institucion_id: Mapped[int | None] = mapped_column(ForeignKey("instituciones.id"), nullable=True)
    nombre: Mapped[str] = mapped_column(String(200), default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    usuario: Mapped[str] = mapped_column(String(200), default="")
    clave_cifrada: Mapped[str] = mapped_column(Text, default="")
    notas: Mapped[str] = mapped_column(Text, default="")
    # Módulo Contraseñas (2026-10-08): agrupar, marcar y saber cuándo se usó.
    categoria: Mapped[str] = mapped_column(String(60), default="")
    # Formas de ingreso del MISMO sitio (Edison 2026-10-08: «con DNI, con correo… agrupados, no
    # en varias cuentas»): [{id, tipo, usuario, cifrada}]. La primera se copia en usuario y
    # clave_cifrada (api/contrasenas.py, `sincronizar`).
    ingresos: Mapped[list] = mapped_column(JSONB, default=list)
    favorita: Mapped[bool] = mapped_column(default=False)
    ultimo_uso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AccesoCredencial(Base):
    """Quién vio o copió la clave de una mesa de partes y cuándo (solo se agrega)."""

    __tablename__ = "accesos_credencial"

    id: Mapped[int] = mapped_column(primary_key=True)
    credencial_id: Mapped[int] = mapped_column(ForeignKey("credenciales.id", ondelete="CASCADE"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    accion: Mapped[str] = mapped_column(String(20), default="revelar")
    en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VersionDocumento(Base):
    """Instantanea inmutable del contenido en cada guardado. Nunca se
    sobrescribe: permite consultar y restaurar versiones anteriores."""

    __tablename__ = "versiones_documento"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(ForeignKey("documentos.id"))
    numero_version: Mapped[int] = mapped_column(Integer)
    campos: Mapped[dict] = mapped_column(JSONB, default=dict)
    cuerpo: Mapped[dict] = mapped_column(JSONB, default=dict)
    nota: Mapped[str] = mapped_column(String(120), default="")
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# --------------------------- Directorio institucional --------------------
# Base de datos de referencia (instituciones, personas y sus enlaces) que
# alimenta el autocompletado del formulario. Es NACIONAL (compartida, sin
# despacho_id): un dato se registra una vez y se reutiliza en todos los
# documentos. Se siembra desde ~/Documents/bookmarks (ver servicios/directorio).


class Institucion(Base):
    """Entidad del directorio: ministerio, GORE, municipalidad, organismo,
    universidad, etc. Jerárquica por `parent_id` (Perú → Ministerio →
    Viceministerio → Dirección → Oficina)."""

    __tablename__ = "instituciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(300))
    siglas: Mapped[str] = mapped_column(String(60), default="")
    # ministerio | poder | autonomo | organismo | regulador | region |
    # municipalidad | universidad | empresa | direccion | oficina | otro
    tipo: Mapped[str] = mapped_column(String(40), default="otro")
    sector: Mapped[str] = mapped_column(String(80), default="")
    nivel_gobierno: Mapped[str] = mapped_column(String(20), default="")  # nacional|regional|local
    # Jerarquía: institución padre (nullable = raíz).
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("instituciones.id"), nullable=True
    )
    # Clasificación del órgano en el ROF (organigrama): alta_direccion |
    # organo_linea | organo_apoyo | organo_asesoramiento | organo_control |
    # organo_resolutivo | organo_desconcentrado | unidad_organica | programa |
    # proyecto | adscrito | comision | "" (entidad raíz).
    categoria: Mapped[str] = mapped_column(String(40), default="")
    # Orden del nodo entre sus hermanos (según el organigrama oficial).
    orden: Mapped[int] = mapped_column(Integer, default=0)
    # Procedencia del dato (actualización periódica del organigrama):
    fuente: Mapped[str] = mapped_column(String(200), default="")
    url_fuente: Mapped[str] = mapped_column(Text, default="")
    fecha_consulta: Mapped[str] = mapped_column(String(20), default="")
    # Norma que aprueba la estructura (ROF/resolución), cuando corresponda.
    norma: Mapped[str] = mapped_column(String(300), default="")
    region: Mapped[str] = mapped_column(String(80), default="")
    url_oficial: Mapped[str] = mapped_column(Text, default="")
    url_mesa_partes: Mapped[str] = mapped_column(Text, default="")
    # Cómo RECIBE documentos la entidad cuando no tiene mesa de partes virtual (2026-10-10,
    # Edison: «algunos solo tienen WhatsApp, un correo o atención presencial»):
    # canal = virtual | correo | whatsapp | presencial | otro; dato = el correo, el número, la
    # dirección u horario; nota = lo que hay que saber («llevar dos copias», «solo mañanas»).
    recepcion_canal: Mapped[str] = mapped_column(String(20), default="")
    recepcion_dato: Mapped[str] = mapped_column(String(300), default="")
    recepcion_nota: Mapped[str] = mapped_column(Text, default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    telefono: Mapped[str] = mapped_column(String(80), default="")
    direccion: Mapped[str] = mapped_column(Text, default="")
    # RUC de la entidad: hace falta para trámites administrativos (boletos,
    # facturación, mesas de partes). Pedido de Edison 2026-09-04.
    ruc: Mapped[str] = mapped_column(String(20), default="")
    activo: Mapped[bool] = mapped_column(default=True)
    notas: Mapped[str] = mapped_column(Text, default="")
    # Origen del registro: 'import' (sembrado), 'manual' (creado por el usuario).
    origen: Mapped[str] = mapped_column(String(20), default="manual")
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ReglaCopia(Base):
    """Una copia (c.c.) que el sistema SUGIERE al redactar (Edison 2026-09-05).

    Hay copias que en el despacho van siempre —la del Presidente de la Mesa
    Directiva, por ejemplo— y que se olvidan justo cuando importan. El sistema
    las propone, pero NUNCA las pone solo: antes de numerar el documento hay
    que confirmarlas una por una, porque un funcionario cambia de cargo, llega
    otra autoridad, o esa copia simplemente no corresponde a ese oficio.

    `persona_id` la liga al DIRECTORIO: así el cargo que se sugiere es el
    vigente, y actualizar el directorio actualiza la sugerencia. Los tres
    campos de texto son el respaldo para cuando la copia no es una persona del
    directorio (una oficina, un cargo genérico), y también la «foto» con la que
    se detecta que el directorio cambió desde la última vez.

    `tipos` vacío = todos los tipos de documento; si no, la lista separada por
    comas de los códigos a los que aplica («oficio,oficio_multiple»).
    """

    __tablename__ = "reglas_copia"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipos: Mapped[str] = mapped_column(String(300), default="")
    persona_id: Mapped[int | None] = mapped_column(
        ForeignKey("personas.id"), nullable=True
    )
    tratamiento: Mapped[str] = mapped_column(String(40), default="Señor:")
    nombre: Mapped[str] = mapped_column(String(200), default="")
    cargo: Mapped[str] = mapped_column(String(300), default="")
    # Por qué va esta copia (se muestra al confirmarla).
    motivo: Mapped[str] = mapped_column(Text, default="")
    orden: Mapped[int] = mapped_column(Integer, default=0)
    activa: Mapped[bool] = mapped_column(default=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Persona(Base):
    """Autoridad o funcionario ligado a una institución y un cargo. Al cambiar
    la autoridad se edita este registro (los documentos anteriores conservan su
    dato; los nuevos toman el vigente)."""

    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200))
    cargo: Mapped[str] = mapped_column(String(200), default="")
    tratamiento: Mapped[str] = mapped_column(String(40), default="")  # Señor/Señora/…
    institucion_id: Mapped[int | None] = mapped_column(
        ForeignKey("instituciones.id"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(200), default="")
    # Correo alterno (personal) cuando el institucional no es el de uso diario.
    email_alterno: Mapped[str] = mapped_column(String(200), default="")
    telefono: Mapped[str] = mapped_column(String(80), default="")
    # Contacto ampliado (pedido de Edison 2026-09-04): el celular es el dato
    # que más se usa en el despacho, y el ANEXO es la vía interna del Congreso.
    celular: Mapped[str] = mapped_column(String(80), default="")
    anexo: Mapped[str] = mapped_column(String(20), default="")
    # Oficina / sede física (p. ej. «Jr. Carabaya, 4.º piso» o «edificio
    # Roberto Ramírez del Villar, oficina 403»).
    oficina: Mapped[str] = mapped_column(String(200), default="")
    # Área o unidad dentro de la institución, cuando el cargo no la nombra.
    area: Mapped[str] = mapped_column(String(200), default="")
    activo: Mapped[bool] = mapped_column(default=True)
    notas: Mapped[str] = mapped_column(Text, default="")
    origen: Mapped[str] = mapped_column(String(20), default="manual")
    # Contactos como Google Contacts (2026-10-13, servicios/contactos.py): la foto (ruta relativa a
    # la raíz documental, `directorio/fotos/p<id>-<sha8>.jpg`) y las ETIQUETAS o grupos del equipo
    # («Prensa», «Comisión de Educación», «Gobierno regional»), que sirven para filtrar y exportar.
    foto: Mapped[str] = mapped_column(String(200), default="", server_default="")
    etiquetas: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ContactoFavorito(Base):
    """Los FAVORITOS de cada cuenta en el directorio (2026-10-13), como la estrella de Google
    Contacts: salen arriba de la lista. Cada persona del equipo tiene los suyos."""

    __tablename__ = "contactos_favoritos"

    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    persona_id: Mapped[int] = mapped_column(ForeignKey("personas.id", ondelete="CASCADE"), primary_key=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Enlace(Base):
    """Enlace institucional (mesa de partes, portal oficial, transparencia,
    funcionarios, datos, etc.) asociado a una institución. Uno-a-muchos."""

    __tablename__ = "enlaces_institucionales"

    id: Mapped[int] = mapped_column(primary_key=True)
    institucion_id: Mapped[int] = mapped_column(ForeignKey("instituciones.id"))
    # mesa_partes | oficial | transparencia | funcionarios | seguimiento |
    # datos | servicio | otro
    tipo: Mapped[str] = mapped_column(String(40), default="otro")
    url: Mapped[str] = mapped_column(Text)
    etiqueta: Mapped[str] = mapped_column(String(200), default="")
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DocumentoRelacion(Base):
    """Vínculo de un documento con otro para el seguimiento de la
    correspondencia. Dos formas:

    - INTERNO-INTERNO: `origen_id` y `destino_id` apuntan a documentos del
      sistema. Dirigido: 'responde' = `origen` es respuesta de `destino`
      (desde el original se ve «Respondido por…», desde la respuesta «Responde
      a…»); 'relacionado' es simétrico. El reverso se calcula al listar.
    - INTERNO-EXTERNO: la respuesta (o el documento relacionado) NO está en el
      sistema (llegó de otra entidad). `origen_id` es el documento interno,
      `destino_id` es NULL y los datos del externo van en `externo_*`. Aquí el
      `tipo` se lee DESDE el interno: 'respondido' (el externo responde al
      interno), 'responde' (el interno responde al externo) o 'relacionado'.

    Se borra en cascada si el documento interno se elimina."""

    __tablename__ = "documento_relaciones"
    __table_args__ = (
        # No repetir el mismo vínculo interno (mismo par y tipo). Los externos
        # llevan destino_id NULL → NULL nunca choca, se permiten varios.
        UniqueConstraint("origen_id", "destino_id", "tipo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    origen_id: Mapped[int] = mapped_column(
        ForeignKey("documentos.id", ondelete="CASCADE")
    )
    # NULL cuando la relación es con un documento EXTERNO (datos en externo_*).
    destino_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="CASCADE"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(20), default="relacionado")
    nota: Mapped[str] = mapped_column(Text, default="")
    # Documento de respuesta EXTERNO (no registrado en el sistema).
    externo_numero: Mapped[str] = mapped_column(String(120), default="")
    externo_tipo: Mapped[str] = mapped_column(String(60), default="")
    externo_institucion: Mapped[str] = mapped_column(String(300), default="")
    externo_fecha: Mapped[str] = mapped_column(String(20), default="")  # ISO
    externo_asunto: Mapped[str] = mapped_column(Text, default="")
    # Los archivos de una respuesta externa son Adjuntos categoría 'respuesta'
    # con su `relacion_id` apuntando a esta fila (1 respuesta → N archivos); se
    # ven en el visor derecho como el firmado y las constancias.
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ------------------------ Comentarios y asignaciones ---------------------
# Pedidos de Edison 2026-09-04 (§3 y §4 del encargo):
#   - No se puede OBSERVAR un documento sin dejar dicho QUÉ se corrige.
#   - Al devolver un documento a BORRADOR se puede dejar la indicación del
#     trabajo a realizar y encargárselo a alguien (el diputado u otra persona).
# Ambas cosas son el MISMO objeto: un comentario dirigido a quien redacta.


class Comentario(Base):
    """Comentario/observación de un documento, dirigido a quien lo redacta.

    `tipo` distingue la intención (la etiqueta que ve el usuario):
      - 'observacion': lo que hay que CORREGIR. Es obligatorio para pasar el
        documento a OBSERVADO u OBSERVADO_ENVIADO (ver api/documentos.py).
        Nace pendiente y se «levanta» (resuelto=True) al corregir.
      - 'indicacion': el encargo — qué trabajo hay que hacer (al mandar a
        BORRADOR o al asignar un responsable). También se puede dar por hecho.
      - 'nota': comentario libre, no pendiente de nada.

    Nunca se borra: es la trazabilidad de por qué un documento volvió atrás.
    """

    __tablename__ = "comentarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(
        ForeignKey("documentos.id", ondelete="CASCADE")
    )
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    tipo: Mapped[str] = mapped_column(String(20), default="observacion")
    texto: Mapped[str] = mapped_column(Text)
    # A QUÉ PARTE del documento se refiere (Edison 2026-09-05): la clave de un
    # campo del formulario ('destinatario_nombre', 'asunto', 'con_copia'…) o
    # de una sección ('cuerpo', 'anexos', 'formato', 'archivos'). Vacío = el
    # documento en general. Con esto el editor pinta cada observación JUNTO
    # al campo que hay que corregir, y quien corrige no tiene que adivinar.
    seccion: Mapped[str] = mapped_column(String(40), default="")
    # Estado al que se movió el documento con este comentario ("" si el
    # comentario se dejó sin cambiar de estado).
    estado_destino: Mapped[str] = mapped_column(String(20), default="")
    # A quién va dirigido (el responsable del momento), si se indicó.
    dirigido_a: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    resuelto: Mapped[bool] = mapped_column(default=False)
    resuelto_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    resuelto_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Respuesta de quien corrigió (cómo se levantó la observación).
    respuesta: Mapped[str] = mapped_column(Text, default="")
    # Qué dijo quien OBSERVÓ al ver la subsanación (Edison 2026-09-05):
    # '' = aún no la revisó · 'conforme' · (si sigue pendiente, la observación
    # se reabre y vuelve a resuelto=False).
    conformidad: Mapped[str] = mapped_column(String(20), default="")
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Notificacion(Base):
    """Aviso PERSONAL dentro del sistema (Edison 2026-09-05): «te observaron el
    documento», «subsanaron tu observación, revísala», «dieron conformidad».
    No hay correo ni mensajería externa: la campana de la bandeja los muestra
    y quedan como leídos al abrirlos. Es trazabilidad, no chat: nunca se
    borran, solo se marcan leídos."""

    __tablename__ = "notificaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    documento_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="CASCADE"), nullable=True
    )
    # observacion | subsanacion | conformidad | reapertura | indicacion
    # Aviso de un PROYECTO (mención, tarea, fase) en vez de un documento.
    proyecto_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), default="")
    texto: Mapped[str] = mapped_column(Text)
    # Dónde se hace el trabajo, dentro del proyecto (2026-10-01): «parte:<clave>»,
    # «tarea:<id>», «fase:<id>», «conversacion», «resumen». Abrir el aviso lleva
    # ahí directamente, sin buscar.
    destino: Mapped[str] = mapped_column(String(80), default="")
    leida: Mapped[bool] = mapped_column(default=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Anuncio(Base):
    """Aviso a TODOS que pide una acción (2026-10-05): «llegó una actualización,
    recargue». Sale en el centro de la pantalla de cada persona con un solo botón;
    cada navegador recuerda el último que vio. Uno vigente a la vez: publicar uno
    nuevo retira el anterior. Nunca se borran (trazabilidad)."""

    __tablename__ = "anuncios"

    id: Mapped[int] = mapped_column(primary_key=True)
    texto: Mapped[str] = mapped_column(String(300))
    # recargar | entendido — el botón que se ofrece.
    accion: Mapped[str] = mapped_column(String(20), default="entendido")
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    activo: Mapped[bool] = mapped_column(default=True)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    vence_en: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Asignacion(Base):
    """Historial de responsables de un documento (append-only).

    La fila más reciente es el responsable vigente; `documentos.responsable_id`
    lo cachea para que la bandeja no tenga que consultar esta tabla por fila.
    """

    __tablename__ = "asignaciones_documento"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(
        ForeignKey("documentos.id", ondelete="CASCADE")
    )
    # NULL = se quitó el responsable (el documento queda sin dueño).
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    asignado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    nota: Mapped[str] = mapped_column(Text, default="")
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# =====================================================================
#  PROYECTOS (plataforma, piloto 2026-10-01)
# ---------------------------------------------------------------------
#  Un PROYECTO es un trabajo con fases, tareas, equipo y partes redactadas
#  en colaboración, que termina en uno o varios documentos (Edison
#  2026-10-01: «personas + proyectos + documentos + tareas + datos +
#  conocimiento + seguimiento + trazabilidad»). El primer tipo es el
#  PROYECTO DE LEY: sus fases salen del procedimiento oficial y sus partes
#  del esquema `proyecto-de-ley` del ecosistema (escritura/esquemas/), el
#  mismo que valida la plantilla LaTeX del marco. Todo es ADITIVO: tablas
#  nuevas, sin tocar las de la gestión documental; se relaciona con ella
#  por `proyecto_documentos`. Las fases, partes y requisitos de cada tipo
#  son DATOS (servicios/proyectos_plantillas.py), no código.
# =====================================================================


class Proyecto(Base):
    __tablename__ = "proyectos"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(30), default="proyecto_de_ley")
    # Código interno estable (PL-2026-001); el número oficial llega al presentarlo.
    codigo: Mapped[str] = mapped_column(String(30), unique=True)
    titulo: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(30), default="en_elaboracion")
    numero_oficial: Mapped[str] = mapped_column(String(60), default="")
    fecha_presentacion: Mapped[str] = mapped_column(String(20), default="")
    # Ficha: problema, objetivo, propuesta, autor, grupo, cámara, comisiones…
    datos: Mapped[dict] = mapped_column(JSONB, default=dict)
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Fase 5 (2026-10-01): edición simultánea de las partes (Yjs/Hocuspocus).
    # Apagada por defecto: se enciende un proyecto, se prueba y se extiende.
    colaboracion: Mapped[bool] = mapped_column(default=True)
    # Eliminado (2026-10-01): se retira, no se borra; deja de listarse.
    eliminado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    eliminado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)


class ProyectoMiembro(Base):
    """Equipo del proyecto: responsable, redactor, revisor, colaborador."""

    __tablename__ = "proyecto_miembros"
    __table_args__ = (UniqueConstraint("proyecto_id", "usuario_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    rol: Mapped[str] = mapped_column(String(20), default="colaborador")


class ProyectoFase(Base):
    """Fase del proyecto, copiada de la plantilla de su tipo al crearlo."""

    __tablename__ = "proyecto_fases"

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer)
    clave: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    # interna = dentro de la entidad; congreso = tras presentarlo (seguimiento).
    ambito: Mapped[str] = mapped_column(String(20), default="interna")
    # pendiente | en_curso | hecha | omitida
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    inicio: Mapped[str] = mapped_column(String(10), default="")
    limite: Mapped[str] = mapped_column(String(10), default="")
    # Requisitos verificables de la fase: [{texto, fuente, hecho}]
    requisitos: Mapped[list] = mapped_column(JSONB, default=list)
    depende_de: Mapped[list] = mapped_column(JSONB, default=list)


class ProyectoTarea(Base):
    __tablename__ = "proyecto_tareas"

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    fase_id: Mapped[int | None] = mapped_column(
        ForeignKey("proyecto_fases.id", ondelete="SET NULL"), nullable=True
    )
    # Parte del texto a la que se refiere (clave de sección), si alguna.
    seccion: Mapped[str] = mapped_column(String(40), default="")
    titulo: Mapped[str] = mapped_column(Text)
    detalle: Mapped[str] = mapped_column(Text, default="")
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    # por_hacer | en_curso | hecha
    estado: Mapped[str] = mapped_column(String(20), default="por_hacer")
    limite: Mapped[str] = mapped_column(String(10), default="")
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    hecha_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProyectoSeccion(Base):
    """Una PARTE del texto (componente del esquema: fórmula legal, fundamentos,
    costo-beneficio…). Cada parte se edita por separado, con su responsable,
    su estado y su candado de edición: así varias personas trabajan a la vez
    en partes distintas sin pisarse, y se sabe quién está en cuál."""

    __tablename__ = "proyecto_secciones"
    __table_args__ = (UniqueConstraint("proyecto_id", "clave"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    clave: Mapped[str] = mapped_column(String(40))
    titulo: Mapped[str] = mapped_column(String(160))
    grupo: Mapped[str] = mapped_column(String(40), default="")
    orden: Mapped[int] = mapped_column(Integer)
    obligatoria: Mapped[bool] = mapped_column(default=True)
    contenido: Mapped[dict] = mapped_column(JSONB, default=dict)
    # borrador | en_revision | observada | aprobada
    estado: Mapped[str] = mapped_column(String(20), default="borrador")
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, default=0)
    # Candado blando: quién la tiene abierta para escribir y desde cuándo.
    editando_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    editando_desde: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actualizado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    actualizado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Edición simultánea (fase 5). `borrador` es el «borrador vivo»: el JSON
    # que deriva el servidor compartido de lo que se va escribiendo, SIN ser
    # versión («Guardar» sigue creando la versión con nota). `colab_gen` es la
    # generación del texto compartido: sube cada vez que el contenido se
    # reemplaza por fuera de Yjs (encender/apagar, restaurar, guardar por
    # turnos) y va en el nombre del documento compartido, así un estado viejo
    # nunca se mezcla con uno nuevo (servicios/colab.py).
    borrador: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    borrador_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    borrador_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    colab_gen: Mapped[int] = mapped_column(Integer, default=0)


class ProyectoSeccionVersion(Base):
    """Cada guardado de una parte (append-only): quién, cuándo, qué texto."""

    __tablename__ = "proyecto_seccion_versiones"

    id: Mapped[int] = mapped_column(primary_key=True)
    seccion_id: Mapped[int] = mapped_column(
        ForeignKey("proyecto_secciones.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(Integer)
    contenido: Mapped[dict] = mapped_column(JSONB, default=dict)
    nota: Mapped[str] = mapped_column(String(200), default="")
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    # Linaje (Edison 2026-10-01, §9): de qué versión parte (la anterior al
    # guardar; la elegida al restaurar: «v5 restaurada desde v2») y en qué
    # estado quedó la parte.
    basada_en: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="")
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ProyectoFuente(Base):
    """Fuente que sustenta una afirmación: norma, dato, estudio, documento.
    `clave_externa` enlaza con el ecosistema (calibre:ID, zotero:KEY,
    datafw:paquete) sin copiar nada."""

    __tablename__ = "proyecto_fuentes"

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(20), default="norma")
    referencia: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text, default="")
    clave_externa: Mapped[str] = mapped_column(String(120), default="")
    seccion: Mapped[str] = mapped_column(String(40), default="")
    nota: Mapped[str] = mapped_column(Text, default="")
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ProyectoDocumento(Base):
    """Documento de la gestión documental ligado al proyecto (el oficio que
    pide opinión, el PDF presentado, el cargo…), sin duplicar nada."""

    __tablename__ = "proyecto_documentos"
    __table_args__ = (UniqueConstraint("proyecto_id", "documento_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    documento_id: Mapped[int] = mapped_column(ForeignKey("documentos.id", ondelete="CASCADE"))
    rol: Mapped[str] = mapped_column(String(60), default="")
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))


class ProyectoArchivo(Base):
    """Archivo del proyecto (el PDF presentado, antecedentes, estudios)."""

    __tablename__ = "proyecto_archivos"

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    categoria: Mapped[str] = mapped_column(String(30), default="")
    etiqueta: Mapped[str] = mapped_column(Text, default="")
    nombre_archivo: Mapped[str] = mapped_column(Text)
    tamano: Mapped[int] = mapped_column(Integer, default=0)
    # Huella SHA-256 del archivo al recibirlo (conservación: prueba que el
    # firmado o el generado que se guarda es el mismo que se subió; 2026-10-01).
    sha256: Mapped[str] = mapped_column(String(64), default="")
    # Vigencia (2026-10-06): huella del CONTENIDO del que salió un PDF generado
    # (vigencia.huella_proyecto) y, en un firmado, la del generado sobre el que
    # se firmó (`base_id`). '' = archivo anterior: se cae a las fechas.
    huella: Mapped[str] = mapped_column(String(90), default="", server_default="")
    base_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    subido_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    subido_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ProyectoActividad(Base):
    """Bitácora del proyecto (append-only) y conversación: los comentarios
    son actividad con `tipo='comentario'`, con menciones (`@usuario`) que
    notifican. Una sola línea de tiempo: quién hizo o dijo qué, cuándo, en
    qué parte."""

    __tablename__ = "proyecto_actividad"

    id: Mapped[int] = mapped_column(primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(ForeignKey("proyectos.id", ondelete="CASCADE"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    tipo: Mapped[str] = mapped_column(String(30))
    seccion: Mapped[str] = mapped_column(String(40), default="")
    texto: Mapped[str] = mapped_column(Text, default="")
    menciones: Mapped[list] = mapped_column(JSONB, default=list)
    resuelto: Mapped[bool] = mapped_column(default=False)
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ColabEstado(Base):
    """Estado Yjs (bytes) de un texto en edición simultánea (fase 5). Una fila
    por documento compartido: `pl:<proyecto>:<parte>:<generación>`. Solo lo
    escribe la API, a pedido del servidor de colaboración; el contenido que
    cuenta sigue siendo el JSON de la parte (versiones y borrador vivo)."""

    __tablename__ = "colab_estado"

    documento: Mapped[str] = mapped_column(String(120), primary_key=True)
    estado: Mapped[bytes] = mapped_column(LargeBinary)
    actualizado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OpEnlace(Base):
    """Un elemento de Qillqa reflejado en OpenProject (2026-10-02).

    `clave` es el localizador estable que también se escribe en el campo «Ruta en
    disco» del paquete de trabajo (`sgdp:doc:12`, `sgdp:pl:3`, `sgdp:pl-fase:40`,
    `sgdp:pl-tarea:7`): el mismo que usaba el puente de `openproject/`, así lo ya
    sincronizado se reconoce y no se duplica. `huella` resume lo último enviado:
    si no cambia, no se vuelve a escribir. `op_cerrado` recuerda el último estado
    visto en OpenProject para devolver a Qillqa solo lo que cambió ALLÁ."""

    __tablename__ = "op_enlaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    clave: Mapped[str] = mapped_column(String(60), unique=True)
    wp_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    huella: Mapped[str] = mapped_column(String(64), default="")
    op_cerrado: Mapped[bool | None] = mapped_column(nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")
    intentos: Mapped[int] = mapped_column(Integer, default=0)
    sincronizado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OpAsignacionVista(Base):
    """Asignaciones de OpenProject ya avisadas en la campana de Qillqa: un paquete
    asignado a una persona se avisa una vez, no en cada revisión."""

    __tablename__ = "op_asignaciones_vistas"
    __table_args__ = (UniqueConstraint("wp_id", "op_usuario_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    wp_id: Mapped[int] = mapped_column(Integer)
    op_usuario_id: Mapped[int] = mapped_column(Integer)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --- Semana de representación (2026-10-02) ---------------------------------------
# La semana se registra y se informa DENTRO del sistema (Edison 2026-10-02: «que la
# Semana de Representación sea el lugar donde se registra la información y también
# donde se construye y genera su informe final»). El modelo es el MISMO del generador
# del marco (generadores/informe-sr, docs/arquitectura.md §3): cada fila guarda en
# `datos` el diccionario que el generador lee de su YAML, sin traducirlo, para que
# exportar al expediente (servicios/semanas_sr.py) devuelva exactamente lo importado.
# Solo se sacan a columnas el código, el orden y los vínculos con otras tablas.


class SemanaSR(Base):
    """Una semana de representación: su expediente (`expediente.yaml`), los datos
    generales y la prosa del informe (`informe.yaml`) y el resto de cada YAML de
    datos que no es su lista (días de `actividades.yaml`, `_meta` y portada de
    `fotos.yaml`)."""

    __tablename__ = "semanas_sr"

    id: Mapped[int] = mapped_column(primary_key=True)
    # SR-02; el ISR que la informa es ISR-02 (mismo número).
    codigo: Mapped[str] = mapped_column(String(10), unique=True)
    numero: Mapped[int] = mapped_column(Integer)
    # Carpeta del expediente en ISR_RAIZ: 2026-09_SR-02_educacion-superior.
    carpeta: Mapped[str] = mapped_column(String(200), unique=True)
    # borrador | activo | hecho | archivado (NORMATIVA §2.1, como expediente.yaml).
    estado: Mapped[str] = mapped_column(String(20), default="borrador")
    expediente: Mapped[dict] = mapped_column(JSONB, default=dict)
    informe: Mapped[dict] = mapped_column(JSONB, default=dict)
    # {"actividades": {"dias": […]}, "pedidos": {}, "fotos": {"_meta": …, "portada": …}}
    resto: Mapped[dict] = mapped_column(JSONB, default=dict)
    # El ISR registrado en la gestión documental (serie ISR), cuando se numera.
    documento_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="SET NULL"), nullable=True
    )
    # Control de concurrencia, como documentos.version_contenido.
    version_contenido: Mapped[int] = mapped_column(Integer, default=0)
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ActividadSR(Base):
    """Una actividad (A-NN) de `actividades.yaml`."""

    __tablename__ = "actividades_sr"
    __table_args__ = (UniqueConstraint("semana_id", "codigo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    semana_id: Mapped[int] = mapped_column(ForeignKey("semanas_sr.id", ondelete="CASCADE"))
    codigo: Mapped[str] = mapped_column(String(10))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    datos: Mapped[dict] = mapped_column(JSONB, default=dict)


class PedidoSR(Base):
    """Un pedido (P-NNN) de `pedidos.yaml`. `documento_id` es el oficio con que se
    derivó (relación real con la gestión documental; `datos.documento_salida`
    guarda su código para el informe)."""

    __tablename__ = "pedidos_sr"
    __table_args__ = (UniqueConstraint("semana_id", "codigo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    semana_id: Mapped[int] = mapped_column(ForeignKey("semanas_sr.id", ondelete="CASCADE"))
    codigo: Mapped[str] = mapped_column(String(10))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    datos: Mapped[dict] = mapped_column(JSONB, default=dict)
    documento_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="SET NULL"), nullable=True
    )


class FotoSR(Base):
    """Una fotografía (F-NNN) de `fotos.yaml`; el original vive en el banco
    (`resto.fotos._meta.banco` + `datos.origen`), nunca en la base."""

    __tablename__ = "fotos_sr"
    __table_args__ = (UniqueConstraint("semana_id", "codigo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    semana_id: Mapped[int] = mapped_column(ForeignKey("semanas_sr.id", ondelete="CASCADE"))
    codigo: Mapped[str] = mapped_column(String(10))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    datos: Mapped[dict] = mapped_column(JSONB, default=dict)


class AlbumFoto(Base):
    """Un álbum de la Fototeca (2026-10-06): agrupa fotos por evento o tema
    («Semana SR-02», «Sesión del Pleno 12-03»). Una foto está en un álbum o en
    ninguno; quitar el álbum no toca sus fotos."""

    __tablename__ = "fototeca_albumes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    # Fecha del evento (texto AAAA-MM-DD, como las demás fechas de la plataforma).
    fecha: Mapped[str] = mapped_column(String(10), default="")
    # Sin clave foránea: la portada puede ir a la papelera sin bloquear nada.
    portada_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    creado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Foto(Base):
    """Una fotografía (o un video) de la Fototeca (2026-10-06; servicios/fototeca.py).

    El ORIGINAL se guarda una sola vez (nombre = SHA-256) y nunca se modifica:
    toda edición vive en `ajustes` y se aplica al servir la vista o al exportar.
    Eliminar es mandar a la papelera (`eliminada_en`); no hay borrado físico."""

    __tablename__ = "fototeca_fotos"

    id: Mapped[int] = mapped_column(primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    nombre_original: Mapped[str] = mapped_column(String(300), default="")
    # Ruta relativa a FOTOTECA_DIR (originales/ab/abcdef….jpg).
    archivo: Mapped[str] = mapped_column(String(300))
    # 'foto' | 'video' (2026-10-06). Un video no se edita aquí (sin `ajustes`): su
    # miniatura y su vista salen de un fotograma (póster) y se reproduce en el visor.
    medio: Mapped[str] = mapped_column(String(10), default="foto", server_default="foto")
    # Duración en segundos (solo videos).
    duracion: Mapped[float | None] = mapped_column(nullable=True)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    # Medidas ya giradas según EXIF (como se ve la foto, sin ajustes).
    ancho: Mapped[int] = mapped_column(Integer, default=0)
    alto: Mapped[int] = mapped_column(Integer, default=0)
    # DateTimeOriginal del EXIF; sin él, la hora de subida (`fecha_exif` dice cuál).
    tomada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fecha_exif: Mapped[bool] = mapped_column(default=False)
    camara: Mapped[str] = mapped_column(String(160), default="")
    lat: Mapped[float | None] = mapped_column(nullable=True)
    lon: Mapped[float | None] = mapped_column(nullable=True)
    # Lectura del EXIF útil para la ficha (exposición, ISO, focal…); solo lectura.
    exif: Mapped[dict] = mapped_column(JSONB, default=dict)
    titulo: Mapped[str] = mapped_column(String(300), default="")
    # El pie de foto.
    descripcion: Mapped[str] = mapped_column(Text, default="")
    lugar: Mapped[str] = mapped_column(String(200), default="")
    etiquetas: Mapped[list] = mapped_column(JSONB, default=list)
    personas: Mapped[list] = mapped_column(JSONB, default=list)
    # por_revisar | publica | reservada (como las fotos de la semana).
    estado: Mapped[str] = mapped_column(String(20), default="por_revisar")
    favorita: Mapped[bool] = mapped_column(default=False)
    calificacion: Mapped[int] = mapped_column(Integer, default=0)
    album_id: Mapped[int | None] = mapped_column(
        ForeignKey("fototeca_albumes.id", ondelete="SET NULL"), nullable=True
    )
    # Edición NO destructiva: {rotar, voltear, voltear_v, enderezar, recorte, brillo, contraste, saturacion}.
    ajustes: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Dónde se usa: [{tipo: semana|proyecto|documento, id, codigo?, etiqueta?}].
    vinculos: Mapped[list] = mapped_column(JSONB, default=list)
    subido_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    eliminada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Relacion(Base):
    """Relación GENÉRICA entre dos cosas del sistema (2026-10-06, «Automatización»):
    lo que un texto cita o menciona (una ley, un libro, un documento, una persona…) y lo
    que el sistema asocia solo (el oficio que presenta un informe SR). Origen y destino
    van con el MISMO identificador que el mapa de relaciones (`doc:12`, `pl:3`, `sr:2`,
    `persona:7`, `inst:4`, `pedido:9`, `norma:ley-27795`, `libro:10086`): así el mapa
    (servicios/grafo.py) las lee sin traducir nada.

    `fuente` dice quién la creó: 'editor' (un nodo `referencia` del texto; se sincroniza
    en cada guardado: si el nodo desaparece, la relación también), 'texto' (insertada en
    un área de texto plano, p. ej. los textos del informe SR; se depura si el texto ya no
    aparece), 'auto' (asociación automática del sistema) o 'manual'. `contexto` separa los
    textos de un mismo origen (`cuerpo`, `seccion:fundamentos`, `informe:resumen`): quitar
    una cita de una parte no borra la misma cita de otra. Las manuales nunca las toca la
    sincronización. `datos` guarda lo que el mapa muestra sin volver a buscar (cita APA,
    enlace de la norma)."""

    __tablename__ = "relaciones"
    __table_args__ = (UniqueConstraint("origen", "destino", "tipo", "contexto", "fuente"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    origen: Mapped[str] = mapped_column(String(80), index=True)
    destino: Mapped[str] = mapped_column(String(120), index=True)
    # cita | referencia_normativa | menciona | presenta_informe | …
    tipo: Mapped[str] = mapped_column(String(30), default="menciona")
    contexto: Mapped[str] = mapped_column(String(80), default="")
    fuente: Mapped[str] = mapped_column(String(20), default="editor")
    automatica: Mapped[bool] = mapped_column(default=True)
    texto: Mapped[str] = mapped_column(Text, default="")
    datos: Mapped[dict] = mapped_column(JSONB, default=dict)
    creado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Entrada(Base):
    """Documento RECIBIDO en la bandeja de entrada (2026-10-06; servicios/entradas.py).

    Lo que llega a la entidad sin que el despacho lo haya pedido o en respuesta a un
    oficio propio: cartas de gremios, pedidos de municipios, invitaciones, citaciones,
    respuestas de entidades. Es una entidad APARTE de `Documento` (docs/decisiones.md,
    2026-10-06): no se numera ni pasa por el flujo de redacción y firma; tiene su propio
    ciclo (nueva → en atención → respondida | archivada), un tipo de atención, un
    responsable y un plazo. Su PDF vive en el archivo documental
    (`<MDD_DOCUMENTOS>/recibidos/entradas/AAAA-MM/`), con la ruta RELATIVA a esa raíz.

    Los vínculos con los documentos propios son relaciones genéricas (`relaciones`,
    `doc:N` → `entrada:M`, tipo `responde`): las crea «Responder» y la conciliación
    automática cuando un oficio cita en su Referencia el número STD de la entrada."""

    __tablename__ = "entradas"

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int] = mapped_column(Integer, default=1)
    periodo: Mapped[str] = mapped_column(String(20), default="")
    # El PDF: ruta relativa a la raíz del archivo documental (config.raiz_documentos()).
    archivo: Mapped[str] = mapped_column(Text, default="")
    nombre_original: Mapped[str] = mapped_column(String(300), default="")
    # Huella del PDF: dos subidas del mismo archivo son la misma entrada.
    sha256: Mapped[str] = mapped_column(String(64), unique=True)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    paginas: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Texto extraído del PDF (búsqueda); vacío si es un escaneo sin capa de texto.
    texto: Mapped[str] = mapped_column(Text, default="")
    # N.º de registro del STD del Congreso (7 dígitos, prefijo del nombre al descargarlo).
    std_numero: Mapped[str] = mapped_column(String(20), default="", index=True)
    # Tipo y número del documento de origen («Oficio N° 0456-2026-UGEL-H/D»).
    documento: Mapped[str] = mapped_column(String(300), default="")
    # oficio | carta | solicitud | invitacion | citacion | informe | otro
    clase: Mapped[str] = mapped_column(String(20), default="otro")
    # Qué es para el despacho (2026-10-18): comunicacion | respuesta | invitacion | seguimiento |
    # pronunciamiento | anexo; vacío = sin clasificar. `requiere_revision`: la categoría la propuso la IA con
    # poca confianza o nadie la confirmó. `responde_a_documento_id`: el oficio PROPIO al que este recibido
    # responde (lo contrario de `respuesta_documento_id`, que es el oficio propio que responde a este).
    categoria: Mapped[str] = mapped_column(String(30), default="")
    requiere_revision: Mapped[bool] = mapped_column(Boolean, default=False)
    responde_a_documento_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="SET NULL"), nullable=True
    )
    # std | correo | mesa_partes | mano | otro
    via: Mapped[str] = mapped_column(String(20), default="std")
    # Remitente: del directorio si coincide; si no, solo el texto.
    remitente: Mapped[str] = mapped_column(String(300), default="")
    remitente_cargo: Mapped[str] = mapped_column(String(300), default="")
    remitente_persona_id: Mapped[int | None] = mapped_column(
        ForeignKey("personas.id", ondelete="SET NULL"), nullable=True
    )
    remitente_institucion_id: Mapped[int | None] = mapped_column(
        ForeignKey("instituciones.id", ondelete="SET NULL"), nullable=True
    )
    # Fechas como texto AAAA-MM-DD, como en el resto de la plataforma.
    fecha_documento: Mapped[str] = mapped_column(String(10), default="")
    fecha_recepcion: Mapped[str] = mapped_column(String(10), default="")
    asunto: Mapped[str] = mapped_column(Text, default="")
    referencia: Mapped[str] = mapped_column(Text, default="")
    resumen: Mapped[str] = mapped_column(Text, default="")
    # responder | agendar | emitir_opinion | interceder | conocimiento
    atencion: Mapped[str] = mapped_column(String(20), default="conocimiento")
    responsable_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    plazo: Mapped[str] = mapped_column(String(10), default="")
    # nueva | en_atencion | respondida | archivada
    estado: Mapped[str] = mapped_column(String(20), default="nueva", index=True)
    # Grupo de cartas iguales (p. ej. la campaña de los sindicatos sobre un PL).
    campana: Mapped[str] = mapped_column(String(160), default="", index=True)
    # El oficio propio que la responde (también está en `relaciones`; esto es el atajo).
    respuesta_documento_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos.id", ondelete="SET NULL"), nullable=True
    )
    nota: Mapped[str] = mapped_column(Text, default="")
    creado_por: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    respondida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archivada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Cuándo se avisó de que venció el plazo sin respuesta (un aviso por vencimiento).
    aviso_vencida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # De dónde salió cada campo de la ficha (2026-10-11, «pegar resultado»): {campo: 'documento' (reglas
    # sobre el PDF) | 'pegado' (resultado de un prompt, aplicado por una persona) | 'persona'}.
    origen_campos: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class Pegado(Base):
    """Un resultado de prompt pegado en el sistema y aplicado (2026-10-11; servicios/pegado,
    `docs/plataforma/propuesta-automatizacion.md` §3.4). Es la trazabilidad del mecanismo
    común: el texto íntegro que se pegó, el `tipo` del contrato, lo que el sistema propuso
    y lo que la persona aceptó, sobre qué entidad (`entrada:12`, `evento:7`, `doc:95`,
    `sr:2`) y quién. Nunca se borra; se lee desde el historial de la entidad. La IA la usa
    la persona fuera del sistema: aquí solo queda lo que trajo."""

    __tablename__ = "pegados"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(60), index=True)
    version: Mapped[int] = mapped_column(default=1)
    fuente: Mapped[str] = mapped_column(String(20), default="yaml")   # yaml | rotulos
    texto: Mapped[str] = mapped_column(Text, default="")
    campos_propuestos: Mapped[dict] = mapped_column(JSONB, default=dict)
    campos_aplicados: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Lo que la persona rechazó o dejó en duda, para aprender qué falla del prompt.
    rechazados: Mapped[list] = mapped_column(JSONB, default=list)
    entidad: Mapped[str] = mapped_column(String(80), default="", index=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Actuacion(Base):
    """Una actuación del seguimiento de un documento propio (`doc:N`) o de un recibido
    (`entrada:M`) (2026-10-11; `docs/plataforma/propuesta-automatizacion.md` §3.6): lo que
    pasó entre los hitos fijos del trámite (una llamada, una reiteración, un compromiso de
    la entidad, una respuesta, una derivación). `origen` dice quién la trajo: 'persona'
    (escrita a mano), 'pegado' (del resultado de un prompt; no cuenta en el estado del
    trámite hasta que alguien la confirma: `confirmada_por`) o 'sistema'. Nada se borra:
    `retirada_en` la aparta."""

    __tablename__ = "actuaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    entidad: Mapped[str] = mapped_column(String(80), index=True)
    fecha: Mapped[str] = mapped_column(String(10), default="")  # AAAA-MM-DD
    # envio | reiteracion | llamada | reunion | respuesta | compromiso | derivacion | nota
    clase: Mapped[str] = mapped_column(String(20), default="nota")
    texto: Mapped[str] = mapped_column(Text, default="")
    fuente: Mapped[str] = mapped_column(String(200), default="")
    origen: Mapped[str] = mapped_column(String(20), default="persona")  # persona | pegado | sistema
    confirmada_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    confirmada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pegado_id: Mapped[int | None] = mapped_column(ForeignKey("pegados.id", ondelete="SET NULL"), nullable=True)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    retirada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EventoSistema(Base):
    """Un hecho del sistema que otros módulos pueden escuchar (2026-10-12, fase 7;
    `docs/plataforma/propuesta-automatizacion.md` §4): «se registró un recibido», «se numeró un
    documento», «se agendó un evento». Lo emite el módulo dentro de su transacción
    (`servicios/eventos_sistema.emitir`) con una `clave` única de idempotencia: un mismo hecho
    nunca produce dos acciones. `acciones` anota lo que las reglas hicieron con él."""

    __tablename__ = "eventos_sistema"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(60), index=True)
    entidad: Mapped[str] = mapped_column(String(80), index=True, default="")
    datos: Mapped[dict] = mapped_column(JSONB, default=dict)
    clave: Mapped[str] = mapped_column(String(160), unique=True)
    emitido_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    acciones: Mapped[list] = mapped_column(JSONB, default=list)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    procesado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReglaEvento(Base):
    """Qué hacer cuando ocurre un evento del sistema (2026-10-12, fase 7): una fila por regla,
    editable en Administración → Reglas y siempre apagable (lo automático se muestra y se puede
    apagar). `condicion` es un mapa simple {campo: valor} sobre `datos` del evento (vacío = siempre);
    `accion`: 'notificar' (a `destino`: responsable | autor | equipo | rol:<rol> | usuario:<id>),
    'tarea' (crea una tarea para `destino` con `texto` como título) o 'publicar' (en el canal
    `destino` del chat, fase 8). `texto` es una plantilla con {campos} del evento. Las de fábrica
    (`de_fabrica`) se siembran una vez y no se vuelven a crear si alguien las borra."""

    __tablename__ = "reglas_evento"

    id: Mapped[int] = mapped_column(primary_key=True)
    evento: Mapped[str] = mapped_column(String(60), index=True)
    nombre: Mapped[str] = mapped_column(String(160), default="")
    condicion: Mapped[dict] = mapped_column(JSONB, default=dict)
    accion: Mapped[str] = mapped_column(String(20), default="notificar")
    destino: Mapped[str] = mapped_column(String(120), default="responsable")
    texto: Mapped[str] = mapped_column(Text, default="")
    activa: Mapped[bool] = mapped_column(default=True)
    de_fabrica: Mapped[str] = mapped_column(String(60), default="")   # clave de siembra; '' = la creó una persona
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PiezaPrensa(Base):
    """Una pieza de prensa registrada en el módulo Prensa (2026-10-12, fase 9.4; auditoría PR-01):
    una noticia local, nacional o internacional procesada con el prompt de prensa, una nota de prensa
    o un comunicado de la entidad, una entrevista o una cobertura. Llega pegada (chat o módulo) o se
    escribe a mano; `estado` sigue su vida (`registrada` → `en_trabajo` → `publicada` | `archivada`).
    Lo publicado en redes se anota en `publicado_en` (JSONB: [{medio, enlace, fecha}])."""

    __tablename__ = "prensa_piezas"

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int] = mapped_column(Integer, default=1)
    clase: Mapped[str] = mapped_column(String(30), default="noticia_local", index=True)
    titular: Mapped[str] = mapped_column(String(300))
    bajada: Mapped[str] = mapped_column(Text, default="")
    cuerpo: Mapped[str] = mapped_column(Text, default="")
    fuente: Mapped[str] = mapped_column(String(300), default="")
    enlace: Mapped[str] = mapped_column(Text, default="")
    fecha: Mapped[str] = mapped_column(String(10), default="")
    ambito: Mapped[str] = mapped_column(String(200), default="")
    temas: Mapped[list] = mapped_column(JSONB, default=list)
    relevancia: Mapped[str] = mapped_column(Text, default="")
    accion_sugerida: Mapped[str] = mapped_column(String(30), default="")
    cita: Mapped[str] = mapped_column(Text, default="")
    estado: Mapped[str] = mapped_column(String(20), default="registrada", index=True)
    responsable_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    publicado_en: Mapped[list] = mapped_column(JSONB, default=list)
    origen: Mapped[str] = mapped_column(String(20), default="persona")   # persona | pegado | chat
    pegado_id: Mapped[int | None] = mapped_column(ForeignKey("pegados.id", ondelete="SET NULL"), nullable=True)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Uso(Base):
    """ESTADÍSTICAS DE USO (2026-10-19, Edison): telemetría propia, sin servicios externos y SIN
    CONTENIDO. Cada fila es un hecho de la web: una vista de un módulo (con cuánto duró), un error de
    JavaScript (mensaje y pila recortados) o el arranque de una pestaña; con el aparato (ancho, alto,
    clase) y la versión de la web. Nunca textos de documentos, asuntos, nombres de terceros, mensajes
    del chat ni búsquedas: `ruta` lleva los ids reemplazados por «:id» y sin query. Retención acotada
    (`servicios/uso.py::RETENCION_DIAS`). Lo que se recoge y lo que no: docs/decisiones.md."""

    __tablename__ = "uso"

    id: Mapped[int] = mapped_column(primary_key=True)
    momento: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    # vista | error | arranque
    accion: Mapped[str] = mapped_column(String(20), default="vista")
    modulo: Mapped[str] = mapped_column(String(30), default="")
    ruta: Mapped[str] = mapped_column(String(120), default="")
    duracion_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # celular | tableta | escritorio, y el tamaño de la ventana.
    aparato: Mapped[str] = mapped_column(String(12), default="")
    ancho: Mapped[int] = mapped_column(Integer, default=0)
    alto: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[str] = mapped_column(String(24), default="")
    # Solo en los errores: mensaje y pila recortados.
    detalle: Mapped[str] = mapped_column(String(700), default="")


"""Modelos de la base de datos de Qillqa.

Los de Gestión documental, Proyectos de ley y la Semana de representación (Qillqasqa) viven en app/modelos_qillqasqa.py
desde la fase 10.2b (Q5a, 2026-10-21), con su Base propia.

Todas las tablas centrales llevan despacho_id y periodo desde el dia 1
(multi-despacho futuro). El contenido del documento es JSON de TipTap
(JSONB): la fuente de verdad del contenido, nunca LaTeX.
"""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
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


class Notificacion(Base):
    """Aviso PERSONAL dentro del sistema (Edison 2026-09-05): «te observaron el
    documento», «subsanaron tu observación, revísala», «dieron conformidad».
    No hay correo ni mensajería externa: la campana de la bandeja los muestra
    y quedan como leídos al abrirlos. Es trazabilidad, no chat: nunca se
    borran, solo se marcan leídos."""

    __tablename__ = "notificaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    # El documento es de Gestión documental (Qillqasqa Q5a): su número, sin clave foránea.
    documento_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True
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


class OpEnlace(Base):
    """Un elemento de Qillqa reflejado en OpenProject (2026-10-02).

    `clave` es el localizador estable que también se escribe en el campo «Ruta en
    disco» del paquete de trabajo (`qillqa:doc:12`, `qillqa:pl:3`, `qillqa:pl-fase:40`,
    `qillqa:pl-tarea:7`): el mismo que usaba el puente de `openproject/`, así lo ya
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


# AlbumFoto y Foto viven desde el 2026-10-19 en la base propia de la Mediateca (app/modelos_mediateca.py); desde la
# fase 10.2b nadie fuera de la Mediateca los importa: se piden por «medios.v2» (servicios/fototeca_contrato.py).


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
    # La bandeja de salida durable (fase 10.2b, 2026-10-20; servicios/eventos_bandeja.py): el repartidor del
    # anfitrión entrega el evento al bus de Tiqsi, para los módulos que lo escuchan, y anota cuándo o por qué no.
    repartido_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    intentos_reparto: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error_reparto: Mapped[str] = mapped_column(Text, default="", server_default="")


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

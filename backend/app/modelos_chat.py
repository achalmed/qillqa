"""backend/app/modelos_chat.py — tablas del CHAT institucional (2026-10-12, fase 8;
`docs/plataforma/propuesta-automatizacion.md` §5). Archivo propio con la misma `Base` (como
`modelos_tareas.py`); las crea `create_all` porque `main.py` importa `api/chat.py`.

- `canales`: directo (dos personas), grupo (privado, por membresía) o tema (abierto a todo el
  equipo; puede estar ligado a una entidad del sistema, `pl:3`, `sr:2`, `comision:<clave>`, y
  tener un `padre_id` para subgrupos).
- `canal_miembros`: quién está, con qué papel, hasta dónde leyó (`ultimo_leido_id`) y si lo silenció.
- `mensajes`: texto, hilo (`padre_id`), menciones, `entidad` que presenta (`doc:95`),
  `evento_sistema_id` si lo publicó una regla, editado y eliminado (nada se borra).
- `mensaje_archivos`: lo adjunto REFERENCIA lo que entró por Recibidos o la Fototeca
  (`referencia` = `entrada:M` | `foto:N` | `doc:N`); lo que no es ni documento ni foto va como
  archivo propio (ruta relativa al archivo documental).
- `encuestas` y `encuesta_votos` (2026-10-12, fase 9.6): una encuesta va ligada a UN mensaje (su
  texto es la pregunta); los votos guardan quién votó aunque la encuesta sea anónima (para poder
  quitar el voto), pero la API no lo expone si `anonima`. `cierra_en` cierra sola al pasar la hora.
- `mensaje_archivos.duracion_ms`: la duración de una nota de voz (MediaRecorder no la escribe en el
  webm; la mide el navegador al grabar o `ffprobe` al subir).
- Visto y leído (2026-10-13): `canal_miembros.ultimo_recibido_id` (hasta dónde llegó a algún
  dispositivo de la persona: socket abierto, la lista de chats o el aviso push) junto a
  `ultimo_leido_id`; de ambos sale el ✓ / ✓✓ / ✓✓ leído de cada mensaje propio.
- `canales.categoria` (2026-10-13): la sección de la lista donde va un tema («Documentos»,
  «Agenda», «Legislativo», «Prensa y medios»…), como los temas de un foro.
- `mensajes.tarjeta` (2026-10-13): lo que el sistema publica se pinta como tarjeta ordenada
  ({que, icono, titulo, detalle, meta}); el texto sigue siendo la verdad para buscar y para la lista.
- `suscripciones_push` (2026-10-13): una por persona y dispositivo (el `endpoint` del servicio de
  push del navegador); la que el servicio da por caducada (404/410) se borra sola.
Búsqueda: índice GIN sobre `to_tsvector('spanish', texto)` (main.py).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos import Base


class Canal(Base):
    __tablename__ = "canales"

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int] = mapped_column(Integer, default=1)
    clase: Mapped[str] = mapped_column(String(10), default="tema")          # directo | grupo | tema
    nombre: Mapped[str] = mapped_column(String(120), default="")
    descripcion: Mapped[str] = mapped_column(Text, default="")
    entidad: Mapped[str] = mapped_column(String(80), default="", index=True)  # pl:3, sr:2, comision:educacion…
    padre_id: Mapped[int | None] = mapped_column(ForeignKey("canales.id", ondelete="SET NULL"), nullable=True)
    visibilidad: Mapped[str] = mapped_column(String(10), default="equipo")  # equipo | privado
    # Clave de siembra de los canales de fábrica ('' = lo creó una persona) y clave única de un directo (`u:1-u:4`).
    clave: Mapped[str] = mapped_column(String(80), default="", index=True)
    # Sección de la lista (2026-10-13): Equipo, Documentos, Agenda, Legislativo, Prensa y medios… ('' = sin sección).
    categoria: Mapped[str] = mapped_column(String(30), default="")
    archivado: Mapped[bool] = mapped_column(default=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_mensaje_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CanalMiembro(Base):
    __tablename__ = "canal_miembros"
    __table_args__ = (UniqueConstraint("canal_id", "usuario_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    canal_id: Mapped[int] = mapped_column(ForeignKey("canales.id", ondelete="CASCADE"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    papel: Mapped[str] = mapped_column(String(10), default="miembro")       # admin | miembro
    ultimo_leido_id: Mapped[int] = mapped_column(Integer, default=0)
    # Hasta dónde llegó a un dispositivo de la persona (2026-10-13): el segundo ✓ de lo enviado.
    ultimo_recibido_id: Mapped[int] = mapped_column(Integer, default=0)
    silenciado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unido_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Mensaje(Base):
    __tablename__ = "mensajes"

    id: Mapped[int] = mapped_column(primary_key=True)
    canal_id: Mapped[int] = mapped_column(ForeignKey("canales.id", ondelete="CASCADE"), index=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)  # NULL = el sistema
    padre_id: Mapped[int | None] = mapped_column(ForeignKey("mensajes.id", ondelete="SET NULL"), nullable=True, index=True)
    # Respuesta citada (2026-10-19, Edison: «en los chats personales las respuestas como en WhatsApp,
    # sin generar hilo»): el mensaje al que responde, mostrado citado en la misma conversación.
    responde_a_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    texto: Mapped[str] = mapped_column(Text, default="")
    menciones: Mapped[list] = mapped_column(JSONB, default=list)
    entidad: Mapped[str] = mapped_column(String(80), default="", index=True)
    evento_sistema_id: Mapped[int | None] = mapped_column(ForeignKey("eventos_sistema.id", ondelete="SET NULL"), nullable=True)
    # Acciones que el mensaje automático ofrece: [{"texto": "Abrir", "ruta": "/recibidos?ver=12"}].
    acciones: Mapped[list] = mapped_column(JSONB, default=list)
    respuestas: Mapped[int] = mapped_column(Integer, default=0)
    # Tarjeta de un mensaje del sistema (2026-10-13): {que, icono, titulo, detalle, meta}; {} = texto llano.
    tarjeta: Mapped[dict] = mapped_column(JSONB, default=dict)
    editado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    eliminado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class MensajeArchivo(Base):
    __tablename__ = "mensaje_archivos"

    id: Mapped[int] = mapped_column(primary_key=True)
    mensaje_id: Mapped[int] = mapped_column(ForeignKey("mensajes.id", ondelete="CASCADE"), index=True)
    referencia: Mapped[str] = mapped_column(String(80), default="")       # entrada:M | foto:N | doc:N
    archivo: Mapped[str] = mapped_column(String(500), default="")        # ruta relativa, si no es referencia
    nombre: Mapped[str] = mapped_column(String(300), default="")
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    duracion_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)   # notas de voz (ALTER en main.py)


class MensajeReaccion(Base):
    __tablename__ = "mensaje_reacciones"
    __table_args__ = (UniqueConstraint("mensaje_id", "usuario_id", "emoji"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    mensaje_id: Mapped[int] = mapped_column(ForeignKey("mensajes.id", ondelete="CASCADE"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(16))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Encuesta(Base):
    __tablename__ = "encuestas"

    id: Mapped[int] = mapped_column(primary_key=True)
    mensaje_id: Mapped[int] = mapped_column(ForeignKey("mensajes.id", ondelete="CASCADE"), unique=True, index=True)
    pregunta: Mapped[str] = mapped_column(String(300))
    opciones: Mapped[list] = mapped_column(JSONB, default=list)               # ["Lunes", "Martes", …] (2 a 10)
    multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    anonima: Mapped[bool] = mapped_column(Boolean, default=False)
    cierra_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cerrada: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EncuestaVoto(Base):
    __tablename__ = "encuesta_votos"
    __table_args__ = (UniqueConstraint("encuesta_id", "usuario_id", "opcion"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    encuesta_id: Mapped[int] = mapped_column(ForeignKey("encuestas.id", ondelete="CASCADE"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    opcion: Mapped[int] = mapped_column(Integer)                                # índice en `opciones`
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SuscripcionPush(Base):
    """Un dispositivo de una persona que recibe avisos push (Web Push, RFC 8030/8291/8292).
    `endpoint` es la dirección que dio el servicio de push del navegador (FCM en Android/Chrome,
    Mozilla, Apple); `p256dh` y `auth`, las claves con que se cifra cada aviso para ese
    dispositivo. Sirve al chat y a la campana."""
    __tablename__ = "suscripciones_push"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200), default="")
    auth: Mapped[str] = mapped_column(String(100), default="")
    dispositivo: Mapped[str] = mapped_column(String(200), default="")       # «Chrome en Android», para reconocerla
    fallos: Mapped[int] = mapped_column(Integer, default=0)
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_envio_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

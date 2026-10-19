"""Modelos de la MESA DE PARTES VIRTUAL (2026-10-12; servicios/mesa_virtual.py, api/mesa_publica.py).

Lo que una persona o una entidad presenta por la página pública `/mesa-de-partes`, sin cuenta.
Cada presentación es un TRÁMITE con su expediente correlativo (`MPV-2026-00001`, para el cargo) y
su CÓDIGO de seguimiento aleatorio (`K7QF-9M2X-HT4P`, que nunca es correlativo). El trámite crea
una `Entrada` de Recibidos con `via='mesa_virtual'`: el equipo la procesa con todo lo que ya
existe (responder, agendar, crear tarea, pegar el resultado del prompt, vincular). Aquí vive solo
lo que la mesa añade: el remitente identificado, los archivos con su huella, el estado PÚBLICO y
su historia (lo que ve el remitente) y el registro de auditoría de la página pública.

Va en su propio archivo para no tocar `modelos.py`: hereda la misma `Base`, así que `create_all`
de main.py crea estas tablas con solo importar este módulo (lo importan api/mesa_publica.py y
api/mesa_virtual.py). docs/arquitectura.md §28.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modelos import Base


class MesaTramite(Base):
    """Un documento presentado por la mesa de partes virtual."""

    __tablename__ = "mesa_tramites"
    __table_args__ = (UniqueConstraint("anio", "correlativo", name="mesa_tramites_expediente_unico"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    despacho_id: Mapped[int] = mapped_column(Integer, default=1)
    entrada_id: Mapped[int | None] = mapped_column(ForeignKey("entradas.id", ondelete="SET NULL"), nullable=True, index=True)
    # Expediente correlativo por año (para el cargo) y código de seguimiento aleatorio (para seguirlo).
    anio: Mapped[int] = mapped_column(Integer)
    correlativo: Mapped[int] = mapped_column(Integer)
    expediente: Mapped[str] = mapped_column(String(30), unique=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    # Remitente: 'natural' (DNI o carné de extranjería) o 'juridica' (RUC y representante).
    tipo_persona: Mapped[str] = mapped_column(String(10), default="natural")
    doc_tipo: Mapped[str] = mapped_column(String(10), default="DNI")
    doc_numero: Mapped[str] = mapped_column(String(20), default="", index=True)
    nombre: Mapped[str] = mapped_column(String(300), default="")           # nombres y apellidos, o razón social
    representante: Mapped[str] = mapped_column(String(200), default="")
    representante_doc_tipo: Mapped[str] = mapped_column(String(10), default="")
    representante_doc: Mapped[str] = mapped_column(String(20), default="")
    cargo: Mapped[str] = mapped_column(String(200), default="")
    correo: Mapped[str] = mapped_column(String(200), default="")
    telefono: Mapped[str] = mapped_column(String(30), default="")
    direccion: Mapped[str] = mapped_column(String(300), default="")
    # El documento.
    tipo_documento: Mapped[str] = mapped_column(String(60), default="")
    numero_documento: Mapped[str] = mapped_column(String(120), default="")
    folios: Mapped[int] = mapped_column(Integer, default=1)
    asunto: Mapped[str] = mapped_column(Text, default="")
    comentario: Mapped[str] = mapped_column(Text, default="")
    referencia: Mapped[str] = mapped_column(String(300), default="")
    # Cuándo llegó (instante real) y desde cuándo se tiene por presentado (horario y días hábiles).
    recibido_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    presentado_el: Mapped[date] = mapped_column(Date)
    fuera_de_horario: Mapped[bool] = mapped_column(Boolean, default=False)
    # Declaración jurada de veracidad y consentimiento de datos personales (Ley 29733): cuándo y qué texto.
    declaracion: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Estado PÚBLICO: recibido | en_revision | observado | derivado | atendido | archivado.
    estado: Mapped[str] = mapped_column(String(20), default="recibido", index=True)
    # Observación vigente: qué subsanar y hasta cuándo (día hábil).
    observacion: Mapped[str] = mapped_column(Text, default="")
    plazo_subsanacion: Mapped[date | None] = mapped_column(Date, nullable=True)
    ip: Mapped[str] = mapped_column(String(64), default="")
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MesaArchivo(Base):
    """Un archivo de un trámite: el principal, un anexo, una subsanación o la respuesta de la entidad."""

    __tablename__ = "mesa_archivos"

    id: Mapped[int] = mapped_column(primary_key=True)
    tramite_id: Mapped[int] = mapped_column(ForeignKey("mesa_tramites.id", ondelete="CASCADE"), index=True)
    # principal | anexo | subsanacion | respuesta
    clase: Mapped[str] = mapped_column(String(20), default="anexo")
    # Ruta RELATIVA a la raíz documental (config.raiz_documentos()); nunca la ruta que mandó el usuario.
    archivo: Mapped[str] = mapped_column(Text, default="")
    nombre: Mapped[str] = mapped_column(String(200), default="")         # nombre original saneado (solo para mostrar)
    tipo: Mapped[str] = mapped_column(String(10), default="pdf")         # pdf | jpg | png (por su firma de bytes)
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    paginas: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    # Respuesta tomada de un documento propio de Qillqa (firmado o generado), si fue así.
    documento_id: Mapped[int | None] = mapped_column(ForeignKey("documentos.id", ondelete="SET NULL"), nullable=True)
    # Subsanación presentada después del plazo: el equipo decide (TUO 27444, art. 125.4).
    fuera_de_plazo: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MesaMovimiento(Base):
    """Un paso de la historia del trámite. `publico` = lo ve el remitente en el seguimiento."""

    __tablename__ = "mesa_movimientos"

    id: Mapped[int] = mapped_column(primary_key=True)
    tramite_id: Mapped[int] = mapped_column(ForeignKey("mesa_tramites.id", ondelete="CASCADE"), index=True)
    estado: Mapped[str] = mapped_column(String(20), default="")
    # recibido | revision | observado | subsanado | derivado | atendido | archivado | reabierto
    accion: Mapped[str] = mapped_column(String(20), default="")
    nota: Mapped[str] = mapped_column(Text, default="")
    publico: Mapped[bool] = mapped_column(Boolean, default=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MesaAuditoria(Base):
    """Registro de la página pública: cada envío, consulta, descarga y rechazo, con la IP y el
    navegador. Para auditar abusos; no se muestra al remitente y nunca se borra desde la web."""

    __tablename__ = "mesa_auditoria"

    id: Mapped[int] = mapped_column(primary_key=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    ip: Mapped[str] = mapped_column(String(64), default="", index=True)
    # envio | envio_rechazado | seguimiento | seguimiento_fallido | descarga | subsanacion | limite | trampa
    accion: Mapped[str] = mapped_column(String(30), default="")
    tramite_id: Mapped[int | None] = mapped_column(ForeignKey("mesa_tramites.id", ondelete="SET NULL"), nullable=True)
    detalle: Mapped[str] = mapped_column(String(500), default="")
    navegador: Mapped[str] = mapped_column(String(300), default="")

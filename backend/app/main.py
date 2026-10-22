"""Punto de entrada de la API de Qillqa.

Fase 1: autenticación, documentos (oficio), numeración oficial y
generación de PDF vía el Marco Documental.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app import plataforma
from app.config import config

# Los `log.info` de la aplicación («Documento N compilado en 4,9 s», avisos de la escalera de
# la firma…) no llegaban a api.log: uvicorn configura solo SUS loggers y el raíz quedaba sin
# manejador (auditoría 2026-10-10). Nivel INFO al raíz, mismo formato que uvicorn.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")
from app.db import SesionAsincrona, engine, preparar_mediateca
from app.modelos import Base
from app.semillas import sembrar
from app.servicios import modulos
from app.servicios.acerca import VERSION


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    # Fase 1: el esquema se crea/actualiza al arrancar (Alembic llegará
    # cuando el modelo se estabilice).
    # La Mediateca, en su propia base (2026-10-19): se crea si falta, con sus tablas e índices.
    await preparar_mediateca()
    async with engine.begin() as conexion:
        await conexion.run_sync(Base.metadata.create_all)
        # Migración ligera (sin Alembic): añadir columnas nuevas de forma idempotente, sin perder datos (create_all no
        # altera tablas ya existentes). Las de Gestión documental, Proyectos de ley y la Semana (Qillqasqa) las hace su
        # módulo al arrancar (servicios/qillqasqa_db.py::preparar, desde Q5a); aquí, las de la plataforma.
        for sql in (
            # El nombre viejo sale de los datos (2026-10-22, fase 10.4; propuesta §8.9): idempotente, al arrancar; el corte lo aplica
            # sobre los datos de producción y su vuelta atrás es restaurar el respaldo del corte.
            # Las claves del reflejo en OpenProject: sin esto, la sincronización crearía allá paquetes repetidos.
            "UPDATE op_enlaces SET clave = 'qillqa:' || substr(clave, 6) WHERE clave LIKE 'sgdp:%' AND NOT EXISTS "
            "(SELECT 1 FROM op_enlaces n WHERE n.clave = 'qillqa:' || substr(op_enlaces.clave, 6))",
            # Presencia (2026-10-19): cada persona puede ocultar su estado a los demás (el administrador lo ve).
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mostrar_presencia boolean NOT NULL DEFAULT true",
            "ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS recepcion_canal varchar(20) NOT NULL DEFAULT ''",
            "ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS recepcion_dato varchar(300) NOT NULL DEFAULT ''",
            "ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS recepcion_nota text NOT NULL DEFAULT ''",
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS persona_id integer REFERENCES personas(id) ON DELETE SET NULL",
        ):
            await conexion.execute(text(sql))
        # Datos al primer ingreso (2026-10-18, servicios/perfil.py::pide_bienvenida). Al crear la
        # columna, quien ya usó el sistema (con latido) queda al día; quien nunca entró, pendiente.
        # Solo esa vez: después, NULL es «todavía no confirmó sus datos».
        existe = (await conexion.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'datos_completos_en'"
        ))).first()
        if not existe:
            await conexion.execute(text("ALTER TABLE usuarios ADD COLUMN datos_completos_en timestamptz"))
            await conexion.execute(text("UPDATE usuarios SET datos_completos_en = ultima_actividad WHERE ultima_actividad IS NOT NULL"))
        # Módulo Contraseñas (2026-10-08): columnas nuevas de credenciales.
        for columna in (
            "categoria varchar(60) NOT NULL DEFAULT ''",
            "favorita boolean NOT NULL DEFAULT false",
            "ultimo_uso timestamptz",
            "creado_en timestamptz NOT NULL DEFAULT now()",
            "ingresos jsonb NOT NULL DEFAULT '[]'::jsonb",
        ):
            await conexion.execute(text(f"ALTER TABLE credenciales ADD COLUMN IF NOT EXISTS {columna}"))
        # Organigramas del directorio institucional (categoría de órgano, orden entre hermanos y procedencia del dato).
        for columna in (
            "categoria varchar(40) NOT NULL DEFAULT ''",
            "orden integer NOT NULL DEFAULT 0",
            "fuente varchar(200) NOT NULL DEFAULT ''",
            "url_fuente text NOT NULL DEFAULT ''",
            "fecha_consulta varchar(20) NOT NULL DEFAULT ''",
            "norma varchar(300) NOT NULL DEFAULT ''",
            "ruc varchar(20) NOT NULL DEFAULT ''",
        ):
            await conexion.execute(text(f"ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS {columna}"))
        # Directorio institucional: datos de contacto completos de las personas.
        for columna in (
            "celular varchar(80) NOT NULL DEFAULT ''",
            "anexo varchar(20) NOT NULL DEFAULT ''",
            "oficina varchar(200) NOT NULL DEFAULT ''",
            "area varchar(200) NOT NULL DEFAULT ''",
            "email_alterno varchar(200) NOT NULL DEFAULT ''",
            # Contactos como Google Contacts (2026-10-13): foto y etiquetas (grupos).
            "foto varchar(200) NOT NULL DEFAULT ''",
            "etiquetas jsonb NOT NULL DEFAULT '[]'::jsonb",
        ):
            await conexion.execute(text(f"ALTER TABLE personas ADD COLUMN IF NOT EXISTS {columna}"))
        # Cuentas: cambio de clave obligatorio, último latido y datos de la persona (nombres, DNI, correo, cargo;
        # perfil 2026-10-12: celular, foto e «Info»). Las cuentas que YA existen quedan con debe_cambiar_clave false.
        for columna in (
            "debe_cambiar_clave boolean NOT NULL DEFAULT false",
            "ultima_actividad timestamptz",
            "nombres varchar(80) NOT NULL DEFAULT ''",
            "apellidos varchar(80) NOT NULL DEFAULT ''",
            "dni varchar(15) NOT NULL DEFAULT ''",
            "email varchar(120) NOT NULL DEFAULT ''",
            "cargo varchar(120) NOT NULL DEFAULT ''",
            "telefono varchar(20) NOT NULL DEFAULT ''",
            "foto varchar(200) NOT NULL DEFAULT ''",
            "acerca varchar(140) NOT NULL DEFAULT ''",
        ):
            await conexion.execute(text(f"ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {columna}"))
        # Avisos: el proyecto y el destino exacto de cada aviso.
        await conexion.execute(text("ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS proyecto_id integer"))
        await conexion.execute(
            text("ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS destino varchar(80) NOT NULL DEFAULT ''")
        )
        # Fototeca: desde el 2026-10-19 sus tablas e índices viven en la base de la Mediateca
        # (app.db.preparar_mediateca, más arriba); las de aquí quedan solo como origen de la migración.
        # Las de la Mesa de Partes (la tabla `entradas` y sus índices) las hace su módulo: servicios/punku_db.py
        # (Punku P1a). `pegados` la crea create_all.
        for indice in (
            # Las de Tareas y Agenda (eventos, autoría, clase) las hace su módulo: servicios/minka_db.py (fase 10.2b).
            # Las del chat (índices, notas de voz, canales únicos, visto y leído, tarjetas) las hace su módulo:
            # servicios/rimay_db.py (Rimay R3). Aquí queda el nombre de las reglas (son de Qillqa).
            # Recibidos pasa a llamarse «Mesa de Partes» (2026-10-13): el nombre de sus reglas, si conservan el de fábrica.
            "UPDATE reglas_evento SET nombre = replace(nombre, 'canal Recibidos', 'canal Mesa de Partes') "
            "WHERE de_fabrica LIKE 'canal-recibidos%' AND nombre LIKE '%canal Recibidos%'",
            # La bandeja de salida durable (fase 10.2b, 2026-10-20): lo emitido antes se da por repartido (sus reglas
            # ya corrieron); desde aquí, cada evento nuevo nace pendiente y el repartidor lo entrega al bus.
            "ALTER TABLE eventos_sistema ADD COLUMN IF NOT EXISTS repartido_en timestamptz DEFAULT now()",
            "ALTER TABLE eventos_sistema ALTER COLUMN repartido_en DROP DEFAULT",
            "ALTER TABLE eventos_sistema ADD COLUMN IF NOT EXISTS intentos_reparto integer NOT NULL DEFAULT 0",
            "ALTER TABLE eventos_sistema ADD COLUMN IF NOT EXISTS error_reparto text NOT NULL DEFAULT ''",
            "CREATE INDEX IF NOT EXISTS ix_eventos_sistema_por_repartir ON eventos_sistema (id) WHERE repartido_en IS NULL",
        ):
            await conexion.execute(text(indice))
    async with SesionAsincrona() as sesion:
        await sembrar(sesion)
    async with SesionAsincrona() as sesion:
        from app.servicios import avisos_chat
        from app.servicios import eventos_sistema

        await eventos_sistema.sembrar_fabrica(sesion)
        # Los temas del chat los siembra el chat al arrancar (su manifiesto, Rimay R2).
        # Una vez: lo publicado antes del 2026-10-18 pasa al formato del equipo (idempotente por ajuste; lo compone
        # Qillqa y lo aplica el chat por su contrato).
        try:
            await avisos_chat.redactar_avisos_viejos(sesion)
        except Exception:  # noqa: BLE001  un fallo aquí no impide arrancar
            logging.getLogger("qillqa.chat").exception("No se pudieron reescribir los avisos viejos del chat")
            await sesion.rollback()
    # Las tareas en segundo plano de cada módulo (Telegram, OpenProject, recordatorios, programación del día)
    # las declara su manifiesto y las lanza el anfitrión (app/plataforma.py); un fallo allá no toca la API.
    await plataforma.anfitrion.arrancar()
    yield
    await plataforma.anfitrion.detener()


app = FastAPI(
    title=config.nombre_sistema,
    description=(
        "API de Qillqa, gestión documental. "
        "El formato de los documentos lo define el Marco Documental "
        "(LaTeX); esta API gestiona contenido, numeracion, estados, "
        "versiones y usuarios."
    ),
    version=VERSION,
    lifespan=ciclo_de_vida,
)

# Módulos apagados desde Administración (2026-10-18): su API responde 403 `modulo_apagado`.
app.add_middleware(modulos.GuardianModulos)

# Los módulos se montan por su manifiesto (fase 10.2, contrato de Tiqsi): app/plataforma.py dice qué routers
# trae cada uno y en qué orden; tests/test_linea_base.py vigila que nada cambie (rutas, acceso y precedencia).
plataforma.anfitrion.montar(app)

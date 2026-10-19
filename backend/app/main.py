"""Punto de entrada de la API de Qillqa.

Fase 1: autenticación, documentos (oficio), numeración oficial y
generación de PDF vía el Marco Documental.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.api import (
    admin, adjuntos, ajustes, anuncios, auth, copias, directorio, documentos,
    estadisticas, health, heredados, incorporacion, seguimiento, sync,
    tipos, notificaciones, presencia, proyectos, informes_sr, semanas_sr, colab, openproject, grafo,
    fototeca, territorio, prensa,
)
from app.api import biblioteca as api_biblioteca
from app.api import referencias as api_referencias
from app.api import zotero as api_zotero
from app.api import entradas as api_entradas
from app.api import pegar as api_pegar  # noqa: E402  (2026-10-11: pegar el resultado de un prompt)
from app.api import actuaciones as api_actuaciones  # noqa: E402  (2026-10-12: actuaciones del seguimiento)
from app.api import reglas as api_reglas  # noqa: E402  (2026-10-12: eventos del sistema y reglas)
from app.api import chat as api_chat  # noqa: E402  (2026-10-12: chat institucional)
from app.api import push as api_push  # noqa: E402  (2026-10-13: avisos push en el celular)
from app.api import agenda as api_agenda
from app.api import tareas as api_tareas
from app.api import mesa as api_mesa
from app.api import contrasenas as api_contrasenas
from app.api import perfil as api_perfil  # noqa: E402  (2026-10-12: perfil y tarjeta de contacto)
from app.api import uso as api_uso  # noqa: E402  (2026-10-19: estadísticas de uso)
from app.api import mesa_publica as api_mesa_publica  # noqa: E402  (2026-10-12: mesa de partes virtual, PÚBLICA)
from app.api import mesa_virtual as api_mesa_virtual  # noqa: E402  (2026-10-12: mesa de partes virtual, equipo)
from app.api import modulos as api_modulos  # noqa: E402  (2026-10-18: encender y apagar módulos)
from app.api import rendiciones as api_rendiciones  # noqa: E402  (2026-10-18: rendición de cuentas; sus tablas, modelos_rendicion.py)
from app.config import config

# Los `log.info` de la aplicación («Documento N compilado en 4,9 s», avisos de la escalera de
# la firma…) no llegaban a api.log: uvicorn configura solo SUS loggers y el raíz quedaba sin
# manejador (auditoría 2026-10-10). Nivel INFO al raíz, mismo formato que uvicorn.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s: %(message)s")
from app.db import SesionAsincrona, engine
from app.modelos import Base
from app.semillas import sembrar
from app.servicios import modulos
from app.servicios import openproject_sync
from app.servicios import tareas as svc_tareas


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    # Fase 1: el esquema se crea/actualiza al arrancar (Alembic llegará
    # cuando el modelo se estabilice).
    async with engine.begin() as conexion:
        await conexion.run_sync(Base.metadata.create_all)
        # Migración ligera (sin Alembic): añadir columnas nuevas de forma
        # idempotente, sin perder datos (create_all no altera tablas ya
        # existentes). PostgreSQL soporta ADD COLUMN IF NOT EXISTS.
        await conexion.execute(
            text(
                "ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS "
                "es_anexo boolean NOT NULL DEFAULT false"
            )
        )
        await conexion.execute(
            text(
                "ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS "
                "categoria varchar(20) NOT NULL DEFAULT ''"
            )
        )
        await conexion.execute(
            text("ALTER TABLE documentos ADD COLUMN IF NOT EXISTS folios integer")
        )
        # N.º de expediente que la ENTIDAD destinataria dio al documento (2026-10-08), para el
        # seguimiento; lo lee solo del cargo de recepción (servicios/expediente_externo.py).
        await conexion.execute(
            text("ALTER TABLE documentos ADD COLUMN IF NOT EXISTS expediente_entidad varchar(120) NOT NULL DEFAULT ''")
        )
        # Chat (2026-10-19): la respuesta citada en los directos, sin hilo.
        await conexion.execute(text("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS responde_a_id integer"))
        # Presencia (2026-10-19): cada persona puede ocultar su estado a los demás (el administrador lo ve).
        await conexion.execute(
            text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mostrar_presencia boolean NOT NULL DEFAULT true")
        )
        await conexion.execute(
            text("ALTER TABLE tareas ADD COLUMN IF NOT EXISTS importante boolean NOT NULL DEFAULT false")
        )
        for columna in (
            "recepcion_canal varchar(20) NOT NULL DEFAULT ''",
            "recepcion_dato varchar(300) NOT NULL DEFAULT ''",
            "recepcion_nota text NOT NULL DEFAULT ''",
        ):
            await conexion.execute(text(f"ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS {columna}"))
        await conexion.execute(
            text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS persona_id integer REFERENCES personas(id) ON DELETE SET NULL")
        )
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
        await conexion.execute(
            text(
                "ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS "
                "etiqueta varchar(160) NOT NULL DEFAULT ''"
            )
        )
        await conexion.execute(
            text(
                "ALTER TABLE documentos ADD COLUMN IF NOT EXISTS "
                "oculto boolean NOT NULL DEFAULT false"
            )
        )
        # Control de concurrencia del contenido (2026-09-14): ver
        # modelos.Documento.version_contenido.
        await conexion.execute(
            text(
                "ALTER TABLE documentos ADD COLUMN IF NOT EXISTS "
                "version_contenido integer NOT NULL DEFAULT 0"
            )
        )
        # La exposición de motivos es opcional parte por parte (2026-10-05;
        # servicios/proyectos_plantillas.py): los proyectos creados antes
        # también. Idempotente: solo toca las que siguen obligatorias.
        await conexion.execute(
            text(
                "UPDATE proyecto_secciones SET obligatoria = false WHERE obligatoria "
                "AND clave IN ('fundamentos', 'antecedentes', 'efecto', 'costo-beneficio')"
            )
        )
        # Organigramas del directorio institucional (categoría de órgano,
        # orden entre hermanos y procedencia del dato).
        for columna in (
            "categoria varchar(40) NOT NULL DEFAULT ''",
            "orden integer NOT NULL DEFAULT 0",
            "fuente varchar(200) NOT NULL DEFAULT ''",
            "url_fuente text NOT NULL DEFAULT ''",
            "fecha_consulta varchar(20) NOT NULL DEFAULT ''",
            "norma varchar(300) NOT NULL DEFAULT ''",
        ):
            await conexion.execute(
                text(f"ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS {columna}")
            )
        # Documentos relacionados: la tabla pudo crearse antes de soportar
        # respuestas externas. destino_id pasa a NULLABLE (NULL = externo) y se
        # agregan las columnas del documento externo. DROP NOT NULL es idempotente.
        await conexion.execute(
            text("ALTER TABLE documento_relaciones ALTER COLUMN destino_id DROP NOT NULL")
        )
        for columna in (
            "externo_numero varchar(120) NOT NULL DEFAULT ''",
            "externo_tipo varchar(60) NOT NULL DEFAULT ''",
            "externo_institucion varchar(300) NOT NULL DEFAULT ''",
            "externo_fecha varchar(20) NOT NULL DEFAULT ''",
            "externo_asunto text NOT NULL DEFAULT ''",
            "externo_adjunto_id integer",
        ):
            await conexion.execute(
                text(
                    f"ALTER TABLE documento_relaciones ADD COLUMN IF NOT EXISTS {columna}"
                )
            )
        # Una respuesta externa puede traer VARIOS archivos: cada uno es un
        # Adjunto categoría 'respuesta' con relacion_id apuntando a la relación.
        await conexion.execute(
            text("ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS relacion_id integer")
        )
        # Seguimiento del trámite (Edison 2026-09-04): responsable actual del
        # documento y registro en el STD del Congreso — el último paso de la
        # ruta del oficio, que exige tener antes la constancia de recepción.
        for columna in (
            "responsable_id integer",
            "std_registrado boolean NOT NULL DEFAULT false",
            "std_numero varchar(120) NOT NULL DEFAULT ''",
            "std_fecha varchar(20) NOT NULL DEFAULT ''",
            "std_nota text NOT NULL DEFAULT ''",
            "std_registrado_por integer",
            # Interno (circula por el STD) o externo (necesita cargo). Vacío =
            # lo deduce el sistema; ver servicios/ambito.py.
            "ambito varchar(20) NOT NULL DEFAULT ''",
        ):
            await conexion.execute(
                text(f"ALTER TABLE documentos ADD COLUMN IF NOT EXISTS {columna}")
            )
        # Directorio institucional: datos de contacto completos de las personas
        # (celular, anexo, oficina, área, correo alterno) y RUC de la entidad.
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
            await conexion.execute(
                text(f"ALTER TABLE personas ADD COLUMN IF NOT EXISTS {columna}")
            )
        await conexion.execute(
            text(
                "ALTER TABLE instituciones ADD COLUMN IF NOT EXISTS "
                "ruc varchar(20) NOT NULL DEFAULT ''"
            )
        )
        # Cambio de contraseña obligatorio en el primer acceso. Las cuentas que
        # YA existen quedan en false: sus dueños vienen usando el sistema y no
        # tiene sentido bloquearlas de golpe; el administrador las marca al
        # restablecerles la clave (que es justo cuando vuelve a ser temporal).
        await conexion.execute(
            text(
                "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS "
                "debe_cambiar_clave boolean NOT NULL DEFAULT false"
            )
        )
        # Linaje de versiones de partes de proyecto (tabla creada en el piloto).
        for columna in ("basada_en integer", "estado varchar(20) NOT NULL DEFAULT ''"):
            await conexion.execute(
                text(f"ALTER TABLE proyecto_seccion_versiones ADD COLUMN IF NOT EXISTS {columna}")
            )
        # Avisos de PROYECTOS (menciones, tareas): enlazan al proyecto.
        await conexion.execute(
            text("ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS proyecto_id integer")
        )
        # Presencia del equipo: último latido (servicios/presencia.py).
        await conexion.execute(
            text(
                "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS "
                "ultima_actividad timestamptz"
            )
        )
        # Datos de la persona en la cuenta (nombres/apellidos/DNI/correo/cargo).
        for columna in (
            "nombres varchar(80) NOT NULL DEFAULT ''",
            "apellidos varchar(80) NOT NULL DEFAULT ''",
            "dni varchar(15) NOT NULL DEFAULT ''",
            "email varchar(120) NOT NULL DEFAULT ''",
            "cargo varchar(120) NOT NULL DEFAULT ''",
            # Perfil (2026-10-12, api/perfil.py): celular, foto e «Info».
            "telefono varchar(20) NOT NULL DEFAULT ''",
            "foto varchar(200) NOT NULL DEFAULT ''",
            "acerca varchar(140) NOT NULL DEFAULT ''",
        ):
            await conexion.execute(
                text(f"ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {columna}")
            )
        # Conformidad de quien observó sobre la subsanación.
        await conexion.execute(
            text(
                "ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS "
                "conformidad varchar(20) NOT NULL DEFAULT ''"
            )
        )
        # Observaciones ancladas a una parte del documento (campo o sección):
        # el editor las muestra junto a lo que hay que corregir.
        await conexion.execute(
            text(
                "ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS "
                "seccion varchar(40) NOT NULL DEFAULT ''"
            )
        )
        # Fase 5, edición simultánea (2026-10-01): interruptor por proyecto y,
        # por parte, el borrador vivo y la generación del texto compartido. La
        # tabla colab_estado la crea create_all.
        await conexion.execute(
            text(
                "ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS "
                "colaboracion boolean NOT NULL DEFAULT false"
            )
        )
        # Proyectos eliminados (2026-10-01): se retiran, no se borran.
        for columna in ("eliminado_en timestamptz", "eliminado_por integer REFERENCES usuarios(id)"):
            await conexion.execute(text(f"ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS {columna}"))
        for columna in (
            "borrador jsonb",
            "borrador_en timestamptz",
            "borrador_por integer REFERENCES usuarios(id)",
            "colab_gen integer NOT NULL DEFAULT 0",
        ):
            await conexion.execute(
                text(f"ALTER TABLE proyecto_secciones ADD COLUMN IF NOT EXISTS {columna}")
            )
        # Paso 5.6 (2026-10-05): edición simultánea de documentos.
        for columna in (
            "colaboracion boolean NOT NULL DEFAULT false",
            "colab_gen integer NOT NULL DEFAULT 0",
            "borrador jsonb",
            "borrador_en timestamptz",
            "borrador_por integer REFERENCES usuarios(id)",
        ):
            await conexion.execute(text(f"ALTER TABLE documentos ADD COLUMN IF NOT EXISTS {columna}"))
        # Edición simultánea POR OMISIÓN (Edison 2026-10-05: «debe ser
        # predeterminada»). Lo nuevo nace encendido; lo existente se enciende UNA
        # vez (marca `colab_por_omision` en ajustes): después, quien la apague la
        # deja apagada. Encender reinicia el texto compartido (generación nueva,
        # sin estado Yjs ni borrador vivo) y suelta los candados de las partes,
        # como el interruptor de la web (api/proyectos.py, api/documentos.py).
        for tabla in ("documentos", "proyectos"):
            await conexion.execute(text(f"ALTER TABLE {tabla} ALTER COLUMN colaboracion SET DEFAULT true"))
        hecho = await conexion.execute(text("SELECT 1 FROM ajustes WHERE despacho_id = 1 AND clave = 'colab_por_omision'"))
        if hecho.first() is None:
            await conexion.execute(text(
                "UPDATE proyecto_secciones SET colab_gen = colab_gen + 1, borrador = NULL, borrador_en = NULL, "
                "borrador_por = NULL, editando_por = NULL, editando_desde = NULL "
                "WHERE proyecto_id IN (SELECT id FROM proyectos WHERE NOT colaboracion)"
            ))
            await conexion.execute(text(
                "DELETE FROM colab_estado WHERE documento LIKE 'pl:%' AND split_part(documento, ':', 2)::int "
                "IN (SELECT id FROM proyectos WHERE NOT colaboracion)"
            ))
            await conexion.execute(text("UPDATE proyectos SET colaboracion = true WHERE NOT colaboracion"))
            await conexion.execute(text(
                "UPDATE documentos SET colaboracion = true, colab_gen = colab_gen + 1, borrador = NULL "
                "WHERE NOT colaboracion"
            ))
            await conexion.execute(text(
                "INSERT INTO ajustes (despacho_id, clave, valor) VALUES (1, 'colab_por_omision', "
                "'{\"aplicado\": \"2026-10-05\"}'::jsonb)"
            ))
        # Títulos de ley pegados de Word (2026-10-06): «Ley que PROPOSICIÓN
        # LEGISLATIVA QUE…» se depura UNA vez (marca `titulos_ley_depurados`);
        # lo nuevo ya entra depurado (servicios/proyectos.py::titulo_ley). La
        # parte «titulo» gana una versión y su texto compartido se reinicia.
        hecho = await conexion.execute(text("SELECT 1 FROM ajustes WHERE despacho_id = 1 AND clave = 'titulos_ley_depurados'"))
        if hecho.first() is None:
            from app.servicios.proyectos import titulo_ley

            filas = (await conexion.execute(text("SELECT id, titulo, creado_por FROM proyectos"))).all()
            for pid, titulo, autor in filas:
                nuevo = titulo_ley(titulo)
                if not nuevo or nuevo == titulo:
                    continue
                doc = json.dumps({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": nuevo}]}]})
                await conexion.execute(text("UPDATE proyectos SET titulo = :t WHERE id = :p"), {"t": nuevo, "p": pid})
                sec = (await conexion.execute(text(
                    "UPDATE proyecto_secciones SET contenido = CAST(:d AS jsonb), version = version + 1, "
                    "colab_gen = colab_gen + 1, borrador = NULL WHERE proyecto_id = :p AND clave = 'titulo' "
                    "RETURNING id, version, estado"
                ), {"d": doc, "p": pid})).first()
                if sec is not None:
                    await conexion.execute(text(
                        "INSERT INTO proyecto_seccion_versiones (seccion_id, version, contenido, nota, usuario_id, basada_en, estado) "
                        "VALUES (:s, :v, CAST(:d AS jsonb), 'Título depurado: sin el rótulo «Proposición legislativa» pegado de Word', :u, :b, :e)"
                    ), {"s": sec[0], "v": sec[1], "d": doc, "u": autor, "b": sec[1] - 1, "e": sec[2]})
                    await conexion.execute(text("DELETE FROM colab_estado WHERE documento LIKE :n"), {"n": f"pl:{pid}:titulo:%"})
            await conexion.execute(text(
                "INSERT INTO ajustes (despacho_id, clave, valor) VALUES (1, 'titulos_ley_depurados', "
                "'{\"aplicado\": \"2026-10-06\"}'::jsonb)"
            ))
        # Gestión documental del proyecto (2026-10-01): huella de los archivos
        # (conservación del firmado) y destino exacto de cada aviso.
        await conexion.execute(
            text("ALTER TABLE proyecto_archivos ADD COLUMN IF NOT EXISTS sha256 varchar(64) NOT NULL DEFAULT ''")
        )
        # Vigencia de la firma y del expediente (2026-10-06, servicios/vigencia.py):
        # huella de cada archivo, lo impreso que certifica un firmado y, en los
        # proyectos de ley, el contenido del que salió cada PDF.
        for sql in (
            "ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS sha256 varchar(64)",
            "ALTER TABLE adjuntos ADD COLUMN IF NOT EXISTS huella_impresa varchar(90)",
            "ALTER TABLE proyecto_archivos ADD COLUMN IF NOT EXISTS huella varchar(90) NOT NULL DEFAULT ''",
            "ALTER TABLE proyecto_archivos ADD COLUMN IF NOT EXISTS base_id integer",
        ):
            await conexion.execute(text(sql))
        await conexion.execute(
            text("ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS destino varchar(80) NOT NULL DEFAULT ''")
        )
        # Fototeca (2026-10-06): las tablas las crea create_all; los índices de búsqueda
        # por etiqueta, persona, vínculo y fecha, aquí (idempotentes).
        for indice in (
            "CREATE INDEX IF NOT EXISTS fototeca_fotos_etiquetas ON fototeca_fotos USING gin (etiquetas)",
            "CREATE INDEX IF NOT EXISTS fototeca_fotos_personas ON fototeca_fotos USING gin (personas)",
            "CREATE INDEX IF NOT EXISTS fototeca_fotos_vinculos ON fototeca_fotos USING gin (vinculos)",
            "CREATE INDEX IF NOT EXISTS fototeca_fotos_tomada ON fototeca_fotos (tomada_en DESC, id DESC)",
            "CREATE INDEX IF NOT EXISTS fototeca_fotos_album ON fototeca_fotos (album_id)",
            # Videos en la Fototeca (2026-10-06): qué medio es y cuánto dura.
            "ALTER TABLE fototeca_fotos ADD COLUMN IF NOT EXISTS medio varchar(10) NOT NULL DEFAULT 'foto'",
            "ALTER TABLE fototeca_fotos ADD COLUMN IF NOT EXISTS duracion double precision",
        ):
            await conexion.execute(text(indice))
        # Bandeja de entrada (2026-10-06, servicios/entradas.py): la tabla `entradas` la crea
        # create_all; aquí, los índices de la lista (idempotentes).
        for indice in (
            "CREATE INDEX IF NOT EXISTS entradas_plazo ON entradas (estado, plazo)",
            "CREATE INDEX IF NOT EXISTS entradas_responsable ON entradas (responsable_id)",
            "CREATE INDEX IF NOT EXISTS entradas_respuesta ON entradas (respuesta_documento_id)",
            # Pegar resultado (2026-10-11, servicios/pegado): de dónde salió cada campo de la ficha;
            # `pegados` y `actuaciones` las crea create_all.
            "ALTER TABLE entradas ADD COLUMN IF NOT EXISTS origen_campos jsonb NOT NULL DEFAULT '{}'::jsonb",
            # Clasificación en Mesa de Partes (2026-10-18): categoría, «por revisar» y el oficio propio al que responde.
            "ALTER TABLE entradas ADD COLUMN IF NOT EXISTS categoria varchar(30) NOT NULL DEFAULT ''",
            "ALTER TABLE entradas ADD COLUMN IF NOT EXISTS requiere_revision boolean NOT NULL DEFAULT false",
            "ALTER TABLE entradas ADD COLUMN IF NOT EXISTS responde_a_documento_id integer REFERENCES documentos(id) ON DELETE SET NULL",
            "CREATE INDEX IF NOT EXISTS entradas_responde_a ON entradas (responde_a_documento_id)",
            "CREATE INDEX IF NOT EXISTS actuaciones_entidad_fecha ON actuaciones (entidad, fecha)",
            "ALTER TABLE documentos ADD COLUMN IF NOT EXISTS plazo_legal jsonb NOT NULL DEFAULT '{}'::jsonb",
            "ALTER TABLE documentos ADD COLUMN IF NOT EXISTS estado_compilacion jsonb NOT NULL DEFAULT '{}'::jsonb",
            # Recordatorios de eventos (2026-10-12).
            "ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS recordatorio_minutos integer",
            "ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS recordatorio_avisado_en timestamptz",
            # Por confirmar, autoría y clase de tarea (2026-10-18).
            "ALTER TABLE agenda_eventos ADD COLUMN IF NOT EXISTS actualizado_por integer REFERENCES usuarios(id) ON DELETE SET NULL",
            "ALTER TABLE tareas ADD COLUMN IF NOT EXISTS clase varchar(10) NOT NULL DEFAULT ''",
            # Chat (2026-10-12): búsqueda de texto completo en español.
            "CREATE INDEX IF NOT EXISTS mensajes_texto_idx ON mensajes USING gin (to_tsvector('spanish', texto))",
            "CREATE INDEX IF NOT EXISTS mensajes_canal_id_idx ON mensajes (canal_id, id DESC)",
            # Notas de voz (2026-10-12, fase 9.6): duración medida al grabar o con ffprobe.
            "ALTER TABLE mensaje_archivos ADD COLUMN IF NOT EXISTS duracion_ms integer",
            # Un canal por (clase, clave) (2026-10-12): dos peticiones a la vez crearon dos directos
            # `u:1-u:3`. Antes del índice único se FUSIONAN los repetidos en el más viejo: sus mensajes
            # y sus integrantes pasan a él y el repetido queda archivado con la clave `…#dup<id>` (nada
            # se borra). Idempotente: sin repetidos, las tres sentencias no tocan nada.
            *(f"WITH d AS (SELECT id, MIN(id) OVER (PARTITION BY clase, clave) AS queda FROM canales WHERE clave <> '') {q}" for q in (
                "UPDATE mensajes m SET canal_id = d.queda FROM d WHERE m.canal_id = d.id AND d.id <> d.queda",
                "INSERT INTO canal_miembros (canal_id, usuario_id, papel, ultimo_leido_id, silenciado_hasta, unido_en) "
                "SELECT d.queda, cm.usuario_id, cm.papel, cm.ultimo_leido_id, cm.silenciado_hasta, cm.unido_en "
                "FROM canal_miembros cm JOIN d ON cm.canal_id = d.id AND d.id <> d.queda ON CONFLICT (canal_id, usuario_id) DO NOTHING",
                "UPDATE canales c SET archivado = true, clave = left(c.clave, 60) || '#dup' || c.id FROM d WHERE c.id = d.id AND d.id <> d.queda",
            )),
            "CREATE UNIQUE INDEX IF NOT EXISTS canales_clase_clave_unica ON canales (clase, clave) WHERE clave <> ''",
            # Visto y leído, secciones de temas y tarjetas del sistema (2026-10-13; `suscripciones_push` la crea create_all).
            "ALTER TABLE canal_miembros ADD COLUMN IF NOT EXISTS ultimo_recibido_id integer NOT NULL DEFAULT 0",
            "UPDATE canal_miembros SET ultimo_recibido_id = ultimo_leido_id WHERE ultimo_recibido_id < ultimo_leido_id",
            "ALTER TABLE canales ADD COLUMN IF NOT EXISTS categoria varchar(30) NOT NULL DEFAULT ''",
            "ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS tarjeta jsonb NOT NULL DEFAULT '{}'::jsonb",
            # Recibidos pasa a llamarse «Mesa de Partes» (2026-10-13): el canal de fábrica y el nombre de
            # sus reglas. Solo si conservan el nombre de fábrica (lo que alguien renombró se respeta).
            "UPDATE canales SET nombre = 'Mesa de Partes', descripcion = 'Lo que llega a Mesa de Partes: cada documento "
            "nuevo, su responsable y su plazo (lo publica el sistema).' WHERE clase = 'tema' AND clave = 'recibidos' AND nombre = 'Recibidos'",
            "UPDATE reglas_evento SET nombre = replace(nombre, 'canal Recibidos', 'canal Mesa de Partes') "
            "WHERE de_fabrica LIKE 'canal-recibidos%' AND nombre LIKE '%canal Recibidos%'",
            # Movilidad compartida de la rendición (2026-10-18): cada rendición apunta a su comisión
            # (`rendicion_comisiones`, la crea create_all); los datos los migra rendicion_comision.migrar.
            "ALTER TABLE rendiciones ADD COLUMN IF NOT EXISTS comision_id integer REFERENCES rendicion_comisiones(id) ON DELETE SET NULL",
            "CREATE INDEX IF NOT EXISTS ix_rendiciones_comision_id ON rendiciones (comision_id)",
        ):
            await conexion.execute(text(indice))
    async with SesionAsincrona() as sesion:
        await sembrar(sesion)
    async with SesionAsincrona() as sesion:
        # Rendición: los tramos de cada rendición pasan a su comisión (idempotente; sin nada que migrar, no toca nada).
        from app.servicios import rendicion_comision

        await rendicion_comision.migrar(sesion)
    async with SesionAsincrona() as sesion:
        from app.servicios import chat as svc_chat
        from app.servicios import eventos_sistema

        await eventos_sistema.sembrar_fabrica(sesion)
        await svc_chat.sembrar_fabrica(sesion)
        # Una vez: lo publicado antes del 2026-10-18 pasa al formato del equipo (idempotente por ajuste).
        try:
            await svc_chat.redactar_avisos_viejos(sesion)
        except Exception:  # noqa: BLE001  un fallo aquí no impide arrancar
            logging.getLogger("sgdp.chat").exception("No se pudieron reescribir los avisos viejos del chat")
            await sesion.rollback()
        # La acción «publicar» de una regla escribe en un canal del chat (fase 7 → 8).
        eventos_sistema.GANCHOS["publicar"] = svc_chat.publicar_por_regla
    # Puente de Telegram (2026-10-12): solo con TELEGRAM_TOKEN; un fallo allá no toca la API.
    from app.servicios import telegram as svc_telegram

    if svc_telegram.activo():
        asyncio.create_task(svc_telegram.bucle())
    # OpenProject (2026-10-02): la sincronización corre sola en segundo plano; sin
    # OPENPROJECT_URL y OPENPROJECT_TOKEN no hace nada. Un fallo allá no toca la API.
    tarea_op = asyncio.create_task(openproject_sync.bucle())
    # Tareas y Agenda (2026-10-06): recordatorios de plazo en la campana (servicios/tareas.py).
    tarea_recordatorios = asyncio.create_task(svc_tareas.bucle())
    # Programación del día en el chat (2026-10-13): cada mañana, las actividades de hoy (servicios/programacion.py).
    from app.servicios import programacion as svc_programacion

    tarea_programacion = asyncio.create_task(svc_programacion.bucle())
    yield
    tarea_op.cancel()
    tarea_recordatorios.cancel()
    tarea_programacion.cancel()


app = FastAPI(
    title=config.nombre_sistema,
    description=(
        "API del Sistema de Gestion Documental Parlamentario. "
        "El formato de los documentos lo define el Marco Documental "
        "(LaTeX); esta API gestiona contenido, numeracion, estados, "
        "versiones y usuarios."
    ),
    version="0.2.0",
    lifespan=ciclo_de_vida,
)

# Módulos apagados desde Administración (2026-10-18): su API responde 403 `modulo_apagado`.
app.add_middleware(modulos.GuardianModulos)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(notificaciones.router)
app.include_router(anuncios.router)
app.include_router(presencia.router)
app.include_router(api_uso.router)
app.include_router(proyectos.router)
app.include_router(colab.router)
app.include_router(tipos.router)
app.include_router(documentos.router)
app.include_router(seguimiento.router)
app.include_router(heredados.router)
app.include_router(incorporacion.router)
app.include_router(adjuntos.router)
app.include_router(adjuntos.router_lote)
app.include_router(ajustes.router)
app.include_router(admin.router)
app.include_router(openproject.router)
app.include_router(sync.router)
app.include_router(directorio.router)
app.include_router(estadisticas.router)
app.include_router(copias.router)
app.include_router(informes_sr.router)
app.include_router(semanas_sr.router_pegar)  # antes que el genérico POST /{semana}/{lista}
app.include_router(semanas_sr.router)
app.include_router(grafo.router)
app.include_router(fototeca.router)
app.include_router(territorio.router)
app.include_router(api_biblioteca.router)
# Zotero (2026-10-06): autoridad de referencias y citas; Calibre queda para los archivos (api/zotero.py).
app.include_router(api_zotero.router)
# Referencias y asociaciones automáticas (2026-10-06, api/referencias.py; tabla `relaciones`).
app.include_router(api_referencias.router)
app.include_router(api_referencias.router_asociaciones)
# Prensa (2026-10-06): sesión del estudio de Identidad Visual y su proxy /estudio/ (api/prensa.py).
app.include_router(prensa.router)
app.include_router(prensa.router_estudio)
app.include_router(prensa.router_piezas)
# Bandeja de entrada (2026-10-06): documentos RECIBIDOS con ficha automática (api/entradas.py).
app.include_router(api_entradas.router)
app.include_router(api_pegar.router)
app.include_router(api_actuaciones.router)
app.include_router(api_reglas.router)
app.include_router(api_chat.router)
app.include_router(api_push.router)
# Tareas y Agenda (2026-10-06): módulo propio; OpenProject queda como espejo opcional
# (api/tareas.py, api/agenda.py; tablas en modelos_tareas.py, creadas por create_all).
app.include_router(api_tareas.router)
# Apoyo para la Mesa de Partes: datos para copiar, titular, credenciales (2026-10-08).
app.include_router(api_mesa.router)
# Módulo Contraseñas (2026-10-08).
app.include_router(api_contrasenas.router)
app.include_router(api_perfil.router)
# Mesa de partes virtual (2026-10-12): lo ÚNICO público nuevo es /api/publico/mesa (api/mesa_publica.py);
# lo del equipo, con sesión (api/mesa_virtual.py). tests/test_mesa_virtual.py vigila que nada más quede abierto.
app.include_router(api_mesa_publica.router)
app.include_router(api_mesa_virtual.router)
app.include_router(api_agenda.router)
app.include_router(api_agenda.router_ics)
# Rendición de cuentas de viáticos (2026-10-18, api/rendiciones.py; tablas en modelos_rendicion.py, creadas por create_all).
app.include_router(api_rendiciones.router)
app.include_router(api_modulos.router)

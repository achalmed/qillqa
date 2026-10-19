"""VIGENCIA de la firma y del expediente: una sola fuente de verdad.

Pedido de Edison (2026-10-06): el ciclo de vida del documento, sus adjuntos,
el PDF firmado, los cargos y el expediente tiene que ser coherente. Antes cada
camino decidía por su cuenta (el PUT comparaba campos crudos, la recompilación
no miraba nada, el expediente adivinaba por la fecha de los archivos) y salían
firmas anuladas sin motivo, firmas vigentes con el contenido cambiado y
expedientes que parecían al día sin estarlo.

Aquí las huellas se CALCULAN, no se recuerdan:

* ``huella_impresa(doc)``: lo que la firma garantiza. En un documento de la
  plataforma son los campos —con los adjuntos de la línea «Adj.» YA RESUELTOS
  (escritos + archivos, como conjunto), no la lista cruda de `campos.anexo`—,
  el cuerpo, los ajustes de formato (viven en `campos`) y las imágenes
  incrustadas como páginas. Mover un nombre de «solo en papel» a un archivo con
  la misma etiqueta no cambia lo impreso; cambiar la etiqueta de un adjunto, sí. En un documento elaborado fuera es el PDF subido; en uno
  heredado, sus `.tex`.
* ``huella_expediente``: la base (el firmado, o el documento si aún no hay) y
  la lista ordenada de piezas (id, nombre, sha256) que se fusionaron.

El firmado guarda la huella impresa con la que se subió (``adjuntos.
huella_impresa``) y el expediente un manifiesto JSON junto a su PDF. La regla,
para TODO camino que modifica algo (``aplicar``):

  1. Si cambió lo impreso y hay un ciclo de firma en curso (firmado cargado,
     cargos, registro en el STD o estado FIRMADO/ENVIADO/OBSERVADO_ENVIADO
     aunque se haya marcado a mano) → se ANULA la firma: firmado a
     ``adjuntos/anulados/``, cargos de esa versión a «recepcion_anulada» (se
     ven como historia, ya no cuentan), registro STD retirado, expediente
     firmado a ``expediente/anulados/`` y el documento vuelve a APROBADO.
  2. Si solo cambió la composición del expediente (se reemplazó el PDF de un
     adjunto, se quitó o agregó uno) → la firma sigue; el expediente queda
     DESACTUALIZADO con sus motivos hasta que se vuelva a armar.

Los movimientos de archivos se deshacen solos si la transacción no llega al
commit (``mover``/``creado``): antes, un rollback dejaba el registro del
firmado apuntando a un archivo que ya estaba en ``anulados/``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import event, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.modelos import Adjunto, Documento, Usuario

log = logging.getLogger(__name__)

# Esquema de las huellas. Una huella guardada con otro esquema (u otra clase:
# un heredado que se convirtió en editable) no se compara: se toma como
# referencia la huella previa al cambio, como con un firmado antiguo sin huella.
VERSION = "v1"
ESTADOS_FIRMADO = {"FIRMADO", "ENVIADO", "OBSERVADO_ENVIADO"}
# Un cargo de recepción de una versión cuya firma se anuló: se conserva y se ve
# como historia, pero ya no cuenta para el seguimiento ni el envío automático.
CARGO_ANULADO = "recepcion_anulada"
CARPETA_ANULADOS = "anulados"
CARPETA_ANTERIORES = "anteriores"


# ============================================================================
# Funciones PURAS (sin base de datos ni disco): las prueban tests/test_vigencia.py
# ============================================================================

def canonico(obj) -> str:
    """JSON canónico: mismas claves en el mismo orden, sin espacios."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _sha(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def sha256_bytes(datos: bytes) -> str:
    return hashlib.sha256(datos).hexdigest()


def sha256_archivo(ruta: Path | None) -> str | None:
    if ruta is None or not ruta.is_file():
        return None
    h = hashlib.sha256()
    with ruta.open("rb") as fh:
        while trozo := fh.read(1024 * 1024):
            h.update(trozo)
    return h.hexdigest()


def _vacio(valor) -> bool:
    return valor is None or valor == "" or valor == [] or valor == {}


def adjuntos_impresos(nombres: list[str]) -> list[str]:
    """Los documentos que la línea «Adj.» dice que acompañan, como CONJUNTO:
    sin espacios sobrantes y en orden alfabético. Cargar el archivo de un
    adjunto escrito «solo en papel» lo pasa del principio de la lista al final
    (`combinar_adjuntos` pone primero los escritos), pero lo que se adjunta es
    lo mismo: no anula la firma. Agregar, quitar o renombrar uno, sí."""
    return sorted(" ".join(n.split()) for n in nombres if n and n.strip())


def campos_impresos(campos: dict | None, adjuntos: list[str]) -> dict:
    """Los campos tal como se imprimen: sin las claves internas («_…»), sin
    vacíos (un `anexo_cuerpo: ''` que el editor manda y antes no estaba no es
    un cambio) y con los adjuntos resueltos (escritos + archivos) en lugar de
    la lista cruda de `campos.anexo`."""
    salida = {
        k: v for k, v in (campos or {}).items()
        if not k.startswith("_") and k != "anexo" and not _vacio(v)
    }
    impresos = adjuntos_impresos(adjuntos)
    if impresos:
        salida["anexo"] = impresos
    return salida


def huella_contenido(
    *, tipo: str, numero: int | None, periodo: str, campos: dict | None,
    cuerpo: dict | None, adjuntos: list[str], imagenes: list[str],
) -> str:
    """Huella de lo impreso en un documento de la plataforma. `adjuntos` son
    los nombres de la línea «Adj.» (`combinar_adjuntos`)."""
    datos = {
        "tipo": tipo,
        "numero": numero,
        "periodo": periodo,
        "campos": campos_impresos(campos, adjuntos),
        "cuerpo": cuerpo or {},
        "imagenes": list(imagenes),
    }
    return f"{VERSION}:sgdp:{_sha(canonico(datos))}"


def huella_archivos(clase: str, shas: list[str | None]) -> str | None:
    """Huella de un documento cuya fuente son archivos (el PDF de uno manual,
    los .tex de un heredado). None si no hay ninguno."""
    presentes = [s for s in shas if s]
    if not presentes:
        return None
    return f"{VERSION}:{clase}:{_sha(canonico(presentes))}"


def esquema(huella: str | None) -> str:
    """«v1:sgdp» de «v1:sgdp:ab12…»."""
    if not huella or huella.count(":") < 2:
        return ""
    return huella.rsplit(":", 1)[0]


def referencia_firma(guardada: str | None, actual_antes: str | None) -> str | None:
    """Contra qué se compara: la huella con la que se subió el firmado si es del
    mismo esquema; si no (firmado antiguo, o un heredado que se volvió
    editable), la que tenía el documento justo antes de este cambio."""
    if guardada and esquema(guardada) == esquema(actual_antes):
        return guardada
    return actual_antes


def decidir_anulacion(*, ciclo_activo: bool, referencia: str | None, actual: str | None) -> bool:
    """¿Se anula la firma? Solo si hay ciclo de firma y lo impreso cambió."""
    if not ciclo_activo or referencia is None or actual is None:
        return False
    return referencia != actual


def huella_expediente(composicion: dict) -> str:
    base = composicion.get("base") or {}
    piezas = [
        [p.get("id"), p.get("etiqueta", ""), p.get("sha256") or ""]
        for p in composicion.get("piezas") or []
    ]
    return f"{VERSION}:exp:{_sha(canonico({'base': base, 'piezas': piezas}))}"


def motivos_expediente(antes: dict, ahora: dict) -> list[str]:
    """Por qué el expediente armado (`antes`, su manifiesto) ya no coincide con
    lo que hay (`ahora`). Lista vacía = vigente."""
    motivos: list[str] = []
    ba, bh = antes.get("base") or {}, ahora.get("base") or {}
    firmado_antes, firmado_ahora = ba.get("tipo") == "firmado", bh.get("tipo") == "firmado"
    if firmado_antes and not firmado_ahora:
        motivos.append("la firma fue anulada o se quitó el documento firmado")
    elif firmado_ahora and not firmado_antes:
        motivos.append("ya se subió el documento firmado (el expediente se armó sin firma)")
    elif firmado_ahora:
        if ba.get("id") != bh.get("id"):
            motivos.append("se cargó otro documento firmado")
        elif (ba.get("sha256") or "") != (bh.get("sha256") or ""):
            motivos.append("cambió el PDF del documento firmado")
    elif ba.get("huella") != bh.get("huella"):
        motivos.append("el documento cambió")

    previas = {p.get("id"): p for p in antes.get("piezas") or []}
    actuales = {p.get("id"): p for p in ahora.get("piezas") or []}
    for pid, p in previas.items():
        if pid not in actuales:
            motivos.append(f"se quitó «{p.get('etiqueta') or 'un adjunto'}»")
    for pid, p in actuales.items():
        previa = previas.get(pid)
        nombre = p.get("etiqueta") or "un adjunto"
        if previa is None:
            motivos.append(f"se agregó «{nombre}»")
            continue
        if (previa.get("etiqueta") or "") != (p.get("etiqueta") or ""):
            motivos.append(f"«{previa.get('etiqueta')}» ahora se llama «{nombre}»")
        if (previa.get("sha256") or "") != (p.get("sha256") or ""):
            motivos.append(f"cambió el PDF de «{nombre}»")
    if not motivos and huella_expediente(antes) != huella_expediente(ahora):
        motivos.append("cambió el orden o la composición de las piezas")
    return motivos


def huella_proyecto(titulo: str, datos: dict | None, partes: list[tuple[str, object]]) -> str:
    """Huella del CONTENIDO de un proyecto de ley (título, ficha y el texto
    GUARDADO de cada parte). Un PDF compilado cambia de bytes en cada
    compilación aunque diga lo mismo; esta huella no. La fecha y el número
    oficial quedan fuera: la fecha se fija al subir el primer firmado (con la
    del PDF que se firmó) y el número lo pone el Congreso después."""
    return f"{VERSION}:pl:{_sha(canonico({'titulo': titulo or '', 'datos': datos or {}, 'partes': [[c, x] for c, x in partes]}))}"


# ============================================================================
# Archivos que se deshacen si la transacción no se confirma
# ============================================================================

_CLAVE = "sgdp_archivos_por_confirmar"


def _pendientes(sesion) -> list:
    return sesion.info.setdefault(_CLAVE, [])


def _libre(destino: Path) -> Path:
    if not destino.exists():
        return destino
    marca = datetime.now().strftime("%Y%m%d-%H%M%S")
    candidato = destino.with_name(f"{destino.stem}_{marca}{destino.suffix}")
    n = 2
    while candidato.exists():
        candidato = destino.with_name(f"{destino.stem}_{marca}-{n}{destino.suffix}")
        n += 1
    return candidato


def mover(sesion, origen: Path, destino: Path) -> Path | None:
    """Mueve `origen` a `destino` (sin pisar: le pone marca de tiempo) y lo
    anota para devolverlo a su lugar si la transacción termina sin commit."""
    if not origen.is_file():
        return None
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino = _libre(destino)
    shutil.move(str(origen), str(destino))
    _pendientes(sesion).append(("mover", origen, destino))
    return destino


def creado(sesion, ruta: Path) -> None:
    """Anota un archivo recién escrito: se borra si no se llega al commit."""
    _pendientes(sesion).append(("crear", ruta, None))


@event.listens_for(Session, "after_commit")
def _al_confirmar(session) -> None:
    session.info.pop(_CLAVE, None)


@event.listens_for(Session, "after_transaction_end")
def _al_terminar(session, transaccion) -> None:
    if transaccion.parent is not None or transaccion.nested:
        return
    pendientes = session.info.pop(_CLAVE, None)
    for tipo, a, b in reversed(pendientes or []):
        try:
            if tipo == "mover" and b.is_file() and not a.exists():
                a.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(b), str(a))
            elif tipo == "crear" and a.is_file():
                a.unlink()
        except OSError as e:  # noqa: PERF203 — se intenta con todos
            log.warning("No se pudo deshacer %s %s → %s: %s", tipo, a, b, e)


# ============================================================================
# Consultas
# ============================================================================

def _dir_adjuntos(doc: Documento) -> Path | None:
    from app.servicios.adjuntos import _dir_adjuntos as dir_adj

    return dir_adj(doc)


async def asegurar_sha(doc: Documento, adj: Adjunto) -> str | None:
    """SHA-256 del archivo del adjunto; se calcula una vez y se guarda (los
    adjuntos anteriores a 2026-10-06 no lo tienen)."""
    if adj.sha256:
        return adj.sha256
    dir_adj = _dir_adjuntos(doc)
    sha = sha256_archivo(dir_adj / adj.nombre_archivo if dir_adj else None)
    if sha:
        adj.sha256 = sha
    return sha


async def firmado_vigente(sesion: AsyncSession, doc: Documento) -> Adjunto | None:
    """El firmado más reciente (el que cuenta)."""
    return (
        await sesion.execute(
            select(Adjunto)
            .where(Adjunto.documento_id == doc.id, Adjunto.categoria == "firmado")
            .order_by(Adjunto.id.desc())
        )
    ).scalars().first()


async def cargos_vigentes(sesion: AsyncSession, doc: Documento) -> list[Adjunto]:
    return list(
        (
            await sesion.execute(
                select(Adjunto).where(Adjunto.documento_id == doc.id, Adjunto.categoria == "recepcion")
                .order_by(Adjunto.id)
            )
        ).scalars().all()
    )


def _generales(filas: list[Adjunto]) -> list[Adjunto]:
    """Los adjuntos de categoría vacía, por id (los de `nombres_adjuntos`)."""
    return sorted((a for a in filas if not a.categoria), key=lambda a: a.id)


async def _filas(sesion: AsyncSession, doc: Documento) -> list[Adjunto]:
    return list((await sesion.execute(
        select(Adjunto).where(Adjunto.documento_id == doc.id).order_by(Adjunto.id)
    )).scalars().all())


async def huella_impresa(sesion: AsyncSession, doc: Documento, filas: list[Adjunto] | None = None) -> str | None:
    """Lo que la firma garantiza, calculado con lo que hay AHORA (ver arriba).
    `filas`: los adjuntos del documento ya leídos (el cálculo en lote de la bandeja);
    sin ellas se leen aquí.

    El FORMATO cuenta por los `fmt_*` de `campos`, y es el formato completo: el
    predeterminado del tipo (`ajustes`, «Usar como predeterminado») se COPIA a los
    campos al crear el documento y el generador no lo vuelve a consultar
    (api/documentos.crear, latex/generador.py). Cambiar el predeterminado no cambia ni
    el PDF ni la huella de lo ya creado, firmado o no (2026-10-06; lo fija
    tests/test_vigencia.py)."""
    from app.servicios.adjuntos import combinar_adjuntos, nombres_manuales
    from app.servicios.carpetas import carpeta

    if doc.origen == "manual":
        dir_doc = carpeta(doc)
        ruta = dir_doc / doc.pdf_archivo if dir_doc and doc.pdf_archivo else None
        return huella_archivos("manual", [sha256_archivo(ruta)])
    if doc.origen == "framework":
        dir_doc = carpeta(doc)
        if dir_doc is None or not dir_doc.is_dir():
            return None
        return huella_archivos("tex", [sha256_archivo(p) for p in sorted(dir_doc.glob("*.tex"))])
    if filas is None:
        filas = await _filas(sesion, doc)
    nombres = [(a.etiqueta or "").strip() or Path(a.nombre_original or a.nombre_archivo).stem for a in _generales(filas)]
    adjuntos = combinar_adjuntos(nombres_manuales(doc.campos or {}), nombres)
    imagenes = sorted((a for a in filas if a.es_anexo), key=lambda a: a.id)
    shas = [await asegurar_sha(doc, a) or f"sin-archivo:{a.nombre_archivo}" for a in imagenes]
    return huella_contenido(
        tipo=doc.tipo, numero=doc.numero, periodo=doc.periodo, campos=doc.campos,
        cuerpo=doc.cuerpo, adjuntos=adjuntos, imagenes=shas,
    )


async def ciclo_activo(sesion: AsyncSession, doc: Documento, firmado: Adjunto | None) -> bool:
    """¿Hay una firma en curso que un cambio de lo impreso dejaría sin valor?
    El firmado, un cargo, el registro en el STD o el estado (FIRMADO a mano sin
    archivo también cuenta: el contenido firmado en papel es el de ahora)."""
    if firmado is not None or doc.std_registrado or doc.estado in ESTADOS_FIRMADO:
        return True
    return bool(await cargos_vigentes(sesion, doc))


async def sellar_firmado(sesion: AsyncSession, doc: Documento, adj: Adjunto) -> None:
    """Al subir un firmado: queda anotado QUÉ contenido certifica."""
    adj.huella_impresa = await huella_impresa(sesion, doc)


async def estado_firma(sesion: AsyncSession, doc: Documento) -> dict:
    """vigente | desactualizada | sin_firma (+ la huella de referencia)."""
    firmado = await firmado_vigente(sesion, doc)
    actual = await huella_impresa(sesion, doc)
    if firmado is None:
        return {"estado": "sin_firma", "manual": doc.estado in ESTADOS_FIRMADO}
    if not firmado.huella_impresa or esquema(firmado.huella_impresa) != esquema(actual):
        # Firmado anterior al control de vigencia: se toma como vigente (el
        # sistema anterior anulaba ante cualquier cambio) y se le pone la huella.
        firmado.huella_impresa = actual
        return {"estado": "vigente", "firmado_id": firmado.id}
    if firmado.huella_impresa == actual:
        return {"estado": "vigente", "firmado_id": firmado.id}
    return {
        "estado": "desactualizada",
        "firmado_id": firmado.id,
        "motivo": "el contenido impreso cambió después de subir el firmado",
    }


# ============================================================================
# Expediente
# ============================================================================

# Qué piezas entran (2026-10-18, Edison: «armé el expediente de un oficio, su adjunto y su cargo de envío y
# solo armó el oficio y el adjunto; que pregunte qué documentos considerar»). De fábrica, los adjuntos
# generales; quien arma puede quitar alguno y sumar cargos de recepción y archivos de respuesta. La
# elección queda en el manifiesto (`seleccion`) y la vigencia se calcula contra ella.
CATEGORIAS_EXTRA = ("recepcion", "respuesta")


def normalizar_seleccion(datos: dict | None) -> dict:
    d = datos if isinstance(datos, dict) else {}
    ids = lambda xs: sorted({int(x) for x in (xs or []) if str(x).isdigit()})  # noqa: E731
    return {"excluidos": ids(d.get("excluidos")), "extras": ids(d.get("extras"))}


def seleccion_de(elegidas: list[int], filas: list[Adjunto]) -> dict:
    """De la lista de ids que eligió quien arma, la selección que se guarda: los generales que
    quedaron fuera y los cargos o respuestas que entraron."""
    elegidas_set = set(elegidas)
    return {
        "excluidos": sorted(a.id for a in _generales(filas) if not a.es_anexo and a.id not in elegidas_set),
        "extras": sorted(a.id for a in filas if a.categoria in CATEGORIAS_EXTRA and a.id in elegidas_set),
    }


def piezas_elegidas(filas: list[Adjunto], seleccion: dict | None) -> list[Adjunto]:
    """Las piezas del expediente en su orden: adjuntos generales, cargos de recepción y respuestas,
    cada grupo por orden de carga. Pura."""
    sel = normalizar_seleccion(seleccion)
    generales = [a for a in _generales(filas) if not a.es_anexo and a.id not in sel["excluidos"]]
    extras = sorted((a for a in filas if a.categoria in CATEGORIAS_EXTRA and a.id in sel["extras"]),
                    key=lambda a: (CATEGORIAS_EXTRA.index(a.categoria), a.id))
    return generales + extras


async def composicion_actual(sesion: AsyncSession, doc: Documento, filas: list[Adjunto] | None = None,
                             seleccion: dict | None = None) -> dict:
    """Qué entraría hoy en el expediente: base y piezas PDF, con sus huellas.
    `filas` como en `huella_impresa`; `seleccion`, la que se eligió al armarlo."""
    if filas is None:
        filas = await _filas(sesion, doc)
    firmados = sorted((a for a in filas if a.categoria == "firmado"), key=lambda a: a.id, reverse=True)
    firmado = firmados[0] if firmados else None
    if firmado is not None:
        base = {"tipo": "firmado", "id": firmado.id, "sha256": await asegurar_sha(doc, firmado)}
    else:
        base = {"tipo": "documento", "huella": await huella_impresa(sesion, doc, filas)}
    dir_adj = _dir_adjuntos(doc)
    piezas: list[dict] = []
    omitidos: list[str] = []
    for a in piezas_elegidas(filas, seleccion):
        nombre = (a.etiqueta or "").strip() or Path(a.nombre_original or a.nombre_archivo).stem
        ruta = dir_adj / a.nombre_archivo if dir_adj else None
        if ruta and ruta.is_file() and a.nombre_archivo.lower().endswith(".pdf"):
            piezas.append({"id": a.id, "etiqueta": nombre, "sha256": await asegurar_sha(doc, a)})
        else:
            omitidos.append(nombre)
    return {"base": base, "piezas": piezas, "omitidos": omitidos, "seleccion": normalizar_seleccion(seleccion)}


def ruta_manifiesto(pdf: Path) -> Path:
    return pdf.with_suffix(".json")


def escribir_manifiesto(sesion, pdf: Path, composicion: dict) -> None:
    datos = {
        **composicion,
        "huella": huella_expediente(composicion),
        "generado_en": datetime.now(timezone.utc).isoformat(),
    }
    ruta = ruta_manifiesto(pdf)
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    creado(sesion, ruta)


def leer_manifiesto(pdf: Path) -> dict | None:
    ruta = ruta_manifiesto(pdf)
    if not ruta.is_file():
        return None
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def retirar_expediente(sesion, doc: Documento, solo_con_firma: bool = True) -> str | None:
    """Aparta el expediente (PDF + manifiesto) a ``expediente/anulados/``:
    un expediente firmado de una firma anulada o quitada no debe seguir a la
    mano para enviarse. Devuelve el nombre retirado, o None."""
    from app.servicios import expediente as svc_exp

    pdf = svc_exp.existente(doc)
    if pdf is None or not pdf.is_file():
        return None
    manifiesto = leer_manifiesto(pdf)
    con_firma = (
        (manifiesto.get("base") or {}).get("tipo") == "firmado"
        if manifiesto else svc_exp.con_firma_por_nombre(pdf.name)
    )
    if solo_con_firma and not con_firma:
        return None
    destino = pdf.parent / CARPETA_ANULADOS
    mover(sesion, pdf, destino / pdf.name)
    json_ = ruta_manifiesto(pdf)
    if json_.is_file():
        mover(sesion, json_, destino / json_.name)
    return pdf.name


async def estado_expediente(sesion: AsyncSession, doc: Documento) -> dict:
    """inexistente | vigente | desactualizado (con motivos). Con manifiesto se
    compara la composición; sin él (expedientes anteriores a 2026-10-06) se
    cae a la regla antigua por fechas y por el nombre."""
    from app.servicios import expediente as svc_exp
    from app.servicios.pdf import contar_paginas

    pdf = svc_exp.existente(doc)
    if pdf is None or not pdf.is_file():
        return {"existe": False, "vigencia": "inexistente", "motivos": []}
    manifiesto = leer_manifiesto(pdf)
    ahora = await composicion_actual(sesion, doc, seleccion=(manifiesto or {}).get("seleccion"))
    generado = pdf.stat().st_mtime
    if manifiesto is not None:
        con_firma = (manifiesto.get("base") or {}).get("tipo") == "firmado"
        motivos = motivos_expediente(manifiesto, ahora)
    else:
        con_firma = svc_exp.con_firma_por_nombre(pdf.name)
        motivos = []
        hay_firmado = ahora["base"]["tipo"] == "firmado"
        if hay_firmado and not con_firma:
            motivos.append("ya se subió el documento firmado (el expediente se armó sin firma)")
        if con_firma and not hay_firmado:
            motivos.append("la firma fue anulada o se quitó el documento firmado")
        dir_adj = _dir_adjuntos(doc)
        for a in (await sesion.execute(select(Adjunto).where(
            Adjunto.documento_id == doc.id,
            or_(Adjunto.categoria.in_(["", "firmado"]), Adjunto.categoria.is_(None)),
        ))).scalars().all():
            ruta = dir_adj / a.nombre_archivo if dir_adj else None
            if ruta and ruta.is_file() and ruta.stat().st_mtime > generado:
                motivos.append("se subió un archivo después de armarlo")
                break
        if not motivos:
            # Sin manifiesto no se sabe qué se fusionó: se deja anotado AHORA
            # para que lo próximo que cambie sí se detecte.
            ahora_huella = {**ahora, "huella": huella_expediente(ahora), "inferido": True}
            try:
                ruta_manifiesto(pdf).write_text(json.dumps(ahora_huella, ensure_ascii=False, indent=1), encoding="utf-8")
            except OSError:
                pass
    return {
        "existe": True,
        "nombre": pdf.name,
        "con_firma": con_firma,
        "paginas": contar_paginas(pdf),
        "generado_en": datetime.fromtimestamp(generado, tz=timezone.utc).isoformat(),
        "desactualizado": bool(motivos),
        "vigencia": "desactualizado" if motivos else "vigente",
        "motivos": motivos,
        "omitidos": ahora["omitidos"],
        # Lo que se eligió al armarlo (para proponer lo mismo al volver a armarlo) y lo que lleva.
        "seleccion": ahora["seleccion"],
        "piezas": [{"id": p["id"], "etiqueta": p.get("etiqueta", "")} for p in (manifiesto or ahora).get("piezas") or []],
    }


def vigencia_sin_manifiesto(pdf: Path, con_firma: bool, hay_firmado: bool, filas: list[Adjunto],
                            dir_adj: Path | None) -> list[str]:
    """La regla antigua (expedientes anteriores a 2026-10-06, sin manifiesto): por el
    nombre y por la fecha de los archivos. No escribe nada."""
    motivos: list[str] = []
    if hay_firmado and not con_firma:
        motivos.append("ya se subió el documento firmado (el expediente se armó sin firma)")
    if con_firma and not hay_firmado:
        motivos.append("la firma fue anulada o se quitó el documento firmado")
    generado = pdf.stat().st_mtime
    for a in filas:
        if a.categoria not in ("", None, "firmado"):
            continue
        ruta = dir_adj / a.nombre_archivo if dir_adj else None
        if ruta and ruta.is_file() and ruta.stat().st_mtime > generado:
            motivos.append("se subió un archivo después de armarlo")
            break
    return motivos


async def expedientes_en_lote(sesion: AsyncSession, docs: list[Documento]) -> dict[int, dict]:
    """El indicador del expediente para la BANDEJA (vista «Seguimiento» y columna),
    sin el costo de `estado_expediente` por documento: una sola consulta de adjuntos
    para todos, ni páginas contadas ni manifiestos escritos. Por documento:
    {vigencia: vigente | desactualizado | sin_armar, motivos, con_firma}. Un borrador
    sin número no tiene expediente que armar y no figura."""
    from app.servicios import expediente as svc_exp

    salida: dict[int, dict] = {}
    con_pdf: dict[int, tuple[Documento, Path]] = {}
    for d in docs:
        pdf = svc_exp.existente(d)
        if pdf is not None and pdf.is_file():
            con_pdf[d.id] = (d, pdf)
        elif d.numero is not None:
            salida[d.id] = {"vigencia": "sin_armar", "motivos": [], "con_firma": False}
    if not con_pdf:
        return salida
    filas_por_doc: dict[int, list[Adjunto]] = {i: [] for i in con_pdf}
    for a in (await sesion.execute(
        select(Adjunto).where(Adjunto.documento_id.in_(list(con_pdf))).order_by(Adjunto.id)
    )).scalars().all():
        filas_por_doc[a.documento_id].append(a)
    for i, (d, pdf) in con_pdf.items():
        filas = filas_por_doc[i]
        manifiesto = leer_manifiesto(pdf)
        if manifiesto is not None:
            ahora = await composicion_actual(sesion, d, filas, manifiesto.get("seleccion"))
            con_firma = (manifiesto.get("base") or {}).get("tipo") == "firmado"
            motivos = motivos_expediente(manifiesto, ahora)
        else:
            con_firma = svc_exp.con_firma_por_nombre(pdf.name)
            hay_firmado = any(a.categoria == "firmado" for a in filas)
            motivos = vigencia_sin_manifiesto(pdf, con_firma, hay_firmado, filas, _dir_adjuntos(d))
        salida[i] = {"vigencia": "desactualizado" if motivos else "vigente", "motivos": motivos[:4],
                     "con_firma": con_firma}
    return salida


# ============================================================================
# La regla
# ============================================================================

@dataclass
class Resultado:
    firma_anulada: bool = False
    detalle: dict = field(default_factory=dict)

    def respuesta(self) -> dict:
        """Lo que viaja en la respuesta HTTP (el editor arma el aviso)."""
        return {"firmado_invalidado": self.firma_anulada, "anulacion": self.detalle or None}


async def consecuencias(sesion: AsyncSession, doc: Documento) -> list[str]:
    """Qué se pierde si se anula la firma ahora (para el aviso previo)."""
    from app.servicios import expediente as svc_exp

    lista: list[str] = []
    if await firmado_vigente(sesion, doc) is not None:
        lista.append("el documento firmado pasa a «anulados» y habrá que volver a firmarlo")
    elif doc.estado in ESTADOS_FIRMADO:
        lista.append("el documento vuelve a «pendiente de firma» y habrá que volver a firmarlo")
    cargos = await cargos_vigentes(sesion, doc)
    if cargos:
        lista.append(
            f"{len(cargos)} cargo(s) de recepción dejan de contar: "
            + ", ".join(c.etiqueta or c.nombre_original for c in cargos)
        )
    if doc.std_registrado:
        lista.append("el registro en el STD" + (f" ({doc.std_numero})" if doc.std_numero else "") + " deja de contar")
    pdf = svc_exp.existente(doc)
    if pdf is not None:
        manifiesto = leer_manifiesto(pdf)
        if (manifiesto.get("base") or {}).get("tipo") == "firmado" if manifiesto else svc_exp.con_firma_por_nombre(pdf.name):
            lista.append("el expediente firmado se retira")
    return lista


async def aplicar(
    sesion: AsyncSession,
    doc: Documento,
    usuario: Usuario,
    antes: str | None,
    motivo: str,
    confirmado: bool | None = None,
) -> Resultado:
    """Evalúa la vigencia DESPUÉS de un cambio (ya hecho en la sesión, sin
    commit). `antes` es la huella impresa previa al cambio. Si lo impreso
    cambió y hay ciclo de firma, anula; si no, la firma sigue y el expediente
    se evalúa solo (``estado_expediente``).

    `confirmado`: None = cliente que no conoce el aviso (scripts, pestañas
    viejas): se anula y se informa, como siempre. False = la web pregunta
    primero: 409 `anula_firma` con las consecuencias, sin tocar nada (la
    sesión se descarta y los archivos vuelven a su lugar). True = confirmado."""
    firmado = await firmado_vigente(sesion, doc)
    actual = await huella_impresa(sesion, doc)
    referencia = referencia_firma(firmado.huella_impresa if firmado else None, antes)
    activo = await ciclo_activo(sesion, doc, firmado)
    if not decidir_anulacion(ciclo_activo=activo, referencia=referencia, actual=actual):
        if firmado is not None and firmado.huella_impresa != actual and referencia == actual:
            firmado.huella_impresa = actual  # firmado antiguo: queda sellado
        return Resultado()
    if confirmado is False:
        raise HTTPException(
            409,
            {
                "codigo": "anula_firma",
                "mensaje": (
                    "Este cambio modifica lo que se imprime en el documento firmado: "
                    "al guardarlo se anula la firma y habrá que volver a firmar."
                ),
                "consecuencias": await consecuencias(sesion, doc),
            },
        )
    from app.servicios import firma

    detalle = await firma.anular_firma(sesion, doc, usuario, motivo)
    return Resultado(firma_anulada=True, detalle=detalle or {})

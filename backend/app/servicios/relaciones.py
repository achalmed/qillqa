"""RELACIONES GENÉRICAS en la base (2026-10-06): sincronizar las citas de un texto, buscar lo
citable, asociar el informe SR a su oficio de presentación. Las reglas puras (qué se
busca, cómo se puntúa, qué se agrega o se quita) están en servicios/referencias.py; aquí
solo se lee y se escribe la tabla `relaciones` (modelos.Relacion) y se reutilizan las
puertas de siempre (adjuntar pasa por api/adjuntos.subir: vigencia y bitácora incluidas).
"""

from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import (
    Documento,
    Institucion,
    PedidoSR,
    Persona,
    Proyecto,
    ProyectoFuente,
    Relacion,
    SemanaSR,
    Usuario,
)
from app.servicios import referencias as ref
from app.servicios.numeracion import numero_mostrado
from app.tipos import asunto_de, tipo_config

log = logging.getLogger("sgdp.relaciones")

# Nota con que se marca una fuente que el sistema agregó al citarla en el texto: solo esas
# se retiran solas cuando la cita desaparece (las que alguien agregó a mano, nunca).
NOTA_FUENTE_AUTO = "Citada en el texto (automática)."


# --- sincronizar las citas de un texto ----------------------------------------------------


async def sincronizar(
    sesion: AsyncSession, origen: str, contexto: str, contenido, usuario_id: int | None
) -> dict:
    """Las relaciones `fuente='editor'` de (origen, contexto) quedan IGUAL a los nodos
    `referencia` del texto: se agregan las nuevas y se quitan las que ya no están. No hace
    commit (va dentro del guardado que la llama)."""
    deseadas = ref.extraer(contenido)
    filas = (
        await sesion.execute(
            select(Relacion).where(
                Relacion.origen == origen, Relacion.contexto == contexto, Relacion.fuente == "editor"
            )
        )
    ).scalars().all()
    agregar, quitar = ref.plan([(r.destino, r.tipo) for r in filas], deseadas)
    for r in filas:
        if (r.destino, r.tipo) in quitar:
            await sesion.delete(r)
    for d in agregar:
        datos = {}
        if d.get("nota"):
            datos["cita"] = d["nota"]
        if d["tipo"] == "norma":
            n = next((x for x in ref.normas_catalogo() if x["clave"] == d["id"]), None)
            if n and n.get("url"):
                datos["url"] = n["url"]
        sesion.add(Relacion(
            origen=origen, destino=d["destino"], tipo=ref.TIPO_RELACION.get(d["tipo"], "menciona"),
            contexto=contexto, fuente="editor", automatica=True, texto=d["texto"], datos=datos,
            creado_por=usuario_id,
        ))
    if agregar or quitar:
        await sesion.flush()
    return {"agregadas": len(agregar), "quitadas": len(quitar)}


async def fuentes_del_proyecto(sesion: AsyncSession, pid: int, usuario_id: int, seccion: str) -> int:
    """Una norma o una obra citada en una parte del proyecto se vuelve FUENTE del proyecto
    (clave `norma:…`, `zotero:KEY` o, las citas antiguas, `calibre:N`), sin escribirla dos veces; la que agregó el sistema se
    retira cuando ya ninguna parte la cita. Devuelve cuántas cambió."""
    citas = (
        await sesion.execute(
            select(Relacion).where(Relacion.origen == f"pl:{pid}", Relacion.fuente == "editor",
                                   or_(Relacion.destino.like("norma:%"), Relacion.destino.like("libro:%"),
                                       Relacion.destino.like("zotero:%")))
        )
    ).scalars().all()
    queridas: dict[str, Relacion] = {}
    for r in citas:
        clave = r.destino.replace("libro:", "calibre:", 1) if r.destino.startswith("libro:") else r.destino
        queridas.setdefault(clave, r)
    fuentes = (await sesion.execute(select(ProyectoFuente).where(ProyectoFuente.proyecto_id == pid))).scalars().all()
    por_clave = {f.clave_externa: f for f in fuentes if f.clave_externa}
    cambios = 0
    for clave, r in queridas.items():
        if clave in por_clave:
            continue
        es_libro = clave.startswith(("calibre:", "zotero:"))
        referencia = (r.datos or {}).get("cita") or r.texto
        sesion.add(ProyectoFuente(
            proyecto_id=pid, tipo="estudio" if es_libro else "norma", referencia=referencia[:2000],
            url=(r.datos or {}).get("url", ""), clave_externa=clave, seccion=seccion, nota=NOTA_FUENTE_AUTO,
            creado_por=usuario_id,
        ))
        cambios += 1
    for clave, f in por_clave.items():
        if f.nota == NOTA_FUENTE_AUTO and clave not in queridas and clave.startswith(("norma:", "calibre:", "zotero:")):
            await sesion.delete(f)
            cambios += 1
    return cambios


async def registrar(
    sesion: AsyncSession, *, origen: str, destino: str, tipo: str, contexto: str = "", fuente: str = "auto",
    texto: str = "", datos: dict | None = None, usuario_id: int | None = None,
) -> Relacion:
    """Crea la relación si no existe (misma clave única); si existe, la devuelve."""
    fila = (
        await sesion.execute(
            select(Relacion).where(Relacion.origen == origen, Relacion.destino == destino, Relacion.tipo == tipo,
                                   Relacion.contexto == contexto, Relacion.fuente == fuente)
        )
    ).scalar_one_or_none()
    if fila is not None:
        if datos:
            fila.datos = {**(fila.datos or {}), **datos}
        return fila
    fila = Relacion(origen=origen, destino=destino, tipo=tipo, contexto=contexto, fuente=fuente,
                    automatica=fuente != "manual", texto=texto[:500], datos=datos or {}, creado_por=usuario_id)
    sesion.add(fila)
    await sesion.flush()
    return fila


async def depurar_textos(sesion: AsyncSession, origen: str, texto: str) -> int:
    """Relaciones insertadas en un texto plano (`fuente='texto'`, p. ej. los textos del
    informe SR): se quitan las cuyo texto ya no aparece. No hace commit."""
    filas = (await sesion.execute(select(Relacion).where(Relacion.origen == origen, Relacion.fuente == "texto"))).scalars().all()
    vivas = ref.presentes_en_texto([(r.destino, r.texto) for r in filas], texto)
    quitadas = 0
    for r in filas:
        if r.destino not in vivas:
            await sesion.delete(r)
            quitadas += 1
    return quitadas


def texto_de_valores(valor) -> str:
    """Todo el texto de un dict/list de textos (los del informe SR), en una cadena."""
    if isinstance(valor, str):
        return valor
    if isinstance(valor, dict):
        return " ".join(texto_de_valores(v) for v in valor.values())
    if isinstance(valor, list):
        return " ".join(texto_de_valores(v) for v in valor)
    return ""


async def de_origen(sesion: AsyncSession, origen: str) -> list[dict]:
    """Las relaciones de `origen`. `texto` es lo que se escribió al citar (historia del texto);
    `etiqueta`, el nombre VIGENTE del otro extremo (servicios/etiquetas.py; vacío si no se resuelve)."""
    from app.servicios import etiquetas

    filas = (await sesion.execute(select(Relacion).where(or_(Relacion.origen == origen, Relacion.destino == origen)))).scalars().all()
    otros = {r.destino if r.origen == origen else r.origen for r in filas}
    vigentes = await etiquetas.etiquetas_de(sesion, otros)
    return [{"id": r.id, "origen": r.origen, "destino": r.destino, "tipo": r.tipo, "contexto": r.contexto,
             "fuente": r.fuente, "texto": r.texto, "datos": r.datos or {},
             "etiqueta": vigentes.get(r.destino if r.origen == origen else r.origen, "")} for r in filas]


# --- buscar lo citable --------------------------------------------------------------------


def _sin_tildes(col):
    return func.translate(func.lower(col), "áéíóúüñ", "aeiouun")


async def _obras_zotero(q: str, limite: int) -> list[dict]:
    """Obras de Zotero (autoridad de referencias y citas; Calibre es solo el archivo)."""
    from app.servicios import zotero
    try:
        return await asyncio.wait_for(asyncio.to_thread(zotero.buscar, q, limite), timeout=6)
    except Exception as e:  # Zotero cerrado y sin copia, lento: el resto de la búsqueda sigue
        log.info("Zotero no disponible para referencias: %s", e)
        return []


async def buscar(sesion: AsyncSession, q: str, contexto: str = "", ver_ocultos: bool = False, por_grupo: int = 6) -> list[dict]:
    """Lo citable que coincide con `q`, en grupos (normas, documentos, proyectos…). Cada
    resultado: {tipo, id, texto (lo que se inserta), etiqueta, detalle, grupo, puntaje,
    nota (referencia de Zotero que va en nota al pie), url}. `contexto` ('documento', 'parte', 'informe') solo
    cambia el orden de los grupos."""
    preferidos, palabras = ref.interpretar(q)
    # Las palabras del disparador («ley», «oficio») ayudan a ordenar, no a filtrar: un
    # documento se llama «Oficio N° 0095…» y la norma «Ley N° 27795, Ley de…».
    resultados: list[dict] = []

    def poner(tipo: str, ident, texto: str, etiqueta: str, detalle: str, puntos: int, **extra) -> None:
        if puntos <= 0:
            return
        bono = 25 if tipo in preferidos else 0
        # Coinciden también las palabras del disparador («Informe SR-02» → la semana cuyo
        # texto dice «Informe … SR-02»): es lo que se quiso decir.
        if filtrar != palabras and ref.puntuar(palabras, f"{texto} {etiqueta} {detalle}") > 0:
            bono += 12
        resultados.append({"tipo": tipo, "id": str(ident), "texto": texto, "etiqueta": etiqueta, "detalle": detalle,
                           "grupo": ref.GRUPO[tipo], "puntaje": puntos + bono, **extra})

    filtrar = [p for p in palabras if p not in ("ley", "decreto", "supremo", "oficio", "informe", "pl", "proyecto", "pedido", "semana", "sr", "isr", "d", "s",
                                          "obra", "cita", "articulo", "zotero", "libro")]
    filtrar = filtrar or palabras
    solo = set(preferidos) if preferidos and filtrar != palabras else set()

    def quiere(tipo: str) -> bool:
        return not solo or tipo in solo

    # Normas: catálogo + fuentes de tipo norma de los proyectos.
    if quiere("norma"):
        normas = {n["clave"]: n for n in ref.normas_catalogo()}
        for f in (await sesion.execute(select(ProyectoFuente).where(ProyectoFuente.tipo == "norma"))).scalars().all():
            n = ref.norma_de_fuente(f.referencia, f.url)
            if n and n["clave"] not in normas:
                normas[n["clave"]] = n
        for n in normas.values():
            texto = ref.texto_norma(n)
            puntos = ref.puntuar(filtrar, f"{n['tipo']} {n['numero']} {n['titulo']}", n.get("fuente", ""))
            poner("norma", n["clave"], texto, texto, n.get("fuente", ""), puntos, url=n.get("url", ""))

    # Documentos (numerados o borradores), sin los ocultos salvo para el administrador.
    if quiere("documento"):
        docs = (await sesion.execute(select(Documento).order_by(Documento.id.desc()).limit(3000))).scalars().all()
        for d in docs:
            if d.oculto and not ver_ocultos:
                continue
            numero = numero_mostrado(d) if d.numero is not None or d.origen != "sgdp" else f"{tipo_config(d.tipo)['nombre']} (borrador)"
            asunto = asunto_de(d.tipo, d.campos) or ""
            puntos = ref.puntuar(filtrar, numero, asunto)
            if d.numero is None and d.origen == "sgdp":
                puntos = puntos // 2  # un borrador sin número rara vez se cita
            poner("documento", d.id, numero, numero, asunto[:160], puntos, estado=d.estado, doc_tipo=d.tipo)

    # Documentos RECIBIDOS (bandeja de entrada, 2026-10-06): se ofrecen junto con los
    # documentos («Oficio 456» busca en los dos). Citarlos en la Referencia de un oficio lo
    # vincula como su respuesta al guardar (servicios/entradas.conciliar_documento).
    if quiere("documento") or quiere("entrada"):
        from app.modelos import Entrada
        from app.servicios.entradas import texto_cita

        for e in (await sesion.execute(
            select(Entrada).where(Entrada.estado != "archivada").order_by(Entrada.id.desc()).limit(2000)
        )).scalars().all():
            cita = texto_cita(e)
            detalle = " · ".join(x for x in (e.remitente, (e.asunto or "")[:120]) if x)
            puntos = ref.puntuar(filtrar, f"{cita} {e.std_numero}", f"{e.remitente} {e.asunto}")
            poner("entrada", e.id, cita, cita, detalle, puntos, estado=e.estado)

    if quiere("proyecto"):
        for p in (await sesion.execute(select(Proyecto).where(Proyecto.eliminado_en.is_(None)))).scalars().all():
            puntos = ref.puntuar(filtrar, f"{p.codigo} {p.titulo}")
            # En el texto, el código (el título es largo y va en el detalle de la lista).
            texto = f"Proyecto de Ley {p.codigo}" if p.codigo else p.titulo
            poner("proyecto", p.id, texto, p.codigo or "Proyecto", p.titulo[:160], puntos)

    if quiere("semana") or quiere("pedido"):
        semanas = {s.id: s for s in (await sesion.execute(select(SemanaSR))).scalars().all()}
        for s in semanas.values():
            exp = s.expediente or {}
            periodo = exp.get("periodo") or {}
            cuando = ref.periodo_texto(str(periodo.get("inicio") or ""), str(periodo.get("fin") or ""))
            tema = str(exp.get("tema") or s.carpeta.split("_", 2)[-1].replace("-", " "))
            texto = f"Informe de la Semana de Representación {s.codigo}" + (f" ({cuando})" if cuando else "")
            puntos = ref.puntuar(filtrar, f"{s.codigo} ISR {s.numero} semana de representacion {cuando}", tema)
            if quiere("semana"):
                poner("semana", s.id, texto, f"{s.codigo} · {cuando}".strip(" ·"), tema[:160], puntos)
        if quiere("pedido"):
            for pe in (await sesion.execute(select(PedidoSR))).scalars().all():
                s = semanas.get(pe.semana_id)
                pedido = str((pe.datos or {}).get("pedido") or "")
                codigo_sr = s.codigo if s else ""
                puntos = ref.puntuar(filtrar, f"{pe.codigo} {codigo_sr}", pedido)
                poner("pedido", pe.id, f"pedido {pe.codigo} de la {codigo_sr}".strip(), f"{pe.codigo} · {codigo_sr}", pedido[:160], puntos)

    # Directorio: se filtra en SQL por la palabra más larga (sin tildes) y se puntúa aquí.
    larga = max(filtrar, key=len) if filtrar else ""
    if len(larga) >= 3 and not solo:
        insts = {i.id: i for i in (await sesion.execute(
            select(Institucion).where(Institucion.activo.is_(True),
                                      or_(_sin_tildes(Institucion.nombre).contains(larga), _sin_tildes(Institucion.siglas).contains(larga))).limit(200)
        )).scalars().all()}
        for i in insts.values():
            puntos = ref.puntuar(filtrar, f"{i.siglas or ''} {i.nombre}")
            poner("institucion", i.id, i.nombre, i.siglas or i.nombre, i.nombre if i.siglas else (i.tipo or ""), puntos)
        personas = (await sesion.execute(
            select(Persona).where(Persona.activo.is_(True), _sin_tildes(Persona.nombre).contains(larga)).limit(200)
        )).scalars().all()
        faltan = {p.institucion_id for p in personas if p.institucion_id and p.institucion_id not in insts}
        if faltan:
            for i in (await sesion.execute(select(Institucion).where(Institucion.id.in_(faltan)))).scalars().all():
                insts[i.id] = i
        for p in personas:
            inst = insts.get(p.institucion_id) if p.institucion_id else None
            detalle = ", ".join(x for x in (p.cargo, inst.siglas or inst.nombre if inst else "") if x)
            poner("persona", p.id, p.nombre, p.nombre, detalle, ref.puntuar(filtrar, p.nombre, detalle))

    # Obras de Zotero: se inserta SU cita en el texto («(Cotler, 1978)») y su referencia va en
    # nota al pie, ambas formateadas por Zotero (servicios/zotero.py). Calibre ya no da citas.
    if (not solo or "zotero" in solo) and len(" ".join(filtrar)) >= 3:
        for b in await _obras_zotero(" ".join(filtrar), por_grupo):
            autores = "; ".join(b.get("autores") or [])
            detalle = " · ".join(x for x in (autores, str(b.get("anio") or ""), b.get("citekey") and f"@{b['citekey']}") if x)
            poner("zotero", b.get("zotero_key"), b.get("cita_corta") or b.get("titulo", ""), b.get("titulo", ""),
                  detalle, 5 + ref.puntuar(filtrar, b.get("titulo", ""), autores),
                  nota=b.get("cita", ""), citekey=b.get("citekey", ""), calibre_id=b.get("calibre_id"),
                  formateado_por=b.get("formateado_por", ""))

    return ref.ordenar_resultados(resultados, preferidos, contexto, por_grupo)


# --- el informe SR de un oficio de presentación -------------------------------------------


async def semanas_resumen(sesion: AsyncSession) -> list[dict]:
    salida = []
    for s in (await sesion.execute(select(SemanaSR).order_by(SemanaSR.numero.desc()))).scalars().all():
        exp = s.expediente or {}
        periodo = exp.get("periodo") or {}
        salida.append({
            "id": s.id, "numero": s.numero, "codigo": s.codigo, "carpeta": s.carpeta, "estado": s.estado,
            "tema": str(exp.get("tema") or s.carpeta.split("_", 2)[-1].replace("-", " ")),
            "inicio": str(periodo.get("inicio") or ""), "fin": str(periodo.get("fin") or ""),
            "documento_id": s.documento_id,
        })
    return salida


def pdf_del_informe(semana: SemanaSR, isr: Documento | None) -> Path | None:
    """El PDF del informe de la semana: el del ISR registrado en la gestión documental; si
    aún no se registró, el aprobado más reciente de `salida/` (dos columnas)."""
    from app.config import raiz_informes_sr
    from app.servicios import informes_sr
    from app.servicios import pdf as svc_pdf

    if isr is not None:
        ruta = svc_pdf.principal(isr)
        if ruta is not None and ruta.is_file():
            return ruta
    carpeta = raiz_informes_sr() / semana.carpeta
    ficha = informes_sr.semana(carpeta) or {}
    for p in ficha.get("pdfs") or []:
        ruta = carpeta / "salida" / p["nombre"]
        if p.get("estado") == "aprobado" and ruta.is_file():
            return ruta
    return None


async def ya_presentado(sesion: AsyncSession, doc_id: int) -> list[Relacion]:
    return list((await sesion.execute(
        select(Relacion).where(Relacion.origen == f"doc:{doc_id}", Relacion.tipo == "presenta_informe")
    )).scalars().all())


async def candidatos_de_documento(sesion: AsyncSession, doc: Documento, vivos: dict | None = None) -> dict:
    """¿Este documento presenta un informe SR? Y si sí, cuáles podrían ser, con su PDF.
    {aplica, confiable, asociados:[…], candidatos:[{semana_id, codigo, periodo, tema,
    puntaje, motivos, tiene_pdf, isr}]}"""
    asociados = await ya_presentado(sesion, doc.id)
    # `vivos`: lo que el editor tiene en pantalla sin guardar (asunto, referencia, sumilla),
    # para proponer el informe mientras se escribe y no recién al guardar.
    campos = {**(doc.campos or {}), **{k: v for k, v in (vivos or {}).items() if v is not None}}
    cuerpo = ref.texto_plano(doc.cuerpo or {})
    aplica = doc.tipo in ("oficio", "oficio_multiple", "memorando", "carta") and ref.parece_presentacion_informe(campos, cuerpo)
    semanas = await semanas_resumen(sesion)
    por_id = {s["id"]: s for s in semanas}
    lista = ref.candidatos_informe(campos, cuerpo, semanas) if aplica else []
    salida = []
    isr_ids = {s["documento_id"] for s in semanas if s["documento_id"]}
    isrs = {d.id: d for d in (await sesion.execute(select(Documento).where(Documento.id.in_(isr_ids)))).scalars()} if isr_ids else {}
    for c in lista[:6]:
        s = por_id[c.id]
        semana = await sesion.get(SemanaSR, c.id)
        isr = isrs.get(s["documento_id"]) if s["documento_id"] else None
        salida.append({
            "semana_id": s["id"], "codigo": s["codigo"], "tema": s["tema"],
            "periodo": ref.periodo_texto(s["inicio"], s["fin"]), "puntaje": c.puntaje, "motivos": c.motivos,
            "tiene_pdf": pdf_del_informe(semana, isr) is not None,
            "isr": numero_mostrado(isr) if isr is not None and isr.numero is not None else None,
        })
    return {
        "aplica": aplica,
        "confiable": ref.es_confiable(lista),
        "asociados": [{"semana_id": int(r.destino.split(":")[1]), "adjunto_id": (r.datos or {}).get("adjunto_id"),
                       "texto": r.texto} for r in asociados if r.destino.startswith("sr:")],
        "candidatos": salida,
    }


class _Subida:
    """Lo mínimo de un UploadFile para reutilizar `api/adjuntos.subir` con un archivo que ya
    está en disco (el PDF del informe)."""

    def __init__(self, ruta: Path, nombre: str):
        self._datos = ruta.read_bytes()
        self.filename = nombre
        self.size = len(self._datos)
        self.content_type = "application/pdf"
        self.file = io.BytesIO(self._datos)

    async def read(self, *_):
        return self._datos


async def adjuntar_informe(
    sesion: AsyncSession, doc: Documento, semana_id: int, usuario: Usuario, confirmar: bool | None
) -> dict:
    """Asocia el informe de la semana al oficio: relación `presenta_informe` (con la semana
    y con el ISR registrado) y el PDF del informe como ADJUNTO, por la puerta de siempre
    (`api/adjuntos.subir`: bitácora, vigencia de la firma, línea «Adj.»). Si ya estaba
    asociado, no repite nada."""
    from fastapi import HTTPException

    from app.api.adjuntos import subir

    semana = await sesion.get(SemanaSR, semana_id)
    if semana is None:
        raise HTTPException(404, "La semana no existe.")
    previas = [r for r in await ya_presentado(sesion, doc.id) if r.destino == f"sr:{semana_id}"]
    if previas:
        return {"ok": True, "ya_estaba": True, "adjunto_id": (previas[0].datos or {}).get("adjunto_id")}
    isr = await sesion.get(Documento, semana.documento_id) if semana.documento_id else None
    exp = semana.expediente or {}
    periodo = exp.get("periodo") or {}
    cuando = ref.periodo_texto(str(periodo.get("inicio") or ""), str(periodo.get("fin") or ""))
    etiqueta = (f"Informe de Semana de Representación N° {semana.numero:02d}" + (f" ({cuando})" if cuando else ""))[:160]
    relacion = await registrar(
        sesion, origen=f"doc:{doc.id}", destino=f"sr:{semana.id}", tipo="presenta_informe", fuente="auto",
        texto=etiqueta, usuario_id=usuario.id,
    )
    if isr is not None:
        await registrar(sesion, origen=f"doc:{doc.id}", destino=f"doc:{isr.id}", tipo="presenta_informe",
                        fuente="auto", texto=etiqueta, usuario_id=usuario.id)
    ruta = pdf_del_informe(semana, isr)
    adjunto = None
    if ruta is not None:
        adjunto = await subir(
            doc.id, _Subida(ruta, ruta.name), categoria="", etiqueta=etiqueta,
            confirmar_anulacion=None if confirmar is None else ("true" if confirmar else "false"),
            usuario=usuario, sesion=sesion,
        )
        relacion.datos = {**(relacion.datos or {}), "adjunto_id": adjunto.get("id")}
    await sesion.commit()
    return {"ok": True, "ya_estaba": False, "adjunto_id": adjunto.get("id") if adjunto else None,
            "sin_pdf": ruta is None, "etiqueta": etiqueta, **({k: v for k, v in adjunto.items() if k in ("firmado_invalidado", "anulacion")} if adjunto else {})}


async def quitar_informe(sesion: AsyncSession, doc_id: int, semana_id: int) -> int:
    """Deshace la asociación automática (la relación con la semana y con su ISR; el adjunto
    lo quita su propia puerta, DELETE de adjuntos, que aplica la vigencia)."""
    semana = await sesion.get(SemanaSR, semana_id)
    destinos = [f"sr:{semana_id}"] + ([f"doc:{semana.documento_id}"] if semana is not None and semana.documento_id else [])
    r = await sesion.execute(
        delete(Relacion).where(Relacion.origen == f"doc:{doc_id}", Relacion.tipo == "presenta_informe",
                               Relacion.fuente == "auto", Relacion.destino.in_(destinos))
    )
    return r.rowcount or 0

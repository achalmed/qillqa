"""Eliminación de documentos.

- Documentos de la plataforma (origen 'sgdp'): se borran su carpeta y sus
  filas (versiones, eventos, adjuntos, documento).
- Documentos heredados (origen 'framework'): se desvinculan de la
  plataforma (se borran sus filas) pero se CONSERVAN sus archivos
  originales en el árbol del framework; pueden reimportarse.
- Documentos elaborados fuera del sistema (origen 'manual'): como los de
  la plataforma, se borra su carpeta (la creó el sistema al incorporarlos;
  el PDF de origen sigue donde lo tenía quien lo subió). Como cualquier
  numerado, solo si tiene el ÚLTIMO número de su serie.

REGLA DE NUMERACIÓN (ver servicios/numeracion.py): un documento numerado
solo puede eliminarse si tiene el ÚLTIMO número de su serie — el contador
retrocede en la misma transacción y el número se reutiliza (sin saltos).
Un número intermedio NO se elimina: se archiva. Esto vale para TODOS los
roles, incluido el administrador (bug del salto OF-0033, 2026-08-15).
"""

import json
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modelos import Adjunto, Documento, Evento, Relacion, VersionDocumento
from app.servicios.carpetas import carpeta
from app.servicios.numeracion import liberar_numero, numero_mostrado

# Donde quedan, dentro de la carpeta de un heredado desvinculado, los adjuntos que
# `reconocer_en_carpeta` no reconoce (los genéricos, las imágenes, lo anulado): la
# misma carpeta apartada que usa la sincronización (decisiones 2026-09-08).
CARPETA_DESVINCULADOS = ".sgdp-retirados"


def _reconocible(nombre: str) -> bool:
    """¿Lo reconoce `adjuntos.reconocer_en_carpeta` al volver a importar?"""
    arriba = nombre.upper()
    return Path(nombre).stem.endswith("[R]") or arriba.startswith(
        ("FIRM-", "CR-", "RESP-", "CONSTANCIA_DE_RECEPCION")
    )


def _libre(destino: Path) -> Path:
    if not destino.exists():
        return destino
    n = 2
    while (destino.with_name(f"{destino.stem}-{n}{destino.suffix}")).exists():
        n += 1
    return destino.with_name(f"{destino.stem}-{n}{destino.suffix}")


def _devolver_al_original(dir_doc, adjuntos: list | None = None, etiqueta: str = "") -> dict:
    """Un heredado se desvincula pero su carpeta se conserva: lo que el sistema
    le agregó no debe quedar huérfano (2026-10-06). El expediente (generado,
    se rehace) se borra; el firmado, los cargos y las respuestas vuelven a la
    raíz de la carpeta con su nombre de convención, donde los reconoce
    `adjuntos.reconocer_en_carpeta` si el documento se vuelve a importar.

    Lo demás de ``adjuntos/`` (los adjuntos genéricos, las imágenes incrustadas,
    lo ya anulado) no lo reconoce nadie: se aparta a
    ``.sgdp-retirados/adjuntos-<fecha>/`` con un ``adjuntos.json`` que dice qué era
    cada archivo (etiqueta, categoría), y ``adjuntos/`` desaparece. Nada se borra.
    Devuelve {devueltos, apartados, carpeta}."""
    salida = {"devueltos": [], "apartados": [], "carpeta": None}
    if not dir_doc or not dir_doc.is_dir():
        return salida
    shutil.rmtree(dir_doc / "expediente", ignore_errors=True)
    dir_adj = dir_doc / "adjuntos"
    if not dir_adj.is_dir():
        return salida
    for ruta in sorted(p for p in dir_adj.iterdir() if p.is_file()):
        if _reconocible(ruta.name) and not (dir_doc / ruta.name).exists():
            shutil.move(str(ruta), str(dir_doc / ruta.name))
            salida["devueltos"].append(ruta.name)
    restantes = sorted(dir_adj.rglob("*"))
    if any(p.is_file() for p in restantes):
        apartado = _libre(dir_doc / CARPETA_DESVINCULADOS / f"adjuntos-{datetime.now():%Y-%m-%d}")
        apartado.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(dir_adj), str(apartado))
        por_nombre = {a.nombre_archivo: a for a in adjuntos or []}
        lista = []
        for p in sorted(x for x in apartado.rglob("*") if x.is_file()):
            rel = p.relative_to(apartado).as_posix()
            a = por_nombre.get(p.name)
            lista.append({
                "archivo": rel,
                "etiqueta": (a.etiqueta or a.nombre_original) if a else "",
                "categoria": (a.categoria or "adjunto") if a else ("anulado" if "/" in rel else ""),
            })
        (apartado / "adjuntos.json").write_text(json.dumps(
            {"documento": etiqueta, "desvinculado_en": datetime.now().isoformat(timespec="seconds"),
             "archivos": lista}, ensure_ascii=False, indent=1), encoding="utf-8")
        salida["apartados"] = [x["archivo"] for x in lista]
        salida["carpeta"] = apartado.name
    else:
        shutil.rmtree(dir_adj, ignore_errors=True)
    return salida


# --- Relaciones genéricas de lo que se elimina ----------------------------------------------


def plan_limpieza(filas: list[tuple[int, str, str, str]], nodo: str) -> tuple[list[int], list[int]]:
    """Qué hacer con las filas de `relaciones` que tocan un nodo que desaparece
    (`doc:12`, `pl:3`). `filas`: (id, origen, destino, fuente). Devuelve (borrar, marcar):

      · las que SALEN del nodo (lo que su texto citaba, lo que el sistema le asoció)
        se borran: su texto ya no existe;
      · las automáticas del sistema que LLEGAN a él (`fuente='auto'`, p. ej. el oficio
        que presentaba ese informe) se borran: las volverá a deducir si hace falta;
      · las que otros escribieron y LLEGAN a él (una cita en el texto de otro documento,
        una relación manual) se MARCAN `destino_eliminado`: el texto de ese otro sigue
        diciendo lo que dice, y borrar la fila haría que su próximo guardado la vuelva
        a crear apuntando a la nada. El mapa no las dibuja."""
    borrar, marcar = [], []
    for ident, origen, destino, fuente in filas:
        if origen == nodo or (destino == nodo and fuente == "auto"):
            borrar.append(ident)
        elif destino == nodo:
            marcar.append(ident)
    return borrar, marcar


async def limpiar_relaciones(sesion: AsyncSession, nodo: str, etiqueta: str = "") -> dict:
    """Aplica `plan_limpieza` a la tabla `relaciones` (sin commit: va dentro de la
    eliminación o del retiro que la llama)."""
    filas = (
        await sesion.execute(select(Relacion).where(or_(Relacion.origen == nodo, Relacion.destino == nodo)))
    ).scalars().all()
    borrar, marcar = plan_limpieza([(r.id, r.origen, r.destino, r.fuente) for r in filas], nodo)
    por_id = {r.id: r for r in filas}
    ahora = datetime.now().astimezone().isoformat(timespec="seconds")
    for i in marcar:
        r = por_id[i]
        r.datos = {**(r.datos or {}), "destino_eliminado": {"etiqueta": etiqueta or r.texto, "fecha": ahora}}
    if borrar:
        await sesion.execute(delete(Relacion).where(Relacion.id.in_(borrar)))
    return {"borradas": len(borrar), "marcadas": len(marcar)}


async def eliminar(sesion: AsyncSession, doc: Documento) -> None:
    # Primero el número (bloquea el contador y valida que sea el último);
    # todo ocurre en UNA transacción: si algo falla, nada queda a medias.
    etiqueta = numero_mostrado(doc)  # antes del rollback (expira atributos)
    if not await liberar_numero(sesion, doc):
        await sesion.rollback()
        raise HTTPException(
            409,
            f"No se puede eliminar {etiqueta}: no tiene el último número de "
            "su serie y borrarlo dejaría un salto en la numeración oficial. "
            "Archívelo en su lugar (o elimine antes los documentos "
            "posteriores de la misma serie).",
        )
    doc_id = doc.id
    if doc.origen in ("sgdp", "manual"):
        dir_doc = carpeta(doc)
        if dir_doc and dir_doc.exists():
            shutil.rmtree(dir_doc, ignore_errors=True)
    elif doc.origen == "framework":
        adjuntos = (await sesion.execute(select(Adjunto).where(Adjunto.documento_id == doc_id))).scalars().all()
        _devolver_al_original(carpeta(doc), list(adjuntos), etiqueta)
    # Las relaciones genéricas que lo tocan (2026-10-06): sin esto quedaban filas
    # huérfanas que el mapa solo ignoraba porque su nodo ya no existe.
    # Lo que el documento anunciaba en la agenda y nadie tocó se va con él (2026-10-12: un oficio
    # rehecho dejaba su visita propuesta y el viernes salía dos veces).
    from app.servicios import agenda_detectada

    await agenda_detectada.al_eliminar_origen(sesion, f"doc:{doc_id}")
    await limpiar_relaciones(sesion, f"doc:{doc_id}", etiqueta)
    # Y sale del espacio del Formato Word de quien lo tuviera abierto (2026-10-19): un id huérfano
    # ahí dejaba una sección «Cargando…» y «El documento no existe».
    from app.servicios import espacio_word

    await espacio_word.quitar_de_todos(sesion, doc_id)
    for tabla in (VersionDocumento, Evento, Adjunto):
        await sesion.execute(
            delete(tabla).where(tabla.documento_id == doc_id)
        )
    await sesion.delete(doc)
    await sesion.commit()

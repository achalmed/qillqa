"""lib/datos.py — Carga, validación y enriquecimiento de los datos del informe.

Lee los cuatro YAML de datos/ (informe, actividades, pedidos, fotos), valida las
referencias cruzadas y calcula TODO lo derivado (horas en territorio, pedidos por
sector, entidades más requeridas…): las cifras del informe se calculan, no se
escriben a mano.
"""
from __future__ import annotations

from collections import Counter, OrderedDict
from pathlib import Path

import yaml

import config
from lib import latex as lx


class ErrorDatos(Exception):
    pass


def _leer(ruta: Path) -> dict:
    if not ruta.exists():
        raise ErrorDatos(f"Falta {ruta.name} en {ruta.parent}")
    with open(ruta, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def cargar(carpeta: Path) -> dict:
    d = carpeta / config.SUB_DATOS
    datos = {
        "informe": _leer(d / "informe.yaml"),
        "actividades": _leer(d / "actividades.yaml"),
        "pedidos": _leer(d / "pedidos.yaml"),
        "fotos": _leer(d / "fotos.yaml"),
        "carpeta": carpeta,
    }
    validar(datos)
    return datos


def validar(datos: dict) -> None:
    acts = datos["actividades"]["actividades"]
    peds = datos["pedidos"]["pedidos"]
    ids_a = [a["id"] for a in acts]
    ids_p = [p["id"] for p in peds]
    errores = []
    if len(set(ids_a)) != len(ids_a):
        errores.append("ids de actividad repetidos")
    if len(set(ids_p)) != len(ids_p):
        errores.append("ids de pedido repetidos")
    for a in acts:
        if a.get("sector") not in config.SECTORES:
            errores.append(f"{a['id']}: sector desconocido «{a.get('sector')}»")
        if a.get("tipo") not in config.TIPOS:
            errores.append(f"{a['id']}: tipo desconocido «{a.get('tipo')}»")
        for pid in a.get("pedidos") or []:
            if pid not in ids_p:
                errores.append(f"{a['id']} referencia el pedido inexistente {pid}")
    for p in peds:
        if p.get("actividad") not in ids_a:
            errores.append(f"{p['id']} referencia la actividad inexistente {p.get('actividad')}")
        if p.get("prioridad_propuesta") not in config.PRIORIDADES:
            errores.append(f"{p['id']}: prioridad «{p.get('prioridad_propuesta')}» no válida")
        if p.get("estado") not in config.ESTADOS_PEDIDO:
            errores.append(f"{p['id']}: estado «{p.get('estado')}» no válido")
    inf = datos["informe"]
    for clave in ("codigo", "numero", "anio", "mes", "version", "estado"):
        if clave not in inf:
            errores.append(f"informe.yaml: falta la clave «{clave}»")
    if inf.get("estado") not in config.ESTADOS_INFORME:
        errores.append(f"informe.yaml: estado «{inf.get('estado')}» no válido")
    if errores:
        raise ErrorDatos("Datos inválidos:\n  - " + "\n  - ".join(errores))


def enriquecer(datos: dict, fotos_listas: dict) -> dict:
    """Agrega campos derivados a actividades/pedidos y devuelve las estadísticas."""
    inf = datos["informe"]
    acts = datos["actividades"]["actividades"]
    peds = {p["id"]: p for p in datos["pedidos"]["pedidos"]}
    docs_por_act = inf.get("documentos_por_actividad") or {}
    fotos_por_act: dict[str, list] = {}
    for fid, f in fotos_listas.items():
        if fid == "portada":
            continue
        fotos_por_act.setdefault(f["actividad"], []).append(dict(f, id=fid))

    for a in acts:
        a["fecha_obj"] = lx.a_fecha(a["fecha"])
        a["dia_nombre"] = lx.dia_nombre(a["fecha"], capital=True)
        a["hora_rango"] = lx.hora_rango(a.get("hora_inicio"), a.get("hora_fin"))
        a["duracion_min"] = lx.duracion_min(a.get("hora_inicio"), a.get("hora_fin"))
        a["duracion_texto"] = lx.duracion_texto(a.get("hora_inicio"), a.get("hora_fin"))
        a["sector_nombre"] = config.SECTORES[a["sector"]]
        a["tipo_nombre"] = config.TIPOS[a["tipo"]]
        a["ubicacion"] = " · ".join(x for x in [a.get("localidad"), a.get("distrito"), a.get("provincia")] if x)
        a["pedidos_obj"] = [peds[p] for p in (a.get("pedidos") or [])]
        a["documentos_lista"] = list(a.get("documentos") or []) or list(docs_por_act.get(a["id"]) or [])
        a["fotos_lista"] = fotos_por_act.get(a["id"], [])
        n = len(a["pedidos_obj"])
        a["resumen_pedidos"] = ("Sin pedidos individualizados" if n == 0 else
                                f"{n} pedido{'s' if n != 1 else ''} sistematizado{'s' if n != 1 else ''}"
                                + (" · " + ", ".join(a["pedidos"]) if n else ""))

    # --- Días ---------------------------------------------------------------------
    dias = []
    for d in datos["actividades"]["dias"]:
        acts_dia = [a for a in acts if str(a["fecha"]) == str(d["fecha"])]
        peds_dia = [p for a in acts_dia for p in a["pedidos_obj"]]
        minutos = sum(a["duracion_min"] or 0 for a in acts_dia)
        con_hora = [a for a in acts_dia if a.get("hora_inicio")]
        dias.append(dict(d,
            fecha_obj=lx.a_fecha(d["fecha"]),
            fecha_larga=lx.fecha_larga(d["fecha"]),
            titulo=f"Día {len(dias) + 1} · {lx.dia_nombre(d['fecha'], True)} {lx.a_fecha(d['fecha']).day} de {lx.mes_nombre(lx.a_fecha(d['fecha']).month)}",
            actividades=acts_dia, n_actividades=len(acts_dia), n_pedidos=len(peds_dia),
            minutos=minutos, horas_texto=lx.horas_texto(minutos) if minutos else "",
            horas_decimal=lx.horas_decimal(minutos) if minutos else "—",
            primera_hora=min((a["hora_inicio"] for a in con_hora), default=None),
            ultima_hora=max((a["hora_fin"] for a in con_hora if a.get("hora_fin")), default=None),
            sectores=Counter(a["sector_nombre"] for a in acts_dia),
            n_ie=sum(1 for a in acts_dia if a["tipo"] == "visita_ie"),
            fotos_galeria=[f for a in acts_dia for f in a["fotos_lista"]][: config.MAX_FOTOS_GALERIA_DIA],
            fotos_galeria_completa=[f for a in acts_dia for f in a["fotos_lista"]],
        ))

    # --- Crónicas (prosa de informe.yaml) unidas a cada día por fecha ----------------------
    cronicas = {str(c.get("fecha")): c for c in (inf.get("dias") or [])}
    for d in dias:
        c = dict(cronicas.get(str(d["fecha"])) or {})
        foto = c.get("foto")
        c["foto_archivo"] = ((fotos_listas[foto].get("archivo_apaisado") or fotos_listas[foto]["archivo"])
                             if foto and foto in fotos_listas else None)
        c.setdefault("titular", d["titulo"])
        c.setdefault("entrada", "")
        c.setdefault("relato", "")
        c.setdefault("foto_pie", "")
        # Segunda foto de la crónica (máximo dos por día): al ancho de la columna,
        # tras el párrafo `foto_columna_tras` del relato. Se parte aquí (no en la
        # plantilla) para que el filtro md reciba cada mitad como prosa normal.
        foto2 = c.get("foto_columna")
        c["foto_columna_archivo"] = fotos_listas[foto2]["archivo"] if foto2 and foto2 in fotos_listas else None
        c.setdefault("foto_columna_pie", "")
        parrafos = [x for x in (c["relato"] or "").split("\n\n") if x.strip()]
        k = int(c.get("foto_columna_tras") or config.FOTO_COLUMNA_TRAS)
        k = max(0, min(k, len(parrafos)))
        c["relato_antes"] = "\n\n".join(parrafos[:k])
        c["relato_despues"] = "\n\n".join(parrafos[k:])
        if foto2 and not c["foto_columna_archivo"]:
            print(f"  [fotos] AVISO: la foto de columna {foto2} del {d['fecha']} no está lista (¿publica + seleccion?)")
        # Galería del día (al menos una foto por actividad, pedido de Edison
        # 2026-09-11): dias[].galeria lista ids (o {id, pie}) en el orden deseado;
        # si falta, se arma sola con las fotos seleccionadas del día no usadas.
        usadas = {inf.get("foto_portada"), inf.get("foto_evidencia"), foto, foto2}
        galeria = []
        if c.get("galeria"):
            for item in c["galeria"]:
                fid, pie = (item, None) if isinstance(item, str) else (item.get("id"), item.get("pie"))
                if fid in fotos_listas:
                    galeria.append(dict(fotos_listas[fid], id=fid, pie=pie or fotos_listas[fid]["pie"]))
                else:
                    print(f"  [fotos] AVISO: la foto {fid} de la galería del {d['fecha']} no está lista (¿publica + seleccion?)")
        else:
            galeria = [f for f in d["fotos_galeria_completa"] if f["id"] not in usadas][: config.MAX_FOTOS_GALERIA_CRONICA]
        c["galeria"] = galeria
        d["cronica"] = c

    # --- Distritos y localidades (tabla del ámbito) ------------------------------------
    grupos: OrderedDict = OrderedDict()
    for a in acts:
        clave = (a.get("provincia") or "Por precisar", a.get("distrito") or "Por precisar")
        g = grupos.setdefault(clave, {"provincia": clave[0], "distrito": clave[1], "n": 0, "locs": []})
        g["n"] += 1
        loc = a.get("localidad")
        if loc and loc not in g["locs"]:
            g["locs"].append(loc)
    datos["distritos_tabla"] = [dict(g, localidades=", ".join(g["locs"]) or "—") for g in grupos.values()]

    # --- Estadísticas globales ---------------------------------------------------------
    todos_ped = list(peds.values())
    acts_por_id = {a["id"]: a for a in acts}
    ent = Counter(e for p in todos_ped for e in (p.get("entidades") or []))
    minutos_total = sum(a["duracion_min"] or 0 for a in acts)
    sector_acts = Counter(a["sector_nombre"] for a in acts)
    sector_peds = Counter(acts_por_id[p["actividad"]]["sector_nombre"] for p in todos_ped)
    stats = OrderedDict(
        n_actividades=len(acts), n_pedidos=len(todos_ped), n_dias=len(dias),
        minutos_total=minutos_total, horas_texto=lx.horas_texto(minutos_total),
        horas_decimal=lx.horas_decimal(minutos_total),
        n_con_hora=sum(1 for a in acts if a["duracion_min"] is not None),
        n_ie=sum(1 for a in acts if a["tipo"] == "visita_ie"),
        n_entidades=len(ent),
        distritos=sorted({a["distrito"] for a in acts if a.get("distrito")}),
        provincias=sorted({a["provincia"] for a in acts if a.get("provincia")}),
        por_sector=sector_acts, pedidos_por_sector=sector_peds,
        por_tipo=Counter(a["tipo_nombre"] for a in acts),
        por_prioridad=Counter(p["prioridad_propuesta"] for p in todos_ped),
        por_estado=Counter(p["estado"] for p in todos_ped),
        por_dia=[(d["titulo"], d["n_actividades"], d["n_pedidos"], d["minutos"]) for d in dias],
        entidades=ent.most_common(config.TOP_ENTIDADES),
        n_fotos_publicas=sum(1 for f in datos["fotos"]["fotos"] if f.get("estado") == "publica"),
        n_fotos_reservadas=sum(1 for f in datos["fotos"]["fotos"] if f.get("estado") == "reservada"),
        n_fotos_total=len(datos["fotos"]["fotos"]),
    )
    datos["dias"] = dias
    datos["stats"] = stats
    datos["pedidos_lista"] = todos_ped
    return stats

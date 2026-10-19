#!/usr/bin/env python3
"""main.py — Generador de Informes de Semana de Representación (ISR).

Orquesta el flujo mensual completo (la lógica vive en lib/, los parámetros en
config.py):

    datos/*.yaml  →  fotos/seleccion  →  gráficos  →  módulos .tex (Jinja2)
                  →  build.sh (MDD)   →  salida/ISR-NN_AAAA-MM_vX.Y[-estado][-interna].pdf

Uso (desde el despacho, representacion/generar.sh carga el .env y llama aquí):
    main.py 2026-08_SR-01_la-mar-huamanga          # expediente de representacion/ (ISR_RAIZ) o ruta
    main.py <carpeta> --sin-compilar        # solo escribe editables/
    main.py <carpeta> --sin-fotos           # no toca fotos/seleccion
    main.py <carpeta> --forzar-fotos        # reprocesa todas las fotos
    main.py <carpeta> --version 0.2 --estado revision   # sobreescribe informe.yaml
    main.py <carpeta> --columnas 1          # variante de lectura a una columna (…-1col.pdf)
    main.py <carpeta> --edicion interna     # documento de trabajo (…-interna.pdf; no pisa la pública)
    main.py --nuevo 2026-09 02 huanta-lucanas   # crea 2026-09_SR-02_huanta-lucanas/ desde _plantilla/
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config  # noqa: E402
from lib import compilar as cp  # noqa: E402
from lib import datos as ds  # noqa: E402
from lib import fotos as ft  # noqa: E402
from lib import graficos as gf  # noqa: E402
from lib import render as rd  # noqa: E402
from lib import latex as lx  # noqa: E402

# Dos ediciones del mismo dato:
#   publica  — revista institucional (extensión razonable según el contenido, sin tope): prosa, pocas fotos grandes,
#              un solo gráfico, sin tablas, sin fichas, sin anexos (regla de Edison 2026-09-03).
#   interna  — documento de trabajo: fichas de actividad, matriz, análisis con
#              gráficos, seguimiento en tabla y anexos con los PDF de respaldo.
PARTES = {
    "publica": [
        ("parte_portada.tex.j2", "parte_00_portada.tex"),
        ("parte_creditos.tex.j2", "parte_01_creditos.tex"),
        ("parte_presentacion.tex.j2", "parte_02_presentacion.tex"),
        ("parte_resumen.tex.j2", "parte_03_resumen.tex"),
        ("parte_marco.tex.j2", "parte_04_marco.tex"),
        ("parte_cronica.tex.j2", "parte_06_cronica.tex"),
        ("parte_balance.tex.j2", "parte_08_balance.tex"),
        ("parte_seguimiento.tex.j2", "parte_09_seguimiento.tex"),
        ("parte_conclusiones.tex.j2", "parte_10_conclusiones.tex"),
        ("parte_contraportada.tex.j2", "parte_12_contraportada.tex"),
    ],
    "interna": [
        ("parte_portada.tex.j2", "parte_00_portada.tex"),
        ("parte_creditos.tex.j2", "parte_01_creditos.tex"),
        ("parte_presentacion.tex.j2", "parte_02_presentacion.tex"),
        ("parte_resumen.tex.j2", "parte_03_resumen.tex"),
        ("parte_metodologia.tex.j2", "parte_04_metodologia.tex"),
        ("parte_ambito.tex.j2", "parte_05_ambito.tex"),
        ("parte_dias.tex.j2", "parte_06_dias.tex"),
        ("parte_matriz.tex.j2", "parte_07_matriz.tex"),
        ("parte_analisis.tex.j2", "parte_08_analisis.tex"),
        ("parte_seguimiento.tex.j2", "parte_09_seguimiento.tex"),
        ("parte_conclusiones.tex.j2", "parte_10_conclusiones.tex"),
        ("parte_anexos.tex.j2", "parte_11_anexos.tex"),
        ("parte_contraportada.tex.j2", "parte_12_contraportada.tex"),
    ],
}


def resolver_carpeta(arg: str) -> Path:
    p = Path(arg)
    if not p.is_absolute():
        for base in (Path.cwd(), config.RAIZ_SR):
            if (base / p).exists():
                p = (base / p).resolve()
                break
    if not (p / config.SUB_DATOS).is_dir():
        sys.exit(f"No parece una carpeta de informe (falta {config.SUB_DATOS}/): {p}")
    return p


def actualizar_version(carpeta: Path, version: str | None, estado: str | None) -> None:
    """Reescribe version/estado en informe.yaml sin tocar el resto del archivo."""
    if not version and not estado:
        return
    ruta = carpeta / config.SUB_DATOS / "informe.yaml"
    texto = ruta.read_text(encoding="utf-8")
    if version:
        # (función de reemplazo, no cadena: una r-string con \" dejaba las barras en el YAML)
        texto = re.sub(r"^(version:\s*).*$", lambda m: f'{m.group(1)}"{version}"', texto, count=1, flags=re.M)
    if estado:
        if estado not in config.ESTADOS_INFORME:
            sys.exit(f"Estado no válido: {estado} (válidos: {', '.join(config.ESTADOS_INFORME)})")
        texto = re.sub(r"^(estado:\s*).*$", rf"\g<1>{estado}", texto, count=1, flags=re.M)
    ruta.write_text(texto, encoding="utf-8")
    print(f"  [datos] informe.yaml → versión {version or '(igual)'} · estado {estado or '(igual)'}")


def nuevo_informe(aaaa_mm: str, numero: str, slug: str) -> Path:
    """Crea el expediente de la semana AAAA-MM_SR-NN_slug/ desde _plantilla/ y rellena
    identidad, año y mes en datos/informe.yaml y en expediente.yaml (si la plantilla lo trae)."""
    anio, mes = aaaa_mm.split("-")
    numero = numero.zfill(2)
    destino = config.CARPETA_INFORMES / f"{anio}-{mes}_SR-{numero}_{slug}"
    if destino.exists():
        sys.exit(f"Ya existe: {destino}")
    if not config.PLANTILLA_INFORME.is_dir():
        sys.exit(f"No existe la plantilla {config.PLANTILLA_INFORME} (ISR_RAIZ={config.RAIZ_SR})")
    shutil.copytree(config.PLANTILLA_INFORME, destino)
    inf = destino / config.SUB_DATOS / "informe.yaml"
    texto = inf.read_text(encoding="utf-8")
    texto = (texto.replace("codigo: ISR-00", f"codigo: ISR-{numero}")
                  .replace("numero: 0", f"numero: {int(numero)}")
                  .replace("anio: 2000", f"anio: {anio}")
                  .replace("mes: 1", f"mes: {int(mes)}"))
    inf.write_text(texto, encoding="utf-8")
    exp = destino / config.ARCHIVO_EXPEDIENTE
    if exp.exists():
        texto = exp.read_text(encoding="utf-8")
        texto = (texto.replace("id: SR-00", f"id: SR-{numero}")
                      .replace("informe: ISR-00", f"informe: ISR-{numero}")
                      .replace("anio: 2000", f"anio: {anio}")
                      .replace("mes: 1\n", f"mes: {int(mes)}\n")
                      .replace('slug: "«slug»"', f"slug: {slug}")
                      .replace("2000/2000-01_sr-00_«slug»", f"{anio}/{anio}-{mes}_sr-{numero}_{slug}"))
        exp.write_text(texto, encoding="utf-8")
    print(f"Expediente creado: {destino}\nSiguiente paso: llenar {config.ARCHIVO_EXPEDIENTE}, "
          f"{inf.relative_to(destino)} y los demás YAML de datos/; el plan y el cronograma van en planificacion/.")
    return destino


def generar(carpeta: Path, *, con_fotos=True, forzar_fotos=False, compilar=True, edicion=None, columnas=2) -> None:
    print(f"== Informe: {carpeta.name}")
    datos = ds.cargar(carpeta)
    inf = datos["informe"]
    edicion = edicion or inf.get("edicion") or "publica"
    if edicion not in PARTES:
        sys.exit(f"Edición desconocida: {edicion} (válidas: {', '.join(PARTES)})")
    print(f"  [edición] {edicion} · prosa a {columnas} columna{'s' if columnas != 1 else ''}")

    # 1. Fotos ------------------------------------------------------------------
    portada_id = inf.get("foto_portada")
    aperturas = {d.get("foto") for d in (inf.get("dias") or []) if d.get("foto")}
    fotos_listas = ft.preparar(carpeta, datos["fotos"], forzar=forzar_fotos if con_fotos else False,
                               portada_id=portada_id, apaisadas=aperturas)
    print(f"  [fotos] {len([k for k in fotos_listas if k != 'portada'])} fotos listas"
          f"{' + portada' if 'portada' in fotos_listas else ' (sin portada)'}")

    # 2. Datos derivados ---------------------------------------------------------------
    stats = ds.enriquecer(datos, fotos_listas)
    print(f"  [datos] {stats['n_actividades']} actividades · {stats['n_pedidos']} pedidos · "
          f"{stats['horas_texto']} en territorio · {stats['n_entidades']} entidades")

    # 3. Gráficos ----------------------------------------------------------------------
    editables = carpeta / config.SUB_EDITABLES
    editables.mkdir(exist_ok=True)
    graficos = gf.generar_todos(datos, editables / "graficos")
    print(f"  [gráficos] {len(graficos)} gráficos en editables/graficos/")

    # 4. Módulos LaTeX ----------------------------------------------------------------
    # Los PDF de respaldo llevan nombres institucionales con espacios y
    # signos (OFICIO N°0040-… .pdf): se copian a editables/anexos/ con un
    # nombre seguro para \includepdf (anexo-NN-KK.pdf), regenerable. Solo en la
    # edición que los imprime y solo si hay alguno: la pública no deja
    # editables/anexos/ vacío ni lleno de copias que no usa (2026-09-30).
    partes = PARTES[edicion]
    anexos_dir = carpeta / config.SUB_ANEXOS
    copias_dir = editables / "anexos"
    lleva_anexos = any(p == "parte_anexos.tex.j2" for p, _ in partes)
    anexos = []
    for i, a in enumerate((inf.get("anexos") or []) if lleva_anexos else [], start=1):
        archivos = list(a.get("archivos") or ([a["archivo"]] if a.get("archivo") else []))
        pdfs = []
        for k, nombre in enumerate(archivos, start=1):
            origen = anexos_dir / nombre
            if not origen.exists():
                print(f"  [anexos] AVISO: falta {nombre}")
                continue
            destino = copias_dir / f"anexo-{i:02d}-{k:02d}.pdf"
            copias_dir.mkdir(exist_ok=True)
            if not destino.exists() or destino.stat().st_mtime < origen.stat().st_mtime:
                shutil.copy2(origen, destino)
            pdfs.append(f"anexos/{destino.name}")
        anexos.append(dict(a, n=i, pdfs=pdfs, archivos=archivos))
    contexto = dict(inf=inf, datos=datos, dias=datos["dias"], actividades=datos["actividades"]["actividades"],
                    pedidos=datos["pedidos_lista"], stats=stats, fotos=fotos_listas, graficos=graficos,
                    anexos=anexos, carpeta=carpeta, lx=lx, columnas=columnas,
                    mes_nombre=lx.mes_nombre(int(inf["mes"]), capital=True))
    env = rd.entorno()
    # limpia módulos de la otra edición para que editables/ no engañe
    for viejo in editables.glob("parte_*.tex"):
        viejo.unlink()
    for plantilla, salida in partes:
        rd.renderizar(env, plantilla, contexto, editables / salida)
    rd.renderizar(env, "informe.tex.j2", dict(contexto, partes=[s for _, s in partes]), editables / config.ARCHIVO_MAESTRO)
    rd.renderizar(env, "metadata.tex.j2", contexto, editables / "metadata.tex")
    print(f"  [tex] maestro + {len(partes)} módulos en editables/")

    # 5. Compilar y archivar -------------------------------------------------------------
    if not compilar:
        print("  (sin compilar: --sin-compilar)")
        return
    pdf = cp.compilar(editables / config.ARCHIVO_MAESTRO)
    final = cp.archivar(pdf, carpeta, inf, columnas, edicion)
    n = cp.paginas(final)
    print(f"== PDF: {final}{f' ({n} páginas)' if n else ''}")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="Generador de Informes de Semana de Representación")
    ap.add_argument("carpeta", nargs="?", help="carpeta del informe (informes/AAAA/AAAA-MM_ISR-NN_slug)")
    ap.add_argument("--sin-compilar", action="store_true")
    ap.add_argument("--sin-fotos", action="store_true")
    ap.add_argument("--forzar-fotos", action="store_true")
    ap.add_argument("--version", help="versión a fijar en informe.yaml (p. ej. 0.2, 1.0)")
    ap.add_argument("--estado", choices=config.ESTADOS_INFORME)
    ap.add_argument("--edicion", choices=list(PARTES), help="publica (revista) o interna (fichas+matriz+anexos; archiva …-interna.pdf); por defecto la de informe.yaml")
    ap.add_argument("--columnas", type=int, choices=(1, 2), default=2, help="prosa a dos columnas (revista, por defecto) o a una (lectura); la de una lleva sufijo -1col")
    ap.add_argument("--nuevo", nargs=3, metavar=("AAAA-MM", "NN", "slug"), help="crea el informe del mes")
    a = ap.parse_args(argv)

    if a.nuevo:
        nuevo_informe(*a.nuevo)
        return
    if not a.carpeta:
        ap.error("indica la carpeta del informe o usa --nuevo")
    carpeta = resolver_carpeta(a.carpeta)
    actualizar_version(carpeta, a.version, a.estado)
    try:
        generar(carpeta, con_fotos=not a.sin_fotos, forzar_fotos=a.forzar_fotos,
                compilar=not a.sin_compilar, edicion=a.edicion, columnas=a.columnas)
    except (ds.ErrorDatos, RuntimeError, FileNotFoundError) as e:
        sys.exit(f"ERROR: {e}")


if __name__ == "__main__":
    main()

"""Orquesta la compilación de un documento de la plataforma: asegura su
carpeta, escribe metadata.tex + <clase>.tex y ejecuta build.sh.

La ruta (y el número, si ya se asignó) se persisten ANTES de compilar,
para que disco y BD nunca queden desalineados si la compilación falla.
"""

import logging
import re
import time
from dataclasses import replace

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.latex import reparacion
from app.latex.compilador import compilar_en_carpeta
from app.latex.serializador import NodoNoSoportado
from app.modelos import Documento
from app.servicios.adjuntos import (
    anexos_de,
    combinar_adjuntos,
    denominar_adjuntos,
    linea_adj,
    nombres_adjuntos,
    nombres_manuales,
)
from app.servicios import nombres
from app.servicios.carpetas import asegurar_carpeta
from app.servicios.pdf import contar_paginas
from app.tipos import tipo_config

log = logging.getLogger("sgdp.compilacion")


# --- Firma sola en la última hoja (2026-10-06, OF-0122) ---------------------------------
# Con el espacio para firmar subido a mano (fmt_firma_espacio = 3 cm) y una nota al pie que
# ocupaba el final de la hoja, «Atentamente» y la firma no cabían y pasaban SOLOS a una hoja
# nueva: un oficio de 3 páginas con la última vacía salvo la firma, ya firmado. Regla: si la
# última hoja empieza por el cierre, se recompila con el espacio mínimo que admite la firma
# digital (2 cm, el del marco); lo que el usuario guardó no se toca.
ESPACIO_FIRMA_MINIMO = "2cm"
_RE_CM = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*cm\s*$")


def _ahora() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _cm(valor: str) -> float | None:
    m = _RE_CM.match(valor or "")
    return float(m.group(1).replace(",", ".")) if m else None


# Primera línea del cierre de cada tipo: «Atentamente,» (oficio, memorando, carta…) y la fórmula
# del informe («Es cuanto informo…», structures/informe/structure.tex). Sin la del informe, la
# firma sola de un informe nunca se detectaba.
CIERRES = ("atentamente", "es cuanto informo")


def firma_sola_al_final(paginas: list[str], lineas_previas: int = 0) -> bool:
    """¿La última hoja trae solo el cierre? Se quitan las líneas que se repiten en todas las
    hojas (membrete y pie) y el «Pág. n de m»; si «Atentamente» aparece tras a lo sumo
    `lineas_previas` líneas (las del último párrafo, que acompaña a la firma), del cuerpo no
    pasó nada más a esa hoja. Pura (recibe el texto de cada página)."""
    if len(paginas) < 2:
        return False
    norm = lambda t: " ".join(t.split())  # noqa: E731
    comunes = {norm(l) for l in paginas[0].splitlines() if l.strip()} & {norm(l) for l in paginas[1].splitlines() if l.strip()}
    vistas = 0
    for linea in paginas[-1].splitlines():
        l = norm(linea)
        if not l or l in comunes or re.fullmatch(r"P[áa]g\.?\s*\d+\s*de\s*\d+", l, re.I):
            continue
        if l.lower().startswith(CIERRES):
            return True
        vistas += 1
        if vistas > lineas_previas:
            return False
    return False


# El último párrafo pasa ENTERO con la firma (generador: \\nobreak y sin viudas): una última
# hoja con a lo sumo estas líneas antes de «Atentamente» es una hoja solo de cierre.
LINEAS_CIERRE = 4


def espacios_a_probar(espacio: float | None, defecto: float = 2.2) -> list[str]:
    """Espacios de firma para intentar que el cierre suba a la hoja anterior: de 0,5 en 0,5 cm
    por debajo del guardado, hasta el mínimo (2 cm). `defecto` es el del tipo cuando el campo
    está vacío (oficio 2,0; memorando e informe 1,8: nunca se prueba MÁS espacio). Pura."""
    minimo = _cm(ESPACIO_FIRMA_MINIMO) or 2.0
    actual = espacio if espacio is not None else defecto
    salida, v = [], round(actual - 0.5, 2)
    while v > minimo:
        salida.append(f"{v:g}cm")
        v = round(v - 0.5, 2)
    if actual > minimo:
        salida.append(ESPACIO_FIRMA_MINIMO)
    return salida


# --- La firma nunca sola: escalera de ajustes legibles (Edison 2026-10-08) -----------------
# «Nunca debe quedar sola la firma y la posfirma en una hoja aparte… de forma automática, hasta
# encontrar un documento adecuado, pero con un límite legible». Dos salidas, en este orden:
#  1. AHORRAR la hoja: se aprieta de a poco —espacio de la firma, aire de la cabecera, aire entre
#     párrafos, interlineado, tamaño de letra— y se queda el primer paso que deja una hoja menos.
#     Pisos: firma 2 cm (la firma digital), párrafos 1 pt, interlineado 1,0 y letra 10 pt.
#  2. (Retirada el 2026-10-10 por Edison: acortar la primera hoja dejaba un hueco «que no se da en un
#     documento formal».) Si la salida 1 no alcanza, se compone normal: el \nobreak del generador
#     lleva las últimas líneas del párrafo final con la firma, como Word.
# Lo guardado no cambia: los ajustes viven solo en la compilación. Probado el 2026-10-08 con los 17
# documentos del archivo que tenían el cierre solo: la salida 1 resolvió 9.
DEFECTO_FIRMA = {"memorando": 1.8, "informe": 1.8}   # el resto: 2,0 cm (generador)
LINEAS_POBRE = 5          # una última hoja con a lo sumo 5 líneas de texto antes del cierre es pobre
LINEAS_ACOMPANADA = 7     # tras acortar la primera hoja, la firma debe ir con más de 7 líneas
_RE_PT = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*pt\s*$")


def _num(valor, defecto: float) -> float:
    try:
        return float(str(valor).strip().replace(",", "."))
    except (TypeError, ValueError):
        return defecto


def exige_una_hoja(cfg: dict, campos: dict) -> bool:
    """¿El documento debe caber en una hoja? Lo dice el tipo (`una_hoja` de tipos.py, una
    expresión sobre el asunto: los memorandos de viáticos y pasajes, Edison 2026-10-18). Pura."""
    patron = cfg.get("una_hoja")
    return bool(patron and re.search(patron, str(campos.get("asunto") or ""), re.I))


def pasos_de_ajuste(campos: dict, clase: str, una_hoja: bool = False) -> list[tuple[str, dict]]:
    """Escalera ACUMULATIVA de ajustes para que el cierre suba a la hoja anterior: cada paso
    lleva los anteriores. (descripción legible, campos que cambia). Con `una_hoja`, dos peldaños
    más al final: tablas en letra menor y márgenes de 2 cm. Pura."""
    def v(clave: str) -> str:
        return str(campos.get(clave) or "").strip()

    pasos: list[tuple[str, dict]] = []
    acum: dict = {}
    for espacio in espacios_a_probar(_cm(v("fmt_firma_espacio")), DEFECTO_FIRMA.get(clase, 2.0)):
        acum = {**acum, "fmt_firma_espacio": espacio}
        pasos.append((f"espacio de firma {espacio.replace('cm', ' cm').replace('.', ',')}", dict(acum)))
    cabecera = {"fmt_espacio_partes": 0.1, "fmt_espacio_saludo": 0.0, "fmt_espacio_cuerpo": 0.1}
    menos = {k: f"{n:g}" for k, n in cabecera.items() if _num(v(k), 0.2 if k != "fmt_espacio_cuerpo" else 0.8) > n}
    if menos:
        acum = {**acum, **menos}
        pasos.append(("menos aire en la cabecera", dict(acum)))
    m = _RE_PT.match(v("fmt_espacioparrafos"))
    if (float(m.group(1)) if m else 4.0) > 1:
        acum = {**acum, "fmt_espacioparrafos": "1pt"}
        pasos.append(("párrafos más juntos", dict(acum)))
    if _num(v("fmt_interlineado"), 1.15) > 1:
        acum = {**acum, "fmt_interlineado": "1.0"}
        pasos.append(("interlineado 1,0", dict(acum)))
    # La letra baja de medio en medio punto hasta el piso legible (10 pt). Si el cuerpo tiene
    # tamaño propio se baja ese; si no, el del documento entero (escala proporcional).
    clave = "fmt_cuerpo_tamano" if _num(v("fmt_cuerpo_tamano"), 0) else "fmt_tamano"
    tam = _num(v(clave), 11.0) - 0.5
    while tam >= 10:
        acum = {**acum, clave: f"{tam:g}"}
        pasos.append((f"letra {f'{tam:g}'.replace('.', ',')} pt", dict(acum)))
        tam -= 0.5
    if una_hoja:
        if v("fmt_tabla_tamano") not in ("muy-pequeno", "diminuto"):
            acum = {**acum, "fmt_tabla_tamano": "muy-pequeno"}
            pasos.append(("tablas en letra menor", dict(acum)))
        if v("fmt_margenes") != "2cm":
            acum = {**acum, "fmt_margenes": "2cm"}
            pasos.append(("márgenes de 2 cm", dict(acum)))
    return pasos


# Último ajuste que resolvió cada documento: se prueba primero en el guardado siguiente (el
# guardado automático recompila a menudo y la escalera entera cuesta varias compilaciones).
_ULTIMO_AJUSTE: dict[int, tuple[str, dict]] = {}


def valores_ultimo_ajuste(doc_id: int) -> dict:
    """Valores con que se compiló la última vez este documento cuando el ajuste automático
    intervino (para mostrarlos al abrir el editor); {} si no intervino."""
    previo = _ULTIMO_AJUSTE.get(doc_id)
    if not previo:
        return {}
    extra = previo[1]
    valores = {k: str(v) for k, v in extra.items() if not k.startswith("_")}
    if "_ajuste_aligerar" in extra:
        valores["_aligerar"] = str(extra["_ajuste_aligerar"])
    return valores


def _textos_paginas(ruta) -> list[str]:
    import subprocess

    try:
        salida = subprocess.run(["pdftotext", "-layout", str(ruta), "-"], capture_output=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return []
    return salida.stdout.decode("utf-8", "replace").split("\f")[:-1] if salida.returncode == 0 else []


async def compilar(sesion: AsyncSession, doc: Documento, rapido: bool = False, permitir_perdida: bool = True) -> None:
    """`rapido` (guardado automático, 2026-10-10): la vista previa tardaba porque la escalera de
    «la firma nunca sola» puede compilar hasta 15 veces (5 s cada una). En automático solo se
    prueba el último ajuste que sirvió y tres pasos más; la escalera completa queda para
    Guardar, Vista previa y Generar."""
    cfg = tipo_config(doc.tipo)
    if cfg.get("externo"):
        # Series producidas fuera de Qillqa (ISR por el generador informe-sr; REC son
        # documentos recibidos): se numeran y registran aquí, su PDF entra por
        # «incorporar» (M10 D5, 2026-09-15).
        raise HTTPException(
            422,
            f"El tipo «{cfg['nombre']}» no se compila en Qillqa: su PDF se produce "
            "fuera y se registra con «Incorporar».",
        )
    inicio = time.monotonic()
    carpeta = await asegurar_carpeta(doc)
    await sesion.commit()
    # Imágenes marcadas como anexo -> se incrustan como páginas del PDF.
    anexos = await anexos_de(sesion, doc.id)
    # La línea «Adj.» del pie se arma SOLA con los nombres de los documentos
    # adjuntos (Edison 2026-09-05): primero los escritos sin archivo
    # (campos.anexo, un adjunto físico) y luego los archivos cargados.
    campos = dict(doc.campos or {})
    campos["anexo"] = linea_adj(denominar_adjuntos(
        combinar_adjuntos(nombres_manuales(campos), await nombres_adjuntos(sesion, doc.id))
    ))
    # NO se genera la página «RELACIÓN DE DOCUMENTOS ADJUNTOS»: no es formato
    # de un oficio formal (pedido de Edison 2026-09-01). Los adjuntos siguen
    # pegados al documento y se fusionan en el expediente (expediente.py); solo
    # se omite esa página-cover del PDF. El generador conserva la capacidad
    # (generador._pagina_relacion) pero aquí no se le pide -> se pasa None.
    cuerpo = doc.cuerpo
    reparaciones: list[dict] = []

    async def intento(c: dict, cu: dict, a: list):
        try:
            return await compilar_en_carpeta(carpeta, cfg["clase"], cfg["tipodoc"], c, cu, doc.numero, a, None, tipo_cfg=cfg), ""
        except NodoNoSoportado as error:
            return None, str(error)

    resultado, campos, cuerpo, anexos, reparaciones, mensaje_original, motivo = await reparacion.con_reparaciones(
        intento, campos, cuerpo, anexos, permitir_perdida)
    if resultado is None:
        doc.estado_compilacion = {"ok": False, "en": _ahora(), "error": motivo[:600], "reparaciones": reparaciones, "pdf_al_dia": False}
        await sesion.commit()
        log.warning("Documento %s: no compiló ni con reparaciones (%s): %s", doc.id,
                    ", ".join(r["paso"] for r in reparaciones) or "ninguna aplicable", motivo[:300])
        raise HTTPException(500 if "LaTeX" in motivo or "no pudo generarse" in motivo else 422, motivo)
    if reparaciones:
        log.warning("Documento %s: compiló tras reparar (%s). Error original: %s", doc.id,
                    ", ".join(r["paso"] for r in reparaciones), mensaje_original[:300])
    # La firma nunca sola (ver «escalera de ajustes» arriba). Lo guardado no cambia; el ajuste
    # usado se informa en doc.ajuste_firma para que la web lo diga.
    doc.ajuste_firma = ""
    # Valores EFECTIVOS con que se compiló (2026-10-10, Edison: «esos cambios deben reflejarse
    # en la configuración para saber qué valores está tomando la autoconfiguración»): la web
    # los muestra junto a cada control. Vacío = lo guardado, tal cual.
    doc.ajuste_valores = {}
    # El ajuste automático se apaga por documento (fmt_ajuste_auto=no): manda lo que se eligió.
    auto_permitido = str(campos.get("fmt_ajuste_auto") or "").strip() != "no"
    una_hoja = exige_una_hoja(cfg, campos)
    if resultado.ruta_pdf is not None and auto_permitido:
        paginas = _textos_paginas(resultado.ruta_pdf)
        if firma_sola_al_final(paginas, LINEAS_POBRE) or (una_hoja and len(paginas) > 1):
            ultimo_extra: list = [None]   # lo que quedó compilado en la carpeta

            async def probar(extra: dict):
                ultimo_extra[0] = extra
                try:
                    otro = await compilar_en_carpeta(
                        carpeta, cfg["clase"], cfg["tipodoc"], {**campos, **extra},
                        cuerpo, doc.numero, anexos, None, tipo_cfg=cfg,
                    )
                except NodoNoSoportado:
                    return None, []
                return (otro, _textos_paginas(otro.ruta_pdf)) if otro.exito and otro.ruta_pdf else (None, [])

            def ahorra(p: list[str]) -> bool:
                # El de una hoja solo se da por resuelto cuando cabe entero en ella.
                return len(p) == 1 if una_hoja else 0 < len(p) < len(paginas)

            def acompana(p: list[str]) -> bool:
                return len(p) == len(paginas) and not firma_sola_al_final(p, LINEAS_ACOMPANADA)

            elegido = None
            previo = _ULTIMO_AJUSTE.get(doc.id)
            if previo:
                otro, p = await probar(previo[1])
                if otro and (ahorra(p) or acompana(p)):
                    elegido = (otro, previo)
            reserva = None  # ahorró una hoja, pero la nueva última también va casi sola
            if elegido is None:
                pasos = pasos_de_ajuste(campos, cfg["clase"], una_hoja)
                if rapido:
                    # Los tres pasos de más efecto (el último de cada tramo), no toda la escalera.
                    pasos = [p for p in pasos if p[0].startswith(("menos aire", "interlineado"))] + pasos[-1:]
                # La escalera es ACUMULATIVA (cada paso aprieta más que el anterior): si un paso
                # ahorra la hoja, los siguientes también. Por eso el primero que ahorra se busca por
                # BISECCIÓN (4 compilaciones en vez de hasta 15: un «Guardar» tardaba 80 s;
                # auditoría 2026-10-10) y desde él se sigue en orden, como antes, hasta uno que
                # no deje la última hoja pobre. Mismo resultado que el recorrido lineal.
                vistos: dict[int, tuple] = {}

                async def ver(i: int):
                    if i not in vistos:
                        vistos[i] = await probar(pasos[i][1])
                    return vistos[i]

                desde = None
                if pasos:
                    otro, p = await ver(len(pasos) - 1)
                    if otro is not None and ahorra(p):
                        lo, hi = 0, len(pasos) - 1
                        while lo < hi:
                            mitad = (lo + hi) // 2
                            otro, p = await ver(mitad)
                            if otro is not None and ahorra(p):
                                hi = mitad
                            else:
                                lo = mitad + 1
                        desde = lo
                if desde is not None:
                    for j in range(desde, len(pasos)):
                        otro, p = await ver(j)
                        if otro is None:
                            break
                        if ahorra(p):
                            if not firma_sola_al_final(p, LINEAS_POBRE):
                                elegido = (otro, pasos[j])
                                break
                            reserva = reserva or pasos[j]
            if elegido is None and reserva:
                otro, p = await probar(reserva[1])
                if otro and ahorra(p):
                    elegido = (otro, reserva)
            # Ya NO se acorta la primera hoja para «acompañar» la firma (Edison 2026-10-10,
            # segunda vuelta: «dejar espacio en la primera página para que no quede la firma
            # sola se ve feo; eso no se da en un documento formal»). Si ningún ajuste legible
            # ahorra la hoja, el documento se compone normal: el encadenado \nobreak del
            # generador ya hace que las últimas líneas del párrafo final acompañen a la firma,
            # como el «conservar con el siguiente» de Word.
            if elegido:
                resultado, (descripcion, extra) = elegido
                if ultimo_extra[0] is not extra:
                    # La bisección pudo compilar otro paso después del elegido: la carpeta
                    # debe quedar con el PDF del elegido.
                    otro, _ = await probar(extra)
                    if otro is not None:
                        resultado = otro
                _ULTIMO_AJUSTE[doc.id] = (descripcion, extra)
                doc.ajuste_firma = descripcion
                doc.ajuste_valores = {k: str(v) for k, v in extra.items() if not k.startswith("_")}
                if "_ajuste_aligerar" in extra:
                    doc.ajuste_valores["_aligerar"] = str(extra["_ajuste_aligerar"])
                log.info("Documento %s: %s; se compiló con %s.", doc.id,
                         "debe ir en una hoja" if una_hoja else "cierre solo en la última hoja", descripcion)
            else:
                _ULTIMO_AJUSTE.pop(doc.id, None)
                if una_hoja:
                    log.warning("Documento %s: debe ir en una hoja y no cabe ni con el ajuste más apretado.", doc.id)
                # Ninguno sirvió: vuelve la versión con lo guardado (la carpeta tiene la última prueba).
                resultado = await compilar_en_carpeta(
                    carpeta, cfg["clase"], cfg["tipodoc"], campos, cuerpo,
                    doc.numero, anexos, None, tipo_cfg=cfg,
                )
    log.info("Documento %s compilado en %.1f s%s", doc.id, time.monotonic() - inicio, " (rápido)" if rapido else "")
    if resultado.ruta_pdf is not None:
        # El PDF se renombra a la convención ÚNICA del sistema
        # (servicios/nombres.py). El framework ya le puso su nombre
        # institucional al compilar, pero el que manda para los documentos de
        # la plataforma es este: así el visor, la descarga, la copia y la
        # sincronización reparten siempre el mismo nombre, y los .tex hechos a
        # mano conservan el suyo sin depender de este servicio.
        destino = resultado.ruta_pdf.with_name(nombres.documento(doc))
        if destino != resultado.ruta_pdf:
            resultado.ruta_pdf.replace(destino)
            resultado = replace(resultado, ruta_pdf=destino)
        doc.pdf_archivo = destino.name
        # Folios AUTOMÁTICOS: páginas del PDF recién compilado. La bandeja
        # permite corregirlos a mano después (PUT /folios); cada compilación
        # los vuelve a poner al día con el PDF vigente.
        paginas = contar_paginas(resultado.ruta_pdf)
        if paginas is not None:
            doc.folios = paginas
    doc.estado_compilacion = {"ok": True, "en": _ahora(), "error": "", "reparaciones": reparaciones, "pdf_al_dia": True}
    await sesion.commit()

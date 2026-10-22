"""backend/tests/test_fronteras.py — las fronteras de los módulos ya aislados (fase 10.2b de
docs/plataforma/propuesta-repositorios.md, 2026-10-20). Un módulo aislado se usa SOLO por el contrato de Tiqsi
(capacidades, eventos, referencias) y solo usa lo suyo, la plataforma (lista explícita: se achica cuando cada
cosa pasa a ser un puerto) y Tiqsi. Cuando un módulo más se aísla, se agrega aquí y ya no puede retroceder.
Lee el código con `ast`, sin importarlo.
"""
import ast
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"

# La Mediateca salió a su repositorio el 2026-10-21 (Rikchay, fase 10.3; docs/plataforma/propuesta-repositorios.md
# §8.1): su frontera la vigila su propia prueba (rikchay/tests/test_fronteras.py: solo usa lo suyo y Tiqsi). Aquí,
# lo de este lado: solo el anfitrión la monta (su manifiesto) y su base la prepara app.db (más abajo).
# Los proyectos que ya salieron a su repositorio (fase 10.3): quién de Qillqa los importa y qué de ellos.
PAQUETES_EXTERNOS = {
    "rikchay": {"app.plataforma": {"rikchay.manifiesto"}, "app.db": {"rikchay.db"}},
    "wayra": {"app.plataforma": {"wayra.manifiesto"}},                 # el kit de OBS (2026-10-21)
    # La base común de los editores (2026-10-21): no es un módulo (no tiene manifiesto); la importan solo las API de
    # los editores y sus arranques solos, que montan con ella sus rutas.
    "tullpu": {"app.plataforma": {"tullpu.manifiesto"}},               # el editor de fotos (2026-10-21)
    "kuyuy": {"app.plataforma": {"kuyuy.manifiesto"}},                 # el editor de videos (2026-10-21)
    "awana": {"app.plataforma": {"awana.manifiesto"}},                 # el editor de piezas (2026-10-21)
    "qhawana": {"app.plataforma": {"qhawana.manifiesto"}},             # el Observatorio de datos (2026-10-22)
    "yupay": {"app.plataforma": {"yupay.manifiesto"}},                 # Rendición de cuentas (2026-10-22)
    "minka": {"app.plataforma": {"minka.manifiesto"}},                 # Tareas y Agenda (2026-10-22)
    "rimay": {"app.plataforma": {"rimay.manifiesto"}},                 # el chat (2026-10-22)
    "punku": {"app.plataforma": {"punku.manifiesto"}},                 # la Mesa de Partes (2026-10-22)
    # Gestión documental, Proyectos de ley y la Semana, con el marco documental y la edición simultánea (2026-10-22).
    "qillqasqa": {"app.plataforma": {"qillqasqa.manifiesto"}},
    # Ruray, la base común de los editores, ya no la importa Qillqa: la usan Tullpu, Kuyuy y Awana desde sus repositorios.
    "ruray": {},
}

# Rendición de cuentas (Yupay) salió a su repositorio el 2026-10-22: ver PAQUETES_EXTERNOS. El Mapa y las etiquetas la usan
# por «rendiciones.v1» y por referencia.

# Tareas y Agenda (Minka) salió a su repositorio el 2026-10-22: ver PAQUETES_EXTERNOS. Qillqa la usa por «tareas.v1»,
# «agenda.v1», «vinculos.v1», sus resolutores y los eventos del bus.

# El chat (Rimay) salió a su repositorio el 2026-10-22: ver PAQUETES_EXTERNOS. Qillqa le habla por «conversaciones.v1» y el
# bus; le compone el anuncio y las tarjetas («redaccion.v1») y registra lo que se pega o se adjunta («registro.v1»).

# La Mesa de Partes (Punku) salió a su repositorio el 2026-10-22: ver PAQUETES_EXTERNOS. Qillqa la usa por «recibidos.v1»,
# su referencia «entrada:<id>» y sus eventos.

# El Observatorio de datos (Qhawana) salió a su repositorio el 2026-10-22: ver PAQUETES_EXTERNOS. El anfitrión solo le pasa
# su tema (scripts/observatorio.py, fuera de app/).

# El kit de transmisiones (proyecto Wayra, editores E1; fase 10.2b, 2026-10-20): su configuración, su API (sirve el kit de
# OBS que vino de Unancha con el estudio) y su arranque solo. No toma nada de Qillqa.

# La base común de los editores salió a su repositorio el 2026-10-21 (Ruray, fase 10.3; propuesta §8.2): ver
# PAQUETES_EXTERNOS. Los editores la toman de ahí, ya no de Qillqa.
# El editor de fotos (Tullpu) salió a su repositorio el 2026-10-21 (con sus páginas, de Ruray): ver PAQUETES_EXTERNOS.
# El editor de videos (Kuyuy) salió a su repositorio el 2026-10-21 (con su página, de Ruray): ver PAQUETES_EXTERNOS.
# El editor de piezas (Awana) salió a su repositorio el 2026-10-21 (con sus páginas, de Ruray): ver PAQUETES_EXTERNOS.

# Cada módulo aislado: (sus archivos, quién puede importarlo, cómo se lo pide desde fuera, lo de Qillqa que aún usa,
# los modelos de Qillqa que aún usa).
AISLADOS = {
}


def _modulo(ruta: Path) -> str:
    """El nombre con que se importa: un paquete es su carpeta («app.rendicion_marco», no «….__init__»)."""
    partes = ruta.relative_to(APP.parent).with_suffix("").parts
    return ".".join(partes[:-1] if partes[-1] == "__init__" else partes)


def _absoluto(ruta: Path, n: ast.ImportFrom) -> str:
    """El módulo de un `from … import`, también si es relativo («from ..entradas import x» en app/servicios/pegado/
    → «punku.entradas»): un import relativo también cruza fronteras (Punku P3, 2026-10-20)."""
    if n.level == 0:
        return n.module or ""
    paquete = _modulo(ruta).split(".")
    if ruta.name != "__init__.py":
        paquete = paquete[:-1]
    base = paquete[: len(paquete) - (n.level - 1)]
    return ".".join(base + ([n.module] if n.module else []))


def _importaciones(ruta: Path):
    """(módulo importado, nombres, línea) de cada import de `app.*` del archivo, también los de dentro de funciones y
    los relativos."""
    for n in ast.walk(ast.parse(ruta.read_text(encoding="utf-8"))):
        modulo = _absoluto(ruta, n) if isinstance(n, ast.ImportFrom) else ""
        if isinstance(n, ast.ImportFrom) and modulo.startswith("app"):
            if modulo in ("app.api", "app.servicios", "app") or (n.level and not n.module):
                for a in n.names:
                    yield f"{modulo}.{a.name}", [], n.lineno
            else:
                yield modulo, [a.name for a in n.names], n.lineno
        elif isinstance(n, ast.Import):
            for a in n.names:
                if a.name.startswith("app"):
                    yield a.name, [], n.lineno


def _archivos():
    return [(p, _modulo(p)) for p in sorted(APP.rglob("*.py"))]


@pytest.mark.parametrize("nombre", sorted(AISLADOS))
def test_nadie_importa_un_modulo_aislado_salvo_el_anfitrion(nombre):
    suyos, pueden, como, _, _ = AISLADOS[nombre]
    faltas = [f"{m}:{linea} importa {imp}" for p, m in _archivos() if m not in suyos and m not in pueden
              for imp, _, linea in _importaciones(p) if imp in suyos]
    assert not faltas, f"Fuera de {nombre} se la usa por {como}, no importándola:\n" + "\n".join(faltas)


@pytest.mark.parametrize("nombre", sorted(AISLADOS))
def test_un_modulo_aislado_solo_usa_lo_suyo_y_tiqsi(nombre):
    suyos, _, _, plataforma, modelos = AISLADOS[nombre]
    faltas = []
    for p, m in _archivos():
        if m not in suyos:
            continue
        for imp, nombres, linea in _importaciones(p):
            if imp in suyos:
                continue
            if imp not in plataforma:
                faltas.append(f"{m}:{linea} importa {imp} (otro módulo: pedirlo por el contrato)")
            elif imp == "app.modelos" and set(nombres) - modelos:
                faltas.append(f"{m}:{linea} importa de app.modelos {sorted(set(nombres) - modelos)}")
    assert not faltas, "\n".join(faltas)


def test_la_prueba_ve_lo_que_debe_ver():
    """Si la prueba no encontrara los archivos (una mudanza), pasaría sin mirar nada: se comprueba que mira."""
    modulos = {m for _, m in _archivos()}
    for suyos, *_ in AISLADOS.values():
        assert suyos <= modulos, sorted(suyos - modulos)
    assert any(imp == "app.servicios.lectura" for imp, _, _ in _importaciones(APP / "api" / "grafo.py"))
    # Los relativos también se ven («from ..lectura import normalizar» en el pegado).
    assert any(imp == "app.servicios.lectura" for imp, _, _ in _importaciones(APP / "servicios" / "pegado" / "comparar.py"))
    assert any(imp == "app.servicios.lectura" for imp, _, _ in _importaciones(APP / "servicios" / "pegado" / "lector.py"))


@pytest.mark.parametrize("paquete", sorted(PAQUETES_EXTERNOS))
def test_un_proyecto_externo_solo_lo_monta_el_anfitrion(paquete):
    """Fuera de su repositorio, Qillqa solo importa de él lo declarado (su manifiesto, su base): lo demás, por el contrato."""
    permitidos = PAQUETES_EXTERNOS[paquete]
    faltas = []
    for p in sorted(APP.rglob("*.py")):
        m = _modulo(p)
        for nodo in ast.walk(ast.parse(p.read_text(encoding="utf-8"))):
            if isinstance(nodo, ast.ImportFrom) and nodo.level == 0 and (nodo.module or "").split(".")[0] == paquete:
                importados = {nodo.module} if nodo.module != paquete else {f"{paquete}.{a.name}" for a in nodo.names}
            elif isinstance(nodo, ast.Import):
                importados = {a.name for a in nodo.names if a.name.split(".")[0] == paquete}
            else:
                continue
            for imp in importados - permitidos.get(m, set()):
                faltas.append(f"{m}:{nodo.lineno} importa {imp} (pedirlo por su contrato)")
    assert not faltas, "\n".join(faltas)
    if f"{paquete}.manifiesto" in permitidos.get("app.plataforma", set()):     # los módulos; la base común no se monta
        assert (APP / "plataforma.py").read_text(encoding="utf-8").count(f"from {paquete} import manifiesto") == 1


def test_la_configuracion_propia_dice_lo_mismo_que_la_de_qillqa(monkeypatch):
    """La Mediateca (Rikchay) lee las mismas variables que app.config (para los guiones de migración): deben coincidir."""
    from app import config as qillqa
    from rikchay import config as propia

    for valores in ({"mediateca_dir": "/tmp/m", "pictures_dir": ""}, {"mediateca_dir": "", "pictures_dir": "/tmp/p"},
                    {"mediateca_dir": "", "pictures_dir": ""}):
        for clave, valor in valores.items():
            monkeypatch.setattr(qillqa.config, clave, valor)
            monkeypatch.setattr(propia.config, clave, valor)
        assert propia.raiz() == qillqa.raiz_fototeca()
    for url, aparte in (("postgresql+asyncpg://u:c@h/qillqa", ""), ("postgresql+asyncpg://u:c@h/qillqa_prueba?ssl=0", ""),
                        ("postgresql+asyncpg://u:c@h/qillqa", "postgresql+asyncpg://u:c@h/otra")):
        for cfg in (qillqa.config, propia.config):
            monkeypatch.setattr(cfg, "database_url", url)
            monkeypatch.setattr(cfg, "mediateca_database_url", aparte)
        assert propia.url_base() == qillqa.url_mediateca()


def test_la_configuracion_de_rendicion_dice_lo_mismo_que_la_de_qillqa(monkeypatch):
    """Rendición lee las mismas variables que app.config (raiz_rendiciones, para los scripts): deben coincidir."""
    from app import config as qillqa
    from yupay import config as propia

    for valores in ({"rendiciones_dir": "/tmp/r", "mdd_documentos": "", "mdd_ruta": "/m"},
                    {"rendiciones_dir": "", "mdd_documentos": "/tmp/despacho/documentos", "mdd_ruta": "/m"},
                    {"rendiciones_dir": "", "mdd_documentos": "", "mdd_ruta": "/tmp/marco"}):
        for clave, valor in valores.items():
            monkeypatch.setattr(qillqa.config, clave, valor)
            monkeypatch.setattr(propia.config, clave, valor)
        assert propia.raiz() == qillqa.raiz_rendiciones()


def test_los_importes_del_pegado_se_leen_como_en_rendicion():
    """El pegado (Qillqa) y Rendición (Yupay) leen los soles con la misma regla, cada uno con su copia."""
    from yupay import rendicion

    from app.servicios.pegado import validar

    for v in (None, "", True, 40, 12.5, "S/ 2,345.60", "2.345,60", "12,50", "1.5", "-3", "S/ 0.07", "abc", "-", "1,600.00"):
        assert validar.centimos(v) == rendicion.centimos(v), v


# --- la web (fase 10.2b, Tiqsi web) ------------------------------------------------------------------------
SRC = Path(__file__).resolve().parents[2] / "frontend" / "src"
# La web de la Mediateca salió con ella (Rikchay, 2026-10-21): Qillqa la toma del paquete @qillqa/rikchay, y de él solo su
# manifiesto («/modulo») y su superficie pública («/publico»; lo vigila test_la_web_de_un_proyecto_externo_solo_por_su_paquete).
WEB_AISLADOS = {
}
_IMPORT = __import__("re").compile(r"""(?:from\s+|import\s*\(\s*|^import\s+)['"]([^'"]+)['"]""", __import__("re").M)


def _web(archivo: str) -> list[tuple[str, str]]:
    """(lo importado tal cual, archivo de src al que apunta si es relativo) de cada import."""
    salida = []
    for destino in _IMPORT.findall((SRC / archivo).read_text(encoding="utf-8")):
        if destino.startswith("."):
            base = (SRC / archivo).parent / destino
            candidatos = [base] + [base.with_name(base.name + ext) for ext in (".ts", ".tsx")] + [base / "index.ts"]
            real = next((c for c in candidatos if c.is_file()), base)
            salida.append((destino, real.resolve().relative_to(SRC.resolve()).as_posix() if real.exists() else destino))
        else:
            salida.append((destino, ""))
    return salida


@pytest.mark.parametrize("nombre", sorted(WEB_AISLADOS))
def test_la_web_de_un_modulo_aislado_solo_usa_lo_suyo_y_tiqsi(nombre):
    suyos = WEB_AISLADOS[nombre][0]
    assert all((SRC / a).is_file() for a in suyos), sorted(a for a in suyos if not (SRC / a).is_file())
    faltas = []
    for archivo in sorted(suyos):
        for destino, real in _web(archivo):
            if destino.startswith(".") and real not in suyos:
                faltas.append(f"{archivo} importa {destino} (de Qillqa: pedirlo a @qillqa/tiqsi)")
    assert not faltas, "\n".join(faltas)


@pytest.mark.parametrize("nombre", sorted(WEB_AISLADOS))
def test_nadie_usa_la_web_de_un_modulo_aislado_por_dentro(nombre):
    suyos, publicos = WEB_AISLADOS[nombre]
    faltas = []
    for p in sorted(SRC.rglob("*.ts*")):
        archivo = p.relative_to(SRC).as_posix()
        if archivo in suyos or "/pruebas/" in f"/{archivo}":
            continue
        for destino, real in _web(archivo):
            if real in suyos and real not in publicos:
                faltas.append(f"{archivo} importa {destino} (usar {' o '.join(sorted(publicos))})")
    assert not faltas, "\n".join(faltas)


def test_la_configuracion_de_punku_dice_lo_mismo_que_la_de_qillqa(monkeypatch):
    """La Mesa de Partes lee las mismas variables que app.config: la raíz, la carpeta de lo recibido, la firma de sus
    enlaces, el periodo y las siglas deben coincidir (si no, los PDF de siempre dejarían de encontrarse)."""
    from app import config as qillqa
    from punku import config as propia
    from qillqasqa.tipos import tipo_config

    assert propia.CARPETA_RECIBIDOS == tipo_config("recibido").get("carpeta", "recibidos")
    for valores in ({"mdd_documentos": "/tmp/despacho/documentos", "mdd_ruta": "/m"}, {"mdd_documentos": "", "mdd_ruta": "/tmp/marco"}):
        for clave, valor in valores.items():
            monkeypatch.setattr(qillqa.config, clave, valor)
            monkeypatch.setattr(propia.config, clave, valor)
        monkeypatch.setattr(propia.config, "punku_dir", "")
        assert propia.raiz() == qillqa.raiz_documentos()
    for campo in ("jwt_secret", "periodo", "siglas", "zona_horaria", "database_url"):
        assert type(propia.ConfigPunku()).model_fields[campo].default == type(qillqa.config).model_fields[campo].default, campo


LECTURA = ("normalizar", "similitud", "extraer_asunto", "extraer_fecha", "extraer_referencia", "cruzar_remitente")


def _definiciones(ruta: Path) -> dict[str, str]:
    """Cada definición de primer nivel del archivo (función, clase o constante) como su árbol sintáctico."""
    salida = {}
    for n in ast.parse(ruta.read_text(encoding="utf-8")).body:
        nombres = [n.name] if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else \
            [x.id for x in getattr(n, "targets", []) if isinstance(x, ast.Name)]
        for x in nombres:
            salida[x] = ast.dump(n)
    return salida


def test_qillqa_y_punku_leen_un_documento_con_el_mismo_codigo():
    """Lo que lee un documento por su texto vive en las dos (Punku P2): Punku para lo que recibe, Qillqa para sus
    documentos (servicios/lectura.py). Cada definición que comparten debe ser IDÉNTICA (un cambio va a las dos)."""
    from punku import entradas   # Punku, en su repositorio desde el 2026-10-22

    punku, qillqa = _definiciones(Path(entradas.__file__)), _definiciones(APP / "servicios" / "lectura.py")
    compartidas = set(qillqa) - {"hoy_local"}
    assert set(LECTURA) <= compartidas
    distintas = sorted(n for n in compartidas if punku.get(n) != qillqa[n])
    assert not distintas, f"Cambiaron en una sola copia: {distintas} (punku/entradas.py y servicios/lectura.py)"


def test_qillqa_y_qillqasqa_leen_un_texto_con_el_mismo_codigo():
    """Gestión documental tiene su copia de lo que lee de un texto (Qillqasqa Q4c, qillqasqa/servicios/lectura_documental.py
    en su repositorio desde el 2026-10-22): cada definición que comparte con la de la plataforma debe ser IDÉNTICA (salvo
    `hoy_local`, que lee su configuración)."""
    from qillqasqa.servicios import lectura_documental

    qillqa = _definiciones(APP / "servicios" / "lectura.py")
    propia = _definiciones(Path(lectura_documental.__file__))
    compartidas = set(propia) - {"hoy_local"}
    assert {"normalizar", "similitud", "extraer_asunto", "extraer_fecha", "extraer_referencia"} <= compartidas
    distintas = sorted(n for n in compartidas if qillqa.get(n) != propia[n])
    assert not distintas, f"Cambiaron en una sola copia: {distintas} (servicios/lectura.py y la de Qillqasqa)"


def test_y_leen_igual_los_textos_de_las_pruebas():
    import importlib.util

    from punku import entradas
    from app.servicios import lectura

    spec = importlib.util.spec_from_file_location("casos_entradas", Path(__file__).with_name("test_entradas_calendario.py"))   # sus textos de muestra
    casos = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(casos)
    textos = [v for k, v in vars(casos).items() if k.isupper() and isinstance(v, str)] + ["", "sin fecha"]
    insts = [(1, "Municipalidad Distrital de Villa Ejemplo", "MDVE"), (2, "Ministerio de Prueba", "MINPRU")]
    personas = [(7, "Rosa Elena Quispe Huamaní", 1, "Alcaldesa")]
    for x in textos:
        for f in ("normalizar", "extraer_asunto", "extraer_fecha", "extraer_referencia"):
            assert getattr(entradas, f)(x) == getattr(lectura, f)(x), f
        assert vars(entradas.cruzar_remitente(x, insts, personas)) == vars(lectura.cruzar_remitente(x, insts, personas))
        assert entradas.similitud(x, textos[0]) == lectura.similitud(x, textos[0])


def test_el_remitente_vigente_es_la_misma_regla_en_qillqa_y_en_punku():
    """Qillqa (las etiquetas) y Punku (la lista de recibidos) muestran el remitente vigente con la misma regla."""
    from punku import puertos as punku_puertos
    from app.servicios import etiquetas

    for caso in (("Texto", "Cargo", None, None), ("Texto", "", ("Ana", "Jefa"), None), ("Texto", "C", ("Ana", ""), "MEF"),
                 ("", "", None, "MEF"), ("T", "C", ("", "x"), None), (None, None, None, None)):
        assert punku_puertos.remitente_vigente(*caso) == etiquetas.remitente_vigente(*caso), caso


def test_las_claves_de_vinculo_se_validan_igual_en_qillqa_y_en_minka():
    """La forma de una clave de vínculo («doc:12») la tienen Qillqa (el pegado) y Minka (sus vínculos): deben coincidir."""
    from minka import tareas_reglas
    from app.servicios.pegado import validar as pegado

    assert pegado.PREFIJOS_VINCULO == tareas_reglas.PREFIJOS_VINCULO
    for clave in ("doc:12", "tarea:3", "evento:1", "rend:7", "foto:9", "x:1", "doc:", "doc:abc", " doc:5 ", "doc:1234567890", ""):
        assert pegado.vinculo_valido(clave) == tareas_reglas.vinculo_valido(clave), clave


def test_nadie_usa_ya_los_modelos_de_la_mediateca():
    """«medios.v2» (2026-10-21): fuera de la Mediateca nadie pide «medios.v1» (la de los modelos) ni toca sus modelos o
    su sesión (la Mediateca ya es otro repositorio, Rikchay: aquí no hay nada suyo que excluir)."""
    import re

    faltas = []
    for p, m in _archivos():
        texto = p.read_text(encoding="utf-8")
        if re.search(r"""Perezosa\(["']medios\.v1["']\)|capacidad\(["']medios\.v1["']\)|opcional\(["']medios\.v1["']\)""", texto):
            faltas.append(f"{m} pide «medios.v1»")
        if re.search(r"\b\w+\.(Foto|AlbumFoto|Uso|Version)\b", texto) and m not in ("app.plataforma",):
            faltas += [f"{m}: {x.group(0)}" for x in re.finditer(r"\b(ft|fototeca|medios)\.(Foto|AlbumFoto|Uso|Version)\b", texto)]
        if "obtener_sesion_mediateca" in texto and m not in ("app.db", "app.plataforma"):
            faltas.append(f"{m} usa la sesión de la Mediateca")
    assert not faltas, "\n".join(faltas)


# --- Qillqasqa (Gestión documental, Proyectos de ley y Semana de representación) ------------------------------------
# Se aisló por rebanadas en el verde (Q1–Q6b, fase 10.2b; las listas de su frontera llegaron vacías) y salió a su
# repositorio el 2026-10-22 con el marco documental y la edición simultánea (fase 10.3, propuesta §8.8): ver
# PAQUETES_EXTERNOS y WEB_EXTERNOS. Su frontera la vigila su prueba (qillqasqa/tests/test_fronteras.py); aquí, lo de este
# lado: sus tablas no vuelven a la plataforma, y lo que Qillqa y ella comparten se copia idéntico.
QILLQASQA_TABLAS = {
    "Documento", "Contador", "Evento", "Adjunto", "VersionDocumento", "DocumentoRelacion", "Comentario", "Asignacion",
    "ColabEstado", "Actuacion", "ReglaCopia", "Proyecto", "ProyectoActividad", "ProyectoArchivo", "ProyectoDocumento",
    "ProyectoFase", "ProyectoFuente", "ProyectoMiembro", "ProyectoSeccion", "ProyectoSeccionVersion", "ProyectoTarea",
    "SemanaSR", "ActividadSR", "FotoSR", "PedidoSR",
    "Relacion",   # Q4c: el grafo de relaciones es de Gestión documental (lo ofrece por «relaciones.v1»)
}


def test_las_tablas_de_qillqasqa_son_las_de_sus_modelos():
    """Sus tablas están en sus modelos y ninguna en los de la plataforma, sin claves foráneas hacia ella (Q5a)."""
    import app.modelos as modelos
    import qillqasqa.modelos as propios

    assert QILLQASQA_TABLAS <= set(dir(propios)), sorted(QILLQASQA_TABLAS - set(dir(propios)))
    assert not QILLQASQA_TABLAS & set(dir(modelos)), sorted(QILLQASQA_TABLAS & set(dir(modelos)))
    nombres = {t for t in propios.BaseQillqasqa.metadata.tables}
    assert not nombres & set(modelos.Base.metadata.tables), sorted(nombres & set(modelos.Base.metadata.tables))
    for t in propios.BaseQillqasqa.metadata.tables.values():
        for fk in t.foreign_keys:
            assert fk.column.table.name in nombres, f"{t.name} → {fk.target_fullname}"


def test_el_mapa_y_gestion_documental_ven_la_autoria_con_la_misma_regla():
    """Quién ve al equipo en el mapa (api/grafo.py, del anfitrión) y en Gestión documental (flujo.ve_autoria)."""
    from qillqasqa import flujo
    from app.api import grafo

    for rol in ("administrador", "secretaria", "asesor", "diputado", "invitado", "", "otro"):
        assert grafo.ve_autoria(rol) == flujo.ve_autoria(rol), rol


# Q6b-2d (2026-10-21): lo puro que Gestión documental y Qillqa usan las dos se copia IDÉNTICO (como la lectura de un
# texto en el backend): lo apartado tras un choque de versiones (el editor y la cola sin conexión), la tabla de
# diferencias del pegado y el autocompletado de referencias (el editor y el mapa local). La de Qillqasqa se lee de su
# paquete, como la monta Qillqa.
SRC_QILLQASQA = SRC.parent / "node_modules" / "@qillqa" / "qillqasqa" / "src"
COPIAS_WEB_QILLQASQA = {
    "apartados.ts": "componentes/qillqasqa/apartados.ts",
    "pegado.ts": "componentes/qillqasqa/pegado.ts",
    "extensiones/consultaReferencias.ts": "componentes/qillqasqa/referencias.ts",
}


@pytest.mark.parametrize("de_qillqa", sorted(COPIAS_WEB_QILLQASQA))
def test_las_copias_web_de_qillqasqa_son_identicas(de_qillqa):
    if not SRC_QILLQASQA.is_dir():   # sin el paquete enlazado (npm install; el árbol de la demo no lo trae)
        pytest.skip("sin node_modules/@qillqa/qillqasqa")
    copia = COPIAS_WEB_QILLQASQA[de_qillqa]
    assert (SRC / de_qillqa).read_text(encoding="utf-8") == (SRC_QILLQASQA / copia).read_text(encoding="utf-8"), (
        f"Cambiaron en una sola copia: {de_qillqa} y {copia} de Qillqasqa (cambiar las dos)")


WEB_EXTERNOS = {"@qillqa/rikchay": {"/modulo", "/publico"}, "@qillqa/wayra": {"/modulo"}, "@qillqa/tullpu": {"/modulo"},
                "@qillqa/kuyuy": {"/modulo"}, "@qillqa/awana": {"/modulo"},
                "@qillqa/qhawana": {"/modulo"},
                "@qillqa/yupay": {"/modulo"}, "@qillqa/minka": {"/modulo", "/publico", "/referencias"},
                "@qillqa/rimay": {"/modulo", "/publico"}, "@qillqa/punku": {"/modulo", "/publico"},
                "@qillqa/qillqasqa": {"/modulo", "/publico"}}
ANTES_EN_SRC = {"@qillqa/rikchay": "componentes/fototeca", "@qillqa/wayra": "componentes/obs",
                "@qillqa/tullpu": "componentes/fotos", "@qillqa/kuyuy": "componentes/videos",
                "@qillqa/awana": "componentes/piezas", "@qillqa/qhawana": "componentes/observatorio",
                "@qillqa/yupay": "componentes/rendicion", "@qillqa/minka": "componentes/tareas",
                "@qillqa/rimay": "componentes/chat", "@qillqa/punku": "componentes/entradas",
                "@qillqa/qillqasqa": "componentes/qillqasqa"}


@pytest.mark.parametrize("paquete", sorted(WEB_EXTERNOS))
def test_la_web_de_un_proyecto_externo_solo_por_su_paquete(paquete):
    """Qillqa toma la web de un proyecto que ya salió solo de su paquete, y de él solo lo que exporta para el anfitrión."""
    usos = {}
    for p in sorted(SRC.rglob("*.ts*")):
        for destino in _IMPORT.findall(p.read_text(encoding="utf-8")):
            if destino.startswith(paquete) or f"{ANTES_EN_SRC[paquete]}/" in destino:
                usos.setdefault(destino, []).append(p.relative_to(SRC).as_posix())
    malos = {d: a for d, a in usos.items() if d not in {paquete + x for x in WEB_EXTERNOS[paquete]}}
    assert not malos, malos
    assert paquete + "/modulo" in usos, f"Qillqa ya no monta {paquete} por su manifiesto"
    assert not (SRC / ANTES_EN_SRC[paquete]).exists()

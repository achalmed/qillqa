---
tipo: readme
estado: activo
---
# backend/ — API de Qillqa (FastAPI, Python 3.12): tipos, numeración, trámite, generación LaTeX y directorio

## Uso

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
DATABASE_URL="postgresql+asyncpg://qillqa:<clave>@127.0.0.1:5432/qillqa" .venv/bin/uvicorn app.main:app --port 8000
.venv/bin/python -m pytest -q tests          # pruebas puras, sin base de datos
```

En el uso normal lo arranca `../iniciar.sh` con el entorno del `.env`. Documentación viva de la API:
`http://127.0.0.1:8000/docs`.

## Estructura

| carpeta o archivo | qué es | dueño / generador |
|---|---|---|
| `app/main.py` | punto de entrada; crea y migra el esquema al arrancar (`create_all` + `ALTER … IF NOT EXISTS`) | este repo |
| `app/config.py` | toda la configuración, desde variables de entorno (`pydantic-settings`); ningún módulo lee `os.environ` | este repo |
| `../../qillqasqa/qillqasqa/tipos.py` | registro de tipos documentales: campos, serie, carpeta, formato de número | este repo |
| `../../qillqasqa/qillqasqa/flujo.py` | matriz de transiciones de estado por rol | este repo |
| `app/modelos.py`, `app/db.py` | modelo SQLAlchemy y sesión asíncrona | este repo |
| `app/seguridad.py`, `app/semillas.py` | JWT, contraseñas (normalización única), siembra inicial (cuentas, contadores, reglas de copia) | este repo |
| `app/api/` | un router por recurso: `health`, `auth`, `tipos`, `documentos`, `seguimiento`, `heredados`, `incorporacion`, `adjuntos`, `directorio`, `copias`, `ajustes`, `admin`, `sync`, `estadisticas`, `notificaciones`, `presencia` (equipo en línea), `openproject` (estado del reflejo, agenda y asignaciones), `proyectos` (plataforma: fases, tareas, partes, fuentes, «mis tareas»), `informes_sr` (los PDF de cada semana, solo lectura), `semanas_sr` (Semana de representación: actividades, pedidos, fotos, textos, generar y registrar el ISR), `colab` (para el servidor de edición simultánea: acceso con la sesión de la persona; estado Yjs y borrador vivo con secreto interno), `archivos` (toda respuesta de archivo), `mesa_publica` (la mesa de partes virtual: las ÚNICAS rutas nuevas sin sesión, `/api/publico/mesa`), `mesa_virtual` (lo del equipo) y `rendiciones` (rendición de cuentas de viáticos: comprobantes, movilidad, controles, Anexos 3 y 4, Excel; `docs/arquitectura.md` §32) | este repo |
| `app/servicios/` | reglas de negocio: `numeracion`, `tramite`, `envio`, `revision`, `firma`, `nombres`, `carpetas`, `expediente`, `imagen`, `sync`, `cuentas`, `copias`, `ambito`, `directorio`, `incorporacion`, `proyectos`, `comparativo` (cuadro comparativo derivado de las modificatorias), `informes_sr`, `semanas_sr` (ida y vuelta exacta entre los YAML del expediente y la base) · `generador_sr` (lanza el generador del marco por `generar.sh`), `fuentes` (claves `calibre:`/`datafw:`/`qillqa:doc:`), `colab` (edición simultánea: nombres con generación, borrador vivo, reinicio), `openproject` · `openproject_mapa` · `openproject_sync` (reflejo en OpenProject y lo que vuelve), `mesa_virtual` (días hábiles y horario, código, archivos, límites; modelos en `../../punku/punku/modelos.py`) · `cargo_pdf` (el cargo en PDF sin dependencias), `rendicion` (cálculo puro de la liquidación, controles e importe en letras; desde el 2026-10-22 en Yupay, `../../yupay/yupay/modelos.py`) · `rendicion_comision` (la comisión y su movilidad compartida: tramos, constancia de cambios, deshacer, migración) · `rendicion_tex` (los Anexos 3 y 4 para el marco) · `rendicion_excel` (la liquidación con fórmulas) · `redaccion_chat` (lo que el sistema publica en el chat, escrito como el equipo en Telegram)… | este repo |
| `../../qillqasqa/qillqasqa/latex/` | `generador` (maestro y `metadata.tex` desde `campos`), `serializador` (TipTap → LaTeX, lista blanca), `lector` (LaTeX → campos), `compilador` (`build.sh` del marco), `importador`, `redaccion` | este repo |
| `tests/` | pruebas `pytest` (rutas, re-anclaje, siembra de contadores, proyectos, edición simultánea…) | este repo |
| `Dockerfile`, `requirements*.txt` | imagen del modo completo y dependencias | este repo |

## Límite honesto

- Sin Alembic: las migraciones son `ALTER TABLE … IF NOT EXISTS` en `main.py` (`../docs/desarrollo.md`).
- Sin pruebas de la API ni de la base: los contratos se verifican a mano y compilando.
- La API de `iniciar.sh` corre sin `--reload`; cambiar código exige reiniciarla.

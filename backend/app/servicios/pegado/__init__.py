"""backend/app/servicios/pegado/__init__.py — el mecanismo común de «pegar el resultado de un prompt» (decisión
2026-10-11; `docs/plataforma/propuesta-automatizacion.md` §3).

La persona usa el prompt institucional con la IA que prefiera y pega el resultado en el
sistema; el sistema NO llama a ningún modelo (decisión «ficha por reglas, sin IA»): solo
interpreta texto por reglas, lo valida contra el esquema de su `tipo`
(`backend/app/esquemas/pegado/<tipo>.yml`), lo asigna a los campos del formulario del
módulo, lo compara con lo que ya hay y devuelve una vista previa. El guardado va siempre
por el endpoint que el módulo ya tiene: aquí nada escribe.

Módulos (todos puros, probados en `backend/tests/test_pegado.py`):

- `esquemas`: carga y resuelve los esquemas.
- `lector`: del texto pegado al bloque YAML (o al mensaje con rótulos, de transición).
- `validar`: tipos, vocabularios, obligatorios, `null`.
- `asignar`: de las claves del esquema a los campos del formulario (`destino`, `anexar_a`).
- `comparar`: diferencias campo a campo (`nuevo`, `igual`, `distinto`, `dudoso`).

Uso típico desde un endpoint `POST /api/<modulo>/pegar`:

    lectura = interpretar(texto, tipos_admitidos=("documento-recibido",))
    if lectura.errores: → 422 con `lectura.errores` y `formatos_aceptados`
    campos, anexos = asignar(lectura)              # campos del formulario
    … cruces con la base (directorio, duplicados, agenda) …
    diferencias = comparar(lectura.esquema, campos, actual)
"""
from .asignar import asignar
from .comparar import comparar
from .esquemas import cargar, esquema_de, formatos, Esquema
from .lector import Lectura, interpretar, extraer_bloque

__all__ = [
    "asignar", "comparar", "cargar", "esquema_de", "formatos", "Esquema",
    "Lectura", "interpretar", "extraer_bloque",
]

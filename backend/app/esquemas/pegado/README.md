---
tipo: readme
estado: activo
---
# esquemas/pegado/ — el contrato entre los prompts institucionales y los formularios de Qillqa

Cada `<tipo>.yml` describe un formato que una persona pega en el sistema después de usar el prompt
con la IA que prefiera (ChatGPT, Claude, Grok, DeepSeek…): Qillqa no llama a ningún modelo; solo
interpreta texto por reglas (`docs/plataforma/propuesta-automatizacion.md` §3; decisión del 2026-10-11).

El texto pegado lleva un bloque `yaml` cuyas dos primeras claves son fijas, `tipo` y `version`; el
resto, una clave por línea, fechas `AAAA-MM-DD`, horas `HH:MM`, `null` para lo desconocido y una
lista `observaciones` con las dudas del modelo. Lo que no está en el esquema se avisa y se ignora.

Claves de cada esquema:

| clave | qué dice |
|---|---|
| `tipo`, `version`, `titulo`, `modulo`, `prompt` | identidad del formato; `prompt` es la ruta en el repo `prompts` (relativa a `~/Documents`) |
| `campos.<clave>.etiqueta` | cómo se muestra en la tabla de diferencias |
| `campos.<clave>.tipo` | `texto`, `texto_largo`, `fecha`, `hora`, `fecha_hora`, `opcion`, `entero`, `importe` (monto en soles: «S/ 2,345.60», «40», 12.5), `booleano`, `lista`, `bloque`, `lista_bloques` |
| `campos.<clave>.valores` | vocabulario de una `opcion` (los valores reales de Qillqa); `sinonimos` admite lo que suele escribir un modelo |
| `campos.<clave>.obligatorio` | si falta, es un error (no se aplica nada) |
| `campos.<clave>.destino` | el campo del formulario del módulo; `null` = informativo (se muestra; con `anexar_a` va al campo indicado como línea «Etiqueta: valor») |
| `campos.<clave>.forma` | `cita`: cada línea queda con solo la denominación y el número del documento; la fecha, «y anexos» y las páginas se quitan con un aviso (`referencias.cita_documento`; Edison, 2026-10-18) |
| `campos.<clave>.cruza` | comprobación cruzada: `persona`, `institucion`, `equipo`, `documento`, `entrada`, `evento` |
| `campos.<clave>.esquema` | para `bloque` y `lista_bloques`, el sub-esquema (clave de `bloques:` del mismo archivo o `<tipo>` de otro) |

Los lee `backend/app/servicios/pegado/esquemas.py`; las pruebas puras, `backend/tests/test_pegado.py`.
Cambiar una clave exige subir `version` aquí y en el prompt, y registrar el contrato en
`prompts/docs/arquitectura.md` §6 antes de publicar.

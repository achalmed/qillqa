---
tipo: doc
titulo: "Redacción administrativa: reglas de estilo de los documentos"
estado: activo
---

# Guía de redacción administrativa del despacho (SGDP)

**Fuente única y autoritativa** de las reglas de revisión ortográfica y de
redacción administrativa que se aplican a los documentos del despacho
(oficios, oficios múltiples, memorandos, informes, solicitudes, actas,
comunicados). Todo lo demás —`docs/procesar-un-documento.md` §8, `docs/arquitectura.md`,
comentarios en el código— **apunta aquí**; si una regla cambia, se edita
este archivo y no se duplica en otro lado.

Criterios de forma tomados de
`prompts/07 produccion/administrativos/` (en la raíz del espacio de trabajo)
(un prompt por tipo documental; `prompt_oficio_administrativo.md` es el que
rige para oficios). De esos prompts se toman los **criterios de forma**, no
su generador: **no se regenera ni reescribe** el documento con sus fórmulas.

---

## 0. Principio rector (leer antes que cualquier regla)

Al procesar un documento del despacho se aplica una revisión **ortográfica y
de redacción administrativa**, limitada a lo **formal**. Está **prohibido**
cambiar el contenido, la argumentación, la sustancia legal o la intención:

- **NO** se reescribe, resume, amplía ni reordena el texto.
- **NO** se alteran cifras, plazos, fechas, montos ni normas citadas.
- **NO** se cambian las fórmulas protocolares de la casa (ver §11).
- Ante la duda entre «errata formal» y «decisión de redacción del autor»,
  **NO se cambia** y se señala en el reporte de entrega.

La sustancia es del autor (el diputado); la intervención es editorial de
forma. Como los documentos nacen `origen='sgdp'` (editables), cualquier
corrección se revierte desde la web sin perder el número.

---

## 1. Ortografía y tildación

- Corregir faltas ortográficas y tildes ausentes o sobrantes.
  - Ejemplos reales: `Colectuvo` → `Colectivo`; `presupuestar` (por
    «presupuestaria») → `presupuestaria`; `retencion` → `retención`;
    `clausula` → `cláusula`; `Oscar` → `Óscar`.
- Respetar tildes diacríticas correctas ya presentes (`dé` de dar, `sólo`
  no; hoy «solo» sin tilde).
- Extranjerismos y latinismos según norma (p. ej. «a priori» sin cursiva
  obligatoria en texto administrativo).

## 2. Mayúsculas y minúsculas

- **Nombres de personas**: caja de título, nunca en versalitas.
  - `WILFREDO OSCORIMA NÚÑEZ` → `Wilfredo Oscorima Núñez`.
  - Partícula intermedia en minúscula: `Óscar De Jesús` → `Óscar de Jesús`.
- **Asunto**: caja de oración, **no** todo en mayúsculas; se conservan las
  siglas y los nombres propios.
  - `PEDIDO DE INFORME SOBRE EL PAGO…` → `Pedido de informe sobre el pago…`.
- **«Ley»** va con mayúscula inicial cuando cita una norma concreta:
  `la ley N° 32537` → `la Ley N° 32537`. En cambio, la locución «conforme a
  ley» (sin número) va en minúscula.
- Cargos genéricos en minúscula salvo tratamiento o inicio de línea del
  bloque destinatario: en el cuerpo, «el ministro», «el gobernador
  regional»; en el bloque de dirección se respeta el formato de la casa
  (`Ministro de Educación`).
- Instituciones con su mayúscula propia: `Congreso de la República`,
  `Ministerio de Economía y Finanzas`, `Mesa Directiva`, `Cámara de
  Diputados`.

## 3. Siglas y acrónimos

- Definir en el **primer uso**: nombre completo seguido de la sigla entre
  paréntesis —`Ministerio de Energía y Minas (MINEM)`— y de ahí en adelante
  solo la sigla, de forma **uniforme** en todo el documento.
- No pluralizar siglas con «s» minúscula pegada (`las UGEL`, no «las UGELs»).
- Siglas conocidas del dominio: `REINFO`, `MAPE`, `FONCOR`, `SUNAT`,
  `SUNAFIL`, `INEI`, `INGEMMET`, `MINEM`, `MEF`, `MINEDU`, `SUTEP`, `CEN-SUTEP`.

## 4. Puntuación

- Corregir signos redundantes o faltantes sin cambiar el sentido.
  - `próximo a vencer; ,` → `próximo a vencer;` (se elimina la coma sobrante).
- Aposiciones con coma: `un sector vulnerable de la población los maestros
  jubilados y cesantes` → `…de la población, los maestros jubilados y
  cesantes,`.
- Uso correcto de punto y coma en enumeraciones largas dentro de un pedido.
- Comillas: usar las tipográficas «…» o "…" de manera **uniforme** en todo
  el documento (no mezclar rectas y curvas).

## 5. Concordancia gramatical

- El verbo y los pronombres concuerdan con el **destinatario real**.
  - Oficio a **un** destinatario (usa «usted», «dirigirme a usted»,
    «saludarlo»): el cierre es `expresarle` (singular), no `expresarles`.
  - Oficio **múltiple** (varios destinatarios, «ustedes»): `expresarles`.
- Concordancia de género/número en aposiciones y adjetivos.

## 6. Redacción administrativa general

- Tono formal, preciso y directo; se **conserva** el registro del autor.
- No se introduce lenguaje coloquial ni se «mejora» el estilo más allá de
  corregir errores; no es una reescritura.

## 7. Uniformidad de instituciones, cargos, dependencias y entidades

- Un mismo organismo se nombra igual en todo el documento (no alternar
  `MINEDU` / `Ministerio de Educación` de forma inconsistente una vez
  definida la sigla).
- Nombres oficiales exactos: `Dirección Regional de Educación de Ayacucho`,
  `Unidad de Gestión Educativa Local`, `Gobierno Regional de Ayacucho`,
  `Presidencia del Consejo de Ministros`.
- Distinguir homófonos institucionales: **Consejo** Regional (órgano
  deliberativo regional) vs. **Concejo** Municipal (órgano municipal) — ambos
  correctos, no «corregir» uno por el otro.

## 8. Consistencia de fechas, números, referencias y denominaciones

- Formato de fecha uniforme en el cuerpo (`24 de febrero de 2026`).
- Números de ley/oficio siempre con el mismo formato: `Ley N° 32537`,
  `Oficio N° 735-2026/CEN SUTEP`.
- Montos y porcentajes uniformes dentro del documento (no mezclar `0.5 %` y
  `0,5%`; no mezclar `S/ 487.00` y `S/. 487`). Ver §10 para la forma
  tipográfica que aplica el framework al renderizar.
- Referencias cruzadas coherentes (si el considerando cita «numeral 13.1,
  literal h) del artículo 13°», el pedido las repite igual).
- La **Referencia** y el **«Adj.:»** citan solo la denominación y el número
  del documento (`Oficio Múltiple N.º 007-2026-FREDDEH-HUANTA/P`): sin la
  fecha, sin «y anexos» y sin páginas ni folios (Edison, 2026-10-18). La
  fecha solo se queda cuando el documento no tiene número (un memorial s/n).
  Es la misma regla que aplica el pegado (`referencias.cita_documento`).

## 9. Errores tipográficos o de digitación

- Corregir dedazos evidentes, incluidos los de nombres propios al
  reformatear (`AYACUVHO` → `Ayacucho`).
- Espacios dobles, palabras partidas o pegadas por digitación.

## 10. Coherencia formal y convenciones tipográficas del framework

- Coherencia entre partes: el nombre y el cargo del destinatario en el
  encabezado coinciden con cómo se le menciona en el cuerpo; el asunto
  resume fielmente el pedido.
- Convenciones **tipográficas** que el marco documental aplica al texto
  nuevo (espacios finos y no separables): `0.5\,\%`, «S/~487.00», `N°~735`,
  y los escapes de LaTeX (`\%`, `\&`, etc.). Estas son de **render**, no de
  contenido.

---

## 11. Fórmulas de la casa que NO se cambian

Se conservan exactamente (son el estilo establecido del despacho, no
erratas):

- **Saludo**: `De mi consideración:`
- **Apertura**: `Es grato dirigirme a usted para saludarlo cordialmente y,
  en ejercicio de la función de control político y fiscalización…`
- **Cierre**: `Sin otro particular, hago propicia la oportunidad para
  expresarle[s] las muestras de mi especial consideración.` (el `[s]` según
  §5).
- **Antefirma**: `Atentamente,` (con coma).
- **Nota al pie recurrente** del artículo 159 del Reglamento de la Cámara de
  Diputados (texto fijo; ver la receta en `docs/procesar-un-documento.md`).

No se sustituyen por las fórmulas alternativas de los prompts
(`Tengo el honor de dirigirme a Ud.`, etc.): eso sería reescribir el estilo.

---

## 12. Cómo se aplica (procedimiento e invariante de sistema)

1. La revisión se aplica al **modelo editable** del documento (`campos` y
   `cuerpo` TipTap) **antes** de `PUT`/`generar` por la API — no se edita el
   `.tex` a mano salvo lo que el modelo no exprese (ver `docs/procesar-un-documento.md` §5).
2. Cada corrección se **reporta** al entregar, en una tabla
   `original → corregido → criterio`, para que el autor la vea y pueda
   revertirla desde la web.
3. **Invariante de sistema (no negociable):** el pipeline
   `serializador.py` → `generador.py` **NUNCA** auto-corrige ni altera el
   texto; es una lista blanca que solo traduce TipTap → LaTeX y escapa
   caracteres. La revisión ortográfica es un paso **editorial** (humano o
   asistido) sobre el modelo, no un filtro silencioso en el código. No
   agregar «normalización» automática de contenido al serializador: rompería
   la integridad del texto legal y la garantía anti-inyección.

---

## 13. Historial

- **2026-08-13** — Se adopta esta guía; reemplaza la política previa de
  «transcripción verbatim». Pedido de Edison. Primer documento procesado con
  ella: OF-0027 (MEF, FONCOR). Los oficios 0016–0026 se hicieron con la
  política verbatim anterior y pueden repasarse a pedido (los 0018–0027 son
  `sgdp` editables → corrección por API + regenerar, sin perder número).

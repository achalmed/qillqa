---
tipo: readme
estado: activo
---
# acta/ — plantilla del acta de sesión: registro de una reunión con estaciones, acuerdos numerados y firmas

`\documentclass{acta}`, serie `ACT`; `tipodoc` «Acta de Sesión» → título «ACTA DE SESIÓN N°…».

## Datos (`metadata.tex`)

`numero`, `anio`, `lugar`, `fecha`, `sumilla` opcional. La clase de sesión (ordinaria/extraordinaria)
y el órgano van en el maestro.

## Partes

`\numerodocumento` · `\organosesion{Sesión Ordinaria · Órgano}` · párrafo de apertura (lugar, fecha,
hora, quién preside y quién actúa de secretario; la plantilla usa `\meta{autor}` y «Nombre Apellido») ·
`\estacion{Control de asistencia}`, `\estacion{Orden del día}`, `\estacion{Aprobación del acta}` ·
`\acuerdo{NNN-AAAA}{texto con la votación}` · `\firmasacta{Nombre}{Cargo}{Nombre}{Cargo}`.

---
tipo: readme
estado: activo
---
# oficio/ — plantilla del oficio (y de su familia: oficio múltiple, carta, bancada): comunicación externa firmada por el titular

`\documentclass{oficio}`, serie `OF` (`OM` el múltiple). El SGDP genera este tipo desde su formulario;
a mano, `scripts/nuevo.sh oficio <slug> --sumilla "…"`.

## Datos (`metadata.tex`)

`numero`, `anio`, `lugar`, `fecha` (comentada = hoy), `sumilla` (nombra el PDF) o `nombrearchivo`;
`siglas`, `autor`, `cargo`, `lema` vienen del perfil. Para una numeración no estándar,
`\setmeta{numerocompleto}{…}` se imprime tal cual.

## Partes (en este orden)

`\lugaryfecha` · `\numerodocumento` · `\destinatario{Tratamiento:}{Nombre}{Cargo}` (varios: líneas
«Nombre — Cargo»; con copia arriba, ver `../../../docs/formato-latex.md`) · `\asunto{…}` ·
`\referencia{…}` o `\referencias` + `\itemreferencia` · `\saludo` · cuerpo · `\atentamente` ·
`\vfill` + `\bloquefirma[2.0cm]` (firma anclada al fondo; 2 cm libres para la firma digital) ·
`\adjunto{…}` · `\concopia{…}`. Multipágina: sin `\vfill`, `\sinsello` en el preámbulo y
`\selloalfondo` al final, con `\confolio`.

## Selecciones (preámbulo)

`\usarmembrete{despacho}`, `\sinmarcaagua`, `\setmarcaaguaancho{10cm}`, `\confolio`,
`\setinterlineado{1.05}` y `\setespacioparrafos{4pt}` para caber en una hoja.

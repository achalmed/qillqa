---
tipo: readme
estado: activo
---
# rendicion-viaticos/ — plantilla de la rendición de viáticos: Anexo N.° 3 (declaración jurada) y Anexo N.° 4 (rendición de cuentas)

`\documentclass{rendicion-viaticos}`; sin serie ni número: la genera el SGDP desde su módulo Rendición
de cuentas (`../../../backend/app/servicios/rendicion_tex.py`, `../../../docs/arquitectura.md` §32), que
escribe una copia de este maestro, `metadata.tex` y `contenido.tex` en la carpeta de la rendición y
compila con `marco_documental/scripts/build.sh`. Aquí, con datos ficticios, es el test del tipo (`make plantillas`). Sin
membrete, sin marca de agua y sin sello (son formatos de la institución); con folio. Por qué, en
`../../docs/decisiones.md` §Rendición de viáticos.

## Datos (`metadata.tex`)

Anexo 3: `comisionado`, `dnicomisionado`, `cargocomisionado`, `fechadeclaracion` (larga), `lugarfirma`
(sin él, `\meta{lugar}` del perfil), `unidad` (sin ella, «despacho del `\meta{cargo}` `\meta{autor}`»).
Anexo 4: `siaf`, `comprobantepago` y su fecha en tres casillas (`comprobantepagodia`,
`comprobantepagomes`, `comprobantepagoanio`), `solicitudefectivo` y las suyas (`solicitudefectivodia`,
`solicitudefectivomes`, `solicitudefectivoanio`; `comprobantepagofecha` y `solicitudefectivofecha`, «DD/MM/AAAA»,
quedan por compatibilidad), `documentoviaje` (el memorando que autoriza el viaje) y `documentoviajefecha`,
`lugarcomision`, `periodo` («del día 24 de agosto al día 28 de agosto de 2026»), `dias` («CINCO (05)»),
`motivo`, `fecharendicion`. Opcionales: `directiva` y `pieformato` (cabecera y pie del formato),
`nombrearchivo`. Lo que falta sale como renglón para llenar a mano; en la cabecera del Anexo 4, como caja
vacía.

## Partes (`contenido.tex`)

Anexo 3: `\cabeceraanexo{ANEXO N.° 3}{FORMATO N.° 02-VN}{título}` · `\textodeclaracion` · entorno
`tablamovilidad` con `\tramo{fecha}{hora}{del}{al}{monto}` y `\totaltabla{4}{total}` · entorno
`tablaotros` con `\otrogasto{fecha}{concepto}{monto}` y `\totaltabla{2}{total}` (`\filavacia{n}` si no
hay filas) · `\cierredeclaracion{importe}{importe en letras}` (frase, lugar y fecha, firma y nota (1)).

Anexo 4 (tras `\newpage`): `\cabeceraanexo{ANEXO N.° 4}{FORMATO N.° 03-VN}{título}` · `\datosrendicion` (los
«cuadritos» del formato, 2026-10-18: «SIAF:» con su caja redondeada y dos marcos redondeados —«COMPROBANTE DE
PAGO N°:» y «SOLICITUD DINERO EFECTIVO N°»—, cada uno con el recuadro del número y «FECHA:» con tres casillas;
el dato va dentro de su caja, TikZ) ·
entorno `seccionrendicion{A.}{VIÁTICOS (Documentados 70 % y Declaración Jurada 30 %)}` con
`\gasto{n}{documento}{fecha}{concepto}{importe}`, `\singastos`, `\totalseccionfuerte{rótulo}{importe}` y
`\totalseccion{rótulo}{importe}` · `B.` pasajes terrestres · la última sección (`C.` otros recursos) en
`seccioncorta` dentro de `bloquefinal`, junto con `\firmarendicion`, para que la firma nunca quede sola.

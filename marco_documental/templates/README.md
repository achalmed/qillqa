---
tipo: readme
estado: activo
---
# templates/ — una plantilla por tipo documental: son los «tests» del marco y el modelo para un documento nuevo

Cada carpeta lleva el maestro (`<tipo>.tex`), su `metadata.tex` y un README que dice qué datos y
partes exige el tipo. `make plantillas` las compila todas con el perfil neutro (o con `MDD_PERFIL`);
un cambio en `../core/` se valida aquí. Para un documento real no se copian a mano: `scripts/nuevo.sh
<tipo> <descripcion>` compone carpeta y numeración en el archivo documental. Los textos de ejemplo
son ficticios y neutros («Nombre Apellido», `\meta{autor}`): nada de un despacho concreto.

| plantilla | tipo | numera |
|---|---|---|
| `oficio/` | oficio (y múltiple, carta, bancada por metadatos) | `nuevo.sh` o el SGDP |
| `memorando/`, `informe/`, `solicitud/`, `acta/` | administrativos con firma | `nuevo.sh` o el SGDP |
| `comunicado/` | comunicado · pronunciamiento · nota de prensa · anuncio | `nuevo.sh` |
| `agenda/` | agenda diaria (por fecha, sin serie) | — |
| `informe-sr/` | informe de Semana de Representación (generado) | el SGDP (serie ISR) |
| `rendicion-viaticos/` | rendición de viáticos: Anexos 3 y 4 (generada por el SGDP) | — (sin serie) |
| `proyecto-de-ley/`, `dictamen/`, `mocion/` | legislativos con esquema del AWF | a mano |

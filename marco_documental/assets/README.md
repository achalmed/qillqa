---
tipo: readme
estado: activo
---
# assets/ — fuentes vendorizadas, logos institucionales e iconos del marco (nada del despacho)

| carpeta | qué es | origen |
|---|---|---|
| `fonts/` | Source Serif 4 (cuerpo), Selawik (membrete), Yellowtail (sello), Archivo (titulares), Inter (folio, cifras), Bree Serif y Alfa Slab One (iteraciones previas); licencia SIL OFL; se cargan por nombre de archivo en `../core/config/fuentes.tex` | sus autores |
| `logos/` | escudo del Perú, logo del Congreso, logo de la Cámara de Diputados (color, blanco y mono en guinda) y las marcas de agua generadas | congreso.gob.pe; `../scripts/generar-*.py` |
| `iconos/` | iconos Tabler en PDF, tres tintas (`-puka`, `-tinta`, `-blanco`), para el informe-sr | `identidad-visual` (SVG → PDF con `soffice`) |

Los retratos, el sello y la consigna del titular no están aquí: los da el perfil (`MDD_PERFIL`). Los
nombres de archivo de las fuentes son los de sus autores (aviso A07 del validador, a propósito).

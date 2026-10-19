---
tipo: readme
estado: activo
---
# generadores/ — programas que escriben documentos del marco desde datos: hoy, `informe-sr/`

Un generador produce el maestro y los módulos `.tex` de un tipo que no se escribe a mano y los
compila con `../scripts/build.sh`; los `.tex` que emite llevan la marca `GENERADO por …`. Contrato
común a las herramientas del despacho: `main.py` orquesta, `config.py` parametriza, `lib/` ejecuta;
nada llega por ruta relativa al despacho, todo por variables de entorno.

"""Constantes compartidas por los servicios de documentos."""

# Cuerpo TipTap vacío (un párrafo) para un borrador recién creado.
CUERPO_VACIO: dict = {"type": "doc", "content": [{"type": "paragraph"}]}

# Estados válidos del ciclo de vida (la matriz de transiciones vive en
# app/flujo.py; esto es solo el conjunto para validar la entrada).
ESTADOS_VALIDOS = {
    "BORRADOR", "EN_REVISION", "OBSERVADO", "APROBADO",
    "FIRMADO", "ENVIADO", "OBSERVADO_ENVIADO", "ARCHIVADO",
}

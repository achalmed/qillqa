#!/usr/bin/env bash
# actualizar.sh — openproject_despacho: actualiza OpenProject a la última versión de la serie fijada en docker-compose.yml, con respaldo previo.
# Respalda ANTES por seguridad, descarga la imagen nueva y recrea el contenedor (las migraciones corren solas).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

echo "1/3 · Respaldo previo de seguridad..."
"$OP_RAIZ/respaldar.sh" --silencioso

echo ""
echo "2/3 · Descargando la última imagen de la serie..."
compose pull

echo ""
echo "3/3 · Recreando el contenedor (correrá migraciones)..."
compose up -d

echo ""
echo "✅ Actualización iniciada. Sigue el progreso con:  ./estado.sh"

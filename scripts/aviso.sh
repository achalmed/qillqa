#!/usr/bin/env bash
# scripts/aviso.sh — publica o retira el aviso a todos de PRODUCCIÓN desde la terminal (2026-10-05).
#
# Sale en el centro de la pantalla de cada persona con un solo botón (componentes/AnuncioCentral.tsx).
# Uso:
#   scripts/aviso.sh "Llegó una actualización: recargue la página." --accion recargar
#   scripts/aviso.sh "Mañana no habrá sistema de 8 a 9." --accion entendido
#   scripts/aviso.sh --retirar
# Carga el .env y la misma conexión que iniciar.sh (PostgreSQL de Docker en 127.0.0.1).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$DIR/.env"; set +a
export DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER:-sgdp}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB:-sgdp}"
cd "$DIR/backend"
exec .venv/bin/python -m app.anuncio "$@"

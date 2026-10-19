"""Publica o retira un aviso a todos desde la terminal (2026-10-05).

Uso: `scripts/aviso.sh` (carga el .env y la conexión de iniciar.sh); por dentro:
    .venv/bin/python -m app.anuncio "Llegó una actualización: recargue la página." --accion recargar
    .venv/bin/python -m app.anuncio --retirar
Sirve tras un despliegue: el aviso sale en el centro de la pantalla de cada persona.
"""
from __future__ import annotations

import argparse
import asyncio

from app.db import SesionAsincrona
from app.servicios import anuncios as svc


async def _main(args: argparse.Namespace) -> int:
    async with SesionAsincrona() as sesion:
        if args.retirar:
            print(f"retirados: {await svc.retirar(sesion)}")
            return 0
        try:
            a = await svc.publicar(sesion, args.texto or "", args.accion, None, args.horas)
        except ValueError as e:
            print(f"error: {e}")
            return 2
        print(f"publicado #{a.id} ({a.accion}): {a.texto}")
        return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("texto", nargs="?", help="texto breve (hasta 300 caracteres)")
    ap.add_argument("--accion", choices=svc.ACCIONES, default="entendido")
    ap.add_argument("--horas", type=int, default=24, help="vigencia (1 a 168 h)")
    ap.add_argument("--retirar", action="store_true", help="retira el aviso vigente")
    return asyncio.run(_main(ap.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())

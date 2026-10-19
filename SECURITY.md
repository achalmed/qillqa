# Política de seguridad

Qillqa guarda documentos oficiales, datos de personas y claves de acceso a mesas de partes: tomamos en
serio cualquier fallo de seguridad.

## Versiones con soporte

| versión | soporte |
|---|---|
| `main` (última) | sí |
| anteriores | no: actualiza a la última |

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa el formulario privado de GitHub:
[*Report a vulnerability*](https://github.com/achalmed/qillqa/security/advisories/new) (pestaña
*Security* del repositorio).

Incluye, si puedes:

- el tipo de fallo (inyección, autenticación, exposición de archivos, XSS…);
- la ruta o el archivo afectado y la versión (commit);
- los pasos para reproducirlo, con datos ficticios;
- el impacto que estimas.

Respondemos en un plazo de **7 días** para confirmar la recepción y acordar los siguientes pasos. Cuando
el arreglo esté publicado, te daremos crédito en el aviso si así lo deseas.

## Buenas prácticas para quien instala Qillqa

- Cambia todas las claves de `.env.example` (`POSTGRES_PASSWORD`, `JWT_SECRET`, `SGDP_BOVEDA_CLAVE`) y
  las cuentas de demostración antes de usarlo con datos reales.
- No expongas el puerto de PostgreSQL a la red: el `docker-compose.yml` lo deja solo en `127.0.0.1`.
- Publica la web detrás de HTTPS (un proxy inverso o un túnel con certificado).
- Haz respaldos periódicos de la base y del archivo documental, y prueba restaurarlos.

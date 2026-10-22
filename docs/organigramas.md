---
tipo: doc
titulo: "Organigramas oficiales en el Directorio (Jerarquía)"
estado: activo
---

# Organigramas oficiales en el Directorio (Jerarquía)

> Los PDF oficiales están en Calibre (serie «Organigramas oficiales») y las transcripciones (`<sigla>.json`), con su cargador `cargar_en_qillqa.py`, en `bookmarks/instituciones/_organigramas/`; aquí no se guardan copias.

La pestaña **Directorio → Jerarquía** es el mapa navegable del Estado: cada
institución puede tener su organigrama oficial cargado como datos (no como
imagen), con procedencia verificable. Este documento define el flujo para
cargar o actualizar el organigrama de una institución.

## Principios (pedido de Edison, 2026-08-24)

- **Solo fuentes oficiales**: gob.pe (página institucional → sección
  Organigrama), Portal de Transparencia Estándar, portal propio, ROF/MOP y las
  resoluciones que aprueban la estructura. Nunca blogs ni fuentes informales.
- **Sin simplificar**: se registran TODAS las dependencias que figuren en el
  organigrama oficial (Alta Dirección, OCI, Procuraduría, órganos de línea /
  apoyo / asesoramiento, oficinas, subsecretarías, programas, proyectos,
  organismos adscritos…). El máximo detalle oficialmente disponible.
- **Datos, no imágenes**: si el organigrama solo existe como PDF/imagen, se
  transcribe a estructura jerárquica; el PDF queda como respaldo vía
  `url_fuente`.
- **Procedencia siempre**: cada nodo guarda `fuente`, `url_fuente`,
  `fecha_consulta` y `norma` (la RM/DS que aprueba la estructura). Eso permite
  re-verificar y actualizar cuando el ROF cambie.

## Flujo de carga (por institución)

1. **Ubicar el organigrama oficial**: en gob.pe, la página
   `https://www.gob.pe/institucion/<slug>/institucional` suele enlazar el PDF
   del organigrama (con la RM que lo aprueba). Descargarlo y **archivarlo** en
   Calibre (serie «Organigramas oficiales»; fuente documental para consulta
   posterior: los enlaces de gob.pe son efímeros).
2. **Transcribir el árbol** al formato JSON de nodos (ver ejemplo abajo),
   respetando niveles, orden de hermanos y las bandas del organigrama
   (programa / adscritos / proyecto especial → `categoria`).
3. **Cargar** con el endpoint (solo administrador):

   ```
   POST /api/directorio/instituciones/{id}/organigrama
   {
     "fuente": "gob.pe — <institución>: Organigrama oficial",
     "url_fuente": "<URL del PDF oficial>",
     "fecha_consulta": "AAAA-MM-DD",
     "norma": "RM/DS que aprueba la estructura",
     "reemplazar": true,
     "nodos": [ {"nombre": "...", "tipo": "organo|oficina|unidad|programa|proyecto|organismo",
                 "categoria": "alta_direccion|organo_control|organo_defensa|organo_linea|organo_apoyo|organo_asesoramiento|organo_desconcentrado|unidad_organica|programa|proyecto|adscrito|comision",
                 "siglas": "", "hijos": [ ... ]} ]
   }
   ```

   Es **idempotente** (upsert por nombre bajo cada padre). Con
   `reemplazar=true`, los nodos de organigrama previos que ya no figuren se
   **desactivan** (no se borran) — así se actualiza una estructura cuando
   cambia el ROF sin perder histórico.
4. **Adscritos que ya existen** como entidades raíz del directorio (tienen su
   propia mesa de partes): NO duplicarlos en `nodos`; re-vincularlos con
   `PUT /instituciones/{id}` poniendo `parent_id` (la institución madre),
   `categoria="adscrito"` y su nombre oficial completo.

## Scripts de ejemplo (cargas reales)

Cada carga real deja su script en `scripts/siembra/` como registro reproducible (árbol
transcrito + metadata + URL oficial embebida). Sirven de plantilla: copiar,
reemplazar el árbol y la metadata, y ejecutar con la API encendida.

- `scripts/siembra/organigrama_pcm_ejemplo.py` — PCM, 71 dependencias.
- `scripts/siembra/organigrama_minedu_ejemplo.py` — MINEDU, 91 dependencias.
- `scripts/siembra/organigrama_congreso_ejemplo.py` — Congreso, 68 dependencias.
- `scripts/siembra/organigrama_ayacucho_ejemplo.py` — GORE Ayacucho, 63 dependencias.
- `scripts/siembra/organigrama_mef_ejemplo.py` — MEF, 120 dependencias.
- `scripts/siembra/organigrama_pj_ejemplo.py` — Poder Judicial, 73 dependencias.
- `scripts/siembra/organigrama_mininter_ejemplo.py` — MININTER, 75 dependencias.
- `scripts/siembra/organigrama_rree_ejemplo.py` — RREE (Relaciones Exteriores), 108 dependencias.
- `scripts/siembra/organigrama_minsa_ejemplo.py` — MINSA (Salud), 85 dependencias.
- `scripts/siembra/organigrama_contraloria_ejemplo.py` — Contraloría (CGR), 74 dependencias.
- `scripts/siembra/organigrama_presidencia_ejemplo.py` — Despacho Presidencial, 22 dependencias.
- `scripts/siembra/organigrama_promperu_ejemplo.py` — PROMPERÚ, 31 dependencias.
- `scripts/siembra/organigrama_inei_ejemplo.py` — INEI, 20 dependencias.
- `scripts/siembra/organigrama_onpe_ejemplo.py` — ONPE, 44 dependencias.
- `scripts/siembra/organigrama_bcrp_ejemplo.py` — BCRP (Organigrama General), 22 dependencias.
- `scripts/siembra/organigrama_unsch_ejemplo.py` — UNSCH (Univ. San Cristóbal de Huamanga), 51 dependencias.

Desde el 3.er lote (2026-08-25) el registro reproducible es un **envelope JSON
por institución** (`<sigla>.json` en `bookmarks/instituciones/_organigramas/`; árbol + metadata + `target_id` o
`create`), que se carga con el **cargador genérico** `scripts/siembra/cargar_organigrama_generico.py`
(`python3 scripts/siembra/cargar_organigrama_generico.py <ruta>/<x>.json` — adjunta bajo
un id existente o crea la entidad y luego adjunta). Útil para SUNAT (parseado por
la numeración del ROF) y las municipalidades (creadas desde su organigrama).

## Estado de cobertura

| Institución | Estado | Fuente oficial |
|---|---|---|
| PCM | ✅ 71 dependencias | gob.pe · RM 141-2021-PCM y modif. hasta RM 234-2026-PCM |
| MEF | ✅ 120 dependencias | gob.pe · organigrama 27/09/2023 (ROF) |
| MINEDU | ✅ 91 dependencias (hasta 3.er nivel) | gob.pe · D.S. 001-2015-MINEDU |
| MININTER | ✅ 75 dependencias | gob.pe · RM 1050-2019-IN, modif. 0429-2026-IN y 0642-2026-IN |
| RR.EE. (Relaciones Exteriores) | ✅ 108 dependencias | gob.pe · RM 0516-2025-RE (Texto Integrado del ROF) |
| MINSA (Salud) | ✅ 85 dependencias | gob.pe / El Peruano · D.S. 008-2017-SA (organigrama 24/04/2017) |
| Poder Judicial | ✅ 73 dependencias | gob.pe · RA 302-2024-CE-PJ y RA 420-2024-CE-PJ |
| Congreso de la República | ✅ 68 dependencias (Servicio Parlamentario) | gob.pe · Acuerdo de Mesa 059-2023-2024/MESA-CR |
| Gobierno Regional de Ayacucho | ✅ 63 dependencias | gob.pe · ROF (organigrama modificado 2025) |
| Contraloría General de la República | ✅ 74 dependencias | gob.pe · ROF (organigrama oficial CGR) |
| Despacho Presidencial | ✅ 22 dependencias | gob.pe · Res. 000044-2024/DP-SG (Anexo 02, Sección 2 del ROF) |
| PROMPERÚ | ✅ 31 dependencias | gob.pe · ROF (organigrama estructural); adscrito a MINCETUR |
| INEI | ✅ 20 dependencias | gob.pe · D.S. 043-2001-PCM, mod. 066-2003-PCM |
| ONPE | ✅ 44 dependencias | gob.pe · Res. Jefatural 125-2024-JN |
| BCRP | ✅ 22 dependencias (Organigrama General) | bcrp.gob.pe · ROF, Título IX (Organigrama General) |
| Universidad Nacional de San Cristóbal de Huamanga (UNSCH) | ✅ 51 dependencias | unsch.edu.pe · ROF 2021, RR 041-2021-UNSCH (Art. 5) |
| Banco de la Nación | ✅ 76 dependencias | bn.com.pe · ROF 2025 (Art. 4) + organigrama Anexo 1 |
| SUNAT | ✅ 316 dependencias | Anexo 1 del ROF (R.S. 000149-2024/SUNAT), hasta División |
| SBS | ✅ 90 dependencias | ROF SBS-010-24 (Res. SBS 00189-2026), Art. 9 |
| Tribunal Constitucional | ✅ 23 dependencias | Sección Segunda del ROF |
| PRONABEC | ✅ 28 dependencias | Organigrama del MOP (gob.pe) |
| SUNEDU | ✅ 29 dependencias | Organigrama 2024 (gob.pe) |
| DRE Ayacucho | ✅ 9 dependencias | ROF (bajo GORE Ayacucho) |
| DIRESA Ayacucho | ✅ 19 dependencias | O.R. 018-2018-GRA/CR · 7 Redes de Salud + 9 Hospitales |
| PRIDER | ✅ 14 dependencias | MOP (D.R. 0002-2026-GRA/GR); órgano desconc. GORE Ayacucho |
| Muni. Provincial de Huamanga | ✅ 71 dependencias | Ordenanza Municipal 013-2021-MPH/A |
| Muni. Provincial de Huanta | ✅ 52 dependencias | organigrama oficial (munihuanta.gob.pe) |
| Muni. Provincial de Cangallo | ✅ 27 dependencias | estructura orgánica (gob.pe/municangallo) |
| Muni. Distrital de Chuschi | ✅ 37 dependencias | organigrama 2023-2026 |
| Muni. Distrital de San Juan Bautista | ✅ 34 dependencias | ROF (Anexo Organigrama), Huamanga |
| Muni. Distrital de Jesús Nazareno | ✅ 37 dependencias | ROF (Anexo Organigrama), Huamanga |
| Resto (13 ministerios, otros poderes/GORE, autónomos, universidades, munis…) | Pendiente — bajo demanda | — |

> Nota: el distrito de **Ayacucho (cercado)** no tiene municipalidad distrital
> propia — lo gobierna la Municipalidad Provincial de Huamanga (ya cargada).

Cuántas instituciones hay en el directorio lo dice la página Directorio («estado de la base») o
`GET /api/directorio/estado`. La cobertura total del Estado es una campaña incremental: pedir
«carga el organigrama de <institución>» y se investiga (gob.pe → Organigrama →
PDF oficial) → se transcribe a árbol → se carga → se verifica. Ritmo sano: una
o dos instituciones por sesión, con verificación.

> `GET /api/directorio/instituciones` y la página cargan hasta `limite=5000`: con los
> organigramas el directorio supera las 500 dependencias y el árbol se truncaba.

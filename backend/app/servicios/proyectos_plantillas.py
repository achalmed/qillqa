"""Plantillas de PROYECTO por tipo: partes del texto y fases del trabajo.

Son DATOS, no código: un tipo nuevo de proyecto (un informe, una moción)
se agrega aquí sin tocar la lógica. Del proyecto de ley:

  · PARTES = los componentes del esquema `proyecto-de-ley` del ecosistema
    (escritura/esquemas/proyecto-de-ley.tex: Reglamento del Congreso arts.
    75-76 y Manual de Técnica Legislativa 2021, secs. VI y X), el mismo que
    exige la plantilla LaTeX del marco. Las claves coinciden con
    `\\componente{clave}` para que el PDF se genere desde estas partes.
  · FASES = el procedimiento (ver FASES_PL y docs/plataforma/), separadas en
    las que ocurren DENTRO de la entidad (interna) y las que se siguen en el
    Congreso tras presentarlo (congreso).
"""

from __future__ import annotations

# (clave, título, grupo, obligatoria)
SECCIONES_PL: list[tuple[str, str, str, bool]] = [
    ("titulo", "Título de la ley", "formula", True),
    ("preliminar", "Título preliminar", "formula", False),
    ("sustantiva", "Parte sustantiva (articulado)", "formula", True),
    ("dcf", "Disposiciones complementarias finales", "formula", False),
    ("dct", "Disposiciones complementarias transitorias", "formula", False),
    ("dcm", "Disposiciones complementarias modificatorias", "formula", False),
    ("dcd", "Disposiciones complementarias derogatorias", "formula", False),
    # La exposición de motivos es OPCIONAL parte por parte (asesor, 2026-10-05:
    # «no necesariamente se sigue ese esquema, el contenido varía según el tipo
    # de PL»): cada parte se renombra o se deja vacía; el PDF solo avisa si la
    # exposición no tiene ninguna (proyecto_ley.maestro).
    ("fundamentos", "Fundamentos de la propuesta", "exposicion", False),
    ("antecedentes", "Antecedentes legislativos", "exposicion", False),
    ("efecto", "Efecto de la vigencia de la norma sobre la legislación nacional", "exposicion", False),
    ("costo-beneficio", "Análisis costo-beneficio", "exposicion", False),
    ("agenda", "Relación con la Agenda Legislativa y el Acuerdo Nacional", "exposicion", False),
    ("ambiental", "Incidencia ambiental", "exposicion", False),
    # No está en el esquema del ecosistema ni en el MTL 2021, pero el primer
    # proyecto real (piloto 2026-10-01) la trae: «VI. Conclusión de la
    # fundamentación». Opcional; se propone sumarla al esquema.
    ("conclusion", "Conclusión de la fundamentación", "exposicion", False),
    ("comparativo", "Cuadro comparativo", "final", False),
]

GRUPOS_PL = {
    "formula": "Fórmula legal",
    "exposicion": "Exposición de motivos",
    "final": "Complementos",
}

# Fuentes de las fases (vigentes desde el 27/07/2026):
#   RCD = Reglamento de la Cámara de Diputados, Res. Leg. 005-2025-2026-CR
#   RS  = Reglamento del Senado, Res. Leg. 006-2025-2026-CR
#   Const. = Constitución, texto de la Ley 31988 (bicameralidad)
#   MTL = Manual de Técnica Legislativa, 3.ª ed., 2021 (anterior a la
#         bicameralidad: buena práctica de forma, no norma vigente).
# Cada requisito es (texto, fuente[, naturaleza]): oficial (la norma), despacho
# (flujo interno) o buena_practica; si falta, se deduce de la fuente
# (servicios/proyectos.py::naturaleza_de). La interfaz no las mezcla.
RCD = "Reglamento de la Cámara de Diputados"

FASES_PL: list[dict] = [
    # --- DENTRO DEL DESPACHO -------------------------------------------
    {
        "clave": "idea", "nombre": "Idea y encargo", "ambito": "interna",
        "descripcion": "Se define el problema público, quién lo trabaja y para cuándo.",
        "requisitos": [
            ("Problema público delimitado en una frase", "flujo de la entidad", "despacho"),
            ("Responsable y equipo asignados", "flujo de la entidad", "despacho"),
        ],
    },
    {
        "clave": "investigacion", "nombre": "Investigación y evidencia", "ambito": "interna",
        "descripcion": "Evidencia del problema, antecedentes legislativos, normas vigentes y derecho comparado, con sus fuentes registradas.",
        "requisitos": [
            ("Evidencia que sustenta el problema", f"{RCD}, art. 106 b"),
            ("Antecedentes legislativos (proyectos y leyes previas)", f"{RCD}, art. 106 c"),
            ("Referencias a investigaciones o propuestas de terceros, sin omitirlas", f"{RCD}, art. 107"),
        ],
        "depende_de": ["idea"],
    },
    {
        "clave": "redaccion", "nombre": "Redacción", "ambito": "interna",
        "descripcion": "Fórmula legal y exposición de motivos, parte por parte.",
        "requisitos": [
            ("Sumilla o título", f"{RCD}, art. 106 a"),
            ("Problema público, evidencia, objetivos generales y específicos y exposición de motivos fundamentada", f"{RCD}, art. 106 b"),
            ("Sectores comprendidos", f"{RCD}, art. 106 d"),
            ("Normas que se modifican o derogan, con precisión de artículos", f"{RCD}, art. 106 e"),
            ("Análisis costo-beneficio: actores, efectos monetarios y no monetarios, impacto económico, presupuestal y ambiental", f"{RCD}, art. 106 f"),
            ("Relación con la Agenda Legislativa y el Acuerdo Nacional", "buena práctica (MTL 2021, cap. X)"),
        ],
        "depende_de": ["investigacion"],
    },
    {
        "clave": "revision", "nombre": "Revisión técnico-legislativa", "ambito": "interna",
        "descripcion": "Revisión de forma, de técnica legislativa y de las causales de rechazo de plano.",
        "requisitos": [
            ("No crea ni aumenta gasto público", f"{RCD}, art. 107"),
            ("Incluye la lista de beneficiarios, si corresponde", f"{RCD}, art. 107"),
            ("No copia otros proyectos", f"{RCD}, art. 107"),
            ("Técnica legislativa: estructura, numeración, disposiciones", "MTL 2021, caps. VI y X"),
        ],
        "depende_de": ["redaccion"],
    },
    {
        "clave": "aprobacion", "nombre": "Aprobación del autor", "ambito": "interna",
        "descripcion": "El diputado aprueba la versión final; desde aquí el texto queda congelado.",
        "requisitos": [("Versión final aprobada por el autor", "flujo de la entidad", "despacho")],
        "depende_de": ["revision"],
    },
    {
        "clave": "respaldo", "nombre": "Respaldo del grupo parlamentario", "ambito": "interna",
        "descripcion": "Firmas de los miembros del grupo y certificación del vocero; adhesiones de otros diputados.",
        "requisitos": [
            ("Firmas de no menos de cinco miembros del grupo parlamentario (o la mitad si el grupo tiene menos de cinco)", f"{RCD}, art. 107"),
            ("Certificación del vocero o de quien lo reemplace", f"{RCD}, art. 107"),
            # Práctica observada en los PL 2026-2031 del SPLEY (2026-10-01): el vocero
            # firma digitalmente el mismo PDF, bajo «Certificación del vocero del grupo».
            ("Firma digital (ReFirma, RENIEC) del autor, de los adherentes y del vocero en el mismo PDF", "práctica de la Cámara (PL 2026-2031 en el SPLEY)", "buena_practica"),
            ("Adhesiones de otros diputados", "buena práctica (MTL 2021, cap. X)"),
        ],
        "depende_de": ["aprobacion"],
    },
    {
        "clave": "presentacion", "nombre": "Presentación y registro", "ambito": "interna",
        "descripcion": "Se presenta en la mesa de partes de la Cámara; la Oficialía Mayor verifica los requisitos, lo registra con número y lo publica.",
        "requisitos": [
            ("Presentado en mesa de partes de la Cámara de Diputados, por medios virtuales", f"{RCD}, arts. 111 y 97"),
            ("Constancia de registro y número del proyecto", f"{RCD}, art. 112"),
        ],
        "depende_de": ["respaldo"],
    },
    # --- EN EL CONGRESO (seguimiento) ------------------------------------
    {
        "clave": "decreto", "nombre": "Decreto de envío a comisión", "ambito": "congreso",
        "descripcion": "El Oficial Mayor lo deriva a una o dos comisiones (el orden fija la prelación).",
        "requisitos": [("Decreto de envío: fecha, número y comisiones", f"{RCD}, art. 113")],
        "depende_de": ["presentacion"],
    },
    {
        "clave": "comision", "nombre": "Estudio en comisión", "ambito": "congreso",
        "descripcion": "Admisibilidad, pedidos de opinión a entidades, sesiones. Plazo: 60 días hábiles.",
        "requisitos": [
            ("Pedidos de opinión y opiniones recibidas", f"{RCD}, art. 135"),
            ("Sustentación del autor ante la comisión, si se solicita", "flujo de la entidad", "despacho"),
        ],
        "depende_de": ["decreto"],
    },
    {
        "clave": "dictamen", "nombre": "Dictamen y publicación", "ambito": "congreso",
        "descripcion": "Dictamen (mayoría, minoría o unanimidad) y su publicación en el portal 7 días calendario antes del Pleno.",
        "requisitos": [
            ("Dictamen aprobado", f"{RCD}, arts. 136-139"),
            ("Publicado 7 días calendario (salvo exoneración)", f"{RCD}, art. 104 c"),
        ],
        "depende_de": ["comision"],
    },
    {
        "clave": "pleno", "nombre": "Pleno de la Cámara de Diputados", "ambito": "congreso",
        "descripcion": "Agenda de la Junta de Portavoces, debate y votación (sin «cargo a redacción»).",
        "requisitos": [
            ("En agenda del Pleno", f"{RCD}, art. 33"),
            ("Aprobado en el Pleno", f"{RCD}, arts. 76-77"),
        ],
        "depende_de": ["dictamen"],
    },
    {
        "clave": "senado", "nombre": "Revisión en el Senado", "ambito": "congreso",
        "descripcion": "Remisión en 15 días hábiles; una comisión del Senado (90 días hábiles), dictamen, Pleno.",
        "requisitos": [
            ("Remitido al Senado con el expediente completo", f"Const. art. 105; {RCD}, art. 148"),
            ("Revisado por el Senado", "Reglamento del Senado, arts. 110-116 y 148-151"),
        ],
        "depende_de": ["pleno"],
    },
    {
        "clave": "promulgacion", "nombre": "Autógrafa y promulgación", "ambito": "congreso",
        "descripcion": "Autógrafa al Presidente de la República: 15 días para promulgar u observar.",
        "requisitos": [
            ("Autógrafa remitida", "Reglamento del Senado, art. 148"),
            ("Promulgada u observada", f"Const. art. 108; {RCD}, arts. 151-152"),
        ],
        "depende_de": ["senado"],
    },
    {
        "clave": "publicacion", "nombre": "Publicación en El Peruano", "ambito": "congreso",
        "descripcion": "La ley rige desde el día siguiente de su publicación, salvo disposición contraria.",
        "requisitos": [("Ley publicada", "Const. art. 109")],
        "depende_de": ["promulgacion"],
    },
]

PLANTILLAS: dict[str, dict] = {
    "proyecto_de_ley": {
        "nombre": "Proyecto de ley",
        "prefijo": "PL",
        "secciones": SECCIONES_PL,
        "grupos": GRUPOS_PL,
        "fases": FASES_PL,
    },
}

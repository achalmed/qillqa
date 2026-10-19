# seeds/80_wiki_guia.rb — openproject_despacho: guía de uso del equipo en el wiki del proyecto raíz, con el nombre y los proyectos del perfil (idempotente).
# Correr:  ./sembrar.sh [--aplicar] seeds/80_wiki_guia.rb
autor = User.find_by(login: "admin") || User.where(admin: true).first
raiz_id = perfil("despacho", "identificador", defecto: "despacho")
proj  = Project.find_by(identifier: raiz_id) or abort "No existe el proyecto raíz #{raiz_id}"
nombre_despacho = perfil("despacho", "nombre", defecto: "Despacho")

wiki = proj.wiki || Wiki.create!(project: proj, start_page: "Guía del Despacho")

filas = perfil("proyectos", defecto: []).reject { |p| p["padre"] }.map do |p|
  "  | **#{p['nombre']}** | #{p['descripcion'].to_s.split('.').first} |"
end.join("\n")

texto = <<~MARKDOWN
  # 🏛️ Guía del Despacho — #{nombre_despacho}

  Bienvenido/a al sistema de gestión del despacho. Aquí coordinamos **todo el
  trabajo**: tareas, documentos, expedientes, reuniones, compromisos e iniciativas.

  ## Los proyectos (espejan nuestras áreas de trabajo)

  | Proyecto | Para qué |
  |---|---|
#{filas}

  ## Conceptos clave

  - **Pelota** 🎾: ¿de quién depende avanzar? *Nuestra* = nos toca actuar;
    *De tercero* = esperamos respuesta. Empieza tu día por lo que tiene **pelota nuestra**.
  - **Cuadrante** (Eisenhower): *Hacer* / *Planificar* / *Delegar* / *Descartar*.
  - **Tipos de trabajo**: Tarea, Reunión, Compromiso, Documento, Expediente,
    Solicitud, Proyecto de Ley, Investigación, Actividad de agenda.

  ## Ritmo de trabajo

  1. **Lunes** — planificar la semana (asignar trabajo a la versión `Semana AAAA-Wnn`).
  2. **Cada día** — abrir la vista **🔴 Pelota nuestra** y avanzar lo pendiente.
  3. **Viernes** — cerrar lo hecho, mover lo pendiente a la semana siguiente.

  ## Vistas y tableros útiles

  - **🔴 Pelota nuestra**, **⏰ Vencen en ≤7 días**, **🤝 Compromisos abiertos** (globales).
  - Tableros Kanban: **Expedientes**, **Producción Documental**, **Pipeline Legislativo**,
    **Tareas del Equipo** (arrastra las tarjetas entre columnas para cambiar su estado).

  ## Plantillas (no reinventes la rueda)

  Busca los Work Packages que empiezan con **[PLANTILLA]**, usa *Copiar* y renómbralos:
  Reunión, Producción de documento, Semana de representación, Informe CIL.

  ## Regla de oro

  > Si un pendiente, acuerdo o compromiso solo existe en un correo o en tu cabeza,
  > **todavía no existe**. Créalo aquí, con responsable y fecha.
MARKDOWN

page = WikiPage.find_or_initialize_by(wiki_id: wiki.id, title: "Guía del Despacho")
nuevo = page.new_record?
if page.respond_to?(:text=)                       # OP moderno: texto en la propia página
  page.text   = texto
  page.author = autor if page.respond_to?(:author=)
  page.save!
else                                              # versiones antiguas: WikiContent
  page.save! if page.new_record?
  wc = page.content || WikiContent.new(page: page)
  wc.text = texto; wc.author = autor; wc.save!
end
wiki.update(start_page: page.title) if wiki.start_page.blank?
puts "  #{nuevo ? '+' : '='} Guía del Despacho (#{texto.lines.size} líneas) en el wiki de '#{raiz_id}'"
puts "Wiki start_page: #{wiki.reload.start_page}"

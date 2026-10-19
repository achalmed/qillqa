# seeds/60_plantillas.rb — openproject_despacho: jerarquías [PLANTILLA] que el equipo copia para procesos recurrentes (idempotente).
# Fase 4 · Plantillas recurrentes  (idempotente)
# Jerarquías padre→subtareas prefijadas "[PLANTILLA]" que el equipo
# DUPLICA (botón "Copiar" en OpenProject) para procesos repetitivos.
# Correr:  ./sembrar.sh [--aplicar] seeds/60_plantillas.rb
autor = User.find_by(login: "admin") || User.where(admin: true).first
MEDIA = IssuePriority.find_by(name: "Media")

def wp(proj, tipo, asunto, autor, prio, estado: "Nuevo", parent: nil)
  existente = WorkPackage.find_by(subject: asunto, project_id: proj.id)
  return existente if existente
  WorkPackage.create!(project: proj, type: Type.find_by(name: tipo), subject: asunto,
                      status: Status.find_by(name: estado), priority: prio, author: autor, parent: parent)
end

def plantilla(ident, tipo_padre, asunto_padre, hijos, autor, prio)
  proj = Project.find_by(identifier: ident) or return puts("  ! proyecto #{ident} no existe")
  padre = wp(proj, tipo_padre, asunto_padre, autor, prio)
  return puts("  ! no se pudo crear #{asunto_padre}") unless padre
  hijos.each { |tipo_h, asunto_h| wp(proj, tipo_h, asunto_h, autor, prio, parent: padre) }
  puts "  + plantilla: #{asunto_padre} [#{ident}] (#{hijos.size} subtareas)"
rescue => e
  puts "  ! error plantilla #{asunto_padre}: #{e.class} #{e.message}"
end

# 1) Reunión → agenda, acta, compromiso
plantilla("coordinacion", "Reunión", "[PLANTILLA] Reunión — copiar y renombrar",
  [["Tarea", "[PLANTILLA] Preparar y circular la agenda"],
   ["Tarea", "[PLANTILLA] Redactar el acta / minuta"],
   ["Compromiso", "[PLANTILLA] Compromiso derivado — renombrar"]],
  autor, MEDIA)

# 2) Producción de documento → ciclo elaboración→envío→cargo (espeja SGDP)
plantilla("documentos", "Documento", "[PLANTILLA] Documento — copiar y renombrar",
  [["Tarea", "[PLANTILLA] 1· Redactar borrador"],
   ["Tarea", "[PLANTILLA] 2· Revisión formal"],
   ["Tarea", "[PLANTILLA] 3· Numerar en SGDP"],
   ["Tarea", "[PLANTILLA] 4· Gestionar firma"],
   ["Tarea", "[PLANTILLA] 5· Enviar al destinatario"],
   ["Tarea", "[PLANTILLA] 6· Registrar cargo / constancia"]],
  autor, MEDIA)

# 3) Semana de representación → actividades territoriales típicas
plantilla("representacion", "Tarea", "[PLANTILLA] Semana de representación — renombrar",
  [["Actividad de agenda", "[PLANTILLA] Visitas a instituciones"],
   ["Reunión", "[PLANTILLA] Reunión con autoridades locales"],
   ["Actividad de agenda", "[PLANTILLA] Audiencia / atención ciudadana"],
   ["Compromiso", "[PLANTILLA] Compromisos asumidos en territorio"],
   ["Tarea", "[PLANTILLA] Informe de la semana de representación"]],
  autor, MEDIA)

# 4) Informe CIL mensual → pipeline de investigación
plantilla("cil-investigacion", "Investigación", "[PLANTILLA] Informe CIL — copiar y renombrar",
  [["Tarea", "[PLANTILLA] 1· Recolección de datos"],
   ["Tarea", "[PLANTILLA] 2· Análisis"],
   ["Tarea", "[PLANTILLA] 3· Redacción"],
   ["Tarea", "[PLANTILLA] 4· Revisión"],
   ["Tarea", "[PLANTILLA] 5· Entrega / publicación"]],
  autor, MEDIA)

puts ""
puts "Work Packages [PLANTILLA]: #{WorkPackage.where("subject LIKE '[PLANTILLA]%'").count}"

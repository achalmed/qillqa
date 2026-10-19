# seeds/15_workflows.rb — openproject_despacho: transiciones de estado por tipo y rol; sin ellas un work package no sale de Nuevo (idempotente).
# Fase 1b · Flujos de trabajo (workflows)  (idempotente)
# Define, por TIPO, la secuencia de estados permitida, y crea las
# transiciones para los roles activos del despacho.
# Sin workflows, un WP se queda atascado en su estado inicial ("Nuevo").
# Correr DESPUÉS de 14_roles.rb.
# Correr:  ./sembrar.sh [--aplicar] seeds/15_workflows.rb

# La clase de transición cambió de nombre entre versiones: detectarla.
WF = defined?(WorkflowTransition) ? WorkflowTransition : Workflow

ROLES = Role.where(name: [
  "Jefe de Despacho", "Diputado", "Asesor Legislativo",
  "Asistente Administrativo", "Prensa", "Enlace Distrital", "Colaborador"
]).to_a
if ROLES.empty?
  puts "  ! No hay roles del despacho. Corre 14_roles.rb primero."
  return
end

# Todos los flujos ARRANCAN en "Nuevo" (estado inicial por defecto de todo WP).
FLUJOS = {
  "Tarea"               => ["Nuevo", "En curso", "En espera", "Cerrado"],
  "Compromiso"          => ["Nuevo", "En curso", "En espera", "Cerrado"],
  "Actividad de agenda" => ["Nuevo", "En curso", "Cerrado"],
  "Reunión"             => ["Nuevo", "En curso", "Cerrado"],
  "Hito"                => ["Nuevo", "Cerrado"],
  "Documento"           => ["Nuevo", "En revisión", "Numerado", "En firma", "Enviado", "Recepcionado", "Archivado"],
  "Expediente"          => ["Nuevo", "Triage", "En análisis", "En espera", "Archivado", "Descartado"],
  "Solicitud recibida"  => ["Nuevo", "Triage", "En análisis", "En espera", "Recepcionado", "Archivado", "Descartado"],
  "Proyecto de Ley"     => ["Nuevo", "En análisis", "Redacción", "En revisión", "Presentado", "En comisión", "Dictaminado", "En pleno", "Aprobado", "Rechazado"],
  "Investigación"       => ["Nuevo", "En análisis", "Redacción", "En revisión", "Entregado"],
}

def transiciones(status_objs)
  ids        = status_objs.map(&:id)
  closed_ids = status_objs.select(&:is_closed).map(&:id)
  edges = []
  ids.each_cons(2) { |a, b| edges << [a, b] << [b, a] }        # avanzar y retroceder
  ids.each { |a| closed_ids.each { |c| edges << [a, c] unless a == c } }  # cualquiera -> cerrado
  edges.uniq
end

total = 0
FLUJOS.each do |type_name, status_names|
  t = Type.find_by(name: type_name)
  unless t
    puts "  ! tipo no encontrado: #{type_name}"; next
  end
  objs = status_names.map { |n| Status.find_by(name: n) }
  if objs.any?(&:nil?)
    faltan = status_names.zip(objs).select { |_, o| o.nil? }.map(&:first)
    puts "  ! estados faltantes en #{type_name}: #{faltan.join(', ')}"; next
  end
  edges = transiciones(objs)
  nuevos = 0
  ROLES.each do |role|
    edges.each do |old_id, new_id|
      w = WF.find_or_initialize_by(type_id: t.id, old_status_id: old_id, new_status_id: new_id, role_id: role.id)
      if w.new_record?
        w.author = false if w.respond_to?(:author=)
        w.assignee = false if w.respond_to?(:assignee=)
        begin; w.save!; nuevos += 1; rescue => e; puts "    ! #{type_name} #{old_id}->#{new_id}: #{e.message}"; end
      end
    end
  end
  total += nuevos
  puts "  #{type_name}: #{edges.size} transiciones × #{ROLES.size} roles => +#{nuevos} nuevas"
end
puts "Workflows nuevos: #{total}. Total en el sistema: #{WF.count}"

# seeds/51_tableros.rb — openproject_despacho: tableros Kanban por estado (Boards::Grid) en los proyectos del modelo (idempotente).
# Fase 3b · Tableros Kanban (action boards por estado)  (idempotente)
# Un Boards::Grid con N columnas = N estados, cada columna respaldada
# por una Query oculta filtrada por (tipo + estado).
# Correr:  ./sembrar.sh [--aplicar] seeds/51_tableros.rb
autor = User.find_by(login: "admin") || User.where(admin: true).first

def query_columna(proj, autor, type_id, status_id, nombre)
  q = Query.new(name: nombre, project: proj, user: autor, public: true)
  q.include_subprojects = false
  q.hidden = true if q.respond_to?(:hidden=)      # no ensucia el menú de vistas
  q.add_filter("type_id", "=", [type_id.to_s])
  q.add_filter("status_id", "=", [status_id.to_s])
  q.column_names = [:id, :subject, :assigned_to, :priority, :due_date] & q.available_columns.map(&:name)
  q.save!
  q
end

def crear_tablero(ident, nombre, type_name, status_names, autor)
  proj = Project.find_by(identifier: ident) or return puts("  ! proyecto #{ident} no existe")
  type = Type.find_by(name: type_name)     or return puts("  ! tipo #{type_name} no existe")
  if Boards::Grid.find_by(project_id: proj.id, name: nombre)
    return puts("  = tablero ya existe: #{nombre}")
  end
  statuses = status_names.map { |n| Status.find_by(name: n) }.compact
  n = statuses.size
  grid = Boards::Grid.new(
    project: proj, name: nombre, row_count: 1, column_count: n,
    options: { "type" => "action", "attribute" => "status", "highlightingMode" => "priority",
               filters: [{ type: { operator: "=", values: [type.id.to_s] } }] }
  )
  statuses.each_with_index do |st, i|
    qcol = query_columna(proj, autor, type.id, st.id, "#{nombre} · #{st.name}")
    grid.widgets.build(
      identifier: "work_package_query",
      start_row: 1, end_row: 2, start_column: i + 1, end_column: i + 2,
      options: { query_id: qcol.id, filters: [{ status: { operator: "=", values: [st.id.to_s] } }] }
    )
  end
  grid.save!
  puts "  + tablero: #{nombre} [#{ident}] — #{n} columnas (#{status_names.join(' → ')})"
rescue => e
  puts "  ! error tablero '#{nombre}': #{e.class} #{e.message}"
end

crear_tablero("correspondencia", "Tablero de Expedientes", "Expediente",
  ["Nuevo", "Triage", "En análisis", "En espera", "Archivado"], autor)

crear_tablero("documentos", "Producción Documental", "Documento",
  ["Nuevo", "En revisión", "Numerado", "En firma", "Enviado", "Recepcionado", "Archivado"], autor)

crear_tablero("legislativo", "Pipeline Legislativo", "Proyecto de Ley",
  ["Nuevo", "En análisis", "Redacción", "En revisión", "Presentado", "En comisión", "Dictaminado", "En pleno", "Aprobado"], autor)

crear_tablero("coordinacion", "Tareas del Equipo", "Tarea",
  ["Nuevo", "En curso", "En espera", "Cerrado"], autor)

puts ""
puts "Tableros (Boards::Grid) totales: #{Boards::Grid.count}"

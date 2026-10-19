# seeds/30_activacion_por_proyecto.rb — openproject_despacho: tipos de work package habilitados por proyecto, según el perfil (idempotente).
#
# Cada proyecto ofrece SOLO los tipos que declara PERFIL["proyectos"][i]["tipos"]; el raíz ve todos
# (vista global). Los campos personalizados ya son is_for_all=true → disponibles en todos.
# Archiva además los proyectos demo que trae OpenProject.
# Correr:  ./sembrar.sh [--aplicar] seeds/30_activacion_por_proyecto.rb

raiz_id = perfil("despacho", "identificador", defecto: "despacho")
proyectos = perfil("proyectos", defecto: [])
abort "❌ el perfil no declara `proyectos`" if proyectos.empty?

mapa = proyectos.each_with_object({}) { |pr, h| h[pr["identificador"]] = Array(pr["tipos"]) }
# la raíz ve TODOS los tipos que usa el despacho (no los nativos de Scrum que trae OpenProject)
mapa[raiz_id] = (["Tarea", "Hito"] + proyectos.flat_map { |pr| Array(pr["tipos"]) }).uniq

mapa.each do |ident, type_names|
  p = Project.find_by(identifier: ident)
  unless p
    puts "  ! proyecto no encontrado: #{ident}"; next
  end
  tipos = Type.where(name: type_names).to_a
  faltan = type_names - tipos.map(&:name)
  puts "  ! tipos desconocidos en #{ident}: #{faltan.join(', ')} (¿corrió 11_tipos.rb?)" unless faltan.empty?
  p.types = tipos
  p.save!
  puts "  #{ident.ljust(18)} → #{p.types.order(:position).pluck(:name).join(', ')}"
rescue => e
  puts "  ! error en #{ident}: #{e.class} #{e.message}"
end

# --- Limpieza: archivar los proyectos demo que trae OpenProject ---
puts ""
["demo-project", "your-scrum-project"].each do |id|
  pr = Project.find_by(identifier: id)
  next unless pr
  begin
    if pr.respond_to?(:active?) && pr.active?
      pr.update!(active: false)
      puts "  ~ proyecto demo archivado: #{id}"
    else
      puts "  = demo ya archivado: #{id}"
    end
  rescue => e
    puts "  ! no se pudo archivar #{id}: #{e.message}"
  end
end
puts ""
puts "Proyectos activos ahora: #{Project.active.count}"

# seeds/20_proyectos.rb — openproject_despacho: estructura de proyectos del despacho leída del perfil (idempotente).
#
# Lee PERFIL["despacho"] (proyecto raíz) y PERFIL["proyectos"] (identificador, nombre, descripcion,
# padre). Los tipos habilitados por proyecto los aplica 30_activacion_por_proyecto.rb.
# Correr:  ./sembrar.sh [--aplicar] seeds/20_proyectos.rb

# Módulos a habilitar por proyecto (los inválidos se ignoran solos).
MODS = %w[
  work_package_tracking gantt calendar board_view
  meetings wiki news documents activity overview members
]

def crear_proyecto(nombre, ident, desc, parent_ident = nil, modulos = MODS)
  p = Project.find_or_initialize_by(identifier: ident)
  if p.new_record?
    p.name           = nombre
    p.description    = desc
    p.public         = false
    p.workspace_type = "project" if p.respond_to?(:workspace_type=)   # OpenProject 17: project | program | portfolio
    if parent_ident
      padre = Project.find_by(identifier: parent_ident)
      p.parent = padre if padre
    end
    p.save!
    p.enabled_module_names = modulos
    p.save!
    puts "  + #{ident.ljust(18)} #{nombre}"
  else
    puts "  = ya existe: #{ident}"
  end
  p
rescue => e
  puts "  ! error proyecto #{ident}: #{e.class} #{e.message}"
  nil
end

raiz_id = perfil("despacho", "identificador", defecto: "despacho")
proyectos = perfil("proyectos", defecto: [])
abort "❌ el perfil no declara `proyectos` (ver perfil.ejemplo/openproject.yml)" if proyectos.empty?

# --- Raíz ---
crear_proyecto(perfil("despacho", "nombre", defecto: "Despacho"), raiz_id,
  perfil("despacho", "descripcion", defecto: "Proyecto raíz del despacho."))

# --- Los proyectos del perfil, en el orden declarado (los padres antes que los hijos) ---
proyectos.each do |pr|
  crear_proyecto(pr["nombre"], pr["identificador"], pr["descripcion"].to_s, pr["padre"] || raiz_id)
end

puts ""
puts "Proyectos activos: #{Project.active.count}"

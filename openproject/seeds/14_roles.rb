# seeds/14_roles.rb — openproject_despacho: roles de proyecto del despacho clonando permisos de los nativos (idempotente).
# Fase 1b · Roles del despacho  (idempotente)
# Estrategia: CLONAR los permisos de un rol nativo apropiado y ajustar,
# en vez de enumerar decenas de símbolos de permiso a mano.
# El rol "Lector" nativo se reutiliza tal cual (solo lectura).
# En OpenProject moderno los roles de proyecto son ProjectRole (STI).
# Usar esa clase; si no existiera en esta versión, caer a Role.
# Correr:  ./sembrar.sh [--aplicar] seeds/14_roles.rb
ROLE_CLASS = defined?(ProjectRole) ? ProjectRole : Role

miembro    = ROLE_CLASS.find_by(name: "Miembro")
admin_proj = ROLE_CLASS.find_by(name: "Administrador de proyecto")

unless miembro && admin_proj
  puts "  ! No encuentro los roles base ('Miembro' / 'Administrador de proyecto'). Aborta."
  return
end

# [nombre, permisos base, quitar permisos]
defs = [
  ["Jefe de Despacho",          admin_proj.permissions, []],                       # gestión total del proyecto
  ["Diputado",                  miembro.permissions,    []],                       # ve, comenta, aprueba (cambia estado)
  ["Asesor Legislativo",        miembro.permissions,    []],
  ["Asistente Administrativo",  miembro.permissions,    []],
  ["Prensa",                    miembro.permissions,    []],
  ["Enlace Distrital",          miembro.permissions,    []],
  ["Colaborador",               miembro.permissions,    %i[manage_members add_subprojects manage_versions]],
]

creados = 0
defs.each do |name, base_perms, quitar|
  r = ROLE_CLASS.find_or_initialize_by(name: name)
  if r.new_record?
    r.permissions = (base_perms - quitar).uniq
    begin
      r.save!
      creados += 1
      puts "  + rol: #{name}  (#{r.permissions.size} permisos)"
    rescue => e
      puts "  ! error rol #{name}: #{e.class} #{e.message}"
    end
  else
    puts "  = rol ya existe: #{name}"
  end
end
puts "Roles nuevos: #{creados}. Total de roles de proyecto: #{ROLE_CLASS.count}"
puts "Nota: el rol 'Lector' nativo se usa para acceso de solo lectura."

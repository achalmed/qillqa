# seeds/70_usuarios.rb — openproject_despacho: usuarios del equipo y membresías, leídos del roster del perfil (idempotente).
#
# PERFIL["usuarios"]: login, nombre, apellido, correo, rol, admin. Las filas con correo que empieza
# en "TODO" se SALTAN. PERFIL["roles_proyectos"]: qué proyectos ve cada rol (`todos` o lista de
# identificadores). Contraseña temporal para los usuarios nuevos: OP_TEMP_PASSWORD (la pasa
# sembrar.sh desde el .env de operaciones; se cambia en el primer ingreso). Nunca va en el perfil.
# Correr:  ./sembrar.sh [--aplicar] seeds/70_usuarios.rb

roster = perfil("usuarios", defecto: [])
abort "❌ el perfil no declara `usuarios`" if roster.empty?
pendientes = roster.reject { |u| u["correo"].to_s.start_with?("TODO") }
temp = ENV["OP_TEMP_PASSWORD"].to_s
if temp.empty? && pendientes.any? { |u| !User.exists?(login: u["login"]) }
  abort "❌ Defina OP_TEMP_PASSWORD (contraseña temporal de los usuarios sembrados; se cambia en el primer ingreso)"
end
rol_proyectos = perfil("roles_proyectos", defecto: {})

def activar!(u)
  # status "activo" de forma robusta entre versiones
  begin; u.status = (User.respond_to?(:statuses) ? User.statuses[:active] : 1); rescue; u.status = 1; end
end

roster.each do |fila|
  login, nom, ape, mail = fila.values_at("login", "nombre", "apellido", "correo")
  rol_nombre = fila["rol"]; es_admin = fila["admin"] == true
  if mail.to_s.start_with?("TODO")
    puts "  ⏭  #{login}: sin correo real todavía (edite el perfil y vuelva a correr)"; next
  end
  u = User.find_or_initialize_by(login: login)
  if u.new_record?
    u.firstname = nom; u.lastname = ape; u.mail = mail
    u.language = "es"; u.admin = es_admin
    u.password = temp; u.password_confirmation = temp
    u.force_password_change = true if u.respond_to?(:force_password_change=)
    activar!(u)
    begin
      u.save!
      puts "  + usuario: #{login} (#{nom} #{ape}) — rol #{rol_nombre}#{es_admin ? ' [admin]' : ''}"
    rescue => e
      puts "  ! error usuario #{login}: #{e.message}"; next
    end
  else
    puts "  = usuario ya existe: #{login}"
  end

  rol = (defined?(ProjectRole) ? ProjectRole : Role).find_by(name: rol_nombre)
  next puts("    ! rol no encontrado: #{rol_nombre} (¿corrió 14_roles.rb?)") unless rol
  idents = rol_proyectos[rol_nombre]
  projs  = if idents.nil? || idents == "todos"
             Project.where(active: true)
           else
             Project.where(identifier: Array(idents))
           end
  nuevas = 0
  projs.each do |pr|
    m = Member.find_or_initialize_by(project_id: pr.id, user_id: u.id)
    if m.new_record?
      m.roles = [rol]; m.save!; nuevas += 1
    end
  end
  puts "     membresías: +#{nuevas} (#{projs.count} proyectos como #{rol_nombre})"
end

puts ""
puts "Usuarios (no built-in): #{User.where(type: 'User').count}"

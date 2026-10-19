# seeds/50_vistas.rb — openproject_despacho: vistas guardadas públicas (matrices de seguimiento e indicadores) por proyecto y globales (idempotente).
# Fase 6 · Vistas guardadas = matrices de seguimiento + indicadores
# Queries compartidas (public) que el equipo ve en cada proyecto y en
# la vista global. Idempotentes (busca por nombre+proyecto).
# Correr:  ./sembrar.sh [--aplicar] seeds/50_vistas.rb
autor = User.find_by(login: "admin") || User.where(admin: true).first

def cf_id(name);  WorkPackageCustomField.find_by(name: name)&.id; end
def cf_col(name); (id = cf_id(name)) ? "cf_#{id}".to_sym : nil; end
def cf_opt(name, value)
  cf = WorkPackageCustomField.find_by(name: name) or return nil
  cf.custom_options.find_by(value: value)&.id&.to_s
end
def tid(name); Type.find_by(name: name)&.id; end

def crear_vista(autor, nombre, ident, columnas:, filtros: [], group_by: nil, sort: nil, publica: true)
  proj = ident ? Project.find_by(identifier: ident) : nil
  return puts("  ! proyecto no existe: #{ident}") if ident && proj.nil?
  if Query.find_by(name: nombre, project_id: proj&.id)
    return puts("  = vista ya existe: #{nombre}")
  end
  q = Query.new(name: nombre, user: autor, project: proj, public: publica)
  q.include_subprojects = false                       # OP17 lo exige explícito
  disponibles = q.available_columns.map(&:name)        # solo columnas realmente ofrecidas
  cols = columnas.compact.map(&:to_sym)
  omitidas = cols - disponibles
  q.column_names   = cols & disponibles                # conserva orden, descarta no disponibles
  q.group_by       = group_by.to_s if group_by
  q.sort_criteria  = sort if sort
  filtros.each do |campo, op, vals|
    begin
      q.add_filter(campo.to_s, op, Array(vals).map(&:to_s))
    rescue => e
      puts "    ! filtro #{campo} #{op}: #{e.message}"
    end
  end
  if q.save
    extra = omitidas.empty? ? "" : "  (col. omitidas: #{omitidas.join(',')})"
    puts "  + vista: #{nombre}  #{proj ? "[#{ident}]" : "[global]"}#{extra}"
  else
    puts "  ! error '#{nombre}': #{q.errors.full_messages.join('; ')}"
  end
end

# --- columnas de campos personalizados (por id) ---
C_PELOTA  = cf_col("Pelota");        C_EXP     = cf_col("Código EXP")
C_ORIGEN  = cf_col("Origen");        C_NDOC    = cf_col("N° Documento")
C_TIPODOC = cf_col("Tipo documental"); C_COMIS = cf_col("Comisión")
C_REPORTE = cf_col("Código Reporte"); C_FUENTE = cf_col("Fuente / Fecha de corte")
OPT_NUESTRA = cf_opt("Pelota", "Nuestra")
F_PELOTA = "cf_#{cf_id('Pelota')}"

# 1) Pelota nuestra — lo que nos toca, global
crear_vista(autor, "🔴 Pelota nuestra (pendientes)", nil,
  columnas: [:id, :project, :type, :subject, :status, :priority, :due_date, :assigned_to, C_PELOTA],
  filtros: [[F_PELOTA, "=", [OPT_NUESTRA]], ["status_id", "o", []]],
  sort: [["priority", "desc"], ["due_date", "asc"]])

# 2) Vencen pronto o vencidos — global
crear_vista(autor, "⏰ Vencen en ≤7 días", nil,
  columnas: [:id, :project, :type, :subject, :status, :due_date, :assigned_to, :priority],
  filtros: [["status_id", "o", []], ["due_date", "<t+", ["7"]]],
  sort: [["due_date", "asc"]])

# 3) Expedientes por fase — correspondencia (matriz tipo tablero de correo)
crear_vista(autor, "📥 Expedientes por fase", "correspondencia",
  columnas: [:id, :subject, C_EXP, C_ORIGEN, C_PELOTA, :status, :due_date],
  filtros: [["type_id", "=", [tid("Expediente")]]],
  group_by: :status, sort: [["updated_at", "desc"]])

# 4) Documentos por estado — producción documental
crear_vista(autor, "📄 Documentos por estado", "documentos",
  columnas: [:id, :subject, C_NDOC, C_TIPODOC, :status, :assigned_to],
  filtros: [["type_id", "=", [tid("Documento")]]],
  group_by: :status)

# 5) Pipeline legislativo
crear_vista(autor, "⚖️ Pipeline legislativo", "legislativo",
  columnas: [:id, :subject, C_COMIS, :status, :priority, :assigned_to],
  filtros: [["type_id", "=", [tid("Proyecto de Ley")]]],
  group_by: :status, sort: [["priority", "desc"]])

# 6) Compromisos abiertos por responsable — global
crear_vista(autor, "🤝 Compromisos abiertos", nil,
  columnas: [:id, :project, :subject, :assigned_to, :due_date, :status, C_PELOTA],
  filtros: [["type_id", "=", [tid("Compromiso")]], ["status_id", "o", []]],
  group_by: :assigned_to, sort: [["due_date", "asc"]])

# 7) Investigaciones CIL en curso
crear_vista(autor, "🔬 Investigaciones CIL", "cil",
  columnas: [:id, :subject, C_REPORTE, C_FUENTE, :status, :due_date],
  filtros: [["type_id", "=", [tid("Investigación")]]],
  group_by: :status)

# 8) Agenda: actividades y reuniones abiertas — coordinación
crear_vista(autor, "📅 Agenda — actividades y reuniones", "coordinacion",
  columnas: [:id, :type, :subject, :start_date, :due_date, :status, :assigned_to],
  filtros: [["type_id", "=", [tid("Actividad de agenda"), tid("Reunión")].compact], ["status_id", "o", []]],
  sort: [["start_date", "asc"]])

puts ""
puts "Vistas (queries) públicas totales: #{Query.where(public: true).count}"

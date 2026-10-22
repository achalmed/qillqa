# seeds/13_campos_personalizados.rb — openproject_despacho: campos personalizados de work package; las opciones que dependen del despacho vienen del perfil (idempotente).
#
# La «cola» que conecta OpenProject con los sistemas de registro del despacho (Qillqa, informes)
# SIN duplicar la verdad: claves de enlace (N° Documento, Código EXP, Código Reporte, Ruta en disco)
# y clasificadores. Las listas Origen, Distrito/Provincia y Tipo documental se leen de
# PERFIL["campos"]["origen" | "distrito" | "tipo_documental"].
# Correr:  ./sembrar.sh [--aplicar] seeds/13_campos_personalizados.rb

def asociar_tipos(cf, nombres)
  ts = Type.where(name: nombres).to_a
  cf.types = (cf.types.to_a + ts).uniq
  cf.save!
end

def campo_lista(name, values, tipos)
  if values.nil? || values.empty?
    puts "  ⏭  campo lista #{name}: el perfil no declara opciones (campos.*); se omite"
    return
  end
  cf = WorkPackageCustomField.find_or_initialize_by(name: name)
  if cf.new_record?
    cf.field_format    = "list"   # inmutable tras crear: solo se fija al nacer
    cf.is_for_all      = true      # disponible en todos los proyectos
    cf.is_filter       = true
    cf.searchable      = true
    cf.possible_values = values
    cf.save!
    puts "  + campo lista:  #{name}  [#{values.join(' / ')}]"
  else
    # opciones nuevas del perfil que aún no existan (nunca se borran las existentes)
    actuales = cf.custom_options.pluck(:value)
    (values - actuales).each do |v|
      cf.custom_options.create!(value: v, position: cf.custom_options.count + 1)
      puts "  + opción #{name}: #{v}"
    end
    puts "  = campo ya existe: #{name}"
  end
  asociar_tipos(cf, tipos)      # esto sí es idempotente y seguro de repetir
rescue => e
  puts "  ! error campo #{name}: #{e.class} #{e.message}"
end

def campo_texto(name, tipos, fmt = "string")
  cf = WorkPackageCustomField.find_or_initialize_by(name: name)
  if cf.new_record?
    cf.field_format = fmt         # inmutable tras crear
    cf.is_for_all   = true
    cf.is_filter    = true
    cf.searchable   = true
    cf.save!
    puts "  + campo texto:  #{name}"
  else
    puts "  = campo ya existe: #{name}"
  end
  asociar_tipos(cf, tipos)
rescue => e
  puts "  ! error campo #{name}: #{e.class} #{e.message}"
end

TODOS = Type.pluck(:name)  # incluye Tarea, Hito y los tipos del despacho

# --- Ejes de gestión (en todos los tipos) ---
campo_lista("Pelota",    ["Nuestra", "De tercero", "Ninguna"], TODOS)
campo_lista("Cuadrante", ["Hacer", "Planificar", "Delegar", "Descartar"], TODOS)

# --- Claves de enlace a los sistemas de registro ---
campo_texto("Código EXP",     ["Expediente", "Solicitud recibida", "Documento"])
campo_texto("N° Documento",   ["Documento"])
campo_texto("Código Reporte", ["Investigación"])
campo_texto("Enlace Gmail",   ["Expediente", "Solicitud recibida"])
campo_texto("Ruta en disco",  TODOS)

# --- Clasificadores (opciones del perfil del despacho) ---
campo_lista("Tipo documental", perfil("campos", "tipo_documental"), ["Documento"])
campo_lista("Origen",          perfil("campos", "origen"),          ["Expediente", "Solicitud recibida"])
campo_lista("Distrito/Provincia", perfil("campos", "distrito"),
  ["Actividad de agenda", "Reunión", "Compromiso", "Tarea"])
campo_texto("Comisión",                ["Proyecto de Ley"])
campo_texto("Fuente / Fecha de corte", ["Investigación"])

puts "Campos personalizados totales: #{WorkPackageCustomField.count}"

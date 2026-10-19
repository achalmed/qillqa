# seeds/11_tipos.rb — openproject_despacho: tipos de work package del despacho, además de Tarea e Hito (idempotente).
# Fase 1 · Tipos de Work Package del despacho  (idempotente)
# Reutiliza los nativos "Tarea" y "Hito"; añade los tipos propios.
# Los tipos se HABILITAN por proyecto en la Fase 3.
# Correr:  ./sembrar.sh [--aplicar] seeds/11_tipos.rb
color = Color.first  # un color por defecto; se afina luego
tipos = [
  "Actividad de agenda",
  "Reunión",
  "Compromiso",
  "Documento",
  "Expediente",
  "Solicitud recibida",
  "Proyecto de Ley",
  "Investigación",
]
creados = 0
tipos.each do |name|
  t = Type.find_or_initialize_by(name: name)
  if t.new_record?
    t.is_milestone = false
    t.is_default   = false     # no se añade solo a proyectos nuevos; se habilita en Fase 3
    t.color        = color if t.respond_to?(:color=)
    begin
      t.save!
      creados += 1
      puts "  + tipo: #{name}"
    rescue => e
      puts "  ! error tipo #{name}: #{e.class} #{e.message}"
    end
  else
    puts "  = tipo ya existe: #{name}"
  end
end
puts "Tipos nuevos: #{creados}. Total ahora: #{Type.count}"

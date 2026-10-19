# seeds/10_estados.rb — openproject_despacho: estados del ciclo de trabajo del despacho, además de los nativos (idempotente).
# Fase 1 · Estados del despacho  (idempotente)
# Reutiliza los nativos: Nuevo, En curso, En espera, Cerrado, Rechazado.
# Añade los estados propios de los procesos del despacho.
# Correr:  ./sembrar.sh [--aplicar] seeds/10_estados.rb
nuevos = [
  # [nombre, cerrado?]
  ["Triage",        false],  # correo/solicitud recién capturada, sin analizar
  ["En revisión",   false],  # documento en revisión formal
  ["Numerado",      false],  # documento con N° oficial (SGDP)
  ["En firma",      false],
  ["Enviado",       false],
  ["Recepcionado",  false],  # con cargo/constancia
  ["Archivado",     true],   # cerrado, se conserva para consulta
  ["Descartado",    true],   # informativo / sin acción
  ["Presentado",    false],  # proyecto de ley presentado
  ["En comisión",   false],
  ["Dictaminado",   false],
  ["En pleno",      false],
  ["Aprobado",      true],
  ["En análisis",   false],  # CIL: datos + análisis
  ["Redacción",     false],  # CIL / ley: redacción del documento
  ["Entregado",     true],   # CIL: informe entregado/publicado
]
creados = 0
nuevos.each do |name, closed|
  s = Status.find_or_initialize_by(name: name)
  next unless s.new_record?
  s.is_closed = closed
  begin
    s.save!
    creados += 1
    puts "  + estado: #{name}#{closed ? ' (cerrado)' : ''}"
  rescue => e
    puts "  ! error estado #{name}: #{e.class} #{e.message}"
  end
end
puts "Estados nuevos: #{creados}. Total ahora: #{Status.count}"

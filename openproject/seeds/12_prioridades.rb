# seeds/12_prioridades.rb — openproject_despacho: prioridades semáforo: renombra Normal → Media (idempotente).
# Fase 1 · Prioridades  (idempotente)
# OpenProject ya trae: Baja, Normal, Alta, Inmediata.
# Alineamos con el modelo (semáforo): renombramos "Normal" -> "Media".
# El cuadrante Eisenhower va como CAMPO PERSONALIZADO (ver 13_campos).
# Correr:  ./sembrar.sh [--aplicar] seeds/12_prioridades.rb
if (normal = IssuePriority.find_by(name: "Normal")) && IssuePriority.find_by(name: "Media").nil?
  normal.update(name: "Media")
  puts "  ~ prioridad 'Normal' renombrada a 'Media'"
else
  puts "  = prioridades ya alineadas (o 'Media' ya existe)"
end
puts "Prioridades: #{IssuePriority.order(:position).pluck(:name).join(' · ')}"

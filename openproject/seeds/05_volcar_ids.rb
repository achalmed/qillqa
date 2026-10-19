# seeds/05_volcar_ids.rb — openproject_despacho: vuelca los ids de la instancia (proyectos, tipos, estados, prioridades, campos y opciones) para los puentes; solo lectura.
#
# sembrar.sh --ids lo corre y guarda el JSON en operaciones/op_ids.json (bridges/op_api.py lo lee).
# Imprime el JSON en una sola línea precedida de __OP_IDS__ para que sembrar.sh la extraiga.
require "json"

ids = {
  "project"  => Project.order(:id).pluck(:identifier, :id).to_h,
  "type"     => Type.order(:id).pluck(:name, :id).to_h,
  "status"   => Status.order(:id).pluck(:name, :id).to_h,
  "priority" => IssuePriority.order(:position).pluck(:name, :id).to_h,
  "cf"       => WorkPackageCustomField.order(:name).pluck(:name, :id).to_h,
  "cf_options" => WorkPackageCustomField.where(field_format: "list").order(:name).each_with_object({}) do |cf, h|
    h[cf.name] = cf.custom_options.order(:position).pluck(:value, :id).to_h
  end,
}
puts "  proyectos #{ids['project'].size} · tipos #{ids['type'].size} · estados #{ids['status'].size} · " \
     "prioridades #{ids['priority'].size} · campos #{ids['cf'].size} (#{ids['cf_options'].size} de lista)"
puts "__OP_IDS__" + JSON.generate(ids)

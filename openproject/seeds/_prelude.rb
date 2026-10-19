# seeds/_prelude.rb — openproject_despacho: cabecera que sembrar.sh antepone a cada seed (perfil, dry run por transacción).
#
# Define para el seed:
#   DRY_RUN  → true si OP_DRY_RUN=1: todo lo que el seed escriba se revierte al salir.
#   PERFIL   → el YAML del despacho (OP_PERFIL_YAML) como Hash; {} si no se pasó.
#   perfil(*claves, defecto: nil) → lectura segura: perfil("despacho", "nombre", defecto: "Despacho").
# La transacción se abre aquí y se cierra en at_exit: commit si el seed terminó bien y no es dry run;
# rollback si es dry run o si el seed abortó (abort/raise). `return` a nivel superior del seed también
# llega al at_exit. Los seeds usan `save!` con transacciones anidadas: se unen a esta.
require "yaml"

DRY_RUN = ENV["OP_DRY_RUN"] == "1"
PERFIL  = begin
  texto = ENV["OP_PERFIL_YAML"].to_s
  texto.strip.empty? ? {} : (YAML.safe_load(texto, aliases: true) || {})
rescue => e
  abort "❌ perfil YAML inválido: #{e.class} #{e.message}"
end

def perfil(*claves, defecto: nil)
  claves.reduce(PERFIL) { |h, k| h.is_a?(Hash) ? h[k.to_s] : nil } || defecto
end

def op_conexion
  ActiveRecord::Base.respond_to?(:lease_connection) ? ActiveRecord::Base.lease_connection : ActiveRecord::Base.connection
end

op_conexion.begin_transaction(joinable: true)
puts DRY_RUN ? "[dry-run] transacción abierta: se revertirá al terminar" : "[aplicar] transacción abierta"

at_exit do
  c = op_conexion
  next unless c.transaction_open?
  fallo = $! && !($!.is_a?(SystemExit) && $!.success?)
  if DRY_RUN
    c.rollback_transaction
    puts "[dry-run] revertido: nada cambió en la instancia"
  elsif fallo
    c.rollback_transaction
    puts "[error] revertido: #{$!.class} #{$!.message}"
  else
    c.commit_transaction
    puts "[aplicado] transacción confirmada"
  end
end

/**
 * ANFITRIÓN WEB — Qillqa atiende los marcadores de Tiqsi web (fase 10.2b de docs/plataforma/propuesta-repositorios.md,
 * 2026-10-20). Los módulos aislados (la Mediateca) importan `api`, `Marco`, `PALETA`, `confirmar`… de
 * `@qillqa/tiqsi`, no de Qillqa; aquí se conectan con lo de Qillqa: su petición con sesión y caché, sus subidas y
 * descargas (a la carpeta recordada), su marco con el menú, su barra de módulo, su ayuda, su visor de PDF, sus
 * diálogos, su paleta (clara u oscura) y su almacén; y lo que solo Qillqa tiene: el mapa de relaciones, elegir cómo
 * llenar con la IA (el prompt de cada formato) y sus servicios por nombre (buscar personas y referencias, los
 * distritos, la ficha de un recibido, el pegado, la cola sin conexión, el aviso breve, si un módulo está encendido;
 * para el chat, los archivos sin red, la actividad, el aviso push, la ficha de una persona y las referencias) y sus
 * piezas por nombre (el avatar con foto, la invitación a los avisos push, los diálogos de Tareas y Agenda; para la Mesa
 * de Partes, la tabla del pegado, las actuaciones del seguimiento y el autocompletado del directorio).
 * Se activa antes de pintar (main.tsx).
 */
import { lazy, type ComponentType } from 'react'
import { activarAnfitrionWeb, type AnfitrionWeb } from '@qillqa/tiqsi'
import { publicarCuenta, registrarApertura } from './actividad'
import { EVENTO_CACHE, api, apiPdf, cerrarSesion, descargarArchivo, descargarBlob, leyendoDeCache, subirArchivo, traerArchivo } from './api'
import { cerrarAvisosDe, pushActivoAqui, resincronizarAvisos } from './avisosPush'
import { avisoBreve } from './avisoBreve'
import { normalizarCuenta, olvidarArchivos } from './cachelecturas'
import { EVENTO_AVISOS } from './componentes/CampanaNotificaciones'
import { avisar, confirmar, pedirTexto } from './componentes/Dialogos'
import { EstadoVacio } from './componentes/Estilo'
import Marco from './componentes/Marco'
import { abrirTarjeta } from './componentes/perfil/fotos'
import { NOMBRE_PREFIJO, PREFIJO_REFERENCIA, rutaVinculo } from '@qillqa/minka/referencias'
import { avisoSiCorresponde, carpetaGuardada, elegirCarpeta, escribirEn, guardarEn, puedeElegirCarpeta } from './descargas'
import { EVENTO_RELACIONES } from './extensiones/consultaReferencias'
import { configOP } from './openproject'
import { moduloActivo } from './modulos'
import { DESDE_MENU } from './navegacion'
import { MODO, PALETA } from './paleta'
import { guardarPreferencia, leerPreferencias, preferenciasInmediatas } from './preferencias'
import { alCambiarCola, cuerpoDe, encolar, encolarEscritura, enEspera, pendientes, sincronizar } from './sinconexion'
import { guardarHandle, guardarMapa, leerHandle, olvidarHandle } from './sync/almacen'
import { construirMapa, olvidarMapaEnMemoria } from './sync/carpetaLocal'

// Diferidos, como cuando cada página los importaba: nada de esto entra al arranque. La barra y la ayuda también: un
// import estático aquí (lo primero que carga main.tsx) evaluaba Box de MUI antes que su tema en el servidor de
// desarrollo (esbuild arma MUI en trozos con inicialización diferida) y la página no abría.
const BarraModulo = lazy(() => import('./componentes/BarraModulo'))
const BotonAyuda = lazy(() => import('./componentes/BotonAyuda'))
const VisorPdf = lazy(() => import('./componentes/VisorPdf'))
const MapaLocal = lazy(() => import('./componentes/grafo/MapaLocal'))
const ElegirEntrada = lazy(() => import('./componentes/ElegirEntrada'))
// Piezas para los módulos aislados (Rimay R4): el avatar con foto, la invitación a los avisos push y los diálogos de
// Tareas y Agenda (su superficie pública), también diferidos.
const AvatarPersona = lazy(() => import('./componentes/perfil/AvatarPersona'))
const InvitacionAvisos = lazy(() => import('./componentes/InvitacionAvisos'))
// Para la Mesa de Partes (Punku P4): la tabla de lo pegado, las actuaciones y el autocompletado del directorio.
const PegarResultado = lazy(() => import('./componentes/PegarResultado'))
const Actuaciones = lazy(() => import('./componentes/seguimiento/Actuaciones'))
const AutocompletadoDirectorio = lazy(() => import('./componentes/AutocompletadoDirectorio'))
// Para Gestión documental, Proyectos de ley y la Semana (Qillqasqa Q6b-2e): agregar al directorio, los botones del
// prompt, quién más está, la mesa de partes virtual, OpenProject, el visor completo y la Mediateca.
const nombrada = <M extends Record<string, unknown>>(cargar: () => Promise<M>, k: keyof M) =>
  lazy(() => cargar().then((m) => ({ default: m[k] as unknown as ComponentType<any> })))
const DialogoAgregarDirectorio = nombrada(() => import('./componentes/AutocompletadoDirectorio'), 'DialogoAgregarDirectorio')
const BotonesPrompt = lazy(() => import('./componentes/BotonesPrompt'))
const EquipoEnLinea = lazy(() => import('./componentes/EquipoEnLinea'))
const DialogoMesaDePartes = nombrada(() => import('./componentes/MesaDePartes'), 'DialogoMesaDePartes')
const BotonOpenProject = nombrada(() => import('./componentes/OpenProject'), 'BotonOpenProject')
const VisorAvanzado = lazy(() => import('./componentes/VisorAvanzado'))
const SelectorMediateca = nombrada(() => import('@qillqa/rikchay/publico'), 'Selector')
const deTareas = <K extends 'DialogoTarea' | 'DialogoEvento' | 'DialogoPegarTareas' | 'DialogoPegarAgenda' | 'BotonAgendaDocumento'>(k: K) =>
  lazy(() => import('@qillqa/minka/publico').then((m) => ({ default: m[k] as unknown as ComponentType<any> })))

activarAnfitrionWeb({
  nombre: 'Qillqa',
  api,
  token: () => localStorage.getItem('qillqa_token'),
  rol: () => localStorage.getItem('qillqa_rol') ?? '',
  cerrarSesion,
  confirmar,
  avisar,
  pedirTexto,
  subirArchivo,
  descargarBlob,
  descargarArchivo,
  // El Marco de Qillqa tipa `modulo` con sus ids (IdModulo); el contrato, con texto: el módulo pasa el suyo.
  Marco: Marco as unknown as AnfitrionWeb['Marco'],
  EstadoVacio,
  BarraModulo,
  BotonAyuda,
  VisorPdf: VisorPdf as unknown as AnfitrionWeb['VisorPdf'],
  opcionales: {
    MapaLocal,
    ElegirEntrada: ElegirEntrada as unknown as NonNullable<AnfitrionWeb['opcionales']>['ElegirEntrada'],
    relacionesCambiaron: (foco) => window.dispatchEvent(new CustomEvent(EVENTO_RELACIONES, { detail: { foco } })),
  },
  // Por nombre, como las capacidades del backend: el módulo pide lo que aprovecha y, sin él (solo), no lo ofrece.
  servicios: {
    'personas.buscar': (q: string, limite = 20) =>
      api(`/api/directorio/personas?q=${encodeURIComponent(q)}&limite=${limite}`),
    'referencias.buscar': (q: string, contexto = '') =>
      api(`/api/referencias/buscar?q=${encodeURIComponent(q)}&contexto=${encodeURIComponent(contexto)}`),
    'territorio.distritos': () => api('/api/territorio/distritos'),
    'recibidos.ficha': (id: number | string) => api(`/api/entradas/${id}`),
    'pegado.registrar': async (datos: Parameters<typeof import('./pegar').registrarPegado>[0]) =>
      (await import('./pegar')).registrarPegado(datos),
    'chat.texto_de_mensaje': async (mid: number | string) => (await import('./pegar')).textoDeMensaje(mid),
    'sinconexion.encolar': encolarEscritura,
    'sinconexion.en_espera': enEspera,
    'sinconexion.al_cambiar': alCambiarCola,
    'sinconexion.cuerpo': cuerpoDe,
    'avisos.breve': avisoBreve,
    'modulos.activo': moduloActivo,
    // Lo que pide el chat (Rimay R4): sus archivos guardados para verlos sin red, la actividad del encabezado, cómo
    // navegar «desde el menú», recargar la campana, el aviso push de este dispositivo, la ficha de una persona y a
    // dónde lleva una referencia (el vocabulario de Tareas y Agenda).
    'archivos.traer': traerArchivo,
    'actividad.publicar_cuenta': publicarCuenta,
    'actividad.registrar_apertura': registrarApertura,
    'navegacion.desde_menu': () => DESDE_MENU,
    'avisos.recargar': () => window.dispatchEvent(new Event(EVENTO_AVISOS)),
    'push.activo_aqui': pushActivoAqui,
    'push.resincronizar': resincronizarAvisos,
    'push.cerrar_de': cerrarAvisosDe,
    'personas.abrir_tarjeta': abrirTarjeta,
    'referencias.ruta': rutaVinculo,
    'referencias.prefijos': () => ({ PREFIJO_REFERENCIA, NOMBRE_PREFIJO }),
    // Lo que pide la Mesa de Partes (Punku P4): proponer en la Agenda el evento que anuncia un recibido, o vincular el
    // que ya existe (la API de Tareas y Agenda, que Qillqa monta).
    'agenda.proponer_evento': (ev: Record<string, unknown>, destino: string) =>
      api('/api/agenda/eventos', { method: 'POST', body: JSON.stringify({ ...ev, estado: 'propuesto', participantes: [], vinculos: [destino], participa: undefined, recordatorio_minutos: undefined }) }),
    'documentos.buscar_vinculo': (q: string) => api(`/api/documentos/buscar-vinculo?q=${encodeURIComponent(q)}`),
    'agenda.vincular_evento': (id: number, destino: string) =>
      api(`/api/agenda/eventos/${id}/vincular`, { method: 'POST', body: JSON.stringify({ destino }) }),
    // Lo que pide Gestión documental (Qillqasqa Q6b-2d): el PDF también sin red, la cola sin conexión entera, la
    // carpeta recordada para exportar en lote, «hacerlo al volver», la carpeta sincronizada (el mapa con que se abre sin
    // red), las preferencias de la cuenta y copiar una hoja del PDF como imagen (pdf.js, diferido).
    'archivos.pdf': apiPdf,
    'sinconexion.leyendo_de_cache': leyendoDeCache,
    'sinconexion.al_cambiar_cache': (fn: () => void) => {
      window.addEventListener(EVENTO_CACHE, fn)
      return () => window.removeEventListener(EVENTO_CACHE, fn)
    },
    'sinconexion.encolar_documento': encolar,
    'sinconexion.pendientes': pendientes,
    'sinconexion.sincronizar': sincronizar,
    'descargas.aviso': avisoSiCorresponde,
    'descargas.puede_elegir_carpeta': puedeElegirCarpeta,
    'descargas.carpeta_guardada': carpetaGuardada,
    'descargas.elegir_carpeta': elegirCarpeta,
    'descargas.escribir_en': escribirEn,
    'descargas.guardar_en': guardarEn,
    // Diferido: AvisoAlVolver trae MUI y, estático aquí, se evaluaba antes que su tema (la página no abría).
    'alvolver.ofrecer': async (tipo: Parameters<typeof import('./componentes/AvisoAlVolver').ofrecerAlVolver>[0], rotulo: string, ruta: string) =>
      (await import('./componentes/AvisoAlVolver')).ofrecerAlVolver(tipo, rotulo, ruta),
    'carpeta_local.recordar': async (carpeta: string, items: { ruta: string; version: string; url: string }[], presentes: Set<string>) => {
      const archivos = construirMapa(items, presentes)
      await guardarMapa({ cuenta: normalizarCuenta(localStorage.getItem('qillqa_usuario')), carpeta, hecho_en: Date.now(), archivos })
      olvidarMapaEnMemoria()
      await olvidarArchivos(Object.keys(archivos))
    },
    'carpeta_local.olvidar': olvidarMapaEnMemoria,
    'preferencias.leer': leerPreferencias,
    'preferencias.inmediatas': preferenciasInmediatas,
    'preferencias.guardar': guardarPreferencia,
    'copiar.pagina_imagen': async (ruta: string) => (await import('./copiar')).copiarPaginaComoImagen(ruta),
    'copiar.archivo_imagen': async (ruta: string) => (await import('./copiar')).copiarArchivoImagen(ruta),
    'copiar.traer_pagina_imagen': async (ruta: string) => (await import('./copiar')).traerPaginaComoImagen(ruta),
    'copiar.texto_con_formato': async (html: string, texto: string) => (await import('./copiar')).copiarTextoConFormato(html, texto),
    // Q6b-2e: el directorio (buscar un nombre exacto, corregir un registro), el latido de la presencia (adopta el rol
    // si el administrador lo cambió), el enlace de OpenProject y las imágenes protegidas de la Mediateca (con su caché).
    'directorio.buscar_exacto': async (nombre: string) => (await import('./componentes/AutocompletadoDirectorio')).buscarExacto(nombre),
    'directorio.actualizar': async (...a: Parameters<typeof import('./componentes/AutocompletadoDirectorio').actualizarEnDirectorio>) =>
      (await import('./componentes/AutocompletadoDirectorio')).actualizarEnDirectorio(...a),
    'presencia.latir': async (datos: Record<string, unknown>) => {
      const lista = await api<{ yo: boolean; rol: string }[]>('/api/presencia', { method: 'POST', body: JSON.stringify(datos) })
      const yo = lista.find((x) => x.yo)
      if (yo?.rol && localStorage.getItem('qillqa_rol') !== yo.rol) localStorage.setItem('qillqa_rol', yo.rol)
      return lista
    },
    'openproject.enlace': async (clave: string) => {
      if (!(await configOP()).activa) return ''
      return (await api<{ url: string }>(`/api/openproject/enlace?clave=${encodeURIComponent(clave)}`)).url
    },
    // Qillqa tiene servidor de edición simultánea (/colab, web/colab/servidor.ts de Qillqasqa).
    'colab.disponible': () => true,
    'mediateca.traer_imagen': async (ruta: string) => (await import('@qillqa/rikchay/publico')).traerImagen(ruta),
  },
  piezas: {
    'personas.Avatar': AvatarPersona,
    'push.Invitacion': InvitacionAvisos,
    'tareas.DialogoTarea': deTareas('DialogoTarea'),
    'tareas.DialogoEvento': deTareas('DialogoEvento'),
    'tareas.DialogoPegarTareas': deTareas('DialogoPegarTareas'),
    'tareas.DialogoPegarAgenda': deTareas('DialogoPegarAgenda'),
    'pegado.Resultado': PegarResultado,
    'seguimiento.Actuaciones': Actuaciones,
    'directorio.Autocompletado': AutocompletadoDirectorio,
    'directorio.DialogoAgregar': DialogoAgregarDirectorio,
    'pegado.BotonesPrompt': BotonesPrompt,
    'presencia.Equipo': EquipoEnLinea,
    'mesa.Dialogo': DialogoMesaDePartes,
    'openproject.Boton': BotonOpenProject,
    'visor.Avanzado': VisorAvanzado,
    'mediateca.Selector': SelectorMediateca,
    'tareas.BotonAgendaDocumento': deTareas('BotonAgendaDocumento'),
  },
  paleta: PALETA as unknown as Record<string, string>,
  modo: MODO,
  almacen: { guardarHandle, leerHandle, olvidarHandle },
})

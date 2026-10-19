import { Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { iniciarUso, registrarVista } from './uso'
import PantallaCarga from './componentes/PantallaCarga'
import { cargarPagina } from './arranque'
import ConModulo from './componentes/ConModulo'
import { enMarco } from './vista'

// Cada página es un trozo propio (2026-10-13, «carga muy lento»): el primer acceso baja solo lo
// común (React, MUI, el marco) y la página que se abre; el resto llega al entrar en ella, y el
// service worker lo guarda todo por detrás para abrir sin red (vite.publicacion.ts, public/sw.js).
const Login = cargarPagina(() => import('./paginas/Login'))
const CambiarClave = cargarPagina(() => import('./paginas/CambiarClave'))
const Bandeja = cargarPagina(() => import('./paginas/Bandeja'))
const AbrirDocumento = cargarPagina(() => import('./paginas/AbrirDocumento'))
const PanelAdmin = cargarPagina(() => import('./paginas/PanelAdmin'))
const Sincronizar = cargarPagina(() => import('./paginas/Sincronizar'))
const Directorio = cargarPagina(() => import('./paginas/Directorio'))
const MesasDePartes = cargarPagina(() => import('./paginas/MesasDePartes'))
const FormatoWord = cargarPagina(() => import('./paginas/FormatoWord'))
const ProyectoWord = cargarPagina(() => import('./paginas/ProyectoWord'))
const Contrasenas = cargarPagina(() => import('./paginas/Contrasenas'))
const Estadisticas = cargarPagina(() => import('./paginas/Estadisticas'))
const Inicio = cargarPagina(() => import('./paginas/Inicio'))
const Proyectos = cargarPagina(() => import('./paginas/Proyectos'))
const Proyecto = cargarPagina(() => import('./paginas/Proyecto'))
const InformesSR = cargarPagina(() => import('./paginas/InformesSR'))
const SemanaSR = cargarPagina(() => import('./paginas/SemanaSR'))
const Rendiciones = cargarPagina(() => import('./paginas/Rendiciones'))
const Rendicion = cargarPagina(() => import('./paginas/Rendicion'))
const Observatorio = cargarPagina(() => import('./paginas/Observatorio'))
const Mapa = cargarPagina(() => import('./paginas/Mapa'))
const Fototeca = cargarPagina(() => import('./paginas/Fototeca'))
const Prensa = cargarPagina(() => import('./paginas/Prensa'))
const Entradas = cargarPagina(() => import('./paginas/Entradas'))
const Tareas = cargarPagina(() => import('./paginas/Tareas'))
const Agenda = cargarPagina(() => import('./paginas/Agenda'))
const Chat = cargarPagina(() => import('./paginas/Chat'))
const Perfil = cargarPagina(() => import('./paginas/Perfil'))
const MesaVirtual = cargarPagina(() => import('./paginas/MesaVirtual'))
const Bienvenida = cargarPagina(() => import('./paginas/Bienvenida'))

// Las guardas son COMPONENTES y leen la sesión al renderizarse, en cada
// navegación. Antes la ruta /clave decidía con una expresión evaluada al
// montar <App>: tras el primer inicio de sesión, `navegar('/clave')` encontraba
// la decisión tomada SIN token y devolvía al login; solo un refresco la
// recalculaba (Edison 2026-10-01: «a veces hay que refrescar la página para
// que aparezca el cambio de contraseña»).
const conToken = () => Boolean(localStorage.getItem('sgdp_token'))
const claveTemporal = () => localStorage.getItem('sgdp_clave_temporal') === 'si'
// Datos al primer ingreso (2026-10-18): después de la contraseña, el paso de bienvenida.
const datosPendientes = () => localStorage.getItem('sgdp_datos_pendientes') === 'si'

function ConSesion({ children }: { children: React.ReactElement }) {
  if (!conToken()) return <Navigate to="/login" replace />
  // Con clave temporal no hay nada que hacer fuera del cambio de contraseña:
  // se va directo, sin cargar la bandeja para que el servidor responda 428.
  if (claveTemporal()) return <Navigate to="/clave" replace />
  if (datosPendientes()) return <Navigate to="/bienvenida" replace />
  return children
}

function SoloConToken({ children }: { children: React.ReactElement }) {
  return conToken() ? children : <Navigate to="/login" replace />
}

// Además de sesión, exige rol administrador (la protección REAL está en
// el backend; esto solo evita mostrar el panel a quien no corresponde).
function SoloAdmin({ children }: { children: React.ReactElement }) {
  if (!conToken()) return <Navigate to="/login" replace />
  if (claveTemporal()) return <Navigate to="/clave" replace />
  if (datosPendientes()) return <Navigate to="/bienvenida" replace />
  if (localStorage.getItem('sgdp_rol') !== 'administrador') return <Navigate to="/" replace />
  return children
}

/** Dentro del marco de la vista elegida (componentes/MarcoVista.tsx), la dirección y el título de la
 *  ventana de afuera siguen a la página de adentro. */
/** Estadísticas de uso (2026-10-19): cada cambio de ruta es una vista (src/uso.ts; sin contenido). */
function RegistrarUso() {
  const { pathname } = useLocation()
  useEffect(() => { iniciarUso(); registrarVista(pathname) }, [pathname])
  return null
}

function SeguirRuta() {
  const { pathname, search, hash } = useLocation()
  useEffect(() => {
    if (!enMarco()) return
    try {
      window.parent.history.replaceState(null, '', pathname + search + hash)
      const t = window.setTimeout(() => { window.parent.document.title = document.title }, 300)
      return () => window.clearTimeout(t)
    } catch {
      /* otro origen: no se toca */
    }
  }, [pathname, search, hash])
  return null
}

export default function App() {
  return (
    // v7_startTransition: al cambiar de página se queda la anterior a la vista hasta que llega el
    // trozo de la nueva (sin pantallazo en blanco); la línea de carga solo se ve al abrir en frío.
    <BrowserRouter future={{ v7_startTransition: true }}>
      {/* Mientras llega el trozo de la primera página, la pantalla de carga de index.html. */}
      <SeguirRuta />
      <RegistrarUso />
      <Suspense fallback={<PantallaCarga />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Cambio de contraseña: con sesión, pero SIN pasar por ConSesion en
            modo obligatorio — es justo la pantalla que debe funcionar cuando
            el resto del sistema está bloqueado por la clave temporal. */}
        <Route
          path="/clave"
          element={
            <SoloConToken>
              <CambiarClave />
            </SoloConToken>
          }
        />
        {/* Bienvenida (2026-10-18): la persona confirma sus datos la primera vez que entra; con la
            contraseña ya elegida (si sigue temporal, primero /clave). */}
        <Route
          path="/bienvenida"
          element={
            <SoloConToken>
              {claveTemporal() ? <Navigate to="/clave" replace /> : <Bienvenida />}
            </SoloConToken>
          }
        />
        {/* La entrada es el MENÚ PRINCIPAL (Edison 2026-10-01: «lo primero
            que deben ver es el menú principal, no la gestión documental»). */}
        <Route path="/" element={<ConSesion><Inicio /></ConSesion>} />
        <Route
          path="/documentos"
          element={
            <ConSesion>
              <Bandeja />
            </ConSesion>
          }
        />
        {/* Formato Word (2026-10-19): varios documentos en un espacio de trabajo, cada uno con su registro. */}
        <Route path="/documentos/word" element={<ConSesion><FormatoWord /></ConSesion>} />
        <Route
          path="/documentos/:id"
          element={
            <ConSesion>
              <AbrirDocumento />
            </ConSesion>
          }
        />
        <Route
          path="/sincronizar"
          element={
            <ConSesion>
              <Sincronizar />
            </ConSesion>
          }
        />
        <Route
          path="/estadisticas"
          element={
            <ConSesion>
              <Estadisticas />
            </ConSesion>
          }
        />
        <Route
          path="/directorio"
          element={
            <ConSesion>
              <Directorio />
            </ConSesion>
          }
        />
        {/* Datos del titular y accesos de las mesas de partes (2026-10-08). */}
        <Route path="/mesas-de-partes" element={<ConSesion><MesasDePartes /></ConSesion>} />
        {/* Módulo Contraseñas (2026-10-08). */}
        <Route path="/contrasenas" element={<ConSesion><ConModulo id="contrasenas"><Contrasenas /></ConModulo></ConSesion>} />
        <Route
          path="/admin"
          element={
            <SoloAdmin>
              <PanelAdmin />
            </SoloAdmin>
          }
        />
        {/* Plataforma (piloto 2026-10-01): una puerta común y los proyectos. */}
        {/* /inicio era la puerta común antes de ser la entrada: se conserva. */}
        <Route path="/inicio" element={<Navigate to="/" replace />} />
        <Route path="/proyectos" element={<ConSesion><ConModulo id="proyectos"><Proyectos /></ConModulo></ConSesion>} />
        <Route path="/proyectos/:id" element={<ConSesion><ConModulo id="proyectos"><Proyecto /></ConModulo></ConSesion>} />
        {/* Formato Word del proyecto (2026-10-19): todas sus partes como un documento largo. */}
        <Route path="/proyectos/:id/word" element={<ConSesion><ConModulo id="proyectos"><ProyectoWord /></ConModulo></ConSesion>} />
        <Route path="/informes" element={<ConSesion><ConModulo id="representacion"><InformesSR /></ConModulo></ConSesion>} />
        <Route path="/informes/:id" element={<ConSesion><ConModulo id="representacion"><SemanaSR /></ConModulo></ConSesion>} />
        {/* Rendición de cuentas de viáticos (2026-10-18). */}
        <Route path="/rendiciones" element={<ConSesion><ConModulo id="rendicion"><Rendiciones /></ConModulo></ConSesion>} />
        <Route path="/rendiciones/:id" element={<ConSesion><ConModulo id="rendicion"><Rendicion /></ConModulo></ConSesion>} />
        <Route path="/observatorio" element={<ConSesion><ConModulo id="observatorio"><Observatorio /></ConModulo></ConSesion>} />
        <Route path="/mapa" element={<ConSesion><ConModulo id="mapa"><Mapa /></ConModulo></ConSesion>} />
        <Route path="/fototeca" element={<ConSesion><ConModulo id="fototeca"><Fototeca /></ConModulo></ConSesion>} />
        <Route path="/prensa" element={<ConSesion><ConModulo id="prensa"><Prensa /></ConModulo></ConSesion>} />
        {/* Bandeja de entrada (2026-10-06): documentos recibidos. */}
        <Route path="/recibidos" element={<ConSesion><ConModulo id="recibidos"><Entradas /></ConModulo></ConSesion>} />
        {/* Tareas y Agenda (2026-10-06): módulo propio; OpenProject, espejo opcional. */}
        <Route path="/tareas" element={<ConSesion><ConModulo id="tareas"><Tareas /></ConModulo></ConSesion>} />
        <Route path="/agenda" element={<ConSesion><ConModulo id="tareas"><Agenda /></ConModulo></ConSesion>} />
        {/* Chat del equipo (2026-10-12, fase 8.3): ?canal=N, ?directo=UID, ?mensaje=M. */}
        <Route path="/chat" element={<ConSesion><ConModulo id="chat"><Chat /></ConModulo></ConSesion>} />
        {/* Mi perfil (2026-10-12): foto, datos de contacto e «Info»; la contraseña sigue en /clave. */}
        <Route path="/perfil" element={<ConSesion><Perfil /></ConSesion>} />
        {/* Mesa de partes virtual (2026-10-12): PÚBLICA, sin sesión — quien envía documentos al
            despacho no tiene cuenta (backend/app/api/mesa_publica.py). */}
        <Route path="/mesa-de-partes/*" element={<MesaVirtual />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

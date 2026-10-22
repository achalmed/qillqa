import { Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { iniciarUso, registrarVista } from './uso'
import PantallaCarga from './componentes/PantallaCarga'
import { cargarPagina } from './arranque'
import { MEDIATECA } from '@qillqa/rikchay/modulo'
import { RENDICION } from '@qillqa/yupay/modulo'
import { MINKA } from '@qillqa/minka/modulo'
import { RIMAY } from '@qillqa/rimay/modulo'
import { PUNKU } from '@qillqa/punku/modulo'
import { QHAWANA } from '@qillqa/qhawana/modulo'
import { WAYRA } from '@qillqa/wayra/modulo'
import { DOCUMENTOS, PROYECTOS, REPRESENTACION } from '@qillqa/qillqasqa/modulo'
import ConModulo from './componentes/ConModulo'
import type { IdModulo } from './navegacion'
import { enMarco } from './vista'

// Cada página es un trozo propio (2026-10-13, «carga muy lento»): el primer acceso baja solo lo
// común (React, MUI, el marco) y la página que se abre; el resto llega al entrar en ella, y el
// service worker lo guarda todo por detrás para abrir sin red (vite.publicacion.ts, public/sw.js).
/** Los módulos que entran por su manifiesto web (Tiqsi). La pantalla se carga con el cargador de Qillqa. */
const MODULOS_WEB = [DOCUMENTOS, PROYECTOS, REPRESENTACION, MEDIATECA, RENDICION, MINKA, RIMAY, PUNKU, QHAWANA, WAYRA]
// Cada pantalla de cada módulo (la principal y las de su lista `pantallas`), con la ruta que declara.
const PANTALLAS_WEB = MODULOS_WEB.flatMap((modulo) => [
  { modulo, ruta: modulo.ruta, Pantalla: cargarPagina(modulo.cargar) },
  ...(modulo.pantallas ?? []).map((p) => ({ modulo, ruta: p.ruta, Pantalla: cargarPagina(p.cargar) })),
])
// Sus pantallas públicas (sin sesión ni marco: la mesa de partes virtual de la Mesa de Partes).
const PUBLICAS_WEB = MODULOS_WEB.flatMap((modulo) => (modulo.publicas ?? []).map((p) => ({ ruta: p.ruta, Pantalla: cargarPagina(p.cargar) })))

const Login = cargarPagina(() => import('./paginas/Login'))
const CambiarClave = cargarPagina(() => import('./paginas/CambiarClave'))
const PanelAdmin = cargarPagina(() => import('./paginas/PanelAdmin'))
const Directorio = cargarPagina(() => import('./paginas/Directorio'))
const MesasDePartes = cargarPagina(() => import('./paginas/MesasDePartes'))
const Contrasenas = cargarPagina(() => import('./paginas/Contrasenas'))
const Inicio = cargarPagina(() => import('./paginas/Inicio'))
const Mapa = cargarPagina(() => import('./paginas/Mapa'))
const Prensa = cargarPagina(() => import('./paginas/Prensa'))
const Perfil = cargarPagina(() => import('./paginas/Perfil'))
const Bienvenida = cargarPagina(() => import('./paginas/Bienvenida'))

// Las guardas son COMPONENTES y leen la sesión al renderizarse, en cada
// navegación. Antes la ruta /clave decidía con una expresión evaluada al
// montar <App>: tras el primer inicio de sesión, `navegar('/clave')` encontraba
// la decisión tomada SIN token y devolvía al login; solo un refresco la
// recalculaba (Edison 2026-10-01: «a veces hay que refrescar la página para
// que aparezca el cambio de contraseña»).
const conToken = () => Boolean(localStorage.getItem('qillqa_token'))
const claveTemporal = () => localStorage.getItem('qillqa_clave_temporal') === 'si'
// Datos al primer ingreso (2026-10-18): después de la contraseña, el paso de bienvenida.
const datosPendientes = () => localStorage.getItem('qillqa_datos_pendientes') === 'si'

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
  if (localStorage.getItem('qillqa_rol') !== 'administrador') return <Navigate to="/" replace />
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
    // React Router 7 envuelve cada navegación en startTransition (en la 6 era v7_startTransition): al
    // cambiar de página se queda la anterior a la vista hasta que llega el trozo de la nueva (sin
    // pantallazo en blanco); la línea de carga solo se ve al abrir en frío.
    <BrowserRouter>
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
        <Route path="/mapa" element={<ConSesion><ConModulo id="mapa"><Mapa /></ConModulo></ConSesion>} />
        {/* Los módulos aislados (Tiqsi web): su ruta y su pantalla las declara su manifiesto, siempre con sesión y
            con su interruptor de Administración (fase 10.2b). */}
        {PANTALLAS_WEB.map(({ modulo, ruta, Pantalla }) => (
          <Route key={ruta} path={ruta} element={<ConSesion><ConModulo id={modulo.id as IdModulo}><Pantalla /></ConModulo></ConSesion>} />
        ))}
        <Route path="/prensa" element={<ConSesion><ConModulo id="prensa"><Prensa /></ConModulo></ConSesion>} />
        {/* Gestión documental, Proyectos de ley y la Semana (Qillqasqa) entran por su manifiesto:
            el manifiesto web de Qillqasqa, @qillqa/qillqasqa/modulo (MODULOS_WEB, Q6b-3). */}
        {/* La Mesa de Partes (Punku) entra por su manifiesto: componentes/entradas/modulo.ts (MODULOS_WEB). */}
        {/* Tareas y Agenda (Minka) entra por su manifiesto: @qillqa/minka/modulo (MODULOS_WEB). */}
        {/* El chat (Rimay) entra por su manifiesto: componentes/chat/modulo.ts (MODULOS_WEB). */}
        {/* Mi perfil (2026-10-12): foto, datos de contacto e «Info»; la contraseña sigue en /clave. */}
        <Route path="/perfil" element={<ConSesion><Perfil /></ConSesion>} />
        {/* Las pantallas PÚBLICAS de los módulos, sin sesión: la mesa de partes virtual (2026-10-12; Punku P4) —quien
            envía documentos a la entidad no tiene cuenta (backend/app/api/mesa_publica.py). */}
        {PUBLICAS_WEB.map(({ ruta, Pantalla }) => <Route key={ruta} path={ruta} element={<Pantalla />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

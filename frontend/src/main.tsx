// Primero: los módulos aislados (Tiqsi web) piden su anfitrión al importarse (fase 10.2b).
import './anfitrionWeb'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import { DialogosSistema } from './componentes/Dialogos'
import { tema } from './theme'
import { registrarServiceWorker } from './sinconexion'
import { marcarMontada, vigilarTrozos } from './arranque'
import MarcoVista from './componentes/MarcoVista'
import { enMarco, leerVista } from './vista'

// Modo sin conexión: guarda la aplicación en el equipo para que abra aunque
// el servidor no responda. Solo en el build; con el servidor de desarrollo se
// omite (ver sinconexion.ts).
registrarServiceWorker()
// Un trozo que ya no existe (otra publicación) recarga una vez en vez de dejar la página en blanco.
vigilarTrozos()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={tema}>
      {/* enableColorScheme: el navegador pinta sus controles y barras según el modo (apariencia.ts). */}
      <CssBaseline enableColorScheme />
      {/* Vista elegida (2026-10-18): la ventana de afuera pone el marco y el sistema va dentro; la
          página pública de la mesa de partes nunca va enmarcada. */}
      {!enMarco() && leerVista() !== 'auto' && !window.location.pathname.startsWith('/mesa-de-partes') ? (
        <MarcoVista sinMarco={<><App /><DialogosSistema /></>} />
      ) : (
        <>
          <App />
          <DialogosSistema />
        </>
      )}
    </ThemeProvider>
  </StrictMode>,
)
// El vigía de index.html deja de esperar: el JS llegó y React ya tiene la página.
marcarMontada()

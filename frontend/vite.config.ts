import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { publicacionSegura, servirAssets, trozos } from './vite.publicacion'

// «Acerca de Qillqa» (2026-10-19, src/acercaDe.ts): la versión, el commit y las bibliotecas de la web
// se fijan al construir. La versión es la INSTALADA (node_modules), no el rango del package.json.
const BIBLIOTECAS: [string, string][] = [
  ['React', 'react'], ['MUI', '@mui/material'], ['React Router', 'react-router'], ['Tiptap', '@tiptap/core'],
  ['Yjs', 'yjs'], ['Hocuspocus', '@hocuspocus/provider'], ['pdf.js', 'pdfjs-dist'], ['Vite', 'vite'], ['TypeScript', 'typescript'],
]
const versionDe = (paquete: string) => {
  try { return JSON.parse(readFileSync(`node_modules/${paquete}/package.json`, 'utf8')).version as string } catch { return null }
}
const git = (formato: string) => {
  try { return execSync(`git log -1 --format=${formato}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null } catch { return null }
}
const CONSTRUCCION = {
  version: JSON.parse(readFileSync('package.json', 'utf8')).version as string,
  commit: git('%h'),
  fechaCommit: git('%cI'),
  construida: new Date().toISOString(),
  bibliotecas: [['Node.js', process.versions.node], ...BIBLIOTECAS.map(([n, p]) => [n, versionDe(p)])],
}

// El proxy hace que el navegador hable con /api sin conocer al backend.
// Dentro de Docker, "api" es el nombre del servicio FastAPI; fuera de
// Docker (desarrollo directo) se puede apuntar a localhost con
// VITE_API_PROXY=http://127.0.0.1:8000
//
// /api lleva también el WebSocket del chat (/api/chat/ws, fase 8): `ws: true`.
//
// /colab es el WebSocket de la edición simultánea (fase 5; su servidor, web/colab/servidor.ts de Qillqasqa).
// Pasa por el MISMO puerto de la web: así el enlace público de Tailscale, que
// solo publica el 5173, lo lleva sin configurar nada más. VITE_COLAB_PROXY lo
// cambia (la instancia de prueba usa ws://127.0.0.1:8011).
//
// Los editores de Prensa (Awana, Tullpu, Kuyuy) viven bajo /api (su carpeta y su cookie): el proxy /estudio del
// estudio aparte se retiró en E5 (2026-10-21).
//
// IP real (mesa de partes virtual, 2026-10-12): el proxy AÑADE a X-Forwarded-For la IP de quien
// le habla. La API (uvicorn, que confía en 127.0.0.1) lee esa cabecera de derecha a izquierda:
// así el límite de envíos por IP de la página pública ve la IP real y no 127.0.0.1, y lo que un
// cliente escriba a mano en la cabecera queda a la izquierda, donde no cuenta. Solo esa cabecera:
// `xfwd` de http-proxy pondría también X-Forwarded-Proto y la uniría a la del túnel
// («https,http»), que uvicorn tomaría como esquema.
type PeticionProxy = { setHeader: (k: string, v: string) => void }
type Entrante = { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }
const anadirIp = (proxy: { on: (ev: 'proxyReq', fn: (p: PeticionProxy, r: Entrante) => void) => void }) => {
  proxy.on('proxyReq', (peticion, entrante) => {
    const ip = (entrante.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
    if (!ip) return
    const previa = entrante.headers['x-forwarded-for']
    const lista = Array.isArray(previa) ? previa.join(', ') : previa
    peticion.setHeader('x-forwarded-for', lista ? `${lista}, ${ip}` : ip)
  })
}
const proxyApi = {
  '/api': {
    target: process.env.VITE_API_PROXY ?? 'http://api:8000',
    changeOrigin: true,
    ws: true,
    configure: anadirIp,
  },
  '/colab': {
    target: process.env.VITE_COLAB_PROXY ?? 'ws://127.0.0.1:8001',
    ws: true,
    changeOrigin: true,
  },
}

// Lo que importan los proyectos enlazados (@qillqa/tiqsi, @qillqa/rikchay…): con `preserveSymlinks` el servidor de
// desarrollo los trata como dependencias y no preempaqueta lo que ellos importan; un módulo de MUI que Qillqa no usa
// llegaba crudo y la página no abría («prop-types does not provide an export named 'default'»). Se le dan aquí.
function enlazados(): string[] {
  try {
    return readdirSync('node_modules/@qillqa').map((p) => `@qillqa/${p}`)
  } catch {
    return []
  }
}

function importadosPorLosEnlazados(): string[] {
  const salida = new Set<string>()
  const raiz = 'node_modules/@qillqa'
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = `${dir}/${nombre}`
      if (nombre === 'node_modules' || nombre === 'dist') continue
      if (statSync(ruta).isDirectory()) recorrer(ruta)
      else if (/\.(ts|tsx)$/.test(nombre)) {
        // Todo lo de npm que importan (MUI, leaflet, y desde Qillqasqa el editor: TipTap, Yjs, Hocuspocus), salvo los otros
        // enlazados y lo de Node: un paquete CommonJS sin preempaquetar no abre («does not provide an export named…»).
        for (const m of readFileSync(ruta, 'utf8').matchAll(/from '([^'.][^']*)'/g)) {
          if (!m[1].startsWith('@qillqa/') && !m[1].startsWith('node:')) salida.add(m[1])
        }
      }
    }
  }
  try {
    for (const paquete of readdirSync(raiz)) recorrer(`${raiz}/${paquete}/src`)
  } catch {
    /* sin paquetes enlazados */
  }
  return [...salida].sort()
}

export default defineConfig({
  plugins: [react(), publicacionSegura(), servirAssets()],
  define: { __QILLQA__: JSON.stringify(CONSTRUCCION) },
  // Los proyectos de la plataforma se instalan desde su carpeta hermana (fase 10.2b: @qillqa/tiqsi). Sin seguir el
  // enlace, sus importaciones de React y MUI se resuelven aquí: una sola copia de React para todos.
  resolve: { preserveSymlinks: true },
  // Los enlazados son CÓDIGO, no dependencias: preempaquetados, cada uno traía su propia copia de Tiqsi (con su anfitrión
  // sin activar: «no hay anfitrión activo»). Se excluyen; lo que ellos importan, sí se preempaqueta.
  optimizeDeps: { exclude: enlazados(), include: importadosPorLosEnlazados() },
  // Publicar sin dejar a nadie en blanco (2026-10-13, ver vite.publicacion.ts): el build NO vacía
  // dist/ (las pestañas abiertas siguen encontrando sus trozos viejos), y el index.html y el
  // service worker se escriben al final, de golpe, cuando todo lo que nombran ya está en disco.
  build: {
    emptyOutDir: false,
    copyPublicDir: false,
    // El aviso de 500 kB ya no aplica: pdf.js y su worker son grandes por sí solos y se cargan
    // solo al abrir un PDF.
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: trozos } },
  },
  // `vite preview` sirve el BUILD, que es lo que usa el despacho: el service
  // worker (modo sin conexión) no convive con el servidor de desarrollo, que
  // entrega cada módulo por separado y recarga en caliente. Necesita el mismo
  // proxy que `dev` para que /api siga funcionando.
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: proxyApi,
  },
  server: {
    host: true,
    port: 5173,
    // Aceptar el dominio del túnel Cloudflare (acceso remoto) además de
    // localhost y la red local.
    allowedHosts: true,
    proxy: proxyApi,
  },
})

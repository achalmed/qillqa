import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { publicacionSegura, servirAssets, trozos } from './vite.publicacion'

// El proxy hace que el navegador hable con /api sin conocer al backend.
// Dentro de Docker, "api" es el nombre del servicio FastAPI; fuera de
// Docker (desarrollo directo) se puede apuntar a localhost con
// VITE_API_PROXY=http://127.0.0.1:8000
//
// /api lleva también el WebSocket del chat (/api/chat/ws, fase 8): `ws: true`.
//
// /colab es el WebSocket de la edición simultánea (fase 5, colab/servidor.ts).
// Pasa por el MISMO puerto de la web: así el enlace público de Tailscale, que
// solo publica el 5173, lo lleva sin configurar nada más. VITE_COLAB_PROXY lo
// cambia (la instancia de prueba usa ws://127.0.0.1:8011).
//
// /estudio es el estudio de Prensa (identidad-visual) que la API publica tras
// comprobar su cookie (backend/app/api/prensa.py): va a la MISMA API que /api,
// también por el puerto de la web, para que el marco funcione por el enlace público.
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
  '/estudio': {
    target: process.env.VITE_API_PROXY ?? 'http://api:8000',
    changeOrigin: true,
  },
  '/colab': {
    target: process.env.VITE_COLAB_PROXY ?? 'ws://127.0.0.1:8001',
    ws: true,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), publicacionSegura(), servirAssets()],
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

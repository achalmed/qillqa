/**
 * PUBLICAR SIN DEJAR A NADIE EN BLANCO, Y CARGAR RÁPIDO (2026-10-13).
 *
 * Edison, desde el celular, justo después de una publicación: «no carga el sistema, no puedo
 * acceder». La causa estaba en tres piezas que se sumaban (docs/arquitectura.md §31):
 *
 *   1. `vite build` VACIABA dist/ mientras el `vite preview` viejo seguía sirviendo: durante unos
 *      segundos el index.html nombraba archivos que ya no existían (o todavía no).
 *   2. `vite preview` contesta un archivo inexistente de /assets/ con el index.html y un 200
 *      (respaldo de aplicación de una sola página): el navegador recibía HTML donde esperaba JS.
 *   3. El service worker guardaba ese 200 como si fuera el JS y, como sirve /assets/ desde su
 *      caché primero, la aplicación quedaba en blanco en cada apertura hasta la siguiente
 *      publicación.
 *
 * Este archivo cierra las dos primeras (el service worker, la tercera):
 *
 *   · `publicacionSegura` (build): dist/ no se vacía —una pestaña abierta sigue encontrando sus
 *     trozos viejos— y el index.html y el sw.js se escriben AL FINAL y de golpe (archivo temporal
 *     + rename), cuando todo lo que nombran ya está en disco. El sw.js lleva la lista exacta de
 *     archivos del build y su versión: cada publicación instala un service worker nuevo que
 *     guarda la aplicación completa ANTES de tomar el control. Además precomprime (brotli y gzip)
 *     y retira los archivos de builds viejos pasados unos días.
 *   · `servirAssets` (preview): /assets/ se sirve desde aquí, ya comprimido y con caché
 *     inmutable (los nombres llevan hash), y un archivo que no existe es un 404 de verdad, nunca
 *     el index.html.
 *   · `trozos`: el JS se reparte por bibliotecas (React, MUI, íconos, editor, edición simultánea,
 *     PDF, grafo); las páginas se cargan con React.lazy (App.tsx).
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib'
import type { Plugin, ResolvedConfig } from 'vite'

/** Builds cuyos archivos se conservan en dist/assets (el actual y los dos anteriores). */
const BUILDS_CONSERVADOS = 3
/** Y aun fuera de esos, nada se borra antes de estos días: una pestaña puede llevar abierta un fin de semana. */
const DIAS_MINIMOS = 3
const COMPRIMIBLES = /\.(js|mjs|css|html|svg|json|webmanifest|txt)$/
const REGISTRO = '.publicaciones.json'

/** Reparte las bibliotecas en trozos estables (su hash no cambia si no cambia la versión). */
export function trozos(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  const m = (re: RegExp) => re.test(id)
  if (m(/[\\/]pdfjs-dist[\\/]/)) return 'pdf'
  if (m(/[\\/](react-force-graph-2d|force-graph|d3-[^\\/]+|kapsule|canvas-color-tracker|bezier-js|accessor-fn|float-tooltip|index-array-by|tinycolor2|lodash-es|preact)[\\/]/)) return 'grafo'
  if (m(/[\\/](yjs|y-protocols|lib0|@hocuspocus)[\\/]/)) return 'colab'
  if (m(/[\\/](@tiptap|y-prosemirror|prosemirror-[^\\/]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname|crelt|tippy\.js)[\\/]/)) return 'editor'
  if (m(/[\\/]@mui[\\/]icons-material[\\/]/)) return 'iconos' // uno solo: decenas de archivos pequeños pesan más por la latencia que por los bytes
  if (m(/[\\/](@mui|@emotion|@popperjs|react-transition-group|stylis|clsx|prop-types|react-is|hoist-non-react-statics|@babel[\\/]runtime)[\\/]/)) return 'mui'
  if (m(/[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/)) return 'react'
  return undefined
}

/** Escribe un archivo de golpe: nadie lo lee a medias. */
function escribirAtomico(destino: string, contenido: string | Buffer): void {
  const temporal = `${destino}.${process.pid}.tmp`
  writeFileSync(temporal, contenido)
  renameSync(temporal, destino)
}

function listar(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return []
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...listar(ruta, base))
    else salida.push(path.relative(base, ruta).split(path.sep).join('/'))
  }
  return salida
}

/** Brotli y gzip al lado de cada archivo que vale la pena (solo los que aún no los tienen). */
function precomprimir(archivo: string): void {
  if (!COMPRIMIBLES.test(archivo)) return
  const tam = statSync(archivo).size
  if (tam < 1024) return
  const crudo = readFileSync(archivo)
  const mtime = statSync(archivo).mtimeMs
  const br = `${archivo}.br`
  if (!existsSync(br) || statSync(br).mtimeMs < mtime) {
    escribirAtomico(br, brotliCompressSync(crudo, { params: { [zlib.BROTLI_PARAM_QUALITY]: 10, [zlib.BROTLI_PARAM_SIZE_HINT]: tam } }))
  }
  const gz = `${archivo}.gz`
  if (!existsSync(gz) || statSync(gz).mtimeMs < mtime) escribirAtomico(gz, gzipSync(crudo, { level: 9 }))
}

interface Registro {
  publicaciones: { version: string; fecha: string; archivos: string[] }[]
}

export function publicacionSegura(): Plugin {
  let config: ResolvedConfig
  let indexHtml = ''
  let archivosBuild: string[] = []
  let entrada = ''
  return {
    name: 'sgdp:publicacion-segura',
    apply: 'build',
    enforce: 'post',
    configResolved(c) {
      config = c
    },
    generateBundle(_opciones, bundle) {
      archivosBuild = []
      for (const [nombre, salida] of Object.entries(bundle)) {
        if (nombre === 'index.html' && salida.type === 'asset') {
          // El index.html NO lo escribe rollup: se escribe al final (writeBundle), cuando todo lo
          // que nombra ya está en disco.
          indexHtml = String(salida.source)
          delete bundle[nombre]
          continue
        }
        archivosBuild.push(nombre)
        if (salida.type === 'chunk' && salida.isEntry) entrada = nombre
      }
    },
    writeBundle() {
      const dist = path.resolve(config.root, config.build.outDir)
      const publico = config.publicDir
      // 1. La carpeta pública, salvo el service worker (va al final).
      for (const rel of listar(publico)) {
        if (rel === 'sw.js') continue
        const destino = path.join(dist, rel)
        mkdirSync(path.dirname(destino), { recursive: true })
        escribirAtomico(destino, readFileSync(path.join(publico, rel)))
      }
      // 2. Precomprimir lo nuevo (los assets ya están en disco).
      for (const rel of archivosBuild) precomprimir(path.join(dist, rel))

      // 3. La versión: fecha (ordena) + hash de la entrada (distingue dos builds del mismo minuto).
      const ahora = new Date()
      const sello = ahora.toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const hash = (/-([A-Za-z0-9_-]{6,})\.js$/.exec(entrada)?.[1] ?? 'x').slice(0, 8)
      const version = `${sello}-${hash}`

      // 4. El index.html, de golpe.
      escribirAtomico(path.join(dist, 'index.html'), indexHtml)
      precomprimir(path.join(dist, 'index.html'))

      // 5. El service worker, el último: cuando un navegador lo ve cambiado, todo lo demás ya está.
      //    Lleva la lista exacta de lo que debe guardar para abrir sin red.
      const iconos = listar(publico).filter((r) => /^(iconos\/|notificaciones\/|favicon|manifest\.webmanifest$)/.test(r))
      const archivos = [...archivosBuild.filter((r) => r.startsWith('assets/')), ...iconos].map((r) => `/${r}`)
      const publicacion = { version, entrada: `/${entrada}`, archivos }
      const sw = readFileSync(path.join(publico, 'sw.js'), 'utf8')
      escribirAtomico(
        path.join(dist, 'sw.js'),
        `// GENERADO por vite.publicacion.ts en cada build; la fuente es public/sw.js.\nself.__SGDP_PUBLICACION__ = ${JSON.stringify(publicacion)};\n${sw}`,
      )
      escribirAtomico(path.join(dist, 'version.json'), JSON.stringify({ version, fecha: ahora.toISOString() }))

      // 6. Retirar lo de builds viejos (con margen de días), y anotar este.
      const rutaRegistro = path.join(dist, REGISTRO)
      let registro: Registro = { publicaciones: [] }
      try {
        registro = JSON.parse(readFileSync(rutaRegistro, 'utf8')) as Registro
      } catch {
        /* primer build con registro */
      }
      registro.publicaciones = [{ version, fecha: ahora.toISOString(), archivos: archivosBuild }, ...registro.publicaciones].slice(0, BUILDS_CONSERVADOS)
      const vigentes = new Set(registro.publicaciones.flatMap((p) => p.archivos))
      const limite = Date.now() - DIAS_MINIMOS * 86_400_000
      let retirados = 0
      for (const rel of listar(path.join(dist, 'assets'), dist)) {
        const base = rel.replace(/\.(br|gz)$/, '')
        if (vigentes.has(base)) continue
        const ruta = path.join(dist, rel)
        if (statSync(ruta).mtimeMs > limite) continue
        unlinkSync(ruta)
        retirados += 1
      }
      escribirAtomico(rutaRegistro, JSON.stringify(registro, null, 1))
      config.logger.info(`\n  publicación ${version}: ${archivos.length} archivos para el modo sin conexión${retirados ? `, ${retirados} viejos retirados` : ''}`)
    },
  }
}

const TIPOS: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
}

/**
 * /assets/ en el `vite preview`: comprimido, con caché inmutable y con 404 de verdad.
 *
 * Va ANTES del proxy y del resto del preview (hook previo de configurePreviewServer), pero solo
 * toca /assets/: /api, /colab, /estudio y la navegación siguen su camino de siempre.
 */
export function servirAssets(): Plugin {
  return {
    name: 'sgdp:servir-assets',
    configurePreviewServer(server) {
      const dist = path.resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        let ruta: string
        try {
          ruta = decodeURIComponent((req.url ?? '').split('?')[0])
        } catch {
          return next()
        }
        if (!ruta.startsWith('/assets/')) return next()
        const archivo = path.resolve(dist, `.${ruta}`)
        if (!archivo.startsWith(dist + path.sep) || !existsSync(archivo) || !statSync(archivo).isFile()) {
          // Un trozo que ya no existe es un 404: jamás el index.html con un 200, que el navegador
          // (y un service worker viejo) tomarían por el JS.
          res.statusCode = 404
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('No existe.')
          return
        }
        const acepta = String(req.headers['accept-encoding'] ?? '')
        let servir = archivo
        let codificacion = ''
        if (/\bbr\b/.test(acepta) && existsSync(`${archivo}.br`)) [servir, codificacion] = [`${archivo}.br`, 'br']
        else if (/\bgzip\b/.test(acepta) && existsSync(`${archivo}.gz`)) [servir, codificacion] = [`${archivo}.gz`, 'gzip']
        res.statusCode = 200
        res.setHeader('Content-Type', TIPOS[path.extname(archivo)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.setHeader('Vary', 'Accept-Encoding')
        res.setHeader('Content-Length', String(statSync(servir).size))
        if (codificacion) res.setHeader('Content-Encoding', codificacion)
        if (req.method === 'HEAD') return void res.end()
        createReadStream(servir).on('error', () => res.destroy()).pipe(res)
      })
    },
  }
}

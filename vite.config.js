import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Files that live in src/public (copied as-is, not part of the bundle) but must also
// work offline. Keep in sync with that folder.
const PUBLIC_FILES = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
]

// Writes dist/sw.js: a service worker that saves every built file so the game works
// offline. The cache name changes whenever any file changes, so updates just work.
function precacheServiceWorker() {
  return {
    name: 'precache-service-worker',
    apply: 'build',
    enforce: 'post', // run after Vite has emitted index.html and the other files
    generateBundle(_options, bundle) {
      const urls = [...new Set(['/', ...Object.keys(bundle).map((name) => '/' + name), ...PUBLIC_FILES])].sort()

      const hash = createHash('sha1').update(JSON.stringify(urls))
      const html = bundle['index.html']
      if (html) hash.update(String(html.source))
      for (const file of PUBLIC_FILES) hash.update(readFileSync(new URL('./src/public' + file, import.meta.url)))

      const source = readFileSync(new URL('./service-worker.template.js', import.meta.url), 'utf8')
        .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 10))
        .replace('__PRECACHE_URLS__', JSON.stringify(urls, null, 2))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    }
  }
}

export default defineConfig({
  root: 'src',
  // root is src/, so read .env files from the project folder instead
  envDir: '..',
  plugins: [precacheServiceWorker()],
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        main: 'src/index.html',
        privacy: 'src/privacy.html',
        terms: 'src/terms.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})

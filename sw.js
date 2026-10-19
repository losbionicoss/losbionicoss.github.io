const CACHE_NAME = 'los-bionicos-v44';

const ARCHIVOS_ESTATICOS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/sha256.js',
  './js/db.js',
  './js/auth.js',
  './js/pin.js',
  './js/app.js',
  './js/inicio.js',
  './js/productos.js',
  './js/impresora-ble.js',
  './js/aviso-respaldo.js',
  './js/venta.js',
  './js/reportes.js',
  './js/usuarios.js',
  './js/caja.js',
  './js/clientes.js',
  './js/respaldo.js',
  './js/registrar-sw.js',
  './pages/inicio.html',
  './pages/productos.html',
  './pages/venta.html',
  './pages/reportes.html',
  './pages/usuarios.html',
  './pages/caja.html',
  './pages/clientes.html',
  './pages/gastos.html',
  './pages/respaldo.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // cache: 'reload' obliga a pedir cada archivo a la red y no al
        // caché HTTP del navegador (GitHub Pages lo deja 10 min), para que
        // la versión nueva nunca se guarde con archivos viejos.
        return Promise.allSettled(
          ARCHIVOS_ESTATICOS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
        );
      })
      // Se activa en cuanto termina de instalar, sin esperar a que iOS suelte
      // la app anterior (a veces la mantiene viva aunque se cierre desde
      // multitarea y la actualización quedaba "en espera" por días).
      // NO se usa clients.claim(): esa combinación sí podía romper una
      // navegación a mitad de camino. Las páginas ya abiertas siguen con su
      // código hasta la siguiente navegación, y desde ahí todo es la versión
      // nueva.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) => {
      return Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;

      return fetch(request, { cache: 'no-store' })
        .then((respuestaRed) => {
          // Solo se cachean respuestas 200 completas: una 304 (sin cuerpo)
          // guardada en caché rompería cualquier carga futura de esa URL.
          if (respuestaRed.ok && respuestaRed.status === 200) {
            const copia = respuestaRed.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copia))
            );
          }
          return respuestaRed;
        })
        .catch(() => {
          return new Response('', { status: 504, statusText: 'Sin conexión y sin caché disponible' });
        });
    })
  );
});

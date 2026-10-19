// IMPORTANTE: subir este número cada vez que se publique una nueva versión,
// junto con CACHE_NAME en sw.js. Safari a veces sirve sw.js desde su caché
// HTTP interno aunque el archivo cambió, ignorando la revisión automática
// de actualizaciones del Service Worker; al cambiar este número, la URL de
// registro es literalmente distinta y Safari se ve obligado a pedirla de
// la red sí o sí, sin necesidad de borrar datos del sitio (lo cual borraría
// también la base de datos completa: productos, ventas, cajas, usuarios).
const VERSION_SW = 'v46';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const registrar = () => {
      const esSubcarpeta = location.pathname.includes('/pages/');
      const rutaSW = esSubcarpeta ? `../sw.js?v=${VERSION_SW}` : `./sw.js?v=${VERSION_SW}`;
      const opciones = esSubcarpeta
        ? { scope: '../', updateViaCache: 'none' }
        : { scope: './', updateViaCache: 'none' };
      navigator.serviceWorker
        .register(rutaSW, opciones)
        .then((registro) => {
          // Cada vez que la app vuelve a primer plano se busca una versión
          // nueva (iOS puede mantenerla abierta días sin recargar).
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') registro.update().catch(() => {});
          });
        })
        .catch(() => {});
    };
    // Se registra en tiempo de inactividad del navegador, no de inmediato:
    // así nunca compite con una navegación que el usuario haga justo al
    // terminar de cargar la página (ej. tocar "Entrar" muy rápido).
    if ('requestIdleCallback' in window) {
      requestIdleCallback(registrar, { timeout: 3000 });
    } else {
      setTimeout(registrar, 1000);
    }
  });
}

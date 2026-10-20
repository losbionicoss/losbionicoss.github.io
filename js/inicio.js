/**
 * inicio.js — Pantalla de inicio con botones grandes (pages/inicio.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirSesion('../index.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;

  if (typeof VERSION_SW !== 'undefined') {
    document.getElementById('inicio-version').textContent = `Versión ${VERSION_SW}`;
  }

  if (Auth.esAdministrador(sesion)) {
    document.getElementById('boton-inicio-reportes').classList.remove('oculto');
    document.getElementById('boton-inicio-respaldo').classList.remove('oculto');
    document.getElementById('boton-inicio-usuarios').classList.remove('oculto');
    Auth.hayPinsConfigurados()
      .then((hay) => {
        if (!hay) document.getElementById('aviso-codigos').classList.remove('oculto');
      })
      .catch(() => {});
  }

  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  const esAdminInicio = Auth.esAdministrador(sesion);
  if (!esAdminInicio) {
    // El cajero no ve el monto vendido: se quita ese dato del resumen.
    const ventasHoyWrap = document.getElementById('resumen-ventas-hoy-wrap');
    if (ventasHoyWrap) ventasHoyWrap.remove();
  }

  await cargarResumenHoy(esAdminInicio);
});

function formatearMoneda(monto) {
  return 'Q ' + monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function cargarResumenHoy(incluirVentas) {
  const fechaEl = document.getElementById('resumen-fecha-hoy');
  fechaEl.textContent = new Date().toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  try {
    const todasLasCajas = await DB.obtenerTodos(DB.STORES.CAJAS);
    const hayAbierta = todasLasCajas.some((c) => !c.cerrada);
    const estadoCajaEl = document.getElementById('resumen-estado-caja');
    estadoCajaEl.textContent = hayAbierta ? '🟢 Abierta' : '🔒 Cerrada';
    estadoCajaEl.classList.toggle('resumen-hoy-inicio__valor--ok', hayAbierta);
    estadoCajaEl.classList.toggle('resumen-hoy-inicio__valor--alerta', !hayAbierta);

    if (!incluirVentas) return;

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);

    const todasLasVentas = await DB.obtenerTodos(DB.STORES.VENTAS);
    const ventasHoy = todasLasVentas.filter(
      (v) => !v.cancelada && v.fecha >= inicioHoy.getTime() && v.fecha <= finHoy.getTime()
    );
    const totalHoy = ventasHoy.reduce((acc, v) => acc + (v.total || 0), 0);
    document.getElementById('resumen-ventas-hoy').textContent = formatearMoneda(totalHoy);
  } catch (err) {
    console.error(err);
  }
}

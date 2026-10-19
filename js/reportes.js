/**
 * reportes.js — Reportes de ventas sin gráficas (pages/reportes.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Reportes es solo para administrador: un cajero que escriba la dirección
  // a mano vuelve a Inicio.
  const sesion = Auth.requerirAdmin('../index.html', 'inicio.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;
  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  const fondoRecibo = document.getElementById('fondo-recibo');
  const reciboContenidoEl = document.getElementById('recibo-contenido');
  const reciboCanvas = document.getElementById('recibo-canvas');
  const botonCompartirRecibo = document.getElementById('boton-compartir-recibo');
  const botonImprimirDirecto = document.getElementById('boton-imprimir-directo');
  const botonCerrarRecibo = document.getElementById('boton-cerrar-recibo');
  const botonCerrarReciboX = document.getElementById('boton-cerrar-recibo-x');
  const enlaceDescargaRecibo = document.getElementById('enlace-descarga-recibo');
  let ultimaVentaParaRecibo = null;

  const cuerpoTablaEl = document.getElementById('cuerpo-tabla-reportes');
  const estadoVacioEl = document.getElementById('estado-vacio-reportes');
  const tablaEnvoltorioEl = document.querySelector('.tabla-reportes-envoltorio');
  const pestanas = document.querySelectorAll('.pestana-periodo');
  const tituloPeriodoTablaEl = document.getElementById('titulo-periodo-tabla');
  const inputFiltroDia = document.getElementById('filtro-fecha-dia');
  const inputFiltroSemana = document.getElementById('filtro-fecha-semana');
  const inputFiltroMes = document.getElementById('filtro-fecha-mes');
  const selectFiltroAnio = document.getElementById('filtro-fecha-anio');
  const divFiltroRango = document.getElementById('filtro-rango-fechas');
  const inputRangoDesde = document.getElementById('filtro-rango-desde');
  const inputRangoHasta = document.getElementById('filtro-rango-hasta');

  const etiquetasMetodoPago = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    deposito: 'Depósito',
    pedidosya: 'Pedidos Ya',
  };

  const cacheUsuarios = new Map();

  const esAdmin = Auth.esAdministrador(sesion);
  if (esAdmin) {
    document.getElementById('tarjeta-semana').classList.remove('oculto');
    document.getElementById('tarjeta-mes').classList.remove('oculto');
    document.querySelectorAll('.pestana-periodo').forEach((b) => b.classList.remove('oculto'));
  }

  let periodoActual = 'dia';
  let todasLasVentas = [];

  // Valores elegidos en los controles de filtro específico (se recuerdan
  // aunque el usuario cambie de pestaña y vuelva).
  let fechaDiaSeleccionada = null; // Date
  let fechaSemanaSeleccionada = null; // Date (cualquier día dentro de la semana)
  let mesSeleccionado = null; // { anio, mes(0-11) }
  let anioSeleccionado = null; // number
  let rangoDesdeSeleccionado = null; // Date
  let rangoHastaSeleccionado = null; // Date

  function formatearPrecio(precio) {
    return 'Q ' + precio.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function inicioDeHoy() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeHoy() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeSemana() {
    // Semana calendario lunes-domingo.
    const d = inicioDeHoy();
    const diaSemana = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
    const diff = diaSemana === 0 ? 6 : diaSemana - 1; // días desde el lunes
    d.setDate(d.getDate() - diff);
    return d;
  }

  function finDeSemana() {
    const inicio = inicioDeSemana();
    const d = new Date(inicio);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeMes() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeMes() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0); // último día del mes actual
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // --- Helpers para filtros de periodo específico (parametrizados) ---

  function inicioDeDia(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeDia(fecha) {
    const d = new Date(fecha);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeSemanaDesde(fecha) {
    const d = inicioDeDia(fecha);
    const diaSemana = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
    const diff = diaSemana === 0 ? 6 : diaSemana - 1; // días desde el lunes
    d.setDate(d.getDate() - diff);
    return d;
  }

  function finDeSemanaDesde(fecha) {
    const inicio = inicioDeSemanaDesde(fecha);
    const d = new Date(inicio);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeMesDesde(anio, mes) {
    const d = new Date(anio, mes, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeMesDesde(anio, mes) {
    const d = new Date(anio, mes + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeAnio(anio) {
    const d = new Date(anio, 0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeAnio(anio) {
    const d = new Date(anio, 11, 31);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // Parsea un valor "yyyy-mm-dd" de <input type="date"> como fecha LOCAL
  // (evita el corrimiento de un día que causa `new Date('yyyy-mm-dd')`,
  // que interpreta el string como UTC).
  function parsearFechaLocal(valor) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    return new Date(anio, mes - 1, dia);
  }

  const nombresMes = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  function formatearFechaCorta(fecha) {
    return fecha.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  let ventasActivas = [];

  function filtrarPorRango(ventas, inicio, fin) {
    const inicioMs = inicio.getTime();
    const finMs = fin.getTime();
    return ventas.filter((v) => v.fecha >= inicioMs && v.fecha <= finMs);
  }

  function sumarTotales(ventas) {
    return ventas.reduce((acc, v) => acc + (v.total || 0), 0);
  }

  function actualizarTarjetasResumen() {
    const ventasHoy = filtrarPorRango(ventasActivas, inicioDeHoy(), finDeHoy());
    const ventasSemana = filtrarPorRango(ventasActivas, inicioDeSemana(), finDeSemana());
    const ventasMes = filtrarPorRango(ventasActivas, inicioDeMes(), finDeMes());

    document.getElementById('resumen-hoy-total').textContent = formatearPrecio(sumarTotales(ventasHoy));
    document.getElementById('resumen-hoy-cantidad').textContent = `${ventasHoy.length} venta${ventasHoy.length === 1 ? '' : 's'}`;

    document.getElementById('resumen-semana-total').textContent = formatearPrecio(sumarTotales(ventasSemana));
    document.getElementById('resumen-semana-cantidad').textContent = `${ventasSemana.length} venta${ventasSemana.length === 1 ? '' : 's'}`;

    document.getElementById('resumen-mes-total').textContent = formatearPrecio(sumarTotales(ventasMes));
    document.getElementById('resumen-mes-cantidad').textContent = `${ventasMes.length} venta${ventasMes.length === 1 ? '' : 's'}`;
  }

  function actualizarResumenMetodosPago() {
    const ventasHoy = filtrarPorRango(ventasActivas, inicioDeHoy(), finDeHoy());
    const porMetodo = { efectivo: 0, tarjeta: 0, deposito: 0, pedidosya: 0 };
    ventasHoy.forEach((v) => {
      if (porMetodo[v.metodoPago] !== undefined) porMetodo[v.metodoPago] += v.total || 0;
    });
    document.getElementById('resumen-efectivo-total').textContent = formatearPrecio(porMetodo.efectivo);
    document.getElementById('resumen-tarjeta-total').textContent = formatearPrecio(porMetodo.tarjeta);
    document.getElementById('resumen-deposito-total').textContent = formatearPrecio(porMetodo.deposito);
    document.getElementById('resumen-pedidosya-total').textContent = formatearPrecio(porMetodo.pedidosya);
  }

  // Devuelve { inicio, fin, etiqueta } según el filtro específico elegido
  // (periodoActual). Este rango es el que aplica a la TABLA y a la
  // GANANCIA del periodo — las tarjetas de resumen de arriba (Hoy/Semana/Mes)
  // siempre usan el día/semana/mes actual real, sin importar este filtro.
  function obtenerRangoFiltroActual() {
    if (periodoActual === 'dia') {
      return { inicio: inicioDeHoy(), fin: finDeHoy(), etiqueta: 'de hoy' };
    }
    if (periodoActual === 'dia-especifico') {
      const fecha = fechaDiaSeleccionada || new Date();
      return {
        inicio: inicioDeDia(fecha),
        fin: finDeDia(fecha),
        etiqueta: `del ${formatearFechaCorta(fecha)}`,
      };
    }
    if (periodoActual === 'semana-especifica') {
      const fecha = fechaSemanaSeleccionada || new Date();
      const inicio = inicioDeSemanaDesde(fecha);
      const fin = finDeSemanaDesde(fecha);
      return {
        inicio,
        fin,
        etiqueta: `de la semana del ${formatearFechaCorta(inicio)} al ${formatearFechaCorta(fin)}`,
      };
    }
    if (periodoActual === 'mes-especifico') {
      const { anio, mes } = mesSeleccionado || { anio: new Date().getFullYear(), mes: new Date().getMonth() };
      return {
        inicio: inicioDeMesDesde(anio, mes),
        fin: finDeMesDesde(anio, mes),
        etiqueta: `de ${nombresMes[mes]} ${anio}`,
      };
    }
    if (periodoActual === 'anio-especifico') {
      const anio = anioSeleccionado || new Date().getFullYear();
      return { inicio: inicioDeAnio(anio), fin: finDeAnio(anio), etiqueta: `del año ${anio}` };
    }
    if (periodoActual === 'rango') {
      const desde = rangoDesdeSeleccionado || inicioDeHoy();
      const hasta = rangoHastaSeleccionado || finDeHoy();
      return {
        inicio: inicioDeDia(desde),
        fin: finDeDia(hasta),
        etiqueta: `del ${formatearFechaCorta(desde)} al ${formatearFechaCorta(hasta)}`,
      };
    }
    // Fallback: hoy.
    return { inicio: inicioDeHoy(), fin: finDeHoy(), etiqueta: 'de hoy' };
  }

  function obtenerVentasDelPeriodo() {
    const { inicio, fin } = obtenerRangoFiltroActual();
    return filtrarPorRango(ventasActivas, inicio, fin);
  }

  function obtenerVentasDelPeriodoParaTabla() {
    const { inicio, fin } = obtenerRangoFiltroActual();
    return filtrarPorRango(todasLasVentas, inicio, fin);
  }

  function actualizarTituloPeriodoTabla() {
    const { etiqueta } = obtenerRangoFiltroActual();
    tituloPeriodoTablaEl.textContent = `Ventas ${etiqueta}`;
  }

  async function obtenerNombreCajero(usuarioId) {
    if (cacheUsuarios.has(usuarioId)) {
      return cacheUsuarios.get(usuarioId);
    }
    const usuario = await DB.obtenerPorId(DB.STORES.USUARIOS, usuarioId);
    const nombre = usuario ? usuario.nombre : 'Desconocido';
    cacheUsuarios.set(usuarioId, nombre);
    return nombre;
  }

  function detallePagoHtml(venta) {
    const partes = [];
    if (venta.bancoNombre) partes.push(venta.bancoNombre);
    if (venta.numeroCuenta) partes.push(`Cta. ${venta.numeroCuenta}`);
    if (venta.numeroTransaccion) partes.push(`Trans. ${venta.numeroTransaccion}`);
    if (partes.length === 0) return '';
    return `<br /><small class="detalle-pago">${escaparHtml(partes.join(' · '))}</small>`;
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  async function cancelarVenta(venta) {
    const confirmacion = window.confirm(
      `¿Cancelar la venta N° ${venta.numeroRecibo} por ${formatearPrecio(venta.total || 0)}?\nEsta acción no se puede deshacer.`
    );
    if (!confirmacion) return;

    const motivo = window.prompt('Motivo de la cancelación (opcional):', '') || '';

    const responsable = await Pin.pedir('Cancelar venta');
    if (!responsable) return;

    const ventaActualizada = {
      ...venta,
      cancelada: true,
      fechaCancelacion: Date.now(),
      motivoCancelacion: motivo,
      canceladaPor: responsable.nombre,
    };

    await DB.actualizar(DB.STORES.VENTAS, ventaActualizada);

    const indice = todasLasVentas.findIndex((v) => v.id === venta.id);
    if (indice !== -1) todasLasVentas[indice] = ventaActualizada;
    ventasActivas = todasLasVentas.filter((v) => !v.cancelada);

    actualizarTarjetasResumen();
    actualizarResumenMetodosPago();
    await renderizarTabla();
  }

  // ---------- Depósitos y tarjetas del periodo ----------

  const pagosElectronicosEl = document.getElementById('pagos-electronicos');
  const tituloPagosElectronicosEl = document.getElementById('titulo-pagos-electronicos');
  let mapaClientes = new Map();

  function renderizarBloquePagos(ventas, metodo, icono, titulo) {
    const pagos = ventas.filter((v) => v.metodoPago === metodo).sort((a, b) => b.fecha - a.fecha);
    const total = pagos.reduce((acc, v) => acc + (v.total || 0), 0);
    const cantidad = pagos.length;

    if (cantidad === 0) {
      return `
        <section class="pago-bloque">
          <div class="pago-bloque__cabecera">
            <span class="pago-bloque__titulo">${icono} ${titulo}</span>
            <span class="pago-bloque__total">${formatearPrecio(0)}</span>
          </div>
          <p class="pago-bloque__vacio">No hubo pagos con ${titulo.toLowerCase()} en este periodo.</p>
        </section>`;
    }

    const porBanco = new Map();
    pagos.forEach((v) => {
      const banco = v.bancoNombre || 'Sin banco';
      const acumulado = porBanco.get(banco) || { cantidad: 0, total: 0 };
      acumulado.cantidad += 1;
      acumulado.total += v.total || 0;
      porBanco.set(banco, acumulado);
    });
    const chipsBancos = Array.from(porBanco.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([banco, datos]) => `
        <span class="pago-banco-chip">
          <strong>${escaparHtml(banco)}</strong>
          <span>${datos.cantidad} ${datos.cantidad === 1 ? 'pago' : 'pagos'} · ${formatearPrecio(datos.total)}</span>
        </span>`)
      .join('');

    const etiquetaDato = metodo === 'deposito' ? 'Cuenta del cliente' : 'No. de transacción';
    const filas = pagos.map((v) => {
      const cliente = v.clienteNombre || (v.clienteId != null && mapaClientes.get(v.clienteId)) || '—';
      const dato = (metodo === 'deposito' ? v.numeroCuenta : v.numeroTransaccion) || '—';
      const fecha = new Date(v.fecha).toLocaleString('es-GT', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      return `
        <tr>
          <td>${fecha}</td>
          <td>${v.numeroRecibo}</td>
          <td>${escaparHtml(cliente)}</td>
          <td>${escaparHtml(v.bancoNombre || '—')}</td>
          <td>${escaparHtml(dato)}</td>
          <td>${formatearPrecio(v.total || 0)}</td>
        </tr>`;
    }).join('');

    return `
      <section class="pago-bloque">
        <div class="pago-bloque__cabecera">
          <span class="pago-bloque__titulo">${icono} ${titulo}</span>
          <span class="pago-bloque__total">${formatearPrecio(total)}</span>
          <span class="pago-bloque__cantidad">${cantidad} ${cantidad === 1 ? 'pago' : 'pagos'}</span>
        </div>
        <div class="pago-bancos">${chipsBancos}</div>
        <div class="pagos-tabla-envoltorio">
          <table class="tabla-reportes">
            <thead>
              <tr><th>Fecha y hora</th><th>Recibo</th><th>Cliente</th><th>Banco</th><th>${etiquetaDato}</th><th>Monto</th></tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </section>`;
  }

  function renderizarPagosElectronicos() {
    const { etiqueta } = obtenerRangoFiltroActual();
    tituloPagosElectronicosEl.textContent = `Depósitos y tarjetas ${etiqueta}`;
    const ventas = obtenerVentasDelPeriodo();
    pagosElectronicosEl.innerHTML =
      renderizarBloquePagos(ventas, 'deposito', '🏦', 'Depósitos') +
      renderizarBloquePagos(ventas, 'tarjeta', '💳', 'Tarjeta');
  }

  async function renderizarVentasPorVendedor() {
    const { etiqueta } = obtenerRangoFiltroActual();
    document.getElementById('titulo-ventas-vendedor').textContent = `Ventas por vendedor ${etiqueta}`;
    const contenedor = document.getElementById('ventas-por-vendedor');

    const ventas = obtenerVentasDelPeriodo();
    if (ventas.length === 0) {
      contenedor.innerHTML = '<section class="pago-bloque"><p class="pago-bloque__vacio">No hubo ventas en este periodo.</p></section>';
      return;
    }

    const porVendedor = new Map();
    ventas.forEach((v) => {
      const acumulado = porVendedor.get(v.usuarioId) || { cantidad: 0, total: 0 };
      acumulado.cantidad += 1;
      acumulado.total += v.total || 0;
      porVendedor.set(v.usuarioId, acumulado);
    });

    const filas = [];
    for (const [usuarioId, datos] of porVendedor.entries()) {
      filas.push({ nombre: await obtenerNombreCajero(usuarioId), ...datos });
    }
    filas.sort((a, b) => b.total - a.total);

    contenedor.innerHTML = `
      <section class="pago-bloque">
        <div class="pagos-tabla-envoltorio">
          <table class="tabla-reportes">
            <thead><tr><th>Vendedor</th><th>Ventas</th><th>Total vendido</th></tr></thead>
            <tbody>
              ${filas.map((f) => `
                <tr>
                  <td>${escaparHtml(f.nombre)}</td>
                  <td>${f.cantidad}</td>
                  <td>${formatearPrecio(f.total)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  // La tabla muestra las ventas de 50 en 50 ("Mostrar más"): con miles de
  // ventas en un mes o rango, pintarlas todas a la vez traba el iPad. Los
  // totales de arriba se siguen calculando sobre todas las ventas.
  const TAMANO_PAGINA_VENTAS = 50;
  let limiteVentasTabla = TAMANO_PAGINA_VENTAS;
  let claveFiltroAnterior = '';
  const botonMasVentas = document.createElement('button');
  botonMasVentas.type = 'button';
  botonMasVentas.className = 'boton boton-secundario oculto';
  botonMasVentas.style.cssText = 'display:block;margin:12px auto;';
  tablaEnvoltorioEl.insertAdjacentElement('afterend', botonMasVentas);
  botonMasVentas.addEventListener('click', () => {
    limiteVentasTabla += TAMANO_PAGINA_VENTAS;
    renderizarTabla();
  });

  async function renderizarTabla() {
    await renderizarVentasPorVendedor();
    renderizarPagosElectronicos();
    const ventasPeriodo = obtenerVentasDelPeriodoParaTabla().slice().sort((a, b) => b.fecha - a.fecha);

    // Al cambiar de período o filtro se vuelve a las primeras 50.
    const claveFiltro = [
      periodoActual,
      inputFiltroDia.value,
      inputFiltroSemana.value,
      inputFiltroMes.value,
      selectFiltroAnio.value,
      inputRangoDesde.value,
      inputRangoHasta.value,
    ].join('|');
    if (claveFiltro !== claveFiltroAnterior) {
      claveFiltroAnterior = claveFiltro;
      limiteVentasTabla = TAMANO_PAGINA_VENTAS;
    }

    cuerpoTablaEl.innerHTML = '';

    if (ventasPeriodo.length === 0) {
      estadoVacioEl.classList.remove('oculto');
      tablaEnvoltorioEl.classList.add('oculto');
      botonMasVentas.classList.add('oculto');
      return;
    }

    estadoVacioEl.classList.add('oculto');
    tablaEnvoltorioEl.classList.remove('oculto');

    const restantes = ventasPeriodo.length - limiteVentasTabla;
    botonMasVentas.classList.toggle('oculto', restantes <= 0);
    botonMasVentas.textContent = `Mostrar más (${Math.max(restantes, 0)} restantes)`;

    for (const venta of ventasPeriodo.slice(0, limiteVentasTabla)) {
      const nombreCajero = await obtenerNombreCajero(venta.usuarioId);
      const fechaFormateada = new Date(venta.fecha).toLocaleString('es-GT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const etiquetaMetodo = etiquetasMetodoPago[venta.metodoPago] ||
        (venta.metodoPago ? venta.metodoPago.charAt(0).toUpperCase() + venta.metodoPago.slice(1) : '—');
      const etiquetaEntrega = venta.esPedidosYa
        ? '🛍️ Pedidos Ya'
        : venta.esDomicilio ? '🛵 Domicilio' : '🏬 Local';
      const etiquetaCliente = venta.clienteNombre && venta.clienteNombre.trim() !== ''
        ? escaparHtml(venta.clienteNombre)
        : '—';

      const fila = document.createElement('tr');
      if (venta.cancelada) fila.classList.add('fila-venta-cancelada');

      let celdaAccion;
      if (venta.cancelada) {
        const motivoTexto = venta.motivoCancelacion ? ` — ${venta.motivoCancelacion}` : '';
        const tituloTexto = `Cancelada por ${venta.canceladaPor || 'desconocido'}${motivoTexto}`;
        celdaAccion = `<span class="etiqueta-venta-cancelada" title="${escaparHtml(tituloTexto)}">Cancelada</span>`;
      } else {
        celdaAccion = `<button type="button" class="boton-cancelar-venta" data-venta-id="${venta.id}">🗑️ Cancelar</button>`;
      }

      fila.innerHTML = `
        <td>${venta.numeroRecibo}</td>
        <td>${fechaFormateada}</td>
        <td>${escaparHtml(nombreCajero)}</td>
        <td>${etiquetaMetodo}${detallePagoHtml(venta)}</td>
        <td>${etiquetaEntrega}</td>
        <td>${etiquetaCliente}</td>
        <td>${formatearPrecio(venta.total || 0)}</td>
        <td><button type="button" class="boton-reimprimir-recibo" data-venta-id="${venta.id}">🖨️ Ver / Imprimir</button></td>
        <td>${celdaAccion}</td>
      `;

      if (!venta.cancelada) {
        const boton = fila.querySelector('.boton-cancelar-venta');
        boton.addEventListener('click', () => cancelarVenta(venta));
      }

      const botonRecibo = fila.querySelector('.boton-reimprimir-recibo');
      botonRecibo.addEventListener('click', () => abrirReciboDesdeHistorial(venta, nombreCajero));

      cuerpoTablaEl.appendChild(fila);
    }
  }

  function mostrarControlDeFiltro() {
    inputFiltroDia.classList.add('oculto');
    inputFiltroSemana.classList.add('oculto');
    inputFiltroMes.classList.add('oculto');
    selectFiltroAnio.classList.add('oculto');
    divFiltroRango.classList.add('oculto');

    if (periodoActual === 'dia-especifico') inputFiltroDia.classList.remove('oculto');
    if (periodoActual === 'semana-especifica') inputFiltroSemana.classList.remove('oculto');
    if (periodoActual === 'mes-especifico') inputFiltroMes.classList.remove('oculto');
    if (periodoActual === 'anio-especifico') selectFiltroAnio.classList.remove('oculto');
    if (periodoActual === 'rango') divFiltroRango.classList.remove('oculto');
  }

  async function refrescarVistaFiltrada() {
    actualizarTituloPeriodoTabla();
    await renderizarTabla();
  }

  pestanas.forEach((boton) => {
    boton.addEventListener('click', () => {
      pestanas.forEach((b) => b.classList.remove('activo'));
      boton.classList.add('activo');
      periodoActual = boton.dataset.periodo;
      mostrarControlDeFiltro();
      refrescarVistaFiltrada();
    });
  });

  inputFiltroDia.addEventListener('change', () => {
    if (!inputFiltroDia.value) return;
    fechaDiaSeleccionada = parsearFechaLocal(inputFiltroDia.value);
    refrescarVistaFiltrada();
  });

  inputFiltroSemana.addEventListener('change', () => {
    if (!inputFiltroSemana.value) return;
    fechaSemanaSeleccionada = parsearFechaLocal(inputFiltroSemana.value);
    refrescarVistaFiltrada();
  });

  inputFiltroMes.addEventListener('change', () => {
    if (!inputFiltroMes.value) return;
    const [anio, mes] = inputFiltroMes.value.split('-').map(Number);
    mesSeleccionado = { anio, mes: mes - 1 };
    refrescarVistaFiltrada();
  });

  inputRangoDesde.addEventListener('change', () => {
    if (!inputRangoDesde.value) return;
    rangoDesdeSeleccionado = parsearFechaLocal(inputRangoDesde.value);
    if (rangoHastaSeleccionado && rangoDesdeSeleccionado > rangoHastaSeleccionado) {
      rangoHastaSeleccionado = rangoDesdeSeleccionado;
      inputRangoHasta.value = inputRangoDesde.value;
    }
    refrescarVistaFiltrada();
  });

  inputRangoHasta.addEventListener('change', () => {
    if (!inputRangoHasta.value) return;
    rangoHastaSeleccionado = parsearFechaLocal(inputRangoHasta.value);
    if (rangoDesdeSeleccionado && rangoHastaSeleccionado < rangoDesdeSeleccionado) {
      rangoDesdeSeleccionado = rangoHastaSeleccionado;
      inputRangoDesde.value = inputRangoHasta.value;
    }
    refrescarVistaFiltrada();
  });

  selectFiltroAnio.addEventListener('change', () => {
    anioSeleccionado = Number(selectFiltroAnio.value);
    refrescarVistaFiltrada();
  });

  function inicializarControlesDeFiltro() {
    const hoy = new Date();
    const isoHoy = hoy.toISOString ? new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';

    fechaDiaSeleccionada = hoy;
    fechaSemanaSeleccionada = hoy;
    mesSeleccionado = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
    anioSeleccionado = hoy.getFullYear();

    inputFiltroDia.value = isoHoy;
    inputFiltroSemana.value = isoHoy;
    rangoDesdeSeleccionado = hoy;
    rangoHastaSeleccionado = hoy;
    inputRangoDesde.value = isoHoy;
    inputRangoHasta.value = isoHoy;
    const mesTexto = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    inputFiltroMes.value = mesTexto;

    // Años con al menos una venta registrada, más el año actual real.
    const anioActualReal = new Date().getFullYear();
    const anios = new Set([anioActualReal]);
    todasLasVentas.forEach((v) => anios.add(new Date(v.fecha).getFullYear()));
    const aniosOrdenados = Array.from(anios).sort((a, b) => b - a);

    selectFiltroAnio.innerHTML = '';
    aniosOrdenados.forEach((anio) => {
      const opcion = document.createElement('option');
      opcion.value = String(anio);
      opcion.textContent = String(anio);
      selectFiltroAnio.appendChild(opcion);
    });
    selectFiltroAnio.value = String(anioActualReal);

    mostrarControlDeFiltro();
  }

  async function cargarDatos() {
    todasLasVentas = await DB.obtenerTodos(DB.STORES.VENTAS);
    ventasActivas = todasLasVentas.filter((v) => !v.cancelada);
    try {
      const clientes = await DB.obtenerTodos(DB.STORES.CLIENTES);
      mapaClientes = new Map(clientes.map((c) => [c.id, c.nombre]));
    } catch (err) {
      mapaClientes = new Map();
    }
    actualizarTarjetasResumen();
    actualizarResumenMetodosPago();

    inicializarControlesDeFiltro();
    actualizarTituloPeriodoTabla();

    await renderizarTabla();
  }

  // ---------- Reimprimir recibo de una venta histórica ----------

  function etiquetaMetodoPagoRecibo(metodo) {
    return etiquetasMetodoPago[metodo] || metodo || '—';
  }

  let telefonoNegocio = '';
  let direccionNegocio = '';

  async function abrirReciboDesdeHistorial(venta, nombreCajero) {
    try {
      const ajustes = await DB.obtenerPorId(DB.STORES.AJUSTES, 1);
      telefonoNegocio = ajustes && ajustes.telefonoNegocio ? ajustes.telefonoNegocio : '';
      direccionNegocio = ajustes && ajustes.direccionNegocio ? ajustes.direccionNegocio : '';
    } catch (err) {
      telefonoNegocio = '';
      direccionNegocio = '';
    }

    const detalle = await DB.obtenerPorIndice(DB.STORES.DETALLE_VENTA, 'ventaId', venta.id);
    const lineas = detalle.map((d) => ({
      nombre: d.nombreProducto,
      precio: d.precioUnitario,
      cantidad: d.cantidad,
      extra: d.extra || 0,
      nota: d.nota || '',
    }));

    mostrarRecibo({
      numeroRecibo: venta.numeroRecibo,
      fecha: venta.fecha,
      cajero: nombreCajero,
      metodoPago: venta.metodoPago,
      lineas,
      costoEnvio: venta.costoEnvio || 0,
      total: venta.total,
      esDomicilio: venta.esDomicilio,
      esPedidosYa: !!venta.esPedidosYa,
      telefonoNegocio,
      direccionNegocio,
      clienteNombre: venta.clienteNombre || '',
      clienteTelefono: venta.clienteTelefono || '',
      clienteDireccion: venta.clienteDireccion || '',
      telefonoAlterno: venta.telefonoAlterno || '',
      notasEntrega: venta.notasEntrega || '',
    });
  }

  function mostrarRecibo(venta) {
    ultimaVentaParaRecibo = venta;
    const fechaTexto = new Date(venta.fecha).toLocaleString('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    let filasHtml = '';
    venta.lineas.forEach((linea) => {
      const extra = linea.extra || 0;
      const subtotal = (linea.precio + extra) * linea.cantidad;
      const nombreConExtra = extra > 0
        ? `${escaparHtml(linea.nombre)} (+${formatearPrecio(extra)} extra c/u)`
        : escaparHtml(linea.nombre);
      const notaHtml = linea.nota
        ? `<div class="recibo-linea-nota"><em>${escaparHtml(linea.nota)}</em></div>`
        : '';
      filasHtml += `
        <div class="recibo-linea">
          <span>${linea.cantidad} × ${nombreConExtra}</span>
          <span>${formatearPrecio(subtotal)}</span>
        </div>
        ${notaHtml}
      `;
    });

    const envioHtml =
      venta.esDomicilio && venta.costoEnvio > 0
        ? `<div class="recibo-linea"><span>Envío a domicilio</span><span>${formatearPrecio(venta.costoEnvio)}</span></div>`
        : '';

    const domicilioHtml = venta.esDomicilio
      ? `
        <div class="recibo-domicilio">
          <strong>🛵 Entrega a domicilio</strong>
          ${venta.clienteNombre ? `<div>${escaparHtml(venta.clienteNombre)}</div>` : ''}
          ${venta.clienteTelefono ? `<div>${escaparHtml(venta.clienteTelefono)}</div>` : ''}
          ${venta.clienteDireccion ? `<div>${escaparHtml(venta.clienteDireccion)}</div>` : ''}
          ${venta.telefonoAlterno ? `<div>Tel. alterno: ${escaparHtml(venta.telefonoAlterno)}</div>` : ''}
          ${venta.notasEntrega ? `<div><em>${escaparHtml(venta.notasEntrega)}</em></div>` : ''}
        </div>
      `
      : '';

    reciboContenidoEl.innerHTML = `
      <h3 class="recibo-titulo">Frutería Los Biónicos</h3>
      ${venta.direccionNegocio ? `<p class="recibo-meta">${escaparHtml(venta.direccionNegocio)}</p>` : ''}
      ${venta.telefonoNegocio ? `<p class="recibo-meta">Tel: ${escaparHtml(venta.telefonoNegocio)}</p>` : ''}
      <p class="recibo-meta">${fechaTexto}</p>
      <p class="recibo-meta">Recibo #${venta.numeroRecibo}</p>
      <p class="recibo-meta">Atendió: ${escaparHtml(venta.cajero)}</p>
      <hr class="recibo-separador" />
      <div class="recibo-lineas">${filasHtml}</div>
      ${envioHtml}
      <hr class="recibo-separador" />
      <div class="recibo-total">
        <span>Total</span>
        <span>${formatearPrecio(venta.total)}</span>
      </div>
      <p class="recibo-metodo">Método de pago: ${etiquetaMetodoPagoRecibo(venta.metodoPago)}</p>
      ${domicilioHtml}
      ${venta.esPedidosYa ? `<div class="recibo-domicilio"><strong>🛍️ Pedidos Ya</strong><div>Cliente: ${escaparHtml(venta.clienteNombre || '')}</div></div>` : ''}
      <p class="recibo-gracias">¡Gracias por su compra!</p>
    `;

    dibujarReciboCanvas(venta);

    enlaceDescargaRecibo.classList.add('oculto');
    fondoRecibo.classList.remove('oculto');
  }

  function dibujarReciboCanvas(venta) {
    const ancho = 384;
    const margenX = 24;
    const alturaLinea = 24;
    const alturaNota = 16;
    const tieneEnvio = venta.esDomicilio && venta.costoEnvio > 0;
    let lineasDomicilio = venta.esDomicilio ? 3 : 0;
    if (venta.esDomicilio && venta.telefonoAlterno) lineasDomicilio += 1;
    if (venta.esDomicilio && venta.notasEntrega) lineasDomicilio += 1;
    let alturaFija = 220;
    if (tieneEnvio) alturaFija += alturaLinea;
    if (venta.esDomicilio) alturaFija += lineasDomicilio * 18 + 20;
    if (venta.telefonoNegocio) alturaFija += 20;
    const lineasDireccionNegocio = venta.direccionNegocio ? ImpresoraBLE.partirTexto(venta.direccionNegocio, 44) : [];
    alturaFija += lineasDireccionNegocio.length * 20;
    if (venta.esPedidosYa) alturaFija += 44;
    const cantidadNotas = venta.lineas.filter((l) => l.nota).length;
    const margenInferior = 70;
    const alto = alturaFija + venta.lineas.length * alturaLinea + cantidadNotas * alturaNota + margenInferior;

    const escalaImpresion = 1.5;
    reciboCanvas.width = ancho * escalaImpresion;
    reciboCanvas.height = alto * escalaImpresion;

    const ctx = reciboCanvas.getContext('2d');
    ctx.scale(escalaImpresion, escalaImpresion);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    let y = 20;

    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frutería Los Biónicos', ancho / 2, y);
    y += 30;

    ctx.font = '13px sans-serif';
    for (const lineaDireccion of lineasDireccionNegocio) {
      ctx.fillText(lineaDireccion, ancho / 2, y);
      y += 20;
    }

    if (venta.telefonoNegocio) {
      ctx.fillText(`Tel: ${venta.telefonoNegocio}`, ancho / 2, y);
      y += 20;
    }

    const fechaTexto = new Date(venta.fecha).toLocaleString('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    ctx.font = '13px sans-serif';
    ctx.fillText(fechaTexto, ancho / 2, y);
    y += 20;
    ctx.fillText(`Recibo #${venta.numeroRecibo}`, ancho / 2, y);
    y += 20;
    ctx.fillText(`Atendió: ${venta.cajero}`, ancho / 2, y);
    y += 20;

    ctx.textAlign = 'left';
    ctx.strokeStyle = '#cccccc';
    ctx.beginPath();
    ctx.moveTo(margenX, y);
    ctx.lineTo(ancho - margenX, y);
    ctx.stroke();
    y += 14;

    ctx.font = '13px sans-serif';
    venta.lineas.forEach((linea) => {
      const extra = linea.extra || 0;
      const subtotal = (linea.precio + extra) * linea.cantidad;
      const precioTexto = extra > 0
        ? `${formatearPrecio(linea.precio)} +${formatearPrecio(extra)} extra`
        : formatearPrecio(linea.precio);
      const textoIzq = `${linea.cantidad} x ${linea.nombre} (${precioTexto})`;
      const textoDer = formatearPrecio(subtotal);
      ctx.textAlign = 'left';
      ctx.font = '13px sans-serif';
      ctx.fillText(recortarTexto(ctx, textoIzq, ancho - margenX * 2 - 70), margenX, y);
      ctx.textAlign = 'right';
      ctx.fillText(textoDer, ancho - margenX, y);
      y += alturaLinea;
      if (linea.nota) {
        ctx.textAlign = 'left';
        ctx.font = 'italic 11px sans-serif';
        ctx.fillText(recortarTexto(ctx, linea.nota, ancho - margenX * 2), margenX, y);
        y += alturaNota;
      }
    });

    if (tieneEnvio) {
      ctx.textAlign = 'left';
      ctx.fillText('Envío a domicilio', margenX, y);
      ctx.textAlign = 'right';
      ctx.fillText(formatearPrecio(venta.costoEnvio), ancho - margenX, y);
      y += alturaLinea;
    }

    ctx.textAlign = 'left';
    ctx.beginPath();
    ctx.moveTo(margenX, y);
    ctx.lineTo(ancho - margenX, y);
    ctx.stroke();
    y += 16;

    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Total', margenX, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatearPrecio(venta.total), ancho - margenX, y);
    y += 30;

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Método de pago: ${etiquetaMetodoPagoRecibo(venta.metodoPago)}`, ancho / 2, y);
    y += 24;

    if (venta.esPedidosYa) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('🛍️ Pedidos Ya', margenX, y);
      y += 18;
      ctx.font = '13px sans-serif';
      ctx.fillText(recortarTexto(ctx, `Cliente: ${venta.clienteNombre || ''}`, ancho - margenX * 2), margenX, y);
      y += 26;
    }

    if (venta.esDomicilio) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('🛵 Entrega a domicilio', margenX, y);
      y += 18;
      ctx.font = '13px sans-serif';
      if (venta.clienteNombre) {
        ctx.fillText(venta.clienteNombre, margenX, y);
        y += 18;
      }
      if (venta.clienteTelefono) {
        ctx.fillText(venta.clienteTelefono, margenX, y);
        y += 18;
      }
      if (venta.clienteDireccion) {
        ctx.fillText(recortarTexto(ctx, venta.clienteDireccion, ancho - margenX * 2), margenX, y);
        y += 18;
      }
      if (venta.telefonoAlterno) {
        ctx.fillText(`Tel. alterno: ${venta.telefonoAlterno}`, margenX, y);
        y += 18;
      }
      if (venta.notasEntrega) {
        ctx.font = 'italic 13px sans-serif';
        ctx.fillText(recortarTexto(ctx, venta.notasEntrega, ancho - margenX * 2), margenX, y);
        y += 18;
      }
      y += 2;
    }

    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('¡Gracias por su compra!', ancho / 2, y);

    binarizarCanvas(reciboCanvas);
  }

  function binarizarCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const imagenDatos = ctx.getImageData(0, 0, width, height);
    const datos = imagenDatos.data;
    const umbral = 180;
    for (let i = 0; i < datos.length; i += 4) {
      const luminancia = 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
      const valor = luminancia < umbral ? 0 : 255;
      datos[i] = valor;
      datos[i + 1] = valor;
      datos[i + 2] = valor;
    }
    ctx.putImageData(imagenDatos, 0, 0);
  }

  function recortarTexto(ctx, texto, maxAncho) {
    if (ctx.measureText(texto).width <= maxAncho) return texto;
    let recortado = texto;
    while (recortado.length > 0 && ctx.measureText(recortado + '…').width > maxAncho) {
      recortado = recortado.slice(0, -1);
    }
    return recortado + '…';
  }

  // Imprime directo por Bluetooth (Web Bluetooth): solo funciona en Bluefy.
  botonImprimirDirecto.addEventListener('click', async () => {
    if (!ultimaVentaParaRecibo) return;
    if (!ImpresoraBLE.disponible()) {
      window.alert('Este navegador no permite imprimir. Abre la app en Bluefy para imprimir el recibo.');
      return;
    }
    try {
      await ImpresoraBLE.imprimir(ultimaVentaParaRecibo);
    } catch (error) {
      if (error.name === 'NotFoundError') return; // el usuario canceló la selección
      window.alert(`No se pudo imprimir: ${error.message}`);
    }
  });

  botonCompartirRecibo.addEventListener('click', async () => {
    enlaceDescargaRecibo.classList.add('oculto');

    reciboCanvas.toBlob(async (blob) => {
      if (!blob) return;

      const archivo = new File([blob], `recibo-${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [archivo] }) && navigator.share) {
        try {
          await navigator.share({ files: [archivo], title: 'Recibo Los Biónicos' });
          return;
        } catch (err) {
          // el usuario canceló o falló; caemos al método alternativo
        }
      }

      const dataUrl = reciboCanvas.toDataURL('image/png');
      enlaceDescargaRecibo.href = dataUrl;
      enlaceDescargaRecibo.download = `recibo-${Date.now()}.png`;
      enlaceDescargaRecibo.classList.remove('oculto');
    }, 'image/png');
  });

  function cerrarModalRecibo() {
    fondoRecibo.classList.add('oculto');
    enlaceDescargaRecibo.classList.add('oculto');
    reciboContenidoEl.innerHTML = '';
  }

  botonCerrarRecibo.addEventListener('click', cerrarModalRecibo);
  botonCerrarReciboX.addEventListener('click', cerrarModalRecibo);

  await cargarDatos();
});

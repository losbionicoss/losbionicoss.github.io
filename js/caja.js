/**
 * caja.js — Apertura/cierre de caja, movimientos (gastos/ingresos), ventas
 * del turno y su historial (pages/caja.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirSesion('../index.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;
  Auth.aplicarPermisosNav(sesion);
  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  // El cajero no ve montos, totales, listado de ventas, historial de cierres
  // ni puede cerrar caja: eso es solo del administrador. Lo marcado con
  // data-solo-admin se oculta y, además, para el cajero ni siquiera se
  // cargan esos datos (ver cargarEstadoCaja).
  const esAdmin = Auth.esAdministrador(sesion);
  if (!esAdmin) {
    document.querySelectorAll('[data-solo-admin]').forEach((el) => el.classList.add('oculto'));
    document.getElementById('aviso-caja-cajero').classList.remove('oculto');
    document.getElementById('reimprimir-cajero').classList.remove('oculto');
  }

  const tarjetaSinCaja = document.getElementById('tarjeta-sin-caja');
  const tarjetaCajaAbierta = document.getElementById('tarjeta-caja-abierta');

  const errorAbrirCaja = document.getElementById('error-abrir-caja');
  const formAbrirCaja = document.getElementById('form-abrir-caja');
  const campoMontoInicial = document.getElementById('monto-inicial');

  const cajaUsuarioEl = document.getElementById('caja-usuario');
  const cajaHoraAperturaEl = document.getElementById('caja-hora-apertura');
  const cajaMontoInicialEl = document.getElementById('caja-monto-inicial');
  const cajaTotalVentasEl = document.getElementById('caja-total-ventas');
  const cajaTotalEfectivoEl = document.getElementById('caja-total-efectivo');
  const cajaTotalTarjetaEl = document.getElementById('caja-total-tarjeta');
  const cajaTotalDepositoEl = document.getElementById('caja-total-deposito');
  const cajaTotalGastosEl = document.getElementById('caja-total-gastos');
  const cajaTotalIngresosEl = document.getElementById('caja-total-ingresos');
  const cajaEfectivoEsperadoEl = document.getElementById('caja-efectivo-esperado');

  const botonCerrarCaja = document.getElementById('boton-cerrar-caja');
  const fondoModalCierre = document.getElementById('fondo-modal-cierre');
  const pasoConteoCierre = document.getElementById('paso-conteo-cierre');
  const pasoResultadoCierre = document.getElementById('paso-resultado-cierre');
  const formCerrarCaja = document.getElementById('form-cerrar-caja');
  const campoMontoContado = document.getElementById('monto-contado');
  const errorCerrarCaja = document.getElementById('error-cerrar-caja');
  const cajaResultadoCierreCaja = document.getElementById('caja-resultado-cierre-caja');
  const campoMotivoDiferencia = document.getElementById('campo-motivo-diferencia');
  const motivoDiferenciaEl = document.getElementById('motivo-diferencia');
  const botonCancelarCierre = document.getElementById('boton-cancelar-cierre');
  const botonVolverConteo = document.getElementById('boton-volver-conteo');
  const botonConfirmarCierre = document.getElementById('boton-confirmar-cierre');

  const cuerpoHistorialCajas = document.getElementById('cuerpo-historial-cajas');
  const estadoVacioHistorial = document.getElementById('estado-vacio-historial');

  // Movimientos (gastos/ingresos)
  const errorAgregarMovimiento = document.getElementById('error-agregar-movimiento');
  const formAgregarMovimiento = document.getElementById('form-agregar-movimiento');
  const campoMovimientoDescripcion = document.getElementById('movimiento-descripcion');
  const campoMovimientoMonto = document.getElementById('movimiento-monto');
  const campoMovimientoTipo = document.getElementById('movimiento-tipo');
  const chipTipoGasto = document.getElementById('chip-tipo-gasto');
  const chipTipoIngreso = document.getElementById('chip-tipo-ingreso');
  const cuerpoListaMovimientos = document.getElementById('cuerpo-lista-movimientos');
  const estadoVacioMovimientos = document.getElementById('estado-vacio-movimientos');

  // Ventas del turno
  const cuerpoVentasTurno = document.getElementById('cuerpo-ventas-turno');
  const estadoVacioVentasTurno = document.getElementById('estado-vacio-ventas-turno');

  // Modal detalle de caja histórica
  const fondoModalDetalleCaja = document.getElementById('fondo-modal-detalle-caja');
  const contenidoDetalleCaja = document.getElementById('contenido-detalle-caja');
  const botonCerrarDetalleCaja = document.getElementById('boton-cerrar-detalle-caja');

  let cajaActual = null;
  // Datos del cálculo de cierre pendiente de confirmar.
  let calculoCierrePendiente = null;

  formAbrirCaja.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAbrirCaja.classList.remove('visible');

    const monto = parseFloat(campoMontoInicial.value);
    if (isNaN(monto) || monto < 0) {
      mostrarError(errorAbrirCaja, 'El monto inicial debe ser un número válido.');
      return;
    }

    // Evita que dos toques rápidos en "Abrir caja" creen dos cajas
    // abiertas al mismo tiempo antes de que termine el primer guardado.
    const botonAbrir = formAbrirCaja.querySelector('button[type="submit"]');
    if (botonAbrir.disabled) return;
    botonAbrir.disabled = true;

    const responsable = await Pin.pedir('Abrir caja');
    if (!responsable) {
      botonAbrir.disabled = false;
      return;
    }

    try {
      await DB.agregar(DB.STORES.CAJAS, {
        usuarioId: responsable.id,
        fechaApertura: Date.now(),
        montoInicial: monto,
        fechaCierre: null,
        montoContado: null,
        diferencia: null,
        cerrada: false,
      });

      formAbrirCaja.reset();
      await cargarEstadoCaja();
    } catch (err) {
      mostrarError(errorAbrirCaja, 'No se pudo abrir la caja.');
    } finally {
      botonAbrir.disabled = false;
    }
  });

  botonCerrarCaja.addEventListener('click', () => {
    if (!esAdmin || !cajaActual) return;
    campoMontoContado.value = '';
    errorCerrarCaja.classList.remove('visible');
    calculoCierrePendiente = null;
    pasoConteoCierre.classList.remove('oculto');
    pasoResultadoCierre.classList.add('oculto');
    fondoModalCierre.classList.remove('oculto');
    campoMontoContado.focus();
  });

  botonCancelarCierre.addEventListener('click', () => {
    fondoModalCierre.classList.add('oculto');
  });

  document.getElementById('boton-cerrar-modal-cierre-x').addEventListener('click', () => {
    fondoModalCierre.classList.add('oculto');
  });

  fondoModalCierre.addEventListener('click', (e) => {
    if (e.target === fondoModalCierre) fondoModalCierre.classList.add('oculto');
  });

  botonVolverConteo.addEventListener('click', () => {
    pasoConteoCierre.classList.remove('oculto');
    pasoResultadoCierre.classList.add('oculto');
  });

  formCerrarCaja.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!esAdmin) return;
    errorCerrarCaja.classList.remove('visible');

    const contado = parseFloat(campoMontoContado.value);
    if (isNaN(contado) || contado < 0) {
      mostrarError(errorCerrarCaja, 'El monto contado debe ser un número válido.');
      return;
    }

    const totales = await calcularTotalesTurno(cajaActual);
    const movimientos = await calcularMovimientosTurno(cajaActual);
    const efectivoEsperado =
      cajaActual.montoInicial + totales.efectivo - movimientos.gastos + movimientos.ingresos;
    const diferencia = contado - efectivoEsperado;

    calculoCierrePendiente = { contado, efectivoEsperado, diferencia };

    let claseResultado = 'caja-resultado-cierre--exacto';
    let titulo = '✅ La caja cuadra perfecto';
    if (diferencia > 0.005) {
      claseResultado = 'caja-resultado-cierre--sobra';
      titulo = `Sobran ${formatearMoneda(diferencia)}`;
    } else if (diferencia < -0.005) {
      claseResultado = 'caja-resultado-cierre--falta';
      titulo = `Faltan ${formatearMoneda(Math.abs(diferencia))}`;
    }

    cajaResultadoCierreCaja.innerHTML = `
      <div class="caja-resultado-cierre ${claseResultado}">
        <p class="caja-resultado-cierre__titulo">${titulo}</p>
        <p class="caja-resultado-cierre__detalle">
          Efectivo esperado: ${formatearMoneda(efectivoEsperado)} · Contado: ${formatearMoneda(contado)}
        </p>
      </div>
    `;

    // Si no cuadra exacto, se pide (opcionalmente) anotar el motivo —
    // ej. "faltan Q200 porque se compró comida" — para que quede
    // registrado en el historial y no sea un misterio después.
    campoMotivoDiferencia.classList.toggle('oculto', diferencia > -0.005 && diferencia < 0.005);
    motivoDiferenciaEl.value = '';

    pasoConteoCierre.classList.add('oculto');
    pasoResultadoCierre.classList.remove('oculto');
  });

  botonConfirmarCierre.addEventListener('click', async () => {
    if (!esAdmin || !cajaActual || !calculoCierrePendiente) return;
    if (botonConfirmarCierre.disabled) return;
    botonConfirmarCierre.disabled = true;

    const responsable = await Pin.pedir('Cerrar caja');
    if (!responsable) {
      botonConfirmarCierre.disabled = false;
      return;
    }

    try {
      const cajaActualizada = {
        ...cajaActual,
        fechaCierre: Date.now(),
        montoContado: calculoCierrePendiente.contado,
        diferencia: calculoCierrePendiente.diferencia,
        motivoDiferencia: motivoDiferenciaEl.value.trim(),
        usuarioCierreId: responsable.id,
        cerrada: true,
      };
      await DB.actualizar(DB.STORES.CAJAS, cajaActualizada);

      fondoModalCierre.classList.add('oculto');
      calculoCierrePendiente = null;
      await cargarEstadoCaja();
    } catch (err) {
      mostrarError(errorCerrarCaja, 'No se pudo cerrar la caja.');
    } finally {
      botonConfirmarCierre.disabled = false;
    }
  });

  // --- Movimientos de caja (gastos/ingresos) ---

  chipTipoGasto.addEventListener('click', () => seleccionarTipoMovimiento('gasto'));
  chipTipoIngreso.addEventListener('click', () => seleccionarTipoMovimiento('ingreso'));

  function seleccionarTipoMovimiento(tipo) {
    campoMovimientoTipo.value = tipo;
    chipTipoGasto.classList.toggle('chip-tipo-movimiento--activo', tipo === 'gasto');
    chipTipoIngreso.classList.toggle('chip-tipo-movimiento--activo', tipo === 'ingreso');
  }

  formAgregarMovimiento.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAgregarMovimiento.classList.remove('visible');

    if (!cajaActual) {
      mostrarError(errorAgregarMovimiento, 'No hay una caja abierta.');
      return;
    }

    const descripcion = campoMovimientoDescripcion.value.trim();
    const monto = parseFloat(campoMovimientoMonto.value);
    const tipo = campoMovimientoTipo.value === 'ingreso' ? 'ingreso' : 'gasto';

    if (!descripcion) {
      mostrarError(errorAgregarMovimiento, 'Ingresa una descripción.');
      return;
    }
    if (isNaN(monto) || monto <= 0) {
      mostrarError(errorAgregarMovimiento, 'El monto debe ser un número válido mayor a cero.');
      return;
    }

    const botonRegistrar = formAgregarMovimiento.querySelector('button[type="submit"]');
    if (botonRegistrar.disabled) return;
    botonRegistrar.disabled = true;

    const responsable = await Pin.pedir(tipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto');
    if (!responsable) {
      botonRegistrar.disabled = false;
      return;
    }

    try {
      await DB.agregar(DB.STORES.GASTOS, {
        fecha: Date.now(),
        usuarioId: responsable.id,
        cajaId: cajaActual.id,
        descripcion,
        monto,
        tipo,
      });

      formAgregarMovimiento.reset();
      seleccionarTipoMovimiento('gasto');
      await cargarEstadoCaja();
      if (!esAdmin) {
        // El cajero no ve la lista de movimientos: se le confirma de otra forma.
        const exitoMovimiento = document.getElementById('exito-movimiento');
        exitoMovimiento.textContent = tipo === 'ingreso' ? 'Ingreso registrado.' : 'Gasto registrado.';
        exitoMovimiento.classList.remove('oculto');
        setTimeout(() => exitoMovimiento.classList.add('oculto'), 4000);
      }
    } catch (err) {
      mostrarError(errorAgregarMovimiento, 'No se pudo registrar el movimiento.');
    } finally {
      botonRegistrar.disabled = false;
    }
  });

  // ---------- Cajero: reimprimir un recibo del turno por su número ----------
  // El cajero no ve el listado de ventas; con el número impreso en el ticket
  // del cliente puede reimprimirlo sin ver ningún monto en pantalla.
  const formReimprimirCajero = document.getElementById('form-reimprimir-cajero');
  formReimprimirCajero.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoNumero = document.getElementById('reimprimir-numero');
    const errorEl = document.getElementById('error-reimprimir');
    const exitoEl = document.getElementById('exito-reimprimir');
    const boton = document.getElementById('boton-reimprimir-numero');
    errorEl.classList.remove('visible');
    exitoEl.classList.add('oculto');
    if (boton.disabled) return;

    if (!ImpresoraBLE.disponible()) {
      mostrarError(errorEl, 'Este navegador no permite imprimir. Abre la app en Bluefy para imprimir el recibo.');
      return;
    }
    const numero = parseInt(campoNumero.value, 10);
    if (!cajaActual || isNaN(numero)) {
      mostrarError(errorEl, 'Escribe el número de recibo.');
      return;
    }

    boton.disabled = true;
    try {
      // La búsqueda va dentro de la promesa para que la conexión Bluetooth
      // se inicie dentro del toque del usuario.
      const datos = (async () => {
        const ventas = await obtenerVentasDelTurno(cajaActual);
        const venta = ventas.find((v) => v.numeroRecibo === numero);
        if (!venta) throw new Error(`No hay un recibo número ${numero} en este turno.`);
        if (venta.cancelada) throw new Error(`El recibo ${numero} fue cancelado.`);
        const usuario = await DB.obtenerPorId(DB.STORES.USUARIOS, venta.usuarioId);
        return cargarDatosRecibo(venta, usuario ? usuario.nombre : '');
      })();
      await ImpresoraBLE.imprimir(datos);
      exitoEl.textContent = `Recibo ${numero} enviado a la impresora.`;
      exitoEl.classList.remove('oculto');
      formReimprimirCajero.reset();
    } catch (error) {
      if (error.name !== 'NotFoundError') mostrarError(errorEl, error.message);
    } finally {
      boton.disabled = false;
    }
  });

  function mostrarError(elemento, mensaje) {
    elemento.textContent = mensaje;
    elemento.classList.add('visible');
  }

  function formatearMoneda(numero) {
    return 'Q ' + numero.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  async function obtenerVentasDelTurno(caja) {
    const todasLasVentas = await DB.obtenerTodos(DB.STORES.VENTAS);
    return todasLasVentas.filter((venta) => {
      if (venta.cajaId !== undefined && venta.cajaId !== null) {
        return venta.cajaId === caja.id;
      }
      const despuesDeApertura = venta.fecha >= caja.fechaApertura;
      const antesDeCierre = caja.fechaCierre ? venta.fecha <= caja.fechaCierre : true;
      return despuesDeApertura && antesDeCierre;
    });
  }

  async function obtenerMovimientosDelTurno(caja) {
    const todosLosMovimientos = await DB.obtenerTodos(DB.STORES.GASTOS);
    return todosLosMovimientos.filter((mov) => {
      if (mov.cajaId !== undefined && mov.cajaId !== null) {
        return mov.cajaId === caja.id;
      }
      const despuesDeApertura = mov.fecha >= caja.fechaApertura;
      const antesDeCierre = caja.fechaCierre ? mov.fecha <= caja.fechaCierre : true;
      return despuesDeApertura && antesDeCierre;
    });
  }

  async function calcularMovimientosTurno(caja) {
    const movimientos = await obtenerMovimientosDelTurno(caja);
    let gastos = 0;
    let ingresos = 0;
    movimientos.forEach((mov) => {
      const tipo = mov.tipo || 'gasto';
      if (tipo === 'ingreso') ingresos += mov.monto || 0;
      else gastos += mov.monto || 0;
    });
    return { gastos, ingresos };
  }

  async function calcularTotalesTurno(caja) {
    const ventasTurno = (await obtenerVentasDelTurno(caja)).filter((v) => !v.cancelada);
    const totales = { efectivo: 0, tarjeta: 0, deposito: 0, pedidosya: 0 };

    ventasTurno.forEach((venta) => {
      if (venta.metodoPago === 'efectivo') totales.efectivo += venta.total;
      else if (venta.metodoPago === 'tarjeta') totales.tarjeta += venta.total;
      else if (venta.metodoPago === 'deposito') totales.deposito += venta.total;
      else if (venta.metodoPago === 'pedidosya') totales.pedidosya += venta.total;
    });

    return totales;
  }

  async function obtenerCajaAbierta() {
    // 'cerrada' es booleano: los índices de IndexedDB no aceptan booleanos
    // como clave de búsqueda (lanza DataError), así que se filtra en memoria.
    const todasLasCajas = await DB.obtenerTodos(DB.STORES.CAJAS);
    const cajasAbiertas = todasLasCajas.filter((c) => !c.cerrada);
    if (!cajasAbiertas || cajasAbiertas.length === 0) return null;

    cajasAbiertas.sort((a, b) => b.fechaApertura - a.fechaApertura);
    return cajasAbiertas[0];
  }

  async function pintarMovimientos(caja, cuerpoTabla, estadoVacio, permitirEliminar) {
    const movimientos = await obtenerMovimientosDelTurno(caja);
    movimientos.sort((a, b) => b.fecha - a.fecha);

    cuerpoTabla.innerHTML = '';

    if (movimientos.length === 0) {
      estadoVacio.classList.remove('oculto');
      return;
    }
    estadoVacio.classList.add('oculto');

    for (const mov of movimientos) {
      const tipo = mov.tipo || 'gasto';
      const usuario = await DB.obtenerPorId(DB.STORES.USUARIOS, mov.usuarioId);
      const nombreUsuario = usuario ? usuario.nombre : 'Desconocido';
      const etiquetaTipo =
        tipo === 'ingreso'
          ? '<span class="etiqueta-movimiento etiqueta-movimiento--ingreso">🟢 Ingreso</span>'
          : '<span class="etiqueta-movimiento etiqueta-movimiento--gasto">🔴 Gasto</span>';
      const signo = tipo === 'ingreso' ? '+ ' : '− ';

      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${etiquetaTipo}</td>
        <td>${new Date(mov.fecha).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${escaparHtml(mov.descripcion)}</td>
        <td>${signo}${formatearMoneda(mov.monto)}</td>
        <td>${escaparHtml(nombreUsuario)}</td>
        <td>${permitirEliminar ? `<button type="button" class="boton-eliminar-movimiento" data-id="${mov.id}" title="Eliminar">🗑️</button>` : ''}</td>
      `;
      cuerpoTabla.appendChild(fila);
    }

    if (permitirEliminar) {
      cuerpoTabla.querySelectorAll('.boton-eliminar-movimiento').forEach((boton) => {
        boton.addEventListener('click', async () => {
          const id = parseInt(boton.dataset.id, 10);
          if (!window.confirm('¿Eliminar este movimiento?')) return;
          const responsable = await Pin.pedir('Eliminar movimiento');
          if (!responsable) return;
          try {
            await DB.eliminar(DB.STORES.GASTOS, id);
            await cargarEstadoCaja();
          } catch (err) {
            window.alert('No se pudo eliminar el movimiento.');
          }
        });
      });
    }
  }

  // Arma los datos del recibo de una venta ya registrada (mismo formato que
  // usa Reportes para reimprimir).
  async function cargarDatosRecibo(venta, nombreCajero) {
    let telefonoNegocio = '';
    let direccionNegocio = '';
    try {
      const ajustes = await DB.obtenerPorId(DB.STORES.AJUSTES, 1);
      telefonoNegocio = ajustes && ajustes.telefonoNegocio ? ajustes.telefonoNegocio : '';
      direccionNegocio = ajustes && ajustes.direccionNegocio ? ajustes.direccionNegocio : '';
    } catch (err) {
      // sin ajustes: el recibo sale sin teléfono ni dirección
    }

    const detalle = await DB.obtenerPorIndice(DB.STORES.DETALLE_VENTA, 'ventaId', venta.id);
    return {
      numeroRecibo: venta.numeroRecibo,
      fecha: venta.fecha,
      cajero: nombreCajero,
      metodoPago: venta.metodoPago,
      lineas: detalle.map((d) => ({
        nombre: d.nombreProducto,
        precio: d.precioUnitario,
        cantidad: d.cantidad,
        extra: d.extra || 0,
        nota: d.nota || '',
      })),
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
    };
  }

  async function reimprimirVenta(venta, nombreCajero, boton) {
    if (!ImpresoraBLE.disponible()) {
      window.alert('Este navegador no permite imprimir. Abre la app en Bluefy para imprimir el recibo.');
      return;
    }
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Imprimiendo...';
    try {
      // Se pasa la promesa (no el resultado) para que la conexión Bluetooth
      // se inicie dentro del toque del usuario.
      await ImpresoraBLE.imprimir(cargarDatosRecibo(venta, nombreCajero));
    } catch (error) {
      if (error.name !== 'NotFoundError') window.alert(`No se pudo imprimir: ${error.message}`);
    } finally {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  // Las ventas se muestran de 20 en 20 con Anterior / Siguiente: con 100 o más
  // ventas en un turno, recorrer una lista enorme con scroll es tedioso.
  const VENTAS_POR_PAGINA = 20;
  const paginaPorTabla = new WeakMap();

  function barraPaginacion(cuerpoTabla) {
    const envoltorio = cuerpoTabla.closest('.tabla-reportes-envoltorio');
    let barra = envoltorio.nextElementSibling;
    if (!barra || !barra.classList.contains('paginacion-ventas')) {
      barra = document.createElement('div');
      barra.className = 'paginacion-ventas';
      barra.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;margin:12px 0;flex-wrap:wrap;';
      envoltorio.insertAdjacentElement('afterend', barra);
    }
    return barra;
  }

  async function pintarVentasTurno(caja, cuerpoTabla, estadoVacio, paginaSolicitada) {
    const ventas = await obtenerVentasDelTurno(caja);
    ventas.sort((a, b) => b.fecha - a.fecha);

    cuerpoTabla.innerHTML = '';
    const barra = barraPaginacion(cuerpoTabla);
    barra.innerHTML = '';

    if (ventas.length === 0) {
      estadoVacio.classList.remove('oculto');
      return;
    }
    estadoVacio.classList.add('oculto');

    const totalPaginas = Math.ceil(ventas.length / VENTAS_POR_PAGINA);
    let pagina = paginaSolicitada !== undefined ? paginaSolicitada : (paginaPorTabla.get(cuerpoTabla) || 0);
    pagina = Math.min(Math.max(pagina, 0), totalPaginas - 1);
    paginaPorTabla.set(cuerpoTabla, pagina);
    const ventasPagina = ventas.slice(pagina * VENTAS_POR_PAGINA, (pagina + 1) * VENTAS_POR_PAGINA);

    if (totalPaginas > 1) {
      const crearBoton = (texto, destino, deshabilitado) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'boton boton-secundario';
        b.textContent = texto;
        b.disabled = deshabilitado;
        b.addEventListener('click', () => pintarVentasTurno(caja, cuerpoTabla, estadoVacio, destino));
        return b;
      };
      const info = document.createElement('span');
      info.style.fontSize = '14px';
      const desde = pagina * VENTAS_POR_PAGINA + 1;
      const hasta = Math.min((pagina + 1) * VENTAS_POR_PAGINA, ventas.length);
      info.textContent = `Página ${pagina + 1} de ${totalPaginas} (ventas ${desde}-${hasta} de ${ventas.length})`;
      barra.append(crearBoton('‹ Anterior', pagina - 1, pagina === 0), info, crearBoton('Siguiente ›', pagina + 1, pagina === totalPaginas - 1));
    }

    // Nombre del vendedor/usuario que hizo cada venta (venta.usuarioId).
    const nombresPorId = new Map();
    for (const u of await DB.obtenerTodos(DB.STORES.USUARIOS)) nombresPorId.set(u.id, u.nombre);

    for (const venta of ventasPagina) {
      const fila = document.createElement('tr');
      if (venta.cancelada) fila.classList.add('fila-venta-cancelada');

      const tipoVenta = venta.esPedidosYa ? 'Pedidos Ya' : venta.esDomicilio ? 'Domicilio' : 'Local';
      const nombresMetodo = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', deposito: 'Depósito', pedidosya: 'Pedidos Ya' };
      const metodo = nombresMetodo[venta.metodoPago] || '—';
      const etiquetaCancelada = venta.cancelada
        ? '<span class="etiqueta-venta-cancelada" title="Venta cancelada">Cancelada</span>'
        : '';

      fila.innerHTML = `
        <td>${escaparHtml(venta.numeroRecibo || '-')} ${etiquetaCancelada}</td>
        <td>${new Date(venta.fecha).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${metodo}${detallePagoHtml(venta)}</td>
        <td>${tipoVenta}</td>
        <td>${venta.clienteNombre ? escaparHtml(venta.clienteNombre) : '-'}</td>
        <td>${nombresPorId.has(venta.usuarioId) ? escaparHtml(nombresPorId.get(venta.usuarioId)) : '-'}</td>
        <td>${formatearMoneda(venta.total || 0)}</td>
        <td>${venta.cancelada ? '' : '<button type="button" class="boton-reimprimir-recibo">🖨️ Reimprimir</button>'}</td>
      `;

      const botonReimprimir = fila.querySelector('.boton-reimprimir-recibo');
      if (botonReimprimir) {
        const nombreCajero = nombresPorId.has(venta.usuarioId) ? nombresPorId.get(venta.usuarioId) : '';
        botonReimprimir.addEventListener('click', () => reimprimirVenta(venta, nombreCajero, botonReimprimir));
      }
      cuerpoTabla.appendChild(fila);
    }
  }

  async function cargarEstadoCaja() {
    cajaActual = await obtenerCajaAbierta();

    if (!cajaActual) {
      tarjetaSinCaja.classList.remove('oculto');
      tarjetaCajaAbierta.classList.add('oculto');
      if (esAdmin) await cargarHistorial();
      return;
    }

    tarjetaSinCaja.classList.add('oculto');
    tarjetaCajaAbierta.classList.remove('oculto');

    const usuarioApertura = await DB.obtenerPorId(DB.STORES.USUARIOS, cajaActual.usuarioId);
    cajaUsuarioEl.textContent = usuarioApertura ? usuarioApertura.nombre : 'Desconocido';
    cajaHoraAperturaEl.textContent = new Date(cajaActual.fechaApertura).toLocaleString('es-GT');

    // El cajero termina aquí: sin montos, totales, listas ni historial.
    if (!esAdmin) return;

    cajaMontoInicialEl.textContent = formatearMoneda(cajaActual.montoInicial);

    const totales = await calcularTotalesTurno(cajaActual);
    const movimientos = await calcularMovimientosTurno(cajaActual);
    const efectivoEsperado =
      cajaActual.montoInicial + totales.efectivo - movimientos.gastos + movimientos.ingresos;

    cajaTotalVentasEl.textContent = formatearMoneda(totales.efectivo + totales.tarjeta + totales.deposito + totales.pedidosya);
    cajaTotalEfectivoEl.textContent = formatearMoneda(totales.efectivo);
    cajaTotalTarjetaEl.textContent = formatearMoneda(totales.tarjeta);
    cajaTotalDepositoEl.textContent = formatearMoneda(totales.deposito);
    document.getElementById('caja-total-pedidosya').textContent = formatearMoneda(totales.pedidosya);
    cajaTotalGastosEl.textContent = '− ' + formatearMoneda(movimientos.gastos);
    cajaTotalIngresosEl.textContent = '+ ' + formatearMoneda(movimientos.ingresos);
    cajaEfectivoEsperadoEl.textContent = formatearMoneda(efectivoEsperado);

    await pintarMovimientos(cajaActual, cuerpoListaMovimientos, estadoVacioMovimientos, true);
    await pintarVentasTurno(cajaActual, cuerpoVentasTurno, estadoVacioVentasTurno);

    await cargarHistorial();
  }

  async function cargarHistorial() {
    const todasLasCajas = await DB.obtenerTodos(DB.STORES.CAJAS);
    const cajasCerradas = todasLasCajas.filter((c) => !!c.cerrada);
    cajasCerradas.sort((a, b) => b.fechaApertura - a.fechaApertura);

    cuerpoHistorialCajas.innerHTML = '';

    if (cajasCerradas.length === 0) {
      estadoVacioHistorial.classList.remove('oculto');
      return;
    }

    estadoVacioHistorial.classList.add('oculto');

    for (const caja of cajasCerradas) {
      const usuarioApertura = await DB.obtenerPorId(DB.STORES.USUARIOS, caja.usuarioId);
      const nombreUsuarioApertura = usuarioApertura ? usuarioApertura.nombre : 'Desconocido';

      // Cajas cerradas antes de este cambio no tienen usuarioCierreId
      // guardado — en ese caso se asume que la cerró quien la abrió.
      const idUsuarioCierre = caja.usuarioCierreId != null ? caja.usuarioCierreId : caja.usuarioId;
      const usuarioCierre = await DB.obtenerPorId(DB.STORES.USUARIOS, idUsuarioCierre);
      const nombreUsuarioCierre = usuarioCierre ? usuarioCierre.nombre : 'Desconocido';

      const diferencia = typeof caja.diferencia === 'number' ? caja.diferencia : 0;
      let claseDiferencia = 'caja-diferencia--exacto';
      if (diferencia > 0.005) claseDiferencia = 'caja-diferencia--sobra';
      else if (diferencia < -0.005) claseDiferencia = 'caja-diferencia--falta';

      const fila = document.createElement('tr');
      fila.classList.add('fila-historial-caja');
      fila.dataset.cajaId = caja.id;
      fila.innerHTML = `
        <td>${new Date(caja.fechaApertura).toLocaleString('es-GT')}</td>
        <td>${caja.fechaCierre ? new Date(caja.fechaCierre).toLocaleString('es-GT') : '-'}</td>
        <td>${escaparHtml(nombreUsuarioApertura)}</td>
        <td>${escaparHtml(nombreUsuarioCierre)}</td>
        <td>${formatearMoneda(caja.montoInicial)}</td>
        <td>${caja.montoContado !== null ? formatearMoneda(caja.montoContado) : '-'}</td>
        <td class="${claseDiferencia}">
          ${formatearMoneda(diferencia)}
          ${caja.motivoDiferencia ? `<span title="${escaparHtml(caja.motivoDiferencia)}">📝</span>` : ''}
        </td>
      `;
      fila.addEventListener('click', () => abrirDetalleCajaHistorica(caja));
      cuerpoHistorialCajas.appendChild(fila);
    }
  }

  // --- Modal de detalle de caja histórica ---

  async function abrirDetalleCajaHistorica(caja) {
    const idUsuarioCierre = caja.usuarioCierreId != null ? caja.usuarioCierreId : caja.usuarioId;
    const [usuarioApertura, usuarioCierre, totales, movimientos] = await Promise.all([
      DB.obtenerPorId(DB.STORES.USUARIOS, caja.usuarioId),
      DB.obtenerPorId(DB.STORES.USUARIOS, idUsuarioCierre),
      calcularTotalesTurno(caja),
      calcularMovimientosTurno(caja),
    ]);

    const efectivoEsperado =
      caja.montoInicial + totales.efectivo - movimientos.gastos + movimientos.ingresos;
    const diferencia = typeof caja.diferencia === 'number' ? caja.diferencia : 0;
    let claseDiferencia = 'caja-diferencia--exacto';
    if (diferencia > 0.005) claseDiferencia = 'caja-diferencia--sobra';
    else if (diferencia < -0.005) claseDiferencia = 'caja-diferencia--falta';

    contenidoDetalleCaja.innerHTML = `
      <div class="caja-info-lista">
        <div class="caja-info-fila">
          <span>Abierta por</span>
          <span>${escaparHtml(usuarioApertura ? usuarioApertura.nombre : 'Desconocido')}</span>
        </div>
        <div class="caja-info-fila">
          <span>Cerrada por</span>
          <span>${escaparHtml(usuarioCierre ? usuarioCierre.nombre : 'Desconocido')}</span>
        </div>
        <div class="caja-info-fila">
          <span>Apertura</span>
          <span>${new Date(caja.fechaApertura).toLocaleString('es-GT')}</span>
        </div>
        <div class="caja-info-fila">
          <span>Cierre</span>
          <span>${caja.fechaCierre ? new Date(caja.fechaCierre).toLocaleString('es-GT') : '-'}</span>
        </div>
        <div class="caja-info-fila">
          <span>Monto inicial</span>
          <span>${formatearMoneda(caja.montoInicial)}</span>
        </div>
        <div class="caja-info-fila">
          <span>Monto contado</span>
          <span>${caja.montoContado !== null ? formatearMoneda(caja.montoContado) : '-'}</span>
        </div>
        <div class="caja-info-fila">
          <span>Diferencia</span>
          <span class="${claseDiferencia}">${formatearMoneda(diferencia)}</span>
        </div>
        ${
          caja.motivoDiferencia
            ? `<div class="caja-info-fila caja-info-fila--nota">
                <span>📝 Motivo</span>
                <span>${escaparHtml(caja.motivoDiferencia)}</span>
              </div>`
            : ''
        }
      </div>

      <div class="caja-resumen-item caja-resumen-item--total-ventas">
        <span class="caja-resumen-item__etiqueta">💰 Ventas totales del turno</span>
        <span class="caja-resumen-item__valor">${formatearMoneda(totales.efectivo + totales.tarjeta + totales.deposito + totales.pedidosya)}</span>
      </div>

      <div class="caja-resumen-grid">
        <div class="caja-resumen-item">
          <span class="caja-resumen-item__etiqueta">💵 Efectivo</span>
          <span class="caja-resumen-item__valor">${formatearMoneda(totales.efectivo)}</span>
        </div>
        <div class="caja-resumen-item">
          <span class="caja-resumen-item__etiqueta">💳 Tarjeta</span>
          <span class="caja-resumen-item__valor">${formatearMoneda(totales.tarjeta)}</span>
        </div>
        <div class="caja-resumen-item">
          <span class="caja-resumen-item__etiqueta">🏦 Depósito/transferencia</span>
          <span class="caja-resumen-item__valor">${formatearMoneda(totales.deposito)}</span>
        </div>
        <div class="caja-resumen-item">
          <span class="caja-resumen-item__etiqueta">🛍️ Pedidos Ya (se cobra a su cuenta)</span>
          <span class="caja-resumen-item__valor">${formatearMoneda(totales.pedidosya)}</span>
        </div>
        <div class="caja-resumen-item">
          <span class="caja-resumen-item__etiqueta">Gastos del turno</span>
          <span class="caja-resumen-item__valor">− ${formatearMoneda(movimientos.gastos)}</span>
        </div>
        <div class="caja-resumen-item">
          <span class="caja-resumen-item__etiqueta">Ingresos del turno</span>
          <span class="caja-resumen-item__valor">+ ${formatearMoneda(movimientos.ingresos)}</span>
        </div>
        <div class="caja-resumen-item caja-resumen-item--esperado">
          <span class="caja-resumen-item__etiqueta">Efectivo esperado</span>
          <span class="caja-resumen-item__valor">${formatearMoneda(efectivoEsperado)}</span>
        </div>
      </div>

      <h4>Gastos e ingresos del turno (aparte de las ventas)</h4>
      <div class="tabla-reportes-envoltorio">
        <table class="tabla-reportes">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Hora</th>
              <th>Descripción</th>
              <th>Monto</th>
              <th>Registrado por</th>
            </tr>
          </thead>
          <tbody id="cuerpo-detalle-movimientos"></tbody>
        </table>
      </div>
      <div id="estado-vacio-detalle-movimientos" class="estado-vacio oculto">
        <span class="icono">🧾</span>
        <p>No se registraron gastos ni ingresos aparte de las ventas en este turno.</p>
      </div>

      <h4>Ventas del turno</h4>
      <div class="tabla-reportes-envoltorio">
        <table class="tabla-reportes">
          <thead>
            <tr>
              <th>Recibo</th>
              <th>Hora</th>
              <th>Método</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Cajero</th>
              <th>Total</th>
              <th>Recibo</th>
            </tr>
          </thead>
          <tbody id="cuerpo-detalle-ventas"></tbody>
        </table>
      </div>
      <div id="estado-vacio-detalle-ventas" class="estado-vacio oculto">
        <span class="icono">🧺</span>
        <p>No hubo ventas en este turno.</p>
      </div>
    `;

    const cuerpoDetalleMovimientos = document.getElementById('cuerpo-detalle-movimientos');
    const estadoVacioDetalleMovimientos = document.getElementById('estado-vacio-detalle-movimientos');
    const cuerpoDetalleVentas = document.getElementById('cuerpo-detalle-ventas');
    const estadoVacioDetalleVentas = document.getElementById('estado-vacio-detalle-ventas');

    await pintarMovimientos(caja, cuerpoDetalleMovimientos, estadoVacioDetalleMovimientos, false);
    await pintarVentasTurno(caja, cuerpoDetalleVentas, estadoVacioDetalleVentas);

    fondoModalDetalleCaja.classList.remove('oculto');
  }

  botonCerrarDetalleCaja.addEventListener('click', () => {
    fondoModalDetalleCaja.classList.add('oculto');
  });

  document.getElementById('boton-cerrar-detalle-caja-x').addEventListener('click', () => {
    fondoModalDetalleCaja.classList.add('oculto');
  });

  fondoModalDetalleCaja.addEventListener('click', (e) => {
    if (e.target === fondoModalDetalleCaja) fondoModalDetalleCaja.classList.add('oculto');
  });

  await cargarEstadoCaja();
});

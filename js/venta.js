/**
 * venta.js — Pantalla de punto de venta (pages/venta.html).
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

  const avisoCajaCerradaEl = document.getElementById('aviso-caja-cerrada');
  const ventaLayoutEl = document.getElementById('venta-layout');

  // ---------- Candado de caja: no se puede vender sin una caja abierta ----------
  // Nota: 'cerrada' es booleano y los índices de IndexedDB no aceptan
  // booleanos como clave de búsqueda (DataError) — se filtra en memoria.
  const todasLasCajas = await DB.obtenerTodos(DB.STORES.CAJAS);
  const cajasAbiertas = todasLasCajas.filter((c) => !c.cerrada);
  const cajaActiva = cajasAbiertas.length
    ? cajasAbiertas.sort((a, b) => b.fechaApertura - a.fechaApertura)[0]
    : null;

  if (!cajaActiva) {
    avisoCajaCerradaEl.classList.remove('oculto');
    ventaLayoutEl.classList.add('oculto');
    return;
  }

  const buscadorVentaEl = document.getElementById('buscador-venta');
  const categoriasEl = document.getElementById('venta-categorias');
  const grillaEl = document.getElementById('venta-grilla');
  const estadoVacioProductosEl = document.getElementById('venta-estado-vacio');

  const carritoListaEl = document.getElementById('carrito-lista');
  const carritoVacioEl = document.getElementById('carrito-vacio');
  const carritoTotalMontoEl = document.getElementById('carrito-total-monto');
  const ventaErrorEl = document.getElementById('venta-error');
  const botonConfirmarEl = document.getElementById('boton-confirmar-venta');

  const chipsPago = Array.from(document.querySelectorAll('.chip-pago'));
  const campoEfectivoRecibidoWrap = document.getElementById('campo-efectivo-recibido');
  const efectivoRecibidoEl = document.getElementById('efectivo-recibido');
  const resultadoVueltoEl = document.getElementById('resultado-vuelto');

  const fondoRecibo = document.getElementById('fondo-recibo');
  const reciboContenidoEl = document.getElementById('recibo-contenido');
  const reciboCanvas = document.getElementById('recibo-canvas');
  const botonCompartirRecibo = document.getElementById('boton-compartir-recibo');
  const botonImprimirDirecto = document.getElementById('boton-imprimir-directo');
  const botonNuevaVenta = document.getElementById('boton-nueva-venta');
  const enlaceDescargaRecibo = document.getElementById('enlace-descarga-recibo');
  let ultimaVentaParaRecibo = null;

  let productos = [];
  let categoriaActiva = 'Todos';
  let carrito = []; // { lineaId, productoId, nombre, precio, cantidad, extra, nota }
  let siguienteLineaId = 1;
  let metodoPago = null;
  let telefonoNegocio = '';
  let direccionNegocio = '';

  async function cargarAjustes() {
    try {
      const ajustes = await DB.obtenerPorId(DB.STORES.AJUSTES, 1);
      telefonoNegocio = ajustes && ajustes.telefonoNegocio ? ajustes.telefonoNegocio : '';
      direccionNegocio = ajustes && ajustes.direccionNegocio ? ajustes.direccionNegocio : '';
    } catch (err) {
      telefonoNegocio = '';
      direccionNegocio = '';
    }
  }
  let ultimoReciboBlob = null;
  let urlsFotosGrilla = [];
  let clientes = [];

  // ---------- Entrega: mostrador o domicilio ----------
  const chipsEntrega = Array.from(document.querySelectorAll('.chip-entrega'));
  const domicilioCamposEl = document.getElementById('domicilio-campos');
  const domicilioNombreEl = document.getElementById('domicilio-nombre');
  const domicilioTelefonoEl = document.getElementById('domicilio-telefono');
  const domicilioDireccionEl = document.getElementById('domicilio-direccion');
  const domicilioCostoEnvioEl = document.getElementById('domicilio-costo-envio');
  const domicilioTelefonoAlternoEl = document.getElementById('domicilio-telefono-alterno');
  const domicilioNotasEl = document.getElementById('domicilio-notas');
  const domicilioExtrasManualEl = document.getElementById('domicilio-extras-manual');
  const pedidosYaCamposEl = document.getElementById('pedidosya-campos');
  const pedidosYaNombreEl = document.getElementById('pedidosya-nombre');
  const contenedorMetodoPagoEl = document.querySelector('.metodo-pago');
  let esDomicilio = false;
  let esPedidosYa = false;

  // ---------- Cliente opcional ----------
  const ventaClienteSelectEl = document.getElementById('venta-cliente-select');
  const domicilioCamposClienteManualEl = document.getElementById('domicilio-campos-cliente-manual');
  const domicilioClienteInfoEl = document.getElementById('domicilio-cliente-info');
  const domicilioClienteInfoNombreEl = document.getElementById('domicilio-cliente-info-nombre');

  async function cargarClientes() {
    try {
      clientes = await DB.obtenerTodos(DB.STORES.CLIENTES);
      clientes.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    } catch (err) {
      clientes = [];
    }
    ventaClienteSelectEl.innerHTML = '<option value="">— Sin cliente —</option>';
    clientes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      // El teléfono ayuda a distinguir clientes con el mismo nombre.
      opt.textContent = c.telefono ? `${c.nombre} · ${c.telefono}` : c.nombre;
      ventaClienteSelectEl.appendChild(opt);
    });
  }

  const ventaClienteTelefonoEl = document.getElementById('venta-cliente-telefono');

  function actualizarTelefonoClienteSeleccionado() {
    const cliente = obtenerClienteSeleccionado();
    if (cliente && cliente.telefono) {
      ventaClienteTelefonoEl.textContent = `📞 ${cliente.telefono}`;
      ventaClienteTelefonoEl.classList.remove('oculto');
    } else {
      ventaClienteTelefonoEl.textContent = '';
      ventaClienteTelefonoEl.classList.add('oculto');
    }
  }

  // ---------- Modal rápido: nuevo cliente desde Vender ----------
  const fondoNuevoClienteEl = document.getElementById('fondo-nuevo-cliente');
  const nuevoClienteNombreEl = document.getElementById('nuevo-cliente-nombre');
  const nuevoClienteTelefonoEl = document.getElementById('nuevo-cliente-telefono');
  const nuevoClienteDireccionEl = document.getElementById('nuevo-cliente-direccion');
  const errorNuevoClienteEl = document.getElementById('error-nuevo-cliente');
  const botonNuevoClienteRapidoEl = document.getElementById('boton-nuevo-cliente-rapido');
  const botonCancelarNuevoClienteEl = document.getElementById('boton-cancelar-nuevo-cliente');
  const botonGuardarNuevoClienteEl = document.getElementById('boton-guardar-nuevo-cliente');

  botonNuevoClienteRapidoEl.addEventListener('click', () => {
    nuevoClienteNombreEl.value = '';
    nuevoClienteTelefonoEl.value = '';
    nuevoClienteDireccionEl.value = '';
    errorNuevoClienteEl.classList.remove('visible');
    fondoNuevoClienteEl.classList.remove('oculto');
    nuevoClienteNombreEl.focus();
  });

  botonCancelarNuevoClienteEl.addEventListener('click', () => {
    fondoNuevoClienteEl.classList.add('oculto');
  });

  document.getElementById('boton-cerrar-nuevo-cliente-x').addEventListener('click', () => {
    fondoNuevoClienteEl.classList.add('oculto');
  });

  fondoNuevoClienteEl.addEventListener('click', (e) => {
    if (e.target === fondoNuevoClienteEl) fondoNuevoClienteEl.classList.add('oculto');
  });

  botonGuardarNuevoClienteEl.addEventListener('click', async () => {
    const nombre = nuevoClienteNombreEl.value.trim();
    const telefono = nuevoClienteTelefonoEl.value.trim();
    const direccion = nuevoClienteDireccionEl.value.trim();

    if (!nombre || !telefono) {
      errorNuevoClienteEl.textContent = 'Ingresa al menos nombre y teléfono.';
      errorNuevoClienteEl.classList.add('visible');
      return;
    }

    if (botonGuardarNuevoClienteEl.disabled) return;
    botonGuardarNuevoClienteEl.disabled = true;

    try {
      const nuevoId = await DB.agregar(DB.STORES.CLIENTES, {
        nombre,
        telefono,
        telefonoAlterno: '',
        direccion,
        notas: '',
        creadoEn: Date.now(),
      });

      await cargarClientes();
      ventaClienteSelectEl.value = String(nuevoId);
      ventaClienteSelectEl.dispatchEvent(new Event('change'));
      fondoNuevoClienteEl.classList.add('oculto');
    } catch (err) {
      errorNuevoClienteEl.textContent = 'No se pudo guardar el cliente.';
      errorNuevoClienteEl.classList.add('visible');
    } finally {
      botonGuardarNuevoClienteEl.disabled = false;
    }
  });

  function obtenerClienteSeleccionado() {
    const idSeleccionado = ventaClienteSelectEl.value ? parseInt(ventaClienteSelectEl.value, 10) : null;
    if (!idSeleccionado) return null;
    return clientes.find((c) => c.id === idSeleccionado) || null;
  }

  // Con un cliente ya elegido no tiene sentido volver a pedirle nombre,
  // teléfono y dirección a mano: esos datos se toman del cliente y solo se
  // muestran los campos que de verdad varían venta a venta (envío, teléfono
  // alterno, nota de esa entrega en particular).
  function actualizarCamposDomicilioSegunCliente() {
    const cliente = obtenerClienteSeleccionado();

    if (cliente && esDomicilio) {
      domicilioNombreEl.value = cliente.nombre || '';
      domicilioTelefonoEl.value = cliente.telefono || '';
      domicilioDireccionEl.value = cliente.direccion || '';

      // Si al cliente le falta teléfono o dirección (el teléfono ya es
      // opcional), se muestran los campos para completarlos en esta venta.
      const datosCompletos = !!(cliente.telefono && cliente.direccion);
      domicilioCamposClienteManualEl.classList.toggle('oculto', datosCompletos);
      domicilioClienteInfoNombreEl.textContent = cliente.nombre;
      domicilioClienteInfoEl.classList.toggle('oculto', !datosCompletos);
    } else {
      domicilioCamposClienteManualEl.classList.remove('oculto');
      domicilioClienteInfoEl.classList.add('oculto');
    }

    // Con cliente elegido, teléfono alterno y referencias salen de su ficha
    // en Clientes (sin pedirlos de nuevo en cada venta).
    domicilioExtrasManualEl.classList.toggle('oculto', !!(cliente && esDomicilio));
  }

  ventaClienteSelectEl.addEventListener('change', () => {
    actualizarTelefonoClienteSeleccionado();
    actualizarCamposDomicilioSegunCliente();
    const cliente = obtenerClienteSeleccionado();
    if (esPedidosYa && cliente) pedidosYaNombreEl.value = cliente.nombre || '';
  });

  chipsEntrega.forEach((chip) => {
    chip.addEventListener('click', () => {
      esDomicilio = chip.dataset.tipo === 'domicilio';
      esPedidosYa = chip.dataset.tipo === 'pedidosya';
      chipsEntrega.forEach((c) => c.classList.toggle('activo', c === chip));
      domicilioCamposEl.classList.toggle('oculto', !esDomicilio);
      pedidosYaCamposEl.classList.toggle('oculto', !esPedidosYa);
      actualizarCamposDomicilioSegunCliente();
      aplicarModoPedidosYa();
      renderizarCarrito();
      ocultarError();
    });
  });

  // Pedidos Ya se cobra a su propia cuenta: no se elige efectivo/tarjeta/
  // depósito, y en caja y reportes va aparte.
  function aplicarModoPedidosYa() {
    if (esPedidosYa) {
      metodoPago = 'pedidosya';
      chipsPago.forEach((c) => c.classList.remove('activo'));
      contenedorMetodoPagoEl.classList.add('oculto');
      campoEfectivoRecibidoWrap.classList.add('oculto');
      efectivoRecibidoEl.value = '';
      resultadoVueltoEl.classList.add('oculto');
      actualizarCamposDePagoElectronico();
      const cliente = obtenerClienteSeleccionado();
      if (cliente && !pedidosYaNombreEl.value) pedidosYaNombreEl.value = cliente.nombre || '';
    } else {
      contenedorMetodoPagoEl.classList.remove('oculto');
      if (metodoPago === 'pedidosya') metodoPago = null;
    }
  }

  function obtenerCostoEnvio() {
    const valor = parseFloat(domicilioCostoEnvioEl.value);
    return isNaN(valor) || valor < 0 ? 0 : valor;
  }

  domicilioCostoEnvioEl.addEventListener('input', () => renderizarCarrito());

  // ---------- Formato ----------

  function formatearMoneda(monto) {
    return 'Q ' + monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Quita acentos para que buscar "bionico" también encuentre "Biónico".
  function normalizarTexto(texto) {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  // ---------- Carga de productos ----------

  async function cargarProductos() {
    const todos = await DB.obtenerTodos(DB.STORES.PRODUCTOS);
    productos = todos.filter((p) => p.activo !== false);
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    renderizarCategorias();
    renderizarGrilla();
  }

  function renderizarCategorias() {
    const categoriasSet = new Set();
    productos.forEach((p) => {
      if (p.categoria && p.categoria.trim()) categoriasSet.add(p.categoria.trim());
    });
    const categorias = ['Todos', ...Array.from(categoriasSet).sort((a, b) => a.localeCompare(b))];

    categoriasEl.innerHTML = '';
    categorias.forEach((cat) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-categoria' + (cat === categoriaActiva ? ' activo' : '');
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        categoriaActiva = cat;
        renderizarCategorias();
        renderizarGrilla();
      });
      categoriasEl.appendChild(chip);
    });
  }

  buscadorVentaEl.addEventListener('input', () => renderizarGrilla());

  function renderizarGrilla() {
    const porCategoria =
      categoriaActiva === 'Todos'
        ? productos
        : productos.filter((p) => (p.categoria || '').trim() === categoriaActiva);

    const busqueda = normalizarTexto(buscadorVentaEl.value.trim());
    const visibles = busqueda
      ? porCategoria.filter((p) => normalizarTexto(p.nombre).includes(busqueda))
      : porCategoria;

    // Se revocan las URLs de fotos del render anterior para no acumular memoria.
    urlsFotosGrilla.forEach((url) => URL.revokeObjectURL(url));
    urlsFotosGrilla = [];

    grillaEl.innerHTML = '';

    if (visibles.length === 0) {
      estadoVacioProductosEl.classList.remove('oculto');
      return;
    }
    estadoVacioProductosEl.classList.add('oculto');

    visibles.forEach((producto) => {
      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'tarjeta-venta-producto';

      let fotoHtml = '';
      if (producto.imagenBlob) {
        const url = URL.createObjectURL(producto.imagenBlob);
        urlsFotosGrilla.push(url);
        fotoHtml = `<img src="${url}" class="tarjeta-venta-producto__foto" alt="" />`;
      }

      tarjeta.innerHTML = `
        ${fotoHtml}
        <span class="tarjeta-venta-producto__nombre">${escaparHtml(producto.nombre)}</span>
        <span class="tarjeta-venta-producto__precio">${formatearMoneda(producto.precio)}</span>
      `;
      tarjeta.addEventListener('click', () => agregarAlCarrito(producto));
      grillaEl.appendChild(tarjeta);
    });
  }

  // ---------- Carrito ----------

  function agregarAlCarrito(producto) {
    // Solo se suma a la línea "normal" (sin extra ni nota) del producto:
    // las líneas con extra son unidades distintas y no se mezclan.
    const linea = carrito.find(
      (l) => l.productoId === producto.id && !(l.extra > 0) && !l.nota
    );
    if (linea) {
      linea.cantidad += 1;
    } else {
      carrito.push({
        lineaId: siguienteLineaId++,
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: 1,
        extra: 0,
        nota: '',
      });
    }
    renderizarCarrito();
  }

  // ---------- Modal de extra/nota por línea ----------
  const fondoExtraLineaEl = document.getElementById('fondo-extra-linea');
  const extraLineaTituloEl = document.getElementById('extra-linea-titulo');
  const extraLineaMontoEl = document.getElementById('extra-linea-monto');
  const extraLineaNotaEl = document.getElementById('extra-linea-nota');
  const botonGuardarExtraLineaEl = document.getElementById('boton-guardar-extra-linea');
  const botonCancelarExtraLineaEl = document.getElementById('boton-cancelar-extra-linea');
  let lineaIdEditandoExtra = null;
  const campoExtraUnidadesEl = document.getElementById('campo-extra-unidades');
  const extraLineaUnidadesEl = document.getElementById('extra-linea-unidades');
  const extraLineaUnidadesAyudaEl = document.getElementById('extra-linea-unidades-ayuda');

  function abrirModalExtra(linea) {
    lineaIdEditandoExtra = linea.lineaId;
    extraLineaTituloEl.textContent = `Ajustar: ${linea.nombre}`;
    extraLineaMontoEl.value = linea.extra ? String(linea.extra) : '';
    extraLineaNotaEl.value = linea.nota || '';

    // Con más de una unidad se puede aplicar el extra solo a algunas
    // (ej. de 2 bionicos, uno con topping y otro normal).
    if (linea.cantidad > 1) {
      campoExtraUnidadesEl.classList.remove('oculto');
      extraLineaUnidadesEl.max = String(linea.cantidad);
      extraLineaUnidadesEl.value = String(linea.cantidad);
      extraLineaUnidadesAyudaEl.textContent =
        `Hay ${linea.cantidad} unidades. Las que no elijas quedan como están.`;
    } else {
      campoExtraUnidadesEl.classList.add('oculto');
    }
    fondoExtraLineaEl.classList.remove('oculto');
  }

  function cerrarModalExtra() {
    fondoExtraLineaEl.classList.add('oculto');
    lineaIdEditandoExtra = null;
  }

  botonCancelarExtraLineaEl.addEventListener('click', cerrarModalExtra);
  document.getElementById('boton-cerrar-extra-linea-x').addEventListener('click', cerrarModalExtra);
  fondoExtraLineaEl.addEventListener('click', (e) => {
    if (e.target === fondoExtraLineaEl) cerrarModalExtra();
  });

  // Une líneas "normales" (sin extra ni nota) del mismo producto.
  function fusionarLineasNormales() {
    const resultado = [];
    carrito.forEach((linea) => {
      const esNormal = !(linea.extra > 0) && !linea.nota;
      const destino = esNormal
        ? resultado.find((l) => l.productoId === linea.productoId && !(l.extra > 0) && !l.nota)
        : null;
      if (destino) destino.cantidad += linea.cantidad;
      else resultado.push(linea);
    });
    carrito = resultado;
  }

  botonGuardarExtraLineaEl.addEventListener('click', () => {
    if (lineaIdEditandoExtra == null) return;
    const indice = carrito.findIndex((l) => l.lineaId === lineaIdEditandoExtra);
    if (indice === -1) return;
    const linea = carrito[indice];

    const valorExtra = parseFloat(extraLineaMontoEl.value);
    const extra = isNaN(valorExtra) || valorExtra < 0 ? 0 : valorExtra;
    const nota = extraLineaNotaEl.value.trim();

    let unidades = linea.cantidad;
    if (linea.cantidad > 1) {
      const pedidas = parseInt(extraLineaUnidadesEl.value, 10);
      if (!isNaN(pedidas)) unidades = Math.min(Math.max(pedidas, 1), linea.cantidad);
    }

    if (unidades < linea.cantidad) {
      // Solo algunas unidades llevan el extra: se separan en otra línea.
      if (extra > 0 || nota) {
        linea.cantidad -= unidades;
        carrito.splice(indice + 1, 0, {
          lineaId: siguienteLineaId++,
          productoId: linea.productoId,
          nombre: linea.nombre,
          precio: linea.precio,
          cantidad: unidades,
          extra,
          nota,
        });
      }
    } else {
      linea.extra = extra;
      linea.nota = nota;
    }

    fusionarLineasNormales();
    cerrarModalExtra();
    renderizarCarrito();
  });

  function cambiarCantidad(lineaId, delta) {
    const linea = carrito.find((l) => l.lineaId === lineaId);
    if (!linea) return;
    linea.cantidad += delta;
    if (linea.cantidad <= 0) {
      carrito = carrito.filter((l) => l.lineaId !== lineaId);
    }
    renderizarCarrito();
  }

  function eliminarLinea(lineaId) {
    carrito = carrito.filter((l) => l.lineaId !== lineaId);
    renderizarCarrito();
  }

  function calcularSubtotalProductos() {
    return carrito.reduce((acc, l) => acc + (l.precio + (l.extra || 0)) * l.cantidad, 0);
  }

  function calcularTotal() {
    const envio = esDomicilio ? obtenerCostoEnvio() : 0;
    return calcularSubtotalProductos() + envio;
  }

  function renderizarCarrito() {
    carritoListaEl.innerHTML = '';

    if (carrito.length === 0) {
      carritoVacioEl.classList.remove('oculto');
    } else {
      carritoVacioEl.classList.add('oculto');

      carrito.forEach((linea) => {
        const extra = linea.extra || 0;
        const subtotal = (linea.precio + extra) * linea.cantidad;
        const extraHtml = extra > 0
          ? `<span class="carrito-linea__extra">+ ${formatearMoneda(extra)} extra</span>`
          : '';
        const notaHtml = linea.nota
          ? `<span class="carrito-linea__nota">${escaparHtml(linea.nota)}</span>`
          : '';
        const fila = document.createElement('div');
        fila.className = 'carrito-linea';
        fila.innerHTML = `
          <div class="carrito-linea__info">
            <span class="carrito-linea__nombre">${escaparHtml(linea.nombre)}</span>
            <span class="carrito-linea__precio">${formatearMoneda(linea.precio)} c/u</span>
            ${extraHtml}
            ${notaHtml}
          </div>
          <div class="carrito-linea__stepper">
            <button type="button" class="boton-stepper" data-accion="restar">−</button>
            <span class="carrito-linea__cantidad">${linea.cantidad}</span>
            <button type="button" class="boton-stepper" data-accion="sumar">+</button>
            <button type="button" class="boton-icono carrito-linea__extra-boton" title="Cargo extra / nota">✏️</button>
          </div>
          <span class="carrito-linea__subtotal">${formatearMoneda(subtotal)}</span>
          <button type="button" class="boton-icono boton-icono--eliminar carrito-linea__eliminar" title="Eliminar">🗑️</button>
        `;

        fila.querySelector('[data-accion="restar"]').addEventListener('click', () =>
          cambiarCantidad(linea.lineaId, -1)
        );
        fila.querySelector('[data-accion="sumar"]').addEventListener('click', () =>
          cambiarCantidad(linea.lineaId, 1)
        );
        fila.querySelector('.carrito-linea__eliminar').addEventListener('click', () =>
          eliminarLinea(linea.lineaId)
        );
        fila.querySelector('.carrito-linea__extra-boton').addEventListener('click', () =>
          abrirModalExtra(linea)
        );

        carritoListaEl.appendChild(fila);
      });
    }

    carritoTotalMontoEl.textContent = formatearMoneda(calcularTotal());
    if (metodoPago === 'efectivo') actualizarVuelto();
    ocultarError();
  }

  function limpiarCamposDomicilio() {
    domicilioNombreEl.value = '';
    domicilioTelefonoEl.value = '';
    domicilioDireccionEl.value = '';
    domicilioCostoEnvioEl.value = '';
    domicilioTelefonoAlternoEl.value = '';
    domicilioNotasEl.value = '';
    esDomicilio = false;
    esPedidosYa = false;
    pedidosYaNombreEl.value = '';
    chipsEntrega.forEach((c) => c.classList.toggle('activo', c.dataset.tipo === 'mostrador'));
    domicilioCamposEl.classList.add('oculto');
    pedidosYaCamposEl.classList.add('oculto');
    contenedorMetodoPagoEl.classList.remove('oculto');
    ventaClienteSelectEl.value = '';
    actualizarCamposDomicilioSegunCliente();
  }

  // ---------- Método de pago ----------

  chipsPago.forEach((chip) => {
    chip.addEventListener('click', () => {
      metodoPago = chip.dataset.metodo;
      chipsPago.forEach((c) => c.classList.toggle('activo', c === chip));
      ocultarError();

      if (metodoPago === 'efectivo') {
        campoEfectivoRecibidoWrap.classList.remove('oculto');
        actualizarVuelto();
      } else {
        campoEfectivoRecibidoWrap.classList.add('oculto');
        efectivoRecibidoEl.value = '';
        resultadoVueltoEl.classList.add('oculto');
      }

      actualizarCamposDePagoElectronico();
    });
  });

  // ---------- Banco / cuenta / transacción (tarjeta y depósito) ----------

  const campoBancoPagoEl = document.getElementById('campo-banco-pago');
  const bancoSelectEl = document.getElementById('venta-banco-select');
  const botonNuevoBancoEl = document.getElementById('boton-nuevo-banco');
  const campoCuentaClienteEl = document.getElementById('campo-cuenta-cliente');
  const cuentaClienteEl = document.getElementById('venta-cuenta-cliente');
  const campoNumeroTransaccionEl = document.getElementById('campo-numero-transaccion');
  const numeroTransaccionEl = document.getElementById('venta-numero-transaccion');
  let bancos = [];

  async function cargarBancos(idASeleccionar) {
    try {
      bancos = await DB.obtenerTodos(DB.STORES.BANCOS);
      bancos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    } catch (err) {
      bancos = [];
    }
    bancoSelectEl.innerHTML = '<option value="">— Sin especificar —</option>';
    bancos.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = String(b.id);
      opt.textContent = b.nombre;
      bancoSelectEl.appendChild(opt);
    });
    if (idASeleccionar != null) bancoSelectEl.value = String(idASeleccionar);
  }

  function actualizarCamposDePagoElectronico() {
    const esTarjeta = metodoPago === 'tarjeta';
    const esDeposito = metodoPago === 'deposito';
    campoBancoPagoEl.classList.toggle('oculto', !(esTarjeta || esDeposito));
    campoNumeroTransaccionEl.classList.toggle('oculto', !esTarjeta);
    campoCuentaClienteEl.classList.toggle('oculto', !esDeposito);
    if (!esTarjeta) numeroTransaccionEl.value = '';
    if (!esDeposito) cuentaClienteEl.value = '';
    if (!esTarjeta && !esDeposito) bancoSelectEl.value = '';
  }

  botonNuevoBancoEl.addEventListener('click', async () => {
    const nombreIngresado = window.prompt('Nombre del banco:');
    const nombre = nombreIngresado ? nombreIngresado.trim() : '';
    if (!nombre) return;

    const existente = bancos.find((b) => (b.nombre || '').toLowerCase() === nombre.toLowerCase());
    if (existente) {
      bancoSelectEl.value = String(existente.id);
      return;
    }

    try {
      const nuevoId = await DB.agregar(DB.STORES.BANCOS, { nombre });
      await cargarBancos(nuevoId);
    } catch (err) {
      mostrarError('No se pudo guardar el banco.');
    }
  });

  function datosPagoParaGuardar() {
    if (metodoPago !== 'tarjeta' && metodoPago !== 'deposito') return {};
    const bancoId = bancoSelectEl.value ? parseInt(bancoSelectEl.value, 10) : null;
    const banco = bancos.find((b) => b.id === bancoId);
    const datos = { bancoId, bancoNombre: banco ? banco.nombre : '' };
    if (metodoPago === 'deposito') datos.numeroCuenta = cuentaClienteEl.value.trim();
    if (metodoPago === 'tarjeta') datos.numeroTransaccion = numeroTransaccionEl.value.trim();
    return datos;
  }

  function actualizarVuelto() {
    const recibido = parseFloat(efectivoRecibidoEl.value);
    if (isNaN(recibido)) {
      resultadoVueltoEl.classList.add('oculto');
      return;
    }
    const total = calcularTotal();
    const vuelto = recibido - total;

    resultadoVueltoEl.classList.remove('oculto');
    if (vuelto < 0) {
      resultadoVueltoEl.textContent = `Falta ${formatearMoneda(Math.abs(vuelto))}`;
      resultadoVueltoEl.classList.add('resultado-vuelto--falta');
      resultadoVueltoEl.classList.remove('resultado-vuelto--ok');
    } else {
      resultadoVueltoEl.textContent = `Vuelto: ${formatearMoneda(vuelto)}`;
      resultadoVueltoEl.classList.add('resultado-vuelto--ok');
      resultadoVueltoEl.classList.remove('resultado-vuelto--falta');
    }
  }

  efectivoRecibidoEl.addEventListener('input', actualizarVuelto);

  document.querySelectorAll('.chip-billete').forEach((chip) => {
    chip.addEventListener('click', () => {
      const monto = chip.dataset.monto === 'exacto' ? calcularTotal() : parseFloat(chip.dataset.monto);
      efectivoRecibidoEl.value = String(Math.round(monto * 100) / 100);
      actualizarVuelto();
      ocultarError();
    });
  });

  function etiquetaMetodoPago(metodo) {
    switch (metodo) {
      case 'efectivo':
        return 'Efectivo';
      case 'tarjeta':
        return 'Tarjeta';
      case 'deposito':
        return 'Depósito';
      case 'pedidosya':
        return 'Pedidos Ya';
      default:
        return '';
    }
  }

  function mostrarError(mensaje) {
    ventaErrorEl.textContent = mensaje;
    ventaErrorEl.classList.add('visible');
  }

  function ocultarError() {
    ventaErrorEl.classList.remove('visible');
  }

  // ---------- Confirmar venta ----------

  botonConfirmarEl.addEventListener('click', async () => {
    if (carrito.length === 0) {
      mostrarError('Agrega al menos un producto al carrito.');
      return;
    }
    if (!metodoPago) {
      mostrarError('Selecciona un método de pago.');
      return;
    }

    if (metodoPago === 'efectivo') {
      const recibido = parseFloat(efectivoRecibidoEl.value);
      if (isNaN(recibido)) {
        mostrarError('Escribe con cuánto paga el cliente (o toca "Exacto").');
        efectivoRecibidoEl.focus();
        return;
      }
      if (recibido < calcularTotal() - 0.005) {
        mostrarError(`Lo que paga el cliente no alcanza: faltan ${formatearMoneda(calcularTotal() - recibido)}.`);
        efectivoRecibidoEl.focus();
        return;
      }
    }

    const clienteSeleccionado = obtenerClienteSeleccionado();
    const nombrePedidosYa = pedidosYaNombreEl.value.trim() || (clienteSeleccionado ? clienteSeleccionado.nombre : '');
    if (esPedidosYa && !nombrePedidosYa) {
      mostrarError('Para Pedidos Ya, escribe el nombre del cliente.');
      pedidosYaNombreEl.focus();
      return;
    }

    const nombreCliente = domicilioNombreEl.value.trim();
    const telefonoCliente = domicilioTelefonoEl.value.trim();
    const direccionCliente = domicilioDireccionEl.value.trim();
    // Con cliente elegido, el teléfono alterno y las referencias salen de su
    // ficha en Clientes; sin cliente, de los campos manuales.
    const telefonoAlterno = clienteSeleccionado
      ? (clienteSeleccionado.telefonoAlterno || '')
      : domicilioTelefonoAlternoEl.value.trim();
    const notasEntrega = clienteSeleccionado
      ? (clienteSeleccionado.notas || '')
      : domicilioNotasEl.value.trim();
    const clienteId = ventaClienteSelectEl.value ? parseInt(ventaClienteSelectEl.value, 10) : null;

    // El botón se bloquea ya mismo (antes de pedir el código) para que un
    // doble toque no registre la venta dos veces.
    botonConfirmarEl.disabled = true;

    // Sin códigos de vendedor creados no se puede vender: sin ellos no se
    // sabría quién hizo cada venta (Pin.pedir dejaría pasar con la sesión).
    let hayCodigos = false;
    try {
      hayCodigos = await Auth.hayPinsConfigurados();
    } catch (err) {
      hayCodigos = false;
    }
    if (!hayCodigos) {
      window.alert('No hay códigos de vendedor creados. Crea al menos uno en Usuarios para poder vender.');
      botonConfirmarEl.disabled = false;
      return;
    }

    const vendedor = await Pin.pedir('Confirmar venta');
    if (!vendedor) {
      botonConfirmarEl.disabled = false;
      return;
    }

    try {
      // Siguiente recibo = mayor número guardado + 1, leído del índice
      // (tiempo constante aunque haya decenas de miles de ventas).
      const ultimoRecibo = await DB.ultimaClaveDeIndice(DB.STORES.VENTAS, 'numeroRecibo');
      const numeroRecibo = (ultimoRecibo || 0) + 1;

      const costoEnvio = esDomicilio ? obtenerCostoEnvio() : 0;
      const total = calcularTotal();
      const fecha = Date.now();

      const ventaId = await DB.agregar(DB.STORES.VENTAS, {
        numeroRecibo,
        fecha,
        usuarioId: vendedor.id,
        metodoPago,
        total,
        cajaId: cajaActiva.id,
        ...datosPagoParaGuardar(),
        esDomicilio,
        esPedidosYa,
        tipoEntrega: esPedidosYa ? 'pedidosya' : esDomicilio ? 'domicilio' : 'local',
        costoEnvio,
        clienteId,
        clienteNombre: esDomicilio ? nombreCliente : esPedidosYa ? nombrePedidosYa : '',
        clienteTelefono: esDomicilio ? telefonoCliente : '',
        clienteDireccion: esDomicilio ? direccionCliente : '',
        telefonoAlterno: esDomicilio ? telefonoAlterno : '',
        notasEntrega: esDomicilio ? notasEntrega : '',
      });

      for (const linea of carrito) {
        const extra = linea.extra || 0;
        await DB.agregar(DB.STORES.DETALLE_VENTA, {
          ventaId,
          productoId: linea.productoId,
          nombreProducto: linea.nombre,
          precioUnitario: linea.precio,
          cantidad: linea.cantidad,
          extra,
          nota: linea.nota || '',
          subtotal: (linea.precio + extra) * linea.cantidad,
        });
      }

      mostrarRecibo({
        numeroRecibo,
        fecha,
        cajero: vendedor.nombre,
        metodoPago,
        lineas: carrito.slice(),
        subtotal: calcularSubtotalProductos(),
        costoEnvio,
        total,
        esDomicilio,
        esPedidosYa,
        telefonoNegocio,
        direccionNegocio,
        clienteNombre: esPedidosYa ? nombrePedidosYa : nombreCliente,
        clienteTelefono: telefonoCliente,
        clienteDireccion: direccionCliente,
        telefonoAlterno,
        notasEntrega,
      });

      carrito = [];
      metodoPago = null;
      chipsPago.forEach((c) => c.classList.remove('activo'));
      campoEfectivoRecibidoWrap.classList.add('oculto');
      efectivoRecibidoEl.value = '';
      resultadoVueltoEl.classList.add('oculto');
      actualizarCamposDePagoElectronico();
      limpiarCamposDomicilio();
      renderizarCarrito();
    } catch (err) {
      mostrarError('No se pudo registrar la venta. Intenta de nuevo.');
    } finally {
      botonConfirmarEl.disabled = false;
    }
  });

  // ---------- Recibo ----------

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
        ? `${escaparHtml(linea.nombre)} (+${formatearMoneda(extra)} extra c/u)`
        : escaparHtml(linea.nombre);
      const notaHtml = linea.nota
        ? `<div class="recibo-linea-nota"><em>${escaparHtml(linea.nota)}</em></div>`
        : '';
      filasHtml += `
        <div class="recibo-linea">
          <span>${linea.cantidad} × ${nombreConExtra}</span>
          <span>${formatearMoneda(subtotal)}</span>
        </div>
        ${notaHtml}
      `;
    });

    const envioHtml =
      venta.esDomicilio && venta.costoEnvio > 0
        ? `<div class="recibo-linea"><span>Envío a domicilio</span><span>${formatearMoneda(venta.costoEnvio)}</span></div>`
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
        <span>${formatearMoneda(venta.total)}</span>
      </div>
      <p class="recibo-metodo">Método de pago: ${etiquetaMetodoPago(venta.metodoPago)}</p>
      ${domicilioHtml}
      ${venta.esPedidosYa ? `<div class="recibo-domicilio"><strong>🛍️ Pedidos Ya</strong><div>Cliente: ${escaparHtml(venta.clienteNombre || '')}</div></div>` : ''}
      <p class="recibo-gracias">¡Gracias por su compra!</p>
    `;

    dibujarReciboCanvas(venta);

    fondoRecibo.classList.remove('oculto');
  }

  function dibujarReciboCanvas(venta) {
    const ancho = 384;
    const margenX = 24;
    const alturaLinea = 24;
    const alturaNota = 16;
    const tieneEnvio = venta.esDomicilio && venta.costoEnvio > 0;
    let lineasDomicilio = venta.esDomicilio ? 3 : 0; // título + teléfono + dirección
    if (venta.esDomicilio && venta.telefonoAlterno) lineasDomicilio += 1;
    if (venta.esDomicilio && venta.notasEntrega) lineasDomicilio += 1;
    let alturaFija = 220; // encabezado + separadores + total + pie
    if (tieneEnvio) alturaFija += alturaLinea;
    if (venta.esDomicilio) alturaFija += lineasDomicilio * 18 + 20;
    if (venta.telefonoNegocio) alturaFija += 20;
    const lineasDireccionNegocio = venta.direccionNegocio ? ImpresoraBLE.partirTexto(venta.direccionNegocio, 44) : [];
    alturaFija += lineasDireccionNegocio.length * 20;
    if (venta.esPedidosYa) alturaFija += 44;
    const cantidadNotas = venta.lineas.filter((l) => l.nota).length;
    // Margen extra al final: sin esto, el corte automático de la impresora
    // cae encima del último texto en vez de dejarlo completo antes de cortar.
    const margenInferior = 70;
    const alto = alturaFija + venta.lineas.length * alturaLinea + cantidadNotas * alturaNota + margenInferior;

    // Se dibuja a 1.5x y se escala el contexto (no las coordenadas de abajo)
    // para que la imagen final tenga ~576px de ancho — la resolución
    // estándar de impresoras térmicas de 80mm a 203dpi — y se vea nítida
    // al imprimirse, en vez de pixelada.
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
        ? `${formatearMoneda(linea.precio)} +${formatearMoneda(extra)} extra`
        : formatearMoneda(linea.precio);
      const textoIzq = `${linea.cantidad} x ${linea.nombre} (${precioTexto})`;
      const textoDer = formatearMoneda(subtotal);
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
      ctx.fillText(formatearMoneda(venta.costoEnvio), ancho - margenX, y);
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
    ctx.fillText(formatearMoneda(venta.total), ancho - margenX, y);
    y += 30;

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Método de pago: ${etiquetaMetodoPago(venta.metodoPago)}`, ancho / 2, y);
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

    // Las impresoras térmicas solo imprimen blanco o negro puro (sin grises).
    // Sin este paso, el suavizado (antialiasing) del texto queda en tonos
    // grises que la app de impresión convierte de forma inconsistente,
    // resultando en un ticket borroso o "pixelado". Aquí se convierte cada
    // píxel a blanco o negro puro antes de compartir la imagen.
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
      ultimoReciboBlob = blob;

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

  botonNuevaVenta.addEventListener('click', () => {
    fondoRecibo.classList.add('oculto');
    enlaceDescargaRecibo.classList.add('oculto');
    reciboContenidoEl.innerHTML = '';
  });

  document.getElementById('boton-cerrar-recibo-x').addEventListener('click', () => {
    botonNuevaVenta.click();
  });

  fondoRecibo.addEventListener('click', (e) => {
    if (e.target === fondoRecibo) {
      fondoRecibo.classList.add('oculto');
    }
  });

  await cargarProductos();
  await cargarClientes();
  await cargarBancos();
  await cargarAjustes();
  renderizarCarrito();
});

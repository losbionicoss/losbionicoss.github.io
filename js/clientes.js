/**
 * clientes.js — CRUD de clientes (pages/clientes.html).
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

  const listaEl = document.getElementById('lista-clientes');
  const estadoVacioEl = document.getElementById('estado-vacio');
  const estadoVacioTextoEl = document.getElementById('estado-vacio-texto');
  const buscadorEl = document.getElementById('buscador-clientes');
  const fondoModal = document.getElementById('fondo-modal');
  const formCliente = document.getElementById('form-cliente');
  const tituloModal = document.getElementById('titulo-modal');
  const errorCliente = document.getElementById('error-cliente');

  const campoId = document.getElementById('cliente-id');
  const campoNombre = document.getElementById('cliente-nombre');
  const campoTelefono = document.getElementById('cliente-telefono');
  const campoTelefonoAlterno = document.getElementById('cliente-telefono-alterno');
  const campoDireccion = document.getElementById('cliente-direccion');
  const campoNotas = document.getElementById('cliente-notas');

  // Array completo de clientes ya cargados de la base de datos, para filtrar
  // por texto de búsqueda en memoria sin volver a consultar IndexedDB.
  let todosLosClientes = [];

  buscadorEl.addEventListener('input', () => {
    renderizarLista(filtrarPorBusqueda(todosLosClientes, buscadorEl.value));
  });

  // Quita acentos para que buscar "jose" también encuentre "José".
  function normalizarTexto(texto) {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function filtrarPorBusqueda(clientes, texto) {
    const busqueda = normalizarTexto(texto.trim());
    if (!busqueda) return clientes;
    return clientes.filter((c) => normalizarTexto(c.nombre).includes(busqueda));
  }

  document.getElementById('boton-nuevo-cliente').addEventListener('click', () => {
    abrirModal();
  });

  document.getElementById('boton-cancelar-modal').addEventListener('click', () => {
    cerrarModal();
  });

  document.getElementById('boton-cerrar-modal-x').addEventListener('click', () => {
    cerrarModal();
  });

  fondoModal.addEventListener('click', (e) => {
    if (e.target === fondoModal) cerrarModal();
  });

  formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorCliente.classList.remove('visible');

    const nombre = campoNombre.value.trim();
    const telefono = campoTelefono.value.trim();
    const telefonoAlterno = campoTelefonoAlterno.value.trim();
    const direccion = campoDireccion.value.trim();
    const notas = campoNotas.value.trim();

    if (!nombre) {
      mostrarErrorCliente('El nombre es obligatorio.');
      return;
    }

    const idExistente = campoId.value ? Number(campoId.value) : null;

    const botonGuardar = formCliente.querySelector('button[type="submit"]');
    if (botonGuardar.disabled) return;
    botonGuardar.disabled = true;

    try {
      if (idExistente) {
        const cliente = await DB.obtenerPorId(DB.STORES.CLIENTES, idExistente);
        cliente.nombre = nombre;
        cliente.telefono = telefono;
        cliente.telefonoAlterno = telefonoAlterno || '';
        cliente.direccion = direccion || '';
        cliente.notas = notas || '';
        await DB.actualizar(DB.STORES.CLIENTES, cliente);
      } else {
        const nuevoCliente = {
          nombre,
          telefono,
          telefonoAlterno: telefonoAlterno || '',
          direccion: direccion || '',
          notas: notas || '',
          creadoEn: Date.now(),
        };
        await DB.agregar(DB.STORES.CLIENTES, nuevoCliente);
      }

      cerrarModal();
      await cargarClientes();
    } catch (err) {
      mostrarErrorCliente('No se pudo guardar el cliente.');
    } finally {
      botonGuardar.disabled = false;
    }
  });

  function mostrarErrorCliente(mensaje) {
    errorCliente.textContent = mensaje;
    errorCliente.classList.add('visible');
  }

  function abrirModal(cliente = null) {
    formCliente.reset();
    errorCliente.classList.remove('visible');

    if (cliente) {
      tituloModal.textContent = 'Editar cliente';
      campoId.value = cliente.id;
      campoNombre.value = cliente.nombre;
      campoTelefono.value = cliente.telefono || '';
      campoTelefonoAlterno.value = cliente.telefonoAlterno || '';
      campoDireccion.value = cliente.direccion || '';
      campoNotas.value = cliente.notas || '';
    } else {
      tituloModal.textContent = 'Nuevo cliente';
      campoId.value = '';
    }

    fondoModal.classList.remove('oculto');
    campoNombre.focus();
  }

  function cerrarModal() {
    fondoModal.classList.add('oculto');
  }

  async function eliminarCliente(id, nombre) {
    const confirmado = window.confirm(`¿Eliminar a "${nombre}" de la lista de clientes?`);
    if (!confirmado) return;

    await DB.eliminar(DB.STORES.CLIENTES, id);
    await cargarClientes();
  }

  async function cargarClientes() {
    const clientes = await DB.obtenerTodos(DB.STORES.CLIENTES);
    clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    todosLosClientes = clientes;
    renderizarLista(filtrarPorBusqueda(todosLosClientes, buscadorEl.value));
  }

  // Se muestran 50 clientes por vez ("Mostrar más").
  const TAMANO_PAGINA = 50;
  let limiteLista = TAMANO_PAGINA;
  let busquedaAnterior = '';
  let clientesActuales = [];
  const botonMas = document.createElement('button');
  botonMas.type = 'button';
  botonMas.className = 'boton boton-secundario oculto';
  botonMas.style.cssText = 'display:block;margin:12px auto;';
  listaEl.insertAdjacentElement('afterend', botonMas);
  botonMas.addEventListener('click', () => {
    limiteLista += TAMANO_PAGINA;
    renderizarLista(clientesActuales);
  });

  function renderizarLista(clientes) {
    listaEl.innerHTML = '';

    const hayBusqueda = buscadorEl.value.trim().length > 0;

    // Una búsqueda nueva vuelve a los primeros 50.
    if (buscadorEl.value !== busquedaAnterior) {
      busquedaAnterior = buscadorEl.value;
      limiteLista = TAMANO_PAGINA;
    }
    clientesActuales = clientes;
    const restantes = clientes.length - limiteLista;
    botonMas.classList.toggle('oculto', restantes <= 0);
    botonMas.textContent = `Mostrar más (${Math.max(restantes, 0)} restantes)`;

    if (clientes.length === 0) {
      if (hayBusqueda) {
        estadoVacioTextoEl.innerHTML = `No se encontraron clientes que coincidan con «${escaparHtml(buscadorEl.value.trim())}».`;
      } else {
        estadoVacioTextoEl.innerHTML = 'Todavía no has agregado clientes.<br />Toca "Nuevo cliente" para empezar.';
      }
      estadoVacioEl.classList.remove('oculto');
      return;
    }

    estadoVacioEl.classList.add('oculto');

    clientes.slice(0, limiteLista).forEach((cliente) => {
      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta-producto tarjeta-cliente';

      tarjeta.innerHTML = `
        <span class="tarjeta-producto__miniatura tarjeta-producto__miniatura--vacia">👤</span>
        <div class="tarjeta-producto__info">
          <p class="tarjeta-producto__nombre">${escaparHtml(cliente.nombre)}</p>
          ${cliente.telefono ? `<span class="tarjeta-cliente__telefono">${escaparHtml(cliente.telefono)}</span>` : ''}
          ${cliente.direccion ? `<span class="tarjeta-cliente__direccion">${escaparHtml(cliente.direccion)}</span>` : ''}
        </div>
        <div class="tarjeta-producto__acciones">
          <button class="boton-icono boton-historial" title="Ver ventas de este cliente">📊</button>
          <button class="boton-icono boton-editar" title="Editar">✏️</button>
          <button class="boton-icono boton-icono--eliminar boton-eliminar" title="Eliminar">🗑️</button>
        </div>
      `;

      tarjeta.querySelector('.boton-historial').addEventListener('click', () =>
        abrirHistorialCliente(cliente)
      );
      tarjeta.querySelector('.boton-editar').addEventListener('click', () => abrirModal(cliente));
      tarjeta.querySelector('.boton-eliminar').addEventListener('click', () =>
        eliminarCliente(cliente.id, cliente.nombre)
      );

      listaEl.appendChild(tarjeta);
    });
  }

  // ---------- Historial de ventas de un cliente ----------
  const fondoHistorialCliente = document.getElementById('fondo-historial-cliente');
  const tituloHistorialCliente = document.getElementById('titulo-historial-cliente');
  const contenidoHistorialCliente = document.getElementById('contenido-historial-cliente');

  function formatearMoneda(monto) {
    return 'Q ' + monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const etiquetasMetodoPago = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', deposito: 'Depósito', pedidosya: 'Pedidos Ya' };

  async function abrirHistorialCliente(cliente) {
    tituloHistorialCliente.textContent = `Ventas de ${cliente.nombre}`;
    contenidoHistorialCliente.innerHTML = '<p>Cargando...</p>';
    fondoHistorialCliente.classList.remove('oculto');

    const todasLasVentas = await DB.obtenerTodos(DB.STORES.VENTAS);
    // Los registros nuevos guardan clienteId; como red de seguridad, también
    // se incluyen ventas viejas que solo tengan el nombre coincidente.
    const ventasCliente = todasLasVentas
      .filter((v) => v.clienteId === cliente.id || (!v.clienteId && v.clienteNombre === cliente.nombre))
      .sort((a, b) => b.fecha - a.fecha);

    if (ventasCliente.length === 0) {
      contenidoHistorialCliente.innerHTML = `
        <div class="estado-vacio">
          <span class="icono">🧺</span>
          <p>Todavía no se le ha registrado ninguna venta a este cliente.</p>
        </div>
      `;
      return;
    }

    const totalGastado = ventasCliente
      .filter((v) => !v.cancelada)
      .reduce((acc, v) => acc + (v.total || 0), 0);

    const filas = ventasCliente
      .map((v) => {
        const fecha = new Date(v.fecha).toLocaleString('es-GT', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const entrega = v.esPedidosYa ? '🛍️ Pedidos Ya' : v.esDomicilio ? '🛵 Domicilio' : '🏬 Local';
        const metodo = etiquetasMetodoPago[v.metodoPago] || v.metodoPago || '—';
        const claseFila = v.cancelada ? 'fila-venta-cancelada' : '';
        const totalTexto = v.cancelada
          ? `${formatearMoneda(v.total || 0)} <span class="etiqueta-venta-cancelada" title="Venta cancelada">Cancelada</span>`
          : formatearMoneda(v.total || 0);
        return `
          <tr class="${claseFila}">
            <td>${v.numeroRecibo}</td>
            <td>${fecha}</td>
            <td>${entrega}</td>
            <td>${metodo}</td>
            <td>${totalTexto}</td>
          </tr>
        `;
      })
      .join('');

    contenidoHistorialCliente.innerHTML = `
      <div class="caja-resumen-item--total-ventas">
        <span class="caja-resumen-item__etiqueta">💰 Total comprado (sin canceladas)</span>
        <span class="caja-resumen-item__valor">${formatearMoneda(totalGastado)}</span>
      </div>
      <div class="tabla-reportes-envoltorio">
        <table class="tabla-reportes">
          <thead>
            <tr>
              <th>Recibo</th>
              <th>Fecha</th>
              <th>Entrega</th>
              <th>Método</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    `;
  }

  document.getElementById('boton-cerrar-historial-cliente').addEventListener('click', () => {
    fondoHistorialCliente.classList.add('oculto');
  });
  document.getElementById('boton-cerrar-historial-cliente-x').addEventListener('click', () => {
    fondoHistorialCliente.classList.add('oculto');
  });
  fondoHistorialCliente.addEventListener('click', (e) => {
    if (e.target === fondoHistorialCliente) fondoHistorialCliente.classList.add('oculto');
  });

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  await cargarClientes();
});

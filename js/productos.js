/**
 * productos.js — CRUD del catálogo de productos (pages/productos.html).
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

  const listaEl = document.getElementById('lista-productos');
  const estadoVacioEl = document.getElementById('estado-vacio');
  const estadoVacioTextoEl = document.getElementById('estado-vacio-texto');
  const buscadorEl = document.getElementById('buscador-productos');
  const fondoModal = document.getElementById('fondo-modal');
  const formProducto = document.getElementById('form-producto');
  const tituloModal = document.getElementById('titulo-modal');
  const errorProducto = document.getElementById('error-producto');

  const campoId = document.getElementById('producto-id');
  const campoNombre = document.getElementById('producto-nombre');
  const campoPrecio = document.getElementById('producto-precio');
  const campoCategoria = document.getElementById('producto-categoria');
  const campoCategoriaSelect = document.getElementById('producto-categoria-select');
  const botonNuevaCategoria = document.getElementById('boton-nueva-categoria');
  const campoFotoCamara = document.getElementById('producto-foto-camara');
  const campoFotoGaleria = document.getElementById('producto-foto-galeria');
  const botonTomarFoto = document.getElementById('boton-tomar-foto');
  const botonElegirGaleria = document.getElementById('boton-elegir-galeria');
  const fotoPreview = document.getElementById('producto-foto-preview');
  const botonQuitarFoto = document.getElementById('boton-quitar-foto');

  // Blob temporal seleccionado en el formulario (File o Blob), hasta guardar.
  let blobFotoSeleccionada = null;
  // URL activa del <img> de preview del formulario, para poder revocarla.
  let urlPreviewModalActiva = null;
  // URLs activas de las miniaturas de la lista, para revocarlas en cada render.
  let urlsListaActivas = [];
  // Array completo de productos ya cargados de la base de datos, para filtrar
  // por texto de búsqueda en memoria sin volver a consultar IndexedDB.
  let todosLosProductos = [];

  buscadorEl.addEventListener('input', () => {
    renderizarLista(filtrarPorBusqueda(todosLosProductos, buscadorEl.value));
  });

  // Quita acentos para que buscar "bionico" también encuentre "Biónico".
  function normalizarTexto(texto) {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function filtrarPorBusqueda(productos, texto) {
    const busqueda = normalizarTexto(texto.trim());
    if (!busqueda) return productos;
    return productos.filter((p) => normalizarTexto(p.nombre).includes(busqueda));
  }

  document.getElementById('boton-nuevo-producto').addEventListener('click', () => {
    abrirModal();
  });

  document.getElementById('boton-cancelar-modal').addEventListener('click', () => {
    cerrarModal();
  });

  document.getElementById('boton-cerrar-modal-x').addEventListener('click', () => {
    cerrarModal();
  });

  // Las fotos del celular/tablet pesan ~3 MB; con decenas de productos eso
  // hace lento el catálogo y gigante el respaldo. Se reducen a un máximo de
  // 400 px de lado en JPEG (~30 KB), más que suficiente para la grilla.
  const LADO_MAX_FOTO = 400;
  function reducirFoto(archivo) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, LADO_MAX_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob || archivo), 'image/jpeg', 0.8);
      };
      // Si el navegador no puede leerla, se guarda la original como antes.
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(archivo);
      };
      img.src = url;
    });
  }

  async function manejarSeleccionArchivo(inputEl) {
    const archivo = inputEl.files && inputEl.files[0];
    if (!archivo) return;

    const foto = await reducirFoto(archivo);
    blobFotoSeleccionada = foto;
    mostrarPreviewModal(foto);
  }

  botonTomarFoto.addEventListener('click', () => campoFotoCamara.click());
  botonElegirGaleria.addEventListener('click', () => campoFotoGaleria.click());

  campoFotoCamara.addEventListener('change', () => manejarSeleccionArchivo(campoFotoCamara));
  campoFotoGaleria.addEventListener('change', () => manejarSeleccionArchivo(campoFotoGaleria));

  botonQuitarFoto.addEventListener('click', () => {
    blobFotoSeleccionada = null;
    campoFotoCamara.value = '';
    campoFotoGaleria.value = '';
    ocultarPreviewModal();
  });

  function mostrarPreviewModal(blob) {
    if (urlPreviewModalActiva) {
      URL.revokeObjectURL(urlPreviewModalActiva);
    }
    urlPreviewModalActiva = URL.createObjectURL(blob);
    fotoPreview.src = urlPreviewModalActiva;
    fotoPreview.classList.remove('oculto');
    botonQuitarFoto.classList.remove('oculto');
  }

  function ocultarPreviewModal() {
    if (urlPreviewModalActiva) {
      URL.revokeObjectURL(urlPreviewModalActiva);
      urlPreviewModalActiva = null;
    }
    fotoPreview.src = '';
    fotoPreview.classList.add('oculto');
    botonQuitarFoto.classList.add('oculto');
  }

  fondoModal.addEventListener('click', (e) => {
    if (e.target === fondoModal) cerrarModal();
  });

  formProducto.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorProducto.classList.remove('visible');

    const nombre = campoNombre.value.trim();
    const precio = parseFloat(campoPrecio.value);
    const categoria = campoCategoria.value.trim();

    if (!nombre) {
      mostrarErrorProducto('El nombre es obligatorio.');
      return;
    }

    if (isNaN(precio) || precio < 0) {
      mostrarErrorProducto('El precio debe ser un número válido.');
      return;
    }

    const idExistente = campoId.value ? Number(campoId.value) : null;

    const botonGuardar = formProducto.querySelector('button[type="submit"]');
    if (botonGuardar.disabled) return;
    botonGuardar.disabled = true;

    try {
      if (idExistente) {
        const producto = await DB.obtenerPorId(DB.STORES.PRODUCTOS, idExistente);
        producto.nombre = nombre;
        producto.precio = precio;
        producto.categoria = categoria || '';
        delete producto.imagenBlob;
        if (blobFotoSeleccionada) {
          producto.imagenBlob = blobFotoSeleccionada;
        }
        await DB.actualizar(DB.STORES.PRODUCTOS, producto);
      } else {
        const nuevoProducto = {
          nombre,
          precio,
          categoria: categoria || '',
          activo: true,
          creadoEn: Date.now(),
        };
        if (blobFotoSeleccionada) {
          nuevoProducto.imagenBlob = blobFotoSeleccionada;
        }
        await DB.agregar(DB.STORES.PRODUCTOS, nuevoProducto);
      }

      cerrarModal();
      await cargarProductos();
    } catch (err) {
      mostrarErrorProducto('No se pudo guardar el producto.');
    } finally {
      botonGuardar.disabled = false;
    }
  });

  function mostrarErrorProducto(mensaje) {
    errorProducto.textContent = mensaje;
    errorProducto.classList.add('visible');
  }

  function abrirModal(producto = null) {
    formProducto.reset();
    errorProducto.classList.remove('visible');
    blobFotoSeleccionada = null;
    ocultarPreviewModal();
    seleccionarCategoriaEnSelect(producto ? producto.categoria || '' : '');

    if (producto) {
      tituloModal.textContent = 'Editar producto';
      campoId.value = producto.id;
      campoNombre.value = producto.nombre;
      campoPrecio.value = producto.precio;

      if (producto.imagenBlob) {
        blobFotoSeleccionada = producto.imagenBlob;
        mostrarPreviewModal(producto.imagenBlob);
      }
    } else {
      tituloModal.textContent = 'Nuevo producto';
      campoId.value = '';
    }

    fondoModal.classList.remove('oculto');
    campoNombre.focus();
  }

  function cerrarModal() {
    fondoModal.classList.add('oculto');
    ocultarPreviewModal();
    blobFotoSeleccionada = null;
    campoFotoCamara.value = '';
    campoFotoGaleria.value = '';
  }

  function formatearPrecio(precio) {
    return 'Q ' + precio.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function eliminarProducto(id, nombre) {
    const confirmado = window.confirm(`¿Eliminar "${nombre}" del catálogo?`);
    if (!confirmado) return;

    await DB.eliminar(DB.STORES.PRODUCTOS, id);
    await cargarProductos();
  }

  async function cargarProductos() {
    const productos = await DB.obtenerTodos(DB.STORES.PRODUCTOS);
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    todosLosProductos = productos;
    actualizarDatalistCategorias(todosLosProductos);
    renderizarLista(filtrarPorBusqueda(todosLosProductos, buscadorEl.value));
  }

  function obtenerCategoriasExistentes(productos) {
    return Array.from(
      new Set(
        productos
          .map((p) => (p.categoria || '').trim())
          .filter((c) => c.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }

  function actualizarDatalistCategorias(productos) {
    const categoriaActual = campoCategoria.value;
    const categorias = obtenerCategoriasExistentes(productos);

    campoCategoriaSelect.innerHTML =
      '<option value="">— Sin categoría —</option>' +
      categorias.map((c) => `<option value="${escaparHtml(c)}">${escaparHtml(c)}</option>`).join('');

    seleccionarCategoriaEnSelect(categoriaActual);
  }

  function seleccionarCategoriaEnSelect(categoria) {
    const existe = Array.from(campoCategoriaSelect.options).some((o) => o.value === categoria);
    if (categoria && !existe) {
      const opcion = document.createElement('option');
      opcion.value = categoria;
      opcion.textContent = categoria;
      campoCategoriaSelect.appendChild(opcion);
    }
    campoCategoriaSelect.value = categoria || '';
    campoCategoria.value = categoria || '';
  }

  campoCategoriaSelect.addEventListener('change', () => {
    campoCategoria.value = campoCategoriaSelect.value;
  });

  botonNuevaCategoria.addEventListener('click', () => {
    const nueva = window.prompt('Nombre de la nueva categoría:');
    if (nueva === null) return;
    const limpia = nueva.trim();
    if (!limpia) return;
    seleccionarCategoriaEnSelect(limpia);
  });

  // Se muestran 50 productos por vez ("Mostrar más"); con cientos de
  // productos con foto, pintarlos todos a la vez es innecesario y pesado.
  const TAMANO_PAGINA = 50;
  let limiteLista = TAMANO_PAGINA;
  let busquedaAnterior = '';
  let productosActuales = [];
  const botonMas = document.createElement('button');
  botonMas.type = 'button';
  botonMas.className = 'boton boton-secundario oculto';
  botonMas.style.cssText = 'display:block;margin:12px auto;';
  listaEl.insertAdjacentElement('afterend', botonMas);
  botonMas.addEventListener('click', () => {
    limiteLista += TAMANO_PAGINA;
    renderizarLista(productosActuales);
  });

  function renderizarLista(productos) {
    // Revocar las miniaturas del render anterior antes de crear nuevas.
    urlsListaActivas.forEach((url) => URL.revokeObjectURL(url));
    urlsListaActivas = [];

    listaEl.innerHTML = '';

    const hayBusqueda = buscadorEl.value.trim().length > 0;

    // Una búsqueda nueva vuelve a las primeras 50.
    if (buscadorEl.value !== busquedaAnterior) {
      busquedaAnterior = buscadorEl.value;
      limiteLista = TAMANO_PAGINA;
    }
    productosActuales = productos;
    const restantes = productos.length - limiteLista;
    botonMas.classList.toggle('oculto', restantes <= 0);
    botonMas.textContent = `Mostrar más (${Math.max(restantes, 0)} restantes)`;

    if (productos.length === 0) {
      if (hayBusqueda) {
        estadoVacioTextoEl.innerHTML = `No se encontraron productos que coincidan con «${escaparHtml(buscadorEl.value.trim())}».`;
      } else {
        estadoVacioTextoEl.innerHTML = 'Todavía no has agregado productos.<br />Toca "Nuevo producto" para empezar.';
      }
      estadoVacioEl.classList.remove('oculto');
      return;
    }

    estadoVacioEl.classList.add('oculto');

    productos.slice(0, limiteLista).forEach((producto) => {
      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta-producto';

      let htmlMiniatura;
      if (producto.imagenBlob) {
        const urlMiniatura = URL.createObjectURL(producto.imagenBlob);
        urlsListaActivas.push(urlMiniatura);
        htmlMiniatura = `<img class="tarjeta-producto__miniatura" src="${urlMiniatura}" alt="" />`;
      } else {
        htmlMiniatura = `<span class="tarjeta-producto__miniatura tarjeta-producto__miniatura--vacia">📦</span>`;
      }

      tarjeta.innerHTML = `
        ${htmlMiniatura}
        <div class="tarjeta-producto__info">
          <p class="tarjeta-producto__nombre">${escaparHtml(producto.nombre)}</p>
          ${producto.categoria ? `<span class="tarjeta-producto__categoria">${escaparHtml(producto.categoria)}</span>` : ''}
          <span class="tarjeta-producto__precio">${formatearPrecio(producto.precio)}</span>
        </div>
        <div class="tarjeta-producto__acciones">
          <button class="boton-icono boton-editar" title="Editar">✏️</button>
          <button class="boton-icono boton-icono--eliminar boton-eliminar" title="Eliminar">🗑️</button>
        </div>
      `;

      tarjeta.querySelector('.boton-editar').addEventListener('click', () => abrirModal(producto));
      tarjeta.querySelector('.boton-eliminar').addEventListener('click', () =>
        eliminarProducto(producto.id, producto.nombre)
      );

      listaEl.appendChild(tarjeta);
    });
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  await cargarProductos();
});

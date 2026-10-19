/**
 * respaldo.js — Exportar/importar un respaldo completo de la base de datos
 * (pages/respaldo.html). Solo accesible para administradores: el archivo
 * incluye datos sensibles (hashes de contraseñas de usuarios).
 */

// Orden en el que se exportan/importan los stores. Al importar se respeta
// este orden para mantener prolijas las relaciones entre stores (aunque
// IndexedDB no impone claves foráneas).
const ORDEN_STORES = ['usuarios', 'productos', 'clientes', 'bancos', 'ajustes', 'cajas', 'ventas', 'detalle_venta', 'gastos'];
// Stores que todo respaldo debe traer; 'bancos' se agregó después, así que los
// respaldos anteriores sin ese store siguen siendo válidos.
const STORES_REQUERIDOS = ['usuarios', 'productos', 'clientes', 'cajas', 'ventas', 'detalle_venta', 'gastos'];

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirAdmin('../index.html', 'inicio.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;
  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  const resumenRespaldo = document.getElementById('resumen-respaldo');
  const mensajeExportar = document.getElementById('mensaje-exportar');
  const botonExportar = document.getElementById('boton-exportar');

  const mensajeImportar = document.getElementById('mensaje-importar');
  const campoArchivo = document.getElementById('archivo-respaldo');
  const botonImportar = document.getElementById('boton-importar');

  await cargarResumen();

  campoArchivo.addEventListener('change', () => {
    botonImportar.disabled = !campoArchivo.files || campoArchivo.files.length === 0;
    ocultarMensaje(mensajeImportar);
  });

  botonExportar.addEventListener('click', async () => {
    ocultarMensaje(mensajeExportar);
    botonExportar.disabled = true;
    try {
      await exportarRespaldo();
      mostrarMensaje(mensajeExportar, 'Respaldo descargado. Guárdalo en un lugar seguro (correo, Drive, etc.).', false);
    } catch (err) {
      console.error(err);
      mostrarMensaje(mensajeExportar, 'No se pudo generar el respaldo.', true);
    } finally {
      botonExportar.disabled = false;
    }
  });

  botonImportar.addEventListener('click', async () => {
    ocultarMensaje(mensajeImportar);
    const archivo = campoArchivo.files && campoArchivo.files[0];
    if (!archivo) return;

    const confirmado = window.confirm(
      'Esto va a BORRAR todos los datos actuales de la app (usuarios, ' +
      'productos, clientes, bancos, ventas, cajas y gastos) y los va a reemplazar por los ' +
      'del archivo elegido. Esta acción no se puede deshacer.\n\n' +
      '¿Seguro que quieres continuar?'
    );
    if (!confirmado) return;

    botonImportar.disabled = true;
    try {
      const texto = await archivo.text();
      let json;
      try {
        json = JSON.parse(texto);
      } catch (err) {
        mostrarMensaje(mensajeImportar, 'Este archivo no parece un respaldo válido de Los Biónicos (JSON inválido).', true);
        return;
      }

      const problema = validarRespaldo(json);
      if (problema) {
        mostrarMensaje(mensajeImportar, `${problema} No se cambió nada.`, true);
        return;
      }

      const { fotosSinRestaurar } = await restaurarRespaldo(json);

      const avisoFotos = fotosSinRestaurar > 0
        ? ` Ojo: ${fotosSinRestaurar} foto(s) de productos no se pudieron recuperar.`
        : '';
      mostrarMensaje(
        mensajeImportar,
        `Respaldo restaurado con éxito.${avisoFotos} Se cerrará la sesión para cargar los datos nuevos; vuelve a entrar con tu usuario.`,
        false
      );
      campoArchivo.value = '';
      await cargarResumen();
      // Los usuarios pudieron cambiar: la sesión actual ya no es confiable.
      Auth.logout();
      setTimeout(() => {
        window.location.href = '../index.html';
      }, fotosSinRestaurar > 0 ? 6000 : 2500);
    } catch (err) {
      console.error(err);
      mostrarMensaje(
        mensajeImportar,
        'No se pudo restaurar el respaldo. No se cambió nada: tus datos actuales siguen intactos.',
        true
      );
    } finally {
      botonImportar.disabled = !campoArchivo.files || campoArchivo.files.length === 0;
    }
  });

  async function cargarResumen() {
    try {
      const conteos = await Promise.all(ORDEN_STORES.map((store) => DB.obtenerTodos(store)));
      const etiquetas = {
        usuarios: 'usuarios',
        productos: 'productos',
        clientes: 'clientes',
        bancos: 'bancos',
        ajustes: 'ajustes',
        ventas: 'ventas',
        detalle_venta: 'renglones de detalle de venta',
        cajas: 'cajas',
        gastos: 'gastos',
      };
      const partes = ORDEN_STORES.map((store, i) => `${conteos[i].length} ${etiquetas[store]}`);
      resumenRespaldo.textContent = partes.join(', ') + '.';
    } catch (err) {
      console.error(err);
      resumenRespaldo.textContent = 'No se pudo calcular el resumen de datos.';
    }
  }
});

/**
 * Convierte un Blob a una cadena dataURL (base64) usando FileReader.
 */
function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

/**
 * Lee todos los stores, convierte los Blobs de productos a base64 y arma
 * el objeto JSON del respaldo, dispara la descarga y limpia la URL temporal.
 */
async function exportarRespaldo() {
  const datos = {};

  for (const store of ORDEN_STORES) {
    const registros = await DB.obtenerTodos(store);

    if (store === 'productos') {
      // No mutar los objetos originales de IndexedDB: se trabaja sobre copias.
      const registrosSerializables = [];
      for (const producto of registros) {
        const copia = { ...producto };
        if (copia.imagenBlob) {
          copia.imagenBlob = await blobADataUrl(copia.imagenBlob);
          copia.imagenBlobEsBase64 = true;
        }
        registrosSerializables.push(copia);
      }
      datos[store] = registrosSerializables;
    } else {
      datos[store] = registros;
    }
  }

  // 'conteos' permite detectar al importar un archivo incompleto o editado.
  const conteos = {};
  for (const store of ORDEN_STORES) conteos[store] = datos[store].length;

  const respaldo = {
    app: 'Los Biónicos',
    version: 1,
    fechaExportacion: Date.now(),
    conteos,
    datos,
  };

  // JSON compacto (sin sangrías): archivo más chico y más rápido de generar.
  const blob = new Blob([JSON.stringify(respaldo)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `respaldo-los-bionicos-${nombreFechaHoy()}.json`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  URL.revokeObjectURL(url);

  localStorage.setItem('ventpro_ultimo_respaldo', String(Date.now()));
}

function nombreFechaHoy() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Revisa TODO el archivo antes de tocar la base de datos. Devuelve un texto
 * explicando el problema, o null si el respaldo es válido.
 */
function validarRespaldo(json) {
  const noValido = 'Este archivo no parece un respaldo válido de Los Biónicos.';
  if (!json || typeof json !== 'object' || Array.isArray(json)) return noValido;
  if (!json.datos || typeof json.datos !== 'object') return noValido;

  for (const store of STORES_REQUERIDOS) {
    if (!Array.isArray(json.datos[store])) return `${noValido} Falta la sección "${store}".`;
  }

  for (const store of ORDEN_STORES) {
    const registros = json.datos[store];
    if (registros === undefined) continue; // respaldos viejos sin 'bancos' o 'ajustes'
    if (!Array.isArray(registros)) return `${noValido} La sección "${store}" está dañada.`;

    const ids = new Set();
    const recibos = new Set();
    const usuarios = new Set();
    for (const registro of registros) {
      if (!registro || typeof registro !== 'object' || Array.isArray(registro)) {
        return `${noValido} Hay registros dañados en "${store}".`;
      }
      if (registro.id !== undefined) {
        if (typeof registro.id !== 'number' || !Number.isFinite(registro.id)) {
          return `${noValido} Hay registros con identificador inválido en "${store}".`;
        }
        if (ids.has(registro.id)) return `Archivo dañado: hay registros repetidos en "${store}".`;
        ids.add(registro.id);
      }
      if (store === 'ventas' && registro.numeroRecibo !== undefined) {
        if (recibos.has(registro.numeroRecibo)) return 'Archivo dañado: hay números de recibo repetidos.';
        recibos.add(registro.numeroRecibo);
      }
      if (store === 'usuarios' && registro.usuario !== undefined) {
        if (usuarios.has(registro.usuario)) return 'Archivo dañado: hay nombres de usuario repetidos.';
        usuarios.add(registro.usuario);
      }
    }

    // Los respaldos nuevos traen la cantidad esperada de cada sección.
    if (json.conteos && typeof json.conteos[store] === 'number' && json.conteos[store] !== registros.length) {
      return `El archivo está incompleto o fue modificado (en "${store}" faltan registros).`;
    }
  }
  return null;
}

/**
 * Convierte las fotos de base64 a Blob. Se hace ANTES de abrir la
 * transacción: dentro de ella no se puede esperar nada asíncrono.
 */
async function prepararRegistrosParaRestaurar(json) {
  const preparados = {};
  let fotosSinRestaurar = 0;

  for (const store of ORDEN_STORES) {
    const lista = [];
    for (const registro of json.datos[store] || []) {
      const copia = { ...registro };

      if (store === 'productos') {
        if (copia.imagenBlob && copia.imagenBlobEsBase64) {
          try {
            const respuesta = await fetch(copia.imagenBlob);
            copia.imagenBlob = await respuesta.blob();
          } catch (err) {
            console.error('No se pudo convertir la imagen del producto', copia.id, err);
            copia.imagenBlob = null;
            fotosSinRestaurar += 1;
          }
        }
        delete copia.imagenBlobEsBase64;
      }

      lista.push(copia);
    }
    preparados[store] = lista;
  }

  return { preparados, fotosSinRestaurar };
}

/**
 * Reemplaza todos los datos por los del respaldo en UNA sola transacción:
 * si algo falla, no cambia nada (la base queda exactamente como estaba).
 * Conserva los ids originales (put con el id del registro).
 */
async function restaurarRespaldo(json) {
  const { preparados, fotosSinRestaurar } = await prepararRegistrosParaRestaurar(json);
  await DB.reemplazarTodo(preparados);
  return { fotosSinRestaurar };
}

function mostrarMensaje(elemento, texto, esError) {
  elemento.textContent = texto;
  elemento.classList.add('visible');
  elemento.classList.toggle('mensaje-exito', !esError);
  elemento.classList.toggle('mensaje-error', esError !== false);
}

function ocultarMensaje(elemento) {
  elemento.textContent = '';
  elemento.classList.remove('visible');
}

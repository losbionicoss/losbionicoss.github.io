// Impresión directa por Bluetooth (Web Bluetooth + ESC/POS) para impresoras
// térmicas BLE de 80 mm (SAT Q22, "Printer001": servicio 0xFF00, escritura 0xFF02).
// Safari en iPad NO tiene Web Bluetooth; funciona en el navegador Bluefy.
// Si navigator.bluetooth no existe, disponible() devuelve false y quien llama
// debe avisar al usuario que abra la app en Bluefy.
const ImpresoraBLE = (() => {
  const SERVICIO = '0000ff00-0000-1000-8000-00805f9b34fb';
  const CARACTERISTICA = '0000ff02-0000-1000-8000-00805f9b34fb';
  const COLUMNAS = 48; // 80 mm, fuente A a 203 dpi
  const TAM_PAQUETE = 100;
  const PAUSA_MS = 25;

  let dispositivo = null;
  let caracteristica = null;

  function disponible() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  // Bluefy a veces rechaza con un error sin texto; este envoltorio indica en
  // qué paso falló para poder diagnosticarlo.
  async function paso(nombre, accion) {
    try {
      return await accion();
    } catch (error) {
      if (error && error.name === 'NotFoundError' && nombre === 'elegir impresora') throw error;
      const detalle = (error && (error.message || error.name)) || String(error);
      const nuevo = new Error(`[${nombre}] ${detalle}`);
      nuevo.name = (error && error.name) || 'Error';
      throw nuevo;
    }
  }

  async function conectar() {
    if (caracteristica && dispositivo && dispositivo.gatt.connected) return caracteristica;

    // requestDevice debe ejecutarse directo desde el toque del usuario.
    if (!dispositivo) {
      dispositivo = await paso('elegir impresora', () =>
        navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [SERVICIO]
        })
      );
      dispositivo.addEventListener('gattserverdisconnected', () => {
        caracteristica = null;
      });
    }
    const servidor = await paso('conectar', () => dispositivo.gatt.connect());
    const servicio = await paso('servicio FF00', () => servidor.getPrimaryService(SERVICIO));
    caracteristica = await paso('caracteristica FF02', () => servicio.getCharacteristic(CARACTERISTICA));
    return caracteristica;
  }

  // ---------- ESC/POS ----------
  const ESC = 0x1b;
  const GS = 0x1d;

  // La impresora no trae tildes/ñ de forma fiable: se quitan.
  function limpiar(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e\n]/g, '?');
  }

  function formatearMoneda(monto) {
    return 'Q ' + monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const ETIQUETAS_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', deposito: 'Deposito', pedidosya: 'Pedidos Ya' };

  // Texto a la izquierda y monto a la derecha en una sola línea.
  function linea2(izq, der) {
    izq = limpiar(izq);
    der = limpiar(der);
    const libre = COLUMNAS - der.length - 1;
    if (izq.length > libre) izq = izq.slice(0, Math.max(libre, 0));
    return izq + ' '.repeat(Math.max(COLUMNAS - izq.length - der.length, 1)) + der;
  }

  // Parte un texto largo en varias líneas del ancho del papel.
  function envolver(texto) {
    const salida = [];
    for (const parrafo of limpiar(texto).split('\n')) {
      let resto = parrafo;
      while (resto.length > COLUMNAS) {
        let corte = resto.lastIndexOf(' ', COLUMNAS);
        if (corte <= 0) corte = COLUMNAS;
        salida.push(resto.slice(0, corte));
        resto = resto.slice(corte).trimStart();
      }
      salida.push(resto);
    }
    return salida;
  }

  // Herramientas para armar un ticket ESC/POS (compartidas por el recibo del
  // cliente y el ticket de cocina).
  function nuevoTicket() {
    const bytes = [];
    const crudo = (...b) => bytes.push(...b);
    const texto = (t) => {
      for (const c of limpiar(t)) bytes.push(c.charCodeAt(0));
    };
    const fila = (t) => {
      texto(t);
      crudo(0x0a);
    };
    const alinear = (n) => crudo(ESC, 0x61, n); // 0 izq, 1 centro
    const negrita = (on) => crudo(ESC, 0x45, on ? 1 : 0);
    const grande = (on) => crudo(GS, 0x21, on ? 0x11 : 0x00);
    const separador = () => fila('-'.repeat(COLUMNAS));
    const cortar = () => {
      crudo(ESC, 0x64, 4); // avanzar 4 líneas
      crudo(GS, 0x56, 0x42, 0x00); // cortar (avanza y corta)
    };
    crudo(ESC, 0x40); // inicializar
    return { bytes, crudo, fila, alinear, negrita, grande, separador, cortar };
  }

  function construirRecibo(venta) {
    const { bytes, fila, alinear, negrita, grande, separador, cortar } = nuevoTicket();

    alinear(1);
    negrita(true);
    grande(true);
    fila('Fruteria Los Bionicos');
    grande(false);
    negrita(false);
    if (venta.direccionNegocio) envolver(venta.direccionNegocio).forEach(fila);
    if (venta.telefonoNegocio) fila(`Tel: ${venta.telefonoNegocio}`);
    fila(new Date(venta.fecha).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }));
    fila(`Recibo #${venta.numeroRecibo}`);
    fila(`Atendio: ${venta.cajero}`);
    alinear(0);
    separador();

    for (const l of venta.lineas) {
      const extra = l.extra || 0;
      const subtotal = (l.precio + extra) * l.cantidad;
      fila(linea2(`${l.cantidad} x ${l.nombre}`, formatearMoneda(subtotal)));
      if (extra > 0) fila(`  (${formatearMoneda(l.precio)} + ${formatearMoneda(extra)} extra)`);
      if (l.nota) envolver(`  Nota: ${l.nota}`).forEach(fila);
    }
    if (venta.esDomicilio && venta.costoEnvio > 0) {
      fila(linea2('Envio a domicilio', formatearMoneda(venta.costoEnvio)));
    }
    separador();

    negrita(true);
    grande(true);
    // En tamaño doble caben la mitad de columnas.
    const montoTotal = formatearMoneda(venta.total);
    fila('Total' + ' '.repeat(Math.max(COLUMNAS / 2 - 5 - montoTotal.length, 1)) + montoTotal);
    grande(false);
    negrita(false);
    fila(`Metodo de pago: ${ETIQUETAS_PAGO[venta.metodoPago] || venta.metodoPago || ''}`);
    const tipoPedido = venta.esPedidosYa ? 'Pedidos Ya' : venta.esDomicilio ? 'A domicilio' : 'Local';
    fila(`Tipo de pedido: ${tipoPedido}`);

    if (venta.esPedidosYa) {
      separador();
      fila('Pedidos Ya');
      envolver(`Cliente: ${venta.clienteNombre || ''}`).forEach(fila);
    }

    if (venta.esDomicilio) {
      separador();
      fila('Entrega a domicilio');
      const extras = [venta.clienteNombre, venta.clienteTelefono, venta.clienteDireccion];
      if (venta.telefonoAlterno) extras.push(`Tel. alterno: ${venta.telefonoAlterno}`);
      if (venta.notasEntrega) extras.push(venta.notasEntrega);
      extras.filter(Boolean).forEach((t) => envolver(t).forEach(fila));
    }

    separador();
    alinear(1);
    fila('Gracias por su compra!');
    alinear(0);
    cortar();

    return new Uint8Array(bytes);
  }

  // Segundo ticket de cada impresión: para la cocina. Sin título, sin datos del
  // negocio, del cliente ni método de pago; solo lo necesario para preparar el
  // pedido: número de recibo y tipo en una línea, fecha y hora, y luego
  // productos, cantidades, precios y total. Ahorra papel frente a repetir el
  // recibo completo.
  function construirTicketCocina(venta) {
    const { bytes, fila, alinear, negrita, grande, separador, cortar } = nuevoTicket();
    const tipoPedido = venta.esPedidosYa ? 'PEDIDOS YA' : venta.esDomicilio ? 'A DOMICILIO' : 'LOCAL';

    alinear(1);
    negrita(true);
    grande(true);
    // Todo en una sola línea ("Recibo #12 A DOMICILIO"). En tamaño doble caben
    // 24 caracteres; si algún día no cupiera, se parte en dos líneas.
    const encabezado = `Recibo #${venta.numeroRecibo} ${tipoPedido}`;
    if (encabezado.length <= COLUMNAS / 2) {
      fila(encabezado);
    } else {
      fila(`Recibo #${venta.numeroRecibo}`);
      fila(tipoPedido);
    }
    grande(false);
    negrita(false);
    fila(new Date(venta.fecha).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }));
    alinear(0);
    separador();

    negrita(true);
    for (const l of venta.lineas) {
      const extra = l.extra || 0;
      const subtotal = (l.precio + extra) * l.cantidad;
      fila(linea2(`${l.cantidad} x ${l.nombre}`, formatearMoneda(subtotal)));
      if (extra > 0) fila(`  (${formatearMoneda(l.precio)} + ${formatearMoneda(extra)} extra)`);
      // La nota (ej. "sin azucar") es parte de lo que la cocina debe preparar.
      if (l.nota) envolver(`  Nota: ${l.nota}`).forEach(fila);
    }
    negrita(false);
    if (venta.esDomicilio && venta.costoEnvio > 0) {
      fila(linea2('Envio a domicilio', formatearMoneda(venta.costoEnvio)));
    }
    separador();

    negrita(true);
    grande(true);
    const montoTotal = formatearMoneda(venta.total);
    fila('Total' + ' '.repeat(Math.max(COLUMNAS / 2 - 5 - montoTotal.length, 1)) + montoTotal);
    grande(false);
    negrita(false);
    cortar();

    return new Uint8Array(bytes);
  }

  async function enviar(datos) {
    const c = await conectar();
    for (let i = 0; i < datos.length; i += TAM_PAQUETE) {
      const trozo = datos.slice(i, i + TAM_PAQUETE);
      await paso('enviar datos', () => {
        // Bluefy puede no exponer writeValueWithoutResponse; writeValue funciona en ambos casos.
        if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) return c.writeValueWithoutResponse(trozo);
        return c.writeValue(trozo);
      });
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
  }

  // Cada ticket termina con avance y corte, así que concatenarlos da tickets
  // separados en una sola conexión.
  function unir(...tickets) {
    const todo = new Uint8Array(tickets.reduce((n, tk) => n + tk.length, 0));
    let posicion = 0;
    for (const tk of tickets) {
      todo.set(tk, posicion);
      posicion += tk.length;
    }
    return todo;
  }

  // Acepta la venta o una promesa de la venta. La conexión se inicia primero y
  // de forma síncrona: Web Bluetooth solo deja elegir la impresora dentro del
  // toque del usuario, así que no puede haber ningún await (por ejemplo, leer
  // la base de datos) antes de requestDevice.
  async function imprimir(ventaOPromesa) {
    const conexion = conectar();
    const [venta] = await Promise.all([ventaOPromesa, conexion]);
    // 1.º recibo para el cliente, 2.º ticket para la cocina.
    await enviar(unir(construirRecibo(venta), construirTicketCocina(venta)));
  }

  // Parte un texto en líneas de máximo `max` caracteres (para el recibo en imagen).
  function partirTexto(texto, max) {
    const salida = [];
    let resto = String(texto || '').trim();
    while (resto.length > max) {
      let corte = resto.lastIndexOf(' ', max);
      if (corte <= 0) corte = max;
      salida.push(resto.slice(0, corte));
      resto = resto.slice(corte).trimStart();
    }
    if (resto) salida.push(resto);
    return salida;
  }

  return { disponible, imprimir, partirTexto, construirRecibo, construirTicketCocina };
})();

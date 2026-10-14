function validarTransferencia_(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de transferencia inválidos.');

  const monto = (dinero_(datos.monto,'Monto',false)/100).toFixed(2);
  const origen = buscar_('Cuentas', String(datos.cuentaOrigenId || ''));
  const destino = buscar_('Cuentas', String(datos.cuentaDestinoId || ''));

  if (!origen || !activo_(origen.activa)) throw new Error('Selecciona una cuenta de origen válida.');
  if (!destino || !activo_(destino.activa)) throw new Error('Selecciona una cuenta de destino válida.');
  if (origen.id === destino.id) throw new Error('La cuenta de origen y destino deben ser diferentes.');

  const monedaOrigen = String(origen.moneda || '').toUpperCase();
  const monedaDestino = String(destino.moneda || '').toUpperCase();
  let tasaCambio = 1;
  let montoDestino = Number(monto);

  if (monedaOrigen !== monedaDestino) {
    const parValido = new Set([monedaOrigen,monedaDestino]);
    if (!(parValido.has('USD') && parValido.has('DOP') && parValido.size === 2)) {
      throw new Error('Por ahora la conversión automática admite transferencias entre DOP y USD.');
    }
    tasaCambio = Number(datos.tasaCambio || tasaUsdDop_());
    if (!Number.isFinite(tasaCambio) || tasaCambio <= 0 || tasaCambio > 1000) {
      throw new Error('La tasa USD/DOP no es válida.');
    }
    montoDestino = convertirMoneda_(Number(monto), monedaOrigen, monedaDestino, tasaCambio);
    if (!Number.isFinite(montoDestino) || montoDestino <= 0) throw new Error('No se pudo calcular el monto de destino.');
  }

  const fecha = fecha_(datos.fecha);
  const descripcion = String(datos.descripcion == null ? '' : datos.descripcion).trim();
  if (descripcion.length > 160) throw new Error('La descripción debe tener 160 caracteres o menos.');

  return {
    monto,
    montoDestino:Number(montoDestino).toFixed(2),
    tasaCambio:Number(tasaCambio).toFixed(4),
    monedaOrigen,
    monedaDestino,
    cuentaOrigenId:origen.id,
    cuentaDestinoId:destino.id,
    fecha,
    descripcion
  };
}

function obtenerTransferencias(filtros) {
  filtros = filtros || {};
  let items = leerTabla_('Transferencias').filter(x => activo_(x.activo));

  if (filtros.cuentaId) {
    items = items.filter(x => x.cuentaOrigenId === filtros.cuentaId || x.cuentaDestinoId === filtros.cuentaId);
  }

  return items.sort((a,b) => {
    const fa = fechaClave_(a.fecha);
    const fb = fechaClave_(b.fecha);
    if (fa !== fb) return fb.localeCompare(fa);
    return String(b.fechaActualizacion || b.fechaCreacion || '').localeCompare(String(a.fechaActualizacion || a.fechaCreacion || ''));
  });
}

function crearTransferencia(datos) {
  return bloqueo_(() => {
    const v = validarTransferencia_(datos);
    const now = instante_();
    const t = {id:nuevoId_('trf'),...v,fechaCreacion:now,fechaActualizacion:now,activo:'true'};
    agregar_('Transferencias',t);
    return publicoTransferencia_(t);
  });
}

function editarTransferencia(id, datos) {
  return bloqueo_(() => {
    const actual = buscar_('Transferencias',id);
    if (!actual || !activo_(actual.activo)) throw new Error('La transferencia no existe.');
    const v = validarTransferencia_(datos);
    const updated={...actual,...v,fechaActualizacion:instante_()};
    actualizar_('Transferencias',actual._row,updated);
    return publicoTransferencia_(updated);
  });
}

function eliminarTransferencia(id) {
  return bloqueo_(() => {
    const actual = buscar_('Transferencias',id);
    if (!actual || !activo_(actual.activo)) throw new Error('La transferencia no existe.');
    actualizar_('Transferencias',actual._row,{...actual,activo:'false',fechaActualizacion:instante_()});
    return {id};
  });
}

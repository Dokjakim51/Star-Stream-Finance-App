function validarMovimiento_(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de movimiento inválidos.');
  const tipo = String(datos.tipo || '');
  if (!['INGRESO','GASTO'].includes(tipo)) throw new Error('Tipo de movimiento inválido.');
  const monto = (dinero_(datos.monto,'Monto',false)/100).toFixed(2);
  const cuenta = buscar_('Cuentas',String(datos.cuentaId || ''));
  if (!cuenta || !activo_(cuenta.activa)) throw new Error('Selecciona una cuenta válida.');
  const categoria = buscar_('Categorias',String(datos.categoriaId || ''));
  if (!categoria || !activo_(categoria.activa) || categoria.tipo !== tipo) throw new Error('Selecciona una categoría correspondiente al tipo.');
  const fecha = fecha_(datos.fecha);
  const descripcion = String(datos.descripcion == null ? '' : datos.descripcion).trim();
  if (descripcion.length > 160) throw new Error('La descripción debe tener 160 caracteres o menos.');
  return {tipo,monto,cuentaId:cuenta.id,categoriaId:categoria.id,fecha,descripcion};
}

function obtenerMovimientos(filtros) {
  filtros = filtros || {};

  let items = leerTabla_('Movimientos')
    .filter(x => activo_(x.activo));

  if (filtros.cuentaId) {
    items = items.filter(x => x.cuentaId === filtros.cuentaId);
  }

  if (filtros.tipo) {
    items = items.filter(x => x.tipo === filtros.tipo);
  }

  return items.sort((a, b) => {
    const fechaA = fechaClave_(a.fecha);
    const fechaB = fechaClave_(b.fecha);
    return fechaB.localeCompare(fechaA);
  });
}

function crearMovimiento(datos) {
  return bloqueo_(() => {
    const v = validarMovimiento_(datos), now = instante_();
    const m = {id:nuevoId_('mov'),...v,fechaCreacion:now,fechaActualizacion:now,activo:'true'};
    agregar_('Movimientos',m); return publicoMov_(m);
  });
}
function editarMovimiento(id,datos) {
  return bloqueo_(() => {
    const actual = buscar_('Movimientos',id);
    if (!actual || !activo_(actual.activo)) throw new Error('El movimiento no existe.');
    const v = validarMovimiento_(datos);
    const updated={...actual,...v,fechaActualizacion:instante_()};
    actualizar_('Movimientos',actual._row,updated);
    return publicoMov_(updated);
  });
}
function eliminarMovimiento(id) {
  return bloqueo_(() => {
    const actual = buscar_('Movimientos',id);
    if (!actual || !activo_(actual.activo)) throw new Error('El movimiento no existe.');
    actualizar_('Movimientos',actual._row,{...actual,activo:'false',fechaActualizacion:instante_()});
    return {id};
  });
}

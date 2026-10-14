function balanceMetaCentavos_(metaId, excluirMovimientoId) {
  const meta = buscar_('Metas', String(metaId || ''));
  if (!meta) throw new Error('La meta no existe.');
  return leerTabla_('MovimientosMetas')
    .filter(x => activo_(x.activo) && x.metaId === meta.id && x.id !== excluirMovimientoId)
    .reduce((sum, x) => sum + (x.tipo === 'APORTE' ? 1 : -1) * centavos_(x.monto), 0);
}

function estadoPublicoMeta_(meta, ahorradoCentavos) {
  if (!activo_(meta.activa)) return 'ARCHIVADA';
  if (String(meta.estado || '').toUpperCase() === 'PAUSADA') return 'PAUSADA';
  const objetivo = centavos_(meta.montoObjetivo);
  if (objetivo > 0 && ahorradoCentavos >= objetivo) return 'COMPLETADA';
  return 'ACTIVA';
}

function publicoMeta_(meta) {
  const ahorrado = balanceMetaCentavos_(meta.id);
  const objetivo = Math.max(centavos_(meta.montoObjetivo), 1);
  const estado = estadoPublicoMeta_(meta, ahorrado);
  return {
    id:meta.id,
    nombre:meta.nombre,
    montoObjetivo:Number(meta.montoObjetivo),
    moneda:String(meta.moneda || 'DOP').toUpperCase(),
    fechaObjetivo:fechaClave_(meta.fechaObjetivo) || '',
    icono:meta.icono || '✦',
    estado,
    fechaCreacion:meta.fechaCreacion || '',
    fechaActualizacion:meta.fechaActualizacion || '',
    activa:activo_(meta.activa),
    montoAhorrado:ahorrado/100,
    montoRestante:Math.max(0, objetivo-ahorrado)/100,
    progreso:Math.max(0, Math.min(100, (ahorrado/objetivo)*100))
  };
}

function validarMeta_(datos, idActual) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de meta inválidos.');
  const nombre = texto_(datos.nombre,'Nombre',80);
  const montoObjetivo = (dinero_(datos.montoObjetivo,'Monto objetivo',false)/100).toFixed(2);
  const moneda = String(datos.moneda || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error('Moneda inválida: usa un código de tres letras.');
  const fechaObjetivo = String(datos.fechaObjetivo || '').trim();
  if (fechaObjetivo) fecha_(fechaObjetivo);
  const icono = String(datos.icono || '✦').trim() || '✦';
  if (icono.length > 12) throw new Error('El icono debe ser corto.');

  if (idActual) {
    const actual = buscar_('Metas', idActual);
    if (!actual) throw new Error('La meta no existe.');
    const tieneHistorial = leerTabla_('MovimientosMetas')
      .some(x => activo_(x.activo) && x.metaId === idActual);
    if (tieneHistorial && String(actual.moneda).toUpperCase() !== moneda) {
      throw new Error('No puedes cambiar la moneda de una meta que ya tiene aportes o retiros.');
    }
  }

  return {nombre,montoObjetivo,moneda,fechaObjetivo,icono};
}

function obtenerMetasTodas() {
  const metas = leerTabla_('Metas').filter(m => String(m.id || '').trim());
  const balances = Object.fromEntries(metas.map(m => [String(m.id),0]));
  leerTabla_('MovimientosMetas').forEach(x => {
    if (!activo_(x.activo)) return;
    const id = String(x.metaId);
    if (Object.prototype.hasOwnProperty.call(balances,id)) {
      balances[id] += (x.tipo === 'APORTE' ? 1 : -1) * centavos_(x.monto);
    }
  });

  return metas.map(meta => {
      const ahorrado = balances[String(meta.id)] || 0;
      const objetivo = Math.max(centavos_(meta.montoObjetivo),1);
      const estado = estadoPublicoMeta_(meta,ahorrado);
      return {
        id:meta.id,nombre:meta.nombre,montoObjetivo:Number(meta.montoObjetivo),
        moneda:String(meta.moneda || 'DOP').toUpperCase(),fechaObjetivo:fechaClave_(meta.fechaObjetivo) || '',
        icono:meta.icono || '✦',estado,fechaCreacion:meta.fechaCreacion || '',fechaActualizacion:meta.fechaActualizacion || '',
        activa:activo_(meta.activa),montoAhorrado:ahorrado/100,montoRestante:Math.max(0,objetivo-ahorrado)/100,
        progreso:Math.max(0,Math.min(100,(ahorrado/objetivo)*100))
      };
    })
    .sort((a,b) => {
      const order = {ACTIVA:0,COMPLETADA:1,PAUSADA:2,ARCHIVADA:3};
      if ((order[a.estado] ?? 9) !== (order[b.estado] ?? 9)) return (order[a.estado] ?? 9) - (order[b.estado] ?? 9);
      return String(a.nombre).localeCompare(String(b.nombre),'es');
    });
}

function crearMeta(datos) {
  return bloqueo_(() => {
    const v = validarMeta_(datos,'');
    const now = instante_();
    const meta = {
      id:nuevoId_('goal'),
      ...v,
      estado:'ACTIVA',
      fechaCreacion:now,
      fechaActualizacion:now,
      activa:'true'
    };
    agregar_('Metas',meta);
    return {id:meta.id};
  });
}

function editarMeta(id,datos) {
  return bloqueo_(() => {
    const actual = buscar_('Metas',String(id || ''));
    if (!actual || !activo_(actual.activa)) throw new Error('La meta no existe o está archivada.');
    const v = validarMeta_(datos,actual.id);
    actualizar_('Metas',actual._row,{...actual,...v,fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function pausarMeta(id) {
  return bloqueo_(() => {
    const actual = buscar_('Metas',String(id || ''));
    if (!actual || !activo_(actual.activa)) throw new Error('La meta no existe o está archivada.');
    actualizar_('Metas',actual._row,{...actual,estado:'PAUSADA',fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function reanudarMeta(id) {
  return bloqueo_(() => {
    const actual = buscar_('Metas',String(id || ''));
    if (!actual || !activo_(actual.activa)) throw new Error('La meta no existe o está archivada.');
    actualizar_('Metas',actual._row,{...actual,estado:'ACTIVA',fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function archivarMeta(id) {
  return bloqueo_(() => {
    const actual = buscar_('Metas',String(id || ''));
    if (!actual || !activo_(actual.activa)) throw new Error('La meta no existe o ya está archivada.');
    const balance = balanceMetaCentavos_(actual.id);
    if (balance !== 0) throw new Error('Retira primero todo el dinero de la meta antes de archivarla.');
    actualizar_('Metas',actual._row,{...actual,estado:'ARCHIVADA',activa:'false',fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function validarMovimientoMeta_(datos, excluirId) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de aporte o retiro inválidos.');
  const tipo = String(datos.tipo || '').trim().toUpperCase();
  if (!['APORTE','RETIRO'].includes(tipo)) throw new Error('Tipo de operación de meta inválido.');
  const montoCentavos = dinero_(datos.monto,'Monto',false);
  const meta = buscar_('Metas',String(datos.metaId || ''));
  if (!meta || !activo_(meta.activa)) throw new Error('Selecciona una meta activa.');
  if (tipo === 'APORTE' && String(meta.estado || '').toUpperCase() === 'PAUSADA') {
    throw new Error('Reanuda la meta antes de hacer un aporte.');
  }
  const cuenta = buscar_('Cuentas',String(datos.cuentaId || ''));
  if (!cuenta || !activo_(cuenta.activa)) throw new Error('Selecciona una cuenta activa.');
  if (String(cuenta.moneda).toUpperCase() !== String(meta.moneda).toUpperCase()) {
    throw new Error('La cuenta y la meta deben usar la misma moneda.');
  }
  const fecha = fecha_(datos.fecha);
  const descripcion = String(datos.descripcion == null ? '' : datos.descripcion).trim();
  if (descripcion.length > 160) throw new Error('La descripción debe tener 160 caracteres o menos.');

  if (tipo === 'APORTE') {
    const disponible = saldoCuentaCentavos_(cuenta.id, excluirId);
    if (montoCentavos > disponible) throw new Error('La cuenta no tiene saldo suficiente para ese aporte.');
    const baseMeta = balanceMetaCentavos_(meta.id, excluirId);
    if (baseMeta + montoCentavos < 0) {
      throw new Error('Ese cambio dejaría la meta con saldo negativo. Ajusta primero sus retiros.');
    }
  } else {
    const ahorrado = balanceMetaCentavos_(meta.id, excluirId);
    if (montoCentavos > ahorrado) throw new Error('La meta no tiene suficiente dinero para ese retiro.');
  }

  return {
    tipo,
    monto:(montoCentavos/100).toFixed(2),
    metaId:meta.id,
    cuentaId:cuenta.id,
    fecha,
    descripcion
  };
}

function obtenerMovimientosMetas(filtros) {
  filtros = filtros || {};
  let items = leerTabla_('MovimientosMetas').filter(x => activo_(x.activo));
  if (filtros.metaId) items = items.filter(x => x.metaId === filtros.metaId);
  if (filtros.cuentaId) items = items.filter(x => x.cuentaId === filtros.cuentaId);
  if (filtros.tipo) items = items.filter(x => x.tipo === filtros.tipo);
  return items.sort((a,b) => {
    const fa = fechaClave_(a.fecha), fb = fechaClave_(b.fecha);
    if (fa !== fb) return fb.localeCompare(fa);
    return String(b.fechaActualizacion || b.fechaCreacion || '').localeCompare(String(a.fechaActualizacion || a.fechaCreacion || ''));
  });
}

function crearMovimientoMeta(datos) {
  return bloqueo_(() => {
    const v = validarMovimientoMeta_(datos,'');
    const now = instante_();
    const item = {id:nuevoId_('gmv'),...v,fechaCreacion:now,fechaActualizacion:now,activo:'true'};
    agregar_('MovimientosMetas',item);
    return {id:item.id};
  });
}

function editarMovimientoMeta(id,datos) {
  return bloqueo_(() => {
    const actual = buscar_('MovimientosMetas',String(id || ''));
    if (!actual || !activo_(actual.activo)) throw new Error('El movimiento de meta no existe.');
    const v = validarMovimientoMeta_(datos,actual.id);
    actualizar_('MovimientosMetas',actual._row,{...actual,...v,fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function eliminarMovimientoMeta(id) {
  return bloqueo_(() => {
    const actual = buscar_('MovimientosMetas',String(id || ''));
    if (!actual || !activo_(actual.activo)) throw new Error('El movimiento de meta no existe.');
    if (actual.tipo === 'APORTE') {
      const restante = balanceMetaCentavos_(actual.metaId, actual.id);
      if (restante < 0) {
        throw new Error('No puedes eliminar este aporte porque dejaría la meta con saldo negativo. Elimina o ajusta primero los retiros posteriores.');
      }
    }
    actualizar_('MovimientosMetas',actual._row,{...actual,activo:'false',fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

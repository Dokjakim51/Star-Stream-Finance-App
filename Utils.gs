function texto_(value,label,max) {
  const s = String(value == null ? '' : value).trim();
  if (!s || s.length > max) throw new Error(label + ': introduce entre 1 y ' + max + ' caracteres.');
  return s;
}

function dinero_(value,label,allowZero) {
  const s = String(value == null ? '' : value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s)) {
    throw new Error(label + ': usa un número con hasta dos decimales, sin separadores.');
  }
  const cents = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1)) {
    throw new Error(label + ': importe fuera de rango.');
  }
  return cents;
}

function fecha_(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Fecha inválida.');
  const [y,m,d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  if (date.toISOString().slice(0,10) !== s) throw new Error('Fecha inválida.');
  return s;
}

function fechaClave_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'America/Santo_Domingo', 'yyyy-MM-dd');
  }
  const match = String(value == null ? '' : value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
}

function instante_() { return new Date().toISOString(); }
function centavos_(v) { return Math.round(Number(v)*100); }

function publicoCuenta_(x,balance) {
  return {
    id:x.id,
    nombre:x.nombre,
    tipo:x.tipo,
    moneda:x.moneda,
    saldoInicial:Number(x.saldoInicial),
    saldo:balance/100,
    fechaCreacion:x.fechaCreacion,
    activa:activo_(x.activa)
  };
}

function publicoMov_(x) {
  return {
    id:x.id,
    tipo:x.tipo,
    monto:Number(x.monto),
    cuentaId:x.cuentaId,
    categoriaId:x.categoriaId,
    fecha:fechaClave_(x.fecha) || x.fecha,
    descripcion:x.descripcion || '',
    fechaCreacion:x.fechaCreacion,
    fechaActualizacion:x.fechaActualizacion
  };
}

function publicoTransferencia_(x) {
  return {
    id:x.id,
    tipo:'TRANSFERENCIA',
    monto:Number(x.monto),
    montoDestino:montoDestinoTransferencia_(x),
    tasaCambio:Number(x.tasaCambio) || 1,
    monedaOrigen:String(x.monedaOrigen || ''),
    monedaDestino:String(x.monedaDestino || ''),
    cuentaOrigenId:x.cuentaOrigenId,
    cuentaDestinoId:x.cuentaDestinoId,
    fecha:fechaClave_(x.fecha) || x.fecha,
    descripcion:x.descripcion || '',
    fechaCreacion:x.fechaCreacion,
    fechaActualizacion:x.fechaActualizacion,
    activo:activo_(x.activo)
  };
}


function tasaUsdDop_() {
  const n = Number(obtenerConfiguracion().tasaUsdDop || 59.4901);
  return Number.isFinite(n) && n > 0 ? n : 59.4901;
}

function convertirMoneda_(monto, monedaOrigen, monedaDestino, tasaUsdDop) {
  const amount = Number(monto);
  const from = String(monedaOrigen || '').toUpperCase();
  const to = String(monedaDestino || '').toUpperCase();
  const rate = Number(tasaUsdDop || tasaUsdDop_());
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (from === 'USD' && to === 'DOP') return amount * rate;
  if (from === 'DOP' && to === 'USD') return amount / rate;
  return null;
}

function montoDestinoTransferencia_(t) {
  const n = Number(t && t.montoDestino);
  return Number.isFinite(n) && n > 0 ? n : Number(t && t.monto) || 0;
}

const TIPOS_CUENTA = ['Banco','Efectivo','Ahorro','Otro'];

function validarCuenta_(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de cuenta inválidos.');
  const nombre = texto_(datos.nombre,'Nombre',80);
  const tipo = String(datos.tipo || '');
  if (!TIPOS_CUENTA.includes(tipo)) throw new Error('Tipo de cuenta inválido.');
  const moneda = String(datos.moneda || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error('Moneda inválida: usa un código de tres letras.');
  const saldoInicial = (dinero_(datos.saldoInicial,'Saldo inicial',true)/100).toFixed(2);
  return {nombre,tipo,moneda,saldoInicial};
}

function saldoCuentaCentavos_(cuentaId, excluirMovimientoMetaId) {
  const cuenta = buscar_('Cuentas', cuentaId);
  if (!cuenta) throw new Error('La cuenta no existe.');

  let saldo = centavos_(cuenta.saldoInicial);
  leerTabla_('Movimientos')
    .filter(m => activo_(m.activo) && m.cuentaId === cuentaId)
    .forEach(m => { saldo += (m.tipo === 'INGRESO' ? 1 : -1) * centavos_(m.monto); });

  const transferSheet = db_().getSheetByName('Transferencias');
  if (transferSheet) {
    leerTabla_('Transferencias')
      .filter(t => activo_(t.activo))
      .forEach(t => {
        if (t.cuentaOrigenId === cuentaId) saldo -= centavos_(t.monto);
        if (t.cuentaDestinoId === cuentaId) saldo += centavos_(montoDestinoTransferencia_(t));
      });
  }

  const goalSheet = db_().getSheetByName('MovimientosMetas');
  if (goalSheet) {
    leerTabla_('MovimientosMetas')
      .filter(x => activo_(x.activo) && x.cuentaId === cuentaId && x.id !== excluirMovimientoMetaId)
      .forEach(x => {
        saldo += (x.tipo === 'RETIRO' ? 1 : -1) * centavos_(x.monto);
      });
  }

  return saldo;
}

function obtenerCuentas() { return obtenerResumen().cuentas; }

function balancesCuentasFase7_() {
  const cuentas = leerTabla_('Cuentas');
  const balances = Object.fromEntries(cuentas.map(c => [String(c.id), centavos_(c.saldoInicial)]));

  leerTabla_('Movimientos').forEach(m => {
    if (!activo_(m.activo) || !Object.prototype.hasOwnProperty.call(balances,String(m.cuentaId))) return;
    balances[String(m.cuentaId)] += (m.tipo === 'INGRESO' ? 1 : -1) * centavos_(m.monto);
  });

  if (db_().getSheetByName('Transferencias')) {
    leerTabla_('Transferencias').forEach(t => {
      if (!activo_(t.activo)) return;
      const from = String(t.cuentaOrigenId), to = String(t.cuentaDestinoId);
      if (Object.prototype.hasOwnProperty.call(balances,from)) balances[from] -= centavos_(t.monto);
      if (Object.prototype.hasOwnProperty.call(balances,to)) balances[to] += centavos_(montoDestinoTransferencia_(t));
    });
  }

  if (db_().getSheetByName('MovimientosMetas')) {
    leerTabla_('MovimientosMetas').forEach(x => {
      if (!activo_(x.activo)) return;
      const id = String(x.cuentaId);
      if (Object.prototype.hasOwnProperty.call(balances,id)) {
        balances[id] += (x.tipo === 'RETIRO' ? 1 : -1) * centavos_(x.monto);
      }
    });
  }
  return balances;
}

function obtenerCuentasTodas() {
  const cuentas = leerTabla_('Cuentas');
  const balances = balancesCuentasFase7_();
  return cuentas
    .map(c => publicoCuenta_(c, balances[String(c.id)] || 0))
    .sort((a,b) => {
      if (a.activa !== b.activa) return a.activa ? -1 : 1;
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
}

function crearCuenta(datos) {
  return bloqueo_(() => {
    const v = validarCuenta_(datos);
    const cuenta = {id:nuevoId_('acc'),...v,fechaCreacion:instante_(),activa:'true'};
    agregar_('Cuentas',cuenta);
    return {id:cuenta.id};
  });
}

function editarCuenta(id,datos) {
  return bloqueo_(() => {
    const actual = buscar_('Cuentas',id);
    if (!actual || !activo_(actual.activa)) throw new Error('La cuenta no existe o está inactiva.');
    const v = validarCuenta_(datos);
    const tieneMovs = leerTabla_('Movimientos').some(m => m.cuentaId === id && activo_(m.activo));
    const tieneTransfers = db_().getSheetByName('Transferencias')
      ? leerTabla_('Transferencias').some(t => activo_(t.activo) && (t.cuentaOrigenId === id || t.cuentaDestinoId === id))
      : false;
    const tieneMetas = db_().getSheetByName('MovimientosMetas')
      ? leerTabla_('MovimientosMetas').some(x => activo_(x.activo) && x.cuentaId === id)
      : false;
    if ((tieneMovs || tieneTransfers || tieneMetas) && v.moneda !== actual.moneda) {
      throw new Error('No puedes cambiar la moneda de una cuenta con historial.');
    }
    actualizar_('Cuentas',actual._row,{...actual,...v});
    return {id};
  });
}

function desactivarCuenta(id) {
  return bloqueo_(() => {
    const actual = buscar_('Cuentas',id);
    if (!actual || !activo_(actual.activa)) throw new Error('La cuenta no existe o ya está inactiva.');
    const saldo = saldoCuentaCentavos_(id);
    if (saldo !== 0) {
      throw new Error('La cuenta debe quedar con saldo 0 antes de desactivarla. Transfiere o ajusta su saldo primero.');
    }
    actualizar_('Cuentas',actual._row,{...actual,activa:'false'});
    return {id};
  });
}

function reactivarCuenta(id) {
  return bloqueo_(() => {
    const actual = buscar_('Cuentas',id);
    if (!actual) throw new Error('La cuenta no existe.');
    if (activo_(actual.activa)) return {id};
    actualizar_('Cuentas',actual._row,{...actual,activa:'true'});
    return {id};
  });
}

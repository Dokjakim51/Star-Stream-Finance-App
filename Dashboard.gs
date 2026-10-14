function obtenerResumen() {
  const todasCuentas = leerTabla_('Cuentas');
  const cuentas = todasCuentas.filter(x => activo_(x.activa));
  const movimientos = obtenerMovimientos();
  const transferencias = db_().getSheetByName('Transferencias') ? obtenerTransferencias() : [];
  const movimientosMetas = db_().getSheetByName('MovimientosMetas') ? obtenerMovimientosMetas() : [];
  const cfg = obtenerConfiguracion();
  const monedaPrincipal = String(cfg.monedaPrincipal || 'DOP').toUpperCase();
  const tasaUsdDop = tasaUsdDop_();
  const cuentasPorId = Object.fromEntries(todasCuentas.map(c => [String(c.id), c]));

  const balances = {};
  cuentas.forEach(c => { balances[c.id] = centavos_(c.saldoInicial); });

  movimientos.forEach(m => {
    if (Object.hasOwnProperty.call(balances,m.cuentaId)) {
      balances[m.cuentaId] += (m.tipo === 'INGRESO' ? 1 : -1) * centavos_(m.monto);
    }
  });

  transferencias.forEach(t => {
    if (Object.hasOwnProperty.call(balances,t.cuentaOrigenId)) balances[t.cuentaOrigenId] -= centavos_(t.monto);
    if (Object.hasOwnProperty.call(balances,t.cuentaDestinoId)) balances[t.cuentaDestinoId] += centavos_(montoDestinoTransferencia_(t));
  });

  movimientosMetas.forEach(x => {
    if (Object.hasOwnProperty.call(balances,x.cuentaId)) {
      balances[x.cuentaId] += (x.tipo === 'RETIRO' ? 1 : -1) * centavos_(x.monto);
    }
  });

  const currentMonth = Utilities.formatDate(new Date(), 'America/Santo_Domingo', 'yyyy-MM');
  const period = movimientos.filter(m => {
    const fechaMes = fechaClave_(m.fecha).slice(0, 7);
    return fechaMes === currentMonth;
  });

  let conversionIncompleta = false;
  const convertir = (monto, moneda) => {
    const v = convertirMoneda_(Number(monto || 0), String(moneda || '').toUpperCase(), monedaPrincipal, tasaUsdDop);
    if (!Number.isFinite(v)) { conversionIncompleta = true; return 0; }
    return v;
  };

  const ingresosPeriodo = period.filter(m => m.tipo === 'INGRESO').reduce((s,m) => {
    const cuenta = cuentasPorId[String(m.cuentaId)];
    return s + convertir(m.monto, cuenta && cuenta.moneda);
  },0);
  const gastosPeriodo = period.filter(m => m.tipo === 'GASTO').reduce((s,m) => {
    const cuenta = cuentasPorId[String(m.cuentaId)];
    return s + convertir(m.monto, cuenta && cuenta.moneda);
  },0);

  const saldoTotal = cuentas.reduce((s,c) => s + convertir((balances[c.id] || 0)/100, c.moneda), 0);
  const monedas = [...new Set(cuentas.map(c => String(c.moneda).toUpperCase()))];

  const metas = db_().getSheetByName('MovimientosMetas') ? obtenerMetasTodas() : [];
  const metasActivas = metas.filter(m => m.activa !== false);
  const ahorroMetas = metasActivas.reduce((s,m) => s + convertir(m.montoAhorrado, m.moneda), 0);
  const patrimonioTotal = conversionIncompleta ? null : saldoTotal + ahorroMetas;

  // Ahorro neto de los últimos 6 meses convertido a la moneda principal.
  const [cy,cm] = currentMonth.split('-').map(Number);
  const start6 = new Date(Date.UTC(cy, cm - 6, 1));
  const start6Key = Utilities.formatDate(start6, 'UTC', 'yyyy-MM');
  let ingresos6 = 0, gastos6 = 0;
  movimientos.forEach(m => {
    const mes = fechaClave_(m.fecha).slice(0,7);
    if (!mes || mes < start6Key || mes > currentMonth) return;
    const cuenta = cuentasPorId[String(m.cuentaId)];
    const valor = convertir(m.monto, cuenta && cuenta.moneda);
    if (m.tipo === 'INGRESO') ingresos6 += valor;
    if (m.tipo === 'GASTO') gastos6 += valor;
  });

  return {
    saldoTotal:conversionIncompleta ? null : saldoTotal,
    monedaTotal:monedaPrincipal,
    monedasMultiples:monedas.length > 1,
    conversionIncompleta,
    conversionAplicada:monedas.length > 1 && !conversionIncompleta,
    tasaUsdDop,
    ingresosPeriodo:conversionIncompleta ? null : ingresosPeriodo,
    gastosPeriodo:conversionIncompleta ? null : gastosPeriodo,
    ahorroNeto6Meses:conversionIncompleta ? null : ingresos6-gastos6,
    periodo:currentMonth,
    cuentas:cuentas.map(c => publicoCuenta_(c,balances[c.id])),
    movimientosRecientes:movimientos.slice(0,6),
    transferenciasRecientes:transferencias.slice(0,6),
    movimientosMetasRecientes:movimientosMetas.slice(0,6),
    movimientos,
    transferencias,
    movimientosMetas,
    metas,
    ahorroMetas:conversionIncompleta ? null : ahorroMetas,
    patrimonioTotal
  };
}

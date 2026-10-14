function inicioMesClave_(date) {
  return Utilities.formatDate(date, 'America/Santo_Domingo', 'yyyy-MM') + '-01';
}

function hoyClave_() {
  return Utilities.formatDate(new Date(), 'America/Santo_Domingo', 'yyyy-MM-dd');
}

function sumarMesesClave_(yyyyMm, delta) {
  const [y,m] = String(yyyyMm).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM');
}

function rangoEstadisticas_(rango) {
  const today = new Date();
  const currentMonth = Utilities.formatDate(today, 'America/Santo_Domingo', 'yyyy-MM');
  const currentYear = Utilities.formatDate(today, 'America/Santo_Domingo', 'yyyy');
  const end = hoyClave_();
  const key = String(rango || '6M').toUpperCase();

  if (key === 'MES') return {rango:key,inicio:currentMonth + '-01',fin:end,meses:[currentMonth]};
  if (key === '3M' || key === '6M') {
    const count = key === '3M' ? 3 : 6;
    const meses = [];
    for (let i=count-1;i>=0;i--) meses.push(sumarMesesClave_(currentMonth,-i));
    return {rango:key,inicio:meses[0] + '-01',fin:end,meses};
  }
  if (key === 'ANO') {
    const meses = [];
    const monthNow = Number(currentMonth.slice(5,7));
    for (let m=1;m<=monthNow;m++) meses.push(`${currentYear}-${String(m).padStart(2,'0')}`);
    return {rango:key,inicio:`${currentYear}-01-01`,fin:end,meses};
  }
  throw new Error('Rango de estadísticas inválido.');
}

function fechaDentro_(value, inicio, fin) {
  const key = fechaClave_(value);
  return Boolean(key && key >= inicio && key <= fin);
}

function resumenPeriodoMoneda_(rangoInfo, moneda) {
  const cuentas = obtenerCuentasTodas().filter(c => String(c.moneda).toUpperCase() === moneda);
  const ids = new Set(cuentas.map(c => String(c.id)));
  const movs = obtenerMovimientos({}).filter(m => ids.has(String(m.cuentaId)) && fechaDentro_(m.fecha,rangoInfo.inicio,rangoInfo.fin));
  const transfers = obtenerTransferencias({}).filter(t =>
    fechaDentro_(t.fecha,rangoInfo.inicio,rangoInfo.fin) &&
    (ids.has(String(t.cuentaOrigenId)) || ids.has(String(t.cuentaDestinoId)))
  );
  const goalMovs = db_().getSheetByName('MovimientosMetas')
    ? obtenerMovimientosMetas({}).filter(x => ids.has(String(x.cuentaId)) && fechaDentro_(x.fecha,rangoInfo.inicio,rangoInfo.fin))
    : [];

  const ingresos = movs.filter(m => m.tipo === 'INGRESO').reduce((s,m) => s + centavos_(m.monto),0);
  const gastos = movs.filter(m => m.tipo === 'GASTO').reduce((s,m) => s + centavos_(m.monto),0);
  const aportes = goalMovs.filter(x => x.tipo === 'APORTE').reduce((s,x) => s + centavos_(x.monto),0);
  const retiros = goalMovs.filter(x => x.tipo === 'RETIRO').reduce((s,x) => s + centavos_(x.monto),0);

  return {cuentas,ids,movs,transfers,goalMovs,ingresos,gastos,aportes,retiros};
}


function contextoEstadisticasFase7_(moneda) {
  const cuentas=obtenerCuentasTodas().filter(c=>String(c.moneda).toUpperCase()===moneda);
  const ids=new Set(cuentas.map(c=>String(c.id)));
  return {
    cuentas,ids,
    movimientos:obtenerMovimientos({}).filter(m=>ids.has(String(m.cuentaId))),
    transferencias:obtenerTransferencias({}).filter(t=>ids.has(String(t.cuentaOrigenId))||ids.has(String(t.cuentaDestinoId))),
    movimientosMetas:db_().getSheetByName('MovimientosMetas')?obtenerMovimientosMetas({}).filter(x=>ids.has(String(x.cuentaId))):[]
  };
}

function resumenPeriodoDesdeContextoFase7_(rangoInfo,ctx) {
  const movs=ctx.movimientos.filter(m=>fechaDentro_(m.fecha,rangoInfo.inicio,rangoInfo.fin));
  const transfers=ctx.transferencias.filter(t=>fechaDentro_(t.fecha,rangoInfo.inicio,rangoInfo.fin));
  const goalMovs=ctx.movimientosMetas.filter(x=>fechaDentro_(x.fecha,rangoInfo.inicio,rangoInfo.fin));
  const ingresos=movs.filter(m=>m.tipo==='INGRESO').reduce((s,m)=>s+centavos_(m.monto),0);
  const gastos=movs.filter(m=>m.tipo==='GASTO').reduce((s,m)=>s+centavos_(m.monto),0);
  const aportes=goalMovs.filter(x=>x.tipo==='APORTE').reduce((s,x)=>s+centavos_(x.monto),0);
  const retiros=goalMovs.filter(x=>x.tipo==='RETIRO').reduce((s,x)=>s+centavos_(x.monto),0);
  return {cuentas:ctx.cuentas,ids:ctx.ids,movs,transfers,goalMovs,ingresos,gastos,aportes,retiros};
}

function rangoAnterior_(info) {
  const start = new Date(info.inicio + 'T00:00:00Z');
  const end = new Date(info.fin + 'T00:00:00Z');
  const days = Math.max(1, Math.round((end-start)/86400000)+1);
  const prevEnd = new Date(start.getTime()-86400000);
  const prevStart = new Date(prevEnd.getTime()-(days-1)*86400000);
  return {
    inicio:Utilities.formatDate(prevStart,'UTC','yyyy-MM-dd'),
    fin:Utilities.formatDate(prevEnd,'UTC','yyyy-MM-dd'),
    meses:[],
    rango:'ANTERIOR'
  };
}

function obtenerEstadisticasFase4(opciones) {
  opciones = opciones || {};
  const cfg = obtenerConfiguracion();
  const moneda = String(opciones.moneda || cfg.monedaPrincipal || 'DOP').toUpperCase();
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error('Moneda de estadísticas inválida.');
  const info = rangoEstadisticas_(opciones.rango || '6M');
  const contexto = contextoEstadisticasFase7_(moneda);
  const data = resumenPeriodoDesdeContextoFase7_(info, contexto);
  const prev = resumenPeriodoDesdeContextoFase7_(rangoAnterior_(info), contexto);

  const categoriasPorId=Object.fromEntries(leerTabla_('Categorias').map(c=>[String(c.id),c]));
  const porCategoriaMap = {};
  data.movs.filter(m => m.tipo === 'GASTO').forEach(m => {
    const cat = categoriasPorId[String(m.categoriaId)];
    const nombre = cat ? String(cat.nombre) : 'Sin categoría';
    porCategoriaMap[nombre] = (porCategoriaMap[nombre] || 0) + centavos_(m.monto);
  });
  const porCategoria = Object.entries(porCategoriaMap)
    .map(([nombre,cents]) => ({nombre,monto:cents/100}))
    .sort((a,b) => b.monto-a.monto);

  const serieMensual = info.meses.map(mes => {
    const monthMovs = data.movs.filter(m => fechaClave_(m.fecha).slice(0,7) === mes);
    const monthGoals = data.goalMovs.filter(x => fechaClave_(x.fecha).slice(0,7) === mes);
    return {
      mes,
      ingresos:monthMovs.filter(m => m.tipo === 'INGRESO').reduce((s,m) => s+centavos_(m.monto),0)/100,
      gastos:monthMovs.filter(m => m.tipo === 'GASTO').reduce((s,m) => s+centavos_(m.monto),0)/100,
      aportesMetas:monthGoals.filter(x => x.tipo === 'APORTE').reduce((s,x) => s+centavos_(x.monto),0)/100,
      retirosMetas:monthGoals.filter(x => x.tipo === 'RETIRO').reduce((s,x) => s+centavos_(x.monto),0)/100
    };
  });

  const porCuenta = data.cuentas.map(c => {
    const id = String(c.id);
    const movs = data.movs.filter(m => String(m.cuentaId) === id);
    const tr = data.transfers.filter(t => String(t.cuentaOrigenId) === id || String(t.cuentaDestinoId) === id);
    const gm = data.goalMovs.filter(x => String(x.cuentaId) === id);
    return {
      id:c.id,
      nombre:c.nombre,
      activa:c.activa,
      saldo:Number(c.saldo),
      ingresos:movs.filter(m => m.tipo === 'INGRESO').reduce((s,m) => s+centavos_(m.monto),0)/100,
      gastos:movs.filter(m => m.tipo === 'GASTO').reduce((s,m) => s+centavos_(m.monto),0)/100,
      transferenciasEnviadas:tr.filter(t => String(t.cuentaOrigenId) === id).reduce((s,t) => s+centavos_(t.monto),0)/100,
      transferenciasRecibidas:tr.filter(t => String(t.cuentaDestinoId) === id).reduce((s,t) => s+centavos_(montoDestinoTransferencia_(t)),0)/100,
      aportesMetas:gm.filter(x => x.tipo === 'APORTE').reduce((s,x) => s+centavos_(x.monto),0)/100,
      retirosMetas:gm.filter(x => x.tipo === 'RETIRO').reduce((s,x) => s+centavos_(x.monto),0)/100
    };
  });

  const ingresos = data.ingresos/100;
  const gastos = data.gastos/100;
  const ahorroNeto = ingresos-gastos;
  const tasaAhorro = ingresos > 0 ? (ahorroNeto/ingresos)*100 : null;
  const prevIngresos = prev.ingresos/100;
  const prevGastos = prev.gastos/100;

  return {
    rango:info.rango,
    inicio:info.inicio,
    fin:info.fin,
    moneda,
    ingresos,
    gastos,
    ahorroNeto,
    tasaAhorro,
    aportesMetas:data.aportes/100,
    retirosMetas:data.retiros/100,
    porCategoria,
    serieMensual,
    porCuenta,
    comparacionAnterior:{
      ingresos:prevIngresos,
      gastos:prevGastos,
      diferenciaIngresos:ingresos-prevIngresos,
      diferenciaGastos:gastos-prevGastos
    }
  };
}

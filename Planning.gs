/**
 * Star Stream v0.6 · Planificación, gastos recurrentes, presupuestos y notificaciones.
 * Los gastos programados NO afectan el saldo hasta confirmarse o ejecutarse en modo automático.
 */

const FRECUENCIAS_FASE6 = ['SEMANAL','QUINCENAL','MENSUAL','ANUAL'];
const MODOS_REGISTRO_FASE6 = ['CONFIRMAR','AUTOMATICO'];
const ESTADOS_RECURRENTES_FASE6 = ['ACTIVO','PAUSADO','FINALIZADO'];

function hoyFase6_() {
  return Utilities.formatDate(new Date(), 'America/Santo_Domingo', 'yyyy-MM-dd');
}

function fechaUtcFase6_(value) {
  const key = fecha_(value);
  const [y,m,d] = key.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d));
}

function fechaDesdeUtcFase6_(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function sumarDiasFase6_(value, days) {
  const d = fechaUtcFase6_(value);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return fechaDesdeUtcFase6_(d);
}

function sumarMesesFase6_(value, months) {
  const source = fechaUtcFase6_(value);
  const day = source.getUTCDate();
  const first = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + Number(months || 0), 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return fechaDesdeUtcFase6_(first);
}

function siguienteFechaRecurrenteFase6_(value, frecuencia) {
  const f = String(frecuencia || '').toUpperCase();
  if (f === 'SEMANAL') return sumarDiasFase6_(value, 7);
  if (f === 'QUINCENAL') return sumarDiasFase6_(value, 15);
  if (f === 'MENSUAL') return sumarMesesFase6_(value, 1);
  if (f === 'ANUAL') return sumarMesesFase6_(value, 12);
  throw new Error('Frecuencia inválida.');
}

function diasEntreFase6_(from, to) {
  return Math.round((fechaUtcFase6_(to).getTime() - fechaUtcFase6_(from).getTime()) / 86400000);
}

function primeraFechaNoPasadaFase6_(start, frecuencia, fin) {
  const today = hoyFase6_();
  let cursor = start, guard = 0;
  while (cursor < today && guard < 600) {
    cursor = siguienteFechaRecurrenteFase6_(cursor, frecuencia);
    guard++;
  }
  if (fin && cursor > fin) return '';
  return cursor;
}

function validarRecurrenteFase6_(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos del gasto recurrente inválidos.');
  const nombre = texto_(datos.nombre, 'Nombre', 80);
  const tipo = String(datos.tipo || '').trim().toUpperCase();
  if (!['INGRESO','GASTO'].includes(tipo)) throw new Error('Tipo inválido.');
  const monto = (dinero_(datos.monto, 'Monto', false) / 100).toFixed(2);
  const cuenta = buscar_('Cuentas', String(datos.cuentaId || ''));
  if (!cuenta || !activo_(cuenta.activa)) throw new Error('Selecciona una cuenta activa.');
  const categoria = buscar_('Categorias', String(datos.categoriaId || ''));
  if (!categoria || !activo_(categoria.activa) || String(categoria.tipo) !== tipo) {
    throw new Error('Selecciona una categoría correspondiente al tipo.');
  }
  const frecuencia = String(datos.frecuencia || 'MENSUAL').trim().toUpperCase();
  if (!FRECUENCIAS_FASE6.includes(frecuencia)) throw new Error('Frecuencia inválida.');
  const fechaInicio = fecha_(datos.fechaInicio || hoyFase6_());
  const fechaFin = String(datos.fechaFin || '').trim();
  if (fechaFin) {
    fecha_(fechaFin);
    if (fechaFin < fechaInicio) throw new Error('La fecha final no puede ser anterior a la fecha inicial.');
  }
  const recordatorioDias = Math.max(0, Math.min(30, Math.floor(Number(datos.recordatorioDias ?? 3))));
  const modoRegistro = String(datos.modoRegistro || 'CONFIRMAR').trim().toUpperCase();
  if (!MODOS_REGISTRO_FASE6.includes(modoRegistro)) throw new Error('Modo de registro inválido.');
  const descripcion = String(datos.descripcion || '').trim();
  if (descripcion.length > 160) throw new Error('La descripción debe tener 160 caracteres o menos.');
  return {
    nombre,tipo,monto,
    moneda:String(cuenta.moneda || 'DOP').toUpperCase(),
    cuentaId:cuenta.id,categoriaId:categoria.id,frecuencia,fechaInicio,fechaFin,
    recordatorioDias:String(recordatorioDias),modoRegistro,descripcion
  };
}

function publicoRecurrenteFase6_(x) {
  const today = hoyFase6_();
  const next = fechaClave_(x.proximaFecha) || '';
  const days = next ? diasEntreFase6_(today, next) : null;
  return {
    id:x.id,nombre:x.nombre,tipo:x.tipo,monto:Number(x.monto),moneda:x.moneda,
    cuentaId:x.cuentaId,categoriaId:x.categoriaId,frecuencia:x.frecuencia,
    fechaInicio:fechaClave_(x.fechaInicio) || x.fechaInicio || '',
    fechaFin:fechaClave_(x.fechaFin) || x.fechaFin || '',
    proximaFecha:next,recordatorioDias:Number(x.recordatorioDias) || 0,
    modoRegistro:x.modoRegistro || 'CONFIRMAR',descripcion:x.descripcion || '',
    estado:x.estado || 'ACTIVO',ultimaEjecucion:fechaClave_(x.ultimaEjecucion) || x.ultimaEjecucion || '',
    fechaCreacion:x.fechaCreacion || '',fechaActualizacion:x.fechaActualizacion || '',
    activa:activo_(x.activo),diasRestantes:days,
    vencido:days !== null && days < 0,venceHoy:days === 0
  };
}

function obtenerRecurrentesFase6() {
  if (!db_().getSheetByName('Recurrentes')) return [];
  return leerTabla_('Recurrentes')
    .filter(x => activo_(x.activo))
    .map(publicoRecurrenteFase6_)
    .sort((a,b) => {
      if (a.estado !== b.estado) return a.estado === 'ACTIVO' ? -1 : b.estado === 'ACTIVO' ? 1 : 0;
      return String(a.proximaFecha || '9999-12-31').localeCompare(String(b.proximaFecha || '9999-12-31'));
    });
}

function crearRecurrenteFase6(datos) {
  return bloqueo_(() => {
    const v = validarRecurrenteFase6_(datos);
    const now = instante_();
    const firstDate = v.modoRegistro === 'AUTOMATICO'
      ? primeraFechaNoPasadaFase6_(v.fechaInicio,v.frecuencia,v.fechaFin)
      : v.fechaInicio;
    const row = {
      id:nuevoId_('recurr'),...v,proximaFecha:firstDate,estado:firstDate?'ACTIVO':'FINALIZADO',ultimaEjecucion:'',
      fechaCreacion:now,fechaActualizacion:now,activo:'true'
    };
    agregar_('Recurrentes', row);
    sincronizarRecordatoriosRecurrentesFase611_();
    return publicoRecurrenteFase6_(row);
  });
}

function editarRecurrenteFase6(id, datos) {
  return bloqueo_(() => {
    const actual = buscar_('Recurrentes', String(id || ''));
    if (!actual || !activo_(actual.activo)) throw new Error('El gasto recurrente no existe.');
    const v = validarRecurrenteFase6_(datos);
    const cambioCalendario = String(actual.frecuencia) !== v.frecuencia || fechaClave_(actual.fechaInicio) !== v.fechaInicio;
    let proximaFecha = fechaClave_(actual.proximaFecha) || v.fechaInicio;
    if (cambioCalendario || proximaFecha < v.fechaInicio) proximaFecha = v.fechaInicio;
    if (v.modoRegistro === 'AUTOMATICO' && (cambioCalendario || proximaFecha < hoyFase6_())) {
      proximaFecha = primeraFechaNoPasadaFase6_(v.fechaInicio,v.frecuencia,v.fechaFin);
    }
    let estado = actual.estado || 'ACTIVO';
    if (v.fechaFin && proximaFecha && proximaFecha > v.fechaFin) proximaFecha = '';
    if (!proximaFecha) estado = 'FINALIZADO';
    const updated = {...actual,...v,proximaFecha,estado,fechaActualizacion:instante_()};
    cerrarNotificacionesReferenciaFase6_('RECURRENTE',actual.id);
    actualizar_('Recurrentes', actual._row, updated);
    sincronizarRecordatoriosRecurrentesFase611_();
    return publicoRecurrenteFase6_(updated);
  });
}

function pausarRecurrenteFase6(id) {
  return bloqueo_(() => {
    const actual = buscar_('Recurrentes',String(id||''));
    if (!actual || !activo_(actual.activo)) throw new Error('El gasto recurrente no existe.');
    cerrarNotificacionesReferenciaFase6_('RECURRENTE',actual.id);
    const updated = {...actual,estado:'PAUSADO',fechaActualizacion:instante_()};
    actualizar_('Recurrentes',actual._row,updated);
    return publicoRecurrenteFase6_(updated);
  });
}

function reanudarRecurrenteFase6(id) {
  return bloqueo_(() => {
    const actual = buscar_('Recurrentes',String(id||''));
    if (!actual || !activo_(actual.activo)) throw new Error('El gasto recurrente no existe.');
    const today = hoyFase6_();
    let next = fechaClave_(actual.proximaFecha) || fechaClave_(actual.fechaInicio) || today;
    const fin = fechaClave_(actual.fechaFin);
    let guard = 0;
    while (next && next <= today && guard < 600) {
      next = siguienteFechaRecurrenteFase6_(next, actual.frecuencia);
      guard++;
    }
    let estado = 'ACTIVO';
    if (fin && next > fin) { next = ''; estado = 'FINALIZADO'; }
    cerrarNotificacionesReferenciaFase6_('RECURRENTE',actual.id);
    const updated = {...actual,estado,proximaFecha:next,fechaActualizacion:instante_()};
    actualizar_('Recurrentes',actual._row,updated);
    sincronizarRecordatoriosRecurrentesFase611_();
    return publicoRecurrenteFase6_(updated);
  });
}

function eliminarRecurrenteFase6(id) {
  return bloqueo_(() => {
    const actual = buscar_('Recurrentes',String(id||''));
    if (!actual || !activo_(actual.activo)) throw new Error('El gasto recurrente no existe.');
    actualizar_('Recurrentes',actual._row,{...actual,activo:'false',fechaActualizacion:instante_()});
    cerrarNotificacionesReferenciaFase6_('RECURRENTE',actual.id);
    return {id:actual.id};
  });
}

function avanzarRecurrenteFase6_(actual, fechaEjecutada) {
  let next = siguienteFechaRecurrenteFase6_(fechaEjecutada, actual.frecuencia);
  let estado = actual.estado || 'ACTIVO';
  const fin = fechaClave_(actual.fechaFin);
  if (fin && next > fin) {
    next = '';
    estado = 'FINALIZADO';
  }
  const updated = {...actual,proximaFecha:next,estado,ultimaEjecucion:fechaEjecutada,fechaActualizacion:instante_()};
  actualizar_('Recurrentes',actual._row,updated);
  return updated;
}

function confirmarRecurrenteFase6(id) {
  return bloqueo_(() => {
    const actual = buscar_('Recurrentes',String(id||''));
    if (!actual || !activo_(actual.activo)) throw new Error('El gasto recurrente no existe.');
    if (String(actual.estado) !== 'ACTIVO') throw new Error('Este gasto recurrente no está activo.');
    const fechaProgramada = fechaClave_(actual.proximaFecha) || hoyFase6_();
    const v = validarMovimiento_({
      tipo:actual.tipo,monto:actual.monto,cuentaId:actual.cuentaId,categoriaId:actual.categoriaId,
      fecha:fechaProgramada,descripcion:actual.descripcion || actual.nombre
    });
    const now = instante_();
    const mov = {id:nuevoId_('mov'),...v,fechaCreacion:now,fechaActualizacion:now,activo:'true'};
    agregar_('Movimientos',mov);
    avanzarRecurrenteFase6_(actual,fechaProgramada);
    cerrarNotificacionesReferenciaFase6_('RECURRENTE',actual.id);
    return {id:actual.id,movimientoId:mov.id};
  });
}

function omitirRecurrenteFase6(id) {
  return bloqueo_(() => {
    const actual = buscar_('Recurrentes',String(id||''));
    if (!actual || !activo_(actual.activo)) throw new Error('El gasto recurrente no existe.');
    const fechaProgramada = fechaClave_(actual.proximaFecha) || hoyFase6_();
    avanzarRecurrenteFase6_(actual,fechaProgramada);
    cerrarNotificacionesReferenciaFase6_('RECURRENTE',actual.id);
    return {id:actual.id};
  });
}

function validarPresupuestoFase6_(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de presupuesto inválidos.');
  const nombre = texto_(datos.nombre,'Nombre',80);
  const categoria = buscar_('Categorias',String(datos.categoriaId || ''));
  if (!categoria || !activo_(categoria.activa) || String(categoria.tipo) !== 'GASTO') {
    throw new Error('Selecciona una categoría de gasto activa.');
  }
  const monto = (dinero_(datos.monto,'Presupuesto mensual',false)/100).toFixed(2);
  const moneda = String(datos.moneda || obtenerConfiguracion().monedaPrincipal || 'DOP').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error('Moneda inválida.');
  const fechaInicio = fecha_(datos.fechaInicio || hoyFase6_());
  const fechaFin = String(datos.fechaFin || '').trim();
  if (fechaFin) {
    fecha_(fechaFin);
    if (fechaFin < fechaInicio) throw new Error('La fecha final no puede ser anterior a la fecha inicial.');
  }
  const alertaPorcentaje = Math.max(10,Math.min(100,Math.round(Number(datos.alertaPorcentaje || 80))));
  return {nombre,categoriaId:categoria.id,monto,moneda,fechaInicio,fechaFin,alertaPorcentaje:String(alertaPorcentaje)};
}

function gastoPresupuestoMesFase6_(budget, periodKey) {
  const month = periodKey || hoyFase6_().slice(0,7);
  const accounts = obtenerCuentasTodas().filter(a => String(a.moneda).toUpperCase() === String(budget.moneda).toUpperCase());
  const ids = new Set(accounts.map(a => String(a.id)));
  const cents = obtenerMovimientos({}).filter(m =>
    m.tipo === 'GASTO' && String(m.categoriaId) === String(budget.categoriaId) &&
    ids.has(String(m.cuentaId)) && fechaClave_(m.fecha).slice(0,7) === month
  ).reduce((s,m)=>s+centavos_(m.monto),0);
  return cents/100;
}

function publicoPresupuestoFase6_(x, periodKey, gastadoOverride) {
  const gastado = Number.isFinite(Number(gastadoOverride)) ? Number(gastadoOverride) : gastoPresupuestoMesFase6_(x,periodKey);
  const monto = Number(x.monto) || 0;
  const porcentaje = monto > 0 ? (gastado/monto)*100 : 0;
  return {
    id:x.id,nombre:x.nombre,categoriaId:x.categoriaId,monto,moneda:x.moneda,
    fechaInicio:fechaClave_(x.fechaInicio)||x.fechaInicio||'',fechaFin:fechaClave_(x.fechaFin)||x.fechaFin||'',
    alertaPorcentaje:Number(x.alertaPorcentaje)||80,estado:x.estado||'ACTIVO',
    fechaCreacion:x.fechaCreacion||'',fechaActualizacion:x.fechaActualizacion||'',activa:activo_(x.activo),
    periodo:periodKey || hoyFase6_().slice(0,7),gastado,disponible:Math.max(0,monto-gastado),
    excedido:Math.max(0,gastado-monto),porcentaje
  };
}

function obtenerPresupuestosFase6(periodKey) {
  if (!db_().getSheetByName('Presupuestos')) return [];
  const month = String(periodKey || hoyFase6_().slice(0,7));
  const budgets = leerTabla_('Presupuestos').filter(x=>activo_(x.activo));
  if (!budgets.length) return [];
  const currencyByAccount = Object.fromEntries(obtenerCuentasTodas().map(a=>[String(a.id),String(a.moneda).toUpperCase()]));
  const spend = {};
  obtenerMovimientos({}).forEach(m=>{
    if (m.tipo !== 'GASTO' || fechaClave_(m.fecha).slice(0,7) !== month) return;
    const currency = currencyByAccount[String(m.cuentaId)];
    if (!currency) return;
    const key = `${currency}|${m.categoriaId}`;
    spend[key] = (spend[key] || 0) + Number(m.monto || 0);
  });
  return budgets
    .map(x=>publicoPresupuestoFase6_(x,month,spend[`${String(x.moneda).toUpperCase()}|${x.categoriaId}`] || 0))
    .sort((a,b)=>b.porcentaje-a.porcentaje || a.nombre.localeCompare(b.nombre,'es'));
}

function crearPresupuestoFase6(datos) {
  return bloqueo_(() => {
    const v = validarPresupuestoFase6_(datos);
    const duplicate = leerTabla_('Presupuestos').find(x=>activo_(x.activo) && String(x.categoriaId)===v.categoriaId && String(x.moneda)===v.moneda);
    if (duplicate) throw new Error('Ya existe un presupuesto activo para esa categoría y moneda.');
    const now=instante_();
    const row={id:nuevoId_('budget'),...v,estado:'ACTIVO',fechaCreacion:now,fechaActualizacion:now,activo:'true'};
    agregar_('Presupuestos',row);
    return publicoPresupuestoFase6_(row);
  });
}

function editarPresupuestoFase6(id,datos) {
  return bloqueo_(() => {
    const actual=buscar_('Presupuestos',String(id||''));
    if(!actual||!activo_(actual.activo)) throw new Error('El presupuesto no existe.');
    const v=validarPresupuestoFase6_(datos);
    const duplicate=leerTabla_('Presupuestos').find(x=>x.id!==actual.id&&activo_(x.activo)&&String(x.categoriaId)===v.categoriaId&&String(x.moneda)===v.moneda);
    if(duplicate) throw new Error('Ya existe otro presupuesto activo para esa categoría y moneda.');
    const updated={...actual,...v,fechaActualizacion:instante_()};
    actualizar_('Presupuestos',actual._row,updated);
    return publicoPresupuestoFase6_(updated);
  });
}

function pausarPresupuestoFase6(id) {
  return bloqueo_(() => {
    const actual=buscar_('Presupuestos',String(id||''));
    if(!actual||!activo_(actual.activo)) throw new Error('El presupuesto no existe.');
    actualizar_('Presupuestos',actual._row,{...actual,estado:'PAUSADO',fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function reanudarPresupuestoFase6(id) {
  return bloqueo_(() => {
    const actual=buscar_('Presupuestos',String(id||''));
    if(!actual||!activo_(actual.activo)) throw new Error('El presupuesto no existe.');
    actualizar_('Presupuestos',actual._row,{...actual,estado:'ACTIVO',fechaActualizacion:instante_()});
    return {id:actual.id};
  });
}

function eliminarPresupuestoFase6(id) {
  return bloqueo_(() => {
    const actual=buscar_('Presupuestos',String(id||''));
    if(!actual||!activo_(actual.activo)) throw new Error('El presupuesto no existe.');
    actualizar_('Presupuestos',actual._row,{...actual,activo:'false',fechaActualizacion:instante_()});
    cerrarNotificacionesReferenciaFase6_('PRESUPUESTO',actual.id);
    return {id:actual.id};
  });
}

function publicoNotificacionFase6_(x) {
  return {id:x.id,tipo:x.tipo||'INFO',titulo:x.titulo||'',mensaje:x.mensaje||'',fecha:fechaClave_(x.fecha)||x.fecha||'',referenciaTipo:x.referenciaTipo||'',referenciaId:x.referenciaId||'',leida:String(x.leida)==='true',fechaCreacion:x.fechaCreacion||''};
}

function crearNotificacionUnicaFase6_(datos) {
  const key=String(datos.claveUnica||'').trim();
  if(!key) throw new Error('Notificación sin clave única.');
  const exists=leerTabla_('Notificaciones').find(x=>String(x.claveUnica)===key);
  if(exists) return exists;
  const row={id:nuevoId_('note'),tipo:datos.tipo||'INFO',titulo:datos.titulo||'Star Stream',mensaje:datos.mensaje||'',fecha:datos.fecha||hoyFase6_(),referenciaTipo:datos.referenciaTipo||'',referenciaId:datos.referenciaId||'',claveUnica:key,leida:'false',fechaCreacion:instante_(),activo:'true'};
  agregar_('Notificaciones',row);
  return row;
}


/**
 * Hotfix v0.6.1 · recordatorios confiables.
 * Genera el recordatorio de un recurrente en modo CONFIRMAR tan pronto entra
 * en su ventana de aviso. La clave única impide duplicados para la misma ocurrencia.
 */
function crearRecordatorioRecurrenteSiCorrespondeFase611_(current, today, existingKeys) {
  if (!current || !activo_(current.activo) || String(current.estado) !== 'ACTIVO') return false;
  if (String(current.modoRegistro || 'CONFIRMAR') !== 'CONFIRMAR') return false;
  const next = fechaClave_(current.proximaFecha) || fechaClave_(current.fechaInicio);
  if (!next) return false;
  const reminder = Math.max(0, Number(current.recordatorioDias) || 0);
  const days = diasEntreFase6_(today, next);
  if (days > reminder) return false;
  const key = `due:${current.id}:${next}`;
  if (existingKeys && existingKeys.has(key)) return false;
  const title = days < 0 ? 'Pago atrasado' : days === 0 ? 'Pago programado para hoy' : `Pago en ${days} día${days===1?'':'s'}`;
  crearNotificacionUnicaFase6_({
    tipo:days < 0 ? 'ALERTA' : 'RECORDATORIO',
    titulo:title,
    mensaje:`${current.nombre} · ${current.moneda} ${Number(current.monto).toFixed(2)}`,
    fecha:today,
    referenciaTipo:'RECURRENTE',
    referenciaId:current.id,
    claveUnica:key
  });
  if (existingKeys) existingKeys.add(key);
  return true;
}

function sincronizarRecordatoriosRecurrentesFase611_() {
  if (!db_().getSheetByName('Recurrentes') || !db_().getSheetByName('Notificaciones')) return 0;
  const today = hoyFase6_();
  const existingKeys = new Set(leerTabla_('Notificaciones').map(x => String(x.claveUnica || '')));
  let created = 0;
  leerTabla_('Recurrentes').forEach(r => {
    if (crearRecordatorioRecurrenteSiCorrespondeFase611_(r, today, existingKeys)) created++;
  });
  return created;
}

/**
 * Sincronización ligera para el frontend. No registra movimientos automáticos;
 * solo asegura que los recordatorios pendientes existan y devuelve las notificaciones.
 */
function sincronizarNotificacionesFase611() {
  return bloqueo_(() => {
    const created = sincronizarRecordatoriosRecurrentesFase611_();
    return {creadas:created, notificaciones:obtenerNotificacionesFase6()};
  });
}

function cerrarNotificacionesReferenciaFase6_(tipo,id) {
  if(!db_().getSheetByName('Notificaciones')) return;
  leerTabla_('Notificaciones').filter(x=>activo_(x.activo)&&String(x.referenciaTipo)===String(tipo)&&String(x.referenciaId)===String(id)).forEach(x=>{
    actualizar_('Notificaciones',x._row,{...x,leida:'true',activo:'false'});
  });
}

function obtenerNotificacionesFase6() {
  if(!db_().getSheetByName('Notificaciones')) return [];
  return leerTabla_('Notificaciones').filter(x=>activo_(x.activo)).map(publicoNotificacionFase6_).sort((a,b)=>String(b.fechaCreacion).localeCompare(String(a.fechaCreacion)));
}

function marcarNotificacionLeidaFase6(id) {
  return bloqueo_(() => {
    const n=buscar_('Notificaciones',String(id||''));
    if(!n||!activo_(n.activo)) throw new Error('La notificación no existe.');
    actualizar_('Notificaciones',n._row,{...n,leida:'true'});
    return {id:n.id};
  });
}

function marcarTodasNotificacionesLeidasFase6() {
  return bloqueo_(() => {
    const items=leerTabla_('Notificaciones').filter(x=>activo_(x.activo)&&String(x.leida)!=='true');
    items.forEach(x=>actualizar_('Notificaciones',x._row,{...x,leida:'true'}));
    return {cantidad:items.length};
  });
}

function crearMovimientoAutomaticoFase6_(actual, fechaProgramada) {
  const v=validarMovimiento_({tipo:actual.tipo,monto:actual.monto,cuentaId:actual.cuentaId,categoriaId:actual.categoriaId,fecha:fechaProgramada,descripcion:actual.descripcion||actual.nombre});
  const now=instante_();
  const mov={id:nuevoId_('mov'),...v,fechaCreacion:now,fechaActualizacion:now,activo:'true'};
  agregar_('Movimientos',mov);
  return mov;
}

function procesarAutomatizacionesFase6() {
  if(!db_().getSheetByName('Recurrentes')) return {procesadas:0,notificaciones:0};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(25000)) return {procesadas:0,notificaciones:0,ocupado:true};
  let processed=0, notices=0;
  try {
    const today=hoyFase6_();
    const recurrentes=leerTabla_('Recurrentes').filter(x=>activo_(x.activo)&&String(x.estado)==='ACTIVO');
    recurrentes.forEach(original=>{
      let current=original;
      let next=fechaClave_(current.proximaFecha)||fechaClave_(current.fechaInicio)||today;
      const fin=fechaClave_(current.fechaFin);
      if(fin && next>fin){
        actualizar_('Recurrentes',current._row,{...current,estado:'FINALIZADO',proximaFecha:'',fechaActualizacion:instante_()});
        return;
      }
      if(String(current.modoRegistro)==='AUTOMATICO'){
        let guard=0;
        while(next && next<=today && guard<24){
          try{
            const mov=crearMovimientoAutomaticoFase6_(current,next);
            processed++;
            crearNotificacionUnicaFase6_({tipo:'EXITO',titulo:'Movimiento automático registrado',mensaje:`${current.nombre}: ${current.moneda} ${Number(current.monto).toFixed(2)}`,fecha:today,referenciaTipo:'RECURRENTE',referenciaId:current.id,claveUnica:`auto:${current.id}:${next}`});
            notices++;
            current=avanzarRecurrenteFase6_(current,next);
            next=fechaClave_(current.proximaFecha);
            if(String(current.estado)!=='ACTIVO') break;
          }catch(err){
            crearNotificacionUnicaFase6_({tipo:'ERROR',titulo:'No se pudo registrar un movimiento automático',mensaje:`${current.nombre}: ${err.message||err}`,fecha:today,referenciaTipo:'RECURRENTE',referenciaId:current.id,claveUnica:`auto-error:${current.id}:${next}`});
            notices++;
            break;
          }
          guard++;
        }
      } else if(next){
        const days=diasEntreFase6_(today,next);
        const reminder=Math.max(0,Number(current.recordatorioDias)||0);
        if(days<=reminder){
          const title=days<0?'Pago atrasado':days===0?'Pago programado para hoy':`Pago en ${days} día${days===1?'':'s'}`;
          crearNotificacionUnicaFase6_({tipo:days<0?'ALERTA':'RECORDATORIO',titulo,mensaje:`${current.nombre} · ${current.moneda} ${Number(current.monto).toFixed(2)}`,fecha:today,referenciaTipo:'RECURRENTE',referenciaId:current.id,claveUnica:`due:${current.id}:${next}`});
          notices++;
        }
      }
    });

    // Recordatorios de metas con fecha objetivo cercana.
    if (db_().getSheetByName('Metas')) {
      try {
        obtenerMetasTodas().filter(g => g.activa !== false && g.estado !== 'ARCHIVADA' && g.fechaObjetivo && Number(g.montoRestante) > 0).forEach(g => {
          const target = fechaClave_(g.fechaObjetivo);
          if (!target) return;
          const days = diasEntreFase6_(today,target);
          if (days <= 7) {
            const title = days < 0 ? 'Meta con fecha vencida' : days === 0 ? 'La fecha de tu meta es hoy' : `Meta en ${days} día${days===1?'':'s'}`;
            crearNotificacionUnicaFase6_({tipo:days<0?'ALERTA':'RECORDATORIO',titulo:title,mensaje:`${g.nombre} · faltan ${g.moneda} ${Number(g.montoRestante).toFixed(2)}`,fecha:today,referenciaTipo:'META',referenciaId:g.id,claveUnica:`goal:${g.id}:${target}:${days<0?'late':'soon'}`});
            notices++;
          }
        });
      } catch (err) { console.warn('STAR STREAM · Recordatorios de metas:',err); }
    }

    const month=today.slice(0,7);
    const budgetPublicById = Object.fromEntries(obtenerPresupuestosFase6(month).map(b=>[String(b.id),b]));
    leerTabla_('Presupuestos').filter(x=>activo_(x.activo)&&String(x.estado)==='ACTIVO').forEach(b=>{
      const publicBudget=budgetPublicById[String(b.id)] || publicoPresupuestoFase6_(b,month);
      const threshold=Number(b.alertaPorcentaje)||80;
      if(publicBudget.porcentaje>=threshold){
        const over=publicBudget.porcentaje>=100;
        crearNotificacionUnicaFase6_({tipo:over?'ALERTA':'RECORDATORIO',titulo:over?'Presupuesto alcanzado':'Presupuesto cerca del límite',mensaje:`${b.nombre}: ${publicBudget.porcentaje.toFixed(0)}% usado`,fecha:today,referenciaTipo:'PRESUPUESTO',referenciaId:b.id,claveUnica:`budget:${b.id}:${month}:${over?'100':threshold}`});
        notices++;
      }
    });
    SpreadsheetApp.flush();
    return {procesadas:processed,notificaciones:notices};
  } finally { lock.releaseLock(); }
}

function ocurrenciasRecurrenteMesFase6_(r,month) {
  const start=month+'-01';
  const [y,m]=month.split('-').map(Number);
  const end=fechaDesdeUtcFase6_(new Date(Date.UTC(y,m,0)));
  const begin=fechaClave_(r.fechaInicio)||start;
  const finish=fechaClave_(r.fechaFin)||'9999-12-31';
  let cursor=begin;
  let count=0,guard=0;
  while(cursor<start && guard<500){cursor=siguienteFechaRecurrenteFase6_(cursor,r.frecuencia);guard++;}
  while(cursor<=end&&cursor<=finish&&guard<560){count++;cursor=siguienteFechaRecurrenteFase6_(cursor,r.frecuencia);guard++;}
  return count;
}

function resumenPlanificacionDesdeListasFase7_(recurrentesTodos,budgetsTodos,notes) {
  const cfg=obtenerConfiguracion();
  const moneda=String(cfg.monedaPrincipal||'DOP').toUpperCase();
  const tasa=tasaUsdDop_();
  const month=hoyFase6_().slice(0,7);
  const recurrentes=(recurrentesTodos||[]).filter(r=>r.estado==='ACTIVO'&&r.tipo==='GASTO');
  const fixed=recurrentes.reduce((s,r)=>{
    const v=convertirMoneda_((Number(r.monto)||0)*ocurrenciasRecurrenteMesFase6_(r,month),r.moneda,moneda,tasa);
    return s+(Number.isFinite(v)?v:0);
  },0);
  const budgets=(budgetsTodos||[]).filter(b=>b.estado==='ACTIVO');
  const budgetTotal=budgets.reduce((s,b)=>{const v=convertirMoneda_(Number(b.monto||0),b.moneda,moneda,tasa);return s+(Number.isFinite(v)?v:0);},0);
  const budgetSpent=budgets.reduce((s,b)=>{const v=convertirMoneda_(Number(b.gastado||0),b.moneda,moneda,tasa);return s+(Number.isFinite(v)?v:0);},0);
  const due=recurrentes.filter(r=>r.diasRestantes!==null&&r.diasRestantes<=Math.max(0,Number(r.recordatorioDias)||0)).length;
  return {moneda,periodo:month,gastosFijosMes:fixed,presupuestoMes:budgetTotal,gastadoPresupuestado:budgetSpent,proximosPagos:due,notificacionesPendientes:(notes||[]).filter(n=>!n.leida).length,tasaUsdDop:tasa};
}

function obtenerResumenPlanificacionFase6() {
  const recurrentes=obtenerRecurrentesFase6();
  const budgets=obtenerPresupuestosFase6();
  const notes=obtenerNotificacionesFase6();
  return resumenPlanificacionDesdeListasFase7_(recurrentes,budgets,notes);
}

function obtenerPlanificacionFase6() {
  sincronizarRecordatoriosRecurrentesFase611_();
  const recurrentes=obtenerRecurrentesFase6();
  const presupuestos=obtenerPresupuestosFase6();
  const notificaciones=obtenerNotificacionesFase6();
  return {
    recurrentes,
    presupuestos,
    notificaciones,
    resumen:resumenPlanificacionDesdeListasFase7_(recurrentes,presupuestos,notificaciones),
    triggerActivo:estadoTriggerFase6().activo
  };
}

function estadoTriggerFase6() {
  const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='procesarAutomatizacionesFase6');
  return {activo:exists};
}

function asegurarTriggerFase6_() {
  const state=estadoTriggerFase6();
  if(state.activo) return state;
  ScriptApp.newTrigger('procesarAutomatizacionesFase6').timeBased().everyDays(1).atHour(7).create();
  return {activo:true};
}

function instalarTriggerFase6() { return asegurarTriggerFase6_(); }

function eliminarTriggerFase6() {
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='procesarAutomatizacionesFase6').forEach(t=>ScriptApp.deleteTrigger(t));
  return {activo:false};
}

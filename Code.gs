function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Star Stream')
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1, viewport-fit=cover'
    );
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function obtenerDatosIniciales() {
  const datos = {
    configuracion: obtenerConfiguracion(),
    categorias: obtenerCategorias(),
    resumen: obtenerResumen()
  };
  return JSON.parse(JSON.stringify(datos));
}

function obtenerDatosFase2() {
  const datos = {
    configuracion: obtenerConfiguracion(),
    categorias: obtenerCategorias(),
    resumen: obtenerResumen(),
    movimientos: obtenerMovimientos({})
  };
  return JSON.parse(JSON.stringify(datos));
}


function asegurarFase3_() {
  const db = db_();
  const cfg = obtenerConfiguracion();
  const version = Number.parseFloat(String(cfg.versionApp || '0')) || 0;
  if (!db.getSheetByName('Transferencias') || version < 0.3) {
    migrarStarStreamFase3();
  }
}

function obtenerDatosFase3() {
  asegurarFase3_();
  const datos = {
    configuracion: obtenerConfiguracion(),
    categorias: obtenerCategorias(),
    categoriasTodas: obtenerCategoriasTodas(),
    resumen: obtenerResumen(),
    movimientos: obtenerMovimientos({}),
    transferencias: obtenerTransferencias({}),
    cuentasTodas: obtenerCuentasTodas()
  };
  return JSON.parse(JSON.stringify(datos));
}


function asegurarFase4_() {
  const db = db_();
  const cfg = obtenerConfiguracion();
  const version = Number.parseFloat(String(cfg.versionApp || '0')) || 0;
  if (!db.getSheetByName('MovimientosMetas') || version < 0.4) {
    migrarStarStreamFase4();
  }
}

function obtenerDatosFase4() {
  asegurarFase4_();
  const cfg = obtenerConfiguracion();
  const moneda = String(cfg.monedaPrincipal || 'DOP').toUpperCase();
  const datos = {
    configuracion: cfg,
    categorias: obtenerCategorias(),
    categoriasTodas: obtenerCategoriasTodas(),
    resumen: obtenerResumen(),
    movimientos: obtenerMovimientos({}),
    transferencias: obtenerTransferencias({}),
    cuentasTodas: obtenerCuentasTodas(),
    metas: obtenerMetasTodas(),
    movimientosMetas: obtenerMovimientosMetas({}),
    estadisticas: obtenerEstadisticasFase4({rango:'6M',moneda})
  };
  return JSON.parse(JSON.stringify(datos));
}


function asegurarFase5_() {
  const db = db_();
  const cfg = obtenerConfiguracion();
  const version = Number.parseFloat(String(cfg.versionApp || '0')) || 0;
  if (!db.getSheetByName('Comprobantes') || version < 0.5) {
    migrarStarStreamFase5();
  }
}

/**
 * Carga ligera para el primer render de Inicio.
 * Devuelve solo lo necesario para mostrar saldo, ingresos/gastos del mes,
 * cuentas y movimientos recientes. El resto se hidrata después en segundo plano.
 */
function resumenLigeroFase7_(resumen) {
  resumen = resumen || {};
  return {
    saldoTotal:resumen.saldoTotal,
    monedaTotal:resumen.monedaTotal,
    monedasMultiples:Boolean(resumen.monedasMultiples),
    conversionIncompleta:Boolean(resumen.conversionIncompleta),
    conversionAplicada:Boolean(resumen.conversionAplicada),
    tasaUsdDop:resumen.tasaUsdDop,
    ingresosPeriodo:resumen.ingresosPeriodo,
    gastosPeriodo:resumen.gastosPeriodo,
    ahorroNeto6Meses:resumen.ahorroNeto6Meses,
    periodo:resumen.periodo,
    cuentas:Array.isArray(resumen.cuentas) ? resumen.cuentas : [],
    movimientosRecientes:Array.isArray(resumen.movimientosRecientes) ? resumen.movimientosRecientes : [],
    transferenciasRecientes:Array.isArray(resumen.transferenciasRecientes) ? resumen.transferenciasRecientes : [],
    movimientosMetasRecientes:Array.isArray(resumen.movimientosMetasRecientes) ? resumen.movimientosMetasRecientes : [],
    ahorroMetas:resumen.ahorroMetas,
    patrimonioTotal:resumen.patrimonioTotal
  };
}

function obtenerInicioRapidoFase5() {
  asegurarFase5_();
  const cfg = obtenerConfiguracion();
  const resumenCompleto = obtenerResumen();
  const resumen = resumenLigeroFase7_(resumenCompleto);
  const categorias = obtenerCategorias();
  const recientes = Array.isArray(resumen.movimientosRecientes)
    ? resumen.movimientosRecientes
    : [];

  const datos = {
    configuracion: cfg,
    categorias: categorias,
    categoriasTodas: categorias,
    resumen: resumen,
    movimientos: recientes,
    transferencias: [],
    cuentasTodas: Array.isArray(resumen.cuentas) ? resumen.cuentas : [],
    metas: [],
    movimientosMetas: [],
    estadisticas: null,
    comprobantes: []
  };
  return JSON.parse(JSON.stringify(datos));
}

function obtenerDatosFase5() {
  asegurarFase5_();
  const cfg = obtenerConfiguracion();
  const moneda = String(cfg.monedaPrincipal || 'DOP').toUpperCase();
  const datos = {
    configuracion: cfg,
    categorias: obtenerCategorias(),
    categoriasTodas: obtenerCategoriasTodas(),
    resumen: obtenerResumen(),
    movimientos: obtenerMovimientos({}),
    transferencias: obtenerTransferencias({}),
    cuentasTodas: obtenerCuentasTodas(),
    metas: obtenerMetasTodas(),
    movimientosMetas: obtenerMovimientosMetas({}),
    estadisticas: obtenerEstadisticasFase4({rango:'6M',moneda}),
    comprobantes: obtenerComprobantes({})
  };
  return JSON.parse(JSON.stringify(datos));
}

function parsePayloadFase2_(payloadJson) {
  if (payloadJson && typeof payloadJson === 'object') return payloadJson;
  if (typeof payloadJson !== 'string' || !payloadJson.trim()) throw new Error('Payload inválido.');
  try {
    return JSON.parse(payloadJson);
  } catch (error) {
    throw new Error('No se pudo interpretar la información enviada.');
  }
}

function normalizarCuentaFase2_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    nombre: String(datos.nombre || '').trim(),
    tipo: String(datos.tipo || '').trim(),
    moneda: String(datos.moneda || 'DOP').trim().toUpperCase(),
    saldoInicial: Number(datos.saldoInicial)
  };
}

function normalizarMovimientoFase2_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    tipo: String(datos.tipo || '').trim().toUpperCase(),
    monto: Number(datos.monto),
    cuentaId: String(datos.cuentaId || '').trim(),
    categoriaId: String(datos.categoriaId || '').trim(),
    fecha: String(datos.fecha || '').trim(),
    descripcion: String(datos.descripcion || '').trim()
  };
}

function normalizarTransferenciaFase3_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    monto: Number(datos.monto),
    cuentaOrigenId: String(datos.cuentaOrigenId || '').trim(),
    cuentaDestinoId: String(datos.cuentaDestinoId || '').trim(),
    tasaCambio: Number(datos.tasaCambio),
    fecha: String(datos.fecha || '').trim(),
    descripcion: String(datos.descripcion || '').trim()
  };
}

function normalizarCategoriaFase3_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    nombre: String(datos.nombre || '').trim(),
    tipo: String(datos.tipo || '').trim().toUpperCase(),
    icono: String(datos.icono || '').trim()
  };
}

function normalizarConfiguracionFase3_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    nombreUsuario: String(datos.nombreUsuario ?? '').trim(),
    monedaPrincipal: String(datos.monedaPrincipal || '').trim().toUpperCase(),
    tasaUsdDop: Number(datos.tasaUsdDop)
  };
}

function crearCuentaFase2(payloadJson) {
  return crearCuenta(normalizarCuentaFase2_(payloadJson));
}

function editarCuentaFase3(id, payloadJson) {
  const datos = normalizarCuentaFase2_(payloadJson);
  return editarCuenta(String(id || ''), datos);
}

function crearMovimientoFase2(payloadJson) {
  return crearMovimiento(normalizarMovimientoFase2_(payloadJson));
}

function editarMovimientoFase2(id, payloadJson) {
  return editarMovimiento(id, normalizarMovimientoFase2_(payloadJson));
}

function crearTransferenciaFase3(payloadJson) {
  return crearTransferencia(normalizarTransferenciaFase3_(payloadJson));
}

function editarTransferenciaFase3(id, payloadJson) {
  return editarTransferencia(String(id || ''), normalizarTransferenciaFase3_(payloadJson));
}

function crearCategoriaFase3(payloadJson) {
  return crearCategoria(normalizarCategoriaFase3_(payloadJson));
}

function editarCategoriaFase3(id, payloadJson) {
  return editarCategoria(String(id || ''), normalizarCategoriaFase3_(payloadJson));
}

function actualizarConfiguracionFase3(payloadJson) {
  return actualizarConfiguracionUsuario(normalizarConfiguracionFase3_(payloadJson));
}

function normalizarMetaFase4_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    nombre:String(datos.nombre || '').trim(),
    montoObjetivo:Number(datos.montoObjetivo),
    moneda:String(datos.moneda || '').trim().toUpperCase(),
    fechaObjetivo:String(datos.fechaObjetivo || '').trim(),
    icono:String(datos.icono || '✦').trim()
  };
}

function normalizarMovimientoMetaFase4_(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  return {
    tipo:String(datos.tipo || '').trim().toUpperCase(),
    monto:Number(datos.monto),
    metaId:String(datos.metaId || '').trim(),
    cuentaId:String(datos.cuentaId || '').trim(),
    fecha:String(datos.fecha || '').trim(),
    descripcion:String(datos.descripcion || '').trim()
  };
}

function crearMetaFase4(payloadJson) {
  return crearMeta(normalizarMetaFase4_(payloadJson));
}

function editarMetaFase4(id,payloadJson) {
  return editarMeta(String(id || ''),normalizarMetaFase4_(payloadJson));
}

function crearMovimientoMetaFase4(payloadJson) {
  return crearMovimientoMeta(normalizarMovimientoMetaFase4_(payloadJson));
}

function editarMovimientoMetaFase4(id,payloadJson) {
  return editarMovimientoMeta(String(id || ''),normalizarMovimientoMetaFase4_(payloadJson));
}

function obtenerEstadisticasFase4Json(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson || '{}');
  return JSON.parse(JSON.stringify(obtenerEstadisticasFase4(datos)));
}


/* ==============================
 * FASE 6 · PLANIFICACIÓN
 * ============================== */
function asegurarFase6_() {
  const db = db_();
  const cfg = obtenerConfiguracion();
  const versionText = String(cfg.versionApp || '0');
  const version = Number.parseFloat(versionText) || 0;
  const transferSheet = db.getSheetByName('Transferencias');
  const transferCols = transferSheet ? transferSheet.getLastColumn() : 0;
  if (!db.getSheetByName('Recurrentes') || !db.getSheetByName('Presupuestos') || !db.getSheetByName('Notificaciones') || version < 0.6) {
    migrarStarStreamFase6();
  }
  const fase61Ready = version > 0.6 || versionText === '0.6.1';
  if (!fase61Ready || !String(cfg.tasaUsdDop || '').trim() || transferCols < STAR_STREAM_SCHEMA_V5.Transferencias.length) {
    migrarStarStreamFase61();
  }
}

function obtenerInicioRapidoFase6() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get('ss:f7:inicio');
    if (cached) return JSON.parse(cached);
  } catch (_) {}
  asegurarFase6_();

  const base = obtenerInicioRapidoFase5();
  base.recurrentes = [];
  base.presupuestos = [];
  base.notificaciones = [];
  base.resumenPlanificacion = null;
  base.triggerFase6 = null;
  const serial = JSON.stringify(base);
  try { if (serial.length < 90000) cache.put('ss:f7:inicio',serial,30); } catch (_) {}
  return JSON.parse(serial);
}

function obtenerDatosFase6() {
  asegurarFase6_();
  const base = obtenerDatosFase5();
  const plan = obtenerPlanificacionFase6();
  base.recurrentes = plan.recurrentes;
  base.presupuestos = plan.presupuestos;
  base.notificaciones = plan.notificaciones;
  base.resumenPlanificacion = plan.resumen;
  base.triggerFase6 = {activo:plan.triggerActivo};
  return JSON.parse(JSON.stringify(base));
}

function normalizarRecurrenteFase6_(payloadJson) {
  const d = parsePayloadFase2_(payloadJson);
  return {
    nombre:String(d.nombre||'').trim(),tipo:String(d.tipo||'GASTO').trim().toUpperCase(),
    monto:Number(d.monto),cuentaId:String(d.cuentaId||'').trim(),categoriaId:String(d.categoriaId||'').trim(),
    frecuencia:String(d.frecuencia||'MENSUAL').trim().toUpperCase(),fechaInicio:String(d.fechaInicio||'').trim(),
    fechaFin:String(d.fechaFin||'').trim(),recordatorioDias:Number(d.recordatorioDias??3),
    modoRegistro:String(d.modoRegistro||'CONFIRMAR').trim().toUpperCase(),descripcion:String(d.descripcion||'').trim()
  };
}

function normalizarPresupuestoFase6_(payloadJson) {
  const d = parsePayloadFase2_(payloadJson);
  return {
    nombre:String(d.nombre||'').trim(),categoriaId:String(d.categoriaId||'').trim(),monto:Number(d.monto),
    moneda:String(d.moneda||'').trim().toUpperCase(),fechaInicio:String(d.fechaInicio||'').trim(),
    fechaFin:String(d.fechaFin||'').trim(),alertaPorcentaje:Number(d.alertaPorcentaje||80)
  };
}

function crearRecurrenteFase6Json(payloadJson){return crearRecurrenteFase6(normalizarRecurrenteFase6_(payloadJson));}
function editarRecurrenteFase6Json(id,payloadJson){return editarRecurrenteFase6(String(id||''),normalizarRecurrenteFase6_(payloadJson));}
function crearPresupuestoFase6Json(payloadJson){return crearPresupuestoFase6(normalizarPresupuestoFase6_(payloadJson));}
function editarPresupuestoFase6Json(id,payloadJson){return editarPresupuestoFase6(String(id||''),normalizarPresupuestoFase6_(payloadJson));}
function obtenerPlanificacionFase6Json(){return JSON.parse(JSON.stringify(obtenerPlanificacionFase6()));}
function previsualizarImportacionCsvFase6Json(csvText){return JSON.parse(JSON.stringify(previsualizarImportacionCsvFase6(csvText)));}
function importarMovimientosCsvFase6Json(csvText){return JSON.parse(JSON.stringify(importarMovimientosCsvFase6(csvText)));}

/* ==============================
 * FASE 7 · RENDIMIENTO
 * ============================== */
function obtenerActualizacionRapidaFase7() {
  asegurarFase6_();
  const cfg = obtenerConfiguracion();
  return JSON.parse(JSON.stringify({
    configuracion:cfg,
    categorias:obtenerCategorias(),
    categoriasTodas:obtenerCategoriasTodas(),
    resumen:resumenLigeroFase7_(obtenerResumen()),
    resumenPlanificacion:obtenerResumenPlanificacionFase6(),
    cuentasTodas:obtenerCuentasTodas(),
    metas:obtenerMetasTodas(),
    movimientosMetas:obtenerMovimientosMetas({})
  }));
}

function obtenerPlanificacionRapidaFase7() {
  asegurarFase6_();
  return JSON.parse(JSON.stringify(obtenerPlanificacionFase6()));
}

function obtenerDashboardExtraFase7() {
  asegurarFase6_();
  const cfg=obtenerConfiguracion();
  const moneda=String(cfg.monedaPrincipal || 'DOP').toUpperCase();
  const plan=obtenerPlanificacionFase6();
  return JSON.parse(JSON.stringify({
    movimientos:obtenerMovimientos({}),
    transferencias:obtenerTransferencias({}),
    movimientosMetas:obtenerMovimientosMetas({}),
    metas:obtenerMetasTodas(),
    estadisticas:obtenerEstadisticasFase4({rango:'6M',moneda}),
    resumenPlanificacion:plan.resumen,
    notificaciones:plan.notificaciones,
    triggerFase6:{activo:plan.triggerActivo}
  }));
}

function obtenerMovimientosSeccionFase7() {
  asegurarFase6_();
  return JSON.parse(JSON.stringify({
    movimientos:obtenerMovimientos({}),
    transferencias:obtenerTransferencias({}),
    movimientosMetas:obtenerMovimientosMetas({}),
    comprobantes:obtenerComprobantes({})
  }));
}


function obtenerComprobantesFase7() {
  asegurarFase5_();
  return JSON.parse(JSON.stringify(obtenerComprobantes({})));
}

function procesarMantenimientoFase7() {
  asegurarFase6_();
  return JSON.parse(JSON.stringify(procesarAutomatizacionesFase6()));
}


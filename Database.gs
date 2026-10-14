const STAR_STREAM_SCHEMA_V5 = {
  Cuentas: ['id','nombre','tipo','moneda','saldoInicial','fechaCreacion','activa'],
  Movimientos: ['id','tipo','monto','cuentaId','categoriaId','fecha','descripcion','fechaCreacion','fechaActualizacion','activo'],
  Transferencias: ['id','monto','cuentaOrigenId','cuentaDestinoId','fecha','descripcion','fechaCreacion','fechaActualizacion','activo','montoDestino','tasaCambio','monedaOrigen','monedaDestino'],
  Categorias: ['id','nombre','tipo','icono','activa'],
  Metas: ['id','nombre','montoObjetivo','moneda','fechaObjetivo','icono','estado','fechaCreacion','fechaActualizacion','activa'],
  MovimientosMetas: ['id','tipo','monto','metaId','cuentaId','fecha','descripcion','fechaCreacion','fechaActualizacion','activo'],
  Comprobantes: ['id','movimientoId','archivoId','nombreArchivo','mimeType','urlDrive','textoOCR','comercioDetectado','montoDetectado','fechaDetectada','categoriaSugeridaId','fechaCreacion','fechaActualizacion','activo'],
  Recurrentes: ['id','nombre','tipo','monto','moneda','cuentaId','categoriaId','frecuencia','fechaInicio','fechaFin','proximaFecha','recordatorioDias','modoRegistro','descripcion','estado','ultimaEjecucion','fechaCreacion','fechaActualizacion','activo'],
  Presupuestos: ['id','nombre','categoriaId','monto','moneda','fechaInicio','fechaFin','alertaPorcentaje','estado','fechaCreacion','fechaActualizacion','activo'],
  Notificaciones: ['id','tipo','titulo','mensaje','fecha','referenciaTipo','referenciaId','claveUnica','leida','fechaCreacion','activo'],
  Configuracion: ['clave','valor']
};

function asegurarHojaEsquema_(db, name) {
  let sheet = db.getSheetByName(name);
  if (!sheet) {
    sheet = name === 'Cuentas' && db.getSheets().length === 1 && db.getSheets()[0].getLastRow() === 0
      ? db.getSheets()[0].setName(name)
      : db.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(STAR_STREAM_SCHEMA_V5[name]);
  } else {
    const actual = sheet.getRange(1, 1, 1, STAR_STREAM_SCHEMA_V5[name].length).getValues()[0].join('|');
    const esperado = STAR_STREAM_SCHEMA_V5[name].join('|');
    if (actual !== esperado) {
      throw new Error('Encabezados incompatibles en ' + name + '. Revisa la hoja antes de continuar.');
    }
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, sheet.getMaxRows(), STAR_STREAM_SCHEMA_V5[name].length).setNumberFormat('@');
  return sheet;
}

function establecerConfiguracion_(clave, valor) {
  const rows = leerTabla_('Configuracion');
  const actual = rows.find(x => x.clave === clave);
  if (actual) {
    if (String(actual.valor) !== String(valor)) {
      actualizar_('Configuracion', actual._row, {clave, valor});
    }
  } else {
    agregar_('Configuracion', {clave, valor});
  }
}

function instalarStarStream() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    let id = props.getProperty('STAR_STREAM_SHEET_ID');
    const db = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('StarStream_DB');

    for (const name of Object.keys(STAR_STREAM_SCHEMA_V5)) {
      asegurarHojaEsquema_(db, name);
    }

    props.setProperty('STAR_STREAM_SHEET_ID', db.getId());

    const defaults = {
      nombreUsuario: '',
      monedaPrincipal: 'DOP',
      simboloMoneda: 'RD$',
      versionApp: '0.8',
      tasaUsdDop: '59.4901'
    };
    Object.entries(defaults).forEach(([clave, valor]) => establecerConfiguracion_(clave, valor));

    if (!leerTabla_('Categorias').length) {
      for (const [tipo,nombre,icono] of [
        ['GASTO','Alimentación','🍽'],['GASTO','Transporte','🚗'],['GASTO','Estudios','📚'],
        ['GASTO','Entretenimiento','🎬'],['GASTO','Servicios','💡'],['GASTO','Compras','🛍'],
        ['GASTO','Otros','•'],['INGRESO','Salario','↑'],['INGRESO','Transferencia recibida','↙'],
        ['INGRESO','Venta','◈'],['INGRESO','Otros','•']
      ]) {
        agregar_('Categorias',{id:nuevoId_('cat'),nombre,tipo,icono,activa:'true'});
      }
    }

    SpreadsheetApp.flush();
    return 'Instalación lista. Base de datos: ' + db.getUrl();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Migración segura e idempotente desde v0.2.3 a v0.3.
 * No borra ni modifica cuentas, movimientos o categorías existentes.
 */
function migrarStarStreamFase3() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const db = db_();
    asegurarHojaEsquema_(db, 'Transferencias');
    establecerConfiguracion_('versionApp', '0.3');
    SpreadsheetApp.flush();
    return 'Migración a Star Stream v0.3 completada. No se eliminaron datos existentes.';
  } finally {
    lock.releaseLock();
  }
}


/**
 * Migra de forma segura la hoja Metas antigua (v0.3) al esquema v0.4.
 * Conserva los registros existentes y rellena los nuevos campos con valores seguros.
 */
function migrarMetasFase4_(db) {
  let sheet = db.getSheetByName('Metas');
  const nuevo = STAR_STREAM_SCHEMA_V5.Metas;
  if (!sheet) {
    sheet = db.insertSheet('Metas');
    sheet.appendRow(nuevo);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,sheet.getMaxRows(),nuevo.length).setNumberFormat('@');
    return sheet;
  }

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(String);
  if (headers.slice(0,nuevo.length).join('|') === nuevo.join('|')) {
    return sheet;
  }

  const antiguo = ['id','nombre','montoObjetivo','activa'];
  if (headers.slice(0,antiguo.length).join('|') !== antiguo.join('|')) {
    throw new Error('La hoja Metas tiene encabezados desconocidos. Haz una copia antes de continuar.');
  }

  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 2
    ? sheet.getRange(2,1,lastRow-1,antiguo.length).getValues()
    : [];
  const cfg = obtenerConfiguracion();
  const moneda = String(cfg.monedaPrincipal || 'DOP').toUpperCase();
  const now = instante_();

  const migrated = rows
    .filter(r => String(r[0] || '').trim())
    .map(r => ({
      id:String(r[0]),
      nombre:String(r[1] || 'Meta'),
      montoObjetivo:String(r[2] || '0'),
      moneda,
      fechaObjetivo:'',
      icono:'✦',
      estado:activo_(r[3]) ? 'ACTIVA' : 'PAUSADA',
      fechaCreacion:now,
      fechaActualizacion:now,
      activa:activo_(r[3]) ? 'true' : 'false'
    }));

  sheet.clear();
  sheet.getRange(1,1,1,nuevo.length).setValues([nuevo]);
  if (migrated.length) {
    sheet.getRange(2,1,migrated.length,nuevo.length)
      .setValues(migrated.map(obj => nuevo.map(k => celda_(obj[k]))));
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,sheet.getMaxRows(),nuevo.length).setNumberFormat('@');
  return sheet;
}

/**
 * Migración segura e idempotente a Star Stream v0.4.
 * Amplía Metas y crea MovimientosMetas sin borrar información existente.
 */
function migrarStarStreamFase4() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const db = db_();
    migrarMetasFase4_(db);
    asegurarHojaEsquema_(db, 'MovimientosMetas');
    establecerConfiguracion_('versionApp', '0.4');
    SpreadsheetApp.flush();
    return 'Migración a Star Stream v0.4 completada. Metas y estadísticas avanzadas listas.';
  } finally {
    lock.releaseLock();
  }
}


/**
 * Migración segura e idempotente a Star Stream v0.5.
 * Crea la tabla de comprobantes y una carpeta privada en Google Drive.
 * No modifica movimientos, cuentas, transferencias, metas ni categorías existentes.
 */
function migrarStarStreamFase5() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const db = db_();
    asegurarHojaEsquema_(db, 'Comprobantes');

    let cfg = obtenerConfiguracion();
    let folderId = String(cfg.carpetaComprobantesId || '').trim();
    let folder = null;
    if (folderId) {
      try { folder = DriveApp.getFolderById(folderId); } catch (_) { folder = null; }
    }
    if (!folder) {
      folder = DriveApp.createFolder('StarStream_Receipts');
      folderId = folder.getId();
      establecerConfiguracion_('carpetaComprobantesId', folderId);
    }

    establecerConfiguracion_('versionApp', '0.5');
    SpreadsheetApp.flush();
    return 'Migración a Star Stream v0.5 completada. Comprobantes y carpeta de Drive listos.';
  } finally {
    lock.releaseLock();
  }
}


/**
 * Migración segura e idempotente a Star Stream v0.6.
 * Agrega planificación, gastos recurrentes, presupuestos y notificaciones.
 * No borra ni modifica cuentas, movimientos, transferencias, metas o comprobantes existentes.
 */
function migrarStarStreamFase6() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const db = db_();
    asegurarHojaEsquema_(db, 'Recurrentes');
    asegurarHojaEsquema_(db, 'Presupuestos');
    asegurarHojaEsquema_(db, 'Notificaciones');

    let cfg = obtenerConfiguracion();
    let folderId = String(cfg.carpetaBackupsId || '').trim();
    let folder = null;
    if (folderId) {
      try { folder = DriveApp.getFolderById(folderId); } catch (_) { folder = null; }
    }
    if (!folder) {
      folder = DriveApp.createFolder('StarStream_Backups');
      folderId = folder.getId();
      establecerConfiguracion_('carpetaBackupsId', folderId);
    }

    establecerConfiguracion_('versionApp', '0.6');
    SpreadsheetApp.flush();

    let trigger = false;
    try { trigger = Boolean(asegurarTriggerFase6_().activo); } catch (err) { console.warn('STAR STREAM · Trigger Fase 6:', err); }
    return 'Migración a Star Stream v0.6 completada. Planificación lista' + (trigger ? ' y automatización diaria activada.' : '.');
  } finally {
    lock.releaseLock();
  }
}


/**
 * Star Stream v0.6.1 · migración segura de transferencias multimoneda.
 * Conserva las transferencias existentes y agrega columnas nuevas al final.
 */
function migrarTransferenciasFase61_(db) {
  let sheet = db.getSheetByName('Transferencias');
  const nuevo = STAR_STREAM_SCHEMA_V5.Transferencias;
  const antiguo = ['id','monto','cuentaOrigenId','cuentaDestinoId','fecha','descripcion','fechaCreacion','fechaActualizacion','activo'];

  if (!sheet) {
    sheet = db.insertSheet('Transferencias');
    sheet.appendRow(nuevo);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,sheet.getMaxRows(),nuevo.length).setNumberFormat('@');
    return sheet;
  }

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1,1,1,lastCol).getValues()[0].map(String);
  if (headers.slice(0,nuevo.length).join('|') === nuevo.join('|')) return sheet;
  if (headers.slice(0,antiguo.length).join('|') !== antiguo.join('|')) {
    throw new Error('La hoja Transferencias tiene encabezados desconocidos. Haz una copia antes de continuar.');
  }

  const extras = nuevo.slice(antiguo.length);
  sheet.getRange(1,antiguo.length+1,1,extras.length).setValues([extras]);
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,sheet.getMaxRows(),nuevo.length).setNumberFormat('@');
  return sheet;
}

function migrarStarStreamFase61() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const db = db_();
    migrarTransferenciasFase61_(db);
    const cfg = obtenerConfiguracion();
    if (!String(cfg.tasaUsdDop || '').trim()) establecerConfiguracion_('tasaUsdDop', '59.4901');
    establecerConfiguracion_('versionApp', '0.6.1');
    SpreadsheetApp.flush();
    return 'Migración a Star Stream v0.6.1 completada. Conversión USD/DOP y transferencias multimoneda listas.';
  } finally {
    lock.releaseLock();
  }
}



/**
 * Fase 7 · optimización. No cambia esquemas ni datos financieros.
 * Solo marca la versión instalada; las mejoras de rendimiento son compatibles
 * con las hojas existentes de v0.6.1.
 */
function migrarStarStreamFase7() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    establecerConfiguracion_('versionApp','0.7');
    SpreadsheetApp.flush();
    return 'Star Stream v0.7 listo. No se modificaron tus datos financieros.';
  } finally {
    lock.releaseLock();
  }
}

// Fase 7: caché por ejecución. Apps Script puede llamar a la misma tabla muchas
// veces dentro de una sola petición; leer Google Sheets repetidamente es uno de
// los costes más grandes de Star Stream. Este caché nunca sustituye a Sheets:
// se invalida en cuanto hay una escritura.
let STAR_STREAM_DB_HANDLE_FASE7_ = null;
let STAR_STREAM_TABLE_CACHE_FASE7_ = Object.create(null);

function db_() {
  if (STAR_STREAM_DB_HANDLE_FASE7_) return STAR_STREAM_DB_HANDLE_FASE7_;
  const id = PropertiesService.getScriptProperties().getProperty('STAR_STREAM_SHEET_ID');
  if (!id) throw new Error('Primero ejecuta instalarStarStream desde Apps Script.');
  STAR_STREAM_DB_HANDLE_FASE7_ = SpreadsheetApp.openById(id);
  return STAR_STREAM_DB_HANDLE_FASE7_;
}

function hoja_(name) {
  const sheet = db_().getSheetByName(name);
  if (!sheet) {
    if (name === 'Transferencias') {
      throw new Error('Falta la hoja Transferencias. Ejecuta migrarStarStreamFase3 una sola vez.');
    }
    throw new Error('Falta la hoja ' + name + '.');
  }
  return sheet;
}

function invalidarTablaCacheFase7_(name) {
  if (name) delete STAR_STREAM_TABLE_CACHE_FASE7_[name];
  else STAR_STREAM_TABLE_CACHE_FASE7_ = Object.create(null);
}

function invalidarCachesPersistentesFase7_() {
  try { CacheService.getScriptCache().removeAll(['ss:f7:inicio']); } catch (_) {}
}

function leerTabla_(name) {
  if (Object.prototype.hasOwnProperty.call(STAR_STREAM_TABLE_CACHE_FASE7_, name)) {
    return STAR_STREAM_TABLE_CACHE_FASE7_[name];
  }
  const sheet = hoja_(name), last = sheet.getLastRow();
  if (last < 2) {
    STAR_STREAM_TABLE_CACHE_FASE7_[name] = [];
    return STAR_STREAM_TABLE_CACHE_FASE7_[name];
  }
  const keys = STAR_STREAM_SCHEMA_V5[name];
  const rows = sheet.getRange(2,1,last-1,keys.length).getValues().map((values,i) => {
    const row = {_row:i+2};
    keys.forEach((k,j) => row[k] = values[j]);
    return row;
  });
  STAR_STREAM_TABLE_CACHE_FASE7_[name] = rows;
  return rows;
}

function celda_(v) {
  const s = v == null ? '' : String(v);
  return /^[\s]*[=+\-@]/.test(s) ? '\'' + s : s;
}

function agregar_(name,data) {
  const sheet=hoja_(name);
  const values=STAR_STREAM_SCHEMA_V5[name].map(k => celda_(data[k]));
  sheet.getRange(sheet.getLastRow()+1,1,1,values.length).setValues([values]);
  invalidarTablaCacheFase7_(name);
  invalidarCachesPersistentesFase7_();
}

function actualizar_(name,row,data) {
  hoja_(name).getRange(row,1,1,STAR_STREAM_SCHEMA_V5[name].length)
    .setValues([STAR_STREAM_SCHEMA_V5[name].map(k => celda_(data[k]))]);
  invalidarTablaCacheFase7_(name);
  invalidarCachesPersistentesFase7_();
}

function nuevoId_(prefix) { return prefix + '_' + Utilities.getUuid(); }
function buscar_(name,id) { return leerTabla_(name).find(x => x.id === id); }

function bloqueo_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function obtenerConfiguracion() {
  const result = {};
  leerTabla_('Configuracion').forEach(x => { result[x.clave] = String(x.valor); });
  return result;
}

function actualizarConfiguracionUsuario(datos) {
  return bloqueo_(() => {
    if (!datos || typeof datos !== 'object') {
      throw new Error('Datos de configuración inválidos.');
    }

    const nombreUsuario = String(datos.nombreUsuario ?? '').trim();
    if (nombreUsuario.length > 60) {
      throw new Error('El nombre de usuario no puede superar 60 caracteres.');
    }

    const monedaPrincipal = String(datos.monedaPrincipal || '').trim().toUpperCase();
    if (!['DOP', 'USD'].includes(monedaPrincipal)) {
      throw new Error('La moneda principal debe ser DOP o USD.');
    }

    // El símbolo se deriva en el servidor para evitar configuraciones incoherentes.
    const simboloMoneda = monedaPrincipal === 'DOP' ? 'RD$' : 'US$';
    const tasaActual = Number(obtenerConfiguracion().tasaUsdDop || 59.4901);
    const tasaUsdDop = Number(datos.tasaUsdDop ?? tasaActual);
    if (!Number.isFinite(tasaUsdDop) || tasaUsdDop <= 0 || tasaUsdDop > 1000) {
      throw new Error('La tasa USD/DOP debe ser un número mayor que 0.');
    }

    establecerConfiguracion_('nombreUsuario', nombreUsuario);
    establecerConfiguracion_('monedaPrincipal', monedaPrincipal);
    establecerConfiguracion_('simboloMoneda', simboloMoneda);
    establecerConfiguracion_('tasaUsdDop', tasaUsdDop.toFixed(4));
    SpreadsheetApp.flush();

    return {nombreUsuario, monedaPrincipal, simboloMoneda, tasaUsdDop:tasaUsdDop.toFixed(4)};
  });
}

/**
 * Guarda la foto de perfil como un JPEG compacto dentro de Configuracion.
 * El frontend recorta y comprime la imagen antes de enviarla para mantenerla
 * por debajo del limite de una celda de Google Sheets.
 */
function guardarFotoPerfilFase3(dataUrl) {
  return bloqueo_(() => {
    const foto = String(dataUrl || '').trim();
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(foto)) {
      throw new Error('La foto de perfil debe ser una imagen JPG procesada por Star Stream.');
    }

    const base64 = foto.split(',')[1] || '';
    let bytes;
    try {
      bytes = Utilities.base64Decode(base64);
    } catch (error) {
      throw new Error('No se pudo interpretar la imagen seleccionada.');
    }

    // Margen seguro bajo el limite de 50 000 caracteres por celda de Sheets.
    if (foto.length > 45000 || bytes.length > 33000) {
      throw new Error('La imagen es demasiado grande incluso despues de comprimirla. Prueba con otra foto.');
    }

    establecerConfiguracion_('fotoPerfil', foto);
    SpreadsheetApp.flush();
    return {fotoPerfil: foto};
  });
}

function eliminarFotoPerfilFase3() {
  return bloqueo_(() => {
    establecerConfiguracion_('fotoPerfil', '');
    SpreadsheetApp.flush();
    return {fotoPerfil: ''};
  });
}

function obtenerCategorias() {
  return leerTabla_('Categorias')
    .filter(x => activo_(x.activa))
    .map(x => ({id:x.id,nombre:x.nombre,tipo:x.tipo,icono:x.icono,activa:true}));
}

function activo_(v) { return v === true || String(v).toLowerCase() === 'true'; }


/**
 * Fase 8 · migración visual segura e idempotente.
 * No cambia esquemas ni registros financieros; solo marca la versión instalada.
 */
function migrarStarStreamFase8() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Verifica que las hojas existentes sigan usando el esquema esperado.
    const db = db_();
    Object.keys(STAR_STREAM_SCHEMA_V5).forEach(name => asegurarHojaEsquema_(db, name));
    establecerConfiguracion_('versionApp','0.8');
    SpreadsheetApp.flush();
    invalidarTablaCacheFase7_();
    invalidarCachesPersistentesFase7_();
    return 'Star Stream v0.8 listo. No se modificaron tus registros financieros.';
  } finally {
    lock.releaseLock();
  }
}

/** Star Stream v0.6 · Exportación, importación y respaldos. */

function carpetaBackupsFase6_() {
  const cfg=obtenerConfiguracion();
  let id=String(cfg.carpetaBackupsId||'').trim();
  if(id){try{return DriveApp.getFolderById(id);}catch(_){}}
  const folder=DriveApp.createFolder('StarStream_Backups');
  establecerConfiguracion_('carpetaBackupsId',folder.getId());
  return folder;
}

function datosBackupFase6_() {
  const tables={};
  Object.keys(STAR_STREAM_SCHEMA_V5).forEach(name=>{
    const sheet=db_().getSheetByName(name);
    if(!sheet){tables[name]=[];return;}
    tables[name]=leerTabla_(name).map(row=>{
      const out={};
      STAR_STREAM_SCHEMA_V5[name].forEach(k=>out[k]=row[k]);
      return out;
    });
  });
  return {app:'Star Stream',version:String(obtenerConfiguracion().versionApp||'0.6'),createdAt:instante_(),timezone:'America/Santo_Domingo',tables};
}

function crearBackupFase6() {
  const folder=carpetaBackupsFase6_();
  const stamp=Utilities.formatDate(new Date(),'America/Santo_Domingo','yyyyMMdd_HHmmss');
  const name=`StarStream_Backup_${stamp}.json`;
  const file=folder.createFile(name,JSON.stringify(datosBackupFase6_(),null,2),MimeType.PLAIN_TEXT);
  return {id:file.getId(),name:file.getName(),url:file.getUrl()};
}

function csvEscapeFase6_(value) {
  const s=String(value==null?'':value);
  return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}

function exportarMovimientosCsvFase6() {
  const accounts=Object.fromEntries(obtenerCuentasTodas().map(a=>[String(a.id),a]));
  const categories=Object.fromEntries(obtenerCategoriasTodas().map(c=>[String(c.id),c]));
  const rows=[['tipo','monto','cuenta','categoria','fecha','descripcion']];
  obtenerMovimientos({}).slice().sort((a,b)=>fechaClave_(a.fecha).localeCompare(fechaClave_(b.fecha))).forEach(m=>{
    rows.push([m.tipo,Number(m.monto).toFixed(2),accounts[String(m.cuentaId)]?.nombre||m.cuentaId,categories[String(m.categoriaId)]?.nombre||m.categoriaId,fechaClave_(m.fecha),m.descripcion||'']);
  });
  const csv='\ufeff'+rows.map(row=>row.map(csvEscapeFase6_).join(',')).join('\r\n');
  const folder=carpetaBackupsFase6_();
  const stamp=Utilities.formatDate(new Date(),'America/Santo_Domingo','yyyyMMdd_HHmmss');
  const file=folder.createFile(`StarStream_Movimientos_${stamp}.csv`,csv,MimeType.CSV);
  return {id:file.getId(),name:file.getName(),url:file.getUrl(),cantidad:rows.length-1};
}

function parseCsvFase6_(text) {
  const raw=String(text||'').replace(/^\uFEFF/,'');
  if(!raw.trim()) throw new Error('El CSV está vacío.');
  const firstLine=raw.split(/\r?\n/,1)[0];
  const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(quoted){
      if(ch==='"'&&raw[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')quoted=false;
      else field+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===delimiter){row.push(field);field='';}
      else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
      else field+=ch;
    }
  }
  row.push(field.replace(/\r$/,''));
  if(row.some(x=>String(x).trim()))rows.push(row);
  return rows;
}

function slugFase6_(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();}

function resolverCuentaImportFase6_(value,accounts){
  const s=String(value||'').trim();
  return accounts.find(a=>String(a.id)===s)||accounts.find(a=>slugFase6_(a.nombre)===slugFase6_(s));
}
function resolverCategoriaImportFase6_(value,cats,tipo){
  const s=String(value||'').trim();
  return cats.find(c=>String(c.id)===s&&c.tipo===tipo)||cats.find(c=>c.tipo===tipo&&slugFase6_(c.nombre)===slugFase6_(s));
}

function prepararImportacionCsvFase6_(csvText) {
  const rows=parseCsvFase6_(csvText);
  if(rows.length<2) throw new Error('El CSV no contiene movimientos.');
  const headers=rows[0].map(slugFase6_);
  const aliases={tipo:['tipo','type'],monto:['monto','amount','importe'],cuenta:['cuenta','account'],categoria:['categoria','category'],fecha:['fecha','date'],descripcion:['descripcion','description','detalle']};
  const idx={};
  Object.entries(aliases).forEach(([key,names])=>{idx[key]=headers.findIndex(h=>names.includes(h));});
  for(const required of ['tipo','monto','cuenta','categoria','fecha']) if(idx[required]<0) throw new Error(`Falta la columna ${required}. Usa el formato exportado por Star Stream.`);
  const accounts=obtenerCuentasTodas().filter(a=>a.activa!==false);
  const cats=obtenerCategoriasTodas().filter(c=>c.activa!==false);
  const valid=[],errors=[];
  rows.slice(1).forEach((r,i)=>{
    if(!r.some(x=>String(x).trim()))return;
    try{
      const tipo=String(r[idx.tipo]||'').trim().toUpperCase();
      if(!['INGRESO','GASTO'].includes(tipo))throw new Error('tipo debe ser INGRESO o GASTO');
      const cuenta=resolverCuentaImportFase6_(r[idx.cuenta],accounts);if(!cuenta)throw new Error('cuenta no encontrada');
      const categoria=resolverCategoriaImportFase6_(r[idx.categoria],cats,tipo);if(!categoria)throw new Error('categoría no encontrada o incompatible');
      const normalized=validarMovimiento_({tipo,monto:String(r[idx.monto]||'').replace(/,/g,''),cuentaId:cuenta.id,categoriaId:categoria.id,fecha:String(r[idx.fecha]||'').trim(),descripcion:idx.descripcion>=0?String(r[idx.descripcion]||'').trim():''});
      valid.push({...normalized,cuentaNombre:cuenta.nombre,categoriaNombre:categoria.nombre,fila:i+2});
    }catch(err){errors.push({fila:i+2,error:String(err.message||err)});}
  });
  return {valid,errors,total:rows.length-1};
}

function previsualizarImportacionCsvFase6(csvText) {
  const p=prepararImportacionCsvFase6_(csvText);
  return {total:p.total,validas:p.valid.length,errores:p.errors.length,muestra:p.valid.slice(0,8).map(x=>({fila:x.fila,tipo:x.tipo,monto:Number(x.monto),cuenta:x.cuentaNombre,categoria:x.categoriaNombre,fecha:x.fecha,descripcion:x.descripcion})),detalleErrores:p.errors.slice(0,12)};
}

function importarMovimientosCsvFase6(csvText) {
  return bloqueo_(()=>{
    const p=prepararImportacionCsvFase6_(csvText);
    if(!p.valid.length)throw new Error('No hay filas válidas para importar.');
    const existing=new Set(leerTabla_('Movimientos').filter(x=>activo_(x.activo)).map(m=>[m.tipo,Number(m.monto).toFixed(2),m.cuentaId,m.categoriaId,fechaClave_(m.fecha),String(m.descripcion||'').trim()].join('|')));
    let inserted=0,duplicates=0;const now=instante_();
    p.valid.forEach(v=>{
      const key=[v.tipo,Number(v.monto).toFixed(2),v.cuentaId,v.categoriaId,v.fecha,String(v.descripcion||'').trim()].join('|');
      if(existing.has(key)){duplicates++;return;}
      const m={id:nuevoId_('mov'),tipo:v.tipo,monto:v.monto,cuentaId:v.cuentaId,categoriaId:v.categoriaId,fecha:v.fecha,descripcion:v.descripcion,fechaCreacion:now,fechaActualizacion:now,activo:'true'};
      agregar_('Movimientos',m);existing.add(key);inserted++;
    });
    return {importados:inserted,duplicados:duplicates,errores:p.errors.length};
  });
}

/**
 * Fase 8 · restablecimiento financiero seguro.
 * Requiere confirmación explícita del frontend y crea un backup antes de borrar.
 * Mantiene Configuracion y Categorias para preservar perfil, moneda, tasa y estructura.
 */
function limpiarRegistrosFinancierosFase8_(name) {
  const sheet = db_().getSheetByName(name);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const rows = lastRow - 1;
  const columns = STAR_STREAM_SCHEMA_V5[name].length;
  sheet.getRange(2, 1, rows, columns).clearContent();
  invalidarTablaCacheFase7_(name);
  return rows;
}

function restablecerDatosFinancierosFase8(payloadJson) {
  const datos = typeof payloadJson === 'string'
    ? JSON.parse(payloadJson || '{}')
    : (payloadJson || {});
  if (String(datos.confirmacion || '').trim() !== 'RESTABLECER STAR STREAM') {
    throw new Error('La frase de confirmación no coincide. No se eliminó ningún dato.');
  }

  return bloqueo_(() => {
    // El backup ocurre dentro del mismo bloqueo y antes de cualquier borrado.
    const backup = crearBackupFase6();
    const tables = [
      'Cuentas','Movimientos','Transferencias','Metas','MovimientosMetas',
      'Comprobantes','Recurrentes','Presupuestos','Notificaciones'
    ];
    const eliminados = {};
    tables.forEach(name => { eliminados[name] = limpiarRegistrosFinancierosFase8_(name); });
    establecerConfiguracion_('versionApp','0.8');
    SpreadsheetApp.flush();
    invalidarTablaCacheFase7_();
    invalidarCachesPersistentesFase7_();
    return {ok:true,backup,eliminados,conservado:['Configuracion','Categorias']};
  });
}

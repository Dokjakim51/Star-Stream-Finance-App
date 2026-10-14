/**
 * Star Stream v0.5.2 · OCR híbrido + QR e-CF + lotes multipágina
 *
 * Un comprobante puede contener una foto/PDF o varias fotos del mismo recibo.
 * Los archivos originales se guardan en Drive. En Sheets, archivoId conserva
 * un JSON compacto con los metadatos del lote (las filas antiguas siguen siendo compatibles).
 */

function migrarStarStreamFase51() {
  return bloqueo_(() => {
    establecerConfiguracion_('versionApp', '0.5.1');
    SpreadsheetApp.flush();
    return 'Star Stream v0.5.1 listo. OCR mejorado y comprobantes multipágina activados.';
  });
}

function migrarStarStreamFase523() {
  establecerConfiguracion_('versionApp', '0.5.2.3');
  SpreadsheetApp.flush();
  return 'Star Stream v0.5.2.3 listo: OCR rotado, monto mejorado y actividad reciente corregida.';
}

function migrarStarStreamFase52() {
  return bloqueo_(() => {
    establecerConfiguracion_('versionApp', '0.5.2');
    SpreadsheetApp.flush();
    return 'Star Stream v0.5.2 listo. OCR híbrido y lectura de QR e-CF activados.';
  });
}

function carpetaComprobantes_() {
  const cfg = obtenerConfiguracion();
  let id = String(cfg.carpetaComprobantesId || '').trim();
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (_) {}
  }
  const folder = DriveApp.createFolder('StarStream_Receipts');
  establecerConfiguracion_('carpetaComprobantesId', folder.getId());
  return folder;
}

function dataUrlABlob_(dataUrl, fallbackName) {
  const raw = String(dataUrl || '');
  const m = raw.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) throw new Error('Archivo inválido o incompleto.');
  const mime = String(m[1] || '').toLowerCase();
  const permitidos = ['image/jpeg','image/png','application/pdf'];
  if (!permitidos.includes(mime)) throw new Error('Solo se permiten JPG, PNG o PDF.');
  const bytes = Utilities.base64Decode(m[2]);
  if (!bytes.length) throw new Error('El archivo está vacío.');
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Cada página preparada no puede superar 5 MB.');
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  const safeName = String(fallbackName || ('comprobante.' + ext)).replace(/[\\/:*?"<>|]/g,'_').slice(0,120);
  return Utilities.newBlob(bytes, mime, safeName || ('comprobante.' + ext));
}

/**
 * Convierte una imagen/PDF temporalmente a Google Docs para usar el OCR de Drive.
 * La versión anterior intentaba leer casi inmediatamente; aquí damos tiempo real
 * a la conversión y reintentamos porque Drive puede tardar varios segundos.
 */
function textoOcrDrive_(blob) {
  let tempId = '';
  let ultimoError = null;
  try {
    const meta = {
      name: 'StarStream_OCR_' + Date.now(),
      mimeType: 'application/vnd.google-apps.document'
    };
    const doc = Drive.Files.create(meta, blob, {ocrLanguage:'es', fields:'id,name'});
    tempId = doc && doc.id ? doc.id : '';
    if (!tempId) throw new Error('Drive no devolvió el documento temporal de OCR.');

    const esperas = [500, 800, 1200, 1700, 2300, 3000, 3800];
    for (let i = 0; i < esperas.length; i++) {
      Utilities.sleep(esperas[i]);
      try {
        const text = DocumentApp.openById(tempId).getBody().getText() || '';
        if (String(text).trim()) return String(text).trim().slice(0, 12000);
      } catch (err) {
        ultimoError = err;
      }
    }

    if (ultimoError) console.warn('STAR STREAM OCR sin texto después de reintentos:', ultimoError);
    return '';
  } finally {
    if (tempId) {
      try { DriveApp.getFileById(tempId).setTrashed(true); } catch (_) {}
    }
  }
}

function normalizarNumeroOcr_(value) {
  let s = String(value || '').trim().replace(/\s/g,'').replace(/[^0-9.,-]/g,'');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g,'').replace(',','.');
    else s = s.replace(/,/g,'');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 2 ? s.replace(',','.') : s.replace(/,/g,'');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    if (decimals !== 2) s = s.replace(/\./g,'');
  }

  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}


function normalizarLineaOcr_(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

function claveMontoOcr_(value) {
  const n = normalizarNumeroOcr_(value);
  return n === null ? '' : n.toFixed(2);
}

function candidatosMontoLinea_(line) {
  const out = [];
  const rawLine = normalizarLineaOcr_(line);
  const re = /(?:(RD\$|DOP|US\$|USD|\$)\s*)?([0-9][0-9.,\s]*[0-9]|[0-9])/gi;
  let m;
  while ((m = re.exec(rawLine))) {
    const raw = String(m[2] || '').replace(/\s/g, '');
    const tieneMoneda = Boolean(m[1]);
    const tieneDecimales = /[.,]\d{2}$/.test(raw);
    const tieneSeparadorMiles = /\d[.,]\d{3}(?:[.,]\d{2})?$/.test(raw);
    const n = normalizarNumeroOcr_(raw);
    if (n === null || n <= 0 || n >= 1e9) continue;
    if (!tieneMoneda && !tieneDecimales && !tieneSeparadorMiles) continue;
    out.push({n,raw,tieneMoneda,tieneDecimales,tieneSeparadorMiles});
  }
  return out;
}

function extraerMontoOcr_(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map(normalizarLineaOcr_)
    .filter(Boolean);

  if (!lines.length) return '';

  const labelVeryStrong = /\b(importe\s+total(?:\s+en\s+(?:rd(?:\$|s|5)?|dop|usd|us\$?))?|total\s+(?:a\s+pagar|pagad[oa]|general|factura|neto|due)|monto\s+(?:total|a\s+pagar|pagad[oa])|valor\s+total|balance\s+due|amount\s+due|total\s+due|total\s+paid|neto\s+a\s+pagar|importe\s+a\s+pagar)\b/i;
  const labelStrong = /\b(importe(?:\s+en\s+(?:rd(?:\$|s|5)?|dop|usd|us\$?))?|total|monto|amount|balance)\b/i;
  const negativeHard = /\b(subtotal|sub\s*total|itbis|iva|tax|impuesto|descuento|discount|cambio|change|efectivo|cash|devuelta|vuelto|propina|tip|saldo\s+anterior|balance\s+anterior|deuda\s+(?:anterior|facturas?\s+anteriores)|mora|inter[eé]s|cargo\s+fijo|energ[ií]a|consumo|kwh|lectura|hist[oó]rico|cuota)\b/i;
  const idLike = /\b(rnc|ruc|ncf|e-?ncf|factura\s*(?:no|n[uú]m)|referencia|ref\.?|transacci[oó]n|tel[eé]fono|phone|id|documento|cliente|c[oó]digo|nic|medidor|ruta|itiner)\b/i;
  const dateLike = /\b(fecha|date|vencimiento|emisi[oó]n|periodo|per[ií]odo)\b/i;

  const freq = new Map();
  const rawCandidates = [];

  lines.forEach((line, idx) => {
    const vals = candidatosMontoLinea_(line);
    const prev = lines[idx - 1] || '';

    // Algunos tickets imprimen "TOTAL" y debajo un entero sin símbolo ni
    // centavos. Solo aceptamos ese caso cuando existe una etiqueta fuerte
    // pegada al número, para no confundir IDs, años o referencias.
    if (!vals.length && (labelVeryStrong.test(line) || labelVeryStrong.test(prev) || /^total\b/i.test(line) || /^total\b/i.test(prev))) {
      const integers = String(line).match(/\b\d{1,7}\b/g) || [];
      integers.forEach(raw => {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0 || (n >= 1900 && n <= 2100)) return;
        vals.push({n,raw,tieneMoneda:false,tieneDecimales:false,tieneSeparadorMiles:false});
      });
    }

    vals.forEach(v => {
      const key = v.n.toFixed(2);
      freq.set(key, (freq.get(key) || 0) + 1);
      rawCandidates.push({idx,line,...v});
    });
  });

  const candidates = [];
  rawCandidates.forEach(c => {
    const {idx,line,n} = c;
    const prev1 = lines[idx - 1] || '';
    const prev2 = lines[idx - 2] || '';
    const next1 = lines[idx + 1] || '';
    const next2 = lines[idx + 2] || '';
    const contexts = [
      {line, distance:0},
      {line:prev1, distance:1},
      {line:next1, distance:1},
      {line:prev2, distance:2},
      {line:next2, distance:2}
    ];

    let score = 0;
    for (const ctx of contexts) {
      if (!ctx.line) continue;
      if (labelVeryStrong.test(ctx.line)) {
        score += ctx.distance === 0 ? 520 : ctx.distance === 1 ? 390 : 250;
      } else if (labelStrong.test(ctx.line)) {
        score += ctx.distance === 0 ? 220 : ctx.distance === 1 ? 135 : 75;
      }
    }

    if (negativeHard.test(line)) score -= 360;
    if (idLike.test(line)) score -= 250;
    if (dateLike.test(line)) score -= 150;
    if (labelVeryStrong.test(prev1) && !negativeHard.test(prev1)) score += 170;

    if (c.tieneMoneda) score += 70;
    if (c.tieneDecimales) score += 55;
    if (c.tieneSeparadorMiles) score += 20;
    score += Math.min(150, Math.max(0, (freq.get(n.toFixed(2)) || 1) - 1) * 55);

    if (!c.tieneMoneda && !c.tieneDecimales && n >= 1900 && n <= 2100) score -= 400;
    if (n < 1 && !labelVeryStrong.test(line)) score -= 80;

    score += (idx / Math.max(1, lines.length - 1)) * 18;
    candidates.push({...c,score});
  });

  if (!candidates.length) return '';
  candidates.sort((a,b) => b.score - a.score || (freq.get(b.n.toFixed(2))||0) - (freq.get(a.n.toFixed(2))||0) || b.n - a.n);
  const best = candidates[0];
  if (best.score < 90) return '';
  return best.n.toFixed(2);
}

function extraerFechaOcr_(text) {
  const lines = String(text || '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const candidates = [];

  function addCandidate(iso, line, idx) {
    try {
      const fecha = fecha_(iso);
      let score = 0;
      const s = String(line || '').toLowerCase();
      if (/\bfecha(?:\s+de)?\s*(?:emisi[oó]n)?\b/.test(s)) score += 160;
      if (/\b(emisi[oó]n|emitid[ao])\b/.test(s)) score += 90;
      if (/\b(invoice\s+date|date)\b/.test(s)) score += 75;
      if (/\b(v[aá]lido\s+hasta|vencimiento|vence|expira|expiry|fecha\s+de\s+firma|firma\s+digital)\b/.test(s)) score -= 220;
      score += Math.max(0, 20 - idx);
      candidates.push({fecha,score,idx,line});
    } catch (_) {}
  }

  lines.forEach((line, idx) => {
    let m = line.match(/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.]([0-2]?\d|3[01])\b/);
    if (m) addCandidate(`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`, line, idx);

    m = line.match(/\b([0-2]?\d|3[01])[-\/.](0?[1-9]|1[0-2])[-\/.](20\d{2}|\d{2})\b/);
    if (m) {
      const y = String(m[3]).length === 2 ? '20' + m[3] : m[3];
      addCandidate(`${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`, line, idx);
    }
  });

  const months = {
    enero:1,ene:1,january:1,jan:1,febrero:2,feb:2,february:2,
    marzo:3,mar:3,march:3,abril:4,abr:4,april:4,apr:4,
    mayo:5,may:5,junio:6,jun:6,june:6,julio:7,jul:7,july:7,
    agosto:8,ago:8,august:8,aug:8,septiembre:9,setiembre:9,sep:9,september:9,
    octubre:10,oct:10,october:10,noviembre:11,nov:11,november:11,
    diciembre:12,dic:12,dec:12,december:12
  };
  lines.forEach((line, idx) => {
    const m = line.toLowerCase().match(/\b([0-2]?\d|3[01])\s+(?:de\s+)?([a-záéíóúñ]+)\s+(?:de\s+)?(20\d{2})\b/i);
    if (!m) return;
    const key = m[2].normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const month = months[key];
    if (month) addCandidate(`${m[3]}-${String(month).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`, line, idx);
  });

  if (!candidates.length) return '';
  candidates.sort((a,b)=>b.score-a.score || a.idx-b.idx);
  return candidates[0].fecha;
}

function extraerComercioOcr_(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map(normalizarLineaOcr_)
    .filter(x => x.length >= 2 && x.length <= 110);

  if (!lines.length) return '';

  const labelOnly = /^(lectura alternativa\b|ocr alternativo\b|texto ocr\b|p[aá]gina\b|page\b|rnc\b|ruc\b|ncf\b|e-?ncf\b|factura\b|invoice\b|ticket\b|recibo\b|comprobante\b|fecha\b|date\b|v[aá]lido\b|tel[eé]fono\b|phone\b|sucursal\b|oficina\b|direcci[oó]n\b|cajero\b|cashier\b|vendedor\b|cliente\b|customer\b|datos\b|descripci[oó]n\b|subtotal\b|descuento\b|total\b|importe\b|monto\b|itbis\b|iva\b|tax\b|efectivo\b|cambio\b|c[oó]digo\b|referencia\b|periodo\b|hist[oó]rico\b|notificaciones\b|gracias\b|thank\b)/i;
  const personalField = /\b(nombre\s+cliente|cliente\s*:|customer|titular|cajero|vendedor|cashier|empleado|documento\s+cliente)\b/i;
  const addressLike = /\b(calle|av\.?|avenida|direcci[oó]n|sector|municipio|provincia|tel[eé]fono|phone|ruta|poste|piso|depto|localidad|loc\.)\b/i;
  const companySuffix = /\b(s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?|e\.?\s*i\.?\s*r\.?\s*l\.?|s\.?\s*a\.?\s*s\.?|inc\.?|llc|ltd\.?|corp\.?|compa[nñ][ií]a)\b/i;
  const businessWords = /\b(farmacia|farmacias|supermercado|market|tienda|store|restaurant|restaurante|caf[eé]|colmado|servicios?|service|hotel|cl[ií]nica|laboratorio|banco|bank|electricidad|el[eé]ctrica|distribuidora|telecom|internet|combustible|gasolinera|estaci[oó]n|ferreter[ií]a|motors|tecnolog[ií]a|technology|pago|pagatodo|edesur|edeeste|edenorte)\b/i;
  const explicitField = /\b(?:comercio|establecimiento|merchant|proveedor|empresa|raz[oó]n\s+social)\s*:\s*(.+)$/i;

  const candidates = [];

  lines.forEach((line, idx) => {
    if (labelOnly.test(line) || personalField.test(line)) return;
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(line)) return;
    if (/^[\W\d_]+$/.test(line)) return;

    const explicit = line.match(explicitField);
    if (explicit && explicit[1]) {
      const value = normalizarLineaOcr_(explicit[1]);
      if (value && !personalField.test(value)) {
        candidates.push({value, score:420 - Math.min(idx,30)});
      }
    }

    let score = 0;
    const normalizedLetters = line.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g,'');
    const upperLetters = normalizedLetters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g,'');
    const upperRatio = normalizedLetters.length ? upperLetters.length / normalizedLetters.length : 0;

    if (companySuffix.test(line)) score += 230;
    if (businessWords.test(line)) score += 170;
    if (idx < 12) score += Math.max(0, 110 - idx * 7);
    else if (idx < 25) score += 30;
    if (upperRatio > .72 && normalizedLetters.length >= 4) score += 45;
    if (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,&'()-]{2,55}$/.test(line)) score += 20;

    const next1 = lines[idx + 1] || '';
    const next2 = lines[idx + 2] || '';
    if (/\bRNC\b|\bRUC\b|\bTAX\s*ID\b/i.test(next1)) score += 150;
    if (/\bRNC\b|\bRUC\b|\bTAX\s*ID\b/i.test(next2)) score += 90;

    if (addressLike.test(line)) score -= 145;
    if (/\b(total|importe|monto|fecha|factura|recibo|comprobante|referencia|transacci[oó]n|consumo|kwh|vencimiento)\b/i.test(line)) score -= 160;
    if (/\d{5,}/.test(line)) score -= 100;
    if (line.length < 3 || line.length > 90) score -= 60;

    const value = line.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, '').trim();
    if (score > 0 && value) candidates.push({value,score});
  });

  if (!candidates.length) return '';
  candidates.sort((a,b)=>b.score-a.score || a.value.length-b.value.length);
  const best = candidates[0];
  if (best.score < 70) return '';
  return String(best.value).slice(0,80);
}

function sugerirCategoriaOcr_(text) {
  const s = String(text || '').toLowerCase();
  const cats = obtenerCategorias().filter(c=>c.tipo==='GASTO');

  if (/(farmacia|pharmacy|medicamento|medicar|botica|cl[ií]nica|hospital|laboratorio)/.test(s)) {
    const salud = cats.find(x=>/^(salud|medicina|farmacia|m[eé]dicos?)$/i.test(String(x.nombre).trim()));
    if (salud) return salud.id;
  }

  const rules = [
    ['Alimentación',/(restaurant|restaurante|comida|supermerc|market|colmado|cafe|caf[eé]|pizza|burger|pollo|panader)/],
    ['Transporte',/(uber|didi|taxi|gasolina|combustible|estacion de servicio|peaje|transporte|parking|parqueo)/],
    ['Estudios',/(universidad|instituto|colegio|libro|librer|curso|matricula|educa)/],
    ['Entretenimiento',/(netflix|spotify|cine|cinema|steam|playstation|xbox|juego|disney)/],
    ['Servicios',/(electricidad|el[eé]ctrica|distribuidora|edenorte|edesur|edeeste|internet|claro|altice|agua|telefono|telef[oó]n|servicio|telecom)/],
    ['Compras',/(tienda|store|shop|amazon|ropa|calzado|electrodom|ferreter|farmacia|pharmacy|medicamento)/]
  ];
  for (const [name,re] of rules) {
    if (!re.test(s)) continue;
    const c = cats.find(x=>String(x.nombre).toLowerCase() === name.toLowerCase());
    if (c) return c.id;
  }
  const otros = cats.find(x=>String(x.nombre).toLowerCase()==='otros');
  return otros ? otros.id : (cats[0]?.id || '');
}
function analizarTextoOcr_(text) {
  return {
    comercio: extraerComercioOcr_(text),
    monto: extraerMontoOcr_(text),
    fecha: extraerFechaOcr_(text),
    categoriaId: sugerirCategoriaOcr_(text)
  };
}

function decodificarParametroQrFase52_(value) {
  try { return decodeURIComponent(String(value || '').replace(/\+/g,'%20')); }
  catch (_) { return String(value || ''); }
}

function datosQrFacturaFase52_(raw) {
  const s = String(raw || '').trim();
  if (!s || !/^https?:\/\//i.test(s) || !/dgii\.gov\.do/i.test(s)) return null;
  const qIndex = s.indexOf('?');
  if (qIndex < 0) return null;
  const params = {};
  s.slice(qIndex + 1).split('&').forEach(pair => {
    const eq = pair.indexOf('=');
    const k = (eq >= 0 ? pair.slice(0,eq) : pair).trim().toLowerCase();
    const v = eq >= 0 ? pair.slice(eq+1) : '';
    if (k) params[k] = decodificarParametroQrFase52_(v);
  });
  const montoNum = normalizarNumeroOcr_(params.montototal || params.monto || '');
  const fechaRaw = String(params.fechaemision || '').trim();
  let fecha = '';
  let m = fechaRaw.match(/^([0-2]?\d|3[01])[-\/.]([0]?\d|1[0-2])[-\/.](20\d{2})$/);
  if (m) {
    try { fecha = fecha_(`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`); } catch (_) {}
  }
  if (!fecha) {
    m = fechaRaw.match(/^([0-2]\d)([01]\d)(20\d{2})$/);
    if (m) {
      try { fecha = fecha_(`${m[3]}-${m[2]}-${m[1]}`); } catch (_) {}
    }
  }
  return {
    monto:montoNum !== null && montoNum > 0 ? montoNum.toFixed(2) : '',
    fecha,
    rncEmisor:String(params.rncemisor || ''),
    rncComprador:String(params.rnccomprador || ''),
    encf:String(params.encf || ''),
    codigoSeguridad:String(params.codigoseguridad || '')
  };
}

function mejorarComprobanteFase52(comprobanteId, payloadJson) {
  return bloqueo_(() => {
    const rec = buscar_('Comprobantes',String(comprobanteId||''));
    if (!rec || !activo_(rec.activo)) throw new Error('El comprobante no existe.');

    const datos = parsePayloadFase2_(payloadJson || '{}');
    const fallback = String(datos.textoOCR || '').trim().slice(0,35000);
    const qrValues = Array.isArray(datos.qrValues) ? datos.qrValues : [];
    const textoPrevio = String(rec.textoOCR || '').trim();
    const combinado = [textoPrevio, fallback ? `LECTURA ALTERNATIVA\n${fallback}` : ''].filter(Boolean).join('\n\n').slice(0,45000);

    const detectado = analizarTextoOcr_(combinado);
    let qr = null;
    for (const raw of qrValues) {
      qr = datosQrFacturaFase52_(raw);
      if (qr && (qr.monto || qr.fecha)) break;
    }

    const actualizado = {
      ...rec,
      textoOCR:combinado,
      comercioDetectado:detectado.comercio || rec.comercioDetectado || '',
      montoDetectado:(qr && qr.monto) || detectado.monto || rec.montoDetectado || '',
      fechaDetectada:(qr && qr.fecha) || detectado.fecha || rec.fechaDetectada || '',
      categoriaSugeridaId:detectado.categoriaId || rec.categoriaSugeridaId || '',
      fechaActualizacion:instante_()
    };
    actualizar_('Comprobantes',rec._row,actualizado);

    let ocrWarning = '';
    if (qr && qr.monto) {
      ocrWarning = 'Datos principales confirmados desde el QR electrónico de la factura.';
    } else if (fallback) {
      ocrWarning = 'Se utilizó la lectura alternativa del navegador porque el OCR principal no devolvió suficiente texto.';
    } else if (!String(actualizado.textoOCR || '').trim()) {
      ocrWarning = 'No se obtuvo texto automático. La foto no necesariamente está mal; el servicio de OCR no devolvió contenido.';
    }
    return {...publicoComprobante_(actualizado),ocrWarning,qrDetectado:Boolean(qr),qrDatos:qr || null};
  });
}

function archivosComprobante_(x) {
  const raw = String(x && x.archivoId || '').trim();
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(a=>a && a.id).map((a,i)=>({
        id:String(a.id||''),
        nombre:String(a.nombre||`Página ${i+1}`),
        mimeType:String(a.mimeType||''),
        urlDrive:String(a.urlDrive||''),
        pagina:Number(a.pagina)||i+1,
        tieneTexto:Boolean(a.tieneTexto)
      }));
    } catch (_) {}
  }
  if (!raw) return [];
  return [{
    id:raw,
    nombre:String(x.nombreArchivo||'Comprobante'),
    mimeType:String(x.mimeType||''),
    urlDrive:String(x.urlDrive||''),
    pagina:1,
    tieneTexto:Boolean(String(x.textoOCR||'').trim())
  }];
}

function guardarArchivosComprobante_(arr) {
  return JSON.stringify((arr || []).map((a,i)=>({
    id:String(a.id||''),
    nombre:String(a.nombre||`Página ${i+1}`),
    mimeType:String(a.mimeType||''),
    urlDrive:String(a.urlDrive||''),
    pagina:Number(a.pagina)||i+1,
    tieneTexto:Boolean(a.tieneTexto)
  })));
}

function publicoComprobante_(x) {
  const archivos = archivosComprobante_(x);
  return {
    id:x.id,
    movimientoId:x.movimientoId || '',
    archivoId:archivos[0]?.id || '',
    nombreArchivo:x.nombreArchivo || archivos[0]?.nombre || '',
    mimeType:x.mimeType || archivos[0]?.mimeType || '',
    urlDrive:x.urlDrive || archivos[0]?.urlDrive || '',
    archivos,
    cantidadArchivos:archivos.length,
    comercioDetectado:x.comercioDetectado || '',
    montoDetectado:Number(x.montoDetectado) || 0,
    fechaDetectada:fechaClave_(x.fechaDetectada) || x.fechaDetectada || '',
    categoriaSugeridaId:x.categoriaSugeridaId || '',
    fechaCreacion:x.fechaCreacion || '',
    fechaActualizacion:x.fechaActualizacion || '',
    activo:activo_(x.activo),
    tieneOCR:Boolean(String(x.textoOCR || '').trim()),
    textoOCRPreview:String(x.textoOCR || '').slice(0,3000)
  };
}

function obtenerComprobantes(filtros) {
  filtros = filtros || {};
  let rows = leerTabla_('Comprobantes').filter(x=>activo_(x.activo));
  if (filtros.movimientoId) rows = rows.filter(x=>String(x.movimientoId)===String(filtros.movimientoId));
  return rows.sort((a,b)=>String(b.fechaCreacion||'').localeCompare(String(a.fechaCreacion||''))).map(publicoComprobante_);
}

function iniciarLoteComprobanteFase51(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson || '{}');
  const cantidad = Math.max(1, Math.min(10, Number(datos.cantidad) || 1));
  const now = instante_();
  const row = {
    id:nuevoId_('rec'),
    movimientoId:'',
    archivoId:'[]',
    nombreArchivo:cantidad > 1 ? `Factura · ${cantidad} páginas` : 'Comprobante',
    mimeType:cantidad > 1 ? 'application/x-starstream-batch' : '',
    urlDrive:'',
    textoOCR:'',
    comercioDetectado:'',
    montoDetectado:'',
    fechaDetectada:'',
    categoriaSugeridaId:'',
    fechaCreacion:now,
    fechaActualizacion:now,
    activo:'false'
  };
  agregar_('Comprobantes',row);
  return {id:row.id,cantidad};
}

function subirPaginaLoteComprobanteFase51(comprobanteId, payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  const rec = buscar_('Comprobantes',String(comprobanteId||''));
  if (!rec) throw new Error('No se encontró el lote del comprobante.');
  if (activo_(rec.activo)) throw new Error('Este comprobante ya fue finalizado.');

  const pagina = Math.max(1, Number(datos.pagina) || 1);
  const blob = dataUrlABlob_(String(datos.dataUrl || ''), String(datos.nombreArchivo || `pagina-${pagina}.jpg`));
  const folder = carpetaComprobantes_();
  let file = null;
  try {
    file = folder.createFile(blob);
    let text = '';
    let warning = '';
    try {
      text = textoOcrDrive_(blob);
      if (!String(text).trim()) warning = `No se detectó texto en la página ${pagina}.`;
    } catch (err) {
      console.error('STAR STREAM OCR página ' + pagina + ':', err);
      warning = `El OCR no pudo leer la página ${pagina}.`;
    }

    const archivos = archivosComprobante_(rec);
    archivos.push({
      id:file.getId(),
      nombre:file.getName(),
      mimeType:blob.getContentType(),
      urlDrive:file.getUrl(),
      pagina,
      tieneTexto:Boolean(String(text).trim())
    });
    archivos.sort((a,b)=>a.pagina-b.pagina);

    const parte = String(text || '').trim();
    const previo = String(rec.textoOCR || '').trim();
    const combined = [previo, parte ? `PÁGINA ${pagina}\n${parte}` : ''].filter(Boolean).join('\n\n').slice(0,45000);
    const primero = archivos[0] || {};
    actualizar_('Comprobantes',rec._row,{
      ...rec,
      archivoId:guardarArchivosComprobante_(archivos),
      nombreArchivo:archivos.length > 1 ? `Factura · ${archivos.length} páginas` : primero.nombre || file.getName(),
      mimeType:archivos.length > 1 ? 'application/x-starstream-batch' : primero.mimeType || blob.getContentType(),
      urlDrive:primero.urlDrive || file.getUrl(),
      textoOCR:combined,
      fechaActualizacion:instante_()
    });
    return {pagina,ocrOk:Boolean(parte),warning};
  } catch (err) {
    if (file) {
      try { file.setTrashed(true); } catch (_) {}
    }
    throw err;
  }
}

function finalizarLoteComprobanteFase51(comprobanteId) {
  return bloqueo_(() => {
    const rec = buscar_('Comprobantes',String(comprobanteId||''));
    if (!rec) throw new Error('No se encontró el lote del comprobante.');
    const archivos = archivosComprobante_(rec);
    if (!archivos.length) throw new Error('El lote no tiene fotos o PDF.');

    const text = String(rec.textoOCR || '').trim();
    const detected = analizarTextoOcr_(text);
    const leidas = archivos.filter(a=>a.tieneTexto).length;
    let ocrWarning = '';
    if (!text) {
      ocrWarning = 'No se pudo leer texto en ninguna página. Prueba con fotos más cercanas, nítidas y sin reflejos.';
    } else if (leidas < archivos.length) {
      ocrWarning = `OCR parcial: se leyó texto en ${leidas} de ${archivos.length} páginas. Revisa los datos detectados.`;
    } else if (!detected.monto) {
      ocrWarning = 'Se leyó el texto, pero no se identificó el total con suficiente claridad. Revisa la factura o toma una foto más cercana de la zona del TOTAL.';
    }

    const primero = archivos[0];
    const nombre = archivos.length > 1 ? `Factura · ${archivos.length} páginas` : primero.nombre;
    const actualizado = {
      ...rec,
      archivoId:guardarArchivosComprobante_(archivos),
      nombreArchivo:nombre,
      mimeType:archivos.length > 1 ? 'application/x-starstream-batch' : primero.mimeType,
      urlDrive:primero.urlDrive,
      comercioDetectado:detected.comercio || '',
      montoDetectado:detected.monto || '',
      fechaDetectada:detected.fecha || '',
      categoriaSugeridaId:detected.categoriaId || '',
      fechaActualizacion:instante_(),
      activo:'true'
    };
    actualizar_('Comprobantes',rec._row,actualizado);
    return {...publicoComprobante_(actualizado),ocrWarning};
  });
}

function cancelarLoteComprobanteFase51(comprobanteId) {
  const rec = buscar_('Comprobantes',String(comprobanteId||''));
  if (!rec) return {id:String(comprobanteId||'')};
  archivosComprobante_(rec).forEach(a=>{
    if (!a.id) return;
    try { DriveApp.getFileById(a.id).setTrashed(true); } catch (_) {}
  });
  actualizar_('Comprobantes',rec._row,{...rec,activo:'false',fechaActualizacion:instante_()});
  return {id:rec.id};
}

/** Compatibilidad con el flujo v0.5 de una sola imagen. */
function subirComprobanteFase5(payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  const lote = iniciarLoteComprobanteFase51(JSON.stringify({cantidad:1}));
  try {
    subirPaginaLoteComprobanteFase51(lote.id, JSON.stringify({
      dataUrl:String(datos.dataUrl || ''),
      nombreArchivo:String(datos.nombreArchivo || datos.name || 'comprobante.jpg'),
      pagina:1
    }));
    return finalizarLoteComprobanteFase51(lote.id);
  } catch (err) {
    try { cancelarLoteComprobanteFase51(lote.id); } catch (_) {}
    throw err;
  }
}

function vincularComprobanteFase5(comprobanteId, movimientoId) {
  return bloqueo_(() => {
    const rec = buscar_('Comprobantes',String(comprobanteId||''));
    if (!rec || !activo_(rec.activo)) throw new Error('El comprobante no existe.');
    const mov = buscar_('Movimientos',String(movimientoId||''));
    if (!mov || !activo_(mov.activo)) throw new Error('El movimiento no existe.');
    const existing = leerTabla_('Comprobantes').find(x=>activo_(x.activo) && String(x.movimientoId)===String(mov.id) && String(x.id)!==String(rec.id));
    if (existing) throw new Error('Ese movimiento ya tiene un comprobante adjunto.');
    actualizar_('Comprobantes',rec._row,{...rec,movimientoId:mov.id,fechaActualizacion:instante_()});
    return {id:rec.id,movimientoId:mov.id};
  });
}

function crearMovimientoDesdeComprobanteFase5(comprobanteId, payloadJson) {
  const datos = parsePayloadFase2_(payloadJson);
  const rec = buscar_('Comprobantes',String(comprobanteId||''));
  if (!rec || !activo_(rec.activo)) throw new Error('El comprobante no existe.');
  if (String(rec.movimientoId || '').trim()) throw new Error('El comprobante ya está vinculado a un movimiento.');
  const mov = crearMovimiento(normalizarMovimientoFase2_(datos));
  vincularComprobanteFase5(rec.id,mov.id);
  return {id:mov.id,comprobanteId:rec.id};
}

function eliminarComprobanteFase5(id) {
  return bloqueo_(() => {
    const rec = buscar_('Comprobantes',String(id||''));
    if (!rec || !activo_(rec.activo)) throw new Error('El comprobante no existe.');
    archivosComprobante_(rec).forEach(a=>{
      if (!a.id) return;
      try { DriveApp.getFileById(a.id).setTrashed(true); } catch (_) {}
    });
    actualizar_('Comprobantes',rec._row,{...rec,activo:'false',fechaActualizacion:instante_()});
    return {id:rec.id};
  });
}

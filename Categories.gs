function validarCategoria_(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de categoría inválidos.');
  const nombre = texto_(datos.nombre,'Nombre',60);
  const tipo = String(datos.tipo || '').trim().toUpperCase();
  if (!['INGRESO','GASTO'].includes(tipo)) throw new Error('Tipo de categoría inválido.');
  const icono = String(datos.icono == null ? '' : datos.icono).trim();
  if (icono.length > 12) throw new Error('El icono debe ser corto.');
  return {nombre,tipo,icono:icono || '•'};
}

function obtenerCategoriasTodas() {
  return leerTabla_('Categorias')
    .map(c => ({id:c.id,nombre:c.nombre,tipo:c.tipo,icono:c.icono || '•',activa:activo_(c.activa)}))
    .sort((a,b) => {
      if (a.activa !== b.activa) return a.activa ? -1 : 1;
      if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
      return a.nombre.localeCompare(b.nombre,'es');
    });
}

function asegurarCategoriaUnica_(nombre, tipo, excluirId) {
  const duplicada = leerTabla_('Categorias').find(c =>
    c.id !== excluirId &&
    activo_(c.activa) &&
    String(c.tipo) === String(tipo) &&
    String(c.nombre).trim().toLowerCase() === String(nombre).trim().toLowerCase()
  );
  if (duplicada) throw new Error('Ya existe una categoría activa con ese nombre y tipo.');
}

function crearCategoria(datos) {
  return bloqueo_(() => {
    const v = validarCategoria_(datos);
    asegurarCategoriaUnica_(v.nombre,v.tipo,'');
    const c = {id:nuevoId_('cat'),...v,activa:'true'};
    agregar_('Categorias',c);
    return {id:c.id};
  });
}

function editarCategoria(id, datos) {
  return bloqueo_(() => {
    const actual = buscar_('Categorias',id);
    if (!actual) throw new Error('La categoría no existe.');
    const v = validarCategoria_(datos);
    const usada = leerTabla_('Movimientos').some(m => activo_(m.activo) && m.categoriaId === id);
    if (usada && String(actual.tipo) !== v.tipo) {
      throw new Error('No puedes cambiar el tipo de una categoría que ya tiene movimientos.');
    }
    asegurarCategoriaUnica_(v.nombre,v.tipo,id);
    actualizar_('Categorias',actual._row,{...actual,...v});
    return {id};
  });
}

function desactivarCategoria(id) {
  return bloqueo_(() => {
    const actual = buscar_('Categorias',id);
    if (!actual || !activo_(actual.activa)) throw new Error('La categoría no existe o ya está inactiva.');
    actualizar_('Categorias',actual._row,{...actual,activa:'false'});
    return {id};
  });
}

function reactivarCategoria(id) {
  return bloqueo_(() => {
    const actual = buscar_('Categorias',id);
    if (!actual) throw new Error('La categoría no existe.');
    asegurarCategoriaUnica_(actual.nombre,actual.tipo,id);
    actualizar_('Categorias',actual._row,{...actual,activa:'true'});
    return {id};
  });
}

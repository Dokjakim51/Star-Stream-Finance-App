# Seguridad y privacidad de la versión pública

Esta versión elimina la pantalla de contraseña local de la interfaz (formulario, botón, estilos, sesión y contraseña embebida). **No agrega otro sistema de autenticación**.

## Código público frente a aplicación desplegada

- **GitHub público:** contiene solo código y documentación.
- **Web App personal:** debe permanecer restringida al propietario si almacena movimientos financieros reales.
- **Demostración para terceros:** utilizar otra cuenta/proyecto y una base separada con datos ficticios. No conectar nunca al `StarStream_DB` personal.

## No subir

- Archivos `.clasp.json` y credenciales de Apps Script.
- Identificadores de hojas o carpetas personales.
- Fotografías de perfil privadas y comprobantes.
- Copias de seguridad JSON, extractos bancarios, movimientos CSV o exportaciones.
- Información personal de terceros.

`.gitignore` ayuda, pero no sustituye revisar los cambios antes de publicarlos.

## Atención al despliegue

Con `Ejecutar como: Yo` el script puede realizar operaciones con permisos del propietario. Si el acceso está abierto a otras personas, **eliminar la pantalla de bloqueo puede permitir interacciones no autorizadas** con la hoja. Publicar el repositorio no exige hacer pública la URL ejecutable.

Para mostrar una demo pública con usuarios anónimos se necesitaría una arquitectura aislada y diseñada para acceso público; **este código no está preparado para exponer datos reales**.

Las funciones `Restablecer datos financieros` y de importación/exportación afectan a la base de datos conectada. Se mantienen del código original; úsalas solo con copias de prueba y verifica el backup antes de restablecer.

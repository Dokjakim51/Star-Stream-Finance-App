# Lista de pruebas para una instalación nueva

Estas acciones deben comprobarse **manual y localmente** en un proyecto nuevo de Google Apps Script y con datos ficticios. Las comprobaciones estáticas del ZIP no demuestran que la Web App esté completamente operativa.

- [ ] Ejecutar `instalarStarStream()` y comprobar la creación de la hoja `StarStream_DB`.
- [ ] Ejecutar `migrarStarStreamFase8()` sin errores.
- [ ] Abrir Web App directamente, sin pantalla de bloqueo ni petición de contraseña local.
- [ ] Crear cuenta DOP y cuenta USD.
- [ ] Registrar ingreso y gasto; comprobar saldos.
- [ ] Transferir entre cuentas y verificar conversión con tasa manual.
- [ ] Crear meta, aportar a ella y comprobar progreso.
- [ ] Registrar presupuesto, recurrente y notificación.
- [ ] Comprobar gráficas y filtros por periodo.
- [ ] Probar subir comprobantes y OCR con un recibo ficticio o que puedas compartir.
- [ ] Exportar CSV y crear copia de seguridad.
- [ ] Revisar escritorio y teléfono para que los formularios no se desborden.
- [ ] **Solo en una base de prueba:** comprobar restablecimiento después de confirmar el backup.
- [ ] Revisar permisos de la implementación y que no haya acceso público a datos personales.

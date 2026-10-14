# Star Stream · Gestor de finanzas personales

**Dashboard de finanzas personales con Google Apps Script, Google Sheets y Google Drive.** Incluye diseño responsive de estilo galáctico, constelaciones SVG/CSS, registros de ingresos y gastos, metas, estadísticas, cuentas y planificación.

## Funcionalidades

- **Cuentas:** registra cuentas en DOP y USD, consulta saldos e historiales.
- **Movimientos:** ingresos, gastos, transferencias y categorías personalizables.
- **Metas:** objetivos, aportes y progreso de ahorro.
- **Planificación:** gastos e ingresos recurrentes, presupuestos y notificaciones.
- **Estadísticas:** gráficos, filtros por periodo, categorías y monedas.
- **Comprobantes:** carga y lectura OCR, asociados a movimientos (puede depender de permisos y librerías externas).
- **Herramientas de datos:** exportación/importación CSV, respaldos y restablecimiento con confirmación y copia previa.
- **Diseño:** interfaz oscura, constelaciones y tarjetas adaptadas a escritorio y móvil.

## Tecnologías

`Google Apps Script` · `JavaScript` · `HTML` · `CSS` · `Google Sheets` · `Google Drive` · `SVG`

No necesita un servidor propio. La aplicación se ejecuta como una **Web App de Google Apps Script** y utiliza la hoja `StarStream_DB` de **cada instalación** para guardar sus datos.

## Estructura

```text
Star_Stream_GitHub_Public/
├── Code.gs                     # Punto de entrada web y APIs del servidor
├── Database.gs                 # Inicialización, migración y acceso a Google Sheets
├── Accounts.gs, Transactions.gs, Transfers.gs
├── Goals.gs, Planning.gs, Analytics.gs, Dashboard.gs
├── Receipts.gs, Categories.gs, DataTools.gs, Utils.gs
├── index.html                  # Estructura de la interfaz
├── styles.html                 # CSS incluido mediante Apps Script
├── scripts.html                # JavaScript del navegador
├── appsscript.json             # Manifest de Apps Script
├── docs/
│   ├── INSTALACION.md
│   ├── SEGURIDAD.md
│   └── PRUEBAS.md
└── tests/
    └── verificar_publicacion.py
```

## Primeros pasos

1. Crea **un proyecto nuevo de Google Apps Script** desde [script.google.com](https://script.google.com/) en tu propia cuenta.
2. Copia los archivos `.gs` y `.html` de este repositorio con los **mismos nombres**. El contenido de `appsscript.json` es el manifiesto de la aplicación; consulta cómo configurarlo en la guía.
3. En el editor, selecciona y ejecuta `instalarStarStream()` una vez. Concede los permisos necesarios. Esta función crea una **nueva** hoja `StarStream_DB` en tu Drive y configura `STAR_STREAM_SHEET_ID` en las propiedades del script.
4. Ejecuta `migrarStarStreamFase8()` después de instalar. Verifica su resultado.
5. Desde **Implementar → Nueva implementación → Aplicación web**, establece **Ejecutar como: Yo** y acceso **Solo yo** para tus pruebas personales.
6. Abre la URL de la Web App. La interfaz comienza sin contraseña de pantalla. Crea tus propias cuentas y movimientos de prueba.

**Guía detallada:** [Instalación y despliegue](docs/INSTALACION.md) · [Seguridad](docs/SEGURIDAD.md) · [Checklist de pruebas](docs/PRUEBAS.md)

### Importante: no publiques el acceso a tus datos

El código fuente puede ser público en GitHub, **pero eso no significa que la Web App deba ser pública**. Eliminar el bloqueo local **no crea autenticación**. Si publicas una Web App ejecutada como propietario con acceso `Cualquiera`, otras personas podrían leer o modificar información accesible desde sus funciones.

Para el portafolio, publica **el repositorio de código**. Si más adelante deseas compartir una demostración en vivo con reclutadores, hazlo con una instalación independiente y datos completamente ficticios, con permisos revisados y sin acceso a tus finanzas reales.

## Validación

```bash
python tests/verificar_publicacion.py
```

La validación comprueba estructura, rutas del código, ausencia del bloqueo, llamadas directas al backend y sintaxis JavaScript si Node.js está instalado. **No sustituye las pruebas de ejecución en Google Apps Script**; la cámara/OCR, Drive y las operaciones financieras requieren probarse desde una Web App autorizada.

## Créditos y alcance

Proyecto de portafolio desarrollado por **Elian Girón Perdomo**. La interfaz pública fue adaptada desde la versión de uso personal para retirar la pantalla de bloqueo y permitir instalaciones independientes.

**Nota de licencia:** no se incluye licencia de software abierto. Consulta al autor antes de reutilizar o redistribuir el proyecto más allá de los derechos que permita la ley.

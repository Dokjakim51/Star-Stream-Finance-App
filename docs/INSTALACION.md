# Instalar Star Stream en Google Apps Script

Este repositorio es el **código fuente**, no una web que pueda funcionar con un doble clic en `index.html`. Usa plantillas de Google Apps Script (`<?!= include('styles'); ?>`) y llamadas `google.script.run` a funciones del servidor.

## Preparación

- Cuenta de Google y acceso a Google Sheets/Drive.
- Proyecto **nuevo** de Google Apps Script. No utilices tu instalación personal con datos financieros para enseñar la app a terceros.
- Permisos de Google Apps Script para usar Sheets y Drive. Algunas funciones de OCR emplean el servicio avanzado de Drive y bibliotecas de navegador cargadas desde CDN.

## Instalación mediante el editor

1. Abre https://script.google.com/ y crea un proyecto en blanco.
2. Borra o reemplaza el archivo `Code.gs` por el que contiene este repositorio.
3. Para cada archivo `.gs` restante, crea un archivo de **secuencia de comandos** con el mismo nombre base y pega su contenido.
4. Crea tres archivos **HTML** llamados exactamente `index`, `styles` y `scripts`. Pega en cada uno el contenido del `.html` correspondiente. No añadas `<script>` ni `<style>` adicionales: ya están presentes en los archivos.
5. Si vas a configurar el manifiesto, entra a **Configuración del proyecto → Mostrar el archivo de manifiesto `appsscript.json`**. Usa el manifiesto incluido y activa el **servicio avanzado Google Drive API v3** si tu proyecto lo requiere para OCR.
6. Guarda el proyecto. Elige la función `instalarStarStream` y pulsa **Ejecutar**. Acepta los permisos, verifica en Drive que se ha creado una hoja llamada `StarStream_DB`.
7. Ejecuta `migrarStarStreamFase8`. La migración comprueba las hojas y actualiza la versión almacenada. En una instalación nueva no debe eliminar datos.
8. Implementa como **Aplicación web**, ejecutada como **Yo** y acceso **Solo yo** para tus propias pruebas.
9. Abre la URL y crea registros ficticios para probar las funciones.

> Los nombres visibles en la interfaz pueden variar si Google actualiza el editor. No selecciones opciones que permitan el acceso público a una base de datos con información real.

## Si ya tienes Star Stream funcionando

No reemplaces tu instalación personal por este paquete público. Este archivo se entrega para **un repositorio y una instalación independiente**. Si deseas aplicar cambios a la instancia personal, crea primero un respaldo íntegro y despliega una versión de prueba.

## Publicar en GitHub más adelante

1. Crea un repositorio con nombre sugerido: `Star-Stream-Finance-App`.
2. Descomprime el ZIP y sube **los archivos del proyecto**, no los datos de Google Drive ni tu hoja de cálculo.
3. Verifica que `.clasp.json`, archivos privados, recibos y CSV de finanzas no estén en el commit.
4. Asegúrate de que GitHub muestre `README.md` en la portada del repositorio.
5. Opcionalmente, añade capturas de **cuentas ficticias**, tomadas desde una instalación de prueba.

## Notas

- El script almacena el ID de su propia hoja en **Script Properties**, no en este repositorio.
- El código requiere permisos de Drive para respaldos y archivos de comprobantes.
- `appsscript.json` define zona horaria `America/Santo_Domingo`, ejecución V8 y servicio avanzado de Drive.
- Si aparece un error de permisos, revisa las autorizaciones del proyecto en Google Apps Script. Si aparece un error de esquema, revisa que `instalarStarStream()` haya terminado correctamente.

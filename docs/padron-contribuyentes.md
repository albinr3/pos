# Padrón de contribuyentes dominicanos

El padrón se consulta en la base PostgreSQL compartida, no desde el archivo local ni desde el navegador. Es una fotografía del archivo importado; no valida el estado actual ante la DGII.

## Instalación y actualización

1. Aplicar las migraciones con `npx prisma migrate deploy` en la base de datos de destino.
2. Importar el archivo accesible desde el equipo que ejecuta el comando, usando la `DATABASE_URL` de esa base:

   `node scripts/import-taxpayer-registry.mjs "C:\Users\Albin Rodriguez\Documents\pos\RNC_Contribuyentes_Actualizado_14_Nov_2026.csv"`

3. Confirmar la cantidad mostrada. El archivo indicado contiene un RNC de ocho dígitos que se omite sin completarlo artificialmente. El importador informa las identificaciones omitidas. El reemplazo es transaccional: si falla, se conserva el padrón anterior. Volver a ejecutar el comando con un archivo actualizado reemplaza la fotografía completa.

El archivo original no se descarga al navegador ni se necesita en el servidor web después de importarlo. Aplicar migración e importación por separado en cada ambiente; desplegar el código por sí solo no carga el padrón.

## Contrato para web y futura app móvil

`GET /api/fiscal/taxpayer?identification=...` admite los mismos encabezados móviles `Authorization` (o `X-Clerk-Authorization`) y `X-SubUser-Token` que las demás rutas. También admite la sesión web. La cuenta debe tener activo el perfil `DO` / `DO_ECF` y el usuario debe poder gestionar clientes o tener permisos de ventas y preparación fiscal.

- Identificación: 9 u 11 dígitos, con espacios o guiones opcionales; se conserva como texto.
- Respuesta 200: `{ "identification": "00112345678", "legalName": "NOMBRE" }`. `legalName` es `null` si no hay coincidencia.
- Errores: 400 identificación inválida, 401 sin sesión, 403 sin permiso, 409 perfil fiscal no disponible, 503 padrón no importado. El cuerpo usa el formato fiscal habitual `{ "error": { "code", "message", "fields", "retryable", "correlationId" } }`.
- La consulta no crea ni modifica clientes. Si no hay conexión, el usuario puede introducir el nombre manualmente.

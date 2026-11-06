# Eliminación de cuentas

El dueño puede solicitar la baja desde Ajustes o Facturación. `/account/delete` está fuera del layout que restringe las cuentas impagas. La confirmación exige una sesión válida de Clerk, el subusuario dueño activo, su PIN actual y la palabra `ELIMINAR`. No hay período de recuperación.

## Puesta en servicio

1. Ejecutar `npm run prisma:migrate` para aplicar la migración `20261105120000_add_account_deletion` antes de iniciar la versión nueva. Generar el cliente con `npm run prisma:generate` si el despliegue no lo hace automáticamente.
2. Mantener `CLERK_SECRET_KEY` y `UPLOADTHING_TOKEN` en el servidor. Configurar **`LEMON_API_KEY`** si existen suscripciones de Lemon Squeezy: los IDs de tienda/variante y el secreto del webhook no sirven para cancelar suscripciones.
3. Configurar `CRON_SECRET`. Sin ese secreto, el nuevo cron rechaza todas las llamadas. `vercel.json` programa `/api/cron/account-deletions` cada hora, al minuto 15. En otro hosting, programar un GET con `Authorization: Bearer <CRON_SECRET>`.
4. Mantener configurados los webhooks firmados de Clerk y Lemon. Se ignoran los eventos atrasados de identidades eliminadas; un checkout anterior que termine después de la baja se cancela sin recrear el negocio.

`CLERK_JWT_KEY` permite verificar tokens móviles sin consultar JWKS. Opcionalmente, `CLERK_AUTHORIZED_PARTIES` acepta una lista de orígenes separados por comas. Las claves privadas nunca se envían al cliente.

## Contrato para móvil

`DELETE /api/account`, JSON:

```json
{ "pin": "4321", "confirmation": "ELIMINAR" }
```

Enviar el token de sesión de Clerk en `X-Clerk-Authorization: Bearer <token>` (también se admite `Authorization`) y el JWT del empleado en `X-SubUser-Token`. La firma y caducidad de Clerk se verifican; no se utiliza el decodificador legacy. La cuenta se obtiene de esas credenciales: no se admiten `accountId`, `userId` ni otros campos en el cuerpo.

- `200`: `{ "success": true, "status": "completed" }`.
- `202`: `{ "success": true, "status": "processing" }`; la baja ya es irreversible y la sesión debe cerrarse aunque haya tareas externas pendientes.
- `400`: `INVALID_CONFIRMATION` o `INVALID_PIN`.
- `401`: `AUTH_REQUIRED`.
- `403`: `OWNER_REQUIRED` o `INVALID_ORIGIN`.
- `429`: `TOO_MANY_ATTEMPTS`, con `Retry-After`. El PIN tiene cinco intentos por cuenta durante quince minutos, contados en PostgreSQL. Hay además un límite por IP.
- `503`: `DELETION_UNAVAILABLE`; no se confirmó la solicitud al cliente.

Al recibir `200` o `202`, la app móvil debe eliminar sus credenciales, cachés y operaciones offline. La implementación de esa pantalla móvil queda fuera de esta entrega. Las peticiones con los tokens anteriores no recuperan acceso al negocio.

## Progreso y fallos

`AccountDeletion` es una tarea durable sin FK a `Account`. Las etapas son `CANCEL_SUBSCRIPTION → PURGE_DATA → DELETE_IDENTITY → DELETE_FILES → COMPLETED`. Una concesión de tres minutos excluye trabajadores concurrentes y permite retomar un proceso interrumpido. El primer intento se espera durante la petición; no depende de promesas de fondo después de responder.

La cancelación de Lemon debe confirmarse antes de borrar los datos locales. El borrado local y su cambio de etapa se confirman juntos en una transacción, con el mismo candado del negocio que usan caja y compras. Clerk y UploadThing se reintentan por separado. Una respuesta perdida de un proveedor no exige recuperar el negocio: eliminar un recurso ya ausente es idempotente. Los errores se guardan como códigos controlados, sin respuestas de proveedores, PIN ni tokens.

El cron toma hasta diez tareas vencidas por ejecución y deja de comenzar otras después de cuarenta segundos. El máximo de ejecución configurado es 120 segundos. Si hay muchas tareas o archivos, se completan en ejecuciones posteriores. Los fallos mantienen `nextAttemptAt`, `attempts`, `stage` y `lastError` consultables por el operador:

```sql
SELECT stage, count(*) AS tareas, max(attempts) AS intentos
FROM "AccountDeletion"
WHERE stage <> 'COMPLETED'
GROUP BY stage;
```

Tras completar la baja se conservan el ID antiguo del negocio, la huella SHA-256 del identificador Clerk, fechas y progreso mínimo para impedir recreaciones y reconocer webhooks atrasados. Se eliminan el identificador Clerk original, el ID de suscripción y las referencias a archivos pendientes. La tabla tiene RLS sin políticas públicas.

## Alcance de los datos

Se eliminan los datos activos del negocio, usuarios, operaciones financieras, registros auxiliares identificables y archivos de UploadThing referenciados y exclusivos. Se comprueban también referencias de otros negocios, tutoriales y logos bancarios globales para preservar archivos compartidos. Los archivos antiguos que no tengan ninguna referencia local no pueden atribuirse automáticamente al negocio.

La web limpia las bases IndexedDB actual y heredada, pendientes, almacenamiento de la aplicación y cachés del service worker. Notifica a las otras pestañas abiertas y bloquea las escrituras offline que podrían repoblar los datos durante la salida. Esto no permite borrar datos de dispositivos desconectados; su acceso al servidor queda invalidado.

Los backups SQL existentes son globales y contienen otros negocios. No se eliminan ni reescriben en este flujo. Tampoco se eliminan copias descargadas, registros históricos del proveedor de pagos ni se emiten reembolsos.

El borrado del superadministrador comparte el servicio de purga y su orden corregido de claves foráneas, conservando su autorización y su comportamiento anterior respecto de los proveedores externos.

## Pruebas locales

Definir explícitamente `TEST_DATABASE_URL` con una base nueva `pos_account_deletion_test` o `pos_account_deletion_test_<sufijo numérico>` en `localhost`/`127.0.0.1`. El usuario local necesita permiso para crear esa base. La preparación rechaza una base ya existente y nunca usa `DATABASE_URL` como alternativa.

```text
npm run test:account-deletion:setup
npm run test:account-deletion
npm run test:account-deletion:browser
```

La preparación genera el esquema anterior en una base vacía, inserta un negocio ficticio y aplica el SQL real de la nueva migración. La suite usa PostgreSQL real, firmas RSA y webhooks de prueba; todas las llamadas a proveedores son simuladas. La suite de navegador usa Chrome/Edge con un perfil temporal, componentes React reales e IndexedDB real. Ninguna prueba elimina cuentas de proveedores ni modifica la base habitual.

En este equipo Windows, la compilación paralela de Next terminó con una caída nativa (`3221225477`). La compilación de producción completa, incluidos TypeScript y generación de páginas, pasó con Webpack y un hilo de SWC, sin cambiar la configuración del proyecto:

```powershell
$env:RAYON_NUM_THREADS = '1'
npm run build -- --webpack
```

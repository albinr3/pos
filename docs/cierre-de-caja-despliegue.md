# Cierre de caja: uso, verificación y despliegue

## Estado y alcance

La función se activa por negocio desde **Cuadre diario**. La migración no activa ningún negocio ni crea turnos históricos. Esta versión usa una caja y un dispositivo web por turno; las aplicaciones móviles deben incorporar el nuevo contrato antes de operar negocios con turnos activos.

## Uso

1. El dueño revisa los saldos propuestos, selecciona la caja, cuenta el efectivo y explica cualquier diferencia anterior al control. Todos los dispositivos anteriores deben sincronizar antes de activar.
2. Al entrar a Ventas o Cuentas por cobrar, cada empleado sin turno recibe una ventana para confirmar el efectivo que recibe y abrir su turno desde ese dispositivo. También puede abrirlo desde Cuadre diario. Cerrar el aviso mantiene los formularios bloqueados; abrir el turno habilita la pantalla sin registrar automáticamente facturas ni cobros.
3. Las ventas y los abonos se guardan primero en una cola persistente del dispositivo, incluso con conexión. El responsable puede seguir operando sin Internet dentro del turno abierto.
   Las compras, compras por escaneo, gastos, devoluciones y traspasos se inician con conexión y también conservan su identificador antes de enviarse. Si se pierde la respuesta, el reintento no duplica documentos, inventario ni dinero.
4. Mientras trabajas, **Cobros del turno** muestra el total cobrado y los importes de efectivo, tarjeta y transferencia; Otros aparece si tiene importe. Para entregar, pulsa **Cerrar mi turno**. La pantalla guía los pasos: guardar pendientes, revisar cobros y contar efectivo, y confirmar la entrega. El resumen permanece visible; el campo para contar aparece al iniciar el cierre. No se muestra un faltante por el cero inicial: hay que introducir el conteo, incluso si la caja está vacía. Si el monto difiere del esperado, se explica cuánto falta o sobra y se exige un motivo.
5. El siguiente empleado abre con su propio conteo. La diferencia de recepción permanece separada del resultado de sus operaciones.

Un turno puede atravesar medianoche. Si sigue abierto en un día posterior, la aplicación muestra un aviso con la fecha de apertura; no lo cierra automáticamente. El cambio de día se calcula con la zona del negocio (UTC-4). Su responsable y dispositivo se verifican en el servidor. Los pendientes se conservan si expira la sesión o cambia el empleado; deben sincronizarse con la identidad original.

## Tesorería y correcciones

- Abrir un turno no suma ingresos. El efectivo esperado parte del conteo recibido más las entradas y menos las salidas.
- Los cobros por método incluyen ventas y abonos, con los signos de sus anulaciones y ajustes. Los pagos divididos aportan cada parte a su método. El fondo inicial, aportes, retiros, traspasos, compras, gastos y devoluciones no forman parte de este total; se consultan en los movimientos. El bloque **Efectivo para entregar** conserva el cálculo del dinero físico.
- El detalle del cierre y el ticket de 80 mm muestran el mismo resumen desde la instantánea guardada, sin modificar cierres anteriores. Si un contexto antiguo carece del resumen se solicita actualizar; si una instantánea no identifica el origen de sus movimientos se informa que el resumen no está disponible, sin inventar importes.
- Al activar se captura una base de saldos por cuenta. Desde ese corte los movimientos nuevos alimentan tesorería; los documentos originales no se suman otra vez.
- Si el período consultado alcanza la activación, tesorería muestra el registro nuevo y su saldo inicial, indicando la fecha de inicio. Los períodos completos anteriores conservan la vista histórica. No se mezclan documentos con fechas editables y asientos nuevos, evitando duplicar ventas retroactivas.
- Los faltantes y sobrantes se identifican como diferencias de recepción o de cierre, sin convertirlos automáticamente en ventas o gastos operativos.
- Los traspasos afectan ambas cuentas una sola vez. El dinero retirado antes de cerrar ya no forma parte del efectivo a entregar.
- Las tarjetas y transferencias se desglosan por cuenta; no se cuentan como efectivo físico ni se concilian automáticamente con el banco.
- Los documentos incluidos en cierres no admiten edición económica o borrado. Desde el comprobante se puede tramitar un reverso con el permiso correspondiente, motivo y confirmación de si hubo movimiento real de dinero. El cierre anterior permanece intacto.
- Los gastos del registro nuevo se anulan, conservando su evidencia. Una compra por escaneo o API solo afecta tesorería cuando se registra su pago.

## Permisos

| Permiso | Alcance |
|---|---|
| `canOperateCashShifts` | Abrir y cerrar el turno propio |
| `canViewAllCashShifts` | Consultar los cierres de todos los empleados |
| `canManageCashShifts` | Activar o desactivar el control y gestionar incidencias; permiso crítico |
| `canRecordCashMovements` | Registrar aportes y retiros del propietario desde el turno propio |
| `canCreateTreasuryTransfers` | Traspasar dinero entre cuentas, respetando la responsabilidad de la caja |

La migración conserva el acceso anterior: operadores de ventas/CxC pueden operar su turno; usuarios con acceso al cuadre pueden consultar los cierres. La gestión y los movimientos del propietario se conceden inicialmente al dueño. El rol `ADMIN` no constituye un bypass.

## Verificación local

No ejecutar pruebas contra la base del negocio. Las suites de integración rechazan URLs que no sean locales o cuyo nombre no contenga `cash_test`; nunca usan `DATABASE_URL` como alternativa.

Con PostgreSQL local y una base **vacía**, definir `TEST_DATABASE_URL` y ejecutar:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55438/cash_test?schema=public'
node scripts/setup-cash-test-db.mjs
node --test --experimental-test-isolation=none scripts/cash-shifts.integration.test.mjs scripts/cache-sync-regression.test.mjs scripts/freight-report-regression.test.mjs
node --test --experimental-test-isolation=none scripts/shift-collections.test.mjs
node scripts/cash-offline.browser-test.mjs
node scripts/cash-shift-gate.browser-test.mjs
npx tsc --noEmit --incremental false
npx prisma validate
```

El preparador crea el esquema anterior, inserta datos ficticios y aplica el SQL real. Rechaza bases existentes con tablas. La prueba de navegador usa Chrome o Edge sin interfaz, con perfil temporal independiente. Se puede indicar el ejecutable mediante `CASH_TEST_BROWSER`.

Los artefactos de prueba permanecen en `tmp/cash-*`, fuera del control de versiones.

### Resultado de la implementación: 31 de octubre de 2026

- 37 pruebas de integración aprobadas con PostgreSQL 18 local: migración del esquema anterior, concurrencia, permisos, saldos, cierres, correcciones, cierre excepcional y reintentos de las acciones reales.
- 28 pruebas existentes de sincronización e informes aprobadas.
- 15 casos aprobados en Chrome con IndexedDB y Web Locks reales, incluyendo pérdida de respuesta, cambio de empleado, respuestas tardías entre pestañas y recuperación de secuencia al reanudar sin estado local.
- 33 casos adicionales de interfaz con React y Radix reales en Chrome: apertura desde la ventana, bloqueo por permisos o dispositivo, desconexión, recuperación de respuestas perdidas, conservación de datos y cierre guiado. Incluyen aviso al cambiar el día sin recargar, actualización del turno, cierre excepcional, un fallo al enviar pendientes, conteo explícito de cero, diferencias justificadas, reanudación y comprobante.
- TypeScript, ESLint de los módulos nuevos, validación de Prisma y compilación de producción aprobados. La compilación utilizó una copia aislada del proyecto.

Estas verificaciones no aplicaron la migración ni activaron turnos en la base del negocio. La prueba piloto con usuarios y dispositivos reales sigue pendiente.

La última revisión reprodujo y corrigió el bloqueo de reversos de traspasos, el uso del permiso de creación en lugar del permiso de reverso, las respuestas tardías que borraban o restauraban pendientes y la secuencia inválida al reanudar sin estado local. Los casos específicos quedan cubiertos por las suites anteriores.

## Despliegue

1. Verificar respaldo y aplicar primero la migración aditiva `20261031120000_add_cash_shifts` con el procedimiento habitual del proyecto. Regenerar Prisma y desplegar el código después. La versión nueva requiere las tablas y columnas de la migración, incluso con turnos desactivados.
2. Mantener todos los negocios desactivados inicialmente y validar ventas, abonos, compras, gastos, devoluciones, informes y permisos con el flujo anterior.
3. En pruebas y después en un negocio piloto, sincronizar dispositivos anteriores, revisar los saldos y activar. Las operaciones futuras detectadas deben revisarse antes de activar; las operaciones antiguas sin cuenta se muestran como advertencia y no reciben asignaciones inventadas.
4. Comparar saldos de tesorería, movimientos del turno y conteos. Probar impresión, reconexión, relevo y permisos del cajero real antes de ampliar la activación.

Los endpoints nuevos son `GET/POST /api/cash-shifts` y `POST /api/cash-shifts/operations`. El segundo acepta `kind`, `payload` y `cashOperation` (`accountId`, `userId`, `cashShiftId`, `clientOperationId`, `clientSequence`). El servidor verifica la sesión; esos identificadores no sustituyen la autenticación.

`kind` admite `sale`, `payment`, `batchPayment`, `purchase`, `ocrPurchase`, `expense`, `return` y `transfer`. Las operaciones sin efectivo realizadas fuera de un turno usan `cashShiftId: null` y `clientSequence: null`, conservando la idempotencia por negocio e identificador. El efectivo siempre requiere el turno y dispositivo de su responsable. Un reintento ya confirmado conserva su respuesta incluso después de desactivar turnos.

Una respuesta perdida se reintenta con el mismo identificador y contenido. Si un pendiente es inválido, permanece visible y puede anularse con motivo: el servidor confirma su secuencia y conserva una evidencia, permitiendo continuar sin borrar silenciosamente la venta.

## Incidencias y reversión

Un cierre normal requiere todas las secuencias confirmadas. Solo el dueño puede cerrar excepcionalmente por ausencia o pérdida del dispositivo, con conteo y motivo explícitos. Los pendientes posteriores de ese turno se rechazan para revisión y no se reasignan al siguiente empleado.

Para hacerlo, el dueño entra a **Cuadre diario** con su usuario y despliega **Opciones del dueño** mientras esté abierto el turno de otro responsable o en otro dispositivo. Cuenta el efectivo, introduce el monto y explica por qué el responsable no puede cerrar y qué ocurre con sus pendientes; después confirma el cierre excepcional. Si el dueño es también el responsable y está en el dispositivo del turno, utiliza el cierre normal.

Antes de un cierre excepcional conviene sincronizar los pendientes del dispositivo original si está disponible: el efectivo esperado solo incluye operaciones confirmadas. Las operaciones que nunca llegaron al servidor permanecen para revisión y no pasan al turno siguiente; una respuesta perdida de una operación ya confirmada puede recuperarse sin volver a registrarla.

Ante una incidencia, detener nuevas activaciones. Desactivar turnos requiere que no haya un turno abierto o en preparación; se conservan el registro y las protecciones de los cierres existentes. No eliminar las tablas ni volver a una versión que ignore el corte financiero. La baja administrativa completa de un negocio conserva su procedimiento autorizado y elimina también sus datos de caja.

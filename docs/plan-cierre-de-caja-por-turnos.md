# Cierre de caja por turnos, con compatibilidad para los negocios actuales

Fecha: 31 de octubre de 2026.  
Estado: implementado en código; pendiente de migración en el entorno del negocio y validación piloto. Consultar [uso, pruebas y despliegue](cierre-de-caja-despliegue.md).

## 1. Objetivo y resultado de la auditoría

Implementar apertura, movimientos, conteo, cierre y entrega de una caja entre empleados. **Los negocios que no activen turnos conservarán su funcionamiento actual.**

Decisiones acordadas:

- Activación opcional por negocio.
- Una caja y un dispositivo por turno.
- Solo el responsable puede registrar operaciones con su efectivo.
- El empleado ve el importe esperado mientras cuenta.
- El saliente confirma su cierre y el entrante confirma cuánto recibió.
- Los faltantes y sobrantes permiten continuar, con motivo obligatorio.
- Se permiten ventas y abonos offline dentro de un turno abierto; cerrar requiere conexión y sincronización.
- Primera entrega en la web, con API preparada para actualizar posteriormente la app móvil.

La auditoría identificó estos puntos que deben resolverse:

| Área | Situación actual | Cambio necesario |
|---|---|---|
| Cuadre diario | Resume operaciones; no guarda aperturas ni cierres | Incorporar turnos persistentes e historial |
| Efectivo esperado | La pantalla muestra entradas y deja salidas como referencia | Calcular entradas y salidas reales de la caja |
| Tesorería | Reconstruye saldos desde documentos modificables | Conservar movimientos y cierres históricos |
| Offline | Los pendientes carecen de turno e identidad verificable del empleado | Guardar contexto, autoría e identificadores para evitar duplicados |
| Web y API | Existen implementaciones financieras separadas | Aplicar las mismas reglas en todos los caminos |
| Compras por escaneo/API | Hay caminos que no registran método ni cuenta de pago | Recoger esos datos cuando exista un pago |

Referencia inicial: TypeScript y las 28 pruebas existentes pasan. Todavía no existe cobertura específica de cierres. Durante la auditoría no se modificó código ni datos.

## 2. Funcionamiento del negocio

### Apertura

El empleado inicia sesión con su subusuario, abre turno desde el dispositivo de caja e introduce el efectivo contado.

Se guardan responsable, dispositivo, fecha, importe esperado, importe recibido y diferencia de recepción. El importe esperado procede del último cierre; en la primera apertura se establece una base inicial confirmada por el dueño.

**Abrir turno no genera un ingreso ni vuelve a sumar el dinero que ya existía.**

### Operaciones

El cálculo será:

**Efectivo esperado = efectivo recibido + entradas − salidas.**

- Las ventas al contado y los abonos aportan únicamente su parte en efectivo.
- Los pagos divididos se separan por método y cuenta.
- Las ventas a crédito no generan entrada de efectivo.
- Compras pagadas, gastos y devoluciones descuentan efectivo cuando realmente utilizan esa caja.
- Los traspasos entre caja, banco y resguardo se registran una sola vez.
- Los aportes y retiros del propietario se identifican por separado, sin convertirlos automáticamente en ventas o gastos.
- Tarjetas y transferencias aparecen desglosadas por turno y cuenta, sin contarse como billetes físicos.

Antes de cerrar se podrán registrar retiros o traspasos para dejar el fondo deseado. El conteo final corresponderá al dinero que permanece en la caja.

### Cierre y entrega

El sistema detiene nuevas operaciones del turno, sincroniza pendientes y presenta el esperado definitivo. El empleado introduce su conteo y, si existe diferencia, explica el motivo.

El cierre conserva una copia definitiva de los totales, movimientos y diferencias. El sobrante o faltante se registra como ajuste identificado de tesorería, separado de ventas y gastos.

El siguiente empleado abre con su propio conteo. Una diferencia entre lo entregado y lo recibido queda como **diferencia de recepción**, separada del resultado de sus operaciones.

Ejemplo: si un empleado debía entregar RD$6,500 y contó RD$6,400, su cierre conserva el faltante de RD$100. Si el siguiente recibe RD$6,400, empieza con ese importe.

Los turnos pueden atravesar medianoche; no se cierran automáticamente por cambiar de día.

## 3. Datos, reglas e interfaces

### Registro financiero y migración

Añadir en [prisma/schema.prisma](../prisma/schema.prisma):

- Configuración de activación y cuenta física controlada.
- Turnos con responsable, dispositivo, apertura, cierre, conteos y diferencias.
- Registro inmutable de movimientos con cuenta, turno, origen, autor, importe y referencia.
- Registro de operaciones para reconocer reintentos y devolver el resultado original.

Al activar un negocio, establecer una fecha de corte y capturar una sola base de saldos por cuenta. A partir de ese punto, tesorería utilizará esa base y los nuevos movimientos, evitando sumar también los documentos originales.

La activación mostrará los saldos propuestos y las inconsistencias detectadas. No se asignarán turnos ficticios a operaciones antiguas. Los movimientos anteriores conservarán su identificación como históricos.

### Backend común

Centralizar las reglas financieras utilizadas por acciones web, API, sincronización y compras por escaneo. Documento, inventario, cuenta por cobrar y movimiento financiero deben confirmarse dentro de la misma transacción.

- Impedir dos turnos abiertos o en cierre para el mismo negocio mediante restricciones de base de datos.
- Bloquear operaciones incompatibles con el estado del turno.
- Obtener siempre el empleado desde la sesión autenticada.
- Validar negocio, responsable y dispositivo en el servidor.
- Asociar operaciones mediante `cashShiftId`, sin deducir el turno desde fechas editables.
- Con turnos activos, exigir la caja configurada para efectivo y cuentas bancarias para tarjeta o transferencia. «Otro» no podrá afectar la caja física.
- Recoger método y cuenta en compras por escaneo/API cuando se registre un pago; una entrada de mercancía sin pago registrado no generará salida de caja.

### Correcciones posteriores

Bloquear edición económica y eliminación de operaciones incluidas en cierres. Las correcciones usarán devoluciones o reversos relacionados con el original, con motivo y permisos.

El movimiento económico se registra en el turno actual cuando exista devolución o recuperación real de dinero. Una corrección documental sin movimiento de efectivo no descontará dinero de la caja actual.

Los gastos incluidos en este control conservarán su registro mediante anulación, evitando el borrado físico. Los cierres anteriores nunca se recalcularán.

### Acceso e interfaces

Mantener `/daily-close`, incorporando turno actual, apertura, cierre e historial, junto al resumen diario existente.

Añadir servicios y endpoints para contexto, apertura, preparación del cierre, cierre, movimientos e historial. Los contratos operativos incorporarán `cashShiftId`, `clientOperationId` y `clientSequence`.

Separar permisos para operar el turno propio, consultar todos los cierres y gestionar incidencias. Migrar los accesos existentes conservando su alcance; el rol `ADMIN` no obtendrá permisos implícitos.

Impedir desactivar o eliminar al responsable o la cuenta controlada mientras exista un turno pendiente. El dueño podrá resolver un cierre excepcional por ausencia o pérdida del dispositivo, dejando motivo y conteo explícitos; los pendientes posteriores quedarán retenidos para revisión.

## 4. Offline y compatibilidad

Cada operación se guardará localmente **antes de enviarse**, también cuando haya conexión. Conservará negocio, empleado, dispositivo, turno, identificador único y secuencia. Los reintentos no podrán duplicar facturas, abonos, inventario ni dinero.

El cierre seguirá este protocolo:

1. Bloquear nuevas operaciones en todas las pestañas del dispositivo.
2. Comunicar la última secuencia local y pasar el turno a preparación de cierre.
3. Sincronizar y comprobar que el servidor confirmó todas las operaciones.
4. Guardar el conteo y cerrar de forma atómica.

Una desconexión durante ese proceso permitirá reanudarlo sin duplicar efectos. Los errores de permisos o de turno no se tratarán como fallos de Internet.

No se podrá entregar el turno con pendientes ni sincronizarlos bajo otro empleado. Cerrar sesión conservará los datos locales.

La actualización de IndexedDB conservará los pendientes existentes. Los registros antiguos sin contexto verificable no se reasignarán automáticamente a un turno nuevo.

Con turnos desactivados se mantendrán los contratos actuales. Con turnos activados, los clientes móviles antiguos recibirán un error claro de actualización requerida al intentar operar la caja.

## 5. Validación, despliegue y límites

Antes de activar turnos, verificar:

- **Compatibilidad:** mismos resultados actuales con la función desactivada.
- **Cálculos:** fondo inicial, pagos divididos, crédito, abonos individuales y por lote, gastos, compras, devoluciones, retiros y traspasos.
- **Relevos:** faltante del saliente, diferencia de recepción y turnos que atraviesan medianoche.
- **Inmutabilidad:** corregir un documento no cambia un cierre anterior.
- **Concurrencia:** aperturas simultáneas, doble cierre y venta compitiendo con cierre.
- **Offline:** reconexión, respuesta perdida, reintentos, varias pestañas, sesión vencida y cambio de usuario.
- **Seguridad:** aislamiento entre negocios y rechazo de empleado, turno o dispositivo ajeno.
- **Integraciones:** web, API, escaneo, informes, impresión y bajas administrativas.

Las pruebas transaccionales usarán una base de pruebas explícita, sin recurrir a producción. Añadir comentarios preventivos en las correcciones, especialmente donde pueda duplicarse dinero, cambiarse la autoría o recalcularse historia.

Desplegar con migración aditiva y turnos desactivados. Validar primero en pruebas y después en un negocio piloto, comparando documentos, movimientos y saldos antes de ampliar la activación.

Si aparece una incidencia, detener nuevas activaciones y preservar los registros. La reversión deberá utilizar una versión compatible con el nuevo registro financiero; no se eliminarán tablas ni cierres.

Esta entrega mantiene una caja por negocio. Quedan fuera las cajas simultáneas, la conciliación bancaria, las cuentas por pagar y la actualización de la app móvil.

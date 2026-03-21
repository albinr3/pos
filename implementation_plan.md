# Selector Múltiple de Facturas para Pagos en /ar

Permitir al usuario seleccionar varias facturas del mismo cliente y cobrarlas juntas en un solo recibo. El monto por defecto es la suma de balances, y si se paga parcial se distribuye desde la factura más antigua primero.

## Propuestas de Cambios

### Backend — Acción batch

#### [MODIFY] [actions.ts](file:///c:/Users/Albin%20Rodriguez/Documents/pos/src/app/(app)/ar/actions.ts)

Agregar función `addBatchPayment` que:
1. Recibe un array de `arId`s, monto total, método, banco y nota.
2. Dentro de una transacción:
   - Verifica que todos los AR pertenecen al mismo `accountId` y al mismo `customerId`.
   - Ordena los AR por `createdAt` ASC (más antigua primero).
   - Incrementa la secuencia de recibos **una sola vez** → obtiene un solo `receiptCode`.
   - Distribuye el monto de la más antigua a la más reciente, creando un Payment por cada AR hasta agotar el monto.
   - Actualiza `balanceCents` y `status` de cada AR.
   - Registra auditoría para cada pago creado.
3. Retorna `{ receiptCode, paymentIds: string[] }`.

La función [addPayment](file:///c:/Users/Albin%20Rodriguez/Documents/pos/src/app/%28app%29/ar/actions.ts#180-283) existente **no se modifica** — sigue funcionando para pagos individuales.

---

### Frontend — UI de selección

#### [MODIFY] [ar-client.tsx](file:///c:/Users/Albin%20Rodriguez/Documents/pos/src/app/(app)/ar/ar-client.tsx)

**Checkboxes en tabla:**
- Agregar columna de checkbox a la izquierda de cada fila.
- Estado `selectedIds: Set<string>` con los IDs de AR seleccionados.
- Al seleccionar un AR, si ya hay otros seleccionados de un **cliente diferente**, mostrar un toast de error y no permitirlo.
- Checkbox "Seleccionar todos (página)" en el header — solo selecciona los que sean del mismo cliente que la primera selección.

**Barra de acciones batch:**
- Cuando hay ≥1 seleccionado, mostrar barra fija con: cantidad seleccionada, total combinado, y botón "Cobrar seleccionadas".
- El botón abre un nuevo diálogo `BatchPaymentDialog` con:
  - Lista resumida de las facturas seleccionadas (factura + pendiente).
  - Monto por defecto = suma de balances, editable con `PriceInput` (max = suma de balances).
  - Método de pago, banco (si transferencia), nota.
  - Botón "Guardar pago".

**Al guardar:**
- Si online → llama `addBatchPayment`, luego abre el recibo (`/api/print/payment/{paymentIds[0]}`) en nueva pestaña.
- Si offline → guarda un `pendingBatchPayment` en IndexedDB (similar al flujo existente, un entry por cada AR).

---

### Recibos — Desglose multi-factura

#### [MODIFY] [page.tsx](file:///c:/Users/Albin%20Rodriguez/Documents/pos/src/app/receipts/payment/[paymentId]/page.tsx) (recibo 80mm)

- Al cargar el payment, buscar si hay **otros payments con el mismo `receiptCode`** en el mismo account.
- Si hay múltiples → mostrar sección "Desglose por factura" con tabla: factura, monto aplicado.
- Mostrar el total combinado como resumen.
- Si es un solo payment → sin cambios, misma visualización actual.

#### [MODIFY] [page.tsx](file:///c:/Users/Albin%20Rodriguez/Documents/pos/src/app/invoices/payment/[paymentId]/page.tsx) (recibo carta)

- Misma lógica: buscar payments con el mismo receiptCode.
- Si múltiples, mostrar tabla de desglose por factura con monto aplicado a cada una.

---

## Verificación

### Manual
1. **Pago múltiple**: Seleccionar 2+ facturas del mismo cliente → cobrar → verificar que se crea un solo receiptCode y que el recibo desglosa las facturas.
2. **Restricción de cliente**: Seleccionar una factura de un cliente, intentar seleccionar otra de otro cliente → debe bloquear con toast de error.
3. **Pago parcial**: Seleccionar 2 facturas, reducir el monto → verificar que se aplica a la más antigua primero.
4. **Pago individual**: Usar el botón "Abonar" existente → verificar que sigue funcionando igual.
5. **Recibo**: Abrir recibo de un pago batch → verificar que muestra desglose multi-factura en formato 80mm y carta.

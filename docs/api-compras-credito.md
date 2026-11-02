# Compras a crédito y cuentas por pagar

Backend compartido por web y móvil. Contrato legible por herramientas: [OpenAPI](./openapi-compras-credito.json).

## Autenticación y permisos

En móvil, enviar en **todas** las solicitudes:

```http
X-Clerk-Authorization: Bearer <token_de_sesion_Clerk>
X-SubUser-Token: <token_devuelto_por_login_de_subusuario>
Content-Type: application/json
```

También se admite `Authorization: Bearer <token_Clerk>`. Las sesiones web mantienen sus cookies. El negocio y el responsable se resuelven desde la sesión; enviar `accountId` o `userId` no permite operar como otra persona.

El login existente y `GET /api/auth/me` incluyen `isOwner`, `canAccessAccountsPayable`, `canRegisterSupplierPayments` y `canCancelSupplierPayments`. El propietario tiene acceso por `isOwner` aunque un indicador individual sea falso. Los demás empleados necesitan asignación explícita.

| Operación | Permiso |
|---|---|
| Crear/editar compra, escanear imagen, notas/vencimiento | `canManagePurchases` |
| Anular compra | `canCancelPurchases` |
| Consultar deuda/pagos | `canAccessAccountsPayable` |
| Registrar pago o abono inicial | `canRegisterSupplierPayments` |
| Anular pago | `canCancelSupplierPayments` |
| Reportes nuevos, incluidos archivos | `canAccessReports` + `canAccessAccountsPayable` |
| Ganancia | `canAccessReports` + `canViewProfitReport`; deuda informativa solo con acceso a CxP |

`GET /api/supplier-payments/options` devuelve métodos y cuentas activas DOP sin saldos; admite acceso a Compras, CxP o registro de pagos. Sus indicadores `cashControlEnabled` y `cashControlled` permiten elegir la caja configurada. Efectivo usa CAJA; los pagos digitales de crédito usan BANCO.

## Convenciones

- Importes: números enteros en **centavos**. RD$2,000 = `200000`. No se admiten importes negativos ni decimales en estos campos.
- Cantidades de mercancía: positivas, hasta tres decimales.
- Vencimiento: `YYYY-MM-DD`. Fechas de eventos: ISO 8601. Días del negocio: UTC−4.
- Listados nuevos: `skip=0&take=50`; máximo 500, orden estable, respuesta `{ data, nextSkip }`. `nextSkip: null` indica fin.
- Los resúmenes abarcan todos los resultados filtrados, no únicamente la página.
- Omitir `type` conserva `CONTADO` para clientes anteriores. Las rutas anteriores de compra y anulación siguen disponibles.
- Las nuevas operaciones de crédito requieren conexión. No implementar sincronización móvil sin conexión usando este contrato como si estuviera soportada.

## Proveedores y compras

`GET/POST /api/suppliers`, `GET/PUT /api/suppliers/{id}` incluyen `creditDays`: entero entre 0 y 3650. Omitirlo al editar conserva el plazo. `GET /api/suppliers?includeInactive=true` permite incluir inactivos a usuarios con acceso a CxP o gestión de proveedores. El plazo solo propone fechas nuevas; cambiarlo no modifica deudas existentes.

Compras: `GET/POST /api/purchases`; `GET/PUT /api/purchases/{id}`; `PATCH /api/purchases/{id}` para notas/vencimiento; `POST /api/purchases/{id}/cancel` y el `DELETE` anterior anulan mediante el mismo servicio.

Los listados admiten `query`, `supplierId`, `type`, `cancelled=all|true|false`, `from`, `to`, `skip`, `take`. El listado de compras existente incluye anuladas por defecto. `PUT` edita productos y requiere `items`; `PATCH` no requiere productos. `type` queda fijo después de crear. Los productos, proveedor e importes no pueden editarse, ni la compra anularse, mientras existan pagos activos. Las notas y vencimiento pueden editarse con pagos activos, sujetos a las protecciones de cierres existentes.

### Compra sin abono

```http
POST /api/purchases
```

```json
{
  "type": "CREDITO",
  "supplierId": "proveedor_id",
  "dueDate": "2026-12-01",
  "operationId": "b60a8404-b90d-4ad8-a901-504fb175ce1d",
  "initialPaymentCents": 0,
  "items": [{ "productId": "producto_id", "qty": 10, "unitCostCents": 100000 }],
  "updateProductCost": true,
  "updateProductPrice": false
}
```

No enviar método ni cuenta cuando no exista pago. El servidor calcula descuentos, impuestos y total usando las reglas de precios actuales. El ejemplo presupone proveedor sin descuento ni ITBIS: total `1000000` y saldo `1000000`. La respuesta `201` incluye `id`, `type`, `payableId`, `totalCents`, `paidCents`, `balanceCents`, `dueDate` y fechas.

### Compra con abono inicial

Usar la misma estructura y añadir:

```json
{
  "initialPaymentCents": 200000,
  "paymentMethod": "TRANSFERENCIA",
  "treasuryAccountId": "banco_id"
}
```

Crear un `operationId` nuevo para esta compra. El total de `1000000` deja `800000` pendientes. El abono debe ser menor que el total; para pagar todo al registrar utilizar `CONTADO`.

### OCR

`POST /api/purchases/ocr/extract` recibe `{ "image": "data:image/jpeg;base64,..." }` (hasta aproximadamente 10 MB) y devuelve los datos para revisión; no crea productos, inventario, compras ni deudas.

`POST /api/purchases/ocr` confirma la revisión con `products` y los mismos campos de crédito. Cada producto usa `productId` o `createNew: true`, `description`, `quantity`, `unitCostCents` y, opcionalmente, `sku`, `reference`, `discountPercentBp`, `saleMarginBp`, `sellPriceCents`. Enviar identificadores de otro negocio se rechaza. Un reintento conserva tanto la compra como los productos creados, sin duplicarlos.

## Consultar y pagar deuda

- `GET /api/accounts-payable`: `query`, `supplierId`, `status=PENDIENTE|PARCIAL|PAGADA`, `overdue=true|false`, `skip`, `take`. Incluye `summary`, resumen por proveedor (`providers`), `generatedAt` y `balanceBasis: CURRENT`.
- `GET /api/accounts-payable/{id}`: compra, proveedor e historial de pagos activos/anulados. Incluye `paidCents` y `cancelled`; si la compra está anulada, el saldo, los abonos vigentes y el atraso se devuelven en cero.
- `GET /api/supplier-payments`: `query`, `supplierId`, `method`, `treasuryAccountId`, `cancelled=all|true|false`, `from`, `to`, `skip`, `take`. Por defecto solo pagos activos.
- `GET /api/supplier-payments/{id}`: detalle, cuenta y responsable. Los campos `supplierId` y `supplierName` conservan el proveedor original del pago, aunque posteriormente cambie el proveedor de la compra.

### Abono posterior o liquidación

```http
POST /api/supplier-payments
```

```json
{
  "apId": "cuenta_por_pagar_id",
  "amountCents": 800000,
  "method": "TRANSFERENCIA",
  "treasuryAccountId": "banco_id",
  "operationId": "71a67cf2-7b38-49ad-999d-b9f06bd91b35",
  "note": "Liquidación de factura"
}
```

Si el saldo era `800000`, queda `0`, estado `PAGADA`. El pago afecta tesorería, sin modificar inventario ni descontar de nuevo costos de ventas. El servidor rechaza sobrepagos, incluidos los causados por solicitudes simultáneas.

### Anulación de pago

```http
POST /api/supplier-payments/pago_id/cancel
```

```json
{ "reason": "Pago registrado por error" }
```

Conserva el historial, registra responsable/motivo y restaura la deuda. Repetir la anulación no duplica la restauración. En una operación de turno cerrado, usar el flujo de corrección de caja; la ruta ordinaria devuelve `CASH_DOCUMENT_CLOSED`.

## Reintentos e idempotencia

Generar `operationId` **antes** de enviar la compra a crédito o el pago y conservarlo hasta conocer su resultado. Ante timeout o pérdida de respuesta, reenviar **el mismo contenido con el mismo identificador**. Se devuelve la respuesta guardada y no se repiten inventario, deuda, productos OCR ni dinero. Funciona también sin turnos activados.

No generar otro identificador automáticamente ante un timeout. Reutilizarlo con otro contenido o responsable devuelve `409 OPERATION_CONFLICT`. Una validación fallida que no confirmó transacción no consume el identificador.

## Caja y dispositivo móvil

1. Consultar `GET /api/cash-shifts` con los tokens móviles.
2. Persistir `Set-Cookie: movopos-cash-device=...` en el almacén de cookies del cliente HTTP y enviarla en solicitudes posteriores de caja. No reemplazarla por un UUID inventado ni reutilizar cookies de otro dispositivo.
3. Si el control está activado y el pago usa efectivo, debe existir un turno abierto del mismo responsable y dispositivo. Utilizar las operaciones existentes de apertura/cierre.
4. Enviar `cashOperation` junto a la operación: `clientOperationId`, `accountId`, `userId`, `cashShiftId`, `clientSequence`. La identidad enviada se contrasta con la sesión. El primer identificador puede coincidir con `operationId`, pero ambos deben permanecer estables durante reintentos.
5. Los pagos bancarios pueden usar operación global: `cashShiftId: null`, `clientSequence: null`. Si se vinculan a un turno, respetar su secuencia.
6. Sin registro de caja activado, omitir `cashOperation`; mantener `operationId` para idempotencia.

El endpoint existente `POST /api/cash-shifts/operations` admite `kind: supplierPayment`, con el pago en `payload`, además de compras manuales y OCR. Respetar el protocolo existente de secuencia, confirmación y cierre.

Para corregir un pago de turno cerrado: `POST /api/cash-shifts` con `action: correct`, `sourceType: supplierPayment`, `sourceId`, `reason` y `moneyMoved`. Este último indica si hubo recuperación real de dinero; no se inventa un ingreso cuando es solo corrección documental. Se conserva el cierre original.

## Reportes y archivos

| Endpoint | Base de fechas |
|---|---|
| `/api/reports/purchases` | Fecha de compra; abonado y pendiente actuales |
| `/api/reports/accounts-payable` | Estado actual, sin reconstrucción histórica |
| `/api/reports/supplier-payments` | Fecha de pago, aunque la compra sea de otro período |
| `/api/reports/profit` | Criterios existentes de ganancia; CxP actual informativa y sujeta a permiso |

Los tres reportes nuevos comparten filtros con sus listados. JSON devuelve `title`, `columns`, `data`, `summary`, `providers`, `nextSkip`, `generatedAt`, `balanceBasis` y `filters`. Las columnas indican `type: money` para valores en centavos.

Añadir `format=xlsx` o `format=pdf` descarga **todos los resultados filtrados**; los importes del archivo se expresan en RD$. Pantalla, JSON y archivos usan los mismos cálculos. Los anulados se excluyen de totales activos y aparecen en subtotales separados cuando el filtro los incluye. Las exportaciones respetan los mismos permisos.

## Errores

Forma: `{ "error": "Mensaje para mostrar", "code": "CODIGO_ESTABLE" }`.

| HTTP | Códigos principales |
|---|---|
| 400 | `INVALID_BODY`, `INVALID_JSON`, `INVALID_PURCHASE`, `INVALID_SUPPLIER`, `INVALID_PAYABLE_ID`, `INVALID_ITEMS`, `INVALID_AMOUNT`, `INVALID_DUE_DATE`, `INVALID_CREDIT_DAYS`, `INVALID_INITIAL_PAYMENT`, `INVALID_PURCHASE_TYPE`, `INVALID_PAGINATION`, `INVALID_DATE_RANGE`, `INVALID_PAYMENT_METHOD`, `INVALID_PAYMENT_ACCOUNT`, `PAYMENT_ACCOUNT_REQUIRED`, `OPERATION_ID_REQUIRED`, `REASON_REQUIRED` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `FORBIDDEN_ORIGIN` |
| 404 | `NOT_FOUND` |
| 409 | `ACTIVE_PAYMENTS`, `PAYMENT_EXCEEDS_BALANCE`, `OPERATION_CONFLICT`, `PURCHASE_TYPE_IMMUTABLE`, `PURCHASE_CANCELLED` y conflictos de caja |
| 500 | `INTERNAL_ERROR` |

Se conservan los códigos existentes de caja, incluidos `CASH_SHIFT_REQUIRED`, `CASH_SHIFT_MISMATCH`, `CASH_SHIFT_CLOSING`, `CASH_DOCUMENT_CLOSED`, `CASH_SEQUENCE_GAP` y `CLIENT_UPDATE_REQUIRED`. Mostrar el mensaje y guiar a resolver el turno; no convertir un conflicto de negocio en un reintento automático con otro identificador.

## Migración y verificación

Aplicar mediante el flujo habitual de migraciones, antes de desplegar el código, `20261101160000_purchase_credit` y después `20261101170000_supplier_payment_snapshots`. La segunda conserva el proveedor de los pagos existentes y congela esos datos para los nuevos registros. El backfill utiliza la relación disponible al migrar; no puede reconstruir cambios de proveedor anteriores que no se hubieran guardado. La migración es aditiva: las compras anteriores quedan como Contado y no se infieren deudas ni vínculos por nombre.

Las pruebas usan únicamente `TEST_DATABASE_URL`, con host local y nombre que contenga `cash_test`. Preparación: `node scripts/setup-purchase-credit-test-db.mjs`. Ejecución: `node --test --experimental-test-isolation=none scripts/purchase-credit.integration.test.mjs`. El script de preparación exige una base vacía y no elimina bases existentes.

La interfaz móvil y su sincronización sin conexión se implementarán por separado. Los contratos y servicios necesarios para la operación en línea quedan disponibles en esta entrega.

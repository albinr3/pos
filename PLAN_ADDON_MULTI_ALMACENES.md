# Plan Add-on Multi Almacenes (v1)
Fecha: 17 de febrero de 2026  
Zona horaria: America/Santo_Domingo

## 1) Objetivo
Habilitar multiples almacenes por cuenta con inventario independiente y transferencias entre almacenes, como funcionalidad opcional tipo add-on.

El sistema debe:
- funcionar exactamente igual para cuentas sin add-on;
- habilitar funcionalidades extra para cuentas con add-on;
- permitir que super admin asigne el add-on manualmente a cualquier cuenta, aunque no tenga el plan correspondiente.

## 2) Requisitos funcionales confirmados
- Cada almacen tiene su propio inventario por producto.
- Debe existir transferencia de inventario entre almacenes.
- En "Inventario masivo por Excel" en el modal se debe pedir a que almacen aplicar el ajuste/importacion.
- En compras se debe pedir a que almacen entra el inventario comprado.
- El add-on se activa cuando la cuenta tiene el plan de USD 28 (o equivalente configurado).
- Super admin puede activar/desactivar el add-on por override manual por cuenta.
- Todo debe operar sin romper flujos existentes.

## 3) Regla de activacion (entitlement)
Definir una sola funcion central:

`hasMultiWarehouse(accountId) = hasPlanAddon(accountId, "MULTI_WAREHOUSE") OR hasSuperAdminOverride(accountId, "MULTI_WAREHOUSE")`

Comportamiento:
- `false`: modo legacy (un solo inventario operativo).
- `true`: modo multi almacen (UI y logica extendida).

## 4) Modelo de datos propuesto
### Inventario por almacen
- `Warehouse`
  - `id`, `accountId`, `name`, `code`, `isActive`, `isDefault`, `createdAt`, `updatedAt`
  - Unico por cuenta: `code`.
- `WarehouseStock`
  - `id`, `accountId`, `warehouseId`, `productId`, `stock`, `minStock`, `createdAt`, `updatedAt`
  - Unico: (`warehouseId`, `productId`).
- `InventoryMovement`
  - `id`, `accountId`, `warehouseId`, `productId`, `qtyDelta`, `type`, `reason`, `refType`, `refId`, `performedBy`, `createdAt`
  - Tipos sugeridos: `PURCHASE_IN`, `SALE_OUT`, `RETURN_IN`, `ADJUSTMENT`, `TRANSFER_OUT`, `TRANSFER_IN`, `BULK_IMPORT`.

### Transferencias
- `InventoryTransfer`
  - `id`, `accountId`, `fromWarehouseId`, `toWarehouseId`, `status`, `notes`, `createdBy`, `createdAt`, `cancelledAt`
- `InventoryTransferItem`
  - `id`, `transferId`, `productId`, `qty`

Reglas:
- No permitir transferencia al mismo almacen.
- Operacion transaccional: salida y entrada atomicas.
- Si falla una parte, rollback completo.

### Entitlements del add-on
Agregar soporte de add-ons sin romper `BillingPlan` actual:
- `BillingAddon`
  - catalogo (ej. `MULTI_WAREHOUSE`) + precios (`priceUsdCents = 2800`).
- `BillingPlanAddon`
  - relacion plan -> addons incluidos.
- `AccountAddonOverride`
  - override por cuenta desde super admin (`enabled`, `reason`, `expiresAt`, `grantedBy`).

Nota:
- Si se quiere salida rapida, se puede iniciar solo con `AccountAddonOverride` + flag en plan y luego normalizar a tablas separadas.

## 5) Compatibilidad total (sin romper nada)
Estrategia de transicion segura:
1. Crear tablas nuevas sin tocar flujos actuales.
2. Crear almacen `Principal` (default) para todas las cuentas existentes.
3. Backfill inicial:
   - por cada `Product.stock`, crear/actualizar `WarehouseStock` en almacen `Principal`.
4. Mantener `Product.stock` como agregado total (suma de `WarehouseStock`) durante transicion para compatibilidad con reportes y modulos legacy.
5. Activar logica por feature flag (`hasMultiWarehouse`) antes de mostrar cambios de UI.
6. Migrar lecturas/escrituras por modulo de forma incremental (compras, ventas, ajustes, reportes).
7. No eliminar `Product.stock` en esta fase.

## 6) Cambios de UX
### Compras
- En crear/editar compra, agregar selector obligatorio "Almacen destino".
- Guardar `warehouseId` en compra (cabecera) o por item si se quiere granularidad futura.

### Inventario masivo Excel
- En modal de importacion/aguste masivo, agregar selector "Aplicar al almacen".
- Requerido solo si `hasMultiWarehouse=true`.
- Si no tiene add-on: usar almacen default automaticamente (sin cambiar experiencia actual).

### Transferencias
- Nueva pantalla: `Inventario -> Transferencias`.
- Flujo: origen, destino, items, confirmar.
- Mostrar historial y estado.

### Productos y busquedas de stock
- En modo multi almacen, mostrar:
  - stock por almacen,
  - stock total.
- En modo legacy, mantener vista actual.

## 7) Cambios de logica por modulo
- `purchases`: incrementar `WarehouseStock` del almacen seleccionado y registrar `InventoryMovement`.
- `sales`: descontar del almacen seleccionado (o almacen por defecto de la caja/usuario).
- `returns`: devolver al almacen configurado para devoluciones.
- `products` (ajustes manuales y masivos): afectar `WarehouseStock` del almacen elegido.
- `reports`: permitir filtro por almacen y total consolidado.

## 8) Permisos y super admin
- Super admin:
  - asignar o quitar add-on por cuenta (override manual),
  - ver origen del entitlement (`plan` vs `override`).
- Operadores:
  - permiso opcional `canTransferInventory`.
  - permiso opcional `canManageWarehouses`.

## 9) Fases de implementacion recomendadas
1. **Base de datos**
   - modelos nuevos + migracion + backfill de almacen principal.
2. **Entitlement**
   - servicio `hasMultiWarehouse(accountId)` + panel super admin para override.
3. **Compras + Excel**
   - pedir almacen destino y guardar movimientos.
4. **Transferencias**
   - API + UI + validaciones transaccionales.
5. **Ventas/Devoluciones/Reportes**
   - ajustar para consumir stock por almacen.
6. **Hardening**
   - auditoria, pruebas de concurrencia, monitoreo.

## 10) Riesgos y mitigaciones
- Riesgo: desalineacion entre `Product.stock` y `WarehouseStock`.
  - Mitigacion: recalculo nocturno + alertas + reconciliacion administrativa.
- Riesgo: regresion en cuentas sin add-on.
  - Mitigacion: tests A/B (con y sin entitlement) y default warehouse obligatorio.
- Riesgo: transferencias inconsistentes por concurrencia.
  - Mitigacion: transacciones serializables o locks por producto+almacen.

## 11) Pruebas minimas obligatorias
- Cuenta sin add-on:
  - compras, ventas, devoluciones, Excel masivo y reportes funcionan igual que hoy.
- Cuenta con add-on:
  - inventario aislado por almacen.
  - transferencia descuenta origen y suma destino correctamente.
  - compra pregunta almacen y afecta solo ese almacen.
  - Excel pregunta almacen y afecta solo ese almacen.
- Super admin:
  - override ON habilita add-on aunque plan no lo incluya.
  - override OFF vuelve a comportamiento de plan.
- Integridad:
  - suma de `WarehouseStock` == `Product.stock` en conciliacion.
  - sin stocks negativos cuando la politica lo prohiba.

## 12) Archivos/modulos a tocar (referencia inicial)
- `prisma/schema.prisma`
- `src/lib/billing.ts` (entitlements/add-ons)
- `src/app/super-admin/(dashboard)/plans/*` (incluir add-on en planes)
- `src/app/super-admin/(dashboard)/accounts/*` (override manual por cuenta)
- `src/app/(app)/purchases/actions.ts`
- `src/app/(app)/purchases/purchases-client.tsx`
- `src/app/(app)/products/actions.ts`
- `src/app/(app)/products/products-client.tsx` (inventario masivo Excel)
- `src/app/(app)/sales/actions.ts`
- `src/app/(app)/returns/actions.ts`
- `src/app/(app)/reports/*` (filtros por almacen y consolidado)

## 13) Criterio de exito
- El sistema opera estable en dos modos:
  - modo legacy (sin add-on), sin cambios percibidos por clientes actuales;
  - modo multi almacen (con add-on), con inventario por almacen, transferencias y flujos de compra/importacion correctamente dirigidos.

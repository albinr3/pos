# MOVOPos - Sistema POS & Inventario Multi-Tenant

App web SaaS para **ventas**, **inventario**, **compras**, **cuentas por cobrar (CxC)**, **cuadre diario**, **reportes**, **cotizaciones**, **devoluciones**, **gastos operativos**, y **gestión de proveedores**.

- **Multi-tenant**: Cada cuenta es un negocio aislado con sus propios datos
- **Autenticación**: Clerk (Google/Email) + Subusuarios con contraseña
- Moneda: **RD$ (DOP)**
- ITBIS: **configurable por cuenta (incluido o no incluido en precio de venta)**; tasa estándar 18%
- Facturación:
  - **Ticket térmico 80mm** (por defecto)
  - Factura **carta** (opcional)
- **Modo offline**: Funciona sin conexión usando IndexedDB

---

## 🚀 Características Principales

### Sistema Multi-Tenant
- Cada usuario de Clerk tiene su propia **cuenta/negocio** (Account)
- Datos completamente aislados entre cuentas
- Al registrarse, se crea automáticamente:
  - Account (tenant)
  - Configuración de empresa
  - Secuencias de facturación
  - Cliente genérico

### Autenticación en Dos Niveles
1. **Clerk** (Cuenta principal): Google, Email/Password
2. **Subusuario** (Operador): Username + contraseña de 4 dígitos o más
   - Flujo: Login con Clerk → Seleccionar usuario → Ingresar contraseña
   - Permite múltiples cajeros/operadores por cuenta

### Sistema de Permisos Granular
Permisos configurables por usuario:
- `canOverridePrice`: Modificar precios al facturar
- `canCancelSales`: Cancelar facturas
- `canCancelReturns`: Cancelar devoluciones
- `canCancelPayments`: Cancelar pagos
- `canEditSales`: Editar facturas
- `canEditProducts`: Editar productos
- `canChangeSaleType`: Cambiar tipo de venta (contado/crédito)
- `canSellWithoutStock`: Vender sin stock disponible
- `canManageBackups`: Gestionar backups de base de datos
- `canViewProductCosts`: Ver costos de productos
- `canViewProfitReport`: Ver reporte de ganancia
- `canAdjustInventory`: Ajustar inventario manualmente
- `canManageCategories`: Gestionar categorías
- `canManagePurchases`: Registrar/editar compras
- `canCancelPurchases`: Anular compras
- `canManageSuppliers`: Gestionar proveedores
- `canManageCustomers`: Gestionar clientes
- `canApproveCredit`: Aprobar línea de crédito
- `canManageExpenses`: Registrar/editar gastos operativos
- `canCancelExpenses`: Anular gastos operativos
- `canManageQuotes`: Crear/gestionar cotizaciones
- `canApplyDiscounts`: Aplicar descuentos globales (preparado para futuros flujos)
- `canViewAuditLogs`: Ver bitácora de auditoría
- `canManageUsers`: Gestionar subusuarios (delegación limitada)
- `canManageSettings`: Modificar ajustes de empresa

Notas de autorización:
- El `owner` conserva bypass administrativo para evitar lockout.
- El rol `ADMIN` ya no hace bypass automático de permisos granulares.

### Modo Offline
- **Ventas offline**: Se guardan en IndexedDB y sincronizan al volver la conexión
- **Pagos offline**: Abonos a CxC se guardan localmente
- **Pre-carga de datos**: Productos, clientes y CxC se cachean para uso offline
- **Sincronización automática**: Al detectar conexión, sincroniza pendientes

---

## ✅ Implementaciones y correcciones recientes (enero-marzo 2026)

### Preferencia fiscal por cuenta: precio de venta con ITBIS incluido/no incluido (marzo 2026)
- Se agregó la preferencia global `salePricesIncludeItbis` en Ajustes de Ventas.
- Modo `true` (default): el precio de venta guardado incluye ITBIS; total de línea/documento ya lo contiene.
- Modo `false`: el precio de venta guardado es base sin ITBIS; total se calcula como base + ITBIS.
- Se conserva historial por documento:
  - Ventas, cotizaciones y devoluciones guardan snapshot de modo (`salePricesIncludeItbis`) para no reinterpretar documentos antiguos cuando el ajuste cambia.
  - Ítems transaccionales guardan snapshot de tasa (`itbisRateBp`) para cálculos consistentes en edición, reportes, devoluciones e impresión.
- Se actualizó UI y textos para reflejar el modo activo:
  - Creación/edición de productos.
  - Desglose de carrito en POS/cotizaciones.
  - Recibos/facturas/PDFs y etiquetas de impuestos dinámicas.
- API y offline actualizados para mantener consistencia:
  - `/api/company-settings` expone y acepta `salePricesIncludeItbis`.
  - Payloads de ventas/cotizaciones incluyen modo del documento y tasa snapshot por ítem.
  - Ventas offline persisten el modo al momento de crear y lo envían en sincronización.
- Compras integradas al nuevo modo:
  - El precio de venta sugerido/guardado desde compras respeta si la cuenta trabaja con ITBIS incluido o no incluido.

### Permisos modulares y hardening de acceso (marzo 2026)
- Se agregaron permisos modulares por categoría en `User`:
  - inventario/productos, compras/proveedores, clientes/crédito, gastos, cotizaciones, ventas/caja, auditoría/configuración.
- Se creó migración con backfill de compatibilidad:
  - owner: permisos nuevos en `true`
  - no-owner: mapeo de compatibilidad operativo (incluye `canAdjustInventory`/`canManageCategories` desde `canEditProducts`).
- Se centralizó el contrato de permisos en `src/lib/permissions.ts` y guardas en `src/lib/permission-guard.ts`.
- Se aplicó enforcement server-side en Server Actions y API REST (`403` en denegados) y auditoría de intentos no autorizados (`UNAUTHORIZED_ACCESS`).
- Se rediseñó la gestión de subusuarios:
  - permisos por módulos
  - toggle ON/OFF por módulo
  - estado parcial por módulo
  - restricciones de delegación para permisos críticos.
- Se propagaron los nuevos flags de permisos en auth/session y payloads de login (`/api/auth/subuser/login`, `/api/auth/me`).
- Se endureció acceso por URL directa en páginas de módulos:
  - `/categories`, `/suppliers`, `/customers`, `/quotes`, `/quotes/list`, `/operating-expenses`, `/purchases`, `/purchases/list`, `/purchases/scan`.
- Ajuste adicional de seguridad:
  - se eliminó el bypass implícito por `role=ADMIN` y por `username=admin` en validaciones de permisos de negocio.
  - el bypass administrativo queda solo para `isOwner`.

### Implementaciones
- **Verificación de conectividad real**: Se agrega ping periódico (`HEAD`) a `/api/health-check` con timeout para detectar si hay internet real, no solo `navigator.onLine`.
- **Navegación en modo offline**: Al estar sin conexión, solo se habilitan rutas de **Ventas** (`/sales`) y **CxC** (`/ar`); el resto queda deshabilitado en el menú.
- **Personalización por unidad en productos por receta**:
  - En líneas con cantidad mayor a 1, al personalizar se puede elegir alcance:
    - `Solo 1 unidad` (divide la línea automáticamente)
    - `Todas las unidades`
  - Se pueden tener en el carrito varias líneas del mismo producto con ajustes distintos (ej: 1 normal + 1 sin queso)
- **Unificación de unidades en productos**: Desde marzo de 2026 los productos usan un solo campo `unit`.
  - `BASIC` y `RECIPE` usan `UNIDAD`
  - `MEASURED` exige una unidad distinta de `UNIDAD`
  - La misma unidad se usa para costo, precio, stock, stock mínimo, recetas, POS, devoluciones y movimientos
  - La importación Excel ahora usa solo la columna `unidad`
  - La API de productos (`GET/POST/PUT /api/products`) acepta y devuelve `unit`
- **Recetas con ajustes en venta (`Sin/Extra`)**: Desde marzo de 2026 se eliminaron los modificadores configurables en el perfil del producto.
  - En productos `RECIPE`, los ajustes se definen al vender: `Sin` (no descuenta ese insumo) y `Extra` (duplica consumo de ese insumo, `x2`)
  - Se permite combinar `Sin` y `Extra` en una misma línea para ingredientes distintos
  - POS y edición de ventas muestran modal de ingredientes para aplicar ajustes
  - Historial de venta, recibo térmico y factura carta muestran los ajustes aplicados por línea
  - **Cambio API breaking**:
    - `POST/PUT /api/sales`: se reemplaza `selectedModifierIds` por `recipeAdjustments[]`
    - `POST/PUT /api/products`: `modifiers` ya no es válido (retorna `400` si se envía)

### Correcciones
- **Página offline**: Se corrige el CTA para permitir **cobrar** (CxC) en lugar de **comprar**, con enlace directo a `/ar`.
- **Service Worker**: Se incrementa la versión de cache para asegurar que se sirvan los recursos actualizados.
- **Estado de Resultados (devengado)**:
  - Los ingresos ahora reconocen **ventas del período (contado + crédito)** menos devoluciones del período.
  - Los **cobros de CxC** se mantienen como dato informativo y **ya no se suman** al total de ingresos.
  - Se evita la pérdida artificial cuando existían ventas a crédito con costo de ventas reconocido.

### API móvil (autenticación por request)
- Se corrigió el uso mixto de autenticación en endpoints API que usaban `getCurrentUserFromRequest(...)` pero luego llamaban actions que internamente volvían a usar `getCurrentUser()` (cookies web), causando `No autenticado` en móvil.
- Patrón aplicado:
  - La route API valida usuario con `getCurrentUserFromRequest(request)`.
  - La action server acepta un `actor` tipado y validado.
  - La route pasa ese `actor` explícitamente a la action.
- Endpoints/actions ajustados:
  - `POST /api/customers` -> `upsertCustomer(..., user)`
  - `PUT /api/customers/:id` -> `upsertCustomer(..., user)`
  - `GET /api/accounts-receivable` -> `listOpenAR(..., user)`
  - `POST /api/payments` -> `addPayment(..., user)`
- Seguridad:
  - El `actor` no viene del body del cliente; se inyecta desde la route ya autenticada.
  - Se agregó validación runtime (`id`, `accountId`) para rechazar objetos inválidos.

---

## Módulos

### Ventas (POS)
Ruta: `/sales`
- Selección de cliente o **Cliente Genérico**
- Búsqueda de productos por:
  - **Descripción**
  - **Código (SKU)**
  - **Referencia**
  - **Código de barras** (escaneo automático)
- Carrito con cantidades y total acumulado
- Venta **Contado** o **Crédito**
- **Pago dividido**: Permite dividir el pago entre múltiples métodos
- Si es crédito: se crea automáticamente la **Cuenta por Cobrar**
- **Costo de envío** opcional (se suma al total)
- **Notas** opcionales en la venta
- **Impresión**: al guardar se abre el **ticket térmico**
- **Edición y cancelación** de ventas (ver Lista de Ventas)
- **Funciona offline**: Las ventas se guardan localmente si no hay conexión

### Clientes
Ruta: `/customers`
- Crear/editar clientes
- Campos: Nombre, teléfono, dirección, **cédula**, **provincia**
- Desactivar clientes
- El **Cliente Genérico** está protegido (no editable/no desactivable)

### Productos / Inventario
Ruta: `/products`
- Crear/editar productos:
  - **ID incremental** (productId) - generado automáticamente
  - Descripción, SKU, Referencia
  - Precio de venta (según ajuste de cuenta: ITBIS incluido o no incluido)
  - Costo
  - Stock y Stock mínimo
  - **Unidad de medida única**: cada producto usa un solo campo `unit`
    - Unidades disponibles: UNIDAD, KG, LIBRA, GRAMO, LITRO, ML, GALON, METRO, CM, PIE
    - `BASIC`: siempre usa `UNIDAD`
    - `MEASURED`: usa una unidad distinta de `UNIDAD` y permite decimales (ej: 2.5 kg)
    - `RECIPE`: siempre usa `UNIDAD`
    - La misma unidad se usa para costo, precio de venta, stock y stock mínimo
  - **Imágenes del producto** (hasta 3 imágenes, máximo 2MB cada una)
  - **Asociación con proveedor** (opcional)
  - **Asociación con categoría** (opcional)
- **Importación masiva por Excel**
  - La plantilla usa una sola columna `unidad`
  - `unidad_compra` y `unidad_venta` ya no son válidas
- **Impresión de etiquetas con código de barras** (formato CODE128)
  - Vista previa antes de imprimir
  - Tamaño configurable en ajustes
  - Incluye nombre, referencia, código de barras y precio
- Desactivar productos
  - **Protección de insumos**: No se puede desactivar un producto que es insumo de una receta activa

### Productos por Receta
Los productos por receta permiten que negocios como cafeterías, restaurantes o fast-foods definan productos compuestos cuyo inventario se descuenta automáticamente de sus insumos al venderse.

#### Tipos de producto (`ProductKind`)
| Tipo | Descripción | Stock | Ejemplo |
|------|-------------|-------|---------|
| `BASIC` | Producto simple por unidad | Se descuenta directamente | Refresco, caja de galletas |
| `MEASURED` | Producto vendido por medida | Se descuenta directamente | Queso por libra, tela por metro |
| `RECIPE` | Producto compuesto por insumos | **No tiene stock propio**, descuenta insumos | Sandwich, café latte |

#### Definición de receta
Al crear/editar un producto RECIPE:
- Se define una **lista de insumos** con la cantidad requerida por unidad vendida
  - Ej: 1 Sandwich = 2 rebanadas de pan + 50g queso + 30g jamón
  - Cada insumo usa su `unit` única para cantidades y ajustes
- **Validaciones**: receta no vacía, cantidades > 0, sin insumos duplicados, sin auto-referencia, sin recetas anidadas (un RECIPE no puede ser insumo de otro RECIPE)
- El producto RECIPE tiene `stock = 0`, `minStock = 0`, unidades fijas en `UNIDAD`

#### Ajustes al vender (`Sin/Extra`)
- Los ajustes **no se configuran en el producto**, se seleccionan al momento de la venta
- `Sin`: el consumo del ingrediente ajustado pasa a `0`
- `Extra`: el consumo del ingrediente ajustado se duplica (`x2` sobre la cantidad base de receta)
- Se permite mezclar `Sin` y `Extra` en la misma línea para ingredientes distintos
- Los ajustes no cambian el precio del producto (solo afectan inventario)

#### Motor de consumo
Al vender un producto RECIPE:
1. Se parte de la receta base del producto
2. Se aplican ajustes `Sin/Extra` por ingrediente
3. Se valida que haya stock suficiente de cada insumo
4. Se descuenta el stock de cada insumo
5. Se guarda un **snapshot** (`SaleItemConsumption`) con los insumos exactos consumidos

#### Comportamiento en ventas y devoluciones
- **Venta**: Descuenta insumos según receta + ajustes `Sin/Extra`
- **Cancelación de venta**: Restaura insumos usando el snapshot histórico (no la receta actual)
- **Edición de venta**: Revierte consumos anteriores y reaplicar con la receta actual
- **Devolución**: Restaura insumos proporcionalmente (ej: devolver 1 de 3 restaura 1/3 de cada insumo)
- **Cancelación de devolución**: Re-descuenta lo que se había restaurado

#### POS y offline
- En el carrito, cada línea RECIPE tiene botón **Personalizar** para abrir el modal de ajustes por ingrediente (`Sin`/`Extra`)
- Si la línea tiene cantidad > 1, el modal permite aplicar ajustes a:
  - **Solo 1 unidad** (divide la línea automáticamente)
  - **Todas las unidades**
- Cada combinación producto + ajustes genera una **línea de carrito diferente**
- Si se aplican ajustes sin seleccionar ingredientes, la línea queda en variante **Normal**
- Los ajustes seleccionados se **persisten offline** en IndexedDB
- La edición de ventas también soporta ajustes `Sin/Extra`

#### Restricciones
- Los productos RECIPE **no aparecen en búsquedas de compras** (se compran sus insumos directamente)
- Los insumos usados en recetas activas **no se pueden desactivar**
- Los movimientos de inventario de un insumo muestran las ventas de recetas que lo consumieron

#### Limitaciones (v1)
- No soporta recetas anidadas (receta dentro de otra receta)
- No soporta lotes de producción
- El costo reportado usa el `costCents` del producto, no el costo real de los insumos consumidos
- Los ajustes `Sin/Extra` no afectan el precio del producto
- No hay importación/exportación Excel de recetas


### Categorías
Ruta: `/categories`
- Crear/editar categorías de productos
- Campos: Nombre, descripción
- Desactivar categorías
- Asociar productos a categorías

### Compras
Ruta: `/purchases`
- Registrar compras para aumentar inventario
- Selección de **proveedor** (opcional)
- **Descuentos por proveedor** (aplicados automáticamente según configuración)
- Actualiza stock automáticamente
- Opción: actualizar costo del producto con el costo unitario de la compra
- **Interfaz mejorada**: Búsqueda de productos sin mensajes innecesarios
- **Notas** opcionales en la compra
- **Edición y cancelación** de compras (ver Lista de Compras)

#### Escaneo de Facturas (OCR)
Ruta: `/purchases/scan`
- **Extracción automática** de datos de facturas de proveedores usando **OpenAI Vision API**
- Sube o captura imagen de la factura
- Extrae automáticamente:
  - Nombre del proveedor
  - Fecha de la factura
  - Productos con SKU, descripción, cantidad y precio unitario
- **Coincidencia automática** con productos existentes por SKU/descripción
- Permite crear productos nuevos si no existen
- Revisión manual antes de crear la compra

### Cuentas por Cobrar (CxC)
Ruta: `/ar`
- Lista de facturas a crédito (pendientes/parciales)
- Registrar **abonos** o saldar completo
- Métodos: Efectivo / Transferencia / Tarjeta / Otro
- Al registrar un pago se abre **recibo térmico**
- Reimpresión:
  - Ticket de la factura
  - Recibos de pagos anteriores
- **Validaciones mejoradas**:
  - Solo permite ingresar números en el campo de monto
  - No permite abonar más del balance pendiente
  - Validación en tiempo real con mensajes de error
  - Botón deshabilitado cuando el monto es inválido
- **Botón de acceso rápido** a la página de Recibos de Pago
- **Cancelación de pagos** (ver Lista de Pagos)
- **Funciona offline**: Los pagos se guardan localmente si no hay conexión

### Cuadre diario
Ruta: `/daily-close`
- Vendido del día (o rango)
- Vendido contado / vendido crédito
- Cobrado del día (abonos)
- Desglose de cobros por método

### Dashboard
Ruta: `/dashboard`
- Ventas de hoy
- Total pendiente en CxC
- Stock bajo
- Link directo a Cuadre diario
- **Gráfico de pastel** con distribución de ventas (Contado vs Crédito) de los últimos 7 días
  - Visualización circular con colores distintivos
  - Muestra porcentajes y montos formateados
  - Tooltips interactivos con información detallada

### Reportes
Ruta: `/reports`
- **Reporte de ventas**: `/reports/sales`
  - Por rango de fecha
  - Reimpresión de tickets y facturas carta
- **Reporte de recibos (CxC)**: `/reports/receipts`
  - Filtros: fecha desde/hasta, cliente, código de recibo, método de pago, monto mínimo/máximo
  - Incluye/omite recibos cancelados, totales por método de pago y montos cancelados
  - Exporta **CSV/PDF** y enlaza a cada recibo térmico
- **Reporte de cuentas por cobrar**: `/reports/ar`
  - Filtros: estado (pendiente/parcial/pagada), cliente, factura, rango de fechas, monto mínimo/máximo, solo vencidas
  - Métricas: total pendiente, total vencido, facturas vencidas y **top deudores**
  - Exporta **CSV/PDF** con resaltado de facturas vencidas
- **Reporte de cobros**: `/reports/payments`
  - Por rango de fecha con total cobrado y reimpresión rápida de recibos
- **Reporte de ganancia (Estado de Resultados)**: `/reports/profit`
  - Por rango de fecha
  - Desglose completo:
    - Ingresos/Ventas (ventas contado + crédito, netas de devoluciones)
    - Cobros de crédito (informativo, no suma ingresos)
    - Costo de ventas
    - Utilidad bruta
    - Gastos operativos
    - Utilidad operativa
    - Otros ingresos y gastos
    - Impuestos
    - Utilidad neta
    - Cuentas por cobrar pendientes
  - **Requiere permiso**: `canViewProfitReport`
- **Reporte de inventario**: `/reports/inventory`
  - Listado completo de productos activos
  - Muestra: Producto, SKU, Proveedor, Stock, Costo unitario, Costo total
  - **Exportación a Excel** (formato .xlsx)
  - **Exportación a PDF** (formato horizontal)
  - Total de inventario en costo calculado automáticamente

### Cotizaciones
Ruta: `/quotes`
- Crear cotizaciones para clientes
- Similar a ventas pero sin afectar inventario
- **Fecha de validez** opcional
- **Costo de envío** opcional
- **Compartir cotización**:
  - URL única para cada cotización
  - **Compartir por WhatsApp** (con número de teléfono opcional)
  - **Descargar como PDF** (impresión directa)
  - En dispositivos móviles: uso de Web Share API nativa
- Ver todas las cotizaciones: `/quotes/list`
- Visualización e impresión: `/quotes/[quoteCode]`

### Devoluciones
Ruta: `/returns`
- Registrar devoluciones de productos de una venta
- Selecciona la factura original
- Devuelve productos específicos con cantidades
- **Restaura stock** automáticamente
- Código secuencial: `DEV-00001`
- Ver todas las devoluciones: `/returns/list`
- **Cancelación** de devoluciones
- Impresión de recibo de devolución: `/receipts/return/[returnCode]`

### Proveedores
Ruta: `/suppliers`
- Gestionar proveedores
- Campos: Nombre, contacto, teléfono, email, dirección, notas
- **Descuento por defecto** configurable por proveedor (en basis points)
- Desactivar proveedores
- Asociación con productos

### Gastos Operativos
Ruta: `/operating-expenses`
- Registrar gastos operativos de la empresa
- Campos: Descripción, monto, fecha, **categoría** (opcional), notas
- Se incluyen en el **Reporte de Ganancia**
- Consulta por rango de fecha

### Ajustes
Ruta: `/settings`

#### Datos de empresa
- Nombre, teléfono, dirección
- **Upload de logo** (máximo 5MB, formatos de imagen)

#### Etiquetas de Impresión
- **Tamaño de etiqueta de código de barras**: 4x2, 3x1, 2x1, 2.25x1.25
- **Tamaño de etiqueta de envío**: 4x6, 4x4, 6x4

#### Modo Offline
- Indicador de estado de conexión
- Contador de datos pendientes de sincronizar
- Botón "Sincronizar ahora"
- Botón "Pre-cargar datos offline"

#### Gestión de Usuarios (owner o usuario con `canManageUsers`)
- Crear nuevos usuarios/operadores
- Editar usuarios existentes
- Cambiar contraseñas
- Asignar roles: ADMIN, CAJERO, ALMACEN
- Configurar permisos individuales
- Activar/desactivar usuarios
- Eliminar usuarios
- Restricción: solo `owner` puede modificar permisos críticos (`canManageUsers`, `canManageSettings`, `canViewAuditLogs`) y cuentas owner

### Backups de Base de Datos
Ruta: `/backups`
- **Requiere permiso**: `canManageBackups` (owner con bypass)
- Crear backups manuales
- Ver lista de backups disponibles
- Descargar backups
- Restaurar backups (⚠️ reemplaza todos los datos)
- Eliminar backups

### Facturación (Billing)
Ruta: `/billing`
- **Trial de 15 días** al crear cuenta
- **Dos métodos de pago**:
  - **Transferencia bancaria (DOP)**: Precio según plan asignado
  - **Tarjeta de crédito (USD)**: Precio según plan asignado vía Lemon Squeezy
- **Planes de precios personalizados**: El Super Admin puede crear diferentes planes y asignarlos a cuentas específicas (ver Super Admin → Planes)
- **Múltiples cuentas bancarias**: El usuario selecciona a qué banco transferir
- **Subida de comprobantes**: Al subir el primer comprobante se activa el acceso inmediatamente
- **Estados de suscripción**:
  - `TRIALING`: Período de prueba (15 días)
  - `ACTIVE`: Suscripción activa
  - `GRACE`: Período de gracia (3 días después del vencimiento)
  - `BLOCKED`: Bloqueado por falta de pago
- **Notificaciones automáticas** por email:
  - Trial: 7, 3, 2, 1 días antes
  - Vencimiento: 3, 2, 1 días antes
  - Gracia: 2, 1 días antes
- **Banner de aviso** en la app según estado
- **Perfil de facturación**: Datos para generar recibos (nombre, RNC/cédula, dirección)
- **Historial de pagos** con comprobantes

### Flujo de estados de cuenta

```mermaid
flowchart LR
  A[Cuenta creada → `TRIALING` (15 días)] --> B{¿Pago o comprobante subido antes del final del trial?}
  B -- Sí --> C[`ACTIVE` (acceso completo, se generan cobros mensuales)]
  B -- No --> D[`GRACE` (3 días de tolerancia)]
  D --> E{¿Pago recibido o trial extendido durante la gracia?}
  E -- Sí --> C
  E -- No --> F[`BLOCKED` (acceso restringido, solo facturación y soporte)]
  F --> G{¿Pago recibido o se reactivó manualmente?}
  G -- Sí --> C
  G -- No --> H[Queda bloqueada hasta que la persona encargada la reabra o se elimine]
  C --> I[Pagos periódicos → si fallan, vuelve a reevaluar gracia/bloqueo]
  I --> D
```

El cron job de billing (ver más abajo) ejecuta esta lógica cada noche: detecta trials vencidos, mueve cuentas a `GRACE`, bloquea las que expiraron sin pago y dispara los correos programados (7/3/2/1 días de trial, vencimiento y gracia). Desde el panel de cuentas del super admin se pueden cambiar estados, extender trials o desbloquear cuentas sin necesidad de cancelar la suscripción.

---

## Listas y Consultas

### Lista de Ventas
Ruta: `/sales/list`
- Ver todas las facturas de ventas
- **Editar ventas** (modificar productos, cliente, tipo de pago)
- **Cancelar ventas** (restaura stock, solo si no tiene pagos registrados)
- Filtros y búsqueda

### Lista de Compras
Ruta: `/purchases/list`
- Ver todas las compras registradas
- **Editar compras**
- **Cancelar compras** (restaura stock y costos)

### Lista de Cotizaciones
Ruta: `/quotes/list`
- Ver todas las cotizaciones creadas
- Acceso rápido a visualización e impresión

### Lista de Devoluciones
Ruta: `/returns/list`
- Ver todas las devoluciones registradas
- **Cancelar devoluciones** (restaura cambios de stock)

### Lista de Pagos (Recibos de Pago)
Ruta: `/payments/list`
- Ver todos los recibos de pago registrados
- **Cancelar pagos** (recalcula balance de CxC automáticamente)
- Reimpresión de recibos

### Verificar Factura
Ruta: `/sales/check`
- Buscar factura por código para verificar existencia
- Útil para validar facturas antes de procesar

## Impresión

### Ticket térmico (80mm)
- Venta: `/receipts/sale/[invoiceCode]`
- Recibo de pago: `/receipts/payment/[paymentId]`
- Devolución: `/receipts/return/[returnCode]`

CSS incluye:
- `@page { size: 80mm auto; margin: 0; }`

### Factura Carta (opcional)
- Venta: `/invoices/[invoiceCode]`
- Cotización: `/quotes/[quoteCode]`

### Etiquetas de Envío
Ruta: `/shipping-labels`
- Genera etiquetas para envío de pedidos
- Incluye información del cliente (nombre, dirección, teléfono, provincia)
- Permite especificar remitente y cantidad de bultos
- Formato optimizado para impresión

---

## Landing Page (Marketing)
Rutas públicas:
- `/` - Página principal con hero, features, demo, precios, FAQ
- `/about` - Acerca de
- `/contact` - Contacto
- `/pricing` - Precios detallados
- `/privacy` - Política de privacidad
- `/terms` - Términos de servicio
- SEO listo para producción: `sitemap.xml`, `robots.txt` y JSON-LD (Organization/WebPage/FAQ) integrados en la landing

---

## Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Estilos**: TailwindCSS + shadcn/ui
- **Base de datos**: Prisma + PostgreSQL
- **Autenticación**: Clerk (OAuth) + JWT (subusuarios)
- **Gráficos**: Recharts
- **IA/OCR**: OpenAI Vision API (para extracción de datos de facturas)
- **Temas**: next-themes (modo claro/oscuro/sistema)
- **Códigos de barras**: JsBarcode (generación de códigos CODE128)
- **Exportación**: xlsx (Excel), jsPDF + jsPDF-autotable (PDF)
- **Almacenamiento offline**: IndexedDB

---

## Requisitos
- Node.js 18+
- PostgreSQL 14+
- Cuenta de Clerk (para autenticación)

---

## Variables de Entorno

Crear archivo `.env` en la raíz:

```env
# Base de datos (requerido)
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:PUERTO/movopos?schema=public"

# Base de datos de producción (opcional, para `npm run migrate:prod`)
DATABASE_URL_PROD="postgresql://postgres:TU_PASSWORD@host-prod:PUERTO/movopos?schema=public"

# Clerk (requerido para autenticación)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."  # Para webhook de Clerk

# JWT Secret (requerido para sesiones de subusuarios)
JWT_SECRET="tu_secret_key_segura_minimo_32_caracteres"

# Uploadthing (requerido para subida de archivos)
UPLOADTHING_SECRET="sk_live_..."
UPLOADTHING_APP_ID="..."
NEXT_PUBLIC_UPLOADTHING_APP_ID="..."  # Mismo valor que UPLOADTHING_APP_ID

# Meta Pixel + Conversions API (opcional - marketing SaaS)
NEXT_PUBLIC_META_PIXEL_ID="123456789012345"
META_ACCESS_TOKEN="EAAG..."
META_API_VERSION="v22.0"  # Opcional, default: v22.0

# OpenAI (opcional - para OCR de facturas)
OPENAI_API_KEY="sk-..."

# WhatsApp Cloud API (opcional - para OTP por WhatsApp)
WHATSAPP_PHONE_NUMBER_ID="tu_phone_number_id"
WHATSAPP_ACCESS_TOKEN="tu_access_token"

# === BILLING (Sistema de Facturación) ===

# Lemon Squeezy (opcional - para pagos con tarjeta USD)
LEMON_STORE_ID="tu-store-slug"
LEMON_VARIANT_ID_USD="05406e62-66d2-4304-87b7-8f246a8fa145"
LEMON_WEBHOOK_SECRET="tu-webhook-secret"

# Resend (opcional - para emails de billing)
RESEND_API_KEY="re_xxxxxxxxxx"
EMAIL_FROM="facturacion@tu-dominio.com"

# URL de la app (para links en emails)
NEXT_PUBLIC_APP_URL="https://tu-dominio.com"

# Seguridad del cron job
CRON_SECRET="genera-un-secreto-aleatorio-aqui"
```

### Generar JWT_SECRET
```bash
openssl rand -base64 32
```

### Formato de DATABASE_URL
- Puerto por defecto de PostgreSQL: `5432`
- Si tu contraseña tiene caracteres especiales, codifícalos:
  - `@` → `%40`
  - `#` → `%23`
  - `%` → `%25`

---

## Configuración de Clerk

1. Ve a [Clerk Dashboard](https://dashboard.clerk.com/)
2. Crea una nueva aplicación
3. Habilita métodos de autenticación:
   - Email (con email link o email code)
   - Google OAuth
4. Configura webhook (para producción):
   - URL: `https://tu-dominio.com/api/auth/clerk-webhook`
   - Eventos: `user.created`, `user.updated`
   - Copia el Signing Secret a `CLERK_WEBHOOK_SECRET`

---

## Comandos

### Instalación
```bash
npm install
```

### Desarrollo
```bash
npm run dev
```

### Lint
```bash
npm run lint
```

### Migraciones (desarrollo)
```bash
npx prisma migrate dev --name "init"
```

> **Nota**: Si hay errores de "shadow database", usa:
> ```bash
> npx prisma db push
> ```

### Migraciones (producción)
```bash
npm run prisma:migrate            # usa DATABASE_URL
# ó
npm run migrate:prod              # usa DATABASE_URL_PROD definido en .env
```

### Seed (datos iniciales)
```bash
npm run db:seed
```

Crea:
- Account por defecto
- Configuración de empresa
- Cliente genérico
- Usuario admin (username: `admin`, password: `admin`)
- Secuencias de facturación

### Prisma Studio
```bash
npm run prisma:studio
```

### Regenerar cliente Prisma
```bash
npm run prisma:generate
```

### Build de producción
```bash
npm run build
```

---

## Despliegue en Vercel

### Requisitos previos
1. Base de datos PostgreSQL accesible desde internet (ej: Supabase, Neon, Railway)
2. Cuenta de Clerk configurada
3. Variables de entorno configuradas en Vercel

### Variables de entorno en Vercel
Configura estas variables en Settings → Environment Variables:

| Variable | Requerido | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | ✅ | URL de conexión a PostgreSQL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk public key |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key |
| `JWT_SECRET` | ✅ | Secret para sesiones de subusuarios |
| `CLERK_WEBHOOK_SECRET` | ✅ | Signing secret del webhook de Clerk |
| `OPENAI_API_KEY` | ❌ | Para OCR de facturas (opcional) |
| `LEMON_STORE_ID` | ❌ | Slug de la tienda en Lemon Squeezy (subdominio) |
| `LEMON_VARIANT_ID_USD` | ❌ | Variant ID (UUID o numérico) del plan USD en Lemon Squeezy |
| `LEMON_WEBHOOK_SECRET` | ❌ | Secret del webhook de Lemon Squeezy |
| `RESEND_API_KEY` | ❌ | API Key de Resend para emails |
| `EMAIL_FROM` | ❌ | Email remitente para notificaciones |
| `NEXT_PUBLIC_APP_URL` | ❌ | URL de la app (para links en emails) |
| `NEXT_PUBLIC_META_PIXEL_ID` | ❌ | Pixel ID de Meta para eventos del navegador |
| `META_ACCESS_TOKEN` | ❌ | Token de acceso para Conversions API |
| `META_API_VERSION` | ❌ | Versión de Graph API para Meta (default: `v22.0`) |
| `CRON_SECRET` | ❌ | Secret para proteger el cron job |

### Configurar Clerk Webhook en producción
1. En Clerk Dashboard → Webhooks
2. Crear nuevo webhook:
   - URL: `https://tu-app.vercel.app/api/auth/clerk-webhook`
   - Eventos: `user.created`, `user.updated`
3. Copiar Signing Secret a variable `CLERK_WEBHOOK_SECRET`

### Configurar Lemon Squeezy (pagos USD)
1. Crea cuenta en [lemonsqueezy.com](https://lemonsqueezy.com)
2. Crea una tienda (Store) → copia el slug (subdominio) como `LEMON_STORE_ID`
3. Crea productos/variantes para cada plan de precios:
   - Producto "Plan Estándar" → $20/mes → copia el `variant_id` (UUID o numérico)
   - Producto "Plan Promocional" → $10/mes → copia el `variant_id` (UUID o numérico)
   - (puedes crear tantos como necesites)
4. En `.env` usa el variant ID del plan por defecto: `LEMON_VARIANT_ID_USD`
5. En Super Admin → Planes, asigna los variant IDs correspondientes a cada plan (o pega la URL completa de checkout)
6. Ve a Settings → Webhooks → crea uno:
   - URL: `https://tu-app.vercel.app/api/webhooks/lemon`
   - Eventos: Todos los de subscription
   - Copia el Signing Secret a `LEMON_WEBHOOK_SECRET`

**Nota sobre variantes:** Cada plan de precios puede tener su propio `lemonVariantId`. Cuando un usuario paga con tarjeta, el sistema usa automáticamente el variant ID del plan asignado a su cuenta. Si no tiene plan asignado, usa el `LEMON_VARIANT_ID_USD` del `.env`.

### Meta Pixel + Conversions API (funnel SaaS)

El proyecto incluye una integración de Meta enfocada solo en el funnel SaaS de `MOVOPos`. No se usa para las ventas internas del POS (`/sales`, `/products`, `/returns`, etc.).

#### Eventos implementados

- `ViewContent`: páginas clave del funnel (`/`, `/pricing`, `/login`, `/billing`)
- `StartTrial`: cuando se crea la suscripción de prueba al completar el onboarding inicial
- `InitiateCheckout`: cuando el usuario abre el checkout USD de Lemon Squeezy
- `Subscribe`: cuando Lemon confirma el primer pago de la suscripción

#### Cómo funciona

1. **Navegador (`Meta Pixel`)**
   - Se inicializa en el layout raíz usando `src/components/analytics/meta-pixel-provider.tsx`
   - Registra `ViewContent` automáticamente en rutas clave del funnel
   - Registra `InitiateCheckout` desde `src/app/(app)/billing/billing-client.tsx`

2. **Servidor (`Conversions API`)**
   - `StartTrial` se envía al crear la primera suscripción de billing en `src/app/select-user/actions.ts`
   - `Subscribe` se envía desde `src/lib/billing.ts` cuando `processLemonPayment()` confirma el primer pago exitoso

3. **Puente con Lemon Squeezy**
   - Al abrir el checkout, el sistema adjunta a la URL datos técnicos en `checkout[custom][...]`:
     - `meta_event_id`
     - `meta_event_source_url`
     - `meta_client_ip_address`
     - `meta_client_user_agent`
     - `meta_fbc`
     - `meta_fbp`
   - El webhook `src/app/api/webhooks/lemon/route.ts` recupera esos datos y los reusa para enriquecer el evento server-side `Subscribe`

#### Lógica de matching y deduplicación

- El sistema usa `event_id` para eventos del navegador y servidor
- `ViewContent` adapta su payload según la sesión:
  - visitante anónimo: señales base (`event_id`, URL, IP/UA, `fbp`, `fbc`)
  - usuario autenticado: agrega `email`, `external_id`, `first_name` y `last_name` si existen
- `StartTrial` y `Subscribe` priorizan datos de matching más ricos (`email`, `external_id`, nombre/apellido, país, IP, user agent, `fbp`, `fbc`)
- `Subscribe` no se envía en renovaciones si la suscripción ya estaba `ACTIVE` con proveedor `LEMON`, para evitar tratar renovaciones como nuevas altas

#### Campos enviados a Meta

- **Base del evento**
  - `event_name`
  - `event_time`
  - `event_id`
  - `event_source_url`
  - `action_source = website`

- **User data**
  - `em` (email hasheado)
  - `fn` / `ln` (nombre y apellido hasheados)
  - `country` (hasheado)
  - `external_id` (hasheado)
  - `client_ip_address` (sin hash)
  - `client_user_agent` (sin hash)
  - `fbc` / `fbp` (sin hash)

- **Custom data**
  - `StartTrial`: `currency`, `value`, `predicted_ltv`
  - `InitiateCheckout`: `currency`, `value`, `content_ids`, `contents`, `num_items`
  - `Subscribe`: `currency`, `value`

#### Archivos clave

- `src/app/layout.tsx`
- `src/components/analytics/meta-pixel-provider.tsx`
- `src/lib/meta/browser.ts`
- `src/lib/meta/server.ts`
- `src/app/select-user/actions.ts`
- `src/app/(app)/billing/actions.ts`
- `src/app/(app)/billing/billing-client.tsx`
- `src/lib/billing.ts`
- `src/app/api/webhooks/lemon/route.ts`

#### Configuración en Meta

Los eventos previstos por esta integración son:

- `ViewContent`
- `StartTrial`
- `InitiateCheckout`
- `Subscribe`

No se usa `Purchase` para la suscripción SaaS principal. La conversión final optimizable es `Subscribe`.

#### Cómo probar

1. Configura `NEXT_PUBLIC_META_PIXEL_ID` y `META_ACCESS_TOKEN`
2. En Meta Events Manager, abre **Test Events**
3. Recorre el funnel:
   - visita `/` o `/pricing` para `ViewContent`
   - crea una cuenta nueva para `StartTrial`
   - abre el checkout USD desde `/billing` para `InitiateCheckout`
   - completa un pago de prueba en Lemon para `Subscribe`
4. Verifica:
   - que lleguen los 4 eventos
   - que `Subscribe` incluya `currency` y `value`
   - que `Event Match Quality` sea aceptable
   - que no se registren eventos del POS interno

### Configurar Resend (emails de billing)
1. Crea cuenta en [resend.com](https://resend.com)
2. Ve a API Keys → crea una → copia a `RESEND_API_KEY`
3. Configura tu dominio en Resend para enviar desde `@tu-dominio.com`
4. Configura `EMAIL_FROM` con el email verificado

### Cron Job de Billing
El proyecto incluye un cron job que se ejecuta diariamente para:
- Verificar trials vencidos y bloquear cuentas
- Mover suscripciones vencidas a período de gracia (3 días)
- Bloquear cuentas con gracia vencida
- Enviar notificaciones por email

El archivo `vercel.json` ya está configurado:
```json
{
  "crons": [
    {
      "path": "/api/cron/billing",
      "schedule": "0 4 * * *"
    }
  ]
}
```

**Horario:** 04:00 AM UTC (12:00 AM hora República Dominicana)

⚠️ **Nota:** Los cron jobs en Vercel requieren plan **Pro** o superior.

### Configurar Cuentas Bancarias (transferencias DOP)
Las cuentas bancarias se almacenan en la base de datos. Para agregarlas:

1. **Opción A - Usando el script seed:**
   ```bash
   # Edita prisma/seed-bank-accounts.ts con tus datos
   npx tsx prisma/seed-bank-accounts.ts
   ```

2. **Opción B - Usando Prisma Studio:**
   ```bash
   npx prisma studio
   ```
   Navega a la tabla `BankAccount` y agrega las cuentas

3. **Opción C - SQL directo:**
   ```sql
   INSERT INTO "BankAccount" (id, "createdAt", "updatedAt", "bankName", "accountType", "accountNumber", "accountName", currency, "isActive", "displayOrder")
   VALUES 
     (gen_random_uuid(), NOW(), NOW(), 'Banco Popular', 'Cuenta de Ahorros', '123-456789-0', 'TU EMPRESA SRL', 'DOP', true, 1);
   ```

### Limitaciones en Vercel (Serverless)

⚠️ **Archivos estáticos**: Vercel no persiste archivos subidos. Para producción, considera:
- Usar un servicio de almacenamiento externo (S3, Cloudinary, Uploadthing)
- Los logos y imágenes de productos necesitan migrar a almacenamiento externo

⚠️ **Backups**: La funcionalidad de backups usa el sistema de archivos local y **no funcionará en Vercel**. Para producción:
- Usar backups automáticos de tu proveedor de base de datos
- O implementar backups a S3/almacenamiento externo

### Build Command
```bash
npx prisma generate && npm run build
```

### Después del despliegue
1. Ejecutar migraciones en la base de datos de producción:
   ```bash
   npx prisma migrate deploy
   ```
2. Opcionalmente ejecutar seed para datos iniciales

---

## Backup y Restauración de Base de Datos

### Usando la interfaz web (desarrollo/local)
1. Ir a `/backups`
2. Click en "Crear Backup"
3. Descargar el archivo .sql

### Exportar manualmente (PowerShell/Windows)
```powershell
$env:PGPASSWORD='TU_CONTRASEÑA'
pg_dump -h localhost -p PUERTO -U postgres -d movopos > backup.sql
```

### Exportar manualmente (Linux/Mac)
```bash
PGPASSWORD='TU_CONTRASEÑA' pg_dump -h localhost -p PUERTO -U postgres -d movopos > backup.sql
```

### Restaurar
**⚠️ Advertencia**: La restauración eliminará todos los datos actuales.

```powershell
# Windows PowerShell
$env:PGPASSWORD='TU_CONTRASEÑA'
psql -h localhost -p PUERTO -U postgres -c "DROP DATABASE IF EXISTS movopos;"
psql -h localhost -p PUERTO -U postgres -c "CREATE DATABASE movopos;"
psql -h localhost -p PUERTO -U postgres -d movopos -f backup.sql
```

### Después de restaurar
```bash
npx prisma db push
npx prisma generate
```

---

## Migrar a Otra PC

1. **En la PC original:**
   - Crear backup de base de datos
   - Copiar archivo `.env` y backup

2. **En la nueva PC:**
   - Instalar Node.js y PostgreSQL
   - Clonar/copiar el proyecto
   - Crear base de datos
   - Actualizar `.env` con credenciales correctas
   - Restaurar backup
   - `npm install`
   - `npx prisma generate`

> **Nota**: Copiar también `public/uploads/` si tienes logos o imágenes

---

## Notas Técnicas

### Almacenamiento de Datos
- **Dinero**: Se guarda en centavos (ej. RD$ 100.00 => `10000`)
- **ITBIS**: Tasa estándar 18% con modo configurable por cuenta (`salePricesIncludeItbis`):
  - `true`: precio incluye ITBIS
  - `false`: precio no incluye ITBIS (se suma en el total)
- **Porcentajes**: Se almacenan en basis points (1000 = 10%, 1800 = 18%)

### Secuencias y Códigos
- **Facturas**: Serie `A-00001`, `A-00002`, etc.
- **Cotizaciones**: `COT-00001`, `COT-00002`, etc.
- **Devoluciones**: `DEV-00001`, `DEV-00002`, etc.
- **Productos**: ID incremental automático (productId)

### Multi-Tenancy
- Cada tabla principal tiene `accountId` para aislamiento de datos
- Las secuencias son por cuenta (cada negocio tiene sus propios números)
- Los usernames son únicos solo dentro de cada cuenta

### Validaciones Importantes
- **Stock negativo**: Solo permitido si `allowNegativeStock` está activo en ajustes
- **Cancelación de ventas a crédito**: Solo si no tiene pagos registrados
- **Balance de CxC**: Se recalcula automáticamente al cancelar pagos
- **Stock**: Se restaura automáticamente al cancelar ventas o compras

### Archivos y Uploads
- **Logos**: Se guardan en **Uploadthing** (CDN)
  - Tamaño máximo: 5MB
  - Configurar `UPLOADTHING_SECRET` y `UPLOADTHING_APP_ID`
- **Imágenes de productos**: Se guardan en **Uploadthing** (CDN)
  - Hasta 3 imágenes por producto
  - Tamaño máximo: 2MB por imagen
  - Las imágenes se almacenan en CDN de Uploadthing

### Sistema de Logging de Errores
El sistema incluye un logger de errores integrado que guarda errores en la base de datos para monitoreo en producción:

**Uso básico:**
```typescript
import { logError, ErrorCodes } from "@/lib/error-logger"

try {
  await someOperation()
} catch (error) {
  await logError(error as Error, {
    code: ErrorCodes.SALE_CREATE_ERROR,
    accountId: user.accountId,
    endpoint: "/sales/actions",
    metadata: { additionalInfo: "..." },
  })
  throw error
}
```

**Códigos de error disponibles (`ErrorCodes`):**
- `AUTH_FAILED`, `AUTH_EXPIRED`, `AUTH_UNAUTHORIZED`
- `BILLING_PAYMENT_FAILED`, `BILLING_SUBSCRIPTION_ERROR`, `BILLING_WEBHOOK_ERROR`
- `DB_CONNECTION_ERROR`, `DB_QUERY_ERROR`, `DB_TRANSACTION_ERROR`
- `SALE_CREATE_ERROR`, `SALE_CANCEL_ERROR`, `SALE_SYNC_ERROR`
- `INVENTORY_UPDATE_ERROR`, `INVENTORY_NEGATIVE_STOCK`
- `EXTERNAL_OCR_ERROR`, `EXTERNAL_EMAIL_ERROR`, `EXTERNAL_WHATSAPP_ERROR`
- `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `UNKNOWN_ERROR`

**Severidades:**
- `LOW`: Errores menores
- `MEDIUM`: Errores que afectan parcialmente (default)
- `HIGH`: Errores críticos que bloquean funcionalidad
- `CRITICAL`: Errores que afectan todo el sistema

**Características:**
- Sanitización automática de datos sensibles (passwords, tokens, API keys)
- Determinación automática de severidad basada en el tipo de error
- Contexto completo: stack trace, endpoint, IP, user agent
- Ver errores en `/super-admin/errors`

---

## Problemas Comunes

### Error: "Authentication failed" (P1000)
- Verificar credenciales en `DATABASE_URL`
- Codificar caracteres especiales en la contraseña

### Error: "shadow database"
- Si el error menciona `Product_accountId_sku_key`, es por el SKU nullable:
  Prisma no soporta indices unicos parciales y reintenta crear uno normal.
- Solucion definitiva: el schema usa `@@index([accountId, sku])` y la unicidad
  con `sku IS NOT NULL` se crea via migracion SQL
  (`20260123180000_product_sku_partial_unique`).
- Para aplicar migraciones usa `npm run prisma:migrate` (usa `migrate deploy`).
- Para crear una nueva migracion: `npx prisma migrate dev --create-only`
  y luego ejecuta `npm run prisma:migrate`.

### Error: Clerk no redirige después de login
- Verificar que el webhook esté configurado
- Verificar `CLERK_WEBHOOK_SECRET`

### Ventas offline no sincronizan
- Verificar conexión a internet
- Ir a Ajustes → Modo Offline → "Sincronizar ahora"
- Verificar que no haya errores en la consola

---

## Rutas principales (resumen)

### Autenticación
- Login: `/login`
- Selección de usuario: `/select-user`

---

## Super Admin (implementado)

### Acceso
- Login dedicado: `/super-admin/login`
- Panel protegido con sesión propia (no usa Clerk de clientes)

### Dashboard
- KPIs: cuentas totales/activas/trial/gracia/bloqueadas, MRR DOP/USD, pagos pendientes, conversión de trial.
- Cuentas recientes y pagos pendientes con acciones rápidas.

### Cuentas
- Listado con filtros (estado, moneda, método) y búsqueda.
- Detalle de cuenta con suscripción, negocio, perfil de facturación, usuarios y pagos.
- Acciones: cambiar estado, extender trial, eliminar cuenta.

### Pagos
- Lista de pagos con filtros y búsqueda.
- Vista de comprobantes, aprobar/rechazar pagos.

### Cuentas bancarias
- CRUD de cuentas bancarias (activar/desactivar).

### Planes de Precios
Ruta: `/super-admin/plans`
- Crear/editar planes de precios personalizados
- Cada plan tiene:
  - Nombre y descripción
  - Precio en USD (para pagos con tarjeta)
  - Precio en DOP (para transferencias)
  - **Lemon Squeezy Variant ID** (para usar diferentes productos en Lemon)
  - Estado (activo/inactivo)
  - Marcador de plan por defecto
- Asignar planes a cuentas individuales desde el detalle de cuenta
- Las nuevas cuentas reciben automáticamente el plan por defecto
- Los precios se copian al momento de asignar el plan

### Monitor de Errores
Ruta: `/super-admin/errors`
- Visualizar errores del sistema en producción
- Filtros por severidad (CRITICAL, HIGH, MEDIUM, LOW)
- Filtros por estado (resueltos/sin resolver)
- Búsqueda por mensaje, código o endpoint
- Filtros por fecha
- Estadísticas en tiempo real:
  - Total de errores
  - Sin resolver
  - Por severidad
  - Últimas 24h / 7 días
- Resolver errores individual o masivamente con notas
- Eliminar errores antiguos resueltos (+30 días)
- Contexto completo: stack trace, endpoint, IP, metadata
- Sanitización automática de datos sensibles (passwords, tokens, etc.)

### Seguridad y auditoría
- Roles y permisos granulares (OWNER/ADMIN/FINANCE/SUPPORT).
- Audit log de acciones del super admin.

### Rutas implementadas
- `/super-admin` (dashboard)
- `/super-admin/accounts`
- `/super-admin/accounts/[id]`
- `/super-admin/payments`
- `/super-admin/plans`
- `/super-admin/banks`
- `/super-admin/errors`
- `/super-admin/reports` (placeholder)
- `/super-admin/settings` (placeholder)

### Migraciones y seed
- Modelos: `SuperAdmin`, `SuperAdminAuditLog`, `BillingPlan`, `ErrorLog`, enum `SuperAdminRole`, enum `ErrorSeverity`.
- Seed crea un super admin por defecto (override con `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`).
- La migración de `BillingPlan` crea automáticamente un plan "Estándar" por defecto ($20 USD / RD$1,300 DOP).

### Módulos principales
- Dashboard: `/dashboard`
- Ventas: `/sales`
- Clientes: `/customers`
- Productos: `/products`
- Categorías: `/categories`
- Compras: `/purchases`
- CxC: `/ar`
- Cuadre diario: `/daily-close`
- Reportes: `/reports`
- Ajustes: `/settings`
- Backups: `/backups`
- Facturación: `/billing`

### Módulos adicionales
- Cotizaciones: `/quotes`
- Devoluciones: `/returns`
- Proveedores: `/suppliers`
- Gastos Operativos: `/operating-expenses`
- Etiquetas de Envío: `/shipping-labels`

### Listas y consultas
- Lista de Ventas: `/sales/list`
- Lista de Compras: `/purchases/list`
- Lista de Cotizaciones: `/quotes/list`
- Lista de Devoluciones: `/returns/list`
- Recibos de Pago: `/payments/list`
- Verificar Factura: `/sales/check`
- Escanear Factura: `/purchases/scan`

### Reportes
- Reporte de Ventas: `/reports/sales`
- Reporte de Cobros: `/reports/payments`
- Reporte de Ganancia: `/reports/profit`
- Reporte de Inventario: `/reports/inventory`

---

## Licencia

Proyecto privado. Todos los derechos reservados.

# Implementacion De Productos Por Receta

## Resumen

Se implemento soporte para productos compuestos o "productos por receta", pensado para cafeterias, fast food y negocios donde un producto vendido debe descontar automaticamente sus materias primas del inventario.

Ejemplo:
- Antes: si vendias un `sandwich`, el sistema solo podia descontar stock del producto final.
- Ahora: si vendes un `sandwich`, el sistema puede descontar pan, queso, tomate, jamon y cualquier otro insumo definido en su receta.

## Objetivo Cubierto

Se agrego una tercera pestaña en la creacion y edicion de productos llamada `Productos por receta`, con soporte para:

- Receta base.
- Modificadores simples.
- Descuento automatico de insumos al vender.
- Reversion correcta de insumos al editar, cancelar o devolver una venta.
- Persistencia historica del consumo real por linea de venta.

## Archivos Principales Modificados

### Base de datos y Prisma

- `prisma/schema.prisma`
- `prisma/migrations/20260308160839_add_product_recipes/migration.sql`
- `prisma/migrations/20260308162000_add_sale_item_recipe_snapshots/migration.sql`

### Productos

- `src/app/(app)/products/actions.ts`
- `src/app/(app)/products/products-client.tsx`
- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/route.ts`

### Ventas y POS

- `src/app/(app)/sales/actions.ts`
- `src/app/(app)/sales/pos-client.tsx`
- `src/app/(app)/sales/list/sales-list-client.tsx`
- `src/app/api/sales/route.ts`
- `src/app/api/sales/[id]/route.ts`

### Devoluciones

- `src/app/(app)/returns/actions.ts`

### Cache y soporte offline

- `src/app/(app)/sync/actions.ts`
- `src/lib/indexed-db.ts`

## Cambios Implementados

### 1. Nuevo modelo de datos para recetas

Se extendio `Prisma` para soportar productos por receta.

Se agregaron:

- `ProductKind` con:
  - `BASIC`
  - `MEASURED`
  - `RECIPE`
- `Product.productKind`
- `ProductRecipeItem`
  - Relaciona producto final con sus insumos y cantidad base.
- `ProductRecipeModifier`
  - Define modificadores como `Sin tomate` o `Extra queso`.
- `ProductRecipeModifierItem`
  - Define como cada modificador altera cantidades de insumos.
- `SaleItemRecipeModifier`
  - Guarda los modificadores seleccionados en una linea de venta.
- `SaleItemConsumption`
  - Guarda el consumo real de insumos por linea vendida.

## 2. Snapshot historico de consumo

Se implemento una mejora importante para consistencia:

- Cada `SaleItem` guarda exactamente que insumos consumio y en que cantidad.
- Si luego se edita una receta, las ventas viejas no cambian historicamente.
- Esto permite que:
  - `cancelSale`
  - `updateSale`
  - `createReturn`
  - `cancelReturn`

  reviertan o reapliquen inventario con precision.

## 3. Nueva pestaña en productos

En `products-client.tsx` se agrego la pestaña:

- `Productos por receta`

La pestaña permite:

- Seleccionar insumos existentes.
- Definir cantidad por insumo.
- Agregar y quitar filas de receta base.
- Crear modificadores.
- Agregar y quitar ajustes por modificador.
- Mostrar mensajes de ayuda explicando que el producto no lleva stock propio.

Tambien se ajusto la lista de productos para mostrar:

- Un badge visual de tipo de producto.
- `Por insumos` en vez de una existencia numerica para productos `RECIPE`.

## 4. Guardado y validaciones de productos por receta

En `products/actions.ts` se implemento:

- Soporte de `productKind`.
- Soporte de `recipeItems`.
- Soporte de `modifiers`.
- Guardado transaccional de producto + receta.
- Reemplazo completo de receta al editar.

Validaciones agregadas:

- No permitir receta vacia.
- No permitir cantidades `<= 0` en receta base.
- No permitir modificadores sin nombre.
- No permitir ajustes `0` en modificadores.
- No permitir insumos repetidos en receta base.
- No permitir insumos repetidos dentro de un modificador.
- No permitir productos inactivos como insumos.
- No permitir que un producto se use a si mismo como insumo.
- No permitir usar otro producto `RECIPE` como insumo en fase 1.
- Para productos `RECIPE`, se fuerza:
  - `stock = 0`
  - `minStock = 0`
  - `purchaseUnit = UNIDAD`
  - `saleUnit = UNIDAD`

Adicionalmente:

- Si un producto normal tiene stock disponible, no se puede convertir directamente a `RECIPE` sin primero vaciar existencia.

## 5. Nuevo motor de consumo de inventario en ventas

En `sales/actions.ts` se dejo de asumir que toda venta descuenta el `productId` vendido.

Se implementaron helpers internos para:

- Resolver consumos por linea.
- Consolidar consumos repetidos.
- Validar stock real de insumos.
- Aplicar consumos.
- Revertir consumos.

### Comportamiento actual

- Producto normal:
  - Sigue descontando el mismo producto.
- Producto por receta:
  - Descuenta los insumos definidos en la receta.
  - Si tiene modificadores seleccionados, ajusta cantidades antes de aplicar el descuento.

Esto se usa ahora en:

- `createSale`
- `updateSale`
- `cancelSale`

## 6. Devoluciones y cancelaciones corregidas

En `returns/actions.ts` y `sales/actions.ts` se cambio la logica para que:

- Una devolucion de un producto por receta devuelva sus insumos proporcionalmente.
- Cancelar una devolucion vuelva a rebajar esos insumos.
- Cancelar una venta devuelva los insumos realmente consumidos.
- Editar una venta revierta primero lo anterior y aplique luego el nuevo consumo.

Esto evita inconsistencias de inventario cuando:

- se cambia una cantidad,
- se elimina una linea,
- se cancela una factura,
- o se devuelve parcialmente un producto compuesto.

## 7. POS con soporte para modificadores

En `sales/pos-client.tsx` se implemento soporte para modificadores en el POS.

### Cambios realizados

- Si el producto es `RECIPE` y tiene modificadores activos, se abre un dialog antes de agregarlo al carrito.
- El usuario puede seleccionar modificadores como:
  - `Sin tomate`
  - `Extra queso`
- La seleccion se guarda en el carrito.
- No cambia el precio en esta fase.

### Cambios en la estructura del carrito

Cada linea del carrito ahora guarda:

- `lineId`
- `productKind`
- `selectedModifierIds`
- `selectedModifierNames`
- `recipeModifiers`

Esto permite:

- Tener varias lineas del mismo producto con modificadores distintos.
- Evitar que se mezclen automaticamente lineas incompatibles.
- Mantener integridad al editar cantidad o precio.

## 8. Soporte en edicion de ventas

En `sales-list-client.tsx` se adapto la edicion de ventas para:

- Cargar modificadores ya seleccionados desde la venta existente.
- Mantener cada linea diferenciada por `lineId`.
- Enviar `selectedModifierIds` al actualizar una venta.

## 9. API actualizada

Se actualizaron endpoints para que entiendan productos por receta y modificadores:

### Productos

- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/route.ts`

Ahora aceptan y/o devuelven:

- `productKind`
- `recipeItems`
- `modifiers`

### Ventas

- `src/app/api/sales/route.ts`
- `src/app/api/sales/[id]/route.ts`

Ahora aceptan:

- `selectedModifierIds`

## 10. Cache offline y sincronizacion

Se actualizaron:

- `src/app/(app)/sync/actions.ts`
- `src/lib/indexed-db.ts`

Para que el cache offline de productos tambien incluya:

- `productKind`
- `recipeModifiers`

Y para que las ventas pendientes puedan guardar:

- `selectedModifierIds`

Esto permite que la sincronizacion no pierda la informacion necesaria para reconstruir el consumo de recetas.

## 11. Movimientos de inventario

Se ajusto `listProductMovements` en `products/actions.ts` para que el historial de un insumo refleje tambien movimientos originados por productos por receta.

Ejemplo:

- Si vendes un `sandwich`, al revisar el historial del `tomate`, ahora veras la salida correspondiente.

Ademas:

- Si se devuelve ese `sandwich`, el tomate vuelve a entrar y aparece en movimientos.

## 12. Estado actual de reportes

Se reviso el impacto en `src/app/(app)/reports/actions.ts`.

### Situacion actual

La utilidad/costo historico todavia depende principalmente de:

- `costCents` del producto
- historial de compras por `productId`

### Implicacion

Para productos por receta:

- el inventario ya funciona correctamente,
- pero el reporte de utilidad puede no reflejar aun el costo real por insumos consumidos.

### Decision aplicada

En esta primera entrega:

- se mantuvo `costCents` del producto como costo de referencia manual.
- no se rehizo todavia el calculo completo de utilidad basado en insumos.

Esto coincide con el alcance recomendado del plan.

## Migraciones Creadas

Se crearon y aplicaron:

- `20260308160839_add_product_recipes`
- `20260308162000_add_sale_item_recipe_snapshots`

## Validaciones Tecnicas Realizadas

Se verifico:

- `Prisma migrate` aplicado correctamente.
- `Prisma generate` ejecutado correctamente.
- `npx tsc --noEmit` sin errores.

## Observaciones Sobre Lint

El proyecto tiene errores de `eslint` previos no relacionados con esta funcionalidad en varios modulos.

Por eso:

- no se dejo el lint global completamente limpio,
- pero la implementacion agregada fue validada con TypeScript y revisiones puntuales.

## Limitaciones Del Primer Release

Quedo fuera de esta fase:

- recetas anidadas,
- lotes de produccion,
- costo automatico real basado en insumos dentro de reportes,
- precio dinamico por modificador,
- importacion Excel de recetas.

## Resultado Final

Con esta implementacion ya puedes:

- crear productos por receta,
- definir sus materias primas,
- agregar modificadores simples,
- venderlos desde el POS,
- descontar sus insumos automaticamente,
- cancelar ventas sin romper inventario,
- devolver ventas compuestas devolviendo insumos,
- y consultar movimientos de inventario del insumo afectado.

## Recomendacion De Siguiente Paso

Lo mas recomendable ahora es hacer pruebas manuales con estos escenarios:

1. Crear un insumo simple con stock.
2. Crear un producto por receta que use ese insumo.
3. Vender el producto y confirmar que baja el inventario del insumo.
4. Cancelar la venta y confirmar que el stock se restaura.
5. Crear otra venta y hacer una devolucion parcial.
6. Confirmar que los movimientos del insumo reflejan venta y devolucion.


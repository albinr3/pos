# Documento de Plan: Propina Legal 10% (República Dominicana)

## 1. Objetivo
Implementar el cobro opcional de la propina legal del 10% en facturación, controlado por un ajuste global en el sistema, con impacto consistente en UI, API, impresión, devoluciones, sincronización y reportes.

## 2. Definiciones funcionales cerradas
- Ajuste global `Propina legal 10%` en **Ajustes**.
- Valor por defecto del ajuste global: **apagado**.
- Si el ajuste global está apagado: en facturación **no se muestra** la opción por factura.
- Si el ajuste global está encendido: en facturación se muestra opción por factura y viene por defecto en **sí**.
- Base de cálculo: **10% sobre subtotal neto sin ITBIS** (después de descuentos; sin flete).
- Alcance v1: **solo facturas de venta** (no cotizaciones).
- API móvil: permite override por factura; si no envía el campo, se usa el ajuste global.
- Reporte de ganancia: la propina se muestra separada y **no suma a utilidad**.
- Devoluciones: reversión de propina **proporcional**.

## 3. Cambios técnicos principales
- **Base de datos (Prisma + migración)**
  - `CompanySettings`: `legalTipEnabled` (boolean, default `false`).
  - `Sale`: `legalTipApplied`, `legalTipPercentBp`, `legalTipBaseCents`, `legalTipCents`.
  - `Return`: `legalTipCents` (monto revertido).
- **Motor de cálculo**
  - Extender cálculo de venta para incluir `legalTipCents` cuando aplique.
  - `totalCents` final incluye la propina.
  - En devoluciones, calcular reversión proporcional usando base de propina de la venta original.
- **UI**
  - Ajustes: switch de propina legal.
  - Facturación: checkbox/toggle por factura (visible solo si ajuste global activo).
- **API**
  - `company-settings`: exponer/aceptar flag de propina legal.
  - `sales` (crear/editar/listar/detalle): aceptar y devolver campos de propina.
  - Compatibilidad con clientes actuales que no manden campos nuevos.
- **Impresión**
  - Ticket/factura: línea separada `Propina legal (10%)` cuando aplique.
- **Reportes y caja**
  - Ventas/caja: propina incluida en cobro y desglosada.
  - Ganancia: excluir propina de utilidad, mostrar métrica separada.
- **Offline/sync**
  - Persistir y sincronizar el estado y montos de propina por factura.

## 4. Impacto en interfaces públicas
- Nuevo flag en configuración de compañía para habilitar propina legal.
- Nuevos campos en payload/respuesta de ventas para control y montos de propina.
- Nuevos agregados en endpoints/reportes para propina cobrada/devuelta/neta.

## 5. Plan de pruebas
- Unitarias de cálculo (con/sin ITBIS incluido, descuentos, redondeo).
- Integración de ventas (ajuste global ON/OFF + override API).
- Devoluciones parciales/totales con reversión proporcional.
- Impresión con/sin propina.
- Reportes: utilidad sin propina, caja con propina desglosada.
- Regresión: ventas históricas sin cambios y compatibilidad con API anterior.

## 6. Supuestos y límites
- No se condiciona por canal (delivery/consumo local) en v1.
- No aplica a cotizaciones en esta fase.
- Se conserva comportamiento actual para registros históricos.

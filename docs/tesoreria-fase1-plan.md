# Plan Fase 1 Tesorería (Cuenta Exacta)

## Objetivo
Implementar la base de tesorería para que el sistema pueda mostrar saldos esperados por cuenta (banco/caja) usando movimientos reales del negocio.

## Alcance de Fase 1
- Catálogo de cuentas de tesorería por negocio (`caja` y `banco`).
- Saldo inicial manual por cuenta.
- Asociación de cuenta de tesorería en:
  - ventas al contado (incluyendo pagos divididos),
  - recibos de cobros,
  - compras,
  - gastos operativos,
  - devoluciones al contado.
- Nueva pantalla `/treasury` con:
  - saldos por cuenta,
  - movimientos (entradas/salidas) por rango de fecha,
  - mantenimiento básico de cuentas.
- Nuevos permisos granulares para tesorería.

## Reglas funcionales
- Método-cuenta: flexible (cualquier método puede usar cualquier cuenta).
- Saldos negativos: permitidos con alerta (no bloquea guardado).
- Sin cierre de caja ni conciliación bancaria en esta fase.

## Cambios técnicos principales
- Prisma:
  - `TreasuryAccount`, `TreasuryOpeningBalance`, `TreasuryAccountType`.
  - Nuevos campos `treasuryAccountId` y equivalentes en tablas operativas.
  - Nuevos permisos en `User`.
- Backend:
  - validaciones y persistencia de cuenta en acciones existentes.
  - acciones de tesorería para listar saldos y movimientos.
- Frontend:
  - selección de cuenta en formularios operativos.
  - módulo de tesorería en navegación principal.

## Fuera de alcance (Fase 2+)
- Transferencias internas entre cuentas.
- Reversos de transferencia.
- Cierre de caja/conciliación.

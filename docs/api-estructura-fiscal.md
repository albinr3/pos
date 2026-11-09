# API fiscal interna — etapa 1

`GET /api/fiscal/capabilities` requiere los mismos tokens móviles existentes: `X-Clerk-Authorization: Bearer <token>` y `X-SubUser-Token: <token>`. No requiere cookies. La empresa se obtiene exclusivamente de la sesión; no se acepta un identificador de empresa como autoridad.

La respuesta incluye `policy`, `permissions`, `recognizedTypes`, `permittedTypes`, `operations` y `connectionRequired`. Reconocimiento y permiso de perfil no indican que la operación esté implementada: todas las operaciones, incluida emisión, son `false`. Sin configuración, `enabled` es `false` y perfil, ambiente, versión y fecha son `null`. La conexión externa permanece pendiente.

```sh
curl -H "X-Clerk-Authorization: Bearer <CLERK_TOKEN>" -H "X-SubUser-Token: <SUBUSER_TOKEN>" https://<servidor>/api/fiscal/capabilities
```

La consulta requiere al menos uno de los cuatro permisos fiscales o ser dueño. Devuelve 401 sin autenticación, 403 sin permiso y 500 ante un fallo del servidor. Sus errores incluyen código, mensaje, campos afectados, posibilidad de reintento e identificador de correlación. Consultar y reintentar no produce cambios.

Por ahora las rutas comerciales de ventas, compras, cobros, pagos a proveedores, devoluciones, gastos y la cola de caja rechazan los campos fiscales y tipos E no admitidos con HTTP 400 y código `FISCAL_NOT_AVAILABLE`. Si se fuerza un perfil activo en datos de prueba, las mutaciones comerciales protegidas se rechazan también cuando omiten el bloque fiscal. Todavía no hay preparación, numeración, preferencias editables ni conexión a un proveedor.

El contexto autenticado de `GET /api/cash-shifts` incluye `fiscalQueuePolicy: { "version": 0, "enabled": false }`; la versión cero significa que no existe configuración. La cola de caja conserva esa versión en `cashOperation.fiscalPolicyVersion`. Una operación nueva con versión distinta de la vigente recibe HTTP 409 y código `FISCAL_POLICY_CHANGED`, sin aplicar efectos; se conserva para revisión. Un reintento de una operación ya confirmada recupera su resultado aunque la política haya cambiado. La comparación se efectúa en la transacción y la versión confirmada queda registrada en `CashOperation`. Un descarte explícito con motivo continúa disponible. Los clientes anteriores sin versión siguen admitidos mientras la política esté desactivada, pero no pueden iniciar operaciones bajo una política activa.

La web utiliza esta cola también para ventas y cobros cuando no hay turnos; en ese caso `cashShiftId` y `clientSequence` son `null`, conservando identificador, autor y política. Los pendientes creados con la cola antigua que carecen de esos datos no se reasignan ni eliminan automáticamente. En Cuadre diario, el empleado puede revisar los que identifican a su empresa y usuario; el dueño puede revisar los de su empresa aunque el autor sea otro empleado o no esté registrado. Después de comparar el registro y aportar un motivo, puede retirarlo: el servidor conserva la copia y el revisor en auditoría, sin crear ni modificar una venta o cobro. El retiro se reintenta con una identidad estable. Si el registro cambió durante la revisión, no se elimina la nueva versión. Los registros que no identifican empresa permanecen en el dispositivo y no se muestran a otra empresa; aún necesitan un procedimiento de conciliación antes de habilitar la transición fiscal.

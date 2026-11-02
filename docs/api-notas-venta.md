# Notas de venta: web y app móvil

La nota es opcional y se captura al crear la venta. Se imprime en las facturas de 80 mm y tamaño carta, y se incluye en los PDF generados desde esos formatos. No modifica los importes.

## Crear una venta

`POST /api/sales` acepta el campo `notes` de tipo `string | null`. También puede omitirse para mantener la compatibilidad con versiones anteriores de la app.

```json
{
  "customerId": null,
  "type": "CONTADO",
  "paymentMethod": "EFECTIVO",
  "treasuryAccountId": "ID_CUENTA_EFECTIVO",
  "items": [
    { "productId": "ID_PRODUCTO", "quantity": 1, "unitPriceCents": 10000 }
  ],
  "notes": "Entregar mañana.\nLlamar a José antes de salir."
}
```

Enviar las credenciales móviles habituales (`Authorization` o `X-Clerk-Authorization`, y `X-SubUser-Token`). Si se usa el protocolo de caja, conservar el objeto `cashOperation` y el token de dispositivo correspondientes; este ejemplo solo ilustra los datos de la venta.

- Límite: 1.000 unidades UTF-16, igual que `maxLength` en el formulario web; se verifica antes de quitar espacios.
- Se eliminan los espacios exteriores y se conservan los saltos de línea interiores.
- Campo omitido, `null`, cadena vacía o solo espacios se guardan como `null`.
- Otros tipos o más de 1.000 caracteres reciben HTTP 400 con `{ "error": "..." }`, sin crear una venta.
- La respuesta HTTP 201 incluye `notes: string | null` con el valor guardado.

## Consultar e imprimir

`GET /api/sales` incluye `notes: string | null` en cada venta de `data`. `GET /api/sales/:id` devuelve el mismo campo en el detalle. La app móvil puede usar este valor para imprimir la nota como texto, conservando saltos de línea y ajustándolo al ancho del papel. Si es `null`, omitir el bloque.

La nota no se puede editar mediante `PUT /api/sales/:id`: las modificaciones de otros datos conservan la nota original.

## Operaciones de caja y ventas sin conexión

`POST /api/cash-shifts/operations` admite `payload.notes` cuando `kind` es `"sale"`. Aplica la misma validación y devuelve la nota guardada dentro de `result.notes`.

```json
{
  "kind": "sale",
  "payload": {
    "customerId": null,
    "type": "CONTADO",
    "paymentMethod": "EFECTIVO",
    "treasuryAccountId": "ID_CUENTA_EFECTIVO",
    "items": [{ "productId": "ID_PRODUCTO", "qty": 1, "unitPriceCents": 10000 }],
    "notes": "Retirar por el almacén."
  },
  "cashOperation": {
    "clientOperationId": "IDENTIFICADOR_ESTABLE",
    "accountId": "ID_NEGOCIO",
    "userId": "ID_USUARIO",
    "cashShiftId": "ID_TURNO",
    "clientSequence": 1
  }
}
```

Conservar la nota junto con todo el payload al encolar la operación y reenviar exactamente la misma operación al reintentar. Cambiar la nota después de enviarla cambia el contenido de la operación y no es un reintento válido.

La web conserva la nota en el carrito y en ambas colas de ventas pendientes. La interfaz móvil y su almacenamiento local se actualizan en el repositorio de la app móvil.

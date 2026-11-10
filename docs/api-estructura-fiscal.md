# API fiscal interna — preparación local

`GET /api/fiscal/capabilities` requiere los mismos tokens móviles existentes: `X-Clerk-Authorization: Bearer <token>` y `X-SubUser-Token: <token>`. No requiere cookies. La empresa se obtiene exclusivamente de la sesión; no se acepta un identificador de empresa como autoridad.

La respuesta incluye `policy`, `permissions`, `recognizedTypes`, `permittedTypes`, `operations` y `connectionRequired`. `operations.preview` es verdadero solo con permiso de preparación y perfil DO configurado, incluso apagado. `operations.manageSequences` indica permiso y perfil DO de prueba configurado. La preparación local requiere perfil activo y validado; la emisión externa permanece bloqueada. Sin configuración, `enabled` es `false` y perfil, ambiente, versión y fecha son `null`.

## Secuencias fiscales de prueba

La autenticación móvil usa los encabezados habituales de Clerk y subusuario. La empresa siempre procede de la sesión. Gestionar rangos e historial requiere `canManageFiscalSequences` o ser dueño; disponibilidad también admite `canPrepareFiscalDocuments`. La web y la aplicación móvil utilizan los mismos servicios. El perfil debe ser `DO_ECF` en `TEST` para crear o modificar rangos, aunque el módulo esté apagado.

`GET /api/fiscal/sequences?type=E31&take=50&cursor=...` lista rangos ordenados por tipo, número inicial e ID; `type` y `cursor` son opcionales, `take` admite 1–200 y la respuesta contiene `data` y `nextCursor`. `GET /api/fiscal/sequences/{id}` consulta un rango. `GET /api/fiscal/sequences/{id}/history?take=50&cursor=...` devuelve eventos ordenados por fecha e ID, con actor, motivo y detalles. Los IDs y cursores ajenos responden 404.

`POST /api/fiscal/sequences` recibe, por ejemplo, `{ "type":"E31", "environment":"TEST", "rangeStart":"1", "rangeEnd":"100", "expiresOn":"2027-12-31", "active":true, "authorizationRef":"Referencia de prueba", "notes":null, "reason":"Preparación local" }`. E32 y E34 requieren `expiresOn: null`. Los rangos son cadenas de hasta diez dígitos, positivas e inclusivas; no se aceptan contador ni número elegido por el cliente. El soporte es una referencia escrita, no una carga de archivo.

`PATCH /api/fiscal/sequences/{id}` requiere `{ "expectedVersion":1, "expiresOn":"2027-12-31", "active":false, "authorizationRef":"Referencia de prueba", "notes":null, "reason":"Desactivar rango" }`. Tipo, ambiente y límites no se editan; una versión obsoleta responde 409. Todos los rangos, incluso los inactivos, deben ser disjuntos; solo uno puede estar activo por tipo y ambiente. La activación de un rango no activa el módulo fiscal.

En POST y PATCH, `readyForRollover` es un booleano opcional: `true` prepara un rango inactivo para relevo y no puede combinarse con `active: true`. Al crear, su valor predeterminado es `false`; al modificar, omitirlo conserva el estado anterior, salvo al activar el rango, que lo desmarca. Los rangos inactivos existentes no se preparan automáticamente. La respuesta de cada rango incluye `readyForRollover`. Las modificaciones y quién las hizo quedan en el historial.

Al reservar el último número de un rango activo, el servidor activa en la misma transacción el rango preparado y vigente con menor número inicial del mismo tipo, empresa, perfil y ambiente. Omite rangos vencidos o sin números, y registra eventos `EXHAUSTED` y `ROLLOVER` con ambos rangos y documento. Si no hay relevo se conserva la última reserva y la siguiente solicitud recibe `SEQUENCE_UNAVAILABLE`; se requiere intervención autorizada. Desactivar o vencer un rango no activa otro automáticamente. El cliente no selecciona el próximo número.

`GET /api/fiscal/sequences/availability?type=E31` devuelve `data` con los rangos activos, cantidades como cadenas y alertas `expired`, `exhausted`, `lowRemaining`, `expiringSoon` y `usable`. Es informativa: otra operación puede consumir el último número antes de reservar. El vencimiento se evalúa en Santo Domingo. Las alertas se activan con 10 % o menos de disponibilidad y hasta 30 días antes del vencimiento. La reserva es interna y se integra en la etapa 6; la API no expone asignaciones ni emisión.

Los errores nuevos usan `{error:{code,message,fields,retryable,correlationId}}`: 400 datos inválidos, 401 sin sesión, 403 permiso, 404 recurso ajeno o inexistente, 409 conflicto de rango, versión o perfil y 500 error interno. Las respuestas son privadas y no se almacenan en caché. Estos datos son exclusivamente de prueba y no acreditan autorización fiscal.

```sh
curl -H "X-Clerk-Authorization: Bearer <CLERK_TOKEN>" -H "X-SubUser-Token: <SUBUSER_TOKEN>" https://<servidor>/api/fiscal/capabilities
```

La consulta requiere al menos uno de los cuatro permisos fiscales o ser dueño. Devuelve 401 sin autenticación, 403 sin permiso y 500 ante un fallo del servidor. Sus errores incluyen código, mensaje, campos afectados, posibilidad de reintento e identificador de correlación. Consultar y reintentar no produce cambios.

Por ahora las rutas comerciales de ventas, compras, cobros, pagos a proveedores, devoluciones, gastos y la cola de caja rechazan los campos fiscales y tipos E no admitidos con HTTP 400 y código `FISCAL_NOT_AVAILABLE`. Si se fuerza un perfil activo en datos de prueba, las mutaciones comerciales protegidas se rechazan también cuando omiten el bloque fiscal. Todavía no hay preparación, numeración ni conexión a un proveedor.

El contexto autenticado de `GET /api/cash-shifts` incluye `fiscalQueuePolicy: { "version": 0, "enabled": false }`; la versión cero significa que no existe configuración. La cola de caja conserva esa versión en `cashOperation.fiscalPolicyVersion`. Una operación nueva con versión distinta de la vigente recibe HTTP 409 y código `FISCAL_POLICY_CHANGED`, sin aplicar efectos; se conserva para revisión. Un reintento de una operación ya confirmada recupera su resultado aunque la política haya cambiado. La comparación se efectúa en la transacción y la versión confirmada queda registrada en `CashOperation`. Un descarte explícito con motivo continúa disponible. Los clientes anteriores sin versión siguen admitidos mientras la política esté desactivada, pero no pueden iniciar operaciones bajo una política activa.

La web utiliza esta cola también para ventas y cobros cuando no hay turnos; en ese caso `cashShiftId` y `clientSequence` son `null`, conservando identificador, autor y política. Los pendientes creados con la cola antigua que carecen de esos datos no se reasignan ni eliminan automáticamente. En Cuadre diario, el empleado puede revisar los que identifican a su empresa y usuario; el dueño puede revisar los de su empresa aunque el autor sea otro empleado o no esté registrado. Después de comparar el registro y aportar un motivo, puede retirarlo: el servidor conserva la copia y el revisor en auditoría, sin crear ni modificar una venta o cobro. El retiro se reintenta con una identidad estable. Si el registro cambió durante la revisión, no se elimina la nueva versión. Los registros que no identifican empresa permanecen en el dispositivo y no se muestran a otra empresa; aún necesitan un procedimiento de conciliación antes de habilitar la transición fiscal.

## Previsualización documental local

`POST /api/fiscal/documents/preview` requiere los dos encabezados móviles habituales y `canPrepareFiscalDocuments` o dueño. Requiere perfil DO_ECF configurado; puede estar desactivado. No crea documentos, reservas, caja ni inventario. La versión opcional `expectedPolicyVersion` debe coincidir con capacidades. El emisor debe coincidir con los datos configurados; cualquier ID de cliente, proveedor, producto, concepto, origen o documento referenciado se verifica dentro de la empresa autenticada.

Los decimales son cadenas con punto: cantidad y descuentos hasta dos decimales, precio y tasa hasta cuatro. Los importes devueltos están en unidades de la moneda, no centavos; todos tienen dos decimales. `priceIncludesTax` determina si el precio incluye el ITBIS. El descuento global se reparte entre líneas facturables de bienes y servicios. Los tipos de línea `ENVIO`, `PROPINA` y `RECARGO` requieren tratamiento tributario explícito. El descuento y recargo de línea se expresan en la misma base del precio. `NO_FACTURABLE` se informa en bases, pero no se suma al total facturable. ISR se calcula sobre la base e ITBIS sobre el impuesto de la línea. El solicitante es responsable de introducir las tasas que correspondan; la previsualización no certifica elegibilidad tributaria.

```json
{
  "type": "E31", "issueDate": "2026-11-09", "expectedPolicyVersion": 1,
  "issuer": { "name": "Empresa de prueba", "identification": "123456789", "country": "DO" },
  "buyer": { "name": "Cliente de prueba", "identification": "101000001", "country": "DO" },
  "incomeType": "01", "payment": { "type": "CONTADO" },
  "currency": { "operation": "DOP", "reporting": "DOP" },
  "lines": [{ "description": "Producto de prueba", "kind": "BIEN", "unit": "UNIDAD", "quantity": "1.00", "unitPrice": "118.0000", "taxTreatment": "GRAVADO_18", "priceIncludesTax": true }],
  "globalDiscount": "0.00"
}
```

La respuesta incluye `state: BORRADOR`, `externalResult: null`, versión de política y reglas, líneas, `totals`, `reportingTotals` y advertencias. El servidor calcula todos los importes; los campos desconocidos, números fiscales y respuestas externas se rechazan. Cada línea admite `discount`, `surcharge`, `productId` o `conceptId`, `retentionAgent: "1"` y `withholdings: [{kind: "ISR" | "ITBIS", rate: "10.0000"}]`. Tratamientos: `GRAVADO_18`, `GRAVADO_16`, `TASA_CERO`, `EXENTO`, `NO_FACTURABLE`. Para otra moneda enviar `currency.rate` en DOP por unidad y `currency.rateDate` como `YYYY-MM-DD`. Para indicar origen enviar `source: {kind: "SALE" | "PURCHASE" | "RETURN" | "EXPENSE", id: "..."}`. E33/E34 requieren `reference` con `documentId`, `issueDate` y `modificationCode`; el servidor contrasta el documento conservado y la identidad de la contraparte. E34 acepta los códigos 1, 2 y 3; E33 utiliza 3.

La versión local actual `DO_ECF_2026_11_09_13`, comprobada mediante pruebas enfocadas y un recorrido HTTP aislado; la conciliación acumulada permanece pendiente, requiere `incomeType` 01–06 en los tipos de venta y notas; no lo admite en E41/E43/E47. El emisor debe tener país `DO` y los países de las partes deben figurar en el catálogo fiscal. Para identificaciones dominicanas se exige el formato numérico de 9 u 11 dígitos sin separadores; esta comprobación no verifica el dígito de control ni la inscripción ante la DGII. Las identificaciones extranjeras conservan su texto y admiten hasta 20 caracteres. `payment.type` es `CONTADO`, `CREDITO` o `GRATUITO`; es obligatorio salvo en E43/E47. En crédito, `dueDate` es obligatorio excepto en E43, que no lo admite, y E47, donde es opcional; si se informa no puede preceder la emisión. E32 exige comprador desde DOP 250,000. E41 requiere `supplier.declaredCondition: "NO_REGISTRADO"` como declaración administrativa y retención del 100 % del ITBIS de cada línea gravada. Esa declaración no sustituye la consulta oficial de la DGII. E46 requiere bienes; los servicios exportados se documentan con factura de consumo. E47 exige `supplier.residence` distinto de `DO`, independientemente del país de identificación extranjera. E41/E47 requieren `retentionAgent: "1"` por línea; E41 exento conserva cero de ITBIS retenido y E47 exige ISR. `totals.withheldByKind` separa los importes totales de ISR e ITBIS y conserva los ceros. E32/E43/E44/E45/E46 no admiten retenciones. Todas las líneas gravadas comparten el mismo modo de precio con o sin impuesto, como exige el indicador documental. Fuente: artículos 7 y 10 de la [Norma 05-19 de la DGII](https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf) y [formato e-CF, campos RNC](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf).

Ejemplo E41 gravado (datos ficticios; no acredita la situación del proveedor):

```json
{
  "type": "E41", "issueDate": "2026-11-09",
  "issuer": { "name": "Empresa de prueba", "identification": "123456789", "country": "DO" },
  "supplier": { "name": "Proveedor de prueba", "identification": "00100000001", "country": "DO", "declaredCondition": "NO_REGISTRADO" },
  "payment": { "type": "CONTADO" }, "currency": { "operation": "DOP", "reporting": "DOP" },
  "lines": [{ "description": "Producto", "kind": "BIEN", "unit": "UNIDAD", "quantity": "1", "unitPrice": "118.00", "taxTreatment": "GRAVADO_18", "priceIncludesTax": true, "retentionAgent": "1", "withholdings": [{ "kind": "ITBIS", "rate": "100" }] }]
}
```

Ejemplo E47 de servicio pagado al exterior (la elegibilidad del pago se verificará al integrar la etapa 13):

```json
{
  "type": "E47", "issueDate": "2026-11-09",
  "issuer": { "name": "Empresa de prueba", "identification": "123456789", "country": "DO" },
  "supplier": { "name": "Beneficiario de prueba", "identification": "EXT-123", "country": "US", "residence": "US" },
  "currency": { "operation": "DOP", "reporting": "DOP" },
  "lines": [{ "description": "Servicio", "kind": "SERVICIO", "unit": "UNIDAD", "quantity": "1", "unitPrice": "100.00", "taxTreatment": "EXENTO", "priceIncludesTax": false, "retentionAgent": "1", "withholdings": [{ "kind": "ISR", "rate": "10" }] }]
}
```

En E34 con más de 30 días `reference.creditIndicator` es 1. Las líneas conservan su clasificación y su ITBIS documentado (`tax`); `taxNotCreditable` identifica la parte que no se rebaja o devuelve y `creditEligible` resta ese importe del bruto. `net` es el crédito elegible menos retenciones. En 30 días o menos el indicador es 0 y `taxNotCreditable` es cero. La corrección de texto con código 2 exige que el importe calculado de cada línea sea cero y devuelve `creditEligible` y `net` en cero; la copia original permanece intacta. El bruto de la nota no puede superar el bruto del comprobante original y ambos deben usar la misma moneda. La suma de notas anteriores y reservas se abordará al integrar E34 en la etapa 9. Los importes son una previsualización local, no un XML firmado ni un reconocimiento de la DGII. Fuente: [formato e-CF DGII, campo MontoItem y nota 74](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf), [tratamiento de notas de más de 30 días](https://ayuda.dgii.gov.do/conversations/discusiones/facturacion-electronica-notas-de-credito-a-mas-de-30/69fcf58e8ba6c816b5716db4) y [correcciones de texto](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/Otros/Documents/Preguntas-frecuentes-Nuevos-Contribuyentes.pdf).

Para E34 con código 1 o 3, cada línea debe incluir `originalLine`, índice entero desde 1, sin repetir. Se comparan concepto, unidad, precio y tratamiento tributario con la copia conservada, y se limita el importe de cada línea al bruto original proporcional a su cantidad, redondeado a dos decimales. Las copias originales sin líneas comprobables se rechazan; el prorrateo puede restringir un centavo por redondeo. El código 2 no requiere el índice. Esta validación aún no sustituye el control acumulado de notas y reservas de la etapa 9.

El código 1 requiere que el importe de la nota coincida con el saldo pendiente del comprobante afectado, según la [DGII](https://ayuda.dgii.gov.do/conversations/facturacin-electrnica/ca4275-cmo-puedo-corregir-o-anular-un-comprobante-electrnico-ecf/5f3c17c98cd858ce87aabafb). Como la previsualización todavía no calcula ese saldo ni acumula notas anteriores, emite una advertencia expresa para los códigos 1 y 3; una respuesta exitosa no acredita el cumplimiento de esa condición.

Cuando E33 o E34 modifica una E32 cuyo total original es igual o superior a DOP 250,000, la copia original y la nota deben identificar al comprador. El umbral se evalúa con el total de reporte guardado en la copia, no con el importe de la nota; una copia en otra moneda sin ese total se rechaza. Fuente: campos RNC y nombre del comprador del [formato e-CF](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf).

En líneas exentas con agente retenedor, E31, E33, E34 y E41 conservan una retención ITBIS de `0.00` aunque no se envíe explícitamente; E47 no admite ese campo. Esta condición corresponde a la nota 53 del formato oficial.

Para `payment.type: "GRATUITO"`, el formato oficial indica que la entrega no da derecho a crédito fiscal. La previsualización advierte que el neto matemático no representa un cobro; no constituye una liquidación comercial de la entrega gratuita.

E31 y E45 exigen RNC o cédula dominicana del comprador; el identificador extranjero no sustituye ese dato para esos tipos. El país informado indica la jurisdicción de la identificación conservada, y no acredita la residencia de la persona.

Errores: 400 estructura o campos desconocidos, 401 sesión ausente, 403 permiso, 404 referencia ajena o inexistente, 409 perfil o versión y 422 reglas documentales. `error.fields` contiene objetos `{field, message}`. La capacidad de previsualizar no indica autorización de DGII ni disponibilidad de una secuencia. Los diez ejemplos locales están en `scripts/fiscal-document-core.test.mjs` y se ejecutan sin proveedor.

## Preferencias fiscales

`GET /api/fiscal/settings` y `PUT /api/fiscal/settings` requieren los mismos encabezados móviles y el permiso `canManageFiscalSettings` o ser dueño. La empresa procede de la sesión. La respuesta es privada y contiene perfil, datos fiscales, versión, fecha de aplicación, estado calculado, campos faltantes, `externalReadiness: NOT_CONNECTED`, `activationAvailable: true` y `activationBlockedReason` vacío. La versión cero indica que no existe configuración guardada.

Ejemplo de `PUT` (reemplazar la versión por la obtenida en GET):

```json
{ "expectedVersion": 0, "jurisdiction": "DO", "regime": "DO_ECF", "environment": "TEST", "legalName": "Empresa de prueba", "taxId": "123456789", "fiscalAddress": "Dirección de prueba", "fiscalEmail": "fiscal@example.test", "fiscalPhone": null }
```

Para quitar el perfil enviar `jurisdiction` y `regime` como `null` con `enabled: false`; los cinco datos admiten `null` o texto. Se permiten datos incompletos mientras esté desactivado; la activación local requiere perfil, razón social, identificación, dirección y correo, sin acreditar autorización de DGII ni verificar la validez legal de la identificación. Enviar `enabled: true` activa el módulo en `TEST`; `enabled: false` lo desactiva. Omitir `enabled` conserva el estado existente. Se rechazan campos desconocidos y la configuración activa incompleta. Los cambios quedan versionados y auditados.

Errores: 400 `INVALID_INPUT`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `VERSION_CONFLICT`, 422 `CONFIGURATION_INCOMPLETE`, 500 `INTERNAL_ERROR`; todos incluyen mensaje, campos, reintentabilidad y correlación. Ante conflicto de versión consultar de nuevo antes de guardar; un cambio de preferencias incrementa la versión de política y los pendientes con versión anterior se conservan para revisión. Con el módulo activo se admiten las ventas y cobros autorizados descritos más abajo; las operaciones de etapas pendientes continúan protegidas. La activación no conecta proveedores ni permite emisión. El recurso comercial `/api/company-settings` no cambia.


### Datos maestros fiscales opcionales (etapa 3)

Las rutas existentes de clientes aceptan y devuelven `fiscalIdentificationType`, `fiscalIdentificationCountry`, `fiscalIdentification`, `fiscalLegalName`, `fiscalEmail`, `fiscalAddress` y `fiscalPreferredReceiptType`. Las de proveedores aceptan y devuelven los tres primeros campos, `fiscalLegalName`, `fiscalResidence` y `fiscalDeclaredCondition`. Las de productos admiten `fiscalItemType` (`BIEN` o `SERVICIO`), `fiscalUnit` y `fiscalTaxTreatment` (`GRAVADO`, `TASA_CERO`, `EXENTO` o `NO_FACTURABLE`). Todos son opcionales y pueden enviarse como `null` para borrarlos. Omitirlos en una actualización conserva su valor. La identificación fiscal extranjera se almacena como texto, sin limpieza de cédula dominicana. Estos campos no acreditan habilitación ni elegibilidad fiscal.

Los conceptos sin inventario quedan reservados para la etapa documental y no aparecen en el POS. `GET /api/fiscal/concepts` devuelve `{ data, nextCursor }` ordenado por nombre e ID; admite `take` de 1 a 200 (50 por defecto) y `cursor` de la página anterior. `POST /api/fiscal/concepts` crea un concepto, `GET /api/fiscal/concepts/{id}` lo consulta, `PUT` lo edita y `DELETE` lo desactiva (204). Todas las operaciones requieren `canEditProducts` o ser dueño, usan los encabezados móviles habituales y resuelven la empresa de la sesión. Una búsqueda por un ID ajeno responde 404. POST requiere `name` y `kind` (`SERVICIO` o `CARGO`); admite `fiscalUnit` y `fiscalTaxTreatment` opcionales y anulables. PUT requiere nombre y tipo, y conserva los campos fiscales opcionales omitidos. Ejemplo: `{ "name": "Consultoría", "kind": "SERVICIO", "fiscalTaxTreatment": "EXENTO" }`. POST no garantiza idempotencia: ante una respuesta perdida hay que consultar antes de repetir. Los errores contienen `error.code`, `message`, `fields`, `retryable` y `correlationId`; los estados son 400, 401, 403, 404 y 500.

`GET /api/fiscal/catalogs` requiere al menos uno de los permisos de gestión de clientes, proveedores o edición de productos; devuelve solo los catálogos correspondientes. El catálogo de comprobantes aparece únicamente con el perfil configurado `DO_ECF`, incluso cuando está apagado para operaciones. Los códigos de país son ISO alfa-2. Los catálogos son valores de captura de MOVOPos, no una certificación de DGII. El servidor rechaza valores nuevos desconocidos con HTTP 400; conserva valores libres históricos sin cambios y permite retirarlos. Añadir una preferencia de comprobante E exige el perfil DO configurado. Las rutas comerciales de clientes, proveedores y productos conservan su formato de errores anterior y añaden `field` en errores fiscales. Los detalles se consultan mediante `GET /api/customers/{id}`, `GET /api/suppliers/{id}` y `GET /api/products/{id}`.

La API de clientes también admite `fiscalPreferredReceiptTypes` como arreglo de códigos. Si se envía, reemplaza la selección completa; un arreglo vacío la borra. Las respuestas incluyen el arreglo y conservan `fiscalPreferredReceiptType` como primera opción para clientes antiguos. Si una actualización antigua reenvía esa primera opción sin cambiarla, se conservan las demás; si envía otra o `null`, reemplaza o borra la selección. Al omitir ambos campos se conserva la selección. La preferencia nunca sustituye la validación del documento.

La [especificación OpenAPI](openapi-estructura-fiscal.json) describe las operaciones de listado, creación, detalle y edición de los tres recursos, con ejemplos fiscales y ordinarios, permisos, paginación y errores comerciales. Los listados de proveedores y productos devuelven formas distintas de sus detalles. En `PUT`, la conservación por omisión se aplica a los campos fiscales: enviar también la ficha comercial completa, porque otros campos omitidos pueden restablecerse.

<!-- Evitar enumeraciones cerradas en respuestas y ediciones: los valores libres históricos deben seguir siendo válidos sin cambios. -->
Para los campos con catálogo, OpenAPI muestra los códigos admitidos para valores nuevos en `x-valores-nuevos-admitidos`; la consulta de catálogos proporciona las opciones vigentes. Las respuestas y ediciones también pueden contener valores históricos ajenos a esa lista. El error comercial conserva la forma `{ "error": "mensaje", "field": "campo" }` cuando se identifica un campo fiscal inválido; `field` no está presente en todos los errores y algunas validaciones antiguas todavía pueden responder 500.
## Bandeja y preparación local (etapa 6)

Todas las rutas requieren `X-Clerk-Authorization: Bearer <token>` y `X-SubUser-Token`. La empresa y el empleado proceden de la sesión. Las respuestas son privadas y no se almacenan en caché. `canPrepareFiscalDocuments` permite crear y editar borradores, confirmar y recuperar sus propias operaciones; `canViewFiscalDocuments` permite consultar bandeja, detalle, historial y operaciones de la empresa. Al apagar el módulo se mantienen las consultas y la recuperación de operaciones ya confirmadas.

- `GET /api/fiscal/documents?source=SALE&type=E31&state=BORRADOR&party=texto&from=2026-11-01&to=2026-11-30&take=50&cursor=...`: listado `{data,nextCursor}`, fecha de registro, orden descendente por fecha e ID; `source` admite `SALE`, `PURCHASE`, `RETURN`, `EXPENSE`. `sourceId` filtra la operación de origen; `party` busca ID o nombre conservado.
- `POST /api/fiscal/documents`: `{ "operationId": "uuid-estable", "document": { ... } }`, donde `document` tiene la forma de previsualización, `source` y `expectedPolicyVersion`. Devuelve `{id,revision,state}`. La revisión se valida antes de guardarse y el origen debe pertenecer a la empresa.
- `GET /api/fiscal/documents/{id}` devuelve copia, entrada vigente, revisiones conservadas, asignación, referencias y trabajos. `PUT` recibe `{operationId,expectedRevision,document}`; el tipo y origen no cambian.
- `GET /api/fiscal/documents/{id}/history?take=50&cursor=...` devuelve `{data,nextCursor}` en orden ascendente de fecha e ID.
- `POST /api/fiscal/documents/{id}/prepare` recibe `{operationId,expectedRevision}` y devuelve `{id,revision,state,eNcf}`. Exige configuración activa y validada `DO_ECF/TEST`, versión vigente y un rango de prueba utilizable. El total en DOP debe coincidir con la operación vigente. No modifica caja, deuda, pagos ni inventario.
- `GET /api/fiscal/operations/{operationId}` devuelve estado `PENDING`, `COMPLETED` o `FAILED`, resultado y error. Las consultas no reanudan el trabajo. Para reanudar se repite el POST con los mismos datos.

Persistir cada identificador antes de enviarlo. Un reintento con el mismo autor, identificador y datos recupera el resultado; cualquier cambio produce `OPERATION_CONFLICT` (409). Las correcciones usan una revisión y un identificador nuevos. `VERSION_CONFLICT`, `DOCUMENT_CONFLICT` y `PROFILE_UNAVAILABLE` responden 409; también pueden recibirse 400, 401, 403, 404, 422 y 500 con `{error:{code,message,fields,retryable,correlationId}}`. Las preparaciones y sus números pertenecen exclusivamente a `TEST`: “Documento de prueba / No emitido fiscalmente”. La validación local no acredita elegibilidad ni aceptación externa.

Los borradores de origen `SALE` guardan una huella de los datos comerciales y rechazan la preparación si estos cambiaron. Los borradores anteriores sin huella necesitan actualizarse mediante `PUT` antes de prepararse. Para E31 y E32, la confirmación reconstruye la copia desde la venta y compara comprador, líneas, bases, impuestos y totales; E44, E45 y E46 se preparan desde la venta para conservar sus datos especiales.

## Ventas fiscales de prueba

`GET /api/fiscal/sales/customer?identification=101-12345-6` requiere las credenciales móviles habituales, permisos `canAccessSales` y `canPrepareFiscalDocuments` y configuración `DO_ECF/TEST` activa y validada. Acepta RNC o cédula con espacios o guiones, sin letras. Busca únicamente clientes activos no genéricos de la empresa: utiliza `cedula` solo cuando la identificación fiscal no está informada. Devuelve `{matches,hasMore}` con un máximo de 20 coincidencias; el cliente debe decidir entre duplicados. Una respuesta vacía permite capturar los datos de esa factura sin crear una ficha. La ruta no crea clientes ni ventas.

`GET /api/fiscal/sales/context` devuelve la versión de política, la primera preferencia de comprobante por cliente y la disponibilidad informativa de rangos. `POST /api/fiscal/sales/preview` recibe el mismo carrito comercial y bloque `fiscal` que la venta, calcula a partir de datos de la empresa y devuelve la copia local sin efectuar escrituras ni reservar números. La confirmación vuelve a validar todo bajo la política vigente.

Para una venta ya registrada, `POST /api/fiscal/sales/{id}/preview` recibe el bloque fiscal y devuelve la revisión calculada y `sourceFingerprint`. `POST /api/fiscal/sales/{id}/prepare` recibe `{operationId, expectedSourceFingerprint, fiscal}` y prepara la copia de prueba sin repetir la venta, el cobro ni los movimientos de inventario. El identificador de operación debe conservarse en los reintentos. Si cambian la venta o las fichas utilizadas, se exige una nueva revisión. Se aplican los mismos permisos, aislamiento de empresa y política activa; la preparación rechaza importes incompatibles con la venta ya registrada.

Un borrador anterior E44, E45 o E46 vinculado a una venta puede descartarse con `POST /api/fiscal/documents/{id}/discard` y `{operationId, expectedRevision, reason}` para volver a revisar la venta. La operación exige perfil activo y permiso de preparación, conserva la revisión y el motivo en el historial y admite reintentos con el mismo identificador. Un documento preparado o con numeración reservada no puede descartarse por esta ruta.

En `POST /api/sales` y en el `payload` de `POST /api/cash-shifts/operations` con `kind: "sale"`, el bloque `fiscal` contiene `type`, `expectedPolicyVersion`, y opcionalmente `expectedTotalCents`, `incomeType`, `buyer`, `dueDate`, `shippingTaxTreatment` y `special`. `buyer` contiene `name`, `identification` y `country`; si el cliente general recibe un RNC que coincide con una única ficha activa, el servidor selecciona esa ficha y aplica sus condiciones. Si hay duplicados exige selección explícita; si no hay coincidencia, los datos temporales no modifican la ficha general. `expectedTotalCents` es una condición de revisión: el servidor calcula el importe por sí mismo y rechaza una diferencia; es obligatoria si la selección automática encuentra una ficha con descuento. `special` admite régimen y soporte para E44; confirmación de entidad y referencias de compra para E45; y modalidad, destino y datos logísticos para E46. Con perfil activo se usa `fiscal: null` para una venta ordinaria explícita. Sin perfil activo se conserva el contrato anterior omitiendo el bloque.

Una venta fiscal requiere `cashOperation` con identificador durable, empresa y usuario de la sesión, turno y secuencia cuando correspondan, y `fiscalPolicyVersion`. El servidor confirma venta, inventario, deuda o caja, documento y número TEST en una transacción. Repetir la misma solicitud recupera el resultado; modificarla con el mismo identificador causa conflicto. La respuesta añade `fiscal` con ID, tipo, estado y e-NCF. Los errores por política, secuencia o datos inválidos no convierten la venta en ordinaria.

Sin conexión, conservar íntegramente el mismo comando y su versión sin inventar e-NCF. Un cambio de política, rango agotado o dato incompatible conserva el pendiente para revisión. Solo se admite moneda DOP. Los campos y errores precisos constan en [OpenAPI](openapi-estructura-fiscal.json); estas rutas no firman ni envían comprobantes externos.

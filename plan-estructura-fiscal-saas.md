# MOVOPos: preparación de la estructura fiscal por etapas

**Fecha de revisión:** 11 de noviembre de 2026.  
**Estado:** Etapas 0, 1 y 3 a 13 completadas con las limitaciones registradas; etapa 2 en curso y etapas 14 y 15 pendientes.  
**Objetivo:** preparar los diez tipos de comprobante electrónico de República Dominicana, conservando el funcionamiento actual de las empresas que no utilicen el módulo fiscal.  
**Límite de esta entrega:** estructura, datos, ventanas, reglas locales, API interna para la aplicación móvil y pruebas. La integración con la API de un proveedor fiscal externo se realizará en un proyecto posterior.

## 1. Cómo utilizar este documento

Cada etapa se puede ejecutar en una sesión diferente. Antes de comenzar, verificar el estado real del código: los nombres de modelos nuevos son propuestas, no afirmaciones de que ya existen.

Para completar una etapa se necesitan sus cambios, migraciones cuando correspondan, comprobaciones y evidencia de aceptación. Actualizar la tabla de seguimiento y el registro final antes de detener el trabajo. No marcar una etapa como completada por haber construido solamente su ventana.

**Regla de pruebas por etapa — preferencia del usuario:** dedicar como máximo cinco minutos en total a las comprobaciones de cada etapa, incluidos los arranques y preparativos necesarios. Verificar únicamente lo implementado en esa etapa de facturación electrónica y que el flujo ordinario afectado siga funcionando con el módulo fiscal apagado. Elegir pruebas breves y relevantes para web o API móvil cuando se hayan modificado; reutilizar el entorno y las pruebas existentes. No ejecutar auditorías integrales, repeticiones amplias ni desarrollar herramientas adicionales como requisito de cada etapa. Si una comprobación no puede completarse dentro del límite, registrar su alcance y limitación sin afirmar que pasó. La etapa 15 también debe respetar el máximo de cinco minutos de pruebas.

Esta regla sustituye los requisitos de pruebas extensas, revisión visual con sesión real y validaciones transversales repetidas que aparezcan en registros anteriores o en otras secciones como condición general para cerrar cada etapa. Los registros anteriores son históricos. Por indicación expresa del usuario del 10 de noviembre, se permite activar y desactivar la configuración en ambiente de prueba antes de completar la transición; los pendientes antiguos sin empresa verificable deben conservarse y no impiden por sí solos cerrar el aislamiento de la etapa 1.

**Web y móvil son entregables de cada etapa.** La API propia de MOVOPos debe permitir realizar desde la app las mismas operaciones autorizadas que desde la web, con las mismas reglas y resultados. La cobertura móvil no se pospone a la etapa 15: esa etapa verifica lo construido antes. Una etapa con interfaz web pero sin contrato y comportamiento de API móvil comprobados permanece incompleta. El detalle transversal está en la sección 13.

El documento es autónomo: ninguna etapa requiere acceso a otro proyecto.

### Entorno de pruebas configurado — 9 de noviembre de 2026

La preparación local ya está realizada. Reutilizar este entorno al ejecutar el plan; no volver a crear las empresas ni ejecutar el seed sobre la base existente. La guía de preparación, resultados y limitaciones está en [docs/entorno-pruebas-fiscales.md](docs/entorno-pruebas-fiscales.md).

| Elemento | Configuración existente |
|---|---|
| Base de pruebas | `movopos_fiscal_test_2`, PostgreSQL 17.6 en `127.0.0.1:55439`, independiente de `DATABASE_URL` habitual. |
| Estructura | Coinciden los 1.902 elementos de `public` y las 92 migraciones comparados con producción en modo de solo lectura. Persisten diferencias de plataforma, extensiones y privilegios documentadas en la guía. |
| Datos ficticios | Dos empresas, cada una con cliente general, cliente a crédito, producto y proveedor. Las operaciones de los escenarios generan sus propios movimientos y saldos. |
| Subusuarios | El script de preparación creó `dueno` (administrador) y `cajero` con permisos distintos en cada empresa. No fue necesario crearlos manualmente. |
| PIN de pruebas | Ambos subusuarios de ambas empresas usan el valor local de `FISCAL_TEST_PIN` en `.env.fiscal-test`. Es independiente del PIN temporal `1234` del administrador creado por el alta habitual. Cambiar la variable por sí sola no actualiza las contraseñas ya guardadas en la base. |
| Identidad Clerk | Se reutilizan únicamente las dos identidades ficticias autorizadas por el usuario, pertenecientes a su instancia de producción. La excepción está habilitada con `FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP=true`; no son credenciales de desarrollo. |
| Configuración privada | `.env.fiscal-test` y `.env.fiscal-pg17`, excluidos de Git. No copiar sus claves, contraseñas, PIN ni tokens a este plan. |
| Servidor automatizado | Next en `http://localhost:3100`, con compilación `.next-fiscal-test` y `tsconfig.fiscal-test.json` separados. El comando de comprobación lo inicia y detiene automáticamente. |

**Comandos para continuar con el entorno existente:**

| Comando | Uso |
|---|---|
| `npm run fiscal-test:db:status` | Comprobar si la instancia local está iniciada. |
| `npm run fiscal-test:db:start` | Iniciarla cuando esté detenida; no reinstala ni borra datos. |
| `npm run fiscal-test:check` | Verificar la conexión a la base local permitida. |
| `npm run fiscal-test:smoke` | Comprobar fixtures, PIN y comprobaciones básicas de base de datos. |
| `npm run fiscal-test:auth` | Probar validación de firmas, vencimiento y separación de cuentas con tokens de prueba. |
| `npm run fiscal-test:next` | Probar autenticación HTTP en Next real con las dos identidades Clerk autorizadas y la base ficticia. Cierra solo las sesiones temporales que crea. |
| `npm run fiscal-test:next-policies` | Crear una base local nueva con fixtures y comprobar en Next real dos políticas distintas, mutación, reintento, inventario, permisos y aislamiento móvil. No elimina ni modifica la base fiscal existente. |
| `npm run fiscal-test:settings` | Renderizar la página real de Ajustes con usuarios simulados y comprobar los cuatro permisos fiscales y el acceso al módulo. No sustituye la revisión visual con sesión real. |
| `npm run fiscal-test:legacy-review` | Probar con IndexedDB y navegador temporal la revisión de pendientes antiguos, identidad, reintentos y cambios concurrentes; las respuestas del servidor son simuladas. |
| `npm run fiscal-test:clerk-temporary` | Repetir consultas y permisos de dueño/cajero en el servidor local limitado a handlers de prueba. |
| `npm run fiscal-test:regression` | Ejecutar las regresiones de ventas, caché, inventario, contratos móviles, cobros e impresión con dependencias simuladas. |
| `npm run fiscal-test:integration` | Ejecutar las 3 suites completas (caja, compras y línea base comercial) en bases locales aisladas. |
| `npm run fiscal-test:baseline` | Ejecutar exclusivamente los 11 escenarios de aceptación de línea base fiscal en base local aislada. |
| `npm run fiscal-test:compare` | Comparar estructura, migraciones y plataforma con producción en modo de solo lectura; actualmente devuelve código de diferencia por la plataforma, aunque `public` y el historial coinciden. |
| `npm run fiscal-test:db:stop` | Detener únicamente la instancia PostgreSQL local de pruebas. |

**Resultados registrados:**

- Next real: `/api/auth/me` responde 401 sin sesión y 200 tras iniciar cada cuenta mediante `/api/auth/subuser/login`. Funcionan las cookies web y los headers móviles; se rechazan PIN incorrectos, firmas Clerk alteradas y sesiones cruzadas en ambos sentidos. La comprobación pasó otra vez después de detener y reiniciar Next.
- Servidor limitado a handlers reales: dueño y cajero de ambas empresas, permisos del cajero y consultas de clientes, productos y ventas sin mezclar empresas.
- Integración: 41 pruebas de caja, 24 de compras/pagos y 11 pruebas de aceptación de línea base comercial en PostgreSQL local aislado (76 pruebas en total). Regresión: 55 pruebas aprobadas con dependencias simuladas. El registro y evidencia completa de aceptación está en [docs/linea-base-fiscal.md](docs/linea-base-fiscal.md).

**Condiciones de uso y pendientes de la etapa 0:**

- Mantener `localhost` tanto al arrancar Next como al solicitar sus rutas. Usar `127.0.0.1` para ese servidor provocaba un proxy circular por la normalización de URLs de Next y la reescritura de Clerk; la corrección y el comentario preventivo están en el lanzador. PostgreSQL conserva su dirección `127.0.0.1:55439`.
- Las variables de proveedores se anulan en el servidor automatizado y la defensa Node bloquea conexiones externas en las vías comprobadas. La clave pública de Clerk se obtiene antes de iniciarlo para validar firmas localmente. Esa defensa no controla por completo binarios nativos ni navegador: `npm run fiscal-test:dev` continúa bloqueado para uso interactivo general.
- Faltan la revisión de la interfaz con sesión real, el aislamiento completo de salidas externas y los recorridos comerciales integrales de aceptación, incluida impresión visual y sincronización real. Las pruebas ya aprobadas no sustituyen estas comprobaciones.
- Crear una base nueva requiere un nombre de prueba distinto y seguir la guía; no sobrescribir ni reiniciar destructivamente la existente. No usar datos del negocio, enviar documentos fiscales ni consumir numeración productiva.

### Seguimiento

| Etapa | Entrega | Dependencias | Estado inicial |
| Etapa | Entrega | Dependencias | Estado |
|---|---|---|---|
| 0 | Línea base y alcance de compatibilidad | Ninguna | Completada: línea base registrada y aceptada con pruebas reproducibles de 3 perfiles comerciales, contratos HTTP móviles e idempotencia |
| 0 | Línea base y alcance de compatibilidad | Ninguna | **Completada y aceptada** (evidencia reproducible en `npm run fiscal-test:baseline` y [docs/linea-base-fiscal.md](docs/linea-base-fiscal.md)) |
| 1 | Aislamiento fiscal por empresa y país | 0 | **Completada**: pruebas enfocadas de aislamiento y funcionamiento ordinario aprobadas dentro de cinco minutos |
| 2 | Preferencias de empresa | 1 | **En curso**: implementación realizada; faltan comprobaciones HTTP autenticadas y compatibilidad del contrato anterior |
| 3 | Clientes, proveedores y productos | 1–2 | **Completada por indicación del usuario**; quedan registradas las limitaciones de verificación |
| 4 | Núcleo de documentos, importes y estados | 1–3 | **Completada por indicación del usuario**: núcleo y previsualización comprobados; campos específicos y conciliación acumulada corresponden a etapas posteriores |
| 5 | Secuencias autorizadas | 2, 4 | **Completada por indicación del usuario; ampliación de relevo implementada y comprobada**, con las limitaciones registradas en el avance |
| 6 | Registro transaccional y bandeja fiscal | 4–5 | **Completada por indicación del usuario**; se conservan las limitaciones de verificación registradas |
| 7 | Facturación E31 y E32 | 3–6 | **Completada por indicación del usuario**; se conservan las limitaciones de verificación registradas |
| 8 | Ventas E44, E45 y E46 | 7 | **Completada por indicación del usuario**; se conservan las limitaciones de verificación registradas |
| 9 | Notas de crédito E34 y devoluciones | 7–8 | **Completada por indicación del usuario**; se conservan las limitaciones de verificación registradas |
| 10 | Notas de débito E33 | 7–9 | **Completada por indicación del usuario**; se conservan las limitaciones de verificación registradas |
| 11 | Compras y cuentas por pagar E41 | 3–6 | **Completada**, con las limitaciones de comprobación registradas |
| 12 | Gastos menores E43 y reembolsos | 6, 11 | Completada; comprobaciones y límites al final |
| 13 | Pagos al exterior E47 | 11–12 | Completada; comprobaciones y límites al final |
| 14 | Impresión, soportes e informes | 7–13 | Pendiente |
| 15 | Móvil, offline, migraciones y cierre de preparación | Todas | Pendiente |

Las etapas 11–13 pueden desarrollarse después de la 6 sin esperar las notas de ventas, siempre que compartan el mismo núcleo. La revisión final exige completar todas.

## 2. Reglas que gobiernan todas las etapas

1. **El módulo fiscal es opcional por empresa.** Ausencia de configuración significa desactivado. Un cambio global de despliegue nunca debe habilitarlo para todos los clientes.
2. **El núcleo comercial permanece independiente del país y del proveedor fiscal.** Ventas, inventario, caja, cobros y pagos funcionan sin servicios fiscales.
3. **Las reglas dominicanas pertenecen al perfil `DO_ECF`.** No deducir ese perfil del idioma, zona horaria, IP, moneda o país del cliente comprador. Otros países podrán tener otros perfiles en el futuro.
4. **Desactivado conserva el flujo actual.** No exigir RNC, secuencias, tipos E, campos aduaneros, retenciones dominicanas ni acceso a un proveedor. No cambiar cálculos, impresión o edición de operaciones ordinarias por haber instalado este desarrollo.
5. **La decisión se valida en el servidor.** Ocultar campos en la pantalla no sustituye la validación de Server Actions, rutas móviles y sincronización. La empresa y el usuario proceden de la sesión autenticada.
6. **Una operación y su comprobante son registros diferentes.** Una factura comercial, deuda, devolución o pago no equivale a un documento fiscal aceptado. Tener e-NCF tampoco acredita aceptación.
7. **Los históricos conservan su identidad.** No convertir ventas anteriores automáticamente, completar identificaciones con datos actuales ni renumerar documentos internos.
8. **El historial fiscal no se desbloquea al apagar el módulo.** Una empresa que nunca lo activó continúa igual. Una que lo desactive conserva la consulta y protección de los documentos fiscales anteriores; las operaciones nuevas siguen la política de transición registrada.
9. **No duplicar efectos.** Preparar un documento, consultar su estado o reintentarlo nunca vuelve a descontar inventario, crear deuda, registrar ingresos o mover caja.
10. **Preparar la integración externa sin realizarla.** Sí desarrollar las rutas y contratos de la API interna que consume la app móvil. No desarrollar llamadas HTTP al proveedor fiscal, carga de certificados, firma, webhooks, credenciales del proveedor ni certificación en este proyecto.
11. **No simular producción en la interfaz real.** Los casos de aceptación, rechazo o incertidumbre se ejecutan con fixtures aislados de pruebas; no se presentan como resultados reales de la DGII.
12. **Cada corrección de un error debe dejar un comentario preventivo** que explique la condición que no debe volver a ocurrir.

### Preparación, activación y transición

Separar estas decisiones en lugar de resolverlas con un solo interruptor:

| Concepto | Significado |
|---|---|
| `enabled` | La empresa eligió utilizar la funcionalidad fiscal. Por defecto, `false`. |
| `jurisdiction` / `regime` | Perfil legal aplicable; inicialmente `DO` / `DO_ECF`. |
| `environment` | Espacio de datos de preparación o pruebas; producción permanece no habilitada para emitir. |
| `configurationStatus` | Configuración incompleta o validada localmente. |
| `externalReadiness` | Estado externo futuro, inicialmente desconocido/no conectado. No lo establece el interruptor. |
| `effectiveFrom` / versión | Momento y versión de política usados por cada operación. |

En esta preparación, el usuario debe leer **“Configuración fiscal / Pendiente de conexión”**, no “Empresa autorizada” ni “Listo para emitir a DGII”. No habilitar emisión legal real sin la integración posterior.

Al activar o desactivar: comprobar pendientes y operaciones offline, mostrar qué ocurrirá con operaciones nuevas, registrar el cambio y conservar la política original de documentos ya preparados. No reasignar automáticamente una operación offline a un perfil diferente al sincronizar.

## 3. Estado observado del proyecto

Inventario funcional inicial basado en los archivos revisados el 8 de noviembre de 2026. La preparación y las comprobaciones posteriores del entorno constan en la sección 1; la auditoría completa de funcionamiento sigue pendiente.

| Componente | Lo que existe | Ajuste necesario |
|---|---|---|
| `prisma/schema.prisma` | Separación por `Account`; dinero en centavos. | Relaciones y modelos fiscales opcionales. |
| `CompanySettings` y `src/app/(app)/settings/` | Datos comerciales, ITBIS, propina e impresión. | Sección fiscal aislada, sin duplicar Ajustes. |
| `Customer` y `src/app/(app)/customers/` | Nombre, contacto, dirección, `cedula`, crédito. | Identificación fiscal por país, razón social y preferencias fiscales. |
| `Supplier` y `src/app/(app)/suppliers/` | Proveedores, crédito y configuración de ITBIS. | Identificación, residencia y datos fiscales de compras/pagos. |
| `Product` | Precio, ITBIS, unidades, recetas y cantidades. | Bien/servicio, clasificación fiscal y mapeo de unidades. |
| `Sale`, `SaleItem`, `SalePayment` | Ventas, impuestos, descuentos, propina, envío y pagos divididos. | Datos fiscales congelados y vínculo al comprobante. |
| `InvoiceSequence`, `ReturnSequence` | Numeración interna. | Conservar; crear numeración fiscal aparte. |
| `src/app/(app)/sales/actions.ts` | Crear, editar y cancelar ventas. | Política para documentos fiscales; impedir alterar el original emitido. |
| `Return` y `src/app/(app)/returns/` | Devoluciones de productos. | E34 y separación entre devolución física y crédito financiero. |
| `src/lib/purchases.ts` | Compras y actualización de inventario. | Soportes fiscales y E41 sin convertir servicios en inventario. |
| `AccountPayable`, `SupplierPayment`, `src/lib/accounts-payable.ts` | Deudas, pagos y vencimientos. `purchaseId` obligatorio y único. | Nuevos orígenes de obligación y retenciones; conservar la relación actual válida. |
| `OperatingExpense` y `src/app/(app)/operating-expenses/` | Gastos simples con importe y tesorería. | Detalle, soportes, E43 y reembolso al empleado. |
| `src/lib/money.ts` | Cálculos monetarios y formato fijo `es-DO`/DOP. | Cálculo fiscal versionado; no modificar silenciosamente los cálculos actuales. |
| `src/app/invoices/`, `src/app/receipts/`, impresión Bluetooth | Impresión de operaciones comerciales. | Plantillas fiscales basadas en el documento conservado. |
| `src/app/api/`, Server Actions | Entradas web y móvil. | Contratos opcionales, validación y permisos compartidos. |
| `src/lib/sync-manager.ts`, `cash-offline.ts`, `indexed-db.ts` | Operación sin conexión y sincronización. | Versionar cachés y distinguir pendiente comercial de pendiente fiscal. |
| Copias de seguridad y `src/lib/account-purge.ts` | Exportación/restauración y baja de empresas. | Incluir documentos fiscales y definir preservación antes de producción. |

No se encontraron modelos de documentos e-CF, secuencias fiscales, E33 o integración fiscal en la estructura revisada. La facturación de suscripciones del SaaS (`Billing*`) es otro dominio: no reutilizarla como facturación fiscal de los negocios.

### Límite de la internacionalización

Este plan permite que el perfil dominicano no interfiera con otras empresas; **no convierte por sí solo todo el producto en un sistema multimoneda y multijurisdicción**. El formato DOP y otros supuestos existentes requieren un trabajo independiente de internacionalización. Ninguna etapa debe imponer nuevas restricciones dominicanas a esos clientes ni aprovechar esta tarea para cambiar su comportamiento actual.

## 4. Cobertura de comprobantes y ventanas

Los diez tipos siguientes constituyen el alcance dominicano, según el [catálogo oficial de tipos de e-CF de la DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/TipoyEstructurae-CF.aspx).

| Tipo | Documento | Origen comercial | Ventana principal | Etapa |
|---|---|---|---|---|
| E31 | Crédito fiscal | Venta | Facturación existente | 7 |
| E32 | Consumo | Venta | Facturación existente | 7 |
| E33 | Nota de débito | Cargo posterior | Nueva nota de débito | 10 |
| E34 | Nota de crédito | Devolución, reducción o cancelación de venta | Devoluciones + nueva nota financiera | 9 |
| E41 | Compras | Compra a proveedor informal | Compras / cuentas por pagar | 11 |
| E43 | Gastos menores | Gasto elegible del personal | Gastos operativos ampliados | 12 |
| E44 | Regímenes especiales | Venta | Facturación existente, sección condicional | 8 |
| E45 | Gubernamental | Venta | Facturación existente, sección condicional | 8 |
| E46 | Exportaciones | Venta de bienes | Facturación + sección de exportación | 8 |
| E47 | Pagos al exterior | Operación/pago elegible | Obligación y pago al proveedor | 13 |

Los nombres no determinan contado/crédito. Un E31 puede pagarse al contado y un E32 puede ser a crédito. E41 no exige que quede deuda pendiente. E33 aumenta y E34 disminuye una operación anterior; ninguno debe reescribirla.

### Inventario de ventanas a reutilizar o crear

| Ventana | Decisión | Contenido |
|---|---|---|
| Ajustes de empresa | Reutilizar | Sección fiscal y estado de preparación. |
| Secuencias autorizadas | Crear dentro de Ajustes | Rangos, disponibilidad y alertas. |
| Clientes y proveedores | Reutilizar | Identificación, residencia y datos fiscales. |
| Productos | Reutilizar | Bien/servicio y clasificación por perfil. |
| Facturación y listado de ventas | Reutilizar | Selector de comprobante, validación y vínculo fiscal. |
| Exportación | Crear sección/modal dentro de la venta | Campos adicionales según el caso. |
| Devoluciones | Reutilizar | Selección física y E34 vinculado. |
| Nota de crédito financiera | Crear | Reducción sin devolución física; puede compartir componentes con devoluciones. |
| Nota de débito | Crear | Cargo posterior y aplicación a saldo. |
| Compras y listado | Reutilizar | NCF recibido o documento propio E41. |
| Cuentas por pagar | Reutilizar y ampliar | Obligaciones sin inventario, E41/E47 y pagos. |
| Gastos operativos | Reutilizar y ampliar | Gastos menores, soportes y reembolsos. |
| Liquidaciones/reembolsos | Crear sección si es necesaria | Agrupar pagos administrativos, sin duplicar gasto. |
| Bandeja y detalle fiscal | Crear, compartida por todos los tipos | Validaciones, referencias, historial y pendientes. |
| Documentos recibidos | Crear sección de soportes | Captura manual y vínculo con compra/gasto. |
| Impresión e informes | Reutilizar | Versiones fiscales y conciliación. |

## 5. Estructura de datos propuesta

Antes de escribir migraciones, ajustar los nombres a las convenciones del proyecto. Mantener datos históricos y evitar cambios destructivos.

| Entidad propuesta | Responsabilidad |
|---|---|
| `FiscalSettings` | Perfil de empresa opcional, estado, ambiente y versiones. |
| `FiscalPartyProfile` o extensiones equivalentes | Identificación y residencia de empresa, cliente o proveedor. |
| `FiscalDocumentType` / catálogo versionado | Capacidades y validaciones de los diez tipos, sin dispersar condicionales en pantallas. |
| `FiscalSequence` | Rangos autorizados y contador por empresa, perfil, ambiente y tipo. |
| `FiscalNumberAllocation` | Número asignado, operación, estado y motivo de inutilización. |
| `FiscalDocument` y líneas | Copia fiscal canónica, totales, origen y estado de preparación. |
| `FiscalDocumentReference` | Relación de E33/E34 con el documento anterior. |
| `FiscalDocumentEvent` / revisiones | Historial inmutable, autor, motivo, versión y errores. |
| `FiscalPreparationJob` | Trabajo local recuperable; no envía documentos. |
| `ReceivedFiscalDocument` | Soporte emitido por un tercero, separado de documentos propios. |
| `CreditNote`, `DebitNote` y aplicaciones | Ajustes comerciales, con o sin retorno físico. |
| `PayableSource` o relaciones tipadas equivalentes | Vincular deudas con compra, servicio, gasto u obligación documentada. |
| `WithholdingDetail` | Bases, conceptos, tasas, importes y momento de retención. |
| `EmployeeExpenseSettlement` o equivalente | Obligación/reembolso de gastos al personal. |

Reglas de integridad:

- Aislar todos los registros por `accountId`. Verificar que relaciones, documentos referenciados y soportes pertenezcan a la misma empresa; preferir restricciones compuestas cuando sea viable.
- Documentos propios y recibidos tienen origen explícito. Un prefijo `E41` escrito por el usuario no acredita propiedad ni autoriza reemitirlo.
- El origen comercial debe existir y ser inequívoco. No usar solamente cadenas `sourceType/sourceId` sin validación de integridad.
- En cuentas por pagar, mantener `purchaseId` para históricos y elegir un diseño que garantice un único origen válido por obligación. No hacer todos los vínculos opcionales sin restricciones.
- Una operación puede tener historial de intentos fiscales, pero no dos comprobantes vigentes por un doble clic. Las notas son operaciones distintas, no intentos de la factura.
- Una nota fiscal tiene una referencia original inequívoca. Un ajuste aplicado a varias facturas se divide en documentos relacionados por un lote.
- Guardar importes y cantidades exactos, no `float` binario para cálculos fiscales. Los centavos actuales siguen siendo válidos; las precisiones adicionales necesitan representación decimal explícita.
- La secuencia tiene diez dígitos y puede exceder un entero de 32 bits. Usar `BigInt` o representación decimal validada; serializar de forma compatible con JSON, preservando ceros en el e-NCF.
- Congelar datos identificativos, conceptos, unidades, cálculos, descuentos y versiones de reglas al confirmar la preparación. No reconstruir documentos históricos desde fichas actuales.

## 6. Estados y efectos separados

### Estado local de preparación

`BORRADOR → VALIDADO → PREPARADO_PENDIENTE_CONEXION`.

`ERROR_VALIDACION` permite corregir el borrador. `DESCARTADO` conserva motivo e historial. Asignar numeración solo en el punto de confirmación definido, no durante la edición. Si un preparado requiere revisión, no sobrescribir su copia congelada ni liberar su número sin una política explícita.

### Estado externo reservado para el proyecto posterior

Separar campos futuros para envío, respuesta y resultado externo. Deben permanecer sin resultado real en esta preparación. Los fixtures pueden representar encolado, aceptación, aceptación condicional, rechazo e incertidumbre para comprobar las reglas, exclusivamente en entornos de prueba.

### Estado comercial y financiero

La venta, devolución, devolución física, cobro, pago y saldo tienen sus propios estados. Registrar cada efecto mediante una operación identificable y reversible administrativamente cuando proceda. Un rechazo fiscal no deshace dinero o inventario sin una decisión explícita y auditada.

La acción posterior “cancelar” debe distinguir entre descartar un borrador, revertir una operación administrativa, preparar una nota de crédito y registrar una anulación de numeración. Son acciones distintas. La anulación de rangos no sustituye una E34 sobre una venta emitida.

## 7. Etapas de ejecución

### Etapa 0 — Registrar la línea base
### Etapa 0 — Registrar la línea base (Completada)

**Estado:** Completada y aceptada (9 de noviembre de 2026).  
**Objetivo:** comprobar qué debe permanecer igual antes de modificar la estructura.

**Preparación existente:** usar el entorno y los comandos de la sección 1. La base y las dos empresas ficticias ya existen; completar los escenarios que faltan y registrar sus resultados sin volver a ejecutar el seed. La configuración del entorno y las pruebas parciales no completan por sí solas esta etapa.

**Trabajo:**

- Crear datos aislados de prueba: empresa sin perfil fiscal, empresa de otro país y empresa con perfil DO de preparación. No usar datos productivos.
- Documentar crear/editar/cancelar ventas, devolución parcial, cobros, compras, pagos a proveedores, gastos, propina, envío, descuentos, impresión y offline.
- Registrar también los contratos HTTP móviles actuales, autenticación, permisos, protocolo de caja, errores, paginación y ejemplos de solicitudes/respuestas; conservar los casos sin campos fiscales como regresión.
- Identificar todos los puntos de entrada web/móvil y permisos; comprobar qué pruebas existentes están disponibles y cuáles requieren base aislada.
- Guardar ejemplos de contratos y resultados actuales. Revisar scripts de ventas, caja, compras a crédito, stock y sincronización.

**Ventanas:** ninguna nueva.  
**Aceptación:** Completada y aprobada. Existe evidencia reproducible de 11 escenarios comerciales ordinarios en `scripts/fiscal-baseline-scenarios.test.mjs` y documentación detallada en [docs/linea-base-fiscal.md](docs/linea-base-fiscal.md), sin activar ningún perfil fiscal ni tablas electrónicas e-CF.

### Etapa 1 — Crear el aislamiento fiscal(Completada)

**Objetivo:** que todo el trabajo posterior dependa de una política fiscal opcional del servidor.

**Trabajo:**

- Crear un resolvedor común, por ejemplo `resolveFiscalPolicy(accountId, operation)`, con perfil desactivado por defecto.
- Separar núcleo comercial, reglas por jurisdicción y traducción futura a proveedor. Ubicación propuesta: `src/lib/fiscal/core/`, `profiles/do-ecf/` y `preparation/`.
- Evitar imports y consultas fiscales costosas en operaciones ordinarias. La ausencia del módulo/proveedor no debe impedir vender.
- Añadir permisos específicos para configuración, numeración, preparación y consulta; respetar los permisos actuales de caja y operaciones.
- Registrar cambios de política y conservar su versión en las operaciones afectadas.

**Ventanas:** visibilidad condicional y permisos en Ajustes.  
**Aceptación:** dos empresas concurrentes operan con políticas diferentes; enviar un tipo E por la API no permite eludir el perfil ni cruzar empresas.

### Etapa 2 — Preferencias de la empresa

**Objetivo:** configurar la preparación fiscal sin sustituir la ventana actual.

**Trabajo:**

- Añadir una sección “Configuración fiscal” a Ajustes: uso opcional, país/perfil, razón social, identificaciones, dirección y contactos fiscales.
- Mantener nombre comercial, logo, impresión y demás preferencias existentes. Distinguir dirección comercial de fiscal si no coinciden.
- Mostrar estado de configuración, información faltante, ambiente y fecha de aplicación.
- Aplicar campos obligatorios únicamente cuando el perfil los requiera. Estar desactivado no debe exigir una identificación dominicana.
- Preparar la transición de activación/desactivación con revisión de pendientes y sin alterar históricos.

**Ventanas:** reutilizar Ajustes y su sección de empresa.  
**Aceptación:** guardar preferencias de una empresa ordinaria sigue funcionando con el contrato anterior. Configurar perfil DO no acredita habilitación externa.

### Etapa 3 — Completar datos maestros

**Objetivo:** obtener información suficiente para construir documentos sin recaptura repetida.

**Trabajo:**

- Clientes: tipo/país de identificación, razón social, correo, dirección y tipo de comprobante preferido cuando corresponda. Una preferencia no omite la validación en la venta.
- Proveedores: identificación nacional/extranjera, residencia, nombre fiscal y condición declarada. No inferir elegibilidad E41 solo porque falte un RNC.
- Productos/conceptos: bien/servicio, unidad fiscal y tratamiento de impuesto. `ProductKind` describe inventario/recetas; no sustituye la clasificación bien/servicio.
- Distinguir tasa cero de exento. No reinterpretar automáticamente productos históricos con tasa 0.
- Conservar identificaciones extranjeras sin pasarlas por una limpieza exclusiva de cédulas dominicanas.
- Añadir conceptos sin inventario para servicios y cargos, sin exigir crear productos con stock ficticio.

**Ventanas:** reutilizar clientes, proveedores y productos; sección de conceptos cuando sea necesaria.  
**Aceptación:** fichas antiguas se consultan y guardan; solo se exige completar datos al preparar una operación fiscal que los necesite.

### Etapa 4 — Núcleo documental y cálculo fiscal

**Objetivo:** construir un documento canónico independiente de la API.

**Trabajo:**

- Crear los modelos comunes, sus relaciones, copia fiscal y versiones de reglas.
- Centralizar validación de campos, cálculo y clasificación por tipo; devolver errores asociados al campo para la interfaz.
- Resolver precios con/sin impuesto, descuentos por línea/globales, bases por tasa, envío, propina legal, recargos y retenciones. No tratar envío o propina como sumas sin clasificación fiscal.
- Conciliar líneas, bases y totales. Mantener el cálculo actual en el perfil desactivado; cualquier ajuste fiscal aparece antes de confirmar.
- Resolver cantidades de tres decimales del POS frente a las precisiones del documento fiscal mediante una conversión explícita y comprobada o rechazo local informado. Nunca truncar silenciosamente.
- Definir moneda de operación, moneda de reporte fiscal, tasa y fecha. No extender el soporte multimoneda de todo el SaaS dentro de esta etapa.
- Crear un registro versionado de reglas con requisitos por campo, perfil, tipo y vigencia.

**Ventanas:** componentes compartidos de detalle, importes y errores; no otra facturación.  
**Aceptación:** los diez tipos tienen ejemplos locales y reglas deterministas, sin conexiones externas. Cambiar una ficha no modifica un documento confirmado.

### Etapa 5 — Secuencias autorizadas

**Estado: completada** para el alcance de preparación y pruebas, incluida la ampliación de relevo automático. Se mantienen las limitaciones de verificación registradas y el requisito de comprobar la autorización DGII antes de habilitar la emisión productiva.

**Objetivo:** administrar numeración fiscal separada de la numeración interna.

**Trabajo:**

- Crear mantenimiento con tipo, ambiente, rango inicial/final, último utilizado, vencimiento cuando aplique, estado y soporte de autorización.
- Evitar rangos superpuestos para la misma empresa/tipo/ambiente y la selección ambigua de rangos utilizables.
- Reservar bajo bloqueo transaccional y restricción única. Una previsualización o validación no consume números.
- Mantener histórico de asignación, inutilización y motivos. No disminuir contadores ni reutilizar automáticamente números preparados.
- Alertar por agotamiento y vencimiento; registrar correcciones de configuración sin reescribir documentos.
- Separar rangos de prueba de rangos reales. Esta preparación solo utiliza numeración de prueba claramente identificada y no consume autorizaciones productivas.

**Ampliación solicitada el 10 de noviembre de 2026: historial y continuidad de rangos.** Implementada en la reserva interna y documentada en el avance de la etapa 5:

- Conservar y consultar el historial de todos los rangos registrados por empresa, perfil, ambiente y tipo, incluidos los agotados, vencidos, desactivados y pendientes. Mostrar rango, referencia de autorización, vigencia, estado, disponibilidad y movimientos auditados de creación, cambios, asignaciones, inutilizaciones y activación automática. La referencia registrada no verifica por sí sola una autorización de la DGII; mantener identificada la numeración de prueba.
- Permitir registrar con anticipación uno o varios rangos de prueba no superpuestos para el mismo tipo. Distinguir explícitamente un rango preparado para activación automática de uno desactivado o retirado deliberadamente; registrar quién lo preparó y cuándo. Mantener como máximo un rango activo por empresa, perfil, ambiente y tipo.
- Cuando se reserve el último número disponible del rango activo, activar en la misma transacción el siguiente rango preparado y utilizable del mismo ámbito. Elegirlo por número inicial ascendente, con un desempate estable por identificador; no exigir continuidad numérica ni inventar números intermedios. Comprobar vigencia y que quede numeración sin asignar en el momento del cambio. Omitir candidatos vencidos, agotados o retirados y conservarlos en el historial.
- Registrar de forma inmutable el agotamiento y el cambio, con ambos rangos, momento, motivo automático y operación que lo desencadenó. La reserva del último número, el cambio de estado y sus eventos deben confirmarse o revertirse juntos bajo los bloqueos y restricciones existentes. Un reintento devuelve la asignación original; dos cajeros concurrentes nunca duplican números ni activan dos rangos.
- Si no existe un siguiente rango utilizable, conservar el resultado de la última reserva y mostrar una alerta clara. La siguiente solicitud fiscal debe indicar que no hay numeración disponible, sin asignar fuera de rango ni perder o duplicar la operación comercial. Un rango vencido o desactivado manualmente no debe activar otro por este mecanismo de agotamiento; cualquier política adicional requiere definición expresa.
- Mostrar en Ajustes el rango activo, los preparados para relevo y su orden, además del historial y alertas anticipadas de agotamiento o vencimiento. Permitir la misma gestión y consulta autorizadas por la API móvil, sin permitir al cliente elegir el próximo número ni modificar el contador. Actualizar contratos y documentación; respetar permisos y el funcionamiento ordinario con el módulo apagado.
- Comprobar de forma enfocada, dentro del límite total de cinco minutos, historial, último número y cambio al siguiente rango, concurrencia y reintento, rollback, candidatos no utilizables, ausencia de relevo, aislamiento entre empresas/tipos/ambientes, contratos móviles afectados y flujo ordinario con el módulo apagado. Registrar lo que no se alcance a verificar.

El e-NCF conserva trece posiciones. La fecha de vencimiento forma parte de los tipos que la admiten; E32 y E34 no la llevan en el documento ni en la plantilla fiscal. Ver [reglas de formato y numeración](https://zarelafact.com/docs/integration/document-format).

**Ventanas:** nueva “Secuencias fiscales autorizadas”, dentro de Ajustes.  
**Aceptación:** dos cajeros reciben números distintos, un reintento recupera el mismo documento y un error previo al commit no consume numeración. El historial muestra cada rango y su actividad, y al reservar el último número se activa atómicamente el siguiente rango preparado y utilizable; sin relevo, se informa la falta de numeración sin perder la última reserva.

**Control de rangos DGII para la futura integración productiva — requisito pendiente:** la preparación actual solo compara los números con rangos registrados en `TEST`; una referencia escrita no demuestra que la DGII haya aprobado esos límites. Antes de habilitar numeración o emisión real, el proyecto de integración debe definir e implementar lo siguiente, sin conectar servicios externos ni consumir rangos productivos durante este plan:

- Registrar por empresa emisora, RNC, ambiente y tipo los límites inclusivos exactamente como figuran en la autorización de la DGII, junto con su referencia, fecha de autorización, vigencia aplicable y evidencia o mecanismo de verificación definido. La carga manual debe exigir revisión autorizada y conservar responsable, fecha y trazabilidad; una simple declaración o referencia no constituye verificación automática ante la DGII.
- Antes de asignar o transmitir un e-NCF productivo, comprobar en servidor que el emisor y el tipo corresponden a un rango autorizado y verificable, que el número está entre sus límites inclusivos, que la autorización está vigente según las reglas aplicables y que el número no se haya utilizado o inutilizado. Bloquear la emisión cuando falte evidencia suficiente o existan discrepancias; nunca ampliar, inventar o saltar a un rango no confirmado para evitar una interrupción.
- Vincular cada asignación a la copia inmutable de su autorización y sus límites; conservar auditoría de registros, revisiones y cambios. El relevo automático solo podrá elegir otro rango del mismo emisor, ambiente y tipo cuya autorización y vigencia se hayan verificado. La comprobación debe ser transaccional con la asignación y resistir concurrencia y reintentos.
- Cuando aplique incluir vencimiento en el e-CF, utilizar la fecha de la autorización correspondiente, no una fecha estimada. Distinguir la vigencia de la numeración de la presencia de ese campo en el documento; revisar las excepciones de E32 y E34 contra las reglas DGII vigentes antes de producción. Resolver con el proveedor y la DGII el tratamiento de autorizaciones revocadas o cambiadas y de rechazos, sin reutilizar ni anular números automáticamente por una suposición local.
- Incorporar pruebas aisladas de los límites inicial y final, números inmediatamente fuera de rango, RNC o tipo incorrectos, autorización no verificada o vencida, relevo, concurrencia, reintento y ausencia de autorización; probar la respuesta a rechazos del proveedor con simulaciones. Mantener apagada la emisión real hasta aprobar estas comprobaciones y la certificación correspondiente. Fuentes: [estructura y vigencia del e-NCF de la DGII](https://ayuda.dgii.gov.do/conversations/facturacin-electrnica/ca3992-qu-es-un-comprobante-fiscal-electrnico-ecf-y-cmo-est-estructurado/5f3c17bf8cd858ce87a7ea79), [motivos de rechazo de la DGII](https://ayuda.dgii.gov.do/conversations/facturacin-electrnica/ca4404-por-cules-razones-la-dgii-puede-rechazar-un-ecf/6786cf2837f1fe2470e12c8a) y [aclaración DGII sobre excepciones de vencimiento](https://ayuda.dgii.gov.do/conversations/discusiones/problemas-con-la-solicitud-de-comprobantes/6983565ec0c0b637f910e24e).

Este requisito productivo no modifica el alcance ni el estado de la etapa 6 que se desarrolla en paralelo. En esa etapa se mantiene el uso exclusivo de numeración de prueba y los límites locales ya definidos.

### Etapa 6 — Confirmación y bandeja común

**Objetivo:** registrar cada preparación una sola vez y poder retomarla.

**Trabajo:**

- Usar un identificador durable por operación. Mismo identificador y datos recupera el resultado; datos diferentes con el mismo identificador producen conflicto.
- Confirmar operación comercial, copia fiscal y asignación local en una transacción cuando nazcan juntas.
- Para operaciones ya existentes, adjuntar la preparación sin repetir sus efectos comerciales.
- Crear trabajos locales recuperables y una bandeja con filtros por origen, tipo, fechas, cliente/proveedor y estado.
- Incorporar detalle de errores, referencias, revisiones y autoría; consultar no modifica ni prepara otro documento.
- Dejar el contrato de una futura integración separado; ningún trabajo de esta etapa hace envíos externos.

**Ventanas:** nueva bandeja fiscal y detalle compartido, accesibles desde la operación original.  
**Aceptación:** tras cerrar el navegador o interrumpir una respuesta se recupera la misma operación. Las pruebas no necesitan credenciales fiscales.

### Etapa 7 — Ventas E31 y E32

**Objetivo:** ampliar la facturación existente con los primeros tipos de ventas.

**Trabajo:**

- Añadir selector fiscal y disponibilidad de secuencia; no confundirlo con contado/crédito.
- Proponer la preferencia del cliente y validar su elegibilidad. El genérico no debe terminar asignado a un documento que exige identidad específica.
- Aplicar datos obligatorios según tipo e importe; para E32 preparar la validación de identificación a partir de RD$250,000 y sus casos de comprador extranjero.
- Mapear medios de pago, pagos divididos, vencimiento de crédito y fecha de emisión desde los datos reales.
- Conservar códigos internos y añadir vínculo al documento en listado/detalle.
- Definir los campos que pueden cambiar después de preparar un documento y los que requieren nueva revisión; no alterar el original fiscal ni sus importes históricos.

**Ventanas:** POS, selección de cliente, listado de ventas y detalle existentes.  
**Aceptación:** E31/E32 se preparan una vez con totales consistentes; las ventas ordinarias mantienen el flujo y los resultados de la etapa 0.

### Etapa 8 — Ventas E44, E45 y E46

**Objetivo:** completar los tipos de venta en el mismo POS.

**Trabajo:**

- E44: datos del régimen y soporte de exención; mostrar el efecto sobre los precios antes de confirmar.
- E45: identificación de la entidad gubernamental y referencias administrativas pertinentes; no convertir todo documento gubernamental en exento.
- E46: comprador local/extranjero, destino y datos adicionales de exportación; distinguir campos obligatorios, condicionales y opcionales según la operación, sin exigir todos los campos aduaneros siempre.
- Aplicar la clasificación fiscal de cada tipo, conservando precios y bases de la copia confirmada.
- Incluir moneda/tasa cuando se soporte; bloquear de manera explícita combinaciones aún no soportadas en el perfil fiscal.
- Incorporar los tres tipos al mismo historial, impresión y búsquedas. No crear cinco pantallas independientes de facturación.

**Ventanas:** selector y secciones condicionales en facturación; modal de exportación.  
**Aceptación:** cada tipo tiene un caso válido, otro incompleto y otro incompatible. La interfaz explica el campo que falta sin modificar importes silenciosamente.

### Etapa 9 — E34, devoluciones, cancelaciones y reducciones

**Objetivo:** corregir ventas fiscalizadas sin cambiar su documento original.

**Trabajo:**

- Ampliar Devoluciones para relacionar factura, líneas y cantidades. Preparar una E34 para la devolución total o parcial.
- Crear nota financiera para descuentos posteriores o reducciones sin devolución de mercancía. No hacer stock por una nota puramente financiera ni declarar todo ajuste como exento por comodidad.
- Para retirar productos de una factura fiscal emitida, ofrecer el flujo de nota parcial en lugar de borrar líneas.
- Para cancelación total, considerar créditos previos y preparar el ajuste restante que corresponda; conservar original y notas.
- Tomar comprador, referencia, fecha, precios, descuentos y clasificación de la copia original. Validar elegibilidad fiscal de la referencia, no solo su existencia.
- Calcular indicadores y tratamiento temporal del impuesto conforme a la regla vigente. Distinguir el importe económico a reembolsar del ajuste fiscal cuando no coincidan.
- Controlar cantidades e importes acumulados, incluyendo reservas de notas pendientes bajo bloqueo. Rechazos liberan reservas solo mediante una transición segura; no por borrar la operación.
- Separar retorno físico, reembolso, crédito a favor y reducción de deuda. Una factura pagada puede requerir devolución o crédito al cliente, sin crear un saldo negativo ficticio.
- Adaptar la cancelación de una devolución: una nota fiscal ya emitida no desaparece al revertir la operación de inventario.

**Ventanas:** Devoluciones reutilizada, nota financiera nueva, selector de motivo y detalle de ajustes de la factura.  
**Aceptación:** probar devoluciones parciales sucesivas, factura pagada, crédito, ajuste sin stock y cancelación tras ajustes previos. No aplicar dos veces dinero, saldo ni inventario.

### Etapa 10 — E33, notas de débito

**Objetivo:** agregar cargos posteriores como operaciones independientes.

**Trabajo:**

- Crear documento comercial de débito y detalle de conceptos, motivo, fecha y referencia original.
- Calcular solo el incremento y sus impuestos; no repetir el total de la factura ni asumir que todos los cargos comparten impuesto.
- Relacionar comprador y documento original en el mismo perfil/ambiente. El código de modificación para E33 se prepara como corrección de importes.
- Aplicar el cargo una sola vez a cuentas por cobrar o registrar cobro inmediato; no convertir la factura original en otra venta ni duplicar ingresos en informes.
- No generar inventario por cargos monetarios. Una venta adicional de productos debe seguir su operación comercial correspondiente.
- Recuperar borradores/preparados y mantener revisiones, permisos y auditoría.

**Ventanas:** nueva nota de débito y listado; acceso desde factura y cuentas por cobrar.  
**Aceptación:** cargo sobre factura pagada, cargo a crédito y reintento conservan importes originales y un único efecto financiero.

### Etapa 11 — Compras, cuentas por pagar y E41

**Objetivo:** cubrir compras a informales sin reconstruir el módulo de proveedores.

**Estado: completada.** Se implementaron soportes recibidos, obligaciones sin inventario y revisión y preparación E41 con retenciones separadas del pago al proveedor. En la base local configurada se aplicaron las seis migraciones de etapa 11, de `20261110190000_purchase_supplier_receipt` a `20261110240000_fiscal_payable_protection`; las migraciones de etapas posteriores no se aplicaron como parte de esta etapa.

**Comprobaciones:** `fiscal-stage11-check.mjs` pasó en una base PostgreSQL aislada existente, con datos ficticios revertidos: compra ordinaria con fiscal apagado, soporte recibido, E41 de contado y crédito, pagos, reintento, retenciones, protección de datos y obligación sin inventario. Se ejercitaron las rutas móviles de propuesta, compra, obligación y pago con autenticación y parte del contexto HTTP simulados. `purchase-credit.browser.test.mjs` pasó diez escenarios con servicios simulados, incluidos la opción de E41, el comprobante recibido y permisos. Pasaron las 62 regresiones generales y ESLint de los archivos de la etapa; la revisión más amplia de interfaz comunicó tres advertencias existentes, sin errores. El tiempo acumulado de ejecución y preparativos de comprobación se mantuvo por debajo de cinco minutos.

**Límites:** no se comprobó una sesión real de navegador, una caja física ni una integración externa; el E41 sigue siendo una copia TEST pendiente de conexión. TypeScript general informó errores en scripts de etapas anteriores y en trabajo simultáneo de pagos exteriores; señaló además literales BigInt en la prueba nueva que se corrigieron después, sin repetir TypeScript. Para ejecutar la prueba aislada con el trabajo simultáneo se añadió allí la migración de pagos exteriores, sin aplicarla a la base local configurada.

**Trabajo:**

- Ampliar compras y obligaciones sin inventario, conservando las deudas históricas dependientes de `Purchase`.
- Distinguir documento recibido, E41 propio y soporte administrativo. No preparar E41 por la sola ausencia de NCF.
- Capturar proveedor y elegibilidad, concepto, clasificación, fechas, soporte y retenciones. La captura administrativa no reemplaza la futura verificación oficial.
- Incorporar detalle de retenciones, bruto, impuestos, neto al proveedor, pagos y saldo. La retención representa otra obligación, no una rebaja comercial.
- Permitir contado y crédito; confirmar emisión fiscal no vuelve a pagar ni a ingresar mercancía.
- Preparar la estructura específica E41 desde el mismo núcleo documental y secuencias.
- Admitir preparación explícita desde una operación existente elegible sin otra compra, deuda ni movimiento; no ejecutar conversiones masivas de históricos.
- Mantener el soporte del proveedor original y bloquear modificaciones de los datos fiscales ya congelados.

**Ventanas:** Compras, proveedores, cuentas por pagar y pagos existentes; formulario ampliado de obligación sin inventario.  
**Aceptación:** compra formal recibida no se firma como propia; E41 de contado no deja deuda; E41 a crédito admite abonos sin alterar su copia fiscal.

### Etapa 12 — Gastos menores E43, empleados y caja chica

**Estado:** implementada; véase el registro de comprobaciones y limitaciones al final.

**Objetivo:** documentar gastos elegibles y liquidarlos sin duplicar gasto.

**Trabajo:**

- Ampliar `OperatingExpense` con detalle, soportes, empleado, beneficiario y origen de fondos.
- Distinguir pago directo por la empresa, gasto adelantado por un empleado y reposición de caja chica.
- Preparar E43 solo para operaciones elegibles; no todo gasto sin comprobante es gasto menor. Ofrecer el flujo correcto si corresponde otro tipo.
- Conservar al empleado y beneficiario en la administración, sin copiarlos a secciones fiscales que el tipo no admite.
- Bloquear información incompatible para revisión en lugar de eliminar impuestos o retenciones.
- Primera versión: un documento por operación elegible. La consolidación de varios gastos se difiere y no es requisito para cerrar esta etapa.
- Reembolso: liquida una obligación con el empleado y genera el pago correspondiente. Reposición: financia la caja; no vuelve a registrar los gastos pagados desde ella.
- Si se agrega caja chica, diferenciar fondo/transferencia de gasto. Mantener vínculos exactos con cada comprobante, sin dos salidas por la misma operación.

**Ventanas:** gastos operativos ampliados y sección de liquidación/reembolso. No es obligatorio crear un subsistema completo de caja chica para preparar E43 individual.

**Aceptación:** gasto, pago y documento se concilian; un reembolso/reintento no repite el gasto. Los gastos ordinarios mantienen el funcionamiento actual con el perfil desactivado.

### Etapa 13 — E47 y pagos al exterior

**Estado:** implementada; véase el registro de comprobaciones y limitaciones al final.

**Objetivo:** preparar el comprobante correcto en operaciones elegibles de no residentes.

**Trabajo:**

- Añadir clasificación de operación, identificación extranjera y datos del beneficiario a obligaciones/pagos.
- Separar la existencia de la deuda del hecho que origina el comprobante. El registro de una obligación no genera automáticamente E47.
- Registrar el pago y su relación con la base documentada. Definir abonos, pagos múltiples y retenciones de forma que no documenten dos veces el mismo hecho ni omitan pagos elegibles.
- Capturar moneda, tasa, fecha y equivalentes conservados. Si el producto todavía no soporta liquidaciones en esa moneda, informar la limitación antes de confirmar; no inventar una tasa.
- Tratar el impuesto correspondiente por concepto y naturaleza; no fijar un porcentaje universal de ISR.
- Aplicar las restricciones documentales del tipo mediante las reglas comunes. Una importación de mercancías no se convierte en E47 por tener proveedor extranjero.
- Mantener obligaciones de impuestos separadas del pago neto al beneficiario y del gasto bruto.

**Ventanas:** cuentas por pagar, proveedor y pago ampliados; sección “Pago al exterior”.  
**Aceptación:** deuda sin pago no produce automáticamente comprobante; los pagos elegibles quedan trazados, y un reintento no vuelve a pagar ni a preparar otro número.

### Etapa 14 — Impresión, soportes, informes y conciliación

**Objetivo:** consultar y explicar la operación sin confundir preparación con emisión legal.

**Trabajo:**

- Reutilizar impresión carta, térmica, PDF y Bluetooth donde existan. Los documentos fiscales leen la copia conservada; los ordinarios conservan su plantilla.
- Durante esta preparación mostrar “Documento de prueba / No emitido fiscalmente”. No incorporar un QR o código de seguridad calculado como si fuera oficial.
- Preparar espacios para datos oficiales futuros y reglas de campos impresos por tipo.
- Crear captura manual de documentos recibidos y soportes vinculados a compras/gastos. No construir recepción automática, acuses o aprobación comercial por API.
- Conciliar ventas/notas/cobros, compras/retenciones/deudas/pagos y gastos/reembolsos. Un E41 preparado no cuenta otra vez como gasto; E33/E34 modifican informes mediante sus propios movimientos.
- Añadir exportación administrativa de detalle fiscal y pendientes. Conservar datos necesarios para evaluar reportes tributarios después, sin presentar un CSV interno como declaración oficial 606/607/609.

**Ventanas:** impresión e informes existentes, sección de documentos recibidos y bandeja común.  
**Aceptación:** mismo total en operación, copia, informe e impresión; no aparecen documentos de prueba como aceptados. Cambiar nombre del negocio o producto no cambia un documento conservado.

### Etapa 15 — Compatibilidad final, offline y operación segura

**Objetivo:** cerrar la preparación sin efectos secundarios sobre el SaaS.

**Trabajo:**

- Adaptar contratos web/móvil con metadatos fiscales opcionales; los clientes anteriores y empresas ordinarias mantienen su contrato.
- Asegurar que Server Actions y Route Handlers llamen a la misma política/validación y no diverjan.
- Comprobar la cobertura móvil por etapa de la sección 13, la especificación OpenAPI, los ejemplos y las pruebas HTTP. No dar por lista una operación móvil porque exista su Server Action o una ruta que solo funcione con cookies del navegador.
- Versionar IndexedDB y cachés por empresa; conservar la identidad de operaciones pendientes y sus metadatos al actualizar.
- Las operaciones offline usan identificación local, sin inventar e-NCF. Al sincronizar se comprueba política, fecha y numeración en el servidor.
- No presentar un recibo offline como factura electrónica. En el perfil fiscal, mostrar el estado pendiente y resolver explícitamente cambios de configuración o rangos agotados sin descartar la venta.
- Verificar que validación/cálculo/conciliación no dependan del huso horario del servidor; preservar instantes y fechas comerciales con su zona.
- Probar migraciones aditivas sobre copia aislada, datos antiguos y campos opcionales. Un despliegue no activa perfiles ni prepara históricos.
- Incluir nuevas relaciones en exportación, copia y restauración. No restaurar contadores hacia atrás como si los números posteriores nunca hubieran existido; exigir conciliación antes de reanudar cualquier futura emisión.
- Diseñar preservación y exportación del historial fiscal en la baja de empresa. Revisar el borrado en cascada y `account-purge.ts`; no cambiar la baja de clientes ordinarios por una obligación ajena a su perfil. La política de conservación por jurisdicción debe quedar resuelta antes de integrar producción.
- Ejecutar las regresiones pertinentes y registrar evidencias. Las nuevas pruebas no deben enviar documentos reales ni usar bases productivas.

**Ventanas:** estados offline, sincronización, copias/exportación y mensajes de transición.  
**Aceptación:** se supera la matriz final y todos los tipos quedan preparables localmente; no hay conexión fiscal activa ni consumo de numeración real.

## 8. Matriz mínima de pruebas

Cada fila debe guardar datos iniciales, acción, resultado esperado y evidencia. Las comprobaciones de estados externos se realizan con fixtures aislados.

| Caso | Resultado requerido |
|---|---|
| Empresa sin configuración fiscal | Comportamiento y contratos de la línea base. |
| Empresa de otro país sin perfil | Ningún requisito nuevo de RNC, DGII o tipos E. |
| Dos empresas con perfiles diferentes | Sin contaminación de configuración, caché, números o documentos. |
| Activar con históricos | No renumerar ni preparar operaciones anteriores automáticamente. |
| Desactivar con documentos previos | Nuevas operaciones según política; historial anterior consultable y protegido. |
| Datos fiscales enviados por cliente sin permisos | Rechazo controlado en servidor, sin movimiento financiero. |
| Dos cajeros confirman al mismo tiempo | Numeración única, sin doble aplicación de stock/saldos. |
| Respuesta perdida y reintento | Mismo documento y resultado, sin otro número. |
| Mismo identificador y datos distintos | Conflicto, sin alterar la primera operación. |
| Rango agotado, inválido o vencido | Mensaje específico; no asignación fuera del rango. |
| Integración productiva futura: rango no verificado o número fuera de los límites aprobados | Emisión bloqueada; no se asigna ni transmite un e-NCF sin autorización verificable y vigente del emisor y tipo correspondientes. |
| Último número con rango preparado | Se conserva la reserva y se activa una sola vez el siguiente rango utilizable del mismo ámbito; historial y reintento coherentes. |
| Último número sin relevo utilizable | Se conserva la última reserva; la siguiente solicitud recibe un mensaje de falta de numeración sin duplicar ni perder la operación comercial. |
| Cantidad de tres decimales | Conversión acordada o bloqueo informado; sin pérdida silenciosa. |
| Tasas mixtas, exento, tasa cero, descuento y precio incluido | Conciliación exacta con política fiscal versionada. |
| Envío y propina | Clasificación explícita y conciliación, sin reutilizar campos incorrectamente. |
| E31/E32, contado/crédito y pago dividido | Identidad, vencimientos y medios de pago consistentes. |
| E44/E45/E46 | Campos condicionales y tratamiento específico, sin cambios invisibles de precio. |
| E34 parcial simultánea | No supera cantidades o importes; reserva de pendientes correcta. |
| E34 sobre pagada o sin devolución física | Reembolso/crédito correcto; stock solo cuando corresponde. |
| E33 sobre pagada | Un nuevo cargo, sin modificar la venta ni duplicar ingresos. |
| E41 formal recibido y E41 propio | Origen inequívoco; no doble documento ni deuda. |
| E41 a crédito con retenciones | Neto, pagos, obligaciones de impuestos y saldo coherentes. |
| E43 pagado por empleado | Un gasto y un reembolso; sin otra salida automática duplicada. |
| E47 con abonos y moneda distinta | Base documentada y pagos conciliados; tasa conservada o limitación explícita. |
| Cambio de cliente/producto/configuración | No modifica copias confirmadas. |
| Consulta, impresión o trabajo reintentado | Sin efectos en caja, saldos, inventario o numeración adicional. |
| Móvil antiguo y operación offline | Empresas ordinarias siguen operando; metadatos nuevos no se pierden. |
| Nueva operación fiscal desde móvil y desde web | Mismos cálculos, permisos, numeración y efectos a través del servicio común. |
| Empresa activa con app que no soporta el contrato fiscal | Error explícito de capacidad/actualización antes de crear una operación incompatible; no degradación silenciosa a venta ordinaria. |
| Credenciales móviles sin cookies, vencidas o de negocios distintos | Autorización correcta o rechazo controlado; sin acceso cruzado ni creación parcial. |
| Reintento tras perder respuesta, cerrar app o renovar sesión | Recuperación por identificador estable, sin duplicar documento ni movimiento. |
| Descarga e impresión desde app | Acceso autenticado a los datos/archivos permitidos; sin depender de sesión web ni revelar credenciales del proveedor. |
| Restauración y baja de empresa | Integridad y conservación conforme a la política definida. |

## 9. Reglas dominicanas que deben quedar centralizadas

Estas son condiciones para el perfil local, no validaciones globales del SaaS. Registrar fuente, fecha y versión en el catálogo de reglas; verificarlas otra vez antes de producción.

| Regla | Tratamiento previsto |
|---|---|
| Vencimiento documental | E31/E33/E41/E43/E44/E45/E46/E47 lo incluyen; E32/E34 lo omiten. |
| Indicador de facturación | Distinguir gravado 18 %, 16 %, 0 %, exento y no facturable. E44/E43/E47 exentos; E46 tasa cero en sus líneas. |
| Referencias | E33/E34 conservan comprador y comprobante anterior elegible. E33 usa código de modificación 3. |
| E34 temporal | Calcular `IndicadorNotaCredito` con fechas reales: 0 hasta 30 días calendario y 1 después; el tratamiento del ITBIS requiere el cálculo específico. |
| E41 retenciones | Totales de retención coherentes con las líneas; conservar ceros requeridos. |
| E43 estructura | Sin sección Comprador; no convertir silenciosamente impuestos incompatibles. |
| E47 estructura | Identificación extranjera, servicios y retención ISR por línea. |

Reglas de estructura contrastadas con [el formato de documentos](https://zarelafact.com/docs/integration/document-format) y [los ejemplos por tipo](https://zarelafact.com/docs/integration/ecf-types). Estos enlaces solo ayudan a validar compatibilidad del modelo: no convierten el plan en una implementación del proveedor.

La precisión de cantidades, unidades, campos condicionales y representación impresa debe contrastarse con el [formato oficial e-CF de la DGII](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20V1.0.pdf). Los servicios fiscales futuros no deben compensar datos faltantes con supuestos.

Para elegibilidad y momento de compras, gastos menores y pagos al exterior, usar la [guía oficial de comprobantes especiales](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/facturacion/Documents/Comprobantes%20Fiscales/3-Guia-Comprobantes-Fiscales-Especiales-NG-05-19.pdf). La elegibilidad tributaria no se decide únicamente por el XSD ni por un ejemplo JSON.

## 10. Qué queda expresamente para después

No forma parte de este plan:

- Registro o alta en Zarelafact y selección de su modalidad comercial.
- Cliente HTTP, endpoints, credenciales o claves de API.
- Carga, almacenamiento o rotación de certificados digitales y sus contraseñas.
- Firma XML, transmisión a DGII y procesamiento de respuestas reales.
- Webhooks, sondeo remoto, contingencia automática o envío diferido real.
- Certificación del emisor y habilitación de producción.
- Recepción automática de proveedores, acuses y aprobación comercial externa.
- Solicitudes remotas de anulación y manejo productivo de reemisiones.
- Declaraciones tributarias oficiales automatizadas.
- Contabilidad de partida doble completa e internacionalización integral del SaaS.
- Consolidación fiscal de gastos menores; se evaluará aparte si se necesita.

Sí se dejan preparados los datos, relaciones, estados, permisos, numeración de prueba y puntos de extensión para esas capacidades. No implementar interfaces extensas basadas en supuestos del proveedor antes de elegir el contrato real.

## 11. Condiciones para declarar terminada la preparación

- [ ] Empresas ordinarias y sin configuración fiscal mantienen los resultados de la línea base.
- [ ] No existen requisitos dominicanos globales ni llamadas fiscales en su flujo.
- [ ] Preferencias y secuencias están aisladas por empresa, perfil y ambiente.
- [ ] El historial de rangos es consultable y el relevo automático de rangos preparados funciona de forma transaccional, con alertas y sin duplicar numeración.
- [ ] Los diez tipos pueden prepararse y validarse con datos locales de prueba.
- [ ] Se reutilizaron ventanas existentes; las nuevas cubren funciones ausentes.
- [ ] Copias fiscales y referencias no dependen de fichas actuales.
- [ ] E33/E34 corrigen mediante operaciones relacionadas y no sobrescriben originales.
- [ ] Compras, gastos, retenciones, deudas y pagos no producen duplicidades.
- [ ] Estados comerciales, financieros y fiscales están separados.
- [ ] Doble clic, concurrencia, caída y reintento son recuperables.
- [ ] Móvil y offline respetan política, identidad de operación y compatibilidad anterior.
- [ ] Cada etapa tiene rutas móviles comprobadas, permisos, contratos OpenAPI y ejemplos completos; no depende solo de Server Actions.
- [ ] Se verificaron los contratos móviles y la compatibilidad relevantes para cada etapa mediante pruebas enfocadas dentro del límite de cinco minutos.
- [ ] Migraciones, copias, restauración y baja de empresas tienen una política verificada.
- [ ] La interfaz distingue preparación y prueba de emisión legal real.
- [ ] Queda documentado como requisito previo a producción verificar la autorización DGII, sus límites y vigencia; los rangos de prueba registrados no se presentan como autorización real.
- [ ] Ninguna prueba consumió numeración productiva ni envió documentos reales.
- [ ] Se documentaron limitaciones y reglas pendientes de validación tributaria antes de producción.

La siguiente conversación sobre integración comienza a partir de estas evidencias; completar estas etapas no equivale a obtener autorización fiscal.

## 12. Plantilla para retomar una etapa en otra sesión

```text
Trabaja en la etapa [NÚMERO Y NOMBRE] de docs/plan-estructura-fiscal-saas.md.

Lee las instrucciones del repositorio y verifica el código actual y las dependencias
de esa etapa. Usa los componentes existentes y no dupliques funcionalidades.

Implementa únicamente el alcance de la etapa, con migraciones compatibles y
comprobaciones apropiadas. El módulo fiscal es opcional por empresa: conserva
el comportamiento actual de las empresas que no lo activen.

Incluye la API interna para móvil cuando corresponda, con servicios compartidos,
autenticación, permisos y contrato documentado. Comprueba lo cambiado en web o API
y el flujo ordinario con el módulo fiscal apagado. Las pruebas de la etapa,
incluidos sus preparativos, deben durar como máximo cinco minutos en total.

No conectes una API fiscal externa, no envíes documentos, no consumas numeración real
ni presentes resultados simulados como aceptación de la DGII.

Si corriges errores, deja comentarios preventivos. Al terminar, actualiza el
seguimiento y el registro de ejecución con archivos, pruebas, limitaciones y
pasos de revisión desde la interfaz. Marca completa solo si cumple la aceptación.
```

### Registro de ejecución por etapa

**Cierre de la etapa 1, 9 de noviembre de 2026. Estado: completada.** Conforme al límite de pruebas solicitado, se ejecutaron en paralelo `fiscal-test:next-policies`, `fiscal-test:regression` (59/59) y `fiscal-test:settings` (7/7), en menos de cinco minutos en total. Next verificó dos empresas con políticas distintas, rechazo de datos fiscales no implementados, aislamiento de sesiones, venta ordinaria con fiscal apagado, reintento e inventario. Las políticas activas fueron únicamente fixtures de prueba. La configuración fiscal real sigue sin activación ni conexión externa. Los pendientes antiguos sin empresa identificable se conservan sin atribuir y su conciliación queda para la etapa de transición; no se hizo una revisión visual con sesión real en este cierre.

**Etapa 1 — aislamiento fiscal, 9 de noviembre de 2026. Estado: en curso.** Se añadieron `FiscalSettings` y `FiscalPolicyChange`, migración aditiva, permisos fiscales y contexto móvil, consulta de capacidades, catálogo DO, servicio de cambios versionados y rechazo de entradas fiscales no implementadas en ventas, compras, pagos a proveedores, devoluciones, gastos y operaciones de caja. La activación permanece bloqueada; no existe emisión ni conexión externa. La migración se aplicó únicamente a `movopos_fiscal_test_2`. Documentación móvil: [API fiscal](docs/api-estructura-fiscal.md) y [OpenAPI](docs/openapi-estructura-fiscal.json).

Pruebas: `fiscal-test:regression` 57/57; `fiscal-test:integration` 78/78 (41 caja, 24 compras, 13 línea base), incluido el rechazo sin efectos para cinco operaciones. En Next real, `fiscal-test:next` comprobó capacidades con credenciales móviles, rechazo y reintento de E31, falta de permiso y sesiones cruzadas para las dos empresas. ESLint de los módulos y rutas fiscales pasó. La comprobación TypeScript de fuentes pasó excluyendo tipos generados; la compilación habitual sigue bloqueada por errores de sintaxis en `.next/dev/types/routes.d.ts` preexistente.

Pendientes para aceptación: revisar todos los demás puntos de mutación y la propagación de política/versiones en sincronización; ampliar las pruebas HTTP para políticas distintas con fixtures aislados y para todos los flujos afectados; revisar visualmente Ajustes con sesión real en un entorno con aislamiento completo de red. La tarjeta fiscal se debe ver solo para dueño o usuario con algún permiso fiscal y debe indicar «Pendiente de conexión». La restricción documentada del entorno interactivo sigue vigente. No marcar completa hasta verificar estos puntos y la política de transición de operaciones pendientes.

**Continuación de la etapa 1, 9 de noviembre de 2026. Estado: en curso.** La cola antigua ahora rechaza y conserva ventas y pagos que contienen datos fiscales o versión de política, en vez de eliminarlos al convertirlos a operaciones ordinarias; la limpieza por cuenta por cobrar también preserva esos pendientes. La API de operaciones de caja rechaza datos fiscales en el cuerpo exterior además del `payload`. Cambios en `src/lib/fiscal/core/input.ts`, `src/lib/sync-manager.ts`, `src/lib/indexed-db.ts` y `src/app/api/cash-shifts/operations/route.ts`, con comentarios preventivos y pruebas en `scripts/cache-sync-regression.test.mjs` y `scripts/sale-notes-api-print.test.mjs`. `npm run fiscal-test:regression`: 59/59; `npm run fiscal-test:integration`: 78/78 en tres bases locales aisladas. La integración se ejecutó antes del último ajuste de validación exterior de caja, cubierto por la regresión posterior. ESLint del sincronizador sigue informando cuatro usos preexistentes de `any`.

Estas protecciones no implementan todavía la captura y validación de la versión fiscal en ambas colas ni la transición de pendientes; tampoco sustituyen la revisión completa de mutaciones, las pruebas HTTP con políticas diferentes ni la revisión visual solicitada. La activación continúa bloqueada y el servidor interactivo sigue sin aislamiento de red suficiente. Mantener la etapa abierta.

**Avance adicional de etapa 1, 9 de noviembre de 2026. Estado: en curso.** La cola de caja captura la versión del contexto autenticado y el servidor la compara dentro de la transacción, serializada con los cambios de política; recupera primero las respuestas ya confirmadas y conserva los conflictos. Se registra la versión del servidor en `CashOperation`; la migración `20261109120000_cash_fiscal_policy_version` deja en `null` los registros históricos y se aplicó a `movopos_fiscal_test_2`, no a producción. Las mutaciones financieras afectadas pasan por una protección común que rechaza un perfil activo aún no implementado, incluso si el cliente omite datos fiscales. Se protegieron también cobros individuales y múltiples, web y API. La guía móvil describe los nuevos datos y errores.

Verificaciones: 42 pruebas de caja y 24 de compras en bases aisladas; 14 de línea base tras restablecer el perfil forzado de la prueba; 59 regresiones simuladas; 23 pruebas de cola con IndexedDB en navegador temporal y servidor simulado; 19 pruebas del POS con servidor simulado; comprobación TypeScript de fuentes sin errores al excluir tipos generados, y ESLint de los archivos fiscales y de la cola comprobados. La compilación general continúa bloqueada por `.next/dev/types/routes.d.ts` generado y corrupto. Las pruebas de política activa usan fixtures locales, no acreditan emisión fiscal.

`fiscal-test:next` volvió a aprobarse con ambas identidades móviles y sin cookies: comprobó el nuevo contexto de cola, el rechazo fiscal de ambos endpoints de cobro, permisos y sesiones cruzadas. Las dos empresas tenían el perfil desactivado durante esta ejecución; el caso activo solo se verificó en las bases aisladas y con autenticación simulada. La migración se ensayó además sobre un `CashOperation` anterior, cuya versión permaneció en `null` y cuya respuesta se conservó.

Pendiente: integrar captura y validación de política, autoría y recuperación en la cola anterior utilizada sin control de caja; revisar exhaustivamente las demás mutaciones y contratos móviles; comprobar HTTP con políticas distintas usando autenticación real; revisión visual de permisos y tarjeta en un entorno aislado, y transición de pendientes previa a habilitar activación. Los clientes antiguos sin versión se aceptan solo con el módulo desactivado; su versión histórica no puede inferirse. No marcar completa la etapa todavía.

**Cola sin turnos, 9 de noviembre de 2026. Estado: en curso.** Las nuevas ventas y cobros web sin control de caja usan la cola durable común con identificador, empresa, empleado y versión de política; `CashOperation` ahora permite confirmar y recuperar una operación sin turno incluso si nunca se creó `CashControl`. El servidor sigue rechazando un turno inexistente y mantiene la comparación fiscal transaccional. El aviso de pendientes está disponible también sin turnos. Los registros de la cola anterior que carecen de esos datos se conservan sin reenviarse ni reasignarse; Cuadre diario advierte de ellos. Todavía falta una herramienta de revisión y resolución para esos registros y una política de transición que no infiera autoría ni provoque duplicados.

Comprobaciones de esta continuación: 43 pruebas de caja, 24 de compras y 14 de línea base en bases aisladas; posteriormente, la línea base ampliada pasó 15/15, incluida una venta HTTP sin turnos y su reintento idempotente contra PostgreSQL con autenticación simulada. Pasaron 59 regresiones, 23 casos de cola en navegador y 19 del POS con servidor simulado, además de TypeScript de fuentes y ESLint de los archivos seleccionados. La nueva ruta sin turnos aún requiere una prueba HTTP con credenciales móviles reales y la revisión visual completa; no se considera terminada la etapa.

**HTTP móvil con políticas diferentes, 9 de noviembre de 2026.** `npm run fiscal-test:next-policies` creó bases locales nuevas de fixtures y utilizó las dos identidades Clerk ficticias autorizadas. En Next real, con autenticación móvil y sin cookies, comprobó simultáneamente una empresa sin perfil y otra con DO_ECF activado únicamente como fixture. La primera pudo confirmar una venta sin turno y recuperar el mismo resultado en un reintento; la segunda rechazó una venta que omitía los datos fiscales. Comprobó que el inventario solo se descontó una vez, rechazó una versión desactualizada y sesiones o pendientes cruzados, y verificó el rechazo de datos fiscales en cobros, compras, OCR, pagos a proveedores, devoluciones y gastos. También verificó permisos de los cajeros. No se llamó a ningún proveedor fiscal ni se utilizó numeración fiscal. El esquema de esta base se generó desde Prisma; no reemplaza la comparación de plataforma de la base `movopos_fiscal_test_2` ni la revisión visual de la interfaz.

La página de Ajustes pasó además 7 pruebas de renderizado con identidades simuladas: dueño, cada permiso fiscal por separado, usuario sin permisos fiscales y rechazo sin acceso al módulo. La tarjeta muestra «Pendiente de conexión» y no afirma que exista autorización para emitir. Son comprobaciones del HTML generado, no una revisión visual con sesión real.

**Revisión de pendientes antiguos, 9 de noviembre de 2026.** Cuadre diario permite revisar y retirar expresamente pendientes vinculados a la empresa: el empleado ve los suyos y el dueño puede revisar también los de otro empleado o autor no registrado. Se exige motivo; el servidor conserva copia y revisor en auditoría antes de retirarlos del dispositivo, sin crear ni alterar una operación comercial. Un identificador estable permite recuperar una respuesta perdida; una modificación concurrente impide borrar la nueva versión. Los pendientes que no identifican empresa siguen ocultos y conservados, pues no se puede atribuirlos con seguridad. Pasaron 5 pruebas con IndexedDB y servidor simulado, 59 regresiones y la prueba HTTP autenticada real de auditoría y reintento en una base aislada. Quedan pendientes un procedimiento para registros sin empresa y la revisión visual con sesión real en un entorno de red completamente aislado; la etapa continúa en curso.

**Etapa 0 — preparación del entorno, 9 de noviembre de 2026. Estado: en curso.** Base local y fixtures configurados; estructura `public` e historial comparados con producción en modo de solo lectura; autenticación real de ambas cuentas comprobada en Next, con cookies web, headers móviles y rechazo de cruce entre empresas. Scripts y resultados reproducibles: sección 1 y [guía del entorno](docs/entorno-pruebas-fiscales.md). No se implementaron modelos ni migraciones fiscales. Siguiente trabajo: completar aislamiento de salidas, revisión de interfaz y escenarios comerciales pendientes antes de aceptar la línea base e iniciar la etapa 1.

**Revalidación de etapa 0, 9 de noviembre de 2026:** conexión y fixtures, 3 pruebas de autenticación, 55 regresiones simuladas, 41 pruebas de caja y 24 de compras/pagos en bases locales separadas, y autenticación de las dos cuentas en Next volvieron a aprobarse. La defensa Node bloqueó las conexiones ensayadas, pero no cubre navegador ni binarios nativos. Se inventariaron las superficies comerciales, contratos y salidas conocidas en la guía del entorno. Permanecen pendientes el aislamiento integral, los recorridos visuales y móviles completos, la impresión visual y la sincronización real; la etapa sigue en curso.

**Consultas móviles ampliadas:** en Next real pasaron seis listados paginados para el dueño de cada empresa y el rechazo de compras para cada cajero sin permiso. No cubren todavía mutaciones comerciales ni aislamiento de todos los registros. El entorno interactivo continúa bloqueado mientras no exista una barrera de red comprobada para navegador y procesos nativos.

Duplicar este bloque al comenzar cada etapa:

```text
Etapa:
Fecha:
Estado: pendiente / en curso / completada
Dependencias verificadas:
Cambios y ventanas:
Archivos y migraciones:
Pruebas realizadas y resultados:
Compatibilidad con perfil desactivado:
Rutas y contratos móviles implementados:
Pruebas HTTP móviles, autenticación y compatibilidad anterior:
Pasos de revisión desde la interfaz:
Limitaciones o decisiones pendientes:
Siguiente etapa recomendada:
```

## 13. API interna lista para la aplicación móvil

### Alcance y arquitectura

Esta sección es parte obligatoria del plan. La API interna de MOVOPos debe quedar implementada, documentada y probada para todos los tipos de comprobante, aunque la app móvil incorpore sus pantallas en otro repositorio o en otro momento. El desarrollo de esas pantallas no se considera realizado por publicar los endpoints.

La app se comunica con MOVOPos, nunca directamente con un proveedor fiscal. Los Route Handlers móviles y las Server Actions web deben delegar en los mismos servicios de dominio: permisos, política fiscal, cálculo, numeración, confirmación y aplicación financiera. No llamar una Server Action desde la app ni replicar su lógica en una ruta independiente.

La implementación parte de las rutas existentes en `src/app/api/` y del helper `src/app/api/_helpers/auth.ts`. Como referencias de compatibilidad del proyecto, revisar `docs/api-compras-credito.md`, `docs/openapi-compras-credito.json` y `docs/api-notas-venta.md`.

### Entrega móvil correspondiente a cada etapa

Los recursos nuevos de esta tabla son propuestas de contrato; no son rutas ya disponibles. Al implementar, fijar los nombres en OpenAPI y reutilizar las rutas existentes siempre que conserven su semántica.

| Etapa | Recursos o contratos móviles a entregar |
|---|---|
| 0 | Línea base de HTTP y fixtures: autenticación, caja, ventas, devoluciones, compras, pagos y gastos sin datos fiscales. |
| 1 | Consulta de capacidades y permisos fiscales de la empresa autenticada; política común en todas las mutaciones. |
| 2 | Lectura/actualización autorizada de preferencias fiscales; reutilizar `/api/company-settings` para datos existentes y definir un recurso fiscal separado si evita romper su contrato. |
| 3 | Ampliación compatible de `/api/customers`, `/api/suppliers` y `/api/products`, incluidos detalles y edición. Catálogos fiscales filtrados por perfil y permisos. |
| 4 | Validación/previsualización local del documento con totales calculados en servidor y errores de campo; sin reservar números ni aplicar efectos. |
| 5 | Consulta y mantenimiento autorizado de rangos, historial, preparación para relevo y disponibilidad; ninguna ruta permite al móvil elegir libremente el próximo e-NCF o modificar el contador. |
| 6 | Bandeja, detalle e historial de documentos; confirmación/preparación y recuperación de resultado por identificador de operación. |
| 7 | Ampliación de `/api/sales`, sus detalles y el protocolo de caja para E31/E32; devuelve vínculo fiscal y estado local. |
| 8 | Mismo contrato de ventas con secciones y validaciones de E44/E45/E46; catálogos y datos condicionales para exportación. |
| 9 | Ampliación de `/api/returns` y búsqueda de factura; nuevos recursos de notas de crédito financieras, cantidades disponibles, aplicación y estado. |
| 10 | Recursos de notas de débito: crear, consultar, editar borrador, validar y confirmar con referencia y efecto financiero único. |
| 11 | Ampliación de `/api/purchases`, `/api/accounts-payable` y `/api/supplier-payments`; nuevos orígenes sin inventario, retenciones, soportes recibidos y E41. |
| 12 | Ampliación de `/api/operating-expenses`; detalle, soportes, empleado, reembolso y E43. Recursos de liquidación si se crean. |
| 13 | Datos de operaciones/pagos al exterior y preparación E47 ligada al hecho correspondiente; consulta de base ya documentada y pagos relacionados. |
| 14 | Lectura y carga autorizada de soportes; datos imprimibles, descarga y reportes paginados consumibles desde app. |
| 15 | Regresión de todos los contratos, versiones, offline soportado, recuperación y documentación final para el equipo móvil. |

### Capacidades y compatibilidad

- Ofrecer una consulta autorizada de capacidades —por ejemplo, `/api/fiscal/capabilities`— con `enabled`, perfil, ambiente, versión de configuración, tipos soportados, operaciones disponibles y necesidad de conexión. Devolver únicamente información que el usuario pueda consultar.
- Mantener separado “tipo soportado por el servidor”, “permitido por el perfil”, “secuencia disponible” y “usuario autorizado”. La app debe poder explicar por qué una acción está bloqueada.
- Incorporar los nuevos permisos en el contexto de usuario que consume la app, sin romper el login ni los campos existentes de `/api/auth/me`.
- No exigir campos fiscales nuevos en las operaciones de empresas con el módulo desactivado. Mantener valores, formatos y errores anteriores donde formen parte del contrato existente.
- Si una empresa activa requiere datos que una versión antigua de la app no puede enviar, responder con un error de capacidad/actualización documentado antes de confirmar cambios. Omitir el bloque fiscal no debe permitir evitar las reglas activas del servidor.
- La versión de la app no decide la autorización. Usar versiones de contrato y datos explícitos para compatibilidad; la política vigente del servidor sigue siendo la autoridad.
- Los documentos fiscales anteriores pueden seguir visibles de acuerdo con permisos aunque el módulo esté desactivado para nuevas operaciones.

### Autenticación y seguridad

- Conservar el mecanismo móvil existente: token de Clerk mediante `X-Clerk-Authorization` o `Authorization`, junto con `X-SubUser-Token`. Comprobarlo con peticiones sin cookies.
- Verificar sesión, usuario activo, pertenencia al negocio y permisos en cada solicitud. Respetar los requisitos de turno/dispositivo del protocolo de caja existente cuando la operación los utilice.
- Resolver empresa, usuario y permisos desde credenciales verificadas. Los identificadores enviados en payloads de caja sirven para cotejar contexto; nunca conceden identidad o acceso por sí mismos.
- Revalidar propiedad de todos los IDs: factura referenciada, comprador, proveedor, secuencia, producto, nota, soporte, cuenta de tesorería y pago.
- No aceptar del móvil estados de aceptación fiscal, respuestas de autoridad, códigos de seguridad, hashes de confianza o totales como datos autoritativos. El servidor calcula y verifica los valores.
- Las descargas deben mantener los mismos permisos y aislamiento. No usar enlaces públicos permanentes para documentos privados ni devolver secretos del servidor.

### Contratos, errores y documentación

- Publicar una especificación OpenAPI de la ampliación fiscal interna —archivo propuesto `docs/openapi-estructura-fiscal.json`— y una guía móvil con ejemplos —`docs/api-estructura-fiscal.md`—. Se crean durante la implementación, no se consideran existentes por aparecer aquí.
- Definir requests, responses, campos opcionales, nulabilidad, permisos, reglas, paginación, filtros, orden estable y compatibilidad. Incluir ejemplos para los diez tipos y para empresas sin perfil activo.
- Mantener importes en centavos donde ya se usan. Definir cadenas decimales para precisiones adicionales y tasas; e-NCF y contadores grandes se serializan sin pérdida. No cambiar unilateralmente la unidad de un campo existente.
- Distinguir fechas comerciales `YYYY-MM-DD` de instantes ISO 8601 y declarar su zona de interpretación. No usar el reloj del móvil para decidir la fecha fiscal confiable.
- Documentar creación frente a recuperación de una operación, estados comerciales y fiscales separados, saldo actualizado y referencias al recurso creado.
- En endpoints nuevos definir errores estables: código, mensaje, campos afectados, posibilidad de reintento e identificador de correlación. Distinguir autenticación, permiso, dato inválido y conflicto. Respetar las convenciones anteriores de endpoints reutilizados o versionar cambios incompatibles.
- No presentar el éxito comercial como preparación fiscal completada si esta quedó pendiente. La respuesta puede confirmar la operación comercial y debe devolver ambos estados claramente, sin inducir a crear otra operación para resolver un pendiente.
- Incluir comandos o colecciones de solicitudes ejecutables con datos de prueba; nunca credenciales reales dentro de ejemplos.

### Reintentos, concurrencia y offline móvil

- Usar un identificador de operación estable, persistido antes del primer envío. Reintentar conserva datos y contexto; cerrar la app o renovar sesión no genera otro identificador para la misma operación pendiente.
- La deduplicación se resuelve en el servidor con aislamiento por empresa y tipo de operación. No confiar únicamente en almacenamiento o botón deshabilitado de la app. Integrar los identificadores y garantías del protocolo de caja vigente, sin crear dos capas contradictorias de idempotencia.
- Exponer una forma autorizada de recuperar el resultado después de perder la respuesta. Un resultado incluye sus vínculos y efectos ya aplicados; consultarlo no vuelve a confirmarlos.
- Numeración y reservas siempre en el servidor. Una app offline solo conserva un ID temporal y los datos necesarios; nunca muestra un e-NCF inventado o tomado de un contador local.
- Respetar lo que hoy requiere conexión: las compras a crédito y pagos a proveedores no adquieren soporte offline por ampliar sus campos. Publicar una matriz de operaciones online/offline y rechazar encolados no soportados.
- Para operaciones ya soportadas offline, conservar metadatos fiscales, versión de política y autoría en la cola. Al sincronizar, revalidar cambios de configuración y devolver conflictos recuperables sin descartar operaciones ni reasignarlas a otro usuario.
- Los importes presentados antes de sincronizar son provisionales cuando falte validación. Si cambia el resultado, devolver el detalle y resolverlo explícitamente antes de aplicar un cobro adicional o cambio de saldo.

### Consulta, archivos e impresión móvil

- Proporcionar DTOs para bandeja y detalle fiscal, notas relacionadas, errores, saldos y acciones permitidas, sin obligar a cargar páginas HTML de escritorio.
- Ofrecer datos imprimibles de la copia conservada para la impresión nativa/Bluetooth, y descarga autenticada de los archivos disponibles. No asumir que un redirect pensado para navegador funciona con tokens móviles.
- La app muestra claramente “Pendiente de conexión” y “Documento de prueba / No emitido fiscalmente” en esta etapa; no intenta construir firma, QR ni aprobación.
- Documentar carga de soportes, tipos/tamaños permitidos, vínculo al registro y permisos de lectura. Las imágenes de productos no se reutilizan automáticamente como almacenamiento de documentos privados.

### Criterios de aceptación de la API móvil

Cuando una etapa modifica la API móvil, documentar el contrato y comprobar de forma enfocada el comportamiento relevante, respetando el máximo total de cinco minutos de pruebas por etapa. Elegir los casos de permisos, aislamiento, validación o reintento que correspondan al cambio; no repetir toda la matriz en cada etapa. Registrar cualquier verificación que no se haya realizado.

Comprobar por operación la igualdad web/móvil de cálculo, secuencia, aplicación financiera y protección histórica. La app antigua de una empresa ordinaria continúa funcionando, mientras que una app sin capacidades fiscales no puede omitir requisitos de una empresa activa. Todos los documentos de estas pruebas permanecen en preparación, sin envíos ni credenciales de proveedores externos.

### Etapa 2 — avance del 9 de noviembre de 2026

**Estado: en curso.** Se añadieron datos fiscales opcionales por empresa, migración, formulario de Ajustes, servicio compartido y `GET/PUT /api/fiscal/settings`; se documentó el contrato móvil. El servidor calcula el estado local y mantiene la activación bloqueada por la conciliación incompleta de pendientes offline. Se conservó el contrato comercial existente. No se conectó ningún proveedor ni se habilitó emisión.

**Comprobaciones enfocadas:** migración aplicada únicamente a `movopos_fiscal_test_2` y lectura Prisma de los cinco campos nuevos aprobada; cuatro pruebas del servicio y handlers con dependencias y autenticación simuladas, siete pruebas de renderizado de Ajustes y nueve regresiones de guardado de ventas aprobadas. TypeScript y ESLint de los archivos seleccionados terminaron sin errores. La generación normal de Prisma encontró el motor bloqueado; la última generación dejó el cliente configurado con motor local y se comprobó la conexión a la base de prueba.

**Ajuste de interfaz:** la tarjeta presenta una opción «Activar»; una confirmación explica que se trata de preparar la configuración y, al continuar, muestra los campos. La activación efectiva sigue bloqueada. Comprobación enfocada: 20 pruebas existentes de configuración, renderizado y ventas aprobadas; ESLint de la interfaz modificada sin errores. No se verificó la interacción visual en navegador.

**Comprobación adicional del contrato anterior:** `node scripts/fiscal-company-contract-check.mjs` probó los handlers reales de `/api/company-settings` contra PostgreSQL local en las dos empresas ficticias, con autenticación y autorización simuladas. La lectura, el guardado de los mismos valores, la relectura y las respuestas 401/403 pasaron con el módulo fiscal apagado. Un intento HTTP con Next y credenciales de prueba reales llegó a responder 401 sin sesión, pero agotó el tiempo durante la compilación del inicio de sesión; el registro indica fallos de asignación de memoria. No se comprobó el contrato autenticado mediante HTTP real.

**Pendiente para aceptación — aplazado por indicación del usuario:** dejar para más adelante las pruebas HTTP con autenticación real: lectura y guardado con credenciales móviles y web, permisos, aislamiento entre empresas y contrato anterior de preferencias con el módulo apagado. No repetirlas por ahora. El intento anterior agotó el tiempo durante la compilación y registró un error de asignación de memoria; la causa exacta no está confirmada. Las pruebas simuladas no sustituyen esas comprobaciones ni una revisión visual. La etapa permanece en curso y no se afirma que las pruebas pendientes hayan pasado.

**Activación de prueba solicitada el 10 de noviembre de 2026:** Ajustes y la API permiten activar explícitamente una configuración DO completa en `TEST`, conservar el estado al editar y desactivarla. Se guardan versión y autor, no se conecta ningún proveedor y la emisión sigue sin estar disponible. Con el módulo activo, las protecciones existentes bloquean ventas, compras, cobros y otras operaciones comerciales todavía no soportadas; los pendientes offline se conservan para revisión. La transición completa sigue pendiente. Las instrucciones antiguas de mantener bloqueada la activación describen el estado anterior a esta decisión del usuario.

**Comprobaciones de esta modificación:** en aproximadamente 2 minutos y 43 segundos, incluyendo preparación y un intento interrumpido, pasaron 24 pruebas enfocadas de configuración, renderizado simulado y guardado de ventas ordinarias; también se comprobó activación, desactivación, auditoría y aislamiento en la base fiscal local con transacción revertida. TypeScript, ESLint seleccionado y sintaxis JSON de OpenAPI pasaron. Se inició por error un intento HTTP autenticado pese a que estas pruebas estaban aplazadas por indicación del usuario; se interrumpió sin resultado y no se repitió. Las pruebas de página y API usaron autenticación simulada; no se revisó visualmente el navegador. El estado de la etapa permanece en curso.

### Etapa 3 — avance del 9 de noviembre de 2026

**Estado: completada por indicación del usuario.** Se añadieron campos fiscales opcionales de clientes, proveedores y productos, una migración aditiva y conceptos sin inventario administrables desde Productos. Los conceptos no están integrados en ventas. Las identificaciones fiscales tienen un campo separado que conserva texto extranjero; los productos históricos mantienen el tratamiento fiscal sin clasificar. Se ampliaron las rutas móviles existentes y se documentaron los campos. Permanecen sin verificar visualmente los formularios, las peticiones con credenciales reales y la matriz HTTP completa; la etapa 2 continúa en curso.

**Comprobaciones enfocadas:** migración aplicada únicamente a la base fiscal local aislada; prueba transaccional aprobada de conservación de identificación extranjera, actualización con campos omitidos, tasa cero y exento, creación de concepto y aislamiento de consultas entre dos cuentas. Nueve regresiones existentes de guardado de ventas aprobaron. TypeScript terminó sin diagnósticos y ESLint aprobó los archivos nuevos. ESLint de las rutas existentes señaló nueve usos previos de `any`; no se modificaron por quedar fuera de esta etapa. La prueba transaccional no ejecuta los formularios ni los handlers HTTP y no acredita por sí sola sus permisos o aislamiento. No se verificaron visualmente los formularios ni se probaron los contratos móviles por HTTP. Las pruebas reales de autenticación de la etapa 2 permanecen aplazadas.

**País de identificación:** los formularios nuevos de clientes y proveedores usan por defecto la jurisdicción configurada para su empresa y ofrecen un listado de países en español. Las fichas existentes conservan su valor, incluidos los textos anteriores; si no hay jurisdicción configurada, el campo queda sin especificar. Pasaron seis pruebas enfocadas de renderizado y aislamiento de la consulta, nueve regresiones de ventas y ESLint de los archivos seleccionados. El chequeo completo de TypeScript no terminó por falta de memoria; no se verificó visualmente en navegador.

**Ayudas de campos:** se añadieron descripciones breves accesibles a los campos fiscales de clientes, proveedores y productos. Pasaron seis pruebas existentes de formularios y nueve regresiones de ventas; ESLint del componente modificado terminó sin errores. No se comprobó la presentación visual en navegador.

**Ejemplos en campos:** se añadieron marcadores de posición a los campos de texto de datos maestros y configuración fiscal. Pasaron 22 pruebas existentes de formularios, Ajustes y ventas, y ESLint de los archivos modificados. No se revisó visualmente en navegador.

**Etiqueta de identificación:** se añadió «(RNC)» y un ejemplo numérico en clientes y proveedores. Pasaron seis pruebas de formularios y nueve regresiones de ventas; no se verificó visualmente en navegador.

**Comprobantes preferidos:** la ficha del cliente permite escoger varias opciones desde un desplegable. La API conserva el campo singular para aplicaciones anteriores e incorpora el arreglo plural; las preferencias antiguas se mantienen. Pasaron ocho pruebas de formularios y compatibilidad, nueve regresiones de ventas, la prueba transaccional de datos maestros y ESLint de los componentes fiscales seleccionados. No se comprobó el desplegable visualmente ni el contrato móvil mediante HTTP real.

**Residencia de proveedores:** el país de residencia fiscal se selecciona de la lista de países y toma la jurisdicción de la empresa en fichas nuevas; las fichas existentes conservan sus valores. Razón social aparece primero en los datos fiscales. Pasaron nueve pruebas de formularios, nueve regresiones de ventas y ESLint de los archivos seleccionados. No se verificó visualmente en navegador.

**Clasificación de productos:** la opción visible «Bien» se renombró a «Producto», conservando el código `BIEN`. Pasaron nueve pruebas de formularios y nueve regresiones de ventas; no se verificó visualmente en navegador.

**Leyenda tributaria:** el formulario de productos explica las cuatro opciones del tratamiento tributario. Pasaron nueve pruebas de formularios y nueve regresiones de ventas; no se verificó visualmente en navegador.

**Revisión de los hallazgos 1–3:** se añadieron los detalles móviles de clientes y productos, la administración móvil de conceptos y un servicio común para la web y la API. El catálogo móvil se filtra por permisos y ofrece los comprobantes E solo con perfil DO configurado. Los campos categóricos usan opciones compartidas y validación en servidor; los valores históricos sin cambios se conservan. Las entradas fiscales inválidas de rutas comerciales devuelven 400. Se documentaron las rutas nuevas en la guía y OpenAPI; la ampliación posterior de OpenAPI para datos maestros consta más abajo.

**Comprobaciones de esta revisión:** la prueba transaccional de datos maestros pasó en la base fiscal local, con reversión; pasaron 17 pruebas de contratos con autenticación y dependencias simuladas y renderizado, y nueve regresiones de ventas ordinarias. TypeScript terminó sin diagnósticos con `tsconfig.fiscal-test.json` y `--allowImportingTsExtensions`; ESLint de los módulos seleccionados terminó sin errores. No se ejecutaron peticiones con credenciales reales ni una revisión visual en navegador. Estas pruebas no acreditan los contratos completos de las rutas comerciales ni la autenticación HTTP real.

**OpenAPI de datos maestros:** se documentaron las doce operaciones de listado, creación, detalle y edición de clientes, proveedores y productos, con sus campos opcionales, preferencias múltiples, permisos reales, paginación, errores y ejemplos con y sin datos fiscales. Los esquemas conservan la posibilidad de leer o reenviar sin cambios valores históricos fuera de catálogo; los códigos nuevos se indican por separado. Se verificaron 120 referencias y 44 ejemplos con AJV, además de la coincidencia de los campos y catálogos con el código. Pasaron siete pruebas enfocadas de contratos con dependencias simuladas, nueve regresiones de ventas ordinarias y la prueba transaccional de datos maestros revertida en la base local. No se ejecutaron peticiones con credenciales reales ni se comprobó toda la matriz HTTP.

**Tratamiento predeterminado:** en el formulario web de productos nuevos se selecciona «Gravado»; las fichas anteriores conservan su clasificación o ausencia de ella. Pasaron diez pruebas de formularios y nueve regresiones de ventas; no se verificó visualmente en navegador.

**Clasificación predeterminada:** los productos nuevos muestran «Producto» por defecto; las fichas existentes conservan su clasificación. Pasaron diez pruebas de formularios y nueve regresiones de ventas; no se verificó visualmente en navegador.

**Campos fiscales opcionales:** las fichas indican que sus datos fiscales son opcionales al guardar y pueden ser necesarios al preparar un comprobante. Pasaron diez pruebas de formularios y nueve regresiones de ventas; no se comprobó visualmente en navegador.

**Claridad de requisitos:** clasificación fiscal y tratamiento tributario se señalan como necesarios para facturación electrónica, mientras unidad fiscal se identifica como opcional en el e-CF. Guardar fichas sigue permitiendo datos incompletos. Pasaron diez pruebas de formularios y nueve regresiones de ventas; no se revisó visualmente en navegador.

**Requisitos en formularios:** clientes y proveedores distinguen los datos que pueden ser necesarios según la operación; Ajustes indica los datos exigidos por MOVOPos para completar el perfil DO y conceptos aclara qué necesita para guardarse o preparar un comprobante. Pasaron 26 pruebas enfocadas de formularios, Ajustes y ventas. No se revisó visualmente en navegador.

**Cliente Prisma:** la generación habitual encontró bloqueado el motor local; se generó el cliente sin reemplazar ese archivo y se conservó la configuración de motor local, comprobando la conexión a la base de prueba. No se aplicó la migración a otra base.

### Etapa 4 — avance del 9 de noviembre de 2026

**Estado: completada por indicación del usuario.** Se creó una migración aditiva con documento, líneas, referencias e historial, aislamiento de origen por empresa y protección de copias congeladas. Se incorporaron cálculo decimal, clasificación de líneas, descuento distribuido, retenciones, moneda de reporte, ejemplos de los diez tipos, componentes compartidos y previsualización web/móvil con permiso y perfil DO configurado. La previsualización no guarda ni numera documentos; la activación y emisión siguen bloqueadas. Las cantidades nuevas de ventas se limitan a dos decimales en el POS, servidor y cola; no se reescribieron históricos.

**Comprobaciones:** migración aplicada directamente a `movopos_fiscal_test_2`, sin registrarla en `_prisma_migrations`; antes de usar `migrate deploy` en esa base hay que conciliar su historial. Pruebas transaccionales de origen entre empresas y protección de copia/líneas congeladas aprobadas con fixtures revertidos. Pasaron 42 pruebas enfocadas de ejemplos, cálculo, contratos con autenticación simulada y regresiones de ventas e inventario. Prisma validó el esquema, TypeScript terminó sin diagnósticos y ESLint aprobó los módulos fiscales seleccionados. Se verificó que OpenAPI es JSON válido. La generación normal de Prisma encontró bloqueado el motor; se generó el cliente sin sustituirlo, se conservó la configuración de motor local y se verificó la conexión de prueba. No se registró una medición global fiable del tiempo de preparativos y comprobaciones, por lo que no se acredita el límite de cinco minutos.

**Pendiente registrado en la primera implementación:** las reglas, la E34 posterior a 30 días y las pruebas reales indicadas aquí se ampliaron posteriormente; ver el avance siguiente. Las pruebas de ejemplos usan datos simulados y no certifican elegibilidad fiscal ni la integridad de todos los campos DGII. No se modificaron fuentes productivas ni se enviaron comprobantes.

**Ampliación de reglas y pruebas reales:** se centralizaron tipo de ingresos, modalidad y vencimiento de pago, identificación del comprador en E32 desde DOP 250,000, restricciones de retenciones y referencias, y coherencia del modo de ITBIS. Para E34 mayor a 30 días se conserva el ITBIS documentado y se distingue el importe que no puede rebajarse ni devolverse; el bruto de cada nota se limita al documento original en su misma moneda. La suma de notas y reservas corresponde a la etapa 9. La previsualización fue comprobada por HTTP en Next real con ambas identidades ficticias autorizadas, sin sesión, con dueño y cajero y con sesiones y referencias cruzadas. Se comprobó además en navegador e IndexedDB reales la desconexión, recarga, respuesta perdida después del commit, reintento sin venta ni descuento de inventario duplicados y conservación de un pendiente con tres decimales. El navegador bloqueó destinos externos; el servidor usó la base local ficticia y su defensa de red. Pasaron 43 pruebas enfocadas iniciales y 20 pruebas fiscales tras el ajuste del límite de referencia; ESLint aprobó los módulos seleccionados. La ejecución inicial de TypeScript en paralelo agotó memoria; su repetición sin servidor terminó sin diagnósticos, también después del ajuste. El bloque cronometrado de comprobaciones, incluidos los arranques, terminó en aproximadamente 4 minutos y 53 segundos. Las pruebas no certifican elegibilidad, emisión ni todos los campos condicionales del formato DGII. Continúan pendientes la presentación visual y los campos específicos de exportaciones, compras, gastos y pagos al exterior que se implementarán en sus etapas.

**Ajuste posterior sin verificar:** la versión local `_8` exige vincular las líneas monetarias de E34 a líneas de la copia original y conserva su tratamiento tributario, precio y límite proporcional; se añadieron casos y se adaptó el fixture HTTP. No se ejecutaron estas pruebas ni comprobaciones estáticas tras el cambio, porque se agotó el presupuesto de cinco minutos de la etapa. El control acumulado de notas permanece pendiente de la etapa 9.

**Saldo de E34 sin verificar:** la versión `_9` advierte que no se ha conciliado el saldo ni las notas anteriores. El código 1 exige que la nota coincida con el saldo pendiente, según la [DGII](https://ayuda.dgii.gov.do/conversations/facturacin-electrnica/ca4275-cmo-puedo-corregir-o-anular-un-comprobante-electrnico-ecf/5f3c17c98cd858ce87aabafb); esa condición todavía no se valida. Se añadieron casos para las advertencias, sin ejecutarlos por el límite de comprobaciones ya agotado.

**Comprador de E32 referenciada, sin verificar:** la versión `_10` comprueba para E33/E34 el umbral de DOP 250,000 en el total conservado de la factura E32 original, y exige el comprador de esa copia cuando corresponde. Se añadieron casos para moneda extranjera y el límite, sin ejecutarlos por el presupuesto de comprobación agotado. Fuente: campos del comprador en el [formato e-CF DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf).

**Retención en líneas exentas, sin verificar:** la versión `_11` amplía a E31, E33 y E34 la conservación del ITBIS retenido cero que ya existía en E41, cuando se declara agente retenedor; E47 no admite ese campo. Se añadieron casos sin ejecutarlos por el límite agotado. Fuente: nota 53 del [formato e-CF DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf).

**Entrega gratuita, sin verificar:** la versión `_12` advierte que el tipo de pago gratuito no concede crédito fiscal y que el neto matemático mostrado no constituye un cobro. Se añadió un caso, sin ejecución por el límite agotado. Fuente: campo `TipoPago` del [formato e-CF DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf).

**Identificación en E31/E45, sin verificar:** la versión `_13` requiere que el comprador suministre RNC o cédula dominicana para estos tipos, para los que el campo de identificador extranjero no está previsto. Se ajustaron los casos, sin ejecutarlos por el límite agotado. Fuente: campos `RNCComprador` e `IdentificadorExtranjero` del [formato e-CF DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf).

**Casos HTTP preparados, sin ejecución:** se amplió el recorrido aislado para el día 30 y posterior, devolución parcial, advertencia de saldo y rechazo de E34 con línea original ausente o clasificación alterada. La evidencia HTTP anterior corresponde a `_2`; estos casos no se ejecutaron por el límite agotado.

**Ejemplo documental actualizado, sin ejecución:** el ejemplo local E34 ahora conserva el índice de línea original que requiere la previsualización. El ejemplo prueba solo el cálculo puro; la existencia y pertenencia de la referencia requieren el servicio y los casos HTTP preparados.

**Comprobación posterior solicitada por el usuario:** se ejecutaron las reglas actuales `_13`: 26 pruebas enfocadas de cálculo y contrato y 10 regresiones de guardado de ventas aprobaron. En Next real, el recorrido HTTP aislado aprobó con dos identidades ficticias autorizadas, permisos y sesiones cruzadas; E34 cubrió los días 30 y 31, devolución parcial, línea sin vínculo y tratamiento alterado. También pasó el recorrido real de IndexedDB y cola offline con recarga, respuesta perdida, reintento e inventario. TypeScript, ESLint de los tres módulos de reglas y sintaxis JSON de OpenAPI aprobaron. Esta nueva comprobación tomó aproximadamente 2 minutos y 10 segundos, incluidos preparación y arranque, y usó únicamente una base local aislada. La conciliación de saldo y notas acumuladas sigue pendiente de la etapa 9; las pruebas no acreditan elegibilidad ante la DGII ni cubren todos los campos futuros. Las entradas anteriores describen el estado anterior a esta ejecución.

**Ampliación posterior sin verificar:** la versión local de reglas `DO_ECF_2026_11_09_3` exige que el emisor del perfil sea dominicano y valida los países contra el catálogo existente. El resultado separa los totales de retención ISR e ITBIS, conservando los ceros. Se añadieron casos de prueba, pero no se ejecutaron: el presupuesto de comprobación de esta etapa ya estaba agotado. La evidencia anterior corresponde a la versión `_2`, no acredita esta ampliación.

**Condiciones posteriores sin verificar:** la versión `_4` incorpora la declaración administrativa de proveedor no registrado y el 100 % de retención del ITBIS gravado en E41, de acuerdo con el artículo 7 de la [Norma DGII 05-19](https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf). La declaración no equivale a una consulta oficial. Según el artículo 10 de esa norma, E46 exige bienes y rechaza servicios exportados, que deben documentarse con factura de consumo. E47 distingue residencia fiscal del país de identificación; se ajustaron también las condiciones del vencimiento de pago para E43/E47. La previsualización advierte qué comprobantes todavía requieren revisar elegibilidad o soportes. Se actualizaron los casos enfocados, los ejemplos de API y el componente de detalle, pero no se ejecutaron ni revisaron visualmente porque se agotó el límite de comprobación de la etapa. Las pruebas de la versión `_2` no acreditan `_3` ni `_4`.

**Corrección de texto sin verificar:** la versión `_5` conservaba importes de línea en la nota con código 2; una revisión posterior del campo `MontoItem` y su nota 74 en el formato oficial DGII mostró que deben ser cero. La versión `_6` rechaza importes de línea distintos de cero y mantiene en cero el crédito y el neto; la copia original conserva sus importes. Se ajustó el caso enfocado para notas dentro y fuera del plazo, pero no se ejecutó al haberse agotado el límite de comprobación de la etapa. Fuentes: [formato e-CF DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf) y [preguntas frecuentes oficiales](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/Otros/Documents/Preguntas-frecuentes-Nuevos-Contribuyentes.pdf). Las pruebas anteriores no acreditan `_6`.

**Estructura de identificación sin verificar:** la versión `_7` exige que el RNC o cédula dominicana en la copia tenga 9 u 11 dígitos sin separadores, limita la identificación extranjera a 20 caracteres y conserva su texto; el nombre admite hasta 150 caracteres. La comprobación de longitud no acredita dígito de control, registro o autorización. Se actualizó el caso enfocado, pero no se ejecutó al haberse agotado el límite de comprobación. Fuente: campos `RNCEmisor`, `RNCComprador` e `IdentificadorExtranjero` del [formato e-CF DGII](https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf). La evidencia anterior no acredita `_7`.

### Etapa 5 — avance del 9 de noviembre de 2026

**Ampliación de relevo implementada el 10 de noviembre de 2026:** se añadieron la preparación explícita de rangos, el cambio transaccional al agotarse el rango activo, los eventos de historial, la gestión web y el campo opcional en la API móvil. Los rangos inactivos anteriores no se preparan automáticamente. La migración `20261110130000_fiscal_sequence_rollover` se aplicó y registró en la base local de la aplicación; no se aplicó a producción. La numeración y la reserva siguen siendo de prueba.

**Comprobaciones de la ampliación:** dentro del límite de cinco minutos, la prueba PostgreSQL aislada verificó último número, cambio ordenado, candidatos vencidos y desactivados, dos reservas concurrentes, rollback, reintento, historial, ausencia de relevo, aislamiento y handlers móviles con autenticación simulada, incluido un PATCH del contrato anterior. También pasó la prueba aislada de preparación de la etapa 6; pasaron 9 pruebas de Ajustes y 10 de ventas ordinarias con dependencias simuladas, validación de Prisma, TypeScript y ESLint de los archivos modificados. El formulario se renderizó con estado simulado. No se verificó en navegador con sesión real ni con autenticación móvil real. Los errores de protección esperados de PostgreSQL generaron mensajes del registrador en la base mínima aislada, aunque las aserciones pasaron.

**Estado: completada por indicación del usuario el 10 de noviembre de 2026.** Se implementaron rangos de prueba, disponibilidad, mantenimiento en Ajustes, historial, contratos móviles y reserva interna transaccional para la etapa 6. La migración es aditiva y se aplicó a la base local de la aplicación según se registra más abajo. La configuración puede activarse en `TEST`; la emisión sigue sin estar disponible. El soporte de autorización se guarda como referencia escrita. El contrato y los límites están en [la guía móvil](docs/api-estructura-fiscal.md) y OpenAPI.

**Comprobaciones:** el bloque completo transcurrió en aproximadamente 4 minutos y 53 segundos, incluida la interrupción durante el turno y todos los preparativos. La migración se aplicó a bases nuevas y ficticias en PostgreSQL local. Se comprobó con dos cajeros la reserva concurrente de números distintos, recuperación por documento, rollback previo al commit, agotamiento, vencimiento, superposición, versiones, aislamiento y protección del historial. Las peticiones a los handlers móviles usaron autenticación simulada y la base real aislada; pasaron los casos de sesión ausente, permiso, lectura ajena, creación y rechazo de campos prohibidos. Pasaron 22 pruebas de previsualización, renderizado de la página de Ajustes con componentes simulados y ventas ordinarias. Prisma validó el esquema, OpenAPI se analizó como JSON y ESLint pasó en los módulos seleccionados; TypeScript terminó sin diagnósticos, aunque la última modificación menor del componente de Ajustes ocurrió durante su ejecución y fue comprobada por ESLint posteriormente. Los errores de PostgreSQL esperados durante las pruebas de protección activaron el registrador de errores de la aplicación, que no encontró su tabla en la base mínima aislada; las aserciones de protección pasaron.

**Limitaciones:** no se comprobó la pantalla real en navegador ni el flujo web completo con sesión; la autenticación móvil fue simulada y no se realizaron peticiones HTTP con credenciales reales. No se comprobó integralmente el contrato OpenAPI ni la integración futura de reserva y confirmación de documentos. La etapa 2 sigue en curso. Las bases aisladas creadas para las pruebas se conservaron; la base fiscal preexistente y su historial de migraciones no se modificaron.

**Ajuste posterior de interfaz, sin verificar:** a solicitud del usuario, la sección de secuencias se oculta mientras el módulo fiscal esté apagado y se reorganizaron el formulario, los rangos y el historial. Se añadieron casos de renderizado para el estado activo y el apagado, sin ejecutarlos porque se agotó el presupuesto de comprobación de la etapa. La activación sigue bloqueada; guardar el perfil no activa el módulo ni muestra la sección. La evidencia anterior no acredita este ajuste ni su presentación visual.

**Migración de la base local de la aplicación, 10 de noviembre de 2026:** por solicitud expresa del usuario, se verificó el destino local `tejada_pos` en `localhost:5433` y se aplicaron en orden las dos únicas migraciones pendientes: núcleo documental `20261109170000` y secuencias `20261109180000`. Prisma registró ambas en su historial. Una consulta de solo lectura confirmó las cuatro tablas necesarias y que la tabla de secuencias responde; también pasaron las diez pruebas simuladas de guardado de ventas ordinarias. La aplicación real no se revisó por navegador ni se crearon secuencias durante la comprobación. La base de producción remota no se modificó. Las entradas anteriores sobre migraciones no aplicadas describen el estado previo a esta intervención.

## 14. Registro final de etapas completadas

| Etapa | Nombre | Fecha | Estado | Evidencia de Aceptación |
|---|---|---|---|---|
| **0** | Línea base y alcance de compatibilidad | 9 de noviembre de 2026 | **Aceptada** | Fixtures de 3 empresas (`setup-fiscal-baseline-db.mjs`), 11 pruebas de aceptación comercial ordinaria (`fiscal-baseline-scenarios.test.mjs`), `fiscal-test:baseline` (11/11 aprobadas), `fiscal-test:integration` (76/76 aprobadas en 3 bases aisladas) y documentación completa en [docs/linea-base-fiscal.md](docs/linea-base-fiscal.md). Cero tablas o campos fiscales en el esquema ordinario. |
| **1** | Aislamiento fiscal por empresa y país | 9 de noviembre de 2026 | **Completada** | `fiscal-test:next-policies` aprobado con dos políticas y venta ordinaria; `fiscal-test:regression` 59/59 y `fiscal-test:settings` 7/7, en menos de cinco minutos en conjunto. |
| **3** | Clientes, proveedores y productos | 9 de noviembre de 2026 | **Completada por indicación del usuario** | Datos maestros y conceptos implementados; prueba transaccional local revertida, contratos con dependencias simuladas, regresiones ordinarias y OpenAPI verificado. Siguen pendientes la revisión visual, las peticiones con credenciales reales y la matriz HTTP completa; la etapa 2 permanece en curso. |
| **4** | Núcleo documental y cálculo fiscal | 9 de noviembre de 2026 | **Completada por indicación del usuario** | 26 pruebas fiscales y 10 regresiones de ventas aprobadas; recorrido HTTP y cola offline reales en entorno aislado; TypeScript, ESLint seleccionado y sintaxis JSON de OpenAPI aprobados. La conciliación acumulada de notas corresponde a la etapa 9; siguen pendientes la revisión visual y campos específicos de etapas posteriores. |
| **5** | Secuencias autorizadas | 10 de noviembre de 2026 | **Completada por indicación del usuario** | Migraciones aplicadas a la base local de la aplicación; reservas probadas en PostgreSQL aislado y contratos móviles con autenticación simulada. Se conservan las limitaciones sobre revisión visual web y autenticación HTTP móvil real; véase el avance de la etapa 5. |
| **6** | Registro transaccional y bandeja fiscal | 10 de noviembre de 2026 | **Completada por indicación del usuario** | Preparación y recuperación comprobadas en PostgreSQL aislado y mediante HTTP móvil con credenciales reales; venta ordinaria con módulo apagado verificada. Permanecen pendientes la revisión visual y la recuperación real en navegador; véanse las demás limitaciones registradas. |
| **7** | Facturación E31 y E32 | 10 de noviembre de 2026 | **Completada por indicación del usuario** | Integración fiscal, venta ordinaria con módulo apagado, API móvil y cola offline comprobadas; se conservan las limitaciones registradas en el avance. |
| **8** | Ventas E44, E45 y E46 | 10 de noviembre de 2026 | **Completada por indicación del usuario** | Integración, reglas y pruebas enfocadas de los tres tipos, ventas existentes y aislamiento; se conservan las limitaciones registradas en el avance. |
| **9** | Notas de crédito E34 y devoluciones | 10 de noviembre de 2026 | **Completada por indicación del usuario** | Disponibilidad, reservas y redondeo de devoluciones sucesivas comprobados en pruebas enfocadas y PostgreSQL aislado; regresión ordinaria 62/62 con dependencias simuladas. Permanecen las limitaciones de confirmación, efectos e interfaces registradas abajo. |
| **10** | Notas de débito E33 | 10 de noviembre de 2026 | **Completada por indicación del usuario** | E33 al contado, deuda, reintentos y previsualización móvil con autenticación simulada comprobados en PostgreSQL aislado; se conservan las limitaciones y cambios posteriores sin verificar registrados abajo. |
| **12** | Gastos menores E43 y reembolsos | 11 de noviembre de 2026 | **Completada con límites** | Pruebas enfocadas de gastos, reembolsos, preparación y migración en PostgreSQL aislado; funcionamiento ordinario con perfil apagado. Véase el registro final para los cambios y recorridos no verificados. |
| **13** | Pagos al exterior E47 | 11 de noviembre de 2026 | **Completada con límites** | Pruebas enfocadas de deuda, abonos, retenciones, preparación y migración en PostgreSQL aislado; funcionamiento ordinario con perfil apagado. Véase el registro final para los cambios y recorridos no verificados. |


### Etapa 6 — avance del 10 de noviembre de 2026

**Estado: completada por indicación del usuario el 10 de noviembre de 2026.** Se incorporaron borradores revisionados, trabajos y comandos idempotentes, reserva transaccional de números de prueba, bandeja, detalle, recuperación y rutas internas móviles. La preparación exige perfil activo y validado, versión vigente y concordancia del total en DOP con el origen. Las operaciones comerciales con documento preparado quedan protegidas, incluso al apagar el módulo. La validación actual no compara todos los conceptos y datos del origen ni acredita elegibilidad fiscal; las reglas específicas permanecen en las etapas posteriores. No se envía información externa.

**Comprobaciones enfocadas:** el bloque cronometrado, con preparativos, bases aisladas y repeticiones necesarias, tomó aproximadamente 4 minutos y 23 segundos. La prueba de PostgreSQL aislado aprobó concurrencia, recuperación, reserva fallida sin consumo, revisión, inmutabilidad, permisos, aislamiento y consulta con módulo apagado. Los handlers móviles de listado, detalle, confirmación y recuperación se probaron con actor simulado y sin cookies; no se probaron credenciales reales. Pasaron 15 pruebas de previsualización y guardado ordinario de ventas con dependencias simuladas, Prisma validó el esquema y TypeScript terminó sin errores. ESLint terminó sin errores y con una advertencia de dependencias de un efecto en la interfaz. La primera ejecución falló por la importación del test y otra por una migración de relevo omitida; ambas se corrigieron y la última ejecución aprobó. La última ampliación del detalle para mostrar revisiones no se volvió a comprobar para respetar el límite.

**Pendiente:** revisión visual, cierre y recuperación real en navegador y verificación de todos los campos condicionales de la interfaz. Las peticiones móviles con credenciales reales y la venta ordinaria con módulo apagado se verificaron posteriormente como se indica a continuación. No se aplicaron migraciones a producción ni a la base fiscal existente.


**Comprobación posterior solicitada: móvil y venta con fiscal apagado, 10 de noviembre de 2026.** `node scripts/fiscal-next-policies-isolated.mjs --stage6` creó una base PostgreSQL local aislada con datos ficticios y aplicó las migraciones fiscales reales; el servidor Next usó el guardia de red Node y las dos identidades ficticias de Clerk previamente autorizadas. Sin cookies, las cabeceras móviles reales permitieron crear y revisar un borrador, confirmar con número TEST, reintentar sin duplicar, recuperar el resultado y consultar bandeja, detalle e historial. También se comprobaron la sesión ausente, el cajero sin permiso, la separación entre empresas, el conflicto de identificador y la consulta del historial tras apagar el perfil de prueba. La preparación no creó otra venta ni modificó las existencias del producto verificado.

En la empresa con el módulo apagado se creó una venta al contado, se reintentó con el mismo identificador y se consultó el detalle por HTTP móvil. Se verificaron total, base, ITBIS, medio de pago y cuenta de caja, una sola venta, descuento de inventario y ausencia de documento fiscal; luego se anuló y el inventario volvió al valor inicial. La prueba no revisó visualmente la impresión ni midió un saldo de caja independiente. No se enviaron comprobantes ni se utilizó numeración productiva. El servidor y los datos comerciales eran locales; la autenticación consultó únicamente las identidades Clerk autorizadas.

El bloque de esta comprobación, incluidos preparativos y dos ejecuciones, duró aproximadamente 2 minutos y 36 segundos. Sumado al bloque anterior de 4 minutos y 23 segundos, el tiempo acumulado registrado para la etapa es aproximadamente 6 minutos y 59 segundos; por tanto, **se superó el máximo acumulado de cinco minutos**. No se realizaron más comprobaciones para esta etapa. Las bases aisladas creadas permanecen disponibles; no se modificó la base fiscal preexistente ni se aplicaron migraciones a producción.

### Etapas 7 y 8 — avance parcial del 10 de noviembre de 2026

**Etapa 7, en curso:** se añadió la búsqueda de compradores por RNC/cédula para cuentas con perfil activo y permisos de ventas y preparación, con consulta móvil autenticada, respuesta privada y aislamiento por empresa. El cliente genérico propone E32 y las demás fichas pueden proponer una preferencia fiscal reconocida mediante un componente compartido. La ruta aún no está conectada al POS. Los nuevos borradores de ventas guardan una huella de los datos comerciales revisados y rechazan la preparación si cambian; los borradores anteriores deben actualizarse para incorporar esa huella. Esta protección no compara todavía cada línea de la copia con la venta original y no sustituye la integración fiscal transaccional pendiente.

**Etapa 8, en curso:** se añadió una función de cálculo previo que conserva la base comercial y muestra el ITBIS retirado, descuentos, envío y propina para operaciones exentas. Aún no está conectada al POS ni al guardado. Faltan las reglas particulares de E44/E45/E46, los campos, la confirmación, la impresión y su API móvil.

**Comprobaciones y límites:** etapa 7: seis pruebas enfocadas, incluida búsqueda en PostgreSQL local mediante transacción revertida y handler con autenticación simulada; prueba de preparación en base local aislada con cambio de venta y revisión; diez regresiones ordinarias con dependencias simuladas; TypeScript, ESLint de los módulos nuevos y cambiados y sintaxis JSON de OpenAPI. La primera ejecución de la prueba nueva falló por la forma de importación y fue corregida; las ejecuciones posteriores aprobaron. Sumando los comandos de comprobación y preparativos registrados, el tiempo fue inferior a tres minutos. Etapa 8: tres pruebas del cálculo previo, diez regresiones ordinarias simuladas y ESLint del módulo; se repitieron las pruebas y ESLint después de reforzar las validaciones. El total de los comandos fue aproximadamente 23 segundos.

**No verificado y pendiente:** venta fiscal desde web o móvil, selección de cliente en POS, confirmación atómica de venta y fiscal, conciliación por línea, impresión fiscal, cola offline fiscal, recorridos HTTP con credenciales reales y revisión visual. Las regresiones simuladas no prueban un flujo de usuario real ni acreditan que las etapas estén completas. No se habilitaron controles nuevos en el POS, no se aplicaron migraciones y no se enviaron documentos fiscales.

### Etapas 7 y 8 — integración posterior, 10 de noviembre de 2026

**Estado: etapas 7 y 8 completadas por indicación del usuario el 10 de noviembre de 2026.** Se mantienen las limitaciones de verificación indicadas más abajo.

La entrada anterior describe el avance inicial y queda sustituida por este registro. El POS y la API admiten E31, E32, E44, E45 y E46 bajo perfil fiscal activo y validado, con previsualización calculada en el servidor, selección explícita de venta ordinaria, comprador, reglas por tipo y preparación TEST atómica con los efectos comerciales. Se añadió la revisión de ventas existentes, conservación offline con reintento, impresión de la copia y protección de documentos preparados, incluso con el perfil apagado. La guía móvil y OpenAPI describen los contratos. No se realizaron envíos ni se aplicaron migraciones a producción.

**Comprobaciones y tiempo:** etapa 7, aproximadamente 4 minutos y 54 segundos acumulados; etapa 8, aproximadamente entre 4 minutos y 4 minutos y 30 segundos acumulados, incluidos preparativos y reintentos. El recorrido HTTP en Next y PostgreSQL aislados usó credenciales móviles reales de dos identidades ficticias: cubrió los cinco tipos, política, aislamiento, transacción, reintentos, crédito y cobro, historial y búsquedas; el recorrido de IndexedDB verificó persistencia offline, recarga, respuesta perdida, reintento y pendiente incompatible conservado. El POS se comprobó en navegador con servidor simulado para la ausencia de controles y consultas fiscales con módulo apagado y la selección por RNC con módulo activo. Pasaron las pruebas focalizadas de cálculo, comprador, guardado ordinario, protección e impresión, y TypeScript completo antes de la última ampliación de ventas existentes.

En la etapa 8, una ejecución detectó un error de sintaxis en la nueva ruta de preparación; se corrigió. El reintento completo con HTTP real aprobó la revisión y preparación de E44/E45/E46 sobre ventas existentes, datos incompletos, moneda y servicio incompatibles, cambio de ficha, reintento sin duplicados y venta ordinaria de otra empresa con perfil apagado. TypeScript focalizado en los archivos de esa ampliación y el análisis JSON de OpenAPI aprobaron después de la corrección.

Un borrador previo E44/E45/E46 que impida revisar una venta puede descartarse con motivo desde la bandeja conservando sus revisiones; la operación exige perfil activo y no permite descartar una copia preparada. Se verificaron directamente en PostgreSQL aislado su idempotencia, historial y protección de documentos preparados. TypeScript focalizado de las pantallas y rutas nuevas aprobó tras corregir el manejo de capacidades ausentes. Estos últimos comandos agregaron aproximadamente ocho segundos al tiempo de la etapa 8.

**Límites:** no se repitió la comprobación integral de la etapa 7 después de la última ampliación de la huella de revisión, para respetar su presupuesto; la misma huella se ejercitó posteriormente con E44. La selección automática por RNC posterior al recorrido HTTP integral se comprobó con pruebas focalizadas y navegador con servicios simulados, no nuevamente mediante HTTP real. La revisión de presentación se limitó al navegador de pruebas y la impresión fiscal se verificó con dependencias simuladas. No se verificó por separado en navegador una configuración fiscal guardada pero desactivada. El descarte se comprobó directamente contra el servicio y PostgreSQL, sin probar su nueva ruta HTTP ni su interfaz en navegador. Las bases y datos de estas pruebas fueron locales y aislados.

### Etapas 9 y 10 — avance parcial del 10 de noviembre de 2026

**Registro histórico: etapa 9 en curso y etapa 10 pendiente en este momento.** Se agregó una migración aditiva para ajustes, líneas, eventos y operaciones idempotentes; un cálculo de disponibilidad acumulada que distingue importes y cantidades físicas; servicios y rutas móviles de borrador E34, previsualización, edición, reserva, consulta y descarte. Las rutas toman los datos de la copia original, bloquean la factura durante la conciliación, exigen perfil TEST para crear o reservar y conservan el descarte cuando se apaga el perfil. Las facturas con devoluciones o notas antiguas sin conciliar se bloquean explícitamente. Las rutas, contratos y su carácter parcial están descritos en la guía y OpenAPI fiscales.

La preparación genérica de E33/E34 se bloqueó para impedir asignar un número sin los efectos comerciales correspondientes. Se corrigió la serialización de reintentos para que el primer resultado y el recuperado tengan el mismo contenido JSON; se dejó el comentario preventivo. No se añadió una ruta de confirmación que aparente aplicar efectos aún no implementados.

**Comprobaciones de etapa 9:** cinco pruebas del cálculo de disponibilidad y 11 regresiones de guardado ordinario con dependencias simuladas aprobaron. En PostgreSQL local aislado se aplicó la migración y se comprobó la previsualización, reserva concurrente, aislamiento, reintento, descarte con perfil apagado y ausencia de nuevas asignaciones de números; el handler móvil se comprobó con autenticación simulada, sin cookies. ESLint de los módulos y rutas modificados aprobó. Una prueba inicial falló por importación de módulos y otra por diferencia de serialización; se corrigieron. Una prueba de aislamiento falló inicialmente porque el segundo perfil estaba apagado; se activó en el fixture y la repetición aprobó. TypeScript completo informó un literal BigInt en la prueba nueva, corregido después, y un error en `scripts/fiscal-stage8-discard-check.mts`, archivo no modificado. No se repitió TypeScript completo tras la corrección. Los preparativos y comprobaciones registrados terminaron dentro del límite de cinco minutos.

**Pendiente en ese momento:** confirmación E34 con devolución física, reembolso o saldo a favor, aplicaciones y correcciones de cuentas por cobrar, interfaz web, disponibilidad en búsqueda de devoluciones, offline y recorridos HTTP con credenciales reales. Entonces faltaban implementar E33 comercial y financiera y comprobar la etapa 10. No se aplicaron migraciones a producción ni se enviaron documentos o consumieron números productivos.

### Etapas 9 y 10 — integración adicional del 10 de noviembre de 2026

**Registro histórico: ambas etapas continuaban en curso en este momento.** Se añadieron confirmaciones transaccionales E34/E33, aplicaciones de deuda, reembolsos y saldos a favor; cuentas por cobrar con origen en venta o débito; formularios, rutas móviles, cola para devoluciones físicas y adaptaciones de cobros, anulaciones, recibos y varios informes. Se añadieron migraciones locales para las relaciones y restricciones; no se aplicaron a producción. Las notas financieras exigen conexión y los números asignados son exclusivamente TEST.

**Comprobaciones:** se conservan los resultados y el límite de la etapa 9 de la entrada anterior; su nueva confirmación y sus efectos no se volvieron a probar. Para la etapa 10 se generó un cliente Prisma aislado sin detener el servidor existente. Se aplicaron las migraciones fiscales en bases PostgreSQL locales nuevas y se verificaron una E33 al contado sobre factura pagada, deuda independiente, cobro único, reintento idéntico y conflicto al cambiar sus datos, sin modificación del stock. La ruta móvil de previsualización se ejercitó con autenticación simulada: 401 sin usuario, 403 sin permisos, 404 para otra empresa y 200 autorizado. Pasaron 11 regresiones de guardado ordinario con dependencias simuladas. La revisión TypeScript con cliente aislado solo informó el error preexistente de tipo desconocido en `scripts/fiscal-stage8-discard-check.mts`. Los preparativos, intentos y comprobaciones de esta etapa duraron menos de cinco minutos; se corrigieron un índice requerido por Prisma y dos problemas del lanzador de prueba antes de obtener el resultado indicado.

**Sin verificar:** confirmación y reversión E34, aplicaciones de deuda, reembolso, saldo a favor, días 30/31, concurrencia final y cola offline; E33 a crédito y cobro posterior, impuestos alternativos y anulación de cobro con ajustes previos; recorridos móviles con credenciales reales, impresión, presentación y todos los informes afectados. Se añadieron después de esas pruebas la captura de fecha E33 y la recuperación de confirmaciones por identificador de operación; ambas siguen sin verificar. Los detalles completos de OpenAPI requieren revisión. Estas limitaciones se conservan pese al cierre indicado por el usuario; no se recomienda utilizar la integración para operaciones reales.

**Integración posterior:** se corrigió la aceptación de identidades proporcionadas como argumentos en acciones de cuentas por cobrar y devoluciones; las rutas móviles colocan ahora el usuario autenticado en el contexto del servidor. Se añadieron detalle y resultado financiero autorizado a la API de devoluciones, y se ampliaron los esquemas de OpenAPI. La edición de una E34 validada sustituye su reserva en la misma transacción; una ruta de previsualización excluye solo la reserva propia y la pantalla permite editarla y muestra copia y notas previas. Estos cambios se realizaron después de las comprobaciones y no se volvieron a ejecutar pruebas para respetar los límites acumulados. Permanecen sin verificar tanto estas modificaciones como los escenarios enumerados arriba.

La impresión compartida se amplió para aceptar el origen en notas, mostrar la referencia original y separar ITBIS no acreditable e importe aplicable; incluye el aviso de documento de prueba. La pantalla de detalle ofrece el enlace de impresión. Esta ampliación tampoco ha sido verificada.

Una migración posterior añade comprobaciones de empresa a las relaciones financieras y obliga a que las aplicaciones de saldo correspondan al mismo cliente. El cálculo de devoluciones físicas también descuenta automáticamente las reducciones previas, respetando el redondeo por línea, y muestra el descuento en la previsualización. La migración y el cálculo se añadieron después del presupuesto de comprobaciones: permanecen sin ejecutar ni verificar, y las comprobaciones anteriores no los cubren.

También se reforzó la validación de centavos y origen vigente en los cobros individuales y por lote. El reporte de utilidad cobrada incluye los cobros E33 y los reembolsos E34 por separado, sin tratar la devolución física como salida de dinero; el costo de devoluciones fiscales de crédito se prorratea según los cobros anteriores. Estas adaptaciones se añadieron después de las pruebas y permanecen sin verificar.

La migración local también protege las devoluciones físicas y sus artículos asociados a notas preparadas. La reversión conserva su motivo y solo permite modificar los campos necesarios para marcarla cancelada. Esta protección y el detalle móvil de su motivo permanecen sin verificar.

La factura fiscal imprimible ofrece accesos a notas de crédito y débito para los permisos correspondientes y el perfil TEST activo; OpenAPI incorpora las rutas de búsqueda, detalle y confirmación de devoluciones. La ruta de devoluciones acepta únicamente confirmaciones con reposición física. Estos cambios tampoco se han verificado.

La pantalla de saldos a favor filtra las deudas por cliente y pagina saldos y cuentas para no ocultar opciones fuera de las primeras cien. Se añadió la recuperación de resultados de cuentas por cobrar por identificador de operación, limitada al autor y la empresa. Estas ampliaciones se hicieron después de las pruebas y permanecen sin verificar.

Los recibos físico-carta y térmico de una devolución E34 muestran cantidades y estado físico sin presentar su importe como un reembolso; enlazan a la nota fiscal cuando el usuario está autorizado. El listado de devoluciones también enlaza al documento por el ajuste, ya que la nota no usa `returnId` como origen. Estas modificaciones no se han verificado.

Las confirmaciones y aplicaciones nuevas exigen identificadores compatibles con su recuperación, y la caja rechaza reutilizar uno con una versión de política diferente. Este ajuste posterior sigue sin verificar dentro del presupuesto de pruebas.

Los listados móviles de E33/E34 y la pantalla de notas de débito permiten consultar páginas posteriores a las primeras cien. Esta paginación, añadida después de las comprobaciones, permanece sin verificar.

Los enlaces a copias de notas desde las pantallas de crédito y débito usan la impresión fiscal, para que un preparador autorizado pueda consultar sus propias notas sin permiso de lectura de toda la bandeja. Este cambio no se ha verificado.

En la pantalla E33 se impide confirmar mientras hay una edición sin guardar. Los comandos pendientes de creación y edición usan claves separadas, se recuperan tras recargar y conservan el identificador ante respuestas perdidas; las validaciones de revisiones anteriores no se reutilizan. Esta corrección se añadió después de las comprobaciones y está sin verificar.

La confirmación E33 normaliza los campos del cobro antes de calcular la identidad de la operación, para que el orden de propiedades JSON no convierta el mismo reintento en un conflicto. Este ajuste también permanece sin verificar.

Para evitar que una edición reinicie un saldo ajustado, las ventas ordinarias con saldo a favor fiscal aplicado no pueden editarse ni anularse sin conciliación. Las acciones de edición y anulación toman el usuario del contexto autenticado. La conciliación o reversión de una aplicación no se ha implementado; esta protección y el comportamiento ordinario posterior al cambio no se han vuelto a verificar.

El reporte de cuentas por cobrar separa recibos de ajustes y expone las aplicaciones fiscales y devoluciones ordinarias sin duplicar la devolución física E34; el CSV conserva el desglose. Esta ampliación se realizó después de las comprobaciones y no se ha verificado.

La consulta móvil y la caché de cuentas por cobrar también incluyen un desglose de recibos y ajustes, conservando el saldo persistido. La interfaz muestra el total de ajustes cuando dispone de él; las cachés anteriores siguen siendo legibles. Estos cambios aún no se han verificado.

El cobro inmediato E33 conserva el nombre del banco y registra el evento comercial de pago; una devolución física E34 registra también su evento comercial de creación. Ambos eventos se incorporaron a la transacción existente y no se han vuelto a comprobar.

Cuando los turnos están activos, el servidor exige turno y dispositivo también para notas y aplicaciones sin movimiento de efectivo, igual que la interfaz; un reintento de una operación ya confirmada se recupera antes de esa comprobación. Esta protección se añadió después de las pruebas y está sin verificar.

**Limitación detectada por lectura y corrección posterior:** el cálculo anterior redondeaba cada devolución física por separado y podía acumular diferencias de milésimas. La implementación ahora reparte el resto acumulado y guarda la reposición exacta por artículo para revertirla, con compatibilidad para registros anteriores. El nuevo cálculo y las reversiones en distinto orden permanecen sin verificar; la columna necesaria está incluida en la migración local no aplicada.

La reversión física de una E34 añade ahora un evento fiscal inmutable con actor, motivo y devolución dentro de la misma transacción. Esta protección se añadió después de las comprobaciones y no se ha verificado.

La interfaz E34 ya no afirma que falta numeración cuando una respuesta perdida deja incierto el resultado de la confirmación; solicita consultar el estado de la operación. El cambio no se ha verificado.

**Corrección posterior del redondeo:** la última devolución física puede absorber el centavo acumulado dentro del saldo disponible. Una prueba en PostgreSQL aislado comprobó dos reservas sucesivas de RD$0.04 y la previsualización de la cancelación restante por RD$0.05, además del descuento adicional; seis pruebas de capacidad y ESLint de los módulos modificados aprobaron. La prueba usa una línea exenta y no verifica la confirmación final ni todos los tratamientos de impuestos. La batería ordinaria `fiscal-test:regression` pasó 62/62 con dependencias simuladas tras actualizar tres pruebas.

**Cierre de etapas 9 y 10, 10 de noviembre de 2026:** completadas por indicación expresa del usuario. Se mantienen las limitaciones y comprobaciones pendientes descritas en este registro; el cierre no convierte en verificadas las funciones señaladas como pendientes ni habilita emisión externa.

### Etapas 12 y 13 — 11 de noviembre de 2026

Se implementaron gastos fiscales de la empresa, adelantados por empleados y de caja chica, sus revisiones, liquidaciones y propuestas E43; los reembolsos liquidan el saldo sin duplicar el gasto y la reposición es una transferencia. Para pagos al exterior se incorporaron obligaciones de servicios, moneda y tasa declaradas, abonos con retención por concepto y propuestas E47 ligadas al pago. Ambas etapas incluyen controles de reintento, copia fiscal, permisos, aislamiento por empresa, interfaces web y rutas para móvil. La liquidación de pagos exteriores está limitada a DOP y la numeración preparada es exclusivamente TEST.

Las pruebas enfocadas de las dos etapas aprobaron en PostgreSQL local aislado con las migraciones reales; incluyeron gastos y reembolsos, obligaciones y abonos, reintentos, preparación e inmutabilidad, así como el funcionamiento ordinario con el perfil fiscal apagado. También aprobaron dos pruebas de renderizado simulado y la comprobación de tipos TypeScript. Las rutas móviles se probaron previamente mediante handlers con credenciales locales de prueba; esto no equivale a una revisión interactiva de navegador o aplicación móvil.

Después de esas pruebas se ajustaron las validaciones y el manejo de caja chica y transferencias con turnos controlados. No se pudo completar la repetición final de los handlers: PostgreSQL de pruebas estaba recuperando su directorio y no admitía conexiones dentro del tiempo disponible. Por tanto, esos últimos ajustes y su interacción con las rutas no quedan acreditados por las pruebas anteriores. Tampoco se revisaron visualmente las pantallas ni se aplicaron las migraciones nuevas a la base local de la aplicación o a producción. No se firmaron ni enviaron documentos externos.

**Comprobación posterior de caja chica y transferencias, 11 de noviembre de 2026:** una vez recuperado PostgreSQL, aprobó la prueba enfocada en una base local aislada. Se verificaron la reposición sin crear otro gasto, los movimientos de origen y destino, el gasto de caja chica contra su propia cuenta, el vínculo al turno, los reintentos sin duplicar y el rechazo de dispositivo o versión fiscal incorrectos. También se probó la transferencia por la cola de turnos con el perfil activo y apagado, y el gasto y pago ordinarios con el perfil apagado. Los handlers se invocaron directamente con credenciales ficticias firmadas; para la transferencia directa se simuló el contexto de dispositivo que proporciona Next y para la cola se simuló la invalidación de caché de Next. No hubo revisión visual ni ejecución en un navegador o aplicación móvil reales. La limitación anterior sobre estos ajustes queda sustituida por esta evidencia, conservando las demás limitaciones indicadas.

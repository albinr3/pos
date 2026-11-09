# MOVOPos: Registro y Evidencia de Aceptación de la Línea Base Fiscal (Etapa 0)

**Fecha:** 9 de noviembre de 2026  
**Estado:** Etapa 0 — Completada y Aceptada  
**Alcance:** Aislamiento multiempresa, ciclo de vida comercial ordinario, contratos de impresión, contratos HTTP móviles sin cookies, idempotencia y ausencia estricta de campos y tablas fiscales electrónicas.

---

## 1. Resumen Ejecutivo de la Etapa 0

El objetivo de la **Etapa 0** es establecer y comprobar de forma reproducible qué debe permanecer exactamente igual antes de incorporar cualquier estructura, modelo o regla del módulo fiscal dominicano (`DO_ECF`).

Se verificó que:
1. Las empresas ordinarias sin perfil fiscal operan con total normalidad y sin ninguna dependencia del módulo fiscal.
2. Empresas internacionales (sin ITBIS ni retenciones dominicanas) operan con precios netos e importes limpios sin interferencia.
3. El esquema de base de datos actual (`public`) carece de tablas, columnas o enums fiscales (`e-NCF`, `FiscalDocument`, `FiscalSequence`, etc.).
4. Todos los endpoints móviles y acciones de servidor preservan sus contratos ordinarios, paginación, códigos de error y respuestas libres de campos fiscales.

---

## 2. Perfiles de Prueba Aislados Creados

Se definieron e insertaron tres perfiles comerciales en una base de datos PostgreSQL 17.6 local aislada (`cash_test_fiscal_baseline_*`), garantizando la no utilización de datos productivos:

| Perfil | Identificador Cuenta | Configuración Comercial | Propósito en la Línea Base |
|---|---|---|---|
| **1. Empresa Ordinaria RD** | `baseline-account-rd` | ITBIS 18% incluido en precios, sin propina legal, formato ticket `80mm`. | Validar el flujo comercial estándar dominicano sin perfil fiscal activo. |
| **2. Empresa Internacional** | `baseline-account-intl` | ITBIS 0%, precios netos (no incluyen impuesto), formato ticket `80mm`. | Validar empresas fuera de República Dominicana que nunca utilizarán `DO_ECF`. |
| **3. Empresa Preparación DO** | `baseline-account-doprep` | ITBIS 18% incluido, **Propina Legal del 10%** habilitada, formato `CARTA`. | Validar preparación previa para restaurantes/servicios con propina legal dominicana. |

Cada cuenta cuenta con:
- Dos usuarios: `dueno` (rol `ADMIN`, propietario) y `cajero` (rol `CAJERO` con permisos estrictos de venta y caja, sin acceso a compras ni gastos).
- Cuentas de tesorería: Caja principal (`CAJA`) y cuenta bancaria (`BANCO`) con saldos de apertura.
- Catálogo de productos: Productos gravados (18%), exentos (0%) e internacionales, con secuencias de producto (`ProductSequence`).
- Clientes: Cliente genérico (`isGeneric: true`) y cliente con crédito autorizado (`creditEnabled: true`), con secuencias de cliente (`CustomerSequence`).
- Proveedor local con plazo de crédito.

---

## 3. Matriz de Evidencias y Pruebas Reproducibles

Las 11 pruebas de aceptación automatizadas en `scripts/fiscal-baseline-scenarios.test.mjs` demostraron:

### 3.1. Aislamiento Multiempresa y Ausencia de Tablas Fiscales
- **Aislamiento:** Las consultas realizadas desde el contexto de `baseline-account-rd` devuelven 0 registros pertenecientes a `baseline-account-intl` o `baseline-account-doprep`.
- **Ausencia fiscal:** La consulta sobre `pg_tables` en el esquema `public` confirma que no existe ninguna tabla que contenga el término `fiscal`.

### 3.2. Ciclo de Ventas al Contado y a Crédito
- **Venta al contado (Empresa RD):** Venta de 2 unidades a RD$ 100.00 c/u (total RD$ 200.00). Base imponible calculada exactamente en RD$ 169.49 y 18% ITBIS en RD$ 30.51. Descuenta 2 unidades de inventario, genera numeración interna secuencial `A-00001` y confirma la ausencia de atributos `eNcf` o `fiscalStatus`.
- **Venta a crédito:** Rechazo con mensaje descriptivo (*"Para crédito debes seleccionar un cliente"*) ante intentos de venta a crédito con cliente genérico. Éxito con cliente a crédito, creando registro en `AccountReceivable` con `balanceCents = totalCents = 10000` y estado `PENDIENTE`.

### 3.3. Modificadores Comerciales (Descuentos, Envío y Propina Legal)
- **Descuento global y Envío:** Venta de RD$ 100.00 con 10% de descuento manual (-RD$ 10.00) y costo de envío de RD$ 150.00. Total verificado en RD$ 240.00 (24,000 centavos) con desglose íntegro en `Sale`.
- **Propina Legal (10%):** En `baseline-account-doprep`, sobre base de RD$ 127.12 calcula exactamente RD$ 12.71 de propina legal, adicionándola al total sin alterar la base tributaria.
- **Venta Internacional:** 4 unidades a $25.00 = $100.00 exactos con ITBIS = 0.

### 3.4. Devoluciones Parciales y Anulación Total
- **Devolución parcial:** Generación de comprobante interno `DEV-00001`, reembolso del efectivo y reposición automática de la unidad al inventario.
- **Anulación total:** Marcado de `cancelledAt`, registro de `cancelledBy`, restitución total del stock y anulación de cualquier cuenta por cobrar vinculada.

### 3.5. Cuentas por Cobrar y Cobros (AR)
- **Abono parcial:** Registro de pago de RD$ 40.00 sobre deuda de RD$ 100.00 en tesorería `CAJA`. Saldo actualizado a RD$ 60.00 y estado pasa a `PARCIAL`.
- **Liquidación final:** Pago de RD$ 60.00 restantes actualiza saldo a RD$ 0.00 y estado pasa a `PAGADA`.
- **Protección contra sobrecobro:** Intentar cobrar sobre una factura ya liquidada se rechaza con error (*"Esta factura ya está pagada"*).

### 3.6. Compras y Cuentas por Pagar (AP)
- **Compra al contado:** Incrementa inmediatamente el stock del producto e imputa la salida a la cuenta de tesorería indicada.
- **Compra a crédito:** Incrementa el stock total y crea `AccountPayable` con `dueDate`, `balanceCents` y estado `PENDIENTE`.
- **Pago a proveedor:** Abono sobre `AccountPayable` mediante transferencia bancaria reduce el balance pendiente de la deuda y actualiza su estado a `PARCIAL`.

### 3.7. Gastos Operativos
- **Validación defensiva:** Rechazo de gastos con importe menor o igual a 0.
- **Creación y edición:** Creación de gasto con cuenta de tesorería, categoría y notas; actualización de descripción e importe con auditoría.

### 3.8. Contratos de Impresión y Plantillas
- Las estructuras de datos para impresión térmica (`80mm`) y carta (`CARTA`) consumen exclusivamente los datos comerciales de `Sale`, `CompanySettings` y `Customer`.
- No contienen `eNcf`, código de seguridad de DGII, QR fiscal ni firma digital calculada.

### 3.9. Idempotencia y Reintentos
- Operaciones con `operationId` estable (compras y caja): un reintento idéntico devuelve la operación existente sin duplicar compras ni volver a incrementar existencias en inventario.
- Un reintento con el mismo identificador pero contenido alterado es rechazado inmediatamente como conflicto de reutilización de ID.

### 3.10. Contratos HTTP Móviles Reales (Sin Cookies)
Se ejecutaron solicitudes HTTP simuladas contra los route handlers de Next.js (`NextRequest`):
- `/api/sales?skip=0&take=5`
- `/api/purchases?skip=0&take=5`
- `/api/operating-expenses?skip=0&take=5`
- `/api/payments?skip=0&take=5`
- `/api/returns?skip=0&take=5`

**Resultados:**
- Sin autenticación: **HTTP 401 Unauthorized**.
- Cajero sin permiso de compras consultando `/api/purchases`: **HTTP 403 Forbidden**.
- Dueño autorizado: **HTTP 200 OK** con estructura uniforme paginada `{ data: [...], nextSkip: ... }`.
- Comprobación de carga útil: Ningún objeto entregado por estos endpoints contiene campos fiscales.

---

## 4. Estado de los Comandos del Entorno Fiscal

| Comando | Estado | Cobertura |
|---|---|---|
| `npm run fiscal-test:check` | **Aprobado** | Conexión local a `movopos_fiscal_test_2` en PostgreSQL 17.6 (puerto 55439). |
| `npm run fiscal-test:smoke` | **Aprobado** | Fixtures, cuentas, usuarios, PIN, RLS de roles y restricciones criptográficas. |
| `npm run fiscal-test:auth` | **Aprobado** | Validación de firmas JWT RSA, vencimiento de sesión y rechazo de firmas cruzadas. |
| `npm run fiscal-test:clerk-temporary` | **Aprobado** | Consultas móviles, permisos y rechazo cruzado con sesiones temporales Clerk. |
| `npm run fiscal-test:next` | **Aprobado** | Servidor Next.js real aislado, cookies web, tokens móviles, paginación y seguridad. |
| `npm run fiscal-test:regression` | **Aprobado** | 55 pruebas de ventas, inventario, caché, notas e impresión con dependencias mock. |
| `npm run fiscal-test:baseline` | **Aprobado** | **11 pruebas de aceptación comercial de la línea base fiscal en base aislada.** |
| `npm run fiscal-test:integration` | **Aprobado** | **76 pruebas completas** (41 de turnos de caja, 24 de compras/crédito, 11 de línea base comercial). |

---

## 5. Criterio de Aceptación y Conclusión de la Etapa 0

El criterio de aceptación de la Etapa 0 exigía:
> *"Existe evidencia reproducible del comportamiento ordinario, sin activar ningún perfil fiscal. Los resultados aún no comprobados se registran como pendientes, no como aprobados."*

Con la suite de integración de línea base aprobada al 100%, la verificación de contratos móviles sin cookies y la comprobación de aislamiento multiempresa, **la Etapa 0 queda formalmente completada y aceptada**. El proyecto está listo para iniciar la **Etapa 1 (Aislamiento fiscal por empresa y país)**.


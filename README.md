# Tejada Auto Adornos · POS & Inventario

App web para **ventas**, **inventario**, **compras**, **cuentas por cobrar (CxC)**, **cuadre diario**, **reportes**, **cotizaciones**, **devoluciones**, **gastos operativos**, y **gestión de proveedores**.

- Moneda: **RD$ (DOP)**
- ITBIS: **18% incluido en el precio** (se desglosa en subtotal/itbis/total)
- Facturación:
  - **Ticket térmico 80mm** (por defecto)
  - Factura **carta** (opcional)
- Modo de uso: pensado para **local (1 PC)**, listo para migrar a nube.

---

## Módulos

### Ventas (POS)
Ruta: `/sales`
- Selección de cliente o **Cliente Genérico**
- Búsqueda de productos por:
  - **Descripción**
  - **Código (SKU)**
  - **Referencia**
- Carrito con cantidades y total acumulado
- Venta **Contado** o **Crédito**
- Si es crédito: se crea automáticamente la **Cuenta por Cobrar**
- **Costo de envío** opcional (se suma al total)
- **Notas** opcionales en la venta
- **Impresión**: al guardar se abre el **ticket térmico**
- **Edición y cancelación** de ventas (ver Lista de Ventas)

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
  - Precio (ITBIS incluido)
  - Costo
  - Stock y Stock mínimo
  - **Asociación con proveedor** (opcional)
- Desactivar productos

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
- **Reporte de cobros**: `/reports/payments`
  - Por rango de fecha
  - Reimpresión de recibos de pago
- **Reporte de ganancia (Estado de Resultados)**: `/reports/profit`
  - Por rango de fecha
  - Desglose completo:
    - Ingresos/Ventas (contado y pagos recibidos)
    - Costo de ventas
    - Utilidad bruta
    - Gastos operativos
    - Utilidad operativa
    - Otros ingresos y gastos
    - Impuestos
    - Utilidad neta
    - Cuentas por cobrar pendientes

### Cotizaciones
Ruta: `/quotes`
- Crear cotizaciones para clientes
- Similar a ventas pero sin afectar inventario
- **Fecha de validez** opcional
- **Costo de envío** opcional
- **Compartir cotización** (genera URL única)
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
- Datos de empresa (se reflejan en facturas/recibos):
  - Nombre, teléfono, dirección
  - **Upload de logo** (máximo 5MB, formatos de imagen)
- Inventario:
  - **Permitir vender sin stock** (si está activo, puede dejar stock negativo)

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
- Incluye información del cliente y productos

---

## Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Estilos**: TailwindCSS + shadcn/ui
- **Base de datos**: Prisma + PostgreSQL
- **Gráficos**: Recharts
- **IA/OCR**: OpenAI Vision API (para extracción de datos de facturas)
- **Temas**: next-themes (modo claro/oscuro/sistema)

---

## Requisitos
- Node.js
- PostgreSQL

---

## Configuración

### Base de Datos

En `./.env`:

```env
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:PUERTO/tejada_pos?schema=public"
```

> **Nota importante**: El puerto por defecto de PostgreSQL es `5432`. Si tu instalación usa otro puerto (por ejemplo `5433`), reemplázalo en la URL.

**Formato correcto de la URL:**
- ✅ `DATABASE_URL="postgresql://postgres:password123@localhost:5433/tejada_pos?schema=public"`
- ❌ `DATABASE_URL="postgresql://postgres:postgres:password123@localhost:5433/tejada_pos"` (duplicado)
- ❌ `DATABASE_URL="postgresql://postgres: password @localhost:5433/tejada_pos"` (espacios)

**Si tu contraseña tiene caracteres especiales**, codifícalos en la URL:
- `@` → `%40`
- `#` → `%23`
- `%` → `%25`
- Espacios → `%20`

Ejemplo: Si tu contraseña es `mi@pass#123`, la URL sería:
```env
DATABASE_URL="postgresql://postgres:mi%40pass%23123@localhost:5433/tejada_pos?schema=public"
```

### OpenAI (Opcional - para OCR)

Si quieres usar la funcionalidad de escaneo de facturas, agrega en `./.env`:

```env
OPENAI_API_KEY="tu-api-key-aqui"
```

> Nota: Sin esta variable, la funcionalidad de OCR no estará disponible.

---

## Comandos

Desde la carpeta raíz del proyecto:

Instalar dependencias:
```bash
npm install
```

Migraciones:
```bash
npm run prisma:migrate
```

> **Nota**: Si encuentras errores relacionados con "shadow database" al ejecutar migraciones en desarrollo, puedes usar:
> ```bash
> npx prisma db push
> ```
> Esto sincroniza el esquema directamente sin usar migraciones (útil para desarrollo).

Aplicar migraciones en producción:
```bash
npx prisma migrate deploy
```

Seed (empresa, cliente genérico, secuencia de factura A, usuario admin):
```bash
npm run db:seed
```

Desarrollo:
```bash
npm run dev
```

Prisma Studio:
```bash
npm run prisma:studio
```

Regenerar cliente de Prisma:
```bash
npx prisma generate
```

---

## Datos iniciales (Seed)
- Empresa: **Tejada Auto Adornos**
- Cliente: **Cliente Genérico**
- Secuencia de factura: serie **A** (`A-00001`)
- Usuario admin (para modo local):
  - username: `admin`
  - password: `admin`

> Nota: el hash actual en seed es SHA-256 (solo demo/local). En producción se cambia a bcrypt/argon2.

---

## Backup y Restauración de Base de Datos

### Exportar Base de Datos (Backup)

**En Windows (PowerShell):**
```powershell
$env:PGPASSWORD='TU_CONTRASEÑA'
pg_dump -h localhost -p PUERTO -U postgres -d tejada_pos > tejada_pos_backup.sql
```

**En Linux/Mac:**
```bash
PGPASSWORD='TU_CONTRASEÑA' pg_dump -h localhost -p PUERTO -U postgres -d tejada_pos > tejada_pos_backup.sql
```

### Restaurar Base de Datos (Importar)

**⚠️ Advertencia**: La restauración **eliminará todos los datos actuales** de la base de datos.

**En Windows (PowerShell):**

Si el archivo SQL tiene problemas de codificación (error `ÿ_`), primero conviértelo a UTF-8:
```powershell
$content = Get-Content tejada_pos_backup.sql -Raw
[System.IO.File]::WriteAllText("tejada_pos_backup_utf8.sql", $content, [System.Text.UTF8Encoding]::new($false))
```

Luego restaura:
```powershell
# 1. Cerrar conexiones activas (opcional pero recomendado)
$env:PGPASSWORD='TU_CONTRASEÑA'
psql -h localhost -p PUERTO -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'tejada_pos' AND pid <> pg_backend_pid();"

# 2. Eliminar y recrear la base de datos
psql -h localhost -p PUERTO -U postgres -c "DROP DATABASE IF EXISTS tejada_pos;"
psql -h localhost -p PUERTO -U postgres -c "CREATE DATABASE tejada_pos;"

# 3. Importar el backup
psql -h localhost -p PUERTO -U postgres -d tejada_pos -f tejada_pos_backup_utf8.sql
```

**En Linux/Mac:**
```bash
PGPASSWORD='TU_CONTRASEÑA' psql -h localhost -p PUERTO -U postgres -d tejada_pos < tejada_pos_backup.sql
```

### Después de Restaurar

Después de restaurar un backup, marca las migraciones como aplicadas:
```bash
npx prisma migrate resolve --applied 20260113145330_m1
npx prisma migrate resolve --applied 20250114000000_add_shipping_to_sales
# ... (marca todas las migraciones como aplicadas)
```

O simplemente sincroniza el esquema:
```bash
npx prisma db push
npx prisma generate
```

---

## Migrar el Proyecto a Otra PC

**Sí, necesitas exportar e importar la base de datos** cuando mueves el proyecto a otra PC. Los datos están almacenados en PostgreSQL, no en el código del proyecto.

**Pasos:**

1. **En la PC original:**
   - Exporta la base de datos (ver sección Backup y Restauración)
   - Copia el archivo `.env` y el archivo de backup SQL

2. **En la nueva PC:**
   - Instala Node.js y PostgreSQL
   - Copia todo el proyecto (código fuente)
   - Crea la base de datos `tejada_pos` en PostgreSQL
   - Actualiza el archivo `.env` con las credenciales correctas de la nueva PC
   - Restaura la base de datos (ver sección Backup y Restauración)
   - Ejecuta `npm install` para instalar dependencias
   - Ejecuta `npx prisma generate` para regenerar el cliente
   - Ejecuta `npm run db:seed` solo si necesitas datos iniciales (opcional, ya tienes datos del backup)

> **Nota**: Si tienes logos o archivos subidos en `public/uploads/`, también cópialos a la nueva PC.

---

## Problemas Comunes y Soluciones

### Error: "Authentication failed" (P1000)

**Causa**: Credenciales incorrectas en `DATABASE_URL`.

**Solución**:
1. Verifica que la contraseña en `.env` sea correcta
2. Verifica que no haya espacios adicionales en la URL
3. Si la contraseña tiene caracteres especiales, codifícalos en la URL
4. Verifica que el usuario `postgres` tenga permisos para acceder a la base de datos

### Error: "shadow database" al ejecutar migraciones

**Causa**: Prisma intenta crear una base de datos temporal para validar migraciones.

**Solución**:
- Usa `npx prisma db push` en lugar de `npm run prisma:migrate` para desarrollo
- O en producción, usa `npx prisma migrate deploy` que no usa shadow database

### Error: "no existe la relación «Sale»" al aplicar migraciones

**Causa**: Las migraciones están fuera de orden o la base de datos está vacía.

**Solución**:
```bash
# Sincroniza el esquema directamente
npx prisma db push

# Luego marca las migraciones como aplicadas
npx prisma migrate resolve --applied [nombre_migracion]
```

### Error: "ÿ_" al importar backup SQL en PowerShell

**Causa**: El archivo SQL está en codificación UTF-16 en lugar de UTF-8.

**Solución**: Convierte el archivo a UTF-8 (ver sección Restaurar Base de Datos).

### Error: PowerShell no reconoce `<` para redirección

**Causa**: PowerShell no soporta redirección `<` igual que bash.

**Solución**: Usa `Get-Content` o el flag `-f`:
```powershell
# Método 1
Get-Content archivo.sql | psql -h localhost -p 5433 -U postgres -d tejada_pos

# Método 2
psql -h localhost -p 5433 -U postgres -d tejada_pos -f archivo.sql
```

---

## Login / Permisos (pendiente intencional)

Por ahora **NO** se activó login real. Se usa un stub:

- `src/lib/auth-stub.ts` retorna un usuario local.
- Permiso relevante:
  - `canOverridePrice`: permite modificar el precio al facturar.

Hay scaffolding comentado para activarlo más adelante.

---

## Rutas principales (resumen)

### Módulos principales
- Dashboard: `/dashboard`
- Ventas: `/sales`
- Clientes: `/customers`
- Productos: `/products`
- Compras: `/purchases`
- CxC: `/ar`
- Cuadre diario: `/daily-close`
- Reportes: `/reports`
- Ajustes: `/settings`

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

---

## Características Adicionales

### Tema Claro/Oscuro
- **Toggle de tema** en el header
- Modos: Claro, Oscuro, Sistema (sigue preferencias del sistema)
- Persistencia de preferencia del usuario

### Cancelaciones
- **Ventas**: Se pueden cancelar si no tienen pagos registrados (restaura stock)
- **Compras**: Se pueden cancelar (restaura stock y costos)
- **Pagos**: Se pueden cancelar (recalcula balance de CxC)
- **Devoluciones**: Se pueden cancelar (restaura cambios de stock)
- Todas las cancelaciones registran usuario y fecha

### Funcionalidades de Ventas
- **Costo de envío** configurable por venta
- **Notas** opcionales en cada venta
- **Edición** de ventas después de creadas
- **Modificación de precios** (requiere permiso `canOverridePrice`)

### Funcionalidades de Productos
- **ID incremental** (productId) para referencia fácil
- **Asociación con proveedores**
- **Búsqueda por múltiples campos**: nombre, SKU, referencia, productId

### Funcionalidades de Compras
- **Descuentos por proveedor** (configurables en proveedor)
- **Descuentos por línea** en compras individuales
- **Actualización opcional de costos** de productos

### Funcionalidades de Cotizaciones
- **Compartir cotizaciones** con URL única
- **Fecha de validez** configurable
- **No afecta inventario** (solo documento de referencia)
- Visualización e impresión profesional

## Mejoras y Correcciones Recientes

### Dashboard
- ✅ **Gráfico de pastel circular** implementado para visualizar distribución de ventas (Contado vs Crédito)
- ✅ Colores distintivos y tooltips informativos
- ✅ Muestra porcentajes y montos formateados

### Cuentas por Cobrar
- ✅ **Validaciones de entrada**: Solo números permitidos en campo de monto
- ✅ **Validación de balance**: No permite abonar más del balance pendiente
- ✅ Mensajes de error claros y en tiempo real
- ✅ Botón de acceso rápido a Recibos de Pago

### Compras
- ✅ Interfaz de búsqueda optimizada (eliminado mensaje "Escribe para buscar")
- ✅ **Escaneo de facturas con OCR** usando OpenAI Vision API
- ✅ Coincidencia automática de productos existentes

### Accesibilidad
- ✅ Corrección de accesibilidad: Todos los diálogos tienen `DialogTitle` requerido para lectores de pantalla

---

## Notas Técnicas

### Almacenamiento de Datos
- **Dinero**: Se guarda en centavos (ej. RD$ 100.00 => `10000`)
- **ITBIS**: Siempre 18% incluido en el precio (se desglosa en subtotal/itbis/total)
- **Porcentajes**: Se almacenan en basis points (1000 = 10%, 1800 = 18%)

### Secuencias y Códigos
- **Facturas**: Serie `A-00001`, `A-00002`, etc.
- **Cotizaciones**: `COT-00001`, `COT-00002`, etc.
- **Devoluciones**: `DEV-00001`, `DEV-00002`, etc.
- **Productos**: ID incremental automático (productId)

### Validaciones Importantes
- **Stock negativo**: Solo permitido si `allowNegativeStock` está activo en ajustes
- **Cancelación de ventas a crédito**: Solo si no tiene pagos registrados
- **Balance de CxC**: Se recalcula automáticamente al cancelar pagos
- **Stock**: Se restaura automáticamente al cancelar ventas o compras

### Permisos de Usuario
- **canOverridePrice**: Permite modificar precios al facturar (útil para descuentos especiales)
- Roles: ADMIN, CAJERO, ALMACEN (preparado para futuro uso)

### Archivos y Uploads
- **Logos**: Se guardan en `public/uploads/logos/`
- **Tamaño máximo**: 5MB
- **Formatos**: Cualquier formato de imagen válido

# MOVOPos - Sistema POS & Inventario Multi-Tenant

App web SaaS para **ventas**, **inventario**, **compras**, **cuentas por cobrar (CxC)**, **cuadre diario**, **reportes**, **cotizaciones**, **devoluciones**, **gastos operativos**, y **gestión de proveedores**.

- **Multi-tenant**: Cada cuenta es un negocio aislado con sus propios datos
- **Autenticación**: Clerk (Google/Email) + Subusuarios con contraseña
- Moneda: **RD$ (DOP)**
- ITBIS: **18% incluido en el precio** (se desglosa en subtotal/itbis/total)
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

### Modo Offline
- **Ventas offline**: Se guardan en IndexedDB y sincronizan al volver la conexión
- **Pagos offline**: Abonos a CxC se guardan localmente
- **Pre-carga de datos**: Productos, clientes y CxC se cachean para uso offline
- **Sincronización automática**: Al detectar conexión, sincroniza pendientes

---

## ✅ Implementaciones y correcciones recientes (enero 2026)

### Implementaciones
- **Verificación de conectividad real**: Se agrega ping periódico (`HEAD`) a `/api/health-check` con timeout para detectar si hay internet real, no solo `navigator.onLine`.
- **Navegación en modo offline**: Al estar sin conexión, solo se habilitan rutas de **Ventas** (`/sales`) y **CxC** (`/ar`); el resto queda deshabilitado en el menú.

### Correcciones
- **Página offline**: Se corrige el CTA para permitir **cobrar** (CxC) en lugar de **comprar**, con enlace directo a `/ar`.
- **Service Worker**: Se incrementa la versión de cache para asegurar que se sirvan los recursos actualizados.

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
  - Precio (ITBIS incluido)
  - Costo
  - Stock y Stock mínimo
  - **Unidades de medida**: Unidad de compra y unidad de venta (pueden ser diferentes)
    - Unidades disponibles: UNIDAD, KG, LIBRA, GRAMO, LITRO, ML, GALON, METRO, CM, PIE
    - Productos con medidas permiten decimales (ej: 2.5 kg)
    - Productos por unidad solo permiten enteros
  - **Imágenes del producto** (hasta 3 imágenes, máximo 2MB cada una)
  - **Asociación con proveedor** (opcional)
  - **Asociación con categoría** (opcional)
- **Impresión de etiquetas con código de barras** (formato CODE128)
  - Vista previa antes de imprimir
  - Tamaño configurable en ajustes
  - Incluye nombre, referencia, código de barras y precio
- Desactivar productos

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

#### Gestión de Usuarios (solo dueño)
- Crear nuevos usuarios/operadores
- Editar usuarios existentes
- Cambiar contraseñas
- Asignar roles: ADMIN, CAJERO, ALMACEN
- Configurar permisos individuales
- Activar/desactivar usuarios
- Eliminar usuarios

### Backups de Base de Datos
Ruta: `/backups`
- **Requiere permiso**: `canManageBackups` o rol ADMIN
- Crear backups manuales
- Ver lista de backups disponibles
- Descargar backups
- Restaurar backups (⚠️ reemplaza todos los datos)
- Eliminar backups

### Facturación (Billing)
Ruta: `/billing`
- **Trial de 15 días** al crear cuenta
- **Dos métodos de pago**:
  - **Transferencia bancaria (DOP)**: RD$1,300/mes
  - **Tarjeta de crédito (USD)**: $20/mes vía Lemon Squeezy
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

# OpenAI (opcional - para OCR de facturas)
OPENAI_API_KEY="sk-..."

# WhatsApp Cloud API (opcional - para OTP por WhatsApp)
WHATSAPP_PHONE_NUMBER_ID="tu_phone_number_id"
WHATSAPP_ACCESS_TOKEN="tu_access_token"

# === BILLING (Sistema de Facturación) ===

# Lemon Squeezy (opcional - para pagos con tarjeta USD)
LEMON_STORE_ID="tu-store-id"
LEMON_VARIANT_ID_USD="123456"
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

### Migraciones (desarrollo)
```bash
npm run prisma:migrate
```

> **Nota**: Si hay errores de "shadow database", usa:
> ```bash
> npx prisma db push
> ```

### Migraciones (producción)
```bash
npx prisma migrate deploy
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
npx prisma generate
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
| `LEMON_STORE_ID` | ❌ | ID de tienda en Lemon Squeezy |
| `LEMON_VARIANT_ID_USD` | ❌ | ID del producto USD en Lemon Squeezy |
| `LEMON_WEBHOOK_SECRET` | ❌ | Secret del webhook de Lemon Squeezy |
| `RESEND_API_KEY` | ❌ | API Key de Resend para emails |
| `EMAIL_FROM` | ❌ | Email remitente para notificaciones |
| `NEXT_PUBLIC_APP_URL` | ❌ | URL de la app (para links en emails) |
| `CRON_SECRET` | ❌ | Secret para proteger el cron job |

### Configurar Clerk Webhook en producción
1. En Clerk Dashboard → Webhooks
2. Crear nuevo webhook:
   - URL: `https://tu-app.vercel.app/api/auth/clerk-webhook`
   - Eventos: `user.created`, `user.updated`
3. Copiar Signing Secret a variable `CLERK_WEBHOOK_SECRET`

### Configurar Lemon Squeezy (pagos USD)
1. Crea cuenta en [lemonsqueezy.com](https://lemonsqueezy.com)
2. Crea una tienda (Store) → copia el `LEMON_STORE_ID`
3. Crea un producto con precio $20/mes → copia el `LEMON_VARIANT_ID_USD`
4. Ve a Settings → Webhooks → crea uno:
   - URL: `https://tu-app.vercel.app/api/webhooks/lemon`
   - Eventos: Todos los de subscription
   - Copia el Signing Secret a `LEMON_WEBHOOK_SECRET`

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
- **ITBIS**: Siempre 18% incluido en el precio (se desglosa en subtotal/itbis/total)
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

### Seguridad y auditoría
- Roles y permisos granulares (OWNER/ADMIN/FINANCE/SUPPORT).
- Audit log de acciones del super admin.

### Rutas implementadas
- `/super-admin` (dashboard)
- `/super-admin/accounts`
- `/super-admin/accounts/[id]`
- `/super-admin/payments`
- `/super-admin/banks`
- `/super-admin/reports` (placeholder)
- `/super-admin/settings` (placeholder)

### Migraciones y seed
- Modelos: `SuperAdmin`, `SuperAdminAuditLog`, enum `SuperAdminRole`.
- Seed crea un super admin por defecto (override con `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`).

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

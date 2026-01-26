# 🚀 Guía: Desplegar API en Vercel

Esta guía te ayudará a desplegar tu API de MOVOPos en Vercel para que la app móvil pueda conectarse.

## 📋 Checklist Pre-Despliegue

### 1. ✅ Base de Datos PostgreSQL

Necesitas una base de datos PostgreSQL accesible desde internet:

**Opciones recomendadas:**
- **[Supabase](https://supabase.com/)** - Gratis hasta 500MB
- **[Neon](https://neon.tech/)** - Tier gratuito generoso
- **[Railway](https://railway.app/)** - Fácil de usar

**Pasos:**
1. Crear cuenta en uno de los proveedores
2. Crear una nueva base de datos PostgreSQL
3. Copiar la **Connection String** (DATABASE_URL)
   - Formato: `postgresql://usuario:contraseña@host:puerto/nombre_db?schema=public`

### 2. ✅ Cuenta de Clerk

1. Ir a [Clerk Dashboard](https://dashboard.clerk.com/)
2. Crear nueva aplicación (o usar existente)
3. Habilitar métodos de autenticación:
   - ✅ Email (Email code o Email link)
   - ✅ Google OAuth (opcional)
4. Obtener las keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_test_... o pk_live_...)
   - `CLERK_SECRET_KEY` (sk_test_... o sk_live_...)

### 3. ✅ Generar JWT_SECRET

Este es **CRÍTICO** para que funcionen los subusuarios:

```bash
# En tu terminal (Windows PowerShell o Git Bash)
openssl rand -base64 32
```

O genera un string aleatorio de al menos 32 caracteres.

**⚠️ IMPORTANTE**: Guarda este valor de forma segura. Lo necesitarás en Vercel.

### 4. ✅ Uploadthing (Opcional pero recomendado)

Para subir logos e imágenes de productos:

1. Crear cuenta en [Uploadthing](https://uploadthing.com/)
2. Crear proyecto
3. Obtener:
   - `UPLOADTHING_SECRET` (secret key)
   - `UPLOADTHING_APP_ID` (app ID)

---

## 🚀 Pasos de Despliegue en Vercel

### Paso 1: Conectar Repositorio

1. Ir a [Vercel Dashboard](https://vercel.com/dashboard)
2. Click en **"Add New Project"**
3. Conectar tu repositorio de GitHub/GitLab/Bitbucket
4. Seleccionar el proyecto `pos`

### Paso 2: Configurar Build Settings

En la configuración del proyecto:

- **Framework Preset**: Next.js (debería detectarse automáticamente)
- **Build Command**: `npx prisma generate && npm run build`
- **Output Directory**: `.next` (por defecto)
- **Install Command**: `npm install`

### Paso 3: Configurar Variables de Entorno

En **Settings → Environment Variables**, agregar:

#### 🔴 OBLIGATORIAS:

```env
# Base de datos
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/nombre_db?schema=public

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# JWT para subusuarios (CRÍTICO)
JWT_SECRET=tu_secreto_generado_de_32_caracteres_minimo
```

#### 🟡 RECOMENDADAS:

```env
# Uploadthing
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=...
NEXT_PUBLIC_UPLOADTHING_APP_ID=... (mismo valor que UPLOADTHING_APP_ID)

# URL de la app (para links en emails)
NEXT_PUBLIC_APP_URL=https://tu-dominio.vercel.app
```

#### 🟢 OPCIONALES:

```env
# OpenAI (para OCR de facturas)
OPENAI_API_KEY=sk-...

# WhatsApp (para OTP)
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...

# Billing (si usas facturación)
LEMON_STORE_ID=...
LEMON_VARIANT_ID_USD=...
LEMON_WEBHOOK_SECRET=...
RESEND_API_KEY=re_...
EMAIL_FROM=facturacion@tu-dominio.com
CRON_SECRET=...
```

**⚠️ IMPORTANTE**: 
- Selecciona **"Production, Preview, and Development"** para cada variable
- O configura por ambiente según necesites

### Paso 4: Desplegar

1. Click en **"Deploy"**
2. Esperar a que termine el build
3. Verificar que no haya errores en los logs

---

## 🔄 Después del Primer Despliegue

### 1. Ejecutar Migraciones de Base de Datos

La base de datos necesita las tablas. Ejecuta las migraciones:

**Opción A: Desde tu máquina local**
```bash
# Conectar a la base de datos de producción
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

**Opción B: Desde Vercel CLI**
```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Obtener variables de entorno
vercel env pull .env.production.local

# Ejecutar migraciones
npx prisma migrate deploy
```

**Opción C: Desde Supabase/Neon Dashboard**
- Algunos proveedores tienen SQL Editor donde puedes ejecutar las migraciones manualmente

### 2. (Opcional) Ejecutar Seed

Si quieres datos iniciales (usuario admin, cliente genérico, etc.):

```bash
DATABASE_URL="postgresql://..." npx prisma db seed
```

Esto creará:
- Usuario admin (username: `admin`, password: `admin`)
- Cliente genérico
- Secuencias de facturación

### 3. Configurar Webhook de Clerk

Ahora que tienes la URL de producción:

1. Ir a [Clerk Dashboard](https://dashboard.clerk.com/)
2. Ir a **Webhooks**
3. Crear nuevo webhook o editar existente:
   - **URL**: `https://tu-proyecto.vercel.app/api/auth/clerk-webhook`
   - **Eventos**: Seleccionar `user.created` y `user.updated`
4. Copiar el **Signing Secret** → Agregar a Vercel como `CLERK_WEBHOOK_SECRET`
5. Guardar

---

## ✅ Verificar que la API Funciona

### 1. Verificar Health Check

Abre en tu navegador:
```
https://tu-proyecto.vercel.app/api/health-check
```

Debería responder con `{ "status": "ok" }`

### 2. Verificar Endpoints de Autenticación

**Listar subusuarios** (requiere autenticación Clerk):
```bash
curl -X GET https://tu-proyecto.vercel.app/api/auth/subusers \
  -H "Authorization: Bearer TU_CLERK_TOKEN"
```

**Login de subusuario**:
```bash
curl -X POST https://tu-proyecto.vercel.app/api/auth/subuser/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_CLERK_TOKEN" \
  -d '{"username": "admin", "password": "admin"}'
```

### 3. Verificar Endpoints de Datos

**Listar productos** (requiere Clerk + JWT de subusuario):
```bash
curl -X GET https://tu-proyecto.vercel.app/api/products \
  -H "Authorization: Bearer TU_CLERK_TOKEN" \
  -H "X-SubUser-Token: TU_JWT_TOKEN"
```

---

## 🔧 Configurar la App Móvil

Una vez que la API esté desplegada, actualiza la app móvil:

### 1. Actualizar `.env` en la app móvil:

```env
# URL de la API
API_URL=https://tu-proyecto.vercel.app

# Clerk (mismo que en Vercel)
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
```

### 2. Verificar que la app móvil pueda conectarse

La app móvil debería poder:
- ✅ Autenticarse con Clerk
- ✅ Listar subusuarios
- ✅ Iniciar sesión con subusuario
- ✅ Obtener token JWT
- ✅ Hacer peticiones a los endpoints API

---

## 🐛 Solución de Problemas

### Error: "Prisma Client not found"

**Solución**: Asegúrate de que el build command incluya `prisma generate`:
```
npx prisma generate && npm run build
```

### Error: "Database connection failed"

**Posibles causas:**
1. `DATABASE_URL` incorrecta
2. La IP de Vercel no tiene acceso a la BD
3. Algunos proveedores requieren whitelist de IPs

**Solución:**
- Verificar `DATABASE_URL` en Vercel
- En Supabase/Neon, verificar que permita conexiones desde cualquier IP (o agregar IPs de Vercel)
- Revisar logs de Vercel para ver el error específico

### Error: "JWT_SECRET is required"

**Solución**: 
- Verificar que `JWT_SECRET` esté configurado en Vercel
- Debe tener al menos 32 caracteres
- Regenerar si es necesario: `openssl rand -base64 32`

### Error: "No autenticado" en endpoints

**Posibles causas:**
1. Token de Clerk inválido o expirado
2. Token JWT de subusuario inválido
3. Headers incorrectos

**Solución:**
- Verificar que los headers estén correctos:
  - `Authorization: Bearer <clerk_token>`
  - `X-SubUser-Token: <jwt_token>`
- Verificar que los tokens no hayan expirado
- Revisar logs de Vercel para ver el error específico

### Error: "Clerk webhook failed"

**Solución:**
- Verificar `CLERK_WEBHOOK_SECRET` en Vercel
- Verificar URL del webhook en Clerk Dashboard
- Revisar logs de Vercel: `vercel logs`

---

## 📊 Monitoreo

### Ver Logs en Vercel

1. Ir a Vercel Dashboard
2. Seleccionar tu proyecto
3. Ir a **Deployments**
4. Click en un deployment
5. Ver **Logs** o **Function Logs**

### Verificar Estado de la API

Puedes usar herramientas como:
- [Postman](https://www.postman.com/)
- [Insomnia](https://insomnia.rest/)
- `curl` desde terminal

---

## 🔐 Seguridad

### ✅ Checklist de Seguridad

- [ ] `JWT_SECRET` es único y seguro (32+ caracteres)
- [ ] Usar keys de **producción** de Clerk (`pk_live_...`, `sk_live_...`)
- [ ] `DATABASE_URL` no está en el código, solo en variables de entorno
- [ ] Webhook de Clerk configurado correctamente
- [ ] Base de datos con conexión SSL habilitada
- [ ] Variables de entorno configuradas en Vercel (no en código)

---

## 📝 Resumen de Pasos

1. ✅ Crear base de datos PostgreSQL en la nube
2. ✅ Configurar cuenta de Clerk
3. ✅ Generar `JWT_SECRET`
4. ✅ Conectar repositorio a Vercel
5. ✅ Configurar variables de entorno en Vercel
6. ✅ Desplegar
7. ✅ Ejecutar migraciones de base de datos
8. ✅ Configurar webhook de Clerk
9. ✅ Verificar que los endpoints funcionan
10. ✅ Actualizar app móvil con la URL de la API

---

## 🎉 ¡Listo!

Una vez completados estos pasos, tu API estará funcionando en Vercel y la app móvil podrá conectarse a ella.

**URL de tu API**: `https://tu-proyecto.vercel.app`

**Endpoints disponibles**:
- `GET /api/auth/subusers` - Listar subusuarios
- `POST /api/auth/subuser/login` - Login de subusuario
- `GET /api/products` - Listar productos
- `POST /api/products` - Crear producto
- `PUT /api/products/:id` - Actualizar producto
- `GET /api/customers` - Listar clientes
- `POST /api/customers` - Crear cliente
- `PUT /api/customers/:id` - Actualizar cliente
- `POST /api/sales` - Crear venta
- `POST /api/payments` - Registrar pago
- `GET /api/accounts-receivable` - Listar cuentas por cobrar

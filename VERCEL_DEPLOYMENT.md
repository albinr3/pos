# Guía de Despliegue en Vercel

Este documento detalla los pasos necesarios para desplegar MOVOPos en Vercel.

## ✅ Checklist Pre-Despliegue

### 1. Base de Datos PostgreSQL

Necesitas una base de datos PostgreSQL accesible desde internet:

**Opciones recomendadas:**
- [Supabase](https://supabase.com/) - Gratis hasta cierto límite
- [Neon](https://neon.tech/) - Tier gratuito generoso
- [Railway](https://railway.app/) - Fácil de usar
- [PlanetScale](https://planetscale.com/) - Aunque es MySQL, no PostgreSQL

**Formato de DATABASE_URL:**
```
postgresql://usuario:contraseña@host:puerto/nombre_db?schema=public
```

### 2. Cuenta de Clerk

1. Crear cuenta en [Clerk](https://dashboard.clerk.com/)
2. Crear nueva aplicación
3. Habilitar métodos de autenticación:
   - ✅ Email (Email code o Email link)
   - ✅ Google OAuth
4. Obtener las keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_test_... o pk_live_...)
   - `CLERK_SECRET_KEY` (sk_test_... o sk_live_...)

### 3. Webhook de Clerk (Importante)

El webhook sincroniza usuarios de Clerk con la base de datos local.

**Configuración:**
1. En Clerk Dashboard → Webhooks
2. Crear nuevo webhook:
   - **URL**: `https://tu-app.vercel.app/api/auth/clerk-webhook`
   - **Eventos**: `user.created`, `user.updated`
3. Copiar **Signing Secret** → `CLERK_WEBHOOK_SECRET`

⚠️ **Nota**: El webhook no funcionará hasta que el dominio esté activo. Configúralo después del primer despliegue.

### 4. Generar JWT_SECRET

```bash
openssl rand -base64 32
```

O usar cualquier string aleatorio de al menos 32 caracteres.

---

## 📋 Variables de Entorno en Vercel

En el dashboard de Vercel → Settings → Environment Variables:

| Variable | Valor | Entorno |
|----------|-------|---------|
| `DATABASE_URL` | `postgresql://...` | Todos |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Todos |
| `CLERK_SECRET_KEY` | `sk_live_...` | Todos |
| `JWT_SECRET` | (generado) | Todos |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` | Todos |
| `UPLOADTHING_SECRET` | `sk_live_...` | Todos |
| `UPLOADTHING_APP_ID` | `...` | Todos |
| `NEXT_PUBLIC_UPLOADTHING_APP_ID` | `...` (mismo que UPLOADTHING_APP_ID) | Todos |
| `OPENAI_API_KEY` | `sk-...` (opcional) | Todos |

---

## 🚀 Pasos de Despliegue

### Opción A: Desde GitHub

1. Conectar repositorio a Vercel
2. Configurar variables de entorno
3. Build Command: `npx prisma generate && npm run build`
4. Output Directory: `.next`
5. Deploy

### Opción B: Desde CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Desplegar
vercel
```

---

## 🔄 Después del Primer Despliegue

### 1. Ejecutar Migraciones

La base de datos de producción necesita las migraciones:

```bash
# Localmente, con DATABASE_URL apuntando a producción
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

O desde Vercel CLI:
```bash
vercel env pull .env.production.local
npx prisma migrate deploy
```

### 2. Ejecutar Seed (Opcional)

Si quieres datos iniciales:

```bash
DATABASE_URL="postgresql://..." npx prisma db seed
```

### 3. Configurar Webhook de Clerk

Ahora que tienes URL de producción:
1. Clerk Dashboard → Webhooks → Editar
2. Actualizar URL con tu dominio de Vercel
3. Verificar que el webhook funcione

---

## ⚠️ Limitaciones y Consideraciones

### Archivos Subidos (Logos, Imágenes de Productos)

✅ **Implementado**: El proyecto usa **Uploadthing** para almacenar logos e imágenes de productos.

**Configuración:**
1. Crear cuenta en [Uploadthing](https://uploadthing.com/)
2. Crear proyecto
3. Obtener keys:
   - `UPLOADTHING_SECRET` (secret key)
   - `UPLOADTHING_APP_ID` (app ID)
4. Agregar ambas variables en Vercel
5. Agregar `NEXT_PUBLIC_UPLOADTHING_APP_ID` (mismo valor que `UPLOADTHING_APP_ID`)

**Nota**: Las imágenes existentes en `public/uploads/` seguirán funcionando mientras existan en el repositorio, pero las nuevas se subirán a Uploadthing.

### Sistema de Backups

**Problema**: Los backups usan el sistema de archivos local (`/backups/`) y NO funcionarán en Vercel.

**Soluciones:**

1. Usar backups automáticos de tu proveedor de base de datos:
   - Supabase: Backups diarios automáticos
   - Neon: Punto de recuperación en el tiempo
   - Railway: Backups integrados

2. Implementar backups a S3/almacenamiento externo (requiere desarrollo adicional)

**Modo solo lectura recomendado en Vercel:**
- `BACKUPS_READONLY=true`
- `NEXT_PUBLIC_BACKUPS_READONLY=true`

### Console.log en Producción

Hay varios `console.log` en el código que se verán en los logs de Vercel. Para producción limpia, considera eliminarlos o usar un nivel de logging.

---

## 🔧 Configuración de Build

En `vercel.json` (crear si no existe):

```json
{
  "buildCommand": "npx prisma generate && npm run build",
  "framework": "nextjs"
}
```

---

## 🌐 Dominios

### Dominio por defecto de Vercel
Tu app estará en: `tu-proyecto.vercel.app`

### Dominio personalizado
1. Vercel Dashboard → Settings → Domains
2. Agregar tu dominio
3. Configurar DNS según instrucciones de Vercel

---

## 📊 Monitoreo

### Logs
- Vercel Dashboard → Deployments → Logs
- Útil para debuggear errores en producción

### Analytics
- Vercel tiene analytics integrados (plan Pro)
- O integrar Google Analytics

---

## 🔐 Seguridad

### Variables de Entorno
- ✅ Nunca commitear `.env` al repositorio
- ✅ Usar variables de entorno de Vercel
- ✅ JWT_SECRET debe ser único y seguro

### Clerk
- ✅ Usar keys de producción (`pk_live_...`, `sk_live_...`)
- ✅ Configurar dominios permitidos en Clerk Dashboard

### Base de Datos
- ✅ Usar conexión SSL si está disponible
- ✅ Limitar IPs si el proveedor lo permite

---

## 🐛 Solución de Problemas

### Error: "Prisma Client not found"
```bash
npx prisma generate
```
Asegúrate de que el build command incluya `prisma generate`.

### Error: "Database connection failed"
- Verificar DATABASE_URL
- Verificar que la IP de Vercel tenga acceso a la BD
- Algunos proveedores requieren lista blanca de IPs

### Error: "Clerk webhook failed"
- Verificar CLERK_WEBHOOK_SECRET
- Verificar URL del webhook
- Revisar logs de Vercel para ver el error específico

### Imágenes no cargan
- Si usas almacenamiento local, las imágenes se perderán
- Implementar almacenamiento externo

---

## 📝 Resumen de Tareas

- [ ] Base de datos PostgreSQL en la nube
- [ ] Variables de entorno configuradas en Vercel
- [ ] Migraciones ejecutadas en producción
- [ ] Webhook de Clerk configurado
- [ ] (Opcional) Migrar uploads a almacenamiento externo
- [ ] (Opcional) Configurar dominio personalizado
- [ ] Verificar que login funciona
- [ ] Verificar que ventas funcionan
- [ ] Verificar impresión de tickets

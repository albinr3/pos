# Configuración de Autenticación

Este proyecto soporta tres métodos de autenticación:
1. **OTP por WhatsApp** (método principal)
2. **Email/Password con Clerk**
3. **Google OAuth con Clerk**

## Variables de Entorno Requeridas

### WhatsApp Cloud API (para OTP por WhatsApp)

```env
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_ACCESS_TOKEN=tu_access_token
```

**Cómo obtener estas credenciales:**
1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Crea una aplicación de tipo "Business"
3. Añade el producto "WhatsApp"
4. Configura un número de teléfono de prueba o producción
5. Obtén el `Phone Number ID` y genera un `Access Token`

### Clerk (para Email y Google OAuth)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
```

**Cómo obtener estas credenciales:**
1. Ve a [Clerk Dashboard](https://dashboard.clerk.com/)
2. Crea una nueva aplicación
3. En "API Keys", copia `Publishable Key` y `Secret Key`
4. En "Webhooks", crea un webhook apuntando a: `https://tu-dominio.com/api/auth/clerk-webhook`
5. Copia el `Signing Secret` del webhook

### JWT Secret (para sesiones propias de WhatsApp)

```env
JWT_SECRET=tu_secret_key_segura_minimo_32_caracteres
```

**Generar un JWT secret seguro:**
```bash
openssl rand -base64 32
```

## Configuración de Clerk

1. **Habilitar métodos de autenticación:**
   - Ve a "User & Authentication" > "Email, Phone, Username"
   - Habilita "Email address" y "Email link" o "Email code"
   - Ve a "Social Connections" y habilita "Google"

2. **Configurar Google OAuth:**
   - Ve a [Google Cloud Console](https://console.cloud.google.com/)
   - Crea un proyecto o usa uno existente
   - Habilita "Google+ API"
   - Crea credenciales OAuth 2.0
   - Añade la URL de callback de Clerk
   - Copia `Client ID` y `Client Secret` a Clerk

3. **Configurar Webhook:**
   - En Clerk, ve a "Webhooks"
   - Crea un nuevo webhook
   - URL: `https://tu-dominio.com/api/auth/clerk-webhook`
   - Eventos a escuchar:
     - `user.created`
     - `user.updated`
   - Copia el `Signing Secret` a `CLERK_WEBHOOK_SECRET`

## Migración de Base de Datos

Después de configurar las variables de entorno, ejecuta la migración:

```bash
npm run prisma:migrate
```

Esto creará:
- Campos nuevos en la tabla `User`: `whatsappNumber`, `whatsappVerifiedAt`, `clerkUserId`, `email`
- Nueva tabla `WhatsappOtp` para almacenar códigos OTP

## Flujo de Autenticación

### OTP por WhatsApp
1. Usuario ingresa su número de teléfono
2. Sistema envía código OTP por WhatsApp Cloud API
3. Usuario ingresa el código
4. Sistema crea/actualiza usuario y establece sesión JWT

### Email/Google con Clerk
1. Usuario hace clic en "Entrar con Email" o "Entrar con Google"
2. Clerk maneja el flujo de autenticación
3. Webhook de Clerk crea/actualiza usuario en BD local
4. Clerk establece su propia sesión

### Resolución de Usuario
El sistema verifica primero si hay una sesión de Clerk, luego busca una sesión JWT propia. Esto permite que ambos métodos coexistan.

## Notas de Seguridad

- Los códigos OTP expiran en 10 minutos
- Máximo 5 intentos de verificación por código
- Rate limiting: 5 solicitudes por hora por IP y por número
- Las cookies de sesión son `HttpOnly` y `Secure` en producción
- Los tokens JWT expiran en 7 días

## Solución de Problemas

### Error: "WhatsApp no configurado"
- Verifica que `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` estén configurados
- Asegúrate de que el token tenga permisos para enviar mensajes

### Error: "Clerk auth not available"
- Verifica que las variables de entorno de Clerk estén configuradas
- Asegúrate de que `ClerkProvider` esté en el layout raíz

### Usuario no se crea después de login con Clerk
- Verifica que el webhook esté configurado correctamente
- Revisa los logs del servidor para ver errores del webhook
- Asegúrate de que `CLERK_WEBHOOK_SECRET` sea correcto

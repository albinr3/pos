# Autenticación - Notas Técnicas

## Sistema de Sesiones Dual

La app usa un sistema de autenticación de dos capas:

1. **Clerk** - Autenticación principal (Google/Email/WhatsApp)
2. **Subusuario** - Sesión JWT almacenada en cookie `movopos-session`

## Restricción de Cookies en Next.js 14+

**IMPORTANTE:** En Next.js 14+, las cookies solo pueden ser modificadas (set/delete) desde:
- Server Actions (`"use server"`)
- Route Handlers (`/api/...`)

**NO** se pueden modificar cookies durante el renderizado de Server Components.

### Ejemplo de lo que NO hacer

```typescript
// ❌ INCORRECTO - Esto causa error en Server Components
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // ... validación ...
  if (!account || account.id !== subUserSession.accountId) {
    await clearSubUserSession() // ❌ Error: Cookies can only be modified in a Server Action
    return null
  }
}
```

### Ejemplo correcto

```typescript
// ✅ CORRECTO - Solo retornar null, no modificar cookies
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // ... validación ...
  if (!account || account.id !== subUserSession.accountId) {
    // No podemos limpiar cookies aquí porque esta función puede ser llamada
    // desde Server Components. La limpieza se hace en el middleware o logout.
    return null
  }
}

// La limpieza se hace en una Server Action separada
// ver: src/app/select-user/actions.ts -> clearInvalidSubUserSession()
```

## Flujo de Limpieza de Sesiones Inválidas

Cuando un usuario cambia de cuenta en Clerk pero tiene una cookie de subusuario antigua:

1. `getCurrentUser()` detecta la inconsistencia y retorna `null` (sin modificar cookies)
2. El layout redirige a `/select-user`
3. La página `/select-user` detecta la cookie huérfana y llama a `clearInvalidSubUserSession()`
4. La Server Action limpia la cookie de forma segura
5. El usuario puede seleccionar un nuevo subusuario

## Archivos Relacionados

- `src/lib/auth.ts` - Funciones de autenticación principal
- `src/lib/super-admin-auth.ts` - Autenticación de super admin (separada)
- `src/app/select-user/actions.ts` - Server Actions para selección de usuario
- `src/app/select-user/page.tsx` - Página de selección de usuario
- `src/middleware.ts` - Middleware de rutas

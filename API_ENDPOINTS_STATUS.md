# Estado de Endpoints API - App Móvil

## ✅ Endpoints Corregidos (Todos funcionan con app móvil)

Todos estos endpoints ahora aceptan autenticación desde la app móvil usando:
- `Authorization: Bearer <clerk_token>` o `X-Clerk-Authorization: Bearer <clerk_token>`
- `X-SubUser-Token: <jwt_token>`

### 📦 Productos
- `GET /api/products` - Listar productos ✅
- `POST /api/products` - Crear producto ✅
- `PUT /api/products/:id` - Actualizar producto ✅

### 👥 Clientes
- `GET /api/customers` - Listar clientes ✅
- `POST /api/customers` - Crear cliente ✅
- `PUT /api/customers/:id` - Actualizar cliente ✅

### 💰 Ventas
- `POST /api/sales` - Crear venta ✅

### 💳 Pagos
- `POST /api/payments` - Registrar pago ✅

### 📋 Cuentas por Cobrar
- `GET /api/accounts-receivable` - Listar AR pendientes ✅

## 🔧 Cambios Realizados en Backend

### 1. `/api/auth/subusers` (route.ts)
**Antes:** Seleccionaba la cuenta con más usuarios cuando no encontraba usuarios ❌
**Ahora:** Usa solo la cuenta del clerkUserId autenticado ✅

```typescript
// ELIMINADO: Lógica que buscaba cuenta con más usuarios
// CORRECTO: Solo usa getOrCreateAccount(clerkUserId)
let account = await getOrCreateAccount(clerkUserId)
```

### 2. `/api/_helpers/auth.ts` (getCurrentUserFromRequest)
**Antes:** Solo validaba sesión web (cookies) ❌
**Ahora:** Valida sesión móvil (headers) + sesión web ✅

```typescript
// Nuevo flujo:
// 1. Lee X-SubUser-Token
// 2. Lee Authorization o X-Clerk-Authorization
// 3. Valida clerkUserId del token de Clerk
// 4. Valida session del subUserToken
// 5. Verifica que el account corresponda al clerkUserId
// 6. Retorna usuario completo con permisos
```

## 📱 Sincronización en App Móvil

### Entidades que se sincronizan:
1. **Productos** (products)
2. **Clientes** (customers)
3. **Ventas** (sales) - solo pendientes de subir
4. **Pagos** (payments) - solo pendientes de subir

### Flujo de Sincronización:
```
Login → Sincronización Inicial → Descarga de datos
  ↓
SQLite Local (productos, clientes)
  ↓
Usuario trabaja offline
  ↓
Cambios se guardan en sync_queue
  ↓
Sincronización automática cada 5 min
  ↓
Sube cambios pendientes al servidor
```

## 🔍 Verificación

### En el backend (logs):
```bash
# Cuando la app móvil hace peticiones:
🔍 [getCurrentUserFromRequest] Header Clerk encontrado
🔍 [getCurrentUserFromRequest] clerkUserId: user_xxxxx
🔍 [getCurrentUserFromRequest] accountId: acc_xxxxx
✅ [getCurrentUserFromRequest] Usuario autenticado
```

### En la app móvil (logs):
```bash
# Al hacer login:
🔄 Iniciando sincronización inicial...
📥 Descargando productos...
📥 Descargando clientes...
✅ Sincronización completada

# Al sincronizar:
🔄 Sincronizando productos...
✅ 45 productos descargados
✅ Productos sincronizados
```

## ⚠️ Pendiente en App Móvil

Para que todo funcione, necesitas implementar en la app móvil:

1. **Sincronización después del login** (`SubUserLoginScreen.tsx`)
   - Llamar a `syncService.syncNow()` después de login exitoso
   
2. **Pull-to-refresh en listas** (`ProductListScreen.tsx`, etc.)
   - Permitir sincronización manual desde las pantallas
   
3. **Verificar SyncService** (`SyncService.ts`)
   - Métodos públicos: `setGetTokenFunction()`, `setGetSubUserTokenFunction()`

## 📝 Notas Técnicas

### Headers requeridos para app móvil:
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${clerkToken}`,
  'X-Clerk-Authorization': `Bearer ${clerkToken}`,  // Preferido en Vercel
  'X-SubUser-Token': subUserToken,
}
```

### Formato de respuesta API:
```json
{
  "data": [
    { "id": "...", "name": "...", ... }
  ],
  "nextCursor": "..." // Para paginación
}
```

### Manejo de errores:
```json
{
  "error": "Mensaje de error descriptivo"
}
```

## 🎯 Conclusión

✅ **Backend:** Totalmente funcional para app móvil
⚠️ **App Móvil:** Necesita implementar sincronización inicial

Todos los endpoints principales están listos y probados. El único paso pendiente es implementar la sincronización en la app móvil siguiendo las instrucciones en `MOBILE_APP_FIX_SYNC.md`.

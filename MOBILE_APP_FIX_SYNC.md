# Fix: Sincronización de Productos en App Móvil

## Problema
Los productos no aparecen en la app móvil porque no se está ejecutando la sincronización inicial después del login.

## Solución

### 1. Actualizar `SubUserLoginScreen.tsx`

Agregar sincronización automática después del login exitoso:

```typescript
// En src/screens/auth/SubUserLoginScreen.tsx
import { syncService } from '../../services/sync/SyncService';
import { useAuth } from '@clerk/clerk-expo';

// Dentro del componente SubUserLoginScreen
const { getToken } = useAuth();

const handleLogin = async () => {
  if (!password || password.length < 4) {
    setError('La contraseña debe tener al menos 4 caracteres');
    return;
  }

  setLoading(true);
  setError('');

  try {
    // 1. Obtener token de Clerk
    const clerkToken = await getToken();
    if (!clerkToken) {
      throw new Error('No se pudo obtener token de autenticación');
    }

    // 2. Hacer login del subusuario
    const response = await fetch(`${API_URL}/api/auth/subuser/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clerkToken}`,
        'X-Clerk-Authorization': `Bearer ${clerkToken}`,
      },
      body: JSON.stringify({
        username: selectedUser.username,
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Error al iniciar sesión');
    }

    // 3. Guardar sesión del subusuario
    await setSubUser(selectedUser, data.token, data.user.accountId);

    // 4. IMPORTANTE: Iniciar sincronización
    console.log('🔄 Iniciando sincronización inicial...');
    try {
      // Configurar funciones de obtención de tokens
      syncService.setGetTokenFunction(getToken);
      syncService.setGetSubUserTokenFunction(async () => data.token);
      
      // Ejecutar sincronización inicial
      await syncService.syncNow(clerkToken);
      console.log('✅ Sincronización inicial completada');
    } catch (syncError) {
      console.error('⚠️ Error en sincronización inicial:', syncError);
      // No bloquear el login si falla la sincronización
    }

    // 5. Navegar a la app principal
    navigation.replace('Main');

  } catch (err: any) {
    console.error('Error en login:', err);
    setError(err.message || 'Error al iniciar sesión');
  } finally {
    setLoading(false);
  }
};
```

### 2. Actualizar `ProductListScreen.tsx`

Agregar botón de sincronización manual y mejorar el refresh:

```typescript
// En src/screens/inventory/ProductListScreen.tsx
import { syncService } from '../../services/sync/SyncService';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '@clerk/clerk-expo';

export function ProductListScreen({ navigation }: ProductListScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'low_stock' | 'out_of_stock'>('all');
  
  // Agregar esto:
  const { getToken } = useAuth();
  const { subUserToken } = useAuthStore();

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [])
  );

  const loadProducts = async () => {
    try {
      const result = await db.query<any>('SELECT * FROM products ORDER BY name');
      const mapped = result.map(row => ({
        localId: row.local_id,
        serverId: row.server_id,
        name: row.name,
        sku: row.sku,
        priceCents: row.price_cents,
        stock: row.stock,
        synced: row.synced === 1,
        data: row.data,
      }));
      setProducts(mapped);
    } catch (error) {
      console.error('Error cargando productos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // MODIFICAR esta función:
  const onRefresh = async () => {
    setRefreshing(true);
    
    try {
      // Sincronizar con el servidor
      const clerkToken = await getToken();
      if (clerkToken && subUserToken) {
        console.log('🔄 Sincronizando productos...');
        syncService.setGetTokenFunction(getToken);
        syncService.setGetSubUserTokenFunction(async () => subUserToken);
        await syncService.syncNow(clerkToken);
        console.log('✅ Productos sincronizados');
      }
    } catch (error) {
      console.error('Error sincronizando:', error);
    }
    
    // Recargar productos de la BD local
    await loadProducts();
  };

  // Resto del código...
}
```

### 3. Verificar que SyncService tenga los métodos necesarios

Asegúrate de que `SyncService.ts` tenga estos métodos públicos:

```typescript
export class SyncService {
  // ... código existente ...

  public setGetTokenFunction(fn: () => Promise<string | null>) {
    this.getTokenFn = fn;
  }

  public setGetSubUserTokenFunction(fn: () => Promise<string | null>) {
    this.getSubUserTokenFn = fn;
  }

  // ... resto del código ...
}
```

## Pasos para Implementar

1. **Backend (Ya corregido)** ✅
   - Actualizado `src/app/api/_helpers/auth.ts` para aceptar tokens de Clerk desde headers
   
2. **App Móvil** (Pendiente)
   - Actualizar `SubUserLoginScreen.tsx` para sincronizar después del login
   - Actualizar `ProductListScreen.tsx` para permitir sincronización manual con pull-to-refresh
   - Verificar que `SyncService.ts` tenga los métodos públicos necesarios

3. **Probar**
   - Cerrar sesión y volver a iniciar sesión
   - Verificar que los productos se descarguen automáticamente
   - Usar pull-to-refresh en la lista de productos para sincronizar manualmente

## Notas Importantes

- La sincronización puede tardar unos segundos dependiendo de la cantidad de datos
- Si falla la sincronización inicial, el usuario puede usar pull-to-refresh para reintentarlo
- Los productos se guardan en SQLite local, por lo que persisten entre sesiones
- La sincronización automática se ejecuta en segundo plano cada 5 minutos (configurable)

## Verificación

Después de implementar, verifica en los logs de la app móvil:
```
🔄 Iniciando sincronización inicial...
✅ Sincronización inicial completada
```

Y en el backend (consola de Vercel o local):
```
🔍 [getCurrentUserFromRequest] Autenticando desde app móvil
✅ Usuario autenticado: {...}
```

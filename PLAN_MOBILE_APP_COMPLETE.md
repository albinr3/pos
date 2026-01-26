# 📱 Plan Completo - App Móvil MOVOPos

## 🎯 Resumen Ejecutivo

**Objetivo:** Crear una aplicación móvil completa de MOVOPos usando React Native y Expo, con funcionalidad offline-first y sincronización automática.

### Decisiones del Cliente:
- ✅ **Alcance:** Sistema completo (todas las funcionalidades de la web)
- ✅ **Modo:** Offline completo con sincronización automática
- ✅ **Auth:** Clerk + Biométrico (huella/Face ID)
- ✅ **Nativas:** Cámara, Bluetooth, Notificaciones, GPS
- ✅ **Estructura:** Repositorio separado
- ✅ **Ubicación del repo:** Crear el proyecto móvil en carpeta independiente en `C:\\Users\\Albin Rodriguez\\Documents` (otro repositorio fuera del actual)
- ✅ **UI/Assets:** Mantener apariencia visual idéntica reutilizando las mismas imágenes y gráficos
- ✅ **Variables de entorno:** Usar las mismas keys/variables que la web para poder copiar/pegar el `.env` existente
- ✅ **DB Local:** SQLite + custom sync
- ✅ **Navegación:** Drawer + Bottom Tabs
- ✅ **Prioridad:** Android primero, luego iOS

---

## 📋 FASE 1: Setup Inicial del Proyecto (Semana 1)

### 1.1 Crear Proyecto Base
```bash
# Crear proyecto con Expo
npx create-expo-app movopos-mobile --template

# Configurar TypeScript
npm install --save-dev typescript @types/react @types/react-native

# Estructura básica de carpetas
mkdir -p src/{components,screens,services,store,database,types,utils,hooks,navigation}
```

### 1.2 Configurar Dependencias Core
```bash
# Navegación
npm install @react-navigation/native @react-navigation/drawer @react-navigation/bottom-tabs @react-navigation/stack
npm install react-native-screens react-native-safe-area-context react-native-gesture-handler react-native-reanimated

# Base de datos
npm install expo-sqlite @react-native-async-storage/async-storage

# UI
npm install react-native-paper react-native-vector-icons

# Estado
npm install zustand

# Utilidades
npm install axios date-fns
```

### 1.3 Configurar Variables de Entorno
```bash
# .env
API_URL=https://tu-backend.vercel.app
CLERK_PUBLISHABLE_KEY=pk_test_...
```

> Reutilizar el mismo set de variables y claves que usa la app web para poder copiar/pegar el archivo `.env` actual sin cambios.

### 1.4 Estructura Inicial de Navegación
- Crear AuthNavigator (Login, WhatsApp OTP)
- Crear AppNavigator (Drawer + Bottom Tabs)
- Configurar screens placeholder para cada módulo

**Entregable Semana 1:**
- ✅ Proyecto configurado y corriendo en Android
- ✅ Navegación básica funcionando
- ✅ Estructura de carpetas completa
- ✅ Conexión con backend testeada

---

## 📋 FASE 2: Base de Datos Local y Sincronización (Semana 2-3)

### 2.1 Diseño del Schema SQLite

```sql
-- Tabla principal de sincronización
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'sale', 'product', 'customer', etc.
  entity_local_id TEXT NOT NULL,
  action TEXT NOT NULL,            -- 'create', 'update', 'delete'
  data TEXT NOT NULL,              -- JSON con los datos
  status TEXT DEFAULT 'pending',   -- 'pending', 'syncing', 'synced', 'error'
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  synced_at INTEGER
);

-- Metadatos de sincronización
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);

-- Réplica de tablas principales
CREATE TABLE sales (
  local_id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  invoice_code TEXT NOT NULL,
  customer_id TEXT,
  total_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  synced INTEGER DEFAULT 0,
  data TEXT NOT NULL  -- JSON completo de la venta
);

CREATE TABLE products (
  local_id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  name TEXT NOT NULL,
  sku TEXT,
  price_cents INTEGER NOT NULL,
  stock REAL,
  synced INTEGER DEFAULT 0,
  data TEXT NOT NULL
);

CREATE TABLE customers (
  local_id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  synced INTEGER DEFAULT 0,
  data TEXT NOT NULL
);

CREATE TABLE payments (
  local_id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  receipt_code TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  ar_id TEXT,
  synced INTEGER DEFAULT 0,
  data TEXT NOT NULL
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_sales_synced ON sales(synced);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);
```

### 2.2 Servicio de Base de Datos

**Archivo: `src/database/Database.ts`**
```typescript
import * as SQLite from 'expo-sqlite';

class DatabaseService {
  private db: SQLite.Database;

  async init() {
    this.db = await SQLite.openDatabaseAsync('movopos.db');
    await this.createTables();
  }

  private async createTables() {
    // Ejecutar todas las queries de creación
  }

  // Métodos CRUD genéricos
  async insert(table: string, data: any) { }
  async update(table: string, id: string, data: any) { }
  async delete(table: string, id: string) { }
  async query(sql: string, params?: any[]) { }
}

export const db = new DatabaseService();
```

### 2.3 Sistema de Sincronización

**Archivo: `src/services/sync/SyncService.ts`**
```typescript
class SyncService {
  private isSyncing = false;
  
  // Sincronización completa (al iniciar app)
  async fullSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    
    try {
      // 1. Descargar datos del servidor
      await this.downloadFromServer();
      
      // 2. Subir cambios locales pendientes
      await this.uploadPendingChanges();
      
      // 3. Resolver conflictos
      await this.resolveConflicts();
    } finally {
      this.isSyncing = false;
    }
  }
  
  // Sincronización incremental (cada X minutos)
  async incrementalSync() {
    const lastSync = await getLastSyncTime();
    const changes = await api.getChangesSince(lastSync);
    await this.applyChanges(changes);
  }
  
  // Agregar operación a la cola
  async queueOperation(type: string, action: string, data: any) {
    const localId = generateLocalId();
    
    // Guardar en tabla local
    await db.insert(type, { ...data, local_id: localId });
    
    // Agregar a cola de sincronización
    await db.insert('sync_queue', {
      entity_type: type,
      entity_local_id: localId,
      action,
      data: JSON.stringify(data),
      created_at: Date.now()
    });
    
    // Intentar sincronizar si hay internet
    if (await isOnline()) {
      this.processQueue();
    }
  }
  
  // Procesar cola de sincronización
  private async processQueue() {
    const pending = await db.query(
      'SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at',
      ['pending']
    );
    
    for (const item of pending) {
      try {
        await this.syncItem(item);
      } catch (error) {
        await this.handleSyncError(item, error);
      }
    }
  }
}

export const syncService = new SyncService();
```

**Entregable Semana 2-3:**
- ✅ SQLite configurado con todas las tablas
- ✅ Sistema de cola de sincronización funcionando
- ✅ Sincronización bidireccional implementada
- ✅ Manejo de conflictos básico

---

## 📋 FASE 3: Autenticación (Semana 4)

### 3.1 Integración con Clerk

```bash
npm install @clerk/clerk-expo expo-secure-store
```

**Configuración:**
```typescript
// App.tsx
import { ClerkProvider } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

export default function App() {
  return (
    <ClerkProvider 
      publishableKey={CLERK_KEY}
      tokenCache={tokenCache}
    >
      <Navigation />
    </ClerkProvider>
  );
}
```

### 3.2 WhatsApp OTP Flow

**Screens:**
- `LoginScreen.tsx` - Ingreso de número de teléfono
- `OTPVerificationScreen.tsx` - Ingreso de código OTP
- `BiometricSetupScreen.tsx` - Configuración de huella/Face ID

### 3.3 Autenticación Biométrica

```bash
npm install react-native-biometrics expo-local-authentication
```

```typescript
// src/services/auth/BiometricAuth.ts
import * as LocalAuthentication from 'expo-local-authentication';

export async function setupBiometric() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  
  if (hasHardware && isEnrolled) {
    await SecureStore.setItemAsync('biometric_enabled', 'true');
    return true;
  }
  return false;
}

export async function authenticateWithBiometric(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Autenticarse en MOVOPos',
    fallbackLabel: 'Usar código',
  });
  return result.success;
}
```

**Entregable Semana 4:**
- ✅ Login con Clerk + WhatsApp OTP funcionando
- ✅ Autenticación biométrica configurada
- ✅ Flujo completo de autenticación testeado

---

## 📋 FASE 4: Módulo de Ventas/POS (Semana 5-6)

### 4.1 Pantalla Principal de POS

**Componentes:**
- Buscador de productos (con escaneo de código)
- Carrito de compra en tiempo real
- Selector de cliente
- Selector de método de pago
- Botón de finalizar venta

### 4.2 Funcionalidades Clave

```typescript
// src/screens/sales/POSScreen.tsx
export function POSScreen() {
  const [cart, setCart] = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');
  
  const addToCart = async (productId: string) => {
    // 1. Buscar producto en SQLite local
    const product = await db.query(
      'SELECT * FROM products WHERE local_id = ? OR server_id = ?',
      [productId, productId]
    );
    
    // 2. Agregar al carrito (Zustand)
    cartStore.addItem(product);
    
    // 3. Actualizar stock localmente (optimistic)
    await db.update('products', productId, {
      stock: product.stock - 1
    });
  };
  
  const completeSale = async () => {
    const saleData = {
      items: cart.items,
      customer_id: selectedCustomer,
      payment_method: paymentMethod,
      total_cents: cart.total,
    };
    
    // Guardar venta offline
    await syncService.queueOperation('sale', 'create', saleData);
    
    // Limpiar carrito
    cartStore.clear();
    
    // Navegar a recibo
    navigation.navigate('Receipt', { saleId: localId });
  };
}
```

### 4.3 Integración con Cámara

```bash
npm install expo-camera expo-barcode-scanner
```

```typescript
// src/components/sales/BarcodeScanner.tsx
import { Camera, CameraView } from 'expo-camera';

export function BarcodeScanner({ onScan }) {
  const [permission, requestPermission] = Camera.useCameraPermissions();
  
  const handleBarCodeScanned = ({ data }) => {
    onScan(data);
  };
  
  return (
    <CameraView
      onBarcodeScanned={handleBarCodeScanned}
      barcodeScannerSettings={{
        barcodeTypes: ['qr', 'ean13', 'ean8'],
      }}
    />
  );
}
```

**Entregable Semana 5-6:**
- ✅ POS funcional con búsqueda de productos
- ✅ Carrito de compra con cálculos
- ✅ Escaneo de códigos de barras funcionando
- ✅ Creación de ventas offline
- ✅ Generación de recibos

---

## 📋 FASE 5: Inventario y Productos (Semana 7)

### 5.1 Pantallas

- **ProductListScreen** - Lista de productos con búsqueda
- **ProductDetailScreen** - Ver/Editar producto
- **AddProductScreen** - Agregar nuevo producto
- **BarcodeGeneratorScreen** - Generar código de barras para productos

### 5.2 Funcionalidades

```typescript
// Agregar producto con foto
const addProduct = async (productData) => {
  // Tomar foto si es necesario
  if (needsPhoto) {
    const photo = await takePhoto();
    productData.image_url = await uploadImage(photo);
  }
  
  // Guardar localmente
  await syncService.queueOperation('product', 'create', productData);
};

// Ajuste de inventario
const adjustStock = async (productId, newStock, reason) => {
  await syncService.queueOperation('product', 'update', {
    id: productId,
    stock: newStock,
    adjustment_reason: reason
  });
};
```

**Entregable Semana 7:**
- ✅ CRUD completo de productos
- ✅ Búsqueda y filtros
- ✅ Captura de fotos para productos
- ✅ Ajuste de inventario

---

## 📋 FASE 6: Clientes y Cuentas por Cobrar (Semana 8)

### 6.1 Módulo de Clientes

- Lista de clientes
- Agregar/Editar cliente
- Historial de compras del cliente
- Crédito disponible

### 6.2 Cuentas por Cobrar

```typescript
// src/screens/ar/ARListScreen.tsx
export function ARListScreen() {
  const [arItems, setARItems] = useState([]);
  
  useEffect(() => {
    loadARItems();
  }, []);
  
  const loadARItems = async () => {
    // Cargar desde SQLite
    const items = await db.query(`
      SELECT * FROM ar_items 
      WHERE status IN ('PENDIENTE', 'PARCIAL')
      ORDER BY due_date ASC
    `);
    setARItems(items);
  };
  
  const registerPayment = async (arId, amount) => {
    await syncService.queueOperation('payment', 'create', {
      ar_id: arId,
      amount_cents: amount,
      method: paymentMethod
    });
    
    // Actualizar localmente
    await updateARBalance(arId, amount);
  };
}
```

**Entregable Semana 8:**
- ✅ Gestión de clientes completa
- ✅ Vista de cuentas por cobrar
- ✅ Registro de pagos (abonos)
- ✅ Generación de recibos de pago

---

## 📋 FASE 7: Reportes (Semana 9)

### 7.1 Reportes Implementados

- **Dashboard** - Resumen general (ventas del día, pendientes, inventario bajo)
- **Ventas** - Reporte de ventas por período
- **Cuentas por Cobrar** - Facturas pendientes y vencidas
- **Recibos** - Historial de recibos emitidos
- **Inventario** - Stock actual y movimientos

### 7.2 Exportación

```typescript
// Exportar a CSV
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const exportToCSV = async (data) => {
  const csv = convertToCSV(data);
  const fileUri = FileSystem.documentDirectory + 'reporte.csv';
  
  await FileSystem.writeAsStringAsync(fileUri, csv);
  await Sharing.shareAsync(fileUri);
};

// Exportar a PDF
const exportToPDF = async (data) => {
  import { printToFileAsync } from 'expo-print';
  
  const html = generateReportHTML(data);
  const { uri } = await printToFileAsync({ html });
  await Sharing.shareAsync(uri);
};
```

**Entregable Semana 9:**
- ✅ Dashboard con métricas clave
- ✅ Todos los reportes implementados
- ✅ Exportación CSV y PDF
- ✅ Gráficas básicas

---

## 📋 FASE 8: Impresión Bluetooth (Semana 10)

### 8.1 Configuración

```bash
npm install react-native-ble-plx react-native-thermal-receipt-printer
```

### 8.2 Servicio de Impresión

```typescript
// src/services/bluetooth/PrinterService.ts
import { BleManager } from 'react-native-ble-plx';

class PrinterService {
  private manager = new BleManager();
  private connectedPrinter: Device | null = null;
  
  async scanPrinters(): Promise<Device[]> {
    const devices: Device[] = [];
    
    this.manager.startDeviceScan(null, null, (error, device) => {
      if (device?.name?.includes('Printer')) {
        devices.push(device);
      }
    });
    
    return devices;
  }
  
  async connectToPrinter(deviceId: string) {
    this.connectedPrinter = await this.manager.connectToDevice(deviceId);
    await this.connectedPrinter.discoverAllServicesAndCharacteristics();
  }
  
  async printReceipt(receiptData) {
    const commands = this.generateESCPOSCommands(receiptData);
    await this.sendToPrinter(commands);
  }
  
  private generateESCPOSCommands(data): string {
    // Generar comandos ESC/POS para impresora térmica
    let commands = '';
    commands += '\x1B\x40'; // Initialize
    commands += '\x1B\x61\x01'; // Center align
    commands += data.company.name + '\n';
    // ... resto del recibo
    return commands;
  }
}

export const printerService = new PrinterService();
```

**Entregable Semana 10:**
- ✅ Escaneo de impresoras Bluetooth
- ✅ Conexión y configuración
- ✅ Impresión de facturas
- ✅ Impresión de recibos de pago

---

## 📋 FASE 9: Notificaciones y Funciones Adicionales (Semana 11)

### 9.1 Notificaciones Push

```bash
npm install expo-notifications
```

```typescript
// src/services/notifications/NotificationService.ts
import * as Notifications from 'expo-notifications';

class NotificationService {
  async setupNotifications() {
    const { status } = await Notifications.requestPermissionsAsync();
    const token = await Notifications.getExpoPushTokenAsync();
    
    // Enviar token al backend
    await api.registerPushToken(token.data);
  }
  
  async scheduleLocalNotification(title, body, trigger) {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger
    });
  }
  
  // Notificaciones locales para recordatorios
  async notifyLowStock(product) {
    await this.scheduleLocalNotification(
      'Stock Bajo',
      `${product.name} tiene solo ${product.stock} unidades`,
      null
    );
  }
  
  async notifyOverdueInvoices(count) {
    await this.scheduleLocalNotification(
      'Facturas Vencidas',
      `Tienes ${count} facturas vencidas por cobrar`,
      null
    );
  }
}
```

### 9.2 GPS y Geolocalización

```bash
npm install expo-location
```

```typescript
// Registrar ubicación de ventas
const recordSaleLocation = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  
  if (status === 'granted') {
    const location = await Location.getCurrentPositionAsync({});
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude
    };
  }
  
  return null;
};
```

**Entregable Semana 11:**
- ✅ Notificaciones push configuradas
- ✅ Notificaciones locales para alertas
- ✅ Geolocalización de ventas (opcional)

---

## 📋 FASE 10: Testing y Optimización (Semana 12)

### 10.1 Testing

```bash
npm install --save-dev jest @testing-library/react-native
```

**Tests a implementar:**
- Unit tests para servicios críticos (sync, database, auth)
- Integration tests para flujos principales (crear venta, registrar pago)
- E2E tests con Detox

### 10.2 Optimización

- **Performance:**
  - Lazy loading de screens
  - Memoización de componentes pesados
  - Optimización de queries SQLite
  - Image caching

- **Tamaño del bundle:**
  - Code splitting
  - Eliminar dependencias no usadas
  - Optimizar assets

- **UX:**
  - Loading states
  - Error boundaries
  - Offline indicators
  - Skeleton screens

**Entregable Semana 12:**
- ✅ Test coverage > 70%
- ✅ Performance optimizado
- ✅ Bundle size optimizado
- ✅ UX pulida

---

## 📋 FASE 11: Build y Deployment Android (Semana 13)

### 11.1 Configuración de Build

```bash
# Configurar EAS Build
npm install -g eas-cli
eas build:configure
```

**eas.json:**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "gradleCommand": ":app:assembleDebug"
      }
    },
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

### 11.2 Preparar para Google Play

1. Crear cuenta de desarrollador en Google Play Console
2. Configurar app.json con información completa
3. Generar iconos y splash screens
4. Crear screenshots de la app
5. Escribir descripción y textos de la tienda

### 11.3 Build de Producción

```bash
# Build para Google Play
eas build --platform android --profile production

# Subir a Play Store (Internal Testing primero)
eas submit --platform android
```

**Entregable Semana 13:**
- ✅ APK/AAB de producción generado
- ✅ App subida a Google Play (Internal Testing)
- ✅ Documentación de deployment

---

## 📋 FASE 12: iOS (Semana 14-15)

### 12.1 Ajustes Específicos de iOS

- Configurar permisos en Info.plist
- Ajustar estilos para iOS (SafeAreaView, etc.)
- Probar funcionalidades nativas en iOS
- Ajustar impresión Bluetooth para iOS

### 12.2 Build y Deploy iOS

```bash
# Build para App Store
eas build --platform ios --profile production

# Subir a App Store Connect
eas submit --platform ios
```

**Entregable Semana 14-15:**
- ✅ App funcionando en iOS
- ✅ Build subido a TestFlight
- ✅ Lista para review de App Store

---

## 📊 Estimación de Tiempo Total

| Fase | Duración | Descripción |
|------|----------|-------------|
| 1 | 1 semana | Setup inicial |
| 2-3 | 2 semanas | Database + Sync |
| 4 | 1 semana | Autenticación |
| 5-6 | 2 semanas | POS/Ventas |
| 7 | 1 semana | Inventario |
| 8 | 1 semana | Clientes + AR |
| 9 | 1 semana | Reportes |
| 10 | 1 semana | Bluetooth |
| 11 | 1 semana | Notificaciones |
| 12 | 1 semana | Testing |
| 13 | 1 semana | Deploy Android |
| 14-15 | 2 semanas | iOS |
| **TOTAL** | **15 semanas** | **~3.5 meses** |

---

## 🎯 Entregables Clave

### ✅ MVP (Semana 8)
- Auth + POS + Inventario + Clientes + Sincronización básica

### ✅ Versión Beta (Semana 12)
- Todas las funcionalidades + Testing

### ✅ Producción Android (Semana 13)
- App en Google Play

### ✅ Producción iOS (Semana 15)
- App en App Store

---

## 🚀 Próximos Pasos Inmediatos

1. **Crear repositorio nuevo** para la app móvil
   - Ubicación: `C:\\Users\\Albin Rodriguez\\Documents` (fuera del repositorio presente)
2. **Inicializar proyecto** con Expo
3. **Configurar ambiente** de desarrollo
4. **Definir API contracts** con el backend
5. **Comenzar Fase 1** - Setup inicial

---

## 📝 Notas Importantes

### Consideraciones de Sincronización

**Conflictos:**
- "Last write wins" para la mayoría de operaciones
- Timestamp del servidor es la fuente de verdad
- Versionado de registros para detectar conflictos

**Optimizaciones:**
- Sincronizar solo cambios incrementales
- Batch operations para reducir requests
- Comprimir payloads grandes

### Seguridad

- Token de Clerk en SecureStore
- Encriptar SQLite database
- No almacenar datos sensibles en texto plano
- HTTPS obligatorio para todas las comunicaciones

### Performance

- Virtual lists para listas largas
- Lazy loading de imágenes
- Pagination en resultados
- Cache inteligente de datos frecuentes

---

¿Quieres que profundice en alguna fase específica o que ajuste algo del plan?
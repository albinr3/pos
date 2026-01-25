# 🚀 Recomendaciones de Mejoras para MOVOPos

**Fecha de análisis:** 24 de enero de 2026  
**Versión analizada:** 0.1.0

Este documento contiene recomendaciones de mejoras, funcionalidades faltantes y optimizaciones para el sistema MOVOPos basado en un análisis exhaustivo del código y la arquitectura actual.

---

## 📊 Resumen del Estado Actual

### ✅ Lo que está bien implementado:
- Sistema multi-tenant robusto con aislamiento por `accountId`
- Sistema de billing completo con trial, gracia, y bloqueo
- Modo offline con IndexedDB y sincronización
- OCR de facturas con OpenAI Vision
- Sistema de permisos granular
- Super Admin Dashboard funcional
- Reportes básicos (ventas, cobros, ganancia, inventario)
- Impresión de tickets térmicos y facturas

### ⚠️ Áreas que necesitan atención:
- Testing automatizado inexistente
- Documentación de API faltante
- Algunas páginas del Super Admin son placeholders
- Falta internacionalización (solo español)

---

## 🔴 CRÍTICO - Implementar Ahora

### 1. Testing Automatizado
**Prioridad:** 🔴 ALTA  
**Esfuerzo:** ~2-3 semanas

El proyecto no tiene tests automatizados. Esto es crítico para un sistema de facturación.

```
Recomendaciones:
├── Configurar Vitest o Jest para unit tests
├── Agregar tests para:
│   ├── Cálculos de ITBIS y totales
│   ├── Lógica de billing (estados, transiciones)
│   ├── Cálculos de CxC y balances
│   └── Secuencias de facturas
├── Configurar Playwright para E2E tests
│   ├── Flujo de venta completo
│   ├── Flujo de pago de billing
│   └── Login y selección de usuario
└── Agregar pre-commit hooks con Husky
```

### 2. Validación y Sanitización de Datos
**Prioridad:** 🔴 ALTA  
**Esfuerzo:** ~1 semana

Aunque existe `src/lib/sanitize.ts`, se debería implementar Zod schemas en todas las server actions.

```typescript
// Ejemplo de lo que debería existir en cada action
import { z } from 'zod'

const createSaleSchema = z.object({
  customerId: z.string().cuid().optional(),
  items: z.array(z.object({
    productId: z.string().cuid(),
    qty: z.number().positive(),
    unitPriceCents: z.number().int().positive(),
  })).min(1),
  type: z.enum(['CONTADO', 'CREDITO']),
  // ...
})
```

### 3. Rate Limiting en APIs Críticas
**Prioridad:** 🔴 ALTA  
**Esfuerzo:** ~3 días

Existe `src/lib/rate-limit.ts` pero verificar que está aplicado en:
- Login de subusuarios (OK): `src/app/select-user/actions.ts`
- Verificación de OTP (OK): `src/app/api/auth/whatsapp/verify-otp/route.ts`
- Subida de comprobantes de pago (OK): `src/app/(app)/billing/actions.ts` (`submitPaymentProof`)
- Webhooks de Lemon Squeezy (OK): `src/app/api/webhooks/lemon/route.ts`
- API de backups (OK): `src/app/api/backups/download/route.ts`, `src/app/api/cron/backup/route.ts`, `src/app/(app)/backups/actions.ts`

### 4. ✅ Manejo de Errores Centralizado - IMPLEMENTADO
**Prioridad:** 🔴 ALTA  
**Estado:** ✅ Completado

Se implementó un sistema de monitoreo de errores gratuito con las siguientes características:

```
Implementado:
├── ✅ Modelo ErrorLog en base de datos (PostgreSQL)
├── ✅ Helper logError() para registrar errores
├── ✅ Página /super-admin/errors para visualizar errores
├── ✅ Filtros por severidad, estado, fecha y búsqueda
├── ✅ Resolución individual y masiva de errores
├── ✅ Estadísticas en tiempo real (críticos, altos, últimas 24h, etc.)
├── ✅ Integrado en billing, webhooks y puntos críticos
└── ✅ Sanitización automática de datos sensibles
```

Archivos creados:
- `src/lib/error-logger.ts` - Helper y códigos de error
- `src/app/super-admin/(dashboard)/errors/` - Página del Super Admin
- `prisma/migrations/20260124230000_add_error_log/` - Migración

---

## 🟠 IMPORTANTE - Implementar Pronto

### 5. Completar Super Admin Dashboard
**Prioridad:** 🟠 MEDIA-ALTA  
**Esfuerzo:** ~2 semanas

Según `super-admin-dashboard-features.md`, faltan:

```
Pendiente:
├── /super-admin/reports - Actualmente placeholder
│   ├── Reportes financieros (MRR, ARR, churn)
│   ├── Reportes de uso del sistema
│   └── Exportación a Excel/PDF
├── /super-admin/settings - Actualmente placeholder
│   ├── Configuración de precios
│   ├── Configuración de emails
│   ├── Gestión de otros super admins
│   └── Variables del sistema
├── Sistema de alertas automáticas
│   ├── Comprobantes pendientes por más de X horas
│   ├── Cuentas de alto valor entrando en gracia
│   └── Churn rate aumentando
└── Métricas avanzadas
    ├── Gráficos de tendencias
    ├── Cohort analysis
    └── Customer Lifetime Value
```

### 6. Sistema de Notificaciones In-App
**Prioridad:** 🟠 MEDIA-ALTA  
**Esfuerzo:** ~1 semana

Actualmente solo hay notificaciones por email. Agregar:

```
Implementar:
├── Centro de notificaciones en la app
├── Badge con contador de no leídas
├── Tipos de notificaciones:
│   ├── Billing (trial, vencimiento, etc.)
│   ├── Stock bajo
│   ├── Nuevos pagos de clientes
│   └── Actualizaciones del sistema
└── Persistencia en base de datos (modelo Notification)
```

### 7. Mejorar Dashboard con Más Métricas
**Prioridad:** 🟠 MEDIA  
**Esfuerzo:** ~1 semana

El dashboard actual es básico. Agregar:

```
Nuevas métricas:
├── Productos más vendidos (top 10)
├── Clientes con más compras
├── Gráfico de ventas por hora del día
├── Comparación con período anterior
├── Margen de ganancia del día
├── Predicción de ventas (ML simple)
└── Widget de facturas pendientes de cobro próximas a vencer
```

### 8. Sistema de Notificaciones por WhatsApp
**Prioridad:** 🟠 MEDIA  
**Esfuerzo:** ~1-2 semanas

Ya existe infraestructura para WhatsApp (`src/lib/whatsapp.ts`). Expandir para:

```
Casos de uso:
├── Recordatorios de pago a clientes (CxC)
├── Confirmación de venta al cliente
├── Notificación de producto listo para recoger
├── Alertas de billing al dueño del negocio
└── Cotizaciones enviadas por WhatsApp
```

---

## 🟡 MEJORAS - Planificar para el Futuro

### 9. API REST/GraphQL Pública
**Prioridad:** 🟡 MEDIA  
**Esfuerzo:** ~3-4 semanas

Para integraciones con otros sistemas:

```
Estructura sugerida:
├── /api/v1/products - CRUD de productos
├── /api/v1/sales - Consulta de ventas
├── /api/v1/inventory - Consulta de stock
├── /api/v1/customers - CRUD de clientes
├── /api/v1/reports - Reportes programáticos
└── Autenticación con API Keys por cuenta
```

### 10. Integración con Facturación Electrónica (e-CF)
**Prioridad:** 🟡 MEDIA  
**Esfuerzo:** ~4-6 semanas

Para República Dominicana, eventualmente será obligatorio:

```
Implementar:
├── Integración con DGII
├── Generación de NCF (Número de Comprobante Fiscal)
├── Tipos de comprobante (01, 02, 14, 15, etc.)
├── Envío electrónico a DGII
├── Almacenamiento de XML firmados
└── Reportes 606, 607, 608
```

### 11. App Móvil o PWA Mejorada
**Prioridad:** 🟡 MEDIA  
**Esfuerzo:** ~6-8 semanas

El sistema tiene manifest.webmanifest pero podría mejorarse:

```
Mejoras:
├── Push notifications nativas
├── Escaneo de código de barras con cámara
├── Modo kiosko para tablets
├── Sincronización en background
├── Acceso rápido desde pantalla de inicio
└── Considerar React Native para app nativa
```

### 12. Sistema de Descuentos y Promociones
**Prioridad:** 🟡 MEDIA  
**Esfuerzo:** ~2 semanas

```
Funcionalidades:
├── Descuentos por porcentaje o monto fijo
├── Descuentos por producto o categoría
├── Descuentos por cliente VIP
├── Promociones por fecha (Black Friday, etc.)
├── Cupones con código
├── Descuentos por volumen (compra 3, paga 2)
└── Happy hour (descuento por hora)
```

### 13. Módulo de Fidelización de Clientes
**Prioridad:** 🟡 MEDIA  
**Esfuerzo:** ~2-3 semanas

```
Implementar:
├── Sistema de puntos por compra
├── Niveles de cliente (Bronce, Plata, Oro)
├── Recompensas canjeables
├── Historial de puntos
├── Cumpleaños del cliente (descuento especial)
└── Referidos (cliente trae cliente)
```

### 14. Módulo de Empleados y Nómina Básica
**Prioridad:** 🟡 BAJA-MEDIA  
**Esfuerzo:** ~3 semanas

```
Funcionalidades:
├── Registro de empleados
├── Control de asistencia
├── Comisiones por venta
├── Adelantos de salario
├── Reporte de productividad por vendedor
└── Integración con gastos operativos
```

### 15. Multi-Sucursal
**Prioridad:** 🟡 BAJA-MEDIA  
**Esfuerzo:** ~4-6 semanas

Para negocios con múltiples ubicaciones:

```
Implementar:
├── Modelo Branch (sucursal) bajo Account
├── Stock por sucursal
├── Transferencias entre sucursales
├── Reportes consolidados y por sucursal
├── Usuarios asignados a sucursales
└── Configuración de precios por sucursal
```

---

## 🟢 NICE TO HAVE - Considerar a Largo Plazo

### 16. Integración con Plataformas de Delivery
**Esfuerzo:** ~3-4 semanas

```
Integraciones:
├── PedidosYa
├── Uber Eats
├── Rappi
└── API genérica para otros
```

### 17. Integración Contable
**Esfuerzo:** ~3-4 semanas

```
Exportaciones:
├── QuickBooks
├── Xero
├── Excel con formato contable estándar
└── Integración con sistemas locales (si existen)
```

### 18. Business Intelligence Dashboard
**Esfuerzo:** ~4-6 semanas

```
Funcionalidades:
├── Análisis predictivo de ventas
├── Detección de anomalías
├── Segmentación de clientes (RFM)
├── Análisis de canasta de compras
├── Recomendaciones automáticas de restock
└── Dashboards personalizables
```

### 19. Chat de Soporte Integrado
**Esfuerzo:** ~1-2 semanas

```
Opciones:
├── Integración con Intercom/Crisp/Tawk.to
├── Chat con IA (Claude/GPT) para preguntas frecuentes
├── Sistema de tickets interno
└── Base de conocimientos
```

### 20. Temas y Personalización Visual
**Esfuerzo:** ~1 semana

```
Permitir:
├── Colores personalizados por negocio
├── Logo en recibos e interfaz
├── Plantillas de tickets personalizables
├── Mensajes personalizados en recibos
└── Firma digital en documentos
```

---

## 🔧 Mejoras Técnicas

### 21. Optimización de Performance
```
Tareas:
├── Implementar React Server Components donde sea posible
├── Lazy loading de componentes pesados
├── Optimizar queries de Prisma (incluir solo campos necesarios)
├── Implementar paginación cursor-based para listas grandes
├── Agregar índices faltantes en PostgreSQL
├── Implementar caché con Redis para datos frecuentes
└── Optimizar imágenes con next/image
```

### 22. Seguridad
```
Implementar:
├── 2FA para cuentas principales
├── Auditoría de acceso más detallada
├── Rotación automática de JWT secrets
├── Headers de seguridad (CSP, HSTS, etc.)
├── Escaneo de dependencias vulnerables (Snyk/Dependabot)
└── Penetration testing periódico
```

### 23. DevOps y CI/CD
```
Configurar:
├── GitHub Actions para CI/CD
├── Tests automáticos en PRs
├── Deploy preview en Vercel
├── Staging environment
├── Database migrations automáticas
├── Backup automático de base de datos
└── Monitoring con Datadog/New Relic
```

### 24. Documentación
```
Crear:
├── README.md actualizado con arquitectura
├── Documentación de API (si se crea)
├── Guía de contribución
├── Changelog automatizado
├── Documentación de modelos de datos
└── Onboarding para nuevos desarrolladores
```

---

## 📋 Priorización Sugerida (Próximos 3-6 meses)

### Mes 1-2: Estabilidad y Calidad
1. ✅ Configurar testing (Vitest + Playwright)
2. ✅ Implementar Zod schemas en server actions
3. ✅ Agregar Sentry para monitoreo de errores
4. ✅ Completar rate limiting

### Mes 2-3: Super Admin y Métricas
5. ✅ Completar reportes de Super Admin
6. ✅ Implementar configuración del sistema
7. ✅ Mejorar dashboard con más métricas
8. ✅ Sistema de notificaciones in-app

### Mes 3-4: Funcionalidades de Valor
9. ✅ Sistema de descuentos y promociones
10. ✅ Notificaciones por WhatsApp
11. ✅ Mejoras en modo offline

### Mes 4-6: Expansión
12. ✅ API pública básica
13. ✅ Preparación para facturación electrónica
14. ✅ Sistema de fidelización

---

## 💡 Ideas Adicionales

### Para Aumentar Retención
- **Gamificación**: Badges y logros para usuarios
- **Benchmarking**: Comparar métricas con negocios similares
- **Consejos automáticos**: "Tu producto X se vende mejor los viernes"

### Para Reducir Churn
- **Onboarding guiado**: Tutorial interactivo al inicio
- **Check-ins automáticos**: Email a cuentas inactivas
- **Encuestas de satisfacción**: NPS automático

### Para Monetización
- **Plan Premium**: Con IA, más usuarios, multi-sucursal
- **Plan Enterprise**: Facturación electrónica, soporte prioritario
- **Add-ons**: Integraciones específicas como pago adicional

---

## 📞 Contacto y Seguimiento

Para discutir prioridades o implementación de cualquiera de estas recomendaciones, revisar este documento periódicamente y ajustar según las necesidades del negocio y feedback de usuarios.

---

## ✅ Funcionalidades Implementadas Recientemente

### Sistema de Precios Personalizados por Cuenta
**Implementado:** 25 de enero de 2026

Se implementó un sistema completo para asignar diferentes planes de precios a cuentas desde el Super Admin:

```
Funcionalidades:
├── ✅ Modelo BillingPlan (planes de precios)
├── ✅ CRUD de planes en /super-admin/plans
├── ✅ Asignación de planes a cuentas individuales
├── ✅ Soporte para múltiples variant IDs de Lemon Squeezy
├── ✅ Precios personalizados USD y DOP por plan
├── ✅ Plan por defecto para nuevas cuentas
├── ✅ Auditoría de cambios de plan
└── ✅ El usuario ve el precio de su plan en /billing
```

Archivos creados/modificados:
- `prisma/schema.prisma` - Modelo BillingPlan
- `prisma/migrations/20260125000000_add_billing_plans/` - Migración
- `src/app/super-admin/(dashboard)/plans/` - Página de gestión de planes
- `src/app/super-admin/(dashboard)/accounts/[id]/` - Selector de plan en detalle de cuenta
- `src/lib/billing.ts` - `getLemonCheckoutUrl()` y `createBillingSubscription()` actualizados

---

**Última actualización:** 25 de enero de 2026

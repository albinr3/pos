# 🚀 Super Admin Dashboard - Especificación Completa

## 📊 Dashboard Principal

### Métricas Clave (KPIs)
- **MRR (Monthly Recurring Revenue)**: Ingresos mensuales recurrentes
  - Total en USD y DOP
  - Tendencia vs. mes anterior
  - Gráfico de últimos 12 meses
  
- **ARR (Annual Recurring Revenue)**: Proyección anual

- **Cuentas Totales**: 
  - Total de cuentas registradas
  - Cuentas activas (ACTIVE)
  - Cuentas en trial (TRIALING)
  - Cuentas en gracia (GRACE)
  - Cuentas bloqueadas (BLOCKED)
  - Cuentas canceladas (CANCELED)

- **Tasa de Conversión**:
  - Trial → Pago
  - Gracia → Pago
  
- **Churn Rate**: Porcentaje de cancelaciones mensual

- **Customer Lifetime Value (CLV)**: Valor promedio del cliente

### Gráficos en Tiempo Real
- Línea de tiempo de nuevos registros (últimos 30 días)
- Distribución de estados de suscripción (pie chart)
- Métodos de pago preferidos (MANUAL vs LEMON)
- Moneda preferida (DOP vs USD)
- Ingresos por día/semana/mes

---

## 👥 Gestión de Cuentas (Accounts)

### Listado de Cuentas
**Filtros:**
- Por estado de suscripción (TRIALING, ACTIVE, GRACE, BLOCKED, CANCELED)
- Por método de pago (MANUAL, LEMON)
- Por moneda (DOP, USD)
- Por fecha de registro
- Por trial terminando pronto (próximos 7 días)
- Por gracia terminando pronto
- Búsqueda por nombre, email, clerkUserId

**Columnas:**
- Nombre del negocio
- Email del dueño (del BillingProfile)
- Estado de suscripción (badge con color)
- Método de pago
- Moneda
- Fecha de registro
- Trial expira en / Período termina en
- Último pago
- MRR individual
- Acciones rápidas

**Acciones en Masa:**
- Enviar email a seleccionados
- Cambiar estado de múltiples cuentas
- Exportar lista a CSV

### Vista Detallada de Cuenta

**Información General:**
- Nombre del negocio
- clerkUserId
- Fecha de creación
- Estado actual con historial de cambios

**Datos de Suscripción:**
- Estado actual (TRIALING/ACTIVE/GRACE/BLOCKED/CANCELED)
- Método de pago (MANUAL/LEMON)
- Moneda (DOP/USD)
- Precio mensual
- Período actual (inicio y fin)
- Trial (inicio y fin)
- Gracia (fecha de fin)
- IDs de Lemon Squeezy (si aplica)

**Perfil de Facturación:**
- Nombre legal / Razón social
- Cédula / RNC
- Dirección fiscal
- Email
- Teléfono

**Configuración del Negocio (CompanySettings):**
- Nombre
- Teléfono
- Dirección
- Logo
- Configuraciones (ITBIS, stock negativo, etc.)

**Usuarios del Negocio:**
- Lista de usuarios (User)
- Roles
- Permisos
- Último login

**Historial de Pagos:**
- Tabla con todos los BillingPayment
- Estado (PENDING/PAID/FAILED/REJECTED)
- Monto
- Fecha
- Comprobantes subidos
- Acciones (aprobar/rechazar comprobantes)

**Actividad Reciente:**
- Últimos AuditLog relacionados con billing
- Notificaciones enviadas

**Uso del Sistema:**
- Total de ventas (Sale)
- Total de productos (Product)
- Total de clientes (Customer)
- Tendencias de uso

**Acciones del Admin:**
- ✅ Activar/Desactivar cuenta
- 🔄 Cambiar estado de suscripción manualmente
- 💰 Aplicar crédito/extensión de trial
- 📧 Enviar email personalizado
- 🗑️ Eliminar cuenta (con confirmación)
- 🔒 Bloquear por falta de pago
- ⏰ Extender período de gracia
- 💵 Aprobar/Rechazar comprobante de pago
- 📄 Ver/Descargar comprobantes
- 🎟️ Generar recibo manual

---

## 💳 Gestión de Pagos

### Pagos Pendientes de Verificación
**Lista de transferencias PENDING:**
- Account (nombre del negocio)
- Monto
- Moneda
- Banco seleccionado
- Referencia
- Fecha de pago declarada
- Comprobantes subidos (vista previa de imágenes)
- Tiempo esperando (hace cuánto se subió)

**Acciones:**
- ✅ Aprobar pago → Cambiar a PAID + actualizar suscripción a ACTIVE
- ❌ Rechazar pago → Cambiar a REJECTED + enviar notificación
- 📷 Ver comprobantes en tamaño completo
- 💬 Agregar nota interna
- 📧 Solicitar más información al cliente

### Historial de Pagos
**Filtros:**
- Por estado (PENDING/PAID/FAILED/REJECTED)
- Por método (MANUAL/LEMON)
- Por moneda (DOP/USD)
- Por rango de fechas
- Por cuenta específica

**Exportación:**
- Exportar a Excel con todos los detalles
- Reporte de ingresos mensual

### Dashboard de Ingresos
- Total cobrado este mes (DOP y USD)
- Pendiente de verificar
- Rechazados
- Proyección del mes
- Comparación con meses anteriores

---

## 🏦 Gestión de Cuentas Bancarias

### Listado de Cuentas Bancarias (BankAccount)
**Información mostrada:**
- Logo del banco
- Nombre del banco
- Tipo de cuenta
- Número de cuenta
- Titular
- Moneda
- Instrucciones
- Estado (activa/inactiva)
- Orden de visualización
- Número de pagos recibidos

**Acciones:**
- ➕ Agregar nueva cuenta bancaria
- ✏️ Editar información
- 🗑️ Eliminar
- 👁️ Activar/Desactivar
- ↕️ Reordenar (drag & drop)
- 📊 Ver estadísticas de uso

**Estadísticas por Banco:**
- Total de pagos recibidos
- Monto total
- Banco más usado

---

## 📧 Notificaciones y Comunicación

### Sistema de Notificaciones Automáticas
**Ya implementadas en el sistema (verificar configuración):**
- Trial terminando (7 días antes)
- Trial terminando (3 días antes)
- Trial terminado
- Pago vencido (3 días de gracia)
- Pago vencido (1 día de gracia)
- Cuenta bloqueada
- Pago aprobado
- Pago rechazado

**Panel de Control:**
- Ver historial de notificaciones enviadas (BillingNotification)
- Reenviar notificación
- Previsualizar templates de email
- Editar templates (si están en código, esto sería futuro)
- Estadísticas de apertura (si integras con servicio como SendGrid)

### Comunicación Manual
- Enviar email a una cuenta específica
- Enviar email masivo (con filtros)
- Templates predefinidos:
  - Recordatorio de pago
  - Oferta especial
  - Actualización del sistema
  - Solicitud de feedback
  - Bienvenida personalizada

---

## 📊 Reportes y Analytics

### Reportes Financieros
- **Reporte de Ingresos Mensual**
  - Desglose por moneda
  - Desglose por método de pago
  - Comparación mes a mes
  
- **Reporte de Conversiones**
  - Trial → Pago
  - Gracia → Pago
  - Tasa de éxito por método de pago

- **Reporte de Churn**
  - Cuentas canceladas por mes
  - Razones de cancelación (si se captura)
  - Tiempo promedio de vida del cliente

### Reportes de Uso
- **Actividad del Sistema**
  - Cuentas más activas (por volumen de ventas)
  - Cuentas inactivas (sin ventas en X días)
  - Funcionalidades más usadas
  
- **Estadísticas de Usuarios**
  - Número promedio de usuarios por cuenta
  - Roles más comunes
  - Permisos más otorgados

### Reportes de Soporte
- **Comprobantes Pendientes**
  - Tiempo promedio de aprobación
  - Tasa de rechazo
  - Backlog actual

- **Problemas Comunes**
  - Cuentas con múltiples pagos rechazados
  - Cuentas que entran y salen de gracia frecuentemente

---

## 🔔 Alertas y Monitoreo

### Alertas Automáticas para el Admin
- 🚨 **Urgente**: Más de X comprobantes esperando aprobación
- ⚠️ **Importante**: Cuenta de alto valor entrando en gracia
- 📉 **Atención**: Churn rate aumentando
- 💰 **Crítico**: MRR cayendo X% vs. mes anterior
- 🆕 **Info**: Nueva cuenta registrada
- ❌ **Problema**: Múltiples pagos rechazados de la misma cuenta

### Dashboard de Salud del Sistema
- Número de cuentas con problemas de pago
- Cuentas en riesgo de cancelar (en gracia por 2+ veces)
- Tendencias negativas
- Alertas de sistema (errores en logs críticos)

---

## 🛠️ Configuración del Sistema

### Configuración de Precios
- Precio mensual en USD (actualmente $20.00)
- Precio mensual en DOP (actualmente RD$1,300)
- Días de trial (actualmente 14)
- Días de gracia (actualmente 3)
- Configurar descuentos o promociones (futuro)

### Configuración de Billing
- Habilitar/deshabilitar método MANUAL
- Habilitar/deshabilitar método LEMON
- Configurar API keys de Lemon Squeezy
- Configurar UploadThing para comprobantes

### Configuración de Emails
- SMTP settings
- Templates de email (si están en DB)
- Remitente por defecto
- CC/BCC para emails importantes

### Logs y Auditoría
- Ver AuditLog del sistema (eventos de billing)
- Filtrar por tipo de acción
- Exportar logs
- Ver errores de sistema

---

## 👤 Gestión de Roles del Super Admin

### Roles de Super Admin (nuevo enum SuperAdminRole)
- **OWNER**: Acceso total (tú)
- **ADMIN**: Puede gestionar cuentas y pagos
- **FINANCE**: Solo puede ver y aprobar pagos
- **SUPPORT**: Solo puede ver información, no modificar

### Permisos Granulares
- Ver dashboard
- Gestionar cuentas
- Aprobar/rechazar pagos
- Modificar precios
- Enviar comunicaciones masivas
- Acceder a reportes financieros
- Eliminar cuentas
- Ver logs de auditoría

---

## 🎯 Features Avanzadas (Futuro)

### Gamificación y Incentivos
- Dashboard de "mejores clientes"
- Programa de referidos
- Descuentos por pago anual
- Créditos por recomendaciones

### Integraciones
- Integración con contabilidad (QuickBooks, Xero)
- Webhook events para terceros
- API pública para partners

### Soporte al Cliente
- Chat interno con cuentas
- Sistema de tickets integrado
- Base de conocimiento

### Seguridad
- 2FA para super admin
- IP whitelist para acceso al panel
- Logs de acceso al super admin dashboard
- Alertas de accesos sospechosos

---

## 🗂️ Estructura de Rutas Sugerida

```
/super-admin
├── /dashboard                    # KPIs y gráficos principales
├── /accounts                     # Listado de cuentas
│   ├── /[id]                    # Detalle de cuenta
│   └── /new                     # Crear cuenta manualmente (raro)
├── /payments                     # Gestión de pagos
│   ├── /pending                 # Comprobantes pendientes
│   ├── /history                 # Historial completo
│   └── /[id]                    # Detalle de pago
├── /banks                        # Gestión de cuentas bancarias
│   ├── /list                    # Listado
│   └── /new                     # Agregar nueva
├── /notifications                # Centro de notificaciones
│   ├── /history                 # Historial enviado
│   └── /send                    # Enviar manualmente
├── /reports                      # Reportes y analytics
│   ├── /financial               # Reportes financieros
│   ├── /usage                   # Reportes de uso
│   └── /export                  # Exportaciones
├── /alerts                       # Centro de alertas
├── /settings                     # Configuración del sistema
│   ├── /pricing                 # Precios y planes
│   ├── /billing                 # Config de billing
│   ├── /emails                  # Config de emails
│   └── /admins                  # Gestión de super admins
└── /logs                         # Auditoría y logs
```

---

## 📱 UI/UX Recomendaciones

### Dashboard Principal
- **Diseño limpio y profesional** (inspirado en Stripe Dashboard)
- **Gráficos interactivos** con Chart.js o Recharts
- **Código de colores**:
  - 🟢 Verde: ACTIVE, PAID
  - 🟡 Amarillo: TRIALING, GRACE, PENDING
  - 🔴 Rojo: BLOCKED, REJECTED, FAILED
  - ⚫ Gris: CANCELED

### Tablas
- Paginación
- Ordenamiento por columnas
- Búsqueda en tiempo real
- Acciones rápidas (dropdown)
- Exportar a CSV/Excel

### Formularios
- Validación en tiempo real
- Campos inteligentes (auto-completar)
- Preview antes de guardar
- Confirmaciones para acciones destructivas

### Notificaciones Toast
- Éxito al aprobar pago
- Error al rechazar
- Alertas importantes

---

## 🔐 Seguridad Recomendada

1. **Autenticación separada** para super admin (no usar Clerk de los clientes)
2. **Middleware de verificación** en todas las rutas /super-admin
3. **Rate limiting** agresivo
4. **Logs de auditoría** para cada acción del super admin
5. **2FA obligatorio** para super admins
6. **IP whitelist** (opcional pero recomendado)
7. **Session timeout** corto (15 minutos de inactividad)

---

## 📦 Tech Stack Sugerido

**Frontend:**
- shadcn/ui para componentes
- Recharts para gráficos
- TanStack Table para tablas avanzadas
- React Hook Form + Zod para formularios
- Sonner para notificaciones

**Backend:**
- tRPC para API type-safe
- Prisma para queries complejas
- Zod para validación
- Resend o SendGrid para emails

**Utilities:**
- date-fns para fechas
- numeral.js para formateo de moneda
- xlsx para exportar Excel

---

## 🚀 Fases de Implementación

### Fase 1 - MVP (Esencial)
✅ Dashboard con KPIs básicos
✅ Listado de cuentas con filtros
✅ Vista detallada de cuenta
✅ Aprobar/rechazar comprobantes de pago
✅ Gestión de cuentas bancarias
✅ Cambiar estado de suscripción manualmente

### Fase 2 - Operacional
- Reportes financieros básicos
- Comunicación por email (templates)
- Alertas automáticas
- Logs de auditoría del super admin
- Exportación de datos

### Fase 3 - Avanzado
- Analytics completos
- Gráficos avanzados
- Sistema de tickets/soporte
- Roles de super admin
- API webhooks

### Fase 4 - Optimización
- Machine learning para detectar fraude
- Predicción de churn
- Recomendaciones automáticas
- A/B testing de precios

---

## 💡 Ideas Adicionales

### Prevención de Fraude
- Detectar múltiples cuentas del mismo usuario (por IP, email similar, etc.)
- Comprobantes duplicados
- Patrones sospechosos de uso

### Customer Success
- Identificar cuentas "power users" para casos de estudio
- Contactar cuentas inactivas para re-engagement
- Ofrecer onboarding personalizado a cuentas grandes

### Optimización de Conversión
- A/B testing de duración de trial
- Emails de re-engagement automáticos
- Ofertas especiales para cuentas en GRACE

### Métricas de Producto
- Features más usadas
- Features nunca usadas (candidatos a deprecar)
- Tiempo promedio en la app
- Tasa de adopción de nuevas features

---

## 📝 Notas de Implementación

### Base de Datos
Tu esquema actual ya está muy bien estructurado. Posibles adiciones:

```prisma
// Super Admin User
model SuperAdmin {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  role      SuperAdminRole
  createdAt DateTime @default(now())
  lastLoginAt DateTime?
  
  // Permisos granulares
  canManageAccounts Boolean @default(false)
  canApprovePayments Boolean @default(false)
  canModifyPricing Boolean @default(false)
  canSendEmails Boolean @default(false)
  canDeleteAccounts Boolean @default(false)
  canViewFinancials Boolean @default(true)
  
  auditLogs SuperAdminAuditLog[]
}

enum SuperAdminRole {
  OWNER
  ADMIN
  FINANCE
  SUPPORT
}

// Logs de auditoría del super admin
model SuperAdminAuditLog {
  id String @id @default(cuid())
  createdAt DateTime @default(now())
  
  superAdminId String
  superAdmin SuperAdmin @relation(fields: [superAdminId], references: [id])
  
  action String // approved_payment, blocked_account, etc.
  targetAccountId String?
  targetPaymentId String?
  
  metadata Json? // Datos adicionales
  ipAddress String?
}

// Promociones/Descuentos (futuro)
model Promotion {
  id String @id @default(cuid())
  code String @unique
  discountPercent Int
  durationMonths Int
  validUntil DateTime?
  maxUses Int?
  currentUses Int @default(0)
  isActive Boolean @default(true)
}
```

---

¿Necesitas que profundice en alguna sección específica o que te ayude a implementar alguna parte?

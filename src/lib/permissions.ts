export const PERMISSION_LABELS = {
  canAccessSales: "Acceder a vender",
  canAccessDashboard: "Acceder a dashboard",
  canAccessReturns: "Acceder a devoluciones",
  canAccessProducts: "Acceder a productos",
  canAccessAccountsReceivable: "Acceder a cuentas por cobrar",
  canAccessPayments: "Acceder a recibos de pago",
  canAccessDailyClose: "Acceder a cuadre diario",
  canAccessReports: "Acceder a reportes",
  canAccessShippingLabels: "Acceder a etiquetas de envío",
  canAccessBilling: "Acceder a planes y facturación",
  canAccessSettings: "Acceder a ajustes",
  canOverridePrice: "Modificar precios",
  canCancelSales: "Cancelar facturas",
  canCancelReturns: "Cancelar devoluciones",
  canCancelPayments: "Cancelar pagos",
  canEditSales: "Editar facturas",
  canEditProducts: "Editar productos",
  canChangeSaleType: "Cambiar tipo de venta",
  canSellWithoutStock: "Vender sin stock",
  canManageBackups: "Gestionar backups",
  canViewProductCosts: "Ver costos de productos",
  canViewProfitReport: "Ver reporte de ganancia",
  canAdjustInventory: "Ajustar inventario manual",
  canManageCategories: "Gestionar categorias",
  canManagePurchases: "Registrar compras",
  canCancelPurchases: "Anular compras",
  canManageSuppliers: "Gestionar proveedores",
  canManageCustomers: "Gestionar clientes",
  canApproveCredit: "Aprobar lineas de credito",
  canManageExpenses: "Registrar gastos",
  canCancelExpenses: "Anular gastos",
  canManageQuotes: "Gestionar cotizaciones",
  canApplyDiscounts: "Aplicar descuentos",
  canViewAuditLogs: "Ver registro de auditoria",
  canManageUsers: "Gestionar empleados",
  canManageSettings: "Modificar ajustes de empresa",
  canViewTreasury: "Ver tesoreria",
  canManageTreasuryAccounts: "Gestionar cuentas de tesoreria",
  canCreateTreasuryTransfers: "Crear transferencias de tesoreria",
  canReverseTreasuryTransfers: "Reversar transferencias de tesoreria",
} as const

export type PermissionKey = keyof typeof PERMISSION_LABELS

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[]

// Los permisos canAccess... controlan visibilidad/navegación del módulo.
// Los demás permisos controlan acciones internas dentro de módulos visibles.
export const MODULE_ACCESS_PERMISSION_KEYS = [
  "canAccessSales",
  "canAccessDashboard",
  "canAccessReturns",
  "canAccessProducts",
  "canAccessAccountsReceivable",
  "canAccessPayments",
  "canAccessDailyClose",
  "canAccessReports",
  "canAccessShippingLabels",
  "canAccessBilling",
  "canAccessSettings",
] as const satisfies readonly PermissionKey[]

export const CRITICAL_PERMISSION_KEYS = [
  "canManageUsers",
  "canManageSettings",
  "canViewAuditLogs",
] as const

export type CriticalPermissionKey = (typeof CRITICAL_PERMISSION_KEYS)[number]

export type PermissionModule = {
  id: string
  label: string
  permissions: PermissionKey[]
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "sales",
    label: "Ventas",
    permissions: [
      "canAccessSales",
      "canOverridePrice",
      "canApplyDiscounts",
      "canEditSales",
      "canCancelSales",
      "canChangeSaleType",
      "canSellWithoutStock",
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    permissions: ["canAccessDashboard"],
  },
  {
    id: "returns",
    label: "Devoluciones",
    permissions: ["canAccessReturns", "canCancelReturns"],
  },
  {
    id: "inventory_products",
    label: "Productos e inventario",
    permissions: ["canAccessProducts", "canEditProducts", "canViewProductCosts", "canAdjustInventory", "canManageCategories"],
  },
  {
    id: "customers_credit",
    label: "Clientes y cuentas por cobrar",
    permissions: ["canManageCustomers", "canApproveCredit", "canAccessAccountsReceivable"],
  },
  {
    id: "payments",
    label: "Recibos de pago",
    permissions: ["canAccessPayments", "canCancelPayments"],
  },
  {
    id: "daily_close",
    label: "Cuadre diario",
    permissions: ["canAccessDailyClose"],
  },
  {
    id: "reports",
    label: "Reportes",
    permissions: ["canAccessReports", "canViewProfitReport"],
  },
  {
    id: "shipping_labels",
    label: "Etiquetas de envío",
    permissions: ["canAccessShippingLabels"],
  },
  {
    id: "purchases_suppliers",
    label: "Compras y proveedores",
    permissions: ["canManagePurchases", "canCancelPurchases", "canManageSuppliers"],
  },
  {
    id: "operating_expenses",
    label: "Gastos Operativos",
    permissions: ["canManageExpenses", "canCancelExpenses"],
  },
  {
    id: "treasury",
    label: "Tesoreria",
    permissions: [
      "canViewTreasury",
      "canManageTreasuryAccounts",
      "canCreateTreasuryTransfers",
      "canReverseTreasuryTransfers",
    ],
  },
  {
    id: "quotes",
    label: "Cotizaciones",
    permissions: ["canManageQuotes"],
  },
  {
    id: "billing",
    label: "Planes y facturación",
    permissions: ["canAccessBilling"],
  },
  {
    id: "audit_settings",
    label: "Ajustes, usuarios y auditoría",
    permissions: [
      "canAccessSettings",
      "canViewAuditLogs",
      "canManageUsers",
      "canManageSettings",
    ],
  },
  {
    id: "backups",
    label: "Backups",
    permissions: ["canManageBackups"],
  },
]

export type PermissionAwareUser = {
  id?: string
  accountId?: string
  username?: string | null
  email?: string | null
  role?: string
  isOwner?: boolean
} & Partial<Record<PermissionKey, boolean>>

export function isCriticalPermission(key: PermissionKey): key is CriticalPermissionKey {
  return (CRITICAL_PERMISSION_KEYS as readonly string[]).includes(key)
}

export function hasPermission(
  user: PermissionAwareUser | null | undefined,
  key: PermissionKey,
  options?: { allowAdminBypass?: boolean }
): boolean {
  if (!user) return false
  if (user.isOwner) return true

  const allowAdminBypass = options?.allowAdminBypass ?? false
  if (allowAdminBypass && user.role === "ADMIN") return true

  return Boolean(user[key])
}

export function getModulePermissionState(
  user: PermissionAwareUser,
  module: PermissionModule,
  options?: { allowAdminBypass?: boolean }
): "all" | "none" | "partial" {
  const statuses = module.permissions.map((permission) =>
    hasPermission(user, permission, options)
  )

  const all = statuses.every(Boolean)
  if (all) return "all"

  const none = statuses.every((value) => !value)
  if (none) return "none"

  return "partial"
}

export function buildPermissionPatch(keys: PermissionKey[], value: boolean): Partial<Record<PermissionKey, boolean>> {
  return keys.reduce<Partial<Record<PermissionKey, boolean>>>((acc, key) => {
    acc[key] = value
    return acc
  }, {})
}

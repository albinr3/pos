export const PERMISSION_LABELS = {
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
    id: "inventory_products",
    label: "Inventario y Productos",
    permissions: ["canEditProducts", "canViewProductCosts", "canAdjustInventory", "canManageCategories"],
  },
  {
    id: "purchases_suppliers",
    label: "Compras y Proveedores",
    permissions: ["canManagePurchases", "canCancelPurchases", "canManageSuppliers"],
  },
  {
    id: "customers_credit",
    label: "Clientes y Creditos",
    permissions: ["canManageCustomers", "canApproveCredit", "canChangeSaleType"],
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
    id: "sales_cash",
    label: "Ventas y Caja",
    permissions: [
      "canOverridePrice",
      "canApplyDiscounts",
      "canEditSales",
      "canCancelSales",
      "canCancelReturns",
      "canCancelPayments",
      "canSellWithoutStock",
    ],
  },
  {
    id: "audit_settings",
    label: "Auditoria y Configuracion",
    permissions: [
      "canViewAuditLogs",
      "canManageUsers",
      "canManageSettings",
      "canManageBackups",
      "canViewProfitReport",
    ],
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

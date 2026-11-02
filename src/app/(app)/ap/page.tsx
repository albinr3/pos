import { requireModuleAccess } from "@/lib/module-access"
import { hasPermission } from "@/lib/permissions"
import { AccountsPayableClient } from "./payables-client"
export const dynamic = "force-dynamic"
export default async function AccountsPayablePage() {
  const user = await requireModuleAccess("canAccessAccountsPayable")
  return <div className="grid gap-6"><div><h1 className="text-2xl font-semibold">Cuentas por pagar</h1><p className="text-sm text-muted-foreground">Compras a crédito, vencimientos y pagos a proveedores. Los saldos son actuales.</p></div><AccountsPayableClient canPay={hasPermission(user, "canRegisterSupplierPayments")} canCancel={hasPermission(user, "canCancelSupplierPayments")} canEdit={hasPermission(user, "canManagePurchases")} canReport={hasPermission(user, "canAccessReports")} /></div>
}

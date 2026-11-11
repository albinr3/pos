import { requireModuleAccess } from "@/lib/module-access"
import { hasPermission } from "@/lib/permissions"
import { AccountsPayableClient } from "./payables-client"
import { getFiscalCapabilities } from "@/lib/fiscal/core/policy"
import { prisma } from "@/lib/db"
import { ForeignPayments } from "./foreign-payments"
export const dynamic = "force-dynamic"
export default async function AccountsPayablePage() {
  const user = await requireModuleAccess("canAccessAccountsPayable")
  const fiscal = await getFiscalCapabilities(user)
  const settings = await prisma.fiscalSettings.findUnique({where:{accountId:user.accountId},select:{enabled:true,version:true}})
  return <div className="grid gap-6"><div><h1 className="text-2xl font-semibold">Cuentas por pagar</h1><p className="text-sm text-muted-foreground">Compras a crédito, vencimientos y pagos a proveedores. Los saldos son actuales.</p></div>{settings && <ForeignPayments actor={{id:user.id,accountId:user.accountId}} enabled={settings.enabled} version={settings.version} canCreate={hasPermission(user,"canManagePurchases")} canPay={hasPermission(user,"canRegisterSupplierPayments")} canPrepare={fiscal?.operations.prepare ?? false}/>}<AccountsPayableClient canPay={hasPermission(user, "canRegisterSupplierPayments")} canCancel={hasPermission(user, "canCancelSupplierPayments")} canEdit={hasPermission(user, "canManagePurchases")} canReport={hasPermission(user, "canAccessReports")} canPrepareE41={hasPermission(user,"canManagePurchases") && (fiscal?.operations.prepare ?? false)} canViewFiscal={Boolean(settings) && hasPermission(user,"canViewFiscalDocuments")} /></div>
}

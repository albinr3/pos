import { requireModuleAccess } from "@/lib/module-access"
import { purchasePermit } from "@/lib/purchase-credit"
import { PurchaseReportClient } from "@/components/app/purchase-report-client"
export const dynamic = "force-dynamic"
export default async function Page() {
 const user = await requireModuleAccess("canAccessReports")
 purchasePermit(user, "canAccessAccountsPayable")
 return <PurchaseReportClient kind="accounts-payable" />
}

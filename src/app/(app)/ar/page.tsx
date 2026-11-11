import Link from "next/link"
import { Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requireModuleAccess } from "@/lib/module-access"
import { listTreasuryAccounts } from "../treasury/actions"
import { ARClient } from "./ar-client"
import { CashShiftGate } from "@/components/app/cash-shift-gate"
import { prisma } from "@/lib/db"
import { FiscalCustomerCredits } from "./fiscal-customer-credits"

export default async function AccountsReceivablePage() {
  const actor = await requireModuleAccess("canAccessAccountsReceivable")
  const [treasuryAccounts, cashControl, fiscalSettings] = await Promise.all([
    listTreasuryAccounts(),
    prisma.cashControl.findUnique({ where: { accountId: actor.accountId }, select: { enabled: true } }),
    prisma.fiscalSettings.findUnique({ where: { accountId: actor.accountId }, select: { accountId: true } }),
  ])

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuentas por cobrar</h1>
          <p className="text-sm text-muted-foreground">Saldar facturas o registrar abonos parciales.</p>
        </div>
        <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light">
          <Button asChild variant="secondary" className="rounded-[5px]">
            <Link href="/payments/list">
              <Receipt className="mr-2 h-4 w-4" /> Ver Recibos
            </Link>
          </Button>
        </div>
      </div>
      <CashShiftGate key={`${actor.accountId}:${actor.id}`} actor={{ id: actor.id, accountId: actor.accountId }} cashControlEnabled={cashControl?.enabled ?? false}>
        {fiscalSettings && (actor.isOwner || actor.canViewFiscalDocuments) && <FiscalCustomerCredits actor={{ id: actor.id, accountId: actor.accountId }} />}
        <ARClient initialTreasuryAccounts={treasuryAccounts} actor={{ id: actor.id, accountId: actor.accountId, username: actor.username }} />
      </CashShiftGate>
    </div>
  )
}

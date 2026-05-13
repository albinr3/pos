import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PosClient } from "./pos-client"
import { getSettings } from "../settings/actions"
import { getAccountOnboardingState } from "../onboarding/actions"

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string | string[]; onboardingProductId?: string | string[] }>
}) {
  const settings = await getSettings()
  const params = await searchParams
  const onboardingRaw = params.onboarding
  const onboarding = Array.isArray(onboardingRaw) ? onboardingRaw[0] : onboardingRaw
  const onboardingProductIdRaw = params.onboardingProductId
  const onboardingProductId = Array.isArray(onboardingProductIdRaw)
    ? onboardingProductIdRaw[0]
    : onboardingProductIdRaw
  const isOnboardingSale = onboarding === "sale" || Boolean(onboardingProductId)
  const onboardingState = isOnboardingSale ? await getAccountOnboardingState() : null

  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Selecciona cliente, busca productos por descripción/código/referencia y guarda la factura.
          </p>
        </div>
        <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light w-full sm:w-auto">
          <Button asChild variant="secondary" className="rounded-[5px] w-full sm:w-auto">
            <Link href="/sales/list">Ver lista de facturas</Link>
          </Button>
        </div>
      </div>
      <PosClient
        defaultViewMode={settings.defaultViewMode}
        showItbisOnReceipts={settings.showItbisOnReceipts}
        salePricesIncludeItbis={settings.salePricesIncludeItbis}
        legalTipEnabled={settings.legalTipEnabled}
        onboardingSaleGuide={isOnboardingSale && onboardingState?.phase === "SALE"}
        onboardingAccountId={onboardingState?.accountId ?? null}
      />
    </div>
  )
}

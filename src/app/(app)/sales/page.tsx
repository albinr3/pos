import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PosClient } from "./pos-client"
import { getSettings } from "../settings/actions"
import { getAccountOnboardingState } from "../onboarding/actions"
import { requireModuleAccess } from "@/lib/module-access"
import { CashShiftGate } from "@/components/app/cash-shift-gate"
import { prisma } from "@/lib/db"

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string | string[]; onboardingProductId?: string | string[] }>
}) {
  const actor = await requireModuleAccess("canAccessSales")
  const [settings, contextRows] = await Promise.all([
    getSettings(),
    // Una sola consulta recupera caja y política; el POS ordinario no hace peticiones fiscales adicionales.
    prisma.$queryRaw<Array<{ cashEnabled: boolean | null; fiscalEnabled: boolean | null; version: number | null; jurisdiction: string | null; regime: string | null; environment: string | null; configurationStatus: string | null }>>`
      SELECT c.enabled AS "cashEnabled", f.enabled AS "fiscalEnabled", f.version, f.jurisdiction, f.regime, f.environment, f."configurationStatus"
      FROM "Account" a LEFT JOIN "CashControl" c ON c."accountId"=a.id LEFT JOIN "FiscalSettings" f ON f."accountId"=a.id
      WHERE a.id=${actor.accountId}`,
  ])
  const context = contextRows[0]
  const fiscalEnabled = !!context?.fiscalEnabled && context.jurisdiction === "DO" && context.regime === "DO_ECF" && context.environment === "TEST" && context.configurationStatus === "VALIDATED"
  const params = await searchParams
  const onboardingRaw = params.onboarding
  const onboarding = Array.isArray(onboardingRaw) ? onboardingRaw[0] : onboardingRaw
  const onboardingProductIdRaw = params.onboardingProductId
  const onboardingProductId = Array.isArray(onboardingProductIdRaw)
    ? onboardingProductIdRaw[0]
    : onboardingProductIdRaw
  const isOnboardingSale = onboarding === "sale" || Boolean(onboardingProductId)
  const isDemoOnboarding = onboarding === "demo"
  const onboardingState = isOnboardingSale || isDemoOnboarding ? await getAccountOnboardingState() : null

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
      <CashShiftGate key={`${actor.accountId}:${actor.id}`} actor={{ id: actor.id, accountId: actor.accountId }} cashControlEnabled={context?.cashEnabled ?? false} bypass={isDemoOnboarding && onboardingState?.phase === "DEMO_SALE"}>
        {/* Cambiar de práctica a operación real descarta el carrito demo. */}
        <PosClient
          key={`${actor.accountId}:${isDemoOnboarding && onboardingState?.phase === "DEMO_SALE" ? "practice" : "live"}`}
          defaultViewMode={settings.defaultViewMode}
          showItbisOnReceipts={settings.showItbisOnReceipts}
          salePricesIncludeItbis={settings.salePricesIncludeItbis}
          legalTipEnabled={settings.legalTipEnabled}
          onboardingDemoGuide={isDemoOnboarding && onboardingState?.phase === "DEMO_SALE"}
          onboardingSaleGuide={isOnboardingSale && onboardingState?.phase === "SALE"}
          onboardingAccountId={onboardingState?.accountId ?? null}
          fiscalSale={fiscalEnabled && context?.version && !(isDemoOnboarding && onboardingState?.phase === "DEMO_SALE") ? { accountId: actor.accountId, version: context.version, canPrepare: actor.isOwner || actor.canPrepareFiscalDocuments } : null}
        />
      </CashShiftGate>
    </div>
  )
}

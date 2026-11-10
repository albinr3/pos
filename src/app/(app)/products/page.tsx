import { prisma } from "@/lib/db"
import { FiscalConcepts } from "./fiscal-concepts"
import { ProductsClient } from "./products-client"
import { getAccountOnboardingState } from "../onboarding/actions"
import { InventoryUploadOffer } from "@/components/inventory-upload-offer"
import { requireModuleAccess } from "@/lib/module-access"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string | string[] }>
}) {
  const user = await requireModuleAccess("canAccessProducts")
  // Un perfil configurado no activa por sí solo el módulo fiscal.
  const fiscalSettings = await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true } })
  const fiscalEnabled = fiscalSettings?.enabled === true

  const params = await searchParams
  const onboardingRaw = params.onboarding
  const onboarding = Array.isArray(onboardingRaw) ? onboardingRaw[0] : onboardingRaw
  const isOnboardingProduct = onboarding === "product"
  const isOnboardingSaleNav = onboarding === "sale-nav"
  const onboardingState = isOnboardingProduct || isOnboardingSaleNav ? await getAccountOnboardingState() : null

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">Crea y administra tus productos e inventario.</p>
      </div>
      <InventoryUploadOffer />
      {fiscalEnabled && <FiscalConcepts />}
      <ProductsClient
        fiscalEnabled={fiscalEnabled}
        onboardingProductGuide={isOnboardingProduct && onboardingState?.phase === "PRODUCT"}
        onboardingSaleNavGuide={isOnboardingSaleNav && onboardingState?.phase === "SALE"}
        onboardingAccountId={onboardingState?.accountId ?? null}
        onboardingStepOffset={1}
      />
    </div>
  )
}

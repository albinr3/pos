import { ProductsClient } from "./products-client"
import { getAccountOnboardingState } from "../onboarding/actions"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string | string[] }>
}) {
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
      <ProductsClient
        onboardingProductGuide={isOnboardingProduct && onboardingState?.phase === "PRODUCT"}
        onboardingSaleNavGuide={isOnboardingSaleNav && onboardingState?.phase === "SALE"}
        onboardingAccountId={onboardingState?.accountId ?? null}
        onboardingStepOffset={1}
      />
    </div>
  )
}

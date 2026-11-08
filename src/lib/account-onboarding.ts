import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

// SALE queda únicamente para no cambiar el onboarding de cuentas creadas antes de los demos.
export type AccountOnboardingPhase = "DEMO_SALE" | "PRODUCT" | "SALE" | "COMPLETED"

export type AccountOnboardingState = {
  accountId: string
  phase: AccountOnboardingPhase
  activeProductCount: number
  saleCount: number
  firstSeenAt: string | null
  lastSkippedAt: string | null
  completedAt: string | null
  firstProductId: string | null
  firstSaleId: string | null
  usesDemoActivation: boolean
  demoCheckoutCompletedAt: string | null
  firstRealProductId: string | null
  saleProductId: string | null
  saleProductName: string | null
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

export async function getAccountOnboardingStateForAccount(accountId: string): Promise<AccountOnboardingState> {
  const [
    onboarding,
    activeProductCount,
    saleCount,
    activeRealProductCount,
    firstActiveProduct,
    firstRealActiveProduct,
    firstSellableProduct,
    firstSale,
  ] = await Promise.all([
    prisma.accountOnboarding.findUnique({
      where: { accountId: accountId },
    }),
    prisma.product.count({
      where: {
        accountId: accountId,
        isActive: true,
      },
    }),
    prisma.sale.count({
      where: {
        accountId: accountId,
        cancelledAt: null,
      },
    }),
    prisma.product.count({
      where: {
        accountId: accountId,
        isActive: true,
        isOnboardingDemo: false,
      },
    }),
    prisma.product.findFirst({
      where: {
        accountId: accountId,
        isActive: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.product.findFirst({
      where: {
        accountId: accountId,
        isActive: true,
        isOnboardingDemo: false,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.product.findFirst({
      where: {
        accountId: accountId,
        isActive: true,
        isAvailableForSale: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.sale.findFirst({
      where: {
        accountId: accountId,
        cancelledAt: null,
      },
      orderBy: [{ soldAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        soldAt: true,
        items: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 1,
          select: { productId: true },
        },
      },
    }),
  ])

  const now = new Date()
  const isDemoAccount = Boolean(onboarding?.demoProductsSeededAt)
  const firstProductId = isDemoAccount
    ? onboarding?.firstRealProductId ?? firstRealActiveProduct?.id ?? null
    : onboarding?.firstProductId ?? firstSellableProduct?.id ?? firstActiveProduct?.id ?? null
  let savedOnboarding = onboarding

  if (saleCount > 0 && firstSale) {
    savedOnboarding = await prisma.accountOnboarding.upsert({
      where: { accountId: accountId },
      create: {
        accountId: accountId,
        firstSeenAt: onboarding?.firstSeenAt ?? now,
        completedAt: onboarding?.completedAt ?? now,
        firstProductId: firstProductId ?? firstSale.items[0]?.productId ?? null,
        firstSaleId: onboarding?.firstSaleId ?? firstSale.id,
        firstSaleCreatedAt: onboarding?.firstSaleCreatedAt ?? firstSale.soldAt,
      },
      update: {
        firstSeenAt: onboarding?.firstSeenAt ?? now,
        firstProductId: firstProductId ?? firstSale.items[0]?.productId ?? null,
        firstSaleId: onboarding?.firstSaleId ?? firstSale.id,
        firstSaleCreatedAt: onboarding?.firstSaleCreatedAt ?? firstSale.soldAt,
      },
    })
  } else {
    savedOnboarding = await prisma.accountOnboarding.upsert({
      where: { accountId: accountId },
      create: {
        accountId: accountId,
        firstSeenAt: now,
        firstProductId,
      },
      update: {
        firstSeenAt: onboarding?.firstSeenAt ?? now,
        firstProductId,
      },
    })
  }

  if (saleCount > 0 || (savedOnboarding?.demoCheckoutCompletedAt && activeRealProductCount > 0)) {
    await prisma.accountOnboarding.updateMany({ where: { accountId, completedAt: null }, data: { completedAt: now } })
    savedOnboarding = await prisma.accountOnboarding.findUnique({ where: { accountId } })
  }

  const usesDemoActivation = Boolean(savedOnboarding?.demoProductsSeededAt)
  const phase: AccountOnboardingPhase = savedOnboarding?.completedAt ? "COMPLETED" : usesDemoActivation
    ? !savedOnboarding?.demoCheckoutCompletedAt
      ? "DEMO_SALE"
      : savedOnboarding?.firstRealProductId || activeRealProductCount > 0
        ? "COMPLETED"
        : "PRODUCT"
    : saleCount > 0
      ? "COMPLETED"
      : activeProductCount === 0
        ? "PRODUCT"
        : "SALE"

  return {
    accountId: accountId,
    phase,
    activeProductCount,
    saleCount,
    firstSeenAt: toIso(savedOnboarding?.firstSeenAt),
    lastSkippedAt: toIso(savedOnboarding?.lastSkippedAt),
    completedAt: toIso(savedOnboarding?.completedAt),
    firstProductId: savedOnboarding?.firstProductId ?? null,
    firstSaleId: savedOnboarding?.firstSaleId ?? null,
    usesDemoActivation,
    demoCheckoutCompletedAt: toIso(savedOnboarding?.demoCheckoutCompletedAt),
    firstRealProductId: savedOnboarding?.firstRealProductId ?? null,
    saleProductId: firstSellableProduct?.id ?? null,
    saleProductName: firstSellableProduct?.name ?? null,
  }
}


// Desactivar conserva todas las referencias operativas, incluso ante ventas concurrentes.
export async function retireOnboardingDemos(tx: Prisma.TransactionClient, accountId: string) {
  await tx.product.updateMany({ where: { accountId, isOnboardingDemo: true }, data: { isActive: false, isAvailableForSale: false } })
}

export async function getMobileOnboardingState(accountId: string) {
  // Consulta ligera: el progreso web no se modifica al entrar desde el móvil.
  const [onboarding, product] = await Promise.all([
    prisma.accountOnboarding.findUnique({ where: { accountId }, select: { completedAt: true, demoProductsSeededAt: true, demoCheckoutCompletedAt: true, mobileAutoStartEligible: true } }),
    prisma.product.findFirst({ where: { accountId, isActive: true, isOnboardingDemo: false, isAvailableForSale: true, priceCents: { gt: 0 }, costCents: { gt: 0 } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } }),
  ])
  let completedAt = onboarding?.completedAt ?? null
  if (!completedAt && onboarding) {
    const legacySale = !onboarding.demoProductsSeededAt && await prisma.sale.findFirst({ where: { accountId, cancelledAt: null }, select: { id: true } })
    if (legacySale || (onboarding.demoCheckoutCompletedAt && product)) {
      await prisma.accountOnboarding.updateMany({ where: { accountId, completedAt: null }, data: { completedAt: new Date() } })
      completedAt = (await prisma.accountOnboarding.findUnique({ where: { accountId }, select: { completedAt: true } }))?.completedAt ?? null
    }
  }
  return { completedAt: completedAt?.toISOString() ?? null, mobileAutoStartEligible: onboarding?.mobileAutoStartEligible ?? false, completionProductId: product?.id ?? null }
}

export class OnboardingProductError extends Error {}

// Todas las rutas que completan el recorrido toman este bloqueo ANTES de tocar
// productos u onboarding. Invertir ese orden puede causar deadlocks web/móvil.
export async function withOnboardingTransaction<T>(accountId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding:${accountId}`}, 0))::text`
    return work(tx)
  })
}

export async function finalizeAccountOnboardingTx(tx: Prisma.TransactionClient, accountId: string, productId: string) {
  const current = await tx.accountOnboarding.upsert({ where: { accountId }, create: { accountId }, update: {} })
  if (current.completedAt) return { completedAt: current.completedAt.toISOString() }
  const product = await tx.product.findFirst({ where: { id: productId, accountId, isActive: true, isOnboardingDemo: false, isAvailableForSale: true, priceCents: { gt: 0 }, costCents: { gt: 0 } }, select: { id: true } })
  if (!product) throw new OnboardingProductError("Selecciona un producto real y activo de tu negocio.")
  const now = new Date()
  // La escritura condicional conserva el primer timestamp incluso frente a lecturas de estado antiguas.
  await tx.accountOnboarding.updateMany({ where: { accountId, completedAt: null }, data: {
    completedAt: now, firstRealProductId: current.firstRealProductId ?? product.id,
    firstRealProductCreatedAt: current.firstRealProductCreatedAt ?? now, demoProductsRemovedAt: now,
  } })
  await retireOnboardingDemos(tx, accountId)
  const saved = await tx.accountOnboarding.findUniqueOrThrow({ where: { accountId }, select: { completedAt: true } })
  return { completedAt: saved.completedAt!.toISOString() }
}

export async function completeAccountOnboarding(accountId: string, productId: string) {
  return withOnboardingTransaction(accountId, tx => finalizeAccountOnboardingTx(tx, accountId, productId))
}

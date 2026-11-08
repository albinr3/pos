"use server"

import { revalidatePath } from "next/cache"
import { ProductKind, UnitType } from "@prisma/client"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { upsertProduct } from "../products/actions"

export type { AccountOnboardingPhase, AccountOnboardingState } from "@/lib/account-onboarding"
import { getAccountOnboardingStateForAccount, finalizeAccountOnboardingTx, withOnboardingTransaction } from "@/lib/account-onboarding"
import type { AccountOnboardingState } from "@/lib/account-onboarding"

export async function getAccountOnboardingState(): Promise<AccountOnboardingState> {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  return getAccountOnboardingStateForAccount(user.accountId)
}

export async function skipAccountOnboarding() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const now = new Date()
  const existing = await prisma.accountOnboarding.findUnique({
    where: { accountId: user.accountId },
    select: { firstSeenAt: true },
  })

  await prisma.accountOnboarding.upsert({
    where: { accountId: user.accountId },
    create: {
      accountId: user.accountId,
      firstSeenAt: now,
      lastSkippedAt: now,
    },
    update: {
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSkippedAt: now,
    },
  })

  revalidatePath("/dashboard")
  return { ok: true }
}

export async function completeDemoCheckout() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const result = await withOnboardingTransaction(user.accountId, async (tx) => {
    const onboarding = await tx.accountOnboarding.findUnique({
      where: { accountId: user.accountId },
      select: { demoProductsSeededAt: true, demoCheckoutCompletedAt: true, completedAt: true },
    })
    if (onboarding?.completedAt) return { next: "COMPLETED" as const }
    if (!onboarding?.demoProductsSeededAt) throw new Error("La venta de práctica no está disponible para esta cuenta.")
    if (onboarding.demoCheckoutCompletedAt) return { next: "PRODUCT" as const }

    const demoCount = await tx.product.count({
      where: { accountId: user.accountId, isActive: true, isOnboardingDemo: true },
    })
    if (demoCount !== 3) throw new Error("No se pudieron preparar los productos de práctica.")

    const firstRealProduct = await tx.product.findFirst({
      where: { accountId: user.accountId, isActive: true, isOnboardingDemo: false, isAvailableForSale: true, priceCents: { gt: 0 }, costCents: { gt: 0 } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    })
    const completedAt = new Date()

    await tx.accountOnboarding.update({
      where: { accountId: user.accountId },
      data: {
        demoCheckoutCompletedAt: completedAt,
        ...(firstRealProduct
          ? {
              firstRealProductId: firstRealProduct.id,
              firstRealProductCreatedAt: completedAt,
              demoProductsRemovedAt: completedAt,
            }
          : {}),
      },
    })
    if (firstRealProduct) await finalizeAccountOnboardingTx(tx, user.accountId, firstRealProduct.id)
    return { next: firstRealProduct ? "COMPLETED" as const : "PRODUCT" as const }
  })

  revalidatePath("/sales")
  revalidatePath("/dashboard")
  return { ok: true as const, ...result }
}

export async function getProductExpressDefaults() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const settings = await prisma.companySettings.findUnique({
    where: { accountId: user.accountId },
    select: { itbisRateBp: true },
  })

  return {
    itbisRateBp: settings?.itbisRateBp ?? 1800,
  }
}

export async function createExpressProduct(input: {
  name: string
  priceCents: number
  costCents?: number | null
  stock: number
  code?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const priceCents = Math.round(Number(input.priceCents ?? 0))
  const costCentsRaw = input.costCents === null || input.costCents === undefined
    ? null
    : Math.round(Number(input.costCents))
  const costCents = costCentsRaw && costCentsRaw > 0 ? costCentsRaw : priceCents
  const stock = Number(input.stock ?? 0)

  if (!input.name?.trim()) {
    return { ok: false as const, error: "El nombre del producto es requerido." }
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return { ok: false as const, error: "El precio de venta debe ser mayor a 0." }
  }
  if (!Number.isFinite(stock) || stock < 0) {
    return { ok: false as const, error: "La existencia inicial no puede ser negativa." }
  }

  const settings = await prisma.companySettings.findUnique({
    where: { accountId: user.accountId },
    select: { itbisRateBp: true },
  })

  const result = await upsertProduct({
    name: input.name,
    sku: input.code || null,
    reference: null,
    supplierId: null,
    categoryId: null,
    priceCents,
    costCents,
    itbisRateBp: settings?.itbisRateBp ?? 1800,
    isAvailableForSale: true,
    stock,
    minStock: 0,
    imageUrls: [],
    productKind: ProductKind.BASIC,
    recipeItems: [],
    unit: UnitType.UNIDAD,
    user,
  })

  if (!result.ok) {
    return { ok: false as const, error: result.error, code: result.code }
  }

  const now = new Date()
  const existing = await prisma.accountOnboarding.findUnique({
    where: { accountId: user.accountId },
    select: {
      firstSeenAt: true,
      firstProductId: true,
      productExpressCreatedAt: true,
    },
  })

  await prisma.accountOnboarding.upsert({
    where: { accountId: user.accountId },
    create: {
      accountId: user.accountId,
      firstSeenAt: now,
      firstProductId: result.id,
      productExpressCreatedAt: now,
    },
    update: {
      firstSeenAt: existing?.firstSeenAt ?? now,
      firstProductId: existing?.firstProductId ?? result.id,
      productExpressCreatedAt: existing?.productExpressCreatedAt ?? now,
    },
  })

  revalidatePath("/dashboard")
  revalidatePath("/products")

  return { ok: true as const, productId: result.id }
}

"use server"

import { revalidatePath } from "next/cache"
import { ProductKind, UnitType } from "@prisma/client"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { upsertProduct } from "../products/actions"

export type AccountOnboardingPhase = "PRODUCT" | "SALE" | "COMPLETED"

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
  saleProductId: string | null
  saleProductName: string | null
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

export async function getAccountOnboardingState(): Promise<AccountOnboardingState> {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const [
    onboarding,
    activeProductCount,
    saleCount,
    firstActiveProduct,
    firstSellableProduct,
    firstSale,
  ] = await Promise.all([
    prisma.accountOnboarding.findUnique({
      where: { accountId: user.accountId },
    }),
    prisma.product.count({
      where: {
        accountId: user.accountId,
        isActive: true,
      },
    }),
    prisma.sale.count({
      where: {
        accountId: user.accountId,
        cancelledAt: null,
      },
    }),
    prisma.product.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.product.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
        isAvailableForSale: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.sale.findFirst({
      where: {
        accountId: user.accountId,
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
  const firstProductId = onboarding?.firstProductId ?? firstSellableProduct?.id ?? firstActiveProduct?.id ?? null
  let savedOnboarding = onboarding

  if (saleCount > 0 && firstSale) {
    savedOnboarding = await prisma.accountOnboarding.upsert({
      where: { accountId: user.accountId },
      create: {
        accountId: user.accountId,
        firstSeenAt: onboarding?.firstSeenAt ?? now,
        completedAt: onboarding?.completedAt ?? now,
        firstProductId: firstProductId ?? firstSale.items[0]?.productId ?? null,
        firstSaleId: onboarding?.firstSaleId ?? firstSale.id,
        firstSaleCreatedAt: onboarding?.firstSaleCreatedAt ?? firstSale.soldAt,
      },
      update: {
        firstSeenAt: onboarding?.firstSeenAt ?? now,
        completedAt: onboarding?.completedAt ?? now,
        firstProductId: firstProductId ?? firstSale.items[0]?.productId ?? null,
        firstSaleId: onboarding?.firstSaleId ?? firstSale.id,
        firstSaleCreatedAt: onboarding?.firstSaleCreatedAt ?? firstSale.soldAt,
      },
    })
  } else {
    savedOnboarding = await prisma.accountOnboarding.upsert({
      where: { accountId: user.accountId },
      create: {
        accountId: user.accountId,
        firstSeenAt: now,
        firstProductId,
      },
      update: {
        firstSeenAt: onboarding?.firstSeenAt ?? now,
        firstProductId,
      },
    })
  }

  const phase: AccountOnboardingPhase =
    saleCount > 0 ? "COMPLETED" : activeProductCount === 0 ? "PRODUCT" : "SALE"

  return {
    accountId: user.accountId,
    phase,
    activeProductCount,
    saleCount,
    firstSeenAt: toIso(savedOnboarding?.firstSeenAt),
    lastSkippedAt: toIso(savedOnboarding?.lastSkippedAt),
    completedAt: toIso(savedOnboarding?.completedAt),
    firstProductId: savedOnboarding?.firstProductId ?? null,
    firstSaleId: savedOnboarding?.firstSaleId ?? null,
    saleProductId: firstSellableProduct?.id ?? null,
    saleProductName: firstSellableProduct?.name ?? null,
  }
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

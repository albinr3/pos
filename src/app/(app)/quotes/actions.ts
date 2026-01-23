"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded } from "@/lib/money"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser } from "@/lib/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"

// Helper para convertir Decimal a número
function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}

function normalizeQuote<T extends { items: { qty: Decimal | number; product?: unknown }[] }>(quote: T): T {
  return {
    ...quote,
    items: quote.items.map((item) => {
      const product = item.product
      let normalizedProduct = product

      if (product && typeof product === "object" && "stock" in product) {
        const productWithStock = product as { stock?: Decimal | number }
        normalizedProduct = {
          ...(product as Record<string, unknown>),
          stock: productWithStock.stock === undefined ? productWithStock.stock : decimalToNumber(productWithStock.stock),
        }
      }

      return {
        ...item,
        qty: decimalToNumber(item.qty),
        product: normalizedProduct,
      }
    }),
  } as T
}

export async function searchProducts(query: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = query.trim()
  if (!q) return []

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      stock: true,
      saleUnit: true,
      imageUrls: true,
      itbisRateBp: true,
    },
  })

  // Convertir Decimal a número
  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
  }))
}

export async function listCustomers() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isGeneric: true },
    take: 50,
  })
}

export async function listQuotes() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const quotes = await prisma.quote.findMany({
    where: { accountId: user.accountId },
    orderBy: { quotedAt: "desc" },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { name: true, sku: true, reference: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
    take: 500,
  })

  return quotes.map(normalizeQuote)
}

export async function getQuoteByCode(quoteCode: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const quote = await prisma.quote.findFirst({
    where: { accountId: user.accountId, quoteCode },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { name: true, sku: true, reference: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
  })

  return quote ? normalizeQuote(quote) : null
}

export async function getQuoteById(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const quote = await prisma.quote.findFirst({
    where: { accountId: user.accountId, id },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, priceCents: true, stock: true, saleUnit: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
  })

  return quote ? normalizeQuote(quote) : null
}

type CartItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
}

function quoteCode(number: number) {
  return `COT-${number.toString().padStart(5, "0")}`
}

export async function createQuote(input: {
  customerId: string | null
  items: CartItemInput[]
  shippingCents?: number
  validUntil?: Date | null
  notes?: string
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La cotización no tiene productos.")

  const settings = await prisma.companySettings.findFirst({ where: { accountId: currentUser.accountId } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {

    // Quote sequence por account
    const seq = await tx.quoteSequence.upsert({
      where: { accountId: currentUser.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: currentUser.accountId, lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = quoteCode(number)

    // Load products to validate (no stock check for quotes)
    const products = await tx.product.findMany({
      where: { accountId: currentUser.accountId, id: { in: input.items.map((i) => i.productId) } },
      select: { id: true, priceCents: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en la cotización.")
    }

    const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    const quote = await tx.quote.create({
      data: {
        accountId: currentUser.accountId,
        quoteNumber: number,
        quoteCode: code,
        customerId: input.customerId || null,
        userId: currentUser.id,
        validUntil: input.validUntil || null,
        subtotalCents,
        itbisCents,
        shippingCents,
        totalCents,
        notes: input.notes || null,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitPriceCents: i.unitPriceCents,
            wasPriceOverridden: i.wasPriceOverridden,
            lineTotalCents: i.unitPriceCents * i.qty,
          })),
        },
      },
      select: { id: true, quoteCode: true },
    })

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "QUOTE_CREATED",
      resourceType: "Quote",
      resourceId: quote.id,
      details: {
        quoteCode: quote.quoteCode,
        totalCents,
        itemsCount: input.items.length,
        customerId: input.customerId,
      },
    }, tx)

    revalidatePath("/quotes")

    return quote
  }, TRANSACTION_OPTIONS)
}

export async function updateQuote(input: {
  id: string
  customerId: string | null
  items: CartItemInput[]
  shippingCents?: number
  validUntil?: Date | null
  notes?: string
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La cotización no tiene productos.")

  const settings = await prisma.companySettings.findFirst({ where: { accountId: currentUser.accountId } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {
    const existingQuote = await tx.quote.findFirst({
      where: { accountId: currentUser.accountId, id: input.id },
      include: {
        items: true,
      },
    })

    if (!existingQuote) throw new Error("Cotización no encontrada")

    // Validar productos
    const products = await tx.product.findMany({
      where: { accountId: currentUser.accountId, id: { in: input.items.map((i) => i.productId) } },
      select: { id: true, priceCents: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en la cotización.")
    }

    // Eliminar items anteriores
    await tx.quoteItem.deleteMany({
      where: { quoteId: input.id, quote: { accountId: currentUser.accountId } },
    })

    // Calcular nuevos totales
    const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    // Actualizar la cotización
    const updatedQuote = await tx.quote.updateMany({
      where: { id: input.id, accountId: currentUser.accountId },
      data: {
        customerId: input.customerId || null,
        validUntil: input.validUntil || null,
        subtotalCents,
        itbisCents,
        shippingCents,
        totalCents,
        notes: input.notes || null,
      },
    })
    if (updatedQuote.count === 0) throw new Error("Cotización no encontrada")

    await tx.quoteItem.createMany({
      data: input.items.map((i) => ({
        quoteId: input.id,
        productId: i.productId,
        qty: i.qty,
        unitPriceCents: i.unitPriceCents,
        wasPriceOverridden: i.wasPriceOverridden,
        lineTotalCents: i.unitPriceCents * i.qty,
      })),
    })

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "QUOTE_EDITED",
      resourceType: "Quote",
      resourceId: input.id,
      details: {
        totalCents,
        itemsCount: input.items.length,
        customerId: input.customerId,
      },
    }, tx)

    revalidatePath("/quotes")
  }, TRANSACTION_OPTIONS)
}

export async function deleteQuote(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Verificar que la cotización pertenece al account
  const quote = await prisma.quote.findFirst({
    where: { accountId: user.accountId, id },
  })
  if (!quote) throw new Error("Cotización no encontrada")

  const deleted = await prisma.quote.deleteMany({
    where: { id, accountId: user.accountId },
  })
  if (deleted.count === 0) throw new Error("Cotización no encontrada")

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    userEmail: user.email ?? null,
    userUsername: user.username ?? null,
    action: "QUOTE_DELETED",
    resourceType: "Quote",
    resourceId: quote.id,
    details: {
      quoteCode: quote.quoteCode,
      totalCents: quote.totalCents,
    },
  })
  revalidatePath("/quotes")
}











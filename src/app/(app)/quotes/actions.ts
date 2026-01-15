"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded } from "@/lib/money"

export async function searchProducts(query: string) {
  const q = query.trim()
  if (!q) return []

  const products = await prisma.product.findMany({
    where: {
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
    },
  })

  return products
}

export async function listCustomers() {
  return prisma.customer.findMany({
    where: { isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isGeneric: true },
    take: 50,
  })
}

export async function listQuotes() {
  return prisma.quote.findMany({
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
}

export async function getQuoteByCode(quoteCode: string) {
  return prisma.quote.findUnique({
    where: { quoteCode },
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
}

export async function getQuoteById(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, priceCents: true, stock: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
  })
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
  username: string
}) {
  if (!input.items.length) throw new Error("La cotización no tiene productos.")

  const settings = await prisma.companySettings.findUnique({ where: { id: "company" } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username: input.username } })
    if (!user) throw new Error("Usuario inválido")

    // Quote sequence
    const seq = await tx.quoteSequence.upsert({
      where: { id: "main" },
      update: { lastNumber: { increment: 1 } },
      create: { id: "main", lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = quoteCode(number)

    // Load products to validate (no stock check for quotes)
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
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
        quoteNumber: number,
        quoteCode: code,
        customerId: input.customerId || null,
        userId: user.id,
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

    revalidatePath("/quotes")

    return quote
  })
}

export async function updateQuote(input: {
  id: string
  customerId: string | null
  items: CartItemInput[]
  shippingCents?: number
  validUntil?: Date | null
  notes?: string
}) {
  if (!input.items.length) throw new Error("La cotización no tiene productos.")

  const settings = await prisma.companySettings.findUnique({ where: { id: "company" } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {
    const existingQuote = await tx.quote.findUnique({
      where: { id: input.id },
      include: {
        items: true,
      },
    })

    if (!existingQuote) throw new Error("Cotización no encontrada")

    // Validar productos
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      select: { id: true, priceCents: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en la cotización.")
    }

    // Eliminar items anteriores
    await tx.quoteItem.deleteMany({
      where: { quoteId: input.id },
    })

    // Calcular nuevos totales
    const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    // Actualizar la cotización
    await tx.quote.update({
      where: { id: input.id },
      data: {
        customerId: input.customerId || null,
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
    })

    revalidatePath("/quotes")
  })
}

export async function deleteQuote(id: string) {
  await prisma.quote.delete({
    where: { id },
  })
  revalidatePath("/quotes")
}







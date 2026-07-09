"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  calcDiscountedDocumentTotalsByTaxMode,
  normalizeDiscountPercentBp,
} from "@/lib/money"
import { Decimal } from "@prisma/client/runtime/library"
import {
  DocumentDiscountSource,
  ProductKind,
  RecipeAdjustmentType,
  type Prisma,
} from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"
import { ensurePermission } from "@/lib/permission-guard"
import { ensureGenericCustomer } from "@/lib/customer-helpers"

// Helper para convertir Decimal a número
function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
}

function normalizeRequestedCustomerId(customerId: string | null | undefined): string | null {
  const normalized = customerId?.trim()
  if (!normalized) return null
  return normalized.toLowerCase() === "generic" ? null : normalized
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

type ProductRecipeItemResult = {
  ingredientId: string
  qty: number
  ingredientName: string
  ingredientUnit: string
}

function normalizeProductResult<T extends {
  stock: Decimal | number
  recipeItems: Array<{
    ingredientId: string
    qty: Decimal | number
    ingredient: { name: string; unit: string }
  }>
}>(product: T): Omit<T, "stock" | "recipeItems"> & { stock: number; recipeItems: ProductRecipeItemResult[] } {
  const { stock, recipeItems, ...rest } = product
  return {
    ...rest,
    stock: decimalToNumber(stock),
    recipeItems: recipeItems.map((item) => ({
      ingredientId: item.ingredientId,
      qty: decimalToNumber(item.qty),
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit,
    })),
  }
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
      isAvailableForSale: true,
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
      unit: true,
      imageUrls: true,
      itbisRateBp: true,
      productKind: true,
      recipeItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          ingredientId: true,
          qty: true,
          ingredient: {
            select: {
              name: true,
              unit: true,
            },
          },
        },
      },
    },
  })

  return products.map(normalizeProductResult)
}

export async function listAllProductsForQuotes() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      isAvailableForSale: true,
    },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      stock: true,
      unit: true,
      imageUrls: true,
      itbisRateBp: true,
      productKind: true,
      recipeItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          ingredientId: true,
          qty: true,
          ingredient: {
            select: {
              name: true,
              unit: true,
            },
          },
        },
      },
    },
  })

  return products.map(normalizeProductResult)
}

export async function listCustomers() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensureGenericCustomer(prisma, user.accountId)

  // Esta lista alimenta el selector de cotizaciones sin paginacion.
  // No volver a limitarla a 50: ocultaba clientes validos en cuentas con mas volumen.
  return prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, visualId: true, name: true, isGeneric: true, saleDiscountPercentBp: true },
    take: 1000,
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
            select: { name: true, sku: true, reference: true, unit: true },
          },
          recipeAdjustments: true,
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
            select: { name: true, sku: true, reference: true, unit: true },
          },
          recipeAdjustments: true,
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
            select: {
              id: true,
              name: true,
              sku: true,
              reference: true,
              priceCents: true,
              stock: true,
              unit: true,
              itbisRateBp: true,
              productKind: true,
              recipeItems: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                  ingredientId: true,
                  qty: true,
                  ingredient: {
                    select: {
                      name: true,
                      unit: true,
                    },
                  },
                },
              },
            },
          },
          recipeAdjustments: true,
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
  recipeAdjustments?: Array<{
    ingredientId: string
    adjustmentType: RecipeAdjustmentType
  }>
}

type DiscountModeInput = "AUTO" | "MANUAL"

type ResolvedDocumentDiscount = {
  discountSource: DocumentDiscountSource
  discountPercentBp: number
}

const MAX_QUOTE_ITEMS = 100

function validateQuoteItems(items: CartItemInput[]) {
  if (!items.length) throw new Error("La cotización no tiene productos.")
  if (items.length > MAX_QUOTE_ITEMS) throw new Error(`La cotización no puede tener más de ${MAX_QUOTE_ITEMS} productos.`)

  for (const item of items) {
    if (!item.productId) throw new Error("Producto inválido en la cotización.")
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new Error("La cantidad debe ser mayor a 0.")
    }
    if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents <= 0 || !Number.isInteger(item.unitPriceCents)) {
      throw new Error("El precio unitario debe ser un entero positivo en centavos.")
    }
  }
}

function normalizeQuoteInputItems(items: CartItemInput[]): CartItemInput[] {
  return items.map((item) => ({
    ...item,
    qty: roundQty(item.qty),
  }))
}

function normalizeRecipeAdjustments(
  recipeAdjustments: CartItemInput["recipeAdjustments"] | undefined,
  productName: string
) {
  const normalized = (recipeAdjustments ?? []).map((adjustment) => {
    const ingredientId = String(adjustment.ingredientId ?? "").trim()
    const typeRaw = String(adjustment.adjustmentType ?? "").trim().toUpperCase()
    if (!ingredientId) {
      throw new Error(`Hay un ajuste de receta inválido en "${productName}".`)
    }
    if (typeRaw !== RecipeAdjustmentType.SIN && typeRaw !== RecipeAdjustmentType.EXTRA) {
      throw new Error(`Hay un tipo de ajuste inválido en "${productName}".`)
    }
    return {
      ingredientId,
      adjustmentType: typeRaw as RecipeAdjustmentType,
    }
  })

  const byIngredient = new Map<string, RecipeAdjustmentType>()
  for (const adjustment of normalized) {
    if (byIngredient.has(adjustment.ingredientId)) {
      throw new Error(`No puedes repetir ajustes para el mismo ingrediente en "${productName}".`)
    }
    byIngredient.set(adjustment.ingredientId, adjustment.adjustmentType)
  }

  return Array.from(byIngredient.entries())
    .map(([ingredientId, adjustmentType]) => ({ ingredientId, adjustmentType }))
    .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))
}

type ResolvedQuoteLine = {
  item: CartItemInput
  product: {
    id: string
    name: string
    priceCents: number
    itbisRateBp: number | null
    isActive: boolean
    isAvailableForSale: boolean
    productKind: ProductKind
  }
  recipeAdjustments: Array<{
    ingredientId: string
    ingredientName: string
    type: RecipeAdjustmentType
  }>
}

async function loadProductsForQuoteResolution(
  tx: Prisma.TransactionClient,
  accountId: string,
  productIds: string[]
) {
  const products = await tx.product.findMany({
    where: {
      id: { in: productIds },
      accountId,
    },
    select: {
      id: true,
      name: true,
      priceCents: true,
      itbisRateBp: true,
      isActive: true,
      isAvailableForSale: true,
      productKind: true,
      recipeItems: {
        select: {
          ingredientId: true,
          qty: true,
          ingredient: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })

  return new Map(
    products.map((product) => [
      product.id,
      {
        ...product,
        recipeItems: product.recipeItems.map((item) => ({
          ingredientId: item.ingredientId,
          qty: decimalToNumber(item.qty),
          ingredientName: item.ingredient.name,
        })),
      },
    ])
  )
}

async function resolveQuoteLines(
  tx: Prisma.TransactionClient,
  accountId: string,
  items: CartItemInput[],
  options?: {
    allowUnavailableProductIds?: Set<string>
  }
) {
  const productsById = await loadProductsForQuoteResolution(
    tx,
    accountId,
    Array.from(new Set(items.map((item) => item.productId)))
  )

  const resolvedLines: ResolvedQuoteLine[] = []

  for (const item of items) {
    const product = productsById.get(item.productId)
    if (!product || !product.isActive) {
      throw new Error("Hay un producto inválido o inactivo en la cotización.")
    }

    const canUseUnavailableProduct = options?.allowUnavailableProductIds?.has(product.id) ?? false
    if (!product.isAvailableForSale && !canUseUnavailableProduct) {
      throw new Error(`El producto "${product.name}" no está disponible para la venta.`)
    }

    if (product.productKind !== ProductKind.RECIPE) {
      resolvedLines.push({
        item: {
          ...item,
          recipeAdjustments: [],
        },
        product: {
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          itbisRateBp: product.itbisRateBp,
          isActive: product.isActive,
          isAvailableForSale: product.isAvailableForSale,
          productKind: product.productKind,
        },
        recipeAdjustments: [],
      })
      continue
    }

    if (product.recipeItems.length === 0) {
      throw new Error(`El producto "${product.name}" no tiene una receta configurada.`)
    }

    const normalizedAdjustments = normalizeRecipeAdjustments(item.recipeAdjustments, product.name)
    const recipeItemsByIngredient = new Map(
      product.recipeItems.map((recipeItem) => [
        recipeItem.ingredientId,
        {
          ingredientId: recipeItem.ingredientId,
          ingredientName: recipeItem.ingredientName,
          qty: recipeItem.qty,
        },
      ])
    )

    for (const adjustment of normalizedAdjustments) {
      if (!recipeItemsByIngredient.has(adjustment.ingredientId)) {
        throw new Error(`El ajuste seleccionado no pertenece a la receta de "${product.name}".`)
      }
    }

    resolvedLines.push({
      item: {
        ...item,
        recipeAdjustments: normalizedAdjustments,
      },
      product: {
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        itbisRateBp: product.itbisRateBp,
        isActive: product.isActive,
        isAvailableForSale: product.isAvailableForSale,
        productKind: product.productKind,
      },
      recipeAdjustments: normalizedAdjustments.map((adjustment) => ({
        ingredientId: adjustment.ingredientId,
        ingredientName: recipeItemsByIngredient.get(adjustment.ingredientId)?.ingredientName ?? "Insumo",
        type: adjustment.adjustmentType,
      })),
    })
  }

  return resolvedLines
}

function quoteCode(number: number) {
  return `COT-${number.toString().padStart(5, "0")}`
}

function calculateQuoteTotalsFromResolvedLines(
  lines: ResolvedQuoteLine[],
  salePricesIncludeItbis: boolean,
  discountPercentBp: number
) {
  return calcDiscountedDocumentTotalsByTaxMode(
    lines.map((line) => ({
      unitPriceCents: line.item.unitPriceCents,
      qty: line.item.qty,
      itbisRateBp: line.product.itbisRateBp ?? 1800,
    })),
    salePricesIncludeItbis,
    discountPercentBp
  )
}

function resolveAutoDiscount(
  customer: { saleDiscountPercentBp: number } | null | undefined
): ResolvedDocumentDiscount {
  const customerDiscountBp = normalizeDiscountPercentBp(customer?.saleDiscountPercentBp ?? 0)
  if (customerDiscountBp <= 0) {
    return {
      discountSource: DocumentDiscountSource.NONE,
      discountPercentBp: 0,
    }
  }
  return {
    discountSource: DocumentDiscountSource.CUSTOMER,
    discountPercentBp: customerDiscountBp,
  }
}

function resolveManualDiscount(
  user: { canApplyDiscounts?: boolean; isOwner?: boolean },
  manualDiscountPercentBp: number
): ResolvedDocumentDiscount {
  if (!user.canApplyDiscounts && !user.isOwner) {
    throw new Error("No tienes permiso para aplicar descuentos manuales.")
  }
  return {
    discountSource: DocumentDiscountSource.MANUAL,
    discountPercentBp: normalizeDiscountPercentBp(manualDiscountPercentBp),
  }
}

function resolveDocumentDiscount(input: {
  discountMode?: DiscountModeInput
  manualDiscountPercentBp?: number
  user: { canApplyDiscounts?: boolean; isOwner?: boolean }
  customer?: { saleDiscountPercentBp: number } | null
  fallback?: {
    discountSource?: DocumentDiscountSource | null
    discountPercentBp?: number | null
  }
}): ResolvedDocumentDiscount {
  if (input.discountMode === "MANUAL") {
    return resolveManualDiscount(input.user, input.manualDiscountPercentBp ?? 0)
  }
  if (input.discountMode === "AUTO") {
    return resolveAutoDiscount(input.customer)
  }
  if (input.fallback?.discountSource) {
    return {
      discountSource: input.fallback.discountSource,
      discountPercentBp: normalizeDiscountPercentBp(input.fallback.discountPercentBp ?? 0),
    }
  }
  return resolveAutoDiscount(input.customer)
}

export async function createQuote(input: {
  customerId: string | null
  items: CartItemInput[]
  shippingCents?: number
  discountMode?: DiscountModeInput
  manualDiscountPercentBp?: number
  salePricesIncludeItbis?: boolean
  validUntil?: Date | null
  notes?: string
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")
  await ensurePermission(currentUser, "canManageQuotes", {
    message: "No tienes permiso para gestionar cotizaciones",
    resourceType: "Quote",
  })

  const normalizedItems = normalizeQuoteInputItems(input.items)
  validateQuoteItems(normalizedItems)
  const requestedCustomerId = normalizeRequestedCustomerId(input.customerId)

  const settings = await prisma.companySettings.findFirst({ where: { accountId: currentUser.accountId } })
  const salePricesIncludeItbis = input.salePricesIncludeItbis ?? (settings?.salePricesIncludeItbis ?? true)

  return prisma.$transaction(async (tx) => {
    // Quote sequence por account
    const seq = await tx.quoteSequence.upsert({
      where: { accountId: currentUser.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: currentUser.accountId, lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = quoteCode(number)

    const resolvedLines = await resolveQuoteLines(tx, currentUser.accountId, normalizedItems)
    const genericCustomer = await ensureGenericCustomer(tx, currentUser.accountId)
    let finalCustomerId = genericCustomer.id
    if (requestedCustomerId) {
      const requestedCustomer = await tx.customer.findFirst({
        where: { id: requestedCustomerId, accountId: currentUser.accountId, isActive: true },
        select: { id: true },
      })
      if (requestedCustomer) {
        finalCustomerId = requestedCustomer.id
      }
    }
    const customerForDiscount = await tx.customer.findFirst({
      where: { id: finalCustomerId, accountId: currentUser.accountId, isActive: true },
      select: { id: true, saleDiscountPercentBp: true },
    })
    if (!customerForDiscount) {
      throw new Error("No se pudo resolver el cliente de la cotización.")
    }

    for (const line of resolvedLines) {
      const originalPriceCents = Number(line.product.priceCents)
      const priceDiffers = line.item.unitPriceCents !== originalPriceCents

      if (priceDiffers) {
        if (!currentUser.canOverridePrice && !currentUser.isOwner) {
          throw new Error("No tienes permiso para modificar precios. El precio fue cambiado sin autorización.")
        }
        await logAuditEvent({
          accountId: currentUser.accountId,
          userId: currentUser.id,
          userEmail: currentUser.email ?? null,
          userUsername: currentUser.username ?? null,
          action: "PRICE_OVERRIDE",
          resourceType: "Product",
          resourceId: line.product.id,
          details: {
            oldPriceCents: originalPriceCents,
            newPriceCents: line.item.unitPriceCents,
          },
        }, tx)
      }
    }

    const { discountSource, discountPercentBp } = resolveDocumentDiscount({
      discountMode: input.discountMode,
      manualDiscountPercentBp: input.manualDiscountPercentBp,
      user: currentUser,
      customer: customerForDiscount,
    })
    const {
      discountSubtotalCents,
      subtotalCents,
      itbisCents,
      discountTotalCents,
      itemsTotalCents,
    } = calculateQuoteTotalsFromResolvedLines(
      resolvedLines,
      salePricesIncludeItbis,
      discountPercentBp
    )
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    const quote = await tx.quote.create({
      data: {
        accountId: currentUser.accountId,
        quoteNumber: number,
        quoteCode: code,
        customerId: finalCustomerId,
        userId: currentUser.id,
        validUntil: input.validUntil || null,
        subtotalCents,
        itbisCents,
        shippingCents,
        discountSource,
        discountPercentBp,
        discountSubtotalCents,
        discountTotalCents,
        totalCents,
        salePricesIncludeItbis,
        notes: input.notes || null,
        items: {
          create: resolvedLines.map((line) => ({
            productId: line.item.productId,
            qty: line.item.qty,
            unitPriceCents: line.item.unitPriceCents,
            wasPriceOverridden: line.item.wasPriceOverridden,
            itbisRateBp: line.product.itbisRateBp ?? 1800,
            lineTotalCents: Math.round(line.item.unitPriceCents * line.item.qty),
            recipeAdjustments: line.recipeAdjustments.length
              ? {
                  create: line.recipeAdjustments.map((adjustment) => ({
                    ingredientId: adjustment.ingredientId,
                    ingredientName: adjustment.ingredientName,
                    type: adjustment.type,
                  })),
                }
              : undefined,
          })),
        },
      },
      select: {
        id: true,
        quoteCode: true,
        salePricesIncludeItbis: true,
        discountSource: true,
        discountPercentBp: true,
        discountSubtotalCents: true,
        discountTotalCents: true,
      },
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
        discountSource: quote.discountSource,
        discountPercentBp: quote.discountPercentBp,
        itemsCount: resolvedLines.length,
        customerId: finalCustomerId,
      },
    }, tx)

    revalidatePath("/quotes")
    revalidatePath("/quotes/list")

    return quote
  }, TRANSACTION_OPTIONS)
}

export async function updateQuote(input: {
  id: string
  customerId: string | null
  items: CartItemInput[]
  shippingCents?: number
  discountMode?: DiscountModeInput
  manualDiscountPercentBp?: number
  salePricesIncludeItbis?: boolean
  validUntil?: Date | null
  notes?: string
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")
  await ensurePermission(currentUser, "canManageQuotes", {
    message: "No tienes permiso para gestionar cotizaciones",
    resourceType: "Quote",
    resourceId: input.id,
  })

  const normalizedItems = normalizeQuoteInputItems(input.items)
  validateQuoteItems(normalizedItems)
  const requestedCustomerId = normalizeRequestedCustomerId(input.customerId)

  const settings = await prisma.companySettings.findFirst({ where: { accountId: currentUser.accountId } })
  const accountSalePricesIncludeItbis = settings?.salePricesIncludeItbis ?? true

  return prisma.$transaction(async (tx) => {
    const existingQuote = await tx.quote.findFirst({
      where: { accountId: currentUser.accountId, id: input.id },
      include: {
        items: {
          select: {
            productId: true,
          },
        },
      },
    })

    if (!existingQuote) throw new Error("Cotización no encontrada")

    const allowUnavailableProductIds = new Set(existingQuote.items.map((item) => item.productId))
    const resolvedLines = await resolveQuoteLines(tx, currentUser.accountId, normalizedItems, {
      allowUnavailableProductIds,
    })
    const genericCustomer = await ensureGenericCustomer(tx, currentUser.accountId)
    let finalCustomerId = genericCustomer.id
    if (requestedCustomerId) {
      const requestedCustomer = await tx.customer.findFirst({
        where: { id: requestedCustomerId, accountId: currentUser.accountId, isActive: true },
        select: { id: true },
      })
      if (requestedCustomer) {
        finalCustomerId = requestedCustomer.id
      }
    }
    const customerForDiscount = await tx.customer.findFirst({
      where: { id: finalCustomerId, accountId: currentUser.accountId, isActive: true },
      select: { id: true, saleDiscountPercentBp: true },
    })
    if (!customerForDiscount) {
      throw new Error("No se pudo resolver el cliente de la cotización.")
    }

    for (const line of resolvedLines) {
      const originalPriceCents = Number(line.product.priceCents)
      const priceDiffers = line.item.unitPriceCents !== originalPriceCents

      if (priceDiffers) {
        if (!currentUser.canOverridePrice && !currentUser.isOwner) {
          throw new Error("No tienes permiso para modificar precios. El precio fue cambiado sin autorización.")
        }
        await logAuditEvent({
          accountId: currentUser.accountId,
          userId: currentUser.id,
          userEmail: currentUser.email ?? null,
          userUsername: currentUser.username ?? null,
          action: "PRICE_OVERRIDE",
          resourceType: "Product",
          resourceId: line.product.id,
          details: {
            oldPriceCents: originalPriceCents,
            newPriceCents: line.item.unitPriceCents,
          },
        }, tx)
      }
    }

    // Eliminar items anteriores y sus ajustes
    await tx.quoteItem.deleteMany({
      where: { quoteId: input.id, quote: { accountId: currentUser.accountId } },
    })

    // Calcular nuevos totales con el modo histórico del documento
    const documentSalePricesIncludeItbis =
      existingQuote.salePricesIncludeItbis ?? input.salePricesIncludeItbis ?? accountSalePricesIncludeItbis
    const { discountSource, discountPercentBp } = resolveDocumentDiscount({
      discountMode: input.discountMode,
      manualDiscountPercentBp: input.manualDiscountPercentBp,
      user: currentUser,
      customer: customerForDiscount,
      fallback: {
        discountSource: existingQuote.discountSource,
        discountPercentBp: existingQuote.discountPercentBp,
      },
    })
    const {
      discountSubtotalCents,
      subtotalCents,
      itbisCents,
      discountTotalCents,
      itemsTotalCents,
    } = calculateQuoteTotalsFromResolvedLines(
      resolvedLines,
      documentSalePricesIncludeItbis,
      discountPercentBp
    )
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    // Actualizar la cotización
    const updatedQuote = await tx.quote.updateMany({
      where: { id: input.id, accountId: currentUser.accountId },
      data: {
        customerId: finalCustomerId,
        validUntil: input.validUntil || null,
        subtotalCents,
        itbisCents,
        shippingCents,
        discountSource,
        discountPercentBp,
        discountSubtotalCents,
        discountTotalCents,
        totalCents,
        salePricesIncludeItbis: documentSalePricesIncludeItbis,
        notes: input.notes || null,
      },
    })
    if (updatedQuote.count === 0) throw new Error("Cotización no encontrada")

    for (const line of resolvedLines) {
      await tx.quoteItem.create({
        data: {
          quoteId: input.id,
          productId: line.item.productId,
          qty: line.item.qty,
          unitPriceCents: line.item.unitPriceCents,
          wasPriceOverridden: line.item.wasPriceOverridden,
          itbisRateBp: line.product.itbisRateBp ?? 1800,
          lineTotalCents: Math.round(line.item.unitPriceCents * line.item.qty),
          recipeAdjustments: line.recipeAdjustments.length
            ? {
                create: line.recipeAdjustments.map((adjustment) => ({
                  ingredientId: adjustment.ingredientId,
                  ingredientName: adjustment.ingredientName,
                  type: adjustment.type,
                })),
              }
            : undefined,
        },
      })
    }

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
        discountSource,
        discountPercentBp,
        itemsCount: resolvedLines.length,
        customerId: finalCustomerId,
      },
    }, tx)

    revalidatePath("/quotes")
    revalidatePath("/quotes/list")
  }, TRANSACTION_OPTIONS)
}

export async function deleteQuote(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageQuotes", {
    message: "No tienes permiso para gestionar cotizaciones",
    resourceType: "Quote",
    resourceId: id,
  })

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
  revalidatePath("/quotes/list")
}

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  calcDiscountedDocumentTotalsByTaxMode,
  invoiceCode,
  normalizeDiscountPercentBp,
} from "@/lib/money"
import { Decimal } from "@prisma/client/runtime/library"
import {
  DocumentDiscountSource,
  ProductKind,
  RecipeAdjustmentType,
  SaleType,
  PaymentMethod,
  type Prisma,
} from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logError, ErrorCodes } from "@/lib/error-logger"
import { isDominicanBankName } from "@/lib/dominican-banks"
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

function normalizeRequestedCustomerId(customerId: string | null | undefined): string | null {
  const normalized = customerId?.trim()
  if (!normalized) return null
  return normalized.toLowerCase() === "generic" ? null : normalized
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
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      unit: true,
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

  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
    recipeItems: p.recipeItems.map((item) => ({
      ingredientId: item.ingredientId,
      qty: decimalToNumber(item.qty),
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit,
    })),
  }))
}

export async function listAllProductsForSale() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      isAvailableForSale: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      unit: true,
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
    take: 500,
  })

  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
    recipeItems: p.recipeItems.map((item) => ({
      ingredientId: item.ingredientId,
      qty: decimalToNumber(item.qty),
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit,
    })),
  }))
}

export async function findProductByBarcode(code: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = code.trim()
  if (!q) return null

  const product = await prisma.product.findFirst({
    where: {
      accountId: user.accountId,
      isActive: true,
      isAvailableForSale: true,
      OR: [
        { sku: { equals: q, mode: "insensitive" } },
        { reference: { equals: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      unit: true,
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

  if (!product) return null

  return {
    ...product,
    stock: decimalToNumber(product.stock),
    recipeItems: product.recipeItems.map((item) => ({
      ingredientId: item.ingredientId,
      qty: decimalToNumber(item.qty),
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit,
    })),
  }
}

export async function listCustomers() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensureGenericCustomer(prisma, user.accountId)

  return prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, visualId: true, name: true, isGeneric: true, saleDiscountPercentBp: true },
    take: 50,
  })
}

export async function listSales(options?: { query?: string; cursor?: string | null; take?: number }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = options?.query?.trim()
  const normalizedVisualQuery = q ? q.replace(/^#/, "") : ""
  const visualIdQuery = normalizedVisualQuery && /^\d+$/.test(normalizedVisualQuery) ? Number(normalizedVisualQuery) : null
  const take = Math.min(Math.max(options?.take ?? 50, 1), 200)

  const sales = await prisma.sale.findMany({
    where: {
      accountId: user.accountId,
      ...(q
        ? {
          OR: [
            { invoiceCode: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            ...(visualIdQuery !== null ? [{ customer: { visualId: visualIdQuery } }] : []),
            { items: { some: { product: { name: { contains: q, mode: "insensitive" } } } } },
          ],
        }
        : {}),
    },
    orderBy: [{ soldAt: "desc" }, { id: "desc" }],
    cursor: options?.cursor ? { id: options.cursor } : undefined,
    skip: options?.cursor ? 1 : 0,
    take: take + 1,
    select: {
      id: true,
      invoiceCode: true,
      soldAt: true,
      type: true,
      totalCents: true,
      cancelledAt: true,
      customer: { select: { name: true, visualId: true } },
      returns: {
        where: { cancelledAt: null },
        select: { totalCents: true },
      },
    },
  })

  const hasMore = sales.length > take
  const pageItems = hasMore ? sales.slice(0, take) : sales
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null

  const mappedItems = pageItems.map((sale) => {
    const returnedTotalCents = sale.returns.reduce((sum, returnRecord) => sum + returnRecord.totalCents, 0)
    const returnStatus =
      returnedTotalCents <= 0
        ? null
        : returnedTotalCents >= sale.totalCents
          ? "TOTAL"
          : "PARCIAL"

    return {
      ...sale,
      returnedTotalCents,
      returnStatus,
    }
  })

  return {
    items: mappedItems,
    nextCursor,
  }
}

export async function getSaleByInvoiceCode(invoiceCodeParam: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sale = await prisma.sale.findFirst({
    where: { accountId: user.accountId, invoiceCode: invoiceCodeParam },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { name: true },
          },
        },
      },
      cancelledUser: { select: { name: true, username: true } },
    },
  })

  if (!sale) return null

  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      qty: decimalToNumber(item.qty),
    })),
  }
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

type PaymentSplitInput = {
  method: PaymentMethod
  amountCents: number
  transferBankName?: string | null
}

type DiscountModeInput = "AUTO" | "MANUAL"

type ResolvedDocumentDiscount = {
  discountSource: DocumentDiscountSource
  discountPercentBp: number
}

const MAX_SALE_ITEMS = 100

function validateCartItems(items: CartItemInput[]) {
  if (!items.length) throw new Error("La venta no tiene productos.")
  if (items.length > MAX_SALE_ITEMS) throw new Error(`La venta no puede tener más de ${MAX_SALE_ITEMS} productos.`)

  for (const item of items) {
    if (!item.productId) throw new Error("Producto inválido en el carrito.")
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new Error("La cantidad debe ser mayor a 0.")
    }
    if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents <= 0 || !Number.isInteger(item.unitPriceCents)) {
      throw new Error("El precio unitario debe ser un entero positivo en centavos.")
    }
  }
}

function validateTransferBankName(method: PaymentMethod | null | undefined, transferBankName?: string | null) {
  if (method !== PaymentMethod.TRANSFERENCIA) return

  const trimmedBankName = transferBankName?.trim()
  if (!trimmedBankName) {
    throw new Error("Debes seleccionar el banco de la transferencia.")
  }
  if (!isDominicanBankName(trimmedBankName)) {
    throw new Error("El banco de transferencia seleccionado no es valido.")
  }
}

function validatePaymentSplits(paymentSplits: PaymentSplitInput[] | undefined, totalCents: number) {
  if (!paymentSplits || paymentSplits.length === 0) return

  const totalSplitCents = paymentSplits.reduce((sum, split) => sum + split.amountCents, 0)
  if (totalSplitCents !== totalCents) {
    throw new Error("La suma de los pagos divididos debe ser igual al total de la venta.")
  }

  for (const split of paymentSplits) {
    if (!Number.isInteger(split.amountCents) || split.amountCents <= 0) {
      throw new Error("Cada pago dividido debe tener un monto valido.")
    }
    if (split.method === PaymentMethod.DIVIDIR_PAGO) {
      throw new Error("Dividir pago no es un metodo valido dentro del desglose.")
    }
    validateTransferBankName(split.method, split.transferBankName)
  }
}

function calculateSaleTotalsFromResolvedLines(
  lines: Array<{
    item: { qty: number; unitPriceCents: number }
    product: { itbisRateBp: number | null }
  }>,
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
  const normalizedManualDiscountBp = normalizeDiscountPercentBp(manualDiscountPercentBp)
  if (normalizedManualDiscountBp <= 0) {
    return {
      discountSource: DocumentDiscountSource.MANUAL,
      discountPercentBp: 0,
    }
  }
  return {
    discountSource: DocumentDiscountSource.MANUAL,
    discountPercentBp: normalizedManualDiscountBp,
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

  if (input.fallback && input.fallback.discountSource) {
    return {
      discountSource: input.fallback.discountSource,
      discountPercentBp: normalizeDiscountPercentBp(input.fallback.discountPercentBp ?? 0),
    }
  }

  return resolveAutoDiscount(input.customer)
}

function parseOptionalDateInput(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Fecha de venta inválida.")
    return value
  }

  if (typeof value === "number") {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) throw new Error("Fecha de venta inválida.")
    return parsed
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    const parsed = /^\d+$/.test(trimmed) ? new Date(Number(trimmed)) : new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) throw new Error("Fecha de venta inválida.")
    return parsed
  }

  throw new Error("Fecha de venta inválida.")
}

type ResolvedConsumption = {
  ingredientId: string
  qty: number
}

type ResolvedSaleLine = {
  item: CartItemInput
  product: {
    id: string
    name: string
    priceCents: number
    itbisRateBp: number | null
    stock: number
    isActive: boolean
    isAvailableForSale: boolean
    productKind: ProductKind
  }
  recipeAdjustments: Array<{
    ingredientId: string
    ingredientName: string
    type: RecipeAdjustmentType
  }>
  consumptions: ResolvedConsumption[]
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
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

async function loadProductsForSaleResolution(
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
      stock: true,
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
        stock: decimalToNumber(product.stock),
        recipeItems: product.recipeItems.map((item) => ({
          ingredientId: item.ingredientId,
          qty: decimalToNumber(item.qty),
          ingredientName: item.ingredient.name,
        })),
      },
    ])
  )
}

function aggregateConsumptions(consumptions: ResolvedConsumption[]) {
  const byIngredientId = new Map<string, number>()

  for (const consumption of consumptions) {
    byIngredientId.set(
      consumption.ingredientId,
      roundQty((byIngredientId.get(consumption.ingredientId) ?? 0) + consumption.qty)
    )
  }

  return Array.from(byIngredientId.entries()).map(([ingredientId, qty]) => ({
    ingredientId,
    qty,
  }))
}

async function resolveSaleLines(
  tx: Prisma.TransactionClient,
  accountId: string,
  items: CartItemInput[],
  options?: {
    allowUnavailableProductIds?: Set<string>
  }
) {
  const productsById = await loadProductsForSaleResolution(
    tx,
    accountId,
    Array.from(new Set(items.map((item) => item.productId)))
  )

  const resolvedLines: ResolvedSaleLine[] = []

  for (const item of items) {
    const product = productsById.get(item.productId)
    if (!product || !product.isActive) {
      throw new Error("Hay un producto inválido o inactivo en el carrito.")
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
          stock: product.stock,
          isActive: product.isActive,
          isAvailableForSale: product.isAvailableForSale,
          productKind: product.productKind,
        },
        recipeAdjustments: [],
        consumptions: [
          {
            ingredientId: product.id,
            qty: roundQty(item.qty),
          },
        ],
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
    const adjustmentsByIngredient = new Map(
      normalizedAdjustments.map((adjustment) => [adjustment.ingredientId, adjustment.adjustmentType] as const)
    )

    for (const adjustment of normalizedAdjustments) {
      if (!recipeItemsByIngredient.has(adjustment.ingredientId)) {
        throw new Error(`El ajuste seleccionado no pertenece a la receta de "${product.name}".`)
      }
    }

    const consumptions: ResolvedConsumption[] = []
    for (const recipeItem of product.recipeItems) {
      const baseQty = roundQty(recipeItem.qty * item.qty)
      const adjustmentType = adjustmentsByIngredient.get(recipeItem.ingredientId)
      const qty =
        adjustmentType === RecipeAdjustmentType.SIN
          ? 0
          : adjustmentType === RecipeAdjustmentType.EXTRA
            ? roundQty(baseQty * 2)
            : baseQty

      if (qty === 0) continue
      consumptions.push({ ingredientId: recipeItem.ingredientId, qty })
    }

    if (consumptions.length === 0) {
      throw new Error(`Los ajustes seleccionados dejan "${product.name}" sin insumos que descontar.`)
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
        stock: product.stock,
        isActive: product.isActive,
        isAvailableForSale: product.isAvailableForSale,
        productKind: product.productKind,
      },
      recipeAdjustments: normalizedAdjustments.map((adjustment) => ({
        ingredientId: adjustment.ingredientId,
        ingredientName: recipeItemsByIngredient.get(adjustment.ingredientId)?.ingredientName ?? "Insumo",
        type: adjustment.adjustmentType,
      })),
      consumptions: aggregateConsumptions(consumptions),
    })
  }

  return resolvedLines
}

async function validateConsumptionsStock(
  tx: Prisma.TransactionClient,
  accountId: string,
  consumptions: ResolvedConsumption[],
  allowNegativeStock: boolean
) {
  if (allowNegativeStock || consumptions.length === 0) return

  const aggregatedConsumptions = aggregateConsumptions(consumptions)
  const products = await tx.product.findMany({
    where: {
      id: { in: aggregatedConsumptions.map((consumption) => consumption.ingredientId) },
      accountId,
    },
    select: {
      id: true,
      name: true,
      stock: true,
      isActive: true,
    },
  })

  const byId = new Map(products.map((product) => [product.id, product]))

  for (const consumption of aggregatedConsumptions) {
    const product = byId.get(consumption.ingredientId)
    if (!product || !product.isActive) {
      throw new Error("Hay un insumo inválido o inactivo en la receta.")
    }
    if (decimalToNumber(product.stock) < consumption.qty) {
      throw new Error(`Stock insuficiente para el insumo "${product.name}".`)
    }
  }
}

async function applyConsumptions(
  tx: Prisma.TransactionClient,
  accountId: string,
  consumptions: ResolvedConsumption[],
  direction: "increment" | "decrement"
) {
  for (const consumption of aggregateConsumptions(consumptions)) {
    const updated = await tx.product.updateMany({
      where: { id: consumption.ingredientId, accountId },
      data: {
        stock: {
          [direction]: new Decimal(consumption.qty),
        },
      },
    })

    if (updated.count === 0) {
      throw new Error("Producto no encontrado al actualizar inventario.")
    }
  }
}

export async function createSale(input: {
  customerId: string | null
  type: SaleType
  paymentMethod?: PaymentMethod | null
  transferBankName?: string | null
  paymentSplits?: PaymentSplitInput[]
  items: CartItemInput[]
  shippingCents?: number
  discountMode?: DiscountModeInput
  manualDiscountPercentBp?: number
  salePricesIncludeItbis?: boolean
  soldAt?: Date | string | number | null
  username: string
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  const soldAt = parseOptionalDateInput(input.soldAt)
  const requestedCustomerId = normalizeRequestedCustomerId(input.customerId)

  try {
    validateCartItems(input.items)
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.SALE_CREATE_ERROR,
      severity: "LOW",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/sales/actions/createSale",
      metadata: { step: "validation", itemCount: input.items.length },
    })
    throw error
  }

  // Validar permiso para cambiar tipo de venta (si no es el tipo por defecto)
  // Nota: Por defecto, todos pueden crear ventas al contado
  // Solo se valida si intenta cambiar el tipo
  // Para crédito, se asume que necesita permiso (aunque no está explícito en el schema)

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  const salePricesIncludeItbis = input.salePricesIncludeItbis ?? (settings?.salePricesIncludeItbis ?? true)

  try {
    return await prisma.$transaction(async (tx) => {
      // Validar que el Account existe
      const account = await tx.account.findUnique({
        where: { id: user.accountId },
        select: { id: true },
      })
      if (!account) {
        throw new Error("El account no existe. Por favor, inicia sesión de nuevo.")
      }

      // Validar que el User existe
      const dbUser = await tx.user.findFirst({
        where: { id: user.id, accountId: user.accountId },
        select: { id: true, accountId: true },
      })
      if (!dbUser) {
        throw new Error("El usuario no existe. Por favor, inicia sesión de nuevo.")
      }

      // Usar el permiso del usuario para vender sin stock
      const allowNegativeStock = user.canSellWithoutStock || user.isOwner

      // Invoice sequence por account
      // Usar upsert con el constraint compuesto (accountId + series)
      const seq = await tx.invoiceSequence.upsert({
        where: {
          accountId_series: {
            accountId: user.accountId,
            series: "A"
          }
        },
        update: {
          lastNumber: { increment: 1 }
        },
        create: {
          accountId: user.accountId,
          series: "A",
          lastNumber: 1
        },
      })

      const number = seq.lastNumber
      const code = invoiceCode("A", number)

      const resolvedLines = await resolveSaleLines(tx, user.accountId, input.items)

      for (const line of resolvedLines) {
        const originalPriceCents = Number(line.product.priceCents)
        const priceDiffers = line.item.unitPriceCents !== originalPriceCents

        if (priceDiffers) {
          if (!user.canOverridePrice && !user.isOwner) {
            throw new Error("No tienes permiso para modificar precios. El precio fue cambiado sin autorización.")
          }
          await logAuditEvent({
            accountId: user.accountId,
            userId: user.id,
            userEmail: user.email ?? null,
            userUsername: user.username ?? null,
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

      await validateConsumptionsStock(
        tx,
        user.accountId,
        resolvedLines.flatMap((line) => line.consumptions),
        allowNegativeStock
      )

      // Asegurar que el cliente genérico existe
      const genericCustomer = await ensureGenericCustomer(tx, user.accountId)

      // Validar y usar customerId, o usar el cliente genérico por defecto
      let finalCustomerId: string | null = null
      if (requestedCustomerId) {
        const customer = await tx.customer.findFirst({
          where: { id: requestedCustomerId, accountId: user.accountId },
          select: { id: true, accountId: true, isActive: true },
        })
        if (!customer) {
          // Si el cliente no existe, usar el cliente genérico
          console.warn(`Cliente ${requestedCustomerId} no existe, usando cliente genérico`)
          finalCustomerId = genericCustomer.id
        } else if (!customer.isActive) {
          // Si el cliente está inactivo, usar el cliente genérico
          console.warn(`Cliente ${requestedCustomerId} está inactivo, usando cliente genérico`)
          finalCustomerId = genericCustomer.id
        } else {
          finalCustomerId = customer.id
        }
      }

      const finalCustomer =
        finalCustomerId
          ? await tx.customer.findFirst({
              where: { id: finalCustomerId, accountId: user.accountId },
              select: { id: true, creditDays: true, saleDiscountPercentBp: true },
            })
          : null

      const { discountSource, discountPercentBp } = resolveDocumentDiscount({
        discountMode: input.discountMode,
        manualDiscountPercentBp: input.manualDiscountPercentBp,
        user,
        customer: finalCustomer
          ? { saleDiscountPercentBp: finalCustomer.saleDiscountPercentBp }
          : null,
      })

      const {
        discountSubtotalCents,
        subtotalCents,
        itbisCents,
        discountTotalCents,
        itemsTotalCents,
      } = calculateSaleTotalsFromResolvedLines(
        resolvedLines,
        salePricesIncludeItbis,
        discountPercentBp
      )
      const shippingCents = input.shippingCents ?? 0
      const totalCents = itemsTotalCents + shippingCents
      const paymentSplits = input.paymentSplits ?? []
      const hasPaymentSplits = paymentSplits.length > 0

      validateTransferBankName(input.paymentMethod, input.transferBankName)
      validatePaymentSplits(paymentSplits, totalCents)

      const sale = await tx.sale.create({
        data: {
          accountId: user.accountId,
          invoiceSeries: "A",
          invoiceNumber: number,
          invoiceCode: code,
          createdAt: soldAt,
          soldAt,
          type: input.type,
          paymentMethod: input.type === SaleType.CONTADO && !hasPaymentSplits ? input.paymentMethod : null,
          transferBankName:
            input.type === SaleType.CONTADO &&
            !hasPaymentSplits &&
            input.paymentMethod === PaymentMethod.TRANSFERENCIA
              ? input.transferBankName?.trim() ?? null
              : null,
          customerId: finalCustomerId,
          userId: user.id,
          subtotalCents,
          itbisCents,
          shippingCents,
          discountSource,
          discountPercentBp,
          discountSubtotalCents,
          discountTotalCents,
          totalCents,
          salePricesIncludeItbis,
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
              consumptions: {
                create: line.consumptions.map((consumption) => ({
                  ingredientId: consumption.ingredientId,
                  qty: new Decimal(consumption.qty),
                })),
              },
            })),
          },
          payments: hasPaymentSplits ? {
            create: paymentSplits.map((split) => ({
              method: split.method,
              transferBankName: split.method === PaymentMethod.TRANSFERENCIA ? split.transferBankName?.trim() ?? null : null,
              amountCents: split.amountCents,
            })),
          } : undefined,
        },
        select: {
          id: true,
          invoiceCode: true,
          type: true,
          soldAt: true,
          transferBankName: true,
          salePricesIncludeItbis: true,
          discountSource: true,
          discountPercentBp: true,
          discountSubtotalCents: true,
          discountTotalCents: true,
        },
      })

      await logAuditEvent({
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "SALE_CREATED",
        resourceType: "Sale",
        resourceId: sale.id,
        details: {
          invoiceCode: sale.invoiceCode,
          type: sale.type,
          totalCents,
          discountSource: sale.discountSource,
          discountPercentBp: sale.discountPercentBp,
        },
      }, tx)

      await applyConsumptions(
        tx,
        user.accountId,
        resolvedLines.flatMap((line) => line.consumptions),
        "decrement"
      )

      // If credit: create AR
      if (input.type === SaleType.CREDITO) {
        const customerIdForAR = finalCustomerId
        if (!customerIdForAR) {
          // Si no hay cliente, usar el genérico (aunque no debería pasar)
          throw new Error("Para crédito debes seleccionar un cliente.")
        }

        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (finalCustomer && finalCustomer.creditDays > 0) {
          dueDate = new Date(soldAt ?? new Date())
          dueDate.setDate(dueDate.getDate() + finalCustomer.creditDays)
        }

        await tx.accountReceivable.create({
          data: {
            saleId: sale.id,
            customerId: customerIdForAR,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
            dueDate,
          },
        })
      }

      revalidatePath("/", "layout")
      revalidatePath("/reports/profit")

      return sale
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.SALE_CREATE_ERROR,
      severity: "HIGH",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/sales/actions/createSale",
      metadata: {
        step: "transaction",
        type: input.type,
        itemCount: input.items.length,
        customerId: requestedCustomerId,
      },
    })
    throw error
  }
}

export async function getSaleById(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sale = await prisma.sale.findFirst({
    where: { id, accountId: user.accountId },
    include: {
      items: {
        include: {
          recipeAdjustments: true,
          consumptions: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              reference: true,
              priceCents: true,
              itbisRateBp: true,
              stock: true,
              unit: true,
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
        },
      },
      customer: true,
      user: {
        select: { name: true, username: true },
      },
      ar: true,
    },
  })

  if (!sale) return null

  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      qty: decimalToNumber(item.qty),
      recipeAdjustments: item.recipeAdjustments,
      consumptions: item.consumptions.map((consumption) => ({
        ...consumption,
        qty: decimalToNumber(consumption.qty),
      })),
      product: {
        ...item.product,
        stock: decimalToNumber(item.product.stock),
        recipeItems: item.product.recipeItems.map((recipeItem) => ({
          ingredientId: recipeItem.ingredientId,
          qty: decimalToNumber(recipeItem.qty),
          ingredientName: recipeItem.ingredient.name,
          ingredientUnit: recipeItem.ingredient.unit,
        })),
      },
    })),
  }
}

export async function cancelSale(id: string, username: string, currentUserArg?: any) {
  const user = currentUserArg ?? await getCurrentUser()
  if (!user) return { success: false, error: "No autenticado" }

  try {
    return await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, accountId: user.accountId },
        include: {
          items: {
            include: {
              consumptions: true,
            },
          },
          ar: true,
        },
      })

      if (!sale) return { success: false, error: "Venta no encontrada" }
      if (sale.cancelledAt) return { success: false, error: "Esta venta ya está cancelada" }

      // Verificar permiso para cancelar ventas
      if (!user.canCancelSales && !user.isOwner) {
        return { success: false, error: "No tienes permiso para cancelar ventas" }
      }

      // Si tiene cuenta por cobrar, verificar que no tenga pagos no cancelados
      if (sale.ar) {
        const activePayments = await tx.payment.count({
          where: {
            arId: sale.ar.id,
            cancelledAt: null,
            ar: {
              sale: {
                accountId: user.accountId,
              },
            },
          },
        })
        if (activePayments > 0) {
          return { success: false, error: "No se puede cancelar, debido a que tiene pagos aplicados" }
        }
      }

      await applyConsumptions(
        tx,
        user.accountId,
        sale.items.flatMap((item) =>
          item.consumptions.map((consumption) => ({
            ingredientId: consumption.ingredientId,
            qty: decimalToNumber(consumption.qty),
          }))
        ),
        "increment"
      )

      // Marcar como cancelada
      const cancelled = await tx.sale.updateMany({
        where: { id, accountId: user.accountId },
        data: {
          cancelledAt: new Date(),
          cancelledBy: user.id,
        },
      })
      if (cancelled.count === 0) return { success: false, error: "Error al actualizar estado de venta" }

      await logAuditEvent({
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "SALE_CANCELLED",
        resourceType: "Sale",
        resourceId: sale.id,
        details: {
          invoiceCode: sale.invoiceCode,
          totalCents: sale.totalCents,
        },
      }, tx)

      revalidatePath("/", "layout")
      revalidatePath("/reports/profit")

      return { success: true }
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.SALE_CANCEL_ERROR,
      severity: "HIGH",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/sales/actions/cancelSale",
      metadata: { saleId: id },
    })
    return { success: false, error: "Error interno al cancelar la venta" }
  }
}

export async function updateSale(input: {
  id: string
  customerId: string | null
  type: SaleType
  paymentMethod?: PaymentMethod | null
  transferBankName?: string | null
  paymentSplits?: PaymentSplitInput[]
  items: CartItemInput[]
  discountMode?: DiscountModeInput
  manualDiscountPercentBp?: number
  soldAt?: Date | string | number | null
  username?: string
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  const soldAt = parseOptionalDateInput(input.soldAt)
  const requestedCustomerId = normalizeRequestedCustomerId(input.customerId)

  validateCartItems(input.items)

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  const salePricesIncludeItbis = settings?.salePricesIncludeItbis ?? true

  // Verificar permiso para editar ventas
  if (!user.canEditSales && !user.isOwner) {
    throw new Error("No tienes permiso para editar ventas")
  }

  const allowNegativeStock = user.canSellWithoutStock || user.isOwner

  return prisma.$transaction(async (tx) => {
    const existingSale = await tx.sale.findFirst({
      where: { id: input.id, accountId: user.accountId },
      include: {
        items: {
          include: {
            consumptions: true,
            recipeAdjustments: true,
          },
        },
        payments: true,
        ar: true,
      },
    })

    if (!existingSale) throw new Error("Venta no encontrada")
    if (existingSale.cancelledAt) throw new Error("No se puede editar una venta cancelada")

    // Validar permiso para cambiar tipo de venta
    if (input.type !== existingSale.type) {
      if (!user.canChangeSaleType && !user.isOwner) {
        throw new Error("No tienes permiso para cambiar el tipo de venta")
      }
    }

    // Si tiene cuenta por cobrar, verificar que no tenga pagos no cancelados
    if (existingSale.ar) {
      const activePayments = await tx.payment.count({
        where: {
          arId: existingSale.ar.id,
          cancelledAt: null,
          ar: {
            sale: {
              accountId: user.accountId,
            },
          },
        },
      })
      if (activePayments > 0) {
        throw new Error("No se puede editar una venta a crédito que ya tiene pagos registrados")
      }
    }

    await applyConsumptions(
      tx,
      user.accountId,
      existingSale.items.flatMap((item) =>
        item.consumptions.map((consumption) => ({
          ingredientId: consumption.ingredientId,
          qty: decimalToNumber(consumption.qty),
        }))
      ),
      "increment"
    )

    const allowUnavailableProductIds = new Set(existingSale.items.map((item) => item.productId))
    const resolvedLines = await resolveSaleLines(tx, user.accountId, input.items, {
      allowUnavailableProductIds,
    })

    for (const line of resolvedLines) {
      if (line.item.unitPriceCents !== line.product.priceCents) {
        if (!user.canOverridePrice && !user.isOwner) {
          throw new Error("No tienes permiso para modificar precios. El precio fue cambiado sin autorización.")
        }
        await logAuditEvent({
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "PRICE_OVERRIDE",
          resourceType: "Product",
          resourceId: line.product.id,
          details: {
            oldPriceCents: Number(line.product.priceCents),
            newPriceCents: line.item.unitPriceCents,
          },
        }, tx)
      }
    }

    await validateConsumptionsStock(
      tx,
      user.accountId,
      resolvedLines.flatMap((line) => line.consumptions),
      allowNegativeStock
    )

    const genericCustomer = await ensureGenericCustomer(tx, user.accountId)
    let finalCustomerId: string | null = null
    if (requestedCustomerId) {
      const requestedCustomer = await tx.customer.findFirst({
        where: { id: requestedCustomerId, accountId: user.accountId },
        select: { id: true, isActive: true },
      })
      if (!requestedCustomer || !requestedCustomer.isActive) {
        finalCustomerId = genericCustomer.id
      } else {
        finalCustomerId = requestedCustomer.id
      }
    }

    const finalCustomer =
      finalCustomerId
        ? await tx.customer.findFirst({
            where: { id: finalCustomerId, accountId: user.accountId },
            select: { id: true, creditDays: true, saleDiscountPercentBp: true },
          })
        : null

    const { discountSource, discountPercentBp } = resolveDocumentDiscount({
      discountMode: input.discountMode,
      manualDiscountPercentBp: input.manualDiscountPercentBp,
      user,
      customer: finalCustomer
        ? { saleDiscountPercentBp: finalCustomer.saleDiscountPercentBp }
        : null,
      fallback: {
        discountSource: existingSale.discountSource,
        discountPercentBp: existingSale.discountPercentBp,
      },
    })

    // Eliminar items anteriores
    await tx.saleItem.deleteMany({
      where: { saleId: input.id, sale: { accountId: user.accountId } },
    })

    // Calcular nuevos totales
    const documentSalePricesIncludeItbis = existingSale.salePricesIncludeItbis ?? salePricesIncludeItbis
    const {
      discountSubtotalCents,
      subtotalCents,
      itbisCents,
      discountTotalCents,
      itemsTotalCents,
    } = calculateSaleTotalsFromResolvedLines(
      resolvedLines,
      documentSalePricesIncludeItbis,
      discountPercentBp
    )
    const shippingCents = existingSale.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents
    const hasPaymentSplits = Boolean(input.paymentSplits && input.paymentSplits.length > 0)

    validateTransferBankName(input.paymentMethod, input.transferBankName)
    validatePaymentSplits(input.paymentSplits, totalCents)

    await tx.salePayment.deleteMany({
      where: { saleId: input.id },
    })

    // Actualizar la venta
    const updatedSale = await tx.sale.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        soldAt,
        type: input.type,
        paymentMethod: input.type === SaleType.CONTADO && !hasPaymentSplits ? input.paymentMethod : null,
        transferBankName:
          input.type === SaleType.CONTADO &&
          !hasPaymentSplits &&
          input.paymentMethod === PaymentMethod.TRANSFERENCIA
            ? input.transferBankName?.trim() ?? null
            : null,
        customerId: finalCustomerId || null,
        subtotalCents,
        itbisCents,
        shippingCents,
        discountSource,
        discountPercentBp,
        discountSubtotalCents,
        discountTotalCents,
        totalCents,
        salePricesIncludeItbis: documentSalePricesIncludeItbis,
      },
    })
    if (updatedSale.count === 0) throw new Error("Venta no encontrada")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "SALE_EDITED",
      resourceType: "Sale",
      resourceId: input.id,
      details: {
        type: input.type,
        totalCents,
        discountSource,
        discountPercentBp,
      },
    }, tx)

    for (const line of resolvedLines) {
      await tx.saleItem.create({
        data: {
          saleId: input.id,
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
          consumptions: {
            create: line.consumptions.map((consumption) => ({
              ingredientId: consumption.ingredientId,
              qty: new Decimal(consumption.qty),
            })),
          },
        },
      })
    }

    if (hasPaymentSplits) {
      await tx.salePayment.createMany({
        data: input.paymentSplits!.map((split) => ({
          saleId: input.id,
          method: split.method,
          amountCents: split.amountCents,
          transferBankName: split.method === PaymentMethod.TRANSFERENCIA ? split.transferBankName?.trim() ?? null : null,
        })),
      })
    }

    await applyConsumptions(
      tx,
      user.accountId,
      resolvedLines.flatMap((line) => line.consumptions),
      "decrement"
    )

    // Actualizar o crear cuenta por cobrar si es crédito
    if (input.type === SaleType.CREDITO) {
      const customerId = finalCustomerId
      if (!customerId) throw new Error("Para crédito debes seleccionar un cliente.")

      if (existingSale.ar) {
        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (finalCustomer && finalCustomer.creditDays > 0) {
          dueDate = new Date(soldAt ?? existingSale.soldAt ?? new Date())
          dueDate.setDate(dueDate.getDate() + finalCustomer.creditDays)
        }

        const updatedAr = await tx.accountReceivable.updateMany({
          where: {
            id: existingSale.ar.id,
            sale: { accountId: user.accountId },
          },
          data: {
            customerId,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
            dueDate,
          },
        })
        if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")
      } else {
        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (finalCustomer && finalCustomer.creditDays > 0) {
          dueDate = new Date(soldAt ?? existingSale.soldAt ?? new Date())
          dueDate.setDate(dueDate.getDate() + finalCustomer.creditDays)
        }

        await tx.accountReceivable.create({
          data: {
            saleId: input.id,
            customerId,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
            dueDate,
          },
        })
      }
    } else if (existingSale.ar) {
      // Si cambió de crédito a contado, eliminar cuenta por cobrar
      const deleted = await tx.accountReceivable.deleteMany({
        where: { id: existingSale.ar.id, sale: { accountId: user.accountId } },
      })
      if (deleted.count === 0) throw new Error("Cuenta por cobrar no encontrada")
    }

    revalidatePath("/", "layout")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

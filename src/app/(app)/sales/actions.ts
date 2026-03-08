"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded, invoiceCode } from "@/lib/money"
import { Decimal } from "@prisma/client/runtime/library"
import { ProductKind, SaleType, PaymentMethod, type Prisma } from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logError, ErrorCodes } from "@/lib/error-logger"
import { isDominicanBankName } from "@/lib/dominican-banks"

// Helper para convertir Decimal a número
function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
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
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      saleUnit: true,
      productKind: true,
      recipeModifiers: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
  }))
}

export async function listAllProductsForSale() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
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
      saleUnit: true,
      productKind: true,
      recipeModifiers: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
        },
      },
    },
    take: 500,
  })

  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
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
      saleUnit: true,
      productKind: true,
      recipeModifiers: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!product) return null

  return {
    ...product,
    stock: decimalToNumber(product.stock),
  }
}

export async function listCustomers() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Asegurar que el cliente general existe (con manejo de condiciones de carrera)
  try {
    const existingGeneric = await prisma.customer.findFirst({
      where: {
        accountId: user.accountId,
        isGeneric: true,
      },
    })

    if (!existingGeneric) {
      await prisma.customer.create({
        data: {
          accountId: user.accountId,
          name: "Cliente general",
          isGeneric: true,
          isActive: true,
        },
      })
    }
  } catch (error: any) {
    // Si ya existe por condición de carrera, ignorar silenciosamente
    if (error?.code !== "P2002") {
      console.error("Error asegurando cliente genérico:", error)
    }
  }

  return prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isGeneric: true },
    take: 50,
  })
}

export async function listSales(options?: { query?: string; cursor?: string | null; take?: number }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = options?.query?.trim()
  const take = Math.min(Math.max(options?.take ?? 50, 1), 200)

  const sales = await prisma.sale.findMany({
    where: {
      accountId: user.accountId,
      ...(q
        ? {
          OR: [
            { invoiceCode: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
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
      customer: { select: { name: true } },
    },
  })

  const hasMore = sales.length > take
  const pageItems = hasMore ? sales.slice(0, take) : sales
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null

  return {
    items: pageItems,
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
  selectedModifierIds?: string[]
}

type PaymentSplitInput = {
  method: PaymentMethod
  amountCents: number
  transferBankName?: string | null
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
    stock: number
    isActive: boolean
    productKind: ProductKind
  }
  selectedModifiers: Array<{ id: string; name: string }>
  consumptions: ResolvedConsumption[]
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
}

function normalizeModifierIds(modifierIds: string[] | undefined) {
  const normalized = Array.from(
    new Set(
      (modifierIds ?? [])
        .map((modifierId) => String(modifierId ?? "").trim())
        .filter(Boolean)
    )
  )

  return normalized
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
      stock: true,
      isActive: true,
      productKind: true,
      recipeItems: {
        select: {
          ingredientId: true,
          qty: true,
        },
      },
      recipeModifiers: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          items: {
            select: {
              ingredientId: true,
              qtyDelta: true,
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
        })),
        recipeModifiers: product.recipeModifiers.map((modifier) => ({
          ...modifier,
          items: modifier.items.map((item) => ({
            ingredientId: item.ingredientId,
            qtyDelta: decimalToNumber(item.qtyDelta),
          })),
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
  items: CartItemInput[]
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

    if (product.productKind !== ProductKind.RECIPE) {
      resolvedLines.push({
        item: {
          ...item,
          selectedModifierIds: [],
        },
        product: {
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          stock: product.stock,
          isActive: product.isActive,
          productKind: product.productKind,
        },
        selectedModifiers: [],
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

    const selectedModifierIds = normalizeModifierIds(item.selectedModifierIds)
    const modifiersById = new Map(product.recipeModifiers.map((modifier) => [modifier.id, modifier]))
    const selectedModifiers = selectedModifierIds.map((modifierId) => {
      const modifier = modifiersById.get(modifierId)
      if (!modifier) {
        throw new Error(`El modificador seleccionado ya no existe para "${product.name}".`)
      }
      return modifier
    })

    const ingredientMap = new Map<string, number>()
    for (const recipeItem of product.recipeItems) {
      ingredientMap.set(recipeItem.ingredientId, roundQty(recipeItem.qty * item.qty))
    }

    for (const modifier of selectedModifiers) {
      for (const modifierItem of modifier.items) {
        ingredientMap.set(
          modifierItem.ingredientId,
          roundQty((ingredientMap.get(modifierItem.ingredientId) ?? 0) + modifierItem.qtyDelta * item.qty)
        )
      }
    }

    const consumptions: ResolvedConsumption[] = []
    for (const [ingredientId, qty] of ingredientMap.entries()) {
      if (qty < 0) {
        throw new Error(`Los modificadores seleccionados dejan un consumo negativo en "${product.name}".`)
      }
      if (qty === 0) continue
      consumptions.push({ ingredientId, qty })
    }

    if (consumptions.length === 0) {
      throw new Error(`Los modificadores seleccionados dejan "${product.name}" sin insumos que descontar.`)
    }

    resolvedLines.push({
      item: {
        ...item,
        selectedModifierIds,
      },
      product: {
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        stock: product.stock,
        isActive: product.isActive,
        productKind: product.productKind,
      },
      selectedModifiers: selectedModifiers.map((modifier) => ({
        id: modifier.id,
        name: modifier.name,
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
  soldAt?: Date | string | number | null
  username: string
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  const soldAt = parseOptionalDateInput(input.soldAt)

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
  const itbisRateBp = settings?.itbisRateBp ?? 1800

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
      const allowNegativeStock = user.canSellWithoutStock || user.role === "ADMIN"

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
          if (!user.canOverridePrice && user.role !== "ADMIN") {
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
      let genericCustomer = await tx.customer.findFirst({
        where: {
          accountId: user.accountId,
          isGeneric: true,
        },
      })

      if (!genericCustomer) {
        genericCustomer = await tx.customer.create({
          data: {
            accountId: user.accountId,
            name: "Cliente general",
            isGeneric: true,
            isActive: true,
          },
        })
      }

      const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
      const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
      const shippingCents = input.shippingCents ?? 0
      const totalCents = itemsTotalCents + shippingCents
      const paymentSplits = input.paymentSplits ?? []
      const hasPaymentSplits = paymentSplits.length > 0

      validateTransferBankName(input.paymentMethod, input.transferBankName)
      validatePaymentSplits(paymentSplits, totalCents)

      // Validar y usar customerId, o usar el cliente genérico por defecto
      let finalCustomerId: string | null = null
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, accountId: user.accountId },
          select: { id: true, accountId: true, isActive: true },
        })
        if (!customer) {
          // Si el cliente no existe, usar el cliente genérico
          console.warn(`Cliente ${input.customerId} no existe, usando cliente genérico`)
          finalCustomerId = genericCustomer.id
        } else if (!customer.isActive) {
          // Si el cliente está inactivo, usar el cliente genérico
          console.warn(`Cliente ${input.customerId} está inactivo, usando cliente genérico`)
          finalCustomerId = genericCustomer.id
        } else {
          finalCustomerId = customer.id
        }
      }

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
          totalCents,
          items: {
            create: resolvedLines.map((line) => ({
              productId: line.item.productId,
              qty: line.item.qty,
              unitPriceCents: line.item.unitPriceCents,
              wasPriceOverridden: line.item.wasPriceOverridden,
              lineTotalCents: line.item.unitPriceCents * line.item.qty,
              selectedRecipeModifiers: line.selectedModifiers.length
                ? {
                    create: line.selectedModifiers.map((modifier) => ({
                      modifierId: modifier.id,
                      modifierName: modifier.name,
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
        select: { id: true, invoiceCode: true, type: true, soldAt: true, transferBankName: true },
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

        // Obtener los días de crédito del cliente
        const customer = await tx.customer.findUnique({
          where: { id: customerIdForAR },
          select: { creditDays: true },
        })

        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (customer && customer.creditDays > 0) {
          dueDate = new Date(soldAt ?? new Date())
          dueDate.setDate(dueDate.getDate() + customer.creditDays)
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

      revalidatePath("/sales")
      revalidatePath("/ar")
      revalidatePath("/dashboard")

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
        customerId: input.customerId,
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
          selectedRecipeModifiers: true,
          consumptions: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              reference: true,
              priceCents: true,
              stock: true,
              saleUnit: true,
              productKind: true,
              recipeModifiers: {
                where: { isActive: true },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  name: true,
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
      selectedRecipeModifiers: item.selectedRecipeModifiers,
      consumptions: item.consumptions.map((consumption) => ({
        ...consumption,
        qty: decimalToNumber(consumption.qty),
      })),
      product: {
        ...item.product,
        stock: decimalToNumber(item.product.stock),
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
      if (!user.canCancelSales && user.role !== "ADMIN") {
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

      revalidatePath("/sales")
      revalidatePath("/sales/list")
      revalidatePath("/ar")
      revalidatePath("/dashboard")
      revalidatePath("/reports/sales")
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
  soldAt?: Date | string | number | null
  username?: string
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  const soldAt = parseOptionalDateInput(input.soldAt)

  validateCartItems(input.items)

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  // Verificar permiso para editar ventas
  if (!user.canEditSales && user.role !== "ADMIN") {
    throw new Error("No tienes permiso para editar ventas")
  }

  const allowNegativeStock = user.canSellWithoutStock || user.role === "ADMIN"

  return prisma.$transaction(async (tx) => {
    const existingSale = await tx.sale.findFirst({
      where: { id: input.id, accountId: user.accountId },
      include: {
        items: {
          include: {
            consumptions: true,
            selectedRecipeModifiers: true,
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
      if (!user.canChangeSaleType && user.role !== "ADMIN") {
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

    const resolvedLines = await resolveSaleLines(tx, user.accountId, input.items)

    for (const line of resolvedLines) {
      if (line.item.unitPriceCents !== line.product.priceCents) {
        if (!user.canOverridePrice && user.role !== "ADMIN") {
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

    // Eliminar items anteriores
    await tx.saleItem.deleteMany({
      where: { saleId: input.id, sale: { accountId: user.accountId } },
    })

    // Calcular nuevos totales
    const totalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(totalCents, itbisRateBp)
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
        customerId: input.customerId || null,
        subtotalCents,
        itbisCents,
        totalCents,
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
          lineTotalCents: line.item.unitPriceCents * line.item.qty,
          selectedRecipeModifiers: line.selectedModifiers.length
            ? {
                create: line.selectedModifiers.map((modifier) => ({
                  modifierId: modifier.id,
                  modifierName: modifier.name,
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
      const customerId = input.customerId
      if (!customerId) throw new Error("Para crédito debes seleccionar un cliente.")

      if (existingSale.ar) {
        // Obtener los días de crédito del cliente
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { creditDays: true },
        })

        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (customer && customer.creditDays > 0) {
          dueDate = new Date(soldAt ?? existingSale.soldAt ?? new Date())
          dueDate.setDate(dueDate.getDate() + customer.creditDays)
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
        // Obtener los días de crédito del cliente
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { creditDays: true },
        })

        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (customer && customer.creditDays > 0) {
          dueDate = new Date(soldAt ?? existingSale.soldAt ?? new Date())
          dueDate.setDate(dueDate.getDate() + customer.creditDays)
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

    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/reports/sales")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

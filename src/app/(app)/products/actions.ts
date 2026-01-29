"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { UnitType } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString, sanitizeCode } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"
import { logError, ErrorCodes } from "@/lib/error-logger"
import { unitAllowsDecimals, decimalToNumber } from "@/lib/units"
import { INITIAL_STOCK_REASON } from "@/lib/inventory"

type InventoryAdjustmentClient = {
  inventoryAdjustment: {
    create: (args: { data: any }) => Promise<any>
  }
}

async function safeCreateInventoryAdjustment(client: InventoryAdjustmentClient, data: any) {
  try {
    await client.inventoryAdjustment.create({ data })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2021") {
      return
    }
    console.error("Error creating inventory adjustment:", error)
  }
}

export async function listProducts(options?: { query?: string; cursor?: string | null; take?: number; user?: any }) {
  const user = options?.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = options?.query?.trim()
  const take = Math.min(Math.max(options?.take ?? 50, 1), 200)

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { supplier: true, category: true },
    orderBy: [{ productId: "asc" }, { id: "asc" }],
    cursor: options?.cursor ? { id: options.cursor } : undefined,
    skip: options?.cursor ? 1 : 0,
    take: take + 1,
  })
  
  const hasMore = products.length > take
  const pageItems = hasMore ? products.slice(0, take) : products
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null

  // Convertir Decimal a número y Date a string para serialización
  return {
    items: pageItems.map((p) => ({
      ...p,
      stock: p.stock instanceof Decimal ? p.stock.toNumber() : Number(p.stock),
      minStock: p.minStock instanceof Decimal ? p.minStock.toNumber() : Number(p.minStock),
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
      supplier: p.supplier ? {
        ...p.supplier,
        createdAt: p.supplier.createdAt instanceof Date ? p.supplier.createdAt.toISOString() : p.supplier.createdAt,
        updatedAt: p.supplier.updatedAt instanceof Date ? p.supplier.updatedAt.toISOString() : p.supplier.updatedAt,
      } : null,
      category: p.category ? {
        ...p.category,
        createdAt: p.category.createdAt instanceof Date ? p.category.createdAt.toISOString() : p.category.createdAt,
        updatedAt: p.category.updatedAt instanceof Date ? p.category.updatedAt.toISOString() : p.category.updatedAt,
      } : null,
    })),
    nextCursor,
  }
}

export async function upsertProduct(input: {
  id?: string
  productId?: string
  name: string
  sku?: string | null
  reference?: string | null
  supplierId?: string | null
  categoryId?: string | null
  priceCents: number
  costCents: number
  itbisRateBp?: number
  stock: number
  minStock: number
  imageUrls?: string[]
  purchaseUnit: UnitType
  saleUnit: UnitType
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  try {
    const name = sanitizeString(input.name)
  if (!name) throw new Error("El nombre del producto es requerido")
  if (!input.priceCents || input.priceCents <= 0) throw new Error("El precio de venta es requerido")
  if (!input.costCents || input.costCents < 0) throw new Error("El costo es requerido")
  if (!input.saleUnit) throw new Error("La unidad de venta es requerida")
  if (!input.purchaseUnit) throw new Error("La unidad de compra es requerida")

  const sanitizedSku = input.sku ? sanitizeCode(input.sku) : ""
  const sanitizedReference = input.reference ? sanitizeCode(input.reference) : ""
  const sku = sanitizedSku || null
  const reference = sanitizedReference || null
  const imageUrls = input.imageUrls || []

  if (input.id) {
    // Verificar permiso para editar productos
    if (!user.canEditProducts && user.role !== "ADMIN") {
      throw new Error("No tienes permiso para editar productos")
    }

    // Verificar que el producto pertenece al account
    const existing = await prisma.product.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Producto no encontrado")

    // Verificar permiso para modificar precio si es diferente al original
    const originalPriceCents = Number(existing.priceCents)
    if (input.priceCents !== originalPriceCents) {
      if (!user.canOverridePrice && user.role !== "ADMIN") {
        throw new Error("No tienes permiso para modificar el precio del producto")
      }
    }

    const updated = await prisma.product.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        name,
        sku,
        reference,
        supplierId: input.supplierId || null,
        categoryId: input.categoryId || null,
        priceCents: input.priceCents,
        costCents: input.costCents,
        itbisRateBp: input.itbisRateBp ?? 1800,
        minStock: input.minStock,
        imageUrls,
        purchaseUnit: input.purchaseUnit,
        saleUnit: input.saleUnit,
      },
    })
    if (updated.count === 0) throw new Error("Producto no encontrado")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "PRODUCT_EDITED",
      resourceType: "Product",
      resourceId: input.id,
      details: {
        name,
        sku,
        reference,
      },
    })
  } else {
    // Obtener el siguiente productId de la secuencia
    const seq = await prisma.productSequence.upsert({
      where: { accountId: user.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: user.accountId, lastNumber: 1 },
    })

    const productId = seq.lastNumber

    const created = await prisma.product.create({
      data: {
        accountId: user.accountId,
        productId,
        name,
        sku,
        reference,
        supplierId: input.supplierId || null,
        categoryId: input.categoryId || null,
        priceCents: input.priceCents,
        costCents: input.costCents,
        itbisRateBp: input.itbisRateBp ?? 1800,
        stock: input.stock,
        minStock: input.minStock,
        imageUrls,
        purchaseUnit: input.purchaseUnit,
        saleUnit: input.saleUnit,
      },
    })

    const initialAllowsDecimals = unitAllowsDecimals(input.saleUnit)
    const initialRaw = Number(input.stock)
    const initialStock = Number.isFinite(initialRaw)
      ? (initialAllowsDecimals ? Math.round(initialRaw * 100) / 100 : Math.trunc(initialRaw))
      : 0
    await safeCreateInventoryAdjustment(prisma, {
      accountId: user.accountId,
      productId: created.id,
      userId: user.id,
      qtyDelta: new Decimal(initialStock),
      reason: INITIAL_STOCK_REASON,
      note: null,
      batchId: null,
      createdAt: created.createdAt,
    })

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "PRODUCT_CREATED",
      resourceType: "Product",
      resourceId: created.id,
      details: {
        name,
        sku,
        reference,
        productId,
      },
    })
  }

  revalidatePath("/products")
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.INVENTORY_UPDATE_ERROR,
      severity: "MEDIUM",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/products/actions/upsertProduct",
      metadata: { 
        productId: input.id,
        isNew: !input.id,
        name: input.name,
      },
    })
    throw error
  }
}

export async function deactivateProduct(productId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Verificar que el producto pertenece al account
  const existing = await prisma.product.findFirst({
    where: { id: productId, accountId: user.accountId },
  })
  if (!existing) throw new Error("Producto no encontrado")

  const updated = await prisma.product.updateMany({
    where: { id: productId, accountId: user.accountId },
    data: { isActive: false },
  })
  if (updated.count === 0) throw new Error("Producto no encontrado")

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "PRODUCT_DELETED",
    resourceType: "Product",
    resourceId: productId,
  })
  revalidatePath("/products")
}

type BulkStockAdjustmentItem = {
  productId: number
  delta: number
}

function normalizeDelta(delta: number, allowsDecimals: boolean) {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("La cantidad debe ser un número distinto de 0.")
  }
  if (!allowsDecimals && !Number.isInteger(delta)) {
    throw new Error("Este producto solo permite cantidades enteras.")
  }
  if (!allowsDecimals) {
    return Math.trunc(delta)
  }
  // Redondear a 2 decimales para mantener consistencia con UI
  return Math.round(delta * 100) / 100
}

export async function adjustManyStock(input: {
  items: BulkStockAdjustmentItem[]
  reason?: string
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  if (!user.canEditProducts && user.role !== "ADMIN") {
    throw new Error("No tienes permiso para ajustar inventario")
  }

  try {
    const rawItems = input.items ?? []
    if (!rawItems.length) {
      throw new Error("No hay ajustes para aplicar")
    }

    const parsedItems: BulkStockAdjustmentItem[] = rawItems.map((item) => {
      const productId = Number(item.productId)
      const delta = Number(item.delta)
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error(`ID de producto inválido: ${item.productId}`)
      }
      if (!Number.isFinite(delta) || delta === 0) {
        throw new Error(`Cantidad inválida para el producto ${productId}`)
      }
      return { productId, delta }
    })

    const productIds = Array.from(new Set(parsedItems.map((i) => i.productId)))
    const products = await prisma.product.findMany({
      where: {
        accountId: user.accountId,
        productId: { in: productIds },
        isActive: true,
      },
      select: {
        id: true,
        productId: true,
        saleUnit: true,
      },
    })

    if (products.length !== productIds.length) {
      const found = new Set(products.map((p) => p.productId))
      const missing = productIds.filter((id) => !found.has(id))
      throw new Error(`Productos no encontrados o inactivos: ${missing.join(", ")}`)
    }

    const byProductId = new Map(products.map((p) => [p.productId, p]))
    const aggregated = new Map<number, number>()
    for (const item of parsedItems) {
      const product = byProductId.get(item.productId)
      if (!product) {
        throw new Error(`Producto no encontrado: ${item.productId}`)
      }
      const allowsDecimals = unitAllowsDecimals(product.saleUnit)
      const normalizedDelta = normalizeDelta(item.delta, allowsDecimals)
      aggregated.set(item.productId, (aggregated.get(item.productId) ?? 0) + normalizedDelta)
    }

    const items: BulkStockAdjustmentItem[] = Array.from(aggregated.entries())
      .map(([productId, delta]) => ({ productId, delta }))
      .filter((item) => item.delta !== 0)

    if (!items.length) {
      throw new Error("No hay ajustes para aplicar")
    }
    const reason = sanitizeString(input.reason ?? "") || null
    const batchId = items.length > 1 ? randomUUID() : null

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const product = byProductId.get(item.productId)
        if (!product) {
          throw new Error(`Producto no encontrado: ${item.productId}`)
        }

        const allowsDecimals = unitAllowsDecimals(product.saleUnit)
        const normalizedDelta = normalizeDelta(item.delta, allowsDecimals)

        const stockUpdate = normalizedDelta >= 0
          ? { increment: normalizedDelta }
          : { decrement: Math.abs(normalizedDelta) }
        const updated = await tx.product.updateMany({
          where: { id: product.id, accountId: user.accountId },
          data: { stock: stockUpdate },
        })
        if (updated.count === 0) {
          throw new Error(`Producto no encontrado: ${item.productId}`)
        }

        await tx.inventoryAdjustment.create({
          data: {
            accountId: user.accountId,
            productId: product.id,
            userId: user.id,
            qtyDelta: new Decimal(normalizedDelta),
            reason,
            note: null,
            batchId,
          },
        })

        await logAuditEvent({
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "STOCK_ADJUSTED",
          resourceType: "Product",
          resourceId: product.id,
          details: {
            productId: item.productId,
            delta: normalizedDelta,
            reason,
            batchId,
            source: "bulk",
          },
        }, tx)
      }
    })

    revalidatePath("/products")
    revalidatePath("/reports/inventory")

    return { count: items.length, batchId }
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.INVENTORY_UPDATE_ERROR,
      severity: "MEDIUM",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/products/actions/adjustManyStock",
      metadata: {
        itemCount: input.items?.length ?? 0,
      },
    })
    throw error
  }
}

type MovementType =
  | "SALE"
  | "SALE_CANCELLED"
  | "PURCHASE"
  | "PURCHASE_CANCELLED"
  | "RETURN"
  | "RETURN_CANCELLED"
  | "ADJUSTMENT"
  | "INITIAL"

export async function listProductMovements(input: {
  productId: string
  from?: string
  to?: string
  take?: number
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const take = Math.min(Math.max(input.take ?? 200, 1), 500)

  const fromDate = input.from && !Number.isNaN(new Date(input.from).getTime())
    ? new Date(input.from)
    : null
  const toDate = input.to && !Number.isNaN(new Date(input.to).getTime())
    ? new Date(input.to)
    : null

  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? "")) {
    fromDate.setHours(0, 0, 0, 0)
  }
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? "")) {
    toDate.setHours(23, 59, 59, 999)
  }

  const dateFilter = (fromDate || toDate)
    ? {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      }
    : undefined

  const withinRange = (date: Date) => {
    if (fromDate && date < fromDate) return false
    if (toDate && date > toDate) return false
    return true
  }

  const formatActor = (actor?: { username?: string | null; name?: string | null } | null) => {
    if (!actor) return null
    if (actor.username) return `@${actor.username}`
    return actor.name ?? null
  }

  const [saleItems, purchaseItems, returnItems, adjustments, initialAdjustment] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        productId: input.productId,
        sale: {
          accountId: user.accountId,
          ...(dateFilter ? { OR: [{ soldAt: dateFilter }, { cancelledAt: dateFilter }] } : {}),
        },
      },
      include: {
        sale: {
          select: {
            soldAt: true,
            cancelledAt: true,
            invoiceCode: true,
            user: { select: { username: true, name: true } },
            cancelledUser: { select: { username: true, name: true } },
          },
        },
      },
      take,
    }),
    prisma.purchaseItem.findMany({
      where: {
        productId: input.productId,
        purchase: {
          accountId: user.accountId,
          ...(dateFilter ? { OR: [{ purchasedAt: dateFilter }, { cancelledAt: dateFilter }] } : {}),
        },
      },
      include: {
        purchase: {
          select: {
            id: true,
            purchasedAt: true,
            cancelledAt: true,
            supplierName: true,
            user: { select: { username: true, name: true } },
            cancelledUser: { select: { username: true, name: true } },
          },
        },
      },
      take,
    }),
    prisma.returnItem.findMany({
      where: {
        productId: input.productId,
        return: {
          accountId: user.accountId,
          ...(dateFilter ? { OR: [{ returnedAt: dateFilter }, { cancelledAt: dateFilter }] } : {}),
        },
      },
      include: {
        return: {
          select: {
            returnCode: true,
            returnedAt: true,
            cancelledAt: true,
            user: { select: { username: true, name: true } },
            cancelledUser: { select: { username: true, name: true } },
          },
        },
      },
      take,
    }),
    prisma.inventoryAdjustment.findMany({
      where: {
        accountId: user.accountId,
        productId: input.productId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: {
        user: { select: { username: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.inventoryAdjustment.findFirst({
      where: {
        accountId: user.accountId,
        productId: input.productId,
        reason: INITIAL_STOCK_REASON,
      },
      include: {
        user: { select: { username: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const movements: {
    id: string
    occurredAt: string
    type: MovementType
    qtyDelta: number
    reference: string | null
    note: string | null
    actor: string | null
  }[] = []

  for (const item of saleItems) {
    const qty = decimalToNumber(item.qty)
    const sale = item.sale
    if (sale.soldAt) {
      movements.push({
        id: `sale:${item.id}`,
        occurredAt: sale.soldAt.toISOString(),
        type: "SALE",
        qtyDelta: -qty,
        reference: sale.invoiceCode,
        note: null,
        actor: formatActor(sale.user),
      })
    }
    if (sale.cancelledAt) {
      movements.push({
        id: `sale-cancel:${item.id}`,
        occurredAt: sale.cancelledAt.toISOString(),
        type: "SALE_CANCELLED",
        qtyDelta: qty,
        reference: sale.invoiceCode,
        note: null,
        actor: formatActor(sale.cancelledUser ?? sale.user),
      })
    }
  }

  for (const item of purchaseItems) {
    const qty = decimalToNumber(item.qty)
    const purchase = item.purchase
    if (purchase.purchasedAt) {
      movements.push({
        id: `purchase:${item.id}`,
        occurredAt: purchase.purchasedAt.toISOString(),
        type: "PURCHASE",
        qtyDelta: qty,
        reference: purchase.id,
        note: purchase.supplierName ?? null,
        actor: formatActor(purchase.user),
      })
    }
    if (purchase.cancelledAt) {
      movements.push({
        id: `purchase-cancel:${item.id}`,
        occurredAt: purchase.cancelledAt.toISOString(),
        type: "PURCHASE_CANCELLED",
        qtyDelta: -qty,
        reference: purchase.id,
        note: purchase.supplierName ?? null,
        actor: formatActor(purchase.cancelledUser ?? purchase.user),
      })
    }
  }

  for (const item of returnItems) {
    const qty = decimalToNumber(item.qty)
    const ret = item.return
    if (ret.returnedAt) {
      movements.push({
        id: `return:${item.id}`,
        occurredAt: ret.returnedAt.toISOString(),
        type: "RETURN",
        qtyDelta: qty,
        reference: ret.returnCode,
        note: null,
        actor: formatActor(ret.user),
      })
    }
    if (ret.cancelledAt) {
      movements.push({
        id: `return-cancel:${item.id}`,
        occurredAt: ret.cancelledAt.toISOString(),
        type: "RETURN_CANCELLED",
        qtyDelta: -qty,
        reference: ret.returnCode,
        note: null,
        actor: formatActor(ret.cancelledUser ?? ret.user),
      })
    }
  }

  for (const adj of adjustments) {
    if (adj.reason === INITIAL_STOCK_REASON) continue
    const qty = decimalToNumber(adj.qtyDelta)
    movements.push({
      id: `adjust:${adj.id}`,
      occurredAt: adj.createdAt.toISOString(),
      type: "ADJUSTMENT",
      qtyDelta: qty,
      reference: null,
      note: adj.reason ?? adj.note ?? null,
      actor: formatActor(adj.user),
    })
  }

  let initialMovement: {
    id: string
    occurredAt: string
    type: MovementType
    qtyDelta: number
    reference: string | null
    note: string | null
    actor: string | null
  } | null = null

  if (initialAdjustment) {
    const occurredAt = initialAdjustment.createdAt
    if (withinRange(occurredAt)) {
      initialMovement = {
        id: `initial:${initialAdjustment.id}`,
        occurredAt: occurredAt.toISOString(),
        type: "INITIAL",
        qtyDelta: decimalToNumber(initialAdjustment.qtyDelta),
        reference: "Creación",
        note: INITIAL_STOCK_REASON,
        actor: formatActor(initialAdjustment.user),
      }
    }
  }

  const filtered = movements.filter((m) => withinRange(new Date(m.occurredAt)))
  filtered.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  const limit = Math.max(take - (initialMovement ? 1 : 0), 0)
  const limited = filtered.slice(0, limit)

  return initialMovement ? [initialMovement, ...limited] : limited
}

"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { UnitType, type Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser, type CurrentUser } from "@/lib/auth"
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

function safeRevalidate(path: string) {
  try {
    revalidatePath(path)
  } catch (error) {
    // En algunos contextos (p. ej. route handlers/API) no existe store de revalidate.
    console.warn(`revalidatePath(${path}) no disponible en este contexto`, error)
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

  safeRevalidate("/products")
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
  safeRevalidate("/products")
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

export type BulkProductImportRow = {
  rowNumber: number
  nombre?: string
  sku?: string
  referencia?: string
  tipo_producto?: "BASICO" | "MEDIDO"
  unidad_compra?: UnitType
  unidad_venta?: UnitType
  precio_venta?: number
  costo?: number
  itbis?: number
  stock?: number
  stock_minimo?: number
  categoria?: string
  proveedor?: string
  imagenes?: string
}

export type BulkProductImportChunkInput = {
  rows: BulkProductImportRow[]
  reason?: string
  user?: unknown
}

export type BulkProductImportRowResult = {
  rowNumber: number
  status: "CREATED" | "UPDATED" | "FAILED"
  productId?: number
  sku?: string | null
  name?: string
  message: string
}

export type BulkProductImportChunkResult = {
  created: number
  updated: number
  failed: number
  results: BulkProductImportRowResult[]
}

const IMPORT_REASON_DEFAULT = "Importación masiva Excel"
const MAX_IMPORT_ROWS_PER_CHUNK = 200

function hasImportValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}

function parseImportNumber(value: unknown, fieldLabel: string) {
  if (!hasImportValue(value)) return null
  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} inválido`)
  }
  return parsed
}

function parseImportItbisBp(value: unknown) {
  const percent = parseImportNumber(value, "ITBIS")
  if (percent === null) return null
  if (percent < 0 || percent > 100) {
    throw new Error("ITBIS debe estar entre 0 y 100")
  }
  return Math.round(percent * 100)
}

function parseImportUnit(value: unknown) {
  if (!hasImportValue(value)) return null
  const raw = String(value).trim().toUpperCase()
  const map: Record<string, UnitType> = {
    UNIDAD: "UNIDAD",
    UND: "UNIDAD",
    U: "UNIDAD",
    KG: "KG",
    KILO: "KG",
    KILOGRAMO: "KG",
    KILOGRAMOS: "KG",
    LIBRA: "LIBRA",
    LIBRAS: "LIBRA",
    LB: "LIBRA",
    GRAMO: "GRAMO",
    GRAMOS: "GRAMO",
    G: "GRAMO",
    LITRO: "LITRO",
    LITROS: "LITRO",
    L: "LITRO",
    ML: "ML",
    MILILITRO: "ML",
    MILILITROS: "ML",
    GALON: "GALON",
    GALONES: "GALON",
    GAL: "GALON",
    METRO: "METRO",
    METROS: "METRO",
    M: "METRO",
    CM: "CM",
    CENTIMETRO: "CM",
    CENTIMETROS: "CM",
    PIE: "PIE",
    PIES: "PIE",
    FT: "PIE",
  }
  return map[raw] ?? null
}

function parseImportProductType(value: unknown): "BASICO" | "MEDIDO" | null {
  if (!hasImportValue(value)) return null
  const raw = String(value).trim().toUpperCase()
  if (raw === "BASICO" || raw === "BÁSICO") return "BASICO"
  if (raw === "MEDIDO") return "MEDIDO"
  return null
}

function normalizeQtyForUnit(value: number, unit: UnitType) {
  if (!Number.isFinite(value)) {
    throw new Error("Cantidad inválida")
  }
  const allowsDecimals = unitAllowsDecimals(unit)
  if (!allowsDecimals && !Number.isInteger(value)) {
    throw new Error("Este producto solo permite cantidades enteras")
  }
  if (!allowsDecimals) {
    return Math.trunc(value)
  }
  return Math.round(value * 100) / 100
}

function parseImageUrls(value: unknown) {
  if (!hasImportValue(value)) return null
  const raw = String(value).trim()
  if (!raw) return null
  return raw
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function importProductsChunk(input: BulkProductImportChunkInput): Promise<BulkProductImportChunkResult> {
  const user = (input.user as CurrentUser | null | undefined) ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  if (!user.canEditProducts && user.role !== "ADMIN") {
    throw new Error("No tienes permiso para importar productos")
  }

  const rows = input.rows ?? []
  if (!rows.length) {
    throw new Error("No hay filas para importar")
  }
  if (rows.length > MAX_IMPORT_ROWS_PER_CHUNK) {
    throw new Error(`Máximo ${MAX_IMPORT_ROWS_PER_CHUNK} filas por lote`)
  }

  const reason = sanitizeString(input.reason ?? IMPORT_REASON_DEFAULT) || IMPORT_REASON_DEFAULT
  const shouldUseBatchId = rows.length > 1
  const batchId = shouldUseBatchId ? randomUUID() : null
  const categoryCache = new Map<string, string>()
  const supplierCache = new Map<string, string>()

  const resolveCategoryId = async (tx: Prisma.TransactionClient, categoryName: string) => {
    const cleanName = sanitizeString(categoryName)
    if (!cleanName) return null
    const cacheKey = cleanName.toLowerCase()
    const cached = categoryCache.get(cacheKey)
    if (cached) return cached

    let category = await tx.category.findFirst({
      where: {
        accountId: user.accountId,
        name: { equals: cleanName, mode: "insensitive" },
      },
    })

    if (!category) {
      const sequence = await tx.categorySequence.upsert({
        where: { accountId: user.accountId },
        update: { lastNumber: { increment: 1 } },
        create: { accountId: user.accountId, lastNumber: 1 },
      })

      category = await tx.category.create({
        data: {
          accountId: user.accountId,
          categoryId: sequence.lastNumber,
          name: cleanName,
          isActive: true,
        },
      })
    } else if (!category.isActive) {
      category = await tx.category.update({
        where: { id: category.id },
        data: { isActive: true },
      })
    }

    categoryCache.set(cacheKey, category.id)
    return category.id
  }

  const resolveSupplierId = async (tx: Prisma.TransactionClient, supplierName: string) => {
    const cleanName = sanitizeString(supplierName)
    if (!cleanName) return null
    const cacheKey = cleanName.toLowerCase()
    const cached = supplierCache.get(cacheKey)
    if (cached) return cached

    let supplier = await tx.supplier.findFirst({
      where: {
        accountId: user.accountId,
        name: { equals: cleanName, mode: "insensitive" },
      },
    })

    if (!supplier) {
      supplier = await tx.supplier.create({
        data: {
          accountId: user.accountId,
          name: cleanName,
          isActive: true,
        },
      })
    } else if (!supplier.isActive) {
      supplier = await tx.supplier.update({
        where: { id: supplier.id },
        data: { isActive: true },
      })
    }

    supplierCache.set(cacheKey, supplier.id)
    return supplier.id
  }

  const results: BulkProductImportRowResult[] = []
  let created = 0
  let updated = 0
  let failed = 0

  for (const row of rows) {
    const rowNumber = Number.isInteger(row.rowNumber) && row.rowNumber > 0 ? row.rowNumber : 0
    try {
      const skuSanitized = row.sku ? sanitizeCode(String(row.sku)) : ""
      const sku = skuSanitized || null
      const hasName = hasImportValue(row.nombre)
      const name = hasName ? sanitizeString(String(row.nombre)) : ""
      const hasReference = hasImportValue(row.referencia)
      const reference = hasReference ? sanitizeCode(String(row.referencia)) : ""

      const productType = parseImportProductType(row.tipo_producto)
      if (hasImportValue(row.tipo_producto) && !productType) {
        throw new Error("tipo_producto inválido (usa BASICO o MEDIDO)")
      }

      const purchaseUnitFromRow = parseImportUnit(row.unidad_compra)
      if (hasImportValue(row.unidad_compra) && !purchaseUnitFromRow) {
        throw new Error("unidad_compra inválida")
      }
      const saleUnitFromRow = parseImportUnit(row.unidad_venta)
      if (hasImportValue(row.unidad_venta) && !saleUnitFromRow) {
        throw new Error("unidad_venta inválida")
      }

      const hasPrice = hasImportValue(row.precio_venta)
      const priceValue = parseImportNumber(row.precio_venta, "Precio de venta")
      const hasCost = hasImportValue(row.costo)
      const costValue = parseImportNumber(row.costo, "Costo")
      const hasStock = hasImportValue(row.stock)
      const stockValue = parseImportNumber(row.stock, "Stock")
      const hasMinStock = hasImportValue(row.stock_minimo)
      const minStockValue = parseImportNumber(row.stock_minimo, "Stock mínimo")
      const hasItbis = hasImportValue(row.itbis)
      const itbisRateBp = parseImportItbisBp(row.itbis)
      const images = parseImageUrls(row.imagenes)
      const hasImages = hasImportValue(row.imagenes)
      const hasCategory = hasImportValue(row.categoria)
      const hasSupplier = hasImportValue(row.proveedor)
      const categoryName = hasCategory ? String(row.categoria).trim() : ""
      const supplierName = hasSupplier ? String(row.proveedor).trim() : ""

      if (hasPrice && (priceValue === null || priceValue <= 0)) {
        throw new Error("precio_venta debe ser mayor que 0")
      }
      if (hasCost && (costValue === null || costValue <= 0)) {
        throw new Error("costo debe ser mayor que 0")
      }
      if (hasMinStock && minStockValue !== null && minStockValue < 0) {
        throw new Error("stock_minimo no puede ser negativo")
      }

      const existing = sku
        ? await prisma.product.findFirst({
            where: {
              accountId: user.accountId,
              sku: { equals: sku, mode: "insensitive" },
            },
          })
        : null

      if (existing) {
        const nextName = hasName ? name : existing.name
        if (!nextName) {
          throw new Error("nombre inválido")
        }

        const basePurchaseUnit = existing.purchaseUnit
        const baseSaleUnit = existing.saleUnit
        let nextPurchaseUnit = purchaseUnitFromRow ?? basePurchaseUnit
        let nextSaleUnit = saleUnitFromRow ?? baseSaleUnit

        if (productType === "BASICO") {
          nextPurchaseUnit = "UNIDAD"
          nextSaleUnit = "UNIDAD"
        } else if (productType === "MEDIDO") {
          nextPurchaseUnit = purchaseUnitFromRow ?? (basePurchaseUnit !== "UNIDAD" ? basePurchaseUnit : "KG")
          nextSaleUnit = saleUnitFromRow ?? (baseSaleUnit !== "UNIDAD" ? baseSaleUnit : "KG")
        }

        if (hasPrice && priceValue !== null) {
          const priceCents = Math.round(priceValue * 100)
          if (priceCents !== Number(existing.priceCents) && !user.canOverridePrice && user.role !== "ADMIN") {
            throw new Error("No tienes permiso para modificar el precio del producto")
          }
        }

        const nextPriceCents = hasPrice && priceValue !== null ? Math.round(priceValue * 100) : Number(existing.priceCents)
        const nextCostCents = hasCost && costValue !== null ? Math.round(costValue * 100) : Number(existing.costCents)
        const nextItbisRateBp = hasItbis && itbisRateBp !== null ? itbisRateBp : Number(existing.itbisRateBp)

        const nextMinStock = hasMinStock && minStockValue !== null
          ? normalizeQtyForUnit(minStockValue, nextSaleUnit)
          : decimalToNumber(existing.minStock)

        const nextReference = hasReference ? (reference || null) : existing.reference
        const nextSku = sku ? sku : existing.sku

        const updateData: Prisma.ProductUncheckedUpdateInput = {
          name: nextName,
          sku: nextSku,
          reference: nextReference,
          priceCents: nextPriceCents,
          costCents: nextCostCents,
          itbisRateBp: nextItbisRateBp,
          minStock: nextMinStock,
          purchaseUnit: nextPurchaseUnit,
          saleUnit: nextSaleUnit,
          isActive: true,
        }

        if (hasImages) {
          updateData.imageUrls = images ?? []
        }

        await prisma.$transaction(async (tx) => {
          if (hasCategory) {
            updateData.categoryId = await resolveCategoryId(tx, categoryName)
          }
          if (hasSupplier) {
            updateData.supplierId = await resolveSupplierId(tx, supplierName)
          }

          await tx.product.update({
            where: { id: existing.id },
            data: updateData,
          })

          if (hasStock && stockValue !== null && stockValue !== 0) {
            const stockDelta = normalizeDelta(stockValue, unitAllowsDecimals(nextSaleUnit))
            const stockUpdate = stockDelta >= 0
              ? { increment: stockDelta }
              : { decrement: Math.abs(stockDelta) }

            await tx.product.update({
              where: { id: existing.id },
              data: { stock: stockUpdate },
            })

            await tx.inventoryAdjustment.create({
              data: {
                accountId: user.accountId,
                productId: existing.id,
                userId: user.id,
                qtyDelta: new Decimal(stockDelta),
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
              resourceId: existing.id,
              details: {
                productId: existing.productId,
                delta: stockDelta,
                reason,
                source: "bulk_excel",
                rowNumber,
                batchId,
              },
            }, tx)
          }

          await logAuditEvent({
            accountId: user.accountId,
            userId: user.id,
            userEmail: user.email ?? null,
            userUsername: user.username ?? null,
            action: "PRODUCT_EDITED",
            resourceType: "Product",
            resourceId: existing.id,
            details: {
              source: "bulk_excel",
              rowNumber,
              matchedBy: "sku",
              sku: nextSku,
              name: nextName,
            },
          }, tx)
        })

        updated += 1
        results.push({
          rowNumber,
          status: "UPDATED",
          productId: existing.productId,
          sku: existing.sku,
          name: nextName,
          message: "Producto actualizado por SKU",
        })
        continue
      }

      if (!name) {
        throw new Error("nombre es requerido para crear productos")
      }
      if (priceValue === null || priceValue <= 0) {
        throw new Error("precio_venta es requerido y debe ser mayor que 0")
      }
      if (costValue === null || costValue <= 0) {
        throw new Error("costo es requerido y debe ser mayor que 0")
      }

      const resolvedProductType = productType ?? "BASICO"
      const purchaseUnit = resolvedProductType === "BASICO"
        ? "UNIDAD"
        : (purchaseUnitFromRow ?? "KG")
      const saleUnit = resolvedProductType === "BASICO"
        ? "UNIDAD"
        : (saleUnitFromRow ?? "KG")

      const initialStockRaw = stockValue ?? 0
      const initialStock = normalizeQtyForUnit(initialStockRaw, saleUnit)
      const minStock = minStockValue === null ? 0 : normalizeQtyForUnit(minStockValue, saleUnit)

      const createdProduct = await prisma.$transaction(async (tx) => {
        const seq = await tx.productSequence.upsert({
          where: { accountId: user.accountId },
          update: { lastNumber: { increment: 1 } },
          create: { accountId: user.accountId, lastNumber: 1 },
        })

        const categoryId = hasCategory ? await resolveCategoryId(tx, categoryName) : null
        const supplierId = hasSupplier ? await resolveSupplierId(tx, supplierName) : null

        const created = await tx.product.create({
          data: {
            accountId: user.accountId,
            productId: seq.lastNumber,
            name,
            sku,
            reference: reference || null,
            supplierId,
            categoryId,
            priceCents: Math.round(priceValue * 100),
            costCents: Math.round(costValue * 100),
            itbisRateBp: itbisRateBp ?? 1800,
            stock: initialStock,
            minStock,
            imageUrls: images ?? [],
            purchaseUnit,
            saleUnit,
            isActive: true,
          },
        })

        await safeCreateInventoryAdjustment(tx, {
          accountId: user.accountId,
          productId: created.id,
          userId: user.id,
          qtyDelta: new Decimal(initialStock),
          reason: INITIAL_STOCK_REASON,
          note: null,
          batchId,
          createdAt: created.createdAt,
        })

        await logAuditEvent({
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "PRODUCT_CREATED",
          resourceType: "Product",
          resourceId: created.id,
          details: {
            source: "bulk_excel",
            rowNumber,
            name,
            sku,
            productId: created.productId,
          },
        }, tx)

        return created
      })

      created += 1
      results.push({
        rowNumber,
        status: "CREATED",
        productId: createdProduct.productId,
        sku: createdProduct.sku,
        name: createdProduct.name,
        message: "Producto creado",
      })
    } catch (error) {
      failed += 1
      results.push({
        rowNumber,
        status: "FAILED",
        sku: row.sku ?? null,
        name: row.nombre ?? undefined,
        message: error instanceof Error ? error.message : "Error desconocido en la fila",
      })
    }
  }

  safeRevalidate("/products")
  safeRevalidate("/reports/inventory")

  return {
    created,
    updated,
    failed,
    results,
  }
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

    safeRevalidate("/products")
    safeRevalidate("/reports/inventory")

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

  const limited = filtered.slice(0, take)

  return initialMovement ? [initialMovement, ...limited] : limited
}

"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { InventoryBulkOperationStatus, InventoryBulkSource, ProductKind, UnitType, Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser, type CurrentUser } from "@/lib/auth"
import { sanitizeString, sanitizeCode } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"
import { logError, ErrorCodes } from "@/lib/error-logger"
import { unitAllowsDecimals, decimalToNumber } from "@/lib/units"
import { INITIAL_STOCK_REASON } from "@/lib/inventory"
import { ensurePermission } from "@/lib/permission-guard"

type InventoryAdjustmentClient = {
  inventoryAdjustment: {
    create: (args: { data: any }) => Promise<any>
  }
}

class UpsertProductUserError extends Error {
  code?: "SKU_DUPLICATE"

  constructor(message: string, code?: "SKU_DUPLICATE") {
    super(message)
    this.name = "UpsertProductUserError"
    this.code = code
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

type RecipeItemInput = {
  ingredientId: string
  qty: number
}

function roundRecipeQty(value: number) {
  return Math.round(value * 1000) / 1000
}

const DECIMAL_10_3_MAX_ABS = 9_999_999.999
const DECIMAL_10_3_MAX_LABEL = "9,999,999.999"

function assertDecimal10x3Range(value: number, fieldLabel: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldLabel} inválido`)
  }
  if (Math.abs(value) > DECIMAL_10_3_MAX_ABS) {
    throw new Error(`${fieldLabel} excede el máximo permitido (${DECIMAL_10_3_MAX_LABEL}).`)
  }
}

function serializeProductRecord(product: any) {
  return {
    ...product,
    stock: product.stock instanceof Decimal ? product.stock.toNumber() : Number(product.stock),
    minStock: product.minStock instanceof Decimal ? product.minStock.toNumber() : Number(product.minStock),
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
    supplier: product.supplier
      ? {
          ...product.supplier,
          createdAt:
            product.supplier.createdAt instanceof Date
              ? product.supplier.createdAt.toISOString()
              : product.supplier.createdAt,
          updatedAt:
            product.supplier.updatedAt instanceof Date
              ? product.supplier.updatedAt.toISOString()
              : product.supplier.updatedAt,
        }
      : null,
    category: product.category
      ? {
          ...product.category,
          createdAt:
            product.category.createdAt instanceof Date
              ? product.category.createdAt.toISOString()
              : product.category.createdAt,
          updatedAt:
            product.category.updatedAt instanceof Date
              ? product.category.updatedAt.toISOString()
              : product.category.updatedAt,
        }
      : null,
    recipeItems: (product.recipeItems ?? []).map((item: any) => ({
      ...item,
      qty: item.qty instanceof Decimal ? item.qty.toNumber() : Number(item.qty),
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
      ingredient: item.ingredient
        ? {
            ...item.ingredient,
            stock: item.ingredient.stock instanceof Decimal ? item.ingredient.stock.toNumber() : Number(item.ingredient.stock),
            minStock:
              item.ingredient.minStock instanceof Decimal ? item.ingredient.minStock.toNumber() : Number(item.ingredient.minStock),
            }
          : null,
    })),
  }
}

function normalizeRecipeItems(items: RecipeItemInput[]) {
  const normalized = items
    .map((item) => ({
      ingredientId: String(item.ingredientId ?? "").trim(),
      qty: roundRecipeQty(Number(item.qty ?? 0)),
    }))
    .filter((item) => item.ingredientId)

  const repeated = normalized.find((item, index) => normalized.findIndex((candidate) => candidate.ingredientId === item.ingredientId) !== index)
  if (repeated) {
    throw new Error("No puedes repetir un insumo en la receta base.")
  }
  for (const item of normalized) {
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new Error("Cada insumo de la receta debe tener una cantidad mayor a 0.")
    }
  }
  return normalized
}

async function validateRecipeDefinition(
  client: Prisma.TransactionClient,
  input: {
    accountId: string
    productId?: string
    recipeItems: ReturnType<typeof normalizeRecipeItems>
  }
) {
  if (input.recipeItems.length === 0) {
    throw new Error("Debes agregar al menos un insumo a la receta.")
  }

  const ingredientIds = Array.from(new Set(input.recipeItems.map((item) => item.ingredientId)))

  if (input.productId && ingredientIds.includes(input.productId)) {
    throw new Error("Un producto no puede usar su propia receta como insumo.")
  }

  const ingredients = await client.product.findMany({
    where: {
      id: { in: ingredientIds },
      accountId: input.accountId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      productKind: true,
    },
  })

  if (ingredients.length !== ingredientIds.length) {
    throw new Error("Hay insumos inválidos o inactivos en la receta.")
  }

  const recipeIngredient = ingredients.find((ingredient) => ingredient.productKind === ProductKind.RECIPE)
  if (recipeIngredient) {
    throw new Error(`No puedes usar "${recipeIngredient.name}" como insumo porque también es un producto por receta.`)
  }
}

async function syncRecipeDefinition(
  client: Prisma.TransactionClient,
  productId: string,
  productKind: ProductKind,
  recipeItems: ReturnType<typeof normalizeRecipeItems>
) {
  await client.productRecipeItem.deleteMany({
    where: { productId },
  })

  if (productKind !== ProductKind.RECIPE) return

  if (recipeItems.length > 0) {
    await client.productRecipeItem.createMany({
      data: recipeItems.map((item) => ({
        productId,
        ingredientId: item.ingredientId,
        qty: new Decimal(item.qty),
      })),
    })
  }
}

export async function listRecipeIngredientOptions(options?: { user?: any }) {
  const user = options?.user ?? (await getCurrentUser())
  if (!user) throw new Error("No autenticado")

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      productKind: { not: ProductKind.RECIPE },
    },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      productId: true,
      name: true,
      sku: true,
      reference: true,
      stock: true,
      unit: true,
      costCents: true,
      productKind: true,
    },
  })

  return products.map((product) => ({
    ...product,
    stock: product.stock instanceof Decimal ? product.stock.toNumber() : Number(product.stock),
  }))
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
    include: {
      supplier: true,
      category: true,
      recipeItems: {
        include: {
          ingredient: {
            select: {
              id: true,
              productId: true,
              name: true,
              sku: true,
              reference: true,
              stock: true,
              minStock: true,
              unit: true,
              productKind: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
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
    items: pageItems.map(serializeProductRecord),
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
  isAvailableForSale?: boolean
  stock: number
  minStock: number
  imageUrls?: string[]
  productKind: ProductKind
  recipeItems?: RecipeItemInput[]
  unit: UnitType
  user?: any
}): Promise<{ ok: true } | { ok: false; error: string; code?: "SKU_DUPLICATE" }> {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  try {
    const name = sanitizeString(input.name)
    if (!name) throw new Error("El nombre del producto es requerido")
    if (!input.priceCents || input.priceCents <= 0) throw new Error("El precio de venta es requerido")
    if (!input.costCents || input.costCents < 0) throw new Error("El costo es requerido")
    if (!input.unit) throw new Error("La unidad es requerida")

    const productKind = input.productKind ?? ProductKind.BASIC
    const sanitizedSku = input.sku ? sanitizeCode(input.sku) : ""
    const sanitizedReference = input.reference ? sanitizeCode(input.reference) : ""
    const sku = sanitizedSku || null
    const reference = sanitizedReference || null
    const imageUrls = input.imageUrls || []
    const recipeItems = normalizeRecipeItems(input.recipeItems ?? [])

    const finalUnit =
      productKind === ProductKind.MEASURED
        ? input.unit
        : UnitType.UNIDAD
    if (productKind === ProductKind.MEASURED && finalUnit === UnitType.UNIDAD) {
      throw new Error("Los productos con medidas deben usar una unidad distinta de UNIDAD")
    }
    const finalStock =
      productKind === ProductKind.RECIPE
        ? 0
        : normalizeQtyForUnit(Number(input.stock ?? 0), finalUnit, "Existencia")
    const finalMinStock =
      productKind === ProductKind.RECIPE
        ? 0
        : normalizeQtyForUnit(Number(input.minStock ?? 0), finalUnit, "Existencia mínima")
    if (productKind !== ProductKind.RECIPE && finalMinStock < 0) {
      throw new Error("Existencia mínima no puede ser negativa")
    }

    await prisma.$transaction(async (tx) => {
      if (sku) {
        const conflictingSkuProduct = await tx.product.findFirst({
          where: {
            accountId: user.accountId,
            sku: { equals: sku, mode: "insensitive" },
            ...(input.id ? { id: { not: input.id } } : {}),
          },
          select: {
            id: true,
            productId: true,
            name: true,
          },
        })

        if (conflictingSkuProduct) {
          throw new UpsertProductUserError(
            `El SKU "${sku}" ya está en uso por el producto #${conflictingSkuProduct.productId} (${conflictingSkuProduct.name}).`,
            "SKU_DUPLICATE"
          )
        }
      }

      if (productKind === ProductKind.RECIPE) {
        await validateRecipeDefinition(tx, {
          accountId: user.accountId,
          productId: input.id,
          recipeItems,
        })
      }

      if (input.id) {
        if (!user.canEditProducts && !user.isOwner) {
          throw new Error("No tienes permiso para editar productos")
        }

        const existing = await tx.product.findFirst({
          where: { id: input.id, accountId: user.accountId },
          select: {
            id: true,
            priceCents: true,
            stock: true,
            productKind: true,
            isAvailableForSale: true,
          },
        })
        if (!existing) throw new Error("Producto no encontrado")

        const originalPriceCents = Number(existing.priceCents)
        if (input.priceCents !== originalPriceCents && !user.canOverridePrice && !user.isOwner) {
          throw new Error("No tienes permiso para modificar el precio del producto")
        }

        if (
          productKind === ProductKind.RECIPE &&
          existing.productKind !== ProductKind.RECIPE &&
          decimalToNumber(existing.stock) > 0
        ) {
          throw new Error("No puedes convertir un producto con existencia disponible a producto por receta sin vaciar su stock primero.")
        }
        const finalIsAvailableForSale = input.isAvailableForSale ?? existing.isAvailableForSale

        await tx.product.update({
          where: { id: input.id },
          data: {
            name,
            sku,
            reference,
            supplierId: input.supplierId || null,
            categoryId: input.categoryId || null,
            priceCents: input.priceCents,
            costCents: input.costCents,
            itbisRateBp: input.itbisRateBp ?? 1800,
            stock: finalStock,
            minStock: finalMinStock,
            imageUrls,
            productKind,
            unit: finalUnit,
            isAvailableForSale: finalIsAvailableForSale,
          },
        })

        await syncRecipeDefinition(tx, input.id, productKind, recipeItems)

        await logAuditEvent(
          {
            accountId: user.accountId,
            userId: user.id,
            action: "PRODUCT_EDITED",
            resourceType: "Product",
            resourceId: input.id,
            details: {
              name,
              sku,
              reference,
              productKind,
              isAvailableForSale: finalIsAvailableForSale,
            },
          },
          tx
        )
      } else {
        const seq = await tx.productSequence.upsert({
          where: { accountId: user.accountId },
          update: { lastNumber: { increment: 1 } },
          create: { accountId: user.accountId, lastNumber: 1 },
        })

        const productId = seq.lastNumber

        const created = await tx.product.create({
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
            stock: finalStock,
            minStock: finalMinStock,
            imageUrls,
            productKind,
            unit: finalUnit,
            isAvailableForSale: input.isAvailableForSale ?? true,
          },
        })

        await syncRecipeDefinition(tx, created.id, productKind, recipeItems)

        if (productKind !== ProductKind.RECIPE) {
          const initialAllowsDecimals = unitAllowsDecimals(finalUnit)
          const initialRaw = Number(finalStock)
          const initialStock = Number.isFinite(initialRaw)
            ? initialAllowsDecimals
              ? Math.round(initialRaw * 100) / 100
              : Math.trunc(initialRaw)
            : 0

          await safeCreateInventoryAdjustment(tx, {
            accountId: user.accountId,
            productId: created.id,
            userId: user.id,
            qtyDelta: new Decimal(initialStock),
            reason: INITIAL_STOCK_REASON,
            note: null,
            batchId: null,
            createdAt: created.createdAt,
          })
        }

        await logAuditEvent(
          {
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
              productKind,
              isAvailableForSale: input.isAvailableForSale ?? true,
            },
          },
          tx
        )
      }
    })

    safeRevalidate("/products")
    return { ok: true }
  } catch (error) {
    if (error instanceof UpsertProductUserError) {
      return { ok: false, error: error.message, code: error.code }
    }

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

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : []
      if (target.includes("accountId") && target.includes("sku")) {
        const sanitizedSku = input.sku ? sanitizeCode(input.sku) : ""
        const shownSku = sanitizedSku || "sin código"
        return {
          ok: false,
          error: `El SKU "${shownSku}" ya existe en esta cuenta. Usa otro código o deja el campo vacío.`,
          code: "SKU_DUPLICATE",
        }
      }
    }

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

  // Verificar que el producto no se usa como insumo en recetas activas
  const usedInRecipes = await prisma.productRecipeItem.findMany({
    where: {
      ingredientId: productId,
      product: { isActive: true, accountId: user.accountId },
    },
    select: { product: { select: { name: true } } },
    take: 5,
  })

  const recipeNames = Array.from(new Set(usedInRecipes.map((r) => r.product.name)))

  if (recipeNames.length > 0) {
    throw new Error(
      `No puedes desactivar este producto porque es insumo de: ${recipeNames.join(", ")}. Primero quita este insumo de esas recetas.`
    )
  }

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

export async function setProductSaleAvailability(
  productId: string,
  isAvailableForSale: boolean,
  options?: { user?: CurrentUser | null }
) {
  const user = options?.user ?? (await getCurrentUser())
  if (!user) throw new Error("No autenticado")

  if (!user.canEditProducts && !user.isOwner) {
    throw new Error("No tienes permiso para editar productos")
  }

  const existing = await prisma.product.findFirst({
    where: { id: productId, accountId: user.accountId, isActive: true },
    select: { id: true, isAvailableForSale: true },
  })
  if (!existing) throw new Error("Producto no encontrado")

  const updated = await prisma.product.updateMany({
    where: { id: productId, accountId: user.accountId, isActive: true },
    data: { isAvailableForSale },
  })
  if (updated.count === 0) throw new Error("Producto no encontrado")

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "PRODUCT_EDITED",
    resourceType: "Product",
    resourceId: productId,
    details: {
      previousIsAvailableForSale: existing.isAvailableForSale,
      isAvailableForSale,
    },
  })

  safeRevalidate("/products")
  safeRevalidate("/sales")
  safeRevalidate("/sales/list")
}

type BulkStockAdjustmentItem = {
  productId: number
  delta: number
}

type InventoryBulkSnapshotState = {
  name: string
  sku: string | null
  reference: string | null
  supplierId: string | null
  categoryId: string | null
  priceCents: number
  costCents: number
  itbisRateBp: number
  stock: number
  minStock: number
  imageUrls: string[]
  productKind: ProductKind
  unit: UnitType
  isActive: boolean
  isAvailableForSale: boolean
}

type SnapshotProductRecord = {
  name: string
  sku: string | null
  reference: string | null
  supplierId: string | null
  categoryId: string | null
  priceCents: number
  costCents: number
  itbisRateBp: number
  stock: Decimal | number
  minStock: Decimal | number
  imageUrls: string[]
  productKind: ProductKind
  unit: UnitType
  isActive: boolean
  isAvailableForSale: boolean
}

const BULK_REVERT_REASON = "Reversión de inventario masivo"
const BULK_REVERT_SOURCE = "bulk_revert"

function canManageBulkInventoryRecovery(user: CurrentUser) {
  return user.isOwner || user.role === "ADMIN"
}

function assertBulkInventoryRecoveryAccess(user: CurrentUser) {
  if (!canManageBulkInventoryRecovery(user)) {
    throw new Error("Solo el dueño o un admin puede revertir inventario masivo")
  }
}

function serializeBulkSnapshotState(product: SnapshotProductRecord): InventoryBulkSnapshotState {
  return {
    name: String(product.name),
    sku: product.sku ? String(product.sku) : null,
    reference: product.reference ? String(product.reference) : null,
    supplierId: product.supplierId ? String(product.supplierId) : null,
    categoryId: product.categoryId ? String(product.categoryId) : null,
    priceCents: Number(product.priceCents),
    costCents: Number(product.costCents),
    itbisRateBp: Number(product.itbisRateBp),
    stock: decimalToNumber(product.stock),
    minStock: decimalToNumber(product.minStock),
    imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls.map((value) => String(value)) : [],
    productKind: product.productKind,
    unit: product.unit,
    isActive: Boolean(product.isActive),
    isAvailableForSale: Boolean(product.isAvailableForSale),
  }
}

function parseBulkSnapshotState(value: Prisma.JsonValue | null): InventoryBulkSnapshotState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Snapshot inválido: beforeState no es un objeto")
  }

  const data = value as Record<string, unknown>
  const parseNumber = (field: keyof InventoryBulkSnapshotState) => {
    const parsed = Number(data[field])
    if (!Number.isFinite(parsed)) {
      throw new Error(`Snapshot inválido: ${String(field)} no es numérico`)
    }
    return parsed
  }

  const parseNullableString = (field: keyof InventoryBulkSnapshotState) => {
    const raw = data[field]
    if (raw === null || raw === undefined || raw === "") return null
    return String(raw)
  }

  const productKind = String(data.productKind ?? "")
  if (!Object.values(ProductKind).includes(productKind as ProductKind)) {
    throw new Error("Snapshot inválido: productKind no es válido")
  }
  const unit = String(data.unit ?? "")
  if (!Object.values(UnitType).includes(unit as UnitType)) {
    throw new Error("Snapshot inválido: unit no es válido")
  }

  return {
    name: String(data.name ?? ""),
    sku: parseNullableString("sku"),
    reference: parseNullableString("reference"),
    supplierId: parseNullableString("supplierId"),
    categoryId: parseNullableString("categoryId"),
    priceCents: parseNumber("priceCents"),
    costCents: parseNumber("costCents"),
    itbisRateBp: parseNumber("itbisRateBp"),
    stock: parseNumber("stock"),
    minStock: parseNumber("minStock"),
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls.map((item) => String(item)) : [],
    productKind: productKind as ProductKind,
    unit: unit as UnitType,
    isActive: Boolean(data.isActive),
    isAvailableForSale: Boolean(data.isAvailableForSale),
  }
}

async function ensureBulkSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    operationId: string
    accountId: string
    productId: string
    existedBefore: boolean
    beforeState: InventoryBulkSnapshotState | null
  }
) {
  const existingSnapshot = await tx.inventoryBulkSnapshot.findUnique({
    where: {
      operationId_productId: {
        operationId: input.operationId,
        productId: input.productId,
      },
    },
    select: { id: true },
  })
  if (existingSnapshot) return

  await tx.inventoryBulkSnapshot.create({
    data: {
      accountId: input.accountId,
      operationId: input.operationId,
      productId: input.productId,
      existedBefore: input.existedBefore,
      beforeState:
        input.beforeState === null
          ? Prisma.DbNull
          : (input.beforeState as unknown as Prisma.InputJsonValue),
    },
  })
}

function normalizeDelta(delta: number, allowsDecimals: boolean) {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("La cantidad debe ser un número distinto de 0.")
  }
  if (!allowsDecimals && !Number.isInteger(delta)) {
    throw new Error("Este producto solo permite cantidades enteras.")
  }
  if (!allowsDecimals) {
    const normalized = Math.trunc(delta)
    assertDecimal10x3Range(normalized, "Cantidad")
    return normalized
  }
  // Redondear a 2 decimales para mantener consistencia con UI
  const normalized = Math.round(delta * 100) / 100
  assertDecimal10x3Range(normalized, "Cantidad")
  return normalized
}

export type BulkProductImportRow = {
  rowNumber: number
  nombre?: string
  sku?: string
  referencia?: string
  tipo_producto?: "BASICO" | "MEDIDO"
  unidad?: UnitType
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
  operationId: string
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

export type StartInventoryBulkOperationInput = {
  source: InventoryBulkSource
  reason?: string
  totalRows?: number
  user?: CurrentUser | null
}

export type FinalizeInventoryBulkOperationInput = {
  operationId: string
  status: "COMPLETED" | "FAILED"
  totalRows?: number
  createdCount?: number
  updatedCount?: number
  failedCount?: number
  errorMessage?: string
  user?: CurrentUser | null
}

export type InventoryBulkOperationHistoryItem = {
  id: string
  source: InventoryBulkSource
  status: InventoryBulkOperationStatus
  reason: string | null
  startedAt: string
  completedAt: string | null
  revertedAt: string | null
  totalRows: number
  createdCount: number
  updatedCount: number
  failedCount: number
  snapshotsCount: number
  userName: string | null
  userUsername: string | null
  revertedByName: string | null
  revertedByUsername: string | null
}

export type InventoryBulkRevertConflictReason =
  | "MISSING_PRODUCT"
  | "MODIFIED_AFTER_COMPLETION"
  | "CREATED_PRODUCT_HAS_DEPENDENCIES"
  | "INVALID_SNAPSHOT"

export type InventoryBulkRevertConflict = {
  productId: string
  productNumber: number | null
  productName: string | null
  reason: InventoryBulkRevertConflictReason
  detail: string
}

export type InventoryBulkRevertResult =
  | {
      ok: true
      revertedProducts: number
      deletedProducts: number
    }
  | {
      ok: false
      code: "ALREADY_REVERTED" | "NOT_COMPLETED" | "CONFLICTS"
      message: string
      conflicts: InventoryBulkRevertConflict[]
    }

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
  const raw = String(value)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
    MILIGRAMO: "MILIGRAMO",
    MILIGRAMOS: "MILIGRAMO",
    MG: "MILIGRAMO",
    ONZA: "ONZA",
    ONZAS: "ONZA",
    OZ: "ONZA",
    TONELADA: "TONELADA",
    TONELADAS: "TONELADA",
    TON: "TONELADA",
    T: "TONELADA",
    LITRO: "LITRO",
    LITROS: "LITRO",
    L: "LITRO",
    ML: "ML",
    MILILITRO: "ML",
    MILILITROS: "ML",
    ONZA_LIQUIDA: "ONZA_LIQUIDA",
    ONZA_LIQUIDAS: "ONZA_LIQUIDA",
    "ONZA LIQUIDA": "ONZA_LIQUIDA",
    "ONZAS LIQUIDAS": "ONZA_LIQUIDA",
    ONZAFLUIDA: "ONZA_LIQUIDA",
    ONZASFLUIDAS: "ONZA_LIQUIDA",
    FLOZ: "ONZA_LIQUIDA",
    FL_OZ: "ONZA_LIQUIDA",
    "FL OZ": "ONZA_LIQUIDA",
    CC: "CC",
    CM3: "CC",
    CENTIMETRO_CUBICO: "CC",
    CENTIMETROS_CUBICOS: "CC",
    "CENTIMETRO CUBICO": "CC",
    "CENTIMETROS CUBICOS": "CC",
    GALON: "GALON",
    GALONES: "GALON",
    GAL: "GALON",
    METRO: "METRO",
    METROS: "METRO",
    M: "METRO",
    CM: "CM",
    CENTIMETRO: "CM",
    CENTIMETROS: "CM",
    MM: "MM",
    MILIMETRO: "MM",
    MILIMETROS: "MM",
    PIE: "PIE",
    PIES: "PIE",
    FT: "PIE",
    PULGADA: "PULGADA",
    PULGADAS: "PULGADA",
    IN: "PULGADA",
    YARDA: "YARDA",
    YARDAS: "YARDA",
    YD: "YARDA",
    M3: "M3",
    METRO_CUBICO: "M3",
    METROS_CUBICOS: "M3",
    "METRO CUBICO": "M3",
    "METROS CUBICOS": "M3",
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

function normalizeQtyForUnit(value: number, unit: UnitType, fieldLabel = "Cantidad") {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldLabel} inválido`)
  }
  const allowsDecimals = unitAllowsDecimals(unit)
  if (!allowsDecimals && !Number.isInteger(value)) {
    throw new Error(`${fieldLabel}: este producto solo permite cantidades enteras`)
  }
  if (!allowsDecimals) {
    const normalized = Math.trunc(value)
    assertDecimal10x3Range(normalized, fieldLabel)
    return normalized
  }
  const normalized = Math.round(value * 100) / 100
  assertDecimal10x3Range(normalized, fieldLabel)
  return normalized
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

async function assertWritableBulkOperation(
  operationId: string,
  user: CurrentUser,
  source: InventoryBulkSource
) {
  const operation = await prisma.inventoryBulkOperation.findFirst({
    where: {
      id: operationId,
      accountId: user.accountId,
    },
    select: {
      id: true,
      status: true,
      source: true,
      userId: true,
    },
  })

  if (!operation) {
    throw new Error("Operación masiva no encontrada")
  }
  if (operation.source !== source) {
    throw new Error("La operación masiva no corresponde al origen esperado")
  }
  if (operation.status !== InventoryBulkOperationStatus.IN_PROGRESS) {
    throw new Error("La operación masiva ya no está disponible para escritura")
  }
  if (operation.userId && operation.userId !== user.id && !canManageBulkInventoryRecovery(user)) {
    throw new Error("No tienes permiso para modificar esta operación masiva")
  }

  return operation
}

type ProductDependencyClient = Pick<
  Prisma.TransactionClient,
  | "saleItem"
  | "purchaseItem"
  | "returnItem"
  | "quoteItem"
  | "productRecipeItem"
  | "saleItemConsumption"
  | "saleItemRecipeAdjustment"
  | "quoteItemRecipeAdjustment"
>

async function collectProductDependencyIds(
  client: ProductDependencyClient,
  accountId: string,
  productIds: string[]
) {
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  const dependencyIds = new Set<string>()
  if (ids.length === 0) return dependencyIds

  const [
    saleDeps,
    purchaseDeps,
    returnDeps,
    quoteDeps,
    recipeDeps,
    saleConsumptionDeps,
    saleAdjustmentDeps,
    quoteAdjustmentDeps,
  ] = await Promise.all([
    client.saleItem.findMany({
      where: {
        productId: { in: ids },
        sale: { accountId },
      },
      select: { productId: true },
      distinct: ["productId"],
    }),
    client.purchaseItem.findMany({
      where: {
        productId: { in: ids },
        purchase: { accountId },
      },
      select: { productId: true },
      distinct: ["productId"],
    }),
    client.returnItem.findMany({
      where: {
        productId: { in: ids },
        return: { accountId },
      },
      select: { productId: true },
      distinct: ["productId"],
    }),
    client.quoteItem.findMany({
      where: {
        productId: { in: ids },
        quote: { accountId },
      },
      select: { productId: true },
      distinct: ["productId"],
    }),
    client.productRecipeItem.findMany({
      where: {
        OR: [
          { productId: { in: ids }, product: { accountId } },
          { ingredientId: { in: ids }, ingredient: { accountId } },
        ],
      },
      select: { productId: true, ingredientId: true },
    }),
    client.saleItemConsumption.findMany({
      where: {
        ingredientId: { in: ids },
        ingredient: { accountId },
      },
      select: { ingredientId: true },
      distinct: ["ingredientId"],
    }),
    client.saleItemRecipeAdjustment.findMany({
      where: {
        ingredientId: { in: ids },
        ingredient: { accountId },
      },
      select: { ingredientId: true },
      distinct: ["ingredientId"],
    }),
    client.quoteItemRecipeAdjustment.findMany({
      where: {
        ingredientId: { in: ids },
        ingredient: { accountId },
      },
      select: { ingredientId: true },
      distinct: ["ingredientId"],
    }),
  ])

  for (const dep of saleDeps) dependencyIds.add(dep.productId)
  for (const dep of purchaseDeps) dependencyIds.add(dep.productId)
  for (const dep of returnDeps) dependencyIds.add(dep.productId)
  for (const dep of quoteDeps) dependencyIds.add(dep.productId)
  for (const dep of recipeDeps) {
    if (ids.includes(dep.productId)) dependencyIds.add(dep.productId)
    if (ids.includes(dep.ingredientId)) dependencyIds.add(dep.ingredientId)
  }
  for (const dep of saleConsumptionDeps) dependencyIds.add(dep.ingredientId)
  for (const dep of saleAdjustmentDeps) dependencyIds.add(dep.ingredientId)
  for (const dep of quoteAdjustmentDeps) dependencyIds.add(dep.ingredientId)

  return dependencyIds
}

export async function startInventoryBulkOperation(input: StartInventoryBulkOperationInput) {
  const user = input.user ?? (await getCurrentUser())
  if (!user) throw new Error("No autenticado")

  if (input.source === InventoryBulkSource.BULK_EXCEL) {
    if (!user.canEditProducts && !user.isOwner) {
      throw new Error("No tienes permiso para importar productos")
    }
  } else if (input.source === InventoryBulkSource.BULK_MANUAL) {
    await ensurePermission(user, "canAdjustInventory", {
      message: "No tienes permiso para ajustar inventario",
      resourceType: "InventoryAdjustment",
    })
  } else {
    throw new Error("Origen de operación masiva inválido")
  }

  const totalRows = Number.isFinite(Number(input.totalRows)) ? Math.max(0, Math.trunc(Number(input.totalRows))) : 0
  const reason = sanitizeString(input.reason ?? "") || null

  const operation = await prisma.inventoryBulkOperation.create({
    data: {
      accountId: user.accountId,
      userId: user.id,
      source: input.source,
      status: InventoryBulkOperationStatus.IN_PROGRESS,
      reason,
      totalRows,
    },
    select: { id: true },
  })

  return { operationId: operation.id }
}

export async function finalizeInventoryBulkOperation(input: FinalizeInventoryBulkOperationInput) {
  const user = input.user ?? (await getCurrentUser())
  if (!user) throw new Error("No autenticado")

  const operation = await prisma.inventoryBulkOperation.findFirst({
    where: {
      id: input.operationId,
      accountId: user.accountId,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      source: true,
    },
  })
  if (!operation) throw new Error("Operación masiva no encontrada")
  if (operation.userId && operation.userId !== user.id && !canManageBulkInventoryRecovery(user)) {
    throw new Error("No tienes permiso para finalizar esta operación masiva")
  }
  if (operation.status === InventoryBulkOperationStatus.REVERTED) {
    throw new Error("La operación masiva ya fue revertida")
  }
  if (operation.status !== InventoryBulkOperationStatus.IN_PROGRESS) {
    return {
      operationId: operation.id,
      status: operation.status,
    }
  }

  const nextStatus =
    input.status === "FAILED"
      ? InventoryBulkOperationStatus.FAILED
      : InventoryBulkOperationStatus.COMPLETED

  const totalRows = Number.isFinite(Number(input.totalRows)) ? Math.max(0, Math.trunc(Number(input.totalRows))) : undefined
  const createdCount = Number.isFinite(Number(input.createdCount))
    ? Math.max(0, Math.trunc(Number(input.createdCount)))
    : undefined
  const updatedCount = Number.isFinite(Number(input.updatedCount))
    ? Math.max(0, Math.trunc(Number(input.updatedCount)))
    : undefined
  const failedCount = Number.isFinite(Number(input.failedCount))
    ? Math.max(0, Math.trunc(Number(input.failedCount)))
    : undefined
  const errorMessage = sanitizeString(input.errorMessage ?? "") || null

  const updated = await prisma.inventoryBulkOperation.update({
    where: { id: operation.id },
    data: {
      status: nextStatus,
      completedAt: new Date(),
      ...(totalRows === undefined ? {} : { totalRows }),
      ...(createdCount === undefined ? {} : { createdCount }),
      ...(updatedCount === undefined ? {} : { updatedCount }),
      ...(failedCount === undefined ? {} : { failedCount }),
      errorMessage: nextStatus === InventoryBulkOperationStatus.FAILED ? errorMessage : null,
    },
    select: {
      id: true,
      status: true,
    },
  })

  return {
    operationId: updated.id,
    status: updated.status,
  }
}

export async function listInventoryBulkOperations(input?: { take?: number; user?: CurrentUser | null }): Promise<InventoryBulkOperationHistoryItem[]> {
  const user = input?.user ?? (await getCurrentUser())
  if (!user) throw new Error("No autenticado")
  assertBulkInventoryRecoveryAccess(user)

  const take = Math.min(Math.max(input?.take ?? 30, 1), 200)

  const operations = await prisma.inventoryBulkOperation.findMany({
    where: { accountId: user.accountId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: {
        select: {
          name: true,
          username: true,
        },
      },
      revertedBy: {
        select: {
          name: true,
          username: true,
        },
      },
      _count: {
        select: {
          snapshots: true,
        },
      },
    },
  })

  return operations.map((operation) => ({
    id: operation.id,
    source: operation.source,
    status: operation.status,
    reason: operation.reason,
    startedAt: operation.startedAt.toISOString(),
    completedAt: operation.completedAt ? operation.completedAt.toISOString() : null,
    revertedAt: operation.revertedAt ? operation.revertedAt.toISOString() : null,
    totalRows: operation.totalRows,
    createdCount: operation.createdCount,
    updatedCount: operation.updatedCount,
    failedCount: operation.failedCount,
    snapshotsCount: operation._count.snapshots,
    userName: operation.user?.name ?? null,
    userUsername: operation.user?.username ?? null,
    revertedByName: operation.revertedBy?.name ?? null,
    revertedByUsername: operation.revertedBy?.username ?? null,
  }))
}

export async function revertInventoryBulkOperation(input: { operationId: string; user?: CurrentUser | null }): Promise<InventoryBulkRevertResult> {
  const user = input.user ?? (await getCurrentUser())
  if (!user) throw new Error("No autenticado")
  assertBulkInventoryRecoveryAccess(user)

  const operation = await prisma.inventoryBulkOperation.findFirst({
    where: {
      id: input.operationId,
      accountId: user.accountId,
    },
    include: {
      snapshots: {
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!operation) {
    throw new Error("Operación masiva no encontrada")
  }
  if (operation.status === InventoryBulkOperationStatus.REVERTED) {
    return {
      ok: false,
      code: "ALREADY_REVERTED",
      message: "Esta operación ya fue revertida",
      conflicts: [],
    }
  }
  if (operation.status !== InventoryBulkOperationStatus.COMPLETED || !operation.completedAt) {
    return {
      ok: false,
      code: "NOT_COMPLETED",
      message: "Solo se pueden revertir operaciones completadas",
      conflicts: [],
    }
  }

  const snapshotProductIds = operation.snapshots.map((snapshot) => snapshot.productId)
  const currentProducts = snapshotProductIds.length === 0
    ? []
    : await prisma.product.findMany({
        where: {
          accountId: user.accountId,
          id: { in: snapshotProductIds },
        },
        select: {
          id: true,
          productId: true,
          name: true,
          updatedAt: true,
          stock: true,
        },
      })

  const currentById = new Map(currentProducts.map((product) => [product.id, product]))
  const conflicts: InventoryBulkRevertConflict[] = []
  const conflictKeys = new Set<string>()
  const addConflict = (conflict: InventoryBulkRevertConflict) => {
    const key = `${conflict.productId}:${conflict.reason}`
    if (conflictKeys.has(key)) return
    conflictKeys.add(key)
    conflicts.push(conflict)
  }

  const completedAt = operation.completedAt
  for (const snapshot of operation.snapshots) {
    const current = currentById.get(snapshot.productId) ?? null

    if (snapshot.existedBefore && !current) {
      addConflict({
        productId: snapshot.productId,
        productNumber: null,
        productName: null,
        reason: "MISSING_PRODUCT",
        detail: "El producto original ya no existe en la base de datos.",
      })
      continue
    }

    if (current && current.updatedAt > completedAt) {
      addConflict({
        productId: snapshot.productId,
        productNumber: current.productId,
        productName: current.name,
        reason: "MODIFIED_AFTER_COMPLETION",
        detail: "El producto fue modificado después de completar la operación masiva.",
      })
    }

    if (snapshot.existedBefore && snapshot.beforeState === null) {
      addConflict({
        productId: snapshot.productId,
        productNumber: current?.productId ?? null,
        productName: current?.name ?? null,
        reason: "INVALID_SNAPSHOT",
        detail: "No existe estado previo para restaurar este producto.",
      })
    }
  }

  const createdExistingIds = operation.snapshots
    .filter((snapshot) => !snapshot.existedBefore && currentById.has(snapshot.productId))
    .map((snapshot) => snapshot.productId)

  if (createdExistingIds.length > 0) {
    const dependencyIds = await collectProductDependencyIds(prisma, user.accountId, createdExistingIds)
    for (const productId of dependencyIds) {
      const product = currentById.get(productId)
      addConflict({
        productId,
        productNumber: product?.productId ?? null,
        productName: product?.name ?? null,
        reason: "CREATED_PRODUCT_HAS_DEPENDENCIES",
        detail: "El producto creado por este lote ya tiene movimientos o referencias y no se puede eliminar.",
      })
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: "CONFLICTS",
      message: "No se puede revertir el lote porque existen conflictos.",
      conflicts,
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingCreatedIds = operation.snapshots
      .filter((snapshot) => !snapshot.existedBefore)
      .map((snapshot) => snapshot.productId)

    if (existingCreatedIds.length > 0) {
      const dependencyIdsInTx = await collectProductDependencyIds(tx, user.accountId, existingCreatedIds)
      if (dependencyIdsInTx.size > 0) {
        throw new Error("Se detectaron dependencias nuevas durante la reversión. Intenta nuevamente.")
      }
    }

    let revertedProducts = 0
    let deletedProducts = 0

    for (const snapshot of operation.snapshots) {
      if (snapshot.existedBefore) {
        const beforeState = parseBulkSnapshotState(snapshot.beforeState)

        const current = await tx.product.findFirst({
          where: {
            id: snapshot.productId,
            accountId: user.accountId,
          },
          select: {
            id: true,
            stock: true,
            updatedAt: true,
          },
        })
        if (!current) {
          throw new Error("No se encontró un producto que debía existir para la reversión.")
        }
        if (current.updatedAt > completedAt) {
          throw new Error("Un producto cambió luego de completar el lote. Revisión cancelada.")
        }

        await tx.product.update({
          where: { id: current.id },
          data: {
            name: beforeState.name,
            sku: beforeState.sku,
            reference: beforeState.reference,
            supplierId: beforeState.supplierId,
            categoryId: beforeState.categoryId,
            priceCents: beforeState.priceCents,
            costCents: beforeState.costCents,
            itbisRateBp: beforeState.itbisRateBp,
            stock: beforeState.stock,
            minStock: beforeState.minStock,
            imageUrls: beforeState.imageUrls,
            productKind: beforeState.productKind,
            unit: beforeState.unit,
            isActive: beforeState.isActive,
            isAvailableForSale: beforeState.isAvailableForSale,
          },
        })

        const currentStock = decimalToNumber(current.stock)
        const stockDelta = roundRecipeQty(beforeState.stock - currentStock)
        if (stockDelta !== 0) {
          await tx.inventoryAdjustment.create({
            data: {
              accountId: user.accountId,
              productId: current.id,
              userId: user.id,
              qtyDelta: new Decimal(stockDelta),
              reason: BULK_REVERT_REASON,
              note: `source:${BULK_REVERT_SOURCE};operation:${operation.id}`,
              batchId: operation.id,
            },
          })

          await logAuditEvent({
            accountId: user.accountId,
            userId: user.id,
            userEmail: user.email ?? null,
            userUsername: user.username ?? null,
            action: "STOCK_ADJUSTED",
            resourceType: "Product",
            resourceId: current.id,
            details: {
              source: BULK_REVERT_SOURCE,
              operationId: operation.id,
              delta: stockDelta,
              reason: BULK_REVERT_REASON,
            },
          }, tx)
        }

        revertedProducts += 1
        continue
      }

      const createdProduct = await tx.product.findFirst({
        where: {
          id: snapshot.productId,
          accountId: user.accountId,
        },
        select: {
          id: true,
          productId: true,
          name: true,
          updatedAt: true,
        },
      })
      if (!createdProduct) continue
      if (createdProduct.updatedAt > completedAt) {
        throw new Error("Un producto creado por el lote cambió luego de completarse. Revisión cancelada.")
      }

      await tx.product.delete({
        where: { id: createdProduct.id },
      })

      await logAuditEvent({
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "PRODUCT_DELETED",
        resourceType: "Product",
        resourceId: createdProduct.id,
        details: {
          source: BULK_REVERT_SOURCE,
          operationId: operation.id,
          productId: createdProduct.productId,
          name: createdProduct.name,
        },
      }, tx)

      deletedProducts += 1
    }

    await tx.inventoryBulkOperation.update({
      where: { id: operation.id },
      data: {
        status: InventoryBulkOperationStatus.REVERTED,
        revertedAt: new Date(),
        revertedById: user.id,
        errorMessage: null,
      },
    })

    return {
      revertedProducts,
      deletedProducts,
    }
  })

  safeRevalidate("/products")
  safeRevalidate("/reports/inventory")
  safeRevalidate("/settings")

  return {
    ok: true,
    revertedProducts: result.revertedProducts,
    deletedProducts: result.deletedProducts,
  }
}

export async function importProductsChunk(input: BulkProductImportChunkInput): Promise<BulkProductImportChunkResult> {
  const user = (input.user as CurrentUser | null | undefined) ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  if (!user.canEditProducts && !user.isOwner) {
    throw new Error("No tienes permiso para importar productos")
  }

  const rows = input.rows ?? []
  if (!rows.length) {
    throw new Error("No hay filas para importar")
  }
  if (rows.length > MAX_IMPORT_ROWS_PER_CHUNK) {
    throw new Error(`Máximo ${MAX_IMPORT_ROWS_PER_CHUNK} filas por lote`)
  }
  await assertWritableBulkOperation(input.operationId, user, InventoryBulkSource.BULK_EXCEL)

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
      if ("unidad_compra" in (row as Record<string, unknown>) || "unidad_venta" in (row as Record<string, unknown>)) {
        throw new Error("Usa la columna unidad. unidad_compra y unidad_venta ya no son válidas")
      }

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

      const unitFromRow = parseImportUnit(row.unidad)
      if (hasImportValue(row.unidad) && !unitFromRow) {
        throw new Error("unidad inválida")
      }

      const hasPrice = hasImportValue(row.precio_venta)
      const priceValue = parseImportNumber(row.precio_venta, "Precio de venta")
      const hasCost = hasImportValue(row.costo)
      const costValue = parseImportNumber(row.costo, "Costo")
      const hasStock = hasImportValue(row.stock)
      const stockValue = parseImportNumber(row.stock, "Existencia")
      const hasMinStock = hasImportValue(row.stock_minimo)
      const minStockValue = parseImportNumber(row.stock_minimo, "Existencia mínima")
      const hasItbis = hasImportValue(row.itbis)
      const itbisRateBp = parseImportItbisBp(row.itbis)
      const images = parseImageUrls(row.imagenes)
      const hasImages = hasImportValue(row.imagenes)
      const hasCategory = hasImportValue(row.categoria)
      const hasSupplier = hasImportValue(row.proveedor)
      const categoryName = hasCategory ? String(row.categoria).trim() : ""
      const supplierName = hasSupplier ? String(row.proveedor).trim() : ""

      if (!hasName || !name) {
        throw new Error("nombre es requerido")
      }
      if (!hasPrice || priceValue === null || priceValue <= 0) {
        throw new Error("precio_venta es requerido y debe ser mayor que 0")
      }
      if (!hasCost || costValue === null || costValue <= 0) {
        throw new Error("costo es requerido y debe ser mayor que 0")
      }
      if (hasMinStock && minStockValue !== null && minStockValue < 0) {
        throw new Error("existencia_minima no puede ser negativa")
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

        const baseUnit = existing.unit
        let nextUnit = unitFromRow ?? baseUnit

        if (productType === "BASICO") {
          nextUnit = "UNIDAD"
        } else if (productType === "MEDIDO") {
          nextUnit = unitFromRow ?? (baseUnit !== "UNIDAD" ? baseUnit : "KG")
          if (nextUnit === "UNIDAD") {
            throw new Error("Los productos MEDIDOS deben usar una unidad distinta de UNIDAD")
          }
        }

        if (hasPrice && priceValue !== null) {
          const priceCents = Math.round(priceValue * 100)
          if (priceCents !== Number(existing.priceCents) && !user.canOverridePrice && !user.isOwner) {
            throw new Error("No tienes permiso para modificar el precio del producto")
          }
        }

        const nextPriceCents = hasPrice && priceValue !== null ? Math.round(priceValue * 100) : Number(existing.priceCents)
        const nextCostCents = hasCost && costValue !== null ? Math.round(costValue * 100) : Number(existing.costCents)
        const nextItbisRateBp = hasItbis && itbisRateBp !== null ? itbisRateBp : Number(existing.itbisRateBp)

        const nextMinStock = hasMinStock && minStockValue !== null
          ? normalizeQtyForUnit(minStockValue, nextUnit, "Existencia mínima")
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
          productKind: productType === "MEDIDO" ? ProductKind.MEASURED : productType === "BASICO" ? ProductKind.BASIC : existing.productKind,
          unit: nextUnit,
          isActive: true,
        }

        if (hasImages) {
          updateData.imageUrls = images ?? []
        }

        await prisma.$transaction(async (tx) => {
          await ensureBulkSnapshot(tx, {
            operationId: input.operationId,
            accountId: user.accountId,
            productId: existing.id,
            existedBefore: true,
            beforeState: serializeBulkSnapshotState(existing),
          })

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
            const stockDelta = normalizeDelta(stockValue, unitAllowsDecimals(nextUnit))
            const currentStock = decimalToNumber(existing.stock)
            const nextStock = roundRecipeQty(currentStock + stockDelta)
            assertDecimal10x3Range(nextStock, "Existencia")
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

      const resolvedProductType = productType ?? "BASICO"
      const unit = resolvedProductType === "BASICO"
        ? "UNIDAD"
        : (unitFromRow ?? "KG")
      if (resolvedProductType === "MEDIDO" && unit === "UNIDAD") {
        throw new Error("Los productos MEDIDOS deben usar una unidad distinta de UNIDAD")
      }

      const initialStockRaw = stockValue ?? 0
      const initialStock = normalizeQtyForUnit(initialStockRaw, unit, "Existencia")
      const minStock = minStockValue === null ? 0 : normalizeQtyForUnit(minStockValue, unit, "Existencia mínima")

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
            productKind: resolvedProductType === "MEDIDO" ? ProductKind.MEASURED : ProductKind.BASIC,
            unit,
            isActive: true,
          },
        })

        await ensureBulkSnapshot(tx, {
          operationId: input.operationId,
          accountId: user.accountId,
          productId: created.id,
          existedBefore: false,
          beforeState: null,
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
  await ensurePermission(user, "canAdjustInventory", {
    message: "No tienes permiso para ajustar inventario",
    resourceType: "InventoryAdjustment",
  })
  let operationId: string | null = null
  let finalized = false

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
        name: true,
        sku: true,
        reference: true,
        supplierId: true,
        categoryId: true,
        priceCents: true,
        costCents: true,
        itbisRateBp: true,
        stock: true,
        minStock: true,
        imageUrls: true,
        productKind: true,
        unit: true,
        isActive: true,
        isAvailableForSale: true,
      },
    })

    if (products.length !== productIds.length) {
      const found = new Set(products.map((p) => p.productId))
      const missing = productIds.filter((id) => !found.has(id))
      throw new Error(`Productos no encontrados o inactivos: ${missing.join(", ")}`)
    }

    const byProductId = new Map(products.map((p) => [p.productId, p]))
    const currentStockByProductId = new Map(
      products.map((p) => [p.productId, decimalToNumber(p.stock)])
    )
    const aggregated = new Map<number, number>()
    for (const item of parsedItems) {
      const product = byProductId.get(item.productId)
      if (!product) {
        throw new Error(`Producto no encontrado: ${item.productId}`)
      }
      const allowsDecimals = unitAllowsDecimals(product.unit)
      const normalizedDelta = normalizeDelta(item.delta, allowsDecimals)
      aggregated.set(item.productId, (aggregated.get(item.productId) ?? 0) + normalizedDelta)
    }

    const items: BulkStockAdjustmentItem[] = Array.from(aggregated.entries())
      .map(([productId, delta]) => ({ productId, delta }))
      .filter((item) => item.delta !== 0)

    if (!items.length) {
      throw new Error("No hay ajustes para aplicar")
    }

    for (const item of items) {
      const currentStock = currentStockByProductId.get(item.productId)
      if (currentStock === undefined) {
        throw new Error(`Producto no encontrado: ${item.productId}`)
      }
      const nextStock = roundRecipeQty(currentStock + item.delta)
      assertDecimal10x3Range(nextStock, "Existencia")
    }

    const reason = sanitizeString(input.reason ?? "") || null
    const batchId = items.length > 1 ? randomUUID() : null
    const startedOperation = await startInventoryBulkOperation({
      source: InventoryBulkSource.BULK_MANUAL,
      reason: reason ?? undefined,
      totalRows: items.length,
      user,
    })
    operationId = startedOperation.operationId

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const product = byProductId.get(item.productId)
        if (!product) {
          throw new Error(`Producto no encontrado: ${item.productId}`)
        }

        await ensureBulkSnapshot(tx, {
          operationId: startedOperation.operationId,
          accountId: user.accountId,
          productId: product.id,
          existedBefore: true,
          beforeState: serializeBulkSnapshotState(product),
        })

        const allowsDecimals = unitAllowsDecimals(product.unit)
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

    await finalizeInventoryBulkOperation({
      operationId,
      status: "COMPLETED",
      totalRows: items.length,
      createdCount: 0,
      updatedCount: items.length,
      failedCount: 0,
      user,
    })
    finalized = true

    safeRevalidate("/products")
    safeRevalidate("/reports/inventory")

    return { count: items.length, batchId, operationId }
  } catch (error) {
    if (operationId && !finalized) {
      try {
        await finalizeInventoryBulkOperation({
          operationId,
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Error al ajustar inventario",
          user,
        })
      } catch {
        // Ignore finalize failures; el error original se reporta debajo.
      }
    }

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
        OR: [
          { productId: input.productId },
          { consumptions: { some: { ingredientId: input.productId } } },
        ],
        sale: {
          accountId: user.accountId,
          ...(dateFilter ? { OR: [{ soldAt: dateFilter }, { cancelledAt: dateFilter }] } : {}),
        },
      },
      include: {
        consumptions: {
          where: { ingredientId: input.productId },
        },
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
        OR: [
          { productId: input.productId },
          { saleItem: { consumptions: { some: { ingredientId: input.productId } } } },
        ],
        return: {
          accountId: user.accountId,
          ...(dateFilter ? { OR: [{ returnedAt: dateFilter }, { cancelledAt: dateFilter }] } : {}),
        },
      },
      include: {
        saleItem: {
          select: {
            qty: true,
            consumptions: {
              where: { ingredientId: input.productId },
              select: {
                ingredientId: true,
                qty: true,
              },
            },
          },
        },
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
    const qty = item.consumptions.length
      ? item.consumptions.reduce((total, consumption) => total + decimalToNumber(consumption.qty), 0)
      : decimalToNumber(item.qty)
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
    const soldQty = decimalToNumber(item.saleItem.qty)
    const consumedQty = item.saleItem.consumptions.reduce((total, consumption) => total + decimalToNumber(consumption.qty), 0)
    const qty = consumedQty > 0 && soldQty > 0
      ? roundRecipeQty((consumedQty / soldQty) * decimalToNumber(item.qty))
      : decimalToNumber(item.qty)
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



import { withCashOperation, type CashOperationInput } from "@/lib/cash-context"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { PaymentMethod, Prisma, ProductKind } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { createSupplierPaymentInTransaction } from "@/lib/accounts-payable"
import { validatePurchaseMetadata, validatePurchaseItems, lockPurchaseAccount, purchaseOperation, purchaseType, dateOnly, moneyCents, PurchaseError, type CreditPurchaseInput, type PurchaseActor } from "@/lib/purchase-credit"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"
import { ensurePermission } from "@/lib/permission-guard"
import { requireTreasuryAccount } from "@/lib/treasury"
import { purchaseReadPermit } from "@/lib/purchase-queries"

function legacyPurchaseItems(items: PurchaseItemInput[]) {
  // El móvil anterior enviaba algunos números como texto; solo normalizar las compras al contado.
  return items.map(item => item && typeof item === "object" ? { ...item, qty: Number(item.qty), unitCostCents: Number(item.unitCostCents ?? 0),
    ...(typeof item.discountPercentBp === "string" ? { discountPercentBp: Number(item.discountPercentBp) } : {}),
    ...(typeof item.saleMarginBp === "string" ? { saleMarginBp: Number(item.saleMarginBp) } : {}),
    ...(typeof item.salePriceCents === "string" ? { salePriceCents: Number(item.salePriceCents) } : {}),
  } : item)
}

function toNumber(value: Decimal | number) {
  return value instanceof Decimal ? value.toNumber() : Number(value)
}

function normalizePurchase<T extends { items: { qty: Decimal | number; product?: { stock?: Decimal | number; minStock?: Decimal | number } }[] }>(
  purchase: T
): T {
  return {
    ...purchase,
    items: purchase.items.map((item) => ({
      ...item,
      qty: toNumber(item.qty),
      product: item.product
        ? {
          ...item.product,
          stock: item.product.stock === undefined ? item.product.stock : toNumber(item.product.stock),
          minStock: item.product.minStock === undefined ? item.product.minStock : toNumber(item.product.minStock),
        }
        : item.product,
    })),
  } as T
}

type PurchaseItemInput = {
  productId: string
  qty: number
  unitCostCents: number
  discountPercentBp?: number
  salePriceCents?: number
  saleMarginBp?: number
  purchaseIncludesItbis?: boolean
}

async function buildPurchaseItems(params: {
  tx: Prisma.TransactionClient
  accountId: string
  supplier: { discountPercentBp?: number; chargesItbis?: boolean; itbisRateBp?: number | null } | null
  items: PurchaseItemInput[]
}) {
  const settings = await params.tx.companySettings.findFirst({
    where: { accountId: params.accountId },
    select: { itbisRateBp: true, defaultProfitMarginBp: true, salePricesIncludeItbis: true },
  })

  const purchaseItbisRateBp = settings?.itbisRateBp ?? 1800
  const defaultProfitMarginBp = settings?.defaultProfitMarginBp ?? 3000
  const salePricesIncludeItbis = settings?.salePricesIncludeItbis ?? true
  const supplierPurchaseItbisRateBp = params.supplier?.chargesItbis
    ? (params.supplier.itbisRateBp ?? purchaseItbisRateBp)
    : purchaseItbisRateBp

  const products = await params.tx.product.findMany({
    where: { accountId: params.accountId, id: { in: params.items.map((i) => i.productId) } },
    select: { id: true, itbisRateBp: true, productKind: true, name: true },
  })
  if (products.length !== params.items.length) {
    throw new PurchaseError("INVALID_PURCHASE", "Algunos productos no existen o no pertenecen a esta cuenta")
  }

  const recipeProduct = products.find((p) => p.productKind === ProductKind.RECIPE)
  if (recipeProduct) {
    throw new PurchaseError("INVALID_PURCHASE", `No puedes registrar compras de "${recipeProduct.name}" porque es un producto por receta. Compra sus insumos en su lugar.`)
  }

  const productById = new Map(products.map((p: { id: string; itbisRateBp: number }) => [p.id, p]))

  return params.items.map((item) => {
    const product = productById.get(item.productId)
    if (!product) {
      throw new PurchaseError("INVALID_PURCHASE", "Producto no encontrado")
    }

    const discountPercentBp = item.discountPercentBp ?? params.supplier?.discountPercentBp ?? 0
    const purchaseIncludesItbis = params.supplier
      ? (params.supplier.chargesItbis ?? false)
      : (item.purchaseIncludesItbis ?? false)
    const pricing = resolvePurchaseSalePricing({
      unitCostCents: item.unitCostCents,
      discountPercentBp,
      purchaseIncludesItbis,
      purchaseItbisRateBp: supplierPurchaseItbisRateBp,
      productItbisRateBp: product.itbisRateBp,
      defaultSaleMarginBp: defaultProfitMarginBp,
      saleMarginBp: item.saleMarginBp,
      salePriceCents: item.salePriceCents,
      salePricesIncludeItbis,
    })

    // El impuesto/margen puede desbordar un Int aunque el costo original y la cantidad sean válidos.
    moneyCents(pricing.netCostCents, true)
    moneyCents(pricing.salePriceCents, true)

    return {
      ...item,
      discountPercentBp: pricing.discountPercentBp,
      netCostCents: pricing.netCostCents,
      lineTotalCents: Math.round(pricing.netCostCents * item.qty),
      salePriceCents: pricing.salePriceCents,
      saleMarginBp: pricing.saleMarginBp,
      purchaseIncludesItbis: pricing.purchaseIncludesItbis,
      appliedItbisRateBp: pricing.appliedItbisRateBp,
    }
  })
}

export async function listPurchases(actor: PurchaseActor) {
  purchaseReadPermit(actor)
  const user = actor
  if (!user) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")

  const purchases = await prisma.purchase.findMany({
    where: { accountId: user.accountId },
    orderBy: { purchasedAt: "desc" },
    include: { payable: true, items: { include: { product: true } } },
    take: 50,
  })

  return purchases.map(normalizePurchase)
}

export async function listAllPurchases(actor: PurchaseActor) {
  purchaseReadPermit(actor)
  const user = actor
  if (!user) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")

  const purchases = await prisma.purchase.findMany({
    where: { accountId: user.accountId },
    orderBy: { purchasedAt: "desc" },
    include: {
      payable: true,
      items: { include: { product: true } },
      cancelledUser: { select: { name: true, username: true } },
    },
    take: 500,
  })

  return purchases.map(normalizePurchase)
}

export async function createPurchase(actor: PurchaseActor, input: Parameters<typeof createPurchaseInternal>[1]) {
  const { cashOperation, ...payload } = input
  return withCashOperation(cashOperation, { kind: "createPurchase", ...payload }, () => createPurchaseInternal(actor, input))
}

async function createPurchaseInternal(actor: PurchaseActor, input: {
  supplierId?: string | null
  supplierName?: string | null
  notes?: string | null
  paymentMethod?: PaymentMethod | null
  treasuryAccountId?: string | null
  dueDate?: string
  type?: "CONTADO" | "CREDITO"
  items: PurchaseItemInput[]
  updateProductCost?: boolean
  updateProductPrice?: boolean
  cashOperation?: CashOperationInput
} & CreditPurchaseInput) {
  const currentUser = actor
  if (!currentUser) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")
  await ensurePermission(currentUser, "canManagePurchases", {
    message: "No tienes permiso para gestionar compras",
    resourceType: "Purchase",
  })

  validatePurchaseMetadata(input)
  if (!Array.isArray(input.items) || !input.items.length) throw new PurchaseError("INVALID_PURCHASE", "La compra no tiene productos")

  return prisma.$transaction(async (tx) => {
    await lockPurchaseAccount(tx, currentUser.accountId)
    const type = purchaseType(input.type)
    const run = async () => {
    if (type === "CONTADO") input.items = legacyPurchaseItems(input.items)

    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findFirst({
        where: { accountId: currentUser.accountId, id: input.supplierId }
      })
    }

    if (input.supplierId && !supplier) throw new PurchaseError("INVALID_SUPPLIER", "Proveedor no encontrado")
    if (type === "CREDITO" && (!supplier || !supplier.isActive)) throw new PurchaseError("INVALID_SUPPLIER", "El crédito requiere un proveedor activo")
    validatePurchaseItems(input.items)
    const itemsWithNetCost = await buildPurchaseItems({
      tx,
      accountId: currentUser.accountId,
      supplier,
      items: input.items,
    })

    if (input.paymentMethod === PaymentMethod.DIVIDIR_PAGO) {
      throw new PurchaseError("INVALID_PURCHASE", "Dividir pago no es un método válido para compras.")
    }

    const purchaseTreasuryAccount = type === "CREDITO" ? null : input.treasuryAccountId?.trim()
      ? await requireTreasuryAccount(tx, {
          accountId: currentUser.accountId,
          treasuryAccountId: input.treasuryAccountId.trim(),
          requireActive: true,
          message: "La cuenta de tesorería seleccionada no existe o está inactiva.",
        })
      : null

    const totalCents = itemsWithNetCost.reduce((s, i) => s + i.lineTotalCents, 0)
    moneyCents(totalCents, type !== "CREDITO")
    const initialPaymentCents = moneyCents(input.initialPaymentCents ?? 0, true)
    if (type === "CONTADO" && initialPaymentCents) throw new PurchaseError("INVALID_INITIAL_PAYMENT", "El abono inicial solo corresponde a crédito")
    if (type === "CREDITO" && initialPaymentCents >= totalCents) throw new PurchaseError("INVALID_INITIAL_PAYMENT", "El abono inicial debe ser menor que el total; usa Contado para pagar todo")
    const dueDate = type === "CREDITO" ? dateOnly(input.dueDate) : null
    const updateProductPrice = input.updateProductPrice !== false

    const supplierName = input.supplierName?.trim() || supplier?.name || null
    const purchase = await tx.purchase.create({
      data: {
        accountId: currentUser.accountId,
        type,
        supplierId: supplier?.id ?? null,
        supplierName,
        paymentMethod: type === "CREDITO" || !purchaseTreasuryAccount ? null : input.paymentMethod ?? PaymentMethod.OTRO,
        treasuryAccountId: purchaseTreasuryAccount?.id ?? null,
        notes: input.notes?.trim() || null,
        userId: currentUser.id,
        totalCents,
        items: {
          create: itemsWithNetCost.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitCostCents: i.unitCostCents,
            discountPercentBp: i.discountPercentBp,
            netCostCents: i.netCostCents,
            salePriceCents: i.salePriceCents,
            saleMarginBp: i.saleMarginBp,
            purchaseIncludesItbis: i.purchaseIncludesItbis,
            appliedItbisRateBp: i.appliedItbisRateBp,
            lineTotalCents: i.lineTotalCents,
          })),
        },
      },

    })

    let payableId: string | null = null
    if (type === "CREDITO" && supplier && dueDate) {
      const ap = await tx.accountPayable.create({ data: { accountId: currentUser.accountId, supplierId: supplier.id, purchaseId: purchase.id, totalCents, balanceCents: totalCents, dueDate } })
      payableId = ap.id
      if (initialPaymentCents) await createSupplierPaymentInTransaction(tx, currentUser, { apId: ap.id, amountCents: initialPaymentCents, method: input.paymentMethod ?? "", treasuryAccountId: input.treasuryAccountId ?? "" })
    }
    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PURCHASE_CREATED",
      resourceType: "Purchase",
      resourceId: purchase.id,
      details: {
        supplierName,
        totalCents,
        itemsCount: itemsWithNetCost.length,
        updateProductCost: input.updateProductCost === true,
        updateProductPrice,
      },
    }, tx)

    for (const item of itemsWithNetCost) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: {
          stock: { increment: item.qty },
          // Actualizar con el costo neto (después de descuento e ITBIS)
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
          ...(updateProductPrice ? { priceCents: item.salePriceCents } : {}),
        },
      })
      if (updated.count === 0) throw new PurchaseError("INVALID_PURCHASE", "Producto no encontrado")
    }

    revalidatePath("/purchases")
    revalidatePath("/products")
    revalidatePath("/dashboard")

    return { ...purchase, purchasedAt: purchase.purchasedAt.toISOString(), createdAt: purchase.createdAt.toISOString(), updatedAt: purchase.updatedAt.toISOString(), payableId, dueDate: dueDate?.toISOString().slice(0, 10) ?? null, paidCents: type === "CREDITO" ? initialPaymentCents : totalCents, balanceCents: type === "CREDITO" ? totalCents - initialPaymentCents : 0 }
    }
    return type === "CREDITO" ? purchaseOperation(tx, currentUser, "creditPurchase", input.operationId, input, run) : run()
  }, TRANSACTION_OPTIONS)
}

export async function searchProductsForPurchase(actor: PurchaseActor, query: string) {
  const user = actor
  if (!user) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")

  const q = query.trim()
  if (!q) return []

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      productKind: { not: ProductKind.RECIPE },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, sku: true, reference: true, costCents: true, priceCents: true, itbisRateBp: true, stock: true, unit: true },
    orderBy: { name: "asc" },
    take: 20,
  })

  // Convertir Decimal a número
  return products.map((p) => ({
    ...p,
    stock: p.stock instanceof Decimal ? p.stock.toNumber() : Number(p.stock),
  }))
}

export async function getPurchaseById(actor: PurchaseActor, id: string) {
  purchaseReadPermit(actor)
  const user = actor
  if (!user) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")

  const purchase = await prisma.purchase.findFirst({
    where: { accountId: user.accountId, id },
    include: {
      payable: true,
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, costCents: true, priceCents: true, itbisRateBp: true, stock: true, minStock: true, unit: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
  })

  if (!purchase) return null

  // Convertir Decimal a numero en items
  return {
    ...purchase,
    items: purchase.items.map((item) => ({
      ...item,
      qty: item.qty instanceof Decimal ? item.qty.toNumber() : Number(item.qty),
      product: {
        ...item.product,
        stock: item.product.stock instanceof Decimal ? item.product.stock.toNumber() : Number(item.product.stock),
        minStock: item.product.minStock instanceof Decimal ? item.product.minStock.toNumber() : Number(item.product.minStock),
      },
    })),
  }
}

export async function cancelPurchase(actor: PurchaseActor, id: string) {
  const currentUser = actor
  if (!currentUser) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")
  await ensurePermission(currentUser, "canCancelPurchases", {
    message: "No tienes permiso para anular compras",
    resourceType: "Purchase",
    resourceId: id,
  })

  return prisma.$transaction(async (tx) => {
    await lockPurchaseAccount(tx, currentUser.accountId)
    const purchase = await tx.purchase.findFirst({
      where: { accountId: currentUser.accountId, id },
      include: { items: true },
    })

    if (!purchase) throw new PurchaseError("NOT_FOUND", "Compra no encontrada", 404)
    if (purchase.cancelledAt) return { id }

    if (await tx.supplierPayment.count({ where: { accountId: currentUser.accountId, cancelledAt: null, ap: { purchaseId: id } } })) throw new PurchaseError("ACTIVE_PAYMENTS", "Revierte los pagos antes de anular la compra", 409)
    // Revertir el stock que se agregó
    for (const item of purchase.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: {
          stock: { decrement: item.qty },
        },
      })
      if (updated.count === 0) throw new PurchaseError("INVALID_PURCHASE", "Producto no encontrado")
    }

    // Marcar como cancelada
    const cancelled = await tx.purchase.updateMany({
      where: { id, accountId: currentUser.accountId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: currentUser.id,
      },
    })
    if (cancelled.count === 0) throw new PurchaseError("INVALID_PURCHASE", "Compra no encontrada")

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PURCHASE_CANCELLED",
      resourceType: "Purchase",
      resourceId: purchase.id,
      details: {
        supplierName: purchase.supplierName,
        totalCents: purchase.totalCents,
        itemsCount: purchase.items.length,
      },
    }, tx)

    revalidatePath("/purchases")
    revalidatePath("/purchases/list")
    revalidatePath("/products")
    revalidatePath("/dashboard")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

export async function updatePurchase(actor: PurchaseActor, input: {
  dueDate?: string
  type?: "CONTADO" | "CREDITO"
  id: string
  supplierId?: string | null
  supplierName?: string | null
  notes?: string | null
  paymentMethod?: PaymentMethod | null
  treasuryAccountId?: string | null
  items: PurchaseItemInput[]
  updateProductCost?: boolean
  updateProductPrice?: boolean
}) {
  const currentUser = actor
  if (!currentUser) throw new PurchaseError("INVALID_PURCHASE", "No autenticado")
  await ensurePermission(currentUser, "canManagePurchases", {
    message: "No tienes permiso para gestionar compras",
    resourceType: "Purchase",
    resourceId: input.id,
  })

  // PUT también es una entrada pública: validar antes de consultar IDs o aplicar trim.
  validatePurchaseMetadata(input)
  if (!Array.isArray(input.items) || !input.items.length) throw new PurchaseError("INVALID_ITEMS", "La compra no tiene productos")

  return prisma.$transaction(async (tx) => {
    await lockPurchaseAccount(tx, currentUser.accountId)
    const existingPurchase = await tx.purchase.findFirst({
      where: { accountId: currentUser.accountId, id: input.id },
      include: { items: true },
    })

    if (!existingPurchase) throw new PurchaseError("NOT_FOUND", "Compra no encontrada", 404)
    if (existingPurchase.cancelledAt) throw new PurchaseError("PURCHASE_CANCELLED", "No se puede editar una compra cancelada", 409)

    if (input.type && input.type !== existingPurchase.type) throw new PurchaseError("PURCHASE_TYPE_IMMUTABLE", "No puedes cambiar el tipo de una compra", 409)
    if (await tx.supplierPayment.count({ where: { accountId: currentUser.accountId, cancelledAt: null, ap: { purchaseId: input.id } } })) throw new PurchaseError("ACTIVE_PAYMENTS", "Revierte los pagos antes de editar productos, importe o proveedor", 409)
    if (existingPurchase.type === "CONTADO") input.items = legacyPurchaseItems(input.items)
    validatePurchaseItems(input.items)
    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    const requestedSupplierId = input.supplierId === undefined ? existingPurchase.supplierId : input.supplierId
    if (requestedSupplierId) {
      supplier = await tx.supplier.findFirst({
        where: { accountId: currentUser.accountId, id: requestedSupplierId }
      })
      if (!supplier) throw new PurchaseError("INVALID_SUPPLIER", "Proveedor no encontrado")
    }

    if (existingPurchase.type === "CREDITO" && (!supplier || !supplier.isActive)) throw new PurchaseError("INVALID_SUPPLIER", "El crédito requiere un proveedor activo")
    // Revertir el stock de los items anteriores
    for (const oldItem of existingPurchase.items) {
      const updated = await tx.product.updateMany({
        where: { id: oldItem.productId, accountId: currentUser.accountId },
        data: {
          stock: { decrement: oldItem.qty },
        },
      })
      if (updated.count === 0) throw new PurchaseError("INVALID_PURCHASE", "Producto no encontrado")
    }

    // Eliminar items anteriores
    await tx.purchaseItem.deleteMany({
      where: {
        purchaseId: input.id,
        purchase: { accountId: currentUser.accountId },
      },
    })

    const itemsWithNetCost = await buildPurchaseItems({
      tx,
      accountId: currentUser.accountId,
      supplier,
      items: input.items,
    })

    if (input.paymentMethod === PaymentMethod.DIVIDIR_PAGO) {
      throw new PurchaseError("INVALID_PURCHASE", "Dividir pago no es un método válido para compras.")
    }

    // Editar una compra histórica sin pago no debe inventar una salida de caja.
    const requestedTreasuryAccountId = input.treasuryAccountId === undefined ? existingPurchase.treasuryAccountId : input.treasuryAccountId
    const resolvedTreasuryAccount = existingPurchase.type === "CREDITO" || !requestedTreasuryAccountId ? null : await requireTreasuryAccount(tx, {
      accountId: currentUser.accountId, treasuryAccountId: requestedTreasuryAccountId,
      requireActive: input.treasuryAccountId !== undefined,
      message: "La cuenta de tesorería seleccionada no existe o está inactiva.",
    })

    // Calcular nuevo total
    const totalCents = itemsWithNetCost.reduce((s, i) => s + i.lineTotalCents, 0)
    moneyCents(totalCents, existingPurchase.type === "CONTADO")
    const updateProductPrice = input.updateProductPrice !== false

    // Actualizar la compra
    // Editar productos no debe reemplazar el nombre histórico por un renombre posterior del proveedor.
    const supplierName = input.supplierName === undefined
      ? (supplier && requestedSupplierId !== existingPurchase.supplierId ? supplier.name : existingPurchase.supplierName)
      : input.supplierName?.trim() || supplier?.name || null
    const updatedPurchase = await tx.purchase.updateMany({
      where: { id: input.id, accountId: currentUser.accountId },
      data: {
        supplierId: supplier?.id ?? null,
        supplierName,
        paymentMethod: !resolvedTreasuryAccount ? null : input.paymentMethod ?? existingPurchase.paymentMethod ?? PaymentMethod.OTRO,
        treasuryAccountId: resolvedTreasuryAccount?.id ?? null,
        notes: input.notes?.trim() || null,
        totalCents,
      },
    })
    if (updatedPurchase.count === 0) throw new PurchaseError("INVALID_PURCHASE", "Compra no encontrada")

    if (existingPurchase.type === "CREDITO" && supplier) {
      moneyCents(totalCents)
      await tx.accountPayable.update({ where: { purchaseId: input.id }, data: { supplierId: supplier.id, totalCents, balanceCents: totalCents, status: "PENDIENTE", ...(input.dueDate ? { dueDate: dateOnly(input.dueDate) } : {}) } })
    }
    await tx.purchaseItem.createMany({
      data: itemsWithNetCost.map((i) => ({
        purchaseId: input.id,
        productId: i.productId,
        qty: i.qty,
        unitCostCents: i.unitCostCents,
        discountPercentBp: i.discountPercentBp,
        netCostCents: i.netCostCents,
        salePriceCents: i.salePriceCents,
        saleMarginBp: i.saleMarginBp,
        purchaseIncludesItbis: i.purchaseIncludesItbis,
        appliedItbisRateBp: i.appliedItbisRateBp,
        lineTotalCents: i.lineTotalCents,
      })),
    })

    // Aplicar nuevo stock y costo
    for (const item of itemsWithNetCost) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: {
          stock: { increment: item.qty },
          // Actualizar con el costo neto (después de descuento e ITBIS)
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
          ...(updateProductPrice ? { priceCents: item.salePriceCents } : {}),
        },
      })
      if (updated.count === 0) throw new PurchaseError("INVALID_PURCHASE", "Producto no encontrado")
    }

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PURCHASE_EDITED",
      resourceType: "Purchase",
      resourceId: input.id,
      details: {
        supplierName,
        totalCents,
        itemsCount: itemsWithNetCost.length,
        updateProductCost: input.updateProductCost === true,
        updateProductPrice,
      },
    }, tx)

    revalidatePath("/purchases")
    revalidatePath("/products")
    revalidatePath("/dashboard")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

export async function patchPurchase(actor: PurchaseActor, id: string, input: { notes?: string | null; dueDate?: string }) {
  await ensurePermission(actor, "canManagePurchases", { resourceType: "Purchase", resourceId: id })
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") throw new PurchaseError("INVALID_NOTES", "Las notas deben ser texto")
  return prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    const purchase = await tx.purchase.findFirst({ where: { id, accountId: actor.accountId } })
    if (!purchase) throw new PurchaseError("NOT_FOUND", "Compra no encontrada", 404)
    if (purchase.cancelledAt) throw new PurchaseError("PURCHASE_CANCELLED", "La compra está anulada", 409)
    if (input.dueDate !== undefined && purchase.type !== "CREDITO") throw new PurchaseError("INVALID_DUE_DATE", "Solo las compras a crédito tienen vencimiento")
    if (input.dueDate !== undefined) await tx.accountPayable.update({ where: { purchaseId: id }, data: { dueDate: dateOnly(input.dueDate) } })
    if (input.notes !== undefined) await tx.purchase.update({ where: { id }, data: { notes: input.notes?.trim() || null } })
    await logAuditEvent({ accountId: actor.accountId, userId: actor.id, action: "PURCHASE_EDITED", resourceType: "Purchase", resourceId: id, details: input }, tx)
    return { id }
  }, TRANSACTION_OPTIONS)
}

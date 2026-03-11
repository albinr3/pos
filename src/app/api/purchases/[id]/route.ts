import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"
import { hasPermissionOrLog } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return Number((value as { toNumber: () => number }).toNumber())
  }
  return Number(value || 0)
}

async function buildPurchaseItems(params: {
  tx: Prisma.TransactionClient
  accountId: string
  supplier: { discountPercentBp?: number; chargesItbis?: boolean; itbisRateBp?: number | null } | null
  items: Array<{
    productId: string
    qty: number
    unitCostCents: number
    discountPercentBp?: number
    salePriceCents?: number
    saleMarginBp?: number
    purchaseIncludesItbis?: boolean
  }>
}) {
  const settings = await params.tx.companySettings.findFirst({
    where: { accountId: params.accountId },
    select: { itbisRateBp: true, defaultProfitMarginBp: true },
  })

  const purchaseItbisRateBp = settings?.itbisRateBp ?? 1800
  const defaultProfitMarginBp = settings?.defaultProfitMarginBp ?? 3000
  const supplierPurchaseItbisRateBp = params.supplier?.chargesItbis
    ? (params.supplier.itbisRateBp ?? purchaseItbisRateBp)
    : purchaseItbisRateBp

  const products = await params.tx.product.findMany({
    where: { accountId: params.accountId, id: { in: params.items.map((i) => i.productId) } },
    select: { id: true, itbisRateBp: true },
  })
  if (products.length !== params.items.length) {
    throw new Error("Algunos productos no existen o no pertenecen a esta cuenta")
  }

  const productById = new Map(products.map((p: { id: string; itbisRateBp: number }) => [p.id, p]))

  return params.items.map((item) => {
    const product = productById.get(item.productId)
    if (!product) throw new Error("Producto no encontrado")

    const discountPercentBp = item.discountPercentBp ?? params.supplier?.discountPercentBp ?? 0
    const purchaseIncludesItbis = params.supplier
      ? (params.supplier.chargesItbis ?? false)
      : (item.purchaseIncludesItbis ?? true)
    const pricing = resolvePurchaseSalePricing({
      unitCostCents: item.unitCostCents,
      discountPercentBp,
      purchaseIncludesItbis,
      purchaseItbisRateBp: supplierPurchaseItbisRateBp,
      productItbisRateBp: product.itbisRateBp,
      defaultSaleMarginBp: defaultProfitMarginBp,
      saleMarginBp: item.saleMarginBp,
      salePriceCents: item.salePriceCents,
    })

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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

type ApiPurchaseItemInput = {
  productId: string
  qty: number
  unitCostCents: number
  discountPercentBp?: number
  salePriceCents?: number
  saleMarginBp?: number
  purchaseIncludesItbis?: boolean
}

// GET /api/purchases/:id - Obtener compra
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const purchase = await prisma.purchase.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, costCents: true, itbisRateBp: true } },
          },
        },
      },
    })
    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      id: purchase.id,
      purchasedAt: purchase.purchasedAt.toISOString(),
      supplierName: purchase.supplierName,
      notes: purchase.notes,
      totalCents: purchase.totalCents,
      cancelledAt: purchase.cancelledAt ? purchase.cancelledAt.toISOString() : null,
      items: purchase.items.map((item: (typeof purchase.items)[number]) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || null,
        qty: toNumber(item.qty),
        unitCostCents: item.unitCostCents,
        discountPercentBp: item.discountPercentBp,
        netCostCents: item.netCostCents,
        salePriceCents: item.salePriceCents,
        saleMarginBp: item.saleMarginBp,
        purchaseIncludesItbis: item.purchaseIncludesItbis,
        appliedItbisRateBp: item.appliedItbisRateBp,
        lineTotalCents: item.lineTotalCents,
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/purchases/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al obtener compra" },
      { status: 500 }
    )
  }
}

// PUT /api/purchases/:id - Editar compra
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManagePurchases = await hasPermissionOrLog(user, "canManagePurchases", {
      resourceType: "Purchase",
      details: { endpoint: "/api/purchases/[id]", method: "PUT" },
    })
    if (!canManagePurchases) {
      return NextResponse.json({ error: "No tienes permiso para gestionar compras" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const inputItems = Array.isArray(body?.items) ? body.items : []
    if (inputItems.length === 0) {
      return NextResponse.json({ error: "La compra no tiene productos" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findFirst({
        where: { id, accountId: user.accountId },
        include: { items: true },
      })
      if (!existingPurchase) throw new Error("Compra no encontrada")
      if (existingPurchase.cancelledAt) throw new Error("No se puede editar una compra cancelada")

      let supplier: { name: string; discountPercentBp: number; chargesItbis: boolean; itbisRateBp: number | null } | null = null
      if (body?.supplierId) {
        supplier = await tx.supplier.findFirst({
          where: { accountId: user.accountId, id: String(body.supplierId) },
          select: { name: true, discountPercentBp: true, chargesItbis: true, itbisRateBp: true },
        })
      }

      const normalizedItems: ApiPurchaseItemInput[] = inputItems.map((rawItem: unknown) => {
        const item = (rawItem ?? {}) as Record<string, unknown>
        const qty = Number(item.qty || 0)
        const unitCostCents = Number(item.unitCostCents || 0)
        const discountPercentBp = Number.isFinite(Number(item.discountPercentBp))
          ? Number(item.discountPercentBp)
          : undefined
        const salePriceCents = Number.isFinite(Number(item.salePriceCents))
          ? Number(item.salePriceCents)
          : undefined
        const saleMarginBp = Number.isFinite(Number(item.saleMarginBp))
          ? Number(item.saleMarginBp)
          : undefined
        const purchaseIncludesItbis = typeof item.purchaseIncludesItbis === "boolean"
          ? item.purchaseIncludesItbis
          : undefined
        return {
          productId: String(item.productId || ""),
          qty,
          unitCostCents,
          discountPercentBp,
          salePriceCents,
          saleMarginBp,
          purchaseIncludesItbis,
        }
      })

      if (normalizedItems.some((item) => !item.productId || item.qty <= 0 || item.unitCostCents < 0)) {
        throw new Error("Hay productos con cantidad o costo inválido")
      }

      for (const oldItem of existingPurchase.items) {
        const updated = await tx.product.updateMany({
          where: { id: oldItem.productId, accountId: user.accountId },
          data: { stock: { decrement: oldItem.qty } },
        })
        if (updated.count === 0) throw new Error("Producto no encontrado")
      }

      await tx.purchaseItem.deleteMany({
        where: { purchaseId: id },
      })

      const itemsWithComputed = await buildPurchaseItems({
        tx,
        accountId: user.accountId,
        supplier,
        items: normalizedItems,
      })

      const totalCents = itemsWithComputed.reduce((sum, item) => sum + item.lineTotalCents, 0)
      const supplierName = (body?.supplierName || "").trim() || supplier?.name || null
      const updateProductCost = Boolean(body?.updateProductCost)
      const updateProductPrice = body?.updateProductPrice !== false

      await tx.purchase.update({
        where: { id },
        data: {
          supplierName,
          notes: (body?.notes || "").trim() || null,
          totalCents,
        },
      })

      await tx.purchaseItem.createMany({
        data: itemsWithComputed.map((i) => ({
          purchaseId: id,
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

      for (const item of itemsWithComputed) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, accountId: user.accountId },
          data: {
            stock: { increment: item.qty },
            ...(updateProductCost ? { costCents: item.netCostCents } : {}),
            ...(updateProductPrice ? { priceCents: item.salePriceCents } : {}),
          },
        })
        if (updated.count === 0) throw new Error("Producto no encontrado")
      }

      const updatedPurchase = await tx.purchase.findFirst({
        where: { id, accountId: user.accountId },
      })
      if (!updatedPurchase) throw new Error("Compra no encontrada")
      return updatedPurchase
    }, TRANSACTION_OPTIONS)

    return NextResponse.json({
      id: result.id,
      purchasedAt: result.purchasedAt.toISOString(),
      supplierName: result.supplierName,
      notes: result.notes,
      totalCents: result.totalCents,
      updatedAt: result.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    console.error("Error en PUT /api/purchases/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al editar compra" },
      { status: 500 }
    )
  }
}

// DELETE /api/purchases/:id - Anular compra
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canCancelPurchases = await hasPermissionOrLog(user, "canCancelPurchases", {
      resourceType: "Purchase",
      details: { endpoint: "/api/purchases/[id]", method: "DELETE" },
    })
    if (!canCancelPurchases) {
      return NextResponse.json({ error: "No tienes permiso para anular compras" }, { status: 403 })
    }

    const { id } = await params
    const cancelledPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, accountId: user.accountId },
        include: { items: true },
      })

      if (!purchase) throw new Error("Compra no encontrada")
      if (purchase.cancelledAt) throw new Error("Esta compra ya esta cancelada")

      for (const item of purchase.items) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, accountId: user.accountId },
          data: { stock: { decrement: item.qty } },
        })
        if (updated.count === 0) throw new Error("Producto no encontrado")
      }

      return tx.purchase.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancelledBy: user.id,
        },
      })
    }, TRANSACTION_OPTIONS)

    return NextResponse.json({
      id: cancelledPurchase.id,
      cancelledAt: cancelledPurchase.cancelledAt?.toISOString() ?? null,
    })
  } catch (error: unknown) {
    console.error("Error en DELETE /api/purchases/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al anular compra" },
      { status: 500 }
    )
  }
}


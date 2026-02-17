import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { resolvePurchaseSalePricing } from "@/lib/purchase-pricing"

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
  supplier: { discountPercentBp?: number; chargesItbis?: boolean } | null
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
      purchaseItbisRateBp,
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

// GET /api/purchases - Listar compras
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()

    const purchases = await prisma.purchase.findMany({
      where: {
        accountId: user.accountId,
        ...(query
          ? {
              OR: [
                { supplierName: { contains: query, mode: "insensitive" } },
                { notes: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { purchasedAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
      take: 200,
    })

    return NextResponse.json({
      data: purchases.map((purchase) => ({
        id: purchase.id,
        purchasedAt: purchase.purchasedAt.toISOString(),
        supplierName: purchase.supplierName,
        notes: purchase.notes,
        totalCents: purchase.totalCents,
        cancelledAt: purchase.cancelledAt ? purchase.cancelledAt.toISOString() : null,
        itemsCount: purchase.items.length,
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
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/purchases:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al obtener compras" },
      { status: 500 }
    )
  }
}

// POST /api/purchases - Crear compra
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const inputItems = Array.isArray(body?.items) ? body.items : []
    if (inputItems.length === 0) {
      return NextResponse.json({ error: "La compra no tiene productos" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      let supplier: { name: string; discountPercentBp: number; chargesItbis: boolean } | null = null
      if (body?.supplierId) {
        supplier = await tx.supplier.findFirst({
          where: { accountId: user.accountId, id: String(body.supplierId) },
          select: { name: true, discountPercentBp: true, chargesItbis: true },
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

      const purchase = await tx.purchase.create({
        data: {
          accountId: user.accountId,
          supplierName,
          notes: (body?.notes || "").trim() || null,
          userId: user.id,
          totalCents,
          items: {
            create: itemsWithComputed.map((i) => ({
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

      return purchase
    }, TRANSACTION_OPTIONS)

    return NextResponse.json({
      id: result.id,
      purchasedAt: result.purchasedAt.toISOString(),
      supplierName: result.supplierName,
      notes: result.notes,
      totalCents: result.totalCents,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/purchases:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al crear compra" },
      { status: 500 }
    )
  }
}


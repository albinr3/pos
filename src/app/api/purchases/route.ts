import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function calculateNetCost(unitCostCents: number, discountPercentBp: number, chargesItbis: boolean): number {
  const discountRate = discountPercentBp / 10000
  const costAfterDiscount = unitCostCents * (1 - discountRate)
  const itbisRate = chargesItbis ? 0.18 : 0
  return Math.round(costAfterDiscount * (1 + itbisRate))
}

function toNumber(value: any): number {
  if (typeof value === "number") return value
  if (value && typeof value.toNumber === "function") return Number(value.toNumber())
  return Number(value || 0)
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
        items: purchase.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name || null,
          qty: toNumber(item.qty),
          unitCostCents: item.unitCostCents,
          discountPercentBp: item.discountPercentBp,
          netCostCents: item.netCostCents,
          lineTotalCents: item.lineTotalCents,
        })),
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/purchases:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener compras" },
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
      let supplier: any = null
      if (body?.supplierId) {
        supplier = await tx.supplier.findFirst({
          where: { accountId: user.accountId, id: String(body.supplierId) },
        })
      }

      const normalizedItems = inputItems.map((item: any) => {
        const qty = Number(item?.qty || 0)
        const unitCostCents = Number(item?.unitCostCents || 0)
        const discountPercentBp = Number.isFinite(Number(item?.discountPercentBp))
          ? Number(item.discountPercentBp)
          : undefined
        return {
          productId: String(item?.productId || ""),
          qty,
          unitCostCents,
          discountPercentBp,
        }
      })

      if (normalizedItems.some((item: any) => !item.productId || item.qty <= 0 || item.unitCostCents < 0)) {
        throw new Error("Hay productos con cantidad o costo inválido")
      }

      const products = await tx.product.findMany({
        where: {
          accountId: user.accountId,
          id: { in: normalizedItems.map((i: any) => i.productId) },
        },
        select: { id: true },
      })
      if (products.length !== normalizedItems.length) {
        throw new Error("Algunos productos no existen o no pertenecen a esta cuenta")
      }

      const itemsWithComputed = normalizedItems.map((item: any) => {
        const discountBp = item.discountPercentBp ?? supplier?.discountPercentBp ?? 0
        const chargesItbis = supplier ? (supplier.chargesItbis ?? false) : true
        const netCostCents = calculateNetCost(item.unitCostCents, discountBp, chargesItbis)
        return {
          ...item,
          discountPercentBp: discountBp,
          netCostCents,
          lineTotalCents: Math.round(netCostCents * item.qty),
        }
      })

      const totalCents = itemsWithComputed.reduce((sum: number, item: any) => sum + item.lineTotalCents, 0)
      const supplierName = (body?.supplierName || "").trim() || supplier?.name || null
      const updateProductCost = Boolean(body?.updateProductCost)

      const purchase = await tx.purchase.create({
        data: {
          accountId: user.accountId,
          supplierName,
          notes: (body?.notes || "").trim() || null,
          userId: user.id,
          totalCents,
          items: {
            create: itemsWithComputed.map((i: any) => ({
              productId: i.productId,
              qty: i.qty,
              unitCostCents: i.unitCostCents,
              discountPercentBp: i.discountPercentBp,
              netCostCents: i.netCostCents,
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
  } catch (error: any) {
    console.error("Error en POST /api/purchases:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear compra" },
      { status: 500 }
    )
  }
}


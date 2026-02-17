import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
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
            product: { select: { id: true, name: true, sku: true, costCents: true } },
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
    })
  } catch (error: any) {
    console.error("Error en GET /api/purchases/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener compra" },
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

      await tx.purchase.update({
        where: { id },
        data: {
          supplierName,
          notes: (body?.notes || "").trim() || null,
          totalCents,
        },
      })

      await tx.purchaseItem.createMany({
        data: itemsWithComputed.map((i: any) => ({
          purchaseId: id,
          productId: i.productId,
          qty: i.qty,
          unitCostCents: i.unitCostCents,
          discountPercentBp: i.discountPercentBp,
          netCostCents: i.netCostCents,
          lineTotalCents: i.lineTotalCents,
        })),
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
  } catch (error: any) {
    console.error("Error en PUT /api/purchases/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al editar compra" },
      { status: 500 }
    )
  }
}


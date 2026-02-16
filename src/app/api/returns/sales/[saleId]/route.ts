import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { getSaleForReturn } from "@/app/(app)/returns/actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/returns/sales/:saleId - Obtener venta y disponibilidad para devolución
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { saleId } = await context.params
    if (!saleId) {
      return NextResponse.json({ error: "saleId es requerido" }, { status: 400 })
    }

    const sale = await getSaleForReturn(saleId, user)
    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      id: sale.id,
      invoiceCode: sale.invoiceCode,
      soldAt: sale.soldAt?.toISOString?.() || null,
      type: sale.type,
      totalCents: sale.totalCents,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            phone: sale.customer.phone || null,
          }
        : null,
      items: sale.items.map((item: any) => ({
        id: item.id,
        saleItemId: item.id,
        productId: item.productId,
        qty: Number(item.qty),
        returnedQty: Number(item.returnedQty || 0),
        availableQty: Number(item.availableQty || 0),
        unitPriceCents: item.unitPriceCents,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              sku: item.product.sku,
              reference: item.product.reference,
              saleUnit: item.product.saleUnit,
            }
          : null,
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/returns/sales/[saleId]:", error)
    return NextResponse.json(
      { error: error.message || "Error obteniendo venta para devolución" },
      { status: 500 }
    )
  }
}

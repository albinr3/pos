import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { createReturn, listReturns } from "@/app/(app)/returns/actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/returns - Listar devoluciones
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const returnsList = await listReturns(user)

    return NextResponse.json({
      data: returnsList.map((r: any) => ({
        id: r.id,
        returnCode: r.returnCode,
        saleId: r.saleId,
        totalCents: r.totalCents,
        notes: r.notes || null,
        returnedAt: r.returnedAt?.toISOString?.() || null,
        cancelledAt: r.cancelledAt?.toISOString?.() || null,
        sale: r.sale
          ? {
              id: r.sale.id,
              invoiceCode: r.sale.invoiceCode,
              type: r.sale.type,
              customer: r.sale.customer
                ? {
                    id: r.sale.customer.id,
                    name: r.sale.customer.name,
                  }
                : null,
            }
          : null,
        items:
          r.items?.map((item: any) => ({
            id: item.id,
            saleItemId: item.saleItemId,
            productId: item.productId,
            qty: Number(item.qty),
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents,
            product: item.product
              ? {
                  name: item.product.name,
                  sku: item.product.sku,
                  reference: item.product.reference,
                }
              : null,
          })) || [],
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/returns:", error)
    return NextResponse.json(
      { error: error.message || "Error al listar devoluciones" },
      { status: 500 }
    )
  }
}

// POST /api/returns - Crear devolución
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const saleId = String(body.saleId || "").trim()
    const notes = typeof body.notes === "string" ? body.notes : null

    const items = (body.items || []).map((item: any) => ({
      saleItemId: String(item.saleItemId || "").trim(),
      productId: String(item.productId || "").trim(),
      qty: Number(item.qty),
      unitPriceCents: Number(item.unitPriceCents ?? Math.round((item.price || 0) * 100)),
    }))

    if (!saleId) {
      return NextResponse.json({ error: "saleId es requerido" }, { status: 400 })
    }
    if (!items.length) {
      return NextResponse.json({ error: "La devolución no tiene productos." }, { status: 400 })
    }
    if (items.some((i: any) => !i.saleItemId || !i.productId || i.qty <= 0 || i.unitPriceCents <= 0)) {
      return NextResponse.json({ error: "Hay items inválidos en la devolución." }, { status: 400 })
    }

    const created = await createReturn(
      {
        saleId,
        items,
        notes,
      },
      user
    )

    return NextResponse.json(
      {
        id: created.id,
        returnCode: created.returnCode,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error en POST /api/returns:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear devolución" },
      { status: 500 }
    )
  }
}

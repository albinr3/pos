import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { searchSalesForReturn } from "@/app/(app)/returns/actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/returns/sales?query=... - Buscar ventas para devolución
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const query = request.nextUrl.searchParams.get("query") || ""
    const customerId = request.nextUrl.searchParams.get("customerId") || null
    const result = await searchSalesForReturn(query, user, { customerId })

    return NextResponse.json({
      data: result.map((sale: any) => ({
        id: sale.id,
        invoiceCode: sale.invoiceCode,
        soldAt: sale.soldAt?.toISOString?.() || null,
        type: sale.type,
        totalCents: sale.totalCents,
        customer: sale.customer
          ? {
              id: sale.customer.id,
              visualId: sale.customer.visualId,
              name: sale.customer.name,
              phone: sale.customer.phone || null,
            }
          : null,
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/returns/sales:", error)
    return NextResponse.json(
      { error: error.message || "Error buscando ventas para devolución" },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { listOpenAR } from "@/app/(app)/ar/actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/accounts-receivable - Listar cuentas por cobrar
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query") || undefined
    const skip = searchParams.get("skip") ? parseInt(searchParams.get("skip")!) : undefined
    const take = searchParams.get("take") ? parseInt(searchParams.get("take")!) : undefined

    const arList = await listOpenAR({ query, skip, take }, user)

    return NextResponse.json({
      data: arList.map((ar) => ({
        id: ar.id,
        saleId: ar.saleId,
        customerId: ar.customerId,
        totalCents: ar.totalCents,
        balanceCents: ar.balanceCents,
        status: ar.status,
        dueDate: ar.dueDate?.toISOString() || null,
        createdAt: ar.createdAt.toISOString(),
        updatedAt: ar.updatedAt.toISOString(),
        customer: ar.customer ? {
          id: ar.customer.id,
          name: ar.customer.name,
          phone: ar.customer.phone,
        } : null,
        sale: ar.sale ? {
          id: ar.sale.id,
          invoiceCode: ar.sale.invoiceCode,
          totalCents: ar.sale.totalCents,
          createdAt: ar.sale.createdAt.toISOString(),
        } : null,
        payments: ar.payments?.map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          method: p.method,
          paidAt: p.paidAt.toISOString(),
        })) || [],
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/accounts-receivable:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener cuentas por cobrar" },
      { status: 500 }
    )
  }
}

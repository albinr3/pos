import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { listOpenAR } from "@/app/(app)/ar/actions"
import { cashRequest } from "@/lib/cash-context"

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
    const customerId = searchParams.get("customerId") || undefined
    const skip = searchParams.get("skip") === null ? 0 : Number(searchParams.get("skip"))
    const take = searchParams.get("take") === null ? 10 : Number(searchParams.get("take"))
    if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 500) return NextResponse.json({ error: "Paginación inválida" }, { status: 400 })

    if (!user.isOwner && !user.canAccessAccountsReceivable) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })
    const arList = await cashRequest.run({ trustedActor: user }, () => listOpenAR({ query, customerId, skip, take: take + 1 }))
    const hasMore = arList.length > take
    const pageItems = hasMore ? arList.slice(0, take) : arList

    return NextResponse.json({
      data: pageItems.map((ar) => ({
        id: ar.id,
        saleId: ar.saleId,
        origin: ar.origin,
        customerId: ar.customerId,
        customerVisualId: ar.customer?.visualId ?? null,
        totalCents: ar.totalCents,
        balanceCents: ar.balanceCents,
        paidCents: ar.paidCents,
        adjustments: ar.adjustments,
        status: ar.status,
        dueDate: ar.dueDate?.toISOString() || null,
        createdAt: ar.createdAt.toISOString(),
        updatedAt: ar.updatedAt.toISOString(),
        customer: ar.customer ? {
          id: ar.customer.id,
          visualId: ar.customer.visualId,
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
      nextSkip: hasMore ? skip + take : null,
    })
  } catch (error: any) {
    console.error("Error en GET /api/accounts-receivable:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener cuentas por cobrar" },
      { status: 500 }
    )
  }
}

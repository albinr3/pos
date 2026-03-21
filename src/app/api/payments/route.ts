import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { addPayment } from "@/app/(app)/ar/actions"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

// GET /api/payments - Listar recibos de pago
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()
    const normalizedVisualQuery = query ? query.replace(/^#/, "") : ""
    const visualIdQuery = normalizedVisualQuery && /^\d+$/.test(normalizedVisualQuery) ? Number(normalizedVisualQuery) : null
    const take = searchParams.get("take") ? Math.min(500, Math.max(1, parseInt(searchParams.get("take")!, 10))) : 200

    const payments = await prisma.payment.findMany({
      where: {
        ar: {
          sale: {
            accountId: user.accountId,
          },
        },
        ...(query
          ? {
              OR: [
                { receiptCode: { contains: query, mode: "insensitive" } },
                { note: { contains: query, mode: "insensitive" } },
                { transferBankName: { contains: query, mode: "insensitive" } },
                { ar: { customer: { name: { contains: query, mode: "insensitive" } } } },
                ...(visualIdQuery !== null ? [{ ar: { customer: { visualId: visualIdQuery } } }] : []),
                { ar: { sale: { invoiceCode: { contains: query, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      orderBy: { paidAt: "desc" },
      include: {
        ar: {
          include: {
            customer: { select: { id: true, visualId: true, name: true, phone: true } },
            sale: { select: { id: true, invoiceCode: true, cancelledAt: true } },
          },
        },
        user: { select: { id: true, username: true, name: true } },
        cancelledUser: { select: { id: true, username: true, name: true } },
      },
      take,
    })

    return NextResponse.json({
      data: payments.map((p) => ({
        id: p.id,
        arId: p.arId,
        receiptNumber: p.receiptNumber,
        receiptCode: p.receiptCode,
        amountCents: p.amountCents,
        method: p.method,
        transferBankName: p.transferBankName,
        note: p.note,
        paidAt: p.paidAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
        cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
        cancelledBy: p.cancelledBy || null,
        customer: p.ar?.customer
          ? {
              id: p.ar.customer.id,
              visualId: p.ar.customer.visualId,
              name: p.ar.customer.name,
              phone: p.ar.customer.phone,
            }
          : null,
        sale: p.ar?.sale
          ? {
              id: p.ar.sale.id,
              invoiceCode: p.ar.sale.invoiceCode,
              cancelledAt: p.ar.sale.cancelledAt ? p.ar.sale.cancelledAt.toISOString() : null,
            }
          : null,
        user: p.user
          ? {
              id: p.user.id,
              username: p.user.username,
              name: p.user.name,
            }
          : null,
        cancelledUser: p.cancelledUser
          ? {
              id: p.cancelledUser.id,
              username: p.cancelledUser.username,
              name: p.cancelledUser.name,
            }
          : null,
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/payments:", error)
    return NextResponse.json({ error: getErrorMessage(error) || "Error al obtener pagos" }, { status: 500 })
  }
}

// POST /api/payments - Registrar pago
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()

    // Convertir amount de pesos a centavos si viene como número decimal
    const amountCents = body.amountCents ?? (body.amount ? Math.round(body.amount * 100) : undefined)
    
    if (!amountCents || amountCents <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    // Convertir paymentMethod al enum
    const methodMap: Record<string, PaymentMethod> = {
      EFECTIVO: PaymentMethod.EFECTIVO,
      TARJETA: PaymentMethod.TARJETA,
      TRANSFERENCIA: PaymentMethod.TRANSFERENCIA,
      OTRO: PaymentMethod.OTRO,
    }

    const method = methodMap[body.method || body.paymentMethod]
    if (!method) {
      return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 })
    }

    // arId puede venir como arId, accountReceivableId, o saleId
    let arId = body.arId || body.accountReceivableId
    
    // Si viene saleId, buscar el AR correspondiente
    if (!arId && body.saleId) {
      const { prisma } = await import("@/lib/db")
      const ar = await prisma.accountReceivable.findFirst({
        where: {
          saleId: body.saleId,
          sale: { accountId: user.accountId },
        },
      })
      if (!ar) {
        return NextResponse.json({ error: "Cuenta por cobrar no encontrada" }, { status: 404 })
      }
      arId = ar.id
    }

    if (!arId) {
      return NextResponse.json({ error: "arId o saleId es requerido" }, { status: 400 })
    }

    const paymentResult = await addPayment({
      arId,
      amountCents,
      method,
      transferBankName: body.transferBankName || null,
      note: body.note || null,
    }, user)

    // Obtener el pago completo para retornarlo
    const { prisma } = await import("@/lib/db")
    const payment = await prisma.payment.findUnique({
      where: { id: paymentResult.paymentId },
      include: { ar: { include: { sale: true } } },
    })

    if (!payment) {
      return NextResponse.json({ error: "Error al crear pago" }, { status: 500 })
    }

    return NextResponse.json({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      receiptCode: payment.receiptCode,
      amountCents: payment.amountCents,
      method: payment.method,
      transferBankName: payment.transferBankName,
      paidAt: payment.paidAt.toISOString(),
      appliedCents: paymentResult.appliedCents,
      newBalanceCents: paymentResult.newBalanceCents,
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/payments:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al registrar pago" },
      { status: 500 }
    )
  }
}

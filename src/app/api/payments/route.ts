import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { addPayment } from "@/app/(app)/ar/actions"
import { PaymentMethod } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

    const payment = await addPayment({
      arId,
      amountCents,
      method,
      note: body.note || null,
    })

    return NextResponse.json({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amountCents: payment.amountCents,
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
    }, { status: 201 })
  } catch (error: any) {
    console.error("Error en POST /api/payments:", error)
    return NextResponse.json(
      { error: error.message || "Error al registrar pago" },
      { status: 500 }
    )
  }
}

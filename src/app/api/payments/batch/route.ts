import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { addBatchPayment } from "@/app/(app)/ar/actions"
import { PaymentMethod } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

// POST /api/payments/batch - Registrar pago múltiple
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()

    const arIds = Array.isArray(body.arIds) ? body.arIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : []
    if (arIds.length === 0) {
      return NextResponse.json({ error: "Debes enviar al menos una factura" }, { status: 400 })
    }

    const amountCents = body.amountCents ?? (body.amount ? Math.round(body.amount * 100) : undefined)
    if (!amountCents || amountCents <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

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

    const result = await addBatchPayment({
      arIds,
      amountCents,
      method,
      transferBankName: body.transferBankName || null,
      note: body.note || null,
    })

    return NextResponse.json(
      {
        receiptCode: result.receiptCode,
        paymentIds: result.paymentIds,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/payments/batch:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al registrar pago batch" },
      { status: 500 }
    )
  }
}

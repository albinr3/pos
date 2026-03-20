import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import {
  createManualPayment,
  getBillingSubscription,
  getBankAccountById,
} from "@/lib/billing"
import { logAuditEvent } from "@/lib/audit-log"
import { notifyManualPaymentPending } from "@/lib/billing-manual-payment-alert"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/billing/payments/manual - Crear pago DOP pendiente
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const bankAccountId = String(body?.bankAccountId || "").trim()

    if (!bankAccountId) {
      return NextResponse.json(
        { success: false, error: "Debes seleccionar una cuenta bancaria" },
        { status: 400 }
      )
    }

    const bankAccount = await getBankAccountById(bankAccountId)
    if (!bankAccount) {
      return NextResponse.json({ success: false, error: "Cuenta bancaria no encontrada" }, { status: 404 })
    }

    const subscription = await getBillingSubscription(user.accountId)
    if (!subscription) {
      return NextResponse.json({ success: false, error: "No hay suscripción activa" }, { status: 400 })
    }

    const payment = await createManualPayment(
      subscription.id,
      subscription.priceDopCents,
      bankAccountId
    )

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "PAYMENT_CREATED",
      resourceType: "BillingPayment",
      resourceId: payment.id,
      details: {
        currency: "DOP",
        amountCents: subscription.priceDopCents,
        bankAccountId,
        bankName: bankAccount.bankName,
      },
    })

    await notifyManualPaymentPending({
      accountId: user.accountId,
      paymentId: payment.id,
      amountCents: subscription.priceDopCents,
      bankName: bankAccount.bankName,
      userId: user.id,
      userName: user.name,
      userUsername: user.username,
      userEmail: user.email ?? null,
    })

    return NextResponse.json({ success: true, paymentId: payment.id, payment }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/billing/payments/manual:", error)
    const errorMessage = error instanceof Error ? error.message : "Error al crear el pago"
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

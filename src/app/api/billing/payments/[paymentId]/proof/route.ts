import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../../../_helpers/auth"
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit"
import { uploadPaymentProof } from "@/lib/billing"
import { logAuditEvent } from "@/lib/audit-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/billing/payments/[paymentId]/proof - Asociar comprobante a pago
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 })
    }

    const { paymentId } = await context.params
    if (!paymentId) {
      return NextResponse.json({ success: false, error: "paymentId es requerido" }, { status: 400 })
    }

    const payment = await prisma.billingPayment.findFirst({
      where: {
        id: paymentId,
        subscription: {
          accountId: user.accountId,
        },
      },
      select: {
        id: true,
      },
    })

    if (!payment) {
      return NextResponse.json({ success: false, error: "Pago no encontrado" }, { status: 404 })
    }

    const body = await request.json()
    const proofUrl = String(body?.proofUrl || body?.url || "").trim()
    const amountCents = Number.isFinite(Number(body?.amountCents)) ? Number(body.amountCents) : undefined
    const note = typeof body?.note === "string" ? body.note.trim() : undefined

    if (!proofUrl) {
      return NextResponse.json({ success: false, error: "La URL del comprobante es requerida" }, { status: 400 })
    }

    try {
      checkRateLimit(`payment-proof:user:${user.accountId}:${user.id}`, {
        windowMs: 10 * 60 * 1000,
        maxRequests: 10,
        blockDurationMs: 10 * 60 * 1000,
      })
      checkRateLimit(`payment-proof:payment:${user.accountId}:${payment.id}`, {
        windowMs: 10 * 60 * 1000,
        maxRequests: 5,
        blockDurationMs: 10 * 60 * 1000,
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { success: false, error: `Demasiados intentos. Intenta de nuevo en ${error.retryAfter} segundos.` },
          { status: 429 }
        )
      }
      throw error
    }

    const { isFirstProof } = await uploadPaymentProof(
      payment.id,
      proofUrl,
      amountCents,
      note
    )

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "SETTINGS_CHANGED",
      resourceType: "BillingPaymentProof",
      resourceId: payment.id,
      details: { action: "proof_uploaded", paymentId: payment.id, isFirstProof },
    })

    if (isFirstProof) {
      await logAuditEvent({
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "SETTINGS_CHANGED",
        resourceType: "BillingSubscription",
        details: { newStatus: "ACTIVE", reason: "first_proof_uploaded" },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error en POST /api/billing/payments/[paymentId]/proof:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Error al subir el comprobante" },
      { status: 500 }
    )
  }
}

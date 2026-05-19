import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

// POST /api/payments/:id/cancel - Cancelar un recibo de pago
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    if (!user.canCancelPayments && !user.isOwner) {
      return NextResponse.json({ error: "No tienes permiso para cancelar pagos" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({} as { cancellationReason?: string; cancelReason?: string; reason?: string }))
    // Acepta alias para compatibilidad y obliga motivo de cancelación.
    const cancellationReason = String(body?.cancellationReason || body?.cancelReason || body?.reason || "").trim()
    if (!cancellationReason) {
      return NextResponse.json({ error: "Debes indicar un motivo de cancelación" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: {
          id,
          ar: {
            sale: {
              accountId: user.accountId,
            },
          },
        },
        include: { ar: true },
      })

      if (!payment) throw new Error("Pago no encontrado")
      if (payment.cancelledAt) throw new Error("Este pago ya está cancelado")

      const activePayments = await tx.payment.findMany({
        where: {
          arId: payment.arId,
          cancelledAt: null,
          id: { not: id },
          ar: {
            sale: {
              accountId: user.accountId,
            },
          },
        },
      })

      const totalPaid = activePayments.reduce((sum, p) => sum + p.amountCents, 0)
      const newBalanceCents = payment.ar.totalCents - totalPaid
      const newStatus = newBalanceCents === 0 ? "PAGADA" : newBalanceCents === payment.ar.totalCents ? "PENDIENTE" : "PARCIAL"

      await tx.accountReceivable.update({
        where: { id: payment.arId },
        data: {
          balanceCents: newBalanceCents,
          status: newStatus,
        },
      })

      await tx.payment.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancelledBy: user.id,
          cancellationReason,
        },
      })

      await logAuditEvent(
        {
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "PAYMENT_CANCELLED",
          resourceType: "Payment",
          resourceId: payment.id,
          details: {
            amountCents: payment.amountCents,
            method: payment.method,
            arId: payment.arId,
            reason: cancellationReason,
          },
        },
        tx
      )

      return {
        id: payment.id,
        arId: payment.arId,
        amountCents: payment.amountCents,
        newBalanceCents,
        newStatus,
      }
    }, TRANSACTION_OPTIONS)

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error("Error en POST /api/payments/[id]/cancel:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al cancelar pago" },
      { status: 500 }
    )
  }
}

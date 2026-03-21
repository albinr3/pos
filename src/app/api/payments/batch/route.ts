import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { isDominicanBankName } from "@/lib/dominican-banks"
import { getCurrentUserFromRequest } from "../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()

    const rawArIds = Array.isArray(body?.arIds)
      ? body.arIds
      : Array.isArray(body?.accountReceivableIds)
        ? body.accountReceivableIds
        : []

    const arIds: string[] = []
    const seen = new Set<string>()
    for (const rawId of rawArIds) {
      const id = String(rawId || "").trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      arIds.push(id)
    }

    if (!arIds.length) {
      return NextResponse.json({ error: "arIds es requerido" }, { status: 400 })
    }

    const amountCents =
      body?.amountCents ??
      (body?.amount ? Math.round(Number(body.amount) * 100) : undefined)

    if (!Number.isFinite(Number(amountCents)) || Number(amountCents) <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    const methodMap: Record<string, PaymentMethod> = {
      EFECTIVO: PaymentMethod.EFECTIVO,
      TARJETA: PaymentMethod.TARJETA,
      TRANSFERENCIA: PaymentMethod.TRANSFERENCIA,
      OTRO: PaymentMethod.OTRO,
    }

    const methodKey = String(body?.method || body?.paymentMethod || "").toUpperCase()
    const method = methodMap[methodKey]
    if (!method) {
      return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 })
    }

    const transferBankNameRaw =
      typeof body?.transferBankName === "string" ? body.transferBankName.trim() : ""
    const transferBankName = transferBankNameRaw || null
    if (method === PaymentMethod.TRANSFERENCIA) {
      if (!transferBankName) {
        return NextResponse.json({ error: "Debes seleccionar el banco de la transferencia" }, { status: 400 })
      }
      if (!isDominicanBankName(transferBankName)) {
        return NextResponse.json({ error: "El banco de transferencia seleccionado no es válido" }, { status: 400 })
      }
    }

    const note = typeof body?.note === "string" ? body.note.trim() || null : null

    const result = await prisma.$transaction(async (tx) => {
      const ars = await tx.accountReceivable.findMany({
        where: {
          id: { in: arIds },
          sale: { accountId: user.accountId },
        },
        select: {
          id: true,
          totalCents: true,
          balanceCents: true,
          status: true,
          sale: { select: { id: true, invoiceCode: true, cancelledAt: true } },
        },
      })

      const arById = new Map(ars.map((ar) => [ar.id, ar]))
      const orderedArs = arIds
        .map((id) => arById.get(id) || null)
        .filter((row): row is NonNullable<typeof row> => !!row)

      if (!orderedArs.length) {
        throw new Error("No se encontraron cuentas por cobrar válidas para este usuario")
      }

      let remaining = Math.round(Number(amountCents))
      const applications: Array<{ arId: string; invoiceCode: string | null; appliedCents: number; newBalanceCents: number }> = []

      for (const ar of orderedArs) {
        if (remaining <= 0) break
        if (ar.sale?.cancelledAt) continue

        const currentBalance = Math.max(0, Number(ar.balanceCents || 0))
        if (currentBalance <= 0) continue

        const appliedCents = Math.min(remaining, currentBalance)
        const newBalanceCents = currentBalance - appliedCents

        applications.push({
          arId: ar.id,
          invoiceCode: ar.sale?.invoiceCode || null,
          appliedCents,
          newBalanceCents,
        })

        remaining -= appliedCents
      }

      if (!applications.length) {
        throw new Error("No hay balance pendiente en las facturas seleccionadas")
      }

      const seq = await tx.paymentSequence.upsert({
        where: { accountId: user.accountId },
        update: { lastNumber: { increment: 1 } },
        create: { accountId: user.accountId, lastNumber: 1 },
      })

      const receiptNumber = seq.lastNumber
      const receiptCode = `R-${String(receiptNumber).padStart(6, "0")}`
      const paidAt = new Date()
      const paymentIds: string[] = []

      for (const app of applications) {
        const payment = await tx.payment.create({
          data: {
            arId: app.arId,
            userId: user.id,
            receiptNumber,
            receiptCode,
            paidAt,
            amountCents: app.appliedCents,
            method,
            transferBankName: method === PaymentMethod.TRANSFERENCIA ? transferBankName : null,
            note,
          },
          select: { id: true },
        })

        await tx.accountReceivable.update({
          where: { id: app.arId },
          data: {
            balanceCents: app.newBalanceCents,
            status: app.newBalanceCents === 0 ? "PAGADA" : "PARCIAL",
          },
        })

        paymentIds.push(payment.id)

        await logAuditEvent({
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "PAYMENT_CREATED",
          resourceType: "Payment",
          resourceId: payment.id,
          details: {
            arId: app.arId,
            invoiceCode: app.invoiceCode,
            amountCents: app.appliedCents,
            method,
            transferBankName: method === PaymentMethod.TRANSFERENCIA ? transferBankName : null,
            receiptCode,
            isBatch: true,
          },
        }, tx)
      }

      const appliedTotalCents = applications.reduce((sum, app) => sum + app.appliedCents, 0)

      return {
        paymentIds,
        receiptCode,
        receiptNumber,
        appliedTotalCents,
        items: applications,
      }
    }, TRANSACTION_OPTIONS)

    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/daily-close")
    revalidatePath("/reports/payments")
    revalidatePath("/reports/profit")

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/payments/batch:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al registrar pago múltiple" },
      { status: 500 }
    )
  }
}

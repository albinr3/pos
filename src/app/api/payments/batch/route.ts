import { cashRequest, withCashOperation } from "@/lib/cash-context"
import { assertNoFiscalInput, UnsupportedFiscalInputError } from "@/lib/fiscal/core/input"
import { cashErrorResponse } from "@/lib/cash-http"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import {
  getTransferBankNameFromTreasuryAccount,
  requireTreasuryAccount,
  resolveTreasuryAccountFromLegacyBankName,
} from "@/lib/treasury"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({}))
  const { cashOperation, ...payload } = body
  return cashRequest.run({ ...cashRequest.getStore(), fiscalCollectionRequested: true }, () => withCashOperation(cashOperation, { kind: "batch-api", ...payload }, () => postPaymentBatch(request)))
}

async function postPaymentBatch(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    // El lote debe exigir el mismo permiso de cobro que el pago individual.
    if (!user.isOwner && !user.canAccessAccountsReceivable) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })

    const body = await request.json()
    // Evitar que el lote ignore metadatos fiscales y aplique pagos ordinarios.
    assertNoFiscalInput(body)

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

    // Un lote no debe convertir centavos fraccionarios o cadenas en un cobro diferente.
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) {
      return NextResponse.json({ error: "El monto debe ser un número entero válido de centavos" }, { status: 400 })
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
    const treasuryAccountId = typeof body?.treasuryAccountId === "string" ? body.treasuryAccountId.trim() : ""

    const note = typeof body?.note === "string" ? body.note.trim() || null : null

    const result = await prisma.$transaction(async (tx) => {
      const treasuryAccount =
        (treasuryAccountId
          ? await requireTreasuryAccount(tx, {
              accountId: user.accountId,
              treasuryAccountId,
              requireActive: true,
              message: "La cuenta de tesorería seleccionada no existe o está inactiva.",
            })
          : null) ??
        (await resolveTreasuryAccountFromLegacyBankName(tx, {
          accountId: user.accountId,
          transferBankName,
          requireActive: true,
        }))

      if (!treasuryAccount) {
        throw new Error("Debes seleccionar una cuenta de tesorería para registrar el cobro")
      }

      const resolvedTransferBankName =
        method === PaymentMethod.TRANSFERENCIA
          ? getTransferBankNameFromTreasuryAccount(treasuryAccount)
          : null

      const ars = await tx.accountReceivable.findMany({
        where: {
          id: { in: arIds },
          accountId: user.accountId,
        },
        select: {
          id: true,
          totalCents: true,
          balanceCents: true,
          status: true,
          customerId: true,
          sale: { select: { id: true, invoiceCode: true, cancelledAt: true } },
          debitAdjustment: { select: { id: true, state: true } },
        },
      })

      const arById = new Map(ars.map((ar) => [ar.id, ar]))
      const orderedArs = arIds
        .map((id) => arById.get(id) || null)
        .filter((row): row is NonNullable<typeof row> => !!row)

      if (orderedArs.length !== arIds.length) {
        throw new Error("No se encontraron cuentas por cobrar válidas para este usuario")
      }
      // Nunca combinar deudas de clientes distintos ni omitir silenciosamente IDs ajenos en un lote.
      if (new Set(orderedArs.map(ar => ar.customerId)).size !== 1) throw new Error("Todas las cuentas deben pertenecer al mismo cliente")
      // Rechazar el lote completo evita cobrar parcialmente una selección con un origen inválido.
      if (orderedArs.some(ar => ar.sale?.cancelledAt || (!ar.sale && ar.debitAdjustment?.state !== "PREPARADO_PENDIENTE_CONEXION"))) throw new Error("Una cuenta seleccionada no tiene un origen vigente")

      let remaining = Math.round(Number(amountCents))
      const applications: Array<{ arId: string; invoiceCode: string | null; appliedCents: number; newBalanceCents: number }> = []

      for (const ar of orderedArs) {
        if (remaining <= 0) break
        const currentBalance = Math.max(0, Number(ar.balanceCents || 0))
        if (currentBalance <= 0) continue

        const appliedCents = Math.min(remaining, currentBalance)
        const newBalanceCents = currentBalance - appliedCents

        applications.push({
          arId: ar.id,
          invoiceCode: ar.sale?.invoiceCode ?? (ar.debitAdjustment ? `ND-${ar.debitAdjustment.id.slice(-8).toUpperCase()}` : null),
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
            treasuryAccountId: treasuryAccount.id,
            transferBankName: resolvedTransferBankName,
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
            treasuryAccountId: treasuryAccount.id,
            transferBankName: resolvedTransferBankName,
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
    if (error instanceof UnsupportedFiscalInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    console.error("Error en POST /api/payments/batch:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al registrar pago múltiple" },
      { status: 500 }
    )
  }
}

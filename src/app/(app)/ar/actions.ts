"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { PaymentMethod } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { endOfDay } from "@/lib/dates"
import { logError, ErrorCodes } from "@/lib/error-logger"
import {
  ensureDefaultTreasuryAccount,
  getTransferBankNameFromTreasuryAccount,
  requireTreasuryAccount,
  resolveTreasuryAccountFromLegacyBankName,
} from "@/lib/treasury"

type AuthActor = {
  id: string
  accountId: string
  email?: string | null
  username?: string | null
}

function assertAuthActor(actor: any): asserts actor is AuthActor {
  if (!actor || typeof actor !== "object") throw new Error("No autenticado")
  if (typeof actor.id !== "string" || actor.id.length === 0) throw new Error("No autenticado")
  if (typeof actor.accountId !== "string" || actor.accountId.length === 0) throw new Error("No autenticado")
}

function parseVisualIdQuery(rawQuery: string | undefined): number | null {
  if (!rawQuery) return null
  const trimmed = rawQuery.trim()
  if (!trimmed) return null

  // Acepta formatos: 12, #12, (12)
  if (!/^[#(]?\s*\d+\s*\)?$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return null

  return Number(digits)
}

type ARDebugSnapshot = {
  id: string
  status: string
  balanceCents: number
  totalCents: number
  dueDate: Date | null
  customerId: string
  customerName: string | null
  customerVisualId: number | null
  saleId: string
  invoiceCode: string
  saleType: string
  soldAt: Date
}

async function getArDebugSnapshots(accountId: string, arIds: string[]): Promise<ARDebugSnapshot[]> {
  try {
    const ars = await prisma.accountReceivable.findMany({
      where: {
        id: { in: arIds },
        sale: { accountId },
      },
      select: {
        id: true,
        status: true,
        balanceCents: true,
        totalCents: true,
        dueDate: true,
        customerId: true,
        customer: {
          select: {
            name: true,
            visualId: true,
          },
        },
        saleId: true,
        sale: {
          select: {
            invoiceCode: true,
            type: true,
            soldAt: true,
          },
        },
      },
    })

    return ars.map((ar) => ({
      id: ar.id,
      status: ar.status,
      balanceCents: ar.balanceCents,
      totalCents: ar.totalCents,
      dueDate: ar.dueDate,
      customerId: ar.customerId,
      customerName: ar.customer?.name ?? null,
      customerVisualId: ar.customer?.visualId ?? null,
      saleId: ar.saleId,
      invoiceCode: ar.sale.invoiceCode,
      saleType: ar.sale.type,
      soldAt: ar.sale.soldAt,
    }))
  } catch {
    return []
  }
}

async function hasRecentAlreadyPaidLog(params: {
  accountId: string
  userId: string
  endpoint: string
  arIds: string[]
  windowMinutes?: number
}): Promise<boolean> {
  const windowMs = (params.windowMinutes ?? 60) * 60 * 1000
  const since = new Date(Date.now() - windowMs)
  const targetIds = new Set(params.arIds)

  try {
    const recent = await prisma.errorLog.findMany({
      where: {
        accountId: params.accountId,
        userId: params.userId,
        code: ErrorCodes.AR_ALREADY_PAID_ATTEMPT,
        endpoint: params.endpoint,
        createdAt: { gte: since },
      },
      select: {
        metadata: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    })

    for (const log of recent) {
      const metadata = log.metadata
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue

      const arId = (metadata as Record<string, unknown>).arId
      if (typeof arId === "string" && targetIds.has(arId)) return true

      const arIds = (metadata as Record<string, unknown>).arIds
      if (Array.isArray(arIds) && arIds.some((id) => typeof id === "string" && targetIds.has(id))) {
        return true
      }
    }
  } catch {
    // Si falla la deduplicación, continuar con el logging normal.
  }

  return false
}

export async function listOpenAR(
  options?: {
    query?: string
    skip?: number
    take?: number
    overdueOnly?: boolean
    sortBy?: "alphabetical" | "dueDate" | "amount"
  },
  actor?: AuthActor
) {
  const user = actor ?? await getCurrentUser()
  assertAuthActor(user)

  const query = options?.query?.trim()
  const visualIdQuery = parseVisualIdQuery(query)
  const overdueOnly = options?.overdueOnly ?? false
  const sortBy = options?.sortBy ?? "alphabetical"
  const skip = options?.skip ?? 0
  const take = options?.take ?? 10

  const where: any = {
    status: { in: ["PENDIENTE", "PARCIAL"] },
    sale: { 
      accountId: user.accountId,
      cancelledAt: null, // Excluir ventas canceladas
    },
  }

  if (query) {
    where.OR = [
      { sale: { invoiceCode: { contains: query, mode: "insensitive" }, cancelledAt: null } },
      { customer: { name: { contains: query, mode: "insensitive" } } },
      ...(visualIdQuery !== null ? [{ customer: { visualId: visualIdQuery } }] : []),
    ]
  }
  if (overdueOnly) {
    where.dueDate = {
      lte: endOfDay(),
    }
  }

  const orderBy =
    sortBy === "dueDate"
      ? [{ dueDate: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }]
      : sortBy === "amount"
      ? [{ balanceCents: "desc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }]
      : [
          { customer: { name: "asc" as const } },
          { createdAt: "asc" as const },
          { id: "asc" as const },
        ]

  return prisma.accountReceivable.findMany({
    where,
    orderBy,
    include: {
      customer: true,
      sale: true,
      payments: {
        where: { cancelledAt: null }, // Solo pagos no cancelados
        orderBy: { paidAt: "desc" },
      },
    },
    skip,
    take,
  })
}

export async function getARSummaryStats(actor?: AuthActor) {
  const user = actor ?? await getCurrentUser()
  assertAuthActor(user)

  const todayEnd = endOfDay()

  const [arOpen, arOverdue] = await Promise.all([
    prisma.accountReceivable.aggregate({
      where: {
        status: { in: ["PENDIENTE", "PARCIAL"] },
        sale: {
          accountId: user.accountId,
          cancelledAt: null,
        },
      },
      _sum: { balanceCents: true },
      _count: true,
    }),
    prisma.accountReceivable.aggregate({
      where: {
        status: { in: ["PENDIENTE", "PARCIAL"] },
        dueDate: { lte: todayEnd },
        sale: {
          accountId: user.accountId,
          cancelledAt: null,
        },
      },
      _count: true,
    }),
  ])

  return {
    openBalanceCents: arOpen._sum.balanceCents ?? 0,
    openCount: arOpen._count ?? 0,
    overdueCount: arOverdue._count ?? 0,
  }
}

export async function cancelPayment(id: string, reason: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")
  const normalizedReason = reason.trim()
  // Validación defensiva: exige motivo para evitar cancelaciones sin trazabilidad.
  if (!normalizedReason) throw new Error("Debes indicar un motivo de cancelación")

  return prisma.$transaction(async (tx) => {
    // Verificar que el pago pertenece al account del usuario
    const payment = await tx.payment.findFirst({
      where: { 
        id,
        ar: {
          sale: {
            accountId: currentUser.accountId,
          },
        },
      },
      include: { ar: true },
    })

    if (!payment) throw new Error("Pago no encontrado")
    if (payment.cancelledAt) throw new Error("Este pago ya está cancelado")

    // Usar el usuario actual en lugar de buscar por username
    const user = currentUser

    // Verificar permiso para cancelar pagos
    if (!user.canCancelPayments && !user.isOwner) {
      throw new Error("No tienes permiso para cancelar pagos")
    }

    // Recalcular el balance de la cuenta por cobrar
    const activePayments = await tx.payment.findMany({
      where: {
        arId: payment.arId,
        cancelledAt: null,
        id: { not: id }, // Excluir este pago
        ar: {
          sale: {
            accountId: currentUser.accountId,
          },
        },
      },
    })

    const totalPaid = activePayments.reduce((sum, p) => sum + p.amountCents, 0)
    const newBalance = payment.ar.totalCents - totalPaid

    // Actualizar cuenta por cobrar
    const updatedAr = await tx.accountReceivable.updateMany({
      where: { id: payment.arId, sale: { accountId: currentUser.accountId } },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? "PAGADA" : newBalance === payment.ar.totalCents ? "PENDIENTE" : "PARCIAL",
      },
    })
    if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")

    // Marcar pago como cancelado
    const cancelled = await tx.payment.updateMany({
      where: { id, ar: { sale: { accountId: currentUser.accountId } } },
      data: {
        cancelledAt: new Date(),
        cancelledBy: user.id,
        cancellationReason: normalizedReason,
      },
    })
    if (cancelled.count === 0) throw new Error("Pago no encontrado")

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: user.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PAYMENT_CANCELLED",
      resourceType: "Payment",
      resourceId: payment.id,
      details: {
        amountCents: payment.amountCents,
        method: payment.method,
        arId: payment.arId,
        reason: normalizedReason,
      },
    }, tx)

    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/daily-close")
    revalidatePath("/reports/payments")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

export async function listAllPayments() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.payment.findMany({
    where: {
      ar: {
        sale: {
          accountId: user.accountId,
        },
      },
    },
    orderBy: { paidAt: "desc" },
    include: {
      ar: {
        include: {
          customer: true,
          sale: {
            select: { invoiceCode: true, cancelledAt: true },
          },
        },
      },
      cancelledUser: { select: { name: true, username: true } },
    },
    take: 500,
  })
}

export async function addPayment(input: {
  arId: string
  amountCents: number
  method: PaymentMethod
  transferBankName?: string | null
  treasuryAccountId?: string | null
  note?: string | null
}, actor?: AuthActor) {
  const currentUser = actor ?? await getCurrentUser()
  assertAuthActor(currentUser)

  if (input.amountCents <= 0) throw new Error("El abono debe ser mayor a 0")
  if (input.method === PaymentMethod.DIVIDIR_PAGO) {
    throw new Error("Dividir pago no es un metodo valido para registrar un cobro.")
  }
  try {
    return await prisma.$transaction(async (tx) => {
      // Verificar que la cuenta por cobrar pertenece al account del usuario
      const ar = await tx.accountReceivable.findFirst({
        where: {
          id: input.arId,
          sale: {
            accountId: currentUser.accountId,
          },
        },
      })
      if (!ar) throw new Error("Cuenta por cobrar no encontrada")
      if (ar.status === "PAGADA" || ar.balanceCents <= 0) throw new Error("Esta factura ya está pagada")

    const explicitTreasuryAccountId = input.treasuryAccountId?.trim() ?? null
    const treasuryAccount =
      (explicitTreasuryAccountId
        ? await requireTreasuryAccount(tx, {
            accountId: currentUser.accountId,
            treasuryAccountId: explicitTreasuryAccountId,
            requireActive: true,
            message: "La cuenta de tesorería seleccionada no existe o está inactiva.",
          })
        : null) ??
      (await resolveTreasuryAccountFromLegacyBankName(tx, {
        accountId: currentUser.accountId,
        transferBankName: input.transferBankName,
        requireActive: true,
      })) ??
      (await ensureDefaultTreasuryAccount(tx, currentUser.accountId, currentUser.id))

    if (!treasuryAccount) {
      throw new Error("Debes seleccionar una cuenta de tesorería para registrar el cobro.")
    }

    const resolvedTransferBankName =
      input.method === PaymentMethod.TRANSFERENCIA
        ? getTransferBankNameFromTreasuryAccount(treasuryAccount)
        : null

    const amount = Math.min(input.amountCents, ar.balanceCents)

    // Obtener o crear la secuencia de recibos para este account
    const seq = await tx.paymentSequence.upsert({
      where: { accountId: currentUser.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: currentUser.accountId, lastNumber: 1 },
    })

    const receiptNumber = seq.lastNumber
    const receiptCode = `R-${String(receiptNumber).padStart(6, '0')}`

    const payment = await tx.payment.create({
      data: {
        arId: ar.id,
        userId: currentUser.id,
        receiptNumber,
        receiptCode,
        amountCents: amount,
        method: input.method,
        treasuryAccountId: treasuryAccount.id,
        transferBankName: resolvedTransferBankName,
        note: input.note || null,
      },
      select: { id: true, receiptCode: true },
    })

    const newBalance = ar.balanceCents - amount

    const updatedAr = await tx.accountReceivable.updateMany({
      where: { id: ar.id, sale: { accountId: currentUser.accountId } },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? "PAGADA" : "PARCIAL",
      },
    })
    if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PAYMENT_CREATED",
      resourceType: "Payment",
      resourceId: payment.id,
      details: {
        amountCents: amount,
        method: input.method,
        treasuryAccountId: treasuryAccount.id,
        transferBankName: resolvedTransferBankName,
        arId: ar.id,
        receiptCode: payment.receiptCode,
      },
    }, tx)

    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/daily-close")

      return {
        paymentId: payment.id,
        receiptCode: payment.receiptCode,
        appliedCents: amount,
        newBalanceCents: newBalance
      }
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Esta factura ya está pagada" || error.message === "La factura ya está pagada")
    ) {
      const shouldSkipLog = await hasRecentAlreadyPaidLog({
        accountId: currentUser.accountId,
        userId: currentUser.id,
        endpoint: "/ar/actions/addPayment",
        arIds: [input.arId],
        windowMinutes: 360,
      })
      if (shouldSkipLog) {
        throw error
      }

      const snapshots = await getArDebugSnapshots(currentUser.accountId, [input.arId])
      const arSnapshot = snapshots[0] ?? null
      await logError(error, {
        code: ErrorCodes.AR_ALREADY_PAID_ATTEMPT,
        severity: "MEDIUM",
        accountId: currentUser.accountId,
        userId: currentUser.id,
        userEmail: currentUser.email ?? undefined,
        endpoint: "/ar/actions/addPayment",
        metadata: {
          event: "AR_ALREADY_PAID_ATTEMPT",
          arId: input.arId,
          attemptedAmountCents: input.amountCents,
          method: input.method,
          transferBankName:
            input.method === PaymentMethod.TRANSFERENCIA
              ? input.transferBankName?.trim() ?? null
              : null,
          attemptedAt: new Date().toISOString(),
          arSnapshot,
        },
      })
    }
    throw error
  }
}

export async function addBatchPayment(input: {
  arIds: string[]
  amountCents: number
  method: PaymentMethod
  transferBankName?: string | null
  treasuryAccountId?: string | null
  note?: string | null
}) {
  const currentUser = await getCurrentUser()
  assertAuthActor(currentUser)

  if (!input.arIds.length) throw new Error("Debes seleccionar al menos una factura")
  if (input.amountCents <= 0) throw new Error("El abono debe ser mayor a 0")
  const uniqueArIds = Array.from(new Set(input.arIds))
  if (uniqueArIds.length !== input.arIds.length) {
    throw new Error("Hay facturas duplicadas en la selección")
  }
  if (input.method === PaymentMethod.DIVIDIR_PAGO) {
    throw new Error("Dividir pago no es un método válido para registrar un cobro.")
  }
  // Si solo es una factura, delegar al flujo individual
  if (uniqueArIds.length === 1) {
    const result = await addPayment({
      arId: uniqueArIds[0],
      amountCents: input.amountCents,
      method: input.method,
      transferBankName: input.transferBankName,
      treasuryAccountId: input.treasuryAccountId,
      note: input.note,
    })
    return {
      receiptCode: result.receiptCode,
      paymentIds: [result.paymentId],
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Cargar todos los AR dentro de la transacción
      const ars = await tx.accountReceivable.findMany({
        where: {
          id: { in: uniqueArIds },
          sale: { accountId: currentUser.accountId },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })

    if (ars.length !== uniqueArIds.length) {
      throw new Error("Algunas cuentas por cobrar no fueron encontradas")
    }

    // Verificar que todas pertenecen al mismo cliente
    const customerIds = new Set(ars.map((ar) => ar.customerId))
    if (customerIds.size > 1) {
      throw new Error("Todas las facturas deben ser del mismo cliente")
    }

    // Verificar que ninguna está pagada
    for (const ar of ars) {
      if (ar.status === "PAGADA" || ar.balanceCents <= 0) {
        throw new Error(`La factura ya está pagada`)
      }
    }

    const explicitTreasuryAccountId = input.treasuryAccountId?.trim() ?? null
    const treasuryAccount =
      (explicitTreasuryAccountId
        ? await requireTreasuryAccount(tx, {
            accountId: currentUser.accountId,
            treasuryAccountId: explicitTreasuryAccountId,
            requireActive: true,
            message: "La cuenta de tesorería seleccionada no existe o está inactiva.",
          })
        : null) ??
      (await resolveTreasuryAccountFromLegacyBankName(tx, {
        accountId: currentUser.accountId,
        transferBankName: input.transferBankName,
        requireActive: true,
      })) ??
      (await ensureDefaultTreasuryAccount(tx, currentUser.accountId, currentUser.id))

    if (!treasuryAccount) {
      throw new Error("Debes seleccionar una cuenta de tesorería para registrar el cobro.")
    }

    const resolvedTransferBankName =
      input.method === PaymentMethod.TRANSFERENCIA
        ? getTransferBankNameFromTreasuryAccount(treasuryAccount)
        : null

    const totalBalance = ars.reduce((sum, ar) => sum + ar.balanceCents, 0)
    const totalToApply = Math.min(input.amountCents, totalBalance)

    // Obtener un solo receiptCode para todo el batch
    const seq = await tx.paymentSequence.upsert({
      where: { accountId: currentUser.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: currentUser.accountId, lastNumber: 1 },
    })
    const receiptNumber = seq.lastNumber
    const receiptCode = `R-${String(receiptNumber).padStart(6, "0")}`

    let remaining = totalToApply
    const paymentIds: string[] = []

    for (const ar of ars) {
      if (remaining <= 0) break

      const amount = Math.min(remaining, ar.balanceCents)
      remaining -= amount

      const payment = await tx.payment.create({
        data: {
          arId: ar.id,
          userId: currentUser.id,
          receiptNumber,
          receiptCode,
          amountCents: amount,
          method: input.method,
          treasuryAccountId: treasuryAccount.id,
          transferBankName: resolvedTransferBankName,
          note: input.note || null,
        },
        select: { id: true },
      })

      paymentIds.push(payment.id)

      const newBalance = ar.balanceCents - amount
      await tx.accountReceivable.updateMany({
        where: { id: ar.id, sale: { accountId: currentUser.accountId } },
        data: {
          balanceCents: newBalance,
          status: newBalance === 0 ? "PAGADA" : "PARCIAL",
        },
      })

      await logAuditEvent(
        {
          accountId: currentUser.accountId,
          userId: currentUser.id,
          userEmail: currentUser.email ?? null,
          userUsername: currentUser.username ?? null,
          action: "PAYMENT_CREATED",
          resourceType: "Payment",
          resourceId: payment.id,
          details: {
            amountCents: amount,
            method: input.method,
            treasuryAccountId: treasuryAccount.id,
            transferBankName: resolvedTransferBankName,
            arId: ar.id,
            receiptCode,
            batchPayment: true,
          },
        },
        tx
      )
    }

      revalidatePath("/ar")
      revalidatePath("/dashboard")
      revalidatePath("/daily-close")

      return { receiptCode, paymentIds }
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Esta factura ya está pagada" || error.message === "La factura ya está pagada")
    ) {
      const shouldSkipLog = await hasRecentAlreadyPaidLog({
        accountId: currentUser.accountId,
        userId: currentUser.id,
        endpoint: "/ar/actions/addBatchPayment",
        arIds: uniqueArIds,
        windowMinutes: 360,
      })
      if (shouldSkipLog) {
        throw error
      }

      const snapshots = await getArDebugSnapshots(currentUser.accountId, uniqueArIds)
      const alreadyPaid = snapshots.filter((ar) => ar.status === "PAGADA" || ar.balanceCents <= 0)
      await logError(error, {
        code: ErrorCodes.AR_ALREADY_PAID_ATTEMPT,
        severity: "MEDIUM",
        accountId: currentUser.accountId,
        userId: currentUser.id,
        userEmail: currentUser.email ?? undefined,
        endpoint: "/ar/actions/addBatchPayment",
        metadata: {
          event: "AR_ALREADY_PAID_ATTEMPT",
          arIds: uniqueArIds,
          attemptedAmountCents: input.amountCents,
          method: input.method,
          transferBankName:
            input.method === PaymentMethod.TRANSFERENCIA
              ? input.transferBankName?.trim() ?? null
              : null,
          count: uniqueArIds.length,
          attemptedAt: new Date().toISOString(),
          alreadyPaidArIds: alreadyPaid.map((ar) => ar.id),
          alreadyPaidInvoices: alreadyPaid.map((ar) => ar.invoiceCode),
          snapshots,
        },
      })
    }
    throw error
  }
}

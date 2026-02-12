"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { PaymentMethod } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"

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

export async function listOpenAR(options?: { query?: string; skip?: number; take?: number }, actor?: AuthActor) {
  const user = actor ?? await getCurrentUser()
  assertAuthActor(user)

  const query = options?.query?.trim()
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
    ]
  }

  return prisma.accountReceivable.findMany({
    where,
    orderBy: [{ createdAt: "asc" }], // Más antiguas primero
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

export async function cancelPayment(id: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

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
    if (!user.canCancelPayments && user.role !== "ADMIN") {
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
  note?: string | null
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  if (input.amountCents <= 0) throw new Error("El abono debe ser mayor a 0")

  return prisma.$transaction(async (tx) => {
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
}

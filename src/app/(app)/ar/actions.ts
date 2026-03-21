"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { PaymentMethod } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { isDominicanBankName } from "@/lib/dominican-banks"

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
  transferBankName?: string | null
  note?: string | null
}, actor?: AuthActor) {
  const currentUser = actor ?? await getCurrentUser()
  assertAuthActor(currentUser)

  if (input.amountCents <= 0) throw new Error("El abono debe ser mayor a 0")
  if (input.method === PaymentMethod.DIVIDIR_PAGO) {
    throw new Error("Dividir pago no es un metodo valido para registrar un cobro.")
  }
  if (input.method === PaymentMethod.TRANSFERENCIA) {
    const trimmedBankName = input.transferBankName?.trim()
    if (!trimmedBankName) {
      throw new Error("Debes seleccionar el banco de la transferencia.")
    }
    if (!isDominicanBankName(trimmedBankName)) {
      throw new Error("El banco de transferencia seleccionado no es valido.")
    }
  }

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
        transferBankName: input.method === PaymentMethod.TRANSFERENCIA ? input.transferBankName?.trim() ?? null : null,
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
        transferBankName: input.method === PaymentMethod.TRANSFERENCIA ? input.transferBankName?.trim() ?? null : null,
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

export async function addBatchPayment(input: {
  arIds: string[]
  amountCents: number
  method: PaymentMethod
  transferBankName?: string | null
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
  if (input.method === PaymentMethod.TRANSFERENCIA) {
    const trimmedBankName = input.transferBankName?.trim()
    if (!trimmedBankName) {
      throw new Error("Debes seleccionar el banco de la transferencia.")
    }
    if (!isDominicanBankName(trimmedBankName)) {
      throw new Error("El banco de transferencia seleccionado no es válido.")
    }
  }

  // Si solo es una factura, delegar al flujo individual
  if (uniqueArIds.length === 1) {
    const result = await addPayment({
      arId: uniqueArIds[0],
      amountCents: input.amountCents,
      method: input.method,
      transferBankName: input.transferBankName,
      note: input.note,
    })
    return {
      receiptCode: result.receiptCode,
      paymentIds: [result.paymentId],
    }
  }

  return prisma.$transaction(async (tx) => {
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
          transferBankName:
            input.method === PaymentMethod.TRANSFERENCIA
              ? input.transferBankName?.trim() ?? null
              : null,
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
            transferBankName:
              input.method === PaymentMethod.TRANSFERENCIA
                ? input.transferBankName?.trim() ?? null
                : null,
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
}

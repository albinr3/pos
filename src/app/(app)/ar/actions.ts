"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { PaymentMethod } from "@prisma/client"

export async function listOpenAR() {
  return prisma.accountReceivable.findMany({
    where: {
      status: { in: ["PENDIENTE", "PARCIAL"] },
      sale: { cancelledAt: null }, // Excluir ventas canceladas
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      customer: true,
      sale: true,
      payments: {
        where: { cancelledAt: null }, // Solo pagos no cancelados
        orderBy: { paidAt: "desc" },
      },
    },
    take: 200,
  })
}

export async function cancelPayment(id: string, username: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id },
      include: { ar: true },
    })

    if (!payment) throw new Error("Pago no encontrado")
    if (payment.cancelledAt) throw new Error("Este pago ya está cancelado")

    const user = await tx.user.findUnique({ where: { username } })
    if (!user) throw new Error("Usuario inválido")

    // Recalcular el balance de la cuenta por cobrar
    const activePayments = await tx.payment.findMany({
      where: {
        arId: payment.arId,
        cancelledAt: null,
        id: { not: id }, // Excluir este pago
      },
    })

    const totalPaid = activePayments.reduce((sum, p) => sum + p.amountCents, 0)
    const newBalance = payment.ar.totalCents - totalPaid

    // Actualizar cuenta por cobrar
    await tx.accountReceivable.update({
      where: { id: payment.arId },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? "PAGADA" : newBalance === payment.ar.totalCents ? "PENDIENTE" : "PARCIAL",
      },
    })

    // Marcar pago como cancelado
    await tx.payment.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: user.id,
      },
    })

    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/daily-close")
    revalidatePath("/reports/payments")
    revalidatePath("/reports/profit")
  })
}

export async function listAllPayments() {
  return prisma.payment.findMany({
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
  username: string
}) {
  if (input.amountCents <= 0) throw new Error("El abono debe ser mayor a 0")

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username: input.username } })
    if (!user) throw new Error("Usuario inválido")

    const ar = await tx.accountReceivable.findUnique({ where: { id: input.arId } })
    if (!ar) throw new Error("Cuenta por cobrar no encontrada")
    if (ar.status === "PAGADA" || ar.balanceCents <= 0) throw new Error("Esta factura ya está pagada")

    const amount = Math.min(input.amountCents, ar.balanceCents)

    const payment = await tx.payment.create({
      data: {
        arId: ar.id,
        userId: user.id,
        amountCents: amount,
        method: input.method,
        note: input.note || null,
      },
      select: { id: true },
    })

    const newBalance = ar.balanceCents - amount

    await tx.accountReceivable.update({
      where: { id: ar.id },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? "PAGADA" : "PARCIAL",
      },
    })

    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/daily-close")

    return { paymentId: payment.id, appliedCents: amount, newBalanceCents: newBalance }
  })
}

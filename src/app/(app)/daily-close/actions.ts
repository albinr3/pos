"use server"

import { prisma } from "@/lib/db"

import { endOfDay, startOfDay } from "@/lib/dates"

import { parseDateParam } from "@/lib/dates"

export async function getDailyClose(input?: { from?: string; to?: string }) {
  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate
  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: {
        soldAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir canceladas
      },
      select: { totalCents: true, type: true },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir cancelados
      },
      select: { amountCents: true, method: true },
    }),
  ])

  const soldTotal = sales.reduce((s, x) => s + x.totalCents, 0)
  const soldCash = sales.filter((s) => s.type === "CONTADO").reduce((a, b) => a + b.totalCents, 0)
  const soldCredit = sales.filter((s) => s.type === "CREDITO").reduce((a, b) => a + b.totalCents, 0)

  const collectedTotal = payments.reduce((s, p) => s + p.amountCents, 0)

  const byMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amountCents
    return acc
  }, {})

  return {
    from,
    to,
    soldTotal,
    soldCash,
    soldCredit,
    collectedTotal,
    collectedByMethod: byMethod,
    paymentsCount: payments.length,
    salesCount: sales.length,
  }
}

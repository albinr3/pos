"use server"

import { prisma } from "@/lib/db"
import { endOfDay, startOfDay, parseDateParam } from "@/lib/dates"
import { getCurrentUser } from "@/lib/auth"

export async function getDailyClose(input?: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate
  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const [sales, payments, cashReturns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        soldAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir canceladas
      },
      select: { totalCents: true, type: true },
    }),
    prisma.payment.findMany({
      where: {
        ar: {
          sale: {
            accountId: user.accountId,
          },
        },
        paidAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir cancelados
      },
      select: { amountCents: true, method: true },
    }),
    prisma.return.findMany({
      where: {
        accountId: user.accountId,
        returnedAt: { gte: from, lte: to },
        cancelledAt: null,
        sale: {
          type: "CONTADO",
        },
      },
      select: { totalCents: true },
    }),
  ])

  const soldTotal = sales.reduce((s, x) => s + x.totalCents, 0)
  const soldCash = sales.filter((s) => s.type === "CONTADO").reduce((a, b) => a + b.totalCents, 0)
  const soldCredit = sales.filter((s) => s.type === "CREDITO").reduce((a, b) => a + b.totalCents, 0)
  const cashReturnsTotalCents = cashReturns.reduce((sum, ret) => sum + ret.totalCents, 0)
  const soldCashNetCents = soldCash - cashReturnsTotalCents
  const soldTotalNetCents = soldTotal - cashReturnsTotalCents

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
    cashReturnsTotalCents,
    soldCashNetCents,
    soldTotalNetCents,
    collectedTotal,
    collectedByMethod: byMethod,
    paymentsCount: payments.length,
    salesCount: sales.length,
  }
}

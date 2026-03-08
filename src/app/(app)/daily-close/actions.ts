"use server"

import { prisma } from "@/lib/db"
import { endOfDay, startOfDay, parseDateParam } from "@/lib/dates"
import { getCurrentUser } from "@/lib/auth"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

type CashSalesSummaryItem = {
  method: string
  label: string
  totalCents: number
  banks: Array<{
    bankName: string
    totalCents: number
  }>
}

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
      select: {
        totalCents: true,
        type: true,
        paymentMethod: true,
        transferBankName: true,
        payments: {
          select: {
            method: true,
            amountCents: true,
            transferBankName: true,
          },
        },
      },
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

  const cashSalesSummaryMap = new Map<
    string,
    {
      method: string
      label: string
      totalCents: number
      banks: Map<string, number>
    }
  >()

  for (const sale of sales) {
    if (sale.type !== "CONTADO") continue

    if (sale.payments.length > 0) {
      for (const split of sale.payments) {
        const key = split.method
        const current = cashSalesSummaryMap.get(key) ?? {
          method: split.method,
          label: getPaymentMethodLabel(split.method),
          totalCents: 0,
          banks: new Map<string, number>(),
        }

        current.totalCents += split.amountCents
        if (split.method === "TRANSFERENCIA" && split.transferBankName) {
          current.banks.set(
            split.transferBankName,
            (current.banks.get(split.transferBankName) ?? 0) + split.amountCents
          )
        }

        cashSalesSummaryMap.set(key, current)
      }

      continue
    }

    if (!sale.paymentMethod) continue

    const key = sale.paymentMethod
    const current = cashSalesSummaryMap.get(key) ?? {
      method: sale.paymentMethod,
      label: getPaymentMethodLabel(sale.paymentMethod),
      totalCents: 0,
      banks: new Map<string, number>(),
    }

    current.totalCents += sale.totalCents
    if (sale.paymentMethod === "TRANSFERENCIA" && sale.transferBankName) {
      current.banks.set(
        sale.transferBankName,
        (current.banks.get(sale.transferBankName) ?? 0) + sale.totalCents
      )
    }

    cashSalesSummaryMap.set(key, current)
  }

  const cashSalesSummaryByMethod: CashSalesSummaryItem[] = Array.from(cashSalesSummaryMap.values())
    .map((item) => ({
      method: item.method,
      label: item.label,
      totalCents: item.totalCents,
      banks: Array.from(item.banks.entries())
        .map(([bankName, totalCents]) => ({ bankName, totalCents }))
        .filter((bank) => bank.totalCents > 0)
        .sort((a, b) => b.totalCents - a.totalCents || a.bankName.localeCompare(b.bankName, "es")),
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.label.localeCompare(b.label, "es"))

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
    cashSalesSummary: {
      totalCents: soldCash,
      salesCount: sales.filter((sale) => sale.type === "CONTADO").length,
      byMethod: cashSalesSummaryByMethod,
    },
    collectedByMethod: byMethod,
    paymentsCount: payments.length,
    salesCount: sales.length,
  }
}

"use server"

import { prisma } from "@/lib/db"
import { endOfDay, startOfDay, parseDateParam } from "@/lib/dates"
import { getCurrentUser } from "@/lib/auth"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

type MethodBreakdown = {
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

  const [sales, arPayments, cashReturns, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        soldAt: { gte: from, lte: to },
        cancelledAt: null,
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
        cancelledAt: null,
      },
      select: { amountCents: true, method: true, transferBankName: true },
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
    prisma.operatingExpense.findMany({
      where: {
        accountId: user.accountId,
        expenseDate: { gte: from, lte: to },
      },
      select: { amountCents: true, description: true },
    }),
  ])

  // ─── SECCIÓN 1: VENTAS DEL DÍA ──────────────────────────

  const cashSales = sales.filter((s) => s.type === "CONTADO")
  const creditSales = sales.filter((s) => s.type === "CREDITO")

  const soldCashCents = cashSales.reduce((a, b) => a + b.totalCents, 0)
  const soldCreditCents = creditSales.reduce((a, b) => a + b.totalCents, 0)
  const soldTotalCents = soldCashCents + soldCreditCents
  const cashReturnsCents = cashReturns.reduce((sum, ret) => sum + ret.totalCents, 0)

  // Desglose de ventas contado por método de pago
  const cashSalesMethodMap = new Map<
    string,
    {
      method: string
      label: string
      totalCents: number
      banks: Map<string, number>
    }
  >()

  for (const sale of cashSales) {
    if (sale.payments.length > 0) {
      // Pago dividido
      for (const split of sale.payments) {
        const key = split.method
        const current = cashSalesMethodMap.get(key) ?? {
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
        cashSalesMethodMap.set(key, current)
      }
      continue
    }

    if (!sale.paymentMethod) continue

    const key = sale.paymentMethod
    const current = cashSalesMethodMap.get(key) ?? {
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
    cashSalesMethodMap.set(key, current)
  }

  const cashSalesByMethod: MethodBreakdown[] = Array.from(cashSalesMethodMap.values())
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

  // ─── SECCIÓN 2: COBROS DEL DÍA ──────────────────────────
  // Todo lo que realmente entra a caja:
  // - Efectivo de contado
  // - Tarjeta de contado
  // - Transferencia de contado
  // - Cobros de créditos anteriores (abonos)

  // Cobros de créditos por método
  const arByMethodMap = new Map<
    string,
    {
      method: string
      label: string
      totalCents: number
      banks: Map<string, number>
    }
  >()

  for (const p of arPayments) {
    const key = p.method
    const current = arByMethodMap.get(key) ?? {
      method: p.method,
      label: getPaymentMethodLabel(p.method),
      totalCents: 0,
      banks: new Map<string, number>(),
    }
    current.totalCents += p.amountCents
    if (p.method === "TRANSFERENCIA" && p.transferBankName) {
      current.banks.set(
        p.transferBankName,
        (current.banks.get(p.transferBankName) ?? 0) + p.amountCents
      )
    }
    arByMethodMap.set(key, current)
  }

  const arByMethod: MethodBreakdown[] = Array.from(arByMethodMap.values())
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

  const arCollectedTotal = arPayments.reduce((s, p) => s + p.amountCents, 0)

  // Total cobrado = ventas contado + cobros de créditos
  const totalCollectedCents = soldCashCents + arCollectedTotal

  // ─── SECCIÓN 3: TOTAL EN CAJA ───────────────────────────
  // Solo efectivo: contado en efectivo + cobros de crédito en efectivo
  const cashFromSales = cashSalesMethodMap.get("EFECTIVO")?.totalCents ?? 0
  const cashFromAr = arByMethodMap.get("EFECTIVO")?.totalCents ?? 0
  const totalCashInCents = cashFromSales + cashFromAr

  const expensesTotalCents = expenses.reduce((s, e) => s + e.amountCents, 0)

  const totalInCashRegisterCents = totalCashInCents - cashReturnsCents - expensesTotalCents

  return {
    from,
    to,

    // Sección 1: Ventas del día
    sales: {
      cashEfectivoCents: cashSalesMethodMap.get("EFECTIVO")?.totalCents ?? 0,
      cashTarjetaCents: cashSalesMethodMap.get("TARJETA")?.totalCents ?? 0,
      cashTransferenciaCents: cashSalesMethodMap.get("TRANSFERENCIA")?.totalCents ?? 0,
      cashTotalCents: soldCashCents,
      creditCents: soldCreditCents,
      totalCents: soldTotalCents,
      returnsCents: cashReturnsCents,
      netCents: soldTotalCents - cashReturnsCents,
      cashCount: cashSales.length,
      creditCount: creditSales.length,
      totalCount: sales.length,
      byMethod: cashSalesByMethod,
    },

    // Sección 2: Cobros del día (Solo abonos/recibos a facturas de crédito)
    collections: {
      arEfectivoCents: arByMethodMap.get("EFECTIVO")?.totalCents ?? 0,
      arTarjetaCents: arByMethodMap.get("TARJETA")?.totalCents ?? 0,
      arTransferenciaCents: arByMethodMap.get("TRANSFERENCIA")?.totalCents ?? 0,
      totalCents: arCollectedTotal,
      arPaymentsCount: arPayments.length,
      arByMethod,
    },

    // Sección 3: Total en caja (Matemática estricta de flujo de efectivo físico)
    cashRegister: {
      cashFromSalesCents: cashFromSales,
      cashFromArCents: cashFromAr,
      totalCashInCents,
      // Se advierte que gastos y devoluciones pueden no ser en efectivo
      returnsCents: cashReturnsCents,
      expensesCents: expensesTotalCents,
      expenses: expenses.map((e) => ({
        description: e.description,
        amountCents: e.amountCents,
      })),
    },
  }
}

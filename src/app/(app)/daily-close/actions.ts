"use server"

import { prisma } from "@/lib/db"
import { endOfDay, startOfDay, parseDateParam } from "@/lib/dates"
import { getCurrentUser } from "@/lib/auth"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import { Decimal } from "@prisma/client/runtime/library"

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
  if (!user.isOwner && !user.canAccessDailyClose && !user.canViewAllCashShifts) throw new Error("No tienes permiso para ver el resumen del negocio")

  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate
  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)
  const fiscalSettings = await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { accountId: true } })

  const [sales, arPayments, cashReturns, directExpenses, fiscalReturnIds, fiscalRefunds, fiscalNotes, debitNotes, expenseSettlements] = await Promise.all([
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        soldAt: { gte: from, lte: to },
        cancelledAt: null,
      },
      select: {
        totalCents: true,
        legalTipCents: true,
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
        ar: { accountId: user.accountId },
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
      select: { id: true, totalCents: true, legalTipCents: true },
    }),
    prisma.operatingExpense.findMany({
      where: {
        accountId: user.accountId,
        expenseDate: { gte: from, lte: to },
        fundingSource: { not: "EMPLOYEE" },
      },
      select: { amountCents: true, description: true },
    }),
    fiscalSettings ? prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Return" WHERE "accountId"=${user.accountId} AND "fiscalAdjustmentId" IS NOT NULL AND "returnedAt">=${from} AND "returnedAt"<=${to}` : Promise.resolve([]),
    fiscalSettings ? prisma.$queryRaw<Array<{ amountCents: number }>>`SELECT "amountCents" FROM "FiscalAdjustmentApplication" WHERE "accountId"=${user.accountId} AND kind='REFUND' AND method='EFECTIVO' AND "createdAt">=${from} AND "createdAt"<=${to}` : Promise.resolve([]),
    fiscalSettings ? prisma.$queryRaw<Array<{ snapshot: { adjustment?: { economicCents?: number }; lines?: Array<{ kind?: string; gross?: string; taxNotCreditable?: string; withholdings?: Array<{ amount?: string }> }> } }>>`SELECT snapshot FROM "FiscalAdjustment" WHERE "accountId"=${user.accountId} AND type='E34' AND state='PREPARADO_PENDIENTE_CONEXION' AND "updatedAt">=${from} AND "updatedAt"<=${to}` : Promise.resolve([]),
    fiscalSettings ? prisma.$queryRaw<Array<{ snapshot: { adjustment?: { amountCents?: number } } }>>`SELECT snapshot FROM "FiscalAdjustment" WHERE "accountId"=${user.accountId} AND type='E33' AND state='PREPARADO_PENDIENTE_CONEXION' AND "updatedAt">=${from} AND "updatedAt"<=${to}` : Promise.resolve([]),
    prisma.employeeExpenseSettlement.findMany({ where: { accountId: user.accountId, createdAt: { gte: from, lte: to } }, select: { amountCents: true, expense: { select: { description: true } } } }),
  ])

  // En el cierre el adelanto personal aparece cuando se reembolsa, no al registrar el gasto.
  const expenses = [...directExpenses, ...expenseSettlements.map(row => ({ amountCents: row.amountCents, description: `Reembolso: ${row.expense.description}` }))]

  // ─── SECCIÓN 1: VENTAS DEL DÍA ──────────────────────────

  const cashSales = sales.filter((s) => s.type === "CONTADO")
  const creditSales = sales.filter((s) => s.type === "CREDITO")

  const soldCashCents = cashSales.reduce((a, b) => a + b.totalCents, 0)
  const soldCreditCents = creditSales.reduce((a, b) => a + b.totalCents, 0)
  const soldCashLegalTipCents = cashSales.reduce((sum, sale) => sum + (sale.legalTipCents ?? 0), 0)
  const soldCreditLegalTipCents = creditSales.reduce((sum, sale) => sum + (sale.legalTipCents ?? 0), 0)
  const debitNoteCents = debitNotes.reduce((sum, note) => sum + (note.snapshot.adjustment?.amountCents ?? 0), 0)
  const soldTotalCents = soldCashCents + soldCreditCents + debitNoteCents
  const fiscalReturnSet = new Set(fiscalReturnIds.map(ret => ret.id))
  const ordinaryReturns = cashReturns.filter(ret => !fiscalReturnSet.has(ret.id))
  // Una devolución fiscal puede ser solo inventario; caja resta únicamente su reembolso efectivo.
  const ordinaryReturnsCents = ordinaryReturns.reduce((sum, ret) => sum + ret.totalCents, 0)
  const cashReturnsCents = ordinaryReturnsCents + fiscalRefunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const salesReturnsCents = ordinaryReturnsCents + fiscalNotes.reduce((sum, note) => sum + (note.snapshot.adjustment?.economicCents ?? 0), 0)
  const asCents = (amount?: string) => new Decimal(amount ?? "0").mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  const cashReturnsLegalTipCents = ordinaryReturns.reduce((sum, ret) => sum + (ret.legalTipCents ?? 0), 0) + fiscalNotes.reduce((sum, note) => sum + (note.snapshot.lines ?? []).filter(line => line.kind === "PROPINA").reduce((total, line) => total + asCents(line.gross) - asCents(line.taxNotCreditable) - (line.withholdings ?? []).reduce((n, item) => n + asCents(item.amount), 0), 0), 0)

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
      debitNoteCents,
      debitNoteCount: debitNotes.length,
      cashLegalTipCents: soldCashLegalTipCents,
      creditLegalTipCents: soldCreditLegalTipCents,
      legalTipCents: soldCashLegalTipCents + soldCreditLegalTipCents,
      legalTipReturnedCents: cashReturnsLegalTipCents,
      totalCents: soldTotalCents,
      returnsCents: salesReturnsCents,
      netCents: soldTotalCents - salesReturnsCents,
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

"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { endOfDay, parseDateParam, startOfDay } from "@/lib/dates"
import { Decimal } from "@prisma/client/runtime/library"

function toQty(value: Decimal | number) {
  return value instanceof Decimal ? value.toNumber() : Number(value)
}

function discountedUnitCostCents(unitCostCents: number, discountPercentBp: number) {
  const discountRate = (discountPercentBp ?? 0) / 10000
  return Math.round(unitCostCents * (1 - discountRate))
}

function findHistoricalUnitCostCents(
  costsByProductId: Map<string, Array<{ purchasedAt: Date; netCostCents: number }>>,
  productId: string,
  soldAt: Date,
  fallbackCostCents: number
) {
  const history = costsByProductId.get(productId)
  if (!history || history.length === 0) return fallbackCostCents

  let left = 0
  let right = history.length - 1
  let found: number | null = null
  const soldAtTime = soldAt.getTime()

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const purchasedAtTime = history[mid].purchasedAt.getTime()
    if (purchasedAtTime <= soldAtTime) {
      found = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return found === null ? fallbackCostCents : history[found].netCostCents
}

function calculateConsumptionsCostCents(
  costsByProductId: Map<string, Array<{ purchasedAt: Date; netCostCents: number }>>,
  consumptions: Array<{
    ingredientId: string
    qty: Decimal | number
    ingredient: { costCents: number } | null
  }>,
  soldAt: Date
) {
  return consumptions.reduce((sum, consumption) => {
    const qty = toQty(consumption.qty)
    if (qty <= 0) return sum

    const historicalUnitCostCents = findHistoricalUnitCostCents(
      costsByProductId,
      consumption.ingredientId,
      soldAt,
      consumption.ingredient?.costCents ?? 0
    )
    return sum + Math.round(historicalUnitCostCents * qty)
  }, 0)
}

export async function getSalesReport(input: { from?: string; to?: string; type?: "CONTADO" | "CREDITO" }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const fromDate = parseDateParam(input.from) ?? new Date()
  const toDate = parseDateParam(input.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const sales = await prisma.sale.findMany({
    where: {
      accountId: user.accountId,
      soldAt: { gte: from, lte: to },
      cancelledAt: null, // Excluir canceladas
      ...(input.type ? { type: input.type } : {}),
    },
    orderBy: { soldAt: "desc" },
    include: { customer: true },
    take: 500,
  })

  const totalCents = sales.reduce((s, x) => s + x.totalCents, 0)
  const legalTipTotalCents = sales.reduce((sum, sale) => sum + (sale.legalTipCents ?? 0), 0)

  return { from, to, totalCents, legalTipTotalCents, count: sales.length, sales }
}

export async function getOperatingExpensesReport(input: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const fromDate = parseDateParam(input.from) ?? new Date()
  const toDate = parseDateParam(input.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const expenses = await prisma.operatingExpense.findMany({
    where: {
      accountId: user.accountId,
      expenseDate: { gte: from, lte: to },
    },
    orderBy: { expenseDate: "desc" },
    include: {
      user: {
        select: { name: true, username: true },
      },
    },
    take: 500,
  })

  const totalCents = expenses.reduce((sum, item) => sum + item.amountCents, 0)

  return { from, to, totalCents, count: expenses.length, expenses }
}

export async function getPaymentsReport(input: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const fromDate = parseDateParam(input.from) ?? new Date()
  const toDate = parseDateParam(input.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const payments = await prisma.payment.findMany({
    where: {
      paidAt: { gte: from, lte: to },
      cancelledAt: null, // Excluir cancelados
      ar: { accountId: user.accountId },
    },
    orderBy: { paidAt: "desc" },
    include: { ar: { include: { customer: true, sale: true, debitAdjustment: { select: { id: true } } } } },
    take: 500,
  })

  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0)

  return { from, to, totalCents, count: payments.length, payments }
}

export async function getProfitReport(input: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  return (await import("@/lib/profit-report")).getProfitReport(user, input)
}

export async function getTitheReport(input: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Por defecto últimos 30 días
  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  let fromDate = defaultFrom
  let toDate = defaultTo

  if (input.from) {
    const parsed = parseDateParam(input.from)
    if (parsed) fromDate = parsed
  }

  if (input.to) {
    const parsed = parseDateParam(input.to)
    if (parsed) toDate = parsed
  }

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const fiscalSettings = await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { accountId: true } })
  const [cashSales, creditPayments, cashReturns, operatingExpenses, debitPayments, fiscalRefunds, creditFiscalReturns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        soldAt: { gte: from, lte: to },
        cancelledAt: null,
        type: "CONTADO",
      },
      include: {
        items: {
          select: {
            costCents: true,
            qty: true,
            consumptions: {
              select: {
                ingredientId: true,
                qty: true,
                ingredient: {
                  select: {
                    costCents: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        cancelledAt: null,
        ar: {
          sale: {
            accountId: user.accountId,
            cancelledAt: null,
            type: "CREDITO",
          },
        },
      },
      select: {
        amountCents: true,
        ar: {
          select: {
            saleId: true,
          },
        },
      },
    }),
    prisma.return.findMany({
      where: {
        accountId: user.accountId,
        returnedAt: { gte: from, lte: to },
        cancelledAt: null,
        sale: {
          cancelledAt: null,
          type: "CONTADO",
        },
      },
      include: {
        sale: {
          select: {
            soldAt: true,
          },
        },
        items: {
          include: {
            saleItem: {
              select: {
                qty: true,
                costCents: true,
                consumptions: {
                  select: {
                    ingredientId: true,
                    qty: true,
                    ingredient: {
                      select: {
                        costCents: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.operatingExpense.findMany({
      where: {
        accountId: user.accountId,
        expenseDate: { gte: from, lte: to },
      },
      select: {
        amountCents: true,
      },
    }),
    fiscalSettings ? prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to }, cancelledAt: null, ar: { accountId: user.accountId, debitAdjustment: { state: "PREPARADO_PENDIENTE_CONEXION" } } },
      select: { amountCents: true, ar: { select: { totalCents: true, debitAdjustment: { select: { snapshot: true } } } } },
    }) : Promise.resolve([]),
    fiscalSettings ? prisma.fiscalAdjustmentApplication.findMany({
      where: { accountId: user.accountId, kind: "REFUND", createdAt: { gte: from, lte: to } },
      select: { amountCents: true, adjustment: { select: { snapshot: true } } },
    }) : Promise.resolve([]),
    fiscalSettings ? prisma.return.findMany({
      where: { accountId: user.accountId, returnedAt: { gte: from, lte: to }, cancelledAt: null, fiscalAdjustmentId: { not: null }, sale: { cancelledAt: null, type: "CREDITO" } },
      include: {
        sale: { select: { soldAt: true, totalCents: true, ar: { select: { payments: { where: { cancelledAt: null }, select: { paidAt: true, amountCents: true } } } } } },
        items: { include: { saleItem: { select: { qty: true, costCents: true, consumptions: { select: { ingredientId: true, qty: true, ingredient: { select: { costCents: true } } } } } } } },
      },
    }) : Promise.resolve([]),
  ])

  const creditSaleIds = Array.from(new Set(creditPayments.map((payment) => payment.ar.saleId).filter((id): id is string => id !== null)))

  const creditSales = creditSaleIds.length
    ? await prisma.sale.findMany({
        where: {
          accountId: user.accountId,
          id: { in: creditSaleIds },
          cancelledAt: null,
          type: "CREDITO",
        },
        include: {
          items: {
            select: {
              costCents: true,
              qty: true,
              consumptions: {
                select: {
                  ingredientId: true,
                  qty: true,
                  ingredient: {
                    select: {
                      costCents: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : []

  const soldDatesForCost = [
    ...cashSales.map((sale) => sale.soldAt),
    ...creditSales.map((sale) => sale.soldAt),
    ...cashReturns.map((ret) => ret.sale.soldAt),
    ...creditFiscalReturns.map((ret) => ret.sale.soldAt),
  ]

  const maxSoldAt = soldDatesForCost.length > 0
    ? soldDatesForCost.reduce((latest, soldAt) => (soldAt > latest ? soldAt : latest))
    : null

  const soldProductIds = Array.from(
    new Set([
      ...cashSales.flatMap((sale) =>
        sale.items.flatMap((item) => item.consumptions.map((consumption) => consumption.ingredientId))
      ),
      ...creditSales.flatMap((sale) =>
        sale.items.flatMap((item) => item.consumptions.map((consumption) => consumption.ingredientId))
      ),
      ...cashReturns.flatMap((ret) =>
        ret.items.flatMap((item) =>
          item.saleItem?.consumptions.map((consumption) => consumption.ingredientId) ?? []
        )
      ),
      ...creditFiscalReturns.flatMap((ret) => ret.items.flatMap((item) => item.saleItem?.consumptions.map((consumption) => consumption.ingredientId) ?? [])),
    ])
  )

  const purchaseCostHistory = maxSoldAt && soldProductIds.length > 0
    ? await prisma.purchaseItem.findMany({
        where: {
          productId: { in: soldProductIds },
          purchase: {
            accountId: user.accountId,
            cancelledAt: null,
            purchasedAt: { lte: maxSoldAt },
          },
        },
        select: {
          productId: true,
          netCostCents: true,
          purchase: {
            select: { purchasedAt: true },
          },
        },
        orderBy: [
          { productId: "asc" },
          { purchase: { purchasedAt: "asc" } },
        ],
      })
    : []

  const costsByProductId = new Map<string, Array<{ purchasedAt: Date; netCostCents: number }>>()
  for (const item of purchaseCostHistory) {
    const list = costsByProductId.get(item.productId) ?? []
    list.push({
      purchasedAt: item.purchase.purchasedAt,
      netCostCents: item.netCostCents,
    })
    costsByProductId.set(item.productId, list)
  }

  const cashSalesTotalCents = cashSales.reduce((sum, sale) => sum + sale.totalCents, 0)
  const cashSalesLegalTipCents = cashSales.reduce((sum, sale) => sum + (sale.legalTipCents ?? 0), 0)
  const cashSalesItbisCents = cashSales.reduce((sum, sale) => sum + sale.itbisCents, 0)
  const cashSalesRevenueNoTipCents = cashSalesTotalCents - cashSalesLegalTipCents

  const cashSalesCostCents = cashSales.reduce((total, sale) => {
    const saleCost = sale.items.reduce((itemTotal, item) => {
      if (item.costCents > 0) {
        return itemTotal + Math.round(item.costCents * toQty(item.qty))
      }
      const itemCost = calculateConsumptionsCostCents(
        costsByProductId,
        item.consumptions,
        sale.soldAt,
      )
      return itemTotal + itemCost
    }, 0)
    return total + saleCost
  }, 0)

  // La devolución fiscal física solo repone inventario; su salida de dinero procede del reembolso aplicado.
  const ordinaryCashReturns = cashReturns.filter(ret => !ret.fiscalAdjustmentId)
  const cashReturnsTotalCents = ordinaryCashReturns.reduce((sum, ret) => sum + ret.totalCents, 0)
  const cashReturnsLegalTipCents = ordinaryCashReturns.reduce((sum, ret) => sum + (ret.legalTipCents ?? 0), 0)
  const cashReturnsItbisCents = ordinaryCashReturns.reduce((sum, ret) => sum + ret.itbisCents, 0)
  const cashReturnsRevenueNoTipCents = cashReturnsTotalCents - cashReturnsLegalTipCents

  const cashReturnsCostCents = cashReturns.reduce((total, ret) => {
    const returnCost = ret.items.reduce((itemTotal, item) => {
      const soldQty = item.saleItem ? toQty(item.saleItem.qty) : 0
      if (!item.saleItem || soldQty <= 0) return itemTotal

      const returnedQty = toQty(item.qty)
      if (returnedQty <= 0) return itemTotal

      if (item.saleItem.costCents > 0) {
        return itemTotal + Math.round(item.saleItem.costCents * returnedQty)
      }

      const ratio = returnedQty / soldQty
      const proportionalConsumptions = item.saleItem.consumptions.map((consumption) => ({
        ingredientId: consumption.ingredientId,
        qty: toQty(consumption.qty) * ratio,
        ingredient: consumption.ingredient,
      }))
      const itemCost = calculateConsumptionsCostCents(
        costsByProductId,
        proportionalConsumptions,
        ret.sale.soldAt,
      )
      return itemTotal + itemCost
    }, 0)
    return total + returnCost
  }, 0)

  const creditFiscalReturnsCostCents = creditFiscalReturns.reduce((total, ret) => {
    const paid = ret.sale.ar?.payments.filter(payment => payment.paidAt <= ret.returnedAt).reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0
    const paidRatio = ret.sale.totalCents > 0 ? Math.min(paid / ret.sale.totalCents, 1) : 0
    const restoredCost = ret.items.reduce((sum, item) => {
      const soldQty = toQty(item.saleItem.qty), returnedQty = toQty(item.qty)
      if (soldQty <= 0 || returnedQty <= 0) return sum
      if (item.saleItem.costCents > 0) return sum + Math.round(item.saleItem.costCents * returnedQty)
      const consumptions = item.saleItem.consumptions.map(consumption => ({ ingredientId: consumption.ingredientId, qty: toQty(consumption.qty) * returnedQty / soldQty, ingredient: consumption.ingredient }))
      return sum + calculateConsumptionsCostCents(costsByProductId, consumptions, ret.sale.soldAt)
    }, 0)
    // El costo de crédito se reconoció según lo cobrado: revertir la misma proporción.
    return total + Math.round(restoredCost * paidRatio)
  }, 0)

  const paymentsBySaleId = new Map<string, number>()
  for (const payment of creditPayments) {
    const saleId = payment.ar.saleId
    if (!saleId) continue
    paymentsBySaleId.set(saleId, (paymentsBySaleId.get(saleId) ?? 0) + payment.amountCents)
  }

  let creditCollectedRevenueNoTipCents = 0
  let creditCollectedCostCents = 0
  let creditCollectedItbisCents = 0
  let creditSalesWithCollectionsCount = 0

  for (const sale of creditSales) {
    const collectedForSaleCents = paymentsBySaleId.get(sale.id) ?? 0
    if (collectedForSaleCents <= 0) continue

    if (sale.totalCents <= 0) continue
    const appliedCollectedCents = Math.min(collectedForSaleCents, sale.totalCents)
    const ratio = appliedCollectedCents / sale.totalCents

    const saleRevenueNoTipCents = sale.totalCents - (sale.legalTipCents ?? 0)
    const recognizedRevenueNoTipCents = Math.round(saleRevenueNoTipCents * ratio)
    const recognizedItbisCents = Math.round(sale.itbisCents * ratio)

    const saleCostCents = sale.items.reduce((itemTotal, item) => {
      if (item.costCents > 0) {
        return itemTotal + Math.round(item.costCents * toQty(item.qty))
      }
      const itemCost = calculateConsumptionsCostCents(
        costsByProductId,
        item.consumptions,
        sale.soldAt,
      )
      return itemTotal + itemCost
    }, 0)
    const recognizedCostCents = Math.round(saleCostCents * ratio)

    creditCollectedRevenueNoTipCents += recognizedRevenueNoTipCents
    creditCollectedCostCents += recognizedCostCents
    creditCollectedItbisCents += recognizedItbisCents
    creditSalesWithCollectionsCount += 1
  }

  const creditPaymentsTotalCents = creditPayments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const debitPaymentsTotalCents = debitPayments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const fiscalRefundsTotalCents = fiscalRefunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const fiscalAmount = (value: unknown) => {
    // Una copia incompleta no debe convertirse silenciosamente en ITBIS o propina cero.
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("La copia fiscal no contiene importes suficientes para este reporte")
    return new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  }
  const debitPaymentsItbisCents = debitPayments.reduce((sum, payment) => {
    const snapshot = payment.ar.debitAdjustment?.snapshot as { totals?: { tax?: string } } | null
    if (payment.ar.totalCents <= 0) throw new Error("La nota de débito no contiene un importe válido para este reporte")
    return sum + Math.round(fiscalAmount(snapshot?.totals?.tax) * payment.amountCents / payment.ar.totalCents)
  }, 0)
  const fiscalRefundBreakdown = fiscalRefunds.reduce((totals, refund) => {
    const snapshot = refund.adjustment.snapshot as { adjustment?: { economicCents?: number }; lines?: Array<{ kind?: string; gross?: string; tax?: string; taxNotCreditable?: string; withholdings?: Array<{ amount?: string }> }> }
    const economic = snapshot.adjustment?.economicCents ?? 0
    if (!Number.isSafeInteger(economic) || economic <= 0 || !Array.isArray(snapshot.lines)) throw new Error("La nota de crédito no contiene importes suficientes para este reporte")
    const ratio = Math.min(refund.amountCents / economic, 1)
    const lines = snapshot.lines
    const tax = lines.reduce((sum, line) => sum + fiscalAmount(line.tax) - fiscalAmount(line.taxNotCreditable), 0)
    const tip = lines.filter(line => line.kind === "PROPINA").reduce((sum, line) => sum + fiscalAmount(line.gross) - fiscalAmount(line.taxNotCreditable) - (line.withholdings ?? []).reduce((part, item) => part + fiscalAmount(item.amount), 0), 0)
    totals.taxCents += Math.round(tax * ratio)
    totals.tipCents += Math.round(tip * ratio)
    return totals
  }, { taxCents: 0, tipCents: 0 })

  const collectedRevenueNoTipCents =
    cashSalesRevenueNoTipCents +
    creditCollectedRevenueNoTipCents + debitPaymentsTotalCents -
    cashReturnsRevenueNoTipCents - (fiscalRefundsTotalCents - fiscalRefundBreakdown.tipCents)

  const collectedCostCents =
    cashSalesCostCents +
    creditCollectedCostCents -
    cashReturnsCostCents - creditFiscalReturnsCostCents

  const collectedGrossProfitCents = collectedRevenueNoTipCents - collectedCostCents

  const operatingExpensesCents = operatingExpenses.reduce((sum, expense) => sum + expense.amountCents, 0)
  const operatingProfitCollectedCents = collectedGrossProfitCents - operatingExpensesCents
  const titheBaseCents = Math.max(operatingProfitCollectedCents, 0)
  const suggestedTitheCents = Math.round(titheBaseCents * 0.1)

  const totalCollectedInHandCents =
    cashSalesTotalCents +
    creditPaymentsTotalCents + debitPaymentsTotalCents -
    cashReturnsTotalCents - fiscalRefundsTotalCents

  const collectedItbisReferenceCents =
    cashSalesItbisCents +
    creditCollectedItbisCents + debitPaymentsItbisCents -
    cashReturnsItbisCents - fiscalRefundBreakdown.taxCents

  return {
    from,
    to,
    cashSalesCount: cashSales.length,
    creditPaymentsCount: creditPayments.length,
    creditSalesWithCollectionsCount,
    cashReturnsCount: ordinaryCashReturns.length,
    debitPaymentsCount: debitPayments.length,
    debitPaymentsTotalCents,
    fiscalRefundsCount: fiscalRefunds.length,
    fiscalRefundsTotalCents,
    fiscalRefundRevenueCents: fiscalRefundsTotalCents - fiscalRefundBreakdown.tipCents,
    creditFiscalReturnsCostCents,
    operatingExpensesCount: operatingExpenses.length,
    cashSalesTotalCents,
    creditPaymentsTotalCents,
    cashReturnsTotalCents,
    totalCollectedInHandCents,
    cashSalesRevenueNoTipCents,
    creditCollectedRevenueNoTipCents,
    cashReturnsRevenueNoTipCents,
    collectedRevenueNoTipCents,
    cashSalesCostCents,
    creditCollectedCostCents,
    cashReturnsCostCents,
    collectedCostCents,
    collectedGrossProfitCents,
    operatingExpensesCents,
    operatingProfitCollectedCents,
    collectedItbisReferenceCents,
    suggestedTitheCents,
  }
}

export async function getInventoryReport() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
    },
    orderBy: { name: "asc" },
    include: {
      supplier: {
        select: { name: true },
      },
    },
  })

  // Convertir Decimal a número para serialización
  const serializedProducts = products.map((product) => {
    const stock = product.stock instanceof Decimal ? product.stock.toNumber() : Number(product.stock)
    return {
      ...product,
      stock,
      minStock: product.minStock instanceof Decimal ? product.minStock.toNumber() : Number(product.minStock),
      createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
      updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
    }
  })

  // Calcular el costo total del inventario: suma de (costo * stock) para cada producto
  const totalInventoryCostCents = serializedProducts.reduce((total, product) => {
    return total + (product.costCents * product.stock)
  }, 0)

  return {
    products: serializedProducts,
    totalInventoryCostCents,
    count: serializedProducts.length,
  }
}

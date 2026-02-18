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

export async function getSalesReport(input: { from?: string; to?: string }) {
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
    },
    orderBy: { soldAt: "desc" },
    include: { customer: true },
    take: 500,
  })

  const totalCents = sales.reduce((s, x) => s + x.totalCents, 0)

  return { from, to, totalCents, count: sales.length, sales }
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
      ar: {
        sale: {
          accountId: user.accountId,
        },
      },
    },
    orderBy: { paidAt: "desc" },
    include: { ar: { include: { customer: true, sale: true } } },
    take: 500,
  })

  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0)

  return { from, to, totalCents, count: payments.length, payments }
}

export async function getProfitReport(input: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Por defecto últimos 30 días
  const defaultTo = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)

  // Si no hay parámetros, usar fechas por defecto
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

  // 1. INGRESOS/VENTAS: Ventas al contado + pagos recibidos - devoluciones contado
  const [cashSales, payments, cashReturns, allSales] = await Promise.all([
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        type: "CONTADO",
        soldAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir canceladas
      },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir cancelados
        ar: {
          sale: {
            accountId: user.accountId,
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
          type: "CONTADO",
          cancelledAt: null,
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
                product: {
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
    // 2. COSTO DE VENTAS: Costo de los productos vendidos en el período
    // Obtener todas las ventas del período (contado y crédito) con sus items
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        soldAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir canceladas
      },
      include: {
        items: {
          include: {
            product: {
              select: { costCents: true },
            },
          },
        },
      },
    }),
  ])

  const grossCashSalesTotalCents = cashSales.reduce((sum, sale) => sum + sale.totalCents, 0)
  const cashReturnsTotalCents = cashReturns.reduce((sum, ret) => sum + ret.totalCents, 0)
  const salesTotalCents = grossCashSalesTotalCents - cashReturnsTotalCents
  const paymentsTotalCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const totalRevenueCents = salesTotalCents + paymentsTotalCents
  const cashReturnsItbisCents = cashReturns.reduce((sum, ret) => sum + ret.itbisCents, 0)

  const soldDatesForCost = [
    ...allSales.map((sale) => sale.soldAt),
    ...cashReturns.map((ret) => ret.sale.soldAt),
  ]
  const maxSoldAt = soldDatesForCost.length > 0
    ? soldDatesForCost.reduce((latest, soldAt) => (soldAt > latest ? soldAt : latest))
    : null
  const soldProductIds = Array.from(
    new Set([
      ...allSales.flatMap((sale) => sale.items.map((item) => item.productId)),
      ...cashReturns.flatMap((ret) => ret.items.map((item) => item.productId)),
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

  // Calcular costo de ventas usando costo histórico (ultima compra antes de la venta).
  const grossCostOfSalesCents = allSales.reduce((total, sale) => {
    const saleCost = sale.items.reduce((itemTotal, item) => {
      const historicalUnitCostCents = findHistoricalUnitCostCents(
        costsByProductId,
        item.productId,
        sale.soldAt,
        item.product.costCents
      )
      return itemTotal + (historicalUnitCostCents * toQty(item.qty))
    }, 0)
    return total + saleCost
  }, 0)

  const cashReturnsCostCents = cashReturns.reduce((total, ret) => {
    const returnCost = ret.items.reduce((itemTotal, item) => {
      const fallbackCostCents = item.saleItem?.product.costCents ?? 0
      const historicalUnitCostCents = findHistoricalUnitCostCents(
        costsByProductId,
        item.productId,
        ret.sale.soldAt,
        fallbackCostCents
      )
      return itemTotal + (historicalUnitCostCents * toQty(item.qty))
    }, 0)
    return total + returnCost
  }, 0)

  const costOfSalesCents = grossCostOfSalesCents - cashReturnsCostCents
  const purchasesCount = allSales.length

  // 3. UTILIDAD BRUTA: Ventas - Costo de ventas
  const grossProfitCents = totalRevenueCents - costOfSalesCents

  // 4. GASTOS OPERATIVOS: Total de gastos operativos en el período
  const operatingExpenses = await prisma.operatingExpense.findMany({
    where: {
      accountId: user.accountId,
      expenseDate: { gte: from, lte: to },
      // OperatingExpense no tiene campo de cancelación por ahora
    },
  })
  const operatingExpensesCents = operatingExpenses.reduce((sum, expense) => sum + expense.amountCents, 0)

  // 5. UTILIDAD OPERATIVA: Utilidad bruta - Gastos operativos
  const operatingProfitCents = grossProfitCents - operatingExpensesCents

  // 6. OTROS INGRESOS Y GASTOS: 0 (por ahora)
  const otherIncomeExpensesCents = 0

  // 7. IMPUESTOS (ITBIS neto): ITBIS cobrado en ventas - ITBIS pagado en compras
  const grossSalesItbisCents = allSales.reduce((sum, sale) => sum + sale.itbisCents, 0)
  const salesItbisCents = grossSalesItbisCents - cashReturnsItbisCents
  const purchases = await prisma.purchase.findMany({
    where: {
      accountId: user.accountId,
      purchasedAt: { gte: from, lte: to },
      cancelledAt: null,
    },
    select: {
      items: {
        select: {
          qty: true,
          unitCostCents: true,
          discountPercentBp: true,
          netCostCents: true,
          purchaseIncludesItbis: true,
        },
      },
    },
  })

  const purchasesItbisCents = purchases.reduce((sum, purchase) => {
    const purchaseItbis = purchase.items.reduce((itemSum, item) => {
      const discountedUnitCents = discountedUnitCostCents(item.unitCostCents, item.discountPercentBp)
      const unitItbisCents = Math.max(0, item.netCostCents - discountedUnitCents)
      if (item.purchaseIncludesItbis === false || unitItbisCents === 0) return itemSum
      return itemSum + Math.round(unitItbisCents * toQty(item.qty))
    }, 0)
    return sum + purchaseItbis
  }, 0)

  const taxesCents = salesItbisCents - purchasesItbisCents

  // 8. UTILIDAD NETA: Utilidad operativa - Otros ingresos/gastos - Impuestos
  const netProfitCents = operatingProfitCents - otherIncomeExpensesCents - taxesCents

  // Cuentas por cobrar (total de balance pendiente)
  const accountsReceivable = await prisma.accountReceivable.findMany({
    where: {
      status: { in: ["PENDIENTE", "PARCIAL"] },
      sale: {
        accountId: user.accountId,
      },
    },
  })
  const accountsReceivableTotalCents = accountsReceivable.reduce((sum, ar) => sum + ar.balanceCents, 0)

  return {
    from,
    to,
    // Ingresos/Ventas
    salesTotalCents,
    salesCount: cashSales.length,
    cashReturnsCount: cashReturns.length,
    cashReturnsTotalCents,
    paymentsTotalCents,
    paymentsCount: payments.length,
    totalRevenueCents,
    // Costo de ventas
    costOfSalesCents,
    cashReturnsCostCents,
    purchasesCount, // Número de ventas (no compras)
    // Utilidad bruta
    grossProfitCents,
    // Gastos operativos
    operatingExpensesCents,
    operatingExpensesCount: operatingExpenses.length,
    // Utilidad operativa
    operatingProfitCents,
    // Otros ingresos y gastos
    otherIncomeExpensesCents,
    // Impuestos
    salesItbisCents,
    cashReturnsItbisCents,
    purchasesItbisCents,
    taxesCents,
    // Utilidad neta
    netProfitCents,
    // Cuentas por cobrar
    accountsReceivableTotalCents,
    accountsReceivableCount: accountsReceivable.length,
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

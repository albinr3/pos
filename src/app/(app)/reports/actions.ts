"use server"

import { prisma } from "@/lib/db"
import { endOfDay, parseDateParam, startOfDay } from "@/lib/dates"
import { Decimal } from "@prisma/client/runtime/library"

export async function getSalesReport(input: { from?: string; to?: string }) {
  const fromDate = parseDateParam(input.from) ?? new Date()
  const toDate = parseDateParam(input.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const sales = await prisma.sale.findMany({
    where: {
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
  const fromDate = parseDateParam(input.from) ?? new Date()
  const toDate = parseDateParam(input.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const payments = await prisma.payment.findMany({
    where: {
      paidAt: { gte: from, lte: to },
      cancelledAt: null, // Excluir cancelados
    },
    orderBy: { paidAt: "desc" },
    include: { ar: { include: { customer: true, sale: true } } },
    take: 500,
  })

  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0)

  return { from, to, totalCents, count: payments.length, payments }
}

export async function getProfitReport(input: { from?: string; to?: string }) {
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

  // 1. INGRESOS/VENTAS: Ventas al contado + Pagos recibidos
  const [cashSales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: {
        type: "CONTADO",
        soldAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir canceladas
      },
    }),
    prisma.payment.findMany({
      where: {
        paidAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir cancelados
      },
    }),
  ])
  
  const salesTotalCents = cashSales.reduce((s, x) => s + x.totalCents, 0)
  const paymentsTotalCents = payments.reduce((s, p) => s + p.amountCents, 0)
  const totalRevenueCents = salesTotalCents + paymentsTotalCents

  // 2. COSTO DE VENTAS: Costo de los productos vendidos en el período
  // Obtener todas las ventas del período (contado y crédito) con sus items
  const allSales = await prisma.sale.findMany({
    where: {
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
  })
  
  // Calcular el costo de ventas: suma de (costo del producto * cantidad vendida) para cada item
  const costOfSalesCents = allSales.reduce((total, sale) => {
    const saleCost = sale.items.reduce((itemTotal, item) => {
      return itemTotal + (item.product.costCents * item.qty)
    }, 0)
    return total + saleCost
  }, 0)
  
  const purchasesCount = allSales.length

  // 3. UTILIDAD BRUTA: Ventas - Costo de ventas
  const grossProfitCents = totalRevenueCents - costOfSalesCents

  // 4. GASTOS OPERATIVOS: Total de gastos operativos en el período
  const operatingExpenses = await prisma.operatingExpense.findMany({
    where: {
      expenseDate: { gte: from, lte: to },
      // OperatingExpense no tiene campo de cancelación por ahora
    },
  })
  const operatingExpensesCents = operatingExpenses.reduce((s, e) => s + e.amountCents, 0)

  // 5. UTILIDAD OPERATIVA: Utilidad bruta - Gastos operativos
  const operatingProfitCents = grossProfitCents - operatingExpensesCents

  // 6. OTROS INGRESOS Y GASTOS: 0 (por ahora)
  const otherIncomeExpensesCents = 0

  // 7. IMPUESTOS: 0 (por ahora)
  const taxesCents = 0

  // 8. UTILIDAD NETA: Utilidad operativa - Otros ingresos/gastos - Impuestos
  const netProfitCents = operatingProfitCents - otherIncomeExpensesCents - taxesCents

  // Cuentas por cobrar (total de balance pendiente)
  const accountsReceivable = await prisma.accountReceivable.findMany({
    where: {
      status: { in: ["PENDIENTE", "PARCIAL"] },
    },
  })
  const accountsReceivableTotalCents = accountsReceivable.reduce((s, ar) => s + ar.balanceCents, 0)

  return {
    from,
    to,
    // Ingresos/Ventas
    salesTotalCents,
    salesCount: cashSales.length,
    paymentsTotalCents,
    paymentsCount: payments.length,
    totalRevenueCents,
    // Costo de ventas
    costOfSalesCents,
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
    taxesCents,
    // Utilidad neta
    netProfitCents,
    // Cuentas por cobrar
    accountsReceivableTotalCents,
    accountsReceivableCount: accountsReceivable.length,
  }
}

export async function getInventoryReport() {
  const products = await prisma.product.findMany({
    where: {
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
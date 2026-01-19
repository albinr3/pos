"use server"

import { prisma } from "@/lib/db"

import { endOfDay, startOfDay } from "@/lib/dates"

export async function getSalesChartData(days: number = 7) {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)
  const to = endOfDay(today)

  // Obtener todas las ventas del período
  const sales = await prisma.sale.findMany({
    where: {
      soldAt: { gte: from, lte: to },
      cancelledAt: null,
    },
    select: {
      soldAt: true,
      totalCents: true,
      type: true,
    },
    orderBy: { soldAt: "asc" },
  })

  // Agrupar por día
  const salesByDay = new Map<string, { total: number; cash: number; credit: number }>()

  // Inicializar todos los días con 0
  for (let i = 0; i < days; i++) {
    const date = new Date(from)
    date.setDate(date.getDate() + i)
    const key = date.toISOString().split("T")[0]
    salesByDay.set(key, { total: 0, cash: 0, credit: 0 })
  }

  // Agregar ventas
  for (const sale of sales) {
    const key = sale.soldAt.toISOString().split("T")[0]
    // Obtener o crear datos del día
    let dayData = salesByDay.get(key)
    if (!dayData) {
      // Si la fecha no está en el rango inicializado, crear una entrada
      dayData = { total: 0, cash: 0, credit: 0 }
      salesByDay.set(key, dayData)
    }
    
    dayData.total += sale.totalCents
    // Verificar el tipo de venta (Prisma enum puede venir como string o como valor del enum)
    const saleTypeRaw = sale.type
    const saleType = typeof saleTypeRaw === 'string' 
      ? saleTypeRaw.toUpperCase() 
      : String(saleTypeRaw).toUpperCase()
    
    // Comparar con ambos valores posibles
    if (saleType === "CONTADO" || saleTypeRaw === "CONTADO") {
      dayData.cash += sale.totalCents
    } else if (saleType === "CREDITO" || saleTypeRaw === "CREDITO") {
      dayData.credit += sale.totalCents
    }
  }

  // Convertir a array y formatear
  const result = Array.from(salesByDay.entries())
    .map(([date, data]) => ({
      date,
      label: new Date(date).toLocaleDateString("es-DO", { day: "numeric", month: "short" }),
      total: data.total,
      cash: data.cash,
      credit: data.credit,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  
  return result
}

export async function getDashboardStats() {
  const from = startOfDay()
  const to = endOfDay()

  const [salesToday, salesCash, salesCredit, arOpen, paymentsToday, lowStockCountRow] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        soldAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir canceladas
      },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: {
        soldAt: { gte: from, lte: to },
        cancelledAt: null,
        type: "CONTADO",
      },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: {
        soldAt: { gte: from, lte: to },
        cancelledAt: null,
        type: "CREDITO",
      },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.accountReceivable.aggregate({
      where: {
        status: { in: ["PENDIENTE", "PARCIAL"] },
        sale: { cancelledAt: null }, // Excluir ventas canceladas
      },
      _sum: { balanceCents: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        paidAt: { gte: from, lte: to },
        cancelledAt: null, // Excluir cancelados
      },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint as count
      FROM "Product"
      WHERE "isActive" = true
        AND "minStock" > 0
        AND "stock" <= "minStock";
    `,
  ])

  const lowStockCount = Number(lowStockCountRow?.[0]?.count ?? 0)

  return {
    salesTodayCents: salesToday._sum.totalCents ?? 0,
    salesTodayCount: salesToday._count ?? 0,
    salesCashCents: salesCash._sum.totalCents ?? 0,
    salesCashCount: salesCash._count ?? 0,
    salesCreditCents: salesCredit._sum.totalCents ?? 0,
    salesCreditCount: salesCredit._count ?? 0,
    paymentsTodayCents: paymentsToday._sum.amountCents ?? 0,
    paymentsTodayCount: paymentsToday._count ?? 0,
    arOpenCents: arOpen._sum.balanceCents ?? 0,
    arOpenCount: arOpen._count ?? 0,
    lowStockCount,
  }
}

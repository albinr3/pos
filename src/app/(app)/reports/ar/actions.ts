"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { formatDateDO } from "@/lib/date-time"
import { receivableOriginLabel } from "@/lib/receivable-origin"

export interface ARFilters {
  status?: string // PENDIENTE, PARCIAL, PAGADA, ALL
  customerId?: string
  invoiceCode?: string
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
  overdueOnly?: boolean
}

export async function getARReport(filters: ARFilters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const where: any = {
    accountId: user.accountId,
    OR: [{ sale: { accountId: user.accountId, cancelledAt: null } }, { debitAdjustment: { accountId: user.accountId, state: "PREPARADO_PENDIENTE_CONEXION" } }],
    AND: [],
  }

  // Filtrar por estado
  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status
  } else {
    // Por defecto, solo mostrar pendientes y parciales
    where.status = { in: ["PENDIENTE", "PARCIAL"] }
  }

  // Filtrar por cliente
  if (filters.customerId) {
    where.customerId = filters.customerId
  }

  // Filtrar por código de factura
  if (filters.invoiceCode) {
    where.AND.push({ OR: [{ sale: { invoiceCode: { contains: filters.invoiceCode, mode: "insensitive" } } }, { debitAdjustment: { id: { contains: filters.invoiceCode, mode: "insensitive" } } }] })
  }

  // Filtrar por rango de fechas
  if (filters.startDate || filters.endDate) {
    const dates: { gte?: Date; lte?: Date } = {}
    if (filters.startDate) {
      dates.gte = new Date(filters.startDate)
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate)
      endDate.setHours(23, 59, 59, 999)
      dates.lte = endDate
    }
    where.AND.push({ OR: [{ sale: { soldAt: dates } }, { debitAdjustment: { createdAt: dates } }] })
  }

  // Filtrar por monto pendiente
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.balanceCents = {}
    if (filters.minAmount !== undefined) {
      where.balanceCents.gte = Math.round(filters.minAmount * 100)
    }
    if (filters.maxAmount !== undefined) {
      where.balanceCents.lte = Math.round(filters.maxAmount * 100)
    }
  }

  // Filtrar solo vencidas
  if (filters.overdueOnly) {
    where.dueDate = {
      lt: new Date(),
    }
    where.status = { in: ["PENDIENTE", "PARCIAL"] }
  }

  const arItems = await prisma.accountReceivable.findMany({
    where,
    include: {
      customer: {
        select: {
          visualId: true,
          name: true,
          phone: true,
          cedula: true,
        },
      },
      sale: {
        select: {
          invoiceCode: true,
          soldAt: true,
          totalCents: true,
          // Las devoluciones ordinarias también reducen la deuda; las fiscales se contabilizan mediante su aplicación.
          returns: { where: { cancelledAt: null, fiscalAdjustmentId: null }, select: { totalCents: true } },
        },
      },
      debitAdjustment: { select: { id: true, createdAt: true } },
      // Separar aplicaciones de los recibos evita presentar un ajuste como dinero cobrado.
      fiscalAdjustmentApplications: { where: { kind: "DEBT" }, select: { amountCents: true } },
      fiscalCustomerCreditApplications: { select: { amountCents: true } },
      payments: {
        where: { cancelledAt: null },
        select: {
          amountCents: true,
          paidAt: true,
          method: true,
          receiptCode: true,
        },
        orderBy: { paidAt: "desc" },
      },
    },
    orderBy: [
      { dueDate: "asc" },
      { createdAt: "asc" },
    ],
  })

  // Calcular estadísticas
  const totalPendiente = arItems
    .filter(ar => ar.status === "PENDIENTE" || ar.status === "PARCIAL")
    .reduce((sum, ar) => sum + ar.balanceCents, 0)

  const totalVencido = arItems
    .filter(ar => {
      if (ar.status === "PAGADA") return false
      if (!ar.dueDate) return false
      return ar.dueDate < new Date()
    })
    .reduce((sum, ar) => sum + ar.balanceCents, 0)

  const countVencidas = arItems.filter(ar => {
    if (ar.status === "PAGADA") return false
    if (!ar.dueDate) return false
    return ar.dueDate < new Date()
  }).length

  // Agrupar por cliente
  const byCustomer = arItems.reduce((acc, ar) => {
    const customerId = ar.customerId
    if (!acc[customerId]) {
      acc[customerId] = {
        customer: ar.customer,
        totalBalance: 0,
        count: 0,
      }
    }
    acc[customerId].totalBalance += ar.balanceCents
    acc[customerId].count++
    return acc
  }, {} as Record<string, { customer: any; totalBalance: number; count: number }>)

  const topDebtors = Object.entries(byCustomer)
    .sort((a, b) => b[1].totalBalance - a[1].totalBalance)
    .slice(0, 5)
    .map(([customerId, data]) => ({
      customerId,
      customerVisualId: data.customer.visualId ?? null,
      customerName: data.customer.name,
      balance: data.totalBalance,
      invoiceCount: data.count,
    }))

  return {
    arItems,
    stats: {
      totalItems: arItems.length,
      totalPendiente,
      totalVencido,
      countVencidas,
      topDebtors,
    },
  }
}

export async function getCustomersForARFilter() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.customer.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      creditEnabled: true,
    },
    select: {
      id: true,
      visualId: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  })
}

export async function exportARToCSV(filters: ARFilters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const { arItems } = await getARReport(filters)

  const headers = [
    "Factura",
    "Fecha Venta",
    "Fecha Vencimiento",
    "Cliente",
    "Teléfono",
    "Total Factura",
    "Pagado",
    "Devoluciones ordinarias",
    "Notas de crédito aplicadas",
    "Saldo a favor aplicado",
    "Pendiente",
    "Estado",
    "Días Vencido",
  ]

  const rows = arItems.map(ar => {
    // Un crédito reduce la deuda sin ser un pago: sumar únicamente recibos activos.
    const totalPagado = ar.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
    const devoluciones = ar.sale?.returns.reduce((sum, item) => sum + item.totalCents, 0) ?? 0
    const notasAplicadas = ar.fiscalAdjustmentApplications.reduce((sum, item) => sum + item.amountCents, 0)
    const saldosAplicados = ar.fiscalCustomerCreditApplications.reduce((sum, item) => sum + item.amountCents, 0)
    const diasVencido = ar.dueDate 
      ? Math.floor((new Date().getTime() - new Date(ar.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    
    return [
      receivableOriginLabel(ar),
      formatDateDO(ar.sale?.soldAt ?? ar.debitAdjustment?.createdAt ?? ar.createdAt),
      ar.dueDate ? formatDateDO(ar.dueDate) : "N/A",
      ar.customer.name,
      ar.customer.phone || "",
      (ar.totalCents / 100).toFixed(2),
      (totalPagado / 100).toFixed(2),
      (devoluciones / 100).toFixed(2),
      (notasAplicadas / 100).toFixed(2),
      (saldosAplicados / 100).toFixed(2),
      (ar.balanceCents / 100).toFixed(2),
      ar.status,
      ar.dueDate && diasVencido > 0 ? diasVencido.toString() : "0",
    ]
  })

  const csv = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ].join("\n")

  return csv
}

export async function getARReportForPDF(filters: ARFilters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const [company, reportData] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId },
    }),
    getARReport(filters),
  ])

  return {
    company,
    ...reportData,
    filters,
    generatedAt: new Date(),
    generatedBy: user.name,
  }
}

"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export interface ReceiptFilters {
  startDate?: string
  endDate?: string
  customerId?: string
  receiptCode?: string
  method?: string
  minAmount?: number
  maxAmount?: number
  includeCancelled?: boolean
}

export async function getReceiptsReport(filters: ReceiptFilters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const where: any = {
    ar: {
      sale: {
        accountId: user.accountId,
      },
    },
  }

  // Filtrar por rango de fechas
  if (filters.startDate || filters.endDate) {
    where.paidAt = {}
    if (filters.startDate) {
      where.paidAt.gte = new Date(filters.startDate)
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate)
      endDate.setHours(23, 59, 59, 999)
      where.paidAt.lte = endDate
    }
  }

  // Filtrar por cliente
  if (filters.customerId) {
    where.ar = {
      ...where.ar,
      customerId: filters.customerId,
    }
  }

  // Filtrar por código de recibo
  if (filters.receiptCode) {
    where.receiptCode = {
      contains: filters.receiptCode,
      mode: "insensitive",
    }
  }

  // Filtrar por método de pago
  if (filters.method && filters.method !== "ALL") {
    where.method = filters.method
  }

  // Filtrar por monto
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    where.amountCents = {}
    if (filters.minAmount !== undefined) {
      where.amountCents.gte = Math.round(filters.minAmount * 100)
    }
    if (filters.maxAmount !== undefined) {
      where.amountCents.lte = Math.round(filters.maxAmount * 100)
    }
  }

  // Excluir cancelados por defecto
  if (!filters.includeCancelled) {
    where.cancelledAt = null
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      ar: {
        include: {
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
          sale: {
            select: {
              invoiceCode: true,
              totalCents: true,
            },
          },
        },
      },
      user: {
        select: {
          name: true,
          username: true,
        },
      },
      cancelledUser: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { paidAt: "desc" },
      { receiptNumber: "desc" },
    ],
  })

  // Calcular estadísticas
  const activePayments = payments.filter(p => !p.cancelledAt)
  const totalActive = activePayments.reduce((sum, p) => sum + p.amountCents, 0)
  const totalCancelled = payments
    .filter(p => p.cancelledAt)
    .reduce((sum, p) => sum + p.amountCents, 0)

  // Agrupar por método de pago
  const byMethod = activePayments.reduce((acc, p) => {
    if (!acc[p.method]) {
      acc[p.method] = { count: 0, total: 0 }
    }
    acc[p.method].count++
    acc[p.method].total += p.amountCents
    return acc
  }, {} as Record<string, { count: number; total: number }>)

  return {
    payments,
    stats: {
      totalPayments: activePayments.length,
      cancelledPayments: payments.length - activePayments.length,
      totalAmount: totalActive,
      cancelledAmount: totalCancelled,
      byMethod,
    },
  }
}

export async function getCustomersForFilter() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.customer.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  })
}

export async function exportReceiptsToCSV(filters: ReceiptFilters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const { payments } = await getReceiptsReport(filters)

  // Generar CSV
  const headers = [
    "Recibo",
    "Fecha",
    "Cliente",
    "Teléfono",
    "Factura",
    "Monto",
    "Método",
    "Cajero",
    "Estado",
    "Nota",
  ]

  const rows = payments.map(p => [
    p.receiptCode,
    p.paidAt.toISOString().split('T')[0],
    p.ar.customer.name,
    p.ar.customer.phone || "",
    p.ar.sale.invoiceCode,
    (p.amountCents / 100).toFixed(2),
    p.method,
    p.user.name,
    p.cancelledAt ? "CANCELADO" : "ACTIVO",
    p.note || "",
  ])

  const csv = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ].join("\n")

  return csv
}

export async function getReceiptsReportForPDF(filters: ReceiptFilters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const [company, reportData] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId },
    }),
    getReceiptsReport(filters),
  ])

  return {
    company,
    ...reportData,
    filters,
    generatedAt: new Date(),
    generatedBy: user.name,
  }
}

"use server"

import type { Prisma } from "@prisma/client"

import { formatCustomerLabel, formatCustomerName, isGenericCustomer } from "@/lib/customer-display"
import { prisma } from "@/lib/db"
import { requireModuleAccess } from "@/lib/module-access"
import {
  FREIGHT_PAGE_SIZE,
  GENERAL_CUSTOMER,
  emptyFreightSummary,
  freightDateBounds,
  parseFreightFilters,
  summarizeFreightRows,
  type FreightCustomer,
  type FreightExportData,
  type FreightFilterInput,
  type FreightFilters,
  type FreightReport,
  type FreightRow,
} from "./model"

const rowSelect = {
  id: true,
  soldAt: true,
  invoiceCode: true,
  type: true,
  shippingCents: true,
  totalCents: true,
  customer: { select: { name: true, visualId: true, isGeneric: true } },
} satisfies Prisma.SaleSelect

type SaleRow = Prisma.SaleGetPayload<{ select: typeof rowSelect }>

function serializeRows(rows: SaleRow[]): FreightRow[] {
  return rows.map(({ customer, soldAt, ...row }) => ({
    ...row,
    soldAt: soldAt.toISOString(),
    customerName: formatCustomerName(customer),
  }))
}

async function buildFreightWhere(accountId: string, filters: FreightFilters): Promise<Prisma.SaleWhereInput> {
  // El flete ya está incluido en la factura. Solo se consulta: no genera gastos ni movimientos.
  // Las canceladas se excluyen y las devoluciones de productos no alteran el flete registrado.
  const where: Prisma.SaleWhereInput = {
    accountId,
    cancelledAt: null,
    shippingCents: { gt: 0 },
    soldAt: freightDateBounds(filters),
  }
  if (filters.type !== "ALL") where.type = filters.type
  if (filters.invoiceCode) where.invoiceCode = { contains: filters.invoiceCode, mode: "insensitive" }

  if (filters.customerId === GENERAL_CUSTOMER) {
    const customers = await prisma.customer.findMany({
      where: { accountId },
      select: { id: true, name: true, isGeneric: true },
    })
    // Igualar el criterio de presentación también agrupa los clientes genéricos históricos.
    const genericIds = customers.filter(isGenericCustomer).map((customer) => customer.id)
    where.OR = [{ customerId: null }, { customerId: { in: genericIds } }]
  } else if (filters.customerId) {
    where.customerId = filters.customerId
  }
  return where
}

export async function getFreightCustomers(): Promise<FreightCustomer[]> {
  const user = await requireModuleAccess("canAccessReports")
  const customers = await prisma.customer.findMany({
    where: {
      accountId: user.accountId,
      OR: [{ isActive: true }, { sales: { some: { accountId: user.accountId } } }],
    },
    select: { id: true, name: true, visualId: true, isGeneric: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  })
  return customers
    .filter((customer) => !isGenericCustomer(customer))
    .map((customer) => ({ id: customer.id, label: formatCustomerLabel(customer, { includeVisualId: true }) }))
}

export async function getFreightReport(input: FreightFilterInput = {}, requestedPage: unknown = 1): Promise<FreightReport> {
  const user = await requireModuleAccess("canAccessReports")
  const { filters, error } = parseFreightFilters(input)
  const empty: FreightReport = {
    filters,
    rows: [],
    summary: emptyFreightSummary(),
    pagination: { page: 1, pageSize: FREIGHT_PAGE_SIZE, totalPages: 1 },
    error,
  }
  if (error) return empty

  const numericPage = typeof requestedPage === "string" || typeof requestedPage === "number"
    ? Number(requestedPage)
    : 1
  const safePage = Number.isSafeInteger(numericPage) && numericPage > 0 ? numericPage : 1

  try {
    const where = await buildFreightWhere(user.accountId, filters)
    return await prisma.$transaction(async (tx) => {
      // Agregar sobre TODO el filtro antes de paginar evita truncar el resumen mensual a 50/500 filas.
      const groups = await tx.sale.groupBy({
        by: ["type"], where, _sum: { shippingCents: true }, _count: { _all: true },
      })
      const summary = emptyFreightSummary()
      for (const group of groups) {
        const amount = group._sum.shippingCents ?? 0
        summary.invoiceCount += group._count._all
        summary.totalShippingCents += amount
        if (group.type === "CONTADO") summary.cashShippingCents += amount
        else summary.creditShippingCents += amount
      }
      const totalPages = Math.max(1, Math.ceil(summary.invoiceCount / FREIGHT_PAGE_SIZE))
      const page = Math.min(safePage, totalPages)
      const rows = await tx.sale.findMany({
        where, select: rowSelect, orderBy: [{ soldAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * FREIGHT_PAGE_SIZE, take: FREIGHT_PAGE_SIZE,
      })
      return {
        filters, rows: serializeRows(rows), summary,
        pagination: { page, pageSize: FREIGHT_PAGE_SIZE, totalPages }, error: null,
      }
    }, { isolationLevel: "RepeatableRead" })
  } catch (error) {
    console.error("No se pudo consultar el reporte de fletes", error)
    return { ...empty, error: "No se pudo cargar el reporte. Intenta aplicar los filtros nuevamente." }
  }
}

export async function getFreightReportForExport(input: FreightFilterInput): Promise<
  { data: FreightExportData; error: null } | { data: null; error: string }
> {
  // Las acciones pueden invocarse sin visitar la página: cada descarga verifica el permiso.
  const user = await requireModuleAccess("canAccessReports")
  const { filters, error } = parseFreightFilters(input)
  if (error) return { data: null, error }

  try {
    const where = await buildFreightWhere(user.accountId, filters)
    const result = await prisma.$transaction(async (tx) => {
      const [sales, company, customer] = await Promise.all([
        // Exportar el filtro completo, sin reutilizar la página visible ni imponer un límite de 500.
        tx.sale.findMany({ where, select: rowSelect, orderBy: [{ soldAt: "desc" }, { id: "desc" }] }),
        tx.companySettings.findFirst({ where: { accountId: user.accountId }, select: { name: true } }),
        filters.customerId && filters.customerId !== GENERAL_CUSTOMER
          ? tx.customer.findFirst({ where: { id: filters.customerId, accountId: user.accountId }, select: { name: true } })
          : null,
      ])
      return { sales, company, customer }
    }, { isolationLevel: "RepeatableRead" })
    const rows = serializeRows(result.sales)
    return {
      error: null,
      data: {
        filters, rows, summary: summarizeFreightRows(rows),
        customerLabel: filters.customerId === GENERAL_CUSTOMER ? "Cliente general"
          : filters.customerId ? formatCustomerName(result.customer) : "Todos los clientes",
        companyName: result.company?.name || "Mi Negocio",
        generatedBy: user.name || user.username || "Usuario",
        generatedAt: new Date().toISOString(),
      },
    }
  } catch (error) {
    console.error("No se pudo exportar el reporte de fletes", error)
    return { data: null, error: "No se pudo generar la descarga. Inténtalo nuevamente." }
  }
}

import { dateKeyDO } from "@/lib/date-time"
import { endOfDay, parseDateParam, startOfDay } from "@/lib/dates"

export const GENERAL_CUSTOMER = "GENERAL"
export const FREIGHT_PAGE_SIZE = 50

export type FreightFilters = {
  from: string
  to: string
  customerId: string
  type: "ALL" | "CONTADO" | "CREDITO"
  invoiceCode: string
}

export type FreightFilterInput = Partial<Record<keyof FreightFilters, unknown>>

export type FreightRow = {
  id: string
  soldAt: string
  invoiceCode: string
  customerName: string
  type: "CONTADO" | "CREDITO"
  shippingCents: number
  totalCents: number
}

export type FreightSummary = {
  totalShippingCents: number
  invoiceCount: number
  cashShippingCents: number
  creditShippingCents: number
}

export type FreightReport = {
  filters: FreightFilters
  rows: FreightRow[]
  summary: FreightSummary
  pagination: { page: number; pageSize: number; totalPages: number }
  error: string | null
}

export type FreightCustomer = { id: string; label: string }

export type FreightExportData = {
  filters: FreightFilters
  customerLabel: string
  rows: FreightRow[]
  summary: FreightSummary
  companyName: string
  generatedBy: string
  generatedAt: string
}

export function getFreightDateRange(preset: "today" | "month" | "previousMonth", now = new Date()) {
  const today = dateKeyDO(now)
  const [year, month] = today.split("-").map(Number)
  if (preset === "today") return { from: today, to: today }
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today }

  // Construir el mes desde el calendario del negocio evita saltos por la zona del servidor.
  const previous = new Date(Date.UTC(year, month - 1, 0, 12))
  const to = dateKeyDO(previous)
  return { from: `${to.slice(0, 7)}-01`, to }
}

export function defaultFreightFilters(now = new Date()): FreightFilters {
  return { ...getFreightDateRange("month", now), customerId: "", type: "ALL", invoiceCode: "" }
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false
  const parsed = parseDateParam(value)
  // Date normaliza fechas como 31 de febrero; el round-trip impide aceptar ese rango.
  return parsed !== null && !Number.isNaN(parsed.getTime()) && dateKeyDO(parsed) === value
}

export function parseFreightFilters(input: FreightFilterInput = {}, now = new Date()) {
  const defaults = defaultFreightFilters(now)
  // Las acciones reciben datos externos: un null/array debe mostrar validación, no romper el reporte.
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { filters: defaults, error: "Los filtros deben tener un único valor válido." }
  }
  const filters = { ...defaults }
  for (const key of ["from", "to", "customerId", "invoiceCode"] as const) {
    if (typeof input[key] === "string") filters[key] = input[key].trim()
  }
  if (input.type === "CONTADO" || input.type === "CREDITO") filters.type = input.type

  let error: string | null = null
  if (Object.values(input).some((value) => value !== undefined && typeof value !== "string")) {
    error = "Los filtros deben tener un único valor válido."
  } else if (input.type !== undefined && !["ALL", "CONTADO", "CREDITO"].includes(input.type as string)) {
    error = "Selecciona un tipo de venta válido."
  } else if (!isCalendarDate(filters.from) || !isCalendarDate(filters.to)) {
    error = "Selecciona fechas válidas desde y hasta."
  } else if (filters.from > filters.to) {
    error = "La fecha desde no puede ser mayor que la fecha hasta."
  }
  return { filters, error }
}

export function freightDateBounds(filters: FreightFilters) {
  return {
    gte: startOfDay(parseDateParam(filters.from)!),
    lte: endOfDay(parseDateParam(filters.to)!),
  }
}

export function freightReportHref(filters: FreightFilters, page = 1) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to })
  if (filters.customerId) params.set("customerId", filters.customerId)
  if (filters.type !== "ALL") params.set("type", filters.type)
  if (filters.invoiceCode) params.set("invoiceCode", filters.invoiceCode)
  if (page > 1) params.set("page", String(page))
  return `/reports/freight?${params.toString()}`
}

export function emptyFreightSummary(): FreightSummary {
  return { totalShippingCents: 0, invoiceCount: 0, cashShippingCents: 0, creditShippingCents: 0 }
}

export function summarizeFreightRows(rows: FreightRow[]): FreightSummary {
  return rows.reduce((summary, row) => {
    summary.invoiceCount++
    summary.totalShippingCents += row.shippingCents
    if (row.type === "CONTADO") summary.cashShippingCents += row.shippingCents
    else summary.creditShippingCents += row.shippingCents
    return summary
  }, emptyFreightSummary())
}

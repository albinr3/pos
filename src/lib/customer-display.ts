export const GENERIC_CUSTOMER_NAME = "Cliente general"

type CustomerLike = {
  name?: string | null
  visualId?: number | null
  isGeneric?: boolean | null
} | null | undefined

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

const NORMALIZED_GENERIC_CUSTOMER_NAME = normalizeText(GENERIC_CUSTOMER_NAME)

export function normalizeCustomerSearchText(value: string) {
  return normalizeText(value)
}

export function isGenericCustomerQuery(query: string) {
  const normalized = normalizeText(query)
  if (!normalized) return false

  const clean = normalized.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()
  const compact = clean.replace(/\s+/g, "")
  if (compact === "#1" || compact === "cliente#1") return true
  if (clean === "#1" || clean === "cliente #1" || clean === "cliente 1") return true
  if (clean === "cliente general" || clean === "cliente generico") return true
  if (clean === "generico") return true
  if (clean.includes("cliente general") || clean.includes("cliente generico")) return true

  return false
}

export function isGenericCustomer(customer: CustomerLike) {
  if (!customer) return true
  if (customer.isGeneric) return true

  const normalizedName = normalizeText(customer.name ?? "")
  if (!normalizedName) return false
  if (normalizedName === NORMALIZED_GENERIC_CUSTOMER_NAME) return true
  if (normalizedName === "cliente generico") return true

  return false
}

export function formatCustomerName(customer: CustomerLike) {
  if (!customer) return GENERIC_CUSTOMER_NAME
  if (isGenericCustomer(customer)) return GENERIC_CUSTOMER_NAME

  const name = customer.name?.trim()
  return name || GENERIC_CUSTOMER_NAME
}

export function formatCustomerLabel(
  customer: CustomerLike,
  options?: {
    includeVisualId?: boolean
  }
) {
  const name = formatCustomerName(customer)
  if (name === GENERIC_CUSTOMER_NAME) return name

  if (options?.includeVisualId && typeof customer?.visualId === "number") {
    return `#${customer.visualId} ${name}`
  }

  return name
}

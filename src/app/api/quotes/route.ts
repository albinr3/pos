import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { prisma } from "@/lib/db"
import { calcDiscountedDocumentTotalsByTaxMode, normalizeDiscountPercentBp } from "@/lib/money"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { DocumentDiscountSource } from "@prisma/client"
import { ensureGenericCustomer } from "@/lib/customer-helpers"
import { isGenericCustomerQuery } from "@/lib/customer-display"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type QuoteItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
  itbisRateBp?: number
}

function quoteCode(number: number) {
  return `COT-${number.toString().padStart(5, "0")}`
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return undefined
    if (["1", "true", "si", "sí", "yes", "on"].includes(trimmed)) return true
    if (["0", "false", "no", "off"].includes(trimmed)) return false
  }
  if (typeof value === "number") {
    if (value === 1) return true
    if (value === 0) return false
  }
  return undefined
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return Number((value as { toNumber: () => number }).toNumber())
  }
  return Number(value || 0)
}

function normalizeRequestedCustomerId(customerId: string | null | undefined): string | null {
  const normalized = customerId?.trim()
  if (!normalized) return null
  return normalized.toLowerCase() === "generic" ? null : normalized
}

function parseSkip(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function parseTake(value: string | null, defaultValue: number, max: number): number {
  if (value === null) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.min(max, Math.max(1, parsed))
}

// GET /api/quotes - Listar cotizaciones
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()
    const normalizedVisualQuery = query ? query.replace(/^#/, "") : ""
    const visualIdQuery = normalizedVisualQuery && /^\d+$/.test(normalizedVisualQuery) ? Number(normalizedVisualQuery) : null
    const shouldIncludeLegacyNullGeneric = query ? isGenericCustomerQuery(query) : false
    const requestedSkip = parseSkip(searchParams.get("skip"))
    const take = parseTake(searchParams.get("take"), 300, 500)
    const effectiveSkip = requestedSkip ?? 0

    const quotes = await prisma.quote.findMany({
      where: {
        accountId: user.accountId,
        ...(query
          ? {
              OR: [
                { quoteCode: { contains: query, mode: "insensitive" } },
                { customer: { name: { contains: query, mode: "insensitive" } } },
                ...(visualIdQuery !== null ? [{ customer: { visualId: visualIdQuery } }] : []),
                ...(shouldIncludeLegacyNullGeneric ? [{ customerId: null }] : []),
              ],
            }
          : {}),
      },
      orderBy: { quotedAt: "desc" },
      include: {
        customer: { select: { id: true, visualId: true, name: true } },
        items: {
          select: {
            id: true,
            productId: true,
            qty: true,
            unitPriceCents: true,
            lineTotalCents: true,
            itbisRateBp: true,
          },
        },
      },
      skip: effectiveSkip,
      take: take + 1,
    })

    const hasMore = quotes.length > take
    const pageItems = hasMore ? quotes.slice(0, take) : quotes
    const nextSkip = hasMore ? effectiveSkip + take : null

    return NextResponse.json({
      data: pageItems.map((quote) => ({
        id: quote.id,
        quoteCode: quote.quoteCode,
        quotedAt: quote.quotedAt.toISOString(),
        validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
        customerId: quote.customerId,
        customerVisualId: quote.customer?.visualId ?? null,
        customerName: quote.customer?.name || null,
        subtotalCents: quote.subtotalCents,
        itbisCents: quote.itbisCents,
        shippingCents: quote.shippingCents,
        discountSource: quote.discountSource,
        discountPercentBp: quote.discountPercentBp,
        discountSubtotalCents: quote.discountSubtotalCents,
        discountTotalCents: quote.discountTotalCents,
        totalCents: quote.totalCents,
        salePricesIncludeItbis: quote.salePricesIncludeItbis,
        notes: quote.notes || null,
        itemsCount: quote.items.length,
        qtyTotal: quote.items.reduce((sum, item) => sum + decimalToNumber(item.qty), 0),
        items: quote.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          qty: decimalToNumber(item.qty),
          unitPriceCents: item.unitPriceCents,
          lineTotalCents: item.lineTotalCents,
          itbisRateBp: item.itbisRateBp,
        })),
      })),
      nextSkip,
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/quotes:", error)
    return NextResponse.json({ error: getErrorMessage(error, "Error al listar cotizaciones") }, { status: 500 })
  }
}

// POST /api/quotes - Crear cotización
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageQuotes = await hasPermissionOrLog(user, "canManageQuotes", {
      resourceType: "Quote",
      details: { endpoint: "/api/quotes", method: "POST" },
    })
    if (!canManageQuotes) {
      return NextResponse.json({ error: "No tienes permiso para gestionar cotizaciones" }, { status: 403 })
    }

    const body = await request.json() as {
      items?: Array<{
        productId?: string
        qty?: number
        quantity?: number
        unitPriceCents?: number
        price?: number
        wasPriceOverridden?: boolean
      }>
      shippingCents?: number
      shipping?: number
      customerId?: string | null
      validUntil?: string | null
      notes?: string | null
      salePricesIncludeItbis?: boolean
      preciosIncluyenItbis?: boolean
      precioVentaIncluyeItbis?: boolean
      discountMode?: string
      manualDiscountPercentBp?: number
      manualDiscountPercent?: number
    }

    const items: QuoteItemInput[] = (body.items || []).map((item) => ({
      productId: String(item.productId || ""),
      qty: Number(item.qty ?? item.quantity ?? 0),
      unitPriceCents: Number(item.unitPriceCents ?? Math.round((item.price || 0) * 100)),
      wasPriceOverridden: Boolean(item.wasPriceOverridden || false),
    }))

    if (!items.length) {
      return NextResponse.json({ error: "La cotización no tiene productos." }, { status: 400 })
    }

    if (items.some((item) => !item.productId || item.qty <= 0 || item.unitPriceCents <= 0)) {
      return NextResponse.json({ error: "Hay items inválidos en la cotización." }, { status: 400 })
    }

    const settings = await prisma.companySettings.findFirst({
      where: { accountId: user.accountId },
      select: { salePricesIncludeItbis: true },
    })
    const salePricesIncludeItbis =
      readBoolean(body.salePricesIncludeItbis) ??
      readBoolean(body.preciosIncluyenItbis) ??
      readBoolean(body.precioVentaIncluyeItbis) ??
      (settings?.salePricesIncludeItbis ?? true)
    const discountModeRaw = String(body.discountMode || "").toUpperCase()
    const discountMode = discountModeRaw === "AUTO" || discountModeRaw === "MANUAL"
      ? (discountModeRaw as "AUTO" | "MANUAL")
      : undefined
    const requestedCustomerId = normalizeRequestedCustomerId(body.customerId)
    const manualDiscountPercentBp = Number.isFinite(Number(body.manualDiscountPercentBp))
      ? Math.round(Number(body.manualDiscountPercentBp))
      : Number.isFinite(Number(body.manualDiscountPercent))
        ? Math.round(Number(body.manualDiscountPercent) * 100)
        : 0

    const quote = await prisma.$transaction(async (tx) => {
      const seq = await tx.quoteSequence.upsert({
        where: { accountId: user.accountId },
        update: { lastNumber: { increment: 1 } },
        create: { accountId: user.accountId, lastNumber: 1 },
      })

      const number = seq.lastNumber
      const code = quoteCode(number)

      const products = await tx.product.findMany({
        where: {
          accountId: user.accountId,
          id: { in: items.map((i) => i.productId) },
        },
        select: { id: true, isActive: true, itbisRateBp: true },
      })
      const byId = new Map(products.map((p) => [p.id, p]))

      for (const item of items) {
        const product = byId.get(item.productId)
        if (!product || !product.isActive) {
          throw new Error("Hay un producto inválido o inactivo en la cotización.")
        }
      }

      const itemsWithTax = items.map((item) => ({
        ...item,
        itbisRateBp: byId.get(item.productId)?.itbisRateBp ?? 1800,
      }))
      const genericCustomer = await ensureGenericCustomer(tx, user.accountId)
      let finalCustomerId = genericCustomer.id
      if (requestedCustomerId) {
        const requestedCustomer = await tx.customer.findFirst({
          where: { id: requestedCustomerId, accountId: user.accountId, isActive: true },
          select: { id: true },
        })
        if (requestedCustomer) {
          finalCustomerId = requestedCustomer.id
        }
      }
      const customerForDiscount = await tx.customer.findFirst({
        where: { id: finalCustomerId, accountId: user.accountId, isActive: true },
        select: { saleDiscountPercentBp: true },
      })
      let discountSource: DocumentDiscountSource = DocumentDiscountSource.NONE
      let discountPercentBp = 0
      if (discountMode === "MANUAL") {
        if (!user.canApplyDiscounts && !user.isOwner) {
          throw new Error("No tienes permiso para aplicar descuentos manuales.")
        }
        discountSource = DocumentDiscountSource.MANUAL
        discountPercentBp = normalizeDiscountPercentBp(manualDiscountPercentBp)
      } else {
        const customerDiscountBp = normalizeDiscountPercentBp(customerForDiscount?.saleDiscountPercentBp ?? 0)
        discountSource = customerDiscountBp > 0 ? DocumentDiscountSource.CUSTOMER : DocumentDiscountSource.NONE
        discountPercentBp = customerDiscountBp
      }

      const {
        discountSubtotalCents,
        subtotalCents,
        itbisCents,
        discountTotalCents,
        itemsTotalCents,
      } = calcDiscountedDocumentTotalsByTaxMode(
        itemsWithTax.map((item) => ({
          unitPriceCents: item.unitPriceCents,
          qty: item.qty,
          itbisRateBp: item.itbisRateBp ?? 1800,
        })),
        salePricesIncludeItbis,
        discountPercentBp
      )
      const shippingCents = Number(body.shippingCents ?? (body.shipping ? Math.round(body.shipping * 100) : 0))
      const totalCents = itemsTotalCents + shippingCents

      const created = await tx.quote.create({
        data: {
          accountId: user.accountId,
          quoteNumber: number,
          quoteCode: code,
          customerId: finalCustomerId,
          userId: user.id,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          subtotalCents,
          itbisCents,
          shippingCents,
          discountSource,
          discountPercentBp,
          discountSubtotalCents,
          discountTotalCents,
          totalCents,
          salePricesIncludeItbis,
          notes: body.notes || null,
          items: {
            create: itemsWithTax.map((i) => ({
              productId: i.productId,
              qty: i.qty,
              unitPriceCents: i.unitPriceCents,
              wasPriceOverridden: i.wasPriceOverridden,
              itbisRateBp: i.itbisRateBp ?? 1800,
              lineTotalCents: Math.round(i.unitPriceCents * i.qty),
            })),
          },
        },
        select: {
          id: true,
          quoteCode: true,
          salePricesIncludeItbis: true,
          discountSource: true,
          discountPercentBp: true,
          discountSubtotalCents: true,
          discountTotalCents: true,
        },
      })

      await logAuditEvent(
        {
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "QUOTE_CREATED",
          resourceType: "Quote",
          resourceId: created.id,
          details: {
            quoteCode: created.quoteCode,
            totalCents,
            discountSource: created.discountSource,
            discountPercentBp: created.discountPercentBp,
            itemsCount: items.length,
            customerId: finalCustomerId,
          },
        },
        tx
      )

      return created
    }, TRANSACTION_OPTIONS)

    return NextResponse.json(
      {
        id: quote.id,
        quoteCode: quote.quoteCode,
        salePricesIncludeItbis: quote.salePricesIncludeItbis,
        discountSource: quote.discountSource,
        discountPercentBp: quote.discountPercentBp,
        discountSubtotalCents: quote.discountSubtotalCents,
        discountTotalCents: quote.discountTotalCents,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/quotes:", error)
    return NextResponse.json({ error: getErrorMessage(error, "Error al crear cotización") }, { status: 500 })
  }
}


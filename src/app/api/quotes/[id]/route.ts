import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { calcDiscountedDocumentTotalsByTaxMode, normalizeDiscountPercentBp } from "@/lib/money"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { DocumentDiscountSource } from "@prisma/client"
import { ensureGenericCustomer } from "@/lib/customer-helpers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type QuoteBodyItem = {
  productId?: string
  qty?: number
  quantity?: number
  unitPriceCents?: number
  priceCents?: number
  price?: number
  wasPriceOverridden?: boolean
}

type UpdateQuoteBody = {
  items?: QuoteBodyItem[]
  customerId?: string | null
  shippingCents?: number
  shipping?: number
  validUntil?: string | null
  notes?: string | null
  salePricesIncludeItbis?: boolean
  preciosIncluyenItbis?: boolean
  precioVentaIncluyeItbis?: boolean
  discountMode?: string
  manualDiscountPercentBp?: number
  manualDiscountPercent?: number
}

type DiscountModeInput = "AUTO" | "MANUAL"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
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

function normalizeRequestedCustomerId(customerId: string | null | undefined): string | null {
  const normalized = customerId?.trim()
  if (!normalized) return null
  return normalized.toLowerCase() === "generic" ? null : normalized
}

function resolveAutoDiscount(
  customer: { saleDiscountPercentBp: number } | null | undefined
): { discountSource: DocumentDiscountSource; discountPercentBp: number } {
  const customerDiscountBp = normalizeDiscountPercentBp(customer?.saleDiscountPercentBp ?? 0)
  if (customerDiscountBp <= 0) {
    return {
      discountSource: DocumentDiscountSource.NONE,
      discountPercentBp: 0,
    }
  }
  return {
    discountSource: DocumentDiscountSource.CUSTOMER,
    discountPercentBp: customerDiscountBp,
  }
}

// GET /api/quotes/:id - Obtener cotización
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const quote = await prisma.quote.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        customer: { select: { id: true, visualId: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, reference: true } },
          },
        },
      },
    })

    if (!quote) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
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
      items: quote.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || null,
        sku: item.product?.sku || null,
        reference: item.product?.reference || null,
        qty: decimalToNumber(item.qty),
        unitPriceCents: item.unitPriceCents,
        itbisRateBp: item.itbisRateBp,
        lineTotalCents: item.lineTotalCents,
        wasPriceOverridden: item.wasPriceOverridden,
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/quotes/[id]:", error)
    return NextResponse.json({ error: getErrorMessage(error, "Error al obtener cotización") }, { status: 500 })
  }
}

// PUT /api/quotes/:id - Editar cotización
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageQuotes = await hasPermissionOrLog(user, "canManageQuotes", {
      resourceType: "Quote",
      details: { endpoint: "/api/quotes/[id]", method: "PUT" },
    })
    if (!canManageQuotes) {
      return NextResponse.json({ error: "No tienes permiso para gestionar cotizaciones" }, { status: 403 })
    }

    const { id } = await params
    const body = (await request.json()) as UpdateQuoteBody

    const existing = await prisma.quote.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        items: {
          select: {
            productId: true,
            qty: true,
            unitPriceCents: true,
            wasPriceOverridden: true,
          },
        },
        customer: {
          select: {
            id: true,
            saleDiscountPercentBp: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    const requestItems: QuoteBodyItem[] = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : existing.items.map((item) => ({
          productId: item.productId,
          qty: decimalToNumber(item.qty),
          unitPriceCents: item.unitPriceCents,
          wasPriceOverridden: item.wasPriceOverridden,
        }))

    const items = requestItems.map((item) => ({
      productId: String(item.productId || ""),
      qty: Number(item.qty ?? item.quantity ?? 0),
      unitPriceCents: Number(item.unitPriceCents ?? item.priceCents ?? Math.round((item.price || 0) * 100)),
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
    const requestedSalePricesIncludeItbis =
      readBoolean(body.salePricesIncludeItbis) ??
      readBoolean(body.preciosIncluyenItbis) ??
      readBoolean(body.precioVentaIncluyeItbis)
    const discountModeRaw = String(body.discountMode || "").toUpperCase()
    const discountMode = discountModeRaw === "AUTO" || discountModeRaw === "MANUAL"
      ? (discountModeRaw as DiscountModeInput)
      : undefined
    const manualDiscountPercentBp = Number.isFinite(Number(body.manualDiscountPercentBp))
      ? Math.round(Number(body.manualDiscountPercentBp))
      : Number.isFinite(Number(body.manualDiscountPercent))
        ? Math.round(Number(body.manualDiscountPercent) * 100)
        : 0

    const updatedQuote = await prisma.$transaction(async (tx) => {
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

      const documentSalePricesIncludeItbis =
        requestedSalePricesIncludeItbis ?? existing.salePricesIncludeItbis ?? (settings?.salePricesIncludeItbis ?? true)
      const itemsWithTax = items.map((item) => ({
        ...item,
        itbisRateBp: byId.get(item.productId)?.itbisRateBp ?? 1800,
      }))
      const genericCustomer = await ensureGenericCustomer(tx, user.accountId)
      const requestedCustomerId = body.customerId === undefined
        ? existing.customerId
        : normalizeRequestedCustomerId(body.customerId)
      let resolvedCustomerId = genericCustomer.id
      if (requestedCustomerId) {
        const requestedCustomer = await tx.customer.findFirst({
          where: { id: requestedCustomerId, accountId: user.accountId, isActive: true },
          select: { id: true },
        })
        if (requestedCustomer) {
          resolvedCustomerId = requestedCustomer.id
        }
      }
      const customerForDiscount = await tx.customer.findFirst({
        where: { id: resolvedCustomerId, accountId: user.accountId, isActive: true },
        select: { saleDiscountPercentBp: true },
      })
      let discountSource: DocumentDiscountSource
      let discountPercentBp: number

      if (discountMode === "MANUAL") {
        if (!user.canApplyDiscounts && !user.isOwner) {
          throw new Error("No tienes permiso para aplicar descuentos manuales.")
        }
        discountSource = DocumentDiscountSource.MANUAL
        discountPercentBp = normalizeDiscountPercentBp(manualDiscountPercentBp)
      } else if (discountMode === "AUTO") {
        const resolvedDiscount = resolveAutoDiscount(customerForDiscount)
        discountSource = resolvedDiscount.discountSource
        discountPercentBp = resolvedDiscount.discountPercentBp
      } else {
        discountSource = existing.discountSource
        discountPercentBp = normalizeDiscountPercentBp(existing.discountPercentBp ?? 0)
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
        documentSalePricesIncludeItbis,
        discountPercentBp
      )
      const shippingCents = Number(body.shippingCents ?? (body.shipping ? Math.round(body.shipping * 100) : existing.shippingCents))
      const totalCents = itemsTotalCents + shippingCents

      await tx.quoteItem.deleteMany({ where: { quoteId: id } })
      const updated = await tx.quote.update({
        where: { id },
        data: {
          customerId: resolvedCustomerId,
          validUntil: body.validUntil === undefined ? existing.validUntil : body.validUntil ? new Date(body.validUntil) : null,
          notes: body.notes === undefined ? existing.notes : body.notes || null,
          subtotalCents,
          itbisCents,
          shippingCents,
          discountSource,
          discountPercentBp,
          discountSubtotalCents,
          discountTotalCents,
          totalCents,
          salePricesIncludeItbis: documentSalePricesIncludeItbis,
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
          totalCents: true,
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
          action: "QUOTE_EDITED",
          resourceType: "Quote",
          resourceId: updated.id,
          details: {
            quoteCode: updated.quoteCode,
            totalCents: updated.totalCents,
            discountSource,
            discountPercentBp,
            itemsCount: items.length,
            customerId: resolvedCustomerId,
          },
        },
        tx
      )

      return updated
    }, TRANSACTION_OPTIONS)

    return NextResponse.json({
      id: updatedQuote.id,
      quoteCode: updatedQuote.quoteCode,
      totalCents: updatedQuote.totalCents,
      salePricesIncludeItbis: updatedQuote.salePricesIncludeItbis,
      discountSource: updatedQuote.discountSource,
      discountPercentBp: updatedQuote.discountPercentBp,
      discountSubtotalCents: updatedQuote.discountSubtotalCents,
      discountTotalCents: updatedQuote.discountTotalCents,
    })
  } catch (error: unknown) {
    console.error("Error en PUT /api/quotes/[id]:", error)
    return NextResponse.json({ error: getErrorMessage(error, "Error al editar cotización") }, { status: 500 })
  }
}

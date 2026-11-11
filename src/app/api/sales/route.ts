import type { CashOperationInput } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { createSale } from "@/app/(app)/sales/actions"
import { SaleType, PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { isGenericCustomerQuery } from "@/lib/customer-display"
import { SaleNotesValidationError } from "@/lib/sale-notes"
import { assertNoFiscalInput, UnsupportedFiscalInputError } from "@/lib/fiscal/core/input"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
import { FiscalSequenceError } from "@/lib/fiscal/core/sequences"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type SaleBodyItem = {
  productId?: string
  quantity?: number
  qty?: number
  unitPriceCents?: number
  price?: number
  wasPriceOverridden?: boolean
  selectedModifierIds?: string[]
  recipeAdjustments?: Array<{
    ingredientId?: string
    adjustmentType?: string
  }>
}

type SalePaymentSplitBody = {
  method?: string
  amountCents?: number
  amount?: number
  transferBankName?: string | null
  treasuryAccountId?: string | null
}

type SaleCreateBody = {
  items?: SaleBodyItem[]
  notes?: string | null
  shippingCents?: number
  shipping?: number
  type?: string
  paymentMethod?: string
  transferBankName?: string | null
  treasuryAccountId?: string | null
  paymentSplits?: SalePaymentSplitBody[]
  customerId?: string | null
  cashOperation?: CashOperationInput
  soldAt?: string | number | null
  createdAt?: string | number | null
  salePricesIncludeItbis?: boolean
  preciosIncluyenItbis?: boolean
  precioVentaIncluyeItbis?: boolean
  applyLegalTip?: boolean
  cobrarPropinaLegal?: boolean
  incluirPropinaLegal?: boolean
  discountMode?: string
  manualDiscountPercentBp?: number
  manualDiscountPercent?: number
  onboardingProductId?: string | null
  fiscal?: unknown
  expectedTotalCents?: number
}

const methodMap: Record<string, PaymentMethod> = {
  EFECTIVO: PaymentMethod.EFECTIVO,
  TARJETA: PaymentMethod.TARJETA,
  TRANSFERENCIA: PaymentMethod.TRANSFERENCIA,
  OTRO: PaymentMethod.OTRO,
  DIVIDIR_PAGO: PaymentMethod.DIVIDIR_PAGO,
}

type CartItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
  recipeAdjustments?: Array<{
    ingredientId: string
    adjustmentType: "SIN" | "EXTRA"
  }>
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
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

function parseOptionalSaleDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Fecha de venta inválida")
    return value
  }

  if (typeof value === "number") {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) throw new Error("Fecha de venta inválida")
    return parsed
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    const parsed = /^\d+$/.test(trimmed) ? new Date(Number(trimmed)) : new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) throw new Error("Fecha de venta inválida")
    return parsed
  }

  throw new Error("Fecha de venta inválida")
}

// GET /api/sales - Listar ventas/facturas
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
    const fiscalSaleIds = query && /^E(?:31|32|44|45|46)\d{0,10}$/i.test(query) ? await (await import("@/lib/fiscal/core/sale-query")).findFiscalSaleIds(user, query) : []
    const requestedSkip = parseSkip(searchParams.get("skip"))
    const take = parseTake(searchParams.get("take"), 300, 500)
    const effectiveSkip = requestedSkip ?? 0

    const sales = await prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        ...(query
          ? {
              OR: [
                { invoiceCode: { contains: query, mode: "insensitive" } },
                { customer: { name: { contains: query, mode: "insensitive" } } },
                ...(visualIdQuery !== null ? [{ customer: { visualId: visualIdQuery } }] : []),
                ...(shouldIncludeLegacyNullGeneric ? [{ customerId: null }] : []),
                ...(fiscalSaleIds.length ? [{ id: { in: fiscalSaleIds } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { soldAt: "desc" },
      include: {
        customer: { select: { id: true, visualId: true, name: true } },
        payments: {
          select: {
            method: true,
            amountCents: true,
            transferBankName: true,
            treasuryAccountId: true,
          },
        },
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

    const hasMore = sales.length > take
    const pageItems = hasMore ? sales.slice(0, take) : sales
    const nextSkip = hasMore ? effectiveSkip + take : null
    const fiscalSummaries = await (await import("@/lib/fiscal/core/sale-query")).getFiscalSaleSummaries(user, pageItems.map(sale => sale.id))

    return NextResponse.json({
      data: pageItems.map((sale) => ({
        id: sale.id,
        invoiceCode: sale.invoiceCode,
        ...(fiscalSummaries?.has(sale.id) ? { fiscal: fiscalSummaries.get(sale.id) } : {}),
        soldAt: sale.soldAt.toISOString(),
        createdAt: sale.soldAt.toISOString(),
        type: sale.type,
        paymentMethod: sale.paymentMethod,
        treasuryAccountId: sale.treasuryAccountId ?? null,
        transferBankName: sale.transferBankName,
        paymentSplits: sale.payments.map((payment) => ({
          method: payment.method,
          amountCents: payment.amountCents,
          transferBankName: payment.transferBankName,
          treasuryAccountId: payment.treasuryAccountId ?? null,
        })),
        customerId: sale.customerId,
        customerVisualId: sale.customer?.visualId ?? null,
        customerName: sale.customer?.name || null,
        subtotalCents: sale.subtotalCents,
        itbisCents: sale.itbisCents,
        shippingCents: sale.shippingCents,
        notes: sale.notes ?? null,
        discountSource: sale.discountSource,
        discountPercentBp: sale.discountPercentBp,
        discountSubtotalCents: sale.discountSubtotalCents,
        discountTotalCents: sale.discountTotalCents,
        legalTipApplied: sale.legalTipApplied,
        legalTipPercentBp: sale.legalTipPercentBp,
        legalTipBaseCents: sale.legalTipBaseCents,
        legalTipCents: sale.legalTipCents,
        totalCents: sale.totalCents,
        salePricesIncludeItbis: sale.salePricesIncludeItbis,
        cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
        itemsCount: sale.items.length,
        items: sale.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          qty: Number(item.qty),
          unitPriceCents: item.unitPriceCents,
          lineTotalCents: item.lineTotalCents,
          itbisRateBp: item.itbisRateBp,
        })),
      })),
      nextSkip,
    })
  } catch (error: unknown) {
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    console.error("Error en GET /api/sales:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al listar ventas") },
      { status: 500 }
    )
  }
}

// POST /api/sales - Crear venta
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = (await request.json()) as SaleCreateBody
    const commercialBody = { ...body }
    delete commercialBody.fiscal
    assertNoFiscalInput(commercialBody)
    const soldAt = parseOptionalSaleDate(body.soldAt ?? body.createdAt)
    const salePricesIncludeItbis =
      readBoolean(body.salePricesIncludeItbis) ??
      readBoolean(body.preciosIncluyenItbis) ??
      readBoolean(body.precioVentaIncluyeItbis)
    const applyLegalTip =
      readBoolean(body.applyLegalTip) ??
      readBoolean(body.cobrarPropinaLegal) ??
      readBoolean(body.incluirPropinaLegal)

    if ((body.items ?? []).some((item) => Array.isArray(item.selectedModifierIds))) {
      return NextResponse.json(
        { error: "selectedModifierIds ya no es soportado. Usa recipeAdjustments." },
        { status: 400 }
      )
    }

    // Convertir items del formato móvil al formato esperado
    const items: CartItemInput[] = (body.items || []).map((item) => ({
      productId: String(item.productId || ""),
      qty: Number(item.quantity ?? item.qty ?? 0),
      unitPriceCents: item.unitPriceCents || Math.round((item.price || 0) * 100),
      wasPriceOverridden: item.wasPriceOverridden || false,
      recipeAdjustments: Array.isArray(item.recipeAdjustments)
        ? item.recipeAdjustments.map((adjustment) => ({
            ingredientId: String(adjustment.ingredientId || ""),
            adjustmentType: String(adjustment.adjustmentType || "").toUpperCase() as "SIN" | "EXTRA",
          }))
        : [],
    }))

    if (!items.length) {
      return NextResponse.json({ error: "La venta no tiene productos." }, { status: 400 })
    }
    if (items.some((item) => !item.productId || item.qty <= 0 || item.unitPriceCents <= 0)) {
      return NextResponse.json({ error: "Hay items inválidos en la venta." }, { status: 400 })
    }

    // Convertir shipping de pesos a centavos si viene como número decimal
    const shippingCents = body.shippingCents ?? (body.shipping ? Math.round(body.shipping * 100) : 0)

    // Determinar tipo de venta
    const saleType = body.type === "CREDITO" || body.paymentMethod === "CREDITO" 
      ? SaleType.CREDITO 
      : SaleType.CONTADO

    // Convertir paymentMethod al enum
    let paymentMethod: PaymentMethod | null = null
    if (body.paymentMethod && body.paymentMethod !== "CREDITO") {
      paymentMethod = methodMap[body.paymentMethod] || null
    }

    const paymentSplits = Array.isArray(body.paymentSplits)
      ? body.paymentSplits.map((split) => ({
        method: methodMap[String(split.method || "").toUpperCase()] || PaymentMethod.OTRO,
        amountCents:
          split.amountCents ??
          (typeof split.amount === "number" ? Math.round(split.amount * 100) : 0),
        transferBankName: split.transferBankName || null,
        treasuryAccountId: split.treasuryAccountId || null,
      }))
      : undefined

    const discountModeRaw = String(body.discountMode || "").toUpperCase()
    const discountMode = discountModeRaw === "AUTO" || discountModeRaw === "MANUAL"
      ? (discountModeRaw as "AUTO" | "MANUAL")
      : undefined
    const manualDiscountPercentBp = Number.isFinite(Number(body.manualDiscountPercentBp))
      ? Math.round(Number(body.manualDiscountPercentBp))
      : Number.isFinite(Number(body.manualDiscountPercent))
        ? Math.round(Number(body.manualDiscountPercent) * 100)
        : undefined

    const sale = await createSale({
      cashOperation: body.cashOperation,
      customerId: body.customerId || null,
      type: saleType,
      paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
      transferBankName: body.transferBankName || null,
      treasuryAccountId: body.treasuryAccountId || null,
      paymentSplits: paymentSplits && paymentSplits.length > 0 ? paymentSplits : undefined,
      items,
      shippingCents,
      notes: body.notes,
      applyLegalTip,
      discountMode,
      manualDiscountPercentBp,
      salePricesIncludeItbis,
      soldAt,
      ...(body.expectedTotalCents !== undefined ? { expectedTotalCents: body.expectedTotalCents } : {}),
      onboardingProductId: body.onboardingProductId || null,
      username: user.username,
      user,
      ...(Object.hasOwn(body, "fiscal") ? { fiscal: body.fiscal } : {}),
    })

    return NextResponse.json({
      id: sale.id,
      invoiceCode: sale.invoiceCode,
      notes: sale.notes ?? null,
      type: sale.type,
      soldAt: sale.soldAt.toISOString(),
      createdAt: sale.soldAt.toISOString(),
      treasuryAccountId: sale.treasuryAccountId ?? null,
      transferBankName: sale.transferBankName ?? null,
      salePricesIncludeItbis: sale.salePricesIncludeItbis ?? true,
      legalTipApplied: sale.legalTipApplied ?? false,
      legalTipPercentBp: sale.legalTipPercentBp ?? 1000,
      legalTipBaseCents: sale.legalTipBaseCents ?? 0,
      legalTipCents: sale.legalTipCents ?? 0,
      discountSource: sale.discountSource,
      discountPercentBp: sale.discountPercentBp,
      discountSubtotalCents: sale.discountSubtotalCents,
      discountTotalCents: sale.discountTotalCents,
      ...("fiscal" in sale ? { fiscal: sale.fiscal } : {}),
    }, { status: 201 })
  } catch (error: unknown) {
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    if (error instanceof UnsupportedFiscalInputError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    }
    if (error instanceof FiscalDocumentError) return NextResponse.json({ error: error.message, code: error.code, fields: error.issues }, { status: error.status })
    if (error instanceof FiscalSequenceError) return NextResponse.json({ error: error.message, code: error.code, fields: error.fields.map(field => ({ field, message: error.message })) }, { status: error.status })
    if (error instanceof SaleNotesValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // La precisión se valida tras recuperar cualquier operación ya confirmada.
    if (error instanceof Error && error.message === "La cantidad vendida admite como máximo dos decimales.") return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Error en POST /api/sales:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al crear venta") },
      { status: 500 }
    )
  }
}

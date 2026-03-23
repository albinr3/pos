import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { createSale } from "@/app/(app)/sales/actions"
import { SaleType, PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"

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
}

type SaleCreateBody = {
  items?: SaleBodyItem[]
  shippingCents?: number
  shipping?: number
  type?: string
  paymentMethod?: string
  transferBankName?: string | null
  paymentSplits?: SalePaymentSplitBody[]
  customerId?: string | null
  soldAt?: string | number | null
  createdAt?: string | number | null
  salePricesIncludeItbis?: boolean
  preciosIncluyenItbis?: boolean
  precioVentaIncluyeItbis?: boolean
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
              ],
            }
          : {}),
      },
      orderBy: { soldAt: "desc" },
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

    const hasMore = sales.length > take
    const pageItems = hasMore ? sales.slice(0, take) : sales
    const nextSkip = hasMore ? effectiveSkip + take : null

    return NextResponse.json({
      data: pageItems.map((sale) => ({
        id: sale.id,
        invoiceCode: sale.invoiceCode,
        soldAt: sale.soldAt.toISOString(),
        createdAt: sale.soldAt.toISOString(),
        type: sale.type,
        paymentMethod: sale.paymentMethod,
        transferBankName: sale.transferBankName,
        customerId: sale.customerId,
        customerVisualId: sale.customer?.visualId ?? null,
        customerName: sale.customer?.name || null,
        subtotalCents: sale.subtotalCents,
        itbisCents: sale.itbisCents,
        shippingCents: sale.shippingCents,
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
    const soldAt = parseOptionalSaleDate(body.soldAt ?? body.createdAt)
    const salePricesIncludeItbis =
      readBoolean(body.salePricesIncludeItbis) ??
      readBoolean(body.preciosIncluyenItbis) ??
      readBoolean(body.precioVentaIncluyeItbis)

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
      }))
      : undefined

    const sale = await createSale({
      customerId: body.customerId || null,
      type: saleType,
      paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
      transferBankName: body.transferBankName || null,
      paymentSplits: paymentSplits && paymentSplits.length > 0 ? paymentSplits : undefined,
      items,
      shippingCents,
      salePricesIncludeItbis,
      soldAt,
      username: user.username,
      user,
    })

    return NextResponse.json({
      id: sale.id,
      invoiceCode: sale.invoiceCode,
      type: sale.type,
      soldAt: sale.soldAt.toISOString(),
      createdAt: sale.soldAt.toISOString(),
      transferBankName: sale.transferBankName ?? null,
      salePricesIncludeItbis: sale.salePricesIncludeItbis ?? true,
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/sales:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al crear venta") },
      { status: 500 }
    )
  }
}

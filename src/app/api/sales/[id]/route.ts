import { NextRequest, NextResponse } from "next/server"
import { PaymentMethod, SaleType } from "@prisma/client"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { updateSale, cancelSale } from "@/app/(app)/sales/actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type DecimalLike = { toNumber: () => number }

type EditableSaleItem = {
  productId?: string
  qty?: number
  quantity?: number
  unitPriceCents?: number
  priceCents?: number
  price?: number
  wasPriceOverridden?: boolean
  selectedModifierIds?: string[]
  recipeAdjustments?: Array<{
    ingredientId?: string
    adjustmentType?: string
  }>
}

type UpdateSalePaymentSplitBody = {
  method?: string
  amountCents?: number
  amount?: number
  transferBankName?: string | null
}

type UpdateSaleBody = {
  status?: string
  cancel?: boolean
  items?: EditableSaleItem[]
  type?: string
  customerId?: string | null
  paymentMethod?: string
  transferBankName?: string | null
  paymentSplits?: UpdateSalePaymentSplitBody[]
  soldAt?: string | number | null
  createdAt?: string | number | null
  salePricesIncludeItbis?: boolean
  preciosIncluyenItbis?: boolean
  precioVentaIncluyeItbis?: boolean
}

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
    typeof (value as DecimalLike).toNumber === "function"
  ) {
    return Number((value as DecimalLike).toNumber())
  }
  return Number(value || 0)
}

function parsePaymentMethod(value: unknown): PaymentMethod | null {
  const raw = String(value || "").toUpperCase()
  if (raw === "EFECTIVO") return PaymentMethod.EFECTIVO
  if (raw === "TARJETA") return PaymentMethod.TARJETA
  if (raw === "TRANSFERENCIA") return PaymentMethod.TRANSFERENCIA
  if (raw === "OTRO") return PaymentMethod.OTRO
  if (raw === "DIVIDIR_PAGO") return PaymentMethod.DIVIDIR_PAGO
  return null
}

function parseSaleType(value: unknown, fallback: SaleType): SaleType {
  const raw = String(value || "").toUpperCase()
  if (raw === "CREDITO") return SaleType.CREDITO
  if (raw === "CONTADO") return SaleType.CONTADO
  return fallback
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

// GET /api/sales/:id - Obtener venta/factura
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
    const sale = await prisma.sale.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        customer: { select: { id: true, name: true } },
        payments: {
          select: {
            id: true,
            method: true,
            amountCents: true,
            transferBankName: true,
          },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, reference: true } },
            recipeAdjustments: {
              select: {
                ingredientId: true,
                ingredientName: true,
                type: true,
              },
            },
          },
        },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      id: sale.id,
      invoiceCode: sale.invoiceCode,
      soldAt: sale.soldAt.toISOString(),
      createdAt: sale.soldAt.toISOString(),
      type: sale.type,
      paymentMethod: sale.paymentMethod,
      transferBankName: sale.transferBankName,
      paymentSplits: sale.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amountCents: payment.amountCents,
        transferBankName: payment.transferBankName,
      })),
      customerId: sale.customerId,
      customerName: sale.customer?.name || null,
      subtotalCents: sale.subtotalCents,
      itbisCents: sale.itbisCents,
      shippingCents: sale.shippingCents,
      totalCents: sale.totalCents,
      salePricesIncludeItbis: sale.salePricesIncludeItbis,
      cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || null,
        sku: item.product?.sku || null,
        reference: item.product?.reference || null,
        qty: decimalToNumber(item.qty),
        unitPriceCents: item.unitPriceCents,
        itbisRateBp: item.itbisRateBp,
        lineTotalCents: item.lineTotalCents,
        recipeAdjustments: item.recipeAdjustments.map((adjustment) => ({
          ingredientId: adjustment.ingredientId,
          ingredientName: adjustment.ingredientName,
          adjustmentType: adjustment.type,
        })),
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/sales/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al obtener venta") },
      { status: 500 }
    )
  }
}

// PUT /api/sales/:id - Editar venta/factura
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const body = (await request.json()) as UpdateSaleBody

    const shouldCancel =
      String(body?.status || "").toLowerCase() === "cancelled" ||
      String(body?.status || "").toUpperCase() === "CANCELADA" ||
      body?.cancel === true

    if (shouldCancel) {
      const result = await cancelSale(id, user.username || user.name || "api", user)
      if (!result.success) {
        return NextResponse.json({ error: result.error || "No se pudo cancelar la venta" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    const soldAt = parseOptionalSaleDate(body.soldAt ?? body.createdAt)

    const existingSale = await prisma.sale.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        items: {
          select: {
            productId: true,
            qty: true,
            unitPriceCents: true,
            wasPriceOverridden: true,
            recipeAdjustments: {
              select: {
                ingredientId: true,
                ingredientName: true,
                type: true,
              },
            },
          },
        },
      },
    })

    if (!existingSale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 })
    }

    const baseItems: EditableSaleItem[] = existingSale.items.map((item) => ({
      productId: item.productId,
      quantity: decimalToNumber(item.qty),
      unitPriceCents: item.unitPriceCents,
      wasPriceOverridden: item.wasPriceOverridden,
      recipeAdjustments: item.recipeAdjustments.map((adjustment) => ({
        ingredientId: adjustment.ingredientId,
        adjustmentType: adjustment.type,
      })),
    }))

    const requestItems = Array.isArray(body?.items) && body.items.length > 0 ? body.items : baseItems
    if (requestItems.some((item) => Array.isArray(item.selectedModifierIds))) {
      return NextResponse.json(
        { error: "selectedModifierIds ya no es soportado. Usa recipeAdjustments." },
        { status: 400 }
      )
    }
    const items = requestItems.map((item) => ({
      productId: String(item.productId || ""),
      qty: Number(item.qty ?? item.quantity ?? 0),
      unitPriceCents: Number(item.unitPriceCents ?? item.priceCents ?? Math.round((item.price || 0) * 100)),
      wasPriceOverridden: Boolean(item.wasPriceOverridden || false),
      recipeAdjustments: Array.isArray(item.recipeAdjustments)
        ? item.recipeAdjustments.map((adjustment) => ({
            ingredientId: String(adjustment.ingredientId || ""),
            adjustmentType: String(adjustment.adjustmentType || "").toUpperCase() as "SIN" | "EXTRA",
          }))
        : [],
    }))

    if (items.length === 0) {
      return NextResponse.json({ error: "La venta no tiene productos" }, { status: 400 })
    }
    if (items.some((item) => !item.productId || item.qty <= 0 || item.unitPriceCents <= 0)) {
      return NextResponse.json({ error: "Hay productos inválidos en la venta" }, { status: 400 })
    }

    const type = parseSaleType(body?.type, existingSale.type)
    const customerId = body?.customerId === undefined ? existingSale.customerId : body.customerId || null
    const paymentMethodRaw =
      body?.paymentMethod === undefined ? existingSale.paymentMethod : parsePaymentMethod(body.paymentMethod)
    const paymentMethod = type === SaleType.CREDITO ? null : paymentMethodRaw
    const paymentSplits = Array.isArray(body?.paymentSplits)
      ? body.paymentSplits.map((split) => ({
          method: parsePaymentMethod(split.method) || PaymentMethod.OTRO,
          amountCents:
            split.amountCents ??
            (typeof split.amount === "number" ? Math.round(split.amount * 100) : 0),
          transferBankName: split.transferBankName || null,
        }))
      : undefined

    await updateSale({
      id,
      customerId,
      type,
      paymentMethod,
      transferBankName: body?.transferBankName || null,
      paymentSplits,
      items,
      soldAt,
      username: user.username || user.name || "api",
      user,
    })

    const updatedSale = await prisma.sale.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        customer: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      id: updatedSale?.id,
      invoiceCode: updatedSale?.invoiceCode,
      type: updatedSale?.type,
      paymentMethod: updatedSale?.paymentMethod,
      transferBankName: updatedSale?.transferBankName ?? null,
      customerId: updatedSale?.customerId,
      customerName: updatedSale?.customer?.name || null,
      totalCents: updatedSale?.totalCents,
      salePricesIncludeItbis: updatedSale?.salePricesIncludeItbis ?? true,
      soldAt: updatedSale?.soldAt ? updatedSale.soldAt.toISOString() : null,
      createdAt: updatedSale?.soldAt ? updatedSale.soldAt.toISOString() : null,
      cancelledAt: updatedSale?.cancelledAt ? updatedSale.cancelledAt.toISOString() : null,
    })
  } catch (error: unknown) {
    console.error("Error en PUT /api/sales/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al editar venta") },
      { status: 500 }
    )
  }
}

// DELETE /api/sales/:id - Cancelar venta/factura (sin borrar registro)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const result = await cancelSale(id, user.username || user.name || "api", user)
    if (!result.success) {
      return NextResponse.json({ error: result.error || "No se pudo cancelar la venta" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error en DELETE /api/sales/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al cancelar venta") },
      { status: 500 }
    )
  }
}

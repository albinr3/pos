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
}

type UpdateSaleBody = {
  status?: string
  cancel?: boolean
  items?: EditableSaleItem[]
  type?: string
  customerId?: string | null
  paymentMethod?: string
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
  return null
}

function parseSaleType(value: unknown, fallback: SaleType): SaleType {
  const raw = String(value || "").toUpperCase()
  if (raw === "CREDITO") return SaleType.CREDITO
  if (raw === "CONTADO") return SaleType.CONTADO
  return fallback
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
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, reference: true } },
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
      type: sale.type,
      paymentMethod: sale.paymentMethod,
      customerId: sale.customerId,
      customerName: sale.customer?.name || null,
      subtotalCents: sale.subtotalCents,
      itbisCents: sale.itbisCents,
      shippingCents: sale.shippingCents,
      totalCents: sale.totalCents,
      cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || null,
        sku: item.product?.sku || null,
        reference: item.product?.reference || null,
        qty: decimalToNumber(item.qty),
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
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
      const result = await cancelSale(id, user.username || user.name || "api")
      if (!result.success) {
        return NextResponse.json({ error: result.error || "No se pudo cancelar la venta" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    const existingSale = await prisma.sale.findFirst({
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
    }))

    const requestItems = Array.isArray(body?.items) && body.items.length > 0 ? body.items : baseItems
    const items = requestItems.map((item) => ({
      productId: String(item.productId || ""),
      qty: Number(item.qty ?? item.quantity ?? 0),
      unitPriceCents: Number(item.unitPriceCents ?? item.priceCents ?? Math.round((item.price || 0) * 100)),
      wasPriceOverridden: Boolean(item.wasPriceOverridden || false),
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

    await updateSale({
      id,
      customerId,
      type,
      paymentMethod,
      items,
      username: user.username || user.name || "api",
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
      customerId: updatedSale?.customerId,
      customerName: updatedSale?.customer?.name || null,
      totalCents: updatedSale?.totalCents,
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
    const result = await cancelSale(id, user.username || user.name || "api")
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

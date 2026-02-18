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
}

type SaleCreateBody = {
  items?: SaleBodyItem[]
  shippingCents?: number
  shipping?: number
  type?: string
  paymentMethod?: string
  customerId?: string | null
  soldAt?: string | number | null
  createdAt?: string | number | null
}

type CartItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
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

// GET /api/sales - Listar ventas/facturas
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()

    const sales = await prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        ...(query
          ? {
              OR: [
                { invoiceCode: { contains: query, mode: "insensitive" } },
                { customer: { name: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { soldAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        items: { select: { id: true } },
      },
      take: 300,
    })

    return NextResponse.json({
      data: sales.map((sale) => ({
        id: sale.id,
        invoiceCode: sale.invoiceCode,
        soldAt: sale.soldAt.toISOString(),
        createdAt: sale.soldAt.toISOString(),
        type: sale.type,
        paymentMethod: sale.paymentMethod,
        customerId: sale.customerId,
        customerName: sale.customer?.name || null,
        subtotalCents: sale.subtotalCents,
        itbisCents: sale.itbisCents,
        shippingCents: sale.shippingCents,
        totalCents: sale.totalCents,
        cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
        itemsCount: sale.items.length,
      })),
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

    // Convertir items del formato móvil al formato esperado
    const items: CartItemInput[] = (body.items || []).map((item) => ({
      productId: String(item.productId || ""),
      qty: Number(item.quantity ?? item.qty ?? 0),
      unitPriceCents: item.unitPriceCents || Math.round((item.price || 0) * 100),
      wasPriceOverridden: item.wasPriceOverridden || false,
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
      const methodMap: Record<string, PaymentMethod> = {
        EFECTIVO: PaymentMethod.EFECTIVO,
        TARJETA: PaymentMethod.TARJETA,
        TRANSFERENCIA: PaymentMethod.TRANSFERENCIA,
        OTRO: PaymentMethod.OTRO,
      }
      paymentMethod = methodMap[body.paymentMethod] || null
    }

    const sale = await createSale({
      customerId: body.customerId || null,
      type: saleType,
      paymentMethod: saleType === SaleType.CONTADO ? paymentMethod : null,
      items,
      shippingCents,
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
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/sales:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al crear venta") },
      { status: 500 }
    )
  }
}

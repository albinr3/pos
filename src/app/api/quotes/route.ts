import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { prisma } from "@/lib/db"
import { calcItbisIncluded } from "@/lib/money"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"
import { hasPermissionOrLog } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type QuoteItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
}

function quoteCode(number: number) {
  return `COT-${number.toString().padStart(5, "0")}`
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
    typeof (value as { toNumber: () => number }).toNumber === "function"
  ) {
    return Number((value as { toNumber: () => number }).toNumber())
  }
  return Number(value || 0)
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

    const quotes = await prisma.quote.findMany({
      where: {
        accountId: user.accountId,
        ...(query
          ? {
              OR: [
                { quoteCode: { contains: query, mode: "insensitive" } },
                { customer: { name: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { quotedAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        items: { select: { id: true, qty: true } },
      },
      take: 300,
    })

    return NextResponse.json({
      data: quotes.map((quote) => ({
        id: quote.id,
        quoteCode: quote.quoteCode,
        quotedAt: quote.quotedAt.toISOString(),
        validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
        customerId: quote.customerId,
        customerName: quote.customer?.name || null,
        subtotalCents: quote.subtotalCents,
        itbisCents: quote.itbisCents,
        shippingCents: quote.shippingCents,
        totalCents: quote.totalCents,
        notes: quote.notes || null,
        itemsCount: quote.items.length,
        qtyTotal: quote.items.reduce((sum, item) => sum + decimalToNumber(item.qty), 0),
      })),
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
      select: { itbisRateBp: true },
    })
    const itbisRateBp = settings?.itbisRateBp ?? 1800

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
        select: { id: true, isActive: true },
      })
      const byId = new Map(products.map((p) => [p.id, p]))

      for (const item of items) {
        const product = byId.get(item.productId)
        if (!product || !product.isActive) {
          throw new Error("Hay un producto inválido o inactivo en la cotización.")
        }
      }

      const itemsTotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
      const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
      const shippingCents = Number(body.shippingCents ?? (body.shipping ? Math.round(body.shipping * 100) : 0))
      const totalCents = itemsTotalCents + shippingCents

      const created = await tx.quote.create({
        data: {
          accountId: user.accountId,
          quoteNumber: number,
          quoteCode: code,
          customerId: body.customerId || null,
          userId: user.id,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          subtotalCents,
          itbisCents,
          shippingCents,
          totalCents,
          notes: body.notes || null,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              qty: i.qty,
              unitPriceCents: i.unitPriceCents,
              wasPriceOverridden: i.wasPriceOverridden,
              lineTotalCents: i.unitPriceCents * i.qty,
            })),
          },
        },
        select: { id: true, quoteCode: true },
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
            itemsCount: items.length,
            customerId: body.customerId || null,
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
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/quotes:", error)
    return NextResponse.json({ error: getErrorMessage(error, "Error al crear cotización") }, { status: 500 })
  }
}


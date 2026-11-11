import { assertNoFiscalInput, UnsupportedFiscalInputError } from "@/lib/fiscal/core/input"
import { cashRequest, cashDeviceHashFromRequest, withCashOperation } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { confirmCreditAdjustment } from "@/lib/fiscal/core/credit-drafts"
import { errorResponse as fiscalErrorResponse } from "@/app/api/fiscal/documents/_shared"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { createReturn, listReturns } from "@/app/(app)/returns/actions"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

// GET /api/returns - Listar devoluciones
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const requestedSkip = parseSkip(searchParams.get("skip"))
    const take = parseTake(searchParams.get("take"), 500, 500)
    const effectiveSkip = requestedSkip ?? 0

    if (!user.isOwner && !user.canAccessReturns) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })
    const returnsList = await cashRequest.run({ trustedActor: user }, () => listReturns({ skip: effectiveSkip, take: take + 1 }))
    const hasMore = returnsList.length > take
    const pageItems = hasMore ? returnsList.slice(0, take) : returnsList
    const nextSkip = hasMore ? effectiveSkip + take : null
    const canViewFiscal = user.isOwner || user.canViewFiscalDocuments || user.canPrepareFiscalDocuments
    const fiscalIds = canViewFiscal ? pageItems.flatMap(item => item.fiscalAdjustmentId ? [item.fiscalAdjustmentId] : []) : []
    const adjustments = fiscalIds.length ? await prisma.fiscalAdjustment.findMany({
      where: { accountId: user.accountId, id: { in: fiscalIds }, type: "E34" },
      select: { id: true, state: true, fiscalDocumentId: true, originalDocumentId: true, applications: { select: { kind: true, amountCents: true, method: true, treasuryAccountId: true } } },
    }) : []
    const fiscalById = new Map(adjustments.map(item => [item.id, item]))

    return NextResponse.json({
      data: pageItems.map((r: any) => ({
        id: r.id,
        returnCode: r.returnCode,
        saleId: r.saleId,
        fiscal: canViewFiscal && r.fiscalAdjustmentId ? fiscalById.get(r.fiscalAdjustmentId) ?? null : null,
        totalCents: r.totalCents,
        refundMethod: r.refundMethod ?? null,
        refundTreasuryAccountId: r.refundTreasuryAccountId ?? null,
        notes: r.notes || null,
        returnedAt: r.returnedAt?.toISOString?.() || null,
        cancelledAt: r.cancelledAt?.toISOString?.() || null,
        cancellationReason: canViewFiscal ? r.cancellationReason ?? null : null,
        sale: r.sale
          ? {
              id: r.sale.id,
              invoiceCode: r.sale.invoiceCode,
              type: r.sale.type,
              customer: r.sale.customer
                ? {
                    id: r.sale.customer.id,
                    visualId: r.sale.customer.visualId,
                    name: r.sale.customer.name,
                  }
                : null,
            }
          : null,
        items:
          r.items?.map((item: any) => ({
            id: item.id,
            saleItemId: item.saleItemId,
            productId: item.productId,
            qty: Number(item.qty),
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents,
            product: item.product
              ? {
                  name: item.product.name,
                  sku: item.product.sku,
                  reference: item.product.reference,
                }
              : null,
          })) || [],
      })),
      nextSkip,
    })
  } catch (error: any) {
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    if (error instanceof UnsupportedFiscalInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    console.error("Error en GET /api/returns:", error)
    return NextResponse.json(
      { error: error.message || "Error al listar devoluciones" },
      { status: 500 }
    )
  }
}

// POST /api/returns - Crear devolución
export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({}))
  if (typeof body.fiscalAdjustmentId === "string" && body.fiscalAdjustmentId.trim()) {
    try {
      const user = await getCurrentUserFromRequest(request)
      if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
      const { fiscalAdjustmentId, ...command } = body
      // La ruta de devoluciones solo admite notas con reposición física; las reducciones usan su recurso financiero.
      return NextResponse.json(await cashRequest.run({ trustedActor: user, deviceHash: cashDeviceHashFromRequest(request), fiscalPhysicalOnlyQueued: true }, () => confirmCreditAdjustment(user, fiscalAdjustmentId, command)), { status: 201, headers: { "Cache-Control": "private, no-store" } })
    } catch (error) { return cashErrorResponse(error) ?? fiscalErrorResponse(error) }
  }
  const { cashOperation, ...payload } = body
  return withCashOperation(cashOperation, { kind: "api-return", ...payload }, () => postCashDocument(request))
}

async function postCashDocument(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    assertNoFiscalInput(body)
    const saleId = String(body.saleId || "").trim()
    const notes = typeof body.notes === "string" ? body.notes : null
    // Un campo vacío equivale a omitir la preferencia; nunca enviar "" como enum Prisma.
    const refundMethod = String(body.refundMethod ?? "").trim().toUpperCase() || null
    const refundTreasuryAccountId = String(body.refundTreasuryAccountId ?? "").trim() || null
    if (refundMethod && !(new Set<string>([PaymentMethod.EFECTIVO, PaymentMethod.TRANSFERENCIA, PaymentMethod.TARJETA, PaymentMethod.OTRO])).has(refundMethod)) {
      return NextResponse.json({ error: "Método de devolución inválido" }, { status: 400 })
    }

    const items = (body.items || []).map((item: any) => ({
      saleItemId: String(item.saleItemId || "").trim(),
      productId: String(item.productId || "").trim(),
      qty: Number(item.qty),
      unitPriceCents: Number(item.unitPriceCents ?? Math.round((item.price || 0) * 100)),
    }))

    if (!saleId) {
      return NextResponse.json({ error: "saleId es requerido" }, { status: 400 })
    }
    if (!items.length) {
      return NextResponse.json({ error: "La devolución no tiene productos." }, { status: 400 })
    }
    if (items.some((i: any) => !i.saleItemId || !i.productId || i.qty <= 0 || i.unitPriceCents <= 0)) {
      return NextResponse.json({ error: "Hay items inválidos en la devolución." }, { status: 400 })
    }

    if (!user.isOwner && !user.canAccessReturns) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })
    const created = await cashRequest.run({ ...cashRequest.getStore(), trustedActor: user, deviceHash: cashDeviceHashFromRequest(request) }, () => createReturn(
      {
        saleId,
        items,
        notes,
        refundMethod: refundMethod as PaymentMethod | null,
        refundTreasuryAccountId,
      }
    ))

    return NextResponse.json(
      {
        id: created.id,
        returnCode: created.returnCode,
      },
      { status: 201 }
    )
  } catch (error: any) {
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    if (error instanceof UnsupportedFiscalInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    console.error("Error en POST /api/returns:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear devolución" },
      { status: 500 }
    )
  }
}

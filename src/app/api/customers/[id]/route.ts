import { FiscalMasterDataError, fiscalFields, customerFiscalFields, preferredReceiptInput, preferredReceiptResponse } from "@/lib/fiscal/core/master-data"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { upsertCustomer } from "@/app/(app)/customers/actions"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// El detalle usa la cuenta autenticada igual que el listado; un ID ajeno no concede acceso.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const { id } = await params
    const c = await prisma.customer.findFirst({ where: { id, accountId: user.accountId, isActive: true } })
    if (!c) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    return NextResponse.json({
      id: c.id, visualId: c.visualId, ...fiscalFields(c, customerFiscalFields), ...preferredReceiptResponse(c.fiscalPreferredReceiptType),
      name: c.name, phone: c.phone, address: c.address, cedula: c.cedula, province: c.province,
      creditEnabled: c.creditEnabled, creditDays: c.creditDays, saleDiscountPercentBp: c.saleDiscountPercentBp,
      isGeneric: c.isGeneric, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Error en GET /api/customers/:id", error)
    return NextResponse.json({ error: "Error al obtener cliente" }, { status: 500 })
  }
}

function parseSaleDiscountPercentBp(body: Record<string, unknown>): number {
  if (Number.isFinite(Number(body.saleDiscountPercentBp))) {
    return Math.round(Number(body.saleDiscountPercentBp))
  }
  if (Number.isFinite(Number(body.saleDiscountPercent))) {
    return Math.round(Number(body.saleDiscountPercent) * 100)
  }
  return 0
}

// PUT /api/customers/:id - Actualizar cliente
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageCustomers = await hasPermissionOrLog(user, "canManageCustomers", {
      resourceType: "Customer",
      details: { endpoint: "/api/customers/[id]", method: "PUT" },
    })
    if (!canManageCustomers) {
      return NextResponse.json({ error: "No tienes permiso para gestionar clientes" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json() as Record<string, any>
    if (body?.creditEnabled || Number(body?.creditDays || 0) > 0) {
      const canApproveCredit = await hasPermissionOrLog(user, "canApproveCredit", {
        resourceType: "Customer",
        resourceId: id,
        details: { endpoint: "/api/customers/[id]", method: "PUT", creditEnabled: body?.creditEnabled ?? false },
      })
      if (!canApproveCredit) {
        return NextResponse.json({ error: "No tienes permiso para aprobar lineas de credito" }, { status: 403 })
      }
    }

    await upsertCustomer({
      id,
      ...fiscalFields(body, customerFiscalFields),
      ...preferredReceiptInput(body),
      preserveLegacyReceiptTypes: body.fiscalPreferredReceiptTypes === undefined,
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      cedula: body.cedula || null,
      province: body.province || null,
      creditEnabled: body.creditEnabled ?? false,
      creditDays: body.creditDays ?? 0,
      saleDiscountPercentBp: parseSaleDiscountPercentBp(body),
    }, user)

    // Obtener el cliente actualizado para retornarlo
    const { prisma } = await import("@/lib/db")
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        accountId: user.accountId,
      },
    })

    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      id: customer.id,
      visualId: customer.visualId,
      ...fiscalFields(customer, customerFiscalFields),
        ...preferredReceiptResponse(customer.fiscalPreferredReceiptType),
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      cedula: customer.cedula,
      province: customer.province,
      creditEnabled: customer.creditEnabled,
      creditDays: customer.creditDays,
      saleDiscountPercentBp: customer.saleDiscountPercentBp,
      isGeneric: customer.isGeneric,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    })
  } catch (error: any) {
    if (error instanceof FiscalMasterDataError) return NextResponse.json({ error: error.message, field: error.field }, { status: 400 })
    console.error("Error en PUT /api/customers/:id:", error)
    if (typeof error?.message === "string" && error.message.includes("No tienes permiso")) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error.message || "Error al actualizar cliente" },
      { status: 500 }
    )
  }
}

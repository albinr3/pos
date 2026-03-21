import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { upsertCustomer } from "@/app/(app)/customers/actions"
import { hasPermissionOrLog } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
    const body = await request.json()
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
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      cedula: body.cedula || null,
      province: body.province || null,
      creditEnabled: body.creditEnabled ?? false,
      creditDays: body.creditDays ?? 0,
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
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      cedula: customer.cedula,
      province: customer.province,
      creditEnabled: customer.creditEnabled,
      creditDays: customer.creditDays,
      isGeneric: customer.isGeneric,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    })
  } catch (error: any) {
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

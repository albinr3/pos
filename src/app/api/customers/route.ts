import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { listCustomers, upsertCustomer } from "@/app/(app)/customers/actions"
import { hasPermissionOrLog } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// GET /api/customers - Listar clientes
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query") || undefined

    const customers = await listCustomers(query, user)

    return NextResponse.json({
      data: customers.map((c) => ({
        id: c.id,
        visualId: c.visualId,
        name: c.name,
        phone: c.phone,
        address: c.address,
        cedula: c.cedula,
        province: c.province,
        creditEnabled: c.creditEnabled,
        creditDays: c.creditDays,
        isGeneric: c.isGeneric,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/customers:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al obtener clientes") },
      { status: 500 }
    )
  }
}

// POST /api/customers - Crear cliente
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageCustomers = await hasPermissionOrLog(user, "canManageCustomers", {
      resourceType: "Customer",
      details: { endpoint: "/api/customers", method: "POST" },
    })
    if (!canManageCustomers) {
      return NextResponse.json({ error: "No tienes permiso para gestionar clientes" }, { status: 403 })
    }

    const body = await request.json()
    if (body?.creditEnabled || Number(body?.creditDays || 0) > 0) {
      const canApproveCredit = await hasPermissionOrLog(user, "canApproveCredit", {
        resourceType: "Customer",
        details: { endpoint: "/api/customers", method: "POST", creditEnabled: body?.creditEnabled ?? false },
      })
      if (!canApproveCredit) {
        return NextResponse.json({ error: "No tienes permiso para aprobar lineas de credito" }, { status: 403 })
      }
    }

    const persistedCustomer = await upsertCustomer({
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      cedula: body.cedula || null,
      province: body.province || null,
      creditEnabled: body.creditEnabled ?? false,
      creditDays: body.creditDays ?? 0,
    }, user)

    // Obtener el cliente creado para retornarlo
    const { prisma } = await import("@/lib/db")
    const customer = await prisma.customer.findFirst({
      where: {
        id: persistedCustomer.id,
        accountId: user.accountId,
      },
    })

    if (!customer) {
      return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 })
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
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error en POST /api/customers:", error)
    const message = getErrorMessage(error, "Error al crear cliente")
    if (message.includes("No tienes permiso")) {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

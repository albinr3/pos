import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { listCustomers, upsertCustomer } from "@/app/(app)/customers/actions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
  } catch (error: any) {
    console.error("Error en GET /api/customers:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener clientes" },
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

    const body = await request.json()

    await upsertCustomer({
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
        accountId: user.accountId,
        name: body.name,
      },
      orderBy: { createdAt: "desc" },
    })

    if (!customer) {
      return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 })
    }

    return NextResponse.json({
      id: customer.id,
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
  } catch (error: any) {
    console.error("Error en POST /api/customers:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear cliente" },
      { status: 500 }
    )
  }
}

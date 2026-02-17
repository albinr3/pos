import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { sanitizePhone, sanitizeString } from "@/lib/sanitize"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/suppliers - Listar proveedores activos
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()

    const suppliers = await prisma.supplier.findMany({
      where: {
        accountId: user.accountId,
        isActive: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { contactName: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 200,
    })

    return NextResponse.json({
      data: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        contactName: s.contactName,
        phone: s.phone,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/suppliers:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener proveedores" },
      { status: 500 }
    )
  }
}

// POST /api/suppliers - Crear proveedor
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const name = sanitizeString(String(body?.name || ""))
    const contactName =
      typeof body?.contactName === "string" && body.contactName.trim()
        ? sanitizeString(body.contactName)
        : null
    const phone =
      typeof body?.phone === "string" && body.phone.trim()
        ? sanitizePhone(body.phone)
        : null
    const email =
      typeof body?.email === "string" && body.email.trim()
        ? sanitizeString(body.email)
        : null
    const address =
      typeof body?.address === "string" && body.address.trim()
        ? sanitizeString(body.address)
        : null
    const notes =
      typeof body?.notes === "string" && body.notes.trim()
        ? sanitizeString(body.notes)
        : null
    const discountPercentBp = Number.isFinite(Number(body?.discountPercentBp))
      ? Number(body.discountPercentBp)
      : 0
    const chargesItbis = Boolean(body?.chargesItbis)

    if (!name) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      )
    }

    const existing = await prisma.supplier.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un proveedor con ese nombre" },
        { status: 409 }
      )
    }

    const created = await prisma.supplier.create({
      data: {
        accountId: user.accountId,
        name,
        contactName,
        phone,
        email,
        address,
        notes,
        discountPercentBp,
        chargesItbis,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        contactName: created.contactName,
        phone: created.phone,
        email: created.email,
        address: created.address,
        notes: created.notes,
        discountPercentBp: created.discountPercentBp,
        chargesItbis: created.chargesItbis,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error en POST /api/suppliers:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear proveedor" },
      { status: 500 }
    )
  }
}

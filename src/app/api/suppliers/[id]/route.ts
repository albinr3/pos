import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { sanitizePhone, sanitizeString } from "@/lib/sanitize"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/suppliers/:id - Obtener proveedor
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
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        accountId: user.accountId,
        isActive: true,
      },
    })

    if (!supplier) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
      discountPercentBp: supplier.discountPercentBp,
      chargesItbis: supplier.chargesItbis,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    })
  } catch (error: any) {
    console.error("Error en GET /api/suppliers/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener proveedor" },
      { status: 500 }
    )
  }
}

// PUT /api/suppliers/:id - Editar proveedor
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
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    const exists = await prisma.supplier.findFirst({
      where: { id, accountId: user.accountId, isActive: true },
      select: { id: true },
    })
    if (!exists) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    }

    const duplicate = await prisma.supplier.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
        id: { not: id },
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: "Ya existe un proveedor con ese nombre" },
        { status: 409 }
      )
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
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

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      contactName: updated.contactName,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      notes: updated.notes,
      discountPercentBp: updated.discountPercentBp,
      chargesItbis: updated.chargesItbis,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: any) {
    console.error("Error en PUT /api/suppliers/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al editar proveedor" },
      { status: 500 }
    )
  }
}


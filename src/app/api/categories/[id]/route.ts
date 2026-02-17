import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { sanitizeString } from "@/lib/sanitize"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/categories/:id - Obtener categoría
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
    const category = await prisma.category.findFirst({
      where: {
        id,
        accountId: user.accountId,
        isActive: true,
      },
    })

    if (!category) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      id: category.id,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })
  } catch (error: any) {
    console.error("Error en GET /api/categories/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener categoría" },
      { status: 500 }
    )
  }
}

// PUT /api/categories/:id - Editar categoría
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
    const descriptionRaw = body?.description
    const description =
      typeof descriptionRaw === "string" && descriptionRaw.trim()
        ? sanitizeString(descriptionRaw)
        : null

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    const exists = await prisma.category.findFirst({
      where: { id, accountId: user.accountId, isActive: true },
      select: { id: true },
    })
    if (!exists) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 })
    }

    const duplicate = await prisma.category.findFirst({
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
        { error: "Ya existe una categoría con ese nombre" },
        { status: 409 }
      )
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name, description },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: any) {
    console.error("Error en PUT /api/categories/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al editar categoría" },
      { status: 500 }
    )
  }
}


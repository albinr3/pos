import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { sanitizeString } from "@/lib/sanitize"
import { hasPermissionOrLog } from "@/lib/permission-guard"

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
    const categoryId = Number(id)
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "ID de categoría inválido" }, { status: 400 })
    }

    const category = await prisma.category.findFirst({
      where: {
        categoryId,
        accountId: user.accountId,
        isActive: true,
      },
    })

    if (!category) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 })
    }

    return NextResponse.json({
      id: category.categoryId,
      internalId: category.id,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener categoría"
    console.error("Error en GET /api/categories/[id]:", error)
    return NextResponse.json(
      { error: message },
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
    const canManageCategories = await hasPermissionOrLog(user, "canManageCategories", {
      resourceType: "Category",
      details: { endpoint: "/api/categories/[id]", method: "PUT" },
    })
    if (!canManageCategories) {
      return NextResponse.json({ error: "No tienes permiso para gestionar categorias" }, { status: 403 })
    }

    const { id } = await params
    const categoryId = Number(id)
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "ID de categoría inválido" }, { status: 400 })
    }

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
      where: { categoryId, accountId: user.accountId, isActive: true },
      select: { id: true },
    })
    if (!exists) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 })
    }

    const duplicate = await prisma.category.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
        id: { not: exists.id },
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
      where: { id: exists.id },
      data: { name, description },
    })

    return NextResponse.json({
      id: updated.categoryId,
      internalId: updated.id,
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al editar categoría"
    console.error("Error en PUT /api/categories/[id]:", error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}


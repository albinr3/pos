import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { sanitizeString } from "@/lib/sanitize"
import { hasPermissionOrLog } from "@/lib/permission-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/categories - Listar categorías activas
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()

    const categories = await prisma.category.findMany({
      where: {
        accountId: user.accountId,
        isActive: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { categoryId: "asc" },
      take: 200,
    })

    return NextResponse.json({
      data: categories.map((c) => ({
        id: c.categoryId,
        internalId: c.id,
        name: c.name,
        description: c.description,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener categorías"
    console.error("Error en GET /api/categories:", error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

// POST /api/categories - Crear categoría
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageCategories = await hasPermissionOrLog(user, "canManageCategories", {
      resourceType: "Category",
      details: { endpoint: "/api/categories", method: "POST" },
    })
    if (!canManageCategories) {
      return NextResponse.json({ error: "No tienes permiso para gestionar categorias" }, { status: 403 })
    }

    const body = await request.json()
    const name = sanitizeString(String(body?.name || ""))
    const descriptionRaw = body?.description
    const description =
      typeof descriptionRaw === "string" && descriptionRaw.trim()
        ? sanitizeString(descriptionRaw)
        : null

    if (!name) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      )
    }

    const existing = await prisma.category.findFirst({
      where: {
        accountId: user.accountId,
        isActive: true,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una categoría con ese nombre" },
        { status: 409 }
      )
    }

    const created = await prisma.$transaction(async (tx) => {
      const sequence = await tx.categorySequence.upsert({
        where: { accountId: user.accountId },
        update: { lastNumber: { increment: 1 } },
        create: { accountId: user.accountId, lastNumber: 1 },
      })

      return tx.category.create({
        data: {
          accountId: user.accountId,
          categoryId: sequence.lastNumber,
          name,
          description,
        },
      })
    })

    return NextResponse.json(
      {
        id: created.categoryId,
        internalId: created.id,
        name: created.name,
        description: created.description,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear categoría"
    console.error("Error en POST /api/categories:", error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

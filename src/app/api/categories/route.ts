import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"

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
      orderBy: { name: "asc" },
      take: 200,
    })

    return NextResponse.json({
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/categories:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener categorías" },
      { status: 500 }
    )
  }
}

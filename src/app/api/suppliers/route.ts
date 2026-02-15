import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"

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

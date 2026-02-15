import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/products/next-id - Obtener siguiente correlativo de producto
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const [sequence, lastProduct] = await Promise.all([
      prisma.productSequence.findUnique({
        where: { accountId: user.accountId },
        select: { lastNumber: true },
      }),
      prisma.product.findFirst({
        where: { accountId: user.accountId },
        orderBy: { productId: "desc" },
        select: { productId: true },
      }),
    ])

    const baseNumber = Math.max(sequence?.lastNumber ?? 0, lastProduct?.productId ?? 0)
    const nextProductId = baseNumber + 1

    return NextResponse.json({
      nextProductId,
      nextId: nextProductId,
      nextCode: `PROD-${String(nextProductId).padStart(4, "0")}`,
    })
  } catch (error: any) {
    console.error("Error en GET /api/products/next-id:", error)
    return NextResponse.json(
      { error: error.message || "Error obteniendo siguiente ID de producto" },
      { status: 500 }
    )
  }
}

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      )
    }

    const company = await prisma.companySettings.findFirst({ 
      where: { accountId: user.accountId } 
    })
    
    return NextResponse.json({
      name: company?.name || "",
      logoUrl: company?.logoUrl ?? null,
      address: company?.address || "",
      phone: company?.phone || "",
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener configuración de empresa" },
      { status: 500 }
    )
  }
}










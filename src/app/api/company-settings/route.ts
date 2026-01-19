import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const company = await prisma.companySettings.findUnique({ where: { id: "company" } })
    return NextResponse.json({
      name: company?.name ?? "Tejada Auto Adornos",
      logoUrl: company?.logoUrl ?? null,
      address: company?.address ?? "Carretera la Rosa, Moca",
      phone: company?.phone ?? "829-475-1454",
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener configuración de empresa" },
      { status: 500 }
    )
  }
}









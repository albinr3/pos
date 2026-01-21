"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

// Función de diagnóstico para verificar el estado de la base de datos
export async function diagnoseDatabase() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  try {
    // Verificar si existen las columnas de cancelación
    const saleColumns = await prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Sale' 
      AND column_name IN ('cancelledAt', 'cancelledBy')
    `

    // Contar facturas del account
    const totalSales = await prisma.sale.count({
      where: { accountId: user.accountId },
    })

    // Ver las últimas 10 facturas del account
    const lastSales = await prisma.sale.findMany({
      where: { accountId: user.accountId },
      orderBy: { soldAt: "desc" },
      take: 10,
      select: {
        id: true,
        invoiceCode: true,
        soldAt: true,
        totalCents: true,
        cancelledAt: true,
        customer: { select: { name: true } },
      },
    })

    // Verificar estructura de la tabla Sale
    const tableInfo = await prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Sale'
      ORDER BY ordinal_position
    `

    return {
      success: true,
      saleColumns: saleColumns,
      totalSales,
      lastSales,
      tableInfo,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    }
  }
}
















"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

// Función para verificar si una factura existe en la base de datos
export async function checkSaleExists(invoiceCode: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sale = await prisma.sale.findFirst({
    where: { accountId: user.accountId, invoiceCode },
    select: {
      id: true,
      invoiceCode: true,
      soldAt: true,
      totalCents: true,
      cancelledAt: true,
      customer: { select: { name: true } },
    },
  })

  if (!sale) {
    // Buscar en todas las ventas del account para ver si existe con otro código similar
    const allSales = await prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        invoiceCode: { contains: invoiceCode.replace("-", ""), mode: "insensitive" },
      },
      select: {
        invoiceCode: true,
        soldAt: true,
        cancelledAt: true,
      },
      take: 10,
    })

    return {
      exists: false,
      similarCodes: allSales.map((s) => s.invoiceCode),
    }
  }

  return {
    exists: true,
    sale: {
      invoiceCode: sale.invoiceCode,
      soldAt: sale.soldAt,
      totalCents: sale.totalCents,
      cancelledAt: sale.cancelledAt,
      customer: sale.customer?.name || "Cliente general",
    },
  }
}

// Función para listar todas las ventas (incluyendo canceladas) para diagnóstico
export async function getAllSalesForDiagnosis() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.sale.findMany({
    where: { accountId: user.accountId },
    orderBy: { soldAt: "desc" },
    select: {
      id: true,
      invoiceCode: true,
      soldAt: true,
      totalCents: true,
      cancelledAt: true,
      customer: { select: { name: true } },
    },
    take: 100,
  })
}
















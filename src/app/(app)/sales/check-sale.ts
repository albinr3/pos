"use server"

import { prisma } from "@/lib/db"

// Función para verificar si una factura existe en la base de datos
export async function checkSaleExists(invoiceCode: string) {
  const sale = await prisma.sale.findUnique({
    where: { invoiceCode },
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
    // Buscar en todas las ventas para ver si existe con otro código similar
    const allSales = await prisma.sale.findMany({
      where: {
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
      customer: sale.customer?.name || "Cliente Genérico",
    },
  }
}

// Función para listar todas las ventas (incluyendo canceladas) para diagnóstico
export async function getAllSalesForDiagnosis() {
  return prisma.sale.findMany({
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












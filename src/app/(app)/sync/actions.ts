"use server"

import { prisma } from "@/lib/db"
import { Decimal } from "@prisma/client/runtime/library"

function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}

export async function syncProductsToIndexedDB() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { productId: "asc" },
    take: 1000, // Límite razonable para cache
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      stock: true,
      minStock: true,
      priceCents: true, // Asegurar que se seleccione priceCents
      costCents: true,
      itbisRateBp: true,
      saleUnit: true,
      imageUrls: true,
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  // Convertir Decimal a número y Date a string para serialización
  const mapped = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    reference: p.reference,
    stock: decimalToNumber(p.stock),
    minStock: decimalToNumber(p.minStock),
    priceCents: p.priceCents, // El modelo Product usa priceCents
    unitPriceCents: p.priceCents, // Alias para compatibilidad
    costCents: p.costCents,
    itbisRateBp: p.itbisRateBp ?? 1800, // Valor por defecto si no existe
    saleUnit: p.saleUnit,
    imageUrls: p.imageUrls,
    supplier: p.supplier
      ? {
          id: p.supplier.id,
          name: p.supplier.name,
        }
      : null,
    category: p.category
      ? {
          id: p.category.id,
          name: p.category.name,
        }
      : null,
  }))
  
  // Log de depuración: verificar que priceCents está presente
  if (process.env.NODE_ENV === "development") {
    const withoutPrice = mapped.filter((p) => !p.priceCents || p.priceCents === 0)
    if (withoutPrice.length > 0) {
      console.log("[SYNC] Productos sin priceCents al sincronizar:", withoutPrice.length, "de", mapped.length)
      console.log("[SYNC] Ejemplo:", withoutPrice[0]?.name, "priceCents:", withoutPrice[0]?.priceCents)
    } else {
      console.log("[SYNC] Todos los productos tienen priceCents:", mapped.length)
    }
  }
  
  return mapped
}

export async function syncCustomersToIndexedDB() {
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    take: 1000, // Límite razonable para cache
  })

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    cedula: c.cedula,
    province: c.province,
    isGeneric: c.isGeneric,
  }))
}

export async function syncARToIndexedDB() {
  const arItems = await prisma.accountReceivable.findMany({
    where: {
      status: { in: ["PENDIENTE", "PARCIAL"] },
      sale: { cancelledAt: null },
    },
    include: {
      customer: true,
      sale: {
        select: {
          id: true,
          invoiceCode: true,
          totalCents: true,
        },
      },
      payments: {
        where: { cancelledAt: null },
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
        },
      },
    },
    take: 500, // Límite razonable para cache
  })

  return arItems.map((ar) => {
    const totalPaid = ar.payments.reduce((sum, p) => sum + p.amountCents, 0)
    const balanceCents = ar.totalCents - totalPaid

    return {
      id: ar.id,
      saleId: ar.saleId,
      customerId: ar.customerId,
      totalCents: ar.totalCents,
      balanceCents,
      status: ar.status,
      customer: {
        id: ar.customer.id,
        name: ar.customer.name,
        phone: ar.customer.phone,
      },
      sale: {
        id: ar.sale.id,
        invoiceCode: ar.sale.invoiceCode,
        totalCents: ar.sale.totalCents,
      },
    }
  })
}

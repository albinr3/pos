"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { UnitType } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"

export async function listProducts(query?: string) {
  const q = query?.trim()
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { supplier: true },
    orderBy: { productId: "asc" },
    take: 200,
  })
  
  // Convertir Decimal a número y Date a string para serialización
  return products.map((p) => ({
    ...p,
    stock: p.stock instanceof Decimal ? p.stock.toNumber() : Number(p.stock),
    minStock: p.minStock instanceof Decimal ? p.minStock.toNumber() : Number(p.minStock),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
    supplier: p.supplier ? {
      ...p.supplier,
      createdAt: p.supplier.createdAt instanceof Date ? p.supplier.createdAt.toISOString() : p.supplier.createdAt,
      updatedAt: p.supplier.updatedAt instanceof Date ? p.supplier.updatedAt.toISOString() : p.supplier.updatedAt,
    } : null,
  }))
}

export async function upsertProduct(input: {
  id?: string
  name: string
  sku?: string | null
  reference?: string | null
  supplierId?: string | null
  priceCents: number
  costCents: number
  itbisRateBp?: number
  stock: number
  minStock: number
  imageUrls?: string[]
  purchaseUnit: UnitType
  saleUnit: UnitType
}) {
  const name = input.name.trim()
  if (!name) throw new Error("El nombre del producto es requerido")
  if (!input.priceCents || input.priceCents <= 0) throw new Error("El precio de venta es requerido")
  if (!input.costCents || input.costCents < 0) throw new Error("El costo es requerido")
  if (!input.saleUnit) throw new Error("La unidad de venta es requerida")
  if (!input.purchaseUnit) throw new Error("La unidad de compra es requerida")

  const sku = input.sku?.trim() || null
  const reference = input.reference?.trim() || null
  const imageUrls = input.imageUrls || []

  if (input.id) {
    await prisma.product.update({
      where: { id: input.id },
      data: {
        name,
        sku,
        reference,
        supplierId: input.supplierId || null,
        priceCents: input.priceCents,
        costCents: input.costCents,
        itbisRateBp: input.itbisRateBp ?? 1800,
        stock: input.stock,
        minStock: input.minStock,
        imageUrls,
        purchaseUnit: input.purchaseUnit,
        saleUnit: input.saleUnit,
      },
    })
  } else {
    await prisma.product.create({
      data: {
        name,
        sku,
        reference,
        supplierId: input.supplierId || null,
        priceCents: input.priceCents,
        costCents: input.costCents,
        itbisRateBp: input.itbisRateBp ?? 1800,
        stock: input.stock,
        minStock: input.minStock,
        imageUrls,
        purchaseUnit: input.purchaseUnit,
        saleUnit: input.saleUnit,
      },
    })
  }

  revalidatePath("/products")
}

export async function deactivateProduct(productId: string) {
  await prisma.product.update({
    where: { id: productId },
    data: { isActive: false },
  })
  revalidatePath("/products")
}

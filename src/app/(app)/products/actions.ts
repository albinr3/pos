"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function listProducts(query?: string) {
  const q = query?.trim()
  return prisma.product.findMany({
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
}

export async function upsertProduct(input: {
  id?: string
  name: string
  sku?: string | null
  reference?: string | null
  supplierId?: string | null
  priceCents: number
  costCents: number
  stock: number
  minStock: number
}) {
  const name = input.name.trim()
  if (!name) throw new Error("La descripción es requerida")

  const sku = input.sku?.trim() || null
  const reference = input.reference?.trim() || null

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
        stock: input.stock,
        minStock: input.minStock,
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
        stock: input.stock,
        minStock: input.minStock,
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

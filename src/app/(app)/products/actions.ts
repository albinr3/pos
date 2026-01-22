"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { UnitType } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString, sanitizeCode } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"

export async function listProducts(query?: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = query?.trim()
  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
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
    include: { supplier: true, category: true },
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
    category: p.category ? {
      ...p.category,
      createdAt: p.category.createdAt instanceof Date ? p.category.createdAt.toISOString() : p.category.createdAt,
      updatedAt: p.category.updatedAt instanceof Date ? p.category.updatedAt.toISOString() : p.category.updatedAt,
    } : null,
  }))
}

export async function upsertProduct(input: {
  id?: string
  name: string
  sku?: string | null
  reference?: string | null
  supplierId?: string | null
  categoryId?: string | null
  priceCents: number
  costCents: number
  itbisRateBp?: number
  stock: number
  minStock: number
  imageUrls?: string[]
  purchaseUnit: UnitType
  saleUnit: UnitType
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const name = sanitizeString(input.name)
  if (!name) throw new Error("El nombre del producto es requerido")
  if (!input.priceCents || input.priceCents <= 0) throw new Error("El precio de venta es requerido")
  if (!input.costCents || input.costCents < 0) throw new Error("El costo es requerido")
  if (!input.saleUnit) throw new Error("La unidad de venta es requerida")
  if (!input.purchaseUnit) throw new Error("La unidad de compra es requerida")

  const sanitizedSku = input.sku ? sanitizeCode(input.sku) : ""
  const sanitizedReference = input.reference ? sanitizeCode(input.reference) : ""
  const sku = sanitizedSku || null
  const reference = sanitizedReference || null
  const imageUrls = input.imageUrls || []

  if (input.id) {
    // Verificar permiso para editar productos
    if (!user.canEditProducts && user.role !== "ADMIN") {
      throw new Error("No tienes permiso para editar productos")
    }

    // Verificar que el producto pertenece al account
    const existing = await prisma.product.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Producto no encontrado")

    // Verificar permiso para modificar precio si es diferente al original
    const originalPriceCents = Number(existing.priceCents)
    if (input.priceCents !== originalPriceCents) {
      if (!user.canOverridePrice && user.role !== "ADMIN") {
        throw new Error("No tienes permiso para modificar el precio del producto")
      }
    }

    const updated = await prisma.product.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        name,
        sku,
        reference,
        supplierId: input.supplierId || null,
        categoryId: input.categoryId || null,
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
    if (updated.count === 0) throw new Error("Producto no encontrado")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "PRODUCT_EDITED",
      resourceType: "Product",
      resourceId: input.id,
      details: {
        name,
        sku,
        reference,
      },
    })
  } else {
    const created = await prisma.product.create({
      data: {
        accountId: user.accountId,
        name,
        sku,
        reference,
        supplierId: input.supplierId || null,
        categoryId: input.categoryId || null,
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

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "PRODUCT_CREATED",
      resourceType: "Product",
      resourceId: created.id,
      details: {
        name,
        sku,
        reference,
      },
    })
  }

  revalidatePath("/products")
}

export async function deactivateProduct(productId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Verificar que el producto pertenece al account
  const existing = await prisma.product.findFirst({
    where: { id: productId, accountId: user.accountId },
  })
  if (!existing) throw new Error("Producto no encontrado")

  const updated = await prisma.product.updateMany({
    where: { id: productId, accountId: user.accountId },
    data: { isActive: false },
  })
  if (updated.count === 0) throw new Error("Producto no encontrado")

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "PRODUCT_DELETED",
    resourceType: "Product",
    resourceId: productId,
  })
  revalidatePath("/products")
}

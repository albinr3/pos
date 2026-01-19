"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { Decimal } from "@prisma/client/runtime/library"

// Calcular costo neto: (costo - descuento) * 1.18 (ITBIS)
function calculateNetCost(unitCostCents: number, discountPercentBp: number): number {
  // discountPercentBp está en basis points (1000 = 10%)
  const discountRate = discountPercentBp / 10000
  const costAfterDiscount = unitCostCents * (1 - discountRate)
  const itbisRate = 0.18 // 18% ITBIS
  const netCost = costAfterDiscount * (1 + itbisRate)
  return Math.round(netCost)
}

export async function listPurchases() {
  return prisma.purchase.findMany({
    orderBy: { purchasedAt: "desc" },
    include: { items: { include: { product: true } } },
    take: 50,
  })
}

export async function listAllPurchases() {
  return prisma.purchase.findMany({
    orderBy: { purchasedAt: "desc" },
    include: {
      items: { include: { product: true } },
      cancelledUser: { select: { name: true, username: true } },
    },
    take: 500,
  })
}

export async function createPurchase(input: {
  supplierId?: string | null
  supplierName?: string | null
  notes?: string | null
  items: { productId: string; qty: number; unitCostCents: number; discountPercentBp?: number }[]
  username: string
  updateProductCost?: boolean
}) {
  if (!input.items.length) throw new Error("La compra no tiene productos")

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username: input.username } })
    if (!user) throw new Error("Usuario inválido")

    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
    }

    // Calcular items con descuento e ITBIS
    const itemsWithNetCost = input.items.map((item) => {
      // Usar descuento del item o del proveedor
      const discountBp = item.discountPercentBp ?? supplier?.discountPercentBp ?? 0
      const netCostCents = calculateNetCost(item.unitCostCents, discountBp)
      return {
        ...item,
        discountPercentBp: discountBp,
        netCostCents,
        lineTotalCents: netCostCents * item.qty,
      }
    })

    const totalCents = itemsWithNetCost.reduce((s, i) => s + i.lineTotalCents, 0)

    const purchase = await tx.purchase.create({
      data: {
        supplierName: input.supplierName?.trim() || supplier?.name || null,
        notes: input.notes?.trim() || null,
        userId: user.id,
        totalCents,
        items: {
          create: itemsWithNetCost.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitCostCents: i.unitCostCents,
            discountPercentBp: i.discountPercentBp,
            netCostCents: i.netCostCents,
            lineTotalCents: i.lineTotalCents,
          })),
        },
      },
      select: { id: true },
    })

    for (const item of itemsWithNetCost) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.qty },
          // Actualizar con el costo neto (después de descuento e ITBIS)
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
        },
      })
    }

    revalidatePath("/purchases")
    revalidatePath("/products")
    revalidatePath("/dashboard")

    return purchase
  })
}

export async function searchProductsForPurchase(query: string) {
  const q = query.trim()
  if (!q) return []

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, sku: true, reference: true, costCents: true, stock: true, purchaseUnit: true, saleUnit: true },
    orderBy: { name: "asc" },
    take: 20,
  })
  
  // Convertir Decimal a número
  return products.map((p) => ({
    ...p,
    stock: p.stock instanceof Decimal ? p.stock.toNumber() : Number(p.stock),
  }))
}

export async function getPurchaseById(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, costCents: true, stock: true, purchaseUnit: true, saleUnit: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
  })
  
  if (!purchase) return null
  
  // Convertir Decimal a número en items
  return {
    ...purchase,
    items: purchase.items.map((item) => ({
      ...item,
      product: {
        ...item.product,
        stock: item.product.stock instanceof Decimal ? item.product.stock.toNumber() : Number(item.product.stock),
      },
    })),
  }
}

export async function cancelPurchase(id: string, username: string) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!purchase) throw new Error("Compra no encontrada")
    if (purchase.cancelledAt) throw new Error("Esta compra ya está cancelada")

    const user = await tx.user.findUnique({ where: { username } })
    if (!user) throw new Error("Usuario inválido")

    // Revertir el stock que se agregó
    for (const item of purchase.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.qty },
        },
      })
    }

    // Marcar como cancelada
    await tx.purchase.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: user.id,
      },
    })

    revalidatePath("/purchases")
    revalidatePath("/purchases/list")
    revalidatePath("/products")
    revalidatePath("/dashboard")
    revalidatePath("/reports/profit")
  })
}

export async function updatePurchase(input: {
  id: string
  supplierId?: string | null
  supplierName?: string | null
  notes?: string | null
  items: { productId: string; qty: number; unitCostCents: number; discountPercentBp?: number }[]
  updateProductCost?: boolean
}) {
  if (!input.items.length) throw new Error("La compra no tiene productos")

  return prisma.$transaction(async (tx) => {
    const existingPurchase = await tx.purchase.findUnique({
      where: { id: input.id },
      include: { items: true },
    })

    if (!existingPurchase) throw new Error("Compra no encontrada")
    if (existingPurchase.cancelledAt) throw new Error("No se puede editar una compra cancelada")

    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
    }

    // Revertir el stock de los items anteriores
    for (const oldItem of existingPurchase.items) {
      await tx.product.update({
        where: { id: oldItem.productId },
        data: {
          stock: { decrement: oldItem.qty },
        },
      })
    }

    // Eliminar items anteriores
    await tx.purchaseItem.deleteMany({
      where: { purchaseId: input.id },
    })

    // Calcular items con descuento e ITBIS
    const itemsWithNetCost = input.items.map((item) => {
      const discountBp = item.discountPercentBp ?? supplier?.discountPercentBp ?? 0
      const netCostCents = calculateNetCost(item.unitCostCents, discountBp)
      return {
        ...item,
        discountPercentBp: discountBp,
        netCostCents,
        lineTotalCents: netCostCents * item.qty,
      }
    })

    // Calcular nuevo total
    const totalCents = itemsWithNetCost.reduce((s, i) => s + i.lineTotalCents, 0)

    // Actualizar la compra
    await tx.purchase.update({
      where: { id: input.id },
      data: {
        supplierName: input.supplierName?.trim() || supplier?.name || null,
        notes: input.notes?.trim() || null,
        totalCents,
        items: {
          create: itemsWithNetCost.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitCostCents: i.unitCostCents,
            discountPercentBp: i.discountPercentBp,
            netCostCents: i.netCostCents,
            lineTotalCents: i.lineTotalCents,
          })),
        },
      },
    })

    // Aplicar nuevo stock y costo
    for (const item of itemsWithNetCost) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.qty },
          // Actualizar con el costo neto (después de descuento e ITBIS)
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
        },
      })
    }

    revalidatePath("/purchases")
    revalidatePath("/products")
    revalidatePath("/dashboard")
    revalidatePath("/reports/profit")
  })
}
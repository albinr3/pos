"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser } from "@/lib/auth"

// Calcular costo neto: (costo - descuento) * 1.18 (ITBIS)
function calculateNetCost(unitCostCents: number, discountPercentBp: number): number {
  // discountPercentBp está en basis points (1000 = 10%)
  const discountRate = discountPercentBp / 10000
  const costAfterDiscount = unitCostCents * (1 - discountRate)
  const itbisRate = 0.18 // 18% ITBIS
  const netCost = costAfterDiscount * (1 + itbisRate)
  return Math.round(netCost)
}

function toNumber(value: Decimal | number) {
  return value instanceof Decimal ? value.toNumber() : Number(value)
}

function normalizePurchase<T extends { items: { qty: Decimal | number; product?: { stock?: Decimal | number; minStock?: Decimal | number } }[] }>(
  purchase: T
): T {
  return {
    ...purchase,
    items: purchase.items.map((item) => ({
      ...item,
      qty: toNumber(item.qty),
      product: item.product
        ? {
            ...item.product,
            stock: item.product.stock === undefined ? item.product.stock : toNumber(item.product.stock),
            minStock: item.product.minStock === undefined ? item.product.minStock : toNumber(item.product.minStock),
          }
        : item.product,
    })),
  } as T
}

export async function listPurchases() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const purchases = await prisma.purchase.findMany({
    where: { accountId: user.accountId },
    orderBy: { purchasedAt: "desc" },
    include: { items: { include: { product: true } } },
    take: 50,
  })

  return purchases.map(normalizePurchase)
}

export async function listAllPurchases() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const purchases = await prisma.purchase.findMany({
    where: { accountId: user.accountId },
    orderBy: { purchasedAt: "desc" },
    include: {
      items: { include: { product: true } },
      cancelledUser: { select: { name: true, username: true } },
    },
    take: 500,
  })

  return purchases.map(normalizePurchase)
}

export async function createPurchase(input: {
  supplierId?: string | null
  supplierName?: string | null
  notes?: string | null
  items: { productId: string; qty: number; unitCostCents: number; discountPercentBp?: number }[]
  updateProductCost?: boolean
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La compra no tiene productos")

  return prisma.$transaction(async (tx) => {

    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findFirst({ 
        where: { accountId: currentUser.accountId, id: input.supplierId } 
      })
    }

    // Verificar que todos los productos pertenecen al account
    const products = await tx.product.findMany({
      where: { accountId: currentUser.accountId, id: { in: input.items.map(i => i.productId) } },
      select: { id: true },
    })
    if (products.length !== input.items.length) {
      throw new Error("Algunos productos no existen o no pertenecen a esta cuenta")
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
        accountId: currentUser.accountId,
        supplierName: input.supplierName?.trim() || supplier?.name || null,
        notes: input.notes?.trim() || null,
        userId: currentUser.id,
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
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: {
          stock: { increment: item.qty },
          // Actualizar con el costo neto (después de descuento e ITBIS)
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    revalidatePath("/purchases")
    revalidatePath("/products")
    revalidatePath("/dashboard")

    return purchase
  })
}

export async function searchProductsForPurchase(query: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = query.trim()
  if (!q) return []

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
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
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const purchase = await prisma.purchase.findFirst({
    where: { accountId: user.accountId, id },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, costCents: true, stock: true, minStock: true, purchaseUnit: true, saleUnit: true },
          },
        },
      },
      user: {
        select: { name: true, username: true },
      },
    },
  })
  
  if (!purchase) return null
  
  // Convertir Decimal a numero en items
  return {
    ...purchase,
    items: purchase.items.map((item) => ({
      ...item,
      qty: item.qty instanceof Decimal ? item.qty.toNumber() : Number(item.qty),
      product: {
        ...item.product,
        stock: item.product.stock instanceof Decimal ? item.product.stock.toNumber() : Number(item.product.stock),
        minStock: item.product.minStock instanceof Decimal ? item.product.minStock.toNumber() : Number(item.product.minStock),
      },
    })),
  }
}

export async function cancelPurchase(id: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { accountId: currentUser.accountId, id },
      include: { items: true },
    })

    if (!purchase) throw new Error("Compra no encontrada")
    if (purchase.cancelledAt) throw new Error("Esta compra ya está cancelada")

    // Revertir el stock que se agregó
    for (const item of purchase.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: {
          stock: { decrement: item.qty },
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Marcar como cancelada
    const cancelled = await tx.purchase.updateMany({
      where: { id, accountId: currentUser.accountId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: currentUser.id,
      },
    })
    if (cancelled.count === 0) throw new Error("Compra no encontrada")

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
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La compra no tiene productos")

  return prisma.$transaction(async (tx) => {
    const existingPurchase = await tx.purchase.findFirst({
      where: { accountId: currentUser.accountId, id: input.id },
      include: { items: true },
    })

    if (!existingPurchase) throw new Error("Compra no encontrada")
    if (existingPurchase.cancelledAt) throw new Error("No se puede editar una compra cancelada")

    // Obtener el proveedor si se proporcionó supplierId
    let supplier = null
    if (input.supplierId) {
      supplier = await tx.supplier.findFirst({ 
        where: { accountId: currentUser.accountId, id: input.supplierId } 
      })
    }

    // Verificar que todos los productos pertenecen al account
    const products = await tx.product.findMany({
      where: { accountId: currentUser.accountId, id: { in: input.items.map(i => i.productId) } },
      select: { id: true },
    })
    if (products.length !== input.items.length) {
      throw new Error("Algunos productos no existen o no pertenecen a esta cuenta")
    }

    // Revertir el stock de los items anteriores
    for (const oldItem of existingPurchase.items) {
      const updated = await tx.product.updateMany({
        where: { id: oldItem.productId, accountId: currentUser.accountId },
        data: {
          stock: { decrement: oldItem.qty },
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Eliminar items anteriores
    await tx.purchaseItem.deleteMany({
      where: {
        purchaseId: input.id,
        purchase: { accountId: currentUser.accountId },
      },
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
    const updatedPurchase = await tx.purchase.updateMany({
      where: { id: input.id, accountId: currentUser.accountId },
      data: {
        supplierName: input.supplierName?.trim() || supplier?.name || null,
        notes: input.notes?.trim() || null,
        totalCents,
      },
    })
    if (updatedPurchase.count === 0) throw new Error("Compra no encontrada")

    await tx.purchaseItem.createMany({
      data: itemsWithNetCost.map((i) => ({
        purchaseId: input.id,
        productId: i.productId,
        qty: i.qty,
        unitCostCents: i.unitCostCents,
        discountPercentBp: i.discountPercentBp,
        netCostCents: i.netCostCents,
        lineTotalCents: i.lineTotalCents,
      })),
    })

    // Aplicar nuevo stock y costo
    for (const item of itemsWithNetCost) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: {
          stock: { increment: item.qty },
          // Actualizar con el costo neto (después de descuento e ITBIS)
          ...(input.updateProductCost ? { costCents: item.netCostCents } : {}),
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    revalidatePath("/purchases")
    revalidatePath("/products")
    revalidatePath("/dashboard")
    revalidatePath("/reports/profit")
  })
}

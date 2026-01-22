"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded } from "@/lib/money"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser } from "@/lib/auth"

function returnCode(number: number): string {
  return `DEV-${String(number).padStart(5, "0")}`
}

function toNumber(value: Decimal | number) {
  return value instanceof Decimal ? value.toNumber() : Number(value)
}

export async function listReturns() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const returnsList = await prisma.return.findMany({
    where: { accountId: user.accountId },
    orderBy: { returnedAt: "desc" },
    include: {
      sale: {
        include: {
          customer: true,
        },
      },
      user: {
        select: {
          name: true,
          username: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              reference: true,
              saleUnit: true,
            },
          },
        },
      },
    },
    take: 500,
  })

  return returnsList.map((r) => ({
    ...r,
    items: r.items.map((item) => ({
      ...item,
      qty: toNumber(item.qty),
    })),
  }))
}

export async function getReturnById(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const returnRecord = await prisma.return.findFirst({
    where: { accountId: user.accountId, id },
    include: {
      sale: {
        include: {
          customer: true,
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  reference: true,
                  priceCents: true,
                  stock: true,
                  saleUnit: true,
                },
              },
            },
          },
        },
      },
      user: {
        select: {
          name: true,
          username: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              reference: true,
              saleUnit: true,
            },
          },
          saleItem: true,
        },
      },
    },
  })

  if (!returnRecord) return null

  return {
    ...returnRecord,
    sale: returnRecord.sale ? {
      ...returnRecord.sale,
      items: returnRecord.sale.items.map((item) => ({
        ...item,
        qty: toNumber(item.qty),
        product: {
          ...item.product,
          stock: item.product.stock === undefined ? item.product.stock : toNumber(item.product.stock),
        },
      })),
    } : returnRecord.sale,
    items: returnRecord.items.map((item) => ({
      ...item,
      qty: toNumber(item.qty),
      saleItem: item.saleItem ? {
        ...item.saleItem,
        qty: toNumber(item.saleItem.qty),
      } : item.saleItem,
    })),
  }
}

export async function getSaleForReturn(saleId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sale = await prisma.sale.findFirst({
    where: { accountId: user.accountId, id: saleId },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              reference: true,
              priceCents: true,
              saleUnit: true,
            },
          },
        },
      },
      returns: {
        where: {
          cancelledAt: null,
        },
        include: {
          items: true,
        },
      },
    },
  })

  if (!sale) return null
  if (sale.cancelledAt) return null

  // Calcular cantidades ya devueltas por item
  const returnedQtys = new Map<string, number>()
  for (const ret of sale.returns) {
    for (const item of ret.items) {
      const current = returnedQtys.get(item.saleItemId) ?? 0
      returnedQtys.set(item.saleItemId, current + Number(item.qty))
    }
  }

  // Agregar informacion de cantidades disponibles para devolver
  const itemsWithAvailable = sale.items.map((item) => {
    const returnedQty = returnedQtys.get(item.id) ?? 0
    const availableQty = toNumber(item.qty) - returnedQty
    return {
      ...item,
      qty: toNumber(item.qty),
      returnedQty,
      availableQty,
    }
  })

  return {
    ...sale,
    items: itemsWithAvailable,
  }
}

type ReturnItemInput = {
  saleItemId: string
  productId: string
  qty: number
  unitPriceCents: number
}

export async function createReturn(input: {
  saleId: string
  items: ReturnItemInput[]
  notes?: string | null
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La devolución no tiene productos.")

  const dbUser = await prisma.user.findFirst({ 
    where: { accountId: currentUser.accountId, id: currentUser.id } 
  })
  if (!dbUser) throw new Error("Usuario inválido")

  const settings = await prisma.companySettings.findFirst({ where: { accountId: currentUser.accountId } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {
    // Verificar que la venta existe, pertenece al account y no está cancelada
    const sale = await tx.sale.findFirst({
      where: { accountId: currentUser.accountId, id: input.saleId },
      include: {
        items: true,
        returns: {
          where: { cancelledAt: null },
          include: { items: true },
        },
      },
    })

    if (!sale) throw new Error("Venta no encontrada")
    if (sale.cancelledAt) throw new Error("No se puede devolver una venta cancelada")

    // Calcular cantidades ya devueltas
    const returnedQtys = new Map<string, number>()
    for (const ret of sale.returns) {
      for (const item of ret.items) {
        const current = returnedQtys.get(item.saleItemId) ?? 0
        returnedQtys.set(item.saleItemId, current + Number(item.qty))
      }
    }

    // Validar items
    const saleItemsById = new Map(sale.items.map((item) => [item.id, item]))
    for (const item of input.items) {
      const saleItem = saleItemsById.get(item.saleItemId)
      if (!saleItem) throw new Error("Item de venta no encontrado")
      if (saleItem.productId !== item.productId) throw new Error("Producto no coincide con el item de venta")

      const returnedQty = returnedQtys.get(item.saleItemId) ?? 0
      const availableQty = Number(saleItem.qty) - returnedQty
      if (item.qty > availableQty) {
        throw new Error(`No se puede devolver más de ${availableQty} unidades`)
      }
      if (item.qty <= 0) {
        throw new Error("La cantidad devuelta debe ser mayor a 0")
      }
    }

    // Secuencia de devolución por account
    const seq = await tx.returnSequence.upsert({
      where: { accountId: currentUser.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: currentUser.accountId, lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = returnCode(number)

    // Calcular totales
    const totalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(totalCents, itbisRateBp)

    // Crear devolución
    const returnRecord = await tx.return.create({
      data: {
        accountId: currentUser.accountId,
        returnNumber: number,
        returnCode: code,
        saleId: input.saleId,
        userId: dbUser.id,
        subtotalCents,
        itbisCents,
        totalCents,
        notes: input.notes?.trim() || null,
        items: {
          create: input.items.map((i) => ({
            saleItemId: i.saleItemId,
            productId: i.productId,
            qty: i.qty,
            unitPriceCents: i.unitPriceCents,
            lineTotalCents: i.unitPriceCents * i.qty,
          })),
        },
      },
      select: { id: true, returnCode: true },
    })

    // Incrementar stock
    for (const item of input.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: { stock: { increment: item.qty } },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Si la venta era a crédito, reducir el balance de la cuenta por cobrar
    if (sale.type === "CREDITO") {
      const ar = await tx.accountReceivable.findFirst({
        where: {
          saleId: sale.id,
          sale: { accountId: currentUser.accountId },
        },
        include: { payments: { where: { cancelledAt: null } } },
      })

      if (ar) {
        const totalPaid = ar.payments.reduce((sum, p) => sum + p.amountCents, 0)
        const newBalance = Math.max(0, ar.totalCents - totalCents - totalPaid)
        const newStatus =
          newBalance === 0 ? "PAGADA" : newBalance < ar.totalCents ? "PARCIAL" : "PENDIENTE"

        const updatedAr = await tx.accountReceivable.updateMany({
          where: { id: ar.id, sale: { accountId: currentUser.accountId } },
          data: {
            balanceCents: newBalance,
            status: newStatus,
          },
        })
        if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")
      }
    }

    revalidatePath("/returns")
    revalidatePath("/returns/list")
    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/products")

    return returnRecord
  })
}

export async function cancelReturn(id: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  const dbUser = await prisma.user.findFirst({ 
    where: { accountId: currentUser.accountId, id: currentUser.id } 
  })
  if (!dbUser) throw new Error("Usuario inválido")

  // Verificar permiso para cancelar devoluciones
  if (!dbUser.canCancelReturns && dbUser.role !== "ADMIN") {
    throw new Error("No tienes permiso para cancelar devoluciones")
  }

  return prisma.$transaction(async (tx) => {
    const returnRecord = await tx.return.findFirst({
      where: { accountId: currentUser.accountId, id },
      include: {
        items: true,
        sale: {
          include: {
            ar: true,
          },
        },
      },
    })

    if (!returnRecord) throw new Error("Devolución no encontrada")
    if (returnRecord.cancelledAt) throw new Error("Esta devolución ya está cancelada")

    // Revertir el stock que se incrementó
    for (const item of returnRecord.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: currentUser.accountId },
        data: { stock: { decrement: item.qty } },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Si la venta era a crédito, restaurar el balance de la cuenta por cobrar
    if (returnRecord.sale.type === "CREDITO" && returnRecord.sale.ar) {
      const ar = await tx.accountReceivable.findFirst({
        where: {
          saleId: returnRecord.sale.id,
          sale: { accountId: currentUser.accountId },
        },
        include: { payments: { where: { cancelledAt: null } } },
      })

      if (ar) {
        const totalPaid = ar.payments.reduce((sum, p) => sum + p.amountCents, 0)
        const newBalance = Math.min(ar.totalCents, ar.totalCents - totalPaid + returnRecord.totalCents)
        const newStatus =
          newBalance === 0 ? "PAGADA" : newBalance < ar.totalCents ? "PARCIAL" : "PENDIENTE"

        const updatedAr = await tx.accountReceivable.updateMany({
          where: { id: ar.id, sale: { accountId: currentUser.accountId } },
          data: {
            balanceCents: newBalance,
            status: newStatus,
          },
        })
        if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")
      }
    }

    // Marcar como cancelada
    const cancelled = await tx.return.updateMany({
      where: { id, accountId: currentUser.accountId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: dbUser.id,
      },
    })
    if (cancelled.count === 0) throw new Error("Devolución no encontrada")

    revalidatePath("/returns")
    revalidatePath("/returns/list")
    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/products")
  })
}

export async function searchSalesForReturn(query: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = query.trim()
  if (!q) return []

  const sales = await prisma.sale.findMany({
    where: {
      accountId: user.accountId,
      cancelledAt: null,
      OR: [
        { invoiceCode: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: {
      customer: true,
    },
    orderBy: { soldAt: "desc" },
    take: 20,
  })

  return sales
}














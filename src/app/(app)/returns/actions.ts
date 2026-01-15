"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded } from "@/lib/money"
import { getCurrentUserStub } from "@/lib/auth-stub"

function returnCode(number: number): string {
  return `DEV-${String(number).padStart(5, "0")}`
}

export async function listReturns() {
  return prisma.return.findMany({
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
            },
          },
        },
      },
    },
    take: 500,
  })
}

export async function getReturnById(id: string) {
  return prisma.return.findUnique({
    where: { id },
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
            },
          },
          saleItem: true,
        },
      },
    },
  })
}

export async function getSaleForReturn(saleId: string) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
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
      returnedQtys.set(item.saleItemId, current + item.qty)
    }
  }

  // Agregar información de cantidades disponibles para devolver
  const itemsWithAvailable = sale.items.map((item) => {
    const returnedQty = returnedQtys.get(item.id) ?? 0
    const availableQty = item.qty - returnedQty
    return {
      ...item,
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
  if (!input.items.length) throw new Error("La devolución no tiene productos.")

  const user = getCurrentUserStub()
  const dbUser = await prisma.user.findUnique({ where: { username: user.username } })
  if (!dbUser) throw new Error("Usuario inválido")

  const settings = await prisma.companySettings.findUnique({ where: { id: "company" } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {
    // Verificar que la venta existe y no está cancelada
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
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
        returnedQtys.set(item.saleItemId, current + item.qty)
      }
    }

    // Validar items
    const saleItemsById = new Map(sale.items.map((item) => [item.id, item]))
    for (const item of input.items) {
      const saleItem = saleItemsById.get(item.saleItemId)
      if (!saleItem) throw new Error("Item de venta no encontrado")
      if (saleItem.productId !== item.productId) throw new Error("Producto no coincide con el item de venta")

      const returnedQty = returnedQtys.get(item.saleItemId) ?? 0
      const availableQty = saleItem.qty - returnedQty
      if (item.qty > availableQty) {
        throw new Error(`No se puede devolver más de ${availableQty} unidades de ${saleItem.product.name}`)
      }
      if (item.qty <= 0) {
        throw new Error("La cantidad devuelta debe ser mayor a 0")
      }
    }

    // Secuencia de devolución
    const seq = await tx.returnSequence.upsert({
      where: { id: "main" },
      update: { lastNumber: { increment: 1 } },
      create: { id: "main", lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = returnCode(number)

    // Calcular totales
    const totalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(totalCents, itbisRateBp)

    // Crear devolución
    const returnRecord = await tx.return.create({
      data: {
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
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.qty } },
      })
    }

    // Si la venta era a crédito, reducir el balance de la cuenta por cobrar
    if (sale.type === "CREDITO" && sale.ar) {
      const ar = await tx.accountReceivable.findUnique({
        where: { saleId: sale.id },
        include: { payments: { where: { cancelledAt: null } } },
      })

      if (ar) {
        const totalPaid = ar.payments.reduce((sum, p) => sum + p.amountCents, 0)
        const newBalance = Math.max(0, ar.totalCents - totalCents - totalPaid)
        const newStatus =
          newBalance === 0 ? "PAGADA" : newBalance < ar.totalCents ? "PARCIAL" : "PENDIENTE"

        await tx.accountReceivable.update({
          where: { id: ar.id },
          data: {
            balanceCents: newBalance,
            status: newStatus,
          },
        })
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
  const user = getCurrentUserStub()
  const dbUser = await prisma.user.findUnique({ where: { username: user.username } })
  if (!dbUser) throw new Error("Usuario inválido")

  return prisma.$transaction(async (tx) => {
    const returnRecord = await tx.return.findUnique({
      where: { id },
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
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.qty } },
      })
    }

    // Si la venta era a crédito, restaurar el balance de la cuenta por cobrar
    if (returnRecord.sale.type === "CREDITO" && returnRecord.sale.ar) {
      const ar = await tx.accountReceivable.findUnique({
        where: { saleId: returnRecord.sale.id },
        include: { payments: { where: { cancelledAt: null } } },
      })

      if (ar) {
        const totalPaid = ar.payments.reduce((sum, p) => sum + p.amountCents, 0)
        const newBalance = Math.min(ar.totalCents, ar.totalCents - totalPaid + returnRecord.totalCents)
        const newStatus =
          newBalance === 0 ? "PAGADA" : newBalance < ar.totalCents ? "PARCIAL" : "PENDIENTE"

        await tx.accountReceivable.update({
          where: { id: ar.id },
          data: {
            balanceCents: newBalance,
            status: newStatus,
          },
        })
      }
    }

    // Marcar como cancelada
    await tx.return.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: dbUser.id,
      },
    })

    revalidatePath("/returns")
    revalidatePath("/returns/list")
    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/products")
  })
}

export async function searchSalesForReturn(query: string) {
  const q = query.trim()
  if (!q) return []

  const sales = await prisma.sale.findMany({
    where: {
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










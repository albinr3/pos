"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded, invoiceCode } from "@/lib/money"
import { SaleType, PaymentMethod } from "@prisma/client"

export async function searchProducts(query: string) {
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
    orderBy: { name: "asc" },
    take: 20,
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      stock: true,
    },
  })

  return products
}

export async function listCustomers() {
  return prisma.customer.findMany({
    where: { isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isGeneric: true },
    take: 50,
  })
}

export async function listSales() {
  return prisma.sale.findMany({
    orderBy: { soldAt: "desc" },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { name: true },
          },
        },
      },
      cancelledUser: { select: { name: true, username: true } },
    },
    take: 500, // Aumentado para mostrar más facturas
  })
}

export async function getSaleByInvoiceCode(invoiceCode: string) {
  return prisma.sale.findUnique({
    where: { invoiceCode },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: { name: true },
          },
        },
      },
      cancelledUser: { select: { name: true, username: true } },
    },
  })
}

type CartItemInput = {
  productId: string
  qty: number
  unitPriceCents: number
  wasPriceOverridden: boolean
}

export async function createSale(input: {
  customerId: string | null
  type: SaleType
  paymentMethod?: PaymentMethod | null
  items: CartItemInput[]
  shippingCents?: number
  // TODO: replace with real session
  username: string
}) {
  if (!input.items.length) throw new Error("La venta no tiene productos.")

  const settings = await prisma.companySettings.findUnique({ where: { id: "company" } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800
  const allowNegativeStock = settings?.allowNegativeStock ?? false

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username: input.username } })
    if (!user) throw new Error("Usuario inválido")

    // Invoice sequence
    const seq = await tx.invoiceSequence.upsert({
      where: { series: "A" },
      update: { lastNumber: { increment: 1 } },
      create: { series: "A", lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = invoiceCode("A", number)

    // Load products to validate stock and keep canonical data
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      select: { id: true, priceCents: true, stock: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en el carrito.")
      if (!allowNegativeStock && p.stock < item.qty) {
        throw new Error("Stock insuficiente para completar la venta.")
      }
    }

    const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    const sale = await tx.sale.create({
      data: {
        invoiceSeries: "A",
        invoiceNumber: number,
        invoiceCode: code,
        type: input.type,
        paymentMethod: input.type === SaleType.CONTADO ? input.paymentMethod : null,
        customerId: input.customerId || null,
        userId: user.id,
        subtotalCents,
        itbisCents,
        shippingCents,
        totalCents,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitPriceCents: i.unitPriceCents,
            wasPriceOverridden: i.wasPriceOverridden,
            lineTotalCents: i.unitPriceCents * i.qty,
          })),
        },
      },
      select: { id: true, invoiceCode: true, type: true },
    })

    // Update stock
    for (const item of input.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.qty } },
      })
    }

    // If credit: create AR
    if (input.type === SaleType.CREDITO) {
      const customerId = input.customerId
      if (!customerId) throw new Error("Para crédito debes seleccionar un cliente.")
      await tx.accountReceivable.create({
        data: {
          saleId: sale.id,
          customerId,
          totalCents,
          balanceCents: totalCents,
          status: "PENDIENTE",
        },
      })
    }

    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")

    return sale
  })
}

export async function getSaleById(id: string) {
  return prisma.sale.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, priceCents: true, stock: true },
          },
        },
      },
      customer: true,
      user: {
        select: { name: true, username: true },
      },
      ar: true,
    },
  })
}

export async function cancelSale(id: string, username: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id },
      include: {
        items: true,
        ar: true,
      },
    })

    if (!sale) throw new Error("Venta no encontrada")
    if (sale.cancelledAt) throw new Error("Esta venta ya está cancelada")

    const user = await tx.user.findUnique({ where: { username } })
    if (!user) throw new Error("Usuario inválido")

    // Si tiene cuenta por cobrar, verificar que no tenga pagos no cancelados
    if (sale.ar) {
      const activePayments = await tx.payment.count({
        where: {
          arId: sale.ar.id,
          cancelledAt: null,
        },
      })
      if (activePayments > 0) {
        throw new Error("No se puede cancelar una venta a crédito que ya tiene pagos registrados")
      }
    }

    // Revertir el stock que se descontó
    for (const item of sale.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.qty },
        },
      })
    }

    // Marcar como cancelada
    await tx.sale.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: user.id,
      },
    })

    revalidatePath("/sales")
    revalidatePath("/sales/list")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/reports/sales")
    revalidatePath("/reports/profit")
  })
}

export async function updateSale(input: {
  id: string
  customerId: string | null
  type: SaleType
  paymentMethod?: PaymentMethod | null
  items: CartItemInput[]
}) {
  if (!input.items.length) throw new Error("La venta no tiene productos.")

  const settings = await prisma.companySettings.findUnique({ where: { id: "company" } })
  const itbisRateBp = settings?.itbisRateBp ?? 1800
  const allowNegativeStock = settings?.allowNegativeStock ?? false

  return prisma.$transaction(async (tx) => {
    const existingSale = await tx.sale.findUnique({
      where: { id: input.id },
      include: {
        items: true,
        ar: true,
      },
    })

    if (!existingSale) throw new Error("Venta no encontrada")
    if (existingSale.cancelledAt) throw new Error("No se puede editar una venta cancelada")

    // Si tiene cuenta por cobrar, verificar que no tenga pagos no cancelados
    if (existingSale.ar) {
      const activePayments = await tx.payment.count({
        where: {
          arId: existingSale.ar.id,
          cancelledAt: null,
        },
      })
      if (activePayments > 0) {
        throw new Error("No se puede editar una venta a crédito que ya tiene pagos registrados")
      }
    }

    // Revertir el stock de los items anteriores
    for (const oldItem of existingSale.items) {
      await tx.product.update({
        where: { id: oldItem.productId },
        data: {
          stock: { increment: oldItem.qty },
        },
      })
    }

    // Validar productos nuevos
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      select: { id: true, priceCents: true, stock: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en el carrito.")
      if (!allowNegativeStock && p.stock < item.qty) {
        throw new Error("Stock insuficiente para completar la venta.")
      }
    }

    // Eliminar items anteriores
    await tx.saleItem.deleteMany({
      where: { saleId: input.id },
    })

    // Calcular nuevos totales
    const totalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(totalCents, itbisRateBp)

    // Actualizar la venta
    await tx.sale.update({
      where: { id: input.id },
      data: {
        type: input.type,
        paymentMethod: input.type === SaleType.CONTADO ? input.paymentMethod : null,
        customerId: input.customerId || null,
        subtotalCents,
        itbisCents,
        totalCents,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            unitPriceCents: i.unitPriceCents,
            wasPriceOverridden: i.wasPriceOverridden,
            lineTotalCents: i.unitPriceCents * i.qty,
          })),
        },
      },
    })

    // Aplicar nuevo stock
    for (const item of input.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.qty },
        },
      })
    }

    // Actualizar o crear cuenta por cobrar si es crédito
    if (input.type === SaleType.CREDITO) {
      const customerId = input.customerId
      if (!customerId) throw new Error("Para crédito debes seleccionar un cliente.")

      if (existingSale.ar) {
        await tx.accountReceivable.update({
          where: { id: existingSale.ar.id },
          data: {
            customerId,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
          },
        })
      } else {
        await tx.accountReceivable.create({
          data: {
            saleId: input.id,
            customerId,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
          },
        })
      }
    } else if (existingSale.ar) {
      // Si cambió de crédito a contado, eliminar cuenta por cobrar
      await tx.accountReceivable.delete({
        where: { id: existingSale.ar.id },
      })
    }

    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/reports/sales")
    revalidatePath("/reports/profit")
  })
}
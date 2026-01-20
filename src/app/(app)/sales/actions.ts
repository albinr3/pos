"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded, invoiceCode } from "@/lib/money"
import { SaleType, PaymentMethod } from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"

// Helper para convertir Decimal a número
function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}

export async function searchProducts(query: string) {
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
    orderBy: { name: "asc" },
    take: 20,
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      saleUnit: true,
    },
  })

  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
  }))
}

export async function listAllProductsForSale() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const products = await prisma.product.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      saleUnit: true,
    },
    take: 500,
  })
  
  return products.map((p) => ({
    ...p,
    stock: decimalToNumber(p.stock),
  }))
}

export async function findProductByBarcode(code: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = code.trim()
  if (!q) return null

  const product = await prisma.product.findFirst({
    where: {
      accountId: user.accountId,
      isActive: true,
      OR: [
        { sku: { equals: q, mode: "insensitive" } },
        { reference: { equals: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      priceCents: true,
      itbisRateBp: true,
      stock: true,
      imageUrls: true,
      saleUnit: true,
    },
  })

  if (!product) return null
  
  return {
    ...product,
    stock: decimalToNumber(product.stock),
  }
}

export async function listCustomers() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Asegurar que el cliente general existe
  const existingGeneric = await prisma.customer.findFirst({
    where: {
      accountId: user.accountId,
      isGeneric: true,
    },
  })

  if (!existingGeneric) {
    await prisma.customer.create({
      data: {
        accountId: user.accountId,
        name: "Cliente general",
        isGeneric: true,
        isActive: true,
      },
    })
  }

  return prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isGeneric: true },
    take: 50,
  })
}

export async function listSales() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sales = await prisma.sale.findMany({
    where: { accountId: user.accountId },
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
    take: 500,
  })
  
  return sales.map((sale) => ({
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      qty: decimalToNumber(item.qty),
    })),
  }))
}

export async function getSaleByInvoiceCode(invoiceCodeParam: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sale = await prisma.sale.findFirst({
    where: { accountId: user.accountId, invoiceCode: invoiceCodeParam },
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
  
  if (!sale) return null
  
  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      qty: decimalToNumber(item.qty),
    })),
  }
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
  paymentSplits?: Array<{method: PaymentMethod, amountCents: number}>
  items: CartItemInput[]
  shippingCents?: number
  username: string
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La venta no tiene productos.")

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  return prisma.$transaction(async (tx) => {
    // Usar el permiso del usuario para vender sin stock
    const allowNegativeStock = user.canSellWithoutStock || user.role === "ADMIN"

    // Invoice sequence por account
    // Usar upsert con el constraint compuesto (accountId + series)
    const seq = await tx.invoiceSequence.upsert({
      where: { 
        accountId_series: { 
          accountId: user.accountId, 
          series: "A" 
        } 
      },
      update: { 
        lastNumber: { increment: 1 } 
      },
      create: { 
        accountId: user.accountId, 
        series: "A", 
        lastNumber: 1 
      },
    })

    const number = seq.lastNumber
    const code = invoiceCode("A", number)

    // Load products to validate stock
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) }, accountId: user.accountId },
      select: { id: true, priceCents: true, stock: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en el carrito.")
      if (!allowNegativeStock && Number(p.stock) < item.qty) {
        throw new Error("Stock insuficiente para completar la venta.")
      }
    }

    const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    const sale = await tx.sale.create({
      data: {
        accountId: user.accountId,
        invoiceSeries: "A",
        invoiceNumber: number,
        invoiceCode: code,
        type: input.type,
        paymentMethod: input.type === SaleType.CONTADO && !input.paymentSplits ? input.paymentMethod : null,
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
        payments: input.paymentSplits && input.paymentSplits.length > 0 ? {
          create: input.paymentSplits.map((split) => ({
            method: split.method,
            amountCents: split.amountCents,
          })),
        } : undefined,
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
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sale = await prisma.sale.findFirst({
    where: { id, accountId: user.accountId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, reference: true, priceCents: true, stock: true, saleUnit: true },
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
  
  if (!sale) return null
  
  return {
    ...sale,
    items: sale.items.map((item) => ({
      ...item,
      qty: decimalToNumber(item.qty),
      product: {
        ...item.product,
        stock: decimalToNumber(item.product.stock),
      },
    })),
  }
}

export async function cancelSale(id: string, username: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id, accountId: user.accountId },
      include: {
        items: true,
        ar: true,
      },
    })

    if (!sale) throw new Error("Venta no encontrada")
    if (sale.cancelledAt) throw new Error("Esta venta ya está cancelada")

    // Verificar permiso para cancelar ventas
    if (!user.canCancelSales && user.role !== "ADMIN") {
      throw new Error("No tienes permiso para cancelar ventas")
    }

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
  username?: string
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  if (!input.items.length) throw new Error("La venta no tiene productos.")

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  const itbisRateBp = settings?.itbisRateBp ?? 1800
  
  // Verificar permiso para editar ventas
  if (!user.canEditSales && user.role !== "ADMIN") {
    throw new Error("No tienes permiso para editar ventas")
  }
  
  const allowNegativeStock = user.canSellWithoutStock || user.role === "ADMIN"

  return prisma.$transaction(async (tx) => {
    const existingSale = await tx.sale.findFirst({
      where: { id: input.id, accountId: user.accountId },
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
      where: { id: { in: input.items.map((i) => i.productId) }, accountId: user.accountId },
      select: { id: true, priceCents: true, stock: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en el carrito.")
      if (!allowNegativeStock && Number(p.stock) < item.qty) {
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

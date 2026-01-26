"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcItbisIncluded, invoiceCode } from "@/lib/money"
import { SaleType, PaymentMethod } from "@prisma/client"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logError, ErrorCodes } from "@/lib/error-logger"

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

  // Asegurar que el cliente general existe (con manejo de condiciones de carrera)
  try {
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
  } catch (error: any) {
    // Si ya existe por condición de carrera, ignorar silenciosamente
    if (error?.code !== "P2002") {
      console.error("Error asegurando cliente genérico:", error)
    }
  }

  return prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isGeneric: true },
    take: 50,
  })
}

export async function listSales(options?: { query?: string; cursor?: string | null; take?: number }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = options?.query?.trim()
  const take = Math.min(Math.max(options?.take ?? 50, 1), 200)

  const sales = await prisma.sale.findMany({
    where: {
      accountId: user.accountId,
      ...(q
        ? {
            OR: [
              { invoiceCode: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { items: { some: { product: { name: { contains: q, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ soldAt: "desc" }, { id: "desc" }],
    cursor: options?.cursor ? { id: options.cursor } : undefined,
    skip: options?.cursor ? 1 : 0,
    take: take + 1,
    select: {
      id: true,
      invoiceCode: true,
      soldAt: true,
      type: true,
      totalCents: true,
      cancelledAt: true,
      customer: { select: { name: true } },
    },
  })

  const hasMore = sales.length > take
  const pageItems = hasMore ? sales.slice(0, take) : sales
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null

  return {
    items: pageItems,
    nextCursor,
  }
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

const MAX_SALE_ITEMS = 100

function validateCartItems(items: CartItemInput[]) {
  if (!items.length) throw new Error("La venta no tiene productos.")
  if (items.length > MAX_SALE_ITEMS) throw new Error(`La venta no puede tener más de ${MAX_SALE_ITEMS} productos.`)

  for (const item of items) {
    if (!item.productId) throw new Error("Producto inválido en el carrito.")
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new Error("La cantidad debe ser mayor a 0.")
    }
    if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents <= 0 || !Number.isInteger(item.unitPriceCents)) {
      throw new Error("El precio unitario debe ser un entero positivo en centavos.")
    }
  }
}

export async function createSale(input: {
  customerId: string | null
  type: SaleType
  paymentMethod?: PaymentMethod | null
  paymentSplits?: Array<{method: PaymentMethod, amountCents: number}>
  items: CartItemInput[]
  shippingCents?: number
  username: string
  user?: any
}) {
  const user = input.user ?? await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  try {
    validateCartItems(input.items)
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.SALE_CREATE_ERROR,
      severity: "LOW",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/sales/actions/createSale",
      metadata: { step: "validation", itemCount: input.items.length },
    })
    throw error
  }

  // Validar permiso para cambiar tipo de venta (si no es el tipo por defecto)
  // Nota: Por defecto, todos pueden crear ventas al contado
  // Solo se valida si intenta cambiar el tipo
  // Para crédito, se asume que necesita permiso (aunque no está explícito en el schema)

  const settings = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  const itbisRateBp = settings?.itbisRateBp ?? 1800

  try {
    return await prisma.$transaction(async (tx) => {
    // Validar que el Account existe
    const account = await tx.account.findUnique({
      where: { id: user.accountId },
      select: { id: true },
    })
    if (!account) {
      throw new Error("El account no existe. Por favor, inicia sesión de nuevo.")
    }

    // Validar que el User existe
    const dbUser = await tx.user.findFirst({
      where: { id: user.id, accountId: user.accountId },
      select: { id: true, accountId: true },
    })
    if (!dbUser) {
      throw new Error("El usuario no existe. Por favor, inicia sesión de nuevo.")
    }

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

    // Load products to validate stock and prices
    const products = await tx.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) }, accountId: user.accountId },
      select: { id: true, priceCents: true, stock: true, isActive: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    for (const item of input.items) {
      const p = byId.get(item.productId)
      if (!p || !p.isActive) throw new Error("Hay un producto inválido o inactivo en el carrito.")
      
      // Validar permiso para modificar precio - SIEMPRE verificar si el precio es diferente al original
      const originalPriceCents = Number(p.priceCents)
      const priceDiffers = item.unitPriceCents !== originalPriceCents
      
      if (priceDiffers) {
        if (!user.canOverridePrice && user.role !== "ADMIN") {
          throw new Error("No tienes permiso para modificar precios. El precio fue cambiado sin autorización.")
        }
        await logAuditEvent({
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "PRICE_OVERRIDE",
          resourceType: "Product",
          resourceId: p.id,
          details: {
            oldPriceCents: Number(p.priceCents),
            newPriceCents: item.unitPriceCents,
          },
        }, tx)
      }
      
      if (!allowNegativeStock && Number(p.stock) < item.qty) {
        throw new Error("Stock insuficiente para completar la venta.")
      }
    }

    // Asegurar que el cliente genérico existe
    let genericCustomer = await tx.customer.findFirst({
      where: {
        accountId: user.accountId,
        isGeneric: true,
      },
    })

    if (!genericCustomer) {
      genericCustomer = await tx.customer.create({
        data: {
          accountId: user.accountId,
          name: "Cliente general",
          isGeneric: true,
          isActive: true,
        },
      })
    }

    const itemsTotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(itemsTotalCents, itbisRateBp)
    const shippingCents = input.shippingCents ?? 0
    const totalCents = itemsTotalCents + shippingCents

    // Validar y usar customerId, o usar el cliente genérico por defecto
    let finalCustomerId: string | null = null
    if (input.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, accountId: user.accountId },
        select: { id: true, accountId: true, isActive: true },
      })
      if (!customer) {
        // Si el cliente no existe, usar el cliente genérico
        console.warn(`Cliente ${input.customerId} no existe, usando cliente genérico`)
        finalCustomerId = genericCustomer.id
      } else if (!customer.isActive) {
        // Si el cliente está inactivo, usar el cliente genérico
        console.warn(`Cliente ${input.customerId} está inactivo, usando cliente genérico`)
        finalCustomerId = genericCustomer.id
      } else {
        finalCustomerId = customer.id
      }
    }

    const sale = await tx.sale.create({
      data: {
        accountId: user.accountId,
        invoiceSeries: "A",
        invoiceNumber: number,
        invoiceCode: code,
        type: input.type,
        paymentMethod: input.type === SaleType.CONTADO && !input.paymentSplits ? input.paymentMethod : null,
        customerId: finalCustomerId,
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

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "SALE_CREATED",
      resourceType: "Sale",
      resourceId: sale.id,
      details: {
        invoiceCode: sale.invoiceCode,
        type: sale.type,
        totalCents,
      },
    }, tx)

    // Update stock
    for (const item of input.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: user.accountId },
        data: { stock: { decrement: item.qty } },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // If credit: create AR
    if (input.type === SaleType.CREDITO) {
      const customerIdForAR = finalCustomerId
      if (!customerIdForAR) {
        // Si no hay cliente, usar el genérico (aunque no debería pasar)
        throw new Error("Para crédito debes seleccionar un cliente.")
      }
      
      // Obtener los días de crédito del cliente
      const customer = await tx.customer.findUnique({
        where: { id: customerIdForAR },
        select: { creditDays: true },
      })
      
      // Calcular fecha de vencimiento
      let dueDate: Date | null = null
      if (customer && customer.creditDays > 0) {
        dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + customer.creditDays)
      }
      
      await tx.accountReceivable.create({
        data: {
          saleId: sale.id,
          customerId: customerIdForAR,
          totalCents,
          balanceCents: totalCents,
          status: "PENDIENTE",
          dueDate,
        },
      })
    }

    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")

    return sale
  }, TRANSACTION_OPTIONS)
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.SALE_CREATE_ERROR,
      severity: "HIGH",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/sales/actions/createSale",
      metadata: { 
        step: "transaction",
        type: input.type,
        itemCount: input.items.length,
        customerId: input.customerId,
      },
    })
    throw error
  }
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

  try {
    return await prisma.$transaction(async (tx) => {
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
          ar: {
            sale: {
              accountId: user.accountId,
            },
          },
        },
      })
      if (activePayments > 0) {
        throw new Error("No se puede cancelar una venta a crédito que ya tiene pagos registrados")
      }
    }

    // Revertir el stock que se descontó
    for (const item of sale.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: user.accountId },
        data: {
          stock: { increment: item.qty },
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Marcar como cancelada
    const cancelled = await tx.sale.updateMany({
      where: { id, accountId: user.accountId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: user.id,
      },
    })
    if (cancelled.count === 0) throw new Error("Venta no encontrada")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "SALE_CANCELLED",
      resourceType: "Sale",
      resourceId: sale.id,
      details: {
        invoiceCode: sale.invoiceCode,
        totalCents: sale.totalCents,
      },
    }, tx)

    revalidatePath("/sales")
    revalidatePath("/sales/list")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/reports/sales")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.SALE_CANCEL_ERROR,
      severity: "HIGH",
      accountId: user.accountId,
      userId: user.id,
      endpoint: "/sales/actions/cancelSale",
      metadata: { saleId: id },
    })
    throw error
  }
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

  validateCartItems(input.items)

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

    // Validar permiso para cambiar tipo de venta
    if (input.type !== existingSale.type) {
      if (!user.canChangeSaleType && user.role !== "ADMIN") {
        throw new Error("No tienes permiso para cambiar el tipo de venta")
      }
    }

    // Si tiene cuenta por cobrar, verificar que no tenga pagos no cancelados
    if (existingSale.ar) {
      const activePayments = await tx.payment.count({
        where: {
          arId: existingSale.ar.id,
          cancelledAt: null,
          ar: {
            sale: {
              accountId: user.accountId,
            },
          },
        },
      })
      if (activePayments > 0) {
        throw new Error("No se puede editar una venta a crédito que ya tiene pagos registrados")
      }
    }

    // Revertir el stock de los items anteriores
    for (const oldItem of existingSale.items) {
      const updated = await tx.product.updateMany({
        where: { id: oldItem.productId, accountId: user.accountId },
        data: {
          stock: { increment: oldItem.qty },
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
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
      
      // Validar permiso para modificar precio - SIEMPRE verificar si el precio es diferente al original
      if (item.unitPriceCents !== p.priceCents) {
        if (!user.canOverridePrice && user.role !== "ADMIN") {
          throw new Error("No tienes permiso para modificar precios. El precio fue cambiado sin autorización.")
        }
        await logAuditEvent({
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? null,
          userUsername: user.username ?? null,
          action: "PRICE_OVERRIDE",
          resourceType: "Product",
          resourceId: p.id,
          details: {
            oldPriceCents: Number(p.priceCents),
            newPriceCents: item.unitPriceCents,
          },
        }, tx)
      }
      
      if (!allowNegativeStock && Number(p.stock) < item.qty) {
        throw new Error("Stock insuficiente para completar la venta.")
      }
    }

    // Eliminar items anteriores
    await tx.saleItem.deleteMany({
      where: { saleId: input.id, sale: { accountId: user.accountId } },
    })

    // Calcular nuevos totales
    const totalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
    const { subtotalCents, itbisCents } = calcItbisIncluded(totalCents, itbisRateBp)

    // Actualizar la venta
    const updatedSale = await tx.sale.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        type: input.type,
        paymentMethod: input.type === SaleType.CONTADO ? input.paymentMethod : null,
        customerId: input.customerId || null,
        subtotalCents,
        itbisCents,
        totalCents,
      },
    })
    if (updatedSale.count === 0) throw new Error("Venta no encontrada")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "SALE_EDITED",
      resourceType: "Sale",
      resourceId: input.id,
      details: {
        type: input.type,
        totalCents,
      },
    }, tx)

    await tx.saleItem.createMany({
      data: input.items.map((i) => ({
        saleId: input.id,
        productId: i.productId,
        qty: i.qty,
        unitPriceCents: i.unitPriceCents,
        wasPriceOverridden: i.wasPriceOverridden,
        lineTotalCents: i.unitPriceCents * i.qty,
      })),
    })

    // Aplicar nuevo stock
    for (const item of input.items) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, accountId: user.accountId },
        data: {
          stock: { decrement: item.qty },
        },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Actualizar o crear cuenta por cobrar si es crédito
    if (input.type === SaleType.CREDITO) {
      const customerId = input.customerId
      if (!customerId) throw new Error("Para crédito debes seleccionar un cliente.")

      if (existingSale.ar) {
        // Obtener los días de crédito del cliente
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { creditDays: true },
        })
        
        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (customer && customer.creditDays > 0) {
          dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + customer.creditDays)
        }
        
        const updatedAr = await tx.accountReceivable.updateMany({
          where: {
            id: existingSale.ar.id,
            sale: { accountId: user.accountId },
          },
          data: {
            customerId,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
            dueDate,
          },
        })
        if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")
      } else {
        // Obtener los días de crédito del cliente
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { creditDays: true },
        })
        
        // Calcular fecha de vencimiento
        let dueDate: Date | null = null
        if (customer && customer.creditDays > 0) {
          dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + customer.creditDays)
        }
        
        await tx.accountReceivable.create({
          data: {
            saleId: input.id,
            customerId,
            totalCents,
            balanceCents: totalCents,
            status: "PENDIENTE",
            dueDate,
          },
        })
      }
    } else if (existingSale.ar) {
      // Si cambió de crédito a contado, eliminar cuenta por cobrar
      const deleted = await tx.accountReceivable.deleteMany({
        where: { id: existingSale.ar.id, sale: { accountId: user.accountId } },
      })
      if (deleted.count === 0) throw new Error("Cuenta por cobrar no encontrada")
    }

    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/reports/sales")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

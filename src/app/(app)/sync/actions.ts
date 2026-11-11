"use server"

import { prisma } from "@/lib/db"
import { getCurrentUserWithDiagnostics } from "@/lib/auth"

function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}

async function getSyncUser(source: string) {
  const result = await getCurrentUserWithDiagnostics({ source })
  if (result.user) return result.user

  // Preventivo: la sesión puede vencer entre el preflight del navegador y esta
  // acción. Es un estado esperado, no un 500. null significa "no sincronizar";
  // nunca devolver [] aquí: los consumidores borrarían el caché offline válido.
  // El motivo concreto ya queda registrado con [AUTH_DIAGNOSTIC].
  return null
}

export async function syncProductsToIndexedDB() {
  const user = await getSyncUser("sync/products-cache")
  if (!user) return null

  const products = await prisma.product.findMany({
    where: { accountId: user.accountId, isActive: true, isAvailableForSale: true },
    orderBy: { productId: "asc" },
    take: 1000, // Límite razonable para cache
    select: {
      id: true,
      name: true,
      sku: true,
      reference: true,
      stock: true,
      minStock: true,
      priceCents: true, // Asegurar que se seleccione priceCents
      costCents: true,
      itbisRateBp: true,
      unit: true,
      imageUrls: true,
      productKind: true,
      isAvailableForSale: true,
      recipeItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          ingredientId: true,
          qty: true,
          ingredient: {
            select: {
              name: true,
              unit: true,
              stock: true,
              isActive: true,
            },
          },
        },
      },
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  // Convertir Decimal a número y Date a string para serialización
  const mapped = products.map((p) => ({
    id: p.id,
    accountId: user.accountId,
    stockSnapshotAt: Date.now(),
    name: p.name,
    sku: p.sku,
    reference: p.reference,
    stock: decimalToNumber(p.stock),
    minStock: decimalToNumber(p.minStock),
    priceCents: p.priceCents, // El modelo Product usa priceCents
    unitPriceCents: p.priceCents, // Alias para compatibilidad
    costCents: p.costCents,
    itbisRateBp: p.itbisRateBp ?? 1800, // Valor por defecto si no existe
    unit: p.unit,
    imageUrls: p.imageUrls,
    productKind: p.productKind,
    isAvailableForSale: p.isAvailableForSale,
    recipeItems: p.recipeItems.map((item) => ({
      ingredientId: item.ingredientId,
      qty: decimalToNumber(item.qty),
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit,
      ingredientStock: decimalToNumber(item.ingredient.stock),
      ingredientIsActive: item.ingredient.isActive,
    })),
    supplier: p.supplier
      ? {
          id: p.supplier.id,
          name: p.supplier.name,
        }
      : null,
    category: p.category
      ? {
          id: p.category.id,
          name: p.category.name,
        }
      : null,
  }))
  
  // Log de depuración: verificar que priceCents está presente
  if (process.env.NODE_ENV === "development") {
    const withoutPrice = mapped.filter((p) => !p.priceCents || p.priceCents === 0)
    if (withoutPrice.length > 0) {
      console.log("[SYNC] Productos sin priceCents al sincronizar:", withoutPrice.length, "de", mapped.length)
      console.log("[SYNC] Ejemplo:", withoutPrice[0]?.name, "priceCents:", withoutPrice[0]?.priceCents)
    } else {
      console.log("[SYNC] Todos los productos tienen priceCents:", mapped.length)
    }
  }
  
  return mapped
}

export async function syncCustomersToIndexedDB() {
  const user = await getSyncUser("sync/customers-cache")
  if (!user) return null

  const customers = await prisma.customer.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    take: 1000, // Límite razonable para cache
  })

  return customers.map((c) => ({
    id: c.id,
    visualId: c.visualId,
    name: c.name,
    phone: c.phone,
    address: c.address,
    cedula: c.cedula,
    province: c.province,
    isGeneric: c.isGeneric,
    saleDiscountPercentBp: c.saleDiscountPercentBp,
  }))
}

export async function syncARToIndexedDB() {
  const user = await getSyncUser("sync/accounts-receivable-cache")
  if (!user) return null

  const arItems = await prisma.accountReceivable.findMany({
    where: {
      accountId: user.accountId,
      status: { in: ["PENDIENTE", "PARCIAL"] },
      OR: [{ sale: { accountId: user.accountId, cancelledAt: null } }, { debitAdjustment: { accountId: user.accountId, state: "PREPARADO_PENDIENTE_CONEXION" } }],
    },
    include: {
      customer: true,
      sale: {
        select: {
          id: true,
          invoiceCode: true,
          totalCents: true,
          returns: { where: { cancelledAt: null, fiscalAdjustmentId: null }, select: { totalCents: true } },
        },
      },
      debitAdjustment: { select: { id: true, fiscalDocumentId: true, originalDocument: { select: { sale: { select: { invoiceCode: true } } } } } },
      fiscalAdjustmentApplications: { where: { kind: "DEBT" }, select: { amountCents: true } },
      fiscalCustomerCreditApplications: { select: { amountCents: true } },
      payments: {
        where: { cancelledAt: null },
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
        },
      },
    },
    take: 500, // Límite razonable para cache
  })

  return arItems.map((ar) => {
    // El saldo persistido ya incorpora devoluciones y créditos; recalcular solo pagos perdería esos ajustes.
    const balanceCents = ar.balanceCents

    return {
      id: ar.id,
      saleId: ar.saleId,
      customerId: ar.customerId,
      totalCents: ar.totalCents,
      balanceCents,
      paidCents: ar.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
      // La caché conserva el desglose sin reconstruir ni alterar el saldo persistido.
      adjustments: { ordinaryReturnsCents: ar.sale?.returns.reduce((sum, item) => sum + item.totalCents, 0) ?? 0, creditNotesCents: ar.fiscalAdjustmentApplications.reduce((sum, item) => sum + item.amountCents, 0), customerCreditsCents: ar.fiscalCustomerCreditApplications.reduce((sum, item) => sum + item.amountCents, 0) },
      status: ar.status,
      dueDate: ar.dueDate,
      createdAt: ar.createdAt,
      customer: {
        id: ar.customer.id,
        visualId: ar.customer.visualId,
        name: ar.customer.name,
        phone: ar.customer.phone,
      },
      sale: ar.sale ? { id: ar.sale.id, invoiceCode: ar.sale.invoiceCode, totalCents: ar.sale.totalCents } : null,
      origin: ar.sale ? { kind: "SALE" as const, reference: ar.sale.invoiceCode, saleId: ar.sale.id } : { kind: "DEBIT_NOTE" as const, reference: `ND-${ar.debitAdjustment!.id.slice(-8).toUpperCase()}`, adjustmentId: ar.debitAdjustment!.id, documentId: ar.debitAdjustment!.fiscalDocumentId, originalInvoiceCode: ar.debitAdjustment!.originalDocument.sale?.invoiceCode ?? null },
    }
  })
}

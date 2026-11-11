"use server"

import { randomUUID } from "node:crypto"
import { assertNoFiscalInput } from "@/lib/fiscal/core/input"

import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { calcDiscountedLineTotalsByTaxMode, calcPercentAmountCents } from "@/lib/money"
import { PaymentMethod } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { getCurrentUser } from "@/lib/auth"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { logAuditEvent } from "@/lib/audit-log"
import { isGenericCustomerQuery } from "@/lib/customer-display"
import { ensureDefaultTreasuryAccount, requireTreasuryAccount } from "@/lib/treasury"
import { hasPermission } from "@/lib/permissions"

function returnCode(number: number): string {
  return `DEV-${String(number).padStart(5, "0")}`
}

function toNumber(value: Decimal | number) {
  return value instanceof Decimal ? value.toNumber() : Number(value)
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
}

function aggregateConsumptions(consumptions: Array<{ ingredientId: string; qty: number }>) {
  const byIngredientId = new Map<string, number>()

  for (const consumption of consumptions) {
    byIngredientId.set(
      consumption.ingredientId,
      roundQty((byIngredientId.get(consumption.ingredientId) ?? 0) + consumption.qty)
    )
  }

  return Array.from(byIngredientId.entries()).map(([ingredientId, qty]) => ({
    ingredientId,
    qty,
  }))
}

type ReturnPolicy = {
  canCreateReturn: boolean
  blockedReason: string | null
  maxReturnCents: number | null
  currentBalanceCents: number | null
}

type ReturnUserLike = {
  id: string
  accountId: string
  email?: string | null
  username?: string | null
  role?: string
  canCancelReturns?: boolean
  canAccessReturns?: boolean
  canPrepareFiscalDocuments?: boolean
  canViewFiscalDocuments?: boolean
  isOwner?: boolean
}

function assertReturnUserLike(user: unknown): asserts user is ReturnUserLike {
  if (!user || typeof user !== "object") throw new Error("No autenticado")

  const candidate = user as { id?: unknown; accountId?: unknown }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("No autenticado")
  if (typeof candidate.accountId !== "string" || candidate.accountId.length === 0) throw new Error("No autenticado")
}

async function requireReturnActor() {
  // Las acciones expuestas al navegador no deben confiar en identidades enviadas como argumentos.
  const user = cashRequest.getStore()?.trustedActor ?? await getCurrentUser()
  assertReturnUserLike(user)
  if (!hasPermission(user, "canAccessReturns")) throw new Error("Sin acceso a devoluciones")
  return user
}

export async function listReturns(
  options?: { skip?: number; take?: number }
) {
  const user = await requireReturnActor()
  const skip = Math.max(0, Number(options?.skip ?? 0) || 0)
  const take = Math.min(500, Math.max(1, Number(options?.take ?? 500) || 500))

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
      fiscalAdjustment: { select: { fiscalDocumentId: true, actorUserId: true } },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              reference: true,
              unit: true,
            },
          },
        },
      },
    },
    skip,
    take,
  })

  return returnsList.map((r) => {
    const { fiscalAdjustment, ...commercialReturn } = r
    const canViewNote = hasPermission(user, "canViewFiscalDocuments") || (hasPermission(user, "canPrepareFiscalDocuments") && fiscalAdjustment?.actorUserId === user.id)
    // La nota nueva tiene origen en el ajuste, por lo que buscarla por returnId no la encuentra.
    return {
      ...commercialReturn,
      fiscalDocumentId: canViewNote ? fiscalAdjustment?.fiscalDocumentId ?? null : null,
      items: r.items.map((item) => ({ ...item, qty: toNumber(item.qty) })),
    }
  })
}

export async function getReturnById(id: string) {
  const user = await requireReturnActor()

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
                  unit: true,
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
              unit: true,
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
  const user = await requireReturnActor()

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
              unit: true,
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
      ar: {
        select: {
          balanceCents: true,
          status: true,
        },
      },
      fiscalDocuments: { where: { state: "PREPARADO_PENDIENTE_CONEXION", type: { in: ["E31", "E32", "E44", "E45", "E46"] } }, select: { id: true, type: true }, take: 1 },
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

  let returnPolicy: ReturnPolicy = {
    canCreateReturn: true,
    blockedReason: null,
    maxReturnCents: null,
    currentBalanceCents: null,
  }

  const fiscalDocument = sale.fiscalDocuments?.[0]
  const settings = fiscalDocument ? await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true, configurationStatus: true, jurisdiction: true, regime: true, environment: true } }) : null
  const fiscalEnabled = Boolean(settings?.enabled && settings.configurationStatus === "VALIDATED" && settings.jurisdiction === "DO" && settings.regime === "DO_ECF" && settings.environment === "TEST")
  const mayPrepare = hasPermission(user, "canAccessReturns") && hasPermission(user, "canPrepareFiscalDocuments")

  if (fiscalDocument) {
    // Una factura fiscal siempre requiere nota, incluso si el perfil se apaga después de prepararla.
    returnPolicy = { canCreateReturn: fiscalEnabled && mayPrepare, blockedReason: !fiscalEnabled ? "Activa el perfil fiscal de prueba para preparar una nota sobre esta factura." : !mayPrepare ? "Se necesita permiso para preparar la nota fiscal." : null, maxReturnCents: null, currentBalanceCents: sale.ar?.balanceCents ?? null }
  } else if (sale.type === "CREDITO") {
    if (!sale.ar) {
      returnPolicy = {
        canCreateReturn: false,
        blockedReason: "Factura a crédito sin cuenta por cobrar asociada. Contacta al administrador.",
        maxReturnCents: 0,
        currentBalanceCents: null,
      }
    } else if (sale.ar.balanceCents <= 0 || sale.ar.status === "PAGADA") {
      returnPolicy = {
        canCreateReturn: false,
        blockedReason: "Esta factura a crédito está pagada totalmente y no permite devoluciones.",
        maxReturnCents: sale.ar.balanceCents,
        currentBalanceCents: sale.ar.balanceCents,
      }
    } else {
      returnPolicy = {
        canCreateReturn: true,
        blockedReason: null,
        maxReturnCents: sale.ar.balanceCents,
        currentBalanceCents: sale.ar.balanceCents,
      }
    }
  }

  const { fiscalDocuments: _fiscalDocuments, ...commercialSale } = sale
  return {
    ...commercialSale,
    items: itemsWithAvailable,
    returnPolicy,
    ...(fiscalDocument && mayPrepare ? { fiscal: { documentId: fiscalDocument.id, type: fiscalDocument.type, enabled: fiscalEnabled } } : {}),
  }
}

type ReturnItemInput = {
  saleItemId: string
  productId: string
  qty: number
  unitPriceCents: number
}

export async function createReturn(input: Parameters<typeof createReturnInternal>[0]) {
  // No confirmar efectos ordinarios cuando el cliente solicita una operación fiscal no admitida.
  assertNoFiscalInput(input)
  const { cashOperation, ...payload } = input
  return withCashOperation(cashOperation, { kind: "createReturn", ...payload }, () => createReturnInternal(input))
}

async function createReturnInternal(input: {
  saleId: string
  items: ReturnItemInput[]
  notes?: string | null
  refundMethod?: PaymentMethod | null
  refundTreasuryAccountId?: string | null
  cashOperation?: CashOperationInput
}) {
  const currentUser = await requireReturnActor()

  if (!input.items.length) throw new Error("La devolución no tiene productos.")

  const dbUser = await prisma.user.findFirst({ 
    where: { accountId: currentUser.accountId, id: currentUser.id } 
  })
  if (!dbUser) throw new Error("Usuario inválido")

  return prisma.$transaction(async (tx) => {
    // Verificar que la venta existe, pertenece al account y no está cancelada
    const sale = await tx.sale.findFirst({
      where: { accountId: currentUser.accountId, id: input.saleId },
      include: {
        items: {
          include: {
            consumptions: true,
          },
        },
        returns: {
          where: { cancelledAt: null },
          include: { items: true },
        },
        ar: {
          select: {
            id: true,
            totalCents: true,
            balanceCents: true,
            status: true,
          },
        },
        fiscalDocuments: { where: { state: "PREPARADO_PENDIENTE_CONEXION", type: { in: ["E31", "E32", "E44", "E45", "E46"] } }, select: { id: true }, take: 1 },
      },
    })

    if (!sale) throw new Error("Venta no encontrada")
    if (sale.cancelledAt) throw new Error("No se puede devolver una venta cancelada")
    // El perfil apagado no libera el historial: una venta preparada nunca se devuelve por la ruta ordinaria.
    if (sale.fiscalDocuments?.length) throw new Error("Esta factura requiere una nota de crédito fiscal")

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

    const documentSalePricesIncludeItbis = sale.salePricesIncludeItbis ?? true
    const discountPercentBp = sale.discountPercentBp ?? 0
    const returnItemsWithSnapshot = input.items.map((item) => {
      const saleItem = saleItemsById.get(item.saleItemId)
      if (!saleItem) {
        throw new Error("Item de venta no encontrado")
      }
      const itbisRateBp = saleItem.itbisRateBp ?? 1800
      const lineTotals = calcDiscountedLineTotalsByTaxMode(
        saleItem.unitPriceCents,
        item.qty,
        itbisRateBp,
        documentSalePricesIncludeItbis,
        discountPercentBp
      )
      return {
        saleItemId: item.saleItemId,
        productId: item.productId,
        qty: item.qty,
        unitPriceCents: saleItem.unitPriceCents,
        itbisRateBp,
        lineTotalCents: Math.round(saleItem.unitPriceCents * item.qty),
        subtotalCents: lineTotals.subtotalCents,
        itbisCents: lineTotals.itbisCents,
        totalCents: lineTotals.totalCents,
        discountSubtotalCents: lineTotals.discountSubtotalCents,
        discountTotalCents: lineTotals.discountTotalCents,
      }
    })

    const subtotalCents = returnItemsWithSnapshot.reduce((sum, item) => sum + item.subtotalCents, 0)
    const itbisCents = returnItemsWithSnapshot.reduce((sum, item) => sum + item.itbisCents, 0)
    const discountSubtotalCents = returnItemsWithSnapshot.reduce((sum, item) => sum + item.discountSubtotalCents, 0)
    const discountTotalCents = returnItemsWithSnapshot.reduce((sum, item) => sum + item.discountTotalCents, 0)
    const itemsTotalCents = returnItemsWithSnapshot.reduce((sum, item) => sum + item.totalCents, 0)
    const previouslyReturnedLegalTipCents = sale.returns.reduce((sum, ret) => sum + (ret.legalTipCents ?? 0), 0)
    const originalLegalTipCents = sale.legalTipCents ?? 0
    const pendingLegalTipCents = Math.max(0, originalLegalTipCents - previouslyReturnedLegalTipCents)
    const legalTipBaseCents =
      (sale.legalTipBaseCents ?? 0) > 0
        ? (sale.legalTipBaseCents ?? 0)
        : originalLegalTipCents > 0
          ? (sale.subtotalCents ?? 0)
          : 0
    const legalTipPercentBp = sale.legalTipPercentBp ?? 1000
    const legalTipCents =
      sale.legalTipApplied && legalTipBaseCents > 0 && pendingLegalTipCents > 0
        ? Math.min(
            pendingLegalTipCents,
            calcPercentAmountCents(subtotalCents, legalTipPercentBp)
          )
        : 0
    const totalCents = itemsTotalCents + legalTipCents
    let creditAr: { id: string; totalCents: number; balanceCents: number; status: string } | null = null
    let refundMethod: PaymentMethod | null = null
    let refundTreasuryAccountId: string | null = null

    if (sale.type === "CREDITO") {
      if (!sale.ar) {
        throw new Error("Inconsistencia: la factura a crédito no tiene cuenta por cobrar asociada")
      }

      creditAr = sale.ar
      if (creditAr.balanceCents <= 0 || creditAr.status === "PAGADA") {
        throw new Error("Esta factura a crédito está pagada totalmente y no permite devoluciones")
      }

      if (totalCents > creditAr.balanceCents) {
        throw new Error(
          `El total de la devolución (${totalCents}) no puede exceder el balance pendiente (${creditAr.balanceCents})`
        )
      }
    } else {
      if (input.refundMethod === PaymentMethod.DIVIDIR_PAGO) {
        throw new Error("Dividir pago no es un método válido para devoluciones.")
      }

      refundMethod = input.refundMethod ?? sale.paymentMethod ?? PaymentMethod.OTRO
      const refundTreasuryAccount = input.refundTreasuryAccountId?.trim()
        ? await requireTreasuryAccount(tx, {
            accountId: currentUser.accountId,
            treasuryAccountId: input.refundTreasuryAccountId.trim(),
            requireActive: true,
            message: "La cuenta de tesorería seleccionada para la devolución no existe o está inactiva.",
          })
        : sale.treasuryAccountId
          ? await requireTreasuryAccount(tx, {
              accountId: currentUser.accountId,
              treasuryAccountId: sale.treasuryAccountId,
              message: "La cuenta de tesorería de la venta no existe.",
            })
          : await ensureDefaultTreasuryAccount(tx, currentUser.accountId, currentUser.id)

      refundTreasuryAccountId = refundTreasuryAccount.id
    }

    // Secuencia de devolución por account
    const seq = await tx.returnSequence.upsert({
      where: { accountId: currentUser.accountId },
      update: { lastNumber: { increment: 1 } },
      create: { accountId: currentUser.accountId, lastNumber: 1 },
    })

    const number = seq.lastNumber
    const code = returnCode(number)

    // Crear devolución
    const returnRecord = await tx.return.create({
      data: {
        accountId: currentUser.accountId,
        returnNumber: number,
        returnCode: code,
        saleId: input.saleId,
        userId: dbUser.id,
        refundMethod,
        refundTreasuryAccountId,
        subtotalCents,
        itbisCents,
        discountPercentBp,
        discountSubtotalCents,
        discountTotalCents,
        legalTipCents,
        totalCents,
        salePricesIncludeItbis: documentSalePricesIncludeItbis,
        notes: input.notes?.trim() || null,
        items: {
          create: returnItemsWithSnapshot.map((i) => ({
            saleItemId: i.saleItemId,
            productId: i.productId,
            qty: i.qty,
            unitPriceCents: i.unitPriceCents,
            itbisRateBp: i.itbisRateBp,
            lineTotalCents: i.lineTotalCents,
          })),
        },
      },
      select: { id: true, returnCode: true },
    })

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "RETURN_CREATED",
      resourceType: "Return",
      resourceId: returnRecord.id,
      details: {
        returnCode: returnRecord.returnCode,
        saleId: input.saleId,
        totalCents,
        refundMethod,
        refundTreasuryAccountId,
        legalTipCents,
        itemsCount: input.items.length,
      },
    }, tx)

    const returnConsumptions = aggregateConsumptions(
      input.items.flatMap((item) => {
        const saleItem = saleItemsById.get(item.saleItemId)
        if (!saleItem) return []

        const soldQty = toNumber(saleItem.qty)
        return saleItem.consumptions.map((consumption) => ({
          ingredientId: consumption.ingredientId,
          qty: roundQty((toNumber(consumption.qty) / soldQty) * item.qty),
        }))
      })
    )

    for (const consumption of returnConsumptions) {
      const updated = await tx.product.updateMany({
        where: { id: consumption.ingredientId, accountId: currentUser.accountId },
        data: { stock: { increment: new Decimal(consumption.qty) } },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Si la venta era a crédito, reducir el balance de la cuenta por cobrar
    if (sale.type === "CREDITO") {
      if (!creditAr) {
        throw new Error("Inconsistencia: cuenta por cobrar no encontrada para factura a crédito")
      }

      const newBalance = creditAr.balanceCents - totalCents
      const newStatus = newBalance === 0 ? "PAGADA" : "PARCIAL"

      const updatedAr = await tx.accountReceivable.updateMany({
        where: { id: creditAr.id, sale: { accountId: currentUser.accountId } },
        data: {
          balanceCents: newBalance,
          status: newStatus,
        },
      })
      if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")
    }

    revalidatePath("/returns")
    revalidatePath("/returns/list")
    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/products")
    revalidatePath("/daily-close")
    revalidatePath("/reports/profit")

    return returnRecord
  }, TRANSACTION_OPTIONS)
}

export async function cancelReturn(id: string, reason?: string) {
  // Las correcciones móviles usan exclusivamente el actor autenticado del contexto.
  const currentUser = cashRequest.getStore()?.trustedActor ?? await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  const dbUser = await prisma.user.findFirst({ 
    where: { accountId: currentUser.accountId, id: currentUser.id } 
  })
  if (!dbUser) throw new Error("Usuario inválido")

  // Verificar permiso para cancelar devoluciones
  if (!dbUser.canCancelReturns && !dbUser.isOwner) {
    throw new Error("No tienes permiso para cancelar devoluciones")
  }

  return prisma.$transaction(async (tx) => {
    const returnRecord = await tx.return.findFirst({
      where: { accountId: currentUser.accountId, id },
      include: {
        items: {
          include: {
            saleItem: {
              include: {
                consumptions: true,
              },
            },
          },
        },
        sale: {
          include: {
            ar: true,
          },
        },
      },
    })

    if (!returnRecord) throw new Error("Devolución no encontrada")
    if (returnRecord.cancelledAt) throw new Error("Esta devolución ya está cancelada")
    const fiscalAdjustmentId = (returnRecord as typeof returnRecord & { fiscalAdjustmentId?: string | null }).fiscalAdjustmentId
    const reversalReason = reason?.trim() || cashRequest.getStore()?.correction?.reason?.trim() || ""
    let fiscalRevision: number | null = null
    if (fiscalAdjustmentId) {
      if (!reversalReason) throw new Error("Indica el motivo de la reversión física")
      const documents = await tx.$queryRaw<Array<{ state: string; revision: number }>>`SELECT state,revision FROM "FiscalAdjustment" WHERE "accountId"=${currentUser.accountId} AND id=${fiscalAdjustmentId}`
      if (documents[0]?.state !== "PREPARADO_PENDIENTE_CONEXION") throw new Error("La nota fiscal asociada no está preparada")
      fiscalRevision = documents[0].revision
      const scope = cashRequest.getStore()
      if (scope?.trustedActor?.id !== currentUser.id || scope.trustedActor.accountId !== currentUser.accountId) throw new Error("La identidad de caja no coincide")
      // Solo se autoriza revertir inventario; el comprobante y sus aplicaciones permanecen intactos.
      scope.fiscalAdjustmentAuthorizedAccountId = currentUser.accountId
    }

    const returnConsumptions = aggregateConsumptions(
      returnRecord.items.flatMap((item) => {
        const stored = (item as typeof item & { fiscalRestorations?: unknown }).fiscalRestorations
        if (fiscalAdjustmentId && stored !== null && stored !== undefined) {
          // Revertir el reparto guardado evita perder milésimas si hubo devoluciones sucesivas o reversiones intercaladas.
          if (!Array.isArray(stored)) throw new Error("La reposición fiscal requiere conciliación")
          const allowed = new Set(item.saleItem.consumptions.map(consumption => consumption.ingredientId))
          const seen = new Set<string>()
          const entries = stored.map((value: unknown) => {
            if (!value || typeof value !== "object") throw new Error("La reposición fiscal requiere conciliación")
            const entry = value as { ingredientId?: unknown; quantity?: unknown }
            if (typeof entry.ingredientId !== "string" || !allowed.has(entry.ingredientId) || seen.has(entry.ingredientId) || typeof entry.quantity !== "string" || !/^\d{1,10}\.\d{3}$/.test(entry.quantity)) throw new Error("La reposición fiscal requiere conciliación")
            seen.add(entry.ingredientId)
            return { ingredientId: entry.ingredientId, qty: Number(entry.quantity) }
          })
          if (seen.size !== allowed.size) throw new Error("La reposición fiscal requiere conciliación")
          return entries
        }
        // Los registros anteriores a este desglose usaban el cálculo proporcional individual.
        const soldQty = toNumber(item.saleItem.qty)
        return item.saleItem.consumptions.map((consumption) => ({
          ingredientId: consumption.ingredientId,
          qty: roundQty((toNumber(consumption.qty) / soldQty) * toNumber(item.qty)),
        }))
      })
    )

    for (const consumption of returnConsumptions) {
      const updated = await tx.product.updateMany({
        where: { id: consumption.ingredientId, accountId: currentUser.accountId },
        data: { stock: { decrement: new Decimal(consumption.qty) } },
      })
      if (updated.count === 0) throw new Error("Producto no encontrado")
    }

    // Si la venta era a crédito, restaurar el balance de la cuenta por cobrar
    if (returnRecord.sale.type === "CREDITO" && !fiscalAdjustmentId) {
      const ar = await tx.accountReceivable.findFirst({
        where: {
          saleId: returnRecord.sale.id,
          sale: { accountId: currentUser.accountId },
        },
      })

      if (!ar) throw new Error("Inconsistencia: cuenta por cobrar no encontrada para factura a crédito")

      const newBalance = Math.min(ar.totalCents, ar.balanceCents + returnRecord.totalCents)
      const newStatus = newBalance === 0 ? "PAGADA" : newBalance === ar.totalCents ? "PENDIENTE" : "PARCIAL"

      const updatedAr = await tx.accountReceivable.updateMany({
        where: { id: ar.id, sale: { accountId: currentUser.accountId } },
        data: {
          balanceCents: newBalance,
          status: newStatus,
        },
      })
      if (updatedAr.count === 0) throw new Error("Cuenta por cobrar no encontrada")
    }

    // Marcar como cancelada
    const cancelled = await tx.return.updateMany({
      where: { id, accountId: currentUser.accountId },
      data: {
        cancelledAt: new Date(),
        cancelledBy: dbUser.id,
        ...(fiscalAdjustmentId ? { cancellationReason: reversalReason } : {}),
      },
    })
    if (cancelled.count === 0) throw new Error("Devolución no encontrada")

    if (fiscalAdjustmentId && fiscalRevision !== null) {
      // La auditoría fiscal es parte de la misma transacción, aunque el registro comercial de auditoría falle.
      await tx.$executeRaw`INSERT INTO "FiscalAdjustmentEvent" (id,"accountId","adjustmentId","actorUserId",state,revision,details) VALUES (${randomUUID()},${currentUser.accountId},${fiscalAdjustmentId},${currentUser.id},'PREPARADO_PENDIENTE_CONEXION',${fiscalRevision},${JSON.stringify({ action: "PHYSICAL_REVERSED", returnId: returnRecord.id, reason: reversalReason })}::jsonb)`
    }

    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "RETURN_CANCELLED",
      resourceType: "Return",
      resourceId: returnRecord.id,
      details: {
        returnCode: returnRecord.returnCode,
        saleId: returnRecord.saleId,
        totalCents: returnRecord.totalCents,
        itemsCount: returnRecord.items.length,
        ...(fiscalAdjustmentId ? { fiscalAdjustmentId, physicalReversalOnly: true, reason: reversalReason } : {}),
      },
    }, tx)

    revalidatePath("/returns")
    revalidatePath("/returns/list")
    revalidatePath("/sales")
    revalidatePath("/ar")
    revalidatePath("/dashboard")
    revalidatePath("/products")
    revalidatePath("/daily-close")
    revalidatePath("/reports/profit")
  }, TRANSACTION_OPTIONS)
}

export async function searchSalesForReturn(
  query: string,
  options?: { customerId?: string | null }
) {
  const user = await requireReturnActor()

  const q = query.trim()
  const normalizedVisualQuery = q ? q.replace(/^#/, "") : ""
  const visualIdQuery = normalizedVisualQuery && /^\d+$/.test(normalizedVisualQuery) ? Number(normalizedVisualQuery) : null
  const shouldIncludeLegacyNullGeneric = q ? isGenericCustomerQuery(q) : false
  const normalizedCustomerId = options?.customerId?.trim() || null
  const customerId = normalizedCustomerId?.toLowerCase() === "generic" ? null : normalizedCustomerId
  if (!q && !customerId) return []
  const matchingFiscalSales = /^E(?:31|32|44|45|46)\d{1,10}$/i.test(q) && hasPermission(user, "canViewFiscalDocuments")
    ? await prisma.$queryRaw<Array<{ saleId: string }>>`SELECT d."saleId" FROM "FiscalDocument" d JOIN "FiscalNumberAllocation" n ON n."accountId"=d."accountId" AND n."documentId"=d.id WHERE d."accountId"=${user.accountId} AND n."eNcf" ILIKE ${`%${q}%`} AND d."saleId" IS NOT NULL AND d.state='PREPARADO_PENDIENTE_CONEXION'`
    : []

  const sales = await prisma.sale.findMany({
    where: {
      accountId: user.accountId,
      cancelledAt: null,
      ...(customerId ? { customerId } : {}),
      ...(q
        ? {
            OR: [
              { invoiceCode: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              ...(matchingFiscalSales.length ? [{ id: { in: matchingFiscalSales.map(item => item.saleId) } }] : []),
              ...(visualIdQuery !== null ? [{ customer: { visualId: visualIdQuery } }] : []),
              ...(shouldIncludeLegacyNullGeneric ? [{ customerId: null }] : []),
            ],
          }
        : {}),
    },
    include: {
      customer: true,
    },
    orderBy: { soldAt: "desc" },
    take: q ? 20 : 50,
  })

  return sales
}











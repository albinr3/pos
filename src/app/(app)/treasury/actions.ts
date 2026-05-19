"use server"

import { revalidatePath } from "next/cache"
import { PaymentMethod, TreasuryTransferStatus, type Prisma } from "@prisma/client"

import { logAuditEvent } from "@/lib/audit-log"
import { getCurrentUser } from "@/lib/auth"
import { startOfDay, endOfDay, parseDateParam } from "@/lib/dates"
import { prisma } from "@/lib/db"
import { ensurePermission } from "@/lib/permission-guard"
import { hasPermission } from "@/lib/permissions"
import {
  ensureDefaultTreasuryAccount,
  getTransferBankNameFromTreasuryAccount,
  listTreasuryAccountsByAccount,
  requireTreasuryAccount,
} from "@/lib/treasury"

type DateRangeInput = {
  from?: string
  to?: string
}

type Movement = {
  id: string
  source:
    | "OPENING_BALANCE"
    | "SALE_CASH"
    | "AR_PAYMENT"
    | "PURCHASE"
    | "OPERATING_EXPENSE"
    | "CASH_RETURN"
    | "TREASURY_TRANSFER"
  direction: "IN" | "OUT"
  amountCents: number
  occurredAt: Date
  method: PaymentMethod | null
  treasuryAccountId: string
  treasuryAccountName: string
  reference: string
  note: string | null
  transferId?: string
  transferStatus?: TreasuryTransferStatus | null
  transferTrace?: string | null
  canReverseTransfer?: boolean
}

function assertCanViewTreasury(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (user.isOwner) return
  const canView = hasPermission(user, "canViewTreasury", { allowAdminBypass: false })
  const canManage = hasPermission(user, "canManageTreasuryAccounts", { allowAdminBypass: false })
  const canCreateTransfers = hasPermission(user, "canCreateTreasuryTransfers", { allowAdminBypass: false })
  const canReverseTransfers = hasPermission(user, "canReverseTreasuryTransfers", { allowAdminBypass: false })
  if (!canView && !canManage && !canCreateTransfers && !canReverseTransfers) {
    throw new Error("No tienes permiso para ver tesorería")
  }
}

export async function listTreasuryAccounts(includeInactive = false) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const accounts = await listTreasuryAccountsByAccount(user.accountId, includeInactive)
  return accounts
}

export async function createTreasuryAccount(input: {
  name: string
  type: "CAJA" | "BANCO"
  currency?: string
  bankName?: string | null
  accountNumber?: string | null
  openingBalanceCents?: number | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensurePermission(user, "canManageTreasuryAccounts", {
    allowAdminBypass: false,
    message: "No tienes permiso para gestionar cuentas de tesorería",
    resourceType: "TreasuryAccount",
  })

  const name = input.name.trim()
  if (!name) throw new Error("El nombre de la cuenta es requerido")

  const exists = await prisma.treasuryAccount.findFirst({
    where: {
      accountId: user.accountId,
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  })

  if (exists) throw new Error("Ya existe una cuenta con ese nombre")

  await prisma.treasuryAccount.create({
    data: {
      accountId: user.accountId,
      name,
      type: input.type,
      currency: input.currency?.trim() || "DOP",
      bankName: input.bankName?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      isActive: true,
      createdByUserId: user.id,
    },
  })

  revalidatePath("/treasury")
}

export async function updateTreasuryAccount(input: {
  id: string
  name: string
  type: "CAJA" | "BANCO"
  currency?: string
  bankName?: string | null
  accountNumber?: string | null
  isActive: boolean
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensurePermission(user, "canManageTreasuryAccounts", {
    allowAdminBypass: false,
    message: "No tienes permiso para gestionar cuentas de tesorería",
    resourceType: "TreasuryAccount",
    resourceId: input.id,
  })

  const name = input.name.trim()
  if (!name) throw new Error("El nombre de la cuenta es requerido")

  const account = await requireTreasuryAccount(prisma, {
    accountId: user.accountId,
    treasuryAccountId: input.id,
    message: "Cuenta de tesorería no encontrada",
  })

  const duplicate = await prisma.treasuryAccount.findFirst({
    where: {
      accountId: user.accountId,
      id: { not: account.id },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  })

  if (duplicate) throw new Error("Ya existe otra cuenta con ese nombre")

  await prisma.treasuryAccount.update({
    where: { id: account.id },
    data: {
      name,
      type: input.type,
      currency: input.currency?.trim() || "DOP",
      bankName: input.bankName?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      isActive: input.isActive,
    },
  })

  revalidatePath("/treasury")
}

export async function setTreasuryOpeningBalance(input: {
  treasuryAccountId: string
  amountCents: number
  effectiveAt?: Date
  note?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensurePermission(user, "canManageTreasuryAccounts", {
    allowAdminBypass: false,
    message: "No tienes permiso para establecer saldos iniciales",
    resourceType: "TreasuryOpeningBalance",
  })

  if (!Number.isInteger(input.amountCents)) {
    throw new Error("El saldo inicial debe estar en centavos")
  }

  const treasuryAccount = await requireTreasuryAccount(prisma, {
    accountId: user.accountId,
    treasuryAccountId: input.treasuryAccountId,
    message: "Cuenta de tesorería no encontrada",
  })
  const isCajaEfectivo =
    treasuryAccount.type === "CAJA" && treasuryAccount.name.trim().toLocaleLowerCase("es") === "caja efectivo"
  if (!isCajaEfectivo) {
    throw new Error("El saldo inicial manual solo está permitido para la cuenta Caja Efectivo")
  }

  await prisma.treasuryOpeningBalance.create({
    data: {
      accountId: user.accountId,
      treasuryAccountId: treasuryAccount.id,
      amountCents: input.amountCents,
      effectiveAt: input.effectiveAt ?? new Date(),
      note: input.note?.trim() || null,
      createdByUserId: user.id,
    },
  })

  revalidatePath("/treasury")
}

function normalizeTransferDate(date?: Date) {
  const value = date ?? new Date()
  if (Number.isNaN(value.getTime())) {
    throw new Error("Fecha de transferencia inválida")
  }
  const isDateOnlyMidnight =
    value.getHours() === 0 &&
    value.getMinutes() === 0 &&
    value.getSeconds() === 0 &&
    value.getMilliseconds() === 0

  // Cuando la UI envía solo fecha (00:00), tomar fin de día para incluir
  // los movimientos operativos de ese mismo día en el saldo proyectado.
  return isDateOnlyMidnight ? endOfDay(value) : value
}

function normalizeTransferAmount(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("El monto debe ser mayor que cero (en centavos)")
  }
  return amountCents
}

function formatTransferReference(transferId: string) {
  return `TR-${transferId.slice(-8).toUpperCase()}`
}

async function getTreasuryAccountBalanceUntil(
  db: Prisma.TransactionClient | typeof prisma,
  input: {
    accountId: string
    treasuryAccountId: string
    at: Date
  }
) {
  const [
    openingBalanceSum,
    saleSplitSum,
    legacySaleSum,
    arPaymentSum,
    purchaseSum,
    expenseSum,
    returnSum,
    transferInSum,
    transferOutSum,
  ] = await Promise.all([
    db.treasuryOpeningBalance.aggregate({
      where: {
        accountId: input.accountId,
        treasuryAccountId: input.treasuryAccountId,
        effectiveAt: { lte: input.at },
      },
      _sum: { amountCents: true },
    }),
    db.salePayment.aggregate({
      where: {
        treasuryAccountId: input.treasuryAccountId,
        sale: {
          accountId: input.accountId,
          type: "CONTADO",
          cancelledAt: null,
          soldAt: { lte: input.at },
        },
      },
      _sum: { amountCents: true },
    }),
    db.sale.aggregate({
      where: {
        accountId: input.accountId,
        type: "CONTADO",
        cancelledAt: null,
        soldAt: { lte: input.at },
        treasuryAccountId: input.treasuryAccountId,
        payments: { none: {} },
      },
      _sum: { totalCents: true },
    }),
    db.payment.aggregate({
      where: {
        cancelledAt: null,
        paidAt: { lte: input.at },
        treasuryAccountId: input.treasuryAccountId,
        ar: {
          sale: {
            accountId: input.accountId,
          },
        },
      },
      _sum: { amountCents: true },
    }),
    db.purchase.aggregate({
      where: {
        accountId: input.accountId,
        cancelledAt: null,
        purchasedAt: { lte: input.at },
        treasuryAccountId: input.treasuryAccountId,
      },
      _sum: { totalCents: true },
    }),
    db.operatingExpense.aggregate({
      where: {
        accountId: input.accountId,
        expenseDate: { lte: input.at },
        treasuryAccountId: input.treasuryAccountId,
      },
      _sum: { amountCents: true },
    }),
    db.return.aggregate({
      where: {
        accountId: input.accountId,
        cancelledAt: null,
        returnedAt: { lte: input.at },
        sale: { type: "CONTADO" },
        refundTreasuryAccountId: input.treasuryAccountId,
      },
      _sum: { totalCents: true },
    }),
    db.treasuryTransfer.aggregate({
      where: {
        accountId: input.accountId,
        transferredAt: { lte: input.at },
        toTreasuryAccountId: input.treasuryAccountId,
      },
      _sum: { amountCents: true },
    }),
    db.treasuryTransfer.aggregate({
      where: {
        accountId: input.accountId,
        transferredAt: { lte: input.at },
        fromTreasuryAccountId: input.treasuryAccountId,
      },
      _sum: { amountCents: true },
    }),
  ])

  const openingCents = openingBalanceSum._sum.amountCents ?? 0
  const saleSplitCents = saleSplitSum._sum.amountCents ?? 0
  const legacySaleCents = legacySaleSum._sum.totalCents ?? 0
  const arPaymentCents = arPaymentSum._sum.amountCents ?? 0
  const purchaseCents = purchaseSum._sum.totalCents ?? 0
  const expenseCents = expenseSum._sum.amountCents ?? 0
  const returnCents = returnSum._sum.totalCents ?? 0
  const transferInCents = transferInSum._sum.amountCents ?? 0
  const transferOutCents = transferOutSum._sum.amountCents ?? 0

  return (
    openingCents +
    saleSplitCents +
    legacySaleCents +
    arPaymentCents +
    transferInCents -
    purchaseCents -
    expenseCents -
    returnCents -
    transferOutCents
  )
}

export async function previewTreasuryTransfer(input: {
  fromTreasuryAccountId: string
  toTreasuryAccountId: string
  amountCents: number
  transferredAt?: Date
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensurePermission(user, "canCreateTreasuryTransfers", {
    allowAdminBypass: false,
    message: "No tienes permiso para crear transferencias de tesorería",
    resourceType: "TreasuryTransfer",
  })

  const amountCents = normalizeTransferAmount(input.amountCents)
  const transferredAt = normalizeTransferDate(input.transferredAt)

  if (input.fromTreasuryAccountId === input.toTreasuryAccountId) {
    throw new Error("La cuenta de origen y destino deben ser diferentes")
  }

  const [fromAccount, toAccount] = await Promise.all([
    requireTreasuryAccount(prisma, {
      accountId: user.accountId,
      treasuryAccountId: input.fromTreasuryAccountId,
      requireActive: true,
      message: "Cuenta de origen no encontrada o inactiva",
    }),
    requireTreasuryAccount(prisma, {
      accountId: user.accountId,
      treasuryAccountId: input.toTreasuryAccountId,
      requireActive: true,
      message: "Cuenta de destino no encontrada o inactiva",
    }),
  ])

  const sourceBalanceCents = await getTreasuryAccountBalanceUntil(prisma, {
    accountId: user.accountId,
    treasuryAccountId: fromAccount.id,
    at: transferredAt,
  })

  const projectedSourceBalanceCents = sourceBalanceCents - amountCents

  return {
    fromTreasuryAccountId: fromAccount.id,
    fromTreasuryAccountName: fromAccount.name,
    toTreasuryAccountId: toAccount.id,
    toTreasuryAccountName: toAccount.name,
    amountCents,
    transferredAt,
    sourceBalanceCents,
    projectedSourceBalanceCents,
    willBeNegative: projectedSourceBalanceCents < 0,
  }
}

export async function createTreasuryTransfer(input: {
  fromTreasuryAccountId: string
  toTreasuryAccountId: string
  amountCents: number
  transferredAt?: Date
  note?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensurePermission(user, "canCreateTreasuryTransfers", {
    allowAdminBypass: false,
    message: "No tienes permiso para crear transferencias de tesorería",
    resourceType: "TreasuryTransfer",
  })

  const amountCents = normalizeTransferAmount(input.amountCents)
  const transferredAt = normalizeTransferDate(input.transferredAt)

  if (input.fromTreasuryAccountId === input.toTreasuryAccountId) {
    throw new Error("La cuenta de origen y destino deben ser diferentes")
  }

  const [fromAccount, toAccount] = await Promise.all([
    requireTreasuryAccount(prisma, {
      accountId: user.accountId,
      treasuryAccountId: input.fromTreasuryAccountId,
      requireActive: true,
      message: "Cuenta de origen no encontrada o inactiva",
    }),
    requireTreasuryAccount(prisma, {
      accountId: user.accountId,
      treasuryAccountId: input.toTreasuryAccountId,
      requireActive: true,
      message: "Cuenta de destino no encontrada o inactiva",
    }),
  ])

  const transfer = await prisma.treasuryTransfer.create({
    data: {
      accountId: user.accountId,
      fromTreasuryAccountId: fromAccount.id,
      toTreasuryAccountId: toAccount.id,
      amountCents,
      transferredAt,
      note: input.note?.trim() || null,
      createdByUserId: user.id,
      status: "ACTIVE",
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    userEmail: user.email ?? null,
    userUsername: user.username ?? null,
    action: "TREASURY_TRANSFER_CREATED",
    resourceType: "TreasuryTransfer",
    resourceId: transfer.id,
    details: {
      fromTreasuryAccountId: fromAccount.id,
      fromTreasuryAccountName: fromAccount.name,
      toTreasuryAccountId: toAccount.id,
      toTreasuryAccountName: toAccount.name,
      amountCents,
      transferredAt: transferredAt.toISOString(),
      note: input.note?.trim() || null,
      status: transfer.status,
    },
  })

  revalidatePath("/treasury")

  return {
    id: transfer.id,
    reference: formatTransferReference(transfer.id),
  }
}

export async function reverseTreasuryTransfer(input: {
  transferId: string
  reason: string
  reversedAt?: Date
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await ensurePermission(user, "canReverseTreasuryTransfers", {
    allowAdminBypass: false,
    message: "No tienes permiso para anular transferencias de tesorería",
    resourceType: "TreasuryTransfer",
    resourceId: input.transferId,
  })

  const reason = input.reason.trim()
  if (!reason) {
    throw new Error("Debes indicar el motivo de la anulación")
  }

  const reversedAt = normalizeTransferDate(input.reversedAt)

  const result = await prisma.$transaction(async (tx) => {
    const original = await tx.treasuryTransfer.findFirst({
      where: {
        id: input.transferId,
        accountId: user.accountId,
      },
      include: {
        reversedByTransfer: { select: { id: true } },
        fromTreasuryAccount: { select: { id: true, name: true } },
        toTreasuryAccount: { select: { id: true, name: true } },
      },
    })

    if (!original) {
      throw new Error("Transferencia no encontrada")
    }

    if (original.reversesTransferId) {
      throw new Error("No se puede anular una transferencia que ya es reverso")
    }

    if (original.status !== "ACTIVE" || original.reversedByTransfer) {
      throw new Error("La transferencia ya fue reversada")
    }

    const reverseTransfer = await tx.treasuryTransfer.create({
      data: {
        accountId: user.accountId,
        fromTreasuryAccountId: original.toTreasuryAccountId,
        toTreasuryAccountId: original.fromTreasuryAccountId,
        amountCents: original.amountCents,
        transferredAt: reversedAt,
        note: `Reverso de ${formatTransferReference(original.id)}. Motivo: ${reason}`,
        createdByUserId: user.id,
        status: "ACTIVE",
        reversesTransferId: original.id,
      },
    })

    await tx.treasuryTransfer.update({
      where: { id: original.id },
      data: { status: "REVERSED" },
    })

    await logAuditEvent(
      {
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "TREASURY_TRANSFER_CREATED",
        resourceType: "TreasuryTransfer",
        resourceId: reverseTransfer.id,
        details: {
          isReversal: true,
          reversesTransferId: original.id,
          fromTreasuryAccountId: original.toTreasuryAccountId,
          fromTreasuryAccountName: original.toTreasuryAccount.name,
          toTreasuryAccountId: original.fromTreasuryAccountId,
          toTreasuryAccountName: original.fromTreasuryAccount.name,
          amountCents: original.amountCents,
          transferredAt: reversedAt.toISOString(),
          reason,
        },
      },
      tx
    )

    await logAuditEvent(
      {
        accountId: user.accountId,
        userId: user.id,
        userEmail: user.email ?? null,
        userUsername: user.username ?? null,
        action: "TREASURY_TRANSFER_REVERSED",
        resourceType: "TreasuryTransfer",
        resourceId: original.id,
        details: {
          reverseTransferId: reverseTransfer.id,
          reason,
          reversedAt: reversedAt.toISOString(),
          originalStatus: original.status,
          newStatus: "REVERSED",
        },
      },
      tx
    )

    return {
      originalId: original.id,
      reverseId: reverseTransfer.id,
    }
  })

  revalidatePath("/treasury")

  return {
    ...result,
    originalReference: formatTransferReference(result.originalId),
    reverseReference: formatTransferReference(result.reverseId),
  }
}

function groupByAccount(movements: Movement[]) {
  const map = new Map<string, { inCents: number; outCents: number }>()

  for (const movement of movements) {
    const current = map.get(movement.treasuryAccountId) ?? { inCents: 0, outCents: 0 }
    if (movement.direction === "IN") {
      current.inCents += movement.amountCents
    } else {
      current.outCents += movement.amountCents
    }
    map.set(movement.treasuryAccountId, current)
  }

  return map
}

function getFromTo(input?: DateRangeInput) {
  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate
  return {
    from: startOfDay(fromDate),
    to: endOfDay(toDate),
  }
}

export async function getTreasuryDashboard(input?: DateRangeInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  assertCanViewTreasury(user)
  const canReverseTransfers = hasPermission(user, "canReverseTreasuryTransfers", {
    allowAdminBypass: false,
  })

  const { from, to } = getFromTo(input)

  await ensureDefaultTreasuryAccount(prisma, user.accountId, user.id)

  const [
    treasuryAccounts,
    openingBalances,
    sales,
    arPayments,
    purchases,
    expenses,
    returns,
    transfers,
  ] = await Promise.all([
    prisma.treasuryAccount.findMany({
      where: { accountId: user.accountId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.treasuryOpeningBalance.findMany({
      where: {
        accountId: user.accountId,
        effectiveAt: { lte: to },
      },
      orderBy: { effectiveAt: "asc" },
      select: {
        id: true,
        treasuryAccountId: true,
        amountCents: true,
        effectiveAt: true,
        note: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        accountId: user.accountId,
        type: "CONTADO",
        cancelledAt: null,
        soldAt: { lte: to },
      },
      select: {
        id: true,
        invoiceCode: true,
        soldAt: true,
        paymentMethod: true,
        transferBankName: true,
        treasuryAccountId: true,
        totalCents: true,
        payments: {
          select: {
            id: true,
            method: true,
            amountCents: true,
            transferBankName: true,
            treasuryAccountId: true,
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        ar: { sale: { accountId: user.accountId } },
        cancelledAt: null,
        paidAt: { lte: to },
      },
      select: {
        id: true,
        receiptCode: true,
        paidAt: true,
        amountCents: true,
        method: true,
        transferBankName: true,
        treasuryAccountId: true,
      },
    }),
    prisma.purchase.findMany({
      where: {
        accountId: user.accountId,
        cancelledAt: null,
        purchasedAt: { lte: to },
        treasuryAccountId: { not: null },
      },
      select: {
        id: true,
        purchasedAt: true,
        totalCents: true,
        paymentMethod: true,
        treasuryAccountId: true,
        supplierName: true,
      },
    }),
    prisma.operatingExpense.findMany({
      where: {
        accountId: user.accountId,
        expenseDate: { lte: to },
        treasuryAccountId: { not: null },
      },
      select: {
        id: true,
        expenseDate: true,
        amountCents: true,
        paymentMethod: true,
        treasuryAccountId: true,
        description: true,
      },
    }),
    prisma.return.findMany({
      where: {
        accountId: user.accountId,
        cancelledAt: null,
        returnedAt: { lte: to },
        sale: { type: "CONTADO" },
        refundTreasuryAccountId: { not: null },
      },
      select: {
        id: true,
        returnCode: true,
        returnedAt: true,
        totalCents: true,
        refundMethod: true,
        refundTreasuryAccountId: true,
      },
    }),
    prisma.treasuryTransfer.findMany({
      where: {
        accountId: user.accountId,
        transferredAt: { lte: to },
      },
      orderBy: { transferredAt: "asc" },
      select: {
        id: true,
        fromTreasuryAccountId: true,
        toTreasuryAccountId: true,
        amountCents: true,
        transferredAt: true,
        note: true,
        status: true,
        reversesTransferId: true,
        reversedByTransfer: {
          select: {
            id: true,
          },
        },
      },
    }),
  ])

  const accountById = new Map(
    treasuryAccounts.map((account) => [account.id, account])
  )

  const movements: Movement[] = []

  for (const opening of openingBalances) {
    const account = accountById.get(opening.treasuryAccountId)
    if (!account) continue

    movements.push({
      id: `opening:${opening.id}`,
      source: "OPENING_BALANCE",
      direction: opening.amountCents >= 0 ? "IN" : "OUT",
      amountCents: Math.abs(opening.amountCents),
      occurredAt: opening.effectiveAt,
      method: null,
      treasuryAccountId: account.id,
      treasuryAccountName: account.name,
      reference: "Saldo inicial",
      note: opening.note,
    })
  }

  for (const sale of sales) {
    if (sale.payments.length > 0) {
      for (const split of sale.payments) {
        if (!split.treasuryAccountId) continue
        const account = accountById.get(split.treasuryAccountId)
        if (!account) continue

        movements.push({
          id: `sale-split:${split.id}`,
          source: "SALE_CASH",
          direction: "IN",
          amountCents: split.amountCents,
          occurredAt: sale.soldAt,
          method: split.method,
          treasuryAccountId: account.id,
          treasuryAccountName: account.name,
          reference: sale.invoiceCode,
          note:
            split.method === "TRANSFERENCIA"
              ? getTransferBankNameFromTreasuryAccount(account)
              : split.transferBankName,
        })
      }
      continue
    }

    if (!sale.treasuryAccountId || !sale.paymentMethod) continue
    const account = accountById.get(sale.treasuryAccountId)
    if (!account) continue

    movements.push({
      id: `sale:${sale.id}`,
      source: "SALE_CASH",
      direction: "IN",
      amountCents: sale.totalCents,
      occurredAt: sale.soldAt,
      method: sale.paymentMethod,
      treasuryAccountId: account.id,
      treasuryAccountName: account.name,
      reference: sale.invoiceCode,
      note:
        sale.paymentMethod === "TRANSFERENCIA"
          ? getTransferBankNameFromTreasuryAccount(account)
          : sale.transferBankName,
    })
  }

  for (const payment of arPayments) {
    if (!payment.treasuryAccountId) continue
    const account = accountById.get(payment.treasuryAccountId)
    if (!account) continue

    movements.push({
      id: `payment:${payment.id}`,
      source: "AR_PAYMENT",
      direction: "IN",
      amountCents: payment.amountCents,
      occurredAt: payment.paidAt,
      method: payment.method,
      treasuryAccountId: account.id,
      treasuryAccountName: account.name,
      reference: payment.receiptCode,
      note:
        payment.method === "TRANSFERENCIA"
          ? getTransferBankNameFromTreasuryAccount(account)
          : payment.transferBankName,
    })
  }

  for (const purchase of purchases) {
    const accountId = purchase.treasuryAccountId
    if (!accountId) continue
    const account = accountById.get(accountId)
    if (!account) continue

    movements.push({
      id: `purchase:${purchase.id}`,
      source: "PURCHASE",
      direction: "OUT",
      amountCents: purchase.totalCents,
      occurredAt: purchase.purchasedAt,
      method: purchase.paymentMethod,
      treasuryAccountId: account.id,
      treasuryAccountName: account.name,
      reference: "Compra",
      note: purchase.supplierName || null,
    })
  }

  for (const expense of expenses) {
    const accountId = expense.treasuryAccountId
    if (!accountId) continue
    const account = accountById.get(accountId)
    if (!account) continue

    movements.push({
      id: `expense:${expense.id}`,
      source: "OPERATING_EXPENSE",
      direction: "OUT",
      amountCents: expense.amountCents,
      occurredAt: expense.expenseDate,
      method: expense.paymentMethod,
      treasuryAccountId: account.id,
      treasuryAccountName: account.name,
      reference: "Gasto",
      note: expense.description,
    })
  }

  for (const ret of returns) {
    const accountId = ret.refundTreasuryAccountId
    if (!accountId) continue
    const account = accountById.get(accountId)
    if (!account) continue

    movements.push({
      id: `return:${ret.id}`,
      source: "CASH_RETURN",
      direction: "OUT",
      amountCents: ret.totalCents,
      occurredAt: ret.returnedAt,
      method: ret.refundMethod,
      treasuryAccountId: account.id,
      treasuryAccountName: account.name,
      reference: ret.returnCode,
      note: null,
    })
  }

  for (const transfer of transfers) {
    const fromAccount = accountById.get(transfer.fromTreasuryAccountId)
    const toAccount = accountById.get(transfer.toTreasuryAccountId)
    if (!fromAccount || !toAccount) continue

    const reference = formatTransferReference(transfer.id)
    const reversalTrace = transfer.reversesTransferId
      ? `Revierte ${formatTransferReference(transfer.reversesTransferId)}`
      : transfer.reversedByTransfer
        ? `Revertida por ${formatTransferReference(transfer.reversedByTransfer.id)}`
        : null
    const transferOutTrace = reversalTrace
      ? `Hacia ${toAccount.name} · ${reversalTrace}`
      : `Hacia ${toAccount.name}`
    const transferInTrace = reversalTrace
      ? `Desde ${fromAccount.name} · ${reversalTrace}`
      : `Desde ${fromAccount.name}`

    const canReverseTransfer =
      canReverseTransfers &&
      transfer.status === "ACTIVE" &&
      !transfer.reversesTransferId &&
      !transfer.reversedByTransfer

    movements.push({
      id: `transfer-out:${transfer.id}`,
      source: "TREASURY_TRANSFER",
      direction: "OUT",
      amountCents: transfer.amountCents,
      occurredAt: transfer.transferredAt,
      method: null,
      treasuryAccountId: fromAccount.id,
      treasuryAccountName: fromAccount.name,
      reference,
      note: transfer.note,
      transferId: transfer.id,
      transferStatus: transfer.status,
      transferTrace: transferOutTrace,
      canReverseTransfer,
    })

    movements.push({
      id: `transfer-in:${transfer.id}`,
      source: "TREASURY_TRANSFER",
      direction: "IN",
      amountCents: transfer.amountCents,
      occurredAt: transfer.transferredAt,
      method: null,
      treasuryAccountId: toAccount.id,
      treasuryAccountName: toAccount.name,
      reference,
      note: transfer.note,
      transferId: transfer.id,
      transferStatus: transfer.status,
      transferTrace: transferInTrace,
      canReverseTransfer: false,
    })
  }

  const balancesByAccount = groupByAccount(movements)

  const accounts = treasuryAccounts.map((account) => {
    const totals = balancesByAccount.get(account.id) ?? { inCents: 0, outCents: 0 }
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      isActive: account.isActive,
      inCents: totals.inCents,
      outCents: totals.outCents,
      balanceCents: totals.inCents - totals.outCents,
    }
  })

  const sortedMovements = movements
    .filter((movement) => movement.occurredAt >= from && movement.occurredAt <= to)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

  return {
    from,
    to,
    accounts,
    movements: sortedMovements,
    totals: {
      inCents: sortedMovements
        .filter((movement) => movement.direction === "IN")
        .reduce((sum, movement) => sum + movement.amountCents, 0),
      outCents: sortedMovements
        .filter((movement) => movement.direction === "OUT")
        .reduce((sum, movement) => sum + movement.amountCents, 0),
      balanceCents: accounts.reduce((sum, account) => sum + account.balanceCents, 0),
    },
  }
}

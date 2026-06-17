import type { Prisma, TreasuryAccount } from "@prisma/client"

import { getRawPrismaClient, prisma } from "@/lib/db"

export type TreasuryMovementDirection = "IN" | "OUT"

const DEFAULT_CASH_ACCOUNT_NAME = "Caja Efectivo"
const LEGACY_CASH_ACCOUNT_NAMES = new Set(["Caja principal", "CaJA efectivo"])

export class TreasuryAccountValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TreasuryAccountValidationError"
  }
}

function getTreasuryAccountDelegate(db: Prisma.TransactionClient | typeof prisma) {
  const delegate = (db as any)?.treasuryAccount
  if (delegate) return delegate

  const rawDelegate = (getRawPrismaClient() as any)?.treasuryAccount
  if (rawDelegate) return rawDelegate

  // Comentario preventivo: si esto falla, normalmente el cliente Prisma quedó desactualizado.
  throw new Error(
    "Cliente Prisma sin modelo treasuryAccount. Ejecuta `npx prisma generate` y reinicia el servidor."
  )
}

export async function ensureDefaultTreasuryAccount(
  db: Prisma.TransactionClient | typeof prisma,
  accountId: string,
  createdByUserId?: string | null
): Promise<TreasuryAccount> {
  const treasuryAccount = getTreasuryAccountDelegate(db)
  const existing = await treasuryAccount.findFirst({
    where: { accountId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  })

  if (existing) {
    if (existing.type === "CAJA" && LEGACY_CASH_ACCOUNT_NAMES.has(existing.name)) {
      return treasuryAccount.update({
        where: { id: existing.id },
        data: { name: DEFAULT_CASH_ACCOUNT_NAME },
      })
    }
    return existing
  }

  return treasuryAccount.create({
    data: {
      accountId,
      name: DEFAULT_CASH_ACCOUNT_NAME,
      type: "CAJA",
      currency: "DOP",
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    },
  })
}

export async function listTreasuryAccountsByAccount(accountId: string, includeInactive = false) {
  await ensureDefaultTreasuryAccount(prisma, accountId)

  return prisma.treasuryAccount.findMany({
    where: {
      accountId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  })
}

export async function requireTreasuryAccount(
  db: Prisma.TransactionClient | typeof prisma,
  input: {
    accountId: string
    treasuryAccountId: string
    requireActive?: boolean
    message?: string
  }
): Promise<TreasuryAccount> {
  const treasuryAccount = getTreasuryAccountDelegate(db)
  const account = await treasuryAccount.findFirst({
    where: {
      id: input.treasuryAccountId,
      accountId: input.accountId,
      ...(input.requireActive ? { isActive: true } : {}),
    },
  })

  if (!account) {
    // Comentario preventivo: una cuenta inactiva/cacheada del móvil es una validación del cliente,
    // no un fallo interno. Las rutas deben devolver 400 para no disparar alertas 500.
    throw new TreasuryAccountValidationError(input.message ?? "Cuenta de tesorería no encontrada")
  }

  return account
}

export async function resolveTreasuryAccountFromLegacyBankName(
  db: Prisma.TransactionClient | typeof prisma,
  input: {
    accountId: string
    transferBankName?: string | null
    requireActive?: boolean
  }
): Promise<TreasuryAccount | null> {
  const bankName = input.transferBankName?.trim()
  if (!bankName) return null

  const treasuryAccount = getTreasuryAccountDelegate(db)
  return treasuryAccount.findFirst({
    where: {
      accountId: input.accountId,
      ...(input.requireActive ? { isActive: true } : {}),
      OR: [
        { bankName: { equals: bankName, mode: "insensitive" } },
        { name: { equals: bankName, mode: "insensitive" } },
      ],
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  })
}

export function getTransferBankNameFromTreasuryAccount(account: { name: string; bankName: string | null }) {
  return account.bankName?.trim() || account.name
}

export function getTreasuryAccountDisplayName(account: { name: string; bankName: string | null; type: string }) {
  if (account.bankName && account.bankName !== account.name) {
    return `${account.name} (${account.bankName})`
  }
  return account.name
}

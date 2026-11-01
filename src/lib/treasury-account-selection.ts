import { PaymentMethod } from "@prisma/client"

type TreasuryAccountLike = {
  id: string
  name: string
  type: string
  cashControlEnabled?: boolean
  cashControlled?: boolean
}

const CASH_ACCOUNT_NAME = "caja efectivo"
export const CREATE_TREASURY_ACCOUNT_OPTION_VALUE = "__create_treasury_account__"
export const CREATE_TREASURY_ACCOUNT_URL = "/treasury?newAccount=1"

export function isCreateTreasuryAccountOption(value?: string | null) {
  return value === CREATE_TREASURY_ACCOUNT_OPTION_VALUE
}

function isCashAccount(account: TreasuryAccountLike) {
  return account.type === "CAJA"
}

function isBankAccount(account: TreasuryAccountLike) {
  return account.type === "BANCO"
}

function isPreferredCashAccount(account: TreasuryAccountLike) {
  return isCashAccount(account) && account.name.trim().toLocaleLowerCase("es") === CASH_ACCOUNT_NAME
}

export function filterTreasuryAccountsByPaymentMethod<T extends TreasuryAccountLike>(
  accounts: T[],
  method: PaymentMethod | null | undefined
) {
  const controlled = accounts.find(account => account.cashControlEnabled && account.cashControlled)
  if (controlled) {
    // El nombre de una cuenta no determina la caja: usar el ID configurado para este negocio.
    return method === PaymentMethod.EFECTIVO ? accounts.filter(account => account.id === controlled.id) : accounts.filter(isBankAccount)
  }
  if (method === PaymentMethod.EFECTIVO) {
    const preferredCashAccounts = accounts.filter(isPreferredCashAccount)
    if (preferredCashAccounts.length > 0) return preferredCashAccounts
    return accounts.filter(isCashAccount)
  }

  if (method === PaymentMethod.TRANSFERENCIA) {
    return accounts.filter(isBankAccount)
  }

  return accounts
}

export function pickTreasuryAccountIdForPaymentMethod<T extends TreasuryAccountLike>(
  accounts: T[],
  method: PaymentMethod | null | undefined,
  currentAccountId?: string | null
) {
  const available = filterTreasuryAccountsByPaymentMethod(accounts, method)
  if (available.length === 0) return ""

  if (currentAccountId && available.some((account) => account.id === currentAccountId)) {
    return currentAccountId
  }

  if (method === PaymentMethod.EFECTIVO) {
    const preferred = available.find(isPreferredCashAccount)
    if (preferred) return preferred.id
  }

  return available[0].id
}

"use server"

import { getCurrentUser } from "@/lib/auth"
import type { CurrentUser } from "@/lib/auth"
import {
  getBillingSubscription,
  getBillingProfile,
  getBillingState,
  getPaymentHistory,
  upsertBillingProfile,
  createManualPayment,
  uploadPaymentProof,
  requestCurrencyChange,
  cancelCurrencyChange,
  getLemonCheckoutUrl,
  getBankAccounts,
  getBankAccountById,
  type BillingState,
  type BankAccountInfo,
} from "@/lib/billing"
import { logAuditEvent } from "@/lib/audit-log"
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit"
import { logError, ErrorCodes } from "@/lib/error-logger"
import type {
  BillingSubscription,
  BillingProfile,
  BillingPayment,
  BillingCurrency,
  BillingProvider,
} from "@prisma/client"

// ==========================================
// GET BILLING DATA
// ==========================================

export async function getBillingData(): Promise<{
  subscription: BillingSubscription | null
  profile: BillingProfile | null
  state: BillingState
  payments: (BillingPayment & { proofs: { id: string; url: string }[] })[]
  bankAccounts: BankAccountInfo[]
} | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const [subscription, profile, state, payments, bankAccounts] = await Promise.all([
    getBillingSubscription(user.accountId),
    getBillingProfile(user.accountId),
    getBillingState(user.accountId),
    getPaymentHistory(user.accountId),
    getBankAccounts(),
  ])

  if (process.env.NODE_ENV === "development") {
    console.log("[Billing:getBillingData] accountId:", user.accountId)
    console.log("[Billing:getBillingData] subscription:", subscription?.id || null)
    console.log("[Billing:getBillingData] state:", state?.status)
    console.log("[Billing:getBillingData] payments:", payments?.length ?? 0)
    console.log("[Billing:getBillingData] bankAccounts:", bankAccounts?.length ?? 0)
  }

  return {
    subscription,
    profile,
    state,
    payments,
    bankAccounts,
  }
}

// ==========================================
// BILLING PROFILE
// ==========================================

export async function saveBillingProfile(data: {
  legalName: string
  taxId: string
  address: string
  email: string
  phone?: string
}): Promise<{ success: boolean; error?: string }> {
  let user: CurrentUser | null = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "No autenticado" }
    }

    // Validaciones básicas
    if (!data.legalName?.trim()) {
      return { success: false, error: "El nombre legal es requerido" }
    }
    if (!data.taxId?.trim()) {
      return { success: false, error: "La cédula o RNC es requerida" }
    }
    if (!data.address?.trim()) {
      return { success: false, error: "La dirección es requerida" }
    }
    if (!data.email?.trim()) {
      return { success: false, error: "El email es requerido" }
    }

    await upsertBillingProfile(user.accountId, {
      legalName: data.legalName.trim(),
      taxId: data.taxId.trim(),
      address: data.address.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim(),
    })

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "SETTINGS_CHANGED",
      resourceType: "BillingProfile",
      details: { action: "profile_updated" },
    })

    return { success: true }
  } catch (error) {
    console.error("Error saving billing profile:", error)
    await logError(error as Error, {
      code: ErrorCodes.BILLING_SUBSCRIPTION_ERROR,
      endpoint: "/billing/actions/saveBillingProfile",
      accountId: user?.accountId,
      userId: user?.id,
      metadata: { action: "save_billing_profile" },
    })
    return { success: false, error: "Error al guardar el perfil" }
  }
}

// ==========================================
// MANUAL PAYMENT (DOP)
// ==========================================

export async function createDopPayment(bankAccountId: string): Promise<{
  success: boolean
  paymentId?: string
  error?: string
}> {
  let user: CurrentUser | null = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "No autenticado" }
    }

    if (!bankAccountId) {
      return { success: false, error: "Debes seleccionar una cuenta bancaria" }
    }

    // Verificar que la cuenta bancaria existe
    const bankAccount = await getBankAccountById(bankAccountId)
    if (!bankAccount) {
      return { success: false, error: "Cuenta bancaria no encontrada" }
    }

    const subscription = await getBillingSubscription(user.accountId)
    if (!subscription) {
      return { success: false, error: "No hay suscripción activa" }
    }

    const payment = await createManualPayment(
      subscription.id,
      subscription.priceDopCents,
      bankAccountId
    )

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "PAYMENT_CREATED",
      resourceType: "BillingPayment",
      resourceId: payment.id,
      details: { 
        currency: "DOP", 
        amountCents: subscription.priceDopCents,
        bankAccountId,
        bankName: bankAccount.bankName,
      },
    })

    return { success: true, paymentId: payment.id }
  } catch (error) {
    console.error("Error creating DOP payment:", error)
    await logError(error as Error, {
      code: ErrorCodes.BILLING_PAYMENT_FAILED,
      severity: "HIGH",
      endpoint: "/billing/actions/createDopPayment",
      accountId: user?.accountId,
      userId: user?.id,
      metadata: { action: "create_dop_payment", bankAccountId },
    })
    return { success: false, error: "Error al crear el pago" }
  }
}

export async function submitPaymentProof(
  paymentId: string,
  proofUrl: string,
  amountCents?: number,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  let user: CurrentUser | null = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "No autenticado" }
    }

    if (!proofUrl?.trim()) {
      return { success: false, error: "La URL del comprobante es requerida" }
    }

    // 🔐 RATE LIMITING - evitar spam de comprobantes (intencional o accidental)
    try {
      checkRateLimit(`payment-proof:user:${user.accountId}:${user.id}`, {
        windowMs: 10 * 60 * 1000, // 10 min
        maxRequests: 10,
        blockDurationMs: 10 * 60 * 1000,
      })
      checkRateLimit(`payment-proof:payment:${user.accountId}:${paymentId}`, {
        windowMs: 10 * 60 * 1000, // 10 min
        maxRequests: 5,
        blockDurationMs: 10 * 60 * 1000,
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return {
          success: false,
          error: `Demasiados intentos. Intenta de nuevo en ${error.retryAfter} segundos.`,
        }
      }
    }

    const { isFirstProof } = await uploadPaymentProof(
      paymentId,
      proofUrl,
      amountCents,
      note
    )

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "SETTINGS_CHANGED",
      resourceType: "BillingPaymentProof",
      details: { paymentId, isFirstProof, action: "proof_uploaded" },
    })

    if (isFirstProof) {
      await logAuditEvent({
        accountId: user.accountId,
        userId: user.id,
        action: "SETTINGS_CHANGED",
        resourceType: "BillingSubscription",
        details: { newStatus: "ACTIVE", reason: "first_proof_uploaded" },
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Error submitting payment proof:", error)
    await logError(error as Error, {
      code: ErrorCodes.BILLING_PAYMENT_FAILED,
      severity: "HIGH",
      endpoint: "/billing/actions/submitPaymentProof",
      accountId: user?.accountId,
      userId: user?.id,
      metadata: { action: "submit_payment_proof", paymentId },
    })
    return { success: false, error: "Error al subir el comprobante" }
  }
}

// ==========================================
// USD PAYMENT (LEMON SQUEEZY)
// ==========================================

export async function getUsdCheckoutUrl(): Promise<{
  success: boolean
  url?: string
  error?: string
}> {
  let user: CurrentUser | null = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "No autenticado" }
    }

    const profile = await getBillingProfile(user.accountId)
    const url = await getLemonCheckoutUrl(user.accountId, profile?.email)

    return { success: true, url }
  } catch (error) {
    console.error("Error getting checkout URL:", error)
    await logError(error as Error, {
      code: ErrorCodes.BILLING_PAYMENT_FAILED,
      severity: "HIGH",
      endpoint: "/billing/actions/getUsdCheckoutUrl",
      accountId: user?.accountId,
      userId: user?.id,
      metadata: { action: "get_usd_checkout_url" },
    })
    return { success: false, error: "Error al obtener URL de pago. Verifica que Lemon Squeezy esté configurado." }
  }
}

// ==========================================
// CURRENCY CHANGE
// ==========================================

export async function changeCurrency(
  newCurrency: BillingCurrency,
  newProvider: BillingProvider
): Promise<{ success: boolean; error?: string }> {
  let user: CurrentUser | null = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "No autenticado" }
    }

    await requestCurrencyChange(user.accountId, newCurrency, newProvider)

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      action: "SETTINGS_CHANGED",
      resourceType: "BillingSubscription",
      details: { newCurrency, newProvider, status: "pending", action: "currency_change_requested" },
    })

    return { success: true }
  } catch (error) {
    console.error("Error changing currency:", error)
    await logError(error as Error, {
      code: ErrorCodes.BILLING_SUBSCRIPTION_ERROR,
      endpoint: "/billing/actions/changeCurrency",
      accountId: user?.accountId,
      userId: user?.id,
      metadata: { action: "change_currency", newCurrency, newProvider },
    })
    return { success: false, error: "Error al cambiar la moneda" }
  }
}

export async function cancelPendingCurrencyChange(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "No autenticado" }
    }

    await cancelCurrencyChange(user.accountId)

    return { success: true }
  } catch (error) {
    console.error("Error canceling currency change:", error)
    return { success: false, error: "Error al cancelar el cambio" }
  }
}

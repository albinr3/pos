/**
 * Sistema de Billing para MOVOPos
 * 
 * Maneja:
 * - Trial de 15 días
 * - Pagos USD (Lemon Squeezy) y DOP (transferencia)
 * - Estados: trialing, active, grace, blocked, canceled
 * - Transiciones de estado automáticas
 */

import type {
  BillingStatus,
  BillingCurrency,
  BillingProvider,
  BillingPaymentStatus,
  ManualVerificationStatus,
  BillingSubscription,
  BillingPayment,
  BillingProfile,
} from "@prisma/client"
import { addDays, isBefore, isAfter, differenceInDays } from "date-fns"

// ==========================================
// CONSTANTS
// ==========================================

export const TRIAL_DAYS = 15
export const GRACE_DAYS = 3
export const BILLING_CYCLE_DAYS = 30

// Precios por defecto (en centavos)
export const DEFAULT_PRICE_USD_CENTS = 2000 // $20.00 USD
export const DEFAULT_PRICE_DOP_CENTS = 130000 // RD$1,300 DOP

// Días antes de vencimiento para enviar notificaciones
export const NOTIFICATION_DAYS = {
  trial: [7, 3, 2, 1, 0],
  due: [3, 2, 1, 0],
  grace: [2, 1, 0],
}

// ==========================================
// TYPES
// ==========================================

export type BillingState = {
  status: BillingStatus
  isBlocked: boolean
  isTrialing: boolean
  isActive: boolean
  isGrace: boolean
  daysRemaining: number | null
  trialDaysRemaining: number | null
  graceDaysRemaining: number | null
  currentPeriodEndsAt: Date | null
  canAccessApp: boolean
  needsPayment: boolean
  currency: BillingCurrency
  provider: BillingProvider
  priceInCents: number
}

export type CreateSubscriptionInput = {
  accountId: string
}

export type ProcessPaymentInput = {
  subscriptionId: string
  amountCents: number
  currency: BillingCurrency
  provider: BillingProvider
  reference?: string
  externalId?: string
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getPrisma() {
  // Importación dinámica para evitar problemas de inicialización
  return import("@/lib/db").then(({ prisma }) => prisma)
}

/**
 * Calcula el estado actual de billing basado en la suscripción
 */
export function calculateBillingState(
  subscription: BillingSubscription | null
): BillingState {
  const now = new Date()

  // Si no hay suscripción, está bloqueado
  if (!subscription) {
    return {
      status: "BLOCKED",
      isBlocked: true,
      isTrialing: false,
      isActive: false,
      isGrace: false,
      daysRemaining: null,
      trialDaysRemaining: null,
      graceDaysRemaining: null,
      currentPeriodEndsAt: null,
      canAccessApp: false,
      needsPayment: true,
      currency: "DOP",
      provider: "MANUAL",
      priceInCents: DEFAULT_PRICE_DOP_CENTS,
    }
  }

  const {
    status,
    currency,
    provider,
    trialEndsAt,
    currentPeriodEndsAt,
    graceEndsAt,
    priceUsdCents,
    priceDopCents,
    manualVerificationStatus,
    manualAccessGrantedAt,
  } = subscription

  const priceInCents = currency === "USD" ? priceUsdCents : priceDopCents

  // Calcular días restantes según el estado
  let daysRemaining: number | null = null
  let trialDaysRemaining: number | null = null
  let graceDaysRemaining: number | null = null

  if (status === "TRIALING" && trialEndsAt) {
    trialDaysRemaining = Math.max(0, differenceInDays(trialEndsAt, now))
    daysRemaining = trialDaysRemaining
  } else if (status === "ACTIVE" && currentPeriodEndsAt) {
    daysRemaining = Math.max(0, differenceInDays(currentPeriodEndsAt, now))
  } else if (status === "GRACE" && graceEndsAt) {
    graceDaysRemaining = Math.max(0, differenceInDays(graceEndsAt, now))
    daysRemaining = graceDaysRemaining
  }

  // Determinar si puede acceder a la app
  let canAccessApp = false
  if (status === "TRIALING") {
    canAccessApp = trialEndsAt ? isBefore(now, trialEndsAt) : true
  } else if (status === "ACTIVE") {
    canAccessApp = true
  } else if (status === "GRACE") {
    canAccessApp = graceEndsAt ? isBefore(now, graceEndsAt) : false
  } else if (status === "BLOCKED" || status === "CANCELED") {
    canAccessApp = false
  }

  // Para pagos manuales con comprobante subido pero pendiente de verificación,
  // permitir acceso mientras esté pendiente
  if (
    provider === "MANUAL" &&
    manualVerificationStatus === "PENDING" &&
    manualAccessGrantedAt
  ) {
    canAccessApp = true
  }

  return {
    status,
    isBlocked: status === "BLOCKED",
    isTrialing: status === "TRIALING",
    isActive: status === "ACTIVE",
    isGrace: status === "GRACE",
    daysRemaining,
    trialDaysRemaining,
    graceDaysRemaining,
    currentPeriodEndsAt,
    canAccessApp,
    needsPayment: status === "BLOCKED" || status === "GRACE" || 
      (status === "TRIALING" && trialDaysRemaining !== null && trialDaysRemaining <= 3),
    currency,
    provider,
    priceInCents,
  }
}

// ==========================================
// SUBSCRIPTION MANAGEMENT
// ==========================================

/**
 * Crea una nueva suscripción en estado trial para un Account
 * Se llama cuando se crea el primer usuario owner
 * Asigna automáticamente el plan por defecto si existe
 */
export async function createBillingSubscription(
  input: CreateSubscriptionInput
): Promise<BillingSubscription> {
  const prisma = await getPrisma()
  const now = new Date()
  const trialEndsAt = addDays(now, TRIAL_DAYS)

  // Buscar el plan por defecto
  const defaultPlan = await prisma.billingPlan.findFirst({
    where: { isDefault: true, isActive: true },
  })

  const subscription = await prisma.billingSubscription.create({
    data: {
      accountId: input.accountId,
      status: "TRIALING",
      currency: "DOP",
      provider: "MANUAL",
      trialStartedAt: now,
      trialEndsAt,
      billingPlanId: defaultPlan?.id || null,
      priceUsdCents: defaultPlan?.priceUsdCents || DEFAULT_PRICE_USD_CENTS,
      priceDopCents: defaultPlan?.priceDopCents || DEFAULT_PRICE_DOP_CENTS,
    },
  })

  return subscription
}

/**
 * Obtiene la suscripción de billing de un Account
 */
export async function getBillingSubscription(
  accountId: string
): Promise<BillingSubscription | null> {
  const prisma = await getPrisma()
  return prisma.billingSubscription.findUnique({
    where: { accountId },
  })
}

/**
 * Obtiene el estado de billing de un Account
 */
export async function getBillingState(accountId: string): Promise<BillingState> {
  const subscription = await getBillingSubscription(accountId)
  return calculateBillingState(subscription)
}

/**
 * Verifica si una cuenta está bloqueada
 */
export async function isAccountBlocked(accountId: string): Promise<boolean> {
  const state = await getBillingState(accountId)
  return !state.canAccessApp
}

// ==========================================
// PAYMENT PROCESSING
// ==========================================

/**
 * Crea un pago pendiente (para transferencias manuales)
 */
export async function createManualPayment(
  subscriptionId: string,
  amountCents: number,
  bankAccountId: string,
  reference?: string
): Promise<BillingPayment> {
  const prisma = await getPrisma()
  
  const subscription = await prisma.billingSubscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    throw new Error("Subscription not found")
  }

  // Verificar que la cuenta bancaria existe y está activa
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { id: bankAccountId },
  })

  if (!bankAccount || !bankAccount.isActive) {
    throw new Error("Bank account not found or inactive")
  }

  const payment = await prisma.billingPayment.create({
    data: {
      subscriptionId,
      amountCents,
      currency: "DOP",
      provider: "MANUAL",
      status: "PENDING",
      bankAccountId,
      reference,
    },
  })

  return payment
}

/**
 * Registra un comprobante de pago y activa el acceso
 */
export async function uploadPaymentProof(
  paymentId: string,
  proofUrl: string,
  amountCents?: number,
  note?: string
): Promise<{ payment: BillingPayment; isFirstProof: boolean }> {
  const prisma = await getPrisma()

  const payment = await prisma.billingPayment.findUnique({
    where: { id: paymentId },
    include: { subscription: true, proofs: true },
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  const isFirstProof = payment.proofs.length === 0

  // Crear el comprobante
  await prisma.billingPaymentProof.create({
    data: {
      paymentId,
      url: proofUrl,
      amountCents,
      note,
    },
  })

  // Si es el primer comprobante, activar acceso inmediato
  if (isFirstProof) {
    const now = new Date()
    const periodEndsAt = addDays(now, BILLING_CYCLE_DAYS)

    await prisma.billingSubscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: "ACTIVE",
        manualVerificationStatus: "PENDING",
        manualAccessGrantedAt: now,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEndsAt,
        graceEndsAt: null,
      },
    })

    // Actualizar el pago con el período
    await prisma.billingPayment.update({
      where: { id: paymentId },
      data: {
        periodStartsAt: now,
        periodEndsAt,
      },
    })
  }

  const updatedPayment = await prisma.billingPayment.findUnique({
    where: { id: paymentId },
  })

  return { payment: updatedPayment!, isFirstProof }
}

/**
 * Aprueba un pago manual (para panel admin)
 */
export async function approveManualPayment(
  paymentId: string
): Promise<BillingPayment> {
  const prisma = await getPrisma()

  const payment = await prisma.billingPayment.findUnique({
    where: { id: paymentId },
    include: { subscription: true },
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  const now = new Date()

  // Actualizar el pago
  const updatedPayment = await prisma.billingPayment.update({
    where: { id: paymentId },
    data: {
      status: "PAID",
      paidAt: now,
    },
  })

  // Actualizar la suscripción
  await prisma.billingSubscription.update({
    where: { id: payment.subscriptionId },
    data: {
      manualVerificationStatus: "APPROVED",
    },
  })

  return updatedPayment
}

/**
 * Rechaza un pago manual (para panel admin)
 */
export async function rejectManualPayment(
  paymentId: string,
  reason?: string
): Promise<BillingPayment> {
  const prisma = await getPrisma()

  const payment = await prisma.billingPayment.findUnique({
    where: { id: paymentId },
    include: { subscription: true },
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  // Actualizar el pago
  const updatedPayment = await prisma.billingPayment.update({
    where: { id: paymentId },
    data: {
      status: "REJECTED",
      rejectionReason: reason?.trim() || null,
    },
  })

  const now = new Date()
  const graceEndsAt = addDays(now, GRACE_DAYS)

  await prisma.billingSubscription.update({
    where: { id: payment.subscriptionId },
    data: {
      status: "GRACE",
      manualVerificationStatus: "REJECTED",
      graceEndsAt,
    },
  })

  return updatedPayment
}

/**
 * Procesa un pago exitoso de Lemon Squeezy
 */
export async function processLemonPayment(
  accountId: string,
  externalId: string,
  amountCents: number,
  lemonCustomerId?: string,
  lemonSubscriptionId?: string,
  periodEndsAtOverride?: Date
): Promise<BillingPayment> {
  const prisma = await getPrisma()
  const now = new Date()

  let subscription = await prisma.billingSubscription.findUnique({
    where: { accountId },
  })

  if (!subscription) {
    throw new Error("Subscription not found")
  }

  // Calcular período
  let periodStartsAt: Date
  let periodEndsAt: Date

  if (subscription.status === "TRIALING" && subscription.trialEndsAt) {
    // Si está en trial, el período empieza cuando termina el trial
    periodStartsAt = subscription.trialEndsAt
    periodEndsAt = addDays(periodStartsAt, BILLING_CYCLE_DAYS)
  } else {
    // Si no, empieza ahora
    periodStartsAt = now
    periodEndsAt = addDays(now, BILLING_CYCLE_DAYS)
  }

  if (periodEndsAtOverride && periodEndsAtOverride > periodStartsAt) {
    periodEndsAt = periodEndsAtOverride
  }

  // Crear el pago
  const payment = await prisma.billingPayment.create({
    data: {
      subscriptionId: subscription.id,
      amountCents,
      currency: "USD",
      provider: "LEMON",
      status: "PAID",
      paidAt: now,
      externalId,
      periodStartsAt,
      periodEndsAt,
    },
  })

  // Actualizar la suscripción
  await prisma.billingSubscription.update({
    where: { id: subscription.id },
    data: {
      status: "ACTIVE",
      currency: "USD",
      provider: "LEMON",
      currentPeriodStartsAt: periodStartsAt,
      currentPeriodEndsAt: periodEndsAt,
      graceEndsAt: null,
      manualVerificationStatus: "NONE",
      lemonCustomerId: lemonCustomerId || subscription.lemonCustomerId,
      lemonSubscriptionId: lemonSubscriptionId || subscription.lemonSubscriptionId,
      // Limpiar cambios pendientes si había
      pendingCurrency: null,
      pendingProvider: null,
    },
  })

  return payment
}

// ==========================================
// CURRENCY/PROVIDER CHANGE
// ==========================================

/**
 * Solicita cambio de moneda/método de pago (se aplica en el próximo ciclo)
 */
export async function requestCurrencyChange(
  accountId: string,
  newCurrency: BillingCurrency,
  newProvider: BillingProvider
): Promise<BillingSubscription> {
  const prisma = await getPrisma()

  const subscription = await prisma.billingSubscription.update({
    where: { accountId },
    data: {
      pendingCurrency: newCurrency,
      pendingProvider: newProvider,
    },
  })

  return subscription
}

/**
 * Cancela un cambio pendiente de moneda/método
 */
export async function cancelCurrencyChange(
  accountId: string
): Promise<BillingSubscription> {
  const prisma = await getPrisma()

  const subscription = await prisma.billingSubscription.update({
    where: { accountId },
    data: {
      pendingCurrency: null,
      pendingProvider: null,
    },
  })

  return subscription
}

// ==========================================
// BILLING PROFILE
// ==========================================

/**
 * Obtiene el perfil de facturación de un Account
 */
export async function getBillingProfile(
  accountId: string
): Promise<BillingProfile | null> {
  const prisma = await getPrisma()
  return prisma.billingProfile.findUnique({
    where: { accountId },
  })
}

/**
 * Crea o actualiza el perfil de facturación
 */
export async function upsertBillingProfile(
  accountId: string,
  data: {
    legalName: string
    taxId: string
    address: string
    email: string
    phone?: string
  }
): Promise<BillingProfile> {
  const prisma = await getPrisma()

  const profile = await prisma.billingProfile.upsert({
    where: { accountId },
    create: {
      accountId,
      ...data,
    },
    update: data,
  })

  return profile
}

// ==========================================
// BILLING ENGINE (for cron job)
// ==========================================

/**
 * Procesa todas las suscripciones y actualiza estados
 * Se ejecuta diariamente via cron job
 */
export async function processBillingEngine(): Promise<{
  processed: number
  trialExpired: number
  periodExpired: number
  graceExpired: number
  pendingChangesApplied: number
}> {
  const prisma = await getPrisma()
  const now = new Date()

  let trialExpired = 0
  let periodExpired = 0
  let graceExpired = 0
  let pendingChangesApplied = 0

  // 1. Procesar trials vencidos -> BLOCKED
  const expiredTrials = await prisma.billingSubscription.findMany({
    where: {
      status: "TRIALING",
      trialEndsAt: { lte: now },
    },
  })

  for (const sub of expiredTrials) {
    await prisma.billingSubscription.update({
      where: { id: sub.id },
      data: { status: "BLOCKED" },
    })
    trialExpired++
  }

  // 2. Procesar períodos vencidos -> GRACE
  const expiredPeriods = await prisma.billingSubscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEndsAt: { lte: now },
    },
  })

  for (const sub of expiredPeriods) {
    const graceEndsAt = addDays(now, GRACE_DAYS)
    await prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        status: "GRACE",
        graceEndsAt,
      },
    })
    periodExpired++
  }

  // 3. Procesar gracia vencida -> BLOCKED
  const expiredGrace = await prisma.billingSubscription.findMany({
    where: {
      status: "GRACE",
      graceEndsAt: { lte: now },
    },
  })

  for (const sub of expiredGrace) {
    await prisma.billingSubscription.update({
      where: { id: sub.id },
      data: { status: "BLOCKED" },
    })
    graceExpired++
  }

  // 4. Aplicar cambios pendientes de moneda/método al inicio del nuevo ciclo
  const withPendingChanges = await prisma.billingSubscription.findMany({
    where: {
      OR: [
        { pendingCurrency: { not: null } },
        { pendingProvider: { not: null } },
      ],
      currentPeriodEndsAt: { lte: now },
    },
  })

  for (const sub of withPendingChanges) {
    await prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        currency: sub.pendingCurrency || sub.currency,
        provider: sub.pendingProvider || sub.provider,
        pendingCurrency: null,
        pendingProvider: null,
      },
    })
    pendingChangesApplied++
  }

  const processed =
    expiredTrials.length +
    expiredPeriods.length +
    expiredGrace.length +
    withPendingChanges.length

  return {
    processed,
    trialExpired,
    periodExpired,
    graceExpired,
    pendingChangesApplied,
  }
}

// ==========================================
// PAYMENT HISTORY
// ==========================================

/**
 * Obtiene el historial de pagos de una suscripción
 */
export async function getPaymentHistory(
  accountId: string
): Promise<(BillingPayment & { proofs: { id: string; url: string }[] })[]> {
  const prisma = await getPrisma()

  const subscription = await prisma.billingSubscription.findUnique({
    where: { accountId },
  })

  if (!subscription) {
    return []
  }

  const payments = await prisma.billingPayment.findMany({
    where: { subscriptionId: subscription.id },
    include: {
      proofs: {
        select: { id: true, url: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return payments
}

// ==========================================
// LEMON SQUEEZY HELPERS
// ==========================================

type LemonCheckoutTarget = {
  baseUrl: string
  params: URLSearchParams
}

function normalizeLemonStoreSlug(storeId: string): string {
  const trimmed = storeId.trim()
  if (!trimmed) {
    throw new Error("Lemon Squeezy not configured: missing LEMON_STORE_ID")
  }

  let slug = trimmed.replace(/^https?:\/\//i, "")
  slug = slug.replace(/\.lemonsqueezy\.com\/?$/i, "")
  return slug
}

function buildLemonCheckoutTarget(storeSlug: string, variantOrUrl: string): LemonCheckoutTarget {
  const raw = variantOrUrl.trim()
  if (!raw) {
    throw new Error("Lemon Squeezy not configured: missing variant ID")
  }

  // Full URL (with protocol)
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    return {
      baseUrl: `${url.origin}${url.pathname}`,
      params: new URLSearchParams(url.search),
    }
  }

  // Full URL (without protocol)
  if (raw.includes("lemonsqueezy.com/")) {
    const url = new URL(`https://${raw}`)
    return {
      baseUrl: `${url.origin}${url.pathname}`,
      params: new URLSearchParams(url.search),
    }
  }

  const [pathPart, queryPart] = raw.split("?")
  const params = new URLSearchParams(queryPart || "")
  const normalizedPath = pathPart.replace(/^\/+/, "")

  // Allow passing full checkout path (checkout/buy/...)
  if (normalizedPath.startsWith("checkout/buy/")) {
    return {
      baseUrl: `https://${storeSlug}.lemonsqueezy.com/${normalizedPath}`,
      params,
    }
  }

  // Default: treat as variant/price id
  return {
    baseUrl: `https://${storeSlug}.lemonsqueezy.com/checkout/buy/${pathPart}`,
    params,
  }
}

/**
 * Genera la URL de checkout de Lemon Squeezy
 * Usa el variant ID del plan asignado a la cuenta, o el default si no tiene
 */
export async function getLemonCheckoutUrl(accountId: string, email?: string): Promise<string> {
  const prisma = await getPrisma()
  const storeId = process.env.LEMON_STORE_ID
  const defaultVariantId = process.env.LEMON_VARIANT_ID_USD

  if (!storeId) {
    throw new Error("Lemon Squeezy not configured: missing LEMON_STORE_ID")
  }

  // Obtener la suscripción con su plan para usar el variant ID correcto
  const subscription = await prisma.billingSubscription.findUnique({
    where: { accountId },
    include: { billingPlan: true },
  })

  let variantId = subscription?.billingPlan?.lemonVariantId

  if (!variantId) {
    const defaultPlan = await prisma.billingPlan.findFirst({
      where: { isDefault: true, isActive: true },
    })
    variantId = defaultPlan?.lemonVariantId || defaultVariantId
  }

  if (!variantId) {
    throw new Error("Lemon Squeezy not configured: missing variant ID")
  }

  const storeSlug = normalizeLemonStoreSlug(storeId)
  const target = buildLemonCheckoutTarget(storeSlug, variantId)

  const params = new URLSearchParams(target.params)
  params.set("checkout[custom][account_id]", accountId)
  if (email) {
    params.set("checkout[email]", email)
  }

  return `${target.baseUrl}?${params.toString()}`
}

// ==========================================
// BANK ACCOUNTS
// ==========================================

export type BankAccountInfo = {
  id: string
  bankName: string
  accountType: string
  accountNumber: string
  accountName: string
  currency: string
  bankLogo: string | null
  instructions: string | null
}

/**
 * Obtiene todas las cuentas bancarias activas
 */
export async function getBankAccounts(): Promise<BankAccountInfo[]> {
  const prisma = await getPrisma()
  
  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      bankName: true,
      accountType: true,
      accountNumber: true,
      accountName: true,
      currency: true,
      bankLogo: true,
      instructions: true,
    },
  })

  return accounts
}

/**
 * Obtiene una cuenta bancaria por ID
 */
export async function getBankAccountById(id: string): Promise<BankAccountInfo | null> {
  const prisma = await getPrisma()
  
  const account = await prisma.bankAccount.findUnique({
    where: { id },
    select: {
      id: true,
      bankName: true,
      accountType: true,
      accountNumber: true,
      accountName: true,
      currency: true,
      bankLogo: true,
      instructions: true,
    },
  })

  return account
}

// Legacy function for backwards compatibility
export function getBankTransferInfo() {
  return {
    bankName: process.env.BANK_NAME || "Banco Popular Dominicano",
    accountType: process.env.BANK_ACCOUNT_TYPE || "Cuenta de Ahorros",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "XXXX-XXXX-XXXX",
    accountName: process.env.BANK_ACCOUNT_NAME || "MOVO SRL",
    reference: "Usar tu ID de cuenta como referencia",
  }
}

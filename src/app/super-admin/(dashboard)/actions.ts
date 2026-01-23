"use server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin, logSuperAdminAction } from "@/lib/super-admin-auth"
import { revalidatePath } from "next/cache"
import type { BillingStatus, BillingCurrency, BillingProvider } from "@prisma/client"

// ==========================================
// TYPES
// ==========================================

export type DashboardKPIs = {
  // Cuentas
  totalAccounts: number
  activeAccounts: number
  trialingAccounts: number
  graceAccounts: number
  blockedAccounts: number
  canceledAccounts: number
  
  // Ingresos
  mrrDop: number
  mrrUsd: number
  pendingPayments: number
  pendingPaymentsAmount: number
  
  // Conversión
  trialConversionRate: number
  
  // Actividad reciente
  newAccountsToday: number
  newAccountsThisWeek: number
  newAccountsThisMonth: number
}

export type RecentAccount = {
  id: string
  name: string
  createdAt: Date
  status: BillingStatus
  currency: BillingCurrency
  provider: BillingProvider
  ownerEmail: string | null
}

export type PendingPayment = {
  id: string
  accountId: string
  accountName: string
  amountCents: number
  currency: BillingCurrency
  createdAt: Date
  proofsCount: number
}

export type DashboardData = {
  kpis: DashboardKPIs
  recentAccounts: RecentAccount[]
  pendingPayments: PendingPayment[]
  statusDistribution: { status: BillingStatus; count: number }[]
}

// ==========================================
// DASHBOARD DATA
// ==========================================

export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Obtener todas las suscripciones con cuenta
  const subscriptions = await prisma.billingSubscription.findMany({
    include: {
      account: {
        include: {
          billingProfile: true,
          users: {
            where: { isOwner: true },
            take: 1,
          },
        },
      },
    },
  })

  // Contar por estado
  const statusCounts = {
    TRIALING: 0,
    ACTIVE: 0,
    GRACE: 0,
    BLOCKED: 0,
    CANCELED: 0,
  }

  let mrrDop = 0
  let mrrUsd = 0

  for (const sub of subscriptions) {
    statusCounts[sub.status]++
    
    // Calcular MRR solo para cuentas activas
    if (sub.status === "ACTIVE") {
      if (sub.currency === "DOP") {
        mrrDop += sub.priceDopCents
      } else {
        mrrUsd += sub.priceUsdCents
      }
    }
  }

  // Pagos pendientes de verificación
  const pendingPaymentsData = await prisma.billingPayment.findMany({
    where: {
      status: "PENDING",
      proofs: { some: {} },
    },
    include: {
      subscription: {
        include: {
          account: true,
        },
      },
      proofs: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const pendingPaymentsAmount = pendingPaymentsData.reduce(
    (sum, p) => sum + p.amountCents,
    0
  )

  // Cuentas nuevas
  const allAccounts = await prisma.account.findMany({
    select: { createdAt: true },
  })

  const newAccountsToday = allAccounts.filter(
    (a) => a.createdAt >= startOfToday
  ).length
  const newAccountsThisWeek = allAccounts.filter(
    (a) => a.createdAt >= startOfWeek
  ).length
  const newAccountsThisMonth = allAccounts.filter(
    (a) => a.createdAt >= startOfMonth
  ).length

  // Tasa de conversión de trial
  const convertedFromTrial = await prisma.billingPayment.count({
    where: { status: "PAID" },
  })
  const totalTrialEnded = statusCounts.ACTIVE + statusCounts.BLOCKED + statusCounts.CANCELED + convertedFromTrial
  const trialConversionRate = totalTrialEnded > 0 
    ? (convertedFromTrial / Math.max(totalTrialEnded, 1)) * 100 
    : 0

  // Cuentas recientes
  const recentAccounts: RecentAccount[] = subscriptions
    .sort((a, b) => b.account.createdAt.getTime() - a.account.createdAt.getTime())
    .slice(0, 10)
    .map((sub) => ({
      id: sub.account.id,
      name: sub.account.name,
      createdAt: sub.account.createdAt,
      status: sub.status,
      currency: sub.currency,
      provider: sub.provider,
      ownerEmail: sub.account.billingProfile?.email || sub.account.users[0]?.email || null,
    }))

  // Pagos pendientes formateados
  const pendingPayments: PendingPayment[] = pendingPaymentsData.map((p) => ({
    id: p.id,
    accountId: p.subscription.accountId,
    accountName: p.subscription.account.name,
    amountCents: p.amountCents,
    currency: p.currency,
    createdAt: p.createdAt,
    proofsCount: p.proofs.length,
  }))

  // Distribución de estados
  const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
    status: status as BillingStatus,
    count,
  }))

  return {
    kpis: {
      totalAccounts: allAccounts.length,
      activeAccounts: statusCounts.ACTIVE,
      trialingAccounts: statusCounts.TRIALING,
      graceAccounts: statusCounts.GRACE,
      blockedAccounts: statusCounts.BLOCKED,
      canceledAccounts: statusCounts.CANCELED,
      mrrDop,
      mrrUsd,
      pendingPayments: pendingPaymentsData.length,
      pendingPaymentsAmount,
      trialConversionRate,
      newAccountsToday,
      newAccountsThisWeek,
      newAccountsThisMonth,
    },
    recentAccounts,
    pendingPayments,
    statusDistribution,
  }
}

// ==========================================
// PAYMENT ACTIONS
// ==========================================

export async function approvePayment(paymentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canApprovePayments) {
      return { success: false, error: "No tienes permisos para aprobar pagos" }
    }

    const payment = await prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: { subscription: true },
    })

    if (!payment) {
      return { success: false, error: "Pago no encontrado" }
    }

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + 30)

    // Actualizar pago
    await prisma.billingPayment.update({
      where: { id: paymentId },
      data: {
        status: "PAID",
        paidAt: now,
        periodStartsAt: now,
        periodEndsAt: periodEnd,
      },
    })

    // Actualizar suscripción
    await prisma.billingSubscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: "ACTIVE",
        manualVerificationStatus: "APPROVED",
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEnd,
        graceEndsAt: null,
      },
    })

    // Log
    await logSuperAdminAction(admin.id, "approved_payment", {
      targetPaymentId: paymentId,
      targetAccountId: payment.subscription.accountId,
      metadata: { amountCents: payment.amountCents, currency: payment.currency },
    })

    revalidatePath("/super-admin")
    revalidatePath("/super-admin/payments")
    revalidatePath("/super-admin/accounts")

    return { success: true }
  } catch (error) {
    console.error("Error approving payment:", error)
    return { success: false, error: "Error al aprobar el pago" }
  }
}

export async function rejectPayment(
  paymentId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canApprovePayments) {
      return { success: false, error: "No tienes permisos para rechazar pagos" }
    }

    if (!reason?.trim()) {
      return { success: false, error: "Debes indicar un motivo del rechazo" }
    }

    const payment = await prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: { subscription: true },
    })

    if (!payment) {
      return { success: false, error: "Pago no encontrado" }
    }

    // Actualizar pago
    await prisma.billingPayment.update({
      where: { id: paymentId },
      data: { status: "REJECTED", rejectionReason: reason.trim() },
    })

    // Actualizar suscripción a bloqueado si no tiene otros pagos válidos
    const validPayments = await prisma.billingPayment.count({
      where: {
        subscriptionId: payment.subscriptionId,
        status: "PAID",
      },
    })

    if (validPayments === 0) {
      const now = new Date()
      const isTrialActive =
        payment.subscription.status === "TRIALING" &&
        payment.subscription.trialEndsAt &&
        payment.subscription.trialEndsAt > now

      await prisma.billingSubscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: isTrialActive ? "TRIALING" : "BLOCKED",
          manualVerificationStatus: "REJECTED",
        },
      })
    }

    // Log
    await logSuperAdminAction(admin.id, "rejected_payment", {
      targetPaymentId: paymentId,
      targetAccountId: payment.subscription.accountId,
      metadata: { reason: reason.trim() },
    })

    revalidatePath("/super-admin")
    revalidatePath("/super-admin/payments")
    revalidatePath("/super-admin/accounts")

    return { success: true }
  } catch (error) {
    console.error("Error rejecting payment:", error)
    return { success: false, error: "Error al rechazar el pago" }
  }
}

// ==========================================
// SUBSCRIPTION STATUS ACTIONS
// ==========================================

export async function updateSubscriptionStatus(
  accountId: string,
  newStatus: BillingStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canManageAccounts) {
      return { success: false, error: "No tienes permisos para modificar suscripciones" }
    }

    const subscription = await prisma.billingSubscription.findUnique({
      where: { accountId },
    })

    if (!subscription) {
      return { success: false, error: "Suscripción no encontrada" }
    }

    const oldStatus = subscription.status

    // Actualizar estado
    const updateData: Record<string, unknown> = { status: newStatus }

    // Si se activa, establecer período
    if (newStatus === "ACTIVE" && oldStatus !== "ACTIVE") {
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setDate(periodEnd.getDate() + 30)
      updateData.currentPeriodStartsAt = now
      updateData.currentPeriodEndsAt = periodEnd
      updateData.graceEndsAt = null
    }

    await prisma.billingSubscription.update({
      where: { accountId },
      data: updateData,
    })

    // Log
    await logSuperAdminAction(admin.id, "changed_subscription_status", {
      targetAccountId: accountId,
      metadata: { oldStatus, newStatus },
    })

    revalidatePath("/super-admin")
    revalidatePath("/super-admin/accounts")
    revalidatePath(`/super-admin/accounts/${accountId}`)

    return { success: true }
  } catch (error) {
    console.error("Error updating subscription status:", error)
    return { success: false, error: "Error al actualizar el estado" }
  }
}

export async function extendTrial(
  accountId: string,
  days: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canManageAccounts) {
      return { success: false, error: "No tienes permisos" }
    }

    const subscription = await prisma.billingSubscription.findUnique({
      where: { accountId },
    })

    if (!subscription) {
      return { success: false, error: "Suscripción no encontrada" }
    }

    const newTrialEnd = subscription.trialEndsAt 
      ? new Date(subscription.trialEndsAt.getTime() + days * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    await prisma.billingSubscription.update({
      where: { accountId },
      data: {
        status: "TRIALING",
        trialEndsAt: newTrialEnd,
        graceEndsAt: null,
      },
    })

    await logSuperAdminAction(admin.id, "extended_trial", {
      targetAccountId: accountId,
      metadata: { days, newTrialEnd },
    })

    revalidatePath("/super-admin")
    revalidatePath("/super-admin/accounts")

    return { success: true }
  } catch (error) {
    console.error("Error extending trial:", error)
    return { success: false, error: "Error al extender el trial" }
  }
}

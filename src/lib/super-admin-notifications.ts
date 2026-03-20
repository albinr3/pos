import { prisma } from "@/lib/db"
import type { Prisma, SuperAdminNotificationType } from "@prisma/client"
import type { SuperAdminUser } from "@/lib/super-admin-auth"

export type NotificationType = SuperAdminNotificationType

export type SuperAdminNotificationItem = {
  id: string
  createdAt: Date
  type: NotificationType
  title: string
  message: string
  href: string
  isRead: boolean
}

type CreateSuperAdminNotificationInput = {
  type: NotificationType
  title: string
  message: string
  href: string
  sourceId: string
  metadata?: Prisma.InputJsonValue
}

function canSeeNotificationType(admin: SuperAdminUser, type: NotificationType) {
  if (admin.role === "OWNER" || admin.role === "ADMIN") return true

  if (
    type === "TRANSFER_PENDING_REVIEW" ||
    type === "CARD_PAYMENT_SUCCESS" ||
    type === "CARD_PAYMENT_FAILED"
  ) {
    return admin.canApprovePayments || admin.canViewFinancials
  }

  if (type === "ERROR_HIGH" || type === "ERROR_CRITICAL") {
    return admin.canManageAccounts
  }

  return false
}

function filterVisibleTypes(admin: SuperAdminUser): NotificationType[] {
  const allTypes: NotificationType[] = [
    "TRANSFER_PENDING_REVIEW",
    "CARD_PAYMENT_SUCCESS",
    "CARD_PAYMENT_FAILED",
    "ERROR_HIGH",
    "ERROR_CRITICAL",
  ]
  return allTypes.filter((type) => canSeeNotificationType(admin, type))
}

export async function createSuperAdminNotification(input: CreateSuperAdminNotificationInput) {
  try {
    return await prisma.superAdminNotification.upsert({
      where: {
        type_sourceId: {
          type: input.type,
          sourceId: input.sourceId,
        },
      },
      create: {
        type: input.type,
        title: input.title,
        message: input.message,
        href: input.href,
        sourceId: input.sourceId,
        metadata: input.metadata,
      },
      update: {},
    })
  } catch (error) {
    console.error("[SuperAdminNotifications] create error:", error)
    return null
  }
}

export async function getSuperAdminNotifications(admin: SuperAdminUser, limit = 20): Promise<{
  unreadCount: number
  notifications: SuperAdminNotificationItem[]
}> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit || 20)))
  const visibleTypes = filterVisibleTypes(admin)

  if (visibleTypes.length === 0) {
    return { unreadCount: 0, notifications: [] }
  }

  const [unreadCount, notifications] = await Promise.all([
    prisma.superAdminNotification.count({
      where: {
        isRead: false,
        type: { in: visibleTypes },
      },
    }),
    prisma.superAdminNotification.findMany({
      where: {
        type: { in: visibleTypes },
      },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      select: {
        id: true,
        createdAt: true,
        type: true,
        title: true,
        message: true,
        href: true,
        isRead: true,
      },
    }),
  ])

  return { unreadCount, notifications }
}

export async function markAllSuperAdminNotificationsAsRead(adminId: string) {
  try {
    const result = await prisma.superAdminNotification.updateMany({
      where: { isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
        readBySuperAdminId: adminId,
      },
    })
    return result.count
  } catch (error) {
    console.error("[SuperAdminNotifications] mark-all-read error:", error)
    return 0
  }
}

function formatAmount(cents: number, currency: "USD" | "DOP") {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-DO", {
    style: "currency",
    currency,
  }).format(cents / 100)
}

export async function notifyTransferPendingReview(input: {
  paymentId: string
  accountName: string
  amountCents: number
  currency: "DOP" | "USD"
}) {
  return createSuperAdminNotification({
    type: "TRANSFER_PENDING_REVIEW",
    sourceId: input.paymentId,
    href: "/super-admin/payments",
    title: "Transferencia pendiente por revisar",
    message: `${input.accountName} subió comprobante por ${formatAmount(input.amountCents, input.currency)}.`,
    metadata: {
      paymentId: input.paymentId,
      accountName: input.accountName,
      amountCents: input.amountCents,
      currency: input.currency,
    },
  })
}

export async function notifyCardPaymentSuccess(input: {
  sourceId: string
  accountName: string
  amountCents: number
}) {
  return createSuperAdminNotification({
    type: "CARD_PAYMENT_SUCCESS",
    sourceId: input.sourceId,
    href: "/super-admin/payments",
    title: "Pago con tarjeta exitoso",
    message: `${input.accountName} pagó ${formatAmount(input.amountCents, "USD")} con tarjeta.`,
    metadata: {
      accountName: input.accountName,
      amountCents: input.amountCents,
      currency: "USD",
    },
  })
}

export async function notifyCardPaymentFailed(input: {
  sourceId: string
  accountName: string
  amountCents: number
}) {
  return createSuperAdminNotification({
    type: "CARD_PAYMENT_FAILED",
    sourceId: input.sourceId,
    href: "/super-admin/payments",
    title: "Pago con tarjeta fallido",
    message: `${input.accountName} tuvo un intento fallido por ${formatAmount(input.amountCents, "USD")}.`,
    metadata: {
      accountName: input.accountName,
      amountCents: input.amountCents,
      currency: "USD",
    },
  })
}

export async function notifyHighOrCriticalError(input: {
  errorLogId: string
  severity: "HIGH" | "CRITICAL"
  code?: string | null
  message: string
}) {
  const isCritical = input.severity === "CRITICAL"
  return createSuperAdminNotification({
    type: isCritical ? "ERROR_CRITICAL" : "ERROR_HIGH",
    sourceId: input.errorLogId,
    href: "/super-admin/errors",
    title: isCritical ? "Error crítico del sistema" : "Error alto del sistema",
    message: `${input.code ? `[${input.code}] ` : ""}${input.message}`,
    metadata: {
      errorLogId: input.errorLogId,
      severity: input.severity,
      code: input.code ?? null,
    },
  })
}

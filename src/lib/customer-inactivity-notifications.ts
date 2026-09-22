import { subDays } from "date-fns"
import { prisma } from "@/lib/db"
import { sendResendEmail } from "@/lib/resend"
import { renderCustomerInactivityEmail } from "@/lib/resend/templates"
import { getAccountOwnerEmail } from "@/lib/account-owner-email"

const INACTIVITY_DAYS = 5
const INACTIVITY_NOTIFICATION_TYPE = "inactive_5_days"
const EMAIL_CHANNEL = "email"

async function hasInactivityEmailBeenSent(accountId: string) {
  const notification = await prisma.billingNotification.findFirst({
    where: {
      accountId,
      type: INACTIVITY_NOTIFICATION_TYPE,
      channel: EMAIL_CHANNEL,
      dedupeKey: `inactivity:${accountId}`,
    },
  })

  return !!notification
}

async function recordInactivityEmail(accountId: string, metadata?: Record<string, unknown>) {
  return prisma.billingNotification.create({
    data: {
      accountId,
      type: INACTIVITY_NOTIFICATION_TYPE,
      channel: EMAIL_CHANNEL,
      metadata: metadata as object | undefined,
    },
  })
}

export async function sendCustomerInactivityNotifications(): Promise<{
  sent: number
  errors: number
}> {
  const cutoff = subDays(new Date(), INACTIVITY_DAYS)
  let sent = 0
  let errors = 0

  const accounts = await prisma.account.findMany({
    where: { engagementEmailsEnabled: true },
    include: {
      billingProfile: true,
      companySettings: true,
      users: {
        where: {
          isOwner: true,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
        },
        take: 1,
      },
    },
  })

  for (const account of accounts) {
    try {
      if (await hasInactivityEmailBeenSent(account.id)) {
        continue
      }

      const latestActivity = await prisma.auditLog.findFirst({
        where: {
          accountId: account.id,
          userId: { not: null },
          action: { not: "LOGIN_FAILED" },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
          userId: true,
        },
      })

      // No basarse solo en LOGIN_SUCCESS: una sesión persistente puede usar el POS varios
      // días sin volver a iniciar sesión. Cualquier acción auditada del usuario cuenta.
      const lastActivityAt = latestActivity?.createdAt ?? account.createdAt
      if (lastActivityAt > cutoff) {
        continue
      }

      const ownerUser = account.users[0]
      const email = getAccountOwnerEmail(account)
      if (!email) {
        continue
      }

      const accountName = account.companySettings?.name || account.name
      // Reservar antes de llamar a Resend evita duplicados si dos cron se ejecutan a la vez.
      let notificationId: string
      try {
        const notification = await recordInactivityEmail(account.id, {
          status: "sending",
          inactivityDays: INACTIVITY_DAYS,
          lastActivityAt: lastActivityAt.toISOString(),
          recipient: email,
        })
        notificationId = notification.id
      } catch (error) {
        // P2002 significa que otro cron ya reservó o completó este envío.
        if ((error as { code?: string }).code === "P2002") continue
        throw error
      }

      const { subject, html, text } = await renderCustomerInactivityEmail({
        accountId: account.id,
        accountName,
      })
      const success = await sendResendEmail({
        to: email,
        subject,
        html,
        text,
        accountId: account.id,
        userId: latestActivity?.userId || ownerUser?.id,
      })

      if (success) {
        await prisma.billingNotification.update({
          where: { id: notificationId },
          data: { metadata: {
            status: "sent",
            inactivityDays: INACTIVITY_DAYS,
            lastActivityAt: lastActivityAt.toISOString(),
            recipient: email,
          } },
        })
        sent++
      } else {
        // Liberar la reserva si Resend rechaza el envío para permitir un reintento.
        await prisma.billingNotification.delete({ where: { id: notificationId } })
        errors++
      }
    } catch (error) {
      console.error(`Error processing inactivity notification for account ${account.id}:`, error)
      errors++
    }
  }

  return { sent, errors }
}

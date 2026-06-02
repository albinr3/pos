import { subDays } from "date-fns"
import { prisma } from "@/lib/db"
import { sendResendEmail } from "@/lib/resend"
import { renderCustomerInactivityEmail } from "@/lib/resend/templates"

const INACTIVITY_DAYS = 5
const INACTIVITY_NOTIFICATION_TYPE = "inactive_5_days"
const EMAIL_CHANNEL = "email"

async function hasInactivityEmailBeenSent(accountId: string) {
  const notification = await prisma.billingNotification.findFirst({
    where: {
      accountId,
      type: INACTIVITY_NOTIFICATION_TYPE,
      channel: EMAIL_CHANNEL,
    },
  })

  return !!notification
}

async function recordInactivityEmail(accountId: string, metadata?: Record<string, unknown>) {
  await prisma.billingNotification.create({
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

      const latestLogin = await prisma.auditLog.findFirst({
        where: {
          accountId: account.id,
          action: "LOGIN_SUCCESS",
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
          userId: true,
        },
      })

      const lastActivityAt = latestLogin?.createdAt ?? account.createdAt
      if (lastActivityAt > cutoff) {
        continue
      }

      const ownerUser = account.users[0]
      const email = account.billingProfile?.email || ownerUser?.email
      if (!email) {
        continue
      }

      const accountName = account.companySettings?.name || account.name
      const { subject, html } = await renderCustomerInactivityEmail({ accountName })
      const success = await sendResendEmail({
        to: email,
        subject,
        html,
        accountId: account.id,
        userId: latestLogin?.userId || ownerUser?.id,
      })

      if (success) {
        // Se registra una vez por cuenta para que no se reenvie aunque vuelva a quedar inactiva.
        await recordInactivityEmail(account.id, {
          inactivityDays: INACTIVITY_DAYS,
          lastActivityAt: lastActivityAt.toISOString(),
          recipient: email,
        })
        sent++
      } else {
        errors++
      }
    } catch (error) {
      console.error(`Error processing inactivity notification for account ${account.id}:`, error)
      errors++
    }
  }

  return { sent, errors }
}

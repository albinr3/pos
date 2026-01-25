/**
 * Sistema de notificaciones de billing
 * 
 * Envía emails y notificaciones in-app según el calendario:
 * - Trial: 7, 3, 2, 1 días antes
 * - Vencimiento: 3, 2, 1 días antes
 * - Gracia: 2, 1 días antes
 */

import { differenceInDays } from "date-fns"
import { prisma } from "@/lib/db"
import { NOTIFICATION_DAYS } from "@/lib/billing"
import { sendResendEmail } from "@/lib/resend"
import {
  renderTrialExpiringEmail,
  renderSubscriptionDueEmail,
  renderGracePeriodEmail,
  renderAccountBlockedEmail,
} from "@/lib/resend/templates"

// ==========================================
// TYPES
// ==========================================

type NotificationType =
  | "trial_7"
  | "trial_3"
  | "trial_2"
  | "trial_1"
  | "trial_0"
  | "due_3"
  | "due_2"
  | "due_1"
  | "due_0"
  | "grace_2"
  | "grace_1"
  | "grace_0"
  | "blocked"

type NotificationChannel = "email" | "in_app"

// ==========================================
// EMAIL SENDING (Resend integration)
// ==========================================

// ==========================================
// EMAIL TEMPLATES - Now using external templates from /templates/resend/
// ==========================================

// ==========================================
// NOTIFICATION LOGIC
// ==========================================

async function hasNotificationBeenSent(
  accountId: string,
  type: NotificationType,
  channel: NotificationChannel
): Promise<boolean> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const notification = await prisma.billingNotification.findFirst({
    where: {
      accountId,
      type,
      channel,
      sentAt: { gte: today },
    },
  })

  return !!notification
}

async function recordNotification(
  accountId: string,
  type: NotificationType,
  channel: NotificationChannel,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.billingNotification.create({
    data: {
      accountId,
      type,
      channel,
      metadata: metadata as object | undefined,
    },
  })
}

// ==========================================
// MAIN FUNCTION
// ==========================================

export async function sendBillingNotifications(): Promise<{
  sent: number
  errors: number
}> {
  const now = new Date()
  let sent = 0
  let errors = 0

  // Get all subscriptions that might need notifications
  const subscriptions = await prisma.billingSubscription.findMany({
    where: {
      status: { in: ["TRIALING", "ACTIVE", "GRACE", "BLOCKED"] },
    },
    include: {
      account: {
        include: {
          billingProfile: true,
          companySettings: true,
        },
      },
    },
  })

  for (const subscription of subscriptions) {
    const { account } = subscription
    const email = account.billingProfile?.email || ""
    const accountName = account.companySettings?.name || account.name

    if (!email) continue

    try {
      // Check trial notifications
      if (subscription.status === "TRIALING" && subscription.trialEndsAt) {
        const daysRemaining = differenceInDays(subscription.trialEndsAt, now)

        for (const day of NOTIFICATION_DAYS.trial) {
          if (daysRemaining === day) {
            const type = `trial_${day}` as NotificationType
            
            if (!(await hasNotificationBeenSent(account.id, type, "email"))) {
              const { subject, html } = await renderTrialExpiringEmail({
                accountName,
                daysRemaining: day,
              })
              const success = await sendResendEmail({ to: email, subject, html })
              
              if (success) {
                await recordNotification(account.id, type, "email", { daysRemaining: day })
                sent++
              } else {
                errors++
              }
            }
            break
          }
        }
      }

      // Check due notifications (active subscriptions nearing end)
      if (subscription.status === "ACTIVE" && subscription.currentPeriodEndsAt) {
        const daysRemaining = differenceInDays(subscription.currentPeriodEndsAt, now)

        for (const day of NOTIFICATION_DAYS.due) {
          if (daysRemaining === day) {
            const type = `due_${day}` as NotificationType
            
            if (!(await hasNotificationBeenSent(account.id, type, "email"))) {
              const { subject, html } = await renderSubscriptionDueEmail({
                accountName,
                daysRemaining: day,
              })
              const success = await sendResendEmail({ to: email, subject, html })
              
              if (success) {
                await recordNotification(account.id, type, "email", { daysRemaining: day })
                sent++
              } else {
                errors++
              }
            }
            break
          }
        }
      }

      // Check grace notifications
      if (subscription.status === "GRACE" && subscription.graceEndsAt) {
        const daysRemaining = differenceInDays(subscription.graceEndsAt, now)

        for (const day of NOTIFICATION_DAYS.grace) {
          if (daysRemaining === day) {
            const type = `grace_${day}` as NotificationType
            
            if (!(await hasNotificationBeenSent(account.id, type, "email"))) {
              const { subject, html } = await renderGracePeriodEmail({
                accountName,
                daysRemaining: day,
              })
              const success = await sendResendEmail({ to: email, subject, html })
              
              if (success) {
                await recordNotification(account.id, type, "email", { daysRemaining: day })
                sent++
              } else {
                errors++
              }
            }
            break
          }
        }
      }

      // Check blocked notification (send once when blocked)
      if (subscription.status === "BLOCKED") {
        if (!(await hasNotificationBeenSent(account.id, "blocked", "email"))) {
          const { subject, html } = await renderAccountBlockedEmail({
            accountName,
          })
          const success = await sendResendEmail({ to: email, subject, html })
          
          if (success) {
            await recordNotification(account.id, "blocked", "email")
            sent++
          } else {
            errors++
          }
        }
      }
    } catch (error) {
      console.error(`Error processing notifications for account ${account.id}:`, error)
      errors++
    }
  }

  return { sent, errors }
}

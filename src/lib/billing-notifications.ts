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
// EMAIL TEMPLATES
// ==========================================

function getTrialEmailContent(daysRemaining: number, accountName: string) {
  const subject =
    daysRemaining === 0
      ? "Tu período de prueba termina hoy"
      : `Te quedan ${daysRemaining} días de prueba`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MOVOPos</h1>
        </div>
        <div class="content">
          <h2>Hola ${accountName},</h2>
          <p>
            ${
              daysRemaining === 0
                ? "Tu período de prueba de MOVOPos termina hoy."
                : `Te quedan <strong>${daysRemaining} días</strong> de período de prueba en MOVOPos.`
            }
          </p>
          <p>
            Para continuar usando todas las funcionalidades sin interrupciones, 
            te recomendamos elegir un plan de pago.
          </p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"}/billing" class="button">
              Ver planes de pago
            </a>
          </p>
          <p style="margin-top: 20px;">
            Si tienes alguna pregunta, no dudes en contactarnos.
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} MOVOPos. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `

  return { subject, html }
}

function getDueEmailContent(daysRemaining: number, accountName: string) {
  const subject =
    daysRemaining === 0
      ? "Tu suscripción vence hoy"
      : `Tu suscripción vence en ${daysRemaining} días`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>MOVOPos</h1>
        </div>
        <div class="content">
          <h2>Hola ${accountName},</h2>
          <p>
            ${
              daysRemaining === 0
                ? "Tu suscripción de MOVOPos vence hoy."
                : `Tu suscripción de MOVOPos vence en <strong>${daysRemaining} días</strong>.`
            }
          </p>
          <p>
            Para evitar interrupciones en el servicio, por favor realiza tu pago 
            antes del vencimiento.
          </p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"}/billing" class="button">
              Ir a facturación
            </a>
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} MOVOPos. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `

  return { subject, html }
}

function getGraceEmailContent(daysRemaining: number, accountName: string) {
  const subject =
    daysRemaining === 0
      ? "⚠️ Tu cuenta será bloqueada hoy"
      : `⚠️ Tu cuenta será bloqueada en ${daysRemaining} días`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
        .warning { background: #fef2f2; border: 1px solid #ef4444; padding: 12px; border-radius: 6px; margin: 16px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Acción requerida</h1>
        </div>
        <div class="content">
          <h2>Hola ${accountName},</h2>
          <div class="warning">
            <strong>
              ${
                daysRemaining === 0
                  ? "Tu cuenta será bloqueada hoy si no realizas el pago."
                  : `Tu cuenta será bloqueada en ${daysRemaining} días si no realizas el pago.`
              }
            </strong>
          </div>
          <p>
            Tu período de gracia está por terminar. Una vez bloqueada, no podrás 
            acceder a tu sistema de punto de venta hasta que regularices tu pago.
          </p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"}/billing" class="button">
              Pagar ahora
            </a>
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} MOVOPos. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `

  return { subject, html }
}

function getBlockedEmailContent(accountName: string) {
  const subject = "🔒 Tu cuenta ha sido bloqueada"

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #991b1b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔒 Cuenta bloqueada</h1>
        </div>
        <div class="content">
          <h2>Hola ${accountName},</h2>
          <p>
            Tu cuenta de MOVOPos ha sido bloqueada por falta de pago.
          </p>
          <p>
            Para recuperar el acceso a tu sistema de punto de venta, por favor 
            realiza el pago correspondiente.
          </p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"}/billing" class="button">
              Reactivar mi cuenta
            </a>
          </p>
          <p style="margin-top: 20px;">
            Si crees que esto es un error, por favor contáctanos.
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} MOVOPos. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `

  return { subject, html }
}

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
              const { subject, html } = getTrialEmailContent(day, accountName)
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
              const { subject, html } = getDueEmailContent(day, accountName)
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
              const { subject, html } = getGraceEmailContent(day, accountName)
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
          const { subject, html } = getBlockedEmailContent(accountName)
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

import { clerkClient } from "@clerk/nextjs/server"

import { prisma } from "@/lib/db"
import { sendResendEmail } from "@/lib/resend"
import { renderInitialSetupReminderEmail } from "@/lib/resend/templates"

const EMAIL_CHANNEL = "email"

// El cron se ejecuta cada hora. Dos horas dan margen para que el cliente termine
// el registro sin competir con el correo de bienvenida que recibe al crearla.
const INITIAL_SETUP_SEQUENCE = [
  { type: "initial_setup_2h", delayHours: 2, step: 1 as const },
  { type: "initial_setup_1d", delayHours: 24, step: 2 as const },
  { type: "initial_setup_3d", delayHours: 72, step: 3 as const },
  { type: "initial_setup_7d", delayHours: 168, step: 4 as const },
] as const

async function hasInitialSetupEmailBeenSent(accountId: string, type: string) {
  return Boolean(
    await prisma.billingNotification.findFirst({
      where: { accountId, type, channel: EMAIL_CHANNEL },
      select: { id: true },
    })
  )
}

async function getAccountOwnerEmail(clerkUserId: string) {
  const client = await clerkClient()
  const user = await client.users.getUser(clerkUserId)

  return (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses.find((email) => email.emailAddress)?.emailAddress ??
    null
  )
}

/**
 * Reactiva solamente cuentas que aún no terminaron la configuración inicial.
 * La comprobación antes de cada envío es deliberada: nunca debe llegar un
 * recordatorio si el cliente completó el nombre de su negocio entre cron jobs.
 */
export async function sendInitialSetupReminderNotifications(): Promise<{
  sent: number
  errors: number
}> {
  const now = new Date()
  const firstReminderCutoff = new Date(now)
  firstReminderCutoff.setHours(firstReminderCutoff.getHours() - INITIAL_SETUP_SEQUENCE[0].delayHours)

  let sent = 0
  let errors = 0

  const accounts = await prisma.account.findMany({
    where: { createdAt: { lte: firstReminderCutoff } },
    select: {
      id: true,
      clerkUserId: true,
      createdAt: true,
      onboarding: { select: { initialSetupCompletedAt: true } },
    },
  })

  for (const account of accounts) {
    if (account.onboarding?.initialSetupCompletedAt) continue

    try {
      // Se resuelven los pasos en orden porque Array.find no espera predicados
      // async. Así una cuenta antigua tampoco recibe los tres mensajes juntos.
      let dueStep: (typeof INITIAL_SETUP_SEQUENCE)[number] | undefined
      for (const step of INITIAL_SETUP_SEQUENCE) {
        const dueAt = new Date(account.createdAt)
        dueAt.setHours(dueAt.getHours() + step.delayHours)
        if (now < dueAt) continue
        if (!(await hasInitialSetupEmailBeenSent(account.id, step.type))) {
          dueStep = step
          break
        }
      }

      if (!dueStep) continue

      // Volvemos a consultar el estado para cerrar la carrera entre el query
      // inicial y la configuración que el cliente pudo completar segundos después.
      const onboarding = await prisma.accountOnboarding.findUnique({
        where: { accountId: account.id },
        select: { initialSetupCompletedAt: true },
      })
      if (onboarding?.initialSetupCompletedAt) continue

      const email = await getAccountOwnerEmail(account.clerkUserId)
      if (!email) {
        errors++
        continue
      }

      const { subject, html } = await renderInitialSetupReminderEmail({ step: dueStep.step })
      const success = await sendResendEmail({
        to: email,
        subject,
        html,
        accountId: account.id,
      })

      if (!success) {
        errors++
        continue
      }

      await prisma.billingNotification.create({
        data: {
          accountId: account.id,
          type: dueStep.type,
          channel: EMAIL_CHANNEL,
          metadata: {
            sequence: "initial_setup",
            step: dueStep.step,
            delayHours: dueStep.delayHours,
            recipient: email,
          },
        },
      })
      sent++
    } catch (error) {
      console.error(`Error sending initial setup reminder for account ${account.id}:`, error)
      errors++
    }
  }

  return { sent, errors }
}

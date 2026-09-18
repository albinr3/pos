import webPush, { type PushSubscription } from "web-push"
import { prisma } from "@/lib/db"

type NewAccountPushInput = {
  accountId: string
  accountName: string
  ownerEmail: string | null
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim()

  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return typeof statusCode === "number" ? statusCode : null
}

/**
 * Envía la alerta sin exponer el teléfono en la pantalla bloqueada. La ficha
 * autenticada carga el contacto actualizado antes de abrir WhatsApp.
 */
export async function sendNewAccountWebPush(input: NewAccountPushInput) {
  const vapid = getVapidConfig()
  if (!vapid) {
    console.warn("[SuperAdminWebPush] VAPID no configurado; alerta push omitida.")
    return { sent: 0, skipped: true, failed: 0 }
  }

  const subscriptions = await prisma.superAdminWebPushSubscription.findMany({
    where: {
      enabled: true,
      superAdmin: { isActive: true, role: { in: ["OWNER", "ADMIN"] } },
    },
    select: { endpoint: true, p256dh: true, auth: true },
  })

  if (subscriptions.length === 0) return { sent: 0, skipped: true, failed: 0 }

  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const payload = JSON.stringify({
    title: "Nuevo cliente registrado",
    body: `${input.accountName}\n${input.ownerEmail || "Sin email registrado"}`,
    tag: `new-account-${input.accountId}`,
    url: `/super-admin/accounts/${input.accountId}`,
  })

  let sent = 0
  let failed = 0

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }

      try {
        await webPush.sendNotification(pushSubscription, payload, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        })
        sent += 1
      } catch (error) {
        failed += 1
        const statusCode = getErrorStatus(error)

        // Un endpoint 404/410 no se recuperará: se desactiva para evitar reintentos ruidosos.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.superAdminWebPushSubscription.updateMany({
            where: { endpoint: subscription.endpoint },
            data: { enabled: false },
          })
          return
        }

        console.error("[SuperAdminWebPush] No se pudo enviar una alerta:", error)
      }
    })
  )

  return { sent, skipped: false, failed }
}

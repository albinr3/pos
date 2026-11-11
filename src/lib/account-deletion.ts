import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { UTApi } from "uploadthing/server"
import type { AccountDeletion, Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cashRequest } from "@/lib/cash-context"
import { accountIdentityHash, withAccountIdentityLock } from "@/lib/account-deletion-guard"
import { purgeAccountData } from "@/lib/account-purge"
import { FISCAL_RETENTION_MESSAGE, hasFiscalHistory } from "@/lib/fiscal/core/retention"

const PIN_WINDOW_MS = 15 * 60 * 1000
const LEASE_MS = 3 * 60 * 1000

export function uploadThingFileKey(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || !(
      url.hostname === "utfs.io" || url.hostname.endsWith(".ufs.sh") || url.hostname === "uploadthing.com"
    )) return null
    const match = /^\/f\/([^/]+)$/.exec(url.pathname)
    return match ? decodeURIComponent(match[1]) : null
  } catch { return null }
}

async function referencedFiles(tx: Prisma.TransactionClient, accountId: string, others = false) {
  const accountWhere = others ? { not: accountId } : accountId
  const [settings, products, proofs, tutorials, banks] = await Promise.all([
    tx.companySettings.findMany({ where: { accountId: accountWhere }, select: { logoUrl: true } }),
    tx.product.findMany({ where: { accountId: accountWhere }, select: { imageUrls: true } }),
    tx.billingPaymentProof.findMany({ where: { payment: { subscription: { accountId: accountWhere } } }, select: { url: true } }),
    others ? tx.tutorialVideo.findMany({ select: { videoFileKey: true, videoUrl: true } }) : [],
    others ? tx.bankAccount.findMany({ select: { bankLogo: true } }) : [],
  ])
  return new Set([
    ...settings.flatMap(s => s.logoUrl ? [uploadThingFileKey(s.logoUrl)] : []),
    ...products.flatMap(p => p.imageUrls.map(uploadThingFileKey)),
    ...proofs.map(p => uploadThingFileKey(p.url)),
    ...tutorials.flatMap(t => [t.videoFileKey, uploadThingFileKey(t.videoUrl)]),
    ...banks.flatMap(bank => bank.bankLogo ? [uploadThingFileKey(bank.bankLogo)] : []),
  ].filter((key): key is string => Boolean(key)))
}

type DeletionRequestResult =
  | { success: true; job: AccountDeletion }
  | { success: false; status: number; code: string; error: string; retryAfter?: number }

export async function requestAccountDeletion(input: {
  clerkUserId: string; accountId: string; userId: string; pin: string
}): Promise<DeletionRequestResult> {
  return withAccountIdentityLock(input.clerkUserId, async tx => {
    const clerkUserHash = accountIdentityHash(input.clerkUserId)
    const existing = await tx.accountDeletion.findUnique({ where: { clerkUserHash } })
    if (existing && existing.accountId === input.accountId) {
      // Una tarea antigua no debe cerrar la sesión ni reanudar proveedores si conserva historial fiscal.
      if (await hasFiscalHistory(tx, input.accountId)) return { success: false, status: 409, code: "FISCAL_RETENTION_REQUIRED", error: FISCAL_RETENTION_MESSAGE }
      return { success: true, job: existing }
    }

    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${input.accountId} FOR UPDATE`
    const account = await tx.account.findFirst({ where: { id: input.accountId, clerkUserId: input.clerkUserId } })
    const owner = await tx.user.findFirst({ where: { id: input.userId, accountId: input.accountId, isActive: true } })
    if (!account || !owner) return { success: false, status: 401, code: "AUTH_REQUIRED", error: "Inicia sesión nuevamente." }
    if (!owner.isOwner) return { success: false, status: 403, code: "OWNER_REQUIRED", error: "Solo el dueño puede eliminar la cuenta." }

    const now = new Date()
    const windowActive = account.deletionPinWindowStartedAt && now.getTime() - account.deletionPinWindowStartedAt.getTime() < PIN_WINDOW_MS
    const attempts = windowActive ? account.deletionPinAttempts : 0
    if (attempts >= 5) return {
      success: false, status: 429, code: "TOO_MANY_ATTEMPTS", error: "Demasiados intentos. Intenta más tarde.",
      retryAfter: Math.ceil((account.deletionPinWindowStartedAt!.getTime() + PIN_WINDOW_MS - now.getTime()) / 1000),
    }
    if (!(await bcrypt.compare(input.pin, owner.passwordHash))) {
      // El contador vive en PostgreSQL: reiniciar una instancia no permite adivinar otro PIN.
      await tx.account.update({ where: { id: account.id }, data: {
        deletionPinAttempts: attempts + 1,
        deletionPinWindowStartedAt: windowActive ? account.deletionPinWindowStartedAt : now,
      } })
      return { success: false, status: 400, code: "INVALID_PIN", error: "El PIN no es correcto." }
    }

    // Comprobar bajo el bloqueo de la empresa antes de desactivar usuarios o cancelar servicios.
    if (await hasFiscalHistory(tx, account.id)) return { success: false, status: 409, code: "FISCAL_RETENTION_REQUIRED", error: FISCAL_RETENTION_MESSAGE }

    const [files, sharedFiles, subscription] = await Promise.all([
      referencedFiles(tx, account.id), referencedFiles(tx, account.id, true),
      tx.billingSubscription.findUnique({ where: { accountId: account.id }, select: { lemonSubscriptionId: true } }),
    ])
    const job = await tx.accountDeletion.create({ data: {
      accountId: account.id, clerkUserHash, clerkUserId: input.clerkUserId,
      lemonSubscriptionId: subscription?.lemonSubscriptionId,
      fileKeys: [...files].filter(key => !sharedFiles.has(key)),
    } })
    await tx.account.update({ where: { id: account.id }, data: { deletionRequestedAt: now, engagementEmailsEnabled: false } })
    await tx.user.updateMany({ where: { accountId: account.id }, data: { isActive: false } })
    return { success: true, job }
  })
}

class DeletionProviderError extends Error {}

export async function cancelLemonSubscription(subscriptionId: string) {
  const key = process.env.LEMON_API_KEY
  if (!key) throw new DeletionProviderError("LEMON_NOT_CONFIGURED")
  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE", signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${key}` },
  })
  if (response.status === 404) return
  if (!response.ok) throw new DeletionProviderError("LEMON_CANCEL_FAILED")
  const payload = await response.json()
  if (payload?.data?.attributes?.cancelled !== true) throw new DeletionProviderError("LEMON_CANCEL_NOT_CONFIRMED")
}

async function deleteClerkIdentity(clerkUserId: string) {
  if (!process.env.CLERK_SECRET_KEY) throw new DeletionProviderError("CLERK_NOT_CONFIGURED")
  // Timeout real de red: una identidad lenta no debe agotar la concesión ni perder la respuesta 202.
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
    method: "DELETE", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  })
  if (response.status !== 404 && !response.ok) throw new DeletionProviderError("CLERK_DELETE_FAILED")
}

async function deleteUploadedFiles(keys: string[]) {
  const client = new UTApi({ fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) })
  const result = await client.deleteFiles(keys)
  if (!result.success) throw new DeletionProviderError("UPLOADTHING_DELETE_FAILED")
}

// Adaptadores sustituibles únicamente desde código de servidor/pruebas, nunca desde el body del endpoint.
export type DeletionProviders = {
  cancelSubscription: (id: string) => Promise<void>
  deleteIdentity: (id: string) => Promise<void>
  deleteFiles: (keys: string[]) => Promise<void>
}
const providers: DeletionProviders = {
  cancelSubscription: cancelLemonSubscription, deleteIdentity: deleteClerkIdentity, deleteFiles: deleteUploadedFiles,
}

export async function processAccountDeletion(id: string, adapters: DeletionProviders = providers): Promise<boolean> {
  const leaseToken = randomUUID()
  const now = new Date()
  const claimed = await prisma.accountDeletion.updateMany({ where: {
    id, stage: { not: "COMPLETED" }, nextAttemptAt: { lte: now },
    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
  }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } } })
  if (!claimed.count) return (await prisma.accountDeletion.findUnique({ where: { id } }))?.stage === "COMPLETED"

  let stage: AccountDeletion["stage"] = "CANCEL_SUBSCRIPTION"
  try {
    // Cada etapa guarda su progreso. Una caída después de un proveedor se repite sin recrear datos.
    while (Date.now() - now.getTime() < 40000) {
      const job = await prisma.accountDeletion.findFirst({ where: { id, leaseToken } })
      if (!job) return false
      stage = job.stage
      // Las tareas aceptadas por versiones anteriores también se detienen antes de efectos externos.
      if (await hasFiscalHistory(prisma, job.accountId)) throw new DeletionProviderError("FISCAL_RETENTION_REQUIRED")
      let data: Prisma.AccountDeletionUpdateManyMutationInput
      switch (stage) {
        case "CANCEL_SUBSCRIPTION":
          if (job.lemonSubscriptionId) await adapters.cancelSubscription(job.lemonSubscriptionId)
          data = { stage: "PURGE_DATA", lemonSubscriptionId: null }
          break
        case "PURGE_DATA":
          await cashRequest.run({ maintenance: true }, () => prisma.$transaction(async tx => {
            // Verificar la concesión dentro del mismo commit que borra el negocio.
            const owned = await tx.accountDeletion.findFirst({ where: { id, leaseToken, leaseExpiresAt: { gt: new Date() } } })
            if (!owned) throw new DeletionProviderError("DELETION_LEASE_LOST")
            await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${job.accountId} FOR UPDATE`
            await purgeAccountData(tx, job.accountId)
            await tx.accountDeletion.update({ where: { id }, data: { stage: "DELETE_IDENTITY", lastError: null } })
          }, { timeout: 60000, maxWait: 5000 }))
          continue
        case "DELETE_IDENTITY":
          if (job.clerkUserId) await adapters.deleteIdentity(job.clerkUserId)
          data = { stage: "DELETE_FILES", clerkUserId: null }
          break
        case "DELETE_FILES": {
          const batch = job.fileKeys.slice(0, 100)
          if (batch.length) {
            // Revalidar referencias al borrar, por si otro negocio empezó a compartir el archivo.
            const shared = await referencedFiles(prisma, job.accountId, true)
            const exclusive = batch.filter(key => !shared.has(key))
            if (exclusive.length) await adapters.deleteFiles(exclusive)
            data = { fileKeys: job.fileKeys.slice(batch.length) }
          } else data = { stage: "COMPLETED", completedAt: new Date(), clerkUserId: null, lemonSubscriptionId: null, fileKeys: [] }
          break
        }
        case "COMPLETED": return true
      }
      const updated = await prisma.accountDeletion.updateMany({
        where: { id, leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { ...data, lastError: null },
      })
      if (!updated.count) return false
    }
    return (await prisma.accountDeletion.findUnique({ where: { id } }))?.stage === "COMPLETED"
  } catch (error) {
    // Los mensajes externos pueden contener credenciales/PII. Solo persistir códigos controlados.
    const code = error instanceof DeletionProviderError ? error.message : `${stage}_FAILED`
    const job = await prisma.accountDeletion.findFirst({ where: { id, leaseToken } })
    if (job) await prisma.accountDeletion.updateMany({ where: { id, leaseToken }, data: {
      lastError: code, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6))),
    } })
    console.error("[AccountDeletion] Etapa pendiente", { id, stage, code })
    return false
  } finally {
    await prisma.accountDeletion.updateMany({ where: { id, leaseToken }, data: { leaseToken: null, leaseExpiresAt: null } })
  }
}

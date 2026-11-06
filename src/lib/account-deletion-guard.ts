import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cashRequest } from "@/lib/cash-context"

export function accountIdentityHash(clerkUserId: string) {
  return createHash("sha256").update(clerkUserId).digest("hex")
}

export async function isAccountIdentityDeleted(clerkUserId: string) {
  return Boolean(await prisma.accountDeletion.findUnique({
    where: { clerkUserHash: accountIdentityHash(clerkUserId) },
    select: { id: true },
  }))
}

export async function lockAccountIdentity(tx: Prisma.TransactionClient, clerkUserId: string) {
  // La creación y la baja comparten candado: un webhook atrasado nunca debe recrear el tenant.
  // El resultado nativo es void; convertirlo evita que Prisma falle al deserializar el candado adquirido.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountIdentityHash(clerkUserId)}, 0))::text`
}

export async function withAccountIdentityLock<T>(
  clerkUserId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return cashRequest.run({ maintenance: true }, () => prisma.$transaction(async tx => {
    await lockAccountIdentity(tx, clerkUserId)
    return work(tx)
  }, { timeout: 30000, maxWait: 5000 }))
}

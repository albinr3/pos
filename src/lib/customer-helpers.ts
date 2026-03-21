import type { Prisma, PrismaClient } from "@prisma/client"

export const GENERIC_CUSTOMER_NAME = "Cliente general"

type CustomerDbClient = PrismaClient | Prisma.TransactionClient

type GenericCustomer = {
  id: string
  visualId: number
  name: string
  isActive: boolean
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null
  if (!("code" in error)) return null
  return typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null
}

export async function ensureCustomerSequenceAtLeast(
  db: CustomerDbClient,
  accountId: string,
  minLastNumber: number
) {
  const safeMin = Math.max(0, Math.trunc(minLastNumber))
  const sequence = await db.customerSequence.upsert({
    where: { accountId },
    update: {},
    create: {
      accountId,
      lastNumber: safeMin,
    },
  })

  if (sequence.lastNumber >= safeMin) return sequence.lastNumber

  const updated = await db.customerSequence.update({
    where: { accountId },
    data: { lastNumber: safeMin },
    select: { lastNumber: true },
  })

  return updated.lastNumber
}

export async function nextCustomerVisualId(db: CustomerDbClient, accountId: string) {
  const sequence = await db.customerSequence.upsert({
    where: { accountId },
    update: { lastNumber: { increment: 1 } },
    create: {
      accountId,
      // El 1 está reservado para Cliente general.
      lastNumber: 2,
    },
    select: { lastNumber: true },
  })

  if (sequence.lastNumber >= 2) return sequence.lastNumber

  const corrected = await db.customerSequence.update({
    where: { accountId },
    data: { lastNumber: 2 },
    select: { lastNumber: true },
  })

  return corrected.lastNumber
}

export async function ensureGenericCustomer(
  db: CustomerDbClient,
  accountId: string
): Promise<GenericCustomer> {
  const existingGeneric = await db.customer.findFirst({
    where: {
      accountId,
      isGeneric: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      visualId: true,
      name: true,
      isActive: true,
    },
  })

  if (existingGeneric) {
    let visualId = existingGeneric.visualId
    let maxAssignedVisualId = existingGeneric.visualId

    if (existingGeneric.visualId !== 1) {
      const visualOne = await db.customer.findFirst({
        where: { accountId, visualId: 1 },
        select: { id: true },
      })

      if (visualOne && visualOne.id !== existingGeneric.id) {
        const reassignedVisualId = await nextCustomerVisualId(db, accountId)
        await db.customer.updateMany({
          where: { id: visualOne.id, accountId },
          data: { visualId: reassignedVisualId },
        })
        maxAssignedVisualId = Math.max(maxAssignedVisualId, reassignedVisualId)
      }

      await db.customer.updateMany({
        where: { id: existingGeneric.id, accountId },
        data: {
          visualId: 1,
          name: GENERIC_CUSTOMER_NAME,
          isActive: true,
          isGeneric: true,
        },
      })
      visualId = 1
      maxAssignedVisualId = Math.max(maxAssignedVisualId, 1)
    } else if (existingGeneric.name !== GENERIC_CUSTOMER_NAME || !existingGeneric.isActive) {
      await db.customer.updateMany({
        where: { id: existingGeneric.id, accountId },
        data: {
          name: GENERIC_CUSTOMER_NAME,
          isActive: true,
          isGeneric: true,
        },
      })
    }

    await ensureCustomerSequenceAtLeast(db, accountId, Math.max(1, maxAssignedVisualId))
    return {
      id: existingGeneric.id,
      visualId,
      name: GENERIC_CUSTOMER_NAME,
      isActive: true,
    }
  }

  try {
    const created = await db.customer.create({
      data: {
        accountId,
        visualId: 1,
        name: GENERIC_CUSTOMER_NAME,
        isGeneric: true,
        isActive: true,
      },
      select: {
        id: true,
        visualId: true,
        name: true,
        isActive: true,
      },
    })

    await ensureCustomerSequenceAtLeast(db, accountId, 1)
    return created
  } catch (error: unknown) {
    if (getErrorCode(error) !== "P2002") throw error
    return ensureGenericCustomer(db, accountId)
  }
}

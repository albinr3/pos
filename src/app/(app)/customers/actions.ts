"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString, sanitizePhone, sanitizeCedula, validateLength } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"
import { ensurePermission } from "@/lib/permission-guard"
import { ensureGenericCustomer, nextCustomerVisualId } from "@/lib/customer-helpers"

type AuthActor = {
  id: string
  accountId: string
  email?: string | null
  username?: string | null
}

function assertAuthActor(actor: unknown): asserts actor is AuthActor {
  if (!actor || typeof actor !== "object") throw new Error("No autenticado")
  const candidate = actor as { id?: unknown; accountId?: unknown }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("No autenticado")
  if (typeof candidate.accountId !== "string" || candidate.accountId.length === 0) throw new Error("No autenticado")
}

export async function listCustomers(query?: string, user?: AuthActor) {
  const currentUser = user ?? await getCurrentUser()
  assertAuthActor(currentUser)

  // Asegurar que el cliente general existe
  await ensureGenericCustomer(prisma, currentUser.accountId)

  const q = query?.trim()
  const normalizedVisualQuery = q ? q.replace(/^#/, "") : ""
  const visualIdQuery = normalizedVisualQuery && /^\d+$/.test(normalizedVisualQuery) ? Number(normalizedVisualQuery) : null
  return prisma.customer.findMany({
    where: {
      accountId: currentUser.accountId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(visualIdQuery !== null ? [{ visualId: visualIdQuery }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    take: 200,
  })
}

export async function listCustomersPage(
  options?: { query?: string; cursor?: string | null; take?: number },
  actor?: AuthActor
) {
  const user = actor ?? await getCurrentUser()
  assertAuthActor(user)

  // Asegurar que el cliente general existe
  await ensureGenericCustomer(prisma, user.accountId)

  const q = options?.query?.trim()
  const normalizedVisualQuery = q ? q.replace(/^#/, "") : ""
  const visualIdQuery = normalizedVisualQuery && /^\d+$/.test(normalizedVisualQuery) ? Number(normalizedVisualQuery) : null
  const take = Math.min(Math.max(options?.take ?? 50, 1), 200)

  const customers = await prisma.customer.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(visualIdQuery !== null ? [{ visualId: visualIdQuery }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }, { id: "asc" }],
    cursor: options?.cursor ? { id: options.cursor } : undefined,
    skip: options?.cursor ? 1 : 0,
    take: take + 1,
  })

  const hasMore = customers.length > take
  const pageItems = hasMore ? customers.slice(0, take) : customers
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null

  return {
    items: pageItems,
    nextCursor,
  }
}

export async function upsertCustomer(input: {
  id?: string
  name: string
  phone?: string | null
  address?: string | null
  cedula?: string | null
  province?: string | null
  creditEnabled: boolean
  creditDays: number
}, actor?: AuthActor) {
  const user = actor ?? await getCurrentUser()
  assertAuthActor(user)
  await ensurePermission(user, "canManageCustomers", {
    message: "No tienes permiso para gestionar clientes",
    resourceType: "Customer",
    resourceId: input.id,
  })

  const normalizedCreditDays = input.creditEnabled ? input.creditDays : 0
  let persistedCustomer: { id: string; visualId: number } | null = null

  // 🔐 SANITIZAR todos los inputs
  const sanitized = {
    name: sanitizeString(input.name),
    phone: input.phone ? sanitizePhone(input.phone) : null,
    address: input.address ? sanitizeString(input.address) : null,
    cedula: input.cedula ? sanitizeCedula(input.cedula) : null,
    province: input.province ? sanitizeString(input.province) : null,
  }

  // 🔐 VALIDAR longitudes
  if (!validateLength(sanitized.name, 2, 100)) {
    throw new Error("El nombre debe tener entre 2 y 100 caracteres")
  }

  if (sanitized.address && !validateLength(sanitized.address, 0, 200)) {
    throw new Error("La dirección no puede exceder 200 caracteres")
  }

  if (input.id) {
    const existing = await prisma.customer.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Cliente no encontrado")
    if (existing.isGeneric) throw new Error("No se puede modificar el Cliente general")

    const isChangingCreditPolicy =
      existing.creditEnabled !== input.creditEnabled ||
      existing.creditDays !== normalizedCreditDays

    if (isChangingCreditPolicy) {
      await ensurePermission(user, "canApproveCredit", {
        message: "No tienes permiso para aprobar lineas de credito",
        resourceType: "Customer",
        resourceId: input.id,
      })
    }

    const updated = await prisma.customer.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        name: sanitized.name,
        phone: sanitized.phone,
        address: sanitized.address,
        cedula: sanitized.cedula,
        province: sanitized.province,
        creditEnabled: input.creditEnabled,
        creditDays: normalizedCreditDays,
      },
    })
    if (updated.count === 0) throw new Error("Cliente no encontrado")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "CUSTOMER_EDITED",
      resourceType: "Customer",
      resourceId: input.id,
      details: {
        name: sanitized.name,
        phone: sanitized.phone,
        address: sanitized.address,
        cedula: sanitized.cedula,
        province: sanitized.province,
      },
    })
    persistedCustomer = {
      id: existing.id,
      visualId: existing.visualId,
    }
  } else {
    if (input.creditEnabled || normalizedCreditDays > 0) {
      await ensurePermission(user, "canApproveCredit", {
        message: "No tienes permiso para aprobar lineas de credito",
        resourceType: "Customer",
      })
    }

    await ensureGenericCustomer(prisma, user.accountId)

    let created: { id: string; visualId: number } | null = null
    let lastError: unknown = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const visualId = await nextCustomerVisualId(prisma, user.accountId)
        created = await prisma.customer.create({
          data: {
            accountId: user.accountId,
            visualId,
            name: sanitized.name,
            phone: sanitized.phone,
            address: sanitized.address,
            cedula: sanitized.cedula,
            province: sanitized.province,
            creditEnabled: input.creditEnabled,
            creditDays: normalizedCreditDays,
            isGeneric: false,
            isActive: true,
          },
          select: { id: true, visualId: true },
        })
        break
      } catch (error: unknown) {
        lastError = error
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : ""
        if (code !== "P2002") throw error
      }
    }

    if (!created) {
      throw (lastError instanceof Error ? lastError : new Error("No se pudo asignar visualId al cliente"))
    }

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "CUSTOMER_CREATED",
      resourceType: "Customer",
      resourceId: created.id,
      details: {
        visualId: created.visualId,
        name: sanitized.name,
        phone: sanitized.phone,
        address: sanitized.address,
        cedula: sanitized.cedula,
        province: sanitized.province,
      },
    })
    persistedCustomer = created
  }

  revalidatePath("/customers")
  revalidatePath("/sales")
  revalidatePath("/ar")

  if (!persistedCustomer) {
    throw new Error("No se pudo persistir el cliente")
  }

  return persistedCustomer
}

export async function deactivateCustomer(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageCustomers", {
    message: "No tienes permiso para gestionar clientes",
    resourceType: "Customer",
    resourceId: id,
  })

  const existing = await prisma.customer.findFirst({
    where: { id, accountId: user.accountId },
  })
  if (!existing) throw new Error("Cliente no encontrado")
    if (existing.isGeneric) throw new Error("No se puede desactivar el Cliente general")

  const updated = await prisma.customer.updateMany({
    where: { id, accountId: user.accountId },
    data: { isActive: false },
  })
  if (updated.count === 0) throw new Error("Cliente no encontrado")

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    userEmail: user.email ?? null,
    userUsername: user.username ?? null,
    action: "CUSTOMER_DELETED",
    resourceType: "Customer",
    resourceId: id,
    details: { name: existing.name },
  })

  revalidatePath("/customers")
  revalidatePath("/sales")
  revalidatePath("/ar")
}

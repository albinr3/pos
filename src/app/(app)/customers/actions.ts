"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString, sanitizePhone, sanitizeCedula, validateLength } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"

/**
 * Asegura que el cliente general existe y devuelve su ID
 * Maneja condiciones de carrera donde múltiples solicitudes pueden intentar crear el cliente
 */
async function ensureGenericCustomer(accountId: string): Promise<string> {
  // Primero verificar si ya existe
  const existingGeneric = await prisma.customer.findFirst({
    where: {
      accountId,
      isGeneric: true,
    },
  })

  if (existingGeneric) {
    return existingGeneric.id
  }

  // Intentar crear el cliente genérico
  try {
    const newGeneric = await prisma.customer.create({
      data: {
        accountId,
        name: "Cliente general",
        isGeneric: true,
        isActive: true,
      },
    })
    return newGeneric.id
  } catch (error: any) {
    // Si ya existe por condición de carrera, buscarlo nuevamente
    if (error?.code === "P2002") {
      const retryGeneric = await prisma.customer.findFirst({
        where: {
          accountId,
          isGeneric: true,
        },
      })
      if (retryGeneric) {
        return retryGeneric.id
      }
    }
    // Re-lanzar el error si no es un error de duplicación
    throw error
  }
}

export async function listCustomers(query?: string, user?: any) {
  const currentUser = user ?? await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  // Asegurar que el cliente general existe
  await ensureGenericCustomer(currentUser.accountId)

  const q = query?.trim()
  return prisma.customer.findMany({
    where: {
      accountId: currentUser.accountId,
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    take: 200,
  })
}

export async function listCustomersPage(options?: { query?: string; cursor?: string | null; take?: number }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Asegurar que el cliente general existe
  await ensureGenericCustomer(currentUser.accountId)

  const q = options?.query?.trim()
  const take = Math.min(Math.max(options?.take ?? 50, 1), 200)

  const customers = await prisma.customer.findMany({
    where: {
      accountId: currentUser.accountId,
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
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
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

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

    const updated = await prisma.customer.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        name: sanitized.name,
        phone: sanitized.phone,
        address: sanitized.address,
        cedula: sanitized.cedula,
        province: sanitized.province,
        creditEnabled: input.creditEnabled,
        creditDays: input.creditDays,
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
  } else {
    const created = await prisma.customer.create({
      data: {
        accountId: user.accountId,
        name: sanitized.name,
        phone: sanitized.phone,
        address: sanitized.address,
        cedula: sanitized.cedula,
        province: sanitized.province,
        creditEnabled: input.creditEnabled,
        creditDays: input.creditDays,
        isGeneric: false,
        isActive: true,
      },
    })

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "CUSTOMER_CREATED",
      resourceType: "Customer",
      resourceId: created.id,
      details: {
        name: sanitized.name,
        phone: sanitized.phone,
        address: sanitized.address,
        cedula: sanitized.cedula,
        province: sanitized.province,
      },
    })
  }

  revalidatePath("/customers")
  revalidatePath("/sales")
  revalidatePath("/ar")
}

export async function deactivateCustomer(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

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

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

/**
 * Asegura que el cliente general existe y devuelve su ID
 */
async function ensureGenericCustomer(accountId: string): Promise<string> {
  const existingGeneric = await prisma.customer.findFirst({
    where: {
      accountId,
      isGeneric: true,
    },
  })

  if (existingGeneric) {
    return existingGeneric.id
  }

  // Crear cliente general si no existe
  const newGeneric = await prisma.customer.create({
    data: {
      accountId,
      name: "Cliente general",
      isGeneric: true,
      isActive: true,
    },
  })

  return newGeneric.id
}

export async function listCustomers(query?: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  // Asegurar que el cliente general existe
  await ensureGenericCustomer(user.accountId)

  const q = query?.trim()
  return prisma.customer.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }],
    take: 200,
  })
}

export async function upsertCustomer(input: {
  id?: string
  name: string
  phone?: string | null
  address?: string | null
  cedula?: string | null
  province?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const name = input.name.trim()
  if (!name) throw new Error("El nombre es requerido")

  const phone = input.phone?.trim() || null
  const address = input.address?.trim() || null
  const cedula = input.cedula?.trim() || null
  const province = input.province?.trim() || null

  if (input.id) {
    const existing = await prisma.customer.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Cliente no encontrado")
    if (existing.isGeneric) throw new Error("No se puede modificar el Cliente general")

    await prisma.customer.update({
      where: { id: input.id },
      data: { name, phone, address, cedula, province },
    })
  } else {
    await prisma.customer.create({
      data: {
        accountId: user.accountId,
        name,
        phone,
        address,
        cedula,
        province,
        isGeneric: false,
        isActive: true,
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

  await prisma.customer.update({ where: { id }, data: { isActive: false } })

  revalidatePath("/customers")
  revalidatePath("/sales")
  revalidatePath("/ar")
}

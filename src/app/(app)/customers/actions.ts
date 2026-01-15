"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function listCustomers(query?: string) {
  const q = query?.trim()
  return prisma.customer.findMany({
    where: {
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
  const name = input.name.trim()
  if (!name) throw new Error("El nombre es requerido")

  const phone = input.phone?.trim() || null
  const address = input.address?.trim() || null
  const cedula = input.cedula?.trim() || null
  const province = input.province?.trim() || null

  if (input.id) {
    const existing = await prisma.customer.findUnique({ where: { id: input.id } })
    if (!existing) throw new Error("Cliente no encontrado")
    if (existing.isGeneric) throw new Error("No se puede modificar el Cliente Genérico")

    await prisma.customer.update({
      where: { id: input.id },
      data: { name, phone, address, cedula, province },
    })
  } else {
    await prisma.customer.create({
      data: { name, phone, address, cedula, province, isGeneric: false, isActive: true },
    })
  }

  revalidatePath("/customers")
  revalidatePath("/sales")
  revalidatePath("/ar")
}

export async function deactivateCustomer(id: string) {
  const existing = await prisma.customer.findUnique({ where: { id } })
  if (!existing) throw new Error("Cliente no encontrado")
  if (existing.isGeneric) throw new Error("No se puede desactivar el Cliente Genérico")

  await prisma.customer.update({ where: { id }, data: { isActive: false } })

  revalidatePath("/customers")
  revalidatePath("/sales")
  revalidatePath("/ar")
}

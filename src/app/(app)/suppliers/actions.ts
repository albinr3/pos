"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function listSuppliers(query?: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = query?.trim()
  return prisma.supplier.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { contactName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
  })
}

export async function getAllSuppliers() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.supplier.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: { name: "asc" },
  })
}

export async function upsertSupplier(input: {
  id?: string
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  discountPercentBp?: number
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const name = input.name.trim()
  if (!name) throw new Error("El nombre es requerido")

  if (input.id) {
    const existing = await prisma.supplier.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Proveedor no encontrado")

    await prisma.supplier.update({
      where: { id: input.id },
      data: {
        name,
        contactName: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        discountPercentBp: input.discountPercentBp ?? 0,
      },
    })
  } else {
    await prisma.supplier.create({
      data: {
        accountId: user.accountId,
        name,
        contactName: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        discountPercentBp: input.discountPercentBp ?? 0,
      },
    })
  }

  revalidatePath("/suppliers")
}

export async function deactivateSupplier(supplierId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const existing = await prisma.supplier.findFirst({
    where: { id: supplierId, accountId: user.accountId },
  })
  if (!existing) throw new Error("Proveedor no encontrado")

  await prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: false },
  })
  revalidatePath("/suppliers")
}

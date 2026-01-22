"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString, sanitizePhone } from "@/lib/sanitize"

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

  const name = sanitizeString(input.name)
  if (!name) throw new Error("El nombre es requerido")
  const contactName = input.contactName ? sanitizeString(input.contactName) : null
  const phone = input.phone ? sanitizePhone(input.phone) : null
  const email = input.email ? sanitizeString(input.email) : null
  const address = input.address ? sanitizeString(input.address) : null
  const notes = input.notes ? sanitizeString(input.notes) : null

  if (input.id) {
    const existing = await prisma.supplier.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Proveedor no encontrado")

    const updated = await prisma.supplier.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        name,
        contactName,
        phone,
        email,
        address,
        notes,
        discountPercentBp: input.discountPercentBp ?? 0,
      },
    })
    if (updated.count === 0) throw new Error("Proveedor no encontrado")
  } else {
    await prisma.supplier.create({
      data: {
        accountId: user.accountId,
        name,
        contactName,
        phone,
        email,
        address,
        notes,
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

  const updated = await prisma.supplier.updateMany({
    where: { id: supplierId, accountId: user.accountId },
    data: { isActive: false },
  })
  if (updated.count === 0) throw new Error("Proveedor no encontrado")
  revalidatePath("/suppliers")
}

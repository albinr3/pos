"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function listSuppliers(query?: string) {
  const q = query?.trim()
  return prisma.supplier.findMany({
    where: {
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
  return prisma.supplier.findMany({
    where: { isActive: true },
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
  const name = input.name.trim()
  if (!name) throw new Error("El nombre es requerido")

  if (input.id) {
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
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: false },
  })
  revalidatePath("/suppliers")
}











"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function listCategories(query?: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const q = query?.trim()
  return prisma.category.findMany({
    where: {
      accountId: user.accountId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
  })
}

export async function getAllCategories() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.category.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: { name: "asc" },
  })
}

export async function upsertCategory(input: {
  id?: string
  name: string
  description?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const name = input.name.trim()
  if (!name) throw new Error("El nombre es requerido")

  if (input.id) {
    const existing = await prisma.category.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Categoría no encontrada")

    await prisma.category.update({
      where: { id: input.id },
      data: {
        name,
        description: input.description?.trim() || null,
      },
    })
  } else {
    // Verificar que no exista otra categoría con el mismo nombre en el account
    const existing = await prisma.category.findFirst({
      where: {
        accountId: user.accountId,
        name: { equals: name, mode: "insensitive" },
        isActive: true,
      },
    })
    if (existing) throw new Error("Ya existe una categoría con ese nombre")
    
    await prisma.category.create({
      data: {
        accountId: user.accountId,
        name,
        description: input.description?.trim() || null,
      },
    })
  }

  revalidatePath("/categories")
  revalidatePath("/products")
}

export async function deactivateCategory(categoryId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, accountId: user.accountId },
  })
  if (!existing) throw new Error("Categoría no encontrada")

  await prisma.category.update({
    where: { id: categoryId },
    data: { isActive: false },
  })
  revalidatePath("/categories")
  revalidatePath("/products")
}

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"
import { ensurePermission } from "@/lib/permission-guard"

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
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: { categoryId: "asc" },
    take: 200,
  })
}

export async function getAllCategories() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  return prisma.category.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: { categoryId: "asc" },
  })
}

export async function upsertCategory(input: {
  id?: string
  name: string
  description?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageCategories", {
    message: "No tienes permiso para gestionar categorias",
    resourceType: "Category",
    resourceId: input.id,
  })

  const name = sanitizeString(input.name)
  if (!name) throw new Error("El nombre es requerido")
  const description = input.description ? sanitizeString(input.description) : null

  if (input.id) {
    const existing = await prisma.category.findFirst({
      where: { id: input.id, accountId: user.accountId },
    })
    if (!existing) throw new Error("Categoría no encontrada")

    const updated = await prisma.category.updateMany({
      where: { id: input.id, accountId: user.accountId },
      data: {
        name,
        description,
      },
    })
    if (updated.count === 0) throw new Error("Categoría no encontrada")

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "CATEGORY_EDITED",
      resourceType: "Category",
      resourceId: input.id,
      details: { name, description, categoryId: existing.categoryId },
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
    
    const created = await prisma.$transaction(async (tx) => {
      const sequence = await tx.categorySequence.upsert({
        where: { accountId: user.accountId },
        update: { lastNumber: { increment: 1 } },
        create: { accountId: user.accountId, lastNumber: 1 },
      })

      return tx.category.create({
        data: {
          accountId: user.accountId,
          categoryId: sequence.lastNumber,
          name,
          description,
        },
      })
    })

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "CATEGORY_CREATED",
      resourceType: "Category",
      resourceId: created.id,
      details: { name, description, categoryId: created.categoryId },
    })
  }

  revalidatePath("/categories")
  revalidatePath("/products")
}

export async function deactivateCategory(categoryId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageCategories", {
    message: "No tienes permiso para gestionar categorias",
    resourceType: "Category",
    resourceId: categoryId,
  })

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, accountId: user.accountId },
  })
  if (!existing) throw new Error("Categoría no encontrada")

  const updated = await prisma.category.updateMany({
    where: { id: categoryId, accountId: user.accountId },
    data: { isActive: false },
  })
  if (updated.count === 0) throw new Error("Categoría no encontrada")

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    userEmail: user.email ?? null,
    userUsername: user.username ?? null,
    action: "CATEGORY_DELETED",
    resourceType: "Category",
    resourceId: categoryId,
    details: { name: existing.name },
  })
  revalidatePath("/categories")
  revalidatePath("/products")
}

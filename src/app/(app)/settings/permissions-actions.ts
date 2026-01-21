"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function listUsersWithPermissions() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const users = await prisma.user.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      canOverridePrice: true,
      canCancelSales: true,
      canCancelReturns: true,
      canCancelPayments: true,
      canEditSales: true,
      canEditProducts: true,
      canChangeSaleType: true,
      canSellWithoutStock: true,
      canManageBackups: true,
      canViewProductCosts: true,
      canViewProfitReport: true,
    },
  })
  return users
}

export async function updateUserPermissions(input: {
  userId: string
  canOverridePrice?: boolean
  canCancelSales?: boolean
  canCancelReturns?: boolean
  canCancelPayments?: boolean
  canEditSales?: boolean
  canEditProducts?: boolean
  canChangeSaleType?: boolean
  canSellWithoutStock?: boolean
  canManageBackups?: boolean
  canViewProductCosts?: boolean
  canViewProfitReport?: boolean
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  // Verificar que el usuario pertenece al account
  const targetUser = await prisma.user.findFirst({
    where: { accountId: currentUser.accountId, id: input.userId },
  })
  if (!targetUser) throw new Error("Usuario no encontrado")

  const { userId, ...permissions } = input
  
  await prisma.user.update({
    where: { id: userId },
    data: permissions,
  })

  revalidatePath("/settings")
}

export async function setAllPermissions(userId: string, value: boolean) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  // Verificar que el usuario pertenece al account
  const targetUser = await prisma.user.findFirst({
    where: { accountId: currentUser.accountId, id: userId },
  })
  if (!targetUser) throw new Error("Usuario no encontrado")

  await prisma.user.update({
    where: { id: userId },
    data: {
      canOverridePrice: value,
      canCancelSales: value,
      canCancelReturns: value,
      canCancelPayments: value,
      canEditSales: value,
      canEditProducts: value,
      canChangeSaleType: value,
      canSellWithoutStock: value,
      canManageBackups: value,
      canViewProductCosts: value,
      canViewProfitReport: value,
    },
  })

  revalidatePath("/settings")
}

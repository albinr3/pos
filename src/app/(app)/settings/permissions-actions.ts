"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function listUsersWithPermissions() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
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
}) {
  const { userId, ...permissions } = input
  
  await prisma.user.update({
    where: { id: userId },
    data: permissions,
  })

  revalidatePath("/settings")
}

export async function setAllPermissions(userId: string, value: boolean) {
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
    },
  })

  revalidatePath("/settings")
}

"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function getSalesConfig() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const settings = await prisma.companySettings.findFirst({ 
    where: { accountId: user.accountId } 
  })
  return {
    allowNegativeStock: settings?.allowNegativeStock ?? false,
  }
}

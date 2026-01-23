"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"

export async function updateCompanyInfo(input: {
  name: string
  phone: string
  address: string
  logoUrl?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const name = input.name.trim()
  const phone = input.phone.trim()
  const address = input.address.trim()

  if (!name) throw new Error("El nombre es requerido")

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { 
      name, 
      phone, 
      address,
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
    },
    create: {
      accountId: user.accountId,
      name,
      phone,
      address,
      logoUrl: input.logoUrl || null,
      allowNegativeStock: false,
      itbisRateBp: 1800,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    userEmail: user.email ?? null,
    userUsername: user.username ?? null,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: {
      name,
      phone,
      address,
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    },
  })

  revalidatePath("/settings")
  revalidatePath("/invoices")
  revalidatePath("/quotes")
}

"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function getSettings() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const s = await prisma.companySettings.findFirst({
    where: { accountId: user.accountId },
  })
  
  return {
    name: s?.name ?? "Mi Negocio",
    phone: s?.phone ?? "",
    address: s?.address ?? "",
    logoUrl: s?.logoUrl ?? null,
    allowNegativeStock: s?.allowNegativeStock ?? false,
    barcodeLabelSize: s?.barcodeLabelSize ?? "4x2",
    shippingLabelSize: s?.shippingLabelSize ?? "4x6",
  }
}

export async function updateAllowNegativeStock(allow: boolean) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { allowNegativeStock: allow },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: allow,
      itbisRateBp: 1800,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/sales")
}

export async function updateLabelSizes(barcodeLabelSize: string, shippingLabelSize: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { barcodeLabelSize, shippingLabelSize },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      barcodeLabelSize,
      shippingLabelSize,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/products")
  revalidatePath("/shipping-labels")
}

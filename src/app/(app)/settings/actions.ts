"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"

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
    defaultViewMode: s?.defaultViewMode ?? "list",
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

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: { allowNegativeStock: allow },
  })

  revalidatePath("/settings")
  revalidatePath("/sales")
}

export async function updateLabelSizes(barcodeLabelSize: string, shippingLabelSize: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sanitizedBarcodeLabelSize = sanitizeString(barcodeLabelSize)
  const sanitizedShippingLabelSize = sanitizeString(shippingLabelSize)

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { barcodeLabelSize: sanitizedBarcodeLabelSize, shippingLabelSize: sanitizedShippingLabelSize },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      barcodeLabelSize: sanitizedBarcodeLabelSize,
      shippingLabelSize: sanitizedShippingLabelSize,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: {
      barcodeLabelSize: sanitizedBarcodeLabelSize,
      shippingLabelSize: sanitizedShippingLabelSize,
    },
  })

  revalidatePath("/settings")
  revalidatePath("/products")
  revalidatePath("/shipping-labels")

}

export async function updateSalesSettings(defaultViewMode: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const sanitizedViewMode = sanitizeString(defaultViewMode)

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { defaultViewMode: sanitizedViewMode },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      defaultViewMode: sanitizedViewMode,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: { defaultViewMode: sanitizedViewMode },
  })

  revalidatePath("/settings")
  revalidatePath("/sales")
}


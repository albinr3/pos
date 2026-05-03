"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { sanitizeString } from "@/lib/sanitize"
import { logAuditEvent } from "@/lib/audit-log"
import { ensurePermission } from "@/lib/permission-guard"

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
    itbisRateBp: s?.itbisRateBp ?? 1800,
    salePricesIncludeItbis: s?.salePricesIncludeItbis ?? true,
    barcodeLabelSize: s?.barcodeLabelSize ?? "4x2",
    shippingLabelSize: s?.shippingLabelSize ?? "4x6",
    defaultViewMode: s?.defaultViewMode ?? "list",
    defaultProfitMarginBp: s?.defaultProfitMarginBp ?? 3000,
    showItbisOnReceipts: s?.showItbisOnReceipts ?? true,
    legalTipEnabled: s?.legalTipEnabled ?? false,
    salePrintFormat: s?.salePrintFormat ?? "80mm",
    quotePrintFormat: s?.quotePrintFormat ?? "80mm",
    paymentPrintFormat: s?.paymentPrintFormat ?? "80mm",
    returnPrintFormat: s?.returnPrintFormat ?? "80mm",
  }
}

export async function updateAllowNegativeStock(allow: boolean) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

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
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      defaultProfitMarginBp: 3000,
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
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

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
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      defaultProfitMarginBp: 3000,
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
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

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
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      defaultProfitMarginBp: 3000,
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

export async function updateReceiptSettings(showItbis: boolean) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { showItbisOnReceipts: showItbis },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      defaultProfitMarginBp: 3000,
      showItbisOnReceipts: showItbis,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: { showItbisOnReceipts: showItbis },
  })

  revalidatePath("/settings")
}

export async function updatePurchasePricingSettings(defaultProfitMarginBp: number) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

  const normalizedMargin = Math.min(50000, Math.max(0, Math.round(defaultProfitMarginBp || 0)))

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { defaultProfitMarginBp: normalizedMargin },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      defaultProfitMarginBp: normalizedMargin,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: { defaultProfitMarginBp: normalizedMargin },
  })

  revalidatePath("/settings")
  revalidatePath("/purchases")
}

export async function updatePrintFormats(formats: {
  sale: string
  quote: string
  payment: string
  returnFormat: string
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { 
      salePrintFormat: formats.sale,
      quotePrintFormat: formats.quote,
      paymentPrintFormat: formats.payment,
      returnPrintFormat: formats.returnFormat,
    },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
      defaultProfitMarginBp: 3000,
      salePrintFormat: formats.sale,
      quotePrintFormat: formats.quote,
      paymentPrintFormat: formats.payment,
      returnPrintFormat: formats.returnFormat,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: formats,
  })

  revalidatePath("/settings")
  // Revalidate relevant features
  revalidatePath("/sales")
  revalidatePath("/quotes")
  revalidatePath("/ar")
}

export async function updateSalePriceTaxMode(salePricesIncludeItbis: boolean) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { salePricesIncludeItbis },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      salePricesIncludeItbis,
      legalTipEnabled: false,
      defaultProfitMarginBp: 3000,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: { salePricesIncludeItbis },
  })

  revalidatePath("/settings")
  revalidatePath("/sales")
  revalidatePath("/sales/list")
  revalidatePath("/quotes")
  revalidatePath("/quotes/list")
  revalidatePath("/products")
  revalidatePath("/returns")
  revalidatePath("/returns/list")
}

export async function updateLegalTipSetting(enabled: boolean) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")
  await ensurePermission(user, "canManageSettings", {
    allowAdminBypass: false,
    message: "No tienes permiso para modificar ajustes",
    resourceType: "CompanySettings",
  })

  await prisma.companySettings.upsert({
    where: { accountId: user.accountId },
    update: { legalTipEnabled: enabled },
    create: {
      accountId: user.accountId,
      name: "Mi Negocio",
      phone: "",
      address: "",
      allowNegativeStock: false,
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: enabled,
      defaultProfitMarginBp: 3000,
    },
  })

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: { legalTipEnabled: enabled },
  })

  revalidatePath("/settings")
  revalidatePath("/sales")
  revalidatePath("/sales/list")
}


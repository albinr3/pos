"use server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin, logSuperAdminAction } from "@/lib/super-admin-auth"
import { revalidatePath } from "next/cache"
import type { BillingStatus, BillingCurrency, BillingProvider } from "@prisma/client"

// ==========================================
// TYPES
// ==========================================

export type AccountListItem = {
  id: string
  name: string
  createdAt: Date
  clerkUserId: string
  
  // Billing info
  status: BillingStatus
  currency: BillingCurrency
  provider: BillingProvider
  trialEndsAt: Date | null
  currentPeriodEndsAt: Date | null
  graceEndsAt: Date | null
  priceDopCents: number
  priceUsdCents: number
  
  // Owner info
  ownerEmail: string | null
  ownerName: string | null
  
  // Stats
  usersCount: number
  productsCount: number
  salesCount: number
  lastPaymentAt: Date | null
}

export type AccountDetail = AccountListItem & {
  // Company Settings
  companyName: string | null
  companyPhone: string | null
  companyAddress: string | null
  logoUrl: string | null
  
  // Billing Profile
  billingLegalName: string | null
  billingTaxId: string | null
  billingAddress: string | null
  billingEmail: string | null
  billingPhone: string | null
  
  // Users
  users: {
    id: string
    name: string
    username: string
    role: string
    isOwner: boolean
    isActive: boolean
    createdAt: Date
  }[]
  
  // Payment History
  payments: {
    id: string
    amountCents: number
    currency: BillingCurrency
    status: string
    createdAt: Date
    paidAt: Date | null
    proofsCount: number
  }[]
  
  // Subscription details
  subscriptionId: string | null
  manualVerificationStatus: string | null
  lemonCustomerId: string | null
  lemonSubscriptionId: string | null
}

// ==========================================
// GET ACCOUNTS
// ==========================================

export async function getAccounts(): Promise<AccountListItem[]> {
  const accounts = await prisma.account.findMany({
    include: {
      billingSubscription: {
        include: {
          payments: {
            where: { status: "PAID" },
            orderBy: { paidAt: "desc" },
            take: 1,
          },
        },
      },
      billingProfile: true,
      users: {
        where: { isOwner: true },
        take: 1,
      },
      _count: {
        select: {
          users: true,
          products: true,
          sales: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return accounts.map((account) => {
    const sub = account.billingSubscription
    const owner = account.users[0]
    const lastPayment = sub?.payments[0]

    return {
      id: account.id,
      name: account.name,
      createdAt: account.createdAt,
      clerkUserId: account.clerkUserId,
      
      status: sub?.status || "BLOCKED",
      currency: sub?.currency || "DOP",
      provider: sub?.provider || "MANUAL",
      trialEndsAt: sub?.trialEndsAt || null,
      currentPeriodEndsAt: sub?.currentPeriodEndsAt || null,
      graceEndsAt: sub?.graceEndsAt || null,
      priceDopCents: sub?.priceDopCents || 130000,
      priceUsdCents: sub?.priceUsdCents || 2000,
      
      ownerEmail: account.billingProfile?.email || owner?.email || null,
      ownerName: owner?.name || null,
      
      usersCount: account._count.users,
      productsCount: account._count.products,
      salesCount: account._count.sales,
      lastPaymentAt: lastPayment?.paidAt || null,
    }
  })
}

// ==========================================
// GET ACCOUNT DETAIL
// ==========================================

export async function getAccountDetail(accountId: string): Promise<AccountDetail | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      billingSubscription: {
        include: {
          payments: {
            include: {
              proofs: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      billingProfile: true,
      companySettings: true,
      users: {
        orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
      },
      _count: {
        select: {
          users: true,
          products: true,
          sales: true,
          customers: true,
        },
      },
    },
  })

  if (!account) return null

  const sub = account.billingSubscription
  const owner = account.users.find((u) => u.isOwner)
  const lastPayment = sub?.payments.find((p) => p.status === "PAID")

  return {
    id: account.id,
    name: account.name,
    createdAt: account.createdAt,
    clerkUserId: account.clerkUserId,
    
    // Billing
    status: sub?.status || "BLOCKED",
    currency: sub?.currency || "DOP",
    provider: sub?.provider || "MANUAL",
    trialEndsAt: sub?.trialEndsAt || null,
    currentPeriodEndsAt: sub?.currentPeriodEndsAt || null,
    graceEndsAt: sub?.graceEndsAt || null,
    priceDopCents: sub?.priceDopCents || 130000,
    priceUsdCents: sub?.priceUsdCents || 2000,
    subscriptionId: sub?.id || null,
    manualVerificationStatus: sub?.manualVerificationStatus || null,
    lemonCustomerId: sub?.lemonCustomerId || null,
    lemonSubscriptionId: sub?.lemonSubscriptionId || null,
    
    // Owner
    ownerEmail: account.billingProfile?.email || owner?.email || null,
    ownerName: owner?.name || null,
    
    // Stats
    usersCount: account._count.users,
    productsCount: account._count.products,
    salesCount: account._count.sales,
    lastPaymentAt: lastPayment?.paidAt || null,
    
    // Company Settings
    companyName: account.companySettings?.name || null,
    companyPhone: account.companySettings?.phone || null,
    companyAddress: account.companySettings?.address || null,
    logoUrl: account.companySettings?.logoUrl || null,
    
    // Billing Profile
    billingLegalName: account.billingProfile?.legalName || null,
    billingTaxId: account.billingProfile?.taxId || null,
    billingAddress: account.billingProfile?.address || null,
    billingEmail: account.billingProfile?.email || null,
    billingPhone: account.billingProfile?.phone || null,
    
    // Users
    users: account.users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      isOwner: u.isOwner,
      isActive: u.isActive,
      createdAt: u.createdAt,
    })),
    
    // Payments
    payments: (sub?.payments || []).map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      proofsCount: p.proofs.length,
    })),
  }
}

// ==========================================
// ACCOUNT ACTIONS
// ==========================================

export async function deleteAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canDeleteAccounts) {
      return { success: false, error: "No tienes permisos para eliminar cuentas" }
    }

    // Verificar que existe
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    })

    if (!account) {
      return { success: false, error: "Cuenta no encontrada" }
    }

    // Eliminar (cascade eliminará los relacionados)
    await prisma.account.delete({
      where: { id: accountId },
    })

    await logSuperAdminAction(admin.id, "deleted_account", {
      targetAccountId: accountId,
      metadata: { accountName: account.name },
    })

    revalidatePath("/super-admin")
    revalidatePath("/super-admin/accounts")

    return { success: true }
  } catch (error) {
    console.error("Error deleting account:", error)
    return { success: false, error: "Error al eliminar la cuenta" }
  }
}

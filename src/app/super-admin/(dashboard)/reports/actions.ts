"use server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"
import { sanitizeEmail } from "@/lib/sanitize"

export type SuperAdminAccountsReportRow = {
  accountNumber: number
  accountId: string
  accountName: string
  ownerName: string | null
  ownerEmail: string | null
  billingEmail: string | null
  ownerWhatsapp: string | null
  createdAt: Date
}

function canViewReports(admin: Awaited<ReturnType<typeof getCurrentSuperAdmin>>) {
  if (!admin) return false
  if (admin.role === "OWNER" || admin.role === "ADMIN") return true
  return admin.canViewFinancials
}

export async function getSuperAdminAccountsReport(): Promise<SuperAdminAccountsReportRow[]> {
  const admin = await getCurrentSuperAdmin()
  if (!canViewReports(admin)) {
    throw new Error("No autorizado")
  }

  const accounts = await prisma.account.findMany({
    include: {
      companySettings: {
        select: {
          phone: true,
        },
      },
      billingProfile: {
        select: {
          email: true,
        },
      },
      users: {
        where: {
          isOwner: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
        select: {
          name: true,
          email: true,
          whatsappNumber: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return accounts.map((account, index) => {
    const owner = account.users[0]

    return {
      accountNumber: index + 1,
      accountId: account.id,
      accountName: account.name,
      ownerName: owner?.name || null,
      ownerEmail: sanitizeEmail(owner?.email || "") || null,
      billingEmail: sanitizeEmail(account.billingProfile?.email || "") || null,
      ownerWhatsapp: account.companySettings?.phone || owner?.whatsappNumber || null,
      createdAt: account.createdAt,
    }
  })
}

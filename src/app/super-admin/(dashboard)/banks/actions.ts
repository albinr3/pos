"use server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin, logSuperAdminAction } from "@/lib/super-admin-auth"
import { revalidatePath } from "next/cache"

// ==========================================
// TYPES
// ==========================================

export type BankAccountItem = {
  id: string
  bankName: string
  accountType: string
  accountNumber: string
  accountName: string
  currency: string
  bankLogo: string | null
  instructions: string | null
  isActive: boolean
  displayOrder: number
  createdAt: Date
  paymentsCount: number
  totalReceived: number
}

// ==========================================
// GET BANK ACCOUNTS
// ==========================================

export async function getBankAccounts(): Promise<BankAccountItem[]> {
  const banks = await prisma.bankAccount.findMany({
    include: {
      payments: {
        where: { status: "PAID" },
        select: { amountCents: true },
      },
      _count: {
        select: { payments: true },
      },
    },
    orderBy: { displayOrder: "asc" },
  })

  return banks.map((bank) => ({
    id: bank.id,
    bankName: bank.bankName,
    accountType: bank.accountType,
    accountNumber: bank.accountNumber,
    accountName: bank.accountName,
    currency: bank.currency,
    bankLogo: bank.bankLogo,
    instructions: bank.instructions,
    isActive: bank.isActive,
    displayOrder: bank.displayOrder,
    createdAt: bank.createdAt,
    paymentsCount: bank._count.payments,
    totalReceived: bank.payments.reduce((sum, p) => sum + p.amountCents, 0),
  }))
}

// ==========================================
// CREATE BANK ACCOUNT
// ==========================================

export async function createBankAccount(data: {
  bankName: string
  accountType: string
  accountNumber: string
  accountName: string
  currency?: string
  bankLogo?: string
  instructions?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canManageAccounts) {
      return { success: false, error: "No tienes permisos" }
    }

    // Obtener el mayor displayOrder
    const lastBank = await prisma.bankAccount.findFirst({
      orderBy: { displayOrder: "desc" },
    })
    const newOrder = (lastBank?.displayOrder || 0) + 1

    const bank = await prisma.bankAccount.create({
      data: {
        bankName: data.bankName,
        accountType: data.accountType,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        currency: data.currency || "DOP",
        bankLogo: data.bankLogo || null,
        instructions: data.instructions || null,
        displayOrder: newOrder,
      },
    })

    await logSuperAdminAction(admin.id, "created_bank_account", {
      metadata: { bankId: bank.id, bankName: data.bankName },
    })

    revalidatePath("/super-admin/banks")

    return { success: true, id: bank.id }
  } catch (error) {
    console.error("Error creating bank account:", error)
    return { success: false, error: "Error al crear la cuenta bancaria" }
  }
}

// ==========================================
// UPDATE BANK ACCOUNT
// ==========================================

export async function updateBankAccount(
  id: string,
  data: {
    bankName?: string
    accountType?: string
    accountNumber?: string
    accountName?: string
    currency?: string
    bankLogo?: string | null
    instructions?: string | null
    isActive?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canManageAccounts) {
      return { success: false, error: "No tienes permisos" }
    }

    await prisma.bankAccount.update({
      where: { id },
      data,
    })

    await logSuperAdminAction(admin.id, "updated_bank_account", {
      metadata: { bankId: id, changes: data },
    })

    revalidatePath("/super-admin/banks")

    return { success: true }
  } catch (error) {
    console.error("Error updating bank account:", error)
    return { success: false, error: "Error al actualizar la cuenta bancaria" }
  }
}

// ==========================================
// DELETE BANK ACCOUNT
// ==========================================

export async function deleteBankAccount(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canDeleteAccounts) {
      return { success: false, error: "No tienes permisos" }
    }

    // Verificar si tiene pagos asociados
    const paymentsCount = await prisma.billingPayment.count({
      where: { bankAccountId: id },
    })

    if (paymentsCount > 0) {
      return {
        success: false,
        error: `No se puede eliminar: tiene ${paymentsCount} pagos asociados. Desactívala en su lugar.`,
      }
    }

    const bank = await prisma.bankAccount.delete({
      where: { id },
    })

    await logSuperAdminAction(admin.id, "deleted_bank_account", {
      metadata: { bankId: id, bankName: bank.bankName },
    })

    revalidatePath("/super-admin/banks")

    return { success: true }
  } catch (error) {
    console.error("Error deleting bank account:", error)
    return { success: false, error: "Error al eliminar la cuenta bancaria" }
  }
}

// ==========================================
// TOGGLE BANK ACCOUNT STATUS
// ==========================================

export async function toggleBankAccountStatus(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin || !admin.canManageAccounts) {
      return { success: false, error: "No tienes permisos" }
    }

    const bank = await prisma.bankAccount.findUnique({
      where: { id },
    })

    if (!bank) {
      return { success: false, error: "Cuenta bancaria no encontrada" }
    }

    await prisma.bankAccount.update({
      where: { id },
      data: { isActive: !bank.isActive },
    })

    await logSuperAdminAction(admin.id, "toggled_bank_account_status", {
      metadata: { bankId: id, newStatus: !bank.isActive },
    })

    revalidatePath("/super-admin/banks")

    return { success: true }
  } catch (error) {
    console.error("Error toggling bank account status:", error)
    return { success: false, error: "Error al cambiar el estado" }
  }
}

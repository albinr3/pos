"use server"

import { prisma } from "@/lib/db"
import type { BillingCurrency, BillingPaymentStatus } from "@prisma/client"

// ==========================================
// TYPES
// ==========================================

export type PaymentListItem = {
  id: string
  accountId: string
  accountName: string
  amountCents: number
  currency: BillingCurrency
  status: BillingPaymentStatus
  createdAt: Date
  paidAt: Date | null
  bankAccountId: string | null
  bankName: string | null
  reference: string | null
  proofs: {
    id: string
    url: string
    uploadedAt: Date
    amountCents: number | null
    note: string | null
  }[]
}

// ==========================================
// GET PAYMENTS
// ==========================================

export async function getPayments(): Promise<PaymentListItem[]> {
  const payments = await prisma.billingPayment.findMany({
    where: {
      OR: [
        { status: { not: "PENDING" } },
        { proofs: { some: {} } },
      ],
    },
    include: {
      subscription: {
        include: {
          account: true,
        },
      },
      bankAccount: true,
      proofs: {
        orderBy: { uploadedAt: "desc" },
      },
    },
    orderBy: [
      { status: "asc" }, // PENDING first
      { createdAt: "desc" },
    ],
  })

  return payments.map((p) => ({
    id: p.id,
    accountId: p.subscription.accountId,
    accountName: p.subscription.account.name,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    bankAccountId: p.bankAccountId,
    bankName: p.bankAccount?.bankName || null,
    reference: p.reference,
    proofs: p.proofs.map((proof) => ({
      id: proof.id,
      url: proof.url,
      uploadedAt: proof.uploadedAt,
      amountCents: proof.amountCents,
      note: proof.note,
    })),
  }))
}

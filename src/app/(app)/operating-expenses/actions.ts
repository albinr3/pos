"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { startOfDay, endOfDay, parseDateParam } from "@/lib/dates"
import { getCurrentUser } from "@/lib/auth"

export async function listOperatingExpenses(input?: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  return prisma.operatingExpense.findMany({
    where: {
      accountId: user.accountId,
      expenseDate: { gte: from, lte: to },
    },
    orderBy: { expenseDate: "desc" },
    include: {
      user: {
        select: { name: true, username: true },
      },
    },
    take: 500,
  })
}

export async function createOperatingExpense(input: {
  description: string
  amountCents: number
  expenseDate?: Date
  category?: string | null
  notes?: string | null
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  const description = input.description.trim()
  if (!description) throw new Error("La descripcion es requerida")
  if (input.amountCents <= 0) throw new Error("El monto debe ser mayor a 0")

  await prisma.operatingExpense.create({
    data: {
      accountId: currentUser.accountId,
      description,
      amountCents: input.amountCents,
      expenseDate: input.expenseDate ?? new Date(),
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      userId: currentUser.id,
    },
  })

  revalidatePath("/operating-expenses")
  revalidatePath("/reports/profit")
}

export async function updateOperatingExpense(input: {
  id: string
  description: string
  amountCents: number
  expenseDate: Date
  category?: string | null
  notes?: string | null
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const description = input.description.trim()
  if (!description) throw new Error("La descripción es requerida")
  if (input.amountCents <= 0) throw new Error("El monto debe ser mayor a 0")

  const existing = await prisma.operatingExpense.findFirst({ 
    where: { accountId: user.accountId, id: input.id } 
  })
  if (!existing) throw new Error("Gasto operativo no encontrado")

  await prisma.operatingExpense.update({
    where: { id: input.id },
    data: {
      description,
      amountCents: input.amountCents,
      expenseDate: input.expenseDate,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  })

  revalidatePath("/operating-expenses")
  revalidatePath("/reports/profit")
}

export async function deleteOperatingExpense(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const existing = await prisma.operatingExpense.findFirst({ 
    where: { accountId: user.accountId, id } 
  })
  if (!existing) throw new Error("Gasto operativo no encontrado")

  await prisma.operatingExpense.delete({ where: { id } })

  revalidatePath("/operating-expenses")
  revalidatePath("/reports/profit")
}

export async function getOperatingExpensesTotal(input?: { from?: string; to?: string }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const result = await prisma.operatingExpense.aggregate({
    where: {
      accountId: user.accountId,
      expenseDate: { gte: from, lte: to },
    },
    _sum: { amountCents: true },
    _count: true,
  })

  return {
    totalCents: result._sum.amountCents ?? 0,
    count: result._count ?? 0,
  }
}
















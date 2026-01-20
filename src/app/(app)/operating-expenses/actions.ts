"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { startOfDay, endOfDay, parseDateParam } from "@/lib/dates"

export async function listOperatingExpenses(input?: { from?: string; to?: string }) {
  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  return prisma.operatingExpense.findMany({
    where: {
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
  username: string
}) {
  const description = input.description.trim()
  if (!description) throw new Error("La descripción es requerida")
  if (input.amountCents <= 0) throw new Error("El monto debe ser mayor a 0")

  const user = await prisma.user.findUnique({ where: { username: input.username } })
  if (!user) throw new Error("Usuario inválido")

  await prisma.operatingExpense.create({
    data: {
      description,
      amountCents: input.amountCents,
      expenseDate: input.expenseDate ?? new Date(),
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      userId: user.id,
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
  const description = input.description.trim()
  if (!description) throw new Error("La descripción es requerida")
  if (input.amountCents <= 0) throw new Error("El monto debe ser mayor a 0")

  const existing = await prisma.operatingExpense.findUnique({ where: { id: input.id } })
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
  const existing = await prisma.operatingExpense.findUnique({ where: { id } })
  if (!existing) throw new Error("Gasto operativo no encontrado")

  await prisma.operatingExpense.delete({ where: { id } })

  revalidatePath("/operating-expenses")
  revalidatePath("/reports/profit")
}

export async function getOperatingExpensesTotal(input?: { from?: string; to?: string }) {
  const fromDate = parseDateParam(input?.from) ?? new Date()
  const toDate = parseDateParam(input?.to) ?? fromDate

  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)

  const result = await prisma.operatingExpense.aggregate({
    where: {
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
















"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import type { AuditAction } from "@prisma/client"

export type AuditLogFilters = {
  action?: AuditAction | "ALL"
  userId?: string | "ALL"
  from?: string
  to?: string
  take?: number
}

export type AuditLogItem = {
  id: string
  createdAt: Date
  action: AuditAction
  userId: string | null
  userEmail: string | null
  userUsername: string | null
  resourceType: string | null
  resourceId: string | null
  details: Record<string, any> | null
}

export async function listAuditLogs(filters?: AuditLogFilters): Promise<AuditLogItem[]> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("No autenticado")
  }

  if (!user.isOwner) {
    throw new Error("No tienes permisos para ver el audit log")
  }

  const where: Record<string, any> = {
    accountId: user.accountId,
  }

  const action = filters?.action
  if (action && action !== "ALL") {
    where.action = action
  }

  const userId = filters?.userId
  if (userId && userId !== "ALL") {
    where.userId = userId
  }

  if (filters?.from || filters?.to) {
    const createdAt: Record<string, Date> = {}
    if (filters.from) createdAt.gte = new Date(filters.from)
    if (filters.to) {
      const end = new Date(filters.to)
      end.setHours(23, 59, 59, 999)
      createdAt.lte = end
    }
    where.createdAt = createdAt
  }

  const take = Math.min(filters?.take ?? 100, 500)

  try {
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        createdAt: true,
        action: true,
        userId: true,
        userEmail: true,
        userUsername: true,
        resourceType: true,
        resourceId: true,
        details: true,
      },
    })

    return logs.map((log) => ({
      ...log,
      details: log.details as Record<string, any> | null,
    }))
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2021") {
      return []
    }
    throw error
  }
}

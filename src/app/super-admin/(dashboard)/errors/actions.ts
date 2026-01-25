"use server"

import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"
import { revalidatePath } from "next/cache"
import type { ErrorSeverity, Prisma } from "@prisma/client"

export type ErrorLogItem = {
  id: string
  createdAt: Date
  message: string
  stack: string | null
  code: string | null
  severity: ErrorSeverity
  accountId: string | null
  accountName: string | null
  userId: string | null
  endpoint: string | null
  method: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: unknown
  resolved: boolean
  resolvedAt: Date | null
  resolvedBy: string | null
  resolution: string | null
}

export type ErrorStats = {
  total: number
  unresolved: number
  critical: number
  high: number
  medium: number
  low: number
  last24h: number
  last7d: number
}

export type GetErrorsParams = {
  page?: number
  pageSize?: number
  severity?: ErrorSeverity | "ALL"
  resolved?: "ALL" | "RESOLVED" | "UNRESOLVED"
  search?: string
  startDate?: string
  endDate?: string
}

export async function getErrorLogs(params: GetErrorsParams = {}): Promise<{
  errors: ErrorLogItem[]
  total: number
  stats: ErrorStats
}> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    throw new Error("No autorizado")
  }

  const {
    page = 1,
    pageSize = 20,
    severity = "ALL",
    resolved = "ALL",
    search = "",
    startDate,
    endDate,
  } = params

  const skip = (page - 1) * pageSize

  // Construir filtros
  const where: Prisma.ErrorLogWhereInput = {}

  if (severity !== "ALL") {
    where.severity = severity
  }

  if (resolved === "RESOLVED") {
    where.resolved = true
  } else if (resolved === "UNRESOLVED") {
    where.resolved = false
  }

  if (search) {
    where.OR = [
      { message: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { endpoint: { contains: search, mode: "insensitive" } },
    ]
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate)
    }
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }

  // Obtener errores con cuenta relacionada
  const [errors, total] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.errorLog.count({ where }),
  ])

  // Obtener nombres de cuentas
  const accountIds = errors
    .map((e) => e.accountId)
    .filter((id): id is string => id !== null)
  
  const accounts = accountIds.length > 0
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true },
      })
    : []

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))

  // Calcular estadísticas
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalCount,
    unresolvedCount,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    last24hCount,
    last7dCount,
  ] = await Promise.all([
    prisma.errorLog.count(),
    prisma.errorLog.count({ where: { resolved: false } }),
    prisma.errorLog.count({ where: { severity: "CRITICAL", resolved: false } }),
    prisma.errorLog.count({ where: { severity: "HIGH", resolved: false } }),
    prisma.errorLog.count({ where: { severity: "MEDIUM", resolved: false } }),
    prisma.errorLog.count({ where: { severity: "LOW", resolved: false } }),
    prisma.errorLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: last7d } } }),
  ])

  const stats: ErrorStats = {
    total: totalCount,
    unresolved: unresolvedCount,
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
    last24h: last24hCount,
    last7d: last7dCount,
  }

  const errorsWithAccounts: ErrorLogItem[] = errors.map((e) => ({
    ...e,
    accountName: e.accountId ? accountMap.get(e.accountId) ?? null : null,
  }))

  return { errors: errorsWithAccounts, total, stats }
}

export async function resolveError(
  errorId: string,
  resolution: string
): Promise<{ success: boolean; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, error: "No autorizado" }
  }

  try {
    await prisma.errorLog.update({
      where: { id: errorId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: admin.id,
        resolution,
      },
    })

    revalidatePath("/super-admin/errors")
    return { success: true }
  } catch {
    return { success: false, error: "Error al resolver el error" }
  }
}

export async function resolveMultipleErrors(
  errorIds: string[],
  resolution: string
): Promise<{ success: boolean; count: number; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, count: 0, error: "No autorizado" }
  }

  try {
    const result = await prisma.errorLog.updateMany({
      where: { id: { in: errorIds } },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: admin.id,
        resolution,
      },
    })

    revalidatePath("/super-admin/errors")
    return { success: true, count: result.count }
  } catch {
    return { success: false, count: 0, error: "Error al resolver los errores" }
  }
}

export async function deleteOldErrors(
  daysOld: number = 30
): Promise<{ success: boolean; count: number; error?: string }> {
  const admin = await getCurrentSuperAdmin()
  if (!admin || admin.role !== "OWNER") {
    return { success: false, count: 0, error: "Solo el Owner puede eliminar errores" }
  }

  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const result = await prisma.errorLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        resolved: true, // Solo eliminar errores resueltos
      },
    })

    revalidatePath("/super-admin/errors")
    return { success: true, count: result.count }
  } catch {
    return { success: false, count: 0, error: "Error al eliminar errores antiguos" }
  }
}

export async function getErrorDetails(errorId: string): Promise<ErrorLogItem | null> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return null
  }

  const error = await prisma.errorLog.findUnique({
    where: { id: errorId },
  })

  if (!error) return null

  let accountName: string | null = null
  if (error.accountId) {
    const account = await prisma.account.findUnique({
      where: { id: error.accountId },
      select: { name: true },
    })
    accountName = account?.name ?? null
  }

  return {
    ...error,
    accountName,
  }
}

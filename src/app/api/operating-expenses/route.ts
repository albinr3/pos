import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { logAuditEvent } from "@/lib/audit-log"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { endOfDay, parseDateParam, startOfDay } from "@/lib/dates"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

function normalizeDateInput(value: unknown): Date | null {
  if (!value) return null
  return parseDateParam(String(value))
}

// GET /api/operating-expenses - Listar gastos operativos
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("query") || "").trim()
    const fromDate = normalizeDateInput(searchParams.get("from"))
    const toDate = normalizeDateInput(searchParams.get("to"))
    const hasDateFilter = Boolean(fromDate || toDate)
    const from = hasDateFilter ? startOfDay(fromDate ?? toDate ?? new Date()) : null
    const to = hasDateFilter ? endOfDay(toDate ?? fromDate ?? new Date()) : null

    const items = await prisma.operatingExpense.findMany({
      where: {
        accountId: user.accountId,
        ...(hasDateFilter && from && to ? { expenseDate: { gte: from, lte: to } } : {}),
        ...(query
          ? {
              OR: [
                { description: { contains: query, mode: "insensitive" } },
                { category: { contains: query, mode: "insensitive" } },
                { notes: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { expenseDate: "desc" },
      include: {
        user: {
          select: { id: true, name: true, username: true },
        },
      },
      take: 500,
    })

    return NextResponse.json({
      data: items.map((item) => ({
        id: item.id,
        description: item.description,
        amountCents: item.amountCents,
        expenseDate: item.expenseDate.toISOString(),
        category: item.category,
        notes: item.notes,
        user: item.user,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/operating-expenses:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al obtener gastos operativos" },
      { status: 500 }
    )
  }
}

// POST /api/operating-expenses - Crear gasto operativo
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    const canManageExpenses = await hasPermissionOrLog(user, "canManageExpenses", {
      resourceType: "OperatingExpense",
      details: { endpoint: "/api/operating-expenses", method: "POST" },
    })
    if (!canManageExpenses) {
      return NextResponse.json({ error: "No tienes permiso para registrar gastos" }, { status: 403 })
    }

    const body = await request.json()
    const description = String(body?.description || "").trim()
    const amountCents = Number(body?.amountCents || 0)
    const expenseDate = normalizeDateInput(body?.expenseDate) ?? new Date()
    const category =
      typeof body?.category === "string" && body.category.trim()
        ? String(body.category).trim()
        : null
    const notes =
      typeof body?.notes === "string" && body.notes.trim()
        ? String(body.notes).trim()
        : null

    if (!description) {
      return NextResponse.json({ error: "La descripción es requerida" }, { status: 400 })
    }
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    const created = await prisma.operatingExpense.create({
      data: {
        accountId: user.accountId,
        userId: user.id,
        description,
        amountCents: Math.round(amountCents),
        expenseDate,
        category,
        notes,
      },
    })

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "OPERATING_EXPENSE_CREATED",
      resourceType: "OperatingExpense",
      resourceId: created.id,
      details: {
        description,
        amountCents: created.amountCents,
        expenseDate: created.expenseDate.toISOString(),
        category,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        description: created.description,
        amountCents: created.amountCents,
        expenseDate: created.expenseDate.toISOString(),
        category: created.category,
        notes: created.notes,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/operating-expenses:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al crear gasto operativo" },
      { status: 500 }
    )
  }
}

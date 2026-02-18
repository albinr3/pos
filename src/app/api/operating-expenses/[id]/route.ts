import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { logAuditEvent } from "@/lib/audit-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado"
}

function normalizeDateInput(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date
}

// GET /api/operating-expenses/:id - Obtener gasto operativo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const item = await prisma.operatingExpense.findFirst({
      where: {
        id,
        accountId: user.accountId,
      },
      include: {
        user: {
          select: { id: true, name: true, username: true },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: "Gasto operativo no encontrado" }, { status: 404 })
    }

    return NextResponse.json({
      id: item.id,
      description: item.description,
      amountCents: item.amountCents,
      expenseDate: item.expenseDate.toISOString(),
      category: item.category,
      notes: item.notes,
      user: item.user,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/operating-expenses/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al obtener gasto operativo" },
      { status: 500 }
    )
  }
}

// PUT /api/operating-expenses/:id - Editar gasto operativo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const description = String(body?.description || "").trim()
    const amountCents = Number(body?.amountCents || 0)
    const expenseDate = normalizeDateInput(body?.expenseDate)
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
    if (!expenseDate) {
      return NextResponse.json({ error: "La fecha es inválida" }, { status: 400 })
    }

    const existing = await prisma.operatingExpense.findFirst({
      where: {
        id,
        accountId: user.accountId,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Gasto operativo no encontrado" }, { status: 404 })
    }

    const updated = await prisma.operatingExpense.update({
      where: { id },
      data: {
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
      action: "OPERATING_EXPENSE_EDITED",
      resourceType: "OperatingExpense",
      resourceId: updated.id,
      details: {
        description,
        amountCents: updated.amountCents,
        expenseDate: updated.expenseDate.toISOString(),
        category,
      },
    })

    return NextResponse.json({
      id: updated.id,
      description: updated.description,
      amountCents: updated.amountCents,
      expenseDate: updated.expenseDate.toISOString(),
      category: updated.category,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    console.error("Error en PUT /api/operating-expenses/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al editar gasto operativo" },
      { status: 500 }
    )
  }
}

// DELETE /api/operating-expenses/:id - Eliminar gasto operativo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.operatingExpense.findFirst({
      where: {
        id,
        accountId: user.accountId,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Gasto operativo no encontrado" }, { status: 404 })
    }

    await prisma.operatingExpense.delete({
      where: { id },
    })

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "OPERATING_EXPENSE_DELETED",
      resourceType: "OperatingExpense",
      resourceId: existing.id,
      details: {
        description: existing.description,
        amountCents: existing.amountCents,
        expenseDate: existing.expenseDate.toISOString(),
        category: existing.category,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error en DELETE /api/operating-expenses/[id]:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Error al eliminar gasto operativo" },
      { status: 500 }
    )
  }
}


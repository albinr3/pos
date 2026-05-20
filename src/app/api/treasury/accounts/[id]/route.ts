import { NextRequest, NextResponse } from "next/server"
import { TreasuryAccountType } from "@prisma/client"

import { prisma } from "@/lib/db"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getSafeErrorMessage(error: unknown, fallback: string): string {
  // En TypeScript, `catch` debe tratarse como `unknown`; así evitamos asumir `.message` sin validar el tipo.
  return error instanceof Error ? error.message : fallback
}

function parseAccountType(value: unknown): TreasuryAccountType | null {
  const raw = String(value || "").trim().toUpperCase()
  if (raw === "CAJA") return TreasuryAccountType.CAJA
  if (raw === "BANCO") return TreasuryAccountType.BANCO
  return null
}

// PUT /api/treasury/accounts/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { id } = await params
    const canManageAccounts = await hasPermissionOrLog(user, "canManageTreasuryAccounts", {
      allowAdminBypass: false,
      resourceType: "TreasuryAccount",
      resourceId: id,
      details: { endpoint: "/api/treasury/accounts/[id]", method: "PUT" },
    })
    if (!canManageAccounts) {
      return NextResponse.json({ error: "No tienes permiso para gestionar cuentas de tesorería" }, { status: 403 })
    }

    const existing = await prisma.treasuryAccount.findFirst({
      where: {
        id,
        accountId: user.accountId,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Cuenta de tesorería no encontrada" }, { status: 404 })
    }

    const body = await request.json()
    const name = String(body?.name || existing.name).trim()
    const parsedType = body?.type !== undefined ? parseAccountType(body.type) : existing.type
    const type = parsedType || existing.type

    if (!name) return NextResponse.json({ error: "El nombre de la cuenta es requerido" }, { status: 400 })

    const duplicate = await prisma.treasuryAccount.findFirst({
      where: {
        accountId: user.accountId,
        id: { not: existing.id },
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({ error: "Ya existe otra cuenta con ese nombre" }, { status: 409 })
    }

    const updated = await prisma.treasuryAccount.update({
      where: { id: existing.id },
      data: {
        name,
        type,
        currency:
          typeof body?.currency === "string" && body.currency.trim()
            ? body.currency.trim()
            : existing.currency,
        bankName:
          body?.bankName === undefined
            ? existing.bankName
            : typeof body?.bankName === "string"
              ? body.bankName.trim() || null
              : null,
        accountNumber:
          body?.accountNumber === undefined
            ? existing.accountNumber
            : typeof body?.accountNumber === "string"
              ? body.accountNumber.trim() || null
              : null,
        isActive: typeof body?.isActive === "boolean" ? body.isActive : existing.isActive,
      },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      type: updated.type,
      currency: updated.currency,
      bankName: updated.bankName,
      accountNumber: updated.accountNumber,
      isActive: updated.isActive,
      createdByUserId: updated.createdByUserId,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    console.error("Error en PUT /api/treasury/accounts/[id]:", error)
    return NextResponse.json(
      { error: getSafeErrorMessage(error, "Error al actualizar cuenta de tesorería") },
      { status: 500 }
    )
  }
}


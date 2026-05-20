import { NextRequest, NextResponse } from "next/server"
import { TreasuryAccountType } from "@prisma/client"

import { prisma } from "@/lib/db"
import { ensureDefaultTreasuryAccount } from "@/lib/treasury"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { getCurrentUserFromRequest } from "../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function parseSkip(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function parseTake(value: string | null, defaultValue: number, max: number): number {
  if (value === null) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.min(max, Math.max(1, parsed))
}

type TreasuryApiUser = NonNullable<Awaited<ReturnType<typeof getCurrentUserFromRequest>>>

function canAccessTreasury(user: TreasuryApiUser): boolean {
  return Boolean(
    user?.isOwner ||
      user?.canViewTreasury ||
      user?.canManageTreasuryAccounts ||
      user?.canCreateTreasuryTransfers ||
      user?.canReverseTreasuryTransfers
  )
}

function parseAccountType(value: unknown): TreasuryAccountType | null {
  const raw = String(value || "").trim().toUpperCase()
  if (raw === "CAJA") return TreasuryAccountType.CAJA
  if (raw === "BANCO") return TreasuryAccountType.BANCO
  return null
}

// GET /api/treasury/accounts
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    if (!canAccessTreasury(user)) {
      return NextResponse.json({ error: "No tienes permiso para ver tesorería" }, { status: 403 })
    }

    await ensureDefaultTreasuryAccount(prisma, user.accountId, user.id)

    const searchParams = request.nextUrl.searchParams
    const requestedSkip = parseSkip(searchParams.get("skip"))
    const take = parseTake(searchParams.get("take"), 200, 500)
    const effectiveSkip = requestedSkip ?? 0

    const accounts = await prisma.treasuryAccount.findMany({
      where: { accountId: user.accountId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: effectiveSkip,
      take: take + 1,
    })

    const hasMore = accounts.length > take
    const pageItems = hasMore ? accounts.slice(0, take) : accounts
    const nextSkip = hasMore ? effectiveSkip + take : null

    return NextResponse.json({
      data: pageItems.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        isActive: account.isActive,
        createdByUserId: account.createdByUserId,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
      nextSkip,
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/treasury/accounts:", error)
    return NextResponse.json({ error: error?.message || "Error al listar cuentas de tesorería" }, { status: 500 })
  }
}

// POST /api/treasury/accounts
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const canManageAccounts = await hasPermissionOrLog(user, "canManageTreasuryAccounts", {
      allowAdminBypass: false,
      resourceType: "TreasuryAccount",
      details: { endpoint: "/api/treasury/accounts", method: "POST" },
    })
    if (!canManageAccounts) {
      return NextResponse.json({ error: "No tienes permiso para gestionar cuentas de tesorería" }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body?.name || "").trim()
    const type = parseAccountType(body?.type)

    if (!name) return NextResponse.json({ error: "El nombre de la cuenta es requerido" }, { status: 400 })
    if (!type) return NextResponse.json({ error: "Tipo de cuenta inválido" }, { status: 400 })

    const duplicate = await prisma.treasuryAccount.findFirst({
      where: {
        accountId: user.accountId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese nombre" }, { status: 409 })
    }

    const created = await prisma.treasuryAccount.create({
      data: {
        accountId: user.accountId,
        name,
        type,
        currency: String(body?.currency || "DOP").trim() || "DOP",
        bankName: typeof body?.bankName === "string" ? body.bankName.trim() || null : null,
        accountNumber: typeof body?.accountNumber === "string" ? body.accountNumber.trim() || null : null,
        isActive: typeof body?.isActive === "boolean" ? body.isActive : true,
        createdByUserId: user.id,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        type: created.type,
        currency: created.currency,
        bankName: created.bankName,
        accountNumber: created.accountNumber,
        isActive: created.isActive,
        createdByUserId: created.createdByUserId,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/treasury/accounts:", error)
    return NextResponse.json({ error: error?.message || "Error al crear cuenta de tesorería" }, { status: 500 })
  }
}



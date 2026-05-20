import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { getCurrentUserFromRequest } from "../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getSafeErrorMessage(error: unknown, fallback: string): string {
  // Evita usar `.message` sobre `unknown` en bloques `catch` y mantiene el tipado estricto.
  return error instanceof Error ? error.message : fallback
}

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

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// GET /api/treasury/opening-balances
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    if (!canAccessTreasury(user)) {
      return NextResponse.json({ error: "No tienes permiso para ver tesorería" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const requestedSkip = parseSkip(searchParams.get("skip"))
    const take = parseTake(searchParams.get("take"), 200, 500)
    const effectiveSkip = requestedSkip ?? 0

    const rows = await prisma.treasuryOpeningBalance.findMany({
      where: { accountId: user.accountId },
      orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
      skip: effectiveSkip,
      take: take + 1,
    })

    const hasMore = rows.length > take
    const pageItems = hasMore ? rows.slice(0, take) : rows
    const nextSkip = hasMore ? effectiveSkip + take : null

    return NextResponse.json({
      data: pageItems.map((row) => ({
        id: row.id,
        treasuryAccountId: row.treasuryAccountId,
        amountCents: row.amountCents,
        effectiveAt: row.effectiveAt.toISOString(),
        note: row.note,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextSkip,
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/treasury/opening-balances:", error)
    return NextResponse.json(
      { error: getSafeErrorMessage(error, "Error al listar saldos iniciales") },
      { status: 500 }
    )
  }
}

// POST /api/treasury/opening-balances
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const canManageAccounts = await hasPermissionOrLog(user, "canManageTreasuryAccounts", {
      allowAdminBypass: false,
      resourceType: "TreasuryOpeningBalance",
      details: { endpoint: "/api/treasury/opening-balances", method: "POST" },
    })
    if (!canManageAccounts) {
      return NextResponse.json({ error: "No tienes permiso para establecer saldos iniciales" }, { status: 403 })
    }

    const body = await request.json()
    const treasuryAccountId = String(body?.treasuryAccountId || "").trim()
    const amountCents = Number(body?.amountCents)
    const effectiveAt = parseDate(body?.effectiveAt) || new Date()
    const note = typeof body?.note === "string" ? body.note.trim() || null : null

    if (!treasuryAccountId) {
      return NextResponse.json({ error: "treasuryAccountId es requerido" }, { status: 400 })
    }
    if (!Number.isInteger(amountCents)) {
      return NextResponse.json({ error: "El saldo inicial debe estar en centavos" }, { status: 400 })
    }

    const account = await prisma.treasuryAccount.findFirst({
      where: {
        id: treasuryAccountId,
        accountId: user.accountId,
      },
    })
    if (!account) {
      return NextResponse.json({ error: "Cuenta de tesorería no encontrada" }, { status: 404 })
    }

    const isCajaEfectivo =
      account.type === "CAJA" && account.name.trim().toLocaleLowerCase("es") === "caja efectivo"
    if (!isCajaEfectivo) {
      return NextResponse.json(
        { error: "El saldo inicial manual solo está permitido para la cuenta Caja Efectivo" },
        { status: 400 }
      )
    }

    const created = await prisma.treasuryOpeningBalance.create({
      data: {
        accountId: user.accountId,
        treasuryAccountId: account.id,
        amountCents,
        effectiveAt,
        note,
        createdByUserId: user.id,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        treasuryAccountId: created.treasuryAccountId,
        amountCents: created.amountCents,
        effectiveAt: created.effectiveAt.toISOString(),
        note: created.note,
        createdByUserId: created.createdByUserId,
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/treasury/opening-balances:", error)
    return NextResponse.json(
      { error: getSafeErrorMessage(error, "Error al crear saldo inicial") },
      { status: 500 }
    )
  }
}



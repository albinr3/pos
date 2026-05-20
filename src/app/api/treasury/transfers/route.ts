import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"
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

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
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

function formatTransferReference(transferId: string) {
  return `TR-${transferId.slice(-8).toUpperCase()}`
}

// GET /api/treasury/transfers
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

    const rows = await prisma.treasuryTransfer.findMany({
      where: { accountId: user.accountId },
      orderBy: [{ transferredAt: "asc" }, { createdAt: "asc" }],
      skip: effectiveSkip,
      take: take + 1,
      include: {
        reversedByTransfer: { select: { id: true } },
      },
    })

    const hasMore = rows.length > take
    const pageItems = hasMore ? rows.slice(0, take) : rows
    const nextSkip = hasMore ? effectiveSkip + take : null

    return NextResponse.json({
      data: pageItems.map((row) => ({
        id: row.id,
        fromTreasuryAccountId: row.fromTreasuryAccountId,
        toTreasuryAccountId: row.toTreasuryAccountId,
        amountCents: row.amountCents,
        transferredAt: row.transferredAt.toISOString(),
        note: row.note,
        createdByUserId: row.createdByUserId,
        status: row.status,
        reversesTransferId: row.reversesTransferId,
        reversedByTransferId: row.reversedByTransfer?.id || null,
        createdAt: row.createdAt.toISOString(),
        reference: formatTransferReference(row.id),
      })),
      nextSkip,
    })
  } catch (error: unknown) {
    console.error("Error en GET /api/treasury/transfers:", error)
    return NextResponse.json({ error: error?.message || "Error al listar transferencias" }, { status: 500 })
  }
}

// POST /api/treasury/transfers
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const canCreateTransfers = await hasPermissionOrLog(user, "canCreateTreasuryTransfers", {
      allowAdminBypass: false,
      resourceType: "TreasuryTransfer",
      details: { endpoint: "/api/treasury/transfers", method: "POST" },
    })
    if (!canCreateTransfers) {
      return NextResponse.json({ error: "No tienes permiso para crear transferencias de tesorería" }, { status: 403 })
    }

    const body = await request.json()
    const fromTreasuryAccountId = String(body?.fromTreasuryAccountId || "").trim()
    const toTreasuryAccountId = String(body?.toTreasuryAccountId || "").trim()
    const amountCents = Number(body?.amountCents)
    const transferredAt = parseDate(body?.transferredAt) || new Date()
    const note = typeof body?.note === "string" ? body.note.trim() || null : null

    if (!fromTreasuryAccountId || !toTreasuryAccountId) {
      return NextResponse.json({ error: "Debes indicar cuenta de origen y destino" }, { status: 400 })
    }
    if (fromTreasuryAccountId === toTreasuryAccountId) {
      return NextResponse.json({ error: "La cuenta de origen y destino deben ser diferentes" }, { status: 400 })
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor que cero (en centavos)" }, { status: 400 })
    }

    const [fromAccount, toAccount] = await Promise.all([
      prisma.treasuryAccount.findFirst({
        where: {
          id: fromTreasuryAccountId,
          accountId: user.accountId,
          isActive: true,
        },
      }),
      prisma.treasuryAccount.findFirst({
        where: {
          id: toTreasuryAccountId,
          accountId: user.accountId,
          isActive: true,
        },
      }),
    ])

    if (!fromAccount) {
      return NextResponse.json({ error: "Cuenta de origen no encontrada o inactiva" }, { status: 404 })
    }
    if (!toAccount) {
      return NextResponse.json({ error: "Cuenta de destino no encontrada o inactiva" }, { status: 404 })
    }

    const created = await prisma.treasuryTransfer.create({
      data: {
        accountId: user.accountId,
        fromTreasuryAccountId: fromAccount.id,
        toTreasuryAccountId: toAccount.id,
        amountCents,
        transferredAt,
        note,
        createdByUserId: user.id,
        status: "ACTIVE",
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        fromTreasuryAccountId: created.fromTreasuryAccountId,
        toTreasuryAccountId: created.toTreasuryAccountId,
        amountCents: created.amountCents,
        transferredAt: created.transferredAt.toISOString(),
        note: created.note,
        createdByUserId: created.createdByUserId,
        status: created.status,
        reversesTransferId: created.reversesTransferId,
        createdAt: created.createdAt.toISOString(),
        reference: formatTransferReference(created.id),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Error en POST /api/treasury/transfers:", error)
    return NextResponse.json({ error: error?.message || "Error al crear transferencia" }, { status: 500 })
  }
}



import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { hasPermissionOrLog } from "@/lib/permission-guard"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function getSafeErrorMessage(error: unknown, fallback: string): string {
  // Evita usar `.message` sobre `unknown` en bloques `catch` y mantiene el tipado estricto.
  return error instanceof Error ? error.message : fallback
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatTransferReference(transferId: string) {
  return `TR-${transferId.slice(-8).toUpperCase()}`
}

// POST /api/treasury/transfers/reverse
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const canReverseTransfers = await hasPermissionOrLog(user, "canReverseTreasuryTransfers", {
      allowAdminBypass: false,
      resourceType: "TreasuryTransfer",
      details: { endpoint: "/api/treasury/transfers/reverse", method: "POST" },
    })
    if (!canReverseTransfers) {
      return NextResponse.json({ error: "No tienes permiso para anular transferencias de tesorería" }, { status: 403 })
    }

    const body = await request.json()
    const transferId = String(body?.transferId || "").trim()
    const reason = String(body?.reason || "").trim()
    const reversedAt = parseDate(body?.reversedAt) || new Date()

    if (!transferId) {
      return NextResponse.json({ error: "transferId es requerido" }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: "Debes indicar el motivo de la anulación" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.treasuryTransfer.findFirst({
        where: {
          id: transferId,
          accountId: user.accountId,
        },
        include: {
          reversedByTransfer: { select: { id: true } },
          fromTreasuryAccount: { select: { id: true, name: true } },
          toTreasuryAccount: { select: { id: true, name: true } },
        },
      })

      if (!original) {
        throw new Error("Transferencia no encontrada")
      }

      if (original.reversesTransferId) {
        throw new Error("No se puede anular una transferencia que ya es reverso")
      }

      if (original.status !== "ACTIVE" || original.reversedByTransfer) {
        throw new Error("La transferencia ya fue reversada")
      }

      const reverseTransfer = await tx.treasuryTransfer.create({
        data: {
          accountId: user.accountId,
          fromTreasuryAccountId: original.toTreasuryAccountId,
          toTreasuryAccountId: original.fromTreasuryAccountId,
          amountCents: original.amountCents,
          transferredAt: reversedAt,
          note: `Reverso de ${formatTransferReference(original.id)}. Motivo: ${reason}`,
          createdByUserId: user.id,
          status: "ACTIVE",
          reversesTransferId: original.id,
        },
      })

      await tx.treasuryTransfer.update({
        where: { id: original.id },
        data: { status: "REVERSED" },
      })

      return {
        originalId: original.id,
        reverseId: reverseTransfer.id,
      }
    })

    return NextResponse.json({
      originalId: result.originalId,
      reverseId: result.reverseId,
      originalReference: formatTransferReference(result.originalId),
      reverseReference: formatTransferReference(result.reverseId),
    })
  } catch (error: unknown) {
    const errorMessage = getSafeErrorMessage(error, "")
    const message = errorMessage.toLowerCase()
    if (message.includes("no encontrada") || message.includes("ya fue reversada") || message.includes("ya es reverso")) {
      return NextResponse.json({ error: errorMessage || "No se pudo anular transferencia" }, { status: 400 })
    }
    console.error("Error en POST /api/treasury/transfers/reverse:", error)
    return NextResponse.json({ error: errorMessage || "Error al anular transferencia" }, { status: 500 })
  }
}


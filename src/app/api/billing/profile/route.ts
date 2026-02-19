import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { upsertBillingProfile, getBillingProfile } from "@/lib/billing"
import { logAuditEvent } from "@/lib/audit-log"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ProfilePayload = {
  legalName: string
  taxId: string
  address: string
  email: string
  phone?: string
}

function validatePayload(raw: any): { ok: true; value: ProfilePayload } | { ok: false; error: string } {
  const legalName = String(raw?.legalName || "").trim()
  const taxId = String(raw?.taxId || "").trim()
  const address = String(raw?.address || "").trim()
  const email = String(raw?.email || "").trim()
  const phone = typeof raw?.phone === "string" ? raw.phone.trim() : ""

  if (!legalName) return { ok: false, error: "El nombre legal es requerido" }
  if (!taxId) return { ok: false, error: "La cédula o RNC es requerida" }
  if (!address) return { ok: false, error: "La dirección es requerida" }
  if (!email) return { ok: false, error: "El email es requerido" }

  return {
    ok: true,
    value: {
      legalName,
      taxId,
      address,
      email,
      ...(phone ? { phone } : {}),
    },
  }
}

// GET /api/billing/profile - Obtener perfil fiscal
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const profile = await getBillingProfile(user.accountId)
    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error("Error en GET /api/billing/profile:", error)
    return NextResponse.json(
      { error: error?.message || "Error al obtener perfil" },
      { status: 500 }
    )
  }
}

// POST /api/billing/profile - Crear/actualizar perfil fiscal
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const validation = validatePayload(body)
    if (!validation.ok) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    const profile = await upsertBillingProfile(user.accountId, validation.value)

    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "SETTINGS_CHANGED",
      resourceType: "BillingProfile",
      resourceId: profile.id,
      details: { action: "profile_upsert" },
    })

    return NextResponse.json({ success: true, profile })
  } catch (error: any) {
    console.error("Error en POST /api/billing/profile:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Error al guardar perfil" },
      { status: 500 }
    )
  }
}

// PUT /api/billing/profile - Alias idempotente para mobile/web
export async function PUT(request: NextRequest) {
  return POST(request)
}

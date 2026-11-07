import { clerkClient } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { getOrCreateAccount, createSubUserSession } from "@/lib/auth"
import { isAccountIdentityDeleted } from "@/lib/account-deletion-guard"
import { getClerkPrimaryEmail } from "@/lib/clerk-email"
import { ALL_PERMISSION_KEYS } from "@/lib/permissions"
import { setupInitialAccount, SetupError } from "@/lib/initial-account-setup"
import { corsHeaders, requestClerkUserId } from "@/lib/mobile-clerk-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders }) }

export async function POST(request: NextRequest) {
  try {
    const clerkUserId = await requestClerkUserId(request)
    if (!clerkUserId) return NextResponse.json({ error: "No autenticado con Clerk" }, { status: 401, headers: corsHeaders })
    let body: any
    try { body = await request.json() } catch { body = null }
    const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : ""
    const whatsappPhone = typeof body?.whatsappPhone === "string" ? body.whatsappPhone.trim() : ""
    if (!businessName || !whatsappPhone || businessName.length > 200 || whatsappPhone.length > 50)
      return NextResponse.json({ error: "El nombre del negocio y WhatsApp son requeridos." }, { status: 400, headers: corsHeaders })
    if (await isAccountIdentityDeleted(clerkUserId)) return NextResponse.json({ error: "Esta cuenta fue eliminada." }, { status: 410, headers: corsHeaders })
    const account = await getOrCreateAccount(clerkUserId)
    if (!account) {
      // getOrCreateAccount también devuelve null ante fallos transitorios: no anunciar una baja inexistente.
      const deleted = await isAccountIdentityDeleted(clerkUserId)
      return NextResponse.json({ error: deleted ? "Esta cuenta fue eliminada." : "No se pudo obtener la cuenta. Intenta nuevamente." }, { status: deleted ? 410 : 500, headers: corsHeaders })
    }
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)
    const result = await setupInitialAccount({ clerkUserId, account, businessName, whatsappPhone, email: getClerkPrimaryEmail(clerkUser) })
    const token = await createSubUserSession(account.id, result.owner.id)
    const owner = result.owner
    const permissions = Object.fromEntries(ALL_PERMISSION_KEYS.map(key => [key, owner[key]]))
    const user = { id: owner.id, accountId: owner.accountId, username: owner.username, name: owner.name,
      email: owner.email, role: owner.role, isOwner: owner.isOwner, ...permissions }
    return NextResponse.json({ success: true, account: { id: account.id, name: businessName }, user, token }, { status: 201, headers: corsHeaders })
  } catch (error) {
    if (error instanceof SetupError) return NextResponse.json({ error: error.code === "deleted" ? "La cuenta fue eliminada." : "La cuenta ya está configurada." }, { status: error.code === "deleted" ? 410 : 409, headers: corsHeaders })
    console.error("Error en POST /api/auth/setup", error)
    return NextResponse.json({ error: "No se pudo guardar la configuración." }, { status: 500, headers: corsHeaders })
  }
}

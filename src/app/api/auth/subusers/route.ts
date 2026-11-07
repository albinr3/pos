import { NextRequest, NextResponse } from "next/server"
import { getOrCreateAccount, listSubUsers } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { isAccountIdentityDeleted } from "@/lib/account-deletion-guard"
import { corsHeaders, requestClerkUserId } from "@/lib/mobile-clerk-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders }) }

export async function GET(request: NextRequest) {
  try {
    const clerkUserId = await requestClerkUserId(request)
    if (!clerkUserId) return NextResponse.json({ error: "No autenticado con Clerk" }, { status: 401, headers: corsHeaders })
    if (await isAccountIdentityDeleted(clerkUserId)) return NextResponse.json({ error: "Esta cuenta fue eliminada o está en proceso de eliminación." }, { status: 410, headers: corsHeaders })
    const account = await getOrCreateAccount(clerkUserId)
    if (!account) {
      // Distinguir un fallo de base de datos de una baja real permite reintentar sin confundir al cliente.
      const deleted = await isAccountIdentityDeleted(clerkUserId)
      return NextResponse.json({ error: deleted ? "Esta cuenta fue eliminada." : "No se pudo obtener la cuenta. Intenta nuevamente." }, { status: deleted ? 410 : 500, headers: corsHeaders })
    }
    const [users, count, onboarding] = await Promise.all([
      listSubUsers(account.id),
      prisma.user.count({ where: { accountId: account.id } }),
      prisma.accountOnboarding.findUnique({ where: { accountId: account.id }, select: { initialSetupCompletedAt: true } }),
    ])
    const needsInitialSetup = !onboarding?.initialSetupCompletedAt && count === 0
    return NextResponse.json({ account: { id: account.id, name: account.name }, users: users.map(u => ({
      id: u.id, name: u.name, username: u.username, role: u.role, isOwner: u.isOwner, email: u.email,
    })),
      needsSetup: users.length === 0, needsInitialSetup }, { headers: corsHeaders })
  } catch (error) {
    console.error("Error en GET /api/auth/subusers", error)
    return NextResponse.json({ error: "Error al obtener usuarios" }, { status: 500, headers: corsHeaders })
  }
}

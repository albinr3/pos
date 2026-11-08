import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { getMobileOnboardingState } from "@/lib/account-onboarding"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    return NextResponse.json(await getMobileOnboardingState(user.accountId), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[Onboarding] Estado", error)
    return NextResponse.json({ error: "No se pudo consultar el tutorial." }, { status: 500 })
  }
}

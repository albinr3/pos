import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { completeAccountOnboarding, OnboardingProductError } from "@/lib/account-onboarding"
import { revalidatePath } from "next/cache"
export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (!user.isOwner) return NextResponse.json({ error: "Solo el dueño puede completar el tutorial móvil." }, { status: 403 })
    const body = await request.json().catch(() => null)
    if (typeof body?.productId !== "string" || !body.productId.trim() || body.productId.length > 200) return NextResponse.json({ error: "Producto requerido." }, { status: 400 })
    const result = await completeAccountOnboarding(user.accountId, body.productId.trim())
    for (const route of ["/dashboard", "/products", "/sales"]) revalidatePath(route)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof OnboardingProductError) return NextResponse.json({ error: error.message, code: "ONBOARDING_PRODUCT_INVALID" }, { status: 422 })
    console.error("[Onboarding] Finalización", error)
    return NextResponse.json({ error: "No se pudo completar el tutorial." }, { status: 500 })
  }
}

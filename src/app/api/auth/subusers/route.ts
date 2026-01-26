import { NextRequest, NextResponse } from "next/server"
import { getClerkUserId, getClerkUserIdFromToken, getOrCreateAccount, listSubUsers } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/auth/subusers - Listar subusuarios del account
export async function GET(request: NextRequest) {
  try {
    // Intentar obtener token del header Authorization (para app móvil)
    const authHeader = request.headers.get("Authorization")
    let clerkUserId: string | null = null

    if (authHeader) {
      // Si hay header Authorization, verificar el token
      clerkUserId = await getClerkUserIdFromToken(authHeader)
    }

    // Si no se obtuvo del header, intentar desde la sesión (para web)
    if (!clerkUserId) {
      clerkUserId = await getClerkUserId()
    }

    if (!clerkUserId) {
      return NextResponse.json({ error: "No autenticado con Clerk" }, { status: 401 })
    }

    // Obtener o crear Account usando el clerkUserId obtenido
    const account = await getOrCreateAccount(clerkUserId)
    if (!account) {
      return NextResponse.json({ error: "Error al obtener cuenta" }, { status: 500 })
    }

    // Listar subusuarios
    const users = await listSubUsers(account.id)

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
      },
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        isOwner: u.isOwner,
        email: u.email,
      })),
    })
  } catch (error: any) {
    console.error("Error en GET /api/auth/subusers:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener subusuarios" },
      { status: 500 }
    )
  }
}

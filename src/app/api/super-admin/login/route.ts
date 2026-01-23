import { NextResponse } from "next/server"
import {
  authenticateSuperAdmin,
  createSuperAdminSession,
  setSuperAdminSessionCookie,
} from "@/lib/super-admin-auth"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email y contraseña son requeridos" },
        { status: 400 }
      )
    }

    const result = await authenticateSuperAdmin(email, password)

    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error || "Credenciales inválidas" },
        { status: 401 }
      )
    }

    // Crear sesión
    const token = createSuperAdminSession(result.user.id)
    await setSuperAdminSessionCookie(token)

    return NextResponse.json({
      success: true,
      name: result.user.name,
      role: result.user.role,
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

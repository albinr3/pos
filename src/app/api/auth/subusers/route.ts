import { NextRequest, NextResponse } from "next/server"
import { getClerkUserId, getClerkUserIdFromToken, getEmailFromToken, getOrCreateAccount, listSubUsers } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Configurar CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-SubUser-Token, X-Clerk-Authorization",
}

// GET /api/auth/subusers - Listar subusuarios del account
export async function GET(request: NextRequest) {
  // Manejar preflight OPTIONS
  if (request.method === "OPTIONS") {
    return NextResponse.json({}, { headers: corsHeaders })
  }
  try {
    // Intentar obtener token del header Authorization (para app móvil)
    // Vercel intercepta el header Authorization, así que usamos un header personalizado
    let authHeader: string | null = null
    
    // 1. Intentar leer desde header personalizado (evita interceptación de Vercel)
    authHeader = 
      request.headers.get("X-Clerk-Authorization") || 
      request.headers.get("x-clerk-authorization") ||
      request.headers.get("X-CLERK-AUTHORIZATION")
    
    // 2. Si no está, intentar leer directamente (puede funcionar en desarrollo)
    if (!authHeader) {
      authHeader = 
        request.headers.get("Authorization") || 
        request.headers.get("authorization") ||
        request.headers.get("AUTHORIZATION")
    }
    
    // 3. Si aún no está, intentar leer desde x-vercel-sc-headers (último recurso)
    if (!authHeader) {
      const vercelHeaders = request.headers.get("x-vercel-sc-headers")
      if (vercelHeaders) {
        try {
          const parsed = JSON.parse(vercelHeaders)
          // Verificar que no sea el token de Vercel (tiene campo 'iss: serverless')
          const tempAuth = parsed.Authorization || parsed.authorization || null
          if (tempAuth && !tempAuth.includes('"iss":"serverless"')) {
            authHeader = tempAuth
            console.log("🔍 [subusers] Auth header encontrado en x-vercel-sc-headers")
          }
        } catch (e) {
          console.error("❌ [subusers] Error parseando x-vercel-sc-headers:", e)
        }
      }
    }
    
    console.log("🔍 [subusers] Auth header:", authHeader ? `${authHeader.substring(0, 30)}...` : "Ausente")
    
    let clerkUserId: string | null = null

    if (authHeader) {
      // Si hay header Authorization, verificar el token
      clerkUserId = await getClerkUserIdFromToken(authHeader)
      console.log("🔍 [subusers] clerkUserId desde token:", clerkUserId || "null")
    }

    // Si no se obtuvo del header, intentar desde la sesión (para web)
    if (!clerkUserId) {
      clerkUserId = await getClerkUserId()
      console.log("🔍 [subusers] clerkUserId desde sesión:", clerkUserId || "null")
    }

    if (!clerkUserId) {
      console.error("❌ [subusers] No se pudo obtener clerkUserId")
      return NextResponse.json(
        { error: "No autenticado con Clerk" },
        { status: 401, headers: corsHeaders }
      )
    }

    // Obtener o crear Account usando el clerkUserId obtenido
    let account = await getOrCreateAccount(clerkUserId)
    
    if (!account) {
      return NextResponse.json(
        { error: "Error al obtener cuenta" },
        { status: 500, headers: corsHeaders }
      )
    }

    console.log("🔍 [subusers] Account obtenido:", { id: account.id, name: account.name })

    // Listar subusuarios
    const users = await listSubUsers(account.id)
    console.log("🔍 [subusers] Usuarios encontrados:", users.length, users.map(u => ({ id: u.id, username: u.username, name: u.name })))

    // Si no hay usuarios, devolver un mensaje más claro
    if (users.length === 0) {
      return NextResponse.json(
        {
          account: {
            id: account.id,
            name: account.name,
          },
          users: [],
          message: "No hay usuarios en este account. Por favor, crea usuarios desde la aplicación web primero.",
          needsSetup: true,
        },
        { headers: corsHeaders }
      )
    }

    return NextResponse.json(
      {
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
      },
      { headers: corsHeaders }
    )
  } catch (error: any) {
    console.error("Error en GET /api/auth/subusers:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener subusuarios" },
      { status: 500, headers: corsHeaders }
    )
  }
}

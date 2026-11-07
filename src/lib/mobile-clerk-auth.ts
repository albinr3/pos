import { verifyToken } from "@clerk/nextjs/server"
import { getClerkUserId } from "@/lib/auth"
import type { NextRequest } from "next/server"

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-SubUser-Token, X-Clerk-Authorization",
}

export async function requestClerkUserId(request: NextRequest): Promise<string | null> {
  // Un header presente pero vacío es inválido; nunca recuperar otra identidad desde cookies.
  const bearer = request.headers.has("X-Clerk-Authorization")
    ? request.headers.get("X-Clerk-Authorization") : request.headers.get("Authorization")
  if (bearer === null) return getClerkUserId()
  if (!/^Bearer\s+\S+$/i.test(bearer)) return null
  try {
    const payload = await verifyToken(bearer.replace(/^Bearer\s+/i, ""), {
      secretKey: process.env.CLERK_SECRET_KEY,
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean),
    })
    // La tolerancia de reloj del SDK no debe aceptar sesiones ya vencidas.
    return payload.sid && payload.sub && typeof payload.exp === "number" && payload.exp * 1000 > Date.now()
      ? payload.sub : null
  } catch { return null }
}

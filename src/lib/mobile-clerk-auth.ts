import { getClerkUserId } from "@/lib/auth"
import { verifyClerkBearer } from "@/lib/clerk-token"
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
  return verifyClerkBearer(bearer)
}

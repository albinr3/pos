import { NextRequest } from "next/server"
import { availability } from "@/lib/fiscal/core/sequences"
import { actor, errorResponse, ok } from "../_shared"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try { return ok(await availability(await actor(request), request.nextUrl.searchParams.get("type") || undefined)) } catch (error) { return errorResponse(error) }
}

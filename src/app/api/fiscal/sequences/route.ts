import { NextRequest } from "next/server"
import { createSequence, listSequences } from "@/lib/fiscal/core/sequences"
import { actor, body, errorResponse, ok, pagination } from "./_shared"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  try { const user = await actor(request), page = pagination(request); return ok(await listSequences(user, page.take, page.cursor, request.nextUrl.searchParams.get("type") || undefined)) } catch (error) { return errorResponse(error) }
}
export async function POST(request: NextRequest) {
  try { const user = await actor(request); return ok(await createSequence(user, await body(request)), 201) } catch (error) { return errorResponse(error) }
}

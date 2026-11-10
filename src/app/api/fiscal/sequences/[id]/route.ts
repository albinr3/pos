import { NextRequest } from "next/server"
import { getSequence, updateSequence } from "@/lib/fiscal/core/sequences"
import { actor, body, errorResponse, ok } from "../_shared"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: NextRequest, context: Context) {
  try { const user = await actor(request), { id } = await context.params; return ok(await getSequence(user, id)) } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { const user = await actor(request), { id } = await context.params; return ok(await updateSequence(user, id, await body(request))) } catch (error) { return errorResponse(error) }
}

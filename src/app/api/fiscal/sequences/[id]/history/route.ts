import { NextRequest } from "next/server"
import { getSequenceHistory } from "@/lib/fiscal/core/sequences"
import { actor, errorResponse, ok, pagination } from "../../_shared"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const user = await actor(request), { id } = await context.params, page = pagination(request); return ok(await getSequenceHistory(user, id, page.take, page.cursor)) } catch (error) { return errorResponse(error) }
}
